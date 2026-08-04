# Transub Engine 边界

## 组件


| 组件                                               | 职责                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Transub**（本仓库）                                 | UI、批处理编排、字幕编辑、规则后处理、Pro LLM；为引擎提供 **external MT HTTP 适配器**（Sakura / 智能翻译）                                         |
| **Transub Engine**（本仓库 `transub-engine/`，亦可外部目录） | VAD / ASR / 免费 Opus NMT、轻度降噪、模型下载与分档、HTTP `/v1` + CLI；ASR 后叠名人名清理；Opus 译后轻量人名污染剥离；可选 `mtBackend=external` 回调桌面适配器 |
| **TransWithAI**                                  | 可选旧后端（`engineBackend=twai`）                                                                                       |
| **Pro**                                          | 语境/影片重构、影视音频增强；**智能翻译**（影片简要→分块译→一致性）；不独占免费默认翻译（Opus / 推理翻译）与忠实语气                                                 |


## 默认后端

- 设置项 `engineBackend` 默认为 `transub`
- 免费翻译：引擎 **ASR → 本地 Opus NMT（英/日/韩/德/西/芬/瑞典 → 中）**，或可选免费 **推理翻译 / Sakura（日→简中 GGUF，默认 1.5B / 可选 7B）**；Sakura 使用内置 llama-server，**不需** Pro 许可（模型许可为 CC-BY-NC-SA）；「忠实语气」免费可用
- 免费音频：默认 VAD（可调阈值）、可选「更激进切分」「轻度降噪」；Whisper「灵敏检出」使用 **WhisperSeg**（`whisperseg-asmr`）外部 VAD → `clip_timestamps`，绕过内置 Silero；灵敏预设阈值约 `0.18`、最短人声 `60ms`、最小静音 `140ms`、填充 `350ms`、更长片段合并；长片（≥10 分钟）按 ≤7 分钟定长窗口切分（瞬时，不再全片 ffmpeg 静音扫描），WhisperSeg 只解码一次再内存切片；ASR 后轻量剥离括号音效/SDH 标记，并压缩极端叠字。灵敏检出路径不宜叠轻度降噪或 Demucs 影视增强。可选 ASR `whisper-ja-1.5b`（日语微调）、`anime-whisper`（动画/Galgame；CT2 分窗）、`kotoba-whisper-v2.0-faster`（kotoba 日语蒸馏；长片自动 ≤180s 分窗以防 CT2 `0xC0000005` 崩溃）、**`reazonspeech-k2`**（Reazon Zipformer/sherpa-onnx，自带 subword 时间戳，≤25s 分窗）。**`av_soft` 默认 `whisper-ja-1.5b`**（可选 `reazonspeech-k2` / `qwen3-asr-0.6b` 等）。**anime-whisper 时间轴默认走 ChronosJAV 风格**：TEN VAD 短帧（静音间隙 0.5s、单帧 ≤5s）→ 逐帧 ASR，帧边界即字幕时间；帧内按句读/字数比例切条。`timingAlignModel`：`ten`/`auto`/省略 = 该路径；`rate`/`off` = 仅 ≤180s 定长窗 + CPS 修补；`whisper-ja-1.5b` / `wav2vec2` 等 = 二次对时。WhisperSeg 不用于 anime 的 clip 门控（易丢对白）。WhisperSeg GPU 需安装 `onnxruntime-gpu`（与 CPU 包互斥）；ffmpeg 解码仍为 CPU
- 推理设备 `device`（auto/cuda/cpu）贯通：人声分离、WhisperSeg、ASR、Opus NMT
- 短窗语种：`POST /v1/detect-language`（Whisper 编码器，约 12 秒窗口；桌面自动感知默认 `startSec≈60–180` 跳过片头）；桌面「自动感知」在语种为自动且无音轨/文件名强先验时调用；需已安装 Whisper CT2（优先 tiny）；缺少 `faster-whisper`/`numpy` 时会自动 pip 进引擎 runtime
- 智能翻译（**Pro 专属**）：引擎任务仍为 `translate_mt` **/** `dual`，`mtBackend=external`；适配器侧 **影片简要 → 分块译 → 一致性**；引擎批次约 40 条/窗、窗口 30/重叠 2（推理翻译仍约 8）
- 免费 Sakura / 推理翻译：同上，适配器走本地 GGUF（llama-server）；引擎在外部 MT 前释放 GPU 缓存
- **ASR 叠名清理**：引擎在写出 source / 送 MT 前剥离 Whisper CJK 叠名（玲奈玲奈、葵葵葵）与整句名渣；Opus 路径另做译后轻量人名清洗；桌面 `sanitizeMtSubtitlePair` 仍为文件级兜底
- Pro 影视音频增强：引擎 **Demucs 人声分离 → VAD → ASR**（许可在 Transub 门控）；亦可只开「影视 VAD 预设」不做分离。影视 VAD 默认：阈值 `0.55`、最短人声 `350ms`、最小静音 `280ms`、填充 `200ms`、单段上限 `18s`、幻觉静音跳过 `2s`；Whisper 影视路径更严的 `no_speech_threshold`（约 `0.5`），拉丁语词间隙合并约 `0.85s`。免费侧影视感知回退：轻度降噪 + 略高阈值 `0.58`（无 Demucs）
- 导出：引擎支持 `srt` / `vtt` / `ass`，双语可额外 `*.dual.ass`；可选 `words.json` / karaoke VTT；LRC 仅旧后端 TWAI
- 术语：引擎 **Opus** MT 用「别名 → 标准译名」强制译名（protect → MT → restore → enforce）；**Sakura / 智能翻译** 与字幕编辑器一致，向 LLM prompt 传入术语表（不做 `__GLOSS`* 占位保护）；TWAI 仍用 ASR prompt / hotwords



## API 兼容

引擎 `apiVersion` 主版本须为 `1`（见 `electron/engine-options.js` 的 `EXPECTED_API_MAJOR`）。不兼容时拒绝调用并提示升级引擎。

## 外部 MT（LLM）

引擎契约见 `transub-engine/docs/api-v1.md` → `mtBackend: "external"`。

本仓库实现：`electron/engine-mt-adapter.js`（本机 `127.0.0.1` + Bearer token），由 `engine-bridge` 在 Sakura / 智能翻译批次中按需启动；任务字段由 `buildExternalMtJobFields` / adapter.`mtExternal()` 组装。

## 进程模型

Transub 按需 `spawn`：独立版 `runtime\python.exe -m transub_engine serve`（或打包后的 `transub-engine.exe`），经 `engineUrl`（默认 `http://127.0.0.1:8765`）调用。默认引擎目录为软件旁的内置 `transub-engine/`（含 `ENGINE_ROOT` + `runtime/`，`engineInstallPath` 留空即用）；FFmpeg 由 Transub `_internal/bin` 注入，引擎 dist 不再重复携带。CLI 仅用于调试/CI，产品批处理不走 CLI。任务可设 `releaseGpuAfter`（Sakura / 智能翻译路径默认开启）以便交接本地 LLM。

**单任务互斥**：主进程 `electron/compute-task-lock.js` 全局单槽。引擎批处理 / 区间重转写、TWAI 批处理 / 区间重转写 / 试跑、Pro 重构与智能翻译、Sakura 翻译、托管 LLM 性能测试互斥，避免主窗口与字幕编辑器同时抢引擎或 llama-server。批次内嵌套的 external MT（`_batchMode` / `_engineExternalMt`）可重入，不二次占锁。

## 文档

- 引擎契约：`transub-engine/docs/api-v1.md`
- Pro：`docs/advanced-boundary.md`

