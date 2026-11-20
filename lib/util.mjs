// 공통 유틸

export function json(data, { status = 200, cacheSeconds = 0 } = {}) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (cacheSeconds > 0) {
    // Netlify CDN 캐시: 같은 요청은 일정 시간 동안 외부 API를 다시 부르지 않음
    headers["cache-control"] = "public, max-age=60";
    headers["netlify-cdn-cache-control"] = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`;
  } else {
    headers["cache-control"] = "no-store";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function errorJson(message, status = 500) {
  return json({ error: message }, { status });
}

export async function fetchWithTimeout(url, options = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// "1,234,567" / "8.95배" / "-12.3%" / "1조 2,345억" → 숫자 (원 단위 해석은 하지 않음)
export function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").replace(/\s/g, "");
  if (!s || s === "-" || s === "N/A") return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function yyyymmdd(date) {
  const d = new Date(date.getTime() + 9 * 3600 * 1000); // KST
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

// 흔한 표기 차이도 받아줌 (예: KIS_APPKEY ↔ KIS_APP_KEY)
const ALIASES = {
  KIS_APP_KEY: ["KIS_APPKEY"],
  KIS_APP_SECRET: ["KIS_APPSECRET"],
  NAVER_CLIENT_ID: ["NAVER_CLIENTID", "NAVER_ID"],
  NAVER_CLIENT_SECRET: ["NAVER_CLIENTSECRET", "NAVER_SECRET"],
  DART_API_KEY: ["DART_KEY", "OPENDART_API_KEY"],
};
export function getEnv(name) {
  for (const n of [name, ...(ALIASES[name] || [])]) {
    const v = process.env[n] ?? globalThis.Netlify?.env?.get?.(n);
    if (v && String(v).trim()) return String(v).trim();
  }
  return undefined;
}

export function requireEnv(name) {
  const v = getEnv(name);
  if (!v) {
    const err = new Error(`환경변수 ${name} 이(가) 설정되지 않았습니다. Netlify > Site configuration > Environment variables 에 추가하세요.`);
    err.status = 500;
    throw err;
  }
  return v;
}
