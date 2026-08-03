@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

REM Explorer double-click uses: cmd.exe /c ""path\build-win.bat""
REM Keep the window open in that case so failures are readable.
set "PAUSE_AT_END=0"
echo(%CMDCMDLINE%) | findstr /I /C:" /c " >nul
if not errorlevel 1 set "PAUSE_AT_END=1"

REM Canonical Windows packaging entry (wraps tools\build.ps1).
REM
REM   build-win.bat
REM       win.zip + update-manifest + block/delta + *-update.zip
REM   build-win.bat release
REM       same, with tests
REM   build-win.bat -Target zip
REM       other args forwarded to tools\build.ps1
REM
REM Publishes English *-win.zip only; CPU/CUDA full first-install packs discontinued.
REM Packaging stages under %%LOCALAPPDATA%%\Transub\packaging.

if /I "%~1"=="help" goto :help
if /I "%~1"=="/?" goto :help
if /I "%~1"=="-h" goto :help
if /I "%~1"=="--help" goto :help

set "PS_ARGS=-SkipTests"
set "REST="

if /I "%~1"=="release" (
  set "PS_ARGS="
  shift /1
  goto :collect_rest
)

:collect_rest
if "%~1"=="" goto :run
set "REST=!REST! %1"
shift /1
goto :collect_rest

:run
echo [build-win] powershell tools\build.ps1 !PS_ARGS!!REST!
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build.ps1" !PS_ARGS!!REST!
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
echo Artifacts: %~dp0dist\
echo   Transub-*-win.zip                     first-install / auto-update full zip
echo   website-update\*-update.zip           upload to official site
echo   update-manifest + block/delta zips
echo Log: %~dp0dist\build-win.log
if "%PAUSE_AT_END%"=="1" (
  echo.
  pause
)
exit /b 0

:help
echo.
echo build-win.bat - Windows package helper
echo.
echo   build-win.bat              win.zip + update bundle
echo   build-win.bat release      same, with tests
echo   build-win.bat -Target zip  forward to tools\build.ps1
echo.
echo npm equivalents:
echo   npm run dist            = package, skip tests
echo   npm run build:release   = package, with tests
echo.
echo English zip only; runtimes install via wizard / download center.
if "%PAUSE_AT_END%"=="1" (
  echo.
  pause
)
exit /b 0
