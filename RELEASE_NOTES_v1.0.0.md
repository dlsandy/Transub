# Transub v1.0.0 — 首次发布

Transub 是面向 Windows 的桌面字幕工具，提供批量任务管理、参数配置，以及生成后的结构化字幕编辑与校对。

## 重要说明：字幕转录与翻译能力来源

**本项目的语音转写、翻译及底层 Whisper 推理，均依赖外部项目 [TransWithAI / Faster-Whisper-TransWithAI-ChickenRice](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice)。**

- Transub **不包含**推理引擎、模型文件或 `infer.exe`
- 使用前需在本机单独安装 TransWithAI，并在应用内配置其安装路径
- TransWithAI 的许可、模型与运行要求，以原项目为准

## 主要功能

### 批量字幕生成（基于 TransWithAI）
- 转写 / 翻译，输出 SRT、VTT、LRC
- 批量队列、GPU 检测、参数预设、任务历史
- 可选右键菜单：「用 Transub 生成字幕」

### 字幕编辑工具
- **独立编辑窗口**：列表 + 详情 + 视频预览三栏布局
- **格式支持**：SRT / VTT / LRC 读取、编辑、保存
- **视频同步**：播放头与字幕双向联动，overlay 实时预览
- **单条编辑**：时间码微调、CPS 显示、重叠/时长警告
- **分割字幕**：按换行、空格、字符数、均分、光标、播放头 6 种模式
- **查找替换**：Ctrl+F / Ctrl+H，逐条或全部替换
- **时长批量调整**：按 CPS、时长、重叠、关键词等条件筛选后统一调整
- **智能调整**：自动修复重叠、CPS 超限、过短/过长条目
- **全局操作**：全体 ±0.5s、复原、保存（Ctrl+S）

## 下载

| 文件 | 说明 |
|------|------|
| `Transub Setup 1.0.0.exe` | NSIS 安装程序（推荐） |
| `Transub-1.0.0-portable.exe` | 便携版，免安装 |

## 使用前准备

1. 安装 [TransWithAI 发行版](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases)
2. （推荐）安装 FFmpeg
3. 首次启动 Transub，配置 TransWithAI 安装路径与推理设备

## 系统要求

- Windows 10/11（x64）
- 需本机单独安装 TransWithAI

## 许可

- Transub：[MIT License](LICENSE)
- TransWithAI：遵循原项目许可条款
