# 为视频文件添加「用 Transub 生成字幕」右键菜单（当前用户）
param(
    [string]$TransubExe = "",
    [switch]$Unregister
)

$ErrorActionPreference = "Stop"

if (-not $TransubExe) {
    $TransubExe = Join-Path (Split-Path $PSScriptRoot -Parent) "dist\win-unpacked\Transub.exe"
}

$progId = "Transub.SubtitleTask"
$verb = "TransubGenerate"
$label = "用 Transub 生成字幕"

function Remove-TransubContextMenu {
    Remove-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\.mp4\shell\$verb" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\.mkv\shell\$verb" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\.avi\shell\$verb" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\.mov\shell\$verb" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\.webm\shell\$verb" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "HKCU:\Software\Classes\$progId" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "已移除 Transub 右键菜单"
}

if ($Unregister) {
    Remove-TransubContextMenu
    exit 0
}

if (-not (Test-Path $TransubExe)) {
    Write-Error "找不到 Transub 可执行文件：$TransubExe`n请先打包应用，或通过 -TransubExe 指定路径。"
}

$extensions = @('.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv')

New-Item -Path "HKCU:\Software\Classes\$progId\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\$progId\shell\open\command" -Name "(default)" -Value "`"$TransubExe`" `"%1`""

foreach ($ext in $extensions) {
    $shellKey = "HKCU:\Software\Classes\SystemFileAssociations\$ext\shell\$verb"
    New-Item -Path $shellKey -Force | Out-Null
    Set-ItemProperty -Path $shellKey -Name "(default)" -Value $label
    Set-ItemProperty -Path $shellKey -Name "Icon" -Value "`"$TransubExe`",0"
    New-Item -Path "$shellKey\command" -Force | Out-Null
    Set-ItemProperty -Path "$shellKey\command" -Name "(default)" -Value "`"$TransubExe`" `"%1`""
}

Write-Host "已注册右键菜单，目标：$TransubExe"
Write-Host "使用 -Unregister 可移除"
