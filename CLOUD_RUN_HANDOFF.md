# RMS Google Cloud deployment handoff

Repository implementation is ready for project-side staging. **No live Google Cloud deployment, IAM configuration or Docker image build has been verified:** this workspace has neither project credentials nor `gcloud`/Docker. The deployment preparation triggered no full refresh or paid AI call. A later focused repair verified the official October23 Wheat report. The commands below are for the authorized deployment operator; they were not executed here.

## Runtime design

One image serves two roles, reusing existing saved readers and `createFreeSourceRunner().check()`:

| Resource | Role | Persistent access |
|---|---|---|
| `rms-viewer` Cloud Run service | Saved-only GET API and existing dashboard/PDF frontend; no collector or paid-AI imports | Read publication bucket only |
| `rms-free-refresh` Cloud Run Job | Restore saved state into a temporary workspace, run existing free jobs, capture saved readers, publish | Read/write publication + private state buckets |
| `rms-weekday-free-refresh` Cloud Scheduler | Invoke that job once per weekday, `0 9 * * 1-5`, `Asia/Seoul` | `run.invoker` on that job only |

The temporary workspace is scratch space, not durable storage. Original saved JSON/JSONL histories and required original receipts are archived byte-for-byte. Content-addressed `public/<sha256>.json` and `state/<sha256>.json.gz` objects are immutable. A generation-matched `current.json` pointer links both and is promoted last. Failed validation/upload/promotion retains the previous publication. Hash/identity checks include matching public/private publication revisions. A conditional, two-hour private lease prevents overlap; the job timeout **must remain at most one hour**. Existing same-day and source-cadence checks prevent duplicate collection after a completed publication.

Viewer requests check the pointer at most once per minute (also on requests after idle CPU suspension). A failed read retains the last loaded publication; cold startup fails closed without a valid publication. Individual source failures retain verified observations through existing collectors. A partial successful daily publication uses its actual publication date as the canonical KST Issue. No wall-clock-only Issue advancement occurs. Existing nine browser-side PDF export paths use that same Issue.

Public exact GET allowlist covers saved Overview, eight commodity readers, histories, FX, Issue, AI/editorial snapshots, sources and PDF inputs. POST, admin, refresh/force/sync and paid Gemini endpoints are denied. Unknown query variants are denied. No provider requests occur on page/PDF reads. Viewer local-file QA is rejected when `K_SERVICE` identifies Cloud Run.

## 1. Choose project resources; inspect existing deployment first

Use the existing project/account and existing resource names if already provisioned. Do not create a second refresh scheduler. The deployment operator needs API enablement, image/build permissions, bucket/IAM administration, Cloud Run/Scheduler deployment and `iam.serviceAccounts.actAs`. Build-service-account Artifact Registry permissions depend on your project's existing setup.

```sh
export PROJECT='YOUR_EXISTING_PROJECT'
export REGION='asia-northeast3'
export IMAGE_REPO='rms'
export IMAGE_TAG='YOUR_RELEASE_TAG'
export IMAGE="$REGION-docker.pkg.dev/$PROJECT/$IMAGE_REPO/rms:$IMAGE_TAG"
export PUBLICATION_BUCKET='YOUR_GLOBALLY_UNIQUE_RMS_PUBLICATIONS_BUCKET'
export STATE_BUCKET='YOUR_GLOBALLY_UNIQUE_RMS_PRIVATE_STATE_BUCKET'
export VIEWER_SA="rms-viewer@$PROJECT.iam.gserviceaccount.com"
export UPDATER_SA="rms-updater@$PROJECT.iam.gserviceaccount.com"
export SCHEDULER_SA="rms-scheduler@$PROJECT.iam.gserviceaccount.com"
gcloud scheduler jobs list --project "$PROJECT" --location "$REGION"
gcloud run services list --project "$PROJECT" --region "$REGION"
gcloud run jobs list --project "$PROJECT" --region "$REGION"
```

Verify scheduler locations beyond this region if your project already has a refresh clock. Replace `create` with the corresponding `update` command for existing resources. Stop the prior production refresh clock at cutover; the Mac is not part of the cloud runtime.

## 2. Provision private buckets and least-privilege identities

```sh
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com storage.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com --project "$PROJECT"
gcloud artifacts repositories create "$IMAGE_REPO" --repository-format docker --location "$REGION" --project "$PROJECT"
gcloud iam service-accounts create rms-viewer --project "$PROJECT"
gcloud iam service-accounts create rms-updater --project "$PROJECT"
gcloud iam service-accounts create rms-scheduler --project "$PROJECT"
gcloud storage buckets create "gs://$PUBLICATION_BUCKET" --project "$PROJECT" --location "$REGION" --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets create "gs://$STATE_BUCKET" --project "$PROJECT" --location "$REGION" --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update "gs://$PUBLICATION_BUCKET" --versioning
gcloud storage buckets update "gs://$STATE_BUCKET" --versioning
gcloud storage buckets add-iam-policy-binding "gs://$PUBLICATION_BUCKET" --member="serviceAccount:$VIEWER_SA" --role=roles/storage.objectViewer
gcloud storage buckets add-iam-policy-binding "gs://$PUBLICATION_BUCKET" --member="serviceAccount:$UPDATER_SA" --role=roles/storage.objectUser
gcloud storage buckets add-iam-policy-binding "gs://$STATE_BUCKET" --member="serviceAccount:$UPDATER_SA" --role=roles/storage.objectUser
```

No bucket is public. Viewer has no private-state access or write permissions. Updater has object permissions on these two dedicated buckets, not project-wide storage administration. Scheduler has no storage access. If an existing free collector requires a credential, attach only its specific Secret Manager secret to the updater with per-secret access. Never attach paid AI credentials to the viewer. The default updater remains free-only. A Gemini secret may be attached to the updater only after the separate explicit policy/budget approval documented in WEEKDAY_REFRESH_POLICY.md; do not attach GOOGLE_API_KEY. Preserve the existing Cloud Scheduler service-agent role; do not grant Scheduler project Editor.

Do not put bucket-level retention locks on the mutable lease/current pointer: these must be conditionally deleted/replaced. Versioning preserves old pointers. Configure lifecycle only after defining retention requirements; never delete objects still referenced by current or retained rollback pointers.

## 3. Prepare approved seed locally and build the image

From the completed RMS-final checkout, after the local refresh lock is idle:

```sh
npm ci --no-audit --no-fund
npm run lint
npm run build
node --import tsx scripts/cloud/publication.ts prepare .rms-research/cloud-seed
node --import tsx scripts/cloud/publication.ts check-state .rms-research/cloud-seed
gcloud builds submit --project "$PROJECT" --tag "$IMAGE" .
```

`prepare` copies saved state to an isolated reader, disables all timers/paid credentials and captures existing GET responses. It never calls the source runner. It rejects movement of the source publication during capture. `check-state` restores the archive and verifies the same saved readers independently. Seed files contain private receipts; transfer securely, never commit or include them in the build context. `.dockerignore`/`.gcloudignore` exclude local `.env`, private `.rms*`, account directories, reports, dependencies and build artifacts. Approved publications are imported through the seed, not regenerated in an image build. The saved settings must have `freeAutoEnabled=true`, `autoEnabled=false`.

Build from the committed deployment revision in the existing GitHub repository. Private publication seed files remain separate from GitHub and must be imported through the next step.

## 4. One-time storage-only import

```sh
gcloud storage cp .rms-research/cloud-seed/public.json "gs://$STATE_BUCKET/public.json"
gcloud storage cp .rms-research/cloud-seed/state.json.gz "gs://$STATE_BUCKET/state.json.gz"
gcloud run jobs create rms-seed-publication --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" --service-account "$UPDATER_SA" --tasks 1 --parallelism 1 \
  --max-retries 0 --task-timeout 900s --memory 2Gi \
  --command node --args=--import,tsx,scripts/cloud/publication.ts,seed,/seed \
  --add-volume="name=seed,type=cloud-storage,bucket=$STATE_BUCKET,readonly=true" \
  --add-volume-mount="volume=seed,mount-path=/seed" \
  --set-env-vars "RMS_PUBLIC_READONLY=1,RMS_DISABLE_SCHEDULERS=1,RMS_PUBLICATION_BUCKET=$PUBLICATION_BUCKET,RMS_STATE_BUCKET=$STATE_BUCKET"
gcloud run jobs execute rms-seed-publication --project "$PROJECT" --region "$REGION" --wait
gcloud storage cat "gs://$PUBLICATION_BUCKET/current.json"
```

The read-only volume is only for seed transfer, not a POSIX runtime/locking substitute. Metadata-server identity performs storage operations; no access-token files or service-account keys are needed. `seed` validates required saved routes/benchmarks, original FX/Issue metadata and public/private identity, then conditionally creates the first pointer. It refuses to overwrite an existing pointer. Restrict the seed job to the operator and remove it after successful import; it has no schedule. Keep original seed artifacts privately for recovery.

## 5. Stage the read-only viewer, then verify before public release

Only after successful seed validation set readiness. The flag is an explicit operator attestation; it cannot bypass actual pointer/hash/saved-data startup checks.

```sh
gcloud run deploy rms-viewer --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" --service-account "$VIEWER_SA" --port 8080 \
  --min-instances 0 --max-instances 3 --memory 1Gi --no-allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,RMS_PUBLIC_READONLY=1,RMS_DISABLE_SCHEDULERS=1,RMS_PUBLIC_DATA_READY=1,RMS_PUBLICATION_BUCKET=$PUBLICATION_BUCKET"
gcloud run services describe rms-viewer --project "$PROJECT" --region "$REGION" --format yaml
gcloud run services logs read rms-viewer --project "$PROJECT" --region "$REGION" --limit 50
gcloud run services proxy rms-viewer --project "$PROJECT" --region "$REGION" --port 8082
```

In a second terminal on a machine with Node dependencies and Chrome:

```sh
curl --fail http://127.0.0.1:8082/api/health
node scripts/cloud/smoke.mjs http://127.0.0.1:8082 .rms-research/cloud-staging-smoke
```

Set `RMS_CHROME_PATH` if Chrome is not in the standard Mac location. Smoke checks public denials, all nine rendered pages/actual Export Report downloads, filenames/Issue, two portrait A4 pages, runtime exceptions and unexpected external source calls. It writes rendered PDF page images for visual review. Inspect every image for clipping/charts, and test normal navigation/currencies. Restart/redeploy the service and repeat against a new output folder: publication revision and Issue must persist. Inspect effective flags, image digest, `0.0.0.0:8080` startup logs and service-account bucket scope. Never set `RMS_PUBLICATION_FILE` on Cloud Run.

After staging and licensing/content release review, permit anonymous viewing only:

```sh
gcloud run services add-iam-policy-binding rms-viewer --project "$PROJECT" --region "$REGION" --member allUsers --role roles/run.invoker
```

Organization policies may disallow public ingress; resolve that with the project owner. This does not make buckets public or grant API writes.

## 6. One private weekday job and one authenticated Scheduler trigger

```sh
gcloud run jobs update rms-free-refresh --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" --service-account "$UPDATER_SA" \
  --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 3600s --memory 2Gi \
  --command node --args=--import,tsx,scripts/cloud/publication.ts,refresh \
  --update-env-vars "RMS_CLOUD_FREE_JOB=1,RMS_PUBLIC_READONLY=1,RMS_DISABLE_SCHEDULERS=1,RMS_PUBLICATION_BUCKET=$PUBLICATION_BUCKET,RMS_STATE_BUCKET=$STATE_BUCKET"
gcloud run jobs add-iam-policy-binding rms-free-refresh --project "$PROJECT" --region "$REGION" --member="serviceAccount:$SCHEDULER_SA" --role=roles/run.invoker
gcloud scheduler jobs update http rms-weekday-free-refresh --project "$PROJECT" --location "$REGION" \
  --schedule '0 9 * * 1-5' --time-zone Asia/Seoul \
  --uri "https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/rms-free-refresh:run" \
  --http-method POST --oauth-service-account-email "$SCHEDULER_SA" --message-body '{}' \
  --max-retry-attempts 0
gcloud scheduler jobs describe rms-weekday-free-refresh --project "$PROJECT" --location "$REGION"
gcloud run jobs describe rms-free-refresh --project "$PROJECT" --region "$REGION"
```

`CLOUD_RUN_JOB` is supplied by Cloud Run, and the entry point requires it plus `RMS_CLOUD_FREE_JOB=1`. The explicit job directly invokes the existing runner; it starts no internal timer. Both public security flags remain `1` in the image/job. An isolated saved reader, accessed only over loopback, temporarily uses read-only=0 with timers disabled to expose existing saved readers privately; Cloud Run Jobs expose no incoming HTTP service. No refresh HTTP endpoint is exposed.

Do not manually run a source refresh merely as setup QA. At the first authorized weekday execution, check job completion, retained failures, new immutable objects and `current.json`. Confirm all viewer instances pick up the promoted revision/Issue within about a minute, and repeat smoke checks. A source outage may yield a partial publication retaining source-specific dates. If the job fails before pointer promotion, the entire previous publication stays active. Alert on failed executions or stale publication age through existing Google Cloud monitoring; do not add a second timer as a workaround.

## Actual refresh coverage and limitations

A weekday check does not mean the source publishes daily. Existing collector rules are unchanged:

| Data/section | Existing free workflow |
|---|---|
| Benchmark histories | Weekday checks of existing U.S. Wheat/Yahoo/public palm/TTSA readers. TTSA is weekly; Comext potato-starch monthly (24-hour check gate). No synthetic daily prices. |
| Six USDA S&D commodities | 24-hour check gate, periodic official release data; retains original marketing/calendar-year conventions. |
| Raw-potato statistics/production | 24-hour check gate of annual Eurostat series. JRC chart estimates reuse retained, verified yield receipts and matching official areas. This is **not automatic discovery/import of new JRC bulletins**. |
| Origin Radar/Overview weather | Existing all-eight origin jobs and deduplicated Open-Meteo evidence windows; crop/region scope unchanged. No weather-status pills rendered. |
| FX/Brent | Weekday checks. Existing quote/reference/session rules remain; not every futures quote is a confirmed settlement. FX comparison can be unavailable without a saved comparable prior dated receipt. |
| SCFI | Existing weekly/168-hour gate and parser retained. Automatic collection/display/export remain unavailable until documented permission is recorded; reference link alone is not a license. |
| Market Intelligence | Existing source verification/discovery jobs; candidates alone are not approval. The separately approved paid workflow can publish only source-verified, evidence-checked accepted summaries. |
| RMS AI / Desk recommendations | Approved saved snapshots remain visible. **Default OFF. Explicitly approved private weekday policy can generate accepted updates; see WEEKDAY_REFRESH_POLICY.md.** |
| Policy/transport | Existing US/wheat-scope Federal Register/USDA screen; not comprehensive new government-policy coverage for every commodity. Selected verified outlooks retain factual status. |
| Tapioca S&D | Saved verified raw-material scope retained; no configured official global starch-balance feed. |
| AMIS/other unsupported sources | Existing saved or unavailable states remain honest; no new substitute feeds. |

Broader automatic bulletin/editorial/AI coverage requires separately scoped source work or approval, not silent invention by this deployment adapter. Review source licensing for public deployment beyond the already enforced SCFI gate.

## Verification evidence and remaining cloud work

Local: focused allowlist/security, archive/history round-trip, generation CAS, overlap rejection, corrupt-pointer/hash rejection, partial-source retention, Issue/price/PDF/weather regression tests, TypeScript/lint and production build pass. Read-only production entry starts on PORT 8082 using a verified local seed; restored private state serves the same saved publication. Actual Chrome clicks downloaded all nine valid two-page portrait A4 reports plus repeat Overview, with Issue `20261026`; zero provider refreshes/Gemini calls.

Actual Cloud Build/Docker runtime, Google IAM permissions, bucket access, service cold restart/scale, Scheduler execution and post-refresh propagation remain **unverified until performed in your project**. These are the final credential-dependent operations, not an application startup error diagnosed from inaccessible logs.

Official deployment references: [scheduled Cloud Run Jobs](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule), [Cloud Storage generation preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions), [Cloud Storage volume configuration](https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts). The operator must verify current CLI availability, project policy and permissions when executing.

## Coordinated paid extension — manual prepaid operating policy

See [WEEKDAY_REFRESH_POLICY.md](WEEKDAY_REFRESH_POLICY.md) for the current indefinite manual-prepaid Gemini policy: 100,000 KRW monthly operating budget (metadata only), no daily cost/call caps, retained analysis on failure and independent free refresh. Reuse the existing `rms-free-refresh` Job, Scheduler and `rms-gemini-api-key` Secret. Later activation uses the bundled policy and existing Secret volume; do not create additional infrastructure. Code review, tests and GitHub push do not deploy or connect the Secret.
