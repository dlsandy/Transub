# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed

- **Opus MT Hub downloads**: skip unused Flax/Rust/TF dumps so `opus-mt-*` pulls finish more reliably; treat Hub `.cache`-only dirs as not installed (not「不完整」).
- **SenseVoice progress mojibake on Chinese Windows**: warm-worker stdout is now UTF-8 bytes (plus `PYTHONUTF8` / `PYTHONIOENCODING`), so details like `转写中（ja）…` no longer appear as `תд У ja` in engine logs.
- **Missing Opus MT after long ASR**: fail fast when language/MT model is known but not installed; on mid-job MT failure, promote `*.src.partial.*` → `*.src.*` so ASR work is kept.

### Changed

- **`translate_mt` output naming**: write `{stem}.{fmt}` (same basename as the media file) instead of `{stem}.zh.{fmt}`, so players can auto-load the subtitle.

## [0.1.0] — 2026-07-27

### Added

- Local ASR + Opus NMT engine with HTTP `/v1/*` API and CLI (`serve`, `run`, `models`, batch/watch).
- ASR backends: SenseVoice, faster-whisper (incl. Whisper-JA 1.5B / large-v3-turbo).
- MT: Opus-CT2 (ja/en/ko→zh) and optional external HTTP adapter.
- VAD: Silero / fsmn-vad / WhisperSeg ASMR sensitive mode.
- Audio: light denoise, optional Demucs film enhance, clip windowing.
- JA→ZH polish, built-in name lexicon, glossary / cast-name bias, ASR name-loop cleanup.
- Drag-drop CLI `.bat` presets for common GPU/CPU / VAD / perf profiles.
- Stub mode (`TRANSUB_ENGINE_STUB=1`) for contract tests without GPU models.

### Notes

- FFmpeg is **not** vendored in git; place binaries under `_internal/bin/` (see README).
- CUDA PyTorch wheels belong in a local `.cache/` or env install — not in the repository.
- Binding the HTTP server beyond `127.0.0.1` exposes unauthenticated media/job endpoints; keep loopback for local desktop use.
