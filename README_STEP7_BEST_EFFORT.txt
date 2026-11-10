RMS STEP 7-1 -> 7-2 best-effort recovery patch (local only)

This patch ONLY updates:
- scripts/soybean-rebuild/step7-fact-core.ts (cautious qualification of false-final production/stock wording)
- scripts/soybean-rebuild/research-verified-runner.mjs (recognize best-effort preview, verify written result)
- scripts/cloud/step7PaidLocalWorker.mjs (recognize best-effort preview)
Adds:
- scripts/soybean-rebuild/step7-local-card-status.mjs
- scripts/soybean-rebuild/step7-best-effort-flow.test.mjs

No changes to price/supply/weather/Market Intelligence, market outlook synthesis/STEP1-7, viewer or Cloud Run publication.
No global bypass: unknown source IDs, broken excerpts and incomplete evidence traces remain blocked.
In the reviewer MAX_TOKENS case, deterministic offline risk-phrase softening makes the output review-incomplete, not AI-verified.

Run PowerShell in RMS root (all offline):
Expand-Archive -LiteralPath ".\RMS_STEP7_BEST_EFFORT_FIX.zip" -DestinationPath "." -Force
node .\RMS_STEP7_BEST_EFFORT_FIX.mjs --check-only
node .\RMS_STEP7_BEST_EFFORT_FIX.mjs
node .\RMS_STEP7_BEST_EFFORT_VERIFY.mjs
node --import tsx --test .\scripts\soybean-rebuild\step7-best-effort-flow.test.mjs
npm.cmd run lint

Then recover existing saved palm-oil STEP7 at no API charge:
$env:RMS_RESEARCH_RUN_DAY = '2026-11-02'
try {
  node --import tsx .\scripts\soybean-rebuild\step7-fact-review.ts --commodity palm-oil --resume --apply-local
}
finally {
  Remove-Item Env:RMS_RESEARCH_RUN_DAY -ErrorAction SilentlyContinue
}

Check the output for 'LOCAL RMS CARD UPDATED' and reviewQuality 'review-incomplete'.
The result is ONLY local preview, Cloud Run automatic publishing not yet wired.
