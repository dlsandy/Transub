# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed

- **Qwen3 island ASR multi-hour slowdown**: do not pre-`.copy()` every island PCM at `frame_build` (lazy per-batch slice); cap each generate by ~48s spoken audio; after OOM batch-halving, gradually recover the session cap after sustained successes so a single early OOM does not pin the rest of a 2h+ job at batch 1–2.

### Added

- **Qwen3-ASR `ten_pcm` post-timing** (Transub Pro parity): after TEN/FireRed island ASR, re-slot cues onto island PCM subspans (char-weight) then waveform snap → silent shift → onset delay → hold → end clamp. Default on; disable with `vad.asrTiming=off`, request `asrTiming=off`, or `TRANSUB_ENGINE_ASR_TIMING=off`. ForcedAligner path polish-only (no reallocate). Modules: `asr/ten_pcm_{allocate,polish,pack}.py`.

### Changed

- **Qwen island batches stay duration-homogeneous**: time order is unchanged, but a generate stops before the longest/shortest island in the batch exceeds ~2.5× (a 5s line is not padded with 0.4s breaths). Spoken-seconds cap (48s) still applies.
- **Short empty islands skip solo-retry**: empty or ellipsis-only text under 0.7s is treated as a breath. Empties ≥0.7s and particle hits such as 「は」 still solo-retry.
- **Qwen island/window end shrink**: drop `span * 0.95` cue end (use full island/window end) so soft-AV tails are not clipped before polish.
### Added

- **FireRedASR2-AED**：catalog `firered-asr2-aed`（backend `firered-asr2`；Hub `FireRedTeam/FireRedASR2-AED`）。方言/中英/混说听写；词级时间戳 + 置信度；≤30s 分窗。推理包 `fireredasr2s` 随 `wheels/` 包装（extras `asr-firered-asr2`）。与随包装 FireRedVAD 无关。

### Changed

- **Qwen3-ASR → Transformers-native `-hf`**: drop `qwen-asr`; pin `asr-qwen3` to `transformers>=5.13,<6` + `huggingface-hub>=1.5,<2` (same major as Cohere). Catalog hubs remap to `*-hf`. Retired non-hf `qwen3-asr-1.7b-ja` (neosophie); old settings alias to official `qwen3-asr-1.7b`. Inference split into `qwen3_hf_{model,generate,align,convert}.py`; `qwen3_asr.py` stays orchestration-only. Re-download previously installed non-`-hf` weights.
- **Qwen3 JA Anime LoRA v3**: catalog `qwen3-asr-1.7b-ja-anime-lora-v3` (`hhim8826/qwen3-asr-lora-ja-anime-v3`) with companion base `qwen3-asr-1.7b` (`Qwen/Qwen3-ASR-1.7B-hf`); PEFT load + `num_beams=4`; `peft` added to `asr-qwen3`.
- **Qwen3-ASR hybrid chat template**: Hub ports that still ship legacy `chat_template.json` (jaykwok galgame, old 0.6B) used to abort every island with `continue_final_message … final message does not appear`. Generate now falls back to `add_generation_prompt` + `language …<asr_text>` append; sidecar repair copies official `chat_template.jinja` when possible.
- **Silero VAD → v6.2**: patch `faster-whisper==1.2.1`’s bundled `silero_vad_v6.onnx` to the reconstructed weights from [SYSTRAN/faster-whisper#1390](https://github.com/SYSTRAN/faster-whisper/pull/1390) (better OOD / cartoon / muted / phone-call edge cases). Vendored under `patches/faster-whisper/`; applied by `tools/ensure-bundled-wheels.js` until a newer PyPI faster-whisper ships it.

### Fixed

- **Model download vs live-engine extras lock**: Hub download no longer hard-fails with `EXTRAS_LOCKED_IN_PROCESS` when numpy/torch are already mapped (Whisper health probe). Desktop may pass `extrasPreflighted` to skip in-process pip; without it, lock/cold-install codes soft-continue so weights can still download. `ensure_asr_qwen3` heals pure-Python pin gaps under lock and returns `EXTRAS_REQUIRES_COLD_INSTALL` when CUDA/ROCm torch must be rewritten cold.
- **CLI self-lock on `runtime ensure-asr-qwen3`**: top-level `cli` → `jobs` → `audio` → `timing_pcm_cache` imported `numpy` before ensure ran, so any native pin gap (often `tokenizers==0.22.2`) returned `EXTRAS_LOCKED_IN_PROCESS` even though system-check probes passed. Lazy-import jobs/server and timing PCM; lock only packages actually present in `sys.modules` (numpy alone no longer blocks tokenizers/torch).
- **Hub LocalEntryNotFound / local-cache message**: treat “cannot find the requested files in the local cache / Internet connection” as a connectivity error so mirror downloads retry instead of failing on the first transient miss.

- **External MT polish timeline expand**: whole-film `phase=polish` may return `replaceTimeline` + paired `sourceCues`/`cues` when hybrid plot-polish splits a multi-speaker cue. Engine mutates JA+ZH in place and job_pipeline syncs `source_cues` (with flattened glossary restore) so `.src` / target tracks stay aligned.
- **ASR neighbor echo / tail leftover cues**: `_cue_text_is_echo` now catches short suffix leftovers that slipped under `_ECHO_MIN_BARE` (e.g. 「この勃起は…」 after 「つまり、この勃起は…」) and filler-led re-echoes, without collapsing real new turns that only share a short word. Anime-Whisper TEN island path runs `_dedupe_overlap_cues` before return.
- **AMD ROCm torchaudio ABI loop (GH #78)**: one-click `ensure-torch-rocm` no longer pins the Windows-crashing pair `torch==2.12.0+rocm10.0.0` + `torchaudio==2.11.0.2+rocm10.0.0` (`torch_new_stable_ivalue` in `libtorchaudio.pyd`). Pins are now `torch==2.12.0+rocm10.1.0`, `torchvision==0.27.0+rocm10.1.0`, `torchaudio==2.11.0+rocm10.1.0`. A 10.0 / `2.11.0.2` stack is treated as broken (without importing torchaudio) and uninstalled before the pinned reinstall, instead of skipped because HIP DLLs and `amd-torch-device-gfx*` metadata already exist. Device pack stays per GPU (RX 7900 → gfx1100, RX 9070 → gfx1201).

- **Numpy cold-heal exit-75 loop (GH #76)**: `_dist_info_has_record` used `PathDistribution.locate_file("RECORD")`, which resolves to `site-packages/RECORD` instead of `*.dist-info/RECORD`. Healthy numpy looked "missing RECORD", so serve kept queuing cold reinstall and exiting 75 — engine never stayed up (Qwen models appeared unrecognized). Now uses `Distribution.read_text("RECORD")`. Desktop stops auto-retry after consecutive exit 75.
- **mpmath 1.5.0a1 breaks Qwen3-ASR**: direct wheel picker no longer prefers pre-releases (packaging 24+ `in SpecifierSet` accepts alphas). Pin `mpmath>=1.3.0,<1.5` in torch hard deps so Huawei/Aliyun mirrors cannot reinstall `1.5.0a1` and trip sympy `cannot import name 'bitcount' from 'mpmath.libmp'`.
- **Torch reimport poison (Win docstring)**: never strip sys.modules['torch*'] after native _C is mapped (including when only 	orch._C remains). Qwen3-ASR no longer mislabels docstring poison as WinError 1114; engine returns a restart-required message, and the desktop batch loop force-restarts the engine once before failing the item.
- **Torch first-load WinError 1114**: do not prefer the docstring-poison copy when the exception is still a cuBLAS WinError 1114/999 (sticky `_C` map often coexists). Serve `/v1/health` exposes `torchPreloadOk` / `torchReimportPoisoned`. Desktop `forceRestart` must kill the old listener and spawn a new process — never reuse a still-healthy port as “restart ok”. Env-check probe PATH puts `torch\\lib` before `nvidia/*` (same order as serve preload).
- **Setup wizard torch serve probe**: prepare/base env-check adds blocking `torchEngineStartup` via `probe_torch_engine_startup()` (preload → nvidia inject → optional CT2). Qwen/SenseVoice cannot leave「环境检测」all-green when real serve-order Torch load would fail; one-click fix routes to「补齐 CUDA PyTorch」. Settings「系统检查」modal uses the same full check + fix plan, overview chips, and Torch-specific summary / close warning.
- **Qwen3-ASR all-window abort**: surface the first inference exception (CUDA OOM, etc.) instead of only `failed N/N windows`; fail fast on systemic errors and do not fall back to 90s windows after island inference already failed.
- **Batch jobs after Qwen3/SenseVoice**: do not strip a live `torch` from `sys.modules` when releasing GPU / importing CTranslate2. That left the next job failing with `_has_torch_function already has a docstring` or SenseVoice「无法原地重装」.
- **Opus MT Hub downloads**: skip unused Flax/Rust/TF dumps so `opus-mt-*` pulls finish more reliably; treat Hub `.cache`-only dirs as not installed (not「不完整」).
- **SenseVoice progress mojibake on Chinese Windows**: warm-worker stdout is now UTF-8 bytes (plus `PYTHONUTF8` / `PYTHONIOENCODING`), so details like `转写中（ja）…` no longer appear as `תд У ja` in engine logs.
- **Missing Opus MT after long ASR**: fail fast when language/MT model is known but not installed; on mid-job MT failure, promote `*.src.partial.*` → `*.src.*` so ASR work is kept.

### Changed

- **Whisper word timestamps**: default off for both `speed` and `quality` unless `includeWords` / karaoke (DTW is expensive and not needed for sentence cues).
- **Film-brief sample progress**: when using external MT, emit `影片简要取样 N/M 句` so the desktop engine log shows sampling before sentence batches.
- **`translate_mt` output naming**: write `{stem}.{fmt}` (same basename as the media file) instead of `{stem}.zh.{fmt}`, so players can auto-load the subtitle.

## [0.1.0] — 2026-07-27

### Added

- Local ASR + Opus NMT engine with HTTP `/v1/*` API and CLI (`serve`, `run`, `models`, batch/watch).
- ASR backends: SenseVoice, faster-whisper (incl. Whisper-JA 1.5B / large-v3-turbo).
- MT: Opus-CT2 (ja/en/ko→zh) and optional external HTTP adapter.
- VAD: Silero / fsmn-vad / WhisperSeg sensitive mode.
- Audio: light denoise, optional Demucs film enhance, clip windowing.
- JA→ZH polish, built-in name lexicon, glossary / cast-name bias, ASR name-loop cleanup.
- Drag-drop CLI `.bat` presets for common GPU/CPU / VAD / perf profiles.
- Stub mode (`TRANSUB_ENGINE_STUB=1`) for contract tests without GPU models.

### Notes

- FFmpeg is **not** vendored in git; place binaries under `_internal/bin/` (see README).
- CUDA PyTorch wheels belong in a local `.cache/` or env install — not in the repository.
- Binding the HTTP server beyond `127.0.0.1` exposes unauthenticated media/job endpoints; keep loopback for local desktop use.
