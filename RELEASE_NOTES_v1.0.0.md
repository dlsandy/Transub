# Transub v1.0.0 — 首次发布

Transub 是面向 Windows 的桌面字幕工具：在图形界面中管理批量任务、配置参数，并在生成后对字幕进行结构化编辑与校对。

**字幕转录、翻译及 Whisper 推理能力均基于 [TransWithAI / Faster-Whisper-TransWithAI-ChickenRice](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice)。** Transub 本身不包含推理引擎，需在本机单独安装 TransWithAI 后使用。

---

## 重要说明：能力来源

| 组件 | 说明 |
|------|------|
| **TransWithAI** | 提供语音转写、多语言翻译及底层 Whisper 推理（`infer.exe`） |
| **Transub** | 提供图形界面、批处理编排、参数预设、任务历史与字幕编辑工具 |

- Transub **不捆绑**推理引擎、模型文件或 `infer.exe`
- 使用前请安装 [TransWithAI 发行版](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases)，并在应用内配置安装路径
- TransWithAI 的许可、模型与运行要求，以原项目为准

---

## 一、批量字幕生成（基于 TransWithAI）

- **转写 / 翻译**：调用 TransWithAI，输出 SRT、VTT、LRC
- **批量队列**：拖入或选择多个视频/音频，按队列依次处理
- **GPU 自动检测**：识别 CUDA / CPU 等环境并给出安装建议
- **参数预设**：内置与自定义预设，快速切换常用配置
- **任务历史**：记录最近批处理结果（成功 / 跳过 / 失败 / 取消）
- **可选右键菜单**：为视频文件注册「用 Transub 生成字幕」

---

## 二、字幕编辑工具（重点功能）

独立字幕编辑窗口，采用「**列表 + 详情 + 视频预览**」三栏布局，适合生成后的快速校对与精修。支持 **SRT / VTT / LRC** 读取、编辑与保存。

### 界面与交互

| 区域 | 功能 |
|------|------|
| **字幕列表** | 序号、起始/结束时间、时长、文本预览；点击选中 |
| **详情面板** | 编辑起始时间、时长、文本；显示 CPS、字符数 |
| **视频面板** | 关联视频播放，实时 overlay 显示当前字幕 |

- 独立窗口，可从主界面或任务列表打开
- 未保存修改有明确提示，支持一键恢复到打开时的初始状态
- 同一视频存在多个字幕文件时，可在下拉框中切换

### 视频同步预览

- 播放器与字幕时间轴 **双向联动**
- 播放时自动高亮当前 cue，列表滚动跟随
- 点击列表条目跳转到对应时间点
- **起始对齐播放头**：将当前条目起始时间设为播放位置
- **在播放头处插入**：在当前播放位置插入新字幕

### 单条编辑

- 时间码直接输入，或 ±100ms / ±0.1s 微调
- 实时 **CPS**（字符/秒）显示，辅助判断读速
- 自动警告：时长过短/过长、时间重叠、结束早于起始
- ↑ / ↓ 快速切换上一条 / 下一条

### 分割字幕（6 种模式）

| 模式 | 说明 |
|------|------|
| 按换行 | 每行文本一条字幕 |
| 按空格 | 按词/段分割 |
| 按字符数 | 每段最多 N 字 |
| 均分为 N 段 | 文本均分，时间按比例分配 |
| 光标处分割 | 在编辑框光标位置拆成两条 |
| 播放头处分割 | 在视频当前位置拆成两条 |

### 查找与替换

- `Ctrl+F` 查找，`Ctrl+H` 查找并替换
- 支持区分大小写、逐条/全部替换
- 列表高亮所有匹配项

### 时长批量调整

按条件筛选（全部、时长范围、CPS 过高/过低、文本关键词、时间重叠、当前选中）后，统一调整为目标时长。

### 智能调整

自动修复时间重叠、CPS 超限、过短（< 0.5s）/ 过长（> 10s）条目，应用前显示预计影响条数。

### 全局操作与快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存 |
| `Ctrl+F` | 查找 |
| `Ctrl+H` | 查找并替换 |
| `↑` / `↓` | 上一条 / 下一条 |

- 全体 ±0.5s 时间轴平移
- 添加 / 插入 / 删除条目

---

## 下载

| 文件 | 说明 |
|------|------|
| `Transub Setup 1.0.0.exe` | NSIS 安装程序（推荐） |
| `Transub-1.0.0-portable.exe` | 便携版，免安装 |

---

## 使用前准备

1. 安装 [TransWithAI 发行版](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases)
2. （推荐）安装 FFmpeg，并在设置中指定路径
3. 首次启动 Transub，配置 TransWithAI 安装路径与推理设备（如 `cuda` / `cpu`）

---

## 系统要求

- Windows 10/11（x64）
- 需本机单独安装 TransWithAI
- 使用 CUDA 时需 NVIDIA 驱动及对应 TransWithAI 版本

---

## 已知限制

- 当前主要支持 Windows x64
- 字幕编辑仅支持 SRT / VTT / LRC
- 推理速度与质量取决于 TransWithAI 版本、模型与硬件

---

## 致谢与许可

| 项目 | 说明 |
|------|------|
| **[TransWithAI](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice)** | 字幕转录、翻译及 Whisper 推理 |
| **Transub** | 图形界面与字幕编辑 — [MIT License](LICENSE) |
