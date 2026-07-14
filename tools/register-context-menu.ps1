# Register Transub context menu entries (current user)
param(
    [string]$TransubExe = "",
    [switch]$Unregister
)

$ErrorActionPreference = "Stop"

if (-not $TransubExe) {
    $TransubExe = Join-Path (Split-Path $PSScriptRoot -Parent) "dist\win-unpacked\Transub.exe"
}

$videoProgId = "Transub.SubtitleTask"
$videoVerb = "TransubGenerate"
$videoLabel = "用 Transub 生成字幕"

$editorProgId = "Transub.SubtitleEditor"
$editorVerb = "TransubEditSubtitle"
$editorLabel = "用 Transub 字幕编辑器打开"

function Remove-TransubContextMenu {
    $videoExtensions = @('.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv')
    foreach ($ext in $videoExtensions) {
        Remove-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\$ext\shell\$videoVerb" -Recurse -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -Path "HKCU:\Software\Classes\$videoProgId" -Recurse -Force -ErrorAction SilentlyContinue

    $subtitleExtensions = @('.srt', '.vtt', '.lrc')
    foreach ($ext in $subtitleExtensions) {
        Remove-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\$ext\shell\$editorVerb" -Recurse -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -Path "HKCU:\Software\Classes\$editorProgId" -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host "Removed Transub context menu entries"
}

if ($Unregister) {
    Remove-TransubContextMenu
    exit 0
}

if (-not (Test-Path $TransubExe)) {
    throw "Transub executable not found: $TransubExe. Build the app first or pass -TransubExe."
}

$videoExtensions = @('.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv')

New-Item -Path "HKCU:\Software\Classes\$videoProgId\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\$videoProgId\shell\open\command" -Name "(default)" -Value "`"$TransubExe`" `"%1`""

foreach ($ext in $videoExtensions) {
    $shellKey = "HKCU:\Software\Classes\SystemFileAssociations\$ext\shell\$videoVerb"
    New-Item -Path $shellKey -Force | Out-Null
    Set-ItemProperty -Path $shellKey -Name "(default)" -Value $videoLabel
    Set-ItemProperty -Path $shellKey -Name "Icon" -Value "`"$TransubExe`",0"
    New-Item -Path "$shellKey\command" -Force | Out-Null
    Set-ItemProperty -Path "$shellKey\command" -Name "(default)" -Value "`"$TransubExe`" `"%1`""
}

$subtitleExtensions = @('.srt', '.vtt', '.lrc')
$editorCommand = "`"$TransubExe`" --subtitle-editor-only --edit-sub=`"%1`""

New-Item -Path "HKCU:\Software\Classes\$editorProgId\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\$editorProgId\shell\open\command" -Name "(default)" -Value $editorCommand

foreach ($ext in $subtitleExtensions) {
    $shellKey = "HKCU:\Software\Classes\SystemFileAssociations\$ext\shell\$editorVerb"
    New-Item -Path $shellKey -Force | Out-Null
    Set-ItemProperty -Path $shellKey -Name "(default)" -Value $editorLabel
    Set-ItemProperty -Path $shellKey -Name "Icon" -Value "`"$TransubExe`",0"
    New-Item -Path "$shellKey\command" -Force | Out-Null
    Set-ItemProperty -Path "$shellKey\command" -Name "(default)" -Value $editorCommand
}

Write-Host "Registered context menu -> $TransubExe"
Write-Host "  Video: $videoLabel"
Write-Host "  Subtitle: $editorLabel"
Write-Host "Use -Unregister to remove"
