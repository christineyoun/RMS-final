<#
2026-11-02 RMS handoff exporter
Run IN current RMS project root. Does NOT run npm, Gemini, Cloud Run, or change source files.
Creates a code ZIP in parent folder, excluding known secret files and runtime artefacts.
Optionally include one soybean-oil research checkpoint (review contents before sharing).
SECURITY NOTE: automatic filters do not prove the resulting ZIP is free of secrets.
#>
[CmdletBinding()]
param(
    [string]$ProjectRoot = $PSScriptRoot,
    [switch]$IncludeSoybeanOilCheckpoint
)
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd('\','/')
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) {
    throw "현재 폴더에서 package.json을 찾지 못했습니다. RMS 루트에서 실행하거나 -ProjectRoot를 지정해 주세요: $root"
}
$parent = Split-Path -Parent $root
$day = Get-Date -Format 'yyyyMMdd-HHmmss'
$name = if ($IncludeSoybeanOilCheckpoint) { "RMS_최신코드_대두유체크포인트포함_$day.zip" } else { "RMS_최신코드_보안필터_$day.zip" }
$output = Join-Path $parent $name
$temp = Join-Path ([IO.Path]::GetTempPath()) ("rms-handoff-"+[Guid]::NewGuid().ToString('N'))
$stage = Join-Path $temp 'RMS_SOURCE'
New-Item -ItemType Directory -Path $stage -Force | Out-Null

$blockedDir = @(
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.vite', '.cache', '.turbo',
  '__pycache__', '.venv', 'venv', 'tmp', 'temp', '.rms-stage3', '.rms-research',
  '.rms-research-runner', '.rms-soybean-rebuild', '.rms-research-patches',
  'RMS_STEP7_BEST_EFFORT_PAYLOAD', 'RMS_STEP7_FULL_AUTO_PAYLOAD', '.terraform'
)
$blockedFileRx = '(?i)(^\.env($|\.)|(^|[-_.])(secret|credentials?|service[-_.]?account|private[-_.]?key|api[-_.]?key|oauth[-_.]?token)([-_.]|$)|\.pem$|\.p12$|\.pfx$|\.key$|\.log$|\.jsonl$|\.db$|\.sqlite[0-9]?$|\.gz$|\.zip$|^state\.json(\.gz)?$|^public\.json$|^\.npmrc$|^\.pypirc$|^id_rsa($|\.))'
$secretContentRx = '(?i)(AIza[0-9a-z_\-]{20,}|sk-[0-9a-z_\-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"private_key"\s*:\s*")'
$included = [System.Collections.Generic.List[string]]::new()
$excluded = [System.Collections.Generic.List[string]]::new()
$flags = [System.Collections.Generic.List[string]]::new()

function Copy-RmsSafeTree {
  param([string]$Folder, [string]$Relative)
  foreach ($entry in Get-ChildItem -LiteralPath $Folder -Force -ErrorAction Stop) {
    $rel = if ($Relative) { Join-Path $Relative $entry.Name } else { $entry.Name }
    if ($entry.PSIsContainer) {
      if ($blockedDir -contains $entry.Name -or $entry.Attributes.ToString().Contains('ReparsePoint')) {
        $excluded.Add("[DIR] $rel")
        continue
      }
      Copy-RmsSafeTree -Folder $entry.FullName -Relative $rel
      continue
    }
    if ($entry.Name -match $blockedFileRx -or $entry.Length -gt 15728640) {
      $excluded.Add("[FILE] $rel")
      continue
    }
    # Lightweight scan on likely text files; never echo secret content.
    if ($entry.Extension -match '^(?i:\.ts|\.tsx|\.js|\.mjs|\.cjs|\.json|\.md|\.txt|\.yaml|\.yml|\.sh|\.ps1|\.toml|\.py)$' -and $entry.Length -le 3145728) {
      try {
        $contents = [IO.File]::ReadAllText($entry.FullName)
        if ($contents -match $secretContentRx) { $flags.Add($rel); continue }
      } catch { $excluded.Add("[UNREADABLE] $rel"); continue }
    }
    $to = Join-Path $stage $rel
    $toDir = Split-Path -Parent $to
    if (-not (Test-Path -LiteralPath $toDir)) { New-Item -ItemType Directory -Path $toDir -Force | Out-Null }
    Copy-Item -LiteralPath $entry.FullName -Destination $to -Force
    $included.Add($rel)
  }
}

try {
  Write-Host "SOURCE ROOT: $root"
  Copy-RmsSafeTree -Folder $root -Relative ''
  if ($IncludeSoybeanOilCheckpoint) {
    $subpaths = @(
      '.rms-research\soybean-oil\daily\2026-11-02',
      '.rms-research-runner\soybean-oil\daily\2026-11-02'
    )
    foreach ($rel in $subpaths) {
      $src = Join-Path $root $rel
      if (-not (Test-Path -LiteralPath $src -PathType Container)) { throw "선택 체크포인트 폴더가 없습니다: $rel" }
      Get-ChildItem -LiteralPath $src -Recurse -Force -File | ForEach-Object {
        if ($_.Name -match $blockedFileRx) { throw "체크포인트에 비밀정보 가능성이 있는 파일명: $($_.Name)" }
        # Optional checkpoints may contain raw provider data. Flag obvious embedded keys; manual review is still essential.
        if ($_.Length -le 3145728 -and $_.Extension -match '^(?i:\.json|\.md|\.txt)$') {
          $checkpointText = [IO.File]::ReadAllText($_.FullName)
          if ($checkpointText -match $secretContentRx) { throw "체크포인트에 비밀정보 패턴이 있습니다 (내용 미출력): $($_.Name)" }
        }
        $relativeFile = $_.FullName.Substring($root.Length).TrimStart('\','/')
        $dest = Join-Path $stage $relativeFile
        New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
        $included.Add($relativeFile)
      }
    }
  }
  if ($flags.Count -gt 0) {
    Write-Warning "잠재적 비밀정보 패턴 발견: 파일 $($flags.Count)개. ZIP 생성을 중단합니다."
    $flags | ForEach-Object { Write-Warning "검토 필요 (내용 미표시): $_" }
    throw '소스에 키/자격증명처럼 보이는 텍스트가 있습니다. 수동 검토 후 재시도하세요.'
  }
  $manifest = @(
    'RMS SOURCE HANDOFF (local working copy; not production deployment)',
    "Created locally: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')",
    "Source root: [LOCAL PATH OMITTED]",
    "Includes soybean-oil 2026-11-02 checkpoints: $($IncludeSoybeanOilCheckpoint.IsPresent)",
    "Files included: $($included.Count)",
    "Files/dirs excluded: $($excluded.Count)",
    'IMPORTANT: verify all files and permissions manually before sending externally.',
    'Restore credentials only via approved secure method; DO NOT share .env files.',
    '',
    'EXCLUDED PATHS:',
    ($excluded -join "`n")
  ) -join "`r`n"
  [IO.File]::WriteAllText((Join-Path $stage 'HANDOFF_EXPORT_MANIFEST.txt'),$manifest,[Text.UTF8Encoding]::new($false))
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::CreateFromDirectory($stage,$output,[IO.Compression.CompressionLevel]::Optimal,$false)
  Write-Host "SUCCESS: $output"
  Write-Host "Included files: $($included.Count), excluded entries: $($excluded.Count)"
  Write-Warning '자동 검사로 모든 비밀정보/회사 기밀을 탐지할 수 없습니다. 파일 내용을 확인한 후에만 공유하세요.'
} finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}
