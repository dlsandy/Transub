@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Packaging stages under %%LOCALAPPDATA%%\Transub\packaging to avoid Cursor locking files in the repo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build.ps1" -SkipTests %*
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo [build-win] failed, exit code %EXITCODE%
  echo Common fix: close running Transub.exe, then retry.
  echo Staging is outside the repo: %%LOCALAPPDATA%%\Transub\packaging
  exit /b %EXITCODE%
)
exit /b 0
