import { getNews, getStockNews } from "../../lib/naver.mjs";
import { tagText } from "../../lib/analyze.mjs";
import { json, errorJson } from "../../lib/util.mjs";

// 네이버 증권 종목뉴스(키 불필요) + 네이버 검색 API(키 있으면) 합쳐서 최신순
export default async (req) => {
  try {
    const p = new URL(req.url).searchParams;
    const q = (p.get("q") || "").trim();
    const code = (p.get("code") || "").trim();
    if (!q && !code) return errorJson("검색어나 종목코드가 필요합니다.", 400);
    const [stock, search] = await Promise.all([
      /^[0-9A-Z]{6}$/.test(code) ? getStockNews(code).catch((e) => ({ error: e.message })) : null,
      q ? getNews(q, 40).catch((e) => ({ error: e.message })) : null,
    ]);
    const lists = [stock, search].filter((x) => Array.isArray(x));
    if (!lists.length) {
      return errorJson([stock?.error, search?.error].filter(Boolean).join(" / ") || "뉴스를 가져오지 못했습니다.", 502);
    }
    const seen = new Set();
    const list = lists.flat()
      .filter((n) => { const k = n.title.replace(/\s/g, ""); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 20)
      .map((n) => ({ ...n, tag: tagText(n.title) }));
    const notice = search?.error ? `검색 API 오류로 네이버 증권 종목뉴스만 표시 중 (${search.error})` : null;
    return json({ q, code, list, notice, updatedAt: new Date().toISOString() }, { cacheSeconds: 600 });
  } catch (e) {
    return errorJson(e.message, e.status || 500);
  }
};

export const config = { path: "/api/news" };
