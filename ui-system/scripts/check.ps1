# UI convention check. First-pass filter only; every hit needs manual review.
# Usage: powershell -ExecutionPolicy Bypass -File ui-system/scripts/check.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $root

$targets = Get-ChildItem -Path $root -Recurse -File -Include *.css, *.js, *.html |
  Where-Object {
    $_.FullName -notmatch '\\candidates\\' -and
    $_.FullName -notmatch '\\fonts\\'
  }

# Only the current experiment 3 deliverables, not old experiments.
$externalHtml = Get-ChildItem -Path $projectRoot -Recurse -File -Filter *.html |
  Where-Object { $_.DirectoryName -match '\\3$' }
$targets += $externalHtml

$externalCode = Get-ChildItem -Path $projectRoot -Recurse -File |
  Where-Object {
    ($_.Extension -eq '.js' -or $_.Extension -eq '.css') -and
    $_.FullName -notmatch '\\ui-system\\' -and
    $_.FullName -notmatch '\\HW3_todo\\' -and
    $_.DirectoryName -match '\\3(\\|$)'
  }
$targets += $externalCode

$errors = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()

$patterns = @(
  @{ Pattern = 'system-ui'; Message = 'Forbidden system font stack: system-ui'; Sensitive = $false },
  @{ Pattern = 'PingFang'; Message = 'Forbidden system font: PingFang'; Sensitive = $false },
  @{ Pattern = 'Segoe UI'; Message = 'Forbidden system font: Segoe UI'; Sensitive = $false },
  @{ Pattern = '\bInter\b'; Message = 'Forbidden generic font: Inter'; Sensitive = $true },
  @{ Pattern = '\bRoboto\b'; Message = 'Forbidden generic font: Roboto'; Sensitive = $true },
  @{ Pattern = 'linear-gradient|radial-gradient|conic-gradient'; Message = 'Forbidden gradient'; Sensitive = $false },
  @{ Pattern = 'backdrop-filter'; Message = 'Forbidden backdrop blur'; Sensitive = $false },
  @{ Pattern = 'box-shadow:\s*(?!\s*(none|inset)\b)'; Message = 'Forbidden outer shadow; only inset accent bars allowed'; Sensitive = $false },
  @{ Pattern = 'border-radius:\s*999'; Message = 'Forbidden pill radius'; Sensitive = $false },
  @{ Pattern = '\binnerHTML\b'; Message = 'Forbidden innerHTML'; Sensitive = $false },
  @{ Pattern = '\beval\s*\('; Message = 'Forbidden eval'; Sensitive = $false },
  @{ Pattern = 'new\s+Function\s*\('; Message = 'Forbidden new Function'; Sensitive = $false },
  @{ Pattern = '\bsetInterval\s*\('; Message = 'Forbidden setInterval animation'; Sensitive = $false },
  @{ Pattern = 'console\.log\s*\('; Message = 'Remove console.log before commit'; Sensitive = $false },
  @{ Pattern = '\bdebugger\b'; Message = 'Remove debugger before commit'; Sensitive = $false },
  @{ Pattern = 'outline:\s*none'; Message = 'Forbidden outline: none without replacement'; Sensitive = $false },
  @{ Pattern = 'setTimeout\s*\([^,]+,\s*\d{3,4}\s*\)'; Message = 'Timer duration must come from a token'; Sensitive = $false },
  @{ Pattern = 'duration:\s*\d{3,4}\b'; Message = 'Animation duration must come from a token'; Sensitive = $false }
)

foreach ($file in $targets) {
  $lines = Get-Content -LiteralPath $file.FullName -Encoding UTF8
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    foreach ($item in $patterns) {
      $hit = if ($item.Sensitive) { $line -cmatch $item.Pattern } else { $line -imatch $item.Pattern }
      if ($hit) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1)
        $errors.Add(('{0}:{1}  {2}  ->  {3}' -f $relative, ($i + 1), $item.Message, $line.Trim()))
      }
    }
    $allowedImportant = $line -match 'display:\s*none\s*!important' -or
      $line -match '0\.01ms\s*!important' -or
      $line -match 'animation-iteration-count:\s*1\s*!important' -or
      $line -match 'scroll-behavior:\s*auto\s*!important'
    if ($line -match '!important' -and -not $allowedImportant) {
      $relative = $file.FullName.Substring($projectRoot.Length + 1)
      $warnings.Add(('{0}:{1}  !important needs manual review  ->  {2}' -f $relative, ($i + 1), $line.Trim()))
    }
  }
}

$required = @(
  'fonts/spectral-400.woff2',
  'fonts/spectral-600.woff2',
  'fonts/plex-sans-var.woff2',
  'fonts/iosevka-400.woff2',
  'fonts/iosevka-500.woff2',
  'fonts/noto-serif-sc-var.woff2',
  'fonts/lxgw-wenkai-regular.woff2',
  'fonts/lxgw-wenkai-medium.woff2'
)
foreach ($font in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $font))) {
    $errors.Add(('Missing local font: {0}' -f $font))
  }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  & node --check (Join-Path $root 'system.js')
  if ($LASTEXITCODE -ne 0) {
    $errors.Add('system.js syntax check failed')
  }
} else {
  $warnings.Add('node not found; skipped system.js syntax check')
}

if ($warnings.Count) {
  Write-Output 'WARN'
  $warnings | ForEach-Object { Write-Output ('  ' + $_) }
}

if ($errors.Count) {
  Write-Output 'FAIL'
  $errors | ForEach-Object { Write-Output ('  ' + $_) }
  exit 1
}

Write-Output ('PASS  {0} files checked' -f $targets.Count)
