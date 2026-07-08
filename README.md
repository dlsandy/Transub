# Transub

Transub 是基于 [TransWithAI](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice) 的 可视化字幕生成工具，提供批量转写/翻译、参数预设、任务历史，以及 SRT / VTT / LRC 字幕编辑与视频同步预览。

![Transub](Transub.png)

## 功能

- **批量字幕生成**：支持视频/音频文件队列，转写或翻译为 SRT、VTT、LRC字幕文件
- **GPU 自动检测**：识别 CUDA / CPU 等运行环境并给出安装建议
- **参数预设**：内置与自定义预设，快速切换常用配置
- **字幕编辑器**：结构化编辑 cue（文本、时间轴），支持视频同步播放
- **任务历史**：记录最近批处理结果
- **右键菜单**（可选）：为视频文件注册「用 Transub 生成字幕」上下文菜单

## 环境要求

| 依赖 | 说明 |
|------|------|
| **Windows 10/11** | 当前主要支持平台 |
| **Node.js 18+** | 开发与从源码运行 |
| **TransWithAI** | 需单独安装 [TransWithAI 发行版](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases) |
| **FFmpeg**（推荐） | 用于部分媒体预处理，可在设置中指定路径 |

## 快速开始

### 从源码运行

```bash
git clone https://github.com/dlsandy/Transub.git
cd Transub
npm install
npm start
```

首次启动会在应用内引导配置 TransWithAI 安装路径。也可参考 [`transub-settings.example.json`](transub-settings.example.json) 手动创建 `transub-settings.json`（该文件含本机路径，**不要提交到 Git**）。

### 打包发布

```bash
npm run dist
```

安装包与便携版输出到 `dist/` 目录。

### 注册右键菜单

打包完成后：

```powershell
powershell -ExecutionPolicy Bypass -File tools/register-context-menu.ps1
```

移除菜单：

```powershell
powershell -ExecutionPolicy Bypass -File tools/register-context-menu.ps1 -Unregister
```

## 开发

```bash
npm run build:css      # 编译 Tailwind CSS
npm run build:renderer # 打包前端资源（发布前）
npm test               # 运行单元测试
npm run icons          # 重新生成应用图标
```

## 项目结构

```
Transub/
├── electron/          # Electron 主进程（IPC、TransWithAI 桥接、字幕格式）
├── src/               # 渲染进程 UI
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
- `ffmpegPath` — FFmpeg 可执行文件路径（可选）

## 许可证

本项目采用 [MIT License](LICENSE)。

TransWithAI 为独立项目，使用前请遵循其各自许可条款。UI 使用 [Font Awesome 4.7](https://fontawesome.com/)（SIL OFL 1.1）。
