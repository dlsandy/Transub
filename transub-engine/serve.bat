@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
set "TRANSUB_ENGINE_HOME=%CD%"
if not exist "runtime\python.exe" (
  echo [error] runtime\python.exe missing — rebuild with scripts\build_dist.py
  pause
  exit /b 1
)
echo Transub Engine 0.1.0 — serve http://127.0.0.1:8765
"runtime\python.exe" -m transub_engine serve --host 127.0.0.1 --port 8765
echo.
pause
endlocal
