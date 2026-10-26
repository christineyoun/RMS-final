# Weekday refresh and Gemini operating policy

This policy supersedes the October 26 daily-cap/dated approval. Gemini automatic execution has no approval expiry, daily KRW spending limit or daily request limit. The approved configuration is `scripts/cloud/weekday-ai-policy.approved.json` (version `weekday-ai-prepaid-v3`). The disabled example is not runtime activation. Local paid automation remains disabled.

## Operation and billing

Reuse the existing `rms-free-refresh` Cloud Run Job and existing Scheduler: `0 9 * * 1-5`, time zone `Asia/Seoul`. No additional Job, Scheduler or local paid timer is needed. Keep existing workflow locks, same-day phase consumption and free-source cadence/recovery controls. News phases still have at most two distinct model requests and analysis phases one: these bound each task, not the number of daily requests. A durable ledger already containing more than 24 calls does not block pending phases.

The monthly operating budget is **100,000 KRW**, funded manually through prepaid balance. It is planning metadata, never a software spending gate. Automatic top-up and automatic payment are disabled under the owner's policy; RMS neither changes nor verifies Google billing settings. No automatic monthly replenishment is assumed. Exhausted balance may cause provider failures; after manual funding, a subsequent scheduled weekday run tries again. No actual prepaid balance is retrieved or displayed. Estimated costs are never called remaining balance.

Existing models remain news `gemini-3.1-flash-lite` and analysis `gemini-3.8-flash`. Existing 8,192 output-token bounds, 60-second request deadlines, one HTTP attempt per request, disabled automatic continuation/function calling and transport/job leases remain. There are **no automatic paid retries**; retrying in the next scheduled run provides bounded recovery without a retry storm. Provider rate limits, authentication, evidence checks and credential protections remain intact.

## Independent outcomes and retained analysis

Free collectors run with their existing per-source error handling and one controlled recovery pass. AI has separate error handling. An AI policy, credential, provider, evidence or journal failure cannot prevent successful source observations from reaching the cloud publication step. Source failures do not suppress valid new AI derived from retained verified evidence. Both failures retain prior valid records; source and AI outcomes are logged separately. The shared Overview aggregator uses saved inputs after either outcome. Failed aggregation retains its prior publication. Existing validation, state integrity, generation-match writes and final atomic public/private cloud pointer promotion remain required.

New AI replaces an existing analysis only after a successful metered response passes the existing snapshot/evidence checks and reports `status: live`. Null, empty, malformed, failed and unsupported outputs retain the last accepted immutable snapshot. `scheduled-content-current.json` merges accepted items with prior entries. Accepted news has an independent checkpoint; rejected analysis does not roll it back. Page and PDF readers use those saved snapshots even during outages. Billing, quota, 429, 5xx, authentication, timeout and network errors are recorded without replacing accepted content.

Private `usage.jsonl` and `paid-requests.jsonl` retain timestamps, run/attempt/model, HTTP status, input/output/thinking tokens when available, conservative estimated USD cost, estimate method and sanitized provider diagnostics. Reservations are estimates, including when usage is unknown. Accepted analysis events record `lastSuccessfulAnalysisAt`; snapshot `generatedAt`/`updatedAt` preserve the per-analysis success time across failures. The durable GCS daily journal retains reservations, accepted checkpoints and phase outcomes before transport, preventing duplicate work after publication retry. Never delete a ledger or steal an unresolved transport lease to repeat work.

KRW telemetry uses a fresh verified saved FX rate with the existing 1,500 KRW/USD floor and 20% estimation margin; these assumptions are recorded separately from the market quote. Missing/stale FX yields null KRW estimates and never blocks requests. Cost estimates and reservations have no daily or monthly blocking threshold. Logs exclude keys, arbitrary exceptions, request contents and raw responses; existing private evidence/response receipts remain governed by the existing storage/acceptance model.

## Later activation — documentation only, no deployment in this task

The existing Secret is **`rms-gemini-api-key`**. Do not create a key, Secret, service, Job or Scheduler. After code review, the operator should:

1. Inspect the existing Job's region, service account, image, command, environment and secret references. Inspect the existing Scheduler's region/name, target, schedule and time zone. Reuse their actual values; the project and deployed identities are not established by repository placeholders. Keep task count 1 and existing leases/no-retry behavior.
2. Build the reviewed commit through the existing deployment process, then update the existing Job's image separately. The image contains `/app/scripts/cloud/weekday-ai-policy.approved.json`; no new policy Secret is necessary. Retain all current storage, command, IAM and scheduler settings.
3. Select an enabled numeric version of `rms-gemini-api-key` without reading its value. Grant the Job's existing runtime service account Secret Accessor on this existing Secret only if it lacks that permission.
4. Mount that Secret as a file on the existing Job and set the policy path/fingerprint and `RMS_GEMINI_API_KEY_FILE`. A file mount lets RMS catch secret-read errors while continuing free collection. Cloud Run resolves secret environment variables before startup, so a failed environment-secret lookup would prevent the whole container starting. See [Google's Job Secret documentation](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets).
5. If a Gemini environment-secret mapping already exists, remove only that mapping when switching to the volume; preserve all unrelated secret mappings. Do not add a second trigger or execute a manual paid test. Observe the next existing weekday trigger after activation.

Example commands for the **later operator**, not commands executed by this task:

```sh
# Set PROJECT, REGION, SCHEDULER_LOCATION, SCHEDULER_NAME, UPDATER_SA
# from the existing deployed resources, and GEMINI_SECRET_VERSION to an enabled number.
gcloud run jobs describe rms-free-refresh --project "$PROJECT" --region "$REGION"
gcloud scheduler jobs describe "$SCHEDULER_NAME" --project "$PROJECT" --location "$SCHEDULER_LOCATION"
gcloud secrets versions list rms-gemini-api-key --project "$PROJECT"

# Only if the existing runtime account lacks access:
gcloud secrets add-iam-policy-binding rms-gemini-api-key --project "$PROJECT" \
  --member="serviceAccount:$UPDATER_SA" --role=roles/secretmanager.secretAccessor

# Run from the reviewed checkout; prints only a non-secret configuration digest.
APPROVED_POLICY_SHA256=$(node --input-type=module -e 'import fs from "node:fs"; import {createHash} from "node:crypto"; const p=JSON.parse(fs.readFileSync("scripts/cloud/weekday-ai-policy.approved.json","utf8")); console.log(createHash("sha256").update(JSON.stringify(p)).digest("hex"))')

# If an old GEMINI_API_KEY secret mapping exists, remove that mapping first
# using the existing Job editor (or --remove-secrets GEMINI_API_KEY).
gcloud run jobs update rms-free-refresh --project "$PROJECT" --region "$REGION" \
  --update-secrets "/secrets/rms-gemini/api-key=rms-gemini-api-key:$GEMINI_SECRET_VERSION" \
  --update-env-vars "RMS_GEMINI_API_KEY_FILE=/secrets/rms-gemini/api-key,RMS_SCHEDULED_AI_POLICY_FILE=/app/scripts/cloud/weekday-ai-policy.approved.json,RMS_SCHEDULED_AI_APPROVAL=$APPROVED_POLICY_SHA256"
```

The existing flags (`RMS_PUBLIC_READONLY=1`, `RMS_DISABLE_SCHEDULERS=1`, `RMS_CLOUD_FREE_JOB=1`), command and saved `autoEnabled=false`, `freeAutoEnabled=true` remain. Never attach credentials, mounts or activation variables to the public viewer. Private capture readers remove both the Gemini key and key-file variable. Retain the existing private state and publication buckets. Old-policy same-day journals fail the identity check rather than silently duplicating prior work; activate on a new KST weekday or reconcile through the existing operator procedure without deleting history.

## Verification limits

Repository instructions specify weekday 09:00 Asia/Seoul; the deployed Job, Scheduler, IAM, Secret/version, billing controls and actual model availability require independent cloud inspection. The Google Cloud CLI is unavailable in this workspace, so those deployed settings were not verified. No cloud resources were created or modified, no Secret was connected, and no deployment or real Gemini call was performed. Offline tests exercise policy, retention, recovery, source/AI isolation, telemetry and existing provider/credential protections.
