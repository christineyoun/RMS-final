RMS STEP 1~7-2 로컬 통합본 - TypeScript lint 4건 수정 패치

대상: RMS_STEP7_기존AI중단_로컬테스트 폴더
원본 소스에 정확한 코드가 있을 때에만 수정하고, 파일별 백업을 자동 생성합니다.

1) 다운로드한 RMS_LINT_4_ERRORS_FIX.mjs를 package.json이 있는 프로젝트 폴더에 복사합니다.
2) VS Code PowerShell 터미널에서 현재 위치를 확인합니다.
3) node .\RMS_LINT_4_ERRORS_FIX.mjs --check-only
4) node .\RMS_LINT_4_ERRORS_FIX.mjs
5) npm.cmd run lint
6) npm.cmd run build

변경 파일:
- scripts/soybean-rebuild/step2-verify.ts (ReadableStream.getReader)
- scripts/soybean-rebuild/step5-originals.ts (ReadableStream.getReader)
- scripts/soybean-rebuild/step3-evidence.ts (선택적 notes 타입)
- src/server/__tests__/newsFreshnessRepair.test.ts (기존 AI 분석 단계 중단에 맞는 회귀 테스트)

Gemini API 호출, Cloud Run 배포, GitHub push, Market Intelligence 실행 코드 변경 없음.
