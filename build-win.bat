@echo off

chcp 65001 >nul

cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -File tools/build.ps1 -SkipTests