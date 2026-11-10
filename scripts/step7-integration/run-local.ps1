$ErrorActionPreference='Stop'
# Explicit development-only read of saved STEP 7-2 receipts. No scheduled paid calls.
$env:RMS_STEP7_LOCAL_PREVIEW='1'
$env:RMS_DISABLE_SCHEDULERS='1'
$env:NODE_ENV='development'
$env:RMS_PUBLIC_READONLY='0'
Write-Host 'STEP 1-7-2 local read-only preview enabled. Legacy AI endpoints disabled.'
Write-Host 'Schedulers are disabled for this local preview. No Gemini is called by page load.'
Write-Host 'Open http://localhost:3000 after server starts.'
npm.cmd run dev
