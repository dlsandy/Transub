@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "TRANSUB_ENGINE_HOME=%CD%"
if not exist "runtime\python.exe" (
  echo [error] runtime\python.exe missing
  exit /b 1
)
"runtime\python.exe" -m transub_engine %*
endlocal
