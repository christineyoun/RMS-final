# RMS 운영본 + STEP 1~7-2 로컬 통합 검증판 (운영 배포 금지)

**기준:** 실제 운영 GitHub commit `e7788ecad3e19a766a4b387ce994294bb9b88009`.

## 구현 범위
- 원본 운영본의 기존 시세/수급/기상/Market Intelligence/Cloud Run 배포 코드는 보존.
- 로컬에서 `RMS_STEP7_LOCAL_PREVIEW=1` 활성화 시 GET `/api/ai-analysis/:commodity`는 STEP7-2 preview receipt만 반환.
- 미생성/검증불량 preview는 503. 기존 AI Gemini 분석으로 절대 대체하지 않음.
- SCM 조달 리스크 등급/설명/근거는 STEP7-2 `procurementRiskPreview`만 사용. 미생성 시 `갱신 대기`.
- 기존 'standalone-analysis' 제어 API는 로컬 미리보기 모드에서 차단.
- 신규 STEP1~7-2 연구 스크립트 전체를 복사했으나, **연구 결과(숨김 폴더)는 ZIP에 포함되지 않음**.

## 1. 기존 로컬 테스트 데이터를 이 폴더에 복사하기 (Gemini 호출 없음)
PowerShell에서 **이 새 폴더**로 이동한 뒤:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\step7-integration\copy-previews.ps1 -SourceRoot "C:\Users\User\OneDrive - 중앙대학교\바탕 화면\RMS\RMS_V7_5_COMPLETE"
```

STEP7-2를 만들었던 품목만 `COPIED`, 아직 없는 품목은 `SKIP`으로 출력됨.

주의: `scripts/soybean-rebuild` 안의 기존 `*-install.*` 스크립트는 과거 패치 설치용이므로 이 통합본에서 다시 실행하지 마세요.

## 2. 실행 및 검사
```powershell
npm.cmd ci
node .\scripts\step7-integration\integration-check.mjs
npm.cmd run lint
npm.cmd run build
$env:RMS_STEP7_LOCAL_PREVIEW='1'
npm.cmd run dev
```
브라우저 `http://localhost:3000`에서 확인: AI 전망, 구매 전략, 상승/하락, 모니터링, **SCM 조달 리스크**.
원래 서버가 포트 3000에서 실행되고 있으면 먼저 종료. 기존 서버의 `.env`를 통째로 복사하지 말고 필요한 비밀 값만 로컬에서 별도 관리.

## 3. 주의: GitHub/Cloud Run 배포 전 남은 작업
**현재는 로컬 검증판. GitHub main에 올리거나 Cloud Run에 배포하면 안 됨.**
원본 STEP7 runner와 STEP7-1/7-2는 `NODE_ENV=production`, `K_SERVICE`, `CLOUD_RUN_JOB`를 거부하고,
STEP7-2 receipt에는 `approvedForCloudPublication:false`가 명시되어 있음.
따라서 현재 원래의 `rms-free-refresh`에 이 runner를 호출하는 것만으로 운영 분석이 갱신되지 않음.
운영 배포 전 별도 구현/확인 항목:
1. 전용 비공개 Cloud Run Job에서 STEP1~7-1을 실행하도록 시간/횟수/예산/인증/중복 실행 제어.
2. STEP7-2의 로컬 테스트 receipt를 **운영용 검증·승인된 출판 데이터 계약**으로 분리. 연구 근거·동일 품목·요청 ID 검증.
3. 기존 Cloud Storage 상태 및 출판 포인터를 원자적으로 갱신하고 `rms-viewer`의 Saved API 라우트에서 읽게 연결.
4. 기존 `scheduledAi.ts`의 유료 AI `analysis` 단계를 중복 과금되지 않게 종료(뉴스 단계 유지).
5. 8품목 모두 실 데이터로 검증하고, 별도 리비전 트래픽 0% 테스트 후 전환.
6. API 키는 Secret Manager에서 비공개 Job에만 주입, `rms-viewer`에는 주입 금지.

이 ZIP은 **운영 배포 완료본이 아니라 운영 소스 기준 안전한 로컬 STEP7 연결본**임.
