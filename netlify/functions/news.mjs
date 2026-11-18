import { getNews } from "../../lib/naver.mjs";
import { tagText } from "../../lib/analyze.mjs";
import { json, errorJson } from "../../lib/util.mjs";

export default async (req) => {
  try {
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (!q) return errorJson("검색어가 필요합니다.", 400);
    const list = (await getNews(q, 40)).slice(0, 20).map((n) => ({ ...n, tag: tagText(n.title) }));
    return json({ q, list, updatedAt: new Date().toISOString() }, { cacheSeconds: 600 });
  } catch (e) {
    return errorJson(e.message, e.status || 500);
  }
};

export const config = { path: "/api/news" };
