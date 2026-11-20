// 설정 점검: 키 값은 보여주지 않고 '읽히는지'만 표시
import bundledCorps from "../../lib/corps.generated.mjs";
import { json } from "../../lib/util.mjs";

const NAMES = ["DART_API_KEY", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "KIS_APP_KEY", "KIS_APP_SECRET"];

export default async () => {
  const env = Object.fromEntries(NAMES.map((n) => [n, !!(process.env[n] ?? globalThis.Netlify?.env?.get?.(n))]));
  return json({ env, corpListBundled: bundledCorps.length, time: new Date().toISOString() });
};

export const config = { path: "/api/health" };
