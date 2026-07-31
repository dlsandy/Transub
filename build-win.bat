@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

REM Explorer double-click uses: cmd.exe /c ""path\build-win.bat""
REM Keep the window open in that case so failures are readable (avoid 闪退).
set "PAUSE_AT_END=0"
echo(%CMDCMDLINE%) | findstr /I /C:" /c " >nul
if not errorlevel 1 set "PAUSE_AT_END=1"

REM Packaging stages under %LOCALAPPDATA%\Transub\packaging to avoid Cursor locking files in the repo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build.ps1" -SkipTests %*
set EXITCODE=%ERRORLEVEL%

if not "%EXITCODE%"=="0" (
  echo.
  echo [build-win] failed, exit code %EXITCODE%
  echo Common fix: close running Transub.exe, then retry.
  echo Staging is outside the repo: %LOCALAPPDATA%\Transub\packaging
  echo Log: %~dp0dist\build-win.log
  if "%PAUSE_AT_END%"=="1" (
    echo.
    pause
  )
  exit /b %EXITCODE%
)

echo.
echo [build-win] ok
echo Log: %~dp0dist\build-win.log
if "%PAUSE_AT_END%"=="1" (
  echo.
  pause
)
exit /b 0
