import { findCorp } from "../../lib/dart.mjs";
import { getBusiness } from "../../lib/business.mjs";
import { json, errorJson } from "../../lib/util.mjs";

// 사업 아이템 (사업보고서 '사업의 내용' 요약) — 1년에 한 번 바뀌므로 길게 캐시
export default async (req) => {
  try {
    const code = (new URL(req.url).searchParams.get("code") || "").trim();
    const corp = await findCorp(code);
    if (!corp) return errorJson("종목을 찾을 수 없습니다.", 404);
    const data = await getBusiness(corp.corp);
    const ok = data.overview.length || data.summary || data.products.length;
    return json({ code, ...data }, { cacheSeconds: ok ? 7 * 24 * 3600 : 0 });
  } catch (e) {
    return errorJson(e.name === "AbortError" ? "DART 원문이 커서 시간 안에 받지 못했습니다. 잠시 후 다시 시도하세요." : e.message, e.status || 500);
  }
};

export const config = { path: "/api/business" };
