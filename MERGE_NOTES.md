# RMS 병합본 안내

## 병합 기준

- **베이스 프로젝트:** 영인본
- **Wheat 기능 기준:** 사용자 수정본
- 영인본의 기존 그래프 디자인, 전역 스타일, 비소맥 품목 기능은 최대한 유지했습니다.
- Wheat에서 개선한 공통 UI 규칙은 공통 `CommodityDetail` / 관련 공용 컴포넌트에 반영했습니다.

## Wheat에 이식한 주요 기능

- U.S. Wheat Associates 최신 가격 및 가격 이력
- HRW 기준시세 / WoW
- Wheat 가격 UI의 **USD/MT 표준화**
- 1M / 3M / 6M / 1Y 기간 제어, 6M용 26주 필터
- 52주 가격 범위/현재 위치를 HRW 이력으로 계산
- HRW FOB 실물가 + 한국향 해상운임 + Port Cost 기반 Estimated Korea Landed Cost
- AMIS Market Monitor PDF 연동
- USDA FAS PSD 연동 (`api.fas.usda.gov`)
- Wheat RMS AI: U.S. Wheat + AMIS + Google Search grounding
- Wheat 주요 조달 산지: 미국 / 호주 / 캐나다 / EU / 러시아

## 전 품목 공통 UI 개선

### SCM 조달 분석

- 공통 2행 구조
  - 1행: 품목/범위, 기준시세, WoW, 추정 도착가, 데스크 권고
  - 2행: 조달 리스크
- 가로 드래그/스크롤 제거
- 긴 날짜/설명/원가 breakdown 자연 줄바꿈
- 숫자형 임의 Risk Score를 화면에서 제거하고 `안정 / 주의 / 경계`로 통일

### 글로벌 수급 밸런스

- `Domestic Consumption` / `Area Harvested` 열 폭 확대
- 긴 라벨이 잘리지 않도록 줄바꿈 허용
- 표시 제목/링크는 USDA FAS PSD 기준으로 정리

### 주요 이슈 및 시장 동향

- 정적 기사 fallback 제거
- Gemini Google Search grounding 기반 최신 자료 2~4건
- 4건이면 기존 2열 그리드에서 2×2 배치
- 실제 발행일 표시
- 카드/제목 클릭 시 원문 새 탭
- 원문 URL 없는 항목은 표시하지 않음

## 보존한 영인본 기능

- 기존 비소맥 품목 데이터/서비스
- 기존 그래프 UI, 차트 스타일, 축/범례/인터랙션
- `historicalPriceService`
- `GlobalGrainBalance`, `WasdeTerminal`, `CommodityWasdeCard` 멀티품목 구조
- 공용 `landedCostCalculator` 기존 기능
- 기존 전체 페이지/전역 스타일 (`index.css` 포함)

## 필요한 AI Studio Secrets / 환경변수

실제 키 값은 병합본에 포함하지 않았습니다.

```text
GEMINI_API_KEY
USDA_FAS_API_KEY
PORT_COST_USD_PER_MT
```

- `PORT_COST_USD_PER_MT`가 비어 있으면 Wheat 추정 국내 도착가는 `연동 대기`로 표시됩니다.
- USDA FAS key가 없거나 실패하면 서비스는 코드에 private key를 하드코딩하지 않습니다.

## 검증 완료 항목

소스 기준 자동 검증 22개 항목 통과:

- 공통 SCM 2행 리스크 구조
- SCM 가로 스크롤 제거
- HRW 기준시세
- Wheat Landed Cost 연동
- SCM 정성 Risk Level
- Wheat 1M/3M/6M/1Y 및 6M=26주 로직
- Wheat USD/MT 표준화
- HRW 52주 범위 계산
- 수급 밸런스 긴 항목 폭 개선
- Market Intelligence 최대 4건 / 2×2 / 원문 링크
- AMIS / Wheat AI / Origin Radar / Landed Cost 서버 route
- USDA FAS 공식 API host
- private USDA key 하드코딩 제거
- Port Cost 설정
- FOB/Freight 파서

또한 전체 `.ts/.tsx` 파일에 대해 TypeScript `transpileModule` 기반 **문법 검증을 통과**했습니다.

> 이 실행 환경에서는 npm registry 접근이 되지 않아 `npm install && npm run build` 전체 런타임 빌드는 수행하지 못했습니다. AI Studio에서 프로젝트를 열면 의존성을 설치한 뒤 한 번 Build/Preview 검증해 주세요.

## AI Studio에서 최종 확인할 것

1. Secrets 3개 설정
2. Wheat > SCM 조달분석: HRW / WoW / Landed Cost / 조달리스크
3. Wheat > 가격추이: 1M → 3M → **6M** → 1Y 각각 클릭
4. Wheat > 52주 범위
5. Wheat > RMS AI 시장전망
6. Wheat > 글로벌 수급밸런스
7. Wheat > 주요 조달 산지 및 물류 현황
8. Wheat > 주요 이슈 2~4건 및 원문 링크
9. 옥수수/대두/팜유/전분 등 기존 그래프가 그대로 유지되는지 확인
10. 모든 품목 SCM 영역에서 가로 스크롤/텍스트 잘림이 없는지 확인
