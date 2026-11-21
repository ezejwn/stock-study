// 네이버 연동: 시세·투자지표(네이버 증권), 뉴스(네이버 검색 API)
import { fetchWithTimeout, requireEnv, toNum } from "./util.mjs";

const UA = { "user-agent": "Mozilla/5.0 (compatible; stock-study/1.0)", accept: "application/json" };

// "418조 5,034억" → 억 단위 숫자
export function parseEok(v) {
  if (!v) return null;
  const s = String(v).replace(/,/g, "").replace(/\s/g, "");
  const jo = s.match(/(\d+(?:\.\d+)?)조/);
  const eok = s.match(/(\d+(?:\.\d+)?)억/);
  if (!jo && !eok) return toNum(s);
  return (jo ? Number(jo[1]) * 10000 : 0) + (eok ? Number(eok[1]) : 0);
}

export function parseIntegration(data) {
  const infos = Array.isArray(data?.totalInfos) ? data.totalInfos : [];
  const get = (codes, keys = []) => {
    const r = infos.find((x) => codes.includes(x.code)) || infos.find((x) => keys.some((k) => (x.key || "").includes(k)));
    return r ? r.value : null;
  };
  return {
    per: toNum(get(["per"], ["PER"])),
    forwardPer: toNum(get(["cnsPer"], ["추정PER"])),
    pbr: toNum(get(["pbr"], ["PBR"])),
    eps: toNum(get(["eps"], ["EPS"])),
    bps: toNum(get(["bps"], ["BPS"])),
    dividendYield: toNum(get(["dividendYieldRatio"], ["배당수익률"])),
    dps: toNum(get(["dividend"], ["주당배당금"])),
    marketCapEok: parseEok(get(["marketValue"], ["시총", "시가총액"])),
    foreignRate: toNum(get(["foreignRate"], ["외인소진율", "외국인"])),
    high52: toNum(get(["highPriceOf52Weeks"], ["52주 최고"])),
    low52: toNum(get(["lowPriceOf52Weeks"], ["52주 최저"])),
    lastClose: toNum(get(["lastClosePrice"], ["전일"])),
  };
}

export async function getMarket(code) {
  const out = { ok: false };
  try {
    const [iRes, bRes] = await Promise.all([
      fetchWithTimeout(`https://m.stock.naver.com/api/stock/${code}/integration`, { headers: UA }, 8000),
      fetchWithTimeout(`https://m.stock.naver.com/api/stock/${code}/basic`, { headers: UA }, 8000),
    ]);
    if (iRes.ok) Object.assign(out, parseIntegration(await iRes.json()), { ok: true });
    if (bRes.ok) {
      const b = await bRes.json();
      out.price = toNum(b.closePrice);
      out.change = toNum(b.compareToPreviousClosePrice);
      out.changeRate = toNum(b.fluctuationsRatio);
      out.market = b.stockExchangeType?.name || b.stockExchangeName || null;
      out.ok = true;
    }
  } catch (e) {
    out.error = String(e.message || e);
  }
  if (out.price == null && out.lastClose != null) out.price = out.lastClose;
  return out;
}

// ---------- 뉴스 ----------
const ENT = { "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&apos;": "'", "&#39;": "'", "&nbsp;": " " };
export function cleanText(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENT[m] ?? (m.startsWith("&#") ? String.fromCharCode(parseInt(m.slice(2), 10)) : m))
    .trim();
}

export function mapNews(items, name) {
  const list = items.map((it) => {
    const isNaver = /news\.naver\.com/.test(it.link || "");
    return {
      title: cleanText(it.title),
      summary: cleanText(it.description).slice(0, 120),
      url: isNaver ? it.link : it.originallink || it.link,
      naver: isNaver,
      date: it.pubDate ? new Date(it.pubDate).toISOString() : null,
    };
  });
  // 제목에 종목명이 들어간 기사 우선 (충분히 있으면 그것만)
  const strict = name ? list.filter((n) => n.title.includes(name)) : list;
  return strict.length >= 5 ? strict : list;
}

// 네이버 증권 종목 뉴스 (키 필요 없음, 종목코드 기준이라 정확함)
export function parseStockNews(data) {
  const out = [];
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;
    if (x.articleId && x.officeId) { out.push(x); return; }
    Object.values(x).forEach(walk);
  };
  walk(data);
  return out.map((it) => {
    const dt = String(it.datetime || "");
    const iso = dt.length >= 12
      ? new Date(`${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}T${dt.slice(8, 10)}:${dt.slice(10, 12)}:00+09:00`).toISOString()
      : null;
    return {
      title: cleanText(it.titleFull || it.title),
      summary: cleanText(it.body).slice(0, 120),
      url: `https://n.news.naver.com/mnews/article/${it.officeId}/${it.articleId}`,
      naver: true,
      office: it.officeName || null,
      date: iso,
    };
  }).filter((n) => n.title);
}

export async function getStockNews(code) {
  const res = await fetchWithTimeout(`https://m.stock.naver.com/api/news/stock/${code}?pageSize=20&page=1`, {
    headers: { ...UA, Referer: `https://m.stock.naver.com/domestic/stock/${code}/news` },
  }, 8000);
  if (!res.ok) throw new Error(`네이버 증권 종목뉴스 HTTP ${res.status}`);
  return parseStockNews(await res.json());
}

// 네이버 검색 API (키 필요) — 두 가지 발급처를 모두 지원
//  1) NAVER API HUB (네이버 클라우드): naverapihub.apigw.ntruss.com, X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY
//  2) 네이버 개발자센터: openapi.naver.com, X-Naver-Client-Id / X-Naver-Client-Secret
const PROVIDERS = [
  { name: "NAVER API HUB", url: "https://naverapihub.apigw.ntruss.com/search/v1/news", headers: (id, sec) => ({ "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": sec }) },
  { name: "네이버 개발자센터", url: "https://openapi.naver.com/v1/search/news.json", headers: (id, sec) => ({ "X-Naver-Client-Id": id, "X-Naver-Client-Secret": sec }) },
];
let workingProvider = null; // 성공한 조합을 기억해 다음부터 바로 사용

async function tryProvider(pv, query, display, id, secret) {
  const qs = new URLSearchParams({ query, display: String(display), start: "1", sort: "date", format: "json" });
  const res = await fetchWithTimeout(`${pv.url}?${qs}`, { headers: pv.headers(id, secret) }, 4000);
  if (res.ok) return { ok: true, data: await res.json() };
  const body = await res.json().catch(() => ({}));
  const msg = body.errorMessage || body.error?.message || body.message || "";
  const code = body.errorCode || body.error?.errorCode || "";
  return { ok: false, status: res.status, detail: `${pv.name} HTTP ${res.status}${code || msg ? ` (${code} ${msg})`.replace("( ", "(") : ""}` };
}

export async function getNews(query, display = 30) {
  const id = requireEnv("NAVER_CLIENT_ID");
  const secret = requireEnv("NAVER_CLIENT_SECRET");
  const combos = [];
  if (workingProvider) combos.push(workingProvider);
  const hubFirst = secret.length >= 30 || id.length <= 12;
  for (const pv of hubFirst ? PROVIDERS : [...PROVIDERS].reverse()) for (const swap of [false, true]) combos.push({ pv, swap });
  const errors = [];
  for (const c of combos) {
    const [a, b] = c.swap ? [secret, id] : [id, secret];
    let r;
    try { r = await tryProvider(c.pv, query, display, a, b); } catch (e) { r = { ok: false, detail: `${c.pv.name}: ${e.message}` }; }
    if (r.ok) { workingProvider = c; return mapNews(r.data.items || [], query); }
    if (!c.swap && !errors.includes(r.detail)) errors.push(r.detail);
  }
  throw new Error(`네이버 검색 API 인증 실패 — ${errors.join(" / ")} · 키 길이 ID ${id.length}자·Secret ${secret.length}자 (API HUB 정상: ID 10자·Secret 40자 / 개발자센터: 20자·10자)`);
}
