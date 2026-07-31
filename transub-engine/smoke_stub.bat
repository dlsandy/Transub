@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "runtime\python.exe" (
  echo runtime\python.exe missing
  pause
  exit /b 1
)
set TRANSUB_ENGINE_STUB=1
set TRANSUB_ENGINE_HOME=%CD%
"runtime\python.exe" -m transub_engine health
"runtime\python.exe" -m transub_engine capabilities
echo stub smoke done.
pause
endlocal
