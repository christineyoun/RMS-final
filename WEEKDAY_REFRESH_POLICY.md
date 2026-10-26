# Coordinated weekday refresh and paid-AI policy

The owner explicitly approved the corrected **₩5,000 combined daily Gemini estimate limit** on October 26, 2026 for private cloud activation during **October 27–November 25, 2026**. The earlier US$6 authorization remains revoked. The finalized configuration is `scripts/cloud/weekday-ai-policy.approved.json`; its enabled flag records policy approval, not an activated runtime. Ordinary local paid automation remains OFF. A separate October 26 local one-shot test consumed 12 calls and ₩4,735 reservations; its marker and ledger are retained. The later freshness repair uses offline replay only and does not authorize another paid test.

## Approved KRW policy

- One existing private `rms-free-refresh` Cloud Run Job and existing `0 9 * * 1-5`, `Asia/Seoul` Scheduler trigger. No second scheduler.
- Existing free collectors first, then at most one controlled recovery pass of transient failed/retained jobs. Successful collectors are not repeated. Permission/HTTP403 blockers are not retried.
- All eight commodities are considered for news before any analysis; the commodity starting order rotates by KST day. Each phase gets a share of the remaining estimated USD budget divided by the pending phases in that pass (rounded down to cents), so an early commodity cannot consume the later commodities’ shares. News research/summarization remains up to two calls and evidence-bound analysis up to one call each. A phase that cannot fit retains prior content rather than retrying. Up to **24 total API calls per KST day**, including failed or uncertain attempts.
- Maximum **₩5,000 estimated Gemini API spending per KST calendar day**, combined across every news/research/analysis call for all eight commodities. 24 calls is a secondary ceiling, never a quota. If the next conservative reservation does not fit, skip it and retain the previous approved content.
- Budget FX = `max(verified saved USD/KRW, 1,500 policy floor) × 1.20`, rounded upward to two decimals; USD allowance = `floor(5,000 / budget FX × 100) / 100`. The floor is a budgeting assumption, not an invented market quote. Current saved October23 USD/KRW is 1,324.45, giving safety FX **1,800 KRW/USD**, effective allowance **US$2.77** (₩4,986). Higher verified FX tightens the allowance; missing or >7-day-old verified FX disables paid execution. The daily ledger never loosens an earlier same-day threshold.
- Scheduled requests cap output at 8,192 tokens and reserve against actual prompt byte size, conservative token costs, grounding allowance and a 25% request buffer. Both original USD and safety-converted KRW reservations/usage estimates are retained. Failed/unknown attempts retain their reservations; accepted cheaper responses do not release them for extra calls.
- This is an RMS estimated API-spend guard, **not a guaranteed Google billing cap**. Uncertain provider charges are not erased. Actual usage estimates above a reservation stop subsequent calls. Configure project quotas/billing alerts separately. Google Cloud infrastructure costs (Run, Storage, Scheduler, builds) are separate from this Gemini budget.
- Existing RMS models: news `gemini-3.1-flash-lite`, analysis `gemini-3.8-flash`. No model migration. Both returned HTTP 200 in the separately authorized October 26 local test; cloud-project availability remains unverified.
- Approved authorization period: October 27–November 25, 2026 inclusive (KST), then fail closed for paid AI. Approval ID: `owner-approved-20261026-krw5000-v2`. The prior US-dollar policy remains revoked. No blanket indefinite authorization.
- One HTTP attempt per model request, 60-second provider deadline, no automatic continuation/function calling and no automatic paid retry. Existing transport leases and diagnostics are reused.
- Durable reservation and phase consumption saved to private GCS `control/paid-daily/YYYY-MM-DD.json` **before** provider transport. Successful accepted payloads are checkpointed there too, so failed final publication can be resumed without paying again. `started`/uncertain phases are not repeated automatically. The existing workflow GCS lease covers the whole job.
- Source dates/releases are retained. No new source observation is invented because the run date changed. SCFI authorization remains unchanged.

## Publication behavior

1. Existing source collectors save original records/receipts. Fresh collected news candidates feed the existing paid news service, not an unrelated search pipeline.
2. Original-publisher URL/date/topic checks precede summaries. Existing summary/evidence-quote/numerical quality checks remain in use. A candidate alone is not approval. Generic summaries, inaccessible sources and unsupported outputs do not replace approved content. New feed discovery is capped at three already-supported publisher RSS feeds and twelve crop-specific candidates; Google Search discovery only occurs inside the paid policy.
Verified extracted publisher inputs are retained before summarization, and exact model news responses are saved as immutable private replay receipts before acceptance/ranking. No missing summary is reconstructed from a diagnostic count.
3. Scheduled analyses reuse the existing evidence-v4 request, claim binding, reasoning and response acceptance components, with actual saved facts and independently verified publisher excerpts. Paid Search occurs in the preceding news phase; analysis uses the existing verified-only mode. No new AI validation framework is introduced. Missing evidence/failed claims retain the preceding approved analysis.
4. Existing payload formats are written as immutable `snapshots/scheduled-content/<hash>.json`. The atomic `scheduled-content-current.json` manifest can checkpoint individually accepted news without waiting for a six-field analysis. Rejected analysis retains its old entry. Accepted new news is ranked with retained approved stories; a mixed selection does not require four new articles. Original dated snapshots remain untouched for provenance/rollback.
5. The shared Stage 3 saved gateway combines accepted manifest news with existing verified source-specific readers, then applies the same relevance/credibility/seven-day freshness ranking without a legacy approval-priority bonus. Both commodity pages and `savedOverviewInputs()` use those exact selected articles and analyses. The existing Overview publisher is rerun from saved inputs after accepted content changes.
6. The existing cloud adapter archives original files and promotes its complete public/private GCS pointer last. Viewer, Issue and PDF inputs follow the same publication. Page/PDF reads cannot collect or generate.

Free-only operation remains possible without a policy. Invalid/expired paid approval retains AI and logs a concise block while free collection continues. The public viewer must never receive the key or policy-activation environment variables.

## Private cloud activation under the recorded approval

Use `scripts/cloud/weekday-ai-policy.approved.json` unchanged for this authorization. The separate example remains disabled. The prior US$6 policy/version/fingerprint is not valid. Store/mount this non-secret policy privately on the updater with a separately protected Gemini API key. Set the matching approval fingerprint below; never attach these settings or the key to the viewer. Model, limit or period changes need new owner approval. No secret values belong in GitHub, seed archives or public bucket data.

Approved policy fingerprint: `9e6ecb326c080b579161760d3756d20d749b9f6e48c244e28fe98b49f26f77c1`. This is a non-secret configuration digest, not an API credential. Verify it locally (no paid call):

```sh
node --input-type=module -e 'import fs from "node:fs"; import {createHash} from "node:crypto"; const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(createHash("sha256").update(JSON.stringify(p)).digest("hex"))' scripts/cloud/weekday-ai-policy.approved.json
```

With existing project/region/updater identity from CLOUD_RUN_HANDOFF.md:

```sh
# Supply actual Secret Manager names and pinned versions.
# Create a new policy secret or add a version to its existing secret.
gcloud secrets create "$POLICY_SECRET" --project "$PROJECT" --replication-policy automatic --data-file scripts/cloud/weekday-ai-policy.approved.json
# If that secret already exists, use instead:
# gcloud secrets versions add "$POLICY_SECRET" --project "$PROJECT" --data-file scripts/cloud/weekday-ai-policy.approved.json
# Provision the Gemini key through Secret Manager console or a protected file outside the repository.
export APPROVED_POLICY_SHA256=9e6ecb326c080b579161760d3756d20d749b9f6e48c244e28fe98b49f26f77c1
gcloud secrets add-iam-policy-binding "$GEMINI_SECRET" --project "$PROJECT" --member="serviceAccount:$UPDATER_SA" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding "$POLICY_SECRET" --project "$PROJECT" --member="serviceAccount:$UPDATER_SA" --role=roles/secretmanager.secretAccessor
gcloud run jobs update rms-free-refresh --project "$PROJECT" --region "$REGION" \
  --update-secrets "GEMINI_API_KEY=$GEMINI_SECRET:$GEMINI_SECRET_VERSION,/secrets/rms/weekday-policy.json=$POLICY_SECRET:$POLICY_SECRET_VERSION" \
  --update-env-vars "RMS_SCHEDULED_AI_POLICY_FILE=/secrets/rms/weekday-policy.json,RMS_SCHEDULED_AI_APPROVAL=$APPROVED_POLICY_SHA256"
```

The existing flags (`RMS_PUBLIC_READONLY=1`, `RMS_DISABLE_SCHEDULERS=1`, `RMS_CLOUD_FREE_JOB=1`) and job command remain unchanged. Viewer still rejects paid credentials. Retired Stage 3 autoEnabled is not used or enabled; saved legacy `autoEnabled=false` remains required. Private source readers remove the key from their environment.

The updater's existing state-bucket object permissions cover its durable daily journal. Do not put retention locks on mutable control/current/lease objects. Never erase daily journals to retry paid work. A changed same-day policy fingerprint or legacy US-dollar ledger is blocked: preserve all reservations, reconcile spending explicitly, then authorize the revised policy. Never delete/reset a ledger to regain budget. No live paid calls have occurred here, so no charged entries need rewriting. No provider retry is implied by a deployment retry.

Pause/remove the obsolete production clock at cloud cutover. Do not add a local paid timer alongside Cloud Scheduler. The source-only Mac scheduler remains unchanged until that cutover.

## Verification limits

Offline tests use injected provider transports and temporary state only. They cover reservation ordering, call/estimated-spend limits, replay, rejected outputs, manifest selection, original-date/source preservation and source-only retry. They do not constitute a successful live Gemini or Cloud Run execution.

After the colleague deploys this approved policy privately: observe one authorized weekday run, inspect source outcomes and private paid phase journal, confirm accepted/rejected items and same Issue across all nine reports, cold restart the viewer and run `scripts/cloud/smoke.mjs` through the authenticated staging proxy. Do not enable public viewing merely to test paid generation.

References: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [private Cloud Run Job secrets](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets).
