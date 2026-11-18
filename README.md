# 주식 공부 노트

종목을 넣으면 **장기가치투자 / 성장주 / 배당주**로 자동 분류하고, 종목을 누르면 5가지 기준(사업 · 실적·재무 · 밸류에이션 · 경영진·주주환원 · 촉매·리스크)을 요점만 보여줍니다. DART 공시와 네이버 뉴스는 페이지를 열 때마다, 그리고 열려 있는 동안 5분마다 새로 가져옵니다.

## Netlify 배포 (처음 한 번)

1. **API 키 2종 발급**
   - DART: https://opendart.fss.or.kr → 인증키 신청 (무료)
   - 네이버: https://developers.naver.com → Application 등록 → 사용 API에서 **검색** 선택 → Client ID / Client Secret 확인
   - 한국투자증권(선택): https://apiportal.koreainvestment.com → KIS Developers 서비스 신청 → **실전투자** App Key / App Secret 확인 (한국투자증권 계좌 필요)
2. Netlify → **Add new site → Import an existing project → GitHub → `stock-study`** 선택 (빌드 설정은 `netlify.toml`에 들어 있어 그대로 Deploy)
3. **Site configuration → Environment variables**에 추가한 뒤 **Deploys → Trigger deploy**

| 이름 | 값 |
|---|---|
| `DART_API_KEY` | DART 인증키 |
| `NAVER_CLIENT_ID` | 네이버 Client ID |
| `NAVER_CLIENT_SECRET` | 네이버 Client Secret |
| `KIS_APP_KEY` | 한국투자증권 App Key (선택) |
| `KIS_APP_SECRET` | 한국투자증권 App Secret (선택) |

## 구조
- `public/` 화면 (빌드 없음)
- `netlify/functions/` API: `/api/search`, `/api/stock`, `/api/disclosures`, `/api/news`
- `lib/` DART·네이버 연동, 지표 계산, 분류 규칙(`lib/analyze.mjs`)
- `test/` 모의 데이터 검증: `npm test`, 화면 확인: `node test/dev-server.mjs`

## 참고
- 재무는 최근 사업보고서(연결 우선) + 올해 최신 분기 누적 기준입니다.
- 시세·PER·PBR·시가총액·52주·업종은 **한국투자증권 Open API**를 우선 쓰고, 키가 없거나 실패하면 네이버 증권(비공식 엔드포인트)으로 대체합니다. 추정PER·배당수익률은 네이버 증권 값입니다.
- 한국투자증권 접근토큰(24시간 유효)은 Netlify Blobs에 저장해 재사용하고, 만료되면 자동으로 다시 발급합니다.
- 종목 목록과 메모는 브라우저(localStorage)에 저장됩니다.
- 공부용 자료이며 투자 권유가 아닙니다.
