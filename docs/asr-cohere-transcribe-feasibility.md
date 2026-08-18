# 可行性笔记：Cohere Transcribe（本地 ASR）

**状态：** 基座已接入（`cohere-transcribe-03-2026` / backend `cohere-asr`）；JA 微调、原生时间戳仍待后续  
**来源：** 用户反馈（CrispASR + `cohere-transcribe-03-2026` 英语实测优于 `faster-whisper-large-v2`；日语专用权重效果也好）  
**更新：** 2026-08-16

## 结论（一句话）

已按计划接入 **模型本身** 到 `transub-engine`（transformers），不依赖 CrispASR / CrisperWeaver 外壳。

## 对象是什么

| 名称 | 角色 | 与 Transub 的关系 |
|------|------|-------------------|
| [Cohere Transcribe 03-2026](https://huggingface.co/CohereLabs/cohere-transcribe-03-2026) | 2B Conformer 编码器 + 轻量解码器 ASR；Apache-2.0；14 语（含 en / ja / zh / ko） | **真正要集成的权重** |
| [CrispASR](https://github.com/CrispStrobe/CrispASR) | ggml/C++ 多后端运行时（含 Cohere GGUF） | 用户试用的壳；不必捆绑 |
| Cohere 云 API | 托管转写 | 与「本地优先」产品线冲突；非首选 |

上游公开点：Open ASR Leaderboard 英语 WER 领先；吞吐对同类 1B+ 模型友好；官方建议前置 VAD/噪声门，减少非语音幻觉；推理期望带 **语种标签**（单语音频）。

日语侧另有社区微调（如 CrispASR 文档中的 JA fine-tune / GGUF），可作为后续专科模型，与基座分两条 catalog 条目。

## 与现有栈对照

| 已有 | 定位 | 相对 Cohere |
|------|------|-------------|
| `whisper-large-v2` / turbo / v3 | CT2 通用 | 反馈称英语综合不如 Cohere |
| `parakeet-tdt-0.6b-v2` | 英语推荐（NeMo，约 1.4GB 量级） | 更轻；Cohere 约 2B，质量可能更高、体积/显存更大 |
| `parakeet-tdt-ctc-0.6b-ja` / `whisper-ja-1.5b` / anime / kotoba / Reazon | 日语专科 | Cohere 基座 + JA 微调可作新候选，不替代现有链 |
| `qwen3-asr-0.6b` / `1.7b-ja*` | transformers；默认 TEN/VAD 帧时间戳；ForcedAligner 可选 | **实现范式接近**（非 CT2）；1.7B 专科另见 catalog |

## 推荐接入路径（引擎）

1. **Backend id：** `cohere-asr`（或 `cohere-transcribe`），挂在 `models_catalog` 新 `ModelSpec`。
2. **推理：** 优先 Hugging Face `transformers` 离线路径（官方推荐）；GGUF/CrispASR 仅作可选加速调研，避免再引入一整条 C++ 发行依赖。
3. **时间轴：** 上游短音频 demo 未必给词级时间戳。对齐 Transub 字幕需求时：
   - **首选：** 沿用现有 Silero / TEN / WhisperSeg 分帧 → 每帧 ASR → 帧边界作 cue（类似 anime-whisper TEN 路径）；
   - **备选：** 字数比例（CPS）修补；或二次 ForcedAlign（若验证稳定）。
4. **长片：** 定长/VAD 分窗；单窗上限需实测（云 API 有 25MB 限制，本地无此硬限，但仍受显存约束）。
5. **语种：** Job `language` 显式传入；`auto` 时用现有 `detect-language` 结果再喂模型（符合官方 monolingual + language tag 假设）。
6. **回退链（草案）：**
   - 英语主选 Cohere → `parakeet-tdt-0.6b-v2` → SenseVoice / tiny；
   - 日语若上 JA 微调：专科 → 现有 JA 同族链 → SenseVoice；
   - 实现落点：`engine-range-asr-policy.buildBatchAsrCandidates` + 内容档/推荐芯片（`asr-settings-core` / `POST /models/recommend`）。
7. **桌面：** 仅 catalog 展示、下载、预设文案；**禁止**往 `app.js` / `engine-bridge.js` 塞推理逻辑（见 no-monolith-growth）。

## 风险与体量

| 项 | 说明 |
|----|------|
| 体积 / 显存 | 2B ≈ 数 GB 权重；高于 Parakeet 0.6B；需 `size_hint_mb`、缺模型引导、低显存机器不默认推荐 |
| 依赖 | `transformers` + 对应权重类；与 Qwen3-ASR 路径可共享 extras 安装策略 |
| 幻觉 | 官方：无 VAD 时易把底噪转成字；影视/灵敏路径必须绑现有 VAD |
| 时间戳质量 | 无原生词级 ts 时，字幕切条依赖分帧；需和 Parakeet/Whisper 做同片对照 |
| 许可 | Apache-2.0，但 Hub 为 **gated**（同意条款 + `HF_TOKEN`）；设置 → 网络填写 Token，门禁下载建议官方端点 |
| CrispASR | 不作为产品依赖；文档中可注明「社区可用 CrispASR 自测同权重」 |

## 落地检查清单（基座）

- [x] `models_catalog` 条目 + 下载/校验
- [x] `asr/cohere_transcribe.py` + job 路由
- [x] 分窗 / cue 组装与进度 SSE
- [ ] 英语短片 + 长片实机 smoke（需下载权重）
- [x] 回退链 + UI 文案 / 硬件推荐保护
- [x] `docs/engine-boundary.md`、`docs/asr.md`、CHANGELOG「新增模型」

## 非目标（本笔记阶段 / 基座 PR）

- 不接 Cohere 云转写为默认路径  
- 不捆绑 CrispASR 二进制  
- 不替换现有 JA 专科默认（`av_soft` 等）直至实测通过  
- JA fine-tune 第二 catalog、ForcedAligner / 注意力 DTW 时间戳

## 相关文档

- 桌面 ASR 编排：[asr.md](./asr.md)
- 引擎边界：[engine-boundary.md](./engine-boundary.md)
- 上游发布说明：[Cohere Labs blog](https://huggingface.co/blog/CohereLabs/cohere-transcribe-03-2026-release)
