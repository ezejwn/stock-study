// DART(전자공시) OpenAPI 연동
import { unzipSync, strFromU8 } from "fflate";
import { fetchWithTimeout, requireEnv, toNum, yyyymmdd } from "./util.mjs";

const BASE = "https://opendart.fss.or.kr/api";
const CORP_TTL_MS = 7 * 24 * 3600 * 1000; // 기업코드 목록은 7일마다 갱신

let memoryCorpList = null; // 함수 인스턴스가 살아있는 동안 재사용

async function blobStore() {
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore("dart-cache");
  } catch {
    return null;
  }
}

async function dartGet(path, params) {
  const key = requireEnv("DART_API_KEY");
  const qs = new URLSearchParams({ crtfc_key: key, ...params });
  const res = await fetchWithTimeout(`${BASE}/${path}?${qs}`);
  if (!res.ok) throw new Error(`DART ${path} HTTP ${res.status}`);
  const data = await res.json();
  // 000 정상, 013 조회된 데이터 없음
  if (data.status === "013") return { status: "013", list: [] };
  if (data.status !== "000") throw new Error(`DART ${path}: ${data.message || data.status}`);
  return data;
}

export function parseCorpXml(xml) {
  const out = [];
  const re = /<list>([\s\S]*?)<\/list>/g;
  const pick = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].trim() : "";
  };
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const stock = pick(b, "stock_code");
    if (!stock) continue; // 상장사만
    out.push({ corp: pick(b, "corp_code"), name: pick(b, "corp_name"), code: stock });
  }
  return out;
}

// 상장사 목록 [{corp, name, code}]
export async function getCorpList() {
  if (memoryCorpList && Date.now() - memoryCorpList.ts < CORP_TTL_MS) return memoryCorpList.list;
  const store = await blobStore();
  if (store) {
    try {
      const cached = await store.get("corp-list", { type: "json" });
      if (cached && Date.now() - cached.ts < CORP_TTL_MS) {
        memoryCorpList = cached;
        return cached.list;
      }
    } catch { /* 캐시 실패는 무시 */ }
  }
  const key = requireEnv("DART_API_KEY");
  const res = await fetchWithTimeout(`${BASE}/corpCode.xml?crtfc_key=${key}`, {}, 25000);
  if (!res.ok) throw new Error(`DART corpCode HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let files;
  try {
    files = unzipSync(buf);
  } catch {
    // 키 오류 시 zip 대신 JSON/XML 오류가 옴
    throw new Error(`DART 기업코드 다운로드 실패: ${strFromU8(buf).slice(0, 200)}`);
  }
  const xmlName = Object.keys(files).find((n) => n.toLowerCase().endsWith(".xml"));
  const list = parseCorpXml(strFromU8(files[xmlName]));
  memoryCorpList = { ts: Date.now(), list };
  if (store) {
    try { await store.setJSON("corp-list", memoryCorpList); } catch { /* 무시 */ }
  }
  return list;
}

export async function findCorp(code) {
  const list = await getCorpList();
  return list.find((c) => c.code === code) || null;
}

export async function searchCorp(q) {
  const list = await getCorpList();
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const exact = [], starts = [], contains = [];
  for (const c of list) {
    const n = c.name.toLowerCase();
    if (c.code === s || n === s) exact.push(c);
    else if (n.startsWith(s) || c.code.startsWith(s)) starts.push(c);
    else if (n.includes(s)) contains.push(c);
  }
  return [...exact, ...starts, ...contains].slice(0, 10);
}

export async function getCompany(corp) {
  const d = await dartGet("company.json", { corp_code: corp });
  return d.status === "013" ? null : d;
}

// ---------- 재무제표 ----------
const ACC = {
  revenue: { sj: ["IS", "CIS"], ids: ["ifrs-full_Revenue", "ifrs_Revenue"], names: ["매출액", "수익(매출액)", "영업수익", "순영업수익"] },
  opIncome: { sj: ["IS", "CIS"], ids: ["dart_OperatingIncomeLoss"], names: ["영업이익", "영업이익(손실)", "영업손익"] },
  netIncome: { sj: ["IS", "CIS"], ids: ["ifrs-full_ProfitLossAttributableToOwnersOfParent", "ifrs-full_ProfitLoss", "ifrs_ProfitLoss"], names: ["당기순이익", "당기순이익(손실)", "연결당기순이익"] },
  assets: { sj: ["BS"], ids: ["ifrs-full_Assets", "ifrs_Assets"], names: ["자산총계"] },
  liabilities: { sj: ["BS"], ids: ["ifrs-full_Liabilities", "ifrs_Liabilities"], names: ["부채총계"] },
  equityOwners: { sj: ["BS"], ids: ["ifrs-full_EquityAttributableToOwnersOfParent"], names: ["지배기업 소유주지분", "지배기업의 소유주에게 귀속되는 자본"] },
  equity: { sj: ["BS"], ids: ["ifrs-full_Equity", "ifrs_Equity"], names: ["자본총계"] },
  currentAssets: { sj: ["BS"], ids: ["ifrs-full_CurrentAssets"], names: ["유동자산"] },
  currentLiabilities: { sj: ["BS"], ids: ["ifrs-full_CurrentLiabilities"], names: ["유동부채"] },
  ocf: { sj: ["CF"], ids: ["ifrs-full_CashFlowsFromUsedInOperatingActivities"], names: ["영업활동현금흐름", "영업활동으로 인한 현금흐름", "영업활동 현금흐름"] },
  interestPaid: { sj: ["CF"], ids: ["ifrs-full_InterestPaidClassifiedAsOperatingActivities", "ifrs-full_InterestPaidClassifiedAsFinancingActivities"], names: ["이자의 지급", "이자지급", "이자의지급"] },
  financeCosts: { sj: ["IS", "CIS"], ids: ["ifrs-full_FinanceCosts"], names: ["금융비용", "금융원가"] },
};

function findAccount(list, spec) {
  const inSj = list.filter((r) => spec.sj.includes(r.sj_div));
  for (const id of spec.ids) {
    const r = inSj.find((x) => x.account_id === id);
    if (r) return r;
  }
  const clean = (s) => (s || "").replace(/\s/g, "");
  for (const nm of spec.names) {
    const r = inSj.find((x) => clean(x.account_nm) === clean(nm));
    if (r) return r;
  }
  for (const nm of spec.names) {
    const r = inSj.find((x) => clean(x.account_nm).includes(clean(nm)));
    if (r) return r;
  }
  return null;
}

async function fetchStatements(corp, year, reprt) {
  for (const fs of ["CFS", "OFS"]) { // 연결 우선, 없으면 별도
    const d = await dartGet("fnlttSinglAcntAll.json", { corp_code: corp, bsns_year: String(year), reprt_code: reprt, fs_div: fs });
    if (d.list && d.list.length) return { fs, list: d.list };
  }
  return null;
}

export function extractAnnual(list, year) {
  const out = { years: [year - 2, year - 1, year] };
  for (const [k, spec] of Object.entries(ACC)) {
    const r = findAccount(list, spec);
    out[k] = r ? [toNum(r.bfefrmtrm_amount), toNum(r.frmtrm_amount), toNum(r.thstrm_amount)] : [null, null, null];
  }
  return out;
}

export function extractQuarter(list) {
  // 분기/반기 보고서: 손익은 누적(add) 금액으로 전년 동기 비교
  const pickIS = (spec) => {
    const r = findAccount(list, spec);
    if (!r) return [null, null];
    const cur = toNum(r.thstrm_add_amount) ?? toNum(r.thstrm_amount);
    const prev = toNum(r.frmtrm_add_amount) ?? toNum(r.frmtrm_q_amount) ?? toNum(r.frmtrm_amount);
    return [prev, cur];
  };
  return { revenue: pickIS(ACC.revenue), opIncome: pickIS(ACC.opIncome), netIncome: pickIS(ACC.netIncome) };
}

const QUARTER_REPORTS = [
  { code: "11014", label: "3분기" },
  { code: "11012", label: "반기" },
  { code: "11013", label: "1분기" },
];

export async function getFinancials(corp) {
  const thisYear = new Date().getFullYear();
  let annual = null;
  for (const y of [thisYear - 1, thisYear - 2]) {
    const st = await fetchStatements(corp, y, "11011");
    if (st) { annual = { year: y, fs: st.fs, ...extractAnnual(st.list, y) }; break; }
  }
  let quarter = null;
  const qYear = annual ? annual.year + 1 : thisYear;
  for (const q of QUARTER_REPORTS) {
    try {
      const st = await fetchStatements(corp, qYear, q.code);
      if (st) { quarter = { year: qYear, label: q.label, ...extractQuarter(st.list) }; break; }
    } catch { /* 분기 자료 없음 */ }
  }
  return { annual, quarter };
}

// ---------- 배당 ----------
export function parseDividend(list) {
  const isCommon = (r) => !r.stock_knd || r.stock_knd.includes("보통");
  const row = (pred) => list.find((r) => pred(r.se || "") && isCommon(r)) || list.find((r) => pred(r.se || ""));
  const vals = (r) => (r ? [toNum(r.lwfr), toNum(r.frmtrm), toNum(r.thstrm)] : [null, null, null]);
  return {
    dps: vals(row((s) => s.includes("주당") && s.includes("현금배당금"))),
    yield: vals(row((s) => s.includes("현금배당수익률"))),
    payout: vals(row((s) => s.includes("현금배당성향"))),
  };
}

export async function getDividend(corp, year) {
  const d = await dartGet("alotMatter.json", { corp_code: corp, bsns_year: String(year), reprt_code: "11011" });
  return d.list && d.list.length ? parseDividend(d.list) : null;
}

// ---------- 최대주주 ----------
export function parseShareholders(list) {
  const common = list.filter((r) => !r.stock_knd || r.stock_knd.includes("보통"));
  const rows = common.length ? common : list;
  const total = rows.find((r) => (r.nm || "").replace(/\s/g, "") === "계");
  const people = rows.filter((r) => (r.nm || "").replace(/\s/g, "") !== "계");
  const top = people.find((r) => (r.relate || "").includes("본인")) || people[0];
  const sum = total ? toNum(total.trmend_posesn_stock_qota_rt)
    : people.reduce((a, r) => a + (toNum(r.trmend_posesn_stock_qota_rt) || 0), 0);
  return top ? { name: top.nm, ratio: toNum(top.trmend_posesn_stock_qota_rt), totalWithRelated: sum, count: people.length } : null;
}

export async function getShareholders(corp, year) {
  const d = await dartGet("hyslrSttus.json", { corp_code: corp, bsns_year: String(year), reprt_code: "11011" });
  return d.list && d.list.length ? parseShareholders(d.list) : null;
}

// ---------- 공시 목록 ----------
export async function getDisclosures(corp, days = 365, max = 100) {
  const end = new Date();
  const bgn = new Date(Date.now() - days * 24 * 3600 * 1000);
  const d = await dartGet("list.json", {
    corp_code: corp, bgn_de: yyyymmdd(bgn), end_de: yyyymmdd(end), page_no: "1", page_count: String(Math.min(max, 100)),
  });
  return (d.list || []).map((r) => ({
    title: r.report_nm.replace(/\s+/g, " ").trim(),
    date: r.rcept_dt,
    filer: r.flr_nm,
    rceptNo: r.rcept_no,
    url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcept_no}`,
  }));
}
