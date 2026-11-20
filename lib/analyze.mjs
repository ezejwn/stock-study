// 지표 계산 · 투자유형 분류 · 5가지 기준 요점 정리

// ---------- 표시 형식 ----------
export function fmtWon(n) {
  if (n == null) return "-";
  const eok = n / 1e8;
  return fmtEok(eok);
}
export function fmtEok(eok) {
  if (eok == null || !Number.isFinite(eok)) return "-";
  const sign = eok < 0 ? "-" : "";
  const a = Math.abs(eok);
  if (a >= 10000) return `${sign}${(a / 10000).toFixed(a >= 100000 ? 0 : 1)}조`;
  return `${sign}${Math.round(a).toLocaleString("ko-KR")}억`;
}
const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? "-" : `${v.toFixed(d)}%`);
const signedPct = (v, d = 1) => (v == null || !Number.isFinite(v) ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);
const times = (v, d = 1) => (v == null || !Number.isFinite(v) ? "-" : `${v.toFixed(d)}배`);

const ratio = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
const growth = (cur, prev) => (cur == null || prev == null || prev <= 0 ? null : (cur / prev - 1) * 100);
const last = (arr) => (arr ? arr[arr.length - 1] : null);

// ---------- 업종 (KSIC 대분류 2자리) ----------
const KSIC = {
  "01": "농업", "02": "임업", "03": "어업", "05": "석탄·원유·천연가스 광업", "06": "금속 광업", "07": "비금속광물 광업", "08": "광업 지원 서비스",
  "10": "식료품", "11": "음료", "12": "담배", "13": "섬유제품", "14": "의복", "15": "가죽·가방·신발", "16": "목재", "17": "펄프·종이",
  "18": "인쇄", "19": "석유정제", "20": "화학", "21": "의약품", "22": "고무·플라스틱", "23": "비금속 광물제품", "24": "1차 금속(철강 등)",
  "25": "금속가공", "26": "전자부품·반도체·통신장비", "27": "의료·정밀·광학기기", "28": "전기장비", "29": "기계·장비", "30": "자동차·부품",
  "31": "조선·항공 등 운송장비", "32": "가구", "33": "기타 제조", "34": "산업용 기계 수리", "35": "전기·가스", "36": "수도", "37": "하수처리",
  "38": "폐기물·재생", "39": "환경 정화", "41": "종합 건설", "42": "전문 공사", "45": "자동차 판매", "46": "도매", "47": "소매",
  "49": "육상 운송", "50": "해운", "51": "항공 운송", "52": "창고·물류", "55": "숙박", "56": "음식점", "58": "출판·소프트웨어",
  "59": "영상·음악 콘텐츠", "60": "방송", "61": "통신", "62": "IT 서비스·SI", "63": "정보서비스·플랫폼", "64": "금융(은행·지주 등)",
  "65": "보험", "66": "증권·금융 서비스", "68": "부동산", "70": "연구개발", "71": "전문 서비스", "72": "엔지니어링", "73": "과학기술 서비스",
  "74": "시설 관리", "75": "사업지원 서비스", "76": "임대", "85": "교육", "86": "보건·의료", "90": "예술·여가", "91": "스포츠·오락", "96": "개인 서비스",
};
const CYCLICAL = ["05", "06", "07", "08", "19", "20", "24", "29", "30", "31", "41", "42", "50"];
const FINANCIAL = ["64", "65", "66"];

export function industryInfo(code) {
  const k = String(code || "").slice(0, 2);
  return { name: KSIC[k] || (code ? `업종코드 ${code}` : "-"), cyclical: CYCLICAL.includes(k), financial: FINANCIAL.includes(k) };
}

// ---------- 공시·뉴스 키워드 → 촉매/리스크 ----------
const CATALYST = ["단일판매", "공급계약", "수주", "신규시설투자", "자기주식취득", "자사주매입", "자사주소각", "주식소각", "현금ㆍ현물배당", "현금배당", "흑자전환",
  "영업실적등에대한전망", "기술이전", "특허", "타법인주식및출자증권취득", "무상증자", "임상", "품목허가", "최대실적", "사상최대", "실적개선", "목표가상향"];
const RISK = ["유상증자", "전환사채", "신주인수권부사채", "교환사채", "감자", "소송", "횡령", "배임", "불성실공시", "거래정지", "관리종목", "상장폐지",
  "감사의견", "적자전환", "영업정지", "최대주주변경", "회생", "부도", "자기주식처분", "과징금", "압수수색", "리콜", "손상차손", "목표가하향", "어닝쇼크"];

export function tagText(text) {
  const t = String(text || "").replace(/\s/g, "");
  const r = RISK.find((k) => t.includes(k));
  if (r) return { type: "risk", keyword: r };
  const c = CATALYST.find((k) => t.includes(k));
  if (c) return { type: "catalyst", keyword: c };
  return null;
}

// ---------- 지표 계산 ----------
export function computeMetrics({ fin, market, dividend, isFinancial }) {
  const a = fin?.annual;
  const m = {};
  if (a) {
    const [r0, r1, r2] = a.revenue;
    m.revenue = a.revenue;
    m.opIncome = a.opIncome;
    m.netIncome = a.netIncome;
    m.revGrowth = growth(r2, r1);
    m.revCagr = r0 > 0 && r2 > 0 ? (Math.pow(r2 / r0, 1 / 2) - 1) * 100 : null;
    m.opGrowth = growth(last(a.opIncome), a.opIncome[1]);
    m.niGrowth = growth(last(a.netIncome), a.netIncome[1]);
    m.opMargin = ratio(last(a.opIncome), r2) != null ? ratio(last(a.opIncome), r2) * 100 : null;
    const eqArr = a.equityOwners.some((x) => x != null) ? a.equityOwners : a.equity;
    const eqAvg = eqArr[1] != null && eqArr[2] != null ? (eqArr[1] + eqArr[2]) / 2 : eqArr[2];
    m.roe = ratio(last(a.netIncome), eqAvg) != null ? ratio(last(a.netIncome), eqAvg) * 100 : null;
    m.debtRatio = ratio(last(a.liabilities), last(a.equity)) != null ? ratio(last(a.liabilities), last(a.equity)) * 100 : null;
    m.currentRatio = ratio(last(a.currentAssets), last(a.currentLiabilities)) != null ? ratio(last(a.currentAssets), last(a.currentLiabilities)) * 100 : null;
    const interest = last(a.interestPaid) != null && last(a.interestPaid) !== 0 ? Math.abs(last(a.interestPaid)) : last(a.financeCosts) ? Math.abs(last(a.financeCosts)) : null;
    m.interestCoverage = interest ? last(a.opIncome) / interest : null;
    m.ocf = last(a.ocf);
    m.ocfToNi = last(a.netIncome) > 0 && m.ocf != null ? m.ocf / last(a.netIncome) : null;
    m.lossYears = a.opIncome.filter((x) => x != null && x < 0).length;
  }
  const q = fin?.quarter;
  if (q) {
    m.qRevYoy = growth(q.revenue[1], q.revenue[0]);
    m.qOpYoy = growth(q.opIncome[1], q.opIncome[0]);
    m.qOpTurn = q.opIncome[0] != null && q.opIncome[1] != null ? (q.opIncome[0] < 0 && q.opIncome[1] > 0 ? "흑자전환" : q.opIncome[0] > 0 && q.opIncome[1] < 0 ? "적자전환" : null) : null;
  }
  m.per = market?.per ?? null;
  m.pbr = market?.pbr ?? null;
  m.forwardPer = market?.forwardPer ?? null;
  m.dividendYield = market?.dividendYield ?? last(dividend?.yield) ?? null;
  m.dps = dividend?.dps || null;
  m.payout = last(dividend?.payout);
  m.dpsYears = dividend?.dps ? dividend.dps.filter((x) => x != null && x > 0).length : 0;
  m.dpsGrowing = dividend?.dps && dividend.dps.every((x) => x != null) ? dividend.dps[2] >= dividend.dps[1] && dividend.dps[1] >= dividend.dps[0] : false;
  // 기저효과(급반등) 구간은 PEG가 왜곡되므로 성장률 0~80%에서만 계산
  if (m.per > 0 && m.niGrowth > 0 && m.niGrowth <= 80) m.peg = m.per / m.niGrowth;
  if (market?.price != null && market?.high52 && market?.low52 && market.high52 > market.low52) {
    m.pos52 = ((market.price - market.low52) / (market.high52 - market.low52)) * 100;
  }
  m.isFinancial = !!isFinancial;
  return m;
}

// ---------- 투자유형 분류 ----------
export const CATEGORIES = { value: "장기가치투자", growth: "성장주", dividend: "배당주" };

export function classify(m) {
  const s = { value: 0, growth: 0, dividend: 0 };
  const why = { value: [], growth: [], dividend: [] };
  const add = (k, pts, reason) => { s[k] += pts; why[k].push(reason); };

  if (m.per > 0 && m.per <= 12) add("value", 1, `PER ${times(m.per)} (낮음)`);
  if (m.pbr != null && m.pbr < 1.2) add("value", 1, `PBR ${times(m.pbr, 2)} (자산 대비 저렴)`);
  if (m.roe >= 8) add("value", 1, `ROE ${pct(m.roe)} (꾸준한 수익력)`);
  if (m.isFinancial || (m.debtRatio != null && m.debtRatio < 150)) add("value", 1, m.isFinancial ? "금융업(부채비율 해석 제외)" : `부채비율 ${pct(m.debtRatio, 0)} (안정)`);
  if (m.ocf > 0 && !m.lossYears) add("value", 1, "3년 영업흑자·영업현금흐름 플러스");

  if (m.revCagr >= 15) add("growth", 2, `매출 연평균 ${signedPct(m.revCagr)} (2년)`);
  else if (m.revCagr >= 8) add("growth", 1, `매출 연평균 ${signedPct(m.revCagr)} (2년)`);
  if (m.opGrowth >= 20) add("growth", 1, `영업이익 ${signedPct(m.opGrowth)} (전년비)`);
  if (m.qRevYoy >= 15) add("growth", 1, `최근 분기 누적 매출 ${signedPct(m.qRevYoy)}`);
  if (m.qOpTurn === "흑자전환") add("growth", 1, "최근 분기 흑자전환");
  if (m.roe >= 15) add("growth", 1, `ROE ${pct(m.roe)} (높은 자본효율)`);

  if (m.dividendYield >= 4) add("dividend", 2, `배당수익률 ${pct(m.dividendYield, 2)} (높음)`);
  else if (m.dividendYield >= 2.5) add("dividend", 1, `배당수익률 ${pct(m.dividendYield, 2)}`);
  if (m.payout >= 20 && m.payout <= 80) add("dividend", 1, `배당성향 ${pct(m.payout, 0)} (적정)`);
  if (m.dpsYears >= 3) add("dividend", 1, "3년 연속 현금배당");
  if (m.dpsGrowing && m.dpsYears >= 3) add("dividend", 0.5, "주당배당금 유지·증가");

  const order = ["value", "growth", "dividend"];
  let best = order.reduce((b, k) => (s[k] > s[b] ? k : b), "value");
  // 뚜렷한 특징은 점수보다 우선
  if (m.dividendYield >= 4 && m.dpsYears >= 3) best = "dividend";
  else if (m.revCagr >= 25 && !(m.dividendYield >= 4)) best = "growth";
  return { auto: best, label: CATEGORIES[best], scores: s, reasons: why[best].length ? why[best] : ["뚜렷한 성장·배당 특징이 없어 기본 분류(장기가치)"] };
}

// ---------- 5가지 기준 요점 ----------
const P = (label, value, tone = "neutral", note = "") => ({ label, value, tone, note });

function tone(v, rules) {
  if (v == null || !Number.isFinite(v)) return "neutral";
  for (const [test, t] of rules) if (test(v)) return t;
  return "neutral";
}

function sectionSummary(points, fallback) {
  const good = points.filter((p) => p.tone === "good").length;
  const bad = points.filter((p) => p.tone === "bad").length;
  const warn = points.filter((p) => p.tone === "warn").length;
  if (!points.length) return fallback;
  if (bad) return `주의 ${bad}건 · 양호 ${good}건 — 빨간 항목부터 확인`;
  if (warn > good) return `체크할 항목 ${warn}건 · 양호 ${good}건`;
  return `양호 ${good}건 · 체크 ${warn}건`;
}

export function buildSections({ company, industry, market, fin, metrics: m, holders, disclosures }) {
  const a = fin?.annual;
  const yr = a ? a.year : null;

  // 1. 사업
  const biz = [
    P("업종", industry.name, "neutral", industry.cyclical ? "경기민감 업종 — 업황 사이클 확인" : industry.financial ? "금융업 — 부채비율 대신 ROE·건전성 지표로 판단" : ""),
    P("시장 · 시가총액", `${market?.market || (company?.corp_cls === "Y" ? "KOSPI" : company?.corp_cls === "K" ? "KOSDAQ" : "-")} · ${market?.marketCapEok ? fmtEok(market.marketCapEok) : "-"}`),
    a && last(a.revenue) != null && P("매출 규모", `${fmtWon(last(a.revenue))} (${yr})`),
    m.opMargin != null && P("이익 구조", m.opMargin != null ? `영업이익률 ${pct(m.opMargin)}` : "-", tone(m.opMargin, [[(v) => v >= 15, "good"], [(v) => v < 0, "bad"], [(v) => v < 5, "warn"]]), m.opMargin >= 15 ? "높은 마진 = 경쟁우위(해자) 가능성" : ""),
    P("설립 · 대표", `${company?.est_dt ? company.est_dt.slice(0, 4) + "년" : "-"} · ${company?.ceo_nm || "-"}`),
  ].filter(Boolean);

  // 2. 실적·재무
  const perf = [];
  if (a) {
    if (a.revenue.some((v) => v != null)) perf.push(P("매출 추이", a.revenue.map((v) => fmtWon(v)).join(" → "), tone(m.revCagr, [[(v) => v >= 10, "good"], [(v) => v < 0, "warn"]]), m.revCagr != null ? `연평균 ${signedPct(m.revCagr)}` : ""));
    const latestLoss = last(a.opIncome) != null && last(a.opIncome) < 0;
    perf.push(P("영업이익 추이", a.opIncome.map((v) => fmtWon(v)).join(" → "),
      latestLoss ? "bad" : m.lossYears ? "warn" : tone(m.opGrowth, [[(v) => v >= 10, "good"], [(v) => v < -20, "warn"]]),
      latestLoss ? "최근 연도 영업적자" : m.lossYears ? "과거 적자 → 현재 흑자 (지속성 확인)" : m.opGrowth != null ? `전년비 ${signedPct(m.opGrowth)}` : ""));
    perf.push(P("ROE", pct(m.roe), tone(m.roe, [[(v) => v >= 15, "good"], [(v) => v < 0, "bad"], [(v) => v < 8, "warn"]]), "15%↑ 우수 · 8% 미만 낮음"));
    if (!m.isFinancial) {
      perf.push(P("부채비율", pct(m.debtRatio, 0), tone(m.debtRatio, [[(v) => v < 100, "good"], [(v) => v > 200, "bad"]]), "100% 미만 안정 · 200% 초과 주의"));
      perf.push(P("유동비율", pct(m.currentRatio, 0), tone(m.currentRatio, [[(v) => v >= 150, "good"], [(v) => v < 100, "warn"]]), "1년 내 갚을 빚 대비 현금화 자산"));
      if (m.interestCoverage != null) perf.push(P("이자보상배율", m.interestCoverage != null ? times(m.interestCoverage) : "-", tone(m.interestCoverage, [[(v) => v >= 5, "good"], [(v) => v < 1, "bad"], [(v) => v < 3, "warn"]]), "영업이익 ÷ 이자(근사) · 1배 미만 위험"));
    }
    perf.push(P("영업현금흐름", m.ocf != null ? fmtWon(m.ocf) : "-",
      m.ocf != null && m.ocf < 0 ? "bad" : tone(m.ocfToNi, [[(v) => v >= 0.8, "good"], [(v) => v < 0.5, "warn"]]),
      m.ocfToNi != null ? `순이익 대비 ${times(m.ocfToNi)} · 1배 근처면 이익의 질 양호` : m.ocf != null && m.ocf < 0 ? "이익 대비 현금이 안 들어옴" : ""));
  }
  if (fin?.quarter) {
    const q = fin.quarter;
    perf.push(P(`최근 ${q.year} ${q.label} 누적`, `매출 ${signedPct(m.qRevYoy)} · 영업이익 ${m.qOpTurn || signedPct(m.qOpYoy)}`,
      m.qOpTurn === "적자전환" ? "bad" : m.qOpTurn === "흑자전환" ? "good" : tone(m.qOpYoy, [[(v) => v >= 10, "good"], [(v) => v < -20, "warn"]]), "전년 동기 대비"));
  }

  // 3. 밸류에이션
  const val = [
    P("현재가", market?.price != null ? `${market.price.toLocaleString("ko-KR")}원 (${signedPct(market.changeRate, 2)})` : "-", "neutral", market?.source ? `출처: ${market.source}` : ""),
    P("PER", m.per != null ? times(m.per) : "-", m.per == null ? "neutral" : m.per <= 0 ? "bad" : tone(m.per, [[(v) => v < 10, "good"], [(v) => v > 30, "warn"]]), m.per != null && m.per <= 0 ? "적자로 산출 불가" : "10배↓ 저평가 구간 · 30배↑ 기대 선반영"),
    P("PBR", m.pbr != null ? times(m.pbr, 2) : "-", tone(m.pbr, [[(v) => v < 1, "good"], [(v) => v > 3, "warn"]]), "1배 미만 = 순자산보다 싸게 거래"),
  ];
  if (m.forwardPer) val.push(P("추정 PER (컨센서스)", times(m.forwardPer), m.per > 0 && m.forwardPer < m.per ? "good" : "neutral", m.per > 0 && m.forwardPer < m.per ? "이익 증가 예상" : ""));
  if (m.peg) val.push(P("PEG", times(m.peg, 2), tone(m.peg, [[(v) => v < 1, "good"], [(v) => v > 2, "warn"]]), "PER ÷ 순이익 성장률 · 1 미만 성장 대비 저렴"));
  val.push(P("배당수익률", pct(m.dividendYield, 2), tone(m.dividendYield, [[(v) => v >= 4, "good"]])));
  if (m.pos52 != null) val.push(P("52주 위치", `${m.pos52.toFixed(0)}%`, tone(m.pos52, [[(v) => v >= 90, "warn"], [(v) => v <= 20, "good"]]), `${m.pos52 >= 90 ? "고점 근처 · " : m.pos52 <= 20 ? "저점 근처 · " : ""}저가 ${market.low52.toLocaleString("ko-KR")} ~ 고가 ${market.high52.toLocaleString("ko-KR")}`));

  // 4. 경영진·주주환원
  const buybacks = (disclosures || []).filter((d) => /자기주식취득|자기주식소각|주식소각|자사주/.test(d.title.replace(/\s/g, "")));
  const cancels = buybacks.filter((d) => /소각/.test(d.title));
  const mgmt = [
    P("대표이사", company?.ceo_nm || "-"),
    P("최대주주", holders ? `${holders.name} ${pct(holders.ratio, 2)}` : "-", "neutral"),
    P("최대주주+특수관계인", holders?.totalWithRelated != null ? pct(holders.totalWithRelated, 2) : "-",
      tone(holders?.totalWithRelated, [[(v) => v < 20, "warn"], [(v) => v > 60, "warn"]]),
      holders?.totalWithRelated < 20 ? "지분 낮음 — 경영권 분쟁 가능성 체크" : holders?.totalWithRelated > 60 ? "유통주식 적음 — 거래량·지배구조 체크" : ""),
    P("주당배당금(3년)", m.dps ? m.dps.map((v) => (v == null ? "-" : `${v.toLocaleString("ko-KR")}원`)).join(" → ") : "-",
      m.dpsGrowing && m.dpsYears >= 3 ? "good" : m.dpsYears === 0 ? "warn" : "neutral", m.dpsYears === 0 ? "최근 배당 없음" : ""),
    P("배당성향", pct(m.payout, 0), tone(m.payout, [[(v) => v > 100, "warn"], [(v) => v >= 20, "good"]]), m.payout > 100 ? "번 돈보다 많이 배당 — 지속성 체크" : ""),
    P("자사주 공시(1년)", buybacks.length ? `${buybacks.length}건${cancels.length ? ` (소각 ${cancels.length}건)` : ""}` : "없음", cancels.length ? "good" : "neutral", cancels.length ? "소각 = 실질적 주주환원" : ""),
  ];

  // 5. 촉매·리스크 (공시 기준 — 뉴스는 화면에서 합침)
  const tagged = (disclosures || []).map((d) => ({ ...d, tag: tagText(d.title) })).filter((d) => d.tag);
  const catalysts = tagged.filter((d) => d.tag.type === "catalyst").slice(0, 6);
  const risks = tagged.filter((d) => d.tag.type === "risk").slice(0, 6);

  return {
    sections: [
      { key: "business", no: 1, title: "사업", summary: `${industry.name}${industry.cyclical ? " · 경기민감" : ""}${m.opMargin != null ? ` · 영업이익률 ${pct(m.opMargin)}` : ""}`, points: biz },
      { key: "performance", no: 2, title: "실적 · 재무", summary: a ? sectionSummary(perf, "") + ` (${yr}년 사업보고서${a.fs === "OFS" ? ", 별도" : ", 연결"})` : "재무 데이터 없음", points: perf },
      { key: "valuation", no: 3, title: "밸류에이션", summary: sectionSummary(val.filter((p) => p.label !== "현재가"), "시세 데이터 없음") + " · 업종 평균과 비교 필요", points: val },
      { key: "management", no: 4, title: "경영진 · 주주환원", summary: sectionSummary(mgmt, ""), points: mgmt },
      { key: "catalyst", no: 5, title: "촉매 · 리스크", summary: `최근 1년 공시 기준 촉매 ${catalysts.length}건 · 리스크 ${risks.length}건`, points: [] },
    ],
    catalysts,
    risks,
  };
}

// ---------- 종합 판단 ----------
// 회사 체력(사업·재무) × 가격(밸류에이션) 매트릭스 + 주주환원·리스크 보정
const SERIOUS_RISK = /유상증자|전환사채|신주인수권부사채|감사의견|횡령|배임|관리종목|상장폐지|거래정지|회생|부도/;

export function gradeQuality(m) {
  let q = 0;
  const plus = [], minus = [];
  const add = (v, msg) => { q += v; (v > 0 ? plus : minus).push(msg); };
  if (m.isFinancial) {
    // 금융업: 매출·영업이익률·부채비율 대신 ROE 중심
    if (m.roe >= 10) add(2, `ROE ${pct(m.roe)} — 금융업 중 우수`);
    else if (m.roe >= 7) add(1.5, `ROE ${pct(m.roe)} — 금융업 평균 이상`);
    else if (m.roe != null && m.roe < 5) add(-1, `ROE ${pct(m.roe)}로 낮음`);
    if (m.opGrowth >= 5) add(0.5, `영업이익 ${signedPct(m.opGrowth)} 증가`);
    else if (m.opGrowth != null && m.opGrowth < -10) add(-1, `영업이익 ${signedPct(m.opGrowth)} 감소`);
    if (m.dpsYears >= 3) add(0.5, "꾸준한 배당 = 이익 안정성");
  } else {
    if (m.roe >= 15) add(2, `ROE ${pct(m.roe)}로 자본을 잘 굴림`);
    else if (m.roe >= 10) add(1, `ROE ${pct(m.roe)} 양호`);
    else if (m.roe >= 8) add(0.5, `ROE ${pct(m.roe)} 무난`);
    else if (m.roe < 0) add(-2, "순손실(ROE 마이너스)");
    else if (m.roe != null && m.roe < 5) add(-1, `ROE ${pct(m.roe)}로 낮음`);
    if (m.opMargin >= 15) add(1, `영업이익률 ${pct(m.opMargin)} — 마진 높음`);
    else if (m.opMargin >= 8) add(0.5, `영업이익률 ${pct(m.opMargin)} 양호`);
    else if (m.opMargin < 0) add(-2, "영업적자");
    else if (m.opMargin != null && m.opMargin < 3) add(-1, `영업이익률 ${pct(m.opMargin)}로 얇음`);
    if (m.revCagr >= 10) add(1, `매출 연평균 ${signedPct(m.revCagr)} 성장`);
    else if (m.revCagr != null && m.revCagr < -5) add(-1, `매출 감소 추세(${signedPct(m.revCagr)})`);
    else if (m.revCagr != null && m.revCagr < 0) add(-0.5, `매출 정체(${signedPct(m.revCagr)})`);
    if (m.lossYears && !(m.opMargin < 0)) add(-0.5, "최근 3년 중 적자 이력");
    if (m.debtRatio != null && m.debtRatio < 100) add(0.5, `부채비율 ${pct(m.debtRatio, 0)} 안정`);
    else if (m.debtRatio > 200) add(-1, `부채비율 ${pct(m.debtRatio, 0)} 높음`);
    if (m.interestCoverage != null && m.interestCoverage < 1) add(-1, "영업이익으로 이자도 못 냄");
    if (m.ocf != null && m.ocf < 0) add(-1, "영업현금흐름 마이너스(이익의 질 의심)");
    else if (m.ocfToNi >= 0.8) add(0.5, "이익이 현금으로 잘 들어옴");
  }
  if (m.qOpTurn === "적자전환") add(-1, "최근 분기 적자전환");
  else if (m.qOpTurn === "흑자전환") add(1, "최근 분기 흑자전환");
  else if (m.qOpYoy >= 20) add(0.5, `최근 분기 영업이익 ${signedPct(m.qOpYoy)}`);
  else if (m.qOpYoy != null && m.qOpYoy <= -30) add(-0.5, `최근 분기 영업이익 ${signedPct(m.qOpYoy)}`);
  const known = [m.roe, m.opMargin, m.revCagr].filter((x) => x != null).length;
  const grade = known === 0 ? null : q >= 3 ? "상" : q >= 0 ? "중" : "하";
  return { score: q, grade, plus, minus };
}

export function gradeValuation(m, cat) {
  let v = 0;
  const plus = [], minus = [];
  const add = (x, msg) => { v += x; (x > 0 ? plus : minus).push(msg); };
  if (cat === "growth" && m.peg != null) {
    if (m.peg < 1) add(2, `PEG ${times(m.peg, 2)} — 성장 속도에 비해 저렴`);
    else if (m.peg < 1.5) add(1, `PEG ${times(m.peg, 2)} — 성장 대비 적정`);
    else if (m.peg > 2) add(-1, `PEG ${times(m.peg, 2)} — 성장 대비 비쌈`);
  } else if (m.per != null) {
    if (m.per <= 0) add(-1, "적자라 PER로 가치 판단 불가");
    else if (m.per < 8) add(2, `PER ${times(m.per)} — 이익 대비 매우 쌈`);
    else if (m.per < 12) add(1, `PER ${times(m.per)} — 이익 대비 쌈`);
    else if (m.per > 40) add(-2, `PER ${times(m.per)} — 높은 기대가 이미 반영`);
    else if (m.per > 25) add(-1, `PER ${times(m.per)} — 이익 대비 비쌈`);
  }
  if (m.pbr != null) {
    if (m.pbr < 0.8) add(1, `PBR ${times(m.pbr, 2)} — 순자산보다 싸게 거래`);
    else if (m.pbr < 1.2) add(0.5, `PBR ${times(m.pbr, 2)} — 자산가치 근처`);
    else if (m.pbr > 5) add(-1, `PBR ${times(m.pbr, 2)} — 자산 대비 매우 비쌈`);
    else if (m.pbr > 3 && !(m.roe >= 15)) add(-0.5, `PBR ${times(m.pbr, 2)}인데 ROE는 평범`);
  }
  if (m.forwardPer && m.per > 0 && m.forwardPer < m.per * 0.85) add(0.5, `추정 PER ${times(m.forwardPer)} — 내년 이익 증가 기대`);
  if (cat === "dividend" && m.dividendYield >= 5) add(1, `배당수익률 ${pct(m.dividendYield, 2)}`);
  if (m.pos52 >= 90) add(-0.5, `52주 고점 근처(${m.pos52.toFixed(0)}%)`);
  else if (m.pos52 != null && m.pos52 <= 20) add(0.5, `52주 저점 근처(${m.pos52.toFixed(0)}%)`);
  const has = m.per != null || m.pbr != null;
  const grade = !has ? null : v >= 2 ? "쌈" : v <= -1 ? "비쌈" : "적정";
  return { score: v, grade, plus, minus };
}

function gradeReturn(m, buybackCancels) {
  let r = 0;
  if (m.dividendYield >= 4) r += 2; else if (m.dividendYield >= 2) r += 1;
  if (m.dpsYears >= 3) r += 1;
  if (m.dpsGrowing && m.dpsYears >= 3) r += 0.5;
  if (buybackCancels) r += 1;
  if (m.payout > 100) r -= 1;
  return r >= 3 ? "상" : r >= 1.5 ? "중" : "하";
}

const MATRIX = {
  "상|쌈": ["적극 검토", "good", "좋은 회사가 싸게 거래되는 구간이에요. 싼 이유가 일시적인지만 확인되면 매수 후보로 깊게 볼 만해요."],
  "상|적정": ["관심 유지", "good", "좋은 회사, 가격은 적정해요. 한 번에 사기보다 나눠서 접근하거나 조정 때를 노리는 판단이 가능해요."],
  "상|비쌈": ["가격 대기", "warn", "회사는 좋지만 기대가 주가에 이미 많이 반영됐어요. 실적이 기대를 더 넘을 근거가 없다면 가격 조정을 기다리는 쪽이에요."],
  "중|쌈": ["이유 확인", "warn", "싸긴 한데 회사 체력은 평범해요. 싼 이유(업황 부진·일회성 손실·지배구조)가 풀릴 촉매가 있는지 확인이 먼저예요."],
  "중|적정": ["관찰", "neutral", "뚜렷한 매력도, 큰 문제도 없어요. 관심 종목에 두고 실적 개선이나 가격 하락 신호를 기다리는 판단이에요."],
  "중|비쌈": ["보수적", "warn", "체력에 비해 가격 부담이 있어요. 성장 스토리가 확실하지 않으면 보수적으로 보는 게 맞아요."],
  "하|쌈": ["가치 함정 주의", "bad", "숫자상 싸지만 회사 체력이 약해요. 싼 데는 이유가 있을 수 있어 턴어라운드 근거가 없으면 피하는 쪽이에요."],
  "하|적정": ["회피", "bad", "체력이 약하고 가격 매력도 없어요. 실적 반전 신호가 보이기 전까지는 지켜만 보는 게 안전해요."],
  "하|비쌈": ["회피", "bad", "체력은 약한데 가격은 비싸요. 기대감만으로 오른 상태일 수 있어 위험이 커요."],
};

const CHECKLIST = {
  value: ["왜 싼지 이유 찾기 — 업황 바닥인지, 일회성 손실인지, 지배구조 문제인지", "주가를 다시 평가받게 할 촉매(실적 개선·주주환원 확대·자산 매각)가 있는지", "경쟁사 PER·PBR과 비교해 정말 싼지"],
  growth: ["내년에도 성장률이 유지될 근거(수주잔고·신제품·고객 확대)", "추정 PER이 지금보다 낮은지 = 이익이 따라오고 있는지", "유상증자·전환사채로 지분이 희석될 위험"],
  dividend: ["이익이 줄어도 배당을 유지할 체력(영업현금흐름·배당성향 80% 이하)", "배당 정책 공시(분기배당·최소 배당금·주주환원율 목표)", "배당 기준일과 배당락 후 주가 흐름"],
};

export function buildVerdict({ metrics: m, category, catalysts, risks, disclosures }) {
  const cat = category.override || category.auto;
  const quality = gradeQuality(m);
  const valuation = gradeValuation(m, cat);
  const buybackCancels = (disclosures || []).some((d) => /소각/.test(d.title));
  const returnGrade = gradeReturn(m, buybackCancels);
  const ninetyDays = Number(new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10).replace(/-/g, ""));
  const serious = (risks || []).filter((r) => SERIOUS_RISK.test(r.title.replace(/\s/g, "")) && Number(r.date) >= ninetyDays);

  let label, tone, text;
  if (!quality.grade || !valuation.grade) {
    [label, tone, text] = ["판단 보류", "neutral", "재무 또는 시세 데이터가 부족해 자동 판단을 할 수 없어요. 아래 항목을 직접 확인해 주세요."];
  } else {
    [label, tone, text] = MATRIX[`${quality.grade}|${valuation.grade}`];
  }
  if (serious.length) {
    text += ` 다만 최근 90일 안에 '${serious[0].tag?.keyword || "리스크"}' 공시가 있어 원문을 확인하기 전까지 판단을 미루는 게 좋아요.`;
    if (tone === "good") tone = "warn";
  }

  const strengths = [...quality.plus, ...valuation.plus].slice(0, 4);
  const weaknesses = [...quality.minus, ...valuation.minus].slice(0, 4);
  if (returnGrade === "상") strengths.push("배당·자사주 등 주주환원이 좋음");
  if ((catalysts || []).length) strengths.push(`최근 1년 촉매 공시 ${catalysts.length}건`);
  if ((risks || []).length) weaknesses.push(`최근 1년 리스크 공시 ${risks.length}건`);

  const wrongIf = [];
  if (valuation.grade === "쌈") wrongIf.push("싼 이유가 구조적(산업 쇠퇴·경쟁 심화)이라면 계속 싸게 머물 수 있어요");
  if (valuation.grade === "비쌈") wrongIf.push("시장이 아직 모르는 성장(신사업·대형 수주)이 있다면 지금 가격도 쌀 수 있어요");
  if (quality.grade === "상") wrongIf.push("지금의 높은 이익률이 업황 정점 덕분이라면 꺾일 수 있어요");
  if (quality.grade === "하") wrongIf.push("구조조정·신제품으로 이익이 급반전하면 지금이 바닥일 수 있어요");
  if (cat === "dividend") wrongIf.push("이익이 줄면 배당이 삭감될 수 있어요");
  if (cat === "growth" && quality.grade !== "상") wrongIf.push("성장이 다시 빨라지면 지금 지표보다 훨씬 좋게 볼 수 있어요");
  if (!wrongIf.length) wrongIf.push("업종 평균 PER·PBR과 비교하면 '적정'이 '쌈'이나 '비쌈'으로 바뀔 수 있어요", "다음 분기 실적이 방향을 정해줄 가능성이 커요");

  return {
    label, tone, text,
    grades: {
      quality: { grade: quality.grade || "-", desc: "회사 체력(사업·재무)" },
      valuation: { grade: valuation.grade || "-", desc: "지금 가격" },
      shareholder: { grade: returnGrade, desc: "주주환원" },
      risk: { grade: serious.length ? "주의" : (risks || []).length ? "체크" : "양호", desc: "리스크 신호" },
    },
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    checklist: CHECKLIST[cat],
    checklists: CHECKLIST,
    wrongIf: wrongIf.slice(0, 3),
  };
}
