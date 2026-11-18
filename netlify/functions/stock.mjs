import { findCorp, getCompany, getFinancials, getDividend, getShareholders, getDisclosures } from "../../lib/dart.mjs";
import { getMarket } from "../../lib/naver.mjs";
import { getKisMarket, kisEnabled } from "../../lib/kis.mjs";
import { computeMetrics, classify, buildSections, industryInfo } from "../../lib/analyze.mjs";
import { json, errorJson } from "../../lib/util.mjs";

const safe = (p) => p.catch((e) => ({ __error: String(e.message || e) }));
const ok = (v) => (v && !v.__error ? v : null);

// 한국투자증권 값을 우선 쓰고, 빈 칸과 추정PER·배당수익률은 네이버 증권으로 채움
export function mergeMarket(kis, naver) {
  const out = { ...naver };
  if (kis) for (const [k, v] of Object.entries(kis)) if (v != null) out[k] = v;
  out.ok = !!kis || !!naver?.ok;
  out.source = [kis && "한국투자증권", naver?.ok && "네이버 증권"].filter(Boolean).join(" + ") || null;
  return out;
}

export async function analyzeStock(code) {
  const corp = await findCorp(code);
  if (!corp) {
    const err = new Error(`종목코드 ${code} 를 DART 상장사 목록에서 찾을 수 없습니다.`);
    err.status = 404;
    throw err;
  }
  const [companyR, finR, [kisR, naverMarket], discR] = await Promise.all([
    safe(getCompany(corp.corp)),
    safe(getFinancials(corp.corp)),
    Promise.all([kisEnabled() ? safe(getKisMarket(code)) : null, getMarket(code)]),
    safe(getDisclosures(corp.corp, 365, 100)),
  ]);
  const market = mergeMarket(ok(kisR), naverMarket);
  const company = ok(companyR);
  const fin = ok(finR);
  const disclosures = ok(discR) || [];
  const year = fin?.annual?.year || new Date().getFullYear() - 1;
  const [divR, holdR] = await Promise.all([safe(getDividend(corp.corp, year)), safe(getShareholders(corp.corp, year))]);
  const industry = industryInfo(company?.induty_code);
  if (market.sector) industry.name = market.sector; // 한국투자증권 업종명이 더 친숙함
  const metrics = computeMetrics({ fin, market, dividend: ok(divR), isFinancial: industry.financial });
  const category = classify(metrics);
  const built = buildSections({ company, industry, market, fin, metrics, holders: ok(holdR), disclosures });
  const warnings = [
    companyR?.__error && `기업개황: ${companyR.__error}`,
    finR?.__error && `재무: ${finR.__error}`,
    discR?.__error && `공시: ${discR.__error}`,
    kisR?.__error && `한국투자증권: ${kisR.__error}${naverMarket.ok ? " (네이버 증권 값으로 대체)" : ""}`,
    !market.ok && `시세: 네이버 증권 응답 없음${market.error ? ` (${market.error})` : ""}`,
  ].filter(Boolean);
  return {
    code,
    name: corp.name,
    corpCode: corp.corp,
    homepage: company?.hm_url || null,
    category,
    ...built,
    disclosures: disclosures.slice(0, 30),
    warnings,
    updatedAt: new Date().toISOString(),
  };
}

export default async (req) => {
  try {
    const code = (new URL(req.url).searchParams.get("code") || "").trim();
    if (!/^[0-9A-Z]{6}$/.test(code)) return errorJson("6자리 종목코드가 필요합니다.", 400);
    return json(await analyzeStock(code), { cacheSeconds: 1800 });
  } catch (e) {
    return errorJson(e.message, e.status || 500);
  }
};

export const config = { path: "/api/stock" };
