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
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 200));
  const enc = /encoding=["']?(euc-kr|ks_c_5601|cp949)/i.test(head) ? "euc-kr" : "utf-8";
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

// ---------- DART 호출 ----------
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

async function reportXml(rceptNo) {
  const key = requireEnv("DART_API_KEY");
  const res = await fetchWithTimeout(`${BASE}/document.xml?crtfc_key=${key}&rcept_no=${rceptNo}`, {}, 7000);
  const buf = new Uint8Array(await res.arrayBuffer());
  let files;
  try { files = unzipSync(buf); } catch { throw new Error(`DART 원문 다운로드 실패: ${new TextDecoder().decode(buf.slice(0, 200))}`); }
  // 본문은 보통 접수번호.xml, 없으면 가장 큰 파일
  const names = Object.keys(files);
  const main = names.find((n) => n.startsWith(rceptNo)) || names.sort((a, b) => files[b].length - files[a].length)[0];
  return decode(files[main]);
}

export async function getBusiness(corp) {
  const store = await blobStore();
  const report = await latestAnnualReport(corp);
  if (!report) return { summary: null, products: [], productsText: null, report: null };
  if (store) {
    try {
      const cached = await store.get(`r-${report.rceptNo}`, { type: "json" });
      if (cached) return cached;
    } catch { /* 무시 */ }
  }
  const xml = await reportXml(report.rceptNo);
  const parsed = parseBusiness(xml);
  const out = { ...parsed, report: { ...report, url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${report.rceptNo}` } };
  if (store) { try { await store.setJSON(`r-${report.rceptNo}`, out); } catch { /* 무시 */ } }
  return out;
}
