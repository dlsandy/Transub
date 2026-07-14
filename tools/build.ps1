# Transub Windows 打包脚本
param(
    [ValidateSet('all', 'dir', 'portable', 'nsis')]
    [string]$Target = 'all',
    [switch]$SkipTests,
    [switch]$SkipIcons
)

$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

Write-Step "检查 Node.js"
$nodeVersion = node -v
Write-Host "Node $nodeVersion"

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Write-Step "安装依赖 (npm install)"
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $SkipIcons) {
    Write-Step "生成应用图标 (Transub.png -> app.ico)"
    npm run icons
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $SkipTests) {
    Write-Step "运行单元测试"
    npm test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Step "打包前端资源"
npm run build:renderer
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Step "准备打包环境"
Get-Process -Name Transub -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$unpackedDir = Join-Path $root 'dist\win-unpacked'
if (Test-Path $unpackedDir) {
    Remove-Item -Recurse -Force $unpackedDir -ErrorAction SilentlyContinue
}

Write-Step "Electron 打包 ($Target)"
switch ($Target) {
    'dir' { npx electron-builder --win dir }
    'portable' { npx electron-builder --win portable }
    'nsis' { npx electron-builder --win nsis }
    default { npx electron-builder }
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Step "完成"
$distDir = Join-Path $root 'dist'
Get-ChildItem $distDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.exe', '.yml' } |
    ForEach-Object { Write-Host "  $($_.Name)" -ForegroundColor Green }

$unpacked = Join-Path $distDir 'win-unpacked\Transub.exe'
if (Test-Path $unpacked) {
    Write-Host "  win-unpacked\Transub.exe" -ForegroundColor Green
}

Write-Host ""
Write-Host "输出目录: $distDir"
