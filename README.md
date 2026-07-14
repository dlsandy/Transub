# Transub

Transub 是基于 [TransWithAI](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice) 的 Windows 桌面字幕工具（当前版本 **1.2.0**）。**字幕转录、翻译及 Whisper 推理由 TransWithAI 提供**；Transub 在此基础上提供批量任务管理、参数预设、任务历史，以及带视频同步的结构化字幕编辑器（SRT / VTT / LRC）。

> **特别感谢 [TransWithAI / Faster-Whisper-TransWithAI-ChickenRice](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice)**
>
> 本项目的核心字幕转录、翻译与 Whisper 推理能力，均来自 TransWithAI 项目。Transub 不包含推理引擎与模型，仅在其之上提供图形界面与编辑工具。
>
> - 项目主页：[github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice)
> - 下载发行版：[Releases](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases)
>
> 感谢 TransWithAI 作者与社区的开源贡献。使用前请遵循 TransWithAI 项目的许可条款。

![Transub 字幕生成与字幕编辑界面](Transub.png)

## 功能概览

### 批量字幕生成
- 视频/音频队列批量处理，转写或翻译为 SRT、VTT、LRC；支持拖放与文件夹扫描
- GPU 环境自动检测，内置与自定义参数预设；配置可导入 / 导出
- 任务历史记录；全部成功后可选择睡眠、退出应用或定时关机
- 可选右键菜单：「用 Transub 生成字幕」；字幕文件（SRT / VTT / LRC）右键「用 Transub 字幕编辑器打开」，无需启动主程序
- 完成后可从任务列表一键打开字幕编辑器并关联视频

### 字幕编辑器
- **三栏布局**：字幕列表 + 详情编辑 + 视频同步预览（Windows 优先硬件解码）
- **单条精修**：时间码微调、目标 CPS、重叠/时长警告；可按 CPS 或静音智能调节时长
- **分割字幕（8 种模式）**：智能断句、换行、空格、字符数、均分、光标、播放头、**静音切分**（FFmpeg 分析关联视频）
- **批量处理**：智能分割、静音分割、时长批量调整、智能调整（修复重叠与读速问题）
- **历史操作**：撤销 / 重做 / 复原到打开时状态；全体时间轴 ±0.5s
- **查找替换**；列表右键菜单（分割、对齐、时长调节等）
- 快捷键：`Ctrl+S` 保存、`Ctrl+Z` / `Ctrl+Y` 撤销重做、`Ctrl+F` / `Ctrl+H` 查找替换、`F11` / `F12` 对齐播放头、空格播放暂停

## 环境要求

| 依赖 | 说明 |
|------|------|
| **Windows 10/11** | 当前主要支持平台 |
| **Node.js 18+** | 开发与从源码运行 |
| **TransWithAI** | 需单独安装 [TransWithAI 发行版](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases) |
| **FFmpeg**（推荐） | 项目内 `_internal/bin/` 已内置；静音分割 / 智能调时依赖 FFmpeg；也可在设置中指定自定义路径 |

## 快速开始

### 从源码运行

```bash
git clone https://github.com/dlsandy/Transub.git
cd Transub
npm install
npm start
```

仅启动字幕编辑器（不打开主窗口）：

```bash
npm run start:editor
# 或直接打开指定字幕（可附带视频）
npm start -- --edit-sub="path\to\file.srt"
npm start -- --edit-sub="path\to\file.srt" --edit-video="path\to\video.mp4"
```

首次启动会在应用内引导配置 TransWithAI 安装路径。也可参考 [`transub-settings.example.json`](transub-settings.example.json) 手动创建 `transub-settings.json`（该文件含本机路径，**不要提交到 Git**）。

### 打包发布

```bash
npm run dist
# 或使用 Windows 打包脚本（可选：只打安装包 / 便携版）
npm run build
npm run build:setup
npm run build:portable
```

安装包与便携版输出到 `dist/` 目录。

### 注册右键菜单

打包完成后：

```powershell
powershell -ExecutionPolicy Bypass -File tools/register-context-menu.ps1
```

会为视频文件注册「用 Transub 生成字幕」，为 SRT / VTT / LRC 注册「用 Transub 字幕编辑器打开」（仅启动编辑器，不打开主窗口）。

移除菜单：

```powershell
powershell -ExecutionPolicy Bypass -File tools/register-context-menu.ps1 -Unregister
```

## 开发

```bash
npm run build:css      # 编译 Tailwind CSS
npm run build:renderer # 打包前端资源（发布前）
npm test               # 运行单元测试（含分割 / 静音探测）
npm run icons          # 重新生成应用图标
```

## 项目结构

```
Transub/
├── _internal/         # 内置 FFmpeg / ffprobe（打包时一并发布）
├── electron/          # Electron 主进程（IPC、TransWithAI 桥接、字幕格式）
├── src/               # 渲染进程 UI（含字幕编辑器与分割核心）
├── tests/             # 单元测试
├── tools/             # 构建与安装脚本
└── package.json
```

## 配置说明

运行时配置保存在项目根目录的 `transub-settings.json`（开发模式）或应用目录下。主要字段：

- `installPath` — TransWithAI 安装目录（含 `infer.exe`）
- `device` — 推理设备：`cuda` / `cpu` / `cuda_low_vram` 等
- `task` — `transcribe`（转写）或 `translate`（翻译）
- `subFormats` — 输出格式，如 `srt`、`vtt`、`lrc`
- `ffmpegPath` — FFmpeg 可执行文件路径（可选；留空则优先使用内置 `_internal/bin`）

## 致谢与许可

### 致谢

**TransWithAI** — 本项目的字幕转录、翻译及底层 Whisper 推理，完全依赖 [Faster-Whisper-TransWithAI-ChickenRice](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice) 提供。感谢 TransWithAI 作者与社区的开源工作。

| 项目 | 链接 |
|------|------|
| TransWithAI 仓库 | https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice |
| TransWithAI 发行版 | https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases |

### 许可

本项目（Transub）采用 [MIT License](LICENSE)。

TransWithAI 为独立项目，使用前请遵循其各自许可条款。UI 使用 [Font Awesome 4.7](https://fontawesome.com/)（SIL OFL 1.1）。
