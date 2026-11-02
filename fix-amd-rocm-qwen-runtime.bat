@echo off
setlocal EnableExtensions DisableDelayedExpansion

REM ASCII-only on purpose: Chinese Windows cmd.exe parses .bat as GBK/ANSI.
REM UTF-8 Chinese comments/strings get mangled into fake commands (D, +rocm..., time).

cd /d "%~dp0" 2>nul
set "ROOT=%CD%\"
set "LOG=%ROOT%fix-amd-rocm-qwen-runtime.log"

REM Create log immediately so a crash still leaves a file.
> "%LOG%" echo fix-amd-rocm-qwen-runtime.bat start
>>"%LOG%" echo ROOT=%ROOT%
>>"%LOG%" echo TIME=%DATE% %TIME%

set "PY="
set "CHECK_PY="
set "GFX=%~1"
if "%GFX%"=="" set "GFX=gfx1201"
if /I "%GFX%"=="device-all" set "GFX=all"

if exist "%ROOT%transub-engine\runtime\python.exe" set "PY=%ROOT%transub-engine\runtime\python.exe"
if not defined PY if exist "%ROOT%..\transub-engine\runtime\python.exe" goto :RELOCATE_ROOT
if not defined PY if exist "%ROOT%runtime\python.exe" set "PY=%ROOT%runtime\python.exe"
goto :AFTER_FIND_PY

:RELOCATE_ROOT
pushd "%ROOT%.."
set "ROOT=%CD%\"
set "PY=%CD%\transub-engine\runtime\python.exe"
set "LOG=%CD%\fix-amd-rocm-qwen-runtime.log"
popd
> "%LOG%" echo fix-amd-rocm-qwen-runtime.bat start relocated ROOT
>>"%LOG%" echo ROOT=%ROOT%

:AFTER_FIND_PY

if exist "%~dp0fix-amd-rocm-qwen-check.py" set "CHECK_PY=%~dp0fix-amd-rocm-qwen-check.py"
if not defined CHECK_PY if exist "%ROOT%fix-amd-rocm-qwen-check.py" set "CHECK_PY=%ROOT%fix-amd-rocm-qwen-check.py"

echo.
echo ========================================
echo   AMD ROCm / Qwen runtime fix v3
echo ========================================
echo Bat folder:
echo   %ROOT%
echo Engine Python:
if defined PY (echo   %PY%) else (echo   NOT FOUND)
echo Target gfx:
echo   %GFX%
echo Log file:
echo   %LOG%
echo.
>>"%LOG%" echo PY=%PY%
>>"%LOG%" echo GFX=%GFX%
>>"%LOG%" echo CHECK_PY=%CHECK_PY%

if not defined PY (
  echo [ERROR] Missing engine Python:
  echo   transub-engine\runtime\python.exe
  echo Put this bat next to transub.exe
  >>"%LOG%" echo ERROR missing python
  goto :END
)
if not exist "%PY%" (
  echo [ERROR] Invalid Python path:
  echo   %PY%
  >>"%LOG%" echo ERROR invalid python path
  goto :END
)

echo Steps:
echo   0. Stop Transub / engine
echo   1. Uninstall old torch / torchaudio / torchvision
echo   2. Install mpmath + ROCm 10.1 stack
echo   3. Re-pin numpy less than 2.5
echo   4. Self-check
echo.
echo Need network: stable.repo.amd.com
echo Do NOT install CUDA PyTorch afterward.
echo.
echo Press any key to start...
pause >nul

echo.
echo [0/5] Stopping Transub / engine...
>>"%LOG%" echo step0 stop processes
taskkill /F /IM transub.exe >nul 2>&1
taskkill /F /IM Transub.exe >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -like '*\transub-engine\runtime\python.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
ping -n 3 127.0.0.1 >nul

echo.
echo [1/5] Uninstalling previous torch stack...
>>"%LOG%" echo step1 uninstall
"%PY%" -m pip uninstall -y torch torchaudio torchvision >>"%LOG%" 2>&1
"%PY%" -m pip uninstall -y amd-torch-device-gfx1201 amd-torch-device-gfx1200 amd-torch-device-gfx1100 amd-torch-device-gfx1101 amd-torchvision-device-gfx1201 amd-torchvision-device-gfx1200 amd-torchvision-device-gfx1100 amd-torchvision-device-gfx1101 >>"%LOG%" 2>&1
if exist "%ROOT%transub-engine\runtime\Lib\site-packages\torchaudio" rmdir /S /Q "%ROOT%transub-engine\runtime\Lib\site-packages\torchaudio" >>"%LOG%" 2>&1
if exist "%ROOT%transub-engine\runtime\Lib\site-packages\torch" rmdir /S /Q "%ROOT%transub-engine\runtime\Lib\site-packages\torch" >>"%LOG%" 2>&1
if exist "%ROOT%transub-engine\runtime\Lib\site-packages\torchvision" rmdir /S /Q "%ROOT%transub-engine\runtime\Lib\site-packages\torchvision" >>"%LOG%" 2>&1

echo.
echo [2/5] Cleaning mpmath cache + reinstall mpmath...
>>"%LOG%" echo step2 mpmath
if defined LOCALAPPDATA del /F /Q "%LOCALAPPDATA%\TransubEngine\wheel-cache\mpmath-1.5.0a1-py3-none-any.whl" >nul 2>&1
"%PY%" -m pip install --upgrade --force-reinstall --prefer-binary "mpmath>=1.3.0,<1.5" >>"%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] mpmath install failed. See log.
  >>"%LOG%" echo ERROR mpmath failed
  goto :END
)

echo.
echo [3/5] Installing ROCm 10.1 stack. This may take several minutes...
>>"%LOG%" echo step3 rocm101
set "INDEX=https://stable.repo.amd.com/rocm/whl-next/"
set "EXTRA=https://pypi.org/simple"
REM AMD docs pair for torch 2.12: rocm10.1.0 + torchaudio 2.11.0+rocm10.1.0
REM Avoid torchaudio 2.11.0.2+rocm10.0.0 - Win entry-point torch_new_stable_ivalue.

if /I "%GFX%"=="all" goto :INSTALL_ALL
goto :INSTALL_GFX

:INSTALL_ALL
echo   torch[device-all]==2.12.0+rocm10.1.0
echo   torchvision[device-all]==0.27.0+rocm10.1.0
echo   torchaudio==2.11.0+rocm10.1.0
>>"%LOG%" echo install device-all rocm10.1.0
"%PY%" -m pip install --upgrade --force-reinstall --index-url "%INDEX%" --extra-index-url "%EXTRA%" "torch[device-all]==2.12.0+rocm10.1.0" "torchvision[device-all]==0.27.0+rocm10.1.0" "torchaudio==2.11.0+rocm10.1.0" >>"%LOG%" 2>&1
if errorlevel 1 goto :FALLBACK_ALL
goto :AFTER_TORCH

:INSTALL_GFX
echo   torch device-%GFX% == 2.12.0+rocm10.1.0
echo   torchvision device-%GFX% == 0.27.0+rocm10.1.0
echo   torchaudio==2.11.0+rocm10.1.0
echo   amd-torch-device-%GFX%==2.12.0+rocm10.1.0
>>"%LOG%" echo install gfx=%GFX% rocm10.1.0
"%PY%" -m pip install --upgrade --force-reinstall --index-url "%INDEX%" --extra-index-url "%EXTRA%" "torch[device-%GFX%]==2.12.0+rocm10.1.0" "torchvision[device-%GFX%]==0.27.0+rocm10.1.0" "torchaudio==2.11.0+rocm10.1.0" "amd-torch-device-%GFX%==2.12.0+rocm10.1.0" "amd-torchvision-device-%GFX%==0.27.0+rocm10.1.0" >>"%LOG%" 2>&1
if errorlevel 1 goto :FALLBACK_GFX
goto :AFTER_TORCH

:FALLBACK_ALL
echo.
echo [WARN] ROCm 10.1 failed. Trying rocm10.0 + torchaudio 2.11.0 ...
>>"%LOG%" echo fallback device-all rocm10.0.0
"%PY%" -m pip install --upgrade --force-reinstall --index-url "%INDEX%" --extra-index-url "%EXTRA%" "torch[device-all]==2.12.0+rocm10.0.0" "torchvision[device-all]==0.27.0+rocm10.0.0" "torchaudio==2.11.0+rocm10.0.0" >>"%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] ROCm install failed. See log.
  >>"%LOG%" echo ERROR rocm install failed
  goto :END
)
goto :AFTER_TORCH

:FALLBACK_GFX
echo.
echo [WARN] ROCm 10.1 failed. Trying rocm10.0 + torchaudio 2.11.0 ...
>>"%LOG%" echo fallback gfx=%GFX% rocm10.0.0
"%PY%" -m pip install --upgrade --force-reinstall --index-url "%INDEX%" --extra-index-url "%EXTRA%" "torch[device-%GFX%]==2.12.0+rocm10.0.0" "torchvision[device-%GFX%]==0.27.0+rocm10.0.0" "torchaudio==2.11.0+rocm10.0.0" "amd-torch-device-%GFX%==2.12.0+rocm10.0.0" "amd-torchvision-device-%GFX%==0.27.0+rocm10.0.0" >>"%LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] ROCm install failed. Try: fix-amd-rocm-qwen-runtime.bat all
  >>"%LOG%" echo ERROR rocm install failed
  goto :END
)

:AFTER_TORCH
echo.
echo [4/5] Re-pinning numpy less than 2.5 ...
>>"%LOG%" echo step4 numpy pin
"%PY%" -m pip install --upgrade --force-reinstall --prefer-binary "numpy>=2.0,<2.5" >>"%LOG%" 2>&1
if errorlevel 1 (
  echo [WARN] numpy re-pin failed
  >>"%LOG%" echo WARN numpy pin failed
)

echo.
echo [5/5] Self-check...
>>"%LOG%" echo step5 self-check
if defined CHECK_PY if exist "%CHECK_PY%" (
  echo   using check script
  "%PY%" "%CHECK_PY%" >>"%LOG%" 2>&1
  "%PY%" "%CHECK_PY%"
) else (
  echo   inline check
  "%PY%" -c "import torch,torchaudio,mpmath,numpy; from mpmath.libmp import bitcount; tv=str(torch.__version__); av=str(torchaudio.__version__); nv=str(numpy.__version__); print('torch=',tv); print('torchaudio=',av); print('numpy=',nv); assert '+rocm' in tv.lower(); assert '+rocm' in av.lower() or '.rocm' in av.lower(); assert not nv.startswith('2.5'); print('mpmath=',mpmath.__version__,'OK'); print('OK')" >>"%LOG%" 2>&1
  "%PY%" -c "import torch,torchaudio,mpmath,numpy; from mpmath.libmp import bitcount; tv=str(torch.__version__); av=str(torchaudio.__version__); nv=str(numpy.__version__); print('torch=',tv); print('torchaudio=',av); print('numpy=',nv); assert '+rocm' in tv.lower(); assert '+rocm' in av.lower() or '.rocm' in av.lower(); assert not nv.startswith('2.5'); print('mpmath=',mpmath.__version__,'OK'); print('OK')"
)
if errorlevel 1 (
  echo [ERROR] Self-check failed. See log:
  echo   %LOG%
  >>"%LOG%" echo ERROR self-check failed
  goto :END
)

echo.
echo ========================================
echo   DONE. Restart Transub and run Qwen.
echo   Do not click CUDA PyTorch repair.
echo ========================================
>>"%LOG%" echo DONE ok

:END
echo.
echo Log file:
echo   %LOG%
echo Window stays open. Press any key to close.
pause >nul
endlocal
exit /b 0
