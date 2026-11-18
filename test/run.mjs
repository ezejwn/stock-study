// 모의 데이터로 API 함수 전체 흐름 검증: node test/run.mjs
import "./mock.mjs";
import search from "../netlify/functions/search.mjs";
import stock from "../netlify/functions/stock.mjs";
import disclosures from "../netlify/functions/disclosures.mjs";
import news from "../netlify/functions/news.mjs";
import assert from "node:assert/strict";

const call = async (fn, path) => { const r = await fn(new Request("http://x" + path)); return { status: r.status, body: await r.json(), headers: r.headers }; };

const s = await call(search, "/api/search?q=삼성");
assert.equal(s.body.results[0].code, "005930");
assert.equal((await call(search, "/api/search?q=비상장")).body.results.length, 0, "비상장 제외");

const expected = { "005930": "value", "196170": "growth", "105560": "dividend" };
for (const [code, cat] of Object.entries(expected)) {
  const r = await call(stock, `/api/stock?code=${code}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const b = r.body;
  console.log(`\n=== ${b.name} (${code}) → ${b.category.label}  scores=${JSON.stringify(b.category.scores)}`);
  console.log("  이유:", b.category.reasons.join(" / "));
  if (b.warnings.length) console.log("  경고:", b.warnings);
  for (const sec of b.sections) {
    console.log(`  [${sec.no}] ${sec.title}: ${sec.summary}`);
    for (const p of sec.points) console.log(`      ${p.tone.padEnd(7)} ${p.label}: ${p.value}${p.note ? "  — " + p.note : ""}`);
  }
  console.log("  촉매:", b.catalysts.map((x) => x.title), " 리스크:", b.risks.map((x) => x.title));
  assert.equal(b.category.auto, cat, `${code} 분류`);
  assert.equal(b.warnings.length, 0);
  assert.ok(r.headers.get("netlify-cdn-cache-control"));
}
assert.equal((await call(stock, "/api/stock?code=abc")).status, 400);
assert.equal((await call(stock, "/api/stock?code=000000")).status, 404);

const d = await call(disclosures, "/api/disclosures?code=005930&days=30");
assert.ok(d.body.list.length && d.body.list[0].url.includes("dart.fss.or.kr"));
const n = await call(news, "/api/news?q=삼성전자");
console.log("\n뉴스:", n.body.list.map((x) => `${x.title} [${x.tag?.keyword || "-"}] ${x.naver ? "N" : ""}`));
assert.ok(n.body.list[0].title.includes('"어닝 서프라이즈"'));
assert.ok(!n.body.list.some((x) => x.title.includes("<script>")), "태그 제거");

// 키 누락 시 친절한 오류
delete process.env.NAVER_CLIENT_ID;
const n2 = await call(news, "/api/news?q=x");
assert.equal(n2.status, 500); assert.match(n2.body.error, /NAVER_CLIENT_ID/);
console.log("\n모든 검사 통과");
