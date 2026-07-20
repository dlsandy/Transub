# Transub Windows build script
param(
    [ValidateSet('all', 'dir', 'zip', 'nsis')]
    [string]$Target = 'all',
    [switch]$SkipTests,
    [switch]$SkipIcons
)

# Keep npm stderr warnings from becoming terminating errors
$ErrorActionPreference = 'Continue'

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Write-Step([string]$Message) {
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Stop-PackagingLocks {
    $names = @('Transub', 'electron', 'app-builder', 'rcedit')
    foreach ($name in $names) {
        Get-Process -Name $name -ErrorAction SilentlyContinue |
            Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ExecutablePath -and (
                $_.ExecutablePath -like "$root\dist\*" -or
                $_.ExecutablePath -like "$root\.packaging\*" -or
                $_.ExecutablePath -like "$env:LOCALAPPDATA\Transub\packaging\*" -or
                $_.ExecutablePath -like "$root\node_modules\electron\dist\electron.exe"
            )
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    Start-Sleep -Milliseconds 500
}

function Remove-DirWithRetry([string]$Path, [int]$Attempts = 8) {
    if (-not (Test-Path -LiteralPath $Path)) { return $true }
    for ($i = 1; $i -le $Attempts; $i++) {
        Stop-PackagingLocks
        try {
            # Clear read-only / archive bits that can block delete on Windows
            Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
                ForEach-Object {
                    try { $_.Attributes = 'Normal' } catch { }
                }
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        } catch {
        }
        if (-not (Test-Path -LiteralPath $Path)) { return $true }
        cmd /c "rmdir /s /q `"$Path`"" 2>$null | Out-Null
        if (-not (Test-Path -LiteralPath $Path)) { return $true }
        # Rename aside then delete — works when delete is blocked but rename is allowed
        $aside = "$Path.__old_$i"
        try {
            Rename-Item -LiteralPath $Path -NewName (Split-Path $aside -Leaf) -ErrorAction Stop
            Start-Sleep -Milliseconds 200
            Remove-Item -LiteralPath $aside -Recurse -Force -ErrorAction SilentlyContinue
        } catch {
        }
        if (-not (Test-Path -LiteralPath $Path)) { return $true }
        Start-Sleep -Milliseconds (400 * $i)
    }
    return $false
}

function Get-PackagingRoot {
    # Outside the Cursor workspace to avoid IDE file locks on win-unpacked / app.asar
    $base = Join-Path $env:LOCALAPPDATA 'Transub\packaging'
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    return (Join-Path $base $stamp)
}

Write-Step 'Check Node.js'
$nodeVersion = node -v
Write-Host "Node $nodeVersion"

$nodeMajor = [int](($nodeVersion -replace '^v', '').Split('.')[0])
if ($nodeMajor -lt 22) {
    Write-Host "Electron 43 requires Node.js >= 22.12, current: $nodeVersion" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Write-Step 'npm install'
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $SkipIcons) {
    Write-Step 'Generate icons'
    npm run icons
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $SkipTests) {
    Write-Step 'Run tests'
    npm test
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Step 'Build renderer'
npm run build:renderer
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Step 'Prepare packaging'
Stop-PackagingLocks
$distDir = Join-Path $root 'dist'
$packDir = Get-PackagingRoot
# Also try to clear leftover in-repo .packaging (legacy) without failing the build
Remove-DirWithRetry (Join-Path $root '.packaging') | Out-Null

New-Item -ItemType Directory -Path $packDir -Force | Out-Null
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
Write-Host "Staging dir: $packDir"

Write-Step "Electron build ($Target)"
$configArg = "--config.directories.output=$packDir"
# Avoid electron-builder publishing noise; we only need local artifacts
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
switch ($Target) {
    'dir' { npx --yes electron-builder --win dir $configArg --publish never }
    'zip' { npx --yes electron-builder --win zip $configArg --publish never }
    'nsis' { npx --yes electron-builder --win nsis $configArg --publish never }
    default { npx --yes electron-builder $configArg --publish never }
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "electron-builder failed with exit code $LASTEXITCODE" -ForegroundColor Red
    Write-Host "If EPERM/EBUSY persists: close Transub, pause antivirus scan on LocalAppData\Transub, retry." -ForegroundColor Yellow
    exit $LASTEXITCODE
}

Write-Step 'Copy artifacts to dist'
$copied = 0
$pkgVersion = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$wantedZip = "Transub-$pkgVersion-win.zip"

Get-ChildItem $packDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.exe', '.yml', '.blockmap', '.zip' } |
    ForEach-Object {
        $destName = $_.Name
        if ($_.Extension -eq '.zip' -and $destName -ne $wantedZip) {
            $destName = $wantedZip
        }
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $distDir $destName) -Force
        Write-Host "  copied $destName" -ForegroundColor Green
        $copied++
    }

$packUnpacked = Join-Path $packDir 'win-unpacked'
$distUnpacked = Join-Path $distDir 'win-unpacked'
if (Test-Path -LiteralPath $packUnpacked) {
    if (Remove-DirWithRetry $distUnpacked) {
        # robocopy is more reliable than Copy-Item for large trees on Windows
        $rc = Start-Process -FilePath 'robocopy.exe' -ArgumentList @(
            "`"$packUnpacked`"", "`"$distUnpacked`"", '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np'
        ) -Wait -PassThru -NoNewWindow
        # robocopy exit codes 0-7 are success
        if ($rc.ExitCode -le 7 -and (Test-Path (Join-Path $distUnpacked 'Transub.exe'))) {
            Write-Host '  copied win-unpacked\' -ForegroundColor Green
        } else {
            Write-Host "  robocopy to dist\win-unpacked exit=$($rc.ExitCode); using staging copy" -ForegroundColor Yellow
        }
    } else {
        Write-Host '  skip dist\win-unpacked overwrite (locked); installers are in dist\' -ForegroundColor Yellow
        Write-Host "  unpacked app: $packUnpacked" -ForegroundColor Yellow
    }
}

if ($copied -eq 0 -and $Target -ne 'dir') {
    Write-Host 'No installer artifacts found in staging.' -ForegroundColor Red
    exit 1
}

Write-Step 'Done'
Get-ChildItem $distDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.exe', '.yml', '.zip' } |
    ForEach-Object { Write-Host "  $($_.Name)" -ForegroundColor Green }

$unpackedExe = Join-Path $distUnpacked 'Transub.exe'
if (Test-Path $unpackedExe) {
    Write-Host '  win-unpacked\Transub.exe' -ForegroundColor Green
} elseif (Test-Path (Join-Path $packUnpacked 'Transub.exe')) {
    Write-Host "  staging win-unpacked\Transub.exe" -ForegroundColor Green
}

Write-Host ''
Write-Host "Output: $distDir"
Write-Host "Staging: $packDir"
