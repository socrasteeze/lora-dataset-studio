"""Exercise the sync driver orchestration without starting the real suites."""
from pathlib import Path
import os
import shutil
import subprocess
import sys

import pytest


ROOT = Path(__file__).resolve().parents[2]
DRIVER = ROOT / 'scripts/upstream_sync.ps1'
SHELL = shutil.which('pwsh') or shutil.which('powershell')
pytestmark = pytest.mark.skipif(not SHELL, reason='PowerShell is required')


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def run_script(tmp_path, body):
    (tmp_path / 'frontend').mkdir(exist_ok=True)
    script = f"""
$ErrorActionPreference = 'Stop'
$parseErrors = $null
$tokens = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile({quote(DRIVER)}, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) {{ throw 'Driver does not parse' }}
foreach ($statement in $ast.EndBlock.Statements) {{
  if ($statement -is [System.Management.Automation.Language.FunctionDefinitionAst]) {{
    Invoke-Expression $statement.Extent.Text
  }}
}}
$Root = {quote(tmp_path)}
$TestPythonExecutable = {quote(sys.executable)}
$script:Scratch = {quote(tmp_path)}
$script:Results = New-Object System.Collections.ArrayList
{body}
exit 0
"""
    return subprocess.run([SHELL, '-NoProfile', '-NonInteractive', '-Command', script],
                          cwd=ROOT, text=True, capture_output=True, timeout=45)


def test_step_returns_one_result_and_propagates_native_failure(tmp_path):
    result = run_script(tmp_path, f"""
$result = Invoke-Step -Name 'Green' -Body {{ & {quote(sys.executable)} -c "print('native output')" }}
if (@($result).Count -ne 1 -or $result.Exit -ne 0 -or $result.Seconds -lt 0) {{ throw 'Result polluted by stdout' }}
$failed = $false
try {{ Invoke-Step -Name 'Red' -Body {{ & {quote(sys.executable)} -c 'import sys; sys.exit(7)' }} }}
catch {{ $failed = $true }}
if (-not $failed -or $script:Results[-1].Exit -ne 7) {{ throw 'Native failure was swallowed' }}
""")
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.skipif(os.name != 'nt', reason='Windows command shim behavior')
def test_command_shim_failure_is_not_hidden_by_logging(tmp_path):
    shim = tmp_path / 'fixture.cmd'
    shim.write_text('@echo off\necho fixture output\necho fixture error 1>&2\nexit /b 7\n')
    result = run_script(tmp_path, f"""
$failed = $false
try {{ Invoke-Step -Name 'Command shim' -Body {{ & {quote(shim)} }} }}
catch {{ $failed = $true }}
if (-not $failed -or $script:Results[-1].Exit -ne 7) {{ throw 'Command shim failure was lost' }}
""")
    assert result.returncode == 0, result.stdout + result.stderr


def test_cleanup_removes_only_its_own_leaf_and_refuses_other_paths(tmp_path):
    base = tmp_path / 'scratch'
    leaf = base / 'ls-fixture'
    sibling = base / 'keep'
    outside = tmp_path / 'outside'
    for path in (leaf, sibling, outside):
        path.mkdir(parents=True)
        (path / 'sentinel').write_text('fixture')
    result = run_script(tmp_path, f"""
$script:ScratchBase = {quote(base)}
$script:RunId = 'fixture'
$script:Scratch = {quote(leaf)}
$KeepScratch = $false
Remove-Scratch
$script:Scratch = {quote(outside)}
$refused = $false
try {{ Remove-Scratch }} catch {{ $refused = $true }}
if (-not $refused) {{ throw 'Out-of-scope cleanup accepted' }}
""")
    assert result.returncode == 0, result.stdout + result.stderr
    assert not leaf.exists()
    assert (sibling / 'sentinel').exists()
    assert (outside / 'sentinel').exists()


def test_unreviewed_attribution_never_reports_green(tmp_path):
    result = run_script(tmp_path, """
function Invoke-Quick {}
function Invoke-BackendSuites {}
function git { '+ fixture generated with a tool'; $global:LASTEXITCODE = 0 }
$ReviewedAttribution = $false
$refused = $false
try { Invoke-Gates } catch { $refused = $true }
if (-not $refused) { throw 'Unreviewed matches reported green' }
""")
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'All gates green.' not in result.stdout


def test_failed_preflight_never_starts_full_backend(tmp_path):
    result = run_script(tmp_path, """
function Get-Python { 'unused-python' }
$script:seen = New-Object System.Collections.ArrayList
function Invoke-Step {
  param($Name, $LogName, $Body)
  [void]$script:seen.Add($Name)
  if ($Name -eq 'Frontend lint') { throw 'fixture lint failure' }
}
function Invoke-BackendSuites { throw 'Full suite must not start' }
$before = (Get-Location).Path
try { Invoke-Gates; throw 'A red gate returned successfully' }
catch { if ($_.Exception.Message -ne 'fixture lint failure') { throw } }
if (($script:seen -join ',') -ne 'Backend lint,Frontend lint') { throw 'Preflight continued after failure' }
if ((Get-Location).Path -ne $before) { throw 'Frontend directory was not restored' }
""")
    assert result.returncode == 0, result.stdout + result.stderr


def test_validation_environment_restores_inherited_values_on_failure(tmp_path):
    result = run_script(tmp_path, """
$env:LDS_CONFIG = 'caller-config'
$env:LDS_PLUGINS_DIR = 'caller-plugins'
$env:LDS_PLUGIN_DISTRIBUTION = 'caller-profile'
$env:LDS_ENV = $null
try {
  Invoke-IsolatedValidation {
    if ($env:LDS_PLUGINS_DIR -or $env:LDS_PLUGIN_DISTRIBUTION) { throw 'Inherited plugin state leaked' }
    if ($env:LDS_CONFIG -ne (Scratch 'config.json')) { throw 'Config is not isolated' }
    if ($env:LDS_ENV -ne (Scratch '.env')) { throw 'Secrets are not isolated' }
    if ($env:LDS_SYNC_SCRATCH -ne $script:Scratch) { throw 'Smoke boundary missing' }
    & $TestPythonExecutable -c "import os; assert 'LDS_PLUGIN_DISTRIBUTION' not in os.environ; assert 'LDS_PLUGIN_BUILD_MODE' not in os.environ; assert 'LDS_PLUGINS_DIR' not in os.environ"
    if ($LASTEXITCODE -ne 0) { throw 'Empty environment keys leaked into child processes' }
    throw 'fixture failure'
  }
} catch { if ($_.Exception.Message -ne 'fixture failure') { throw } }
if ($env:LDS_CONFIG -ne 'caller-config' -or $env:LDS_PLUGINS_DIR -ne 'caller-plugins' -or
    $env:LDS_PLUGIN_DISTRIBUTION -ne 'caller-profile' -or $env:LDS_ENV) { throw 'Caller environment was changed' }
""")
    assert result.returncode == 0, result.stdout + result.stderr


def test_receipt_uses_repository_root_not_native_current_directory(tmp_path):
    elsewhere = tmp_path / 'elsewhere'
    elsewhere.mkdir()
    result = run_script(tmp_path, f"""
[Environment]::CurrentDirectory = {quote(elsewhere)}
$script:RunId = 'fixture'
$script:ExitCode = 0
$Phase = 'Quick'
[void]$script:Results.Add([pscustomobject]@{{ Name='Fixture'; Exit=0; Seconds=1 }})
function git {{
  if ($args[1] -eq '--git-path') {{ '.git/lds-sync-validation' }} else {{ 'fixture-head' }}
  $global:LASTEXITCODE = 0
}}
Write-ValidationSummary
""")
    assert result.returncode == 0, result.stdout + result.stderr
    assert (tmp_path / '.git/lds-sync-validation/fixture.json').exists()
    assert not (elsewhere / '.git').exists()


def test_product_contracts_stay_separate_from_one_complete_host_suite(tmp_path):
    for name in ('alpha', 'bravo'):
        folder = tmp_path / 'bundled' / name / 'tests'
        folder.mkdir(parents=True)
        (folder / 'test_contract.py').write_text('def test_ok(): pass\n')
    result = run_script(tmp_path, """
function Get-Python { 'Test-Python' }
$script:calls = New-Object System.Collections.ArrayList
function Test-Python {
  [void]$script:calls.Add(($args -join '|').Replace([char]92, [char]47))
  $global:LASTEXITCODE = 0
}
Invoke-BackendSuites
if ($script:calls.Count -ne 3) { throw 'Products did not get independent processes' }
if ($script:calls[0] -notmatch 'bundled/alpha/tests' -or
    $script:calls[1] -notmatch 'bundled/bravo/tests') { throw 'Wrong product roots' }
if ($script:calls[2] -notmatch 'backend/tests\\|scripts/tests' -or
    $script:calls[2] -notmatch '-n\\|8\\|--dist\\|loadfile') { throw 'Incomplete host gate' }
""")
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize('phase,fail,expected', [('All', False, 'orient,sweep,gates'),
                                               ('Gates', True, 'gates')])
def test_main_runs_all_once_and_returns_failure_after_cleanup(tmp_path, phase, fail, expected):
    output = tmp_path / 'phases.txt'
    cleaned = tmp_path / 'cleaned.txt'
    result = run_script(tmp_path, f"""
$Phase = {quote(phase)}
$script:seen = New-Object System.Collections.ArrayList
function Invoke-Orient {{ [void]$script:seen.Add('orient') }}
function Resolve-UpstreamBranch {{ 'v2' }}
function Invoke-Sweep {{ param($Ref); [void]$script:seen.Add('sweep') }}
function Invoke-Baseline {{ throw 'All must not run a second full suite' }}
function Invoke-Gates {{ [void]$script:seen.Add('gates'); {'throw "fixture red"' if fail else ''} }}
function Write-ValidationSummary {{ ($script:seen -join ',') | Set-Content -LiteralPath {quote(output)} }}
function Remove-Scratch {{ 'cleaned' | Set-Content -LiteralPath {quote(cleaned)} }}
$main = @($ast.EndBlock.Statements | Where-Object {{ $_ -is [System.Management.Automation.Language.TryStatementAst] }})[-1]
Invoke-Expression $main.Extent.Text
""")
    assert result.returncode == (1 if fail else 0), result.stdout + result.stderr
    assert output.read_text(encoding='utf-8-sig').strip() == expected
    assert cleaned.exists()
