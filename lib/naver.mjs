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
  const res = await fetchWithTimeout(`https://m.stock.naver.com/api/news/stock/${code}?pageSize=20&page=1`, { headers: UA }, 8000);
  if (!res.ok) throw new Error(`네이버 증권 종목뉴스 HTTP ${res.status}`);
  return parseStockNews(await res.json());
}

// 네이버 검색 API (키 필요)
async function searchNews(query, display, id, secret) {
  const qs = new URLSearchParams({ query, display: String(display), sort: "date" });
  return fetchWithTimeout(`https://openapi.naver.com/v1/search/news.json?${qs}`, {
    headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
  });
}

export async function getNews(query, display = 30) {
  const id = requireEnv("NAVER_CLIENT_ID");
  const secret = requireEnv("NAVER_CLIENT_SECRET");
  let res = await searchNews(query, display, id, secret);
  // 가장 흔한 실수: ID와 Secret을 서로 바꿔 넣음 → 한 번 바꿔서 재시도
  if (res.status === 401) {
    const swapped = await searchNews(query, display, secret, id);
    if (swapped.ok) res = swapped;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const why = body.errorMessage ? ` — 네이버 응답: ${body.errorCode || ""} ${body.errorMessage}` : "";
    const hint = res.status === 401 ? `Client ID/Secret 값이 틀림 (현재 길이 ID ${id.length}자·Secret ${secret.length}자, 정상은 보통 20자·10자)`
      : res.status === 403 ? "네이버 개발자센터 앱의 '사용 API'에 검색이 추가되지 않음"
      : "잠시 후 다시 시도";
    throw new Error(`네이버 검색 API HTTP ${res.status}: ${hint}${why}`);
  }
  const data = await res.json();
  return mapNews(data.items || [], query);
}
