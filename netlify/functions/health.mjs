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
  return json({ env, similarNames: similar, corpListBundled: bundledCorps.length, time: new Date().toISOString() });
};

export const config = { path: "/api/health" };
