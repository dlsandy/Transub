# Transub 字幕生成 & Transub Editor 字幕编辑

Transub

**把视频丢进去，字幕就出来了。**  
在编辑器里改时间轴、修读速、统一专名、跑工作流——从生成到成片，一条龙。

Windows 桌面字幕工具 · 当前版本 **3.0.2**  
默认转录 / 免费译中由 **Transub Engine** 提供（SenseVoice / Whisper + Opus NMT）；[TransWithAI](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice) 仍可作为可选旧后端。

[下载](https://github.com/dlsandy/Transub/releases)
[License](LICENSE)
Windows

欢迎通过 [爱发电](https://afdian.com/a/transub) 支持本项目；**Pro 大版本内买断**亦在该页购买（覆盖当前大版本如 3.x 内 Pro 功能，不含下一主版本）。付款后在「设置 → Pro」用订单号领取并激活（也可粘贴许可密钥）。

Transub 总览：批量生成 + 字幕编辑器

---

## 3.0 相对 2.0：一眼对比

2.0 把界面与冷启动打牢；**3.0 换上自带引擎、智能感知与大版本内买断的 Pro 精修链路**，编辑长片时更省内存、更少卡顿。

### 功能对比


| 能力                      | 2.0              | 3.0                                                      |
| ----------------------- | ---------------- | -------------------------------------------------------- |
| 默认转录 / 译中后端             | 依赖外装 TransWithAI | **内置 Transub Engine**                                    |
| 拖入后自动配模型 / 语种           | 开始前可选匹配          | **按项自动感知**（类型即感、短窗语种、声学轻探测、纠错记忆）                         |
| 免费日→中                   | 主要靠引擎/TWAI 路径    | **Opus NMT + 推理翻译**（[三种译中对比](#translate-modes)）          |
| 智能翻译                    | —                | **Pro 专属**（影片简要 → 分块译 → 一致性）；忠实语气免费                      |
| 语境 / 影片理解重构             | —                | **Pro**（影片简要 → 场景改写；对照确认）                                |
| 影视音频增强（Demucs）          | —                | **Pro**（人声分离 + 电影级 VAD）                                  |
| 双语规则审阅 / LLM 语义审阅       | —                | 规则审阅免费；**语义审阅 Pro**                                      |
| 说话人标签 · 审校状态 · 书签 · A-B | —                | **有**（ASS 说话人着色导出为 Pro）                                  |
| 原文缓存回收误删                | —                | **有**（挂副轨 / Diff / 选区恢复）                                 |
| 设置向导 / 统一下载中心           | 向导雏形             | **独立向导窗口** + 模型 / GPU / Demucs / GGUF / 应用更新一窗管理         |
| Pro 购买与激活               | —                | **大版本内买断**；爱发电订单号领取或 `TSUB1.…` 密钥                        |
| 应用内更新                   | 多为打开下载页          | **zip / NSIS 可应用内更新**（保留 models / Pro GGUF / GPU·Demucs） |
| 双语任务 / 编辑 / 预设 / 工作流    | 有                | 保留并加强（书签段工作流、Pro 工作区等）                                   |




### 性能与体验对比


| 维度       | 2.0           | 3.0 改进                                                 |
| -------- | ------------- | ------------------------------------------------------ |
| 冷启动 / 外壳 | 相对 1.x 已明显加快  | 沿用精简外壳；**界面缩放**适配 4K；任务条可显示 CPU / 内存 / GPU             |
| 拖入大批文件   | 常需等探测再配参      | **文件名快感优先**；类型证据强时**立即采纳**，深入感知按需「重感」                 |
| 长片字幕列表   | 全量渲染易卡        | **≥180 条窗口化列表**；脏行局部刷新；跟播减负                            |
| QC / 查找  | 主线程扫描         | **Web Worker**（失败自动回退）                                 |
| 撤销栈      | 全量快照偏重        | **相对基线的 Undo 补丁**，长片更省内存                               |
| 译后显存     | TWAI / 旧路径易占满 | **MT 前释放 ASR 显存**；Sakura / 智能翻译走引擎 external 适配器        |
| 本地 LLM   | —             | 任务结束约 **5 分钟空闲后停 llama-server**，避免重构后编辑器卡顿             |
| 安装门槛     | 需自备 TWAI + 模型 | **自带引擎 runtime** + `whisper-tiny` / `fsmn-vad`；其余按向导下载 |


更细的条目见 [CHANGELOG.md](CHANGELOG.md) · `3.0.2`。

---



## 适合谁用？

- 需要给**整批视频**快速出 SRT / VTT / ASS 字幕  
- 想把 AI 初稿**精修成片**：对口型、控读速、清杂音、统一专名  
- 多语种 / 影视混批，希望**拖进去就配好模型与切分策略**  
- 习惯「拖进去 → 开跑 → 睡一觉 / 关机」的无人值守流程  
- （可选）愿意购买本大版本 Pro，用大模型做语境 / 影片理解重构与影视人声分离

---



## 三种译中方式对比

主界面 / 设置 → 常规可选 **机器翻译（Opus）**、**推理翻译**、**智能翻译（Pro）**。下表为**翻译阶段**粗估（不含转写）；以约 **100 分钟、600～900 条** 日语片为例，中端独显或本机 Vulkan；实际随条数、模型、冷启动与是否补翻浮动。


|          | 机器翻译（Opus）                     | 推理翻译（Sakura 等）                                 | 智能翻译（Pro）                                           |
| -------- | ------------------------------ | ---------------------------------------------- | --------------------------------------------------- |
| **许可**   | 免费                             | 免费（Sakura 模型为 CC-BY-NC-SA）                     | **需本大版本 Pro**                                       |
| **模型**   | 引擎 `opus-mt-*-zh`（可自动按源语言）     | 本地 GGUF                                        | BYOK 云端 / 自建，或软件内**对话型** GGUF                       |
| **语种**   | 英 / 日 / 韩 / 德 / 西 / 芬 / 瑞典 → 中 | 视模型 **多语言 → 简中**                               | 视模型；常用作多语 → 中                                       |
| **管线**   | 引擎内置 NMT **单遍**                | 局部上下文 **单遍**推理（约 8 条/窗）                        | **影片简要 → 分块译 → 一致性校对**（约 10 条/窗）                    |
| **质量**   | 一般，够用赶工                        | 中上，口语更自然                                       | 最高，专名与前后文更稳                                         |
| **术语表**  | Opus **强制译名**保护                | 写入 LLM prompt                                  | 写入 LLM prompt                                       |
| **忠实语气** | —                              | 可选                                             | 可选                                                  |
| **预计译时** | 约 **2～8 分钟**                   | **1.5B** 约 **15～45 分钟**；**7B** 约 **40～100 分钟** | **本地 7B 级** 约 **1～3 小时**；**云端 BYOK** 约 **15～45 分钟** |
| **相对片长** | 通常远短于片长                        | 约片长的 **1/4～1×**                                | 本地约 **0.8～2×**；云端常短于片长                              |
| **适合**   | 大批量、多语种、要速度                    | 日语日常译中，质量与速度折中                                 | 要成片级一致性、愿意等或用 API                                   |


> 整任务总时长 ≈ 转写 + 上表译时（双语任务含两者）。GPU / 内存紧张、首次加载 GGUF、漏翻自动补轮都会拉长。可在设置 → Pro → 软件内模型做 **tok/s 性能测试** 再选档。

---



## 亮点功能



### 1. 拖进音视频，批量开跑

添加文件或文件夹，选好转写、翻译或双语，点「开始生成」。进度、ETA、原始日志一目了然；全部完成后可选睡眠、退出或关机。

批量字幕生成

- **按项自动感知**：类型 / 语种 / ASR·MT / 音频策略；证据强时可秒级采纳  
- GPU（CUDA）加速；日志可见 Smart VAD / WhisperSeg 等进度  
- 内置参数预设；完成后可一键打开编辑器（视频已关联）

---



### 2. 生成后自动优化

任务结束后自动 QC、CPS 拆句、清杂音与叠词压缩，减轻手工量。

字幕自动优化

- 任务列表可直接看到 QC 问题数  
- 译后清洗：叠名幻觉、句末臆造人名、术语统一等（引擎 + 桌面双层）

---



### 3. 结构化字幕编辑器

列表、详情、视频预览联动。按低置信 / QC / 审校状态 / 说话人 / 书签筛选；多选删除、合并、简繁转换。

字幕列表与筛选

- 工作区：**精修 / 时间轴 / 双语 / AI / Pro**（`Alt+1…5`）  
- 撤销 / 重做（补丁栈）；查找替换（长片走 Worker）  
- 字幕预设组、工作流批处理；独立 **Transub Editor** 启动

---



### 4. 质量检查 + 一键修复

扫描重叠、读速、时长、通顺度等；时间类问题可预览影响条数后一键修。

质量检查与一键修复

- 导出前检查清单：空字幕、CPS、低置信、审校进度、原文缓存等  
- 双语规则审阅：空译、疑似漏译、时长偏离、术语缺失

---



### 5. 智能分割与时长工具

读速提示、智能断句、换行/空格切分、静音分割、智能时长；F11 / F12 对齐播放头。

分割与时长工具

---



### 6. 视频预览 + 波形时间轴

边播边改；可选波形层与**磁吸**拖拽；局部「重转写」；书签与 A-B 循环。

视频预览与波形时间轴

---



### 7. Pro 精修（大版本内买断）


| 能力         | 说明                                                         |
| ---------- | ---------------------------------------------------------- |
| 语境重构       | 分块 LLM 改写，适合局部快修                                           |
| 影片理解重构     | 影片简要 → 按场改写，贴合整片                                           |
| 智能翻译 · Pro | 影片简要 → 分块译 → 一致性；BYOK 或软件内对话模型（[对比三种译中](#translate-modes)） |
| 影视音频增强     | Demucs 人声分离 + 电影级 VAD                                      |
| 双语语义审阅     | LLM 查漏译 / 错译                                               |
| ASS 说话人样式  | 按手动说话人着色导出                                                 |


购买：[爱发电 · Transub](https://afdian.com/a/transub) → 设置 → Pro → 订单号领取。  
许可为**大版本内买断**（例如 3.x 内 Pro 功能；升级到 4.0 等下一主版本需另行购买，以爱发电商品说明为准）。  
边界与条款：[docs/advanced-boundary.md](docs/advanced-boundary.md) · [LICENSE-PRO](LICENSE-PRO)。

免费译中与耗时见上表 **[三种译中方式对比](#translate-modes)**（Opus / 推理翻译免费；智能翻译为 Pro 专属）。

---



### 还有这些省心能力


| 能力               | 说明                                                                |
| ---------------- | ----------------------------------------------------------------- |
| 统一下载中心           | 引擎模型 / GPU / Demucs / GGUF / 应用更新，可并行与重试；**首次下载体积大，请耐心等待**        |
| 设置向导             | **首次使用建议走向导**完成设备 / 档位 / 模型勾选与下载                                  |
| 任务资源条            | 运行中显示 CPU / 内存 /（NVIDIA）GPU                                       |
| 术语表              | 全局 + 项目；扫描不一致并一键统一                                                |
| 简繁输出             | 翻译 / 双语可自动简体或繁体                                                   |
| 右键菜单             | 视频「生成字幕」、字幕「用编辑器打开」                                               |
| zip / NSIS 应用内更新 | 保留引擎 models、`advanced-llm`（GGUF / llama-server）与 GPU / Demucs 支持库 |


---



## 下载安装

1. 打开 [Releases](https://github.com/dlsandy/Transub/releases)
2. 推荐 `Transub-3.0.2-win.zip`，解压后运行 `Transub.exe`
  （或 `Transub-Setup-3.0.2.exe`）  
   解压目录含 **Transub Editor** 快捷方式；安装版还会在桌面与开始菜单创建
3. 发行包已内置 **Transub Engine**（`transub-engine/runtime`，无需本机 Python），并附带 `whisper-tiny`（语种探测）与 `fsmn-vad`（默认 VAD）。其余模型在设置 → 环境或向导中按需下载；FFmpeg 使用软件自带 `_internal/bin`
4. **首次使用请走设置向导**（主界面或设置页入口；无配置时也会自动弹出）：按硬件与用途勾选设备 / 档位 / 模型并一键下载，比手工翻「环境」页更省事
5. （可选）旧后端：安装 [TransWithAI](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases)，并将 `engineBackend` 设为 `twai`

> 当前发行包**未做代码签名**。请优先用 zip；未签名 Setup 易被 SmartScreen 拦截。

> **首次环境下载请耐心等待**：Whisper / Opus / Sakura、GPU（CUDA）运行库、Demucs 等体积很大，合计常达数 GB；视网速与磁盘，**往往需要十几分钟，慢时数十分钟甚至更长**都属正常。请保持窗口打开、勿强制结束进程；下载中心可看每项进度与速度，失败可重试。



### 环境要求


| 依赖              | 说明                                                        |
| --------------- | --------------------------------------------------------- |
| Windows 10 / 11 | 唯一支持平台                                                    |
| Transub Engine  | 发行包内置；默认转录与免费多语→中 NMT；Sakura / 智能翻译经 `mtBackend=external` |
| TransWithAI     | 可选旧后端                                                     |
| FFmpeg          | 发行版已内置                                                    |


可选：注册资源管理器右键菜单：

```powershell
powershell -ExecutionPolicy Bypass -File tools/register-context-menu.ps1
```

---



## 从源码运行

面向开发者。需要 **Node.js ≥ 22.12**。

```bash
git clone https://github.com/dlsandy/Transub.git
cd Transub
npm install
npm run setup:ffmpeg   # 若尚无内置 ffmpeg/ffprobe
# 将 Engine 独立版 dist 放到 transub-engine/（含 runtime\python.exe）
npm start
```

仅开编辑器：

```bash
npm run start:editor
npm start -- --edit-sub="path\to\file.srt" --edit-video="path\to\video.mp4"
```

也可双击根目录 `Transub Editor.bat`。变更记录：[CHANGELOG.md](CHANGELOG.md)。

---



## 致谢与许可

**Transub Engine** — 默认本地 ASR / 免费译中。边界见 [docs/engine-boundary.md](docs/engine-boundary.md)。

**TransWithAI** — 可选旧后端；致谢 [Faster-Whisper-TransWithAI-ChickenRice](https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice)。

Core 采用 [MIT License](LICENSE)；Pro 算法与 `_advanced` 闭源模块见 [LICENSE-PRO](LICENSE-PRO) / [NOTICE](NOTICE)。UI 图标：[Font Awesome 4.7](https://fontawesome.com/)（SIL OFL 1.1）。

---



## 开发说明



### 打包

`build:renderer` 与 `build:advanced` 须在打包前执行（后者生成闭源 `_advanced/index.js`）。

```bash
npm run build:advanced     # Pro 闭源模块
npm run check:release      # 正式发布前本地检查（不推送）
npm run build              # zip + Setup + dir
npm run verify:packaging
```

产物在 `dist/`。

### 常用脚本

```bash
npm run build:css
npm run build:renderer
npm test
npm run lint
npm run setup:ffmpeg
npm run icons
npm run start:editor
```



### 项目结构

```
Transub/
├── _internal/       # 内置 FFmpeg / ffprobe
├── _advanced/       # 构建生成的 Pro 闭源模块（勿提交）
├── transub-engine/  # Engine 独立版 dist
├── electron/        # 主进程
├── src/             # 渲染层源码
├── renderer-dist/   # 打包用渲染产物
├── services/        # 爱发电发货 Worker 等
├── tests/
├── tools/
└── docs/
```



### 配置要点

运行时配置：`transub-settings.json`（开发在项目根；打包后在稳定用户目录）。常用字段：

- `engineBackend` — `transub`（默认）或 `twai`
- `engineInstallPath` / `engineUrl` — 留空即用内置 `transub-engine/`
- `engineAsrModel` / `engineMtModel` / `engineProfile`
- `task` — `transcribe` / `translate` / `dual`
- `subFormats` — `srt` / `vtt` / `ass` 等（`lrc` 仅旧后端 TWAI）
- `device` — `cuda` / `cpu` / `cuda_low_vram` 等

其它：`transub-glossary.json`、`transub-presets.json`、`transub-editor-workflows.json` 等。可参考 `[transub-settings.example.json](transub-settings.example.json)`。

### 应用更新

设置中「检查更新」查询 GitHub Releases：

- **zip / win-unpacked**：可应用内下载并重启；保留 `transub-engine/models`、`advanced-llm`（GGUF / llama-server）与已装 GPU / Demucs 等 site-packages  
- **NSIS**：有 `latest.yml` 时走 electron-updater；升级卸载阶段暂存并恢复上述用户数据（`electron/installer.nsh`）  
- **开发模式**：比对版本并打开下载页

