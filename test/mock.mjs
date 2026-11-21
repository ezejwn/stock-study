// 외부 API(DART·네이버)를 흉내 내는 모의 fetch — 로컬 검증용
import { zipSync, strToU8 } from "fflate";

process.env.DART_API_KEY = "test";
process.env.NAVER_CLIENT_ID = "id";
process.env.NAVER_CLIENT_SECRET = "secret";
process.env.KIS_APP_KEY = "kis-key";
process.env.KIS_APP_SECRET = "kis-secret";
export const kisState = { tokenCalls: 0, expireNext: false, failCodes: [] };

const CORP_XML = `<?xml version="1.0" encoding="UTF-8"?><result>
<list><corp_code>00126380</corp_code><corp_name>삼성전자</corp_name><corp_eng_name>SAMSUNG</corp_eng_name><stock_code>005930</stock_code><modify_date>20250101</modify_date></list>
<list><corp_code>00999999</corp_code><corp_name>성장바이오</corp_name><corp_eng_name>G</corp_eng_name><stock_code>196170</stock_code><modify_date>20250101</modify_date></list>
<list><corp_code>00111111</corp_code><corp_name>배당금융지주</corp_name><corp_eng_name>D</corp_eng_name><stock_code>105560</stock_code><modify_date>20250101</modify_date></list>
<list><corp_code>00222222</corp_code><corp_name>비상장회사</corp_name><corp_eng_name>X</corp_eng_name><stock_code> </stock_code><modify_date>20250101</modify_date></list>
</result>`;

const row = (sj, id, nm, a, b, c, extra = {}) => ({ sj_div: sj, account_id: id, account_nm: nm, bfefrmtrm_amount: String(a), frmtrm_amount: String(b), thstrm_amount: String(c), ...extra });
const T = 1e8; // 억
const FIN = {
  "00126380": [ // 대형 우량주
    row("IS", "ifrs-full_Revenue", "매출액", 3022314 * T, 2589355 * T, 3008709 * T),
    row("IS", "dart_OperatingIncomeLoss", "영업이익", 433766 * T, 65670 * T, 327260 * T),
    row("IS", "ifrs-full_ProfitLossAttributableToOwnersOfParent", "지배기업의 소유주에게 귀속되는 당기순이익", 547300 * T, 144734 * T, 336214 * T),
    row("IS", "ifrs-full_FinanceCosts", "금융비용", 80000 * T, 90000 * T, 95000 * T),
    row("BS", "ifrs-full_Assets", "자산총계", 4484245 * T, 4559060 * T, 5145319 * T),
    row("BS", "ifrs-full_Liabilities", "부채총계", 936749 * T, 922281 * T, 1123399 * T),
    row("BS", "ifrs-full_Equity", "자본총계", 3547496 * T, 3636779 * T, 4021920 * T),
    row("BS", "ifrs-full_EquityAttributableToOwnersOfParent", "지배기업 소유주지분", 3454186 * T, 3533380 * T, 3915000 * T),
    row("BS", "ifrs-full_CurrentAssets", "유동자산", 2184706 * T, 1959366 * T, 2270623 * T),
    row("BS", "ifrs-full_CurrentLiabilities", "유동부채", 783449 * T, 757195 * T, 935000 * T),
    row("CF", "ifrs-full_CashFlowsFromUsedInOperatingActivities", "영업활동현금흐름", "", 444737 * T, 729826 * T),
    row("CF", "ifrs-full_InterestPaidClassifiedAsOperatingActivities", "이자의 지급", "", -8000 * T, -9000 * T),
  ],
  "00999999": [ // 고성장·적자 → 흑자
    row("IS", "ifrs-full_Revenue", "매출액", 400 * T, 900 * T, 2100 * T),
    row("IS", "dart_OperatingIncomeLoss", "영업이익", -150 * T, 60 * T, 700 * T),
    row("IS", "ifrs-full_ProfitLoss", "당기순이익", -120 * T, 50 * T, 600 * T),
    row("BS", "ifrs-full_Liabilities", "부채총계", 300 * T, 350 * T, 420 * T),
    row("BS", "ifrs-full_Equity", "자본총계", 1500 * T, 1600 * T, 2300 * T),
    row("BS", "ifrs-full_CurrentAssets", "유동자산", 900 * T, 1100 * T, 1800 * T),
    row("BS", "ifrs-full_CurrentLiabilities", "유동부채", 200 * T, 260 * T, 300 * T),
    row("CF", "ifrs-full_CashFlowsFromUsedInOperatingActivities", "영업활동으로 인한 현금흐름", "", 40 * T, 520 * T),
  ],
  "00111111": [ // 금융지주(매출 계정 없음)
    row("IS", "dart_OperatingIncomeLoss", "영업이익", 60000 * T, 62000 * T, 65000 * T),
    row("IS", "ifrs-full_ProfitLossAttributableToOwnersOfParent", "지배기업 소유주지분", 44000 * T, 45000 * T, 50000 * T),
    row("BS", "ifrs-full_Liabilities", "부채총계", 6500000 * T, 6800000 * T, 7000000 * T),
    row("BS", "ifrs-full_Equity", "자본총계", 580000 * T, 600000 * T, 620000 * T),
    row("CF", "ifrs-full_CashFlowsFromUsedInOperatingActivities", "영업활동현금흐름", "", -20000 * T, 30000 * T),
  ],
};
const QFIN = {
  "00126380": [
    { sj_div: "IS", account_id: "ifrs-full_Revenue", account_nm: "매출액", thstrm_add_amount: String(2400000 * T), frmtrm_add_amount: String(2250000 * T) },
    { sj_div: "IS", account_id: "dart_OperatingIncomeLoss", account_nm: "영업이익", thstrm_add_amount: String(300000 * T), frmtrm_add_amount: String(250000 * T) },
  ],
  "00999999": [
    { sj_div: "IS", account_id: "ifrs-full_Revenue", account_nm: "매출액", thstrm_add_amount: String(2600 * T), frmtrm_add_amount: String(1500 * T) },
    { sj_div: "IS", account_id: "dart_OperatingIncomeLoss", account_nm: "영업이익", thstrm_add_amount: String(900 * T), frmtrm_add_amount: String(480 * T) },
  ],
};
const DIV = {
  "00126380": [
    { se: "주당 현금배당금(원)", stock_knd: "보통주", thstrm: "1,446", frmtrm: "1,444", lwfr: "1,444" },
    { se: "현금배당수익률(%)", stock_knd: "보통주", thstrm: "2.7", frmtrm: "1.9", lwfr: "2.5" },
    { se: "(연결)현금배당성향(%)", thstrm: "29.2", frmtrm: "67.8", lwfr: "17.9" },
  ],
  "00111111": [
    { se: "주당 현금배당금(원)", stock_knd: "보통주", thstrm: "3,060", frmtrm: "2,950", lwfr: "2,940" },
    { se: "현금배당수익률(%)", stock_knd: "보통주", thstrm: "5.1", frmtrm: "5.6", lwfr: "6.0" },
    { se: "(연결)현금배당성향(%)", thstrm: "26.0", frmtrm: "26.6", lwfr: "26.0" },
  ],
};
const HOLD = {
  "00126380": [
    { nm: "삼성생명보험", relate: "본인", stock_knd: "보통주", trmend_posesn_stock_qota_rt: "8.51" },
    { nm: "삼성물산", relate: "계열회사", stock_knd: "보통주", trmend_posesn_stock_qota_rt: "5.01" },
    { nm: "계", relate: "-", stock_knd: "보통주", trmend_posesn_stock_qota_rt: "20.07" },
  ],
};
const DISC = {
  "00126380": [
    { report_nm: "주요사항보고서(자기주식취득결정)", rcept_dt: "20261117", flr_nm: "삼성전자", rcept_no: "20261117000500" },
    { report_nm: "단일판매ㆍ공급계약체결", rcept_dt: "20261110", flr_nm: "삼성전자", rcept_no: "20261110000321" },
    { report_nm: "분기보고서 (2026.09)", rcept_dt: "20261114", flr_nm: "삼성전자", rcept_no: "20261114000123" },
    { report_nm: "주식등의대량보유상황보고서(일반)", rcept_dt: "20261020", flr_nm: "국민연금공단", rcept_no: "20261020000777" },
    { report_nm: "주요사항보고서(자기주식소각결정)", rcept_dt: "20260410", flr_nm: "삼성전자", rcept_no: "20260410000100" },
  ],
  "00999999": [
    { report_nm: "주요사항보고서(유상증자결정)", rcept_dt: "20261101", flr_nm: "성장바이오", rcept_no: "20261101000999" },
    { report_nm: "기술이전계약체결", rcept_dt: "20260901", flr_nm: "성장바이오", rcept_no: "20260901000111" },
  ],
};
const MARKET = {
  "005930": { per: "18.45배", cnsPer: "11.20배", pbr: "1.62배", dividendYieldRatio: "1.45%", dividend: "1,446원", marketValue: "591조 2,345억", price: "99,800", rate: "1.73", chg: "1,700", h: "105,000", l: "53,000" },
  "196170": { per: "95.10배", cnsPer: "60.00배", pbr: "18.2배", dividendYieldRatio: "0.00%", dividend: "0원", marketValue: "21조 3,000억", price: "398,000", rate: "-2.10", chg: "-8,500", h: "450,000", l: "180,000" },
  "105560": { per: "6.80배", cnsPer: "6.10배", pbr: "0.58배", dividendYieldRatio: "5.10%", dividend: "3,060원", marketValue: "38조 1,000억", price: "95,000", rate: "0.32", chg: "300", h: "102,000", l: "70,000" },
};
const COMPANY = {
  "00126380": { corp_name: "삼성전자(주)", ceo_nm: "전영현, 노태문", corp_cls: "Y", induty_code: "264", est_dt: "19690113", hm_url: "www.samsung.com/sec" },
  "00999999": { corp_name: "성장바이오", ceo_nm: "홍길동", corp_cls: "K", induty_code: "21102", est_dt: "20080515", hm_url: "" },
  "00111111": { corp_name: "배당금융지주", ceo_nm: "김금융", corp_cls: "Y", induty_code: "64992", est_dt: "20081013", hm_url: "" },
};

const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const realFetch = globalThis.fetch;
export const calls = [];

globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  if (!/opendart|naver\.com|koreainvestment|ntruss\.com/.test(u.host)) return realFetch(url, opts);
  calls.push(u.pathname);
  const p = Object.fromEntries(u.searchParams);
  if (u.host.includes("koreainvestment")) {
    if (u.pathname === "/oauth2/tokenP") {
      const b = JSON.parse(opts.body);
      if (b.appkey !== "kis-key") return new Response(JSON.stringify({ error_description: "유효하지 않은 AppKey" }), { status: 403 });
      kisState.tokenCalls++;
      return ok({ access_token: `tok${kisState.tokenCalls}`, token_type: "Bearer", expires_in: 86400 });
    }
    const h = opts.headers;
    if (kisState.expireNext) { kisState.expireNext = false; return new Response(JSON.stringify({ rt_cd: "1", msg_cd: "EGW00123", msg1: "기간이 만료된 token 입니다." }), { status: 500 }); }
    if (!h.authorization?.startsWith("Bearer tok") || h.tr_id !== "FHKST01010100") return ok({ rt_cd: "1", msg1: "bad header" });
    if (kisState.failCodes.includes(p.FID_INPUT_ISCD)) return ok({ rt_cd: "1", msg_cd: "EGW00201", msg1: "초당 거래건수를 초과하였습니다." });
    const K = { "005930": { stck_prpr: "100100", prdy_vrss: "2000", prdy_ctrt: "2.04", per: "18.50", pbr: "1.63", hts_avls: "5925000", w52_hgpr: "105000", w52_lwpr: "53000", rprs_mrkt_kor_name: "KOSPI200", bstp_kor_isnm: "전기·전자" },
      "196170": { stck_prpr: "398000", prdy_vrss: "-8500", prdy_ctrt: "-2.10", per: "95.10", pbr: "18.20", hts_avls: "213000", w52_hgpr: "450000", w52_lwpr: "180000", rprs_mrkt_kor_name: "KOSDAQ", bstp_kor_isnm: "제약" },
      "105560": { stck_prpr: "95000", prdy_vrss: "300", prdy_ctrt: "0.32", per: "6.80", pbr: "0.58", hts_avls: "381000", w52_hgpr: "102000", w52_lwpr: "70000", rprs_mrkt_kor_name: "KOSPI200", bstp_kor_isnm: "금융" },
      "000001": { stck_prpr: "0", per: "0.00" } };
    return ok({ rt_cd: "0", msg1: "정상처리 되었습니다.", output: K[p.FID_INPUT_ISCD] || { stck_prpr: "0", per: "0.00" } });
  }
  if (u.pathname.endsWith("corpCode.xml")) return new Response(zipSync({ "CORPCODE.xml": strToU8(CORP_XML) }));
  if (u.pathname.endsWith("company.json")) return ok({ status: "000", ...COMPANY[p.corp_code] });
  if (u.pathname.endsWith("fnlttSinglAcntAll.json")) {
    const y = Number(p.bsns_year);
    if (p.reprt_code === "11011") {
      if (y !== 2025 || p.fs_div !== (p.corp_code === "00999999" ? "OFS" : "CFS") || !FIN[p.corp_code]) return ok({ status: "013", message: "조회된 데이타가 없습니다." });
      return ok({ status: "000", list: FIN[p.corp_code] });
    }
    if (p.reprt_code === "11014" && y === 2026 && QFIN[p.corp_code] && p.fs_div === "CFS") return ok({ status: "000", list: QFIN[p.corp_code] });
    return ok({ status: "013" });
  }
  if (u.pathname.endsWith("alotMatter.json")) return DIV[p.corp_code] ? ok({ status: "000", list: DIV[p.corp_code] }) : ok({ status: "013" });
  if (u.pathname.endsWith("hyslrSttus.json")) return HOLD[p.corp_code] ? ok({ status: "000", list: HOLD[p.corp_code] }) : ok({ status: "013" });
  if (u.pathname.endsWith("list.json")) return ok({ status: "000", list: DISC[p.corp_code] || [] });
  const mm = u.pathname.match(/api\/stock\/(\d{6})\/(integration|basic)/);
  if (mm) {
    const d = MARKET[mm[1]];
    if (!d) return new Response("nf", { status: 404 });
    if (mm[2] === "basic") return ok({ closePrice: d.price, fluctuationsRatio: d.rate, compareToPreviousClosePrice: d.chg, stockExchangeType: { name: mm[1] === "196170" ? "KOSDAQ" : "KOSPI" } });
    return ok({ totalInfos: [
      { code: "lastClosePrice", key: "전일", value: d.price }, { code: "marketValue", key: "시총", value: d.marketValue },
      { code: "highPriceOf52Weeks", key: "52주 최고", value: d.h }, { code: "lowPriceOf52Weeks", key: "52주 최저", value: d.l },
      { code: "per", key: "PER", value: d.per }, { code: "cnsPer", key: "추정PER", value: d.cnsPer }, { code: "pbr", key: "PBR", value: d.pbr },
      { code: "dividendYieldRatio", key: "배당수익률", value: d.dividendYieldRatio }, { code: "dividend", key: "주당배당금", value: d.dividend },
    ] });
  }
  const sn = u.pathname.match(/api\/news\/stock\/(\d{6})/);
  if (sn) {
    return ok([{ total: 2, items: [
      { id: "1", officeId: "015", articleId: "0005000001", officeName: "한국경제", datetime: "202611201530", title: "종목 단독 수주 소식", titleFull: "삼성전자, 대형 공급계약 수주", body: "본문 <b>요약</b>" },
      { id: "2", officeId: "009", articleId: "0005400002", officeName: "매일경제", datetime: "202611191010", title: "유상증자 검토설", body: "" },
    ] }]);
  }
  if (u.host === "naverapihub.apigw.ntruss.com") {
    const h = opts?.headers || {};
    if (u.pathname !== "/search/v1/news" || p.format !== "json") return new Response("{}", { status: 404 });
    if (h["X-NCP-APIGW-API-KEY-ID"] !== "hubid" || h["X-NCP-APIGW-API-KEY"] !== "hubsecret") {
      return new Response(JSON.stringify({ error: { errorCode: "200", message: "Authentication Failed" } }), { status: 401 });
    }
    return ok({ items: [{ title: `<b>${p.query}</b> API HUB 기사 수주`, link: "https://n.news.naver.com/mnews/article/011/0000000099", originallink: "https://e.com/99", description: "", pubDate: new Date().toUTCString() }] });
  }
  if (u.pathname.endsWith("news.json")) {
    const h = opts?.headers || {};
    if (h["X-Naver-Client-Id"] !== "id" || h["X-Naver-Client-Secret"] !== "secret") {
      return new Response(JSON.stringify({ errorMessage: "NID AUTH Result Invalid (1000) : Authentication failed. (인증에 실패했습니다.)", errorCode: "024" }), { status: 401 });
    }
    const q = p.query;
    const now = Date.now();
    return ok({ items: [
      { title: `<b>${q}</b>, 3분기 사상 최대 실적 &quot;어닝 서프라이즈&quot;`, link: "https://n.news.naver.com/mnews/article/001/0000000001", originallink: "https://example.com/1", description: `<b>${q}</b> 실적 개선`, pubDate: new Date(now - 3600e3).toUTCString() },
      { title: `${q} 대규모 공급계약 수주`, link: "https://example.com/2", originallink: "https://example.com/2", description: "수주", pubDate: new Date(now - 7200e3).toUTCString() },
      { title: `${q} 관련 소송 제기돼`, link: "https://n.news.naver.com/mnews/article/002/0000000002", originallink: "https://example.com/3", description: "소송", pubDate: new Date(now - 86400e3).toUTCString() },
      { title: `${q} 주가 동향 <script>alert(1)</script>`, link: "https://n.news.naver.com/mnews/article/003/0000000003", originallink: "https://example.com/4", description: "", pubDate: new Date(now - 2 * 86400e3).toUTCString() },
      { title: `${q} 목표가 상향`, link: "https://n.news.naver.com/mnews/article/004/0000000004", originallink: "", description: "", pubDate: new Date(now - 3 * 86400e3).toUTCString() },
    ] });
  }
  return new Response("unmocked", { status: 500 });
};
