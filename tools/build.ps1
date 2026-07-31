# Transub Windows build script
param(
    [ValidateSet('all', 'dir', 'zip', 'nsis')]
    [string]$Target = 'all',
    [switch]$SkipTests,
    [switch]$SkipIcons
)

# Keep npm/node stderr warnings from becoming terminating errors (PS 7+).
$ErrorActionPreference = 'Continue'
if (Test-Path variable:/PSNativeCommandUseErrorActionPreference) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$distDirEarly = Join-Path $root 'dist'
if (-not (Test-Path -LiteralPath $distDirEarly)) {
    New-Item -ItemType Directory -Path $distDirEarly -Force | Out-Null
}
$buildLog = Join-Path $distDirEarly 'build-win.log'
function Write-BuildLog([string]$Message) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $buildLog -Value "[$stamp] $Message" -Encoding UTF8 -ErrorAction SilentlyContinue
}
try {
    Set-Content -LiteralPath $buildLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] build start Target=$Target" -Encoding UTF8
} catch { }

function Write-Step([string]$Message) {
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
    Write-BuildLog $Message
}

function Invoke-Npm([string[]]$NpmArgs) {
    # Run via cmd so PowerShell does not wrap stderr as NativeCommandError.
    # Start-Process preserves a reliable ExitCode (pipeline | ForEach can clobber $LASTEXITCODE).
    $argLine = ($NpmArgs | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }) -join ' '
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', "npm $argLine") `
        -Wait -PassThru -NoNewWindow
    return [int]$p.ExitCode
}

function Invoke-Npx([string[]]$NpxArgs) {
    $argLine = ($NpxArgs | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }) -join ' '
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', "npx $argLine") `
        -Wait -PassThru -NoNewWindow
    return [int]$p.ExitCode
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

try {

Write-Step 'Check Node.js'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host 'Node.js not found in PATH. Install Node.js >= 22.12, then reopen the terminal.' -ForegroundColor Red
    Write-BuildLog 'Node.js missing from PATH'
    exit 1
}
$nodeVersion = (& node -v 2>$null | Out-String).Trim()
if (-not $nodeVersion) {
    Write-Host 'Failed to read Node.js version.' -ForegroundColor Red
    exit 1
}
Write-Host "Node $nodeVersion"
Write-BuildLog "Node $nodeVersion"

$nodeMajor = 0
try {
    $nodeMajor = [int](($nodeVersion -replace '^v', '').Split('.')[0])
} catch {
    Write-Host "Unrecognized Node.js version: $nodeVersion" -ForegroundColor Red
    exit 1
}
if ($nodeMajor -lt 22) {
    Write-Host "Electron 43 requires Node.js >= 22.12, current: $nodeVersion" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Write-Step 'npm install'
    $rc = Invoke-Npm @('install')
    if ($rc -ne 0) { exit $rc }
}

if (-not $SkipIcons) {
    Write-Step 'Generate icons'
    $rc = Invoke-Npm @('run', 'icons')
    if ($rc -ne 0) { exit $rc }
}

if (-not $SkipTests) {
    Write-Step 'Run tests'
    $rc = Invoke-Npm @('test')
    if ($rc -ne 0) { exit $rc }
}

Write-Step 'Build renderer'
$rc = Invoke-Npm @('run', 'build:renderer')
if ($rc -ne 0) { exit $rc }

Write-Step 'Build closed Pro module (_advanced)'
$rc = Invoke-Npm @('run', 'build:advanced')
if ($rc -ne 0) { exit $rc }

Write-Step 'Ensure bundled engine models'
$rc = Invoke-Npm @('run', 'ensure:bundled-models')
if ($rc -ne 0) { exit $rc }

Write-Step 'Verify packaging inputs'
$rc = Invoke-Npm @('run', 'verify:packaging')
if ($rc -ne 0) { exit $rc }

Write-Step 'Prepare packaging'
Stop-PackagingLocks
$distDir = Join-Path $root 'dist'
$packDir = Get-PackagingRoot
# Also try to clear leftover in-repo .packaging (legacy) without failing the build
Remove-DirWithRetry (Join-Path $root '.packaging') | Out-Null

New-Item -ItemType Directory -Path $packDir -Force | Out-Null
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
Write-Host "Staging dir: $packDir"
Write-BuildLog "Staging dir: $packDir"

Write-Step "Electron build ($Target)"
$configArg = "--config.directories.output=$packDir"
# Avoid electron-builder publishing noise; we only need local artifacts
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
switch ($Target) {
    'dir' { $rc = Invoke-Npx @('--yes', 'electron-builder', '--win', 'dir', $configArg, '--publish', 'never') }
    'zip' { $rc = Invoke-Npx @('--yes', 'electron-builder', '--win', 'zip', $configArg, '--publish', 'never') }
    'nsis' { $rc = Invoke-Npx @('--yes', 'electron-builder', '--win', 'nsis', $configArg, '--publish', 'never') }
    default { $rc = Invoke-Npx @('--yes', 'electron-builder', $configArg, '--publish', 'never') }
}
if ($rc -ne 0) {
    Write-Host "electron-builder failed with exit code $rc" -ForegroundColor Red
    Write-Host "If EPERM/EBUSY persists: close Transub, pause antivirus scan on LocalAppData\Transub, retry." -ForegroundColor Yellow
    Write-BuildLog "electron-builder failed exit=$rc"
    exit $rc
}

$asarPath = Join-Path $packDir 'win-unpacked\resources\app.asar'
if (Test-Path -LiteralPath $asarPath) {
    Write-Step 'Verify packed asar'
    cmd.exe /c "node tools/verify-packaging.js --asar-root=`"$asarPath`""
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Step 'Copy artifacts to dist'
$copied = 0
# package.json is UTF-8; default Get-Content uses the system code page and breaks ConvertFrom-Json on Chinese Windows
$pkgVersion = (Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$wantedZip = "Transub-$pkgVersion-win.zip"

function Unblock-Tree([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
        Unblock-File -ErrorAction SilentlyContinue
}

Get-ChildItem $packDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.exe', '.yml', '.blockmap', '.zip' } |
    ForEach-Object {
        $destName = $_.Name
        if ($_.Extension -eq '.zip' -and $destName -ne $wantedZip) {
            $destName = $wantedZip
        }
        $dest = Join-Path $distDir $destName
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
        Unblock-File -LiteralPath $dest -ErrorAction SilentlyContinue
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
            Unblock-Tree $distUnpacked
            Write-Host '  copied win-unpacked\ (unsigned, unblocked)' -ForegroundColor Green
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
Write-BuildLog "Done Output=$distDir Staging=$packDir"

} catch {
    Write-Host ''
    Write-Host "[build] unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    Write-BuildLog "FATAL: $($_.Exception.Message)"
    exit 1
}
