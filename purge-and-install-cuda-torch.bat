@echo off
REM Purge broken/old torch from Transub engine, then optionally install dragged .whl
REM Place next to transub.exe. RTX 50xx + CUDA 13.x driver -> use cu130 wheels.
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul 2>&1

set "ROOT=%~dp0"
set "PY=%ROOT%transub-engine\runtime\python.exe"
set "SP=%ROOT%transub-engine\runtime\Lib\site-packages"

if not exist "%PY%" (
  echo [ERROR] Missing %PY%
  echo Put this bat next to transub.exe
  pause
  exit /b 1
)

echo.
echo ========================================
echo   Purge old/broken Torch then reinstall
echo ========================================
echo Engine Python:
echo   %PY%
echo.

echo Stopping Transub / engine...
taskkill /F /IM transub.exe >nul 2>&1
taskkill /F /IM Transub.exe >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -like '*\transub-engine\runtime\python.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo [1/3] pip uninstall torch / torchaudio / torchvision ...
"%PY%" -m pip uninstall -y torch torchaudio torchvision

echo.
echo [2/3] Force-remove leftover folders under site-packages ...
set "TRANSUB_SP=%SP%"
powershell -NoProfile -ExecutionPolicy Bypass -Command " $sp = $env:TRANSUB_SP; if (-not (Test-Path -LiteralPath $sp)) { Write-Host '[ERROR] site-packages missing'; exit 1 }; $names = Get-ChildItem -LiteralPath $sp -Force -ErrorAction SilentlyContinue; foreach ($item in $names) { $n = $item.Name; $hit = $false; if ($n -eq 'torch' -or $n -eq 'torchaudio' -or $n -eq 'torchvision' -or $n -eq 'functorch') { $hit = $true }; if ($n -like 'torch-*' -or $n -like 'torchaudio-*' -or $n -like 'torchvision-*' -or $n -like 'functorch-*') { $hit = $true }; if ($n -like '~*torch*' -or $n -like '~*orch*') { $hit = $true }; if ($n -like 'torch.libs' -or $n -like 'torchaudio.libs' -or $n -like 'torchvision.libs') { $hit = $true }; if ($hit) { Write-Host ('  remove ' + $n); Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction SilentlyContinue } }; Write-Host '[OK] leftover torch folders cleared.' "

echo.
echo Verify torch metadata (must FAIL / not found):
"%PY%" -m pip show torch
"%PY%" -c "from importlib.metadata import version; print(version('torch'))" 2>nul
if not errorlevel 1 (
  echo.
  echo [WARN] torch metadata still visible. Close ALL python/Transub and run this bat again.
)

if "%~1"=="" (
  echo.
  echo [3/3] No .whl dragged.
  echo Next: drag torch-*.whl + torchaudio-*.whl ^(cu130^) onto THIS bat,
  echo or onto install-cuda-torch-wheels.bat after purge.
  echo.
  pause
  exit /b 0
)

echo.
echo [3/3] Installing dragged wheels ...
if not exist "%ROOT%install-cuda-torch-wheels.bat" (
  echo [ERROR] Missing install-cuda-torch-wheels.bat in the same folder.
  pause
  exit /b 1
)
if not exist "%ROOT%install-cuda-torch-wheels.ps1" (
  echo [ERROR] Missing install-cuda-torch-wheels.ps1 in the same folder.
  pause
  exit /b 1
)

call "%ROOT%install-cuda-torch-wheels.bat" %*
exit /b %ERRORLEVEL%
