# Gemini operating policy completion report

Date: October 26, 2026 (Asia/Seoul).

## Repository and scope

Fetched GitHub `origin/main` and confirmed the starting checkout matched `6430fee0047f8a4cd4b9421775af49b56e6713ea` with no divergence. Changes are limited to code, tests and documentation. Unrelated pre-existing changes to `server.ts`, `publicViewer.ts`, USDA data and local reports/backups are excluded from this task's commit. No deployment, paid test, billing change, Secret attachment or cloud-resource creation was performed. The final chat response records the resulting commit hash and verified GitHub push outcome.

## Files changed

- `src/server/scheduledAi.ts`: indefinite v3 policy, remove daily cost/call gates and phase spending allowances; retain metering, authorization, per-task bounds and durable phase consumption; support the existing mounted Secret and record safe acceptance/failure events.
- `src/server/geminiKrwBudget.ts`: convert verified FX for cost telemetry only; missing/stale FX produces null KRW estimates without blocking execution.
- `scripts/cloud/publication.ts`: independent free/AI error handling and saved-input aggregation, including AI/journal failure; remove key-file configuration from capture-reader environment.
- `scripts/cloud/weekday-ai-policy.approved.json`, `scripts/cloud/scheduled-ai-policy.example.json`: manual prepaid v3 policy, 100,000 KRW monthly planning budget, automatic top-up/payment false; no daily limits or authorization dates.
- `src/server/__tests__/geminiKrwBudget.test.ts`, `scheduledAiWorkflow.test.ts`, `scheduledRefreshIsolation.test.ts`: telemetry/policy/Secret tests, requests beyond former limits, validated-output retention, post-expiry recovery and real free-runner/metered-AI failure isolation.
- `src/server/__tests__/cloudPersistence.test.ts`, `newsFreshnessRepair.test.ts`: update current ledger fixture and remove obsolete spending-share assertion while retaining persistence/ranking checks.
- `src/server/__tests__/analysisQuality.test.ts`, `analysisClaimContract.test.ts`: hash files recursively in snapshot preservation checks, including nested scheduled-content snapshots. Fixes pre-existing EISDIR failures without weakening content acceptance assertions.
- `WEEKDAY_REFRESH_POLICY.md`, `CLOUD_RUN_HANDOFF.md`: current operating policy and later existing-resource activation instructions.
- This completion report.

## Restrictions removed and original locations

Locations below refer to starting commit `6430fee`:

| Restriction | Original locations |
|---|---|
| Approval expiry November 25, 2026 | `scripts/cloud/weekday-ai-policy.approved.json:6`, `scheduled-ai-policy.example.json:6`; date window validation at `src/server/scheduledAi.ts:24` |
| 5,000 KRW daily spending gate | Policy files at line 10; `src/server/geminiKrwBudget.ts:4` and validation/conversion at lines 7–12; `src/server/scheduledAi.ts:25`, ledger budget validation/threshold handling at 60–62, phase/reservation gates at 70–76 |
| 24 daily requests | Policy files at line 9; `src/server/scheduledAi.ts:25`, phase/request reservation gates at 70 and 76 |
| Indirect spending gates | Remaining-budget phase allocation and post-generation cost acceptance in `scheduledAi.ts`; stale/missing FX rejection in `geminiKrwBudget.ts` |

Tracked source, service, scheduler adapter, policy, tests and documentation were searched. Relevant local environment variable names were inspected without printing values; no daily-limit/expiry/budget/approval variables were present. Historical local backup trees are not executable repository policy and were left unchanged.

The new monthly amount is metadata and does not participate in request admission. Existing per-phase request bounds (two distinct news requests/one analysis request), provider limits, leases and one HTTP attempt per model request remain. A ledger with 25 earlier requests and over 5,000 KRW estimated reservations still executes all pending phases in the regression test.

## Retention, independent refresh and telemetry

Only successful metered responses passing existing snapshot/evidence validation with live status enter the immutable accepted-content manifest. Errors, null/empty/invalid outputs and rejected evidence preserve the actual prior snapshot. Accepted news checkpoints independently; analysis failure cannot remove it. Existing saved readers continue serving accepted analysis during outages.

The existing free runner handles individual source failures and its controlled recovery pass. The cloud workflow separately catches AI/provider/journal failures and still proceeds toward publication of successful free observations. Free-source subsystem failures allow AI to use retained valid evidence. Saved-input Overview aggregation runs independently; failures preserve its previous publication. Public/private GCS pointer promotion retains existing integrity and conditional-write protections.

Existing private request/usage logs retain request time, model, attempt count, token usage when available, USD estimates and calculation basis, HTTP status and sanitized error codes/reasons. Accepted analysis events now include last-success time; accepted snapshots retain generated/updated timestamps across failures. Reservations and accepted checkpoints persist in the existing private daily journal. No actual prepaid-balance lookup or claimed remaining balance was added. Missing FX means unknown KRW cost, not zero. No keys or arbitrary response content are added to logs.

Temporary provider failures are consumed once per phase that day; the next scheduled weekday uses a new daily journal and can recover after manual funding or service restoration. No automatic paid retries were added. Unresolved transport leases remain an operator-review security condition.

## Validation actually executed

Final results: **16 test programs passed**, TypeScript check passed (`npm run lint`), production build passed (`npm run build`), diff whitespace check passed. Build reports its existing large-chunk advisory.

Passed with `node --import tsx src/server/__tests__/<name>.test.ts`:

`geminiKrwBudget`, `scheduledAiWorkflow`, `scheduledRefreshIsolation`, `newsFreshnessRepair`, `freeDailyRefresh`, `freeRefreshNetwork`, `cloudPersistence`, `cloudReadiness`, `paidRequestControl`, `providerRequestCompatibility`, `dataIntegrity`, `analysisClaimContract`, `analysisGrounding`, `analysisQuality`, `analysisRecovery`, `standaloneAnalysis`.

Coverage includes execution after November 25, 2026; execution with a ledger beyond 24 calls/5,000 KRW; retained snapshot equality for failed/invalid outputs; recovery on the next weekday; independent source/AI success/failure combinations; simulated Gemini 402/429/503 responses; source/journal exceptions; source timing/locking; provider timeout/abort/no automatic retry; private persistence/credential exclusion and response acceptance. Diff review confirms no additional Job or Scheduler implementation/configuration was added.

Initial runs of two existing analysis test programs failed with EISDIR while hashing nested snapshot directories. Their preservation checks were corrected to include nested files; both passed on rerun and in the final test batch. No test failures remain in the executed set. The broader unselected repository suite, browser/manual rendering, real Gemini/billing recovery and deployed Cloud Run/Scheduler execution were not tested. Offline fixtures are not evidence of provider/model availability or real prepaid funds.

## Cloud verification and remaining activation steps

The repository documents `rms-free-refresh`, weekday cron `0 9 * * 1-5` and `Asia/Seoul`. **Deployed Job/Scheduler settings were not independently verified**: `gcloud` is unavailable and no connected Google Cloud management tool is available. Existing IAM, actual Scheduler identity/location, Secret version, billing settings and model availability remain unverified. No cloud settings were changed.

After reviewing the pushed commit, the operator must inspect existing resources, deploy the reviewed image to the existing Job, select an enabled version of **`rms-gemini-api-key`**, verify the existing runtime account's Secret Accessor permission, mount that existing Secret, and set the bundled policy path/fingerprint plus key-file environment variable. Exact later commands are in `WEEKDAY_REFRESH_POLICY.md`, based on [Google's official Job Secret documentation](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets). No new Secret or policy Secret is needed. Preserve the existing Scheduler and all storage/authentication settings. Verify manual prepaid funding and disabled automatic payments/top-up separately, then observe the next existing weekday execution. Never delete old daily journals to activate the new policy; use a new KST weekday or existing reconciliation process.
