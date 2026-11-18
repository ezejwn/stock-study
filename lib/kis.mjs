// 한국투자증권 Open API — 현재가·PER·PBR·시가총액·52주·업종
// 환경변수 KIS_APP_KEY, KIS_APP_SECRET 이 없으면 사용하지 않음(네이버 증권으로 대체)
import { fetchWithTimeout, toNum } from "./util.mjs";

const BASE = "https://openapi.koreainvestment.com:9443";
let memToken = null; // { token, exp }

const env = (k) => process.env[k] ?? globalThis.Netlify?.env?.get?.(k);
export const kisEnabled = () => !!(env("KIS_APP_KEY") && env("KIS_APP_SECRET"));

async function blobStore() {
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore("kis-cache");
  } catch {
    return null;
  }
}

// 접근토큰은 24시간 유효하고 자주 재발급하면 제한되므로 저장해 두고 재사용
async function getToken(force = false) {
  const now = Date.now();
  if (!force && memToken && memToken.exp - now > 10 * 60 * 1000) return memToken.token;
  const store = await blobStore();
  if (!force && store) {
    try {
      const t = await store.get("token", { type: "json" });
      if (t && t.exp - now > 10 * 60 * 1000) { memToken = t; return t.token; }
    } catch { /* 무시 */ }
  }
  const res = await fetchWithTimeout(`${BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: env("KIS_APP_KEY"), appsecret: env("KIS_APP_SECRET") }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`한국투자증권 토큰 발급 실패: ${data.error_description || data.msg1 || res.status}`);
  memToken = { token: data.access_token, exp: now + (Number(data.expires_in) || 86400) * 1000 };
  if (store) { try { await store.setJSON("token", memToken); } catch { /* 무시 */ } }
  return memToken.token;
}

async function kisGet(path, trId, params, retry = true) {
  const token = await getToken();
  const res = await fetchWithTimeout(`${BASE}${path}?${new URLSearchParams(params)}`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: env("KIS_APP_KEY"),
      appsecret: env("KIS_APP_SECRET"),
      tr_id: trId,
      custtype: "P",
    },
  }, 8000);
  const data = await res.json().catch(() => ({}));
  // 토큰 만료(EGW00123) 등 → 한 번만 새 토큰으로 재시도
  if ((res.status === 401 || data.msg_cd === "EGW00123" || data.msg_cd === "EGW00121") && retry) {
    await getToken(true);
    return kisGet(path, trId, params, false);
  }
  if (data.rt_cd !== "0") throw new Error(`${data.msg1 || "HTTP " + res.status} (${trId})`);
  return data;
}

const pos = (v) => { const n = toNum(v); return n && n !== 0 ? n : null; }; // 0은 '값 없음'으로 취급

export function parseKisPrice(o) {
  if (!pos(o.stck_prpr)) throw new Error("현재가 없음(거래정지·코드 오류 가능)");
  return {
    price: toNum(o.stck_prpr),
    change: toNum(o.prdy_vrss),
    changeRate: toNum(o.prdy_ctrt),
    per: pos(o.per),
    pbr: pos(o.pbr),
    eps: pos(o.eps),
    bps: pos(o.bps),
    marketCapEok: pos(o.hts_avls), // 억 단위
    high52: pos(o.w52_hgpr),
    low52: pos(o.w52_lwpr),
    foreignRate: toNum(o.hts_frgn_ehrt),
    market: o.rprs_mrkt_kor_name || null,
    sector: o.bstp_kor_isnm || null,
  };
}

export async function getKisMarket(code) {
  const d = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", {
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: code,
  });
  return parseKisPrice(d.output || {});
}
