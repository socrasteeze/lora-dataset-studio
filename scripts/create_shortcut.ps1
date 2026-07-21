#requires -Version 5.1
<#
.SYNOPSIS
  Create a Windows desktop shortcut (.lnk) to start.bat, using the app's own icon.

.DESCRIPTION
  Double-click "Create Desktop Shortcut.bat" at the repo root, or run this script
  directly. Works both from a git checkout (icon at packaging\icon.ico) and an
  extracted release ZIP (icon.ico copied next to start.bat by the release build).
#>
[CmdletBinding()]
param(
  [string]$Destination = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $Root 'start.bat'
if (-not (Test-Path $Target)) { throw "start.bat not found at $Target -- run this from the app's scripts folder." }

# Release ZIPs ship icon.ico at the bundle root; a git checkout only has the
# packaging/ copy the icon is generated into. Try both so either layout works.
$Icon = Join-Path $Root 'icon.ico'
if (-not (Test-Path $Icon)) { $Icon = Join-Path $Root 'packaging\icon.ico' }
if (-not (Test-Path $Icon)) { $Icon = $null }

$LinkPath = Join-Path $Destination 'LoRA Dataset Studio.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($LinkPath)
$shortcut.TargetPath = $Target
$shortcut.WorkingDirectory = $Root
$shortcut.Description = 'LoRA Dataset Studio'
if ($Icon) { $shortcut.IconLocation = "$Icon,0" }
$shortcut.Save()

Write-Host "Created shortcut: $LinkPath"
