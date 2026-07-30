#requires -Version 5.1
<#
  stop_server.ps1 — stop this install of LoRA Dataset Studio cleanly.

  Order: ask the app to cancel its work, kill the listener's process tree,
  sweep leftovers whose ExecutablePath lives under this repo, stop Ollama
  (any ollama on the machine — we cannot tell whose), leave ComfyUI alone,
  then confirm /api/health is silent.

  Never taskkill /IM python.exe — every helper here is named python.exe and a
  blanket kill would take out ComfyUI, ai-toolkit, and unrelated Python.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Info([string]$msg) { Write-Host "[i] $msg" }
function Write-Warn([string]$msg) { Write-Host "[!] $msg" }
function Write-Ok([string]$msg)   { Write-Host "[OK] $msg" }
function Write-Err([string]$msg)  { Write-Host "[X] $msg" }

function Get-ConfigPort {
  $cfgCandidates = @()
  if ($env:LDS_CONFIG) { $cfgCandidates += $env:LDS_CONFIG }
  $dataDir = if ($env:LDS_DATA_DIR) { $env:LDS_DATA_DIR } else { Join-Path $Root 'data' }
  $cfgCandidates += (Join-Path $dataDir 'config.json')
  $cfgCandidates += (Join-Path $Root 'config.json')
  foreach ($p in $cfgCandidates) {
    if (-not (Test-Path -LiteralPath $p)) { continue }
    try {
      $json = Get-Content -LiteralPath $p -Raw -Encoding UTF8 | ConvertFrom-Json
      $port = $json.server.port
      if ($null -ne $port -and "$port" -match '^\d+$') { return [int]$port }
    } catch { }
  }
  return 5050
}

function Resolve-Port {
  if ($env:LDS_PORT -and "$env:LDS_PORT" -match '^\d+$') {
    return [int]$env:LDS_PORT
  }
  return Get-ConfigPort
}

function Get-ListenerPid([int]$Port) {
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($conn -and $conn.OwningProcess) { return [int]$conn.OwningProcess }
  } catch { }
  try {
    $lines = netstat -ano -p tcp 2>$null
    foreach ($line in $lines) {
      if ($line -notmatch 'LISTENING') { continue }
      if ($line -notmatch ":$Port\s") { continue }
      if ($line -match '\s(\d+)\s*$') { return [int]$Matches[1] }
    }
  } catch { }
  return $null
}

function Stop-PidTree([int]$ProcessId) {
  if ($ProcessId -le 0) { return }
  Write-Info "Killing process tree PID $ProcessId"
  & taskkill /F /T /PID $ProcessId 2>$null | Out-Null
}

function Get-TrainingPidFromDb {
  $dataDir = if ($env:LDS_DATA_DIR) { $env:LDS_DATA_DIR } else { Join-Path $Root 'data' }
  $db = Join-Path $dataDir 'studio.db'
  if (-not (Test-Path -LiteralPath $db)) { return $null }
  # Prefer Python+sqlite3 (always present next to the app); fall back quietly.
  $pyCandidates = @(
    (Join-Path $Root '.venv\Scripts\python.exe'),
    (Join-Path $Root '.python\python.exe')
  )
  $py = $pyCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $py) { return $null }
  $code = @"
import json, sqlite3, sys
try:
    con = sqlite3.connect(r'$($db.Replace('\','\\'))')
    row = con.execute("SELECT value FROM system_state WHERE key='training_pid'").fetchone()
    con.close()
    if not row or not row[0]:
        sys.exit(0)
    payload = json.loads(row[0])
    v = payload.get('v')
    if v is not None:
        print(int(v))
except Exception:
    pass
"@
  try {
    $out = & $py -c $code 2>$null
    if ($out -and "$out" -match '^\d+$') { return [int]$out }
  } catch { }
  return $null
}

function Stop-RepoPythonLeftovers {
  $rootNorm = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
  $rootLower = $rootNorm.ToLowerInvariant()
  $killed = 0
  try {
    $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        $_.ExecutablePath -and
        ($_.Name -match '^(python|pythonw)\.exe$') -and
        $_.ExecutablePath.ToLowerInvariant().StartsWith($rootLower)
      }
    foreach ($p in $procs) {
      Write-Info "Sweep leftover $($p.Name) PID $($p.ProcessId) ($($p.ExecutablePath))"
      & taskkill /F /T /PID $p.ProcessId 2>$null | Out-Null
      $killed++
    }
  } catch { }
  return $killed
}

function Stop-Ollama {
  $names = @('ollama', 'ollama app')
  $found = $false
  foreach ($n in $names) {
    $procs = Get-Process -Name $n -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
      $found = $true
      Write-Info "Stopping $($p.ProcessName) PID $($p.Id) (any Ollama on this machine — cannot tell whose)"
      try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch { }
      & taskkill /F /T /PID $p.Id 2>$null | Out-Null
    }
  }
  if (-not $found) {
    Write-Info "No Ollama process found"
  } else {
    Write-Warn "Stopped Ollama. This stops ANY Ollama on the machine, including one started by hand or shared with another tool."
  }
}

function Test-PortOpen([int]$Port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $iar = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(400)
    if ($ok -and $c.Connected) { $c.Close(); return $true }
    $c.Close()
  } catch { }
  return $false
}

function Invoke-StopEverything([int]$Port) {
  $base = "http://127.0.0.1:$Port"
  try {
    # Plant CSRF cookie, then POST with the token. Short timeouts: a wedged
    # server must not stall this script.
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $tokResp = Invoke-WebRequest -Uri "$base/api/csrf-token" -Method GET `
      -WebSession $session -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    $tok = ($tokResp.Content | ConvertFrom-Json).csrf_token
    if (-not $tok) {
      $cookie = $session.Cookies.GetCookies($base) | Where-Object { $_.Name -eq 'csrf_token' } | Select-Object -First 1
      if ($cookie) { $tok = $cookie.Value }
    }
    $headers = @{}
    if ($tok) { $headers['X-CSRFToken'] = $tok }
    $null = Invoke-WebRequest -Uri "$base/api/system/stop-everything" -Method POST `
      -WebSession $session -Headers $headers -ContentType 'application/json' `
      -Body '{}' -TimeoutSec 8 -UseBasicParsing -ErrorAction Stop
    Write-Ok "Asked the app to stop its work (/api/system/stop-everything)"
    return $true
  } catch {
    Write-Warn "Could not reach stop-everything (server may already be down): $($_.Exception.Message)"
    return $false
  }
}

function Test-HealthAlive([int]$Port) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -Method GET `
      -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch {
    return $false
  }
}

# --- main --------------------------------------------------------------------

$port = Resolve-Port
Write-Info "Stopping LoRA Dataset Studio on port $port (repo: $Root)"

$listenerBefore = Get-ListenerPid $port
if (-not $listenerBefore) {
  Write-Info "No process is listening on port $port"
} else {
  Write-Info "Listener PID $listenerBefore owns port $port"
  Invoke-StopEverything $port | Out-Null
  Start-Sleep -Milliseconds 500
}

$listenerPid = Get-ListenerPid $port
if (-not $listenerPid) { $listenerPid = $listenerBefore }
if ($listenerPid) {
  Stop-PidTree $listenerPid
} else {
  Write-Info "No listener PID to kill"
}

$trainPid = Get-TrainingPidFromDb
if ($trainPid) {
  Write-Info "Killing recorded training_pid $trainPid"
  Stop-PidTree $trainPid
}

$swept = Stop-RepoPythonLeftovers
if ($swept -gt 0) {
  Write-Info "Swept $swept leftover process(es) under this install"
} else {
  Write-Info "No leftover Python processes under this install"
}

Stop-Ollama

if (Test-PortOpen 8188) {
  Write-Info "ComfyUI still answers on port 8188 (left alone — LDS never launches it)"
} else {
  Write-Info "Nothing answering on ComfyUI port 8188"
}

$alive = $false
for ($i = 0; $i -lt 10; $i++) {
  if (Test-HealthAlive $port) { $alive = $true; Start-Sleep -Milliseconds 300 } else { $alive = $false; break }
}

$stillListening = Get-ListenerPid $port
if (-not $alive -and -not $stillListening) {
  Write-Ok "Server is stopped — /api/health no longer answers on port $port"
  exit 0
}

Write-Warn "Something may still be alive on port $port"
if ($stillListening) { Write-Warn "  listener PID: $stillListening" }
if ($alive) { Write-Warn "  /api/health still answers" }
exit 1
