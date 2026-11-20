// 배포(빌드) 때 DART 상장사 목록을 받아 파일로 저장
// → 함수가 매번 큰 파일을 내려받지 않아 시간 초과(504)가 나지 않음
import { writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { parseCorpXml } from "../lib/dart.mjs";

const key = process.env.DART_API_KEY;
const write = (list) => {
  writeFileSync(new URL("../lib/corps.generated.mjs", import.meta.url),
    `// 빌드 시 자동 생성 (scripts/build-corps.mjs). [corp_code, 회사명, 종목코드]\nexport default ${JSON.stringify(list.map((c) => [c.corp, c.name, c.code]))};\n`);
  writeFileSync(new URL("../public/corps.json", import.meta.url), JSON.stringify(list.map((c) => [c.name, c.code])));
};

if (!key) {
  console.warn("[build-corps] DART_API_KEY 없음 — 상장사 목록 없이 배포합니다 (환경변수 Scopes에 Builds 포함 확인).");
  process.exit(0);
}
try {
  const res = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${key}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let files;
  try { files = unzipSync(buf); } catch { throw new Error(strFromU8(buf).slice(0, 300)); }
  const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(".xml"));
  const list = parseCorpXml(strFromU8(files[name]));
  if (list.length < 1000) throw new Error(`상장사 수가 너무 적음: ${list.length}`);
  write(list);
  console.log(`[build-corps] 상장사 ${list.length}개 저장`);
} catch (e) {
  console.warn(`[build-corps] DART 목록 다운로드 실패: ${e.message}`);
}
