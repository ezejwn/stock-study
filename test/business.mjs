// 사업의 내용 파싱 검증: node test/business.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseBusiness } from "../lib/business.mjs";

const a = parseBusiness(readFileSync(new URL("./fixtures/report.xml", import.meta.url), "utf8"));
console.log("요약:", a.summary);
console.log("제품:", a.products);
assert.match(a.summary, /^당사는 본사를 거점으로/);
assert.ok(!/작성기준일|참고하시기/.test(a.summary), "상투 문구 제외");
assert.equal(a.products[0].name, "DX 부문 · TV, 모니터, 냉장고, 세탁기, 에어컨, 스마트폰 등");
assert.equal(a.products[0].ratio, 52.3);
assert.ok(!a.products.some((p) => /합|기타/.test(p.name)), "합계·음수 제외");

const b = parseBusiness(readFileSync(new URL("./fixtures/report-merged.xml", import.meta.url), "utf8"));
console.log("요약:", b.summary);
console.log("제품:", b.products);
assert.match(b.summary, /^당사는 스마트폰/);
assert.deepEqual(b.products.map((p) => p.ratio), [62.5, 25, 12.5]);
assert.ok(b.products[1].name.includes("PU폼"), "병합 셀 행도 품목 인식");
console.log("사업 내용 파싱 통과");
