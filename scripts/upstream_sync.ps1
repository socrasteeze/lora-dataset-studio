#requires -Version 5.1
<#
  upstream_sync.ps1 -- drive an upstream sync from inside the repo.

  This is the executable half of docs/UPSTREAM_SYNC.md. That page stays the
  authority on WHY each gate exists and how to resolve a conflict; this script
  runs the parts a machine can run, so no agent has to re-derive them from prose
  and get one wrong. Where the page says "derive, do not recall", this script
  derives.

  WHAT IT DOES NOT DO, ON PURPOSE. It never merges, never commits, never pushes,
  never resolves a conflict and never touches a remote other than to fetch. Those
  are judgement calls the page reserves for a human or a reviewing agent. This
  script reports; you decide.

  Phases mirror the page:
    -Phase Orient    section 0 + 2   remotes, identity, tree state, incoming window
    -Phase Baseline  section 1       pre-merge suites (no merge may happen without one)
    -Phase Sweep     section 4       rejected-feature leftovers, re-delete list
    -Phase Quick     section 6       fail-fast lint/build/startup/frontend checks
    -Phase Gates     section 6       Quick, isolated product tests, full host/tooling suite
    -Phase All       Orient, Sweep, Gates ONCE (baseline is a separate pre-merge run)

  SCRATCH FILES. Every run writes under one directory and removes it on exit --
  including on Ctrl-C or a thrown gate. Keep it with -KeepScratch when you need to
  read a failure tail; the path is printed either way. Nothing is ever written to
  the repo tree, so a sync cannot leave the working tree dirty with its own logs.
#>
[CmdletBinding()]
param(
  [ValidateSet('Orient', 'Baseline', 'Sweep', 'Quick', 'Gates', 'All')]
  [string]$Phase = 'Orient',

  # Upstream branch to compare against. Empty means "derive it": upstream's own
  # HEAD. Do not hardcode a branch here -- upstream renamed main to v1 and made
  # v2 default on 2026-09-19, which deleted the ref every older script fetched.
  [string]$UpstreamBranch = '',

  # Short paths avoid Windows path-length and console-wrapping failures.
  [string]$ScratchRoot = (Join-Path ([IO.Path]::GetPathRoot($PSScriptRoot)) 'tmp'),

  # Acknowledge only manually classified technical/test references, never real attribution.
  [switch]$ReviewedAttribution,

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

# --- scratch, and its guaranteed removal -----------------------------------
# A sync writes suite tails, id listings and a worktree. All of it lives here so
# that cleanup is one removal and cannot miss a file some phase invented. The
# try/finally below is what makes "cleans up after itself" true even when a gate
# throws, which is the case that used to leave $env:TEMP full of half-runs.

$scratchParent = if ([IO.Path]::IsPathRooted($ScratchRoot)) { $ScratchRoot } else { Join-Path $Root $ScratchRoot }
$script:ScratchBase = [IO.Path]::GetFullPath($scratchParent)
$script:RunId = [guid]::NewGuid().ToString('N').Substring(0, 10)
$script:Scratch = Join-Path $script:ScratchBase ("ls-" + $script:RunId)
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
      (Split-Path -Leaf $resolved) -ne ("ls-" + $script:RunId)) {
    throw 'Scratch cleanup refused: path is outside this run.'
  }
  if (Test-Path -LiteralPath $resolved) {
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $resolved) { Write-Warn "Could not fully remove scratch: $resolved" }
    else { Write-Info 'Scratch removed.' }
  }
}

# Every child inherits scratch config/data before collection imports the app.
# Never impose one shared plugin directory on all xdist workers: direct app
# fixtures derive their plugin directory from their own isolated data root.
function Invoke-IsolatedValidation([scriptblock]$Body) {
  $names = @('LDS_DATA_DIR', 'LDS_CONFIG', 'LDS_ENV', 'LDS_PLUGINS_DIR',
             'LDS_EXTENSIONS_DIR', 'LDS_BUNDLED_DIR', 'LDS_PLUGIN_DISTRIBUTION',
             'LDS_PLUGIN_BUILD_MODE', 'LDS_PLUGINS', 'LDS_EXTENSIONS', 'LDS_SYNC_SCRATCH')
  $saved = @{}
  foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
  try {
    foreach ($name in $names) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
    $env:LDS_DATA_DIR = Scratch 'data'
    $env:LDS_CONFIG = Scratch 'config.json'
    $env:LDS_ENV = Scratch '.env'
    $env:LDS_SYNC_SCRATCH = $script:Scratch
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
  # Keep a small receipt, not gigabytes of test fixtures. This is diagnostic
  # evidence only: it never exempts a changed tree from the final full gate.
  $gitPath = & git rev-parse --git-path lds-sync-validation
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
    AttributionReviewed = [bool]$ReviewedAttribution
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $receipt -Encoding UTF8
  Write-Info "Timing receipt: $receipt"
}

# --- the pinned interpreter -------------------------------------------------
# CLAUDE.md: every `python` means .venv's interpreter, called directly, never
# through activate.bat -- a copied venv leaves activate shadowing nothing and a
# bare `python` falls back to the machine default, which has drifted to a pytest
# without xdist at least once.

function Get-Python {
  $candidates = @(
    (Join-Path $Root '.venv\Scripts\python.exe'),
    (Join-Path $Root '.venv/bin/python')
  )
  foreach ($c in $candidates) { if (Test-Path -LiteralPath $c) { return $c } }
  throw ".venv interpreter not found. Provision it (see CLAUDE.md), then re-run."
}

function Invoke-Step {
  <# Run a native command, tee its output to scratch, return the exit code. #>
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

# --- phase 0/2: orient ------------------------------------------------------

function Resolve-UpstreamBranch {
  <#
    Derive upstream's default branch instead of assuming one.

    History this guards: this repo's procedure named `upstream/main` in prose.
    On 2026-09-19 upstream renamed main to v1 and made v2 default, so `main`
    stopped existing -- and a `git fetch upstream --prune` then DELETED the local
    upstream/main ref. A script that hardcodes a branch reports "0 incoming" on a
    ref that is gone, which reads identical to "already current".
  #>
  if ($UpstreamBranch) { return $UpstreamBranch }
  $symref = & git ls-remote --symref upstream HEAD 2>$null |
            Select-String -Pattern '^ref:\s+refs/heads/(\S+)\s+HEAD'
  if ($symref) { return $symref.Matches[0].Groups[1].Value }
  throw 'Could not derive upstream default branch. Pass -UpstreamBranch explicitly.'
}

function Invoke-Orient {
  Write-Head 'Repository'
  & git rev-parse --show-toplevel
  & git remote -v
  Write-Head 'Branch and tree'
  $branch = (& git branch --show-current).Trim()
  Write-Info "branch: $branch"
  $dirty = @(& git status --porcelain)
  if ($dirty.Count) {
    Write-Err "Working tree is DIRTY ($($dirty.Count) entries). docs/UPSTREAM_SYNC.md: stop and ask. Never stash automatically."
    $dirty | Select-Object -First 20
  } else {
    Write-Ok 'Working tree clean.'
  }

  Write-Head 'Identity (CLAUDE.md requires lora-dataset-studio / noreply@lora-dataset-studio.dev)'
  $name  = (& git config user.name)
  $email = (& git config user.email)
  Write-Info "user.name  = $name"
  Write-Info "user.email = $email"
  if ($name -ne 'lora-dataset-studio' -or $email -ne 'noreply@lora-dataset-studio.dev') {
    Write-Err 'Identity does not match CLAUDE.md. Stop; do not commit.'
  } else {
    Write-Ok 'Identity matches.'
  }

  Write-Head 'Upstream push URL must be disabled'
  $pushUrl = (& git remote get-url --push upstream 2>$null)
  if ($pushUrl -and $pushUrl -notmatch 'DISABLED') {
    Write-Err "upstream push URL is live ($pushUrl). Set it to DISABLED_NO_PUSH."
  } else {
    Write-Ok "upstream push URL: $pushUrl"
  }

  Write-Head 'Fetch upstream'
  # Deliberately NOT --prune. Pruning against a remote that renamed its default
  # branch silently deletes the ref the procedure names, turning a branch rename
  # into a phantom "already current". Stale refs are the cheaper failure.
  & git fetch upstream 2>&1 | Select-Object -Last 10

  Write-Head 'Upstream branches (ground truth, not memory)'
  & git ls-remote --heads upstream
  $target = Resolve-UpstreamBranch
  Write-Info "upstream default branch: $target"

  $ref = "upstream/$target"
  & git rev-parse --verify --quiet "$ref" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Warn "$ref not present locally; fetching it explicitly."
    & git fetch upstream "+refs/heads/${target}:refs/remotes/upstream/$target" 2>&1 | Select-Object -Last 5
  }

  Write-Head "Incoming window vs $ref"
  $counts = (& git rev-list --left-right --count "HEAD...$ref").Trim() -split '\s+'
  Write-Info "ahead(fork)=$($counts[0])  behind(upstream)=$($counts[1])"
  $mergeBase = (& git merge-base HEAD $ref).Trim()
  Write-Info "merge-base: $mergeBase"

  if ($counts[1] -eq '0') {
    Write-Ok "No incoming commits. Fork contains $ref."
  } else {
    Write-Head 'Incoming commits -- read EVERY message; classify adopt/adapt/reject'
    & git log --oneline "HEAD..$ref"
  }

  # The ancestry trap, generalised. An `ours`-strategy merge records commits as
  # ancestors while adopting none of their content, so the behind-count reads
  # small and honest while the tree gap is enormous. Report both numbers; a wide
  # split between them means the count is lying.
  Write-Head 'Ancestry-vs-content check'
  $treeFiles = @(& git diff --name-only HEAD $ref -- . ':(exclude)frontend/dist')
  Write-Info "behind-count says: $($counts[1]) commit(s)"
  Write-Info "tree differs in:   $($treeFiles.Count) file(s) (excluding frontend/dist)"
  if ([int]$counts[1] -lt 30 -and $treeFiles.Count -gt 400) {
    Write-Warn 'Behind-count is small but the tree gap is large.'
    Write-Warn 'This is the ancestry trap: an ours-merge acknowledged commits without adopting content.'
    Write-Warn 'Do NOT trust the behind-count. See docs/V2_MIGRATION_PREP.md.'
  }
}

# --- phase 1: baseline ------------------------------------------------------

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
    & $py -X utf8 -m pytest backend/tests scripts/tests -q -rf -n 8 --dist loadfile --basetemp (Scratch 'pt') --durations=25
  } | Out-Null
}

function Invoke-Baseline {
  Write-Warn 'Freeze the pre-merge tree until both suites finish. No baseline = no merge.'
  Invoke-FrontendSuite
  Invoke-BackendSuites
}

# --- phase 4: sweep ---------------------------------------------------------

function Invoke-Sweep {
  param([string]$Ref)

  # Divergence terms. These are the identifiers of features this fork rejects, and
  # they live here rather than in prose so one edit updates the sweep. Deliberately
  # WITHOUT vast.ai/VAST_API_KEY: those run all through the dormant cloud-training
  # backend the fork keeps, and including them turned a 3-hit sweep into 70 hits of
  # legitimate code. A sweep that cries wolf gets ignored.
  $d1 = 'chatgpt|nanobanana|ChatGPT|Nano Banana|GEMINI_API_KEY|OPENAI_API_KEY|openrouter|OpenRouter'
  $d4 = 'dense_artifacts|dense_local_delivery|dense_pod_hub|dense_weights|dense_fp8_delivery|' +
        'fp8_local_delivery|cloud_quantize|hf_storage|hfStorage|HfStorageCard|hub_presence|' +
        'useHubPresence|pod_transfer_plan|pod_checkpoint_push|podTransportChoice|' +
        'DenseModelsPanel|DenseBasePicker|CloudQuantizeButton|denseModels'

  $paths = @('backend/app', 'backend/tests', 'frontend/src', 'frontend/tests', 'docs')

  Write-Head 'Divergence 1 -- cloud image engines'
  & git grep -n -I -E $d1 -- @paths
  if ($LASTEXITCODE -ne 0) { Write-Ok 'No D1 hits.' }
  else { Write-Warn 'Vet every hit. Known-benign: helpRegistry keywords, the contract test, this doc set.' }

  Write-Head 'Divergence 4 -- remote-GPU / dense training'
  & git grep -n -I -E $d4 -- @paths
  if ($LASTEXITCODE -ne 0) { Write-Ok 'No D4 hits.' }
  else { Write-Warn 'Vet every hit.' }

  Write-Head 'Files upstream has that this fork deliberately does not'
  # Tested against the FILESYSTEM, never `git ls-files` or `git ls-tree HEAD`.
  # Mid-merge both lie: ls-files reports conflicted paths at stages 1/2/3 and none
  # at stage 0; ls-tree HEAD still answers from the PRE-merge commit, so it reports
  # the inventory unchanged while files were adopted. Testing the file is true at
  # any moment.
  $missing = @()
  foreach ($f in (& git ls-tree -r --name-only $Ref)) {
    if ($f -like 'frontend/dist*') { continue }
    if (-not (Test-Path -LiteralPath (Join-Path $Root $f))) { $missing += $f }
  }
  Write-Info "$($missing.Count) upstream path(s) absent here."
  $missing | Set-Content -LiteralPath (Scratch 'upstream-only.txt')
  $missing | Select-Object -First 40
  if ($missing.Count -gt 40) { Write-Info "... full list: $(Scratch 'upstream-only.txt')" }
  Write-Warn 'Not a delete list. Some upstream files are maintained here in local-only form (D1b/1c).'

  Write-Head 'Help topics upstream has that this fork lacks (Divergence 10)'
  # Upstream keeps topics in help/topics/*, which this fork re-deletes every sync,
  # so a real topic EDIT inside a deleted module is lost with a green `git rm` and
  # no gate says a word. Looking backwards catches every sync that ever skipped it,
  # not just the one where the edit landed.
  & git log --oneline "HEAD..$Ref" -- frontend/src/help/topics/ frontend/src/help/topicBuilders.js
  Write-Info 'Above: did upstream touch the deleted help modules this window?'
}

# --- phase 6: gates ---------------------------------------------------------

function Invoke-Quick {
  $py = Get-Python
  Invoke-Step -Name 'Backend lint' -LogName 'ruff.txt' -Body { & $py -m ruff check . } | Out-Null
  Push-Location (Join-Path $Root 'frontend')
  try {
    Invoke-Step -Name 'Frontend lint' -LogName 'eslint.txt' -Body { & npm run lint } | Out-Null
    Invoke-Step -Name 'Frontend build' -LogName 'build.txt' -Body { & npm run build } | Out-Null
  } finally { Pop-Location }
  Invoke-Step -Name 'Served plugin startup' -LogName 'startup.txt' -Body {
    & $py -X utf8 (Join-Path $PSScriptRoot 'sync_smoke.py')
  } | Out-Null
  Invoke-Step -Name 'Ownership and hygiene preflight' -LogName 'preflight.txt' -Body {
    & $py -X utf8 -m pytest backend/tests/test_local_only_engines.py backend/tests/test_no_personal_data.py backend/tests/test_windows_scripts_are_ascii.py backend/tests/test_public_plugin_fixture.py backend/tests/test_fork_plugin_profile.py backend/tests/test_video_fork_plugin_contract.py backend/tests/test_extension_loader.py backend/tests/test_bank_scan_no_db_lock.py -q --basetemp (Scratch 'q') --durations=10
  } | Out-Null
  Invoke-FrontendSuite
  Write-Ok 'Quick checks passed. This is NOT full backend qualification; run -Phase Gates before landing.'
}

function Invoke-Gates {
  Invoke-Quick
  Invoke-BackendSuites

  Write-Head 'Gate 7 -- attribution and identity (run before EVERY commit)'
  $staged = & git diff --cached
  $hits = $staged | Select-String -CaseSensitive:$false -Pattern (
    'co-authored-by|signed-off-by|generated-by|assisted-by|generated with|AI-assisted|' +
    'claude|haiku|sonnet|opus|fable|mythos|anthropic|chatgpt|copilot|cursor|codex'
  ) | Where-Object { $_.Line -notmatch 'cursor-pointer|cursor-not-allowed|cursor-default' }
  if ($hits) {
    Write-Warn 'Staged content carries attribution-shaped text. Judge feature-name hits by context.'
    $hits | Select-Object -First 20
    if (-not $ReviewedAttribution) {
      throw 'Review attribution matches before committing. Remove real attribution; acknowledge only legitimate technical/test references with -ReviewedAttribution.'
    }
  } else {
    Write-Ok 'No attribution hits in staged content.'
  }
  & git log --format='%an <%ae> | %cn <%ce>' origin/main..HEAD | Sort-Object -Unique

  Write-Ok 'All gates green.'
}

# --- main -------------------------------------------------------------------

try {
  Write-Info "Repo:    $Root"
  Write-Info "Scratch: $script:Scratch"
  Write-Info "Phase:   $Phase"

  switch ($Phase) {
    'Orient'   { Invoke-Orient }
    'Baseline' { Invoke-IsolatedValidation { Invoke-Baseline } }
    'Sweep'    { Invoke-Sweep -Ref ("upstream/" + (Resolve-UpstreamBranch)) }
    'Quick'    { Invoke-IsolatedValidation { Invoke-Quick } }
    'Gates'    { Invoke-IsolatedValidation { Invoke-Gates } }
    'All' {
      Invoke-Orient
      Invoke-Sweep -Ref ("upstream/" + (Resolve-UpstreamBranch))
      Invoke-IsolatedValidation { Invoke-Gates }
    }
  }

  Write-Host ''
  Write-Info 'This script never merges, commits or pushes. Resolution and shipping stay with docs/UPSTREAM_SYNC.md.'
}
catch {
  $script:ExitCode = 1
  Write-Err $_.Exception.Message
  exit 1
}
finally {
  try { Write-ValidationSummary } finally { Remove-Scratch }
}
