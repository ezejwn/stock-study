// 사업 아이템: DART 사업보고서 "II. 사업의 내용"에서
//   - 사업의 개요 (요약 몇 문장)
//   - 주요 제품·서비스와 매출 비중 (표)
// 를 뽑아냄. 사업보고서는 1년에 한 번 바뀌므로 Netlify Blobs에 저장해 재사용.
import { unzipSync } from "fflate";
import { fetchWithTimeout, requireEnv, yyyymmdd } from "./util.mjs";

const BASE = "https://opendart.fss.or.kr/api";

async function blobStore() {
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore("business-cache");
  } catch {
    return null;
  }
}

// ---------- XML → 텍스트 ----------
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ", "&cr;": " " };
export function xmlText(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENT[m.toLowerCase()] ?? (m.startsWith("&#") ? String.fromCharCode(parseInt(m.slice(2), 10)) : " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decode(bytes) {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 1200));
  const enc = /(encoding|charset)=["']?(euc-kr|ks_c_5601|cp949)/i.test(head) ? "euc-kr" : "utf-8";
  try { return new TextDecoder(enc).decode(bytes); } catch { return new TextDecoder("utf-8").decode(bytes); }
}

// TITLE 태그 기준으로 소제목 구간을 잘라냄
export function sectionAfter(xml, titleRe) {
  const titles = [...xml.matchAll(/<TITLE[^>]*>([\s\S]*?)<\/TITLE>/gi)];
  const i = titles.findIndex((t) => titleRe.test(xmlText(t[1])));
  if (i < 0) return null;
  const start = titles[i].index + titles[i][0].length;
  const end = i + 1 < titles.length ? titles[i + 1].index : xml.length;
  return xml.slice(start, end);
}

// 사업의 개요 → 핵심 문장 몇 개
export function summarize(sectionXml, maxChars = 220) {
  if (!sectionXml) return null;
  const text = xmlText(sectionXml.replace(/<TABLE[\s\S]*?<\/TABLE>/gi, " "));
  const sentences = text
    .split(/(?<=다\.|니다\.|음\.|함\.)\s+/)
    .map((x) => x.replace(/^(\(?[가-하0-9]{1,2}[).]\s*|[-·•○■□▶▷※]\s*)+/, "").trim())
    .filter((x) => x.length >= 15)
    .filter((x) => !/참고하시기|기재하였|기재하지|작성기준|공시서류|본 보고서|사업보고서|연결대상|종속회사 현황|\(단위/.test(x));
  const out = [];
  let len = 0;
  for (const s of sentences) {
    if (len + s.length > maxChars && out.length) break;
    out.push(s);
    len += s.length;
    if (out.length >= 2) break;
  }
  return out.length ? out.join(" ") : null;
}

// 표 → 행 배열
export function parseTables(sectionXml) {
  if (!sectionXml) return [];
  return [...sectionXml.matchAll(/<TABLE[\s\S]*?<\/TABLE>/gi)].map((t) =>
    [...t[0].matchAll(/<TR[^>]*>([\s\S]*?)<\/TR>/gi)].map((r) =>
      [...r[1].matchAll(/<(TD|TH|TE|TU)[^>]*>([\s\S]*?)<\/\1>/gi)].map((c) => xmlText(c[2]))));
}

// 주요 제품 표에서 [이름, 비중%] 뽑기
export function extractProducts(sectionXml) {
  const tables = parseTables(sectionXml);
  for (const rows of tables) {
    if (rows.length < 2) continue;
    const ns = (c) => String(c || "").replace(/\s/g, "");
    const hi = rows.findIndex((r) => r.some((c) => /비중|비율|구성비/.test(ns(c))));
    if (hi < 0) continue;
    const header = rows[hi].map(ns);
    const ratioCol = header.findIndex((c) => /비중|비율|구성비/.test(c));
    let nameCols = header.map((c, i) => (/(주요)?(제품|품목|상품|서비스|사업부문|부문|구분)/.test(c) && !/유형|금액|매출액/.test(c) && i !== ratioCol ? i : -1)).filter((i) => i >= 0);
    if (!nameCols.length) nameCols = [0];
    const items = [];
    let lastGroup = "";
    for (const r of rows.slice(hi + 1)) {
      if (r.some((c) => /^(합계|총계|계|소계|총합계)$/.test(ns(c)))) continue; // 합계 행
      // 병합 셀 때문에 열 수가 헤더보다 적을 수 있어 비율은 뒤에서부터 찾음
      const shift = header.length - r.length;
      const ratioCell = r[ratioCol - shift] ?? r[ratioCol];
      const ratio = parseFloat(String(ratioCell || "").replace(/[,%\s]/g, ""));
      const names = nameCols.map((i) => r[i - (i >= shift ? shift : 0)] ?? r[i])
        .filter((x) => x && !/^[\d.,%\s-]+$/.test(x) && !/^(제품|상품|용역|서비스|기타매출)$/.test(x.replace(/\s/g, "")));
      let name = [...new Set(names)].join(" · ").trim();
      if (!name) name = lastGroup;
      if (!name || /^(합\s*계|총\s*계|계|소\s*계|기타\s*조정|내부거래|연결조정)/.test(name)) continue;
      lastGroup = names[0] || lastGroup;
      if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 100) continue;
      if (name.length > 60) name = name.slice(0, 58) + "…";
      items.push({ name, ratio: Math.round(ratio * 10) / 10 });
    }
    if (items.length) {
      const dedup = [];
      for (const it of items) if (!dedup.some((d) => d.name === it.name)) dedup.push(it);
      return dedup.sort((a, b) => b.ratio - a.ratio).slice(0, 6);
    }
  }
  return [];
}

// 주요 제품 섹션 첫 문장 (표가 없을 때 대체)
export function productsText(sectionXml) {
  if (!sectionXml) return null;
  return summarize(sectionXml, 200);
}

export function parseBusiness(xml) {
  // "II. 사업의 내용" 제목 이후만 봄 (목차·요약재무 등에서 같은 단어가 나오는 것 방지)
  const t = [...xml.matchAll(/<TITLE[^>]*>([\s\S]*?)<\/TITLE>/gi)].find((m) => /사업의\s*내용/.test(xmlText(m[1])));
  const body = t ? xml.slice(t.index) : xml;
  const overview = sectionAfter(body, /^\s*(1\.|가\.)?\s*사업의\s*개요/);
  const products = sectionAfter(body, /주요\s*(제품|상품|서비스)/);
  return {
    summary: summarize(overview),
    products: extractProducts(products),
    productsText: productsText(products),
  };
}

// ---------- 1) 네이버 증권 기업개요 (짧은 사업 소개) ----------
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };

export function parseNaverSummary(html) {
  const m = html.match(/<div[^>]*id=["']summary_info["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!m) return null;
  const lines = [...m[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((x) => xmlText(x[1])).filter((x) => x.length > 5);
  const pick = lines.length ? lines : [xmlText(m[1].replace(/<h\d[\s\S]*?<\/h\d>/gi, ""))].filter(Boolean);
  return pick.length ? pick.slice(0, 4) : null;
}

async function naverSummary(code) {
  const res = await fetchWithTimeout(`https://finance.naver.com/item/main.naver?code=${code}`, { headers: UA }, 5000);
  if (!res.ok) throw new Error(`네이버 증권 HTTP ${res.status}`);
  const lines = parseNaverSummary(decode(new Uint8Array(await res.arrayBuffer())));
  if (!lines) throw new Error("네이버 증권에 기업개요 없음");
  return lines;
}

// ---------- 2) DART 사업보고서: 필요한 소제목만 뷰어로 받기 ----------
async function latestAnnualReport(corp) {
  const key = requireEnv("DART_API_KEY");
  const qs = new URLSearchParams({
    crtfc_key: key, corp_code: corp, bgn_de: yyyymmdd(new Date(Date.now() - 800 * 864e5)), end_de: yyyymmdd(new Date()),
    pblntf_detail_ty: "A001", page_count: "10", last_reprt_at: "Y",
  });
  const res = await fetchWithTimeout(`${BASE}/list.json?${qs}`, {}, 4000);
  const d = await res.json();
  const r = (d.list || []).find((x) => /사업보고서/.test(x.report_nm));
  return r ? { rceptNo: r.rcept_no, title: r.report_nm.replace(/\s+/g, " ").trim(), date: r.rcept_dt } : null;
}

// main.do 페이지의 목차 정보(node['text'], dcmNo, eleId, offset, length, dtd)를 읽음
export function parseToc(html) {
  const nodes = [];
  const re = /(node\d+)\s*=\s*\{\};([\s\S]*?)(?=node\d+\s*=\s*\{\};|<\/script>|$)/g;
  let m;
  while ((m = re.exec(html))) {
    const body = m[2];
    const get = (k) => (body.match(new RegExp(`\\['${k}'\\]\\s*=\\s*["']([^"']*)["']`)) || [])[1];
    const text = get("text");
    if (text && get("dcmNo")) nodes.push({ text: xmlText(text), rcpNo: get("rcpNo"), dcmNo: get("dcmNo"), eleId: get("eleId"), offset: get("offset"), length: get("length"), dtd: get("dtd") || "dart4.xsd" });
  }
  return nodes;
}

async function dartSection(node) {
  const qs = new URLSearchParams({ rcpNo: node.rcpNo, dcmNo: node.dcmNo, eleId: node.eleId, offset: node.offset, length: node.length, dtd: node.dtd });
  const res = await fetchWithTimeout(`https://dart.fss.or.kr/report/viewer.do?${qs}`, { headers: UA }, 5000);
  if (!res.ok) throw new Error(`DART 뷰어 HTTP ${res.status}`);
  return decode(new Uint8Array(await res.arrayBuffer()));
}

async function dartViewerBusiness(report) {
  const res = await fetchWithTimeout(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${report.rceptNo}`, { headers: UA }, 4000);
  if (!res.ok) throw new Error(`DART 원문 HTTP ${res.status}`);
  const toc = parseToc(decode(new Uint8Array(await res.arrayBuffer())));
  if (!toc.length) throw new Error("DART 목차를 읽지 못함");
  const ov = toc.find((n) => /사업의\s*개요/.test(n.text));
  const pr = toc.find((n) => /주요\s*(제품|상품|서비스)/.test(n.text));
  const whole = toc.find((n) => /사업의\s*내용/.test(n.text));
  const [ovHtml, prHtml] = await Promise.all([
    ov ? dartSection(ov).catch(() => null) : null,
    pr ? dartSection(pr).catch(() => null) : null,
  ]);
  if (ovHtml || prHtml) {
    return { summary: summarize(ovHtml), products: extractProducts(prHtml), productsText: productsText(prHtml) };
  }
  if (whole) return parseBusiness(await dartSection(whole));
  throw new Error("DART 목차에 '사업의 내용' 없음");
}

// ---------- 3) 최후 수단: 사업보고서 원문 전체(zip) ----------
async function reportXml(rceptNo) {
  const key = requireEnv("DART_API_KEY");
  const res = await fetchWithTimeout(`${BASE}/document.xml?crtfc_key=${key}&rcept_no=${rceptNo}`, {}, 6000);
  const buf = new Uint8Array(await res.arrayBuffer());
  let files;
  try { files = unzipSync(buf); } catch { throw new Error(`DART 원문 다운로드 실패: ${new TextDecoder().decode(buf.slice(0, 200))}`); }
  const names = Object.keys(files);
  const main = names.find((n) => n.startsWith(rceptNo)) || names.sort((a, b) => files[b].length - files[a].length)[0];
  return decode(files[main]);
}

const errMsg = (e) => (e?.name === "AbortError" ? "시간 초과" : String(e?.message || e));

export async function getBusiness(corp, code) {
  const store = await blobStore();
  const errors = {};
  const [summaryLines, report] = await Promise.all([
    code ? naverSummary(code).catch((e) => { errors.naver = errMsg(e); return null; }) : null,
    latestAnnualReport(corp).catch((e) => { errors.reportList = errMsg(e); return null; }),
  ]);

  let dart = null;
  if (report) {
    if (store) { try { dart = await store.get(`r-${report.rceptNo}`, { type: "json" }); } catch { /* 무시 */ } }
    if (!dart) {
      try { dart = await dartViewerBusiness(report); } catch (e) { errors.dartViewer = errMsg(e); }
      if (!dart || (!dart.summary && !dart.products.length)) {
        try { dart = parseBusiness(await reportXml(report.rceptNo)); } catch (e) { errors.dartDocument = errMsg(e); }
      }
      if (dart && store && (dart.summary || dart.products.length)) { try { await store.setJSON(`r-${report.rceptNo}`, dart); } catch { /* 무시 */ } }
    }
  }
  return {
    overview: summaryLines || [],                       // 네이버 기업개요 (짧은 소개)
    summary: dart?.summary || null,                     // 사업보고서 사업의 개요
    products: dart?.products || [],
    productsText: dart?.productsText || null,
    report: report ? { ...report, url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${report.rceptNo}` } : null,
    errors,
  };
}
