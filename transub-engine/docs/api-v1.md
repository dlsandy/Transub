# Transub Engine API v1

Base URL: `http://127.0.0.1:{port}/v1`  
Content-Type: `application/json`  
Progress: Server-Sent Events (`text/event-stream`) where noted.

## Compatibility

| Field | Meaning |
|-------|---------|
| `apiVersion` | Semver string, e.g. `1.0.0`. Transub rejects incompatible **major**. |
| `engineVersion` | Package version of this engine build. |
| `minClientApiMajor` | Minimum Transub-side adapter major (usually `1`). |

## Endpoints

### `GET /health`

```json
{
  "ok": true,
  "apiVersion": "1.0.0",
  "engineVersion": "0.1.0",
  "stub": false
}
```

### `GET /capabilities`

Lists supported tasks (`transcribe`, `translate_mt`, `dual`), ASR/MT/VAD backends, devices, and profiles.

### `GET /models`

Installed + catalog models (`asr` / `mt` / `vad`).

ASR ids include `sensevoice-small`, `whisper-tiny`, `whisper-large-v3-turbo`, `whisper-large-v2` (`Systran/faster-whisper-large-v2`), `whisper-large-v3`, optional Japanese-specialized `whisper-ja-1.5b` (`TransWithAI/whisper-ja-1.5B-ct2`), and optional anime/galgame `anime-whisper` (`quantumcookie/anime-whisper-ct2-fp16`). For `anime-whisper`, the engine clears `initialPrompt`/`hotwords` (prompting causes hallucinations), skips WhisperSeg clip gating, and by default runs **TEN VAD short frames** (0.5s silence / ≤5s groups) → per-frame ASR so the VAD frame owns the timeline (char-proportional intra-frame splits). Fallback when TEN is unavailable: ≤180s ffmpeg windows + CPS collapsed-timestamp repair (single-pass CT2 can native-crash on Windows). Job fields: `timingAlign` (`false`/`off` disables), `timingAlignModel` (`ten`|`auto`|omit = TEN frames; `rate` = windows+CPS only; `whisper-ja-1.5b`|`wav2vec2`|… = post-hoc align). Neither JA specialist is part of default profiles — pass `asrModel` / download by id.

### `POST /models/recommend`

Body: `{ "vramMb"?: number, "ramMb"?: number, "hasCuda"?: boolean }`  
Returns recommended `profile` (`speed` \| `balanced` \| `quality`) and model ids.

### `POST /models/download`

Body: `{ "profile"?: string, "modelIds"?: string[] }`  
Response: SSE events `{ "type": "progress"|"done"|"error", ... }`.

Before Hub weights, the engine installs pip extras required by the selected
models (e.g. `faster-whisper` + `numpy` for Whisper, `ctranslate2` for Opus MT).

### `POST /models/download-sync`

Same body; returns a single JSON result (used by Transub desktop client).

### `GET /runtime/gpu`

Probe NVIDIA GPU runtime readiness for **two stacks**: ASR/CTranslate2 (`cublas` /
`ctranslate2Cuda`) and WhisperSeg ONNX (`ortGpuCuda` / `onnxruntime-gpu`).
`status=ready` only when both applicable stacks are OK; CT2-ready but ORT-missing is
`partial` (hint names WhisperSeg explicitly).

```json
{
  "ok": true,
  "status": "partial",
  "hasCuda": true,
  "gpuName": "NVIDIA GeForce RTX 3080",
  "driverCudaVersion": "13.2",
  "cublas12": true,
  "ctranslate2Cuda": true,
  "asrGpuReady": true,
  "target": "cuda12",
  "ortGpuTarget": "cuda13",
  "ortGpuRequirement": "onnxruntime-gpu>=1.27",
  "ortGpuVersion": "",
  "ortGpuCuda": false,
  "whispersegGpuReady": false,
  "packages": ["nvidia-cublas-cu12", "nvidia-cuda-runtime-cu12", "nvidia-cudnn-cu12"],
  "hint": "ASR/CTranslate2 GPU 已就绪；WhisperSeg（onnxruntime-gpu）未就绪…"
}
```

### `GET /runtime/asr-whisper`

Probe Whisper CT2 stack (`faster-whisper` + `numpy`) used by ASR and short-window language detection.

```json
{
  "ok": true,
  "ready": false,
  "status": "need_install",
  "numpyVersion": "",
  "fasterWhisperVersion": "",
  "missing": ["numpy (No module named 'numpy')"],
  "hint": "…"
}
```

### `POST /runtime/ensure-gpu`

Body: `{ "force"?: boolean }`  
Auto-detect GPU and `pip install` CUDA 12 wheels into the engine environment when `cublas64_12.dll` is missing. Returns probe after install.

### `POST /runtime/ensure-gpu-stream`

Same body as `ensure-gpu`; response is SSE progress events then a final `done`/`error` payload.

### `POST /runtime/release-gpu`

Best-effort free of Torch / CTranslate2 CUDA caches in the engine process (for hand-off to llama-server / Sakura).

### `GET /runtime/audio-separate`

Probe Demucs vocal-separation readiness (`status`: `ready` \| `need_install` \| `need_torch_cuda`).  
Includes `torchCuda` / `hasCudaGpu` fields.

### `POST /runtime/ensure-audio-separate`

Body: `{ "force"?: boolean }`  
Installs Demucs (PyPI mirror). When an NVIDIA GPU is detected, also force-reinstalls CUDA PyTorch (prefer `cu126`, then `cu124` / `cu128`). Returns probe after install.

### `POST /runtime/ensure-audio-separate-stream`

Same body; SSE progress then `done`/`error` (stages include `download` for Demucs and `torch_cuda` for PyTorch).

### `POST /v1/detect-language`

Short-window spoken language ID (Whisper encoder only — no full transcription job).

```json
{
  "mediaPath": "C:/media/a.mkv",
  "asrModel": "whisper-tiny",
  "device": "auto",
  "durationSec": 12,
  "startSec": 60
}
```

Samples ~`durationSec` seconds (3–30) starting at `startSec` (default `0`). Prefer `startSec` ≥ ~60 on feature-length media so opening titles/BGM are skipped; if the seek window is empty the engine falls back to the file head. Picks an installed Whisper CT2 model (`asrModel` if Whisper, else `whisper-tiny` → turbo → …). If `faster-whisper` / `numpy` are missing, the endpoint installs them into the engine runtime before detecting. Returns:

```json
{
  "ok": true,
  "language": "ja",
  "confidence": 0.91,
  "asrModel": "whisper-tiny",
  "device": "cuda",
  "durationSec": 12,
  "startSec": 60,
  "top": [{ "language": "ja", "probability": 0.91 }]
}
```

### `POST /jobs`

Create a job. Same schema as CLI `run --job job.json`.

```json
{
  "task": "transcribe",
  "mediaPath": "C:/media/a.mkv",
  "outputDir": "C:/out",
  "language": "ja",
  "asrModel": "sensevoice-small",
  "mtModel": "opus-mt-ja-zh",
  "mtBackend": "opus-ct2",

  "subFormats": ["srt"],
  "vad": {
    "enabled": true,
    "model": "fsmn-vad",
    "threshold": 0.5,
    "minSpeechMs": 300,
    "minSilenceMs": 100,
    "speechPadMs": 200,
    "aggressive": false
  },
  "audio": {
    "denoise": "off",
    "separate": false,
    "filmAudioEnhance": false
  },
  "glossary": []
}
```

`subFormats`: `srt` (default), `vtt`, `ass`, `ass-dual` (dual task → single bilingual ASS with Source+ZH styles).

Optional job flags:

| Field | Meaning |
|-------|---------|
| `mtBackend` | `"opus-ct2"` (default local Opus) or `"external"` (HTTP adapter; LLM lives outside the engine) |
| `mtExternal` | Required when `mtBackend=external`: `{ "url", "timeoutSec"?, "headers"?, "batchSize"? }` |
| `releaseGpuAfter` | After job finishes, unload MT/Whisper/SenseVoice/WhisperSeg caches + empty CUDA |
| `dualAss` | Force bilingual ASS even if `ass-dual` not listed in `subFormats` |
| `includeWords` | Attach word timings on cues and write `{stem}.words.json` |
| `karaokeVtt` | Write karaoke WebVTT (`{stem}.karaoke.vtt`); implies `includeWords` |
| `perfProfile` | `"quality"` (default) or `"speed"` — speed: Silero VAD for JA Whisper, skip clip retranscribe, `beamSize=1` if unset, disable Whisper DTW word timestamps unless `includeWords`/`karaokeVtt` |
| `wordTimestamps` | Force Whisper DTW word alignment on/off (overrides `perfProfile` auto); always on when `includeWords`/`karaokeVtt` |
| `retranscribe` | Enable/disable Whisper clip retranscribe (default: on for quality, off for speed) |
| `timingAlign` | `false` / `"off"` disables anime timing align (rate-repair windows only) |
| `timingAlignModel` | Anime-whisper timeline: `ten` / `auto` / omit → TEN VAD short frames (≤5s); `rate` → windows+CPS only; `whisper-ja-1.5b` / `wav2vec2` / … → post-hoc dual align |
| `sensevoiceInprocess` | Run SenseVoice in-process (model cache; cancel cannot kill mid-generate). Same as env `TRANSUB_SENSEVOICE_INPROCESS=1` |

Process env (engine host):

| Env | Meaning |
|-----|---------|
| `TRANSUB_MAX_CONCURRENT_JOBS` | Max parallel jobs (`1`–`8`, default `1`). Raise carefully on CPU-only or multi-GPU. |
| `TRANSUB_SENSEVOICE_INPROCESS` | `1` = run SenseVoice in-process (uses model cache; cancel cannot kill FunASR mid-generate) |

### External MT (`mtBackend: "external"`)

Engine POSTs glossary-protected cues to an adapter URL. The adapter (desktop gateway / Sakura / OpenAI-compatible proxy) runs the LLM; the engine does **not** embed vendor SDKs or prompts.

**Request** `POST {mtExternal.url}`:

```json
{
  "apiVersion": 1,
  "jobId": "...",
  "language": "ja",
  "targetLanguage": "zh",
  "cues": [{ "id": 0, "start": 1.2, "end": 3.4, "text": "..." }]
}
```

**Response** (same order or by `id`):

```json
{
  "cues": [{ "id": 0, "text": "..." }]
}
```

| `mtExternal` field | Default | Meaning |
|--------------------|---------|---------|
| `url` | — | Adapter endpoint (required) |
| `timeoutSec` | `120` | Per-batch HTTP timeout |
| `headers` | `{}` | Extra request headers (e.g. `Authorization`) |
| `batchSize` | `32` | Cues per POST |

Failures (missing URL, non-2xx, length mismatch, timeout) fail the job with `MT_EXTERNAL_*` codes — no silent fallback to Opus. JA Opus polish is skipped for `external`; glossary protect / restore / enforce still apply. Before external MT the engine unloads local GPU model caches (Sakura / llama-server hand-off).

CLI: `--mt-backend external --mt-external-url http://127.0.0.1:8080/translate`

### `GET /jobs`

List recent jobs (in-memory + disk snapshots). Query: `?limit=50`.

### `POST /jobs/batch`

Body: `{ "mediaPaths": ["a.mkv","b.mkv"], "template": { ...JobBody fields }, "batchId"?: string }`  
Enqueues one job per media file. Concurrent GPU jobs default to **1** (serialized); set `TRANSUB_MAX_CONCURRENT_JOBS` to raise the limit.

### `GET /batches/{batchId}`

Aggregate progress for a batch: counts by status, percent finished, per-job media paths / outputs.

### `POST /jobs/scan-folder`

Body: `{ "folder": "D:/media", "recursive"?: true, "extensions"?: ["mkv","mp4"], "limit"?: 200, "template"?: {}, "outputDir"?: string }`  
Scans media files and enqueues them as a batch.

### Watch folder (poll)

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/watch/start` | Body: `{ folder, recursive?, intervalSec?, settleSec?, extensions?, template?, outputDir?, seedExisting? }` |
| `GET` | `/watch` | List active watches |
| `GET` | `/watch/{id}` | One watch |
| `POST` | `/watch/{id}/stop` | Stop and remove |

Poll-based (portable on Windows). With `seedExisting: true` (default), existing files are marked seen so only **new** arrivals enqueue. `settleSec` skips files still being written.

`glossary` (optional): list of `{ "src", "tgt" }` (also accepts `source`/`target`, `from`/`to`, or `[src, tgt]`).

- **MT** (`translate_mt` / `dual`, default): source terms are protected with placeholders before Opus MT and restored as target terms afterward. Latin terms use whole-word, case-insensitive matching.
- **ASR** (source correction): tag entries with `"stage": "asr"` (or `wrong`/`correct` keys), or pass a dedicated `asrGlossary` list. After transcription, misheard forms are replaced on source cues (e.g. `{ "wrong": "マイ", "correct": "舞" }` for Japanese name fixes). Short JA name tokens are expanded (`マイちゃん`→`舞ちゃん`, `彼女のマイ`→`彼女の舞`, `マイ大丈夫`→`舞大丈夫`) and **loanword-safe** (will not turn `マイク` / `マイペース` / `トラマイ` / `オーマイガスター` into `舞…`).

`asrGlossary` / `sourceGlossary` (optional): same shapes as `glossary`, but every untagged pair is treated as ASR correction.

`castNames` / `asrNames` (optional): list of correct person-name orthographies (e.g. `["舞", "あかり", "桃子"]`). Used to build Whisper name bias when `initialPrompt` / `hotwords` are omitted. Correct forms from `asrGlossary` are merged in automatically. On `translate_mt` / `dual`, the same names are **identity-locked** through Opus so kanji names (舞, 桃子) are not calqued (舞蹈 / 跳舞).

Built-in JA→ZH name lexicon (default on for `language=ja`): **60+** surname pairs with 新字体→简体 (渡辺→渡边, 長谷川→长谷川, 岡田→冈田, 浜崎→滨崎, 斎藤→斋藤, …), **150+** given-name readings (まひろ→真寻, ひまり→阳葵, はると→阳翔, ちひろ→千寻, あかりさん→明里桑, マイ→舞, …; ambiguous kana honorific-gated). Honorifics: **さん→桑、くん/君→君、ちゃん→酱、様→大人、先輩→前辈、先生→老师**. Also auto-normalizes ASR katakana→hiragana for those names, and seeds Whisper hotwords when `castNames` is omitted. Opt out with `"builtinNames": false`.

`initialPrompt` / `hotwords` (optional, Whisper): passed to faster-whisper to bias decoding toward cast names. If omitted, Engine auto-fills from `asrGlossary` (including wrong readings like `舞（マイ）`) + `castNames`.

MT language → model map: optional override file `{data}/mt_language_map.json` (see `TRANSUB_ENGINE_DATA`).

`vad` (free):

| Field | Meaning |
|-------|---------|
| `enabled` | Use VAD (default true) |
| `model` | Catalog id: `fsmn-vad` (SenseVoice), `silero-vad` (Whisper built-in), `whisperseg-asmr` (WhisperSeg sensitive ONNX → `clip_timestamps`) |
| `threshold` | Speech probability threshold (default `0.5`; film default `0.5`; WhisperSeg sensitive ≈`0.25`) |
| `minSpeechMs` / `minSilenceMs` / `speechPadMs` | Timing knobs (Silero / SenseVoice; WhisperSeg uses own presets when sensitive/aggressive) |
| `aggressive` | Free preset: higher threshold / cleaner cuts |
| `sensitive` | For Whisper: force `whisperseg-asmr` external VAD → `clip_timestamps`. Long media (≥10 min) gets **fixed ≤7 min windows** (instant; no ffmpeg silence scan), then WhisperSeg with a single decode + in-memory slices; empty long-media → full-audio failover. Wins over `aggressive`. WhisperSeg uses the job `device` (CUDA via `onnxruntime-gpu`; CPU package falls back with a progress note). |
| `hallucinationSilenceThreshold` | Optional Whisper-only: skip long silences (seconds). Omit or `≤0` = off (default). |

`device`: `auto` | `cuda` | `cpu` — applied to Demucs, WhisperSeg ONNX, ASR (Whisper/SenseVoice), and Opus CT2 MT. ffmpeg decode / scene silence-detect remain CPU (no GPU path).

`audio`:

| Field | Tier | Meaning |
|-------|------|---------|
| `denoise` | Free | `"light"` applies mild ffmpeg denoise before ASR |
| `separate` | Advanced | Demucs vocal separation before ASR |
| `filmAudioEnhance` | Advanced | Shortcut: separate + film VAD (mild defaults after Demucs; explicit lower thresholds are honored) |
| `filmPreset` | Advanced | Apply film VAD numbers without separating (no Demucs) |
| `startSec` / `trimStartSec` | Free | Optional ASR window start (seconds). Trimmed audio is temp-only; cue times are shifted back to absolute media time. |
| `durationSec` / `endSec` | Free | Optional window length or end (with `startSec`) for partial-job testing |

Progress stages may include `denoise` / `separate` / `scene` / `vad` / `vad_failover` / `cleanup` before finalize.

After ASR, Engine applies:

1. Light cue cleanup (bracketed SFX/SDH markers, music tokens); empty cues are dropped.
2. Hallucination filter (`quality.filter_hallucinated_cues`): loop/streak detection, plus whole-cue YouTube / soft-scene filler phrases (e.g. 「ご視聴ありがとうございました」「お疲れ様でした」「バイバイ」). Bare 「ありがとうございました」 is kept (real dialogue).
3. **ASR name-loop strip** (`asr_name_loops`): consecutive CJK cast/filler runs such as 「玲奈玲奈」「葵葵葵」and whole-cue name debris are removed **before** Opus / external MT so hallucinations are not translated.
4. For **Opus** JA→ZH, light post-MT cast-tag sanitize strips trailing / mid-cue pollution names (佳奈 / 玲奈 / 美咲桑…) that are not justified by the (loop-cleaned) source. External LLM backends rely on the desktop adapter sanitize.

Tasks:

| task | Behavior |
|------|----------|
| `transcribe` | ASR only → source-language cues |
| `translate_mt` | ASR then NMT (Opus CT2 or external HTTP) → Chinese cues written as `{stem}.{fmt}` (same basename as media) |
| `dual` | ASR source track (`{stem}.src.{fmt}`) + NMT Chinese track (`{stem}.zh.{fmt}`); optional `{stem}.dual.ass` |

`GET /capabilities` lists `mtBackends: ["opus-ct2", "external"]` and `features.mtExternal: true`.

### `GET /jobs/{id}`

Job status: `queued` \| `running` \| `done` \| `error` \| `cancelled`.

### `GET /jobs/{id}/events`

SSE progress: `stage`, `percent`, `detail`, `done`, `error`.

### `POST /jobs/{id}/cancel`

Request cooperative cancel (kills Demucs / SenseVoice worker process trees).

### `GET /jobs/{id}/checkpoint`

Returns resumable checkpoint metadata when ASR (or MT) finished enough to snapshot cues.

### `POST /jobs/{id}/resume`

Starts a **new** job that skips ASR using the prior checkpoint (`asr_done` / `mt_done`).

CLI: `python -m transub_engine run --resume <jobId>`

## CLI ↔ HTTP

| CLI | HTTP |
|-----|------|
| `serve` | (starts server) |
| `health` | `GET /health` |
| `capabilities` | `GET /capabilities` |
| `models list` | `GET /models` |
| `models recommend` | `POST /models/recommend` |
| `models download` | `POST /models/download` |
| `run --job job.json` | `POST /jobs` (sync wait) |

Progress on CLI: JSON lines to stdout (`--progress jsonl`, default).

## Errors

Stable shape: `{ "ok": false, "code": "MODEL_MISSING", "message": "..." }`.
