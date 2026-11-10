# RMS 프로젝트 통합 인수인계 보고서 — 2026-11-02

이 문서는 인수인계용 분할 문서를 하나로 합친 버전입니다. **실제 최신 소스코드는 사용자 PC에 있으므로 별도로 압축해 공유해야 합니다.**



================================================================================

# RMS 개발 인수인계 — 2026-11-02 기준

> **이 자료는 2026-11-02까지 대화에서 확인된 실행 로그와 패치 적용 기록을 정리한 문서입니다.**
> **완전히 수정된 최신 소스코드 자체는 사용자의 Windows 로컬 작업 폴더에 있습니다.** 이 ZIP만으로는 앱을 빌드하거나 현재 체크포인트를 복구할 수 없습니다.

## 30초 요약

**최종 목표:** 기존 RMS에서 정상 운영하던 **기준시세·가격 그래프·글로벌 수급·산지/기상·Market Intelligence** 갱신 방식은 **그대로** 유지하면서, **RMS AI 시장분석·구매전략과 SCM 조달 리스크**만 신규 **STEP 1~7 → STEP 7-1 → STEP 7-2** 분석으로 교체한다. 평일 **09:00 KST** 기존 Cloud Run 자동 갱신에서 **8품목 모두 한 번에 실행**하고, 검증된 결과를 기존 출판 경로로 운영 화면에 표시한다. 실패한 품목은 **마지막 성공 결과 유지**.

**오늘 현재:** 자동 갱신 코드 통합 패치 적용, `lint`/`build` 성공, **로컬 대두유 1품목의 시세·기상·MI·STEP을 한 번에 실행하는 시험**까지 진행. 다만 **완료되지 않음**: 대두유 STEP 5 추가 검색에서 중단, MI 신규 기사 승인 0건, 글로벌 수급은 USDA 키 부재로 과거 자료 유지, 최종 대두유 카드 미생성. 실제 Cloud Run 운영 자동 갱신은 **아직 배포·실행 검증하지 않음**.

**가장 먼저 할 일:** 최신 코드 + 필요한 체크포인트를 인수받은 뒤, 2026-11-02 대두유 STEP 5의 `reserved-before-call` 기록을 보존하면서 **STEP 5만 안전하게 복구**한다. 전체 RMS 갱신이나 STEP 1~4를 다시 돌리지 않는다. 이후 한 품목 전체 실행이 성공하면 8품목/Cloud Run 검증으로 확장한다.

## 친구에게 전달할 파일

1. **이 ZIP:** 상세 현황·설계·작업 순서·검증 명령어·안전한 소스 ZIP 생성 도구.
2. **별도 생성할 최신 코드 ZIP:** 사용자 컴퓨터의 `RMS_STEP7_기존AI중단_로컬테스트` 작업 폴더에서 `RMS_친구전달용_코드압축.ps1`로 만든 파일. 이 파일이 실제 최신 작업물이다.
3. **선택 사항 — 대두유 체크포인트 ZIP:** 이미 완료한 STEP 1~4를 그대로 이어받으려면 필요. 데이터/권한 검토 후에만 `-IncludeSoybeanOilCheckpoint` 스위치를 이용한다. 이 옵션은 연구 자료와 호출 기록을 포함하므로 공유 전 검토 필요.

## 절대로 혼동하지 말 것

- **로컬 테스트 통과 ≠ Cloud Run 오전 9시 운영 갱신 완료.** 현재 유료 운영 실행은 기본 OFF.
- **저장된 STEP 7-2 로컬 카드 생성 ≠ Cloud Storage로 출판 완료.**
- **`reserved-before-call` ≠ Gemini 호출 성공/과금 확정.** 해당 마커를 임의로 삭제하지 말 것.
- 기존 시세/Market Intelligence 내부 코드는 **개조하거나 새로운 STEP 검색으로 대체하지 말 것**.
- 10만 원은 엄격한 월 차단 상한이 아님. 기존 STEP별 토큰·호출 제한, 중복 호출·폭주 방지는 유지.
- 과거 패치 ZIP들을 최신 프로젝트에 **무작정 재적용하지 말 것**. 이미 반영된 상태에서 재적용하면 충돌 가능.
- 이 문서에는 API 키·비밀번호가 포함되지 않는다. 친구에게 공유하기 전 실제 코드·데이터의 회사 기밀 및 비밀정보 포함 여부는 직접 점검할 것.

## 목차

- `01_프로젝트_최종목표와_원칙.md`: 요구사항, 구조, 불변 조건
- `02_진행상황_상세_타임라인.md`: 구현·검증·수정 내역과 남은 점
- `03_현재_대두유_실행결과와_오류.md`: 11/2 단일품목 통합실행의 실제 결과
- `04_앞으로_진행순서_실행계획.md`: 1품목 복구 → 전체 통합 → Cloud Run 순서
- `05_코드경로_명령어_검증가이드.md`: 파일별 역할·명령·합격 기준
- `06_전달방법과_보안_주의사항.md`: 로컬 최신 소스와 체크포인트 압축·공유 방법
- `RMS_친구전달용_코드압축.ps1`: **실제 최신 작업 폴더**를 ZIP으로 압축하는 도구
- `참고_복구도구/RMS_SOYBEAN_OIL_STEP5_RECOVERY.zip`: **미적용** 대두유 STEP 5 1회 재시도 보조도구. 본문 검토 없이 실행 금지.

**자료 작성시점:** 2026-11-02 (KST). **검증 근거:** 채팅에 사용자가 올린 PowerShell 실행 로그. 일부 소스 변경 사항은 이전 생성 패치의 구현/검사 로그 근거이며 실제 배포 성공은 확인되지 않았다.


================================================================================

# RMS 목표·설계·변경 금지 원칙

## 1. RMS란?

원자재 시장정보/구매 의사결정 지원 플랫폼. 화면에는 가격 시계열, 글로벌 수급, 산지/기상, Market Intelligence 뉴스, RMS AI 시장 전망·구매전략, SCM 조달 리스크, 보고서 등이 있다.

**대상 8품목:** 소맥(`wheat`), 옥수수(`corn`), 대두(`soybean`), 대두유(`soybean-oil`), 팜유(`palm-oil`), 설탕·원당(`sugar`), 감자전분(`potato-starch`), 타피오카전분(`tapioca-starch`).

## 2. 사용자 최우선 요구사항

**"기존에 정상 갱신되던 시세·수급·기상·Market Intelligence는 바꾸지 말 것. RMS AI 시장분석·구매전략과 SCM 조달 리스크만 신규 STEP 분석으로 교체할 것. 기존 갱신과 신규 STEP을 평일 오전 9시 한 번에 업데이트할 것."**

이 요구사항은 여러 차례 확인됐다. 특히 뉴스 검색·제목·요약·원문 링크를 제공하는 **기존 Market Intelligence 방식 유지**가 중요하다. STEP 1~7의 기사·자료 검색은 AI 시장분석용이며, **Market Intelligence를 대체하는 기능이 아니다.**

## 3. 최종 실행 흐름

```text
[기존 Cloud Scheduler — 평일 09:00 KST]
                 |
                 v
[기존 Cloud Run Job / 기존 데이터 갱신 흐름]
     1. 기준시세, 그래프, 글로벌 수급, 산지/기상 수집 — 기존 코드 그대로
     2. Market Intelligence 뉴스 갱신 및 검증 — 기존 코드 그대로
     3. 신규 STEP 1~7 분석 — 8품목, 날짜별 새로운 실행
     4. STEP 7-1 사실검증 및 가능한 보수적 수정
     5. STEP 7-2 최종 RMS 카드 생성/검증
     6. 승인된 새 결과를 RMS 운영용 저장 데이터에 반영
        (품목별 실패 시 마지막 정상 카드 유지)
     7. 기존 Google Cloud Storage publication 경로로 출판
                 |
                 v
[RMS 운영 Viewer]
     가격·기상·수급: 기존 데이터
     Market Intelligence: 기존 뉴스 데이터
     AI 시장 전망·구매전략: STEP 결과
     SCM 조달 리스크: STEP 결과
```

**기존 가격/MI를 STEP 검색으로 통합하거나 새 파이프라인으로 교체하는 것은 금지.**

## 4. STEP 상세 역할

| 단계 | 역할 | 지켜야 할 점 |
|---|---|---|
| STEP 1 | Gemini/검색 기반 최초 자료 수집 | A급·원문 출처, 날짜, 수치의 추적성 |
| STEP 2 | 수집 출처 평가·등급화 | 약한 자료를 근거처럼 단정하지 않음 |
| STEP 3 | 사실·수치 레코드와 근거 정리 | 출처·기간·단위 매칭 |
| STEP 4 | 시장 분석 및 추가 검색 필요성 판단 | 추측을 확정 사실로 표시하지 않음 |
| STEP 5 | 부족한 근거 추가 검색·검증·판단 | 자료가 충분하면 중단 결정 가능 |
| STEP 6 | 필요한 경우 2차 추가 검색 | 불필요하면 생략 |
| STEP 7 | 최종 시장 보고서·구매전략·리스크 생성 | 원문 근거·품목 일치 |
| STEP 7-1 | 오류 탐지, 직접 수정, 잔여 위험 표시 | `best-effort-v2`; 근거없는 수치 발명 금지 |
| STEP 7-2 | RMS가 읽는 최종 결과 카드 생성 | 출처/품목/안전 검사; 로컬/운영 출판 경로 구분 |

**STEP 7-1 `best-effort-v2` 정책:** AI reviewer가 실패하거나 응답이 잘리더라도 가능한 오류를 보수적으로 수정하고, `review-incomplete`를 표시한 채 **출처·데이터 무결성이 안전하면** STEP 7-2로 보낼 수 있다. 반대로 출처 ID가 가짜거나 참조를 입증할 수 없는 수치를 날조하는 경우에는 무조건 통과시키지 않는다. 기존 검증 강도를 무작정 약화하지 않는다.

## 5. 비용·실행 정책

- 사용자는 **월 10만 원 초과도 허용**한다고 밝혔음. **10만 원 초과를 이유로 작업을 자동 중단하지 말 것**(기존 사업/계정 정책은 별도 확인).
- 기존 STEP별 입력/출력 토큰 및 호출·재시도 한도 유지. 로컬 통합 시험에서는 STEP 1~7 최대 6회, 7-1 검증 최대 1회 정도의 실행 구성으로 테스트했다. 실제 상한은 최신 코드로 재확인할 것.
- **중복 호출/무한 재시도는 금지.** 단계별 사전 예약 마커와 날짜별 체크포인트를 존중.
- 실패 시 품목별 마지막 성공 카드 보존. 오류를 무조건 `success`로 처리하지 않는다.
- AI reviewer의 `MAX_TOKENS` 대응으로 추론 수준을 함부로 LOW로 고정하지 않는다. 우선 best-effort 복구 처리 확인; 필요시 검증 호출만 분리·재시도 전략 검토.

## 6. 운영 환경·보안

- 기존 운영 GCP 프로젝트: `project-c4b2c3a4-9536-4898-bb3` (채팅 기록상; 변경 전 `gcloud`로 확인).
- 지역 `asia-northeast3`, 실제 Viewer 서비스는 `rms-viewer`였음. `rms-final` 이름의 다른 서비스와 혼동 금지.
- 기존 관련 Job: `rms-free-refresh` (정확한 현재 스케줄/이미지는 Cloud Shell에서 조회 재확인).
- 기존 맞춤 URL: `https://nongshim-rms.cloud.run` (운영 접근 권한 및 현재 도메인은 실제 환경에서 확인).
- Cloud Run **public viewer**에 Gemini API 키나 유료 Job 승인 변수를 넣지 말고 **private Job**에서 Secret Manager 등으로 제공.
- 기존 가격·MI 갱신 코드 파일 변경 금지. 변경 불가피 시 사유, diff, 회귀테스트, 사용자 승인 필요.


================================================================================

# 개발 진행 상황 — 실제 로그와 패치 적용 이력

## 0. 소스 선택과 기반

- GitHub `jihyeeeeee/RMS-final`, 2026-10-27 운영 커밋 `e7788ecad3e19a766a4b387ce994294bb9b88009` 기준 코드를 출발점으로 삼음(이전에 Cloud Build 실제 이미지로 확인했다고 보고됨).
- 별도 `RMS-final-main (5).zip`(친구 수정본) 전체 변경 사항은 **통합하지 않기로 결정**. 친구 코드를 무조건 덮어쓰거나 섞지 않는다.
- STEP 연구 파이프라인을 기존 운영 코드에 합친 작업 폴더:
  `...\RMS\RMS_운영본_STEP7_기존AI중단_로컬테스트\RMS_STEP7_기존AI중단_로컬테스트`
- 최신 소스의 정본은 위 **사용자 PC 폴더**. 과거 공유 ZIP/패치 ZIP은 최신 소스의 정확한 복제본이 아님.

## 1. STEP UI 연동 및 레거시 AI 정리 (2026-10-31~11-01)

- STEP 7 결과를 RMS 시장분석·구매전략 카드에 표시하도록 통합.
- STEP 7의 `procurementRisk`를 SCM 조달 리스크에 표시하도록 통합. 이전에 생성한 일부 STEP 7 결과(예: 대두 10/30~10/31)에는 이 필드가 없음. **과거 결과에 없는 필드를 강제로 검증 성공으로 꾸미지 않음.**
- 구 Gemini 레거시 분석 전용 코드 52개 정리. 기존 Market Intelligence는 유지. 테스트와 `lint`/`build` 통과 보고.
- 기존 `stage3DailyUpdates.ts`는 레거시 AI 정리 중 이미 수정했음. 따라서 구버전 전체 통합 ZIP은 SHA 불일치로 적용 거부됐고, 수정 ZIP으로 교체함.

## 2. STEP 7-1 `best-effort-v2` 정리

- STEP 7-1에서 검토만 하지 말고 가능하면 **직접 문구 수정**하도록 변경. 검증 불가 시 `review-incomplete` 유지, 위험 문구 보수적 수정.
- 팜유 2026-11-02 분석: STEP 1~7 보고서 저장 후 `report-review-needed` 상태.
- 검증 `gemini-3.8-flash`: `finishReason=MAX_TOKENS`, `promptTokenCount=10342`, `thoughtsTokenCount=15358`, `candidatesTokenCount=635`, 합계 `totalTokenCount=26335`. STEP 7-1 출력 한도 16000에서 추론 토큰을 대부분 소모해 JSON이 잘림.
- 보수적 수정 패치 적용 후 STEP 7-1 2건 수정, `review-incomplete`, `ReviewComplete=False` 상태임에도 안전한 STEP 7-2 **로컬 카드 생성 성공**. `validatedLocalCard(...,'palm-oil') = true` 확인.
- 오래된 `inspect()`는 STEP 7 원본 상태만 보고 `stop`을 계속 반환할 수 있음. **실제 완료 확인은 STEP 7-1/7-2 최종 카드 검증 함수 기준.**

## 3. 오전 9시 갱신 호출부에 STEP 단계 연결 (11/01~11/02)

1. `RMS_STEP7_AUTO_PHASE1_SAFE_HOOK` : `scripts/cloud/publication.ts`의 기존 무료/뉴스 갱신 뒤에 STEP 훅 추가. 기본 OFF.
2. `RMS_STEP7_AUTO_PHASE2_RUNNER_LINK` : 8품목 STEP runner 조회 모드 연결. API 호출 0건.
3. `RMS_STEP7_AUTO_PHASE3_DAILY_FRESHNESS` : 날짜별 분석 경로 분리(수동 분석·과거 체크포인트 보존). Windows 검증 스크립트 `C:` import 경로 버그 보정; 8개 품목 모두 새 날짜에 `execute step1` 확인.
4. `RMS_STEP7_AUTO_PHASE4_LOCAL_PAID_LINK` : 선택된 1개 품목만 `paid-local` 모드에서 유료 STEP 실행 가능. 기본 OFF, Cloud Run 실행은 차단했던 단계.
5. `RMS_STEP7_BEST_EFFORT_FIX` : STEP 7-1→7-2 `review-incomplete` 합의 정책 정렬. 관련 테스트 통과. ZIP payload 폴더 때문에 TS 검사에 오류가 났다가 임시 폴더 삭제 후 통과.
6. `RMS_STEP7_FULL_AUTO_INTEGRATION_FIXED` : 기존 시세/MI 갱신 코드 유지, STEP 예약 호출·품목별 결과 저장/Cloud 출판 경로 추가. 이전 ZIP은 `stage3DailyUpdates.ts` 버전 충돌로 적용 실패, **FIXED판은 13개 파일 적용 성공**.
7. 이 과정에서 `step7-fact-review.ts`의 일반 함수 내부 `await import()` 버그를 수동으로 고쳤고, `scheduledStep7.ts`에서 `paid-cloud` 모드에서도 API 키를 하위 실행기에 전달하도록 수동 보정함.
8. 위 후 `npm.cmd run lint`, `npm.cmd run build` 통과. `vite` 500kB chunk 경고는 빌드 실패가 아님.

**주의:** 패치 검증 스크립트 중 일부는 설치 시점의 SHA-256 해시를 확인한다. 이후 수동으로 고친 두 파일 때문에, 예전 `...VERIFY.mjs`를 다시 실행하면 해시만 달라 실패할 수 있다. 그런 경우 무조건 덮어쓰거나 강제 통과시키지 말고 실제 diff를 확인할 것.

## 4. 전체 갱신을 통한 한 품목 테스트 (11/02)

- 최초 `RMS_LOCAL_FULL_REFRESH_SOYBEAN_OIL.mjs --check-only`는 **STEP만 대두유, 기존 시세/MI는 8품목**이므로 사용자 요구와 맞지 않았음.
- 최종 선택한 단일품목 실험 도구는 **`RMS_LOCAL_SOYBEAN_OIL_ONLY.mjs`**.
- `--check-only`로 대두유 관련 무료 갱신 작업 네 개 + 대두유 전용 MI + 대두유 STEP이 선택되고, Cloud Storage 미사용임을 확인.
- `--run` 실행 로그에서 다음 순서가 실제 호출됨: **대두유 무료 시세/수급/산지/뉴스 → 대두유 MI → 대두유 STEP → 로컬 결과**.
- 실제 결과는 `03_현재_대두유_실행결과와_오류.md` 참조. **통합 호출 경로가 동작한 것과 신규 데이터가 성공적으로 채택된 것은 별개의 문제.**

## 5. 구 AI 테스트와 오류 기록 정리

- `scheduledRefreshIsolation.test.ts`의 옛 기대값은 구 `analysis-wheat`가 교체되는 것을 요구했으나, 새 정책에서는 구 AI 분석이 OFF. 테스트의 기대값만 수정한 뒤 `pass 1/fail 0`.
- `RMS_STEP7_ERROR_DIAGNOSTICS` 패치 적용: `scripts/cloud/step7PaidLocalWorker.mjs`, `scripts/cloud/scheduledStep7.ts` 두 파일 변경. 기존 가격/MI 및 STEP 코어 수정 없음. `npm.cmd run lint` 통과.
- 새 오류 진단은 **적용 이후의 실패만 추적**하며, 대두유 STEP 5에서 이미 발생한 과거 오류 메시지를 되살릴 수 없음.

## 6. 완료 / 미완료를 혼동하지 말 것

| 영역 | 현재 판단 | 근거/제한 |
|---|---|---|
| 로컬 STEP 연구 및 화면 표시 | 구현·테스트됨 | 팜유 STEP 7-2 로컬 카드, 기존 다른 품목 로컬 미리보기 |
| 기존 가격·기상·MI 코드를 건드리지 않는 연동 | 코드 검증됨 | 보호 파일 해시·함수 순서 검사, 런타임 전체 성공과 구분 |
| 대두유 단일품목 전체 갱신 호출 | **실제로 실행됨** | 11/02 로그. 데이터 수용은 부분 성공 |
| 대두유 STEP 분석 완료 | **미완료** | STEP 5 결과 없음, 새 카드 미생성 |
| 대두유 MI 신규 기사 | **미완료** | accepted 0, 기존 기사 보존 |
| 대두유 USDA 수급 | **미완료** | API 키 unavailable, 기존 자료 보존 |
| 8품목 통합 실제 갱신 | **미검증** | 아직 8개 품목 전체 run 성공 로그 없음 |
| Cloud Run 09:00 live Job | **미배포·미검증** | 코드 패치 default OFF, 실제 Job 설정·실행은 필요 |
| Cloud Storage production publication | **실환경 미검증** | 모의 테스트 통과, 실제 버킷 갱신 없음 |

## 7. 최근 확인된 가장 마지막 이벤트

- `RMS_STEP7_ERROR_INSPECT.mjs --commodity soybean-oil --day 2026-11-02`: STEP 1/2/3/4 각 1, STEP 5/7/7-1/7-2 = 0. 예약 마커 step1, step4, step5search 각 `reserved-before-call`. 신규 진단 없음(패치 설치 전 오류).
- `npm.cmd run lint`: **통과**.
- `RMS_SOYBEAN_OIL_STEP5_RECOVERY.zip`: **제공은 됐지만 사용자 적용·사전검사·실제 유료 1회 재시도 결과는 아직 보고되지 않음.**


================================================================================

# 2026-11-02 대두유 단일품목 통합 갱신: 실제 결과·오류

**실제 사용한 명령어**

```powershell
node --import tsx .\RMS_LOCAL_SOYBEAN_OIL_ONLY.mjs --run
```

실행 전 체크:

```text
KST: 2026-11-02 Mon 13:00
original free-source jobs: soybean-oil-history, soybean-oil-world, origin-soybean-oil, soybean-oil-news
original Market Intelligence NEWS: soybean-oil ONLY (scoped temporary module)
STEP1~7-2: soybean-oil ONLY, original token/paid call limits
shared overview FX/energy/freight jobs: SKIPPED
Cloud Storage and Cloud Run: NOT USED
Gemini key: YES
```

실행 최종 결과(JSON 중 주요 항목):

```json
{
  "day": "2026-11-02",
  "sourceStatus": "partial",
  "sourceJobs": [
    {"key":"soybean-oil-world","status":"retained-old-data","error":"USDA API key unavailable"},
    {"key":"soybean-oil-history","status":"success","error":null},
    {"key":"origin-soybean-oil","status":"success","error":null},
    {"key":"soybean-oil-news","status":"retained-old-data","error":"Original headline/date/canonical/claim passages failed validation"}
  ],
  "miAttempts": 1,
  "miAccepted": [],
  "miPhase": {"status":"retained-previous","reason":"generation-or-evidence-validation"},
  "step7": {
    "status":"retained-previous",
    "results":[{"commodity":"soybean-oil","action":"stop","stage":"step5search","paidCalls":3,"code":0}],
    "reason":"local-paid-local-executed-no-cloud-publication"
  },
  "cardUpdated":false,
  "cloudPublication":false
}
```

## 핵심 판정

**전체 호출 순서가 실제로 실행됐다는 점은 확인.** 그러나 **대두유 전체 데이터 갱신 성공은 아님**. 가격 이력·산지는 성공했지만 USDA 수급·기사·MI·STEP 7-2는 새로 채택되지 않았음.

| 영역 | 결과 | 해야 할 점 |
|---|---|---|
| 대두유 가격 이력 `soybean-oil-history` | 성공 | UI 시세 표시·수치·갱신 시각 확인 |
| 대두유 글로벌 수급 `soybean-oil-world` | 기존 자료 유지 | `USDA API key unavailable` 원인 확인, 키 구성·권한(값 노출 금지) |
| 대두유 산지 `origin-soybean-oil` | 성공 | 데이터 기준시점·갱신 시각 검증 |
| 대두유 별도 뉴스 소스 `soybean-oil-news` | 기존 자료 유지 | 기사 제목·날짜·canonical URL·claim passage 검증 실패 이유 확인 |
| Market Intelligence 예약 뉴스 | 1회 시도, 0건 승인 | 기존 뉴스 검증 코드 변경 없이 실패 사유·입력 근거 확인 |
| STEP 연구 | 3개 유료 호출 예약 기록, STEP 5에서 stop | STEP 1~4 유지, STEP 5만 안전하게 복구 |
| STEP 최종 카드 | `cardUpdated:false` | STEP 5 이후 완료 확인 후 재승격 |
| Cloud Run/Cloud Storage | 실행/변경 없음 | 운영 배포 전 로컬 통합 완료 필요 |

**MI의 `estimatedUsd:0.32`는 로그의 추정치로 실제 청구액이 아님.** STEP `paidCalls:3`도 예약/시도 기록 수이지 실제 청구 횟수의 확정값은 아님.

## STEP 5 상태 상세

```json
{
  "dir": ".rms-research/soybean-oil/daily/2026-11-02",
  "progress": ["step1: ...json", "step2: ...json", "step3: ...json", "step4: ...json"],
  "action": "execute",
  "stage": "step5search",
  "reason": "AI-chosen first follow-up Google search",
  "paid": true
}
```

- STEP 4 입력 근거는 존재함: `existingFindings: 6`, `gapLeads: 3`, `promptLength: 2433`자.
- `step5-round1-search-*.json` 파일 없음.
- `.rms-research-runner/soybean-oil/daily/2026-11-02/paid-step5search.json` 예약 기록 존재:
  - `stage: step5search`
  - `status: reserved-before-call`
  - `createdAt: 2026-11-02T04:21:06.794Z`
- STEP 1/STEP 4 예약 마커도 존재. STEP 1~4 출력은 실제 파일로 존재함.
- `RMS_STEP7_ERROR_INSPECT.mjs` 결과 `diagnostic: null`, `historicalErrorKnown: false`.
- 과거 STEP 5 하위 프로그램 stdout/stderr가 저장되지 않아, **실패 원인은 확정할 수 없음**. 모델 오류/네트워크/검색 groundings/저장 실패 등을 단정하지 말 것.

## 바로 다음 작업 — STEP 5 최소 복구

1. `RMS_SOYBEAN_OIL_STEP5_RECOVERY.zip`을 사용자 프로젝트 폴더에 압축해제한다(이 자료 ZIP의 `참고_복구도구`에 포함).
2. `node .\RMS_SOYBEAN_OIL_STEP5_RECOVERY.mjs --check-only`를 **먼저** 실행. 비용 0원, 쓰기 0건.
3. 사전검사 통과 여부·기존 예약 기록·날짜별 체크포인트 내용을 검토한다. 사용자의 **명시적 승인**이 있을 때만 `--retry-once --approve-paid`를 실행. **유료 호출 최대 1회 가능**; 원본 예약 기록은 삭제하지 않음.
4. 새 STEP 5 출력 파일 및 검사 결과가 정상인지 확인. 실패 시 진단 코드를 확인하고 **반복 호출 금지**.
5. STEP 5가 성공하면 기존 runner로 STEP 5 판정 → 필요시 6 → STEP 7 → 7-1 → 7-2를 이어서 실행하되, **해당 단계에 유료 호출이 발생하는지 별도 승인·제한 확인**.
6. 최종 `validatedLocalCard` 및 Viewer의 대두유 시장분석/조달 리스크 데이터를 확인. 오래된 결과가 표시되지 않도록 출처·발행일·run day 검사.

**참고:** `RMS_SOYBEAN_OIL_STEP5_RECOVERY.mjs`는 특정 날짜 `2026-11-02`와 품목 `soybean-oil`에만 적용된다. 사용자에게 제공만 됐으며, 실행 성공 이력은 아직 없다. `STEP 5 성공 시 자동으로 나머지 단계를 완료하는 도구`가 아니다.

## 오류 진단 패치 적용 이후 확인할 것

```powershell
node .\RMS_STEP7_ERROR_INSPECT.mjs --commodity soybean-oil --day 2026-11-02
```

**주의:** 같은 날 기존 STEP 5 시도에서는 진단 기능 설치 전이어서 `diagnostic:null`이 정상적인 한계다. 진단 기록이 없다고 과금이 없었다고 결론내리지 않는다.


================================================================================

# 친구가 이어서 진행할 실행 계획 (우선순위 순)

## 원칙: 한 번에 하나의 문제, 완료 기준 명확하게

**정상 운영 중인 `rms-viewer`와 기존 시세/Market Intelligence는 건드리지 않는다.** 새 코드와 실환경 검증은 로컬/격리 Job에서 실시한 뒤 배포한다. 오래된 패치 ZIP 일괄 재실행 금지.

### P0 — 최신 프로젝트와 로그 인수·스냅샷 확보

- 사용자 PC의 **최신 RMS 폴더**를 소스 ZIP으로 받아 풀고, `package.json`, `scripts/cloud/publication.ts`, `scripts/cloud/scheduledStep7.ts`, `scripts/cloud/step7PaidLocalWorker.mjs`, `scripts/soybean-rebuild/`, `src/server/` 존재 확인.
- `node_modules`는 설치 대상에서 제외(필요한 경우 프로젝트 lockfile로 `npm.cmd ci`/`npm.cmd install`); `.env`, 키, 인증자료는 별도로 승인된 안전한 경로 사용.
- 이전 분석을 이어받을 경우 **대두유 11/02 체크포인트 두 폴더**도 별도로 승인받아 인수. 디렉터리: `.rms-research/soybean-oil/daily/2026-11-02` 및 `.rms-research-runner/soybean-oil/daily/2026-11-02`.
- 작업 시작 전 원본 코드/체크포인트 읽기 전용 백업. 공유 시 사내 정보 및 API 응답 원문 포함 여부 검토.

### P1 — 대두유 STEP 5 1회 복구

**목표:** 이미 완료된 STEP 1~4를 건너뛰고 STEP 5 검색만 재개해서 실제 중단 원인과 정상 출력 여부 확인.

1. 최신 `RMS_STEP7_ERROR_INSPECT.mjs`로 단계·마커·진단 확인.
2. `RMS_SOYBEAN_OIL_STEP5_RECOVERY.mjs --check-only` 무료 사전검사.
3. 원본 예약 마커 `paid-step5search.json` 삭제·이름 변경 금지. 새 1회 재시도 기록을 **별도로** 쓰는 방식 사용.
4. 명시적 유료 승인 후 최대 1회만 재시도. 실패 시 분류된 진단·응답 finishReason 등 살피고 재호출 중단.
5. STEP 5 저장·검증 후 5판정→6(필요 시)→7→7-1→7-2 재개. 나중 단계도 실제 Gemini 비용이 발생할 수 있으므로 호출 예산/횟수 승인 확인.
6. `review-incomplete`여도 안전한 카드면 `best-effort-v2` 정책 적용, 가짜 출처·날조 수치면 승인 금지.

**P1 합격 기준:** 대두유 `step7-rms-preview-soybean-oil.json` 생성, 유효한 `validatedLocalCard(...)` 판정, 실행 기록·비용·검증 품질 확인, 카드에 분석 기준일/출처가 정상 표시됨. 실패하면 원인과 next action 문서화.

### P2 — 대두유 단일품목 전체 통합 갱신 성공

**목표:** 처음 사용자 요구처럼 **대두유 1개 품목의** 기존 가격·수급·산지/기상 + 기존 Market Intelligence + 신규 STEP 분석이 한 작업에서 모두 시도되고, 각 결과가 정상 표시되도록 확인.

- 앞서 사용한 실행기 `RMS_LOCAL_SOYBEAN_OIL_ONLY.mjs` 확인. 운영 메인 모듈에 단일품목용 임시 코드가 섞이지 않게 격리.
- 가격 이력/산지 `success`가 UI에 실제 최신값으로 반영되는지 확인.
- `USDA API key unavailable`은 정상 원인에 맞게 API 키/권한/환경변수 점검. **STEP 코드 수정과는 별도 작업**.
- 뉴스/MI `generation-or-evidence-validation` 또는 제목/날짜/원문 근거 검증 실패는 실제 증거·검증 로그로 원인을 분석. **무조건 validation OFF 금지.** 기존 뉴스 품질을 약화시키지 않고 개선.
- 전체 실행을 반복하면 MI/STEP 유료 호출이 다시 발생할 수 있음. 저장된 결과를 검사하는 무료 명령부터 사용.

**P2 합격 기준:** 각 갱신 작업을 구분한 실행 보고서, 시세·기상·뉴스·AI 카드의 출처/최신성 확인, 실패 시 이전 데이터 유지. 1개 품목의 MI 뉴스가 승인되지 않더라도 그 원인을 설명하고 운영 품질 기준을 충족하는 대안을 검토해야 함. 이 단계에서 **다른 7개 품목은 실행하지 않음**.

### P3 — 운영 출판 전 종합 회귀테스트

- `npm.cmd run lint` / `npm.cmd run build` 통과.
- `node --import tsx --test .\scripts\cloud\step7CloudPromotion.test.mjs`: 안전한 새 카드의 승격·잘못된 출처의 차단·마지막 성공 카드 보존 확인.
- `node --import tsx --test .\src\server\__tests__\scheduledRefreshIsolation.test.ts`: 기존 AI 분석은 OFF, MI 기존 동작 유지를 확인하는 변경된 테스트 기준.
- STEP 7-1/7-2 `best-effort-v2` 회귀 테스트. 팜유의 `review-incomplete` 정상 카드 인정, invalid source는 차단.
- 프로덕션 보호 파일들의 실제 `git diff` 또는 SHA 대조: 기존 price/supply/weather/MI/UI 코드가 의도치 않게 바뀌지 않았는지.
- **주의:** 과거 `RMS_STEP7_FULL_AUTO_VERIFY.mjs`는 설치 직후 파일 SHA를 고정했으므로, 이후 2건의 수동 버그 수정 때문에 이제 실패할 수 있음. 새 코드의 동작 검증과 과거 해시 검증을 혼동하지 말 것.

### P4 — Cloud Run 사전 점검, 격리 Job에서 1품목 스모크 테스트

**실환경 배포 전에만:**

1. Cloud Shell `gcloud run jobs list` / `gcloud scheduler jobs list` / 실제 Job의 이미지, env, timeout, 실행 권한, 서비스 계정, Secret Manager, GCS state/publication bucket 권한 조회. **읽기 전용부터.**
2. STEP `paid-cloud`는 승인 변수 및 private Job 환경에서만 허용. **public Viewer에 API 키·승인 변수를 설정하지 않는다.**
3. 8품목 전체 실행 시 시간이 길 수 있어 Job timeout, task memory, 컨테이너 이미지 내 STEP runner/tsx/Google SDK 의존성, 영구 파일이 아닌 GCS 체크포인트 복구를 검토.
4. 기존 무료/MI 갱신은 원본 함수/순서를 유지하고, STEP만 1품목 범위로 제한해 **격리 Job/별도 publication 경로 또는 테스트 버킷**에서 시험. 프로덕션 publication 덮어쓰기 금지.
5. Run 로그에 단계별 시작/종료/결과 및 Gemini 실패 분류가 남는지, 크래시·재실행에서 동일 유료 단계 중복 호출이 방지되는지 검증.

**P4 합격 기준:** 격리 Job에서 가격/MI → STEP → 승인 카드 → 테스트 출판 → 테스트 Viewer 조회가 실제로 모두 확인됨. 원본 RMS 운영 데이터 변경 없음.

### P5 — 8품목/실제 운영 자동 갱신 전환

- 8품목을 날짜별 새 실행으로 처리. 같은 날짜 재호출 시 기존 체크포인트를 안전하게 이어서 사용하되, 모호한 예약 마커가 있으면 자동 유료 재결제하지 않음.
- 품목별 미완료/리뷰 보류가 있어도 다른 품목의 성공 결과는 반영하고, 해당 품목은 마지막 정상값을 보존.
- 8품목 실행 총시간·API 비용·토큰·구독/API 키 권한·Job timeout을 관측. 월 10만 원은 hard stop 아님.
- 승인 후 Github main 업데이트 → Cloud Build 이미지 생성 → **실제 운영 서비스/Job 확인** → 단계적 갱신 전환. 기존 스케줄러가 09:00 KST 기준으로 실행되는지 시각 검증.
- 다음 날 자동 실행으로 시세·MI·STEP 모두 갱신된 시각/근거를 Viewer에서 교차 확인.
- 이상 발생 시 로컬 패치 덮어쓰기가 아니라 Job 새 버전 롤백/마지막 정상 publication 유지로 대응.

## 친구가 바로 다음 대화에 붙여 넣을 브리핑

> RMS 프로젝트 인수인계: 기존 시세·수급·기상·Market Intelligence는 절대 교체하지 않고, RMS AI 시장분석·구매전략·SCM 리스크만 STEP1~7/7-1/7-2로 교체하는 프로젝트. 기존 09:00 KST Cloud Run 갱신에 새 STEP을 합치는 코드 패치·lint·build 및 로컬 단일 대두유 전체 갱신 호출은 완료. 그러나 대두유 MI 신규 승인 0, USDA 수급 API 키 없음, STEP5 검색 결과 파일이 없어 STOP, STEP7-2 새 카드 미완료. `.rms-research/soybean-oil/daily/2026-11-02`의 STEP1~4 결과는 보존했고, `.rms-research-runner/.../paid-step5search.json`은 reserved-before-call 마커라 삭제 금지. 진단 패치 적용 이후 lint 통과. 다음은 최신 코드와 체크포인트로 STEP5 복구 도구 --check-only, 승인 시 STEP5만 한 번 유료 재시도. 이후 STEP7-2 완료, 단일품목 전체 통합 성공, Cloud Run 격리 1품목 테스트, 8품목 운영 자동갱신 순. 운영 Cloud Run/GCS는 아직 배포하지 않음. 기존 소스/MI/UI 무단 변경 금지.


================================================================================

# 코드 파일과 검증 명령어 가이드

## 1. 핵심 코드 경로

| 코드 경로 | 역할/주의사항 |
|---|---|
| `scripts/cloud/publication.ts` | 기존 무료·MI·STEP·overview·Cloud publication 순서 조정. 이전에 STEP 연결 추가. |
| `scripts/cloud/scheduledStep7.ts` | 예약 실행기 STEP 호출, `paid-local`/`paid-cloud` 모드, Cloud 체크포인트/카드 승격 관련 코드. **11/02 API 키 전달 조건 수동 수정**, 이후 오류 진단 패치도 반영. |
| `scripts/cloud/step7PaidLocalWorker.mjs` | STEP 날짜별/품목별 실제 실행, 완료 판정과 오류 기록. **11/02 오류 진단 패치 적용됨.** |
| `scripts/cloud/step7ScheduledProbe.mjs` | STEP 8품목 읽기 전용 조회. 실제 유료/시세/MI 동시 갱신 검증이 아님. |
| `scripts/cloud/step7CloudPromotion.test.mjs` | 로컬 카드 승인·잘못된 출처 차단·이전 카드 보존 테스트. |
| `scripts/soybean-rebuild/research-pipeline-runner.mjs` | 품목·단계별 현재 진행 판단 `inspect()`; **STEP7 원본 stop은 7-2 완료 판정과 다를 수 있음**. |
| `scripts/soybean-rebuild/research-verified-runner.mjs` | STEP 파이프라인 실행/재개. 유료 승인 옵션 및 원본 설정 반드시 확인. |
| `scripts/soybean-rebuild/step5-search.ts` | STEP 5 추가 검색 Gemini 요청. 대두유에서 출력 파일 미생성. |
| `scripts/soybean-rebuild/step7-fact-review.ts` | STEP 7-1 검증·보수적 수정·`best-effort-v2`. **일반 함수 내 await import 오류 수동 수정**. |
| `scripts/soybean-rebuild/step7-fact-to-rms.ts` | STEP 7-2 로컬 RMS 결과 생성/검증. |
| `scripts/soybean-rebuild/step7-local-card-status.mjs` | STEP 7-1 + 7-2 최종 카드 검증 `validatedLocalCard`. |
| `src/server/stage3DailyUpdates.ts` | 운영 AI 분석 조회/저장 로직 연동. **레거시 AI 삭제 후 버전 유지 필수**. |
| `src/server/cloudPublication.ts` | 기존 출판/운영 데이터 관련 코드. |
| `src/server/__tests__/scheduledRefreshIsolation.test.ts` | 오래된 legacy 분석 교체 기대값을 새 정책에 맞춰 정리한 회귀 테스트. |
| `RMS_LOCAL_SOYBEAN_OIL_ONLY.mjs` | **시세·MI·STEP 모두 대두유만** 갱신하는 로컬 테스트 실행기. |
| `RMS_LOCAL_FULL_REFRESH_SOYBEAN_OIL.mjs` | STEP만 대두유, 시세/MI는 8개 품목이라 사용자의 **단일품목 목적에 부적합**. |
| `RMS_STEP7_ERROR_INSPECT.mjs` | 저장된 날짜별 STEP 출력/예약/진단 조회. 읽기 전용. |
| `RMS_SOYBEAN_OIL_STEP5_RECOVERY.mjs` | **아직 실제 실행 확인 없음**. STEP 5 1회 복구 보조 도구, 별도 ZIP으로 제공. |

## 2. 현재 날짜별 주요 데이터 폴더

```text
.rms-research/soybean-oil/daily/2026-11-02/
  step1-google-*.json
  step2-graded-*.json
  step3-evidence-*.json
  step4-analysis-*.json
  [step5-round1-search-*.json 미존재]

.rms-research-runner/soybean-oil/daily/2026-11-02/
  paid-step1.json
  paid-step4.json
  paid-step5search.json   <-- 예약 마커, 삭제 금지

.rms-research/palm-oil/daily/2026-11-02/
  step7-final-*.json
  step7-fact-verified-*.json
  step7-rms-preview-palm-oil.json  <-- best-effort-v2 생성 성공
```

연구 결과 파일명 타임스탬프는 UTC일 수 있으므로 2026-11-02 KST 날짜 폴더에 `2026-11-01T...Z` 이름이 있는 것이 반드시 오류는 아님.

## 3. 무료/읽기 전용 명령

**코드 정합성**

```powershell
npm.cmd run lint
npm.cmd run build
```

**대두유 현재 STEP 기록**

```powershell
node .\RMS_STEP7_ERROR_INSPECT.mjs --commodity soybean-oil --day 2026-11-02
```

**STEP 5 복구 무료 사전검사** (`참고_복구도구`의 ZIP 압축해제 후)

```powershell
node .\RMS_SOYBEAN_OIL_STEP5_RECOVERY.mjs --check-only
```

**동작 회귀 검사**

```powershell
node --import tsx --test .\scripts\cloud\step7CloudPromotion.test.mjs
node --import tsx --test .\src\server\__tests__\scheduledRefreshIsolation.test.ts
node --import tsx --test .\scripts\soybean-rebuild\step7-best-effort-flow.test.mjs
```

**현재 날짜 폴더의 STEP 상태 조회**

```powershell
$env:RMS_RESEARCH_RUN_DAY='2026-11-02'
try {
  node --input-type=module -e "import {inspect} from './scripts/soybean-rebuild/research-pipeline-runner.mjs'; console.log(JSON.stringify(inspect(process.cwd(),'soybean-oil'),null,2))"
} finally {
  Remove-Item Env:RMS_RESEARCH_RUN_DAY -ErrorAction SilentlyContinue
}
```

**주의:** 설치 시점 해시를 기대하는 `RMS_STEP7_FULL_AUTO_VERIFY.mjs`는 이후 일부 파일 수동 변경으로 인해 재실행 시 실패할 수 있음. 해시 오류를 실제 기능 오류로 오해하지 말고 diff를 확인해야 함.

## 4. 과금 가능 — 승인 없이는 실행 금지

```powershell
# 새로 제공된 STEP 5 복구 도구가 --check-only를 통과한 후,
# API 호출/비용과 중복 위험을 검토하고, 사용자가 명시적으로 승인한 경우에만:
node .\RMS_SOYBEAN_OIL_STEP5_RECOVERY.mjs --retry-once --approve-paid
```

**위 명령은 STEP5만 유료 1회 가능**하며 이후 STEP 6/7/7-1/7-2를 자동 완결한다고 보장하지 않는다. `paid-step5search-retry1.json`을 생성하므로 실행 후에는 무조건 기록부터 확인해야 한다.

**전체 대두유 로컬 갱신 실행(재실행 시 MI/STEP 재과금 위험)**

```powershell
node --import tsx .\RMS_LOCAL_SOYBEAN_OIL_ONLY.mjs --run
```

이미 한 번 실행했으므로 **지금 다시 실행할 필요 없음**. 다음 단계는 기존 STEP 5만 복구하는 것.

## 5. Cloud Shell 읽기 전용 체크(운영 배포 전에)

```bash
gcloud run jobs list \
  --project=project-c4b2c3a4-9536-4898-bb3 \
  --region=asia-northeast3

gcloud scheduler jobs list \
  --project=project-c4b2c3a4-9536-4898-bb3 \
  --location=asia-northeast3
```

**이 명령으로 실제 현재 상태를 조회한 후** Job 이미지, 작업 시간, Secret Manager, Cloud Storage, 실행 권한, 스케줄러 시간대 확인. 조회만으로 실제 갱신이 실행되거나 배포되지는 않음.


================================================================================

# 친구에게 실제 최신 RMS 코드 전달하기

## 왜 인수인계 ZIP + 별도 코드 ZIP이 필요한가?

이 문서 ZIP은 **오늘까지 확인된 작업 상태를 전달**하기 위한 것이다. 사용자가 PowerShell로 직접 수정한 최신 파일들, 현재 진행 중인 `.rms-research` 실행 자료는 **이 대화에 자동으로 올라오지 않으므로** 이 ZIP에 완전한 최신 코드는 들어 있지 않다.

실제 코드 인계는 **현재 VS Code에서 작업 중인 사용자 PC 폴더**를 압축해 별도로 보내야 한다. **옛 GitHub 커밋이나 11월 1일 초기 통합 ZIP만 보내면 11월 2일 수정 내용이 누락된다.**

## 쉬운 절차 (Windows PowerShell)

1. 이 인수인계 ZIP(`RMS_인수인계_2026-11-02.zip`)을 다운로드한다.
2. ZIP을 **현재 RMS 프로젝트 루트 (`package.json`이 있는 폴더)**에 압축 해제한다. `RMS_친구전달용_코드압축.ps1`이 프로젝트 루트에 놓이도록 한다.
3. 작업 폴더에 API 키가 하드코딩돼 있지 않은지, 회사 내부 정보가 외부 공유 가능한지 점검한다.
4. 아래 명령어로 **최신 코드 ZIP(기본: 연구/로그 제외)**을 만든다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\RMS_친구전달용_코드압축.ps1
```

5. 생성된 ZIP의 파일 목록/내용을 검토하고 친구에게 **인수인계 ZIP + 실제 코드 ZIP**을 같이 보낸다. 스크립트는 `node_modules`, `.git`, `dist`, `.env`, 키 파일, 로컬 실행 데이터 등을 기본 제외한다. 하지만 **완벽한 비밀정보 탐지를 보장할 수 없으므로 직접 확인**해야 한다.

## 대두유 STEP 1~4 결과를 친구가 이어서 복구해야 한다면

STEP 5 실패 현장을 그대로 이어받으려면 `.rms-research/soybean-oil/daily/2026-11-02`과 `.rms-research-runner/soybean-oil/daily/2026-11-02`가 필요하다. **기본 코드 ZIP에는 포함되지 않는다.** 공유 승인 및 민감자료 검토 후 **별도 옵션**으로 생성하라.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\RMS_친구전달용_코드압축.ps1 -IncludeSoybeanOilCheckpoint
```

이 옵션은 코드 ZIP에 해당 2개 폴더를 추가한다. 여기에는 API 응답, 기사 관련 텍스트, 연구/구매 관련 메모, 호출 예약 내역이 들어 있을 수 있다. **외부 공유 시 회사 정책/접근 권한을 확인할 것.** 사용자가 직접 해당 폴더를 열어 공유할 만한 자료인지 확인하는 것이 먼저다.

## 포함/제외 기준

**기본 포함:** `src`, `scripts`, `package.json`, lockfile, 설정 코드(비밀정보 검사), README/문서, 최근 루트 `.mjs` 패치·검증 스크립트 등.

**기본 제외:** `node_modules`, `.git`, `dist`, 임시/캐시, `.env*`, JSON service-account/private-key/credential/key 파일, `.rms-research`, `.rms-research-runner`, `.rms-stage3`, 이전 패치 백업 폴더, ZIP 파일, 크기가 큰 상태 덤프, `.log`. 프로젝트의 숨김파일 중 공유에 위험한 것이 있을 수 있으므로 스크립트는 기본적으로 보수적으로 제외한다.

**선택 포함:** `-IncludeSoybeanOilCheckpoint` 시 해당 날짜/품목의 연구 결과와 유료 마커. 더 오래된 품목의 연구 데이터는 자동으로 포함하지 않는다.

## 절대로 보내지 말 것

- `.env`, `.env.local`, Gemini API 키, Google Cloud 서비스 계정 JSON, OAuth 토큰, 자격 증명 파일
- `state.json.gz` 등 운영 private state, 자격증명이나 회사 내부정보를 포함할 수 있는 덤프
- 사내 보안 규정상 외부 공유가 금지된 코드/로그/원가/계약/데이터 원문
- 작동 확인 없이 Cloud Run 운영 버킷에 재출판할 수 있는 개인 인증정보

## 친구의 첫 확인 체크리스트

- [ ] 최신 소스가 **11/02 패치 적용 후** 버전인지
- [ ] `npm.cmd run lint`, `npm.cmd run build`가 자기 환경에서 통과하는지
- [ ] `.env`/API 키 없이도 읽기 전용 검사 가능한지
- [ ] 11/02 대두유 STEP 1~4 파일·유료 호출 마커 존재 여부(선택 체크포인트를 전달했을 때만)
- [ ] **다음 작업은 STEP 5 실패 복구**, 시세/MI 코드 변경이나 8품목 유료 재실행이 아님
- [ ] 운영 Cloud Run에 신규 코드가 배포되지 않았다는 전제 확인

## 왜 과거 패치 ZIP을 전부 동봉하지 않았나?

대부분 이미 적용된 패치이고, 구버전 파일을 전제로 만든 ZIP도 있어 **재적용 시 현재 최신 코드를 덮거나 충돌**할 위험이 있다. 실제 최신 소스 ZIP 자체가 올바른 전달물이다. 유일한 미적용 관련 도구로 STEP 5 1회 복구 ZIP만 `참고_복구도구`에 첨부했다. 이 도구 역시 **사전검사 없이 실행하면 안 된다.**
