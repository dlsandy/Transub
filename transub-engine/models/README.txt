Shipped with Transub desktop builds (small essentials):
  asr/whisper-tiny   — LID / smoke Whisper CT2 (~75 MB)
  vad/fsmn-vad       — default FunASR VAD (~50 MB)

Everything else is on-demand. Either:
  1) Junction/copy your models/{asr,mt,vad} into this models/ folder
  2) Set TRANSUB_ENGINE_MODELS to an existing models directory
  3) From this folder: runtime\python.exe -m transub_engine models download --profile balanced
  4) Or use Transub desktop: Models download / ensure-gpu

Dev / CI: node tools/ensure-bundled-models.js
