RMS full weekday auto refresh: price/weather/supply + existing MI NEWS + STEP1-7/7-1/7-2 + approved saved cards.

Scope:
- Leaves all original market, weather, source/benchmark and Market Intelligence code unchanged.
- Uses existing runRefreshWorkflow (price/free -> news -> STEP -> overview -> Cloud publication).
- In private Cloud Run Job ONLY, explicitly-approved paid-cloud mode can run eight STEP analyses sequentially.
- STEP results are validated with the best-effort-v2 checks and stored in the existing .rms-stage3 private state.
- Same existing /api/ai-analysis/{id} public response receives the new data, so no viewer changes.
- Failed/incomplete/unsafe new STEP outcome retains previous valid per-commodity result.
- Private Google Cloud Storage per-day checkpoints prevent automatic re-billing after an interrupted Cloud Run job; if a mid-call crash is detected, the STEP stage stops for manual review. No source/news steps are reverted.
- Cloud Run Job task timeout must be assessed before 8 commodities; private lease is extended to 6h in explicitly approved STEP mode only.

LOCAL INSTALL (no Gemini calls):
  Expand-Archive -LiteralPath '.\RMS_STEP7_FULL_AUTO_INTEGRATION.zip' -DestinationPath '.' -Force
  node .\RMS_STEP7_FULL_AUTO.mjs --check-only
  node .\RMS_STEP7_FULL_AUTO.mjs --apply
  node .\RMS_STEP7_FULL_AUTO_VERIFY.mjs
  node --import tsx --test .\scripts\cloud\step7CloudPromotion.test.mjs
  npm.cmd run lint
  npm.cmd run build

NOT ACTIVE until GitHub deployment and private Job variables are explicitly configured:
  RMS_STEP7_SCHEDULE_MODE=paid-cloud
  RMS_STEP7_CLOUD_APPROVED=YES
  RMS_STEP7_CLOUD_EXECUTION=YES
  RMS_CLOUD_FREE_JOB=1    (existing)
  RMS_STATE_BUCKET and RMS_PUBLICATION_BUCKET (existing)
  GEMINI_API_KEY set via private-job Secret Manager (existing). NEVER on public viewer.
  RMS_STEP7_PAID_COMMODITIES optional; default all eight.

Never set these STEP flags on rms-viewer public service.
Cloud Run Job run-time must be reviewed (up to 8 x 30min stage timeout plus free/news); private lease is 6h in paid-cloud mode; existing per-stage token caps remain intact. Do NOT enable job until local lint/build, safe synthetic test, a single-commodity isolated Cloud Job smoke test, and review of API costs are complete.

The ZIP only changes source on the local machine; it does NOT publish or mutate live GCS or GitHub, nor does it silently enable paid calls. Cloud Run execution has NOT been live tested.

CORRECTION (2026-11-02): This ZIP replaces the earlier full-auto ZIP. It accepts the post-OLD_AI_CLEANUP stage3DailyUpdates.ts hash e29d... and keeps the retired modules removed. The earlier ZIP must not be used. If check-only fails, stop; do not force.
