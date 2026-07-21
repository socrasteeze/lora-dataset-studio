@echo off
setlocal
REM ============================================================================
REM  Double-click to add a Desktop shortcut to LoRA Dataset Studio -- it points
REM  at start.bat and uses the app's own icon instead of a generic batch icon.
REM ============================================================================

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create_shortcut.ps1"
if errorlevel 1 (
  echo.
  echo [X] Could not create the shortcut -- see the message above.
  echo.
  pause
  exit /b 1
)

echo.
echo [OK] Shortcut created on your Desktop.
echo.
pause
