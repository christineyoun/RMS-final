RMS STEP7 AUTO PHASE 4 — LOCAL PAID EXECUTION ADAPTER (NOT CLOUD)

Changes ONLY:
  scripts/cloud/scheduledStep7.ts (replace phase3 version, backup)
  scripts/cloud/step7PaidLocalWorker.mjs (new)
  scripts/cloud/step7PaidLocalProbe.mjs (new)

Protected, NOT changed: price/weather/supply refresh; Market Intelligence refresh;
existing RMS UI, STEP research scripts, token caps and daily checkpointing.

Apply safely from the actual RMS project root:
  Expand-Archive -LiteralPath ".\RMS_STEP7_AUTO_PHASE4_LOCAL_PAID_LINK.zip" -DestinationPath "." -Force
  node .\RMS_STEP7_AUTO_PHASE4.mjs --check-only
  node .\RMS_STEP7_AUTO_PHASE4.mjs
  node .\RMS_STEP7_AUTO_PHASE4_VERIFY.mjs
  node --import tsx .\scripts\cloud\step7PaidLocalProbe.mjs
  npm.cmd run lint

Above commands never call Gemini. DEFAULT OFF. CLOUD RUN BLOCKED.

Optional REAL Gemini local trial, only after checking .env and consciously opting in:
  $env:RMS_STEP7_SCHEDULE_MODE = "paid-local"
  $env:RMS_STEP7_PAID_COMMODITIES = "wheat"  # explicit test commodity
  $env:RMS_STEP7_PAID_APPROVED = "YES"
  node --import tsx --input-type=module -e "import {runScheduledStep7} from './scripts/cloud/scheduledStep7.ts'; console.log(JSON.stringify(await runScheduledStep7({day:'2026-11-02'}),null,2))"
  Remove-Item Env:RMS_STEP7_SCHEDULE_MODE,Env:RMS_STEP7_PAID_COMMODITIES,Env:RMS_STEP7_PAID_APPROVED -ErrorAction SilentlyContinue

WARNING: optional trial MAKES GEMINI API CALLS and may incur charges.
It calls the existing verified-runner: at most 6 paid STEP1–7 reservations +
one separate STEP7-1 review reservation per commodity/day. Per-model token
output caps remain unchanged. A failed paid call is not retried automatically.
Daily outputs are isolated in .rms-research/<commodity>/daily/<day>/
or .rms-soybean-rebuild/daily/<day>/. This patch does not promote daily
snapshots into the existing live viewer paths. Existing viewer/Cloud Run
publication and 09:00 Cloud Run execution are NOT yet activated.

DO NOT DEPLOY. Future steps: durable Cloud Run checkpoint storage,
production-safe STEP7-1/7-2, publication of approved outcomes into the
existing public bundle, and 09:00 production activation.
