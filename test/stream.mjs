import { zipSync, strToU8 } from "fflate";
import { readFileSync } from "node:fs";
process.env.DART_API_KEY = "k";
const xml = readFileSync("test/fixtures/report.xml", "utf8")
  .replace("</BODY>", `<SECTION-1><TITLE>III. 재무에 관한 사항</TITLE><P>${"무작위숫자".repeat(300000)}${Math.random()}</P></SECTION-1></BODY>`);
// 압축이 잘 안 되도록 난수 데이터 추가
const noise = Array.from({ length: 400000 }, () => Math.random().toString(36).slice(2)).join("");
const zip = zipSync({ "20260310000999.xml": strToU8(xml.replace("</DOCUMENT>", `<X>${noise}</X></DOCUMENT>`)) });
let sent = 0;
globalThis.fetch = async () => new Response(new ReadableStream({
  pull(c) { if (sent >= zip.length) return c.close(); const chunk = zip.slice(sent, sent + 16384); sent += chunk.length; c.enqueue(chunk); },
}));
const { streamBusinessXml, parseBusiness } = await import("../lib/business.mjs");
const t = await streamBusinessXml("20260310000999", Date.now() + 5000);
const b = parseBusiness(t);
console.log(`zip ${(zip.length / 1e6).toFixed(1)}MB 중 ${(sent / 1e6).toFixed(2)}MB만 읽고 중단 · 제품 ${b.products.length}개`);
if (sent > zip.length * 0.5 || b.products.length !== 4) process.exit(1);
