#!/usr/bin/env bash
# RMS-STEP7-WEEKDAY-20261109
# Run in Google Cloud Shell AFTER deploying the same RMS source image and saved state.
set -euo pipefail
MODE="${1:-plan}"
if [[ "$MODE" != plan && "$MODE" != apply && "$MODE" != verify ]]; then
  echo 'Usage: RMS_PROJECT_ID=... RMS_CLOUD_REGION=... bash scripts/step7-integration/enable-cloud-weekday.sh plan|apply|verify' >&2; exit 2
fi
command -v gcloud >/dev/null || { echo 'Run in Google Cloud Shell (gcloud required)' >&2; exit 2; }
[[ -f scripts/cloud/publication.ts && -f scripts/cloud/scheduledStep7.ts && -f scripts/cloud/step7PaidLocalWorker.mjs ]] || { echo 'Local Cloud Shell workspace lacks full RMS STEP7 Cloud source. Deploy from full RMS_final_main first.' >&2; exit 2; }
grep -q 'scheduledStep7.ts' scripts/cloud/publication.ts || { echo 'publication.ts does not invoke scheduledStep7.ts; no scheduled analysis guaranteed' >&2; exit 2; }
PROJECT="${RMS_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${RMS_CLOUD_REGION:-asia-northeast3}"
JOB="${RMS_REFRESH_JOB:-rms-free-refresh}"
SCHEDULER_REGION="${RMS_SCHEDULER_REGION:-$REGION}"
SCHEDULER_NAME="${RMS_SCHEDULER_NAME:-rms-weekday-refresh}"
[[ -n "$PROJECT" && "$PROJECT" != '(unset)' ]] || { echo 'Missing RMS_PROJECT_ID' >&2; exit 2; }
URI="https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/jobs/${JOB}:run"
RUN_JSON="$(gcloud run jobs describe "$JOB" --project "$PROJECT" --region "$REGION" --format=json)" || { echo 'Cloud Run refresh job missing: deploy code and job first' >&2; exit 2; }
export RMS_RUN_JOB_PREFLIGHT_JSON="$RUN_JSON"
node <<'NODE'
const j=JSON.parse(process.env.RMS_RUN_JOB_PREFLIGHT_JSON);
const found=[];
const walk=(x)=>{if(!x||typeof x!=='object')return;
 if(Array.isArray(x)){x.forEach(walk);return;}
 if(Array.isArray(x.containers))found.push(...x.containers);
 for(const [k,v]of Object.entries(x))if(k!=='containers')walk(v);
};walk(j);
const containers=[...new Set(found)];
const vars=new Map();for(const c of containers)for(const e of c.env||[])vars.set(e.name,e.value??(e.valueSource?'SECRET':'<unset>'));
const allArgs=containers.flatMap(c=>[...(c.command||[]),...(c.args||[])]).join(' ');
const missing=['RMS_CLOUD_FREE_JOB','RMS_STATE_BUCKET','RMS_PUBLICATION_BUCKET'].filter(k=>!vars.get(k));
if(vars.get('RMS_CLOUD_FREE_JOB')!=='1')missing.push('RMS_CLOUD_FREE_JOB=1');
if(!/publication\.ts/.test(allArgs)||!/refresh/.test(allArgs))missing.push('job command must run scripts/cloud/publication.ts refresh');
if(!vars.has('GEMINI_API_KEY')&&!vars.has('RMS_GEMINI_API_KEY_FILE')&&!vars.has('RMS_GEMINI_API_KEY'))missing.push('Gemini key or secret mapping');
console.log('Cloud job container image(s):',containers.map(x=>x.image).filter(Boolean).join(' '));
console.log('Current STEP7 flags:',Object.fromEntries(['RMS_STEP7_CLOUD_EXECUTION','RMS_STEP7_CLOUD_APPROVED','RMS_STEP7_SCHEDULE_MODE'].map(x=>[x,vars.get(x)||'<unset>'])));
if(missing.length){console.error('CLOUD PREFLIGHT FAILED:',missing.join('; '));process.exit(3)}
console.log('CLOUD PREFLIGHT PASS: private job entrypoint, state buckets, and secret mapping exist');
NODE
unset RMS_RUN_JOB_PREFLIGHT_JSON
EXISTING="$(gcloud scheduler jobs list --project "$PROJECT" --location "$SCHEDULER_REGION" --format=json)"
export RMS_JOB_LIST_JSON="$EXISTING" RMS_TARGET_URI="$URI"
MATCHES="$(node <<'NODE'
const jobs=JSON.parse(process.env.RMS_JOB_LIST_JSON),uri=process.env.RMS_TARGET_URI;
console.log(jobs.filter(j=>j.httpTarget?.uri===uri).map(j=>j.name.split('/').at(-1)).join(','))
NODE
)"
unset RMS_JOB_LIST_JSON RMS_TARGET_URI
if [[ "$MATCHES" == *,* ]]; then
  echo "More than one Cloud Scheduler job already targets $URI: $MATCHES. Resolve duplicates manually." >&2;exit 2
fi
if [[ -n "$MATCHES" ]]; then SCHEDULER_NAME="$MATCHES"; fi
TRIGGER_SA="${RMS_SCHEDULER_SA:-rms-step7-trigger@${PROJECT}.iam.gserviceaccount.com}"
echo "PROJECT=$PROJECT RUN_JOB=$JOB SCHEDULER=$SCHEDULER_NAME REGION=$REGION"
echo "SCHEDULE=0 9 * * 1-5; TIMEZONE=Asia/Seoul; AUTH=OAuth; TRIGGER_SA=$TRIGGER_SA"
echo 'The existing private job retains publisher verification, saved-state journals, and publication safety gates.'
if [[ "$MODE" == verify ]]; then
  [[ -n "$MATCHES" ]] || { echo 'NOT ENABLED: No matching Cloud Scheduler job' >&2;exit 3; }
  gcloud scheduler jobs describe "$SCHEDULER_NAME" --project "$PROJECT" --location "$SCHEDULER_REGION" --format='yaml(schedule,timeZone,state,httpTarget.uri,httpTarget.oauthToken.serviceAccountEmail)'
  exit 0
fi
if [[ "$MODE" == plan ]]; then echo 'PLAN ONLY — no Cloud changes.';exit 0;fi
[[ "${RMS_DEPLOYED_SOURCE_CONFIRMED:-}" == YES ]] || { echo 'Refusing apply: confirm the just-built RMS code AND saved state are deployed: RMS_DEPLOYED_SOURCE_CONFIRMED=YES' >&2;exit 3; }
if ! gcloud iam service-accounts describe "$TRIGGER_SA" --project "$PROJECT" >/dev/null 2>&1; then
  localpart="${TRIGGER_SA%%@*}"
  if [[ "$TRIGGER_SA" != "${localpart}@${PROJECT}.iam.gserviceaccount.com" ]];then echo 'Missing external trigger SA. Create it yourself and grant job invoker.' >&2;exit 3;fi
  gcloud iam service-accounts create "$localpart" --project "$PROJECT" --display-name 'RMS weekday STEP7 trigger'
fi
gcloud run jobs add-iam-policy-binding "$JOB" --project "$PROJECT" --region "$REGION" \
 --member="serviceAccount:${TRIGGER_SA}" --role=roles/run.invoker >/dev/null
gcloud run jobs update "$JOB" --project "$PROJECT" --region "$REGION" \
 --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=7200s \
 --update-env-vars='RMS_STEP7_CLOUD_EXECUTION=YES,RMS_STEP7_CLOUD_APPROVED=YES,RMS_STEP7_SCHEDULE_MODE=paid-cloud' >/dev/null
if [[ -n "$MATCHES" ]];then
 gcloud scheduler jobs update http "$SCHEDULER_NAME" --project "$PROJECT" --location "$SCHEDULER_REGION" \
  --schedule='0 9 * * 1-5' --time-zone='Asia/Seoul' --uri="$URI" --http-method=POST \
  --oauth-service-account-email="$TRIGGER_SA" --oauth-token-scope='https://www.googleapis.com/auth/cloud-platform' \
  --max-retry-attempts=0 >/dev/null
else
 gcloud scheduler jobs create http "$SCHEDULER_NAME" --project "$PROJECT" --location "$SCHEDULER_REGION" \
  --schedule='0 9 * * 1-5' --time-zone='Asia/Seoul' --uri="$URI" --http-method=POST \
  --oauth-service-account-email="$TRIGGER_SA" --oauth-token-scope='https://www.googleapis.com/auth/cloud-platform' \
  --max-retry-attempts=0 >/dev/null
fi
echo 'CLOUD SCHEDULE CONFIGURED. Confirm tomorrow with Cloud Run executions + approved eight-commodity STEP7 cards.'
gcloud scheduler jobs describe "$SCHEDULER_NAME" --project "$PROJECT" --location "$SCHEDULER_REGION" --format='yaml(schedule,timeZone,state,httpTarget.uri)'
