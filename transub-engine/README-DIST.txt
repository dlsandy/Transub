Transub Engine 0.1.0 — standalone dist (no system Python)

Layout
------
  runtime/          Embeddable CPython 3.12.10 + pip + engine (HTTP min deps)
  _internal/bin/    optional ffmpeg (NOT required when hosted by Transub)
  models/           whisper-tiny + fsmn-vad shipped; other weights on-demand
  ENGINE_ROOT       marker for path resolution
  serve.bat         start HTTP API on 127.0.0.1:8765
  transub-engine.cmd  CLI wrapper (health, models, run, …)
  smoke_stub.bat    stub-mode health/capabilities

This pack includes a minimal HTTP shell plus two small essentials
(whisper-tiny for LID, fsmn-vad for default VAD) and a set of small
Python wheels under wheels/ (faster-whisper, funasr, tokenizers,
huggingface-hub and related Hub/HTTP helpers; each ≤ ~5 MB). Large native
stacks are NOT preinstalled: ctranslate2, av, onnxruntime, torch, CUDA,
numba — install on first use via Transub (model download / language detect
auto-pip) or:

  runtime\python.exe -m pip install "transub-engine[asr-whisper,mt,vad-whisperseg]"
  runtime\python.exe -m transub_engine models download --profile balanced
  runtime\python.exe -m transub_engine runtime ensure-gpu

Offline reinstall of bundled small wheels:

  node tools\ensure-bundled-wheels.js
  :: or pip each wheel under wheels\ with --no-deps --no-index --find-links=wheels

(Or POST /v1/models/download* and /v1/runtime/ensure-gpu* — they pip into runtime/.)

Transub integration
-------------------
  1. Nested as Transub/transub-engine/ (next to Transub.exe when packaged)
  2. Transub spawns:
       {home}\runtime\python.exe -m transub_engine serve --host 127.0.0.1 --port 8765
     and injects FFMPEG_BINARY from Transub `_internal/bin`
  3. Settings → 环境: leave path empty or click「内置」
  4. Ready check: GET http://127.0.0.1:8765/v1/health
  5. Before real jobs: download remaining models + (NVIDIA) ensure-gpu

Quick local test
----------------
  1. Double-click smoke_stub.bat
  2. Double-click serve.bat
  3. curl http://127.0.0.1:8765/v1/health
