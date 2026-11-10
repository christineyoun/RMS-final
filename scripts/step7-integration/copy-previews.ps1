param([Parameter(Mandatory=$true)][string]$SourceRoot)
$ErrorActionPreference='Stop'
$destRoot=(Resolve-Path '.').Path
$src=(Resolve-Path $SourceRoot).Path
$ids=@('wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch')
$copied=0
foreach($id in $ids){
  $srcDir=if($id -eq 'soybean') { Join-Path $src '.rms-soybean-rebuild' } else { Join-Path $src ".rms-research/$id" }
  $dstDir=if($id -eq 'soybean') { Join-Path $destRoot '.rms-soybean-rebuild' } else { Join-Path $destRoot ".rms-research/$id" }
  $filename="step7-rms-preview-$id.json"
  $item=Join-Path $srcDir $filename
  if(!(Test-Path -LiteralPath $item)){Write-Host "SKIP $id (no saved STEP7 preview)";continue}
  $obj=Get-Content -LiteralPath $item -Raw -Encoding utf8 | ConvertFrom-Json
  if($obj.stage -ne 'step7-local-ui-preview' -or $obj.approvedForPublication -ne $false -or $obj.commodity -ne $id -or $obj.data.rmsStep7Preview -ne $true){throw "Invalid STEP7 receipt for $id"}
  New-Item -Path $dstDir -ItemType Directory -Force | Out-Null
  Copy-Item -LiteralPath $item -Destination (Join-Path $dstDir $filename) -Force
  Write-Host "COPIED $id"; $copied++
}
Write-Host "STEP7 local preview receipts copied: $copied / 8. No Gemini calls. No production writes."
