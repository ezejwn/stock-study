// 설정 점검: 키 값은 보여주지 않고 '읽히는지'만 표시
import bundledCorps from "../../lib/corps.generated.mjs";
import { json, getEnv, cleanKey } from "../../lib/util.mjs";
import { getNews } from "../../lib/naver.mjs";

const NAMES = ["DART_API_KEY", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "KIS_APP_KEY", "KIS_APP_SECRET"];

export default async () => {
  const env = Object.fromEntries(NAMES.map((n) => [n, !!getEnv(n)]));
  // 이름이 비슷한 변수(오타·공백 진단용) — 값은 절대 표시하지 않음
  const similar = Object.keys(process.env)
    .filter((k) => /naver|kis|dart|client|app_?key|secret|ncp|apigw/i.test(k) && !NAMES.includes(k))
    .map((k) => JSON.stringify(k));
  // 키 모양 점검 (값은 숨기고 길이만)
    const shape = (n) => {
    const names = { NAVER_CLIENT_ID: ["NAVER_CLIENT_ID", "X-NCP-APIGW-API-KEY-ID", "X_NCP_APIGW_API_KEY_ID"], NAVER_CLIENT_SECRET: ["NAVER_CLIENT_SECRET", "X-NCP-APIGW-API-KEY", "X_NCP_APIGW_API_KEY", "X_NCP_APIGW_API_KEY_SECRET", "X_NCP_APIGW_API_SECRET"] }[n] || [n];
    const found = names.find((x) => process.env[x] != null);
    const raw = found ? process.env[found] : undefined;
    if (raw == null) return { 설정됨: false };
    return { 설정됨: true, 변수이름: found, 원래길이: String(raw).length, 정리후길이: cleanKey(raw).length,
      앞뒤공백_줄바꿈: /^\s|\s$/.test(raw), 따옴표: /["'`]/.test(raw), 이름접두어포함: /^\s*[A-Za-z_]+\s*[=:]/.test(raw) };
  };
  const naverKeyLength = { NAVER_CLIENT_ID: shape("NAVER_CLIENT_ID"), NAVER_CLIENT_SECRET: shape("NAVER_CLIENT_SECRET"),
    참고: "NAVER API HUB 키는 ID 10자·Secret 40자, 개발자센터 키는 ID 20자·Secret 10자" };
  if (getEnv("NAVER_CLIENT_ID") && getEnv("NAVER_CLIENT_SECRET")) {
    try { await getNews("삼성전자", 1); naverKeyLength.네이버응답 = "정상 (키 동작함)"; }
    catch (e) { naverKeyLength.네이버응답 = e.message; }
  }
  return json({ env, naverKeyLength, similarNames: similar, corpListBundled: bundledCorps.length, time: new Date().toISOString() });
};

export const config = { path: "/api/health" };
