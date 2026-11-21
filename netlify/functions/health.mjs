// 설정 점검: 키 값은 보여주지 않고 '읽히는지'만 표시
import bundledCorps from "../../lib/corps.generated.mjs";
import { json, getEnv } from "../../lib/util.mjs";

const NAMES = ["DART_API_KEY", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "KIS_APP_KEY", "KIS_APP_SECRET"];

export default async () => {
  const env = Object.fromEntries(NAMES.map((n) => [n, !!getEnv(n)]));
  // 이름이 비슷한 변수(오타·공백 진단용) — 값은 절대 표시하지 않음
  const similar = Object.keys(process.env)
    .filter((k) => /naver|kis|dart|client|app_?key|secret/i.test(k) && !NAMES.includes(k))
    .map((k) => JSON.stringify(k));
  // 키 모양 점검 (값은 숨기고 길이만)
  const len = (n) => (getEnv(n) || "").length;
  const naverKeyLength = { NAVER_CLIENT_ID: len("NAVER_CLIENT_ID"), NAVER_CLIENT_SECRET: len("NAVER_CLIENT_SECRET"), expected: "보통 ID 20자 · Secret 10자" };
  return json({ env, naverKeyLength, similarNames: similar, corpListBundled: bundledCorps.length, time: new Date().toISOString() });
};

export const config = { path: "/api/health" };
