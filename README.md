# RMS 기존 AI 분석 엔진 정리 (로컬 테스트용)

현재 작업 폴더는 **`RMS_STEP7_기존AI중단_로컬테스트`** (안쪽, `package.json`이 있는 폴더)입니다.

이번 패치는 **기존 Gemini 시장분석의 전용 소스 14개와 옛 미리보기 전환 스크립트 1개**와 해당 엔진만을 전제로 작성된 **오래된 테스트 파일**을 삭제하고, `stage3DailyUpdates.ts`의 과거 단독실행/복구 상태 조회를 `retired`로 바꿉니다. 모든 삭제 파일은 `.rms-research-patches/backup/legacy-ai-cleanup-<timestamp>`에 복사하고 나서 삭제합니다.

**절대 삭제하지 않는 것:** 신규 STEP 1~7-2 코드·저장된 소맥 등 분석 결과, Market Intelligence 구현 및 뉴스 데이터, 기준시세, 그래프, 수급, 기상, 오전 9시 NEWS 자동 갱신 로직, Cloud Run 설정. 공유되는 기존 `analysisEvidence` 및 뉴스 판단용 `analysisArticleEvidence`, `analysisPublicationQuality`, 기타 공통 유틸리티는 유지됩니다.

주의: **이건 코드 정리이며 Cloud Run 자동 갱신 연결은 여전히 미구현입니다.** 실제 운영 배포 금지. `src/server/geminiApi.ts`는 뉴스·가격 관련 API도 있어 삭제하지 않았습니다. 구형 SCM 계산 코드도 다른 데이터 API에서 참조하므로 무작정 제거하지 않았으며 화면 표시에서는 신규 STEP7만 사용합니다. 삭제된 과거 AI 엔진 테스트는 백업에 남고, 테스트 커버리지에서 제외됩니다.

## PowerShell에서 실행

ZIP을 현재 프로젝트의 `package.json`과 같은 위치에 두고 압축 해제합니다.

```powershell
Expand-Archive -LiteralPath '.\RMS_OLD_AI_CLEANUP.zip' -DestinationPath '.' -Force
node .\RMS_OLD_AI_CLEANUP.mjs --check-only
node .\RMS_OLD_AI_CLEANUP.mjs
npm.cmd run lint
npm.cmd run build
node .\scripts\step7-integration\integration-check.mjs
```

안전장치: 프로젝트 루트 및 모든 삭제 대상 파일 내용의 SHA-256을 확인하고 수정된 파일이 있으면 **작업 전체 중단**합니다. 데이터 폴더/환경파일/GitHub/Cloud Run은 변경하지 않습니다. 재실행해도 이미 삭제된 파일은 다시 삭제하지 않습니다.

주의: 본 패치는 업로드된 통합본에서 만들어졌으며, 사용자의 VS Code에서 이미 적용한 다른 수정을 알 수 없습니다. 호환성 실패 시 파일 삭제를 하지 않고 중단하므로 오류 전문을 공유해주세요. 코드 오류가 발생하더라도 기존 V7.5와 운영 Cloud Run에는 영향이 없습니다.
