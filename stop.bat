@echo off
setlocal
REM ============================================================================
REM  Stop LoRA Dataset Studio: cancel in-flight work, kill the server process
REM  tree (and leftovers from this install), and stop Ollama. Leaves ComfyUI
REM  alone -- LDS never launches it. Double-click or run from a terminal.
REM ============================================================================

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop_server.ps1"
if errorlevel 1 (
  echo.
  echo [X] Stop did not finish cleanly -- see the message above.
  echo.
  pause
  exit /b 1
)

echo.
pause
