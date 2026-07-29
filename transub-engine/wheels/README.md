# Bundled offline wheels (small ASR / Hub essentials)

Ship wheels **≤ ~5 MB** that Whisper / SenseVoice / Hugging Face clients need.
Large native stacks stay on-demand: `ctranslate2`, `av`, `onnxruntime`, `torch`,
CUDA (`nvidia-*`), `numba` / `llvmlite`, etc.

Refresh / install into embeddable runtime:

```bat
node tools/ensure-bundled-wheels.js
node tools/ensure-bundled-wheels.js --check
```

See `MANIFEST.txt` for the exact file list after a successful ensure run.
