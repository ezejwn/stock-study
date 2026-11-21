// 로컬 화면 확인용 서버 (모의 데이터): node test/dev-server.mjs → http://localhost:8888
import "./mock.mjs";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import search from "../netlify/functions/search.mjs";
import stock from "../netlify/functions/stock.mjs";
import disclosures from "../netlify/functions/disclosures.mjs";
import news from "../netlify/functions/news.mjs";
import business from "../netlify/functions/business.mjs";

const routes = { "/api/search": search, "/api/stock": stock, "/api/disclosures": disclosures, "/api/news": news, "/api/business": business };
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const fn = routes[u.pathname];
  if (fn) {
    const r = await fn(new Request(u));
    res.writeHead(r.status, { "content-type": "application/json" });
    return res.end(await r.text());
  }
  const file = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
  try {
    const body = await readFile(join(import.meta.dirname, "../public", file));
    res.writeHead(200, { "content-type": (types[extname(file)] || "application/octet-stream") + "; charset=utf-8" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(8888, () => console.log("http://localhost:8888"));
