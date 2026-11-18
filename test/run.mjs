// 모의 데이터로 API 함수 전체 흐름 검증: node test/run.mjs
import { kisState } from "./mock.mjs";
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
// 한국투자증권: 값 우선 적용 · 토큰 재사용 · 만료 시 재발급 · 실패 시 네이버 대체
const k1 = (await call(stock, "/api/stock?code=005930&fresh=1")).body;
const val = k1.sections.find((x) => x.key === "valuation").points;
assert.match(val.find((p) => p.label === "현재가").value, /^100,100원/);
assert.match(val.find((p) => p.label === "현재가").note, /한국투자증권 \+ 네이버 증권/);
assert.equal(val.find((p) => p.label.startsWith("추정")).value, "11.2배", "추정PER은 네이버에서");
assert.equal(k1.sections[0].points[0].value, "전기·전자");
assert.equal(kisState.tokenCalls, 1, "토큰은 한 번만 발급");
kisState.expireNext = true;
await call(stock, "/api/stock?code=005930&fresh=2");
assert.equal(kisState.tokenCalls, 2, "만료 시 재발급");
kisState.failCodes = ["005930"];
const k3 = (await call(stock, "/api/stock?code=005930&fresh=3")).body;
assert.match(k3.sections.find((x) => x.key === "valuation").points[0].value, /^99,800원/);
assert.match(k3.warnings[0], /한국투자증권.*네이버 증권 값으로 대체/);
kisState.failCodes = [];
const { parseKisPrice } = await import("../lib/kis.mjs");
assert.throws(() => parseKisPrice({ stck_prpr: "0" }), /현재가 없음/);
assert.equal(parseKisPrice({ stck_prpr: "1000", per: "0.00" }).per, null, "PER 0은 값 없음");
console.log("한국투자증권 연동 검사 통과 · 경고 예:", k3.warnings[0]);
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
