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
    -Phase Gates     section 6       lint, build, contracts, import, hygiene, suites
    -Phase All       everything above, in order

  SCRATCH FILES. Every run writes under one directory and removes it on exit --
  including on Ctrl-C or a thrown gate. Keep it with -KeepScratch when you need to
  read a failure tail; the path is printed either way. Nothing is ever written to
  the repo tree, so a sync cannot leave the working tree dirty with its own logs.
#>
[CmdletBinding()]
param(
  [ValidateSet('Orient', 'Baseline', 'Sweep', 'Gates', 'All')]
  [string]$Phase = 'Orient',

  # Upstream branch to compare against. Empty means "derive it": upstream's own
  # HEAD. Do not hardcode a branch here -- upstream renamed main to v1 and made
  # v2 default on 2026-09-19, which deleted the ref every older script fetched.
  [string]$UpstreamBranch = '',

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

$script:Scratch = Join-Path $env:TEMP ("lds-sync-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $script:Scratch -Force | Out-Null
$script:Worktrees = New-Object System.Collections.ArrayList

function Scratch([string]$name) { Join-Path $script:Scratch $name }

function Remove-Scratch {
  # Worktrees first: git owns metadata in .git/worktrees, so removing the
  # directory alone would leave the repo believing a checkout still exists.
  foreach ($wt in $script:Worktrees) {
    if (Test-Path -LiteralPath $wt) {
      & git worktree remove --force $wt 2>&1 | Out-Null
    }
  }
  if ($script:Worktrees.Count) { & git worktree prune 2>&1 | Out-Null }

  if ($KeepScratch) {
    Write-Info "Scratch kept: $script:Scratch"
    return
  }
  if (Test-Path -LiteralPath $script:Scratch) {
    Remove-Item -LiteralPath $script:Scratch -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $script:Scratch) {
      Write-Warn "Could not fully remove scratch: $script:Scratch"
    } else {
      Write-Info 'Scratch removed.'
    }
  }
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
  & $Body 2>&1 | Tee-Object -FilePath $log
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 }
  if ($code -eq 0) { Write-Ok "$Name" } else { Write-Err "$Name -- exit $code" }
  [pscustomobject]@{ Name = $Name; Exit = $code; Log = $log }
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

function Invoke-Baseline {
  $py = Get-Python
  Write-Info "interpreter: $py"
  Write-Warn 'A baseline is only valid if it both collects AND executes on the pre-merge tree.'

  $b1 = Invoke-Step -Name 'Baseline backend' -LogName 'baseline-backend.txt' -Body {
    & $py -m pytest backend/tests -q -rf -n 8 --dist loadfile --basetemp (Scratch 'bt')
  }
  Push-Location (Join-Path $Root 'frontend')
  try {
    $b2 = Invoke-Step -Name 'Baseline frontend' -LogName 'baseline-frontend.txt' -Body { & npm test }
  } finally { Pop-Location }

  Write-Head 'Baseline summary'
  Write-Info "backend  exit=$($b1.Exit)"
  Write-Info "frontend exit=$($b2.Exit)"
  Write-Warn 'Record the failure LIST, not just totals. No baseline = no merge.'
  @($b1, $b2)
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

function Invoke-Gates {
  $py = Get-Python
  $results = New-Object System.Collections.ArrayList

  Push-Location (Join-Path $Root 'frontend')
  try {
    $g = Invoke-Step -Name 'Gate 1 -- lint (bare-identifier tripwire)' -LogName 'gate1-lint.txt' -Body { & npm run lint }
    [void]$results.Add($g)
    if ((Get-Content -LiteralPath $g.Log -Raw) -match "not recognized|ENOENT|Cannot find module 'eslint'") {
      Write-Err 'Output is not ESLint''s own -- the tripwire never fired. npm install, then re-run.'
    }

    [void]$results.Add((Invoke-Step -Name 'Gate 2 -- build' -LogName 'gate2-build.txt' -Body { & npm run build }))
    [void]$results.Add((Invoke-Step -Name 'Gate 3a -- local-only contract (frontend)' -LogName 'gate3a.txt' -Body {
      & node --test tests/local-only-engines-contract.test.mjs
    }))
  } finally { Pop-Location }

  [void]$results.Add((Invoke-Step -Name 'Gate 3b -- local-only contract (backend)' -LogName 'gate3b.txt' -Body {
    & $py -m pytest backend/tests/test_local_only_engines.py -q
  }))

  # Import sanity points at a scratch data dir, never the production one: V2-era
  # create_app() runs additive schema updates, cleanup and backfills at startup,
  # and a branch switch does not reverse them.
  [void]$results.Add((Invoke-Step -Name 'Gate 4 -- backend import sanity' -LogName 'gate4.txt' -Body {
    $env:LDS_DATA_DIR = Scratch 'import-probe-data'
    & $py -c "import sys; sys.path.insert(0,'backend'); import app; app.create_app()"
  }))

  [void]$results.Add((Invoke-Step -Name 'Gate 5 -- repo hygiene' -LogName 'gate5.txt' -Body {
    & $py -m pytest backend/tests/test_no_personal_data.py backend/tests/test_windows_scripts_are_ascii.py -q
  }))

  [void]$results.Add((Invoke-Step -Name 'Gate 5b -- ruff' -LogName 'gate5b-ruff.txt' -Body { & $py -m ruff check . }))

  [void]$results.Add((Invoke-Step -Name 'Gate 6 -- backend suite' -LogName 'post-backend.txt' -Body {
    & $py -m pytest backend/tests -q -rf -n 8 --dist loadfile --basetemp (Scratch 'pt')
  }))
  Push-Location (Join-Path $Root 'frontend')
  try {
    [void]$results.Add((Invoke-Step -Name 'Gate 6 -- frontend suite' -LogName 'post-frontend.txt' -Body { & npm test }))
  } finally { Pop-Location }

  Write-Head 'Gate 7 -- attribution and identity (run before EVERY commit)'
  $staged = & git diff --cached
  $hits = $staged | Select-String -CaseSensitive:$false -Pattern (
    'co-authored-by|signed-off-by|generated-by|assisted-by|generated with|AI-assisted|' +
    'claude|haiku|sonnet|opus|fable|mythos|anthropic|chatgpt|copilot|cursor|codex'
  ) | Where-Object { $_.Line -notmatch 'cursor-pointer|cursor-not-allowed|cursor-default' }
  if ($hits) {
    Write-Err 'Staged content carries attribution-shaped text. Judge feature-name hits by context.'
    $hits | Select-Object -First 20
  } else {
    Write-Ok 'No attribution hits in staged content.'
  }
  & git log --format='%an <%ae> | %cn <%ce>' origin/main..HEAD | Sort-Object -Unique

  Write-Head 'Gate summary'
  foreach ($r in $results) {
    if ($r.Exit -eq 0) { Write-Ok $r.Name } else { Write-Err "$($r.Name) -- exit $($r.Exit) -- $($r.Log)" }
  }
  $failed = @($results | Where-Object { $_.Exit -ne 0 })
  if ($failed.Count) {
    Write-Err "$($failed.Count) gate(s) red. Do not commit dist, do not push."
    Write-Warn 'A parallel worker dies about once in five full runs. Replay a named failure ALONE before believing it.'
  } else {
    Write-Ok 'All gates green.'
  }
  $results
}

# --- main -------------------------------------------------------------------

try {
  Write-Info "Repo:    $Root"
  Write-Info "Scratch: $script:Scratch"
  Write-Info "Phase:   $Phase"

  switch ($Phase) {
    'Orient'   { Invoke-Orient }
    'Baseline' { Invoke-Baseline | Out-Null }
    'Sweep'    { Invoke-Sweep -Ref ("upstream/" + (Resolve-UpstreamBranch)) }
    'Gates'    { Invoke-Gates | Out-Null }
    'All' {
      Invoke-Orient
      Invoke-Baseline | Out-Null
      Invoke-Sweep -Ref ("upstream/" + (Resolve-UpstreamBranch))
      Invoke-Gates | Out-Null
    }
  }

  Write-Host ''
  Write-Info 'This script never merges, commits or pushes. Resolution and shipping stay with docs/UPSTREAM_SYNC.md.'
}
finally {
  Remove-Scratch
}
