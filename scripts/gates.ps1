#requires -Version 5.1
<#
  gates.ps1 -- landing gate for this fork.

  Phases:
    -Phase Quick   lint, frontend build, startup smoke, preflight, frontend tests
    -Phase Gates   Quick, then bundled plugin suites, then the host suite

  The script never merges, commits, or pushes. Scratch files live outside the
  repo and are removed on exit, including after a failure. Keep them with
  -KeepScratch.
#>
[CmdletBinding()]
param(
  [ValidateSet('Quick', 'Gates')]
  [string]$Phase = 'Gates',

  # Short paths avoid Windows path-length failures.
  [string]$ScratchRoot = (Join-Path ([IO.Path]::GetPathRoot($PSScriptRoot)) 'tmp'),

  [switch]$KeepScratch
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root

function Write-Info([string]$m) { Write-Host "[i] $m" }
function Write-Ok([string]$m)   { Write-Host "[OK] $m" }
function Write-Warn([string]$m) { Write-Host "[!] $m" }
function Write-Err([string]$m)  { Write-Host "[X] $m" }
function Write-Head([string]$m) { Write-Host ''; Write-Host "=== $m ===" }

$scratchParent = if ([IO.Path]::IsPathRooted($ScratchRoot)) { $ScratchRoot } else { Join-Path $Root $ScratchRoot }
$script:ScratchBase = [IO.Path]::GetFullPath($scratchParent)
$script:RunId = [guid]::NewGuid().ToString('N').Substring(0, 10)
$script:Scratch = Join-Path $script:ScratchBase ("gt-" + $script:RunId)
New-Item -ItemType Directory -Path $script:Scratch -ErrorAction Stop | Out-Null
$script:Results = New-Object System.Collections.ArrayList
$script:ExitCode = 0

function Scratch([string]$name) { Join-Path $script:Scratch $name }

function Remove-Scratch {
  if ($KeepScratch) {
    Write-Info "Scratch kept: $script:Scratch"
    return
  }
  $resolved = [IO.Path]::GetFullPath($script:Scratch)
  $prefix = $script:ScratchBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $resolved) -ne ("gt-" + $script:RunId)) {
    throw 'Scratch cleanup refused: path is outside this run.'
  }
  if (Test-Path -LiteralPath $resolved) {
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $resolved) { Write-Warn "Could not fully remove scratch: $resolved" }
    else { Write-Info 'Scratch removed.' }
  }
}

# Every child inherits scratch config and data before collection imports the app.
# Do not impose one shared plugin directory on all xdist workers.
function Invoke-IsolatedValidation([scriptblock]$Body) {
  $names = @('LDS_DATA_DIR', 'LDS_CONFIG', 'LDS_ENV', 'LDS_PLUGINS_DIR',
             'LDS_EXTENSIONS_DIR', 'LDS_BUNDLED_DIR', 'LDS_PLUGIN_DISTRIBUTION',
             'LDS_PLUGIN_BUILD_MODE', 'LDS_PLUGINS', 'LDS_EXTENSIONS', 'LDS_GATES_SCRATCH')
  $saved = @{}
  foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
  try {
    foreach ($name in $names) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
    $env:LDS_DATA_DIR = Scratch 'data'
    $env:LDS_CONFIG = Scratch 'config.json'
    $env:LDS_ENV = Scratch '.env'
    $env:LDS_GATES_SCRATCH = $script:Scratch
    & $Body
  } finally {
    foreach ($name in $names) {
      if ($null -eq $saved[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
      else { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    }
  }
}

function Write-ValidationSummary {
  if (-not $script:Results.Count) { return }
  Write-Head 'Validation timings'
  foreach ($step in $script:Results) {
    Write-Info ("{0}: exit={1}, {2:N2}s" -f $step.Name, $step.Exit, $step.Seconds)
  }
  $gitPath = & git rev-parse --git-path lds-gates-validation
  if ($LASTEXITCODE -ne 0) { throw 'Cannot locate validation receipt directory.' }
  $directory = $gitPath.Trim()
  if (-not [IO.Path]::IsPathRooted($directory)) { $directory = Join-Path $Root $directory }
  $directory = [IO.Path]::GetFullPath($directory)
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $receipt = Join-Path $directory ($script:RunId + '.json')
  [pscustomobject]@{
    Phase = $Phase; Head = (& git rev-parse HEAD).Trim()
    Steps = @($script:Results | Select-Object Name, Exit, Seconds)
    ScratchKept = [bool]$KeepScratch
    Succeeded = ($script:ExitCode -eq 0)
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $receipt -Encoding UTF8
  Write-Info "Timing receipt: $receipt"
}

function Get-Python {
  $candidates = @(
    (Join-Path $Root '.venv\Scripts\python.exe'),
    (Join-Path $Root '.venv/bin/python')
  )
  foreach ($c in $candidates) { if (Test-Path -LiteralPath $c) { return $c } }
  throw ".venv interpreter not found. Provision it (see AGENTS.md), then re-run."
}

function Invoke-Step {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][scriptblock]$Body,
    [string]$LogName
  )
  if (-not $LogName) { $LogName = ($Name -replace '[^A-Za-z0-9]+', '-').ToLower() + '.txt' }
  $log = Scratch $LogName
  Write-Head $Name
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $global:LASTEXITCODE = 0
  & $Body 2>&1 | Tee-Object -FilePath $log | Out-Host
  $code = $LASTEXITCODE
  $timer.Stop()
  if ($null -eq $code) { $code = 0 }
  $result = [pscustomobject]@{ Name = $Name; Exit = $code; Log = $log; Seconds = $timer.Elapsed.TotalSeconds }
  [void]$script:Results.Add($result)
  if ($code -ne 0) {
    throw "$Name failed (exit $code). Stop here; replay the named failures before the full gate."
  }
  Write-Ok ("{0} ({1:N2}s)" -f $Name, $result.Seconds)
  $result
}

function Invoke-FrontendSuite {
  Push-Location (Join-Path $Root 'frontend')
  try { Invoke-Step -Name 'Frontend suite (core and bundled)' -LogName 'frontend.txt' -Body { & npm test } | Out-Null }
  finally { Pop-Location }
}

function Invoke-BackendSuites {
  $py = Get-Python
  $tested = 0
  foreach ($plugin in (Get-ChildItem -LiteralPath (Join-Path $Root 'bundled') -Directory | Sort-Object Name)) {
    $tests = Join-Path $plugin.FullName 'tests'
    if (-not (Test-Path -LiteralPath $tests -PathType Container)) { continue }
    if (-not (Get-ChildItem -LiteralPath $tests -Filter 'test_*.py' -File -Recurse)) { continue }
    Invoke-Step -Name ("Bundled Python: " + $plugin.Name) -LogName ($plugin.Name + '-python.txt') -Body {
      & $py -X utf8 -m pytest $tests -q -p no:flask --basetemp (Scratch ("p-" + $plugin.Name)) --durations=10
    } | Out-Null
    $tested++
  }
  if ($tested -eq 0) { throw 'No bundled Python contracts were discovered.' }
  Invoke-Step -Name 'Full backend and release tooling' -LogName 'backend.txt' -Body {
    & $py -X utf8 -m pytest backend/tests scripts/tests -q -rf -n 8 --dist loadfile --basetemp (Scratch 'pt') --durations=50
  } | Out-Null
}

function Invoke-Quick {
  $py = Get-Python
  Invoke-Step -Name 'Backend lint' -LogName 'ruff.txt' -Body { & $py -m ruff check . } | Out-Null
  Push-Location (Join-Path $Root 'frontend')
  try {
    Invoke-Step -Name 'Frontend lint' -LogName 'eslint.txt' -Body { & npm run lint } | Out-Null
    Invoke-Step -Name 'Frontend build' -LogName 'build.txt' -Body { & npm run build } | Out-Null
  } finally { Pop-Location }
  Invoke-Step -Name 'Served plugin startup' -LogName 'startup.txt' -Body {
    & $py -X utf8 (Join-Path $PSScriptRoot 'startup_smoke.py')
  } | Out-Null
  Invoke-Step -Name 'Ownership and hygiene preflight' -LogName 'preflight.txt' -Body {
    & $py -X utf8 -m pytest backend/tests/test_local_only_engines.py backend/tests/test_no_personal_data.py backend/tests/test_windows_scripts_are_ascii.py backend/tests/test_public_plugin_fixture.py backend/tests/test_fork_plugin_profile.py backend/tests/test_video_fork_plugin_contract.py backend/tests/test_extension_loader.py backend/tests/test_bank_scan_no_db_lock.py -q --basetemp (Scratch 'q') --durations=10
  } | Out-Null
  Invoke-FrontendSuite
  Write-Ok 'Quick checks passed. This is NOT full backend qualification; run -Phase Gates before landing.'
}

function Invoke-AttributionCheck {
  Write-Head 'Attribution check'
  $staged = & git diff --cached
  $pattern = 'co-authored-by|signed-off-by|generated-by|assisted-by|generated with|AI-assisted|' +
             'claude|haiku|sonnet|opus|fable|mythos|anthropic|chatgpt|copilot|cursor|codex'
  $hits = @($staged | Select-String -Pattern $pattern | Where-Object {
    $_.Line -notmatch 'cursor-pointer|cursor-not-allowed|cursor-default'
  })
  if ($hits.Count) {
    Write-Warn 'Staged content carries attribution-shaped text.'
    $hits | Select-Object -First 20
    throw 'Staged content has attribution-shaped text. Remove it before committing.'
  }
  Write-Ok 'No attribution hits in staged content.'
  & git log --format='%an <%ae> | %cn <%ce>' origin/main..HEAD | Sort-Object -Unique
}

function Invoke-Gates {
  Invoke-Quick
  Invoke-BackendSuites
  Invoke-AttributionCheck
  Write-Ok 'All gates green.'
}

try {
  Write-Info "Repo:    $Root"
  Write-Info "Scratch: $script:Scratch"
  Write-Info "Phase:   $Phase"

  switch ($Phase) {
    'Quick' { Invoke-IsolatedValidation { Invoke-Quick } }
    'Gates' { Invoke-IsolatedValidation { Invoke-Gates } }
  }

  Write-Host ''
  Write-Info 'This script never merges, commits, or pushes.'
}
catch {
  $script:ExitCode = 1
  Write-Err $_.Exception.Message
  exit 1
}
finally {
  try { Write-ValidationSummary } finally { Remove-Scratch }
}
