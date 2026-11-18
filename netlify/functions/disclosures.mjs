import { findCorp, getDisclosures } from "../../lib/dart.mjs";
import { tagText } from "../../lib/analyze.mjs";
import { json, errorJson } from "../../lib/util.mjs";

export default async (req) => {
  try {
    const p = new URL(req.url).searchParams;
    const code = (p.get("code") || "").trim();
    const days = Math.min(Number(p.get("days")) || 90, 365);
    const corp = await findCorp(code);
    if (!corp) return errorJson("종목을 찾을 수 없습니다.", 404);
    const list = (await getDisclosures(corp.corp, days, 40)).map((d) => ({ ...d, tag: tagText(d.title) }));
    return json({ code, list, updatedAt: new Date().toISOString() }, { cacheSeconds: 300 });
  } catch (e) {
    return errorJson(e.message, e.status || 500);
  }
};

export const config = { path: "/api/disclosures" };
