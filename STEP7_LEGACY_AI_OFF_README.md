# RMS 운영 코드 + STEP 1~7-2: 기존 AI 호출 중단판 (로컬 테스트 전용)

**기준 운영 소스:** `e7788ecad3e19a766a4b387ce994294bb9b88009`.

## 이번 변경

- 기존 평일 예약 유료 실행의 `analysis-*` 단계 **중단**. `news-*` 단계는 그대로 유지해 Market Intelligence 기능 보호.
- 기존 `/api/ai-analysis/*`의 Gemini 직접 생성 코드 **중단**. 로컬 개발에서만 STEP 7-2 receipt를 읽음. 없는 품목은 503/`갱신 대기`이며 이전 AI 분석으로 대체하지 않음.
- 기존 수동 `standalone-analysis`, 레거시 분석 복원 및 추가 AI 전략 경로 **중단(410)**. STEP 1~7-2는 기존 로컬 명시적 CLI로만 실행.
- SCM 조달 리스크는 **STEP 7 AI 판단**만 표시. 기존 SCM 규칙 기반 리스크를 갱신하던 UI 폴링도 제거.
- 기존 가격·수급·기상·뉴스 코드와 원본 Cloud Run 및 GitHub는 수정하지 않음.
- `liveAiAnalysisService.ts` 등 과거 코드 파일은 **아직 남아 있지만 실제 실행 경로를 끊음**. 기능 테스트 후 참조 분석을 거쳐 정리 가능.

## 윈도우 VS Code에서 확인

새 ZIP을 **별도 폴더**에 압축 해제해 사용하세요. 운영본/`RMS_V7_5_COMPLETE`는 덮어쓰지 마세요.

먼저 과거 STEP 7-2 미리보기 자료를 가져옵니다. 이 작업은 Gemini 비용이 들지 않습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\step7-integration\copy-previews.ps1 -SourceRoot "..\RMS_V7_5_COMPLETE"
```

검사 및 실행:

```powershell
npm.cmd ci
node --import tsx .\scripts\step7-integration\legacy-ai-disabled.test.mjs
node --import tsx .\scripts\step7-integration\integration-loader.test.mjs
npm.cmd run lint
npm.cmd run build
powershell -ExecutionPolicy Bypass -File .\scripts\step7-integration\run-local.ps1
```

**확인:** `http://localhost:3000` > 옥수수 > AI 분석과 SCM 조달 리스크가 이전 STEP 7 값으로 표시되는지, Market Intelligence가 그대로 표시되는지 점검하세요. 기존 3000 포트 서버는 먼저 종료하세요.

`npm ci`는 개발환경에 따라 인터넷 연결과 설치 시간이 필요합니다. `.env`와 API 키는 ZIP에 넣지 않았습니다.

## 중요: 아직 운영 배포하면 안 됨

이 소스는 **기존 AI 호출을 차단한 로컬 검증 단계**입니다. 새 STEP 1~7-2 파이프라인과 Cloud Run Job/Cloud Storage 출판을 연결하지 않았으며, 생산 Viewer의 `/api/ai-analysis` 경로는 아직 신규 분석을 제공할 수 없습니다. 그대로 GitHub main에 올려 재배포하면 운영 분석이 중단되거나 공개 번들 생성이 실패할 수 있습니다.

운영 전환 전에 별도 작업 필수: 신규 STEP1~7-2의 안전한 Job 실행/예산 통제, 자료 검증과 Cloud Storage 출판 계약, 운영 Viewer 읽기, 실패 시 직전 검증 보고서 유지, 8품목 확인 및 0%-트래픽 리비전 시험.

**비용 주의:** 로컬 미리보기 화면 조회는 유료 Gemini 호출을 하지 않지만, Market Intelligence의 승인된 **예약 뉴스 갱신**은 별도로 유료 API를 사용할 수 있습니다. 이 로컬 실행 스크립트는 스케줄러를 꺼 두므로 예약 뉴스 갱신이 발생하지 않습니다. 신규 STEP CLI를 명시적으로 `--run-paid` 실행할 때만 별도 비용이 발생할 수 있습니다.
