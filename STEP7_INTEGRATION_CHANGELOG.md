# STEP7 로컬 통합 변경사항 및 검증 결과

**기준 소스:** `e7788ecad3e19a766a4b387ce994294bb9b88009` (운영 리비전 `rms-viewer-00009-bud`).

**운영 적용: 아직 안 됨.** GitHub main / Cloud Run 무변경.

- 기존 파일 수정: `src/components/CommodityDetail.tsx`, `src/server/stage3DailyUpdates.ts`
- 파일 추가: 신규 STEP 1–7-2 엔진 `scripts/soybean-rebuild`, 로컬 수신기 `src/server/step7LocalPreview.ts`, VS Code 도우미 및 테스트.
- 운영본의 Market Intelligence 코드 `src/server/marketIntelligenceService.ts`, 스케줄 `src/server/scheduledAi.ts`, Cloud 출판 `scripts/cloud/publication.ts`, 시세/기상 코드는 원본과 바이트 동일.
- 신규 STEP7-2 조달 리스크를 기존 SCM 위험 등급보다 무조건 우선, 없으면 갱신 대기.
- 로컬 STEP7 모드에서는 기존 RMS AI 분석 결과 / 생성기를 더는 화면 API에 공급하지 않음.
- 원본 STEP7 분석 실행기는 개발 전용이며 신규 Cloud Run 자동 분석 연결은 구현되지 않음. 운영 이전 별도 검증 필요.

## 검증
- `node --experimental-strip-types --test ...`: 59/59 통과.
- `node scripts/step7-integration/integration-check.mjs`: 통과 (저장된 실제 분석 결과는 이 ZIP에 포함되지 않아 8품목 모두 PENDING).
- TypeScript transpileModule을 이용한 주요 3개 수정 파일 문법 검증: 0건 오류.
- npm 의존성 설치 실패(현재 실행 환경에서 npm 레지스트리 미접속), 따라서 전체 tsc lint, Vite 빌드, 브라우저·API E2E는 **미실행**. VS Code에서 검증 필요.
