# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Changed

- **Qwen3-ASR → Transformers-native `-hf`**: drop `qwen-asr`; pin `asr-qwen3` to `transformers>=5.13,<6` + `huggingface-hub>=1.5,<2` (same major as Cohere). Catalog hubs remap to `*-hf`. Retired non-hf `qwen3-asr-1.7b-ja` (neosophie); old settings alias to official `qwen3-asr-1.7b`. Inference split into `qwen3_hf_{model,generate,align,convert}.py`; `qwen3_asr.py` stays orchestration-only. Re-download previously installed non-`-hf` weights.
- **Qwen3 JA Anime LoRA v3**: catalog `qwen3-asr-1.7b-ja-anime-lora-v3` (`hhim8826/qwen3-asr-lora-ja-anime-v3`) with companion base `qwen3-asr-1.7b` (`Qwen/Qwen3-ASR-1.7B-hf`); PEFT load + `num_beams=4`; `peft` added to `asr-qwen3`.
- **Qwen3-ASR hybrid chat template**: Hub ports that still ship legacy `chat_template.json` (jaykwok galgame, old 0.6B) used to abort every island with `continue_final_message … final message does not appear`. Generate now falls back to `add_generation_prompt` + `language …<asr_text>` append; sidecar repair copies official `chat_template.jinja` when possible.
- **Silero VAD → v6.2**: patch `faster-whisper==1.2.1`’s bundled `silero_vad_v6.onnx` to the reconstructed weights from [SYSTRAN/faster-whisper#1390](https://github.com/SYSTRAN/faster-whisper/pull/1390) (better OOD / cartoon / muted / phone-call edge cases). Vendored under `patches/faster-whisper/`; applied by `tools/ensure-bundled-wheels.js` until a newer PyPI faster-whisper ships it.

### Fixed

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
