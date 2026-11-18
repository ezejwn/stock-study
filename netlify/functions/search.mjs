import { searchCorp } from "../../lib/dart.mjs";
import { json, errorJson } from "../../lib/util.mjs";

export default async (req) => {
  try {
    const q = new URL(req.url).searchParams.get("q") || "";
    if (!q.trim()) return json({ results: [] });
    const results = await searchCorp(q);
    return json({ results: results.map(({ name, code }) => ({ name, code })) }, { cacheSeconds: 3600 });
  } catch (e) {
    return errorJson(e.message, e.status || 500);
  }
};

export const config = { path: "/api/search" };
