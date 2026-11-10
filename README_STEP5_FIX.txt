RMS STEP5 cautions 오프라인 복구 패치
===================================
적용 대상: 현재 VS Code의 'RMS_STEP7_기존AI중단_로컬테스트' 프로젝트 루트.

1. 이 ZIP을 package.json이 있는 폴더에 놓고 압축 해제:
   Expand-Archive -LiteralPath ".\RMS_STEP5_CAUTIONS_RECOVERY_FIX.zip" -DestinationPath "." -Force

2. 패치 호환성 확인 및 적용:
   node .\RMS_STEP5_CAUTIONS_RECOVERY_FIX.mjs --check-only
   node .\RMS_STEP5_CAUTIONS_RECOVERY_FIX.mjs

3. 재검사 (비용 0원):
   npm.cmd run lint
   node --test .\scripts\soybean-rebuild\step5-decision-offline-recover.test.mjs
   node .\scripts\soybean-rebuild\step5-decision-offline-recover.mjs --commodity wheat --inspect

4. inspect가 'Parsed Gemini raw JSON: valid'가 되고, 결정/남은 공백/출처 감사가 타당하면:
   node .\scripts\soybean-rebuild\step5-decision-offline-recover.mjs --commodity wheat --apply-reviewed
   node .\scripts\soybean-rebuild\research-verified-runner.mjs --commodity wheat --preview

이후 기존 체크포인트에서 추가 실행하려면 Gemini 호출 비용이 생길 수 있음.
주의: 원본 JSON을 저장했더라도 실제 Gemini 응답의 cautions 형식을 여기서 볼 수 없어,
      문자열이나 여러 문자열 필드로 구성된 cautions 객체만 보정함.
      JSON 자체 문법 오류, 숫자/중첩 객체, 출처 ID 불일치, 'uncertain' 판단 등은 자동 통과시키지 않음.
      inspect가 여전히 NOT RECOVERABLE이라면 출력된 'Cautions field types'만 공유하면 됨.
      코드는 기존 Market Intelligence 및 Cloud Run 운영 자원을 변경하지 않음.
