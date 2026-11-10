RMS STEP7 Error Diagnostics - local/Cloud-safe classification.

Contains:
- RMS_STEP7_ERROR_DIAG_PATCH.mjs : replace ONLY scripts/cloud/step7PaidLocalWorker.mjs and scripts/cloud/scheduledStep7.ts (backup, SHA-check).
- RMS_STEP7_ERROR_INSPECT.mjs : READ ONLY past stage and paid-marker status.

Usage (in RMS project root):
  node .\RMS_STEP7_ERROR_DIAG_PATCH.mjs --check-only
  node .\RMS_STEP7_ERROR_DIAG_PATCH.mjs --apply
  node .\RMS_STEP7_ERROR_INSPECT.mjs --commodity soybean-oil --day 2026-11-02
  npm.cmd run lint

Important:
- This patch does NOT retry any calls or automatically clear paid-step5search.json.
- An old reserved-before-call record with no completed snapshot is NOT evidence of a billed or successful request.
- Raw provider output from the past was swallowed by the old worker, so there is no way to reconstruct exact historical error from these records.
- Subsequent paid runs will write sanitized diagnostic status at .rms-research-runner/<commodity>/daily/<day>/scheduled-worker-diagnostic.json; provider messages and API keys are never stored there.
- Existing market price, weather, MI, STEP analysis/review core, Cloud Run publication are not modified.
- This patch does not run any paid provider calls.
