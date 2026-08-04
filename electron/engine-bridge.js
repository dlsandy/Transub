/**
 * Transub Engine bridge — spawn local engine HTTP server and run subtitle jobs.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadSettings, saveSettings } = require('./settings-data');
const {
    mergeEngineOptions,
    mapTaskToEngineTask,
    usesExternalMt,
    isApiCompatible,
    resolveEngineInstallPath,
    DEFAULT_ENGINE_URL,
} = require('./engine-options');
const { getBundledEnginePath, getBundledEnginePathIfPresent, isValidEngineRoot } = require('./app-paths');
const {
    getHealth,
    getCapabilities,
    listModels,
    recommendModels,
    detectLanguage,
    translateCuesMt,
    downloadModels,
    downloadModelsStream,
    getGpuRuntime,
    getAsrWhisperRuntime,
    ensureGpuRuntime,
    ensureGpuRuntimeStream,
    releaseGpuMemory,
    getAudioSeparateRuntime,
    ensureAudioSeparateRuntime,
    ensureAudioSeparateRuntimeStream,
    createJob,
    cancelJob,
    waitJob,
} = require('./engine-client');
const { mergeTransWithAiOptions, stripPostTaskFields } = require('./transwithai-options');
const { mergeSenseOverrides, sanitizeSakuraMtForLanguage } = require('../src/js/content-profile-core');
const { buildVadJobOptions, buildAudioJobOptions } = require('./engine-audio-options');
const {
    resolveEngineSubFormats,
    buildEngineGlossaryPairs,
    buildEngineJobFlags,
    buildExternalMtJobFields,
} = require('./engine-job-options');
const { startEngineMtAdapter } = require('./engine-mt-adapter');
const {
    broadcastEngineDownloadProgress,
} = require('./download-window');
const {
    validateWhlFiles,
    installLocalWheels,
} = require('./local-whl-install');

let engineProc = null;
let engineBaseUrl = DEFAULT_ENGINE_URL;
let batchCancelled = false;
let batchRunning = false;
let currentJobId = '';
/** @type {((name: string) => void) | null} */
let ensureBridgeFn = null;
/** @type {AbortController | null} */
let batchMtAbortController = null;
/** @type {string} */
let engineLogPathCached = '';
/** @type {string} */
let engineLogLineBuf = '';
let engineLogLastKept = '';
let engineLogRepeatCount = 0;
let engineLogLastDroppedKey = '';
let engineLogDroppedCount = 0;
/** @type {string[]} */
let engineLogWriteQueue = [];
/** @type {ReturnType<typeof setTimeout> | null} */
let engineLogFlushTimer = null;
/** @type {AbortController|null} */
let downloadAbort = null;
let downloadBusy = false;
/** @type {AbortController|null} */
let opusTextAbortController = null;

/** Fallback Hub ids (keep in sync with Transub-Engine models_catalog). */
const ENGINE_MODEL_HUB_FALLBACK = {
    'sensevoice-small': {
        hubId: 'FunAudioLLM/SenseVoiceSmall',
        kind: 'asr',
        name: 'SenseVoice Small',
        note: '多语种快速语音识别；中文与日语表现好，适合默认/均衡档',
    },
    'whisper-tiny': {
        hubId: 'Systran/faster-whisper-tiny',
        kind: 'asr',
        name: 'Whisper tiny',
        note: '体积小、速度快；精度较低，适合试跑与低配机器',
    },
    'whisper-large-v3-turbo': {
        hubId: 'deepdml/faster-whisper-large-v3-turbo-ct2',
        kind: 'asr',
        name: 'Whisper large-v3-turbo',
        note: '可选 · 质量与速度较均衡；多语种高精度识别（非默认安装）',
    },
    'whisper-large-v3': {
        hubId: 'Systran/faster-whisper-large-v3',
        kind: 'asr',
        name: 'Whisper large-v3',
        note: '识别质量更高；体积与显存/内存占用更大',
    },
    'whisper-ja-1.5b': {
        hubId: 'TransWithAI/whisper-ja-1.5B-ct2',
        kind: 'asr',
        name: 'Whisper JA 1.5B（日语微调）',
        note: '日语微调 ASR；适合日语影视、轻声与口语内容',
    },
    'anime-whisper': {
        hubId: 'quantumcookie/anime-whisper-ct2-fp16',
        kind: 'asr',
        name: 'Anime Whisper（动画/Galgame）',
        note: 'kotoba-v2.0 动画演技微调；软声/NSFW 更稳；引擎自动禁 prompt 并分窗转写（避免全片崩溃）',
    },
    'kotoba-whisper-v2.0-faster': {
        hubId: 'kotoba-tech/kotoba-whisper-v2.0-faster',
        kind: 'asr',
        name: 'Kotoba Whisper v2.0（日语）',
        note: 'kotoba 日语蒸馏 Whisper；通用日语、段级时间戳可用；偏广播域，非软 AV 特化',
    },
    'reazonspeech-k2': {
        hubId: 'reazon-research/reazonspeech-k2-v2',
        kind: 'asr',
        name: 'ReazonSpeech K2（日语）',
        note: 'Zipformer/sherpa-onnx；自带 subword 时间戳；≤25s 分窗；偏广播域',
    },
    'qwen3-asr-0.6b': {
        hubId: 'Qwen/Qwen3-ASR-0.6B',
        kind: 'asr',
        name: 'Qwen3-ASR 0.6B',
        note: 'Qwen3 专用 ASR；下载时附带 ForcedAligner 做时间戳；依赖较重、长片较慢',
    },
    'qwen3-forced-aligner-0.6b': {
        hubId: 'Qwen/Qwen3-ForcedAligner-0.6B',
        kind: 'asr',
        name: 'Qwen3 ForcedAligner 0.6B',
        note: '为 Qwen3-ASR 提供词/字级时间戳（随 qwen3-asr-0.6b 自动下载）',
    },
    'opus-mt-en-zh': {
        hubId: 'Helsinki-NLP/opus-mt-en-zh',
        kind: 'mt',
        name: 'Opus-MT EN→ZH',
        note: '英语→简中机器翻译；本地 Opus-MT，无需大模型',
    },
    'opus-mt-ja-zh': {
        hubId: 'shun89/opus-mt-ja-zh',
        kind: 'mt',
        name: 'Opus-MT JA→ZH',
        note: '日语→简中机器翻译；本地 Opus-MT，无需大模型',
    },
    'opus-mt-ko-zh': {
        hubId: 'shun89/opus-mt-ko-zh',
        kind: 'mt',
        name: 'Opus-MT KO→ZH',
        note: '韩语→简中机器翻译；本地 Opus-MT，无需大模型',
    },
    'opus-mt-de-zh': {
        hubId: 'Helsinki-NLP/opus-mt-de-ZH',
        kind: 'mt',
        name: 'Opus-MT DE→ZH',
        note: '德语→简中机器翻译；本地 Opus-MT',
    },
    'opus-mt-es-zh': {
        hubId: 'Helsinki-NLP/opus-tatoeba-es-zh',
        kind: 'mt',
        name: 'Opus-MT ES→ZH',
        note: '西班牙语→简中机器翻译；本地 Opus-MT',
    },
    'opus-mt-fi-zh': {
        hubId: 'Helsinki-NLP/opus-mt-fi-ZH',
        kind: 'mt',
        name: 'Opus-MT FI→ZH',
        note: '芬兰语→简中机器翻译；本地 Opus-MT',
    },
    'opus-mt-sv-zh': {
        hubId: 'Helsinki-NLP/opus-mt-sv-ZH',
        kind: 'mt',
        name: 'Opus-MT SV→ZH',
        note: '瑞典语→简中机器翻译；本地 Opus-MT',
    },
    'sakura-1.5b': {
        hubId: '',
        kind: 'mt',
        name: 'Sakura 1.5B（日→中 · 免费）',
        backend: 'sakura-gguf',
        note: '日→简中推理翻译；免费轻量，适合本地 LLM 管线',
    },
    'sakura-7b': {
        hubId: '',
        kind: 'mt',
        name: 'Sakura 7B（日→中 · 免费）',
        backend: 'sakura-gguf',
        note: '日→简中推理翻译；质量更好，建议内存更充裕时选用',
    },
    'fsmn-vad': {
        hubId: 'alextomcat/speech_fsmn_vad_zh-cn-16k-common-pytorch',
        kind: 'vad',
        name: 'FSMN-VAD',
        note: 'FunASR 语音活动检测；配合 SenseVoice 管线使用',
    },
    'silero-vad': {
        hubId: '',
        kind: 'vad',
        name: 'Silero VAD（随 faster-whisper 内置）',
        note: '随 faster-whisper 内置；无需单独下载',
    },
    'whisperseg-asmr': {
        hubId: 'TransWithAI/Whisper-Vad-EncDec-ASMR-onnx',
        kind: 'vad',
        name: 'WhisperSeg ASMR（日语轻声）',
        note: '必装 · 灵敏检出 / 日语软声；需配合 Whisper ASR',
    },
};

const ENGINE_PROFILE_MODELS = {
    speed: ['sensevoice-small', 'opus-mt-en-zh', 'opus-mt-ja-zh', 'opus-mt-ko-zh', 'fsmn-vad', 'whisperseg-asmr'],
    balanced: ['sensevoice-small', 'opus-mt-en-zh', 'opus-mt-ja-zh', 'opus-mt-ko-zh', 'fsmn-vad', 'whisperseg-asmr'],
    // quality no longer auto-installs whisper-large-v3-turbo (optional download).
    quality: ['sensevoice-small', 'opus-mt-en-zh', 'opus-mt-ja-zh', 'opus-mt-ko-zh', 'fsmn-vad', 'whisperseg-asmr'],
};

/**
 * GPU CUDA12 pip wheels — direct win_amd64 .whl links (not simple index pages).
 * Filenames/hashes may be refreshed when mirrors publish newer builds.
 */
const GPU_MANUAL_PACKAGES = [
    {
        id: 'nvidia-cublas-cu12',
        name: 'NVIDIA cuBLAS (CUDA 12)',
        fileName: 'nvidia_cublas_cu12-12.9.2.10-py3-none-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/20/e2/fc9a0e985249d873150276d5afb02e39a66817fedbf1a385724393e505ed/nvidia_cublas_cu12-12.9.2.10-py3-none-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/20/e2/fc9a0e985249d873150276d5afb02e39a66817fedbf1a385724393e505ed/nvidia_cublas_cu12-12.9.2.10-py3-none-win_amd64.whl',
    },
    {
        id: 'nvidia-cuda-runtime-cu12',
        name: 'NVIDIA CUDA Runtime (CUDA 12)',
        fileName: 'nvidia_cuda_runtime_cu12-12.9.79-py3-none-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/59/df/e7c3a360be4f7b93cee39271b792669baeb3846c58a4df6dfcf187a7ffab/nvidia_cuda_runtime_cu12-12.9.79-py3-none-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/59/df/e7c3a360be4f7b93cee39271b792669baeb3846c58a4df6dfcf187a7ffab/nvidia_cuda_runtime_cu12-12.9.79-py3-none-win_amd64.whl',
    },
    {
        id: 'nvidia-cudnn-cu12',
        name: 'NVIDIA cuDNN (CUDA 12)',
        fileName: 'nvidia_cudnn_cu12-9.9.0.52-py3-none-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/6f/5c/f77147ce7e27a4e9087fb34b0539ff085c68e7093e96ee85576fe31fe064/nvidia_cudnn_cu12-9.9.0.52-py3-none-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/6f/5c/f77147ce7e27a4e9087fb34b0539ff085c68e7093e96ee85576fe31fe064/nvidia_cudnn_cu12-9.9.0.52-py3-none-win_amd64.whl',
    },
    {
        id: 'nvidia-cufft-cu12',
        name: 'NVIDIA cuFFT (CUDA 12)',
        fileName: 'nvidia_cufft_cu12-11.4.1.4-py3-none-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/20/ee/29955203338515b940bd4f60ffdbc073428f25ef9bfbce44c9a066aedc5c/nvidia_cufft_cu12-11.4.1.4-py3-none-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/20/ee/29955203338515b940bd4f60ffdbc073428f25ef9bfbce44c9a066aedc5c/nvidia_cufft_cu12-11.4.1.4-py3-none-win_amd64.whl',
    },
    {
        id: 'nvidia-curand-cu12',
        name: 'NVIDIA cuRAND (CUDA 12)',
        fileName: 'nvidia_curand_cu12-10.3.9.90-py3-none-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/b9/75/70c05b2f3ed5be3bb30b7102b6eb78e100da4bbf6944fd6725c012831cab/nvidia_curand_cu12-10.3.9.90-py3-none-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/b9/75/70c05b2f3ed5be3bb30b7102b6eb78e100da4bbf6944fd6725c012831cab/nvidia_curand_cu12-10.3.9.90-py3-none-win_amd64.whl',
    },
];

/**
 * WhisperSeg onnxruntime-gpu — mutually exclusive with CPU ``onnxruntime``.
 * CUDA 12 drivers → 1.21.x (<1.27); CUDA 13 drivers → >=1.27.
 */
const ORT_GPU_MANUAL_PACKAGES = {
    cuda12: {
        id: 'onnxruntime-gpu',
        name: 'onnxruntime-gpu（WhisperSeg · CUDA 12）',
        target: 'cuda12',
        requirement: 'onnxruntime-gpu>=1.21,<1.27',
        fileName: 'onnxruntime_gpu-1.21.1-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/dc/ad/a9199df9350b5fee6b7377d3af03ed45a2ef162feb10679b0bc10f270515/onnxruntime_gpu-1.21.1-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/dc/ad/a9199df9350b5fee6b7377d3af03ed45a2ef162feb10679b0bc10f270515/onnxruntime_gpu-1.21.1-cp312-cp312-win_amd64.whl',
        group: 'WhisperSeg / onnxruntime-gpu',
        note: '灵敏检出 GPU；与 CPU 版 onnxruntime 互斥，装前请先卸载后者',
    },
    cuda13: {
        id: 'onnxruntime-gpu',
        name: 'onnxruntime-gpu（WhisperSeg · CUDA 13）',
        target: 'cuda13',
        requirement: 'onnxruntime-gpu>=1.27',
        fileName: 'onnxruntime_gpu-1.28.0-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/e5/9e/92554acd080db68f549fd0e653fcf51a9dea7cb31e70c497714a9f2310fc/onnxruntime_gpu-1.28.0-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/e5/9e/92554acd080db68f549fd0e653fcf51a9dea7cb31e70c497714a9f2310fc/onnxruntime_gpu-1.28.0-cp312-cp312-win_amd64.whl',
        group: 'WhisperSeg / onnxruntime-gpu',
        note: '灵敏检出 GPU（驱动 CUDA 13+）；与 CPU 版 onnxruntime 互斥',
    },
};

/** Best-effort: nvidia-smi CUDA major for picking the ORT GPU wheel. */
function detectDriverCudaMajorQuick() {
    try {
        const { execFileSync } = require('child_process');
        const out = execFileSync('nvidia-smi', [], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 4000,
        });
        const m = String(out || '').match(/CUDA\s+(?:UMD\s+)?Version:\s*(\d+)\.(\d+)/i);
        if (m) return Number(m[1]) || 0;
    } catch (_) { /* ignore */ }
    return 0;
}

function resolveOrtGpuManualPackage(payload = {}) {
    const desired = String(
        payload.ortGpuDesiredTarget
        || payload.ortGpuTarget
        || '',
    ).trim().toLowerCase();
    if (desired === 'cuda13' || desired === 'cuda12') {
        return ORT_GPU_MANUAL_PACKAGES[desired];
    }
    const req = String(payload.ortGpuRequirement || '').trim();
    // Prefer explicit upper bound (CUDA 12 pin) over ">=1.27" substring matches.
    if (/<\s*1\.27/.test(req)) {
        return ORT_GPU_MANUAL_PACKAGES.cuda12;
    }
    if (/>=\s*1\.27/.test(req)) {
        return ORT_GPU_MANUAL_PACKAGES.cuda13;
    }
    const major = detectDriverCudaMajorQuick();
    if (major >= 13) return ORT_GPU_MANUAL_PACKAGES.cuda13;
    return ORT_GPU_MANUAL_PACKAGES.cuda12;
}

function mapGpuManualItem(pkg, { group = 'GPU 组件', primary = false } = {}) {
    return {
        id: pkg.id,
        name: pkg.name,
        kind: 'gpu',
        group: pkg.group || group,
        fileName: pkg.fileName,
        officialUrl: pkg.officialUrl,
        mirrorUrl: pkg.mirrorUrl,
        defaultUrl: pkg.mirrorUrl || pkg.officialUrl,
        note: pkg.note || pkg.fileName || 'pip 包（whl）· 直链下载',
        primary: !!primary,
    };
}

/** SenseVoice extras (torch / torchaudio / funasr / numpy) — direct .whl links.
 * numpy must be <2.5 (numba/librosa requirement); 2.5+ forces numba source builds.
 */
const SENSEVOICE_MANUAL_PACKAGES = [
    {
        id: 'numpy',
        name: 'NumPy（需 <2.5，兼容 numba）',
        fileName: 'numpy-2.4.6-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/ab/ca/feab00bd44aa5fe1ad2c18f08b4d3bb92e26484b0b1d1443897809ed528c/numpy-2.4.6-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/ab/ca/feab00bd44aa5fe1ad2c18f08b4d3bb92e26484b0b1d1443897809ed528c/numpy-2.4.6-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'numba',
        name: 'Numba（funasr/librosa 依赖）',
        fileName: 'numba-0.66.0-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/fc/eb/9e6171e378822ab191c7abcfd3d8cfc8644516f6c7834c22e210e4acc070/numba-0.66.0-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/fc/eb/9e6171e378822ab191c7abcfd3d8cfc8644516f6c7834c22e210e4acc070/numba-0.66.0-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'llvmlite',
        name: 'llvmlite（numba 依赖）',
        fileName: 'llvmlite-0.48.0-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/16/78/d824ffff7521cd140dc2006e44ce2bc82e64b48d1b32e90e956308c85a74/llvmlite-0.48.0-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/16/78/d824ffff7521cd140dc2006e44ce2bc82e64b48d1b32e90e956308c85a74/llvmlite-0.48.0-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'torch',
        name: 'PyTorch（torch）',
        fileName: 'torch-2.9.1-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/b1/1a/64f5769025db846a82567fa5b7d21dba4558a7234ee631712ee4771c436c/torch-2.9.1-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/b1/1a/64f5769025db846a82567fa5b7d21dba4558a7234ee631712ee4771c436c/torch-2.9.1-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'torchaudio',
        name: 'TorchAudio',
        fileName: 'torchaudio-2.9.1-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/2e/7c/df90eb0b337cbad59296ed91778e32be069330f5186256d4ce9ea603d324/torchaudio-2.9.1-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/2e/7c/df90eb0b337cbad59296ed91778e32be069330f5186256d4ce9ea603d324/torchaudio-2.9.1-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'funasr',
        name: 'FunASR',
        fileName: 'funasr-1.3.30-py3-none-any.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/e6/bb/af40f8eac8163ff59194ed289f3802b1ae8b3abdbec50f381ce8b3798353/funasr-1.3.30-py3-none-any.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/e6/bb/af40f8eac8163ff59194ed289f3802b1ae8b3abdbec50f381ce8b3798353/funasr-1.3.30-py3-none-any.whl',
    },
];

/** Whisper extras (faster-whisper / ctranslate2 / numpy) — direct .whl links. */
const WHISPER_MANUAL_PACKAGES = [
    {
        id: 'numpy',
        name: 'NumPy（需 <2.5）',
        fileName: 'numpy-2.4.6-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/ab/ca/feab00bd44aa5fe1ad2c18f08b4d3bb92e26484b0b1d1443897809ed528c/numpy-2.4.6-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/ab/ca/feab00bd44aa5fe1ad2c18f08b4d3bb92e26484b0b1d1443897809ed528c/numpy-2.4.6-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'ctranslate2',
        name: 'CTranslate2（Whisper 推理核心）',
        fileName: 'ctranslate2-4.8.1-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/c0/82/0a5f7f2b03b4e10aacb3146715724e1b96bb993cc7d199be28c9825aa120/ctranslate2-4.8.1-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/c0/82/0a5f7f2b03b4e10aacb3146715724e1b96bb993cc7d199be28c9825aa120/ctranslate2-4.8.1-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'onnxruntime',
        name: 'ONNX Runtime（Silero VAD）',
        fileName: 'onnxruntime-1.21.1-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/5f/9d/fb8895b2cb38c9965d4b4e0a9aa1398f3e3f16c4acb75cf3b61689780a65/onnxruntime-1.21.1-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/5f/9d/fb8895b2cb38c9965d4b4e0a9aa1398f3e3f16c4acb75cf3b61689780a65/onnxruntime-1.21.1-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'faster-whisper',
        name: 'faster-whisper',
        fileName: 'faster_whisper-1.2.1-py3-none-any.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/05/99/49ee85903dee060d9f08297b4a342e5e0bcfca2f027a07b4ee0a38ab13f9/faster_whisper-1.2.1-py3-none-any.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/05/99/49ee85903dee060d9f08297b4a342e5e0bcfca2f027a07b4ee0a38ab13f9/faster_whisper-1.2.1-py3-none-any.whl',
    },
];

function getEngineModelsRoot(engineInstallPath = '') {
    const root = String(engineInstallPath || process.env.TRANSUB_ENGINE_HOME || '').trim();
    if (root) {
        return path.join(path.resolve(root), 'models');
    }
    // Fallback when install path is unknown (should be rare).
    const local = process.env.LOCALAPPDATA || process.env.HOME || os.homedir();
    return path.join(local, 'TransubEngine', 'models');
}

function normalizeHfEndpoint(value) {
    return String(value || '').trim().replace(/\/+$/, '') || 'https://hf-mirror.com';
}

function uniqueIds(ids) {
    const seen = new Set();
    const out = [];
    for (const id of ids) {
        const mid = String(id || '').trim();
        if (!mid || seen.has(mid)) continue;
        seen.add(mid);
        out.push(mid);
    }
    return out;
}

function resolveDownloadModelIds(payload = {}) {
    const ids = [];
    if (Array.isArray(payload.modelIds)) {
        ids.push(...payload.modelIds);
    }
    const profile = String(payload.profile || '').trim();
    if (profile && ENGINE_PROFILE_MODELS[profile]) {
        ids.push(...ENGINE_PROFILE_MODELS[profile]);
    }
    if (!ids.length) {
        ids.push(...ENGINE_PROFILE_MODELS.balanced);
    }
    const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
    // Sakura GGUF is downloaded via managed LLM path, not engine Hub.
    return uniqueIds(ids).filter((id) => !sakuraCatalog.isSakuraMtModel(id));
}

function buildHubUrls(hubId, hfEndpoint) {
    const id = String(hubId || '').trim();
    if (!id) return { officialUrl: '', mirrorUrl: '' };
    const mirror = normalizeHfEndpoint(hfEndpoint);
    return {
        officialUrl: `https://huggingface.co/${id}`,
        mirrorUrl: `${mirror}/${id}`,
    };
}

/** @param {string} value @returns {'models'|'gpu'|'demucs'|'sensevoice'|'whisper'} */
function normalizeEngineDownloadKind(value) {
    const k = String(value || 'models').trim().toLowerCase();
    if (k === 'gpu') return 'gpu';
    if (k === 'demucs' || k === 'audio-separate' || k === 'audioseparate' || k === 'separate') {
        return 'demucs';
    }
    if (k === 'sensevoice' || k === 'sensevoice-runtime' || k === 'runtime-sensevoice') {
        return 'sensevoice';
    }
    if (k === 'whisper' || k === 'whisper-runtime' || k === 'runtime-whisper') {
        return 'whisper';
    }
    return 'models';
}

async function buildEngineDownloadInfo(payload = {}) {
    const kind = normalizeEngineDownloadKind(payload.kind);
    const merged = mergeEngineOptions(payload || {});
    merged.engineInstallPath = resolveEngineInstallPath(merged.engineInstallPath);
    const hfEndpoint = payload.hfEndpoint != null
        ? String(payload.hfEndpoint || '').trim()
        : String(merged.engineHfEndpoint || '').trim();
    const modelsRoot = getEngineModelsRoot(merged.engineInstallPath);

    if (kind === 'gpu') {
        const installPath = String(merged.engineInstallPath || '').trim();
        const runtimeSite = path.join(installPath, 'runtime', 'Lib', 'site-packages', 'nvidia');
        const venvSite = path.join(installPath, '.venv', 'Lib', 'site-packages', 'nvidia');
        const runtimePy = resolveEngineRuntimePython(installPath);
        const folder = fs.existsSync(runtimeSite)
            ? runtimeSite
            : (fs.existsSync(venvSite)
                ? venvSite
                : (runtimePy
                    ? path.join(installPath, 'runtime')
                    : path.join(installPath, '.venv')));
        const pipPrefix = runtimePy
            ? `"${runtimePy}" -m pip`
            : 'python -m pip';
        const ortPkg = resolveOrtGpuManualPackage(payload || {});
        const ortOnly = payload?.ortOnly === true
            || (payload?.asrGpuReady === true && payload?.ortGpuCuda === false);
        // Prefer the driver-matched ORT wheel first — ASR/CT2 cuBLAS is often
        // already ready while WhisperSeg still needs onnxruntime-gpu.
        const ortItem = mapGpuManualItem(ortPkg, {
            group: 'WhisperSeg / onnxruntime-gpu',
            primary: true,
        });
        // Also offer the alternate pin so CUDA 13 drivers can fall back to
        // CUDA 12 ORT when cu13 extras are unavailable.
        const altTarget = ortPkg.target === 'cuda13' ? 'cuda12' : 'cuda13';
        const altPkg = ORT_GPU_MANUAL_PACKAGES[altTarget];
        const altItem = mapGpuManualItem({
            ...altPkg,
            name: `${altPkg.name}（备选）`,
        }, { group: 'WhisperSeg / onnxruntime-gpu（备选）' });
        const cudaItems = GPU_MANUAL_PACKAGES.map((pkg) => mapGpuManualItem(pkg));
        const items = ortOnly
            ? [ortItem, altItem]
            : [ortItem, altItem, ...cudaItems];
        const ortPip = ortPkg.requirement || 'onnxruntime-gpu>=1.27';
        const cudaPip = 'nvidia-cublas-cu12 nvidia-cuda-runtime-cu12 nvidia-cudnn-cu12 nvidia-cufft-cu12 nvidia-curand-cu12';
        const pipPkgs = ortOnly ? `"${ortPip}"` : `${cudaPip} "${ortPip}"`;
        return {
            ok: true,
            info: {
                kind: 'gpu',
                title: ortOnly ? '下载 WhisperSeg GPU（onnxruntime-gpu）' : '下载 GPU 支持',
                folder,
                pipCommand: `${pipPrefix} install --upgrade -i https://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com ${pipPkgs}`,
                hint: ortOnly
                    ? `ASR/CTranslate2 已就绪；请安装 ${ortPip}（与 CPU 版 onnxruntime 互斥）。优先点下方「下载文件」，或复制 pip 命令。`
                    : '优先阿里云 PyPI（失败自动回退华为云 / 清华）。WhisperSeg 灵敏检出还需 onnxruntime-gpu（见清单首项）。也可点下方「下载文件」获取 win_amd64 .whl。',
                wheelHint: ortOnly
                    ? `请下载 ${ortPkg.fileName} 后本地安装。若已装 CPU 版 onnxruntime，请先卸载再装 GPU 版。`
                    : '请先装 WhisperSeg / onnxruntime-gpu，再按需补齐下方 NVIDIA CUDA 12 组件。',
                items,
                ortGpuRequirement: ortPkg.requirement,
                ortGpuTarget: ortPkg.target,
            },
        };
    }

    if (kind === 'demucs') {
        const installPath = String(merged.engineInstallPath || '').trim();
        const runtimePy = resolveEngineRuntimePython(installPath);
        const runtimeDir = path.join(installPath, 'runtime');
        const venv = path.join(installPath, '.venv');
        const folder = fs.existsSync(runtimeDir) ? runtimeDir : (fs.existsSync(venv) ? venv : installPath);
        const pipPrefix = runtimePy
            ? `"${runtimePy}" -m pip`
            : 'python -m pip';
        const demucsPip = `${pipPrefix} install --upgrade -i https://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com demucs`;
        const torchCudaPip = `${pipPrefix} install --upgrade --force-reinstall torch torchaudio --find-links https://mirrors.aliyun.com/pytorch-wheels/cu126/ --no-index`;
        return {
            ok: true,
            info: {
                kind: 'demucs',
                title: '下载 Demucs（人声分离）',
                folder,
                pipCommand: `${demucsPip}\n${torchCudaPip}`,
                hint: '自动安装 Demucs；有 NVIDIA GPU 时会强制重装 CUDA 版 PyTorch（优先阿里云 cu126 直链 whl，约 2.5GB），替换 CPU torch。与「下载 GPU 支持」（ASR）互补。失败时可浏览器下载 .whl 后手动安装。',
                wheelHint: '至少选择 demucs；若需 GPU 加速请一并下载下方 torch / torchaudio（cu126、cp312、win_amd64）',
                items: [
                    {
                        id: 'demucs',
                        name: 'Demucs（Meta 人声分离）',
                        kind: 'demucs',
                        group: '人声分离',
                        fileName: 'demucs-4.1.0-py3-none-any.whl',
                        officialUrl: 'https://files.pythonhosted.org/packages/68/93/6f338f3f5c53522406dc32cd3b8a59abde20ac80d33604aa9dc8c82450e5/demucs-4.1.0-py3-none-any.whl',
                        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/68/93/6f338f3f5c53522406dc32cd3b8a59abde20ac80d33604aa9dc8c82450e5/demucs-4.1.0-py3-none-any.whl',
                        defaultUrl: 'https://mirrors.aliyun.com/pypi/packages/68/93/6f338f3f5c53522406dc32cd3b8a59abde20ac80d33604aa9dc8c82450e5/demucs-4.1.0-py3-none-any.whl',
                        note: 'demucs-4.1.0-py3-none-any.whl',
                    },
                    {
                        id: 'torch-cuda',
                        name: 'PyTorch CUDA（cu126）',
                        kind: 'demucs',
                        group: '人声分离 · GPU',
                        fileName: 'torch-2.9.1+cu126-cp312-cp312-win_amd64.whl',
                        officialUrl: 'https://download.pytorch.org/whl/cu126/torch-2.9.1%2Bcu126-cp312-cp312-win_amd64.whl',
                        mirrorUrl: 'https://mirrors.aliyun.com/pytorch-wheels/cu126/torch-2.9.1+cu126-cp312-cp312-win_amd64.whl',
                        defaultUrl: 'https://mirrors.aliyun.com/pytorch-wheels/cu126/torch-2.9.1+cu126-cp312-cp312-win_amd64.whl',
                        note: 'torch-2.9.1+cu126-cp312-cp312-win_amd64.whl · 约 2.5GB',
                    },
                    {
                        id: 'torchaudio-cuda',
                        name: 'TorchAudio CUDA（cu126）',
                        kind: 'demucs',
                        group: '人声分离 · GPU',
                        fileName: 'torchaudio-2.9.1+cu126-cp312-cp312-win_amd64.whl',
                        officialUrl: 'https://download.pytorch.org/whl/cu126/torchaudio-2.9.1%2Bcu126-cp312-cp312-win_amd64.whl',
                        mirrorUrl: 'https://mirrors.aliyun.com/pytorch-wheels/cu126/torchaudio-2.9.1+cu126-cp312-cp312-win_amd64.whl',
                        defaultUrl: 'https://mirrors.aliyun.com/pytorch-wheels/cu126/torchaudio-2.9.1+cu126-cp312-cp312-win_amd64.whl',
                        note: 'torchaudio-2.9.1+cu126-cp312-cp312-win_amd64.whl',
                    },
                ],
            },
        };
    }

    if (kind === 'sensevoice') {
        const installPath = String(merged.engineInstallPath || '').trim();
        const runtimePy = resolveEngineRuntimePython(installPath);
        const runtimeDir = path.join(installPath, 'runtime');
        const venv = path.join(installPath, '.venv');
        const folder = fs.existsSync(runtimeDir) ? runtimeDir : (fs.existsSync(venv) ? venv : installPath);
        const pipPrefix = runtimePy
            ? `"${runtimePy}" -m pip`
            : 'python -m pip';
        return {
            ok: true,
            info: {
                kind: 'sensevoice',
                title: '手动安装 SenseVoice 运行库',
                folder,
                pipCommand: `${pipPrefix} install --upgrade --prefer-binary --only-binary=numba,llvmlite,scipy -i https://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com "numpy>=1.24.0,<2.5" numba llvmlite scipy librosa soundfile jieba torch torchaudio funasr`,
                hint: 'SenseVoice 需要 torch / funasr / numpy(<2.5) / numba / scipy / librosa。请用下方直链下载 .whl（勿装 numpy 2.5+，否则 numba 会源码编译失败）。',
                wheelHint: '请先装 numpy 2.4.x 与 numba/llvmlite/scipy，再装 torch / funasr。可多选后一次安装。',
                items: SENSEVOICE_MANUAL_PACKAGES.map((pkg) => ({
                    id: pkg.id,
                    name: pkg.name,
                    kind: 'sensevoice',
                    group: 'SenseVoice 运行库',
                    fileName: pkg.fileName,
                    officialUrl: pkg.officialUrl,
                    mirrorUrl: pkg.mirrorUrl,
                    defaultUrl: pkg.mirrorUrl || pkg.officialUrl,
                    note: pkg.fileName || 'pip 包（whl）· SenseVoice',
                })),
            },
        };
    }

    if (kind === 'whisper') {
        const installPath = String(merged.engineInstallPath || '').trim();
        const runtimePy = resolveEngineRuntimePython(installPath);
        const runtimeDir = path.join(installPath, 'runtime');
        const venv = path.join(installPath, '.venv');
        const folder = fs.existsSync(runtimeDir) ? runtimeDir : (fs.existsSync(venv) ? venv : installPath);
        const pipPrefix = runtimePy
            ? `"${runtimePy}" -m pip`
            : 'python -m pip';
        return {
            ok: true,
            info: {
                kind: 'whisper',
                title: '手动安装 Whisper 运行库',
                folder,
                pipCommand: `${pipPrefix} install --upgrade --prefer-binary -i https://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com "faster-whisper>=1.1.0" "ctranslate2>=4.0.0" "onnxruntime>=1.14.0,<1.22" "av>=10.0.0" "numpy>=1.24.0,<2.5"`,
                hint: 'Whisper 需要 faster-whisper / ctranslate2 / onnxruntime（Silero VAD）/ av / numpy(<2.5)。若提示「应用程序控制策略」拦截，请关闭智能应用控制或将引擎目录加入排除（重装 .whl 无效）。',
                wheelHint: '优先排除系统策略拦截。若确缺包：先装 ctranslate2、onnxruntime 与 numpy 2.4.x，再装 faster-whisper；av 为音频解码依赖。',
                items: WHISPER_MANUAL_PACKAGES.map((pkg) => ({
                    id: pkg.id,
                    name: pkg.name,
                    kind: 'whisper',
                    group: 'Whisper 运行库',
                    fileName: pkg.fileName,
                    officialUrl: pkg.officialUrl,
                    mirrorUrl: pkg.mirrorUrl,
                    defaultUrl: pkg.mirrorUrl || pkg.officialUrl,
                    note: pkg.fileName || 'pip 包（whl）· Whisper',
                })),
            },
        };
    }

    /** @type {Map<string, any>} */
    const byId = new Map();
    try {
        const ensure = await ensureEngineRunning(merged);
        if (ensure.ok) {
            const listed = await listModels(ensure.baseUrl, { timeoutMs: 20000 });
            const models = Array.isArray(listed.data?.models) ? listed.data.models : [];
            for (const m of models) {
                if (m?.id) byId.set(String(m.id), m);
            }
        }
    } catch { /* fallback catalog */ }

    const sakuraMt = require('./sakura-mt');
    const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
    for (const m of sakuraMt.listSakuraModelsForEngine()) {
        byId.set(String(m.id), m);
    }

    const profile = String(payload.profile || merged.engineProfile || 'balanced').trim();
    const profileIds = ENGINE_PROFILE_MODELS[profile] || ENGINE_PROFILE_MODELS.balanced;
    const hasExplicitModelIds = Array.isArray(payload.modelIds);
    const requestedIds = hasExplicitModelIds
        ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [
            merged.engineAsrModel,
            merged.engineMtModel,
            merged.engineVadModel,
        ].filter(Boolean);
    const preselected = new Set([
        ...profileIds,
        ...requestedIds,
    ]);

    const catalogIds = uniqueIds([
        ...Object.keys(ENGINE_MODEL_HUB_FALLBACK),
        ...sakuraCatalog.listCatalog().map((e) => e.id),
        ...byId.keys(),
    ]);
    const kindOrder = { asr: 0, mt: 1, vad: 2 };

    const catalog = catalogIds.map((id) => {
        const live = byId.get(id) || {};
        const fallback = ENGINE_MODEL_HUB_FALLBACK[id] || {};
        const sakuraEntry = sakuraCatalog.findCatalogEntry(id);
        const kindName = String(live.kind || fallback.kind || sakuraEntry?.kind || '').trim() || 'mt';
        const hubId = String(live.hub_id || live.hubId || fallback.hubId || '').trim();
        const name = String(
            live.name || fallback.name || sakuraEntry?.name || id,
        ).trim();
        const sizeHint = sakuraEntry?.sizeHint
            || (Number(live.size_hint_mb) > 0 ? `约 ${live.size_hint_mb} MB` : '')
            || '';
        const backend = String(
            live.backend || fallback.backend || sakuraEntry?.backend || '',
        ).trim();
        const installed = sakuraEntry
            ? !!live.installed
            : (live.installed === true || (id === 'silero-vad'));
        return {
            id,
            name,
            kind: kindName,
            hubId,
            installed: !!installed,
            incomplete: !!live.incomplete,
            selected: preselected.has(id),
            recommended: profileIds.includes(id),
            sizeHint,
            backend,
            note: sakuraEntry?.note
                || fallback.note
                || (hubId ? `Hub：${hubId}` : (backend === 'sakura-gguf' ? 'Sakura GGUF' : '')),
        };
    }).sort((a, b) => {
        const ka = kindOrder[a.kind] ?? 9;
        const kb = kindOrder[b.kind] ?? 9;
        if (ka !== kb) return ka - kb;
        return String(a.name).localeCompare(String(b.name), 'zh');
    });

    // Manual links: when caller passes modelIds, only those (do not expand to whole profile).
    const linkIds = uniqueIds(
        hasExplicitModelIds && requestedIds.length
            ? requestedIds
            : [
                ...catalog.filter((c) => c.selected).map((c) => c.id),
                ...requestedIds,
            ],
    );
    const items = linkIds.map((id) => {
        const live = byId.get(id) || {};
        const fallback = ENGINE_MODEL_HUB_FALLBACK[id] || {};
        const sakuraEntry = sakuraCatalog.findCatalogEntry(id);
        const hubId = String(live.hub_id || live.hubId || fallback.hubId || '').trim();
        const name = String(live.name || fallback.name || sakuraEntry?.name || id).trim();
        const kindName = String(live.kind || fallback.kind || sakuraEntry?.kind || '').trim();
        if (sakuraEntry) {
            return {
                id,
                name,
                kind: 'mt',
                hubId: '',
                bundled: false,
                officialUrl: sakuraEntry.ggufUrl,
                mirrorUrl: String(sakuraEntry.ggufUrl || '').replace(
                    '://huggingface.co',
                    '://hf-mirror.com',
                ),
                defaultUrl: sakuraEntry.ggufUrl,
                localDir: require('./advanced-llm-fs').getModelsDir(),
                note: `${sakuraEntry.note || 'Sakura GGUF'} · ${sakuraEntry.sizeHint || ''}`,
                backend: 'sakura-gguf',
            };
        }
        const urls = buildHubUrls(hubId, hfEndpoint || 'https://hf-mirror.com');
        const localDirName = String(live.local_dirname || live.localDirname || id).trim();
        const localDir = path.join(modelsRoot, kindName || 'asr', localDirName);
        return {
            id,
            name,
            kind: kindName,
            hubId,
            bundled: !hubId,
            officialUrl: urls.officialUrl,
            mirrorUrl: urls.mirrorUrl,
            defaultUrl: urls.mirrorUrl || urls.officialUrl,
            localDir,
            note: hubId
                ? `Hub：${hubId} · 默认镜像`
                : '无需单独下载（运行时内置）',
        };
    });

    return {
        ok: true,
        info: {
            kind: 'models',
            title: '下载引擎模型',
            folder: modelsRoot,
            hfEndpoint: normalizeHfEndpoint(hfEndpoint || 'https://hf-mirror.com'),
            profile,
            hint: '勾选需要的模型后点「开始下载」。Opus/ASR/VAD 走引擎 Hub；Sakura 走本地 GGUF（含 llama-server）。也可下方手动镜像下载。',
            catalog,
            selectedIds: catalog.filter((c) => c.selected).map((c) => c.id),
            items,
        },
    };
}

function friendlyEngineError(raw) {
    const msg = String(raw || '').trim();
    if (!msg) return '引擎任务失败';
    const lower = msg.toLowerCase();
    if (
        lower === 'aborted'
        || lower === 'cancelled'
        || lower.includes('operation was aborted')
        || lower.includes('user aborted')
        || lower.includes('aborterror')
    ) {
        return '操作已中止或请求超时，请重试';
    }
    if (lower.includes('cublas64_12') || (lower.includes('cublas') && lower.includes('not found'))) {
        return (
            '缺少 CUDA 12 运行库 cublas64_12.dll（Whisper/CTranslate2 需要）。'
            + '引擎已尽量回退 CPU；若仍失败请将设置 → 推理设备改为 CPU，'
            + '或安装 CUDA Toolkit 12 并把其 bin 加入系统 PATH 后重启引擎。'
            + ` 原始错误：${msg}`
        );
    }
    const mtMissing = msg.match(/MT model not installed:\s*([^\s.]+)/i)
        || msg.match(/未安装翻译模型\s+([^\s。]+)/);
    if (mtMissing) {
        const id = mtMissing[1];
        return (
            `未安装翻译模型 ${id}。`
            + '请在「设置 → 环境 / 模型」下载后再生成；'
            + '若转写已完成，可查看同目录下的 `*.src.partial.*` / `*.src.*` 原文后单独翻译。'
            + ` 原始错误：${msg}`
        );
    }
    return msg;
}

function resolvePythonCommand() {
    if (process.env.TRANSUB_ENGINE_PYTHON) {
        return process.env.TRANSUB_ENGINE_PYTHON;
    }
    return process.platform === 'win32' ? 'python' : 'python3';
}

function resolveEngineRuntimePython(installPath) {
    const root = path.resolve(String(installPath || '').trim() || '.');
    const candidates = process.platform === 'win32'
        ? [
            path.join(root, 'runtime', 'python.exe'),
            path.join(root, 'runtime', 'Scripts', 'python.exe'),
        ]
        : [
            path.join(root, 'runtime', 'bin', 'python'),
            path.join(root, 'runtime', 'bin', 'python3'),
        ];
    for (const exe of candidates) {
        if (fs.existsSync(exe)) return exe;
    }
    return '';
}

function modelIdsNeedWhisperExtras(modelIds) {
    const list = Array.isArray(modelIds) ? modelIds : [];
    return list.some((id) => {
        const s = String(id || '').toLowerCase();
        return s.includes('whisper') && !s.includes('whisperseg');
    });
}

/**
 * Install Whisper pip extras with engine stopped (fresh python.exe).
 * Avoids WinError 5 when the HTTP server already imported native wheels.
 */
function ensureAsrWhisperOffline(opts = {}) {
    const pythonPath = String(opts.pythonPath || '').trim();
    const cwd = String(opts.cwd || '').trim();
    if (!pythonPath || !fs.existsSync(pythonPath)) {
        return Promise.resolve({ ok: false, error: '找不到引擎 Python（runtime\\python.exe）' });
    }
    const force = !!opts.force;
    const timeoutMs = Math.max(60_000, Number(opts.timeoutMs) || 1_800_000);
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const signal = opts.signal;
    const args = [
        '-m', 'transub_engine', 'runtime', 'ensure-asr-whisper',
        '--progress', 'jsonl',
    ];
    if (force) args.push('--force');

    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve({ ok: false, cancelled: true, error: 'cancelled' });
            return;
        }
        let child;
        try {
            child = spawn(pythonPath, args, {
                cwd: cwd || undefined,
                windowsHide: true,
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1',
                    PYTHONIOENCODING: 'utf-8',
                },
            });
        } catch (err) {
            resolve({ ok: false, error: err.message || String(err) });
            return;
        }

        const lines = [];
        let settled = false;
        let resultPayload = null;
        const finish = (payload) => {
            if (settled) return;
            settled = true;
            try { signal?.removeEventListener?.('abort', onAbort); } catch { /* ignore */ }
            clearTimeout(timer);
            resolve(payload);
        };
        const onAbort = () => {
            try { child.kill(); } catch { /* ignore */ }
            finish({ ok: false, cancelled: true, error: 'cancelled' });
        };
        if (signal) {
            if (signal.aborted) {
                onAbort();
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
        }
        const timer = setTimeout(() => {
            try { child.kill(); } catch { /* ignore */ }
            finish({ ok: false, error: `Whisper 运行库安装超时（${Math.round(timeoutMs / 1000)} 秒）` });
        }, timeoutMs);

        const handleLine = (raw) => {
            const text = String(raw || '').trim();
            if (!text) return;
            lines.push(text);
            if (lines.length > 80) lines.splice(0, lines.length - 60);
            let ev;
            try { ev = JSON.parse(text); } catch { return; }
            if (!ev || typeof ev !== 'object') return;
            if (ev.type === 'progress' || ev.stage || ev.detail) {
                onProgress?.(ev);
            }
            if (ev.type === 'result' || (ev.ok != null && (ev.ready != null || ev.code || ev.installed))) {
                resultPayload = ev;
            }
        };

        let buf = '';
        const onChunk = (chunk) => {
            buf += chunk.toString('utf8');
            const parts = buf.split(/\r?\n/);
            buf = parts.pop() || '';
            for (const part of parts) handleLine(part);
        };
        child.stdout?.on('data', onChunk);
        child.stderr?.on('data', onChunk);
        child.on('error', (err) => {
            finish({ ok: false, error: err.message || String(err), logTail: lines.slice(-20).join('\n') });
        });
        child.on('close', (code) => {
            if (buf.trim()) handleLine(buf);
            const logTail = lines.slice(-20).join('\n');
            if (resultPayload && resultPayload.ok) {
                finish({ ok: true, ...resultPayload, logTail });
                return;
            }
            if (code === 0) {
                finish({ ok: true, ...(resultPayload || {}), logTail });
                return;
            }
            const err = resultPayload?.message
                || resultPayload?.error
                || (logTail ? logTail.slice(-400) : `Whisper 运行库安装失败（exit ${code}）`);
            finish({
                ok: false,
                error: err,
                code: resultPayload?.code || '',
                logTail,
                ...(resultPayload || {}),
            });
        });
    });
}

function resolveEngineEntrypoints(installPath) {
    const root = path.resolve(String(installPath || '').trim() || '.');
    // Prefer standalone dist (embeddable CPython) — not system Python / source tree.
    const runtimePy = resolveEngineRuntimePython(root);
    if (runtimePy) {
        return {
            type: 'module',
            command: runtimePy,
            args: ['-m', 'transub_engine'],
            cwd: root,
            runtime: true,
        };
    }
    const candidates = [
        path.join(root, 'transub-engine.exe'),
        path.join(root, 'dist', 'transub-engine.exe'),
        path.join(root, '.venv', 'Scripts', 'transub-engine.exe'),
        path.join(root, '.venv', 'bin', 'transub-engine'),
    ];
    for (const exe of candidates) {
        if (fs.existsSync(exe)) {
            return { type: 'exe', command: exe, args: [] };
        }
    }
    // Dev / source checkout: system python -m transub_engine
    if (fs.existsSync(path.join(root, 'transub_engine')) || fs.existsSync(path.join(root, 'pyproject.toml'))) {
        return {
            type: 'module',
            command: resolvePythonCommand(),
            args: ['-m', 'transub_engine'],
            cwd: root,
        };
    }
    return null;
}

function parseHostPort(url) {
    try {
        const u = new URL(url);
        return {
            host: u.hostname || '127.0.0.1',
            port: Number(u.port) || 8765,
        };
    } catch {
        return { host: '127.0.0.1', port: 8765 };
    }
}

async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(baseUrl, {
    timeoutMs = 30000,
    intervalMs = 400,
    shouldStop = null,
} = {}) {
    const started = Date.now();
    let lastErr = '';
    while (Date.now() - started < timeoutMs) {
        if (typeof shouldStop === 'function' && shouldStop()) {
            return { ok: false, error: '已取消', cancelled: true };
        }
        try {
            const res = await getHealth(baseUrl, { timeoutMs: 2000 });
            if (res.ok && res.data?.ok) return res;
            lastErr = res.data?.message || `HTTP ${res.status}`;
        } catch (err) {
            lastErr = err.message || String(err);
        }
        await sleep(intervalMs);
    }
    return { ok: false, error: lastErr || '引擎健康检查超时' };
}

function mapDeviceForEngine(device) {
    const d = String(device || '').trim().toLowerCase();
    if (d === 'cpu') return 'cpu';
    // Pass cuda explicitly so Demucs / ASR do not silently treat preference as vague "auto".
    if (d === 'cuda' || d === 'cuda_low_vram' || d === 'cuda_batch' || d === 'gpu') return 'cuda';
    return 'auto';
}

function stopEngineProcess() {
    if (!engineProc) return;
    const pid = engineProc.pid;
    try {
        if (process.platform === 'win32' && pid) {
            // Kill entire tree (Demucs children survive a plain SIGTERM on Windows).
            const { spawnSync } = require('child_process');
            spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
                windowsHide: true,
                stdio: 'ignore',
                timeout: 15000,
            });
        } else {
            engineProc.kill('SIGTERM');
        }
    } catch { /* ignore */ }
    try {
        engineProc.kill();
    } catch { /* ignore */ }
    engineProc = null;
}

/**
 * After failed / cancelled work, stop managed Python serve and any orphan on the port.
 * Successful batches keep the engine hot for the next job.
 */
function stopEngineProcessAndPort() {
    stopEngineProcess();
    try {
        const { port } = parseHostPort(engineBaseUrl || DEFAULT_ENGINE_URL);
        killListenersOnPort(port);
    } catch { /* ignore */ }
}

function stopLlamaServerQuiet() {
    try {
        require('./advanced-llama-server').stopLlamaServer();
    } catch { /* ignore */ }
}

/**
 * Reclaim background compute after an engine batch ends.
 * - External MT always stops llama-server (same as TWAI smart-translate batch).
 * - Failed / cancelled batches also stop the Python engine so it cannot linger.
 */
function reclaimLocalComputeAfterEngineBatch({ usedExternalMt = false, failedOrCancelled = false } = {}) {
    if (usedExternalMt || failedOrCancelled) {
        stopLlamaServerQuiet();
    }
    if (failedOrCancelled) {
        stopEngineProcessAndPort();
        appendEngineLogLine('[engine] 任务失败或已中断 · 已停止引擎与本地 LLM 进程');
    } else if (usedExternalMt) {
        appendEngineLogLine('[engine] 批次结束 · 已停止本地 LLM（llama-server）');
    }
}

/** Kill whatever is listening on the engine HTTP port (orphan serve after failed respawn). */
function killListenersOnPort(port) {
    const p = Number(port) || 8765;
    if (!p) return;
    try {
        if (process.platform === 'win32') {
            const { spawnSync } = require('child_process');
            const ps = `
$conns = Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue;
foreach ($c in @($conns)) {
  $procId = [int]$c.OwningProcess;
  if ($procId -gt 0) { taskkill /PID $procId /T /F 2>$null | Out-Null }
}
`;
            spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
                windowsHide: true,
                stdio: 'ignore',
                timeout: 15000,
            });
        } else {
            const { spawnSync } = require('child_process');
            const out = spawnSync('lsof', ['-ti', `tcp:${p}`], { encoding: 'utf8' });
            const pids = String(out.stdout || '')
                .split(/\s+/)
                .map((x) => x.trim())
                .filter(Boolean);
            for (const pid of pids) {
                try { process.kill(Number(pid), 'SIGTERM'); } catch { /* ignore */ }
            }
        }
    } catch { /* ignore */ }
}

/**
 * Free Whisper/Demucs VRAM before starting Sakura llama-server (same GPU).
 * Prefer soft release API, then stop managed + orphan engine on the port.
 */
async function releaseEngineVramBeforeLocalLlm(options = {}) {
    const opts = mergeEngineOptions(options || {});
    const baseUrl = opts.engineUrl || engineBaseUrl || DEFAULT_ENGINE_URL;
    const { port } = parseHostPort(baseUrl);
    try {
        const soft = await releaseGpuMemory(baseUrl, { timeoutMs: 15000 });
        if (soft?.ok) {
            appendEngineLogLine('[engine] 已释放 GPU 缓存（准备本地 LLM）');
        }
    } catch { /* ignore */ }
    stopEngineProcess();
    killListenersOnPort(port);
    await sleep(1200);
    appendEngineLogLine('[engine] 已停止引擎进程以释放显存（Sakura / llama-server）');
}

function getEngineLogPath() {
    if (engineLogPathCached) return engineLogPathCached;
    const root = process.env.LOCALAPPDATA
        || process.env.HOME
        || os.homedir()
        || process.cwd();
    engineLogPathCached = path.join(root, 'TransubEngine', 'latest.log');
    return engineLogPathCached;
}

function resetEngineLogFile() {
    try {
        const logPath = getEngineLogPath();
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.writeFileSync(
            logPath,
            `===== Transub Engine log ${new Date().toISOString()} =====\n`,
            'utf8',
        );
    } catch { /* ignore */ }
    engineLogLineBuf = '';
    engineLogLastKept = '';
    engineLogRepeatCount = 0;
    engineLogLastDroppedKey = '';
    engineLogDroppedCount = 0;
}

const ENGINE_LOG_DROP_PATTERNS = [
    /^\s*\d+%\|/, // tqdm bars
    /rtf_avg:/i,
    /\{'load_data':/,
    /Both `max_new_tokens`/,
    /Token indices sequence length is longer/,
    /Recommended: pip install sacremoses/,
    /Loading weights:\s+\d+%/,
    /Notice: ffmpeg is not installed/i,
    /download models from model hub/i,
    /trust_remote_code:/i,
    /scope_map:/i,
    /excludes:/i,
    /Loading ckpt:/i,
    /Loading pretrained params from/i,
    /Building VAD model/i,
    /funasr version:/i,
    /INFO:\s+\S+\s+-\s+"GET \/v1\/(?:jobs|health|capabilities)/i,
    /WARNING:.*max_new_tokens/i,
];

function stripAnsi(text) {
    // eslint-disable-next-line no-control-regex -- strip ANSI CSI sequences from engine logs
    return String(text || '').replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');
}

function normalizeEngineLogLine(line) {
    return stripAnsi(line)
        .replace(/\r/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function shouldDropEngineLogLine(line) {
    const text = normalizeEngineLogLine(line);
    if (!text) return true;
    // Pure progress fragments / spinner leftovers (no letters)
    if (!/[A-Za-z\u4e00-\u9fff]/.test(text) && /[|.\d%-]+/.test(text) && text.length < 80) {
        return true;
    }
    return ENGINE_LOG_DROP_PATTERNS.some((re) => re.test(text));
}

function flushDroppedEngineLogSummary(invokeSender = null) {
    if (engineLogDroppedCount <= 0) return;
    const n = engineLogDroppedCount;
    engineLogDroppedCount = 0;
    engineLogLastDroppedKey = '';
    if (n >= 8) {
        appendEngineLogLineRaw(`[engine] （已省略 ${n} 条重复/进度噪音）`, invokeSender);
    }
}

function flushEngineLogRepeats(invokeSender = null) {
    if (engineLogRepeatCount > 1 && engineLogLastKept) {
        appendEngineLogLineRaw(`[engine] （上条重复 ${engineLogRepeatCount} 次）`, invokeSender);
    }
    engineLogRepeatCount = engineLogLastKept ? 1 : 0;
}

function flushEngineLogWriteQueue() {
    engineLogFlushTimer = null;
    if (!engineLogWriteQueue.length) return;
    const chunk = `${engineLogWriteQueue.join('\n')}\n`;
    engineLogWriteQueue = [];
    try {
        const logPath = getEngineLogPath();
        fs.mkdir(path.dirname(logPath), { recursive: true }, (mkdirErr) => {
            if (mkdirErr) return;
            fs.appendFile(logPath, chunk, 'utf8', () => { /* ignore */ });
        });
    } catch { /* ignore */ }
}

function appendEngineLogLineRaw(line, invokeSender = null) {
    const text = String(line ?? '').replace(/\r/g, '').trimEnd();
    if (!text) return;
    engineLogWriteQueue.push(text);
    if (!engineLogFlushTimer) {
        engineLogFlushTimer = setTimeout(flushEngineLogWriteQueue, 200);
    }
    emitToSubtitleUi('transwithai-infer-log', {
        line: text,
        source: 'engine',
    }, invokeSender);
    emitToSubtitleUi('transub-engine-infer-log', {
        line: text,
        source: 'engine',
    }, invokeSender);
}

function appendEngineLogLine(line, invokeSender = null) {
    const text = normalizeEngineLogLine(line);
    if (!text) return;

    if (shouldDropEngineLogLine(text)) {
        const key = text.slice(0, 120);
        if (key === engineLogLastDroppedKey) {
            engineLogDroppedCount += 1;
        } else {
            flushDroppedEngineLogSummary(invokeSender);
            engineLogLastDroppedKey = key;
            engineLogDroppedCount = 1;
        }
        return;
    }

    flushDroppedEngineLogSummary(invokeSender);

    if (text === engineLogLastKept) {
        engineLogRepeatCount += 1;
        return;
    }
    flushEngineLogRepeats(invokeSender);
    engineLogLastKept = text;
    engineLogRepeatCount = 1;
    appendEngineLogLineRaw(text, invokeSender);
}

function flushEngineLogChunk(chunk, invokeSender = null) {
    // tqdm often uses CR updates without newline — treat CR as line break.
    engineLogLineBuf += String(chunk || '').replace(/\r/g, '\n');
    const parts = engineLogLineBuf.split(/\n/);
    engineLogLineBuf = parts.pop() || '';
    for (const part of parts) {
        appendEngineLogLine(part, invokeSender);
    }
}

function attachEngineProcessLogs(proc) {
    if (!proc) return;
    engineLogLineBuf = '';
    engineLogLastKept = '';
    engineLogRepeatCount = 0;
    engineLogLastDroppedKey = '';
    engineLogDroppedCount = 0;
    const onData = (buf) => flushEngineLogChunk(buf, null);
    try {
        proc.stdout?.on('data', onData);
        proc.stderr?.on('data', onData);
        proc.on('exit', () => {
            if (engineLogLineBuf) {
                appendEngineLogLine(engineLogLineBuf, null);
                engineLogLineBuf = '';
            }
            flushDroppedEngineLogSummary(null);
            flushEngineLogRepeats(null);
        });
    } catch { /* ignore */ }
}

function openEngineLatestLog() {
    const logPath = getEngineLogPath();
    if (!fs.existsSync(logPath)) {
        return { ok: false, error: `未找到引擎日志：${logPath}` };
    }
    const { shell } = require('electron');
    shell.openPath(logPath);
    return { ok: true, path: logPath };
}

function findEngineBundledFfmpeg(installPath) {
    const root = path.resolve(String(installPath || '').trim() || '.');
    const names = process.platform === 'win32'
        ? ['ffmpeg.exe', 'ffmpeg']
        : ['ffmpeg', 'ffmpeg.exe'];
    for (const name of names) {
        const candidates = [
            path.join(root, '_internal', 'bin', name),
            path.join(root, '_internal', name),
            path.join(root, 'bin', name),
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) return candidate;
        }
    }
    return '';
}

function injectFfmpegPathEnv(env, ffmpegPathSetting, engineInstallPath = '') {
    const next = { ...env };
    try {
        const ffmpegBridge = require('./ffmpeg-bridge');
        const resolved = ffmpegBridge.resolveFfmpegForExecution(ffmpegPathSetting);
        let exe = resolved?.ok ? String(resolved.path || '').trim() : '';
        // Prefer Transub's bundled ffmpeg — engine dist no longer ships a copy.
        if (!exe || exe === 'ffmpeg') {
            exe = String(ffmpegBridge.findBundledFfmpegPath?.() || '').trim();
        }
        if (!exe || exe === 'ffmpeg') {
            exe = String(findEngineBundledFfmpeg(engineInstallPath) || '').trim();
        }
        if (!exe || exe === 'ffmpeg' || !fs.existsSync(exe)) {
            return injectNvidiaCudaPathEnv(next, engineInstallPath);
        }
        const dir = path.dirname(exe);
        const sep = path.delimiter;
        const current = String(next.PATH || process.env.PATH || '');
        const parts = current.split(sep).map((p) => p.toLowerCase());
        if (!parts.includes(dir.toLowerCase())) {
            next.PATH = `${dir}${sep}${current}`;
        }
        next.FFMPEG_BINARY = exe;
        next.FFMPEG_PATH = exe;
        if (engineInstallPath) {
            next.TRANSUB_ENGINE_HOME = path.resolve(String(engineInstallPath).trim());
        }
    } catch { /* ignore */ }
    return injectNvidiaCudaPathEnv(next, engineInstallPath);
}

/**
 * Prepend nvidia-* wheel bin dirs (cublas64_12.dll etc.) so CT2/Whisper can use GPU.
 */
function injectNvidiaCudaPathEnv(env, engineInstallPath = '') {
    const next = { ...(env || {}) };
    try {
        const root = path.resolve(String(engineInstallPath || '').trim() || '.');
        const candidates = [
            path.join(root, 'runtime', 'Lib', 'site-packages', 'nvidia'),
            path.join(root, 'runtime', 'lib', 'site-packages', 'nvidia'),
            path.join(root, '.venv', 'Lib', 'site-packages', 'nvidia'),
            path.join(root, 'venv', 'Lib', 'site-packages', 'nvidia'),
            path.join(root, '.venv', 'lib', 'site-packages', 'nvidia'),
        ];
        const sep = path.delimiter;
        let current = String(next.PATH || process.env.PATH || '');
        const lower = new Set(current.split(sep).map((p) => p.toLowerCase()).filter(Boolean));
        const prepend = [];
        for (const nvidiaRoot of candidates) {
            if (!fs.existsSync(nvidiaRoot)) continue;
            let entries = [];
            try {
                entries = fs.readdirSync(nvidiaRoot, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const ent of entries) {
                if (!ent.isDirectory()) continue;
                for (const sub of ['bin', 'lib', path.join('lib', 'x64')]) {
                    const dir = path.join(nvidiaRoot, ent.name, sub);
                    if (!fs.existsSync(dir)) continue;
                    const key = dir.toLowerCase();
                    if (lower.has(key)) continue;
                    lower.add(key);
                    prepend.push(dir);
                }
            }
        }
        if (prepend.length) {
            next.PATH = `${prepend.join(sep)}${sep}${current}`;
        }
        if (engineInstallPath) {
            next.TRANSUB_ENGINE_HOME = path.resolve(String(engineInstallPath).trim());
        }
    } catch { /* ignore */ }
    return next;
}

async function ensureEngineRunning(options = {}) {
    const opts = mergeEngineOptions(options);
    opts.engineInstallPath = resolveEngineInstallPath(opts.engineInstallPath);
    engineBaseUrl = opts.engineUrl || DEFAULT_ENGINE_URL;
    const forceRestart = !!options.forceRestart;
    const shouldStop = typeof options.shouldStop === 'function' ? options.shouldStop : null;

    if (forceRestart) {
        const { port } = parseHostPort(engineBaseUrl);
        stopEngineProcess();
        killListenersOnPort(port);
        await sleep(800);
    }

    const health = await getHealth(engineBaseUrl, { timeoutMs: 2000 }).catch(() => ({ ok: false }));
    if (health.ok && health.data?.ok) {
        if (!isApiCompatible(health.data.apiVersion)) {
            return {
                ok: false,
                error: `引擎 API 主版本不兼容（got ${health.data.apiVersion}）`,
                health: health.data,
            };
        }
        if (forceRestart) {
            appendEngineLogLine(
                '[engine] 强制重启后端口仍被占用：可能是外部进程，已跳过重新拉起'
            );
        }
        return { ok: true, baseUrl: engineBaseUrl, health: health.data, spawned: false };
    }

    if (!opts.engineAutoStart) {
        return { ok: false, error: '引擎未运行，且未启用自动启动' };
    }

    const entry = resolveEngineEntrypoints(opts.engineInstallPath);
    if (!entry) {
        const hint = opts.engineInstallPath
            || getBundledEnginePath()
            || '（未找到内置引擎）';
        return {
            ok: false,
            error: `未找到引擎：请确认内置目录 ${hint} 为独立版（含 runtime\\python.exe），或浏览自定义引擎目录，或启动已有 serve 并填写引擎 URL`,
        };
    }

    stopEngineProcess();
    const { host, port } = parseHostPort(engineBaseUrl);
    const args = [...entry.args, 'serve', '--host', host, '--port', String(port)];
    let env = {
        ...process.env,
        TRANSUB_ENGINE_STUB: process.env.TRANSUB_ENGINE_STUB || '',
        TQDM_DISABLE: '1',
        // Force UTF-8 so Chinese progress / logs are not GBK-mojibake on Windows.
        PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
        PYTHONUTF8: process.env.PYTHONUTF8 || '1',
        // Suppress transformers/UserWarning spam in captured stderr.
        PYTHONWARNINGS: process.env.PYTHONWARNINGS
            || 'ignore::UserWarning:transformers,ignore::FutureWarning',
    };
    try {
        const { applyProxyToEnv, normalizeProxyOptions } = require('./proxy-settings');
        // Prefer explicit proxy fields on opts (full settings payload); otherwise keep
        // the proxy already applied to the main process (activeProxy / process.env).
        if (Object.prototype.hasOwnProperty.call(opts, 'proxyEnabled')
            || Object.prototype.hasOwnProperty.call(opts, 'proxyUrl')) {
            applyProxyToEnv(env, normalizeProxyOptions(opts));
        } else {
            applyProxyToEnv(env);
        }
    } catch { /* proxy optional */ }
    const hfEndpoint = String(opts.engineHfEndpoint || '').trim().replace(/\/+$/, '');
    if (hfEndpoint) {
        env.HF_ENDPOINT = hfEndpoint;
    }
    // Avoid Xet/CAS 401s when pulling LFS weights via domestic mirrors.
    if (!env.HF_HUB_DISABLE_XET) {
        env.HF_HUB_DISABLE_XET = '1';
    }
    // huggingface_hub defaults to 10s; too short for mirror/CDN hops on large weights.
    if (!env.HF_HUB_DOWNLOAD_TIMEOUT) {
        env.HF_HUB_DOWNLOAD_TIMEOUT = '120';
    }
    if (!env.HF_HUB_ETAG_TIMEOUT) {
        env.HF_HUB_ETAG_TIMEOUT = '30';
    }
    env = injectFfmpegPathEnv(env, opts.ffmpegPath, opts.engineInstallPath);
    if (!env.TRANSUB_ENGINE_HOME && opts.engineInstallPath) {
        env.TRANSUB_ENGINE_HOME = path.resolve(String(opts.engineInstallPath));
    }
    try {
        const tdpFs = require('./tdp-fs');
        env.TRANSUB_TDP_DIR = tdpFs.getTdpRoot();
    } catch { /* optional */ }
    try {
        resetEngineLogFile();
        engineProc = spawn(entry.command, args, {
            cwd: entry.cwd || opts.engineInstallPath,
            env,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        attachEngineProcessLogs(engineProc);
        appendEngineLogLine(`[engine] 启动 ${entry.command} ${args.join(' ')}`);
        engineProc.on('exit', (code, signal) => {
            appendEngineLogLine(`[engine] 进程退出 code=${code} signal=${signal || ''}`);
            engineProc = null;
            // Unexpected exit can leave a sibling listener on the port (respawn race).
            if (code !== 0 && code != null) {
                try {
                    const { port } = parseHostPort(engineBaseUrl || DEFAULT_ENGINE_URL);
                    killListenersOnPort(port);
                } catch { /* ignore */ }
            }
        });
    } catch (err) {
        return { ok: false, error: `无法启动引擎: ${err.message || err}` };
    }

    const ready = await waitForHealth(engineBaseUrl, {
        timeoutMs: 45000,
        shouldStop,
    });
    if (!ready.ok) {
        stopEngineProcess();
        return {
            ok: false,
            error: ready.cancelled ? '已取消' : (ready.error || '引擎启动后健康检查失败'),
            cancelled: !!ready.cancelled,
        };
    }
    if (!isApiCompatible(ready.data?.apiVersion)) {
        stopEngineProcessAndPort();
        return {
            ok: false,
            error: `引擎 API 主版本不兼容（got ${ready.data?.apiVersion}）`,
            health: ready.data,
        };
    }
    return { ok: true, baseUrl: engineBaseUrl, health: ready.data, spawned: true };
}

let engineUiWindowManager = null;

function getMainWebContents() {
    const win = engineUiWindowManager?.getMainWindow?.();
    if (!win || win.isDestroyed()) return null;
    const wc = win.webContents;
    if (!wc || wc.isDestroyed()) return null;
    return wc;
}

function emitToSubtitleUi(channel, payload, invokeSender = null) {
    try {
        engineUiWindowManager?.sendToRenderer?.(channel, payload);
    } catch { /* ignore */ }
    try {
        if (!invokeSender || invokeSender.isDestroyed?.()) return;
        const mainWc = getMainWebContents();
        if (mainWc && mainWc.id === invokeSender.id) return;
        invokeSender.send(channel, payload);
    } catch { /* ignore */ }
}

function mapEngineStageToItemStage(stage) {
    const s = String(stage || '').toLowerCase();
    if (!s || s === 'queued' || s === 'starting' || s === 'status') return 'starting';
    if (s === 'model' || s === 'vad' || s === 'denoise' || s === 'separate') return s;
    if (s === 'scene' || s === 'vad_failover' || s === 'cleanup') return s;
    if (s === 'translate' || s === 'mt') return 'translate';
    if (s === 'done' || s === 'batch_done') return 'done';
    if (s === 'cancelled') return 'cancelled';
    if (s === 'error' || s === 'failed') return 'failed';
    if (s === 'running') return 'transcribe';
    return s === 'transcribe' ? 'transcribe' : 'transcribe';
}

/** 主界面引擎日志用的简洁阶段名（与 UI 状态徽章一致） */
const ENGINE_STAGE_ZH = {
    starting: '启动',
    denoise: '轻度降噪',
    separate: '人声分离',
    scene: '场景切分',
    vad: '语音检测',
    vad_failover: 'VAD 回退',
    cleanup: '字幕清理',
    model: '加载模型',
    transcribe: '转写',
    translate: '翻译',
    save: '保存',
    done: '完成',
    failed: '失败',
    cancelled: '已取消',
    download: '下载',
    trim: '截取',
    cancel: '取消',
};

function engineStageZh(stage) {
    const s = String(stage || '').toLowerCase();
    return ENGINE_STAGE_ZH[s] || '处理中';
}

function buildUiProgress({
    file,
    index1,
    total,
    stage,
    detail,
    percent,
    error,
    subtitlePath,
    sourceSubtitlePath,
    targetSubtitlePath,
    bilingualSubtitlePath,
    processedSec,
    mediaDurationSec,
}) {
    const itemStage = mapEngineStageToItemStage(stage);
    let phase = 'running';
    if (itemStage === 'done') phase = 'done';
    else if (itemStage === 'cancelled') phase = 'cancelled';
    else if (itemStage === 'failed') phase = 'failed';
    const itemProgress = Number.isFinite(Number(percent)) ? Number(percent) : (
        phase === 'done' ? 100 : (
            itemStage === 'starting' || itemStage === 'model' || itemStage === 'vad'
            || itemStage === 'denoise' || itemStage === 'separate'
            || itemStage === 'scene' || itemStage === 'vad_failover' || itemStage === 'cleanup' ? 0 : undefined
        )
    );
    const totalSec = Number(mediaDurationSec);
    const currentSec = Number(processedSec);
    const dualPhase = itemStage === 'translate'
        ? 'translate'
        : (itemStage === 'transcribe' ? 'source' : null);
    return {
        fullPath: file,
        index: index1,
        total,
        phase,
        itemStage,
        itemDualPhase: dualPhase,
        itemDetail: detail || stage || '',
        itemProgress,
        error: phase === 'failed' ? (error || detail || '失败') : undefined,
        subtitlePath,
        sourceSubtitlePath,
        targetSubtitlePath,
        bilingualSubtitlePath,
        videoCurrentSec: Number.isFinite(currentSec) && currentSec >= 0 ? currentSec : undefined,
        videoTotalSec: Number.isFinite(totalSec) && totalSec > 0 ? totalSec : undefined,
    };
}

let lastEngineUiLogAt = 0;
let lastEngineUiLogKey = '';

function sendProgress(invokeSender, payload) {
    const ui = buildUiProgress({
        file: payload.file || payload.fullPath || '',
        index1: Number(payload.index1) || ((Number(payload.index) || 0) + 1),
        total: payload.total,
        stage: payload.stage || payload.itemStage,
        detail: payload.detail || payload.itemDetail,
        percent: payload.percent ?? payload.itemProgress,
        error: payload.error,
        subtitlePath: payload.subtitlePath,
        sourceSubtitlePath: payload.sourceSubtitlePath,
        targetSubtitlePath: payload.targetSubtitlePath,
        bilingualSubtitlePath: payload.bilingualSubtitlePath,
        processedSec: payload.processedSec ?? payload.videoCurrentSec,
        mediaDurationSec: payload.mediaDurationSec ?? payload.videoTotalSec,
    });
    emitToSubtitleUi('transub-engine-progress', { ...payload, ...ui }, invokeSender);
    emitToSubtitleUi('transwithai-progress', ui, invokeSender);
    const detail = String(ui.itemDetail || payload.detail || '').trim();
    if (!detail) return;
    const name = ui.fullPath ? path.basename(ui.fullPath) : '';
    const stageZh = engineStageZh(ui.itemStage);
    const line = `[engine] #${ui.index}/${ui.total} ${stageZh}${name ? ` ${name}` : ''} · ${detail}`;
    const isHeartbeat = /转写中|转写重试|分片转写|首次加载|Transcribing|翻译\s+\d+\/\d+/i.test(detail);
    const now = Date.now();
    // Normalize timers / counters so "翻译 10/100" and "翻译 20/100" share a throttle key by stage.
    const key = `${ui.itemStage}|${detail
        .replace(/\d+:\d{2}/g, 't')
        .replace(/\d+\s*\/\s*\d+/g, 'n/m')
        .replace(/\d+/g, '#')}`;
    const throttleMs = /翻译/.test(detail) ? 8000 : 12000;
    if (isHeartbeat && key === lastEngineUiLogKey && now - lastEngineUiLogAt < throttleMs) {
        return;
    }
    lastEngineUiLogKey = key;
    lastEngineUiLogAt = now;
    appendEngineLogLine(line, invokeSender);
}

function extractOutputPaths(result) {
    const outputs = Array.isArray(result?.outputs) ? result.outputs : [];
    const dual = outputs.find((o) => o?.role === 'dual') || null;
    const source = outputs.find((o) => o?.role === 'source') || null;
    const target = outputs.find((o) => (
        o?.role === 'zh' || o?.role === 'target' || o?.role === 'translation'
    )) || null;
    const any = outputs[0] || null;
    return {
        subtitlePath: dual?.path || target?.path || source?.path || any?.path || '',
        sourceSubtitlePath: source?.path || '',
        targetSubtitlePath: target?.path || '',
        bilingualSubtitlePath: dual?.path || '',
    };
}

function loadEngineGlossaryPairs(merged = {}) {
    if (merged.glossaryMtEnabled === false) return [];
    const task = String(merged.task || '');
    if (task !== 'translate' && task !== 'dual') return [];
    // Opus only: Engine protect/restore/enforce with placeholders.
    // Sakura / smart use prompt glossary in the adapter (same as the editor).
    if (merged.mtGlossaryMode === 'prompt' || merged._skipEngineGlossaryProtect) {
        return [];
    }
    try {
        const { readGlossary } = require('./glossary-data');
        const gloss = readGlossary();
        if (!gloss?.ok || !gloss.glossary) return [];
        return buildEngineGlossaryPairs(gloss.glossary);
    } catch {
        return [];
    }
}

function abortBatchMtAdapter() {
    if (batchMtAbortController) {
        try {
            batchMtAbortController.abort();
        } catch { /* ignore */ }
        batchMtAbortController = null;
    }
}

function mapEngineResultsToHistoryOutputs(results) {
    return (Array.isArray(results) ? results : []).map((r) => ({
        videoPath: String(r?.path || '').trim(),
        subtitlePath: String(r?.subtitlePath || '').trim(),
        sourceSubtitlePath: String(r?.sourceSubtitlePath || '').trim(),
        targetSubtitlePath: String(r?.targetSubtitlePath || '').trim(),
        bilingualSubtitlePath: String(r?.bilingualSubtitlePath || '').trim(),
        status: r?.cancelled ? 'cancelled' : (r?.ok ? 'done' : 'failed'),
    })).filter((o) => o.subtitlePath || o.videoPath);
}

function recordEngineBatchHistory({
    list,
    merged,
    finished,
    startedAt,
    startedMs,
    extraErrors = [],
}) {
    try {
        const { appendTaskHistory } = require('./task-history');
        const results = Array.isArray(finished?.results) ? finished.results : [];
        const resultErrors = results
            .filter((r) => !r?.ok && r?.error && r.error !== 'cancelled')
            .slice(0, 8)
            .map((r) => `${path.basename(String(r.path || ''))}: ${r.error}`);
        const errors = [...extraErrors, ...resultErrors].slice(0, 8);
        const totalDurationSec = (Array.isArray(list) ? list : []).reduce(
            (sum, item) => sum + Math.max(0, Number(item?.durationSec || item?.duration) || 0),
            0,
        );
        appendTaskHistory({
            startedAt,
            finishedAt: new Date().toISOString(),
            wallSec: Math.max(0, Math.round((Date.now() - startedMs) / 1000)),
            totalDurationSec,
            device: merged?.device,
            task: merged?.task,
            total: Array.isArray(list) ? list.length : (Number(finished?.total) || 0),
            generated: Number(finished?.generated) || 0,
            skipped: Number(finished?.skipped) || 0,
            failed: Number(finished?.failed) || 0,
            cancelled: !!finished?.cancelled,
            options: stripPostTaskFields(merged || {}),
            errors,
            outputs: mapEngineResultsToHistoryOutputs(results),
        });
    } catch { /* ignore */ }
}

async function runEngineBatch({ items, options, invokeSender, minimizeToTray = false }) {
    if (batchRunning) {
        return { ok: false, error: '已有字幕任务正在运行', code: 'compute_busy' };
    }
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return { ok: false, error: '没有待处理文件' };

    const merged = mergeTransWithAiOptions(mergeEngineOptions(options || {}));
    merged.engineInstallPath = resolveEngineInstallPath(merged.engineInstallPath);
    const paths = list
        .map((item) => path.resolve(String(item?.fullPath || item?.path || '').trim()))
        .filter(Boolean);
    if (!paths.length) return { ok: false, error: '没有待处理文件' };

    const computeLock = require('./compute-task-lock');
    return computeLock.runWithComputeLock({
        kind: 'engine_batch',
        owner: '引擎',
        source: 'runEngineBatch',
    }, () => runEngineBatchLocked({
        list,
        paths,
        merged,
        invokeSender,
        minimizeToTray,
    }));
}

async function runEngineBatchLocked({
    list,
    paths,
    merged,
    invokeSender,
    minimizeToTray = false,
}) {
    batchCancelled = false;
    // Restart only when env/PATH/version changed; otherwise reuse a healthy engine.
    const ensure = await ensureEngineRunning({
        ...merged,
        shouldStop: () => batchCancelled,
    });
    if (!ensure.ok) {
        return ensure;
    }

    const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
    const dualCore = require('../src/js/dual-subtitle-core');
    const {
        resolveLocalSubtitlePath,
        resolveDualSubtitlePaths,
    } = require('./subtitle-utils');
    const isLlmMtId = (id) => !!(
        sakuraCatalog.isLlmInferenceMtModel?.(id)
        || sakuraCatalog.isSakuraMtModel(id)
    );
    const translateLikeBatch = merged.task === 'translate' || merged.task === 'dual';
    const fileMergedList = list.map((it) => {
        const fo = mergeSenseOverrides(merged, it?.optionOverrides || {});
        // Hard guard: never keep Sakura when the merged file language is known non-Japanese.
        return sanitizeSakuraMtForLanguage(fo, fo.language).options;
    });
    const batchWantsSmart = translateLikeBatch && (
        !!merged.smartTranslate
        || fileMergedList.some((fo) => !!fo.smartTranslate)
    );
    const sakuraFile = fileMergedList.find((fo) => (
        isLlmMtId(fo.engineMtModel)
        && !fo.smartTranslate
        && translateLikeBatch
    ));
    // Prefer per-file (post-sanitize) decisions so a global Sakura form cannot force
    // Sakura onto sensed non-Japanese items.
    const batchWantsSakura = translateLikeBatch && !batchWantsSmart && (
        !!sakuraFile
        || (
            list.length === 0
            && isLlmMtId(merged.engineMtModel)
            && !merged.smartTranslate
        )
    );
    const sakuraModelId = sakuraFile?.engineMtModel
        || (list.length === 0 && isLlmMtId(merged.engineMtModel) ? merged.engineMtModel : null);

    // Gate Advanced features before job-start so UI never flashes "running" then fails.
    if (batchWantsSmart) {
        try {
            const { requireSmartTranslate } = require('./advanced-gates');
            const gate = requireSmartTranslate({
                faithfulTone: !!merged.smartTranslateFaithfulTone,
            });
            if (!gate.ok) {
                return {
                    ok: false,
                    error: gate.error
                        || '智能翻译需解锁 Pro',
                };
            }
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    }
    if (merged.filmAudioEnhance || merged.filmVadPreset
        || list.some((it) => {
            const fo = mergeSenseOverrides(merged, it?.optionOverrides || {});
            return !!(fo.filmAudioEnhance || fo.filmVadPreset);
        })) {
        try {
            const { requireFilmAudioEnhance } = require('./advanced-gates');
            const gate = requireFilmAudioEnhance();
            if (!gate.ok) {
                return {
                    ok: false,
                    error: gate.error || '影视音频增强需解锁 Pro',
                };
            }
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    }

    batchRunning = true;
    batchCancelled = false;
    currentJobId = '';
    abortBatchMtAdapter();
    batchMtAbortController = new AbortController();
    let lastOutputDir = '';

    const jobStartedAt = new Date().toISOString();
    const jobStartedMs = Date.now();

    // Align with TWAI: notify UI so progress/badge/stop button activate immediately.
    try {
        if (minimizeToTray && engineUiWindowManager?.createMainWindow) {
            engineUiWindowManager.createMainWindow({ startMinimizedToTray: true });
        }
        const win = engineUiWindowManager?.getMainWindow?.();
        if (win?.webContents && !win.webContents.isDestroyed()) {
            if (win.webContents.isLoading()) {
                await new Promise((resolve) => {
                    win.webContents.once('did-finish-load', () => resolve());
                    setTimeout(resolve, 5000);
                });
            }
        }
    } catch { /* ignore */ }
    emitToSubtitleUi('subtitle-task-job-start', {
        total: paths.length,
        items: paths,
        startedAt: jobStartedAt,
        device: merged.device || 'auto',
        backend: 'transub',
    }, invokeSender);
    appendEngineLogLine(
        `[engine] 开始批次 · ${paths.length} 个文件 · ASR=${merged.engineAsrModel || 'sensevoice-small'} · 档位=${merged.engineProfile || 'balanced'}`,
        invokeSender,
    );

    const results = [];
    let generated = 0;
    let failed = 0;
    let skipped = 0;
    const usedExternalMt = usesExternalMt({
        smartTranslate: batchWantsSmart,
        sakuraMt: batchWantsSakura,
    });
    let batchFailedOrCancelled = false;
    /** @type {{ ok: boolean, stop?: function, mtExternal?: function, mode?: string, url?: string } | null} */
    let mtAdapter = null;
    try {
        if (usedExternalMt) {
            const sakuraNsfwFromItems = list.some((item) => {
                const o = item?.optionOverrides || {};
                return o.sakuraNsfwPrompt === true;
            });
            const sakuraNsfwPrompt = merged.sakuraNsfwPrompt === false
                ? false
                : (
                    merged.sakuraNsfwPrompt === true
                    || sakuraNsfwFromItems
                    || !!merged.smartTranslateFaithfulTone
                );
            mtAdapter = await startEngineMtAdapter({
                mode: batchWantsSmart ? 'smart' : 'sakura',
                modelId: batchWantsSmart
                    ? merged.engineMtModel
                    : (sakuraModelId || merged.engineMtModel),
                options: {
                    ...merged,
                    sakuraNsfwPrompt,
                    ...(batchWantsSmart
                        ? {
                            windowCues: merged.windowCues ?? 10,
                            overlapCues: merged.overlapCues ?? 2,
                        }
                        : {}),
                },
                signal: batchMtAbortController.signal,
                onProgress: (info) => {
                    if (batchCancelled) return;
                    appendEngineLogLine(
                        `[engine-translate] ${info?.message || info?.detail || info?.phase || '翻译中'}`,
                        invokeSender,
                    );
                },
            });
            if (!mtAdapter?.ok) {
                const errMsg = mtAdapter?.error || '外部 MT 适配器启动失败';
                batchFailedOrCancelled = true;
                const finished = {
                    ok: false,
                    cancelled: false,
                    generated: 0,
                    skipped: 0,
                    failed: list.length,
                    error: errMsg,
                    results: [],
                };
                recordEngineBatchHistory({
                    list,
                    merged,
                    finished,
                    startedAt: jobStartedAt,
                    startedMs: jobStartedMs,
                    extraErrors: [errMsg],
                });
                emitToSubtitleUi('subtitle-task-job-finished', finished, invokeSender);
                return { ok: false, error: errMsg };
            }
            const mtModeZh = mtAdapter.mode === 'smart'
                ? '智能翻译'
                : (mtAdapter.mode === 'sakura' ? 'Sakura' : String(mtAdapter.mode || '外部'));
            appendEngineLogLine(
                `[engine] 外部翻译适配器 · ${mtModeZh} · ${mtAdapter.url}`,
                invokeSender,
            );
            // Preview LLM source from settings only (do not resolve/start managed server before ASR).
            if (mtAdapter.mode === 'smart') {
                try {
                    const { readAdvancedDoc } = require('./advanced-license-data');
                    const {
                        formatAdvancedLlmEngineLogLine,
                        llmHostHint,
                    } = require('./advanced-llm-log');
                    const entitlement = require('../src/js/advanced-entitlement-core');
                    const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
                    const advDoc = readAdvancedDoc().doc;
                    const src = entitlement.normalizeLlmSource(advDoc?.llmSource);
                    let preview = { ok: true, source: src, model: '', baseUrl: '' };
                    if (src === 'byok') {
                        const byokCfg = entitlement.normalizeByok(advDoc?.byok);
                        preview = {
                            ok: true,
                            source: 'byok',
                            model: byokCfg.model || '',
                            baseUrl: byokCfg.baseUrl || '',
                        };
                    } else {
                        const choice = managedCatalog.resolveSmartTranslateModelChoice(
                            advDoc?.managedLlm,
                        );
                        preview = {
                            ok: true,
                            source: 'managed',
                            modelId: choice.modelId || '',
                            model: choice.modelId || '',
                            baseUrl: '',
                        };
                    }
                    const line = formatAdvancedLlmEngineLogLine(preview, { feature: '智能翻译' });
                    // Include host hint even when empty so line stays stable; skip empty model noise.
                    if (preview.model || preview.modelId || llmHostHint(preview.baseUrl)) {
                        appendEngineLogLine(line, invokeSender);
                    }
                } catch (_) { /* optional */ }
            }
        }

        for (let i = 0; i < list.length; i += 1) {
            if (batchCancelled) break;
            const item = list[i] || {};
            const mediaPath = path.resolve(String(item.fullPath || item.path || ''));
            const index1 = i + 1;

            sendProgress(invokeSender, {
                stage: 'starting',
                index1,
                total: list.length,
                file: mediaPath,
                detail: '准备引擎任务…',
                percent: 0,
            });

            if (!fs.existsSync(mediaPath)) {
                failed += 1;
                results.push({ ok: false, path: mediaPath, error: '文件不存在' });
                sendProgress(invokeSender, {
                    stage: 'error',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: '文件不存在',
                    error: '文件不存在',
                });
                continue;
            }

            const outDir = merged.outputMode === 'custom' && merged.outputDir
                ? merged.outputDir
                : path.dirname(mediaPath);
            lastOutputDir = outDir;

            const fileMergedRaw = mergeSenseOverrides(merged, item.optionOverrides || {});
            const sakuraSanitize = sanitizeSakuraMtForLanguage(fileMergedRaw, fileMergedRaw.language);
            const fileMerged = sakuraSanitize.options;
            if (sakuraSanitize.changed && sakuraSanitize.note) {
                appendEngineLogLine(
                    `[engine] #${index1}/${list.length} ${sakuraSanitize.note}`,
                    invokeSender,
                );
            }
            if (!fileMerged.overwrite) {
                const isDual = fileMerged.task === 'dual';
                if (isDual) {
                    const sourceSuffix = dualCore.resolveDualSourceSuffix(
                        fileMerged.language,
                        fileMerged.dualTargetSuffix,
                    );
                    const targetSuffix = dualCore.normalizeDualTargetSuffix(
                        fileMerged.dualTargetSuffix,
                    );
                    const { subFormats } = resolveEngineSubFormats(fileMerged);
                    const pair = resolveDualSubtitlePaths(mediaPath, outDir, {
                        sourceSuffix,
                        targetSuffix,
                        subFormats,
                    });
                    if (pair.complete) {
                        skipped += 1;
                        const skipPath = pair.targetPath || pair.sourcePath || '';
                        results.push({
                            ok: true,
                            path: mediaPath,
                            skipped: true,
                            subtitlePath: skipPath,
                            sourceSubtitlePath: pair.sourcePath || '',
                            targetSubtitlePath: pair.targetPath || '',
                        });
                        sendProgress(invokeSender, {
                            stage: 'skipped',
                            index1,
                            total: list.length,
                            file: mediaPath,
                            percent: 100,
                            detail: '已有双语字幕',
                            subtitlePath: skipPath,
                            sourceSubtitlePath: pair.sourcePath || '',
                            targetSubtitlePath: pair.targetPath || '',
                        });
                        continue;
                    }
                } else {
                    const existing = resolveLocalSubtitlePath(mediaPath, outDir);
                    if (existing) {
                        skipped += 1;
                        results.push({
                            ok: true,
                            path: mediaPath,
                            skipped: true,
                            subtitlePath: existing,
                        });
                        sendProgress(invokeSender, {
                            stage: 'skipped',
                            index1,
                            total: list.length,
                            file: mediaPath,
                            percent: 100,
                            detail: '已有字幕',
                            subtitlePath: existing,
                        });
                        continue;
                    }
                }
            }

            const useSakuraMt = isLlmMtId(fileMerged.engineMtModel)
                && !fileMerged.smartTranslate
                && (fileMerged.task === 'translate' || fileMerged.task === 'dual');
            const useSmartTranslate = !!fileMerged.smartTranslate
                && (fileMerged.task === 'translate' || fileMerged.task === 'dual');
            const useExternalMt = usesExternalMt({
                smartTranslate: useSmartTranslate,
                sakuraMt: useSakuraMt,
            });

            const engineTask = mapTaskToEngineTask(fileMerged.task, {
                smartTranslate: useSmartTranslate,
                sakuraMt: useSakuraMt,
            });

            // Never silently fall through to Opus when Sakura/smart was requested but
            // the external adapter was not started (would look like "missing opus-mt-*").
            if (useExternalMt && !mtAdapter?.ok) {
                const errMsg = mtAdapter?.error
                    || (useSakuraMt
                        ? `感知/表单指定了 ${fileMerged.engineMtModel || 'Sakura'}，但外部翻译适配器未启动`
                        : '智能翻译适配器未启动');
                failed += 1;
                results.push({ ok: false, path: mediaPath, error: errMsg });
                sendProgress(invokeSender, {
                    stage: 'failed',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    error: errMsg,
                    detail: errMsg,
                });
                continue;
            }

            if (useSakuraMt) {
                appendEngineLogLine(
                    `[engine] #${index1}/${list.length} 翻译后端 · Sakura（${fileMerged.engineMtModel}）`,
                    invokeSender,
                );
            } else if (useSmartTranslate) {
                let smartBackend = '智能翻译';
                try {
                    const { readAdvancedDoc } = require('./advanced-license-data');
                    const { llmSourceLabel } = require('./advanced-llm-log');
                    const entitlement = require('../src/js/advanced-entitlement-core');
                    const src = entitlement.normalizeLlmSource(readAdvancedDoc().doc?.llmSource);
                    smartBackend = `智能翻译（${llmSourceLabel(src)}）`;
                } catch (_) { /* keep default */ }
                appendEngineLogLine(
                    `[engine] #${index1}/${list.length} 翻译后端 · ${smartBackend}`,
                    invokeSender,
                );
            }

            const jobMtModel = useExternalMt
                ? null
                : (fileMerged.engineMtModel || null);

            // Film flags were gated before job-start; only apply when requested.
            const filmEntitled = !!(fileMerged.filmAudioEnhance || fileMerged.filmVadPreset);

            const { subFormats, dualAss } = resolveEngineSubFormats(fileMerged);
            const jobFlags = buildEngineJobFlags(fileMerged, {
                sakuraOrSmart: useExternalMt,
            });
            const glossaryPairs = loadEngineGlossaryPairs({
                ...fileMerged,
                mtGlossaryMode: jobFlags.mtGlossaryMode,
            });
            const externalMtFields = useExternalMt && mtAdapter?.ok
                ? (typeof mtAdapter.mtExternal === 'function'
                    ? {
                        mtBackend: 'external',
                        mtExternal: mtAdapter.mtExternal(
                            useSmartTranslate
                                ? { batchSize: 40, timeoutSec: 1800 }
                                : { batchSize: 8, timeoutSec: 600 },
                        ),
                    }
                    : buildExternalMtJobFields({
                        url: mtAdapter.url,
                        token: mtAdapter.token,
                        batchSize: useSmartTranslate ? 40 : 8,
                        timeoutSec: useSmartTranslate ? 1800 : 600,
                    }))
                : null;

            const jobBody = {
                task: engineTask,
                mediaPath,
                outputDir: outDir,
                language: fileMerged.language || 'auto',
                asrModel: fileMerged.engineAsrModel || 'sensevoice-small',
                mtModel: jobMtModel,
                subFormats,
                dualAss,
                dualLineOrder: (() => {
                    const raw = fileMerged.dualLineOrder;
                    if (raw == null || String(raw).trim() === '') return 'target-first';
                    try {
                        const dualCore = require('../src/js/dual-subtitle-core');
                        return dualCore.normalizeDualLineOrder(raw);
                    } catch {
                        const order = String(raw).trim().toLowerCase();
                        if (order === 'source-first' || order === 'source') return 'source-first';
                        return 'target-first';
                    }
                })(),
                device: mapDeviceForEngine(fileMerged.device),
                beamSize: Math.max(1, Math.min(20, Number(fileMerged.beamSize) || 5)),
                vad: buildVadJobOptions(fileMerged),
                audio: buildAudioJobOptions(fileMerged, {
                    entitled: (!!fileMerged.filmAudioEnhance || !!fileMerged.filmVadPreset) && filmEntitled !== false,
                }),
                releaseGpuAfter: jobFlags.releaseGpuAfter,
                includeWords: jobFlags.includeWords,
                karaokeVtt: jobFlags.karaokeVtt,
                glossary: glossaryPairs,
                contentProfile: fileMerged.contentProfile || fileMerged.senseProfile || undefined,
                senseProfile: fileMerged.senseProfile || fileMerged.contentProfile || undefined,
                ...(fileMerged.timingAlign != null
                    ? { timingAlign: fileMerged.timingAlign }
                    : {}),
                ...(fileMerged.timingAlignModel != null
                    && String(fileMerged.timingAlignModel).trim() !== ''
                    ? { timingAlignModel: String(fileMerged.timingAlignModel).trim() }
                    : {}),
                // LLM MT: skip built-in JA name lexicon protect (__GLOSS*__),
                // which harms Sakura/smart quality vs the subtitle editor path.
                ...(useExternalMt ? { builtinNames: false } : {}),
                ...(externalMtFields || {}),
                ffmpegPath: (() => {
                    try {
                        const { resolveFfmpegForExecution, findBundledFfmpegPath } = require('./ffmpeg-bridge');
                        const resolved = resolveFfmpegForExecution(fileMerged.ffmpegPath);
                        let exe = resolved?.ok ? String(resolved.path || '').trim() : '';
                        if (!exe || exe === 'ffmpeg') {
                            exe = String(findBundledFfmpegPath?.() || '').trim();
                        }
                        if (!exe || exe === 'ffmpeg') {
                            exe = String(findEngineBundledFfmpeg(fileMerged.engineInstallPath) || '').trim();
                        }
                        return exe && exe !== 'ffmpeg' && fs.existsSync(exe) ? exe : '';
                    } catch {
                        return '';
                    }
                })(),
                sync: false,
            };

            sendProgress(invokeSender, {
                stage: 'model',
                index1,
                total: list.length,
                file: mediaPath,
                detail: `创建引擎任务（${fileMerged.engineAsrModel || 'sensevoice-small'}）…`,
                percent: 2,
            });

            let created;
            try {
                created = await createJob(ensure.baseUrl, jobBody, { timeoutMs: 60000 });
            } catch (err) {
                const errMsg = friendlyEngineError(err.message || String(err));
                failed += 1;
                results.push({ ok: false, path: mediaPath, error: errMsg });
                sendProgress(invokeSender, {
                    stage: 'error',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: errMsg,
                    error: errMsg,
                });
                continue;
            }
            if (!created.ok || !created.data?.id) {
                const err = friendlyEngineError(
                    created.data?.message || created.data?.error || `创建任务失败 (HTTP ${created.status || '?'})`,
                );
                failed += 1;
                results.push({ ok: false, path: mediaPath, error: err });
                sendProgress(invokeSender, {
                    stage: 'error',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: err,
                    error: err,
                });
                continue;
            }

            currentJobId = created.data.id;
            sendProgress(invokeSender, {
                stage: 'transcribe',
                index1,
                total: list.length,
                file: mediaPath,
                detail: `引擎转写中（任务 ${currentJobId}）…`,
                percent: 8,
            });

            const waited = await waitJob(ensure.baseUrl, currentJobId, {
                shouldStop: () => batchCancelled,
                onEvent: (ev) => {
                    if (batchCancelled) return;
                    const progress = ev.progress || {};
                    const stage = progress.stage || ev.status || 'running';
                    const detail = progress.detail
                        || (ev.status === 'queued' ? '排队中…'
                            : ev.status === 'running' ? '引擎转写中…'
                                : String(ev.status || '处理中'));
                    const percent = Number.isFinite(Number(progress.percent))
                        ? Number(progress.percent)
                        : (ev.status === 'running' ? 15 : 5);
                    sendProgress(invokeSender, {
                        stage,
                        index1,
                        total: list.length,
                        file: mediaPath,
                        detail,
                        percent,
                        jobId: currentJobId,
                        processedSec: progress.processedSec,
                        mediaDurationSec: progress.mediaDurationSec ?? progress.audioDurationSec,
                    });
                },
            });
            currentJobId = '';

            if (batchCancelled || waited?.cancelled || waited?.error === 'cancelled') {
                results.push({ ok: false, path: mediaPath, error: 'cancelled', cancelled: true });
                sendProgress(invokeSender, {
                    stage: 'cancelled',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: '已取消',
                    error: 'cancelled',
                });
                break;
            }

            if (!waited.ok) {
                const err = friendlyEngineError(waited.error || '任务失败');
                failed += 1;
                results.push({ ok: false, path: mediaPath, error: err });
                sendProgress(invokeSender, {
                    stage: 'error',
                    index1,
                    total: list.length,
                    file: mediaPath,
                    detail: err,
                    error: err,
                });
                continue;
            }

            if (batchCancelled) {
                results.push({ ok: false, path: mediaPath, error: 'cancelled', cancelled: true });
                break;
            }

            const outPaths = extractOutputPaths(waited.data?.result);

            // Free-path postprocess (same knobs as UI post-batch): strip Whisper YouTube-style hallucinations etc.
            const { applyPostBatchPipeline } = require('./post-batch-pipeline');
            applyPostBatchPipeline([
                outPaths.sourceSubtitlePath,
                outPaths.targetSubtitlePath,
                outPaths.bilingualSubtitlePath,
                outPaths.subtitlePath,
            ], merged, {
                onProgress: (info) => {
                    sendProgress(invokeSender, {
                        stage: 'transcribe',
                        index1,
                        total: list.length,
                        file: mediaPath,
                        detail: info?.detail || '后处理字幕…',
                        percent: 96,
                    });
                },
                onLog: (line) => {
                    appendEngineLogLine(`[engine] ${line}`, invokeSender);
                },
            });

            // File-level MT sanitize (Opus + any adapter miss): strip trailing cast-name
            // hallucinations / Gloss / loops on ZH against JA source or result.cues.source.
            const translateLike = fileMerged.task === 'translate' || fileMerged.task === 'dual'
                || engineTask === 'translate' || engineTask === 'dual' || engineTask === 'translate_mt';
            if (translateLike && merged.mtSanitize !== false) {
                try {
                    const { sanitizeMtSubtitlePair } = require('./extensions-bridge');
                    const srcResolved = outPaths.sourceSubtitlePath
                        ? path.resolve(String(outPaths.sourceSubtitlePath))
                        : '';
                    const zhCandidates = [
                        outPaths.targetSubtitlePath,
                        outPaths.subtitlePath,
                    ].filter(Boolean);
                    const uniqueZh = [...new Set(zhCandidates.map((p) => path.resolve(String(p))))]
                        .filter((subPath) => {
                            if (!/\.(srt|vtt|lrc)$/i.test(subPath)) return false;
                            if (srcResolved && subPath === srcResolved) return false;
                            return fs.existsSync(subPath);
                        });
                    for (const zhPath of uniqueZh) {
                        sendProgress(invokeSender, {
                            stage: 'translate',
                            index1,
                            total: list.length,
                            file: mediaPath,
                            detail: '后处理：译后清洗…',
                            percent: 97,
                        });
                        const sm = sanitizeMtSubtitlePair(zhPath, outPaths.sourceSubtitlePath, {
                            sourceCues: waited.data?.result?.cues?.source,
                            contentProfile: fileMerged.contentProfile || fileMerged.senseProfile,
                            senseProfile: fileMerged.senseProfile || fileMerged.contentProfile,
                            sakuraNsfwPrompt: fileMerged.sakuraNsfwPrompt,
                            nsfwPrompt: fileMerged.nsfwPrompt,
                            smartTranslateFaithfulTone: fileMerged.smartTranslateFaithfulTone
                                || fileMerged.faithfulTone,
                            faithfulTone: fileMerged.faithfulTone
                                || fileMerged.smartTranslateFaithfulTone,
                            applyNsfwLexicon: fileMerged.applyNsfwLexicon,
                            backupMode: 'off',
                        });
                        if (sm?.ok && sm.changed) {
                            appendEngineLogLine(
                                `[engine] ${sm.summary || '译后清洗'} ${path.basename(zhPath)}`,
                                invokeSender,
                            );
                        }
                    }
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 译后清洗跳过：${err.message || err}`,
                        invokeSender,
                    );
                }
            }

            // Keep ASR/source transcript archive before optional dual-track deletion.
            // translate_mt normally deletes `.src.partial.*` and only returns zh outputs —
            // fall back to result.cues.source so「保存转录字幕」 still works.
            try {
                const { keepTranscriptFromJobResult } = require('./transcript-keep');
                const kept = keepTranscriptFromJobResult({
                    task: merged.task,
                    sourceSubtitlePath: outPaths.sourceSubtitlePath,
                    subtitlePath: outPaths.subtitlePath,
                    sourceCues: waited.data?.result?.cues?.source,
                    mediaPath,
                    options: merged,
                });
                if (kept?.ok && kept.kept?.length) {
                    appendEngineLogLine(
                        `[engine] 已保存转录字幕 ${kept.kept.length} 个 → ${kept.dir || ''}`,
                        invokeSender,
                    );
                } else if (kept && kept.ok === false && kept.error) {
                    appendEngineLogLine(
                        `[engine] 保存转录字幕失败: ${kept.error}`,
                        invokeSender,
                    );
                }
            } catch (err) {
                appendEngineLogLine(
                    `[engine] 保存转录字幕跳过: ${err.message || err}`,
                    invokeSender,
                );
            }

            // Seed .transub.json from Whisper avgLogprob / noSpeechProb when available.
            try {
                const { seedAsrConfidenceMeta, pickEngineCuesForConfidence } = require('./asr-confidence-seed');
                const engineCues = pickEngineCuesForConfidence(waited.data?.result);
                const seedTargets = [
                    outPaths.sourceSubtitlePath,
                    outPaths.subtitlePath,
                    outPaths.targetSubtitlePath,
                ].filter(Boolean);
                const uniqueSeeds = [...new Set(seedTargets.map((p) => path.resolve(String(p))))];
                for (const subPath of uniqueSeeds) {
                    if (!fs.existsSync(subPath)) continue;
                    if (!/\.(srt|vtt|lrc)$/i.test(subPath)) continue;
                    const seeded = seedAsrConfidenceMeta(subPath, engineCues);
                    if (seeded?.ok && seeded.entryCount) {
                        appendEngineLogLine(
                            `[engine] 已写入 ASR 置信度 ${seeded.entryCount} 条 → ${path.basename(subPath)}`,
                            invokeSender,
                        );
                        break;
                    }
                }
            } catch (err) {
                appendEngineLogLine(
                    `[engine] ASR 置信度写入跳过: ${err.message || err}`,
                    invokeSender,
                );
            }

            // Optional: keep only merged dual when user asked to delete source tracks after merge.
            // Prefer an editable merged SRT when deleting source tracks; ASS remains editable as fallback.
            if (
                merged.mergeBilingualSubtitles
                && merged.deleteSourcesAfterMergeBilingual
                && outPaths.bilingualSubtitlePath
                && engineTask === 'dual'
            ) {
                let editableMerged = '';
                try {
                    if (outPaths.sourceSubtitlePath && outPaths.targetSubtitlePath) {
                        const { writeMergedBilingualSubtitleFiles } = require('./subtitle-fs-helpers');
                        editableMerged = writeMergedBilingualSubtitleFiles(
                            outPaths.sourceSubtitlePath,
                            outPaths.targetSubtitlePath,
                            {
                                primaryTrack: merged.dualPrimaryTrack || 'target',
                                lineOrder: merged.dualLineOrder || 'target-first',
                                nameAsVideoStem: true,
                            },
                        );
                    }
                } catch (err) {
                    appendEngineLogLine(
                        `[engine] 可编辑双语合并跳过：${err.message || err}`,
                        invokeSender,
                    );
                }
                for (const p of [outPaths.sourceSubtitlePath, outPaths.targetSubtitlePath]) {
                    if (!p || p === outPaths.bilingualSubtitlePath || p === editableMerged) continue;
                    try {
                        if (fs.existsSync(p)) fs.unlinkSync(p);
                    } catch { /* ignore */ }
                }
                outPaths.sourceSubtitlePath = '';
                outPaths.targetSubtitlePath = '';
                if (editableMerged) {
                    outPaths.subtitlePath = editableMerged;
                } else {
                    // Keep dual ASS as last resort; post-batch will skip non-editable formats.
                    outPaths.subtitlePath = outPaths.bilingualSubtitlePath;
                }
            }

            generated += 1;
            results.push({
                ok: true,
                path: mediaPath,
                result: waited.data?.result,
                ...outPaths,
            });
            sendProgress(invokeSender, {
                stage: 'done',
                index1,
                total: list.length,
                file: mediaPath,
                percent: 100,
                detail: outPaths.bilingualSubtitlePath ? '完成（含双语 ASS）' : '完成',
                ...outPaths,
            });
        }

        const cancelled = batchCancelled;
        const finished = {
            ok: !cancelled && failed === 0,
            cancelled,
            generated,
            skipped,
            failed: cancelled ? failed + (list.length - results.length) : failed,
            results,
        };
        batchFailedOrCancelled = !finished.ok || !!finished.cancelled;
        recordEngineBatchHistory({
            list,
            merged,
            finished,
            startedAt: jobStartedAt,
            startedMs: jobStartedMs,
        });
        emitToSubtitleUi('subtitle-task-job-finished', finished, invokeSender);
        if (!cancelled) {
            try {
                deferredEnsureTwai();
                const {
                    setSessionPostTaskOptions,
                    deferBatchFinalize,
                } = require('./transwithai-bridge');
                if (typeof setSessionPostTaskOptions !== 'function'
                    || typeof deferBatchFinalize !== 'function') {
                    throw new Error('deferBatchFinalize is not available');
                }
                if (lastOutputDir) {
                    setSessionPostTaskOptions({ lastOutputDir });
                }
                // Tray notify / sound / shutdown wait until UI finishes post-batch (incl. QC fix).
                deferBatchFinalize(merged, finished, engineUiWindowManager);
            } catch (err) {
                console.warn('[engine] defer batch finalize failed:', err?.message || err);
            }
        } else {
            try {
                const { clearDeferredBatchFinalize } = require('./transwithai-bridge');
                clearDeferredBatchFinalize?.();
            } catch { /* ignore */ }
        }
        return finished;
    } catch (err) {
        batchFailedOrCancelled = true;
        const finished = {
            ok: false,
            cancelled: false,
            generated,
            skipped,
            failed: Math.max(failed, 1),
            error: err.message || String(err),
            results,
        };
        recordEngineBatchHistory({
            list,
            merged,
            finished,
            startedAt: jobStartedAt,
            startedMs: jobStartedMs,
            extraErrors: [finished.error],
        });
        emitToSubtitleUi('subtitle-task-job-finished', finished, invokeSender);
        return finished;
    } finally {
        try {
            mtAdapter?.stop?.();
        } catch { /* ignore */ }
        abortBatchMtAdapter();
        try {
            reclaimLocalComputeAfterEngineBatch({
                usedExternalMt,
                failedOrCancelled: batchFailedOrCancelled || batchCancelled,
            });
        } catch { /* ignore */ }
        batchRunning = false;
        currentJobId = '';
    }
}

function setupEngineBridge(api, {
    getAppRoot,
    windowManager = null,
    ensureBridge = null,
} = {}) {
    const { register } = api;
    engineUiWindowManager = windowManager || null;
    ensureBridgeFn = typeof ensureBridge === 'function' ? ensureBridge : null;
    setupComputeTaskStatusIpc(register);

    async function readMergedOptions(payload = {}) {
        const saved = loadSettings(() => getAppRoot()).options || {};
        const merged = mergeTransWithAiOptions(mergeEngineOptions({
            ...stripPostTaskFields(saved),
            ...stripPostTaskFields(payload || {}),
        }));
        merged.engineInstallPath = resolveEngineInstallPath(merged.engineInstallPath);
        return merged;
    }

    /** Capture UI post-task (shutdown/quit/sleep/…) before options are stripped for the engine. */
    function syncEngineSessionPostTask(payloadOptions = {}) {
        try {
            deferredEnsureTwai();
            const { setSessionPostTaskOptions } = require('./transwithai-bridge');
            if (typeof setSessionPostTaskOptions === 'function') {
                setSessionPostTaskOptions(payloadOptions || {});
            }
        } catch (err) {
            console.warn('[engine] sync post-task failed:', err?.message || err);
        }
    }

    register('transub-engine-bundled-path', async () => {
        try {
            const bundled = getBundledEnginePath();
            const present = isValidEngineRoot(bundled);
            return {
                ok: true,
                path: bundled,
                present,
                resolved: present ? bundled : getBundledEnginePathIfPresent(),
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-validate', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const caps = await getCapabilities(ensure.baseUrl);
            return {
                ok: true,
                baseUrl: ensure.baseUrl,
                health: ensure.health,
                capabilities: caps.data || null,
                spawned: !!ensure.spawned,
                version: ensure.health?.engineVersion || '',
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-list-models', async (_event, payload = {}) => {
        try {
            const sakuraMt = require('./sakura-mt');
            const sakuraModels = sakuraMt.listSakuraModelsForEngine();
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) {
                return {
                    ...ensure,
                    // Still expose free Sakura so MT dropdown works offline from engine.
                    models: sakuraModels,
                };
            }
            const res = await listModels(ensure.baseUrl);
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `列出模型失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                    models: sakuraModels,
                };
            }
            return {
                ok: true,
                models: [
                    ...(Array.isArray(res.data?.models) ? res.data.models : []),
                    ...sakuraModels,
                ],
                profiles: res.data?.profiles || {},
                raw: res.data,
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-recommend', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await recommendModels(ensure.baseUrl, payload.body || payload || {});
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `推荐失败 (HTTP ${res.status})`,
                    status: res.status,
                };
            }
            return { ok: true, ...(res.data || {}) };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-detect-language', async (_event, payload = {}) => {
        try {
            if (batchRunning) {
                return { ok: false, error: '字幕任务运行中，暂不探测语种' };
            }
            const options = await readMergedOptions(payload.options || payload || {});
            const mediaPath = String(payload.mediaPath || payload.path || '').trim();
            if (!mediaPath) return { ok: false, error: '未指定媒体路径' };
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await detectLanguage(ensure.baseUrl, {
                mediaPath,
                asrModel: payload.asrModel || options.engineAsrModel || undefined,
                device: payload.device || options.device || 'auto',
                durationSec: Math.max(3, Math.min(30, Number(payload.durationSec) || 12)),
                startSec: Math.max(0, Math.min(3600, Number(payload.startSec) || 0)),
            }, { timeoutMs: 600000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `语种探测失败 (HTTP ${res.status})`,
                    status: res.status,
                    code: res.data?.code,
                };
            }
            return { ok: true, ...(res.data || {}) };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-translate-cues', async (event, payload = {}) => {
        try {
            return await translateCuesWithEngineOpus(payload || {}, {
                onProgress: (progress) => {
                    try {
                        if (!event?.sender?.isDestroyed?.()) {
                            event.sender.send('transub-engine-translate-progress', progress);
                        }
                    } catch (_) { /* ignore */ }
                },
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-download-models', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const hfEndpoint = payload.hfEndpoint != null
                ? String(payload.hfEndpoint || '').trim().replace(/\/+$/, '')
                : String(options.engineHfEndpoint || '').trim().replace(/\/+$/, '');
            const optionsWithHf = { ...options, engineHfEndpoint: hfEndpoint };
            // Restart managed engine so HF_ENDPOINT is applied before Hub downloads.
            if (engineProc) {
                stopEngineProcess();
                await sleep(600);
            }
            const ensure = await ensureEngineRunning(optionsWithHf);
            if (!ensure.ok) return ensure;
            const modelIds = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : undefined;
            const res = await downloadModels(ensure.baseUrl, {
                profile: payload.profile || options.engineProfile,
                modelIds,
                hfEndpoint,
                force: !!payload.force,
            }, { timeoutMs: 600000 });
            if (!res.ok) {
                const rawMsg = res.data?.message || res.data?.error || `模型下载失败 (HTTP ${res.status})`;
                const hint = /connecttimeout|10060|timed out|internet connection|connection reset|10054/i.test(String(rawMsg))
                    && !hfEndpoint
                    ? '（可在设置中填写 Hugging Face 镜像 https://hf-mirror.com 后重试）'
                    : '';
                return {
                    ok: false,
                    error: `${rawMsg}${hint}`,
                    code: res.data?.code || '',
                    status: res.status,
                    raw: res.data,
                };
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-gpu-status', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await getGpuRuntime(ensure.baseUrl, { timeoutMs: 20000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `GPU 状态查询失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-asr-whisper-status', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await getAsrWhisperRuntime(ensure.baseUrl, { timeoutMs: 20000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error
                        || `Whisper 运行库查询失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-audio-separate-status', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await getAudioSeparateRuntime(ensure.baseUrl, { timeoutMs: 20000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error
                        || `Demucs 状态查询失败 (HTTP ${res.status})`,
                    status: res.status,
                    raw: res.data,
                };
            }
            return { ok: true, ...(res.data || {}), status: res.status };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-ensure-gpu', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload);
            // Restart so pip-installed nvidia/* wheels are visible to a fresh process PATH.
            if (engineProc) {
                stopEngineProcess();
                await sleep(600);
            }
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            const res = await ensureGpuRuntime(ensure.baseUrl, {
                force: !!payload.force,
            }, { timeoutMs: 1800000 });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.data?.message || res.data?.error || `GPU 支持安装失败 (HTTP ${res.status})`,
                    code: res.data?.code || '',
                    status: res.status,
                    raw: res.data,
                };
            }
            // Restart again after install so newly added DLLs bind cleanly.
            if (engineProc) {
                stopEngineProcess();
                await sleep(800);
            }
            const ensure2 = await ensureEngineRunning({ ...options, forceRestart: true });
            if (!ensure2.ok) {
                return {
                    ok: true,
                    ...(res.data || {}),
                    restarted: false,
                    restartError: ensure2.error,
                    message: (res.data?.message || 'GPU 支持已安装') + '（引擎重启失败，请手动检测引擎）',
                };
            }
            const statusRes = await getGpuRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
            return {
                ok: true,
                ...(res.data || {}),
                restarted: true,
                probe: statusRes.data || res.data?.probe,
                message: statusRes.data?.hint || res.data?.message || 'GPU 支持已就绪',
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-open-download', async (_event, payload = {}) => {
        // 下载管理窗口已移除；调用方应直接使用 transub-engine-run-download
        return { ok: true, removed: true, kind: String(payload?.kind || 'models') };
    });

    register('transub-engine-cancel-download', async () => {
        try {
            if (downloadAbort) {
                try { downloadAbort.abort(); } catch { /* ignore */ }
            }
            // Never kill a running subtitle batch — only abort the download signal.
            if (engineProc && !batchRunning) {
                try { stopEngineProcess(); } catch { /* ignore */ }
            }
            broadcastEngineDownloadProgress({
                phase: 'cancelled',
                ok: false,
                message: batchRunning
                    ? '已取消下载（字幕任务仍在运行）'
                    : '已取消下载',
                pct: 0,
            });
            return { ok: true, cancelled: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-run-download', async (_event, payload = {}) => {
        if (batchRunning) {
            return { ok: false, error: '字幕任务进行中，请先停止任务再下载模型 / 组件' };
        }
        if (downloadBusy) {
            return { ok: false, error: '已有下载任务正在进行' };
        }
        downloadBusy = true;
        downloadAbort = new AbortController();
        const signal = downloadAbort.signal;
        const kind = normalizeEngineDownloadKind(payload.kind);
        const emit = (info) => {
            broadcastEngineDownloadProgress({ ...(info || {}), kind });
        };
        try {
            const options = await readMergedOptions(payload);
            const hfEndpoint = payload.hfEndpoint != null
                ? String(payload.hfEndpoint || '').trim().replace(/\/+$/, '')
                : String(options.engineHfEndpoint || '').trim().replace(/\/+$/, '');
            const optionsWithHf = { ...options, engineHfEndpoint: hfEndpoint };

            if (batchRunning) {
                return { ok: false, error: '字幕任务进行中，请先停止任务再下载模型 / 组件' };
            }
            if (engineProc) {
                stopEngineProcess();
                await sleep(600);
            }

            // Whisper extras must install while the engine is stopped: a running
            // server already imports ctranslate2/onnxruntime and Windows then
            // denies --force-reinstall (WinError 5).
            const earlyModelIds = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [];
            const needWhisperExtras = !!payload.force || modelIdsNeedWhisperExtras(earlyModelIds);
            if (kind === 'models' && needWhisperExtras) {
                const installPath = resolveEngineInstallPath(optionsWithHf.engineInstallPath);
                const pythonPath = resolveEngineRuntimePython(installPath);
                if (pythonPath) {
                    emit({
                        phase: 'progress',
                        message: '正在补齐 Whisper 运行库（引擎已停止，避免文件占用）…',
                        pct: 3,
                    });
                    let pre = await ensureAsrWhisperOffline({
                        pythonPath,
                        cwd: installPath,
                        force: false,
                        signal,
                        onProgress: (ev) => {
                            const pct = Number(ev.percent);
                            emit({
                                phase: 'progress',
                                message: ev.detail || ev.message || '正在安装 Whisper 运行库…',
                                pct: Number.isFinite(pct) ? Math.min(18, 3 + Math.round(pct * 0.15)) : 6,
                                raw: ev,
                            });
                        },
                    });
                    if (
                        !pre.ok
                        && pre.code === 'EXTRAS_LOCKED_IN_PROCESS'
                        && !signal?.aborted
                    ) {
                        emit({
                            phase: 'progress',
                            message: '运行库需强制重装，正在独立进程中重写（引擎已停止）…',
                            pct: 5,
                        });
                        pre = await ensureAsrWhisperOffline({
                            pythonPath,
                            cwd: installPath,
                            force: true,
                            signal,
                            onProgress: (ev) => {
                                const pct = Number(ev.percent);
                                emit({
                                    phase: 'progress',
                                    message: ev.detail || ev.message || '正在强制重装 Whisper 运行库…',
                                    pct: Number.isFinite(pct) ? Math.min(18, 5 + Math.round(pct * 0.13)) : 8,
                                    raw: ev,
                                });
                            },
                        });
                    }
                    if (pre.cancelled || signal.aborted) {
                        emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                        return { ok: false, cancelled: true, error: 'cancelled' };
                    }
                    if (!pre.ok && pre.code !== 'SMART_APP_CONTROL') {
                        const err = pre.error || pre.message || 'Whisper 运行库安装失败';
                        emit({ phase: 'error', ok: false, message: err, pct: 0 });
                        return { ok: false, error: err, code: pre.code || '', logTail: pre.logTail };
                    }
                    if (pre.code === 'SMART_APP_CONTROL') {
                        emit({
                            phase: 'progress',
                            message: pre.message || pre.error || 'Whisper 运行库受系统策略拦截，将继续尝试其它项…',
                            pct: 8,
                        });
                    }
                }
            }

            emit({ phase: 'progress', message: '正在启动引擎…', pct: 2 });
            let ensure = await ensureEngineRunning(optionsWithHf);
            const sakuraCatalogEarly = require('../src/js/sakura-mt-catalog-core');
            const earlyIds = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [];
            const earlySakuraOnly = earlyIds.length > 0
                && earlyIds.every((id) => sakuraCatalogEarly.isSakuraMtModel(id));
            if (!ensure.ok) {
                if (kind === 'models' && earlySakuraOnly) {
                    emit({
                        phase: 'progress',
                        message: '引擎未就绪，仅下载 Sakura GGUF…',
                        pct: 10,
                    });
                    // Skip to sakura-only path below via empty engine + selected sakura ids
                    ensure = { ok: true, baseUrl: optionsWithHf.engineUrl || DEFAULT_ENGINE_URL };
                } else {
                    emit({ phase: 'error', ok: false, message: ensure.error || '引擎未就绪', pct: 0 });
                    return ensure;
                }
            }
            let baseUrl = ensure.baseUrl;

            if (kind === 'demucs') {
                emit({ phase: 'progress', message: '正在安装 Demucs + CUDA PyTorch（若有 GPU）…', pct: 8 });
                const res = await ensureAudioSeparateRuntimeStream(baseUrl, {
                    force: !!payload.force,
                }, {
                    timeoutMs: 3600000,
                    signal,
                    onEvent: (ev) => {
                        const pct = Number(ev.percent);
                        emit({
                            phase: ev.type === 'done' ? 'done' : (ev.type === 'error' ? 'error' : 'progress'),
                            ok: ev.type === 'error' ? false : undefined,
                            message: ev.detail || ev.message || ev.hint || ev.stage || '处理中…',
                            pct: Number.isFinite(pct) ? pct : undefined,
                            raw: ev,
                        });
                    },
                });
                if (res.cancelled || signal.aborted) {
                    emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                    return { ok: false, cancelled: true, error: 'cancelled' };
                }
                if (!res.ok) {
                    const err = res.error || res.data?.message || 'Demucs 安装失败';
                    emit({ phase: 'error', ok: false, message: err, pct: 0 });
                    return { ok: false, error: err, raw: res.data };
                }
                emit({ phase: 'progress', message: '正在重启引擎…', pct: 92 });
                if (engineProc) {
                    stopEngineProcess();
                    await sleep(800);
                }
                const ensure2 = await ensureEngineRunning({ ...optionsWithHf, forceRestart: true });
                if (!ensure2.ok) {
                    const msg = (res.data?.message || 'Demucs 已安装') + '（引擎重启失败，请手动检测引擎）';
                    emit({ phase: 'done', ok: true, message: msg, pct: 100 });
                    return { ok: true, restarted: false, message: msg, ...(res.data || {}) };
                }
                const statusRes = await getAudioSeparateRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                const message = statusRes.data?.hint || res.data?.message || 'Demucs 已就绪';
                emit({ phase: 'done', ok: true, message, pct: 100 });
                return {
                    ok: true,
                    restarted: true,
                    probe: statusRes.data || res.data?.probe,
                    message,
                    ...(res.data || {}),
                };
            }

            if (kind === 'gpu') {
                emit({ phase: 'progress', message: '检测 GPU 并安装 CUDA 12 运行库…', pct: 8 });
                const res = await ensureGpuRuntimeStream(baseUrl, {
                    force: !!payload.force,
                }, {
                    timeoutMs: 1800000,
                    signal,
                    onEvent: (ev) => {
                        const pct = Number(ev.percent);
                        const downloadedBytes = Number(
                            ev.downloadedBytes ?? ev.received ?? ev.downloaded,
                        );
                        const totalBytes = Number(ev.totalBytes ?? ev.totalSize);
                        const bytesPerSecond = Number(ev.bytesPerSecond ?? ev.speed);
                        emit({
                            phase: ev.type === 'done' ? 'done' : (ev.type === 'error' ? 'error' : 'progress'),
                            ok: ev.type === 'error' ? false : undefined,
                            message: ev.detail || ev.message || ev.hint || ev.stage || '处理中…',
                            pct: Number.isFinite(pct) ? pct : undefined,
                            downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                ? downloadedBytes
                                : undefined,
                            totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                            bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                ? bytesPerSecond
                                : undefined,
                            suggestManual: !!ev.suggestManual,
                            raw: ev,
                        });
                    },
                });
                if (res.cancelled || signal.aborted) {
                    emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                    return { ok: false, cancelled: true, error: 'cancelled' };
                }
                if (!res.ok) {
                    const err = res.error || res.data?.message || 'GPU 支持安装失败';
                    emit({ phase: 'error', ok: false, message: err, pct: 0 });
                    return { ok: false, error: err, raw: res.data };
                }
                emit({ phase: 'progress', message: '正在重启引擎以加载运行库…', pct: 92 });
                if (engineProc) {
                    stopEngineProcess();
                    await sleep(800);
                }
                const ensure2 = await ensureEngineRunning({ ...optionsWithHf, forceRestart: true });
                if (!ensure2.ok) {
                    const msg = (res.data?.message || 'GPU 支持已安装') + '（引擎重启失败，请手动检测引擎）';
                    emit({ phase: 'done', ok: true, message: msg, pct: 100 });
                    return { ok: true, restarted: false, message: msg, ...(res.data || {}) };
                }
                const statusRes = await getGpuRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                const message = statusRes.data?.hint || res.data?.message || 'GPU 支持已就绪';
                emit({ phase: 'done', ok: true, message, pct: 100 });
                return {
                    ok: true,
                    restarted: true,
                    probe: statusRes.data || res.data?.probe,
                    message,
                    ...(res.data || {}),
                };
            }

            // models — optionally install GPU runtime first when missing
            try {
                const gpuStatus = await getGpuRuntime(baseUrl, { timeoutMs: 15000 });
                const st = gpuStatus.data?.status;
                if (gpuStatus.ok && (st === 'need_install' || st === 'partial')) {
                    if (payload.skipGpuPrestep) {
                        emit({
                            phase: 'progress',
                            message: '已跳过自动安装 GPU 支持（可稍后单独修复）',
                            pct: 36,
                        });
                    } else {
                        emit({
                            phase: 'progress',
                            message: gpuStatus.data?.hint || '检测到 GPU，先安装 CUDA 运行库…',
                            pct: 4,
                        });
                        const gpuRes = await ensureGpuRuntimeStream(baseUrl, { force: false }, {
                            timeoutMs: 1800000,
                            signal,
                            onEvent: (ev) => {
                                const pct = Number(ev.percent);
                                const mapped = Number.isFinite(pct) ? Math.min(35, Math.round(pct * 0.35)) : undefined;
                                const downloadedBytes = Number(
                                    ev.downloadedBytes ?? ev.received ?? ev.downloaded,
                                );
                                const totalBytes = Number(ev.totalBytes ?? ev.totalSize);
                                const bytesPerSecond = Number(ev.bytesPerSecond ?? ev.speed);
                                emit({
                                    phase: 'progress',
                                    message: `GPU：${ev.detail || ev.message || ev.stage || '安装中…'}`,
                                    pct: mapped,
                                    downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                        ? downloadedBytes
                                        : undefined,
                                    totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                                    bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                        ? bytesPerSecond
                                        : undefined,
                                    suggestManual: !!ev.suggestManual,
                                    raw: ev,
                                });
                            },
                        });
                        if (gpuRes.cancelled || signal.aborted) {
                            emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                            return { ok: false, cancelled: true, error: 'cancelled' };
                        }
                        if (!gpuRes.ok) {
                            emit({
                                phase: 'progress',
                                message: `GPU 预装未完成（${gpuRes.error || gpuRes.data?.message || '继续下载模型'}），先继续模型/运行库…`,
                                pct: 36,
                            });
                        } else {
                            if (engineProc) {
                                stopEngineProcess();
                                await sleep(600);
                            }
                            const ensureAfterGpu = await ensureEngineRunning({ ...optionsWithHf, forceRestart: true });
                            if (!ensureAfterGpu.ok) {
                                // Do not abort models/runtime download — one-click fix can continue
                                // and a later round / ensure-gpu step can recover.
                                emit({
                                    phase: 'progress',
                                    message: 'GPU 安装后引擎重启失败，仍继续下载模型/运行库…',
                                    pct: 36,
                                });
                            } else {
                                ensure = ensureAfterGpu;
                                baseUrl = ensureAfterGpu.baseUrl || baseUrl;
                                emit({ phase: 'progress', message: 'GPU 支持已处理，开始下载模型…', pct: 38 });
                            }
                        }
                    }
                }
            } catch { /* ignore optional GPU pre-step */ }

            // models — only selected IDs (do not merge profile when explicit list is sent)
            const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
            const allSelected = Array.isArray(payload.modelIds)
                ? payload.modelIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [];
            const sakuraIds = allSelected.filter((id) => sakuraCatalog.isSakuraMtModel(id));
            const engineIds = allSelected.filter((id) => !sakuraCatalog.isSakuraMtModel(id));
            const useExplicitSelection = allSelected.length > 0;
            const profile = useExplicitSelection
                ? undefined
                : (payload.profile || options.engineProfile || 'balanced');

            if (!useExplicitSelection && !profile) {
                emit({ phase: 'error', ok: false, message: '未选择要下载的模型', pct: 0 });
                return { ok: false, error: '未选择要下载的模型' };
            }

            const doneIds = [];
            if (engineIds.length || profile) {
                emit({
                    phase: 'progress',
                    message: useExplicitSelection
                        ? `开始下载引擎模型（${engineIds.join(', ')}）…`
                        : `开始下载模型（档位 ${profile}）…`,
                    pct: 40,
                });
                const res = await downloadModelsStream(baseUrl, {
                    profile: profile || undefined,
                    modelIds: engineIds.length ? engineIds : undefined,
                    hfEndpoint,
                    force: !!payload.force,
                }, {
                    timeoutMs: 1800000,
                    signal,
                    onEvent: (ev) => {
                        const stage = String(ev.stage || '').toLowerCase();
                        let pct = Number(ev.percent);
                        const downloadedBytes = Number(
                            ev.downloadedBytes ?? ev.received ?? ev.downloaded,
                        );
                        // Do not fall back to ev.total — engine SSE uses `total` for model count.
                        const totalBytes = Number(ev.totalBytes ?? ev.totalSize);
                        const bytesPerSecond = Number(ev.bytesPerSecond ?? ev.speed);
                        // Pip extras often omit percent; synthesize from byte counters.
                        if (!Number.isFinite(pct)
                            && Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                            && Number.isFinite(totalBytes) && totalBytes > 0) {
                            pct = Math.max(0, Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)));
                        }
                        let mapped;
                        if (Number.isFinite(pct)) {
                            if (stage === 'pip') {
                                // Reserve 40–58% for dependency wheels (torch etc.).
                                mapped = Math.min(58, 40 + Math.round(pct * 0.18));
                            } else {
                                mapped = Math.min(85, 58 + Math.round(pct * 0.27));
                            }
                        }
                        const detail = ev.detail || ev.message || '';
                        const modelId = ev.modelId ? ` [${ev.modelId}]` : '';
                        emit({
                            phase: ev.type === 'done' ? 'progress' : (ev.type === 'error' ? 'error' : 'progress'),
                            ok: ev.type === 'error' ? false : undefined,
                            message: `${detail}${modelId}`.trim() || '下载中…',
                            pct: mapped,
                            modelId: modelId || ev.modelId || undefined,
                            index: Number.isFinite(Number(ev.index)) ? Number(ev.index) : undefined,
                            downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                ? downloadedBytes
                                : undefined,
                            totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                            bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                ? bytesPerSecond
                                : undefined,
                            suggestManual: !!ev.suggestManual,
                            raw: ev,
                        });
                    },
                });
                if (res.cancelled || signal.aborted) {
                    emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                    return { ok: false, cancelled: true, error: 'cancelled' };
                }
                if (!res.ok) {
                    const rawMsg = res.error || res.data?.message || res.data?.error || '模型下载失败';
                    const hint = /connecttimeout|10060|timed out|internet connection|connection reset|10054/i.test(String(rawMsg))
                        && !hfEndpoint
                        ? '（可在设置中填写 Hugging Face 镜像 https://hf-mirror.com 后重试）'
                        : '';
                    const err = `${rawMsg}${hint}`;
                    emit({ phase: 'error', ok: false, message: err, pct: 0 });
                    return { ok: false, error: err, raw: res.data };
                }
                const results = Array.isArray(res.data?.results) ? res.data.results : [];
                doneIds.push(...results.filter((r) => r?.ok).map((r) => r.id).filter(Boolean));
            }

            if (sakuraIds.length) {
                const sakuraMt = require('./sakura-mt');
                for (let i = 0; i < sakuraIds.length; i += 1) {
                    if (signal.aborted) {
                        emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                        return { ok: false, cancelled: true, error: 'cancelled' };
                    }
                    const sid = sakuraIds[i];
                    const basePct = 85 + Math.round((i / Math.max(1, sakuraIds.length)) * 14);
                    emit({
                        phase: 'progress',
                        message: `下载 Sakura（${sid}）${i + 1}/${sakuraIds.length}…`,
                        pct: basePct,
                    });
                    const pull = await sakuraMt.pullSakuraModel({
                        modelId: sid,
                        force: !!payload.force,
                        signal,
                        onProgress: (p) => {
                            const pct = Number(p?.pct ?? p?.percent);
                            const downloadedBytes = Number(
                                p?.downloadedBytes ?? p?.received ?? p?.downloaded,
                            );
                            const totalBytes = Number(p?.totalBytes ?? p?.total);
                            const bytesPerSecond = Number(p?.bytesPerSecond ?? p?.speed);
                            emit({
                                phase: p?.phase === 'done' ? 'progress' : (p?.phase || 'progress'),
                                message: p?.message || `Sakura ${sid}`,
                                pct: Number.isFinite(pct)
                                    ? Math.min(99, basePct + Math.round(pct * 0.14 / sakuraIds.length))
                                    : undefined,
                                downloadedBytes: Number.isFinite(downloadedBytes) && downloadedBytes >= 0
                                    ? downloadedBytes
                                    : undefined,
                                totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
                                bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0
                                    ? bytesPerSecond
                                    : undefined,
                            });
                        },
                    });
                    if (!pull?.ok) {
                        const err = pull?.error || `Sakura ${sid} 下载失败`;
                        emit({ phase: 'error', ok: false, message: err, pct: 0 });
                        return { ok: false, error: err };
                    }
                    doneIds.push(sid);
                }
            }

            const message = `模型下载完成${doneIds.length ? `：${doneIds.join(', ')}` : ''}`;
            emit({ phase: 'done', ok: true, message, pct: 100 });
            return { ok: true, message, results: doneIds.map((id) => ({ id, ok: true })) };
        } catch (err) {
            const msg = err.message || String(err);
            emit({ phase: 'error', ok: false, message: msg, pct: 0 });
            return { ok: false, error: msg };
        } finally {
            downloadBusy = false;
            downloadAbort = null;
        }
    });

    register('transub-engine-generate-subtitles', async (event, payload = {}) => {
        try {
            const payloadOptions = payload.options || {};
            syncEngineSessionPostTask(payloadOptions);
            const options = await readMergedOptions(payloadOptions);
            return await runEngineBatch({
                items: payload.items || [],
                options,
                invokeSender: event.sender,
                minimizeToTray: !!payload.minimizeToTray,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-cancel', async () => {
        batchCancelled = true;
        abortBatchMtAdapter();
        if (opusTextAbortController) {
            try {
                opusTextAbortController.abort();
            } catch { /* ignore */ }
            opusTextAbortController = null;
        }
        const jobId = currentJobId;
        if (jobId && engineBaseUrl) {
            try {
                await cancelJob(engineBaseUrl, jobId);
            } catch { /* ignore */ }
        }
        // SenseVoice model.generate() / long MT ignore cooperative cancel.
        // Kill the managed engine process so waitJob unblocks immediately.
        if (engineProc) {
            try {
                stopEngineProcess();
                appendEngineLogLine('[engine] 取消：已停止引擎进程');
            } catch { /* ignore */ }
        } else {
            appendEngineLogLine('[engine] 已请求取消');
        }
        return { ok: true, cancelled: true };
    });

    register('transub-engine-open-latest-log', async () => {
        try {
            return openEngineLatestLog();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-download-info', async (_event, payload = {}) => {
        try {
            const options = await readMergedOptions(payload || {});
            return await buildEngineDownloadInfo({
                ...options,
                ...(payload || {}),
                profile: (payload && payload.profile) || options.engineProfile,
                hfEndpoint: payload && payload.hfEndpoint != null
                    ? payload.hfEndpoint
                    : options.engineHfEndpoint,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-open-manual-url', async (_event, payload = {}) => {
        try {
            const { shell } = require('electron');
            const url = String(payload.url || '').trim();
            if (!/^https?:\/\//i.test(url)) {
                return { ok: false, error: '无效链接' };
            }
            await shell.openExternal(url);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-open-download-folder', async (_event, payload = {}) => {
        try {
            const { shell } = require('electron');
            const options = await readMergedOptions(payload || {});
            const info = await buildEngineDownloadInfo({
                ...options,
                ...(payload || {}),
                profile: (payload && payload.profile) || options.engineProfile,
                hfEndpoint: payload && payload.hfEndpoint != null
                    ? payload.hfEndpoint
                    : options.engineHfEndpoint,
            });
            const folder = String(
                info?.info?.folder
                || getEngineModelsRoot(options.engineInstallPath || (payload && payload.engineInstallPath)),
            ).trim();
            fs.mkdirSync(folder, { recursive: true });
            const err = await shell.openPath(folder);
            if (err) return { ok: false, error: err };
            return { ok: true, path: folder };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-pick-whl', async (event, payload = {}) => {
        try {
            const { BrowserWindow, dialog } = require('electron');
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win && !win.isDestroyed()) {
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
            }
            const result = await dialog.showOpenDialog(win || undefined, {
                title: String(payload.title || '选择已下载的 .whl 文件（可多选）'),
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: 'Python Wheel (*.whl)', extensions: ['whl'] },
                    { name: '所有文件', extensions: ['*'] },
                ],
                defaultPath: String(payload.defaultPath || '').trim() || undefined,
            });
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true, paths: [] };
            }
            const checked = validateWhlFiles(result.filePaths);
            if (!checked.ok) return checked;
            return { ok: true, canceled: false, paths: checked.paths };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-engine-install-local-wheels', async (_event, payload = {}) => {
        if (batchRunning) {
            return { ok: false, error: '字幕任务进行中，请先停止任务再安装组件' };
        }
        if (downloadBusy) {
            return { ok: false, error: '已有下载/安装任务正在进行' };
        }
        const kind = normalizeEngineDownloadKind(payload.kind || 'gpu');
        const checked = validateWhlFiles(payload.paths || payload.wheelPaths || []);
        if (!checked.ok) return checked;

        downloadBusy = true;
        downloadAbort = new AbortController();
        const signal = downloadAbort.signal;
        const emit = (info) => {
            broadcastEngineDownloadProgress({ ...(info || {}), kind, source: 'local-whl' });
        };

        try {
            const options = await readMergedOptions(payload);
            const installPath = resolveEngineInstallPath(options.engineInstallPath);
            const pythonPath = resolveEngineRuntimePython(installPath);
            if (!pythonPath) {
                const err = '找不到引擎 Python（请确认引擎目录含 runtime\\python.exe）';
                emit({ phase: 'error', ok: false, message: err, pct: 0 });
                return { ok: false, error: err };
            }

            if (engineProc) {
                emit({ phase: 'progress', message: '正在停止引擎以便安装…', pct: 2 });
                stopEngineProcess();
                await sleep(600);
            }

            // onnxruntime (CPU) and onnxruntime-gpu are mutually exclusive.
            const hasOrtGpuWhl = checked.paths.some((p) => /onnxruntime[_-]gpu/i.test(path.basename(p)));
            if (hasOrtGpuWhl) {
                emit({
                    phase: 'progress',
                    message: '正在卸载 CPU 版 onnxruntime（与 GPU 版互斥）…',
                    pct: 5,
                });
                try {
                    await new Promise((resolve) => {
                        const child = spawn(
                            pythonPath,
                            ['-m', 'pip', 'uninstall', '-y', 'onnxruntime'],
                            { windowsHide: true, stdio: 'ignore' },
                        );
                        const t = setTimeout(() => {
                            try { child.kill(); } catch (_) { /* ignore */ }
                            resolve();
                        }, 60_000);
                        child.on('close', () => {
                            clearTimeout(t);
                            resolve();
                        });
                        child.on('error', () => {
                            clearTimeout(t);
                            resolve();
                        });
                    });
                } catch (_) { /* ignore */ }
            }

            emit({
                phase: 'progress',
                message: `正在本地安装 ${checked.paths.length} 个 wheel…`,
                pct: 8,
            });

            const res = await installLocalWheels({
                pythonPath,
                wheelPaths: checked.paths,
                signal,
                onProgress: (ev) => {
                    const pct = Number(ev.percent);
                    emit({
                        phase: ev.type === 'done' ? 'progress' : (ev.type === 'error' ? 'error' : 'progress'),
                        message: ev.detail || ev.message || '安装中…',
                        pct: Number.isFinite(pct) ? Math.min(88, pct) : undefined,
                        raw: ev,
                    });
                },
            });

            if (res.cancelled || signal.aborted) {
                emit({ phase: 'cancelled', ok: false, message: '已取消', pct: 0 });
                return { ok: false, cancelled: true, error: 'cancelled' };
            }
            if (!res.ok) {
                const err = res.error || '本地安装失败';
                emit({ phase: 'error', ok: false, message: err, pct: 0 });
                return { ok: false, error: err, logTail: res.logTail };
            }

            emit({ phase: 'progress', message: '正在重启引擎…', pct: 92 });
            const ensure2 = await ensureEngineRunning({ ...options, forceRestart: true });
            if (!ensure2.ok) {
                const msg = '本地 wheel 已安装（引擎重启失败，请手动检测引擎）';
                emit({ phase: 'done', ok: true, message: msg, pct: 100 });
                return {
                    ok: true,
                    restarted: false,
                    message: msg,
                    installed: res.installed,
                    kind,
                };
            }

            let message = `本地安装完成（${(res.installed || []).join(', ')}）`;
            let probe = null;
            try {
                if (kind === 'demucs') {
                    const statusRes = await getAudioSeparateRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                    probe = statusRes.data || null;
                    message = statusRes.data?.hint || message;
                } else if (kind === 'gpu') {
                    const statusRes = await getGpuRuntime(ensure2.baseUrl, { timeoutMs: 20000 });
                    probe = statusRes.data || null;
                    message = statusRes.data?.hint || message;
                }
            } catch (_) { /* ignore probe errors */ }

            emit({ phase: 'done', ok: true, message, pct: 100 });
            return {
                ok: true,
                restarted: true,
                message,
                installed: res.installed,
                kind,
                probe,
            };
        } catch (err) {
            const msg = err.message || String(err);
            emit({ phase: 'error', ok: false, message: msg, pct: 0 });
            return { ok: false, error: msg };
        } finally {
            downloadBusy = false;
            downloadAbort = null;
        }
    });

    register('transub-engine-get-log-path', async () => ({
        ok: true,
        path: getEngineLogPath(),
        exists: fs.existsSync(getEngineLogPath()),
    }));

    register('transub-engine-save-options', async (_event, payload = {}) => {
        try {
            const current = loadSettings(() => getAppRoot()).options || {};
            const next = mergeTransWithAiOptions(mergeEngineOptions({
                ...current,
                ...stripPostTaskFields(payload || {}),
            }));
            saveSettings(() => getAppRoot(), next);
            return { ok: true, options: next };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-generate-subtitles', async (event, payload = {}) => {
        const payloadOptions = payload.options || {};
        syncEngineSessionPostTask(payloadOptions);
        const options = await readMergedOptions(payloadOptions);
        if (options.engineBackend === 'twai') {
            return { ok: false, error: '请使用 TransWithAI 生成通道（engineBackend=twai）' };
        }
        return runEngineBatch({
            items: payload.items || [],
            options,
            invokeSender: event.sender,
            minimizeToTray: !!payload.minimizeToTray,
        });
    });

    register('transub-transcribe-range', async (event, payload = {}) => {
        const options = await readMergedOptions(payload.options || {});
        if (options.engineBackend === 'twai') {
            deferredEnsureTwai();
            const { transcribeMediaRange } = require('./transwithai-bridge');
            return transcribeMediaRange(payload || {}, {
                getUserDataPath: () => require('./app-paths').getWritableRoot(),
                getAppRoot,
                onProgress: (progress) => {
                    try {
                        if (!event?.sender?.isDestroyed?.()) {
                            event.sender.send('transub-retranscribe-progress', progress);
                        }
                    } catch (_) { /* ignore */ }
                },
            });
        }
        return transcribeRangeWithEngine(payload || {}, {
            options,
            onProgress: (progress) => {
                try {
                    if (!event?.sender?.isDestroyed?.()) {
                        event.sender.send('transub-retranscribe-progress', progress);
                    }
                } catch (_) { /* ignore */ }
            },
        });
    });

    // Defer Sakura IPC module load until first sakura-* call (editor path).
    let sakuraHandlers = null;
    const ensureSakuraHandlers = () => {
        if (sakuraHandlers) return sakuraHandlers;
        const captured = new Map();
        const { setupSakuraTranslateBridge } = require('./sakura-translate');
        setupSakuraTranslateBridge({
            register(channel, handler) {
                captured.set(channel, handler);
            },
        });
        sakuraHandlers = captured;
        return sakuraHandlers;
    };
    for (const channel of [
        'transub-sakura-status',
        'transub-sakura-translate',
        'transub-sakura-cancel-translate',
    ]) {
        register(channel, async (event, payload) => {
            const handler = ensureSakuraHandlers().get(channel);
            if (typeof handler !== 'function') {
                throw new Error(`[engine] sakura channel missing: ${channel}`);
            }
            return handler(event, payload);
        });
    }
}

function deferredEnsureTwai() {
    // TWAI handlers may not be loaded yet when range is routed via engine bridge
    try {
        if (typeof ensureBridgeFn === 'function') {
            ensureBridgeFn('transwithai');
        } else {
            require('./transwithai-bridge');
        }
    } catch { /* ignore */ }
}

/**
 * Text-only Opus MT for editor / cue arrays (no media ASR).
 * @param {{ cues: Array, language?: string, mtModel?: string, glossary?: object, fileName?: string }} payload
 * @param {{ onProgress?: Function, options?: object }} [deps]
 */
async function translateCuesWithEngineOpus(payload = {}, deps = {}) {
    const onProgress = typeof deps.onProgress === 'function' ? deps.onProgress : null;
    const saved = (() => {
        try {
            return loadSettings(() => {
                try {
                    const { getAppRoot } = require('./app-paths');
                    return getAppRoot();
                } catch {
                    return process.cwd();
                }
            }).options || {};
        } catch {
            return {};
        }
    })();
    const options = mergeEngineOptions({
        ...stripPostTaskFields(saved),
        ...stripPostTaskFields(deps.options || payload.options || {}),
        ...(payload.options && typeof payload.options === 'object' ? payload.options : {}),
    });
    options.engineInstallPath = resolveEngineInstallPath(options.engineInstallPath);
    const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
    const cuesIn = Array.isArray(payload.cues) ? payload.cues : [];
    const normalized = cuesIn
        .map((c, i) => {
            const index = Number.isInteger(Number(c?.index)) ? Number(c.index)
                : (Number.isInteger(Number(c?.id)) ? Number(c.id) : i);
            const text = String(c?.text ?? '').trim();
            const startMs = Number(c?.startMs);
            const endMs = Number(c?.endMs);
            const start = Number.isFinite(startMs) ? startMs / 1000
                : (Number.isFinite(Number(c?.start)) ? Number(c.start) : index);
            const end = Number.isFinite(endMs) ? endMs / 1000
                : (Number.isFinite(Number(c?.end)) ? Number(c.end) : start + 1);
            return { index, id: index, text, start, end };
        })
        .filter((c) => c.text);
    if (!normalized.length) {
        return { ok: false, error: '没有可翻译的字幕', code: 'empty_cues' };
    }

    let mtModel = String(
        payload.mtModel
        || options.engineOpusMtModel
        || options.engineMtModel
        || '',
    ).trim();
    if (sakuraCatalog.isSakuraMtModel(mtModel) || sakuraCatalog.isLlmInferenceMtModel?.(mtModel)) {
        mtModel = String(options.engineOpusMtModel || '').trim();
    }

    const language = String(payload.language || options.language || 'ja').trim() || 'ja';
    if (opusTextAbortController) {
        try {
            opusTextAbortController.abort();
        } catch { /* ignore */ }
    }
    opusTextAbortController = new AbortController();
    const signal = opusTextAbortController.signal;
    const computeLock = require('./compute-task-lock');
    try {
        return await computeLock.runWithComputeLock({
            kind: 'engine_opus_text',
            owner: '字幕编辑器',
            source: 'translateCuesWithEngineOpus',
        }, async () => {
            onProgress?.({
                phase: 'start',
                message: '正在启动引擎机器翻译…',
                pct: 2,
                cueTotal: normalized.length,
            });
            const ensure = await ensureEngineRunning(options);
            if (!ensure.ok) return ensure;
            if (signal.aborted) {
                return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
            }

            const CHUNK = 64;
            const outByIndex = new Map();
            const sourceForSanitize = normalized.map((c) => ({
                index: c.index,
                text: c.text,
            }));
            for (let offset = 0; offset < normalized.length; offset += CHUNK) {
                if (signal.aborted) {
                    return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                }
                const chunk = normalized.slice(offset, offset + CHUNK);
                onProgress?.({
                    phase: 'chunk',
                    chunk: Math.floor(offset / CHUNK) + 1,
                    total: Math.ceil(normalized.length / CHUNK),
                    message: `机器翻译 ${offset + 1}–${offset + chunk.length}/${normalized.length}`,
                    pct: Math.round((offset / Math.max(1, normalized.length)) * 90) + 5,
                    cueTotal: normalized.length,
                });
                let res;
                try {
                    res = await translateCuesMt(ensure.baseUrl, {
                        cues: chunk.map((c) => ({
                            id: c.id,
                            text: c.text,
                            start: c.start,
                            end: c.end,
                        })),
                        language,
                        targetLanguage: 'zh',
                        mtModel: mtModel || null,
                        device: options.device || 'auto',
                    }, { signal });
                } catch (err) {
                    if (signal.aborted || err?.name === 'AbortError') {
                        return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                    }
                    throw err;
                }
                if (signal.aborted) {
                    return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                }
                if (!res.ok) {
                    if (res.cancelled || res.code === 'cancelled') {
                        return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                    }
                    if (res.code === 'timeout') {
                        return {
                            ok: false,
                            code: 'timeout',
                            error: res.error || '请求超时',
                            status: res.status,
                        };
                    }
                    return {
                        ok: false,
                        error: friendlyEngineError(
                            res.error || res.data?.message || res.data?.error
                            || `机器翻译失败 (HTTP ${res.status || 0})`,
                        ),
                        code: res.code || res.data?.code,
                        status: res.status,
                    };
                }
                for (const u of res.data?.cues || []) {
                    const idx = Number(u?.id);
                    if (!Number.isInteger(idx)) continue;
                    outByIndex.set(idx, String(u?.text ?? ''));
                }
            }

            const outRaw = normalized.map((c) => ({
                index: c.index,
                text: outByIndex.has(c.index) ? outByIndex.get(c.index) : '',
            }));
            let cleaned = { cues: outRaw, changed: 0, flags: {} };
            try {
                const mtSanitize = require('../src/js/mt-sanitize-core');
                cleaned = mtSanitize.sanitizeMtCues(outRaw, sourceForSanitize, {
                    glossary: payload.glossary || null,
                    unifyNames: true,
                });
            } catch (_) { /* ignore */ }

            onProgress?.({
                phase: 'done',
                message: `机器翻译完成，共 ${cleaned.cues.length} 条`,
                pct: 100,
                cueTotal: cleaned.cues.length,
            });
            return {
                ok: true,
                cues: cleaned.cues,
                summary: `机器翻译完成，共 ${cleaned.cues.length} 条`
                    + (cleaned.changed ? `（清理 ${cleaned.changed}）` : ''),
                via: 'engine-opus',
                stats: {
                    cues: cleaned.cues.length,
                    sanitized: cleaned.changed,
                    mtModel: mtModel || 'auto',
                },
            };
        });
    } finally {
        if (opusTextAbortController && opusTextAbortController.signal === signal) {
            opusTextAbortController = null;
        }
    }
}

async function transcribeRangeWithEngine(payload = {}, deps = {}) {
    const os = require('os');
    const mediaPath = path.resolve(String(payload.mediaPath || payload.videoPath || ''));
    const startMs = Math.max(0, Math.round(Number(payload.startMs) || 0));
    const endMs = Math.max(startMs + 200, Math.round(Number(payload.endMs) || 0));
    const padMs = Math.max(0, Math.min(2000, Math.round(Number(payload.padMs) || 350)));
    const onProgress = typeof deps.onProgress === 'function' ? deps.onProgress : null;
    const options = mergeEngineOptions(deps.options || {});

    if (!mediaPath || !fs.existsSync(mediaPath)) {
        return { ok: false, error: '媒体文件不存在' };
    }
    if (endMs - startMs < 200) {
        return { ok: false, error: '字幕时间范围过短，无法重转写' };
    }
    if (batchRunning) {
        return { ok: false, error: '已有字幕任务正在运行，请稍后再试', code: 'compute_busy' };
    }

    const computeLock = require('./compute-task-lock');
    return computeLock.runWithComputeLock({
        kind: 'engine_range',
        owner: '字幕编辑器',
        source: 'transcribeRangeWithEngine',
    }, async () => {
        const ensure = await ensureEngineRunning(options);
        if (!ensure.ok) return ensure;

        const clipStartMs = Math.max(0, startMs - padMs);
        const clipEndMs = endMs + padMs;
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-engine-re-'));
        const clipPath = path.join(tempRoot, 'clip.wav');
        const outputDir = path.join(tempRoot, 'out');
        fs.mkdirSync(outputDir, { recursive: true });

        try {
            batchCancelled = false;
            onProgress?.({ stage: 'extract', detail: '截取音频片段' });
            const { extractMediaRange } = require('./ffmpeg-bridge');
            const clip = await extractMediaRange(mediaPath, clipStartMs, clipEndMs, clipPath, {
                ffmpegPath: options.ffmpegPath || payload.ffmpegPath,
            });
            if (!clip.ok) {
                return {
                    ok: false,
                    cancelled: !!clip.cancelled || batchCancelled,
                    error: friendlyEngineError(clip.error || '截取音频失败'),
                };
            }
            if (batchCancelled) {
                return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
            }

            const task = mapTaskToEngineTask(
                payload.options?.task === 'translate' ? 'translate' : 'transcribe',
                { smartTranslate: false },
            );
            // Never pass Sakura/smart ids as native Engine Opus mtModel.
            const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
            let mtModel = options.engineMtModel || null;
            if (
                options.smartTranslate
                || sakuraCatalog.isSakuraMtModel(mtModel)
                || sakuraCatalog.isLlmInferenceMtModel?.(mtModel)
                || sakuraCatalog.isSakuraMtModel(options.engineLlmMtModel)
                || sakuraCatalog.isLlmInferenceMtModel?.(options.engineLlmMtModel)
            ) {
                mtModel = String(options.engineOpusMtModel || '').trim() || null;
            }

            const primaryAsr = String(
                payload.asrModel || options.engineAsrModel || 'sensevoice-small',
            ).trim() || 'sensevoice-small';
            const isSenseVoice = /sensevoice/i.test(primaryAsr);
            // SenseVoice 对短窗/AV 常空：有必要时再换 Whisper 试一次（未安装则原样失败）
            const asrCandidates = isSenseVoice
                ? [primaryAsr, 'whisper-tiny', 'whisper-large-v3-turbo']
                : [primaryAsr];

            const isEmptyAsrFail = (res) => {
                const code = String(res?.code || '');
                const msg = String(res?.error || '');
                return code === 'ASR_EMPTY'
                    || /未识别到有效字幕|重转写结果为空|结果为空/i.test(msg);
            };
            const isRetryableAsrFail = (res) => {
                if (isEmptyAsrFail(res)) return true;
                const msg = String(res?.error || '');
                // Fallback model missing → try next candidate
                return /not installed|未安装|model not found|找不到.*模型/i.test(msg);
            };

            const runAsrOnce = async (asrModel) => {
                onProgress?.({
                    stage: 'transcribe',
                    detail: asrModel === primaryAsr
                        ? '引擎推理中'
                        : `${primaryAsr} 无结果，改用 ${asrModel}…`,
                });
                const created = await createJob(ensure.baseUrl, {
                    task,
                    mediaPath: clipPath,
                    outputDir,
                    language: options.language || 'auto',
                    asrModel,
                    mtModel,
                    subFormats: ['srt'],
                    device: mapDeviceForEngine(options.device),
                    beamSize: Math.max(1, Math.min(20, Number(options.beamSize) || 5)),
                    vad: buildVadJobOptions(options),
                    // Short editor clips: keep VAD/denoise, skip Demucs (too heavy for range retranscribe)
                    audio: buildAudioJobOptions({
                        audioLightDenoise: options.audioLightDenoise,
                        filmAudioEnhance: false,
                        filmVadPreset: false,
                    }, { entitled: false }),
                    contentProfile: options.contentProfile || options.senseProfile || undefined,
                    senseProfile: options.senseProfile || options.contentProfile || undefined,
                    ...(options.timingAlign != null
                        ? { timingAlign: options.timingAlign }
                        : {}),
                    ...(options.timingAlignModel != null
                        && String(options.timingAlignModel).trim() !== ''
                        ? { timingAlignModel: String(options.timingAlignModel).trim() }
                        : {}),
                    castNames: options.castNames || options.cast_names || undefined,
                    releaseGpuAfter: true,
                    sync: false,
                }, { timeoutMs: 600000 });
                if (!created.ok || !created.data?.id) {
                    return {
                        ok: false,
                        cancelled: !!created.cancelled,
                        error: friendlyEngineError(
                            created.error || created.data?.message || created.data?.error || '创建引擎任务失败',
                        ),
                        code: created.code,
                    };
                }
                // Track job so Esc → transub-engine-cancel can cancelJob(currentJobId).
                currentJobId = created.data.id;
                const waited = await waitJob(ensure.baseUrl, created.data.id, {
                    shouldStop: () => batchCancelled,
                });
                currentJobId = '';
                if (!waited.ok) {
                    const errMsg = waited.error || waited.data?.error?.message || '引擎任务失败';
                    const errCode = waited.data?.error?.code
                        || ((waited.cancelled || batchCancelled) ? 'cancelled' : undefined);
                    return {
                        ok: false,
                        cancelled: !!waited.cancelled || batchCancelled,
                        error: friendlyEngineError(errMsg),
                        code: errCode,
                    };
                }
                const outputs = waited.data?.result?.outputs || [];
                const outPath = outputs[0]?.path || '';
                if (!outPath || !fs.existsSync(outPath)) {
                    return { ok: false, error: '重转写未生成字幕文件', code: 'ASR_EMPTY' };
                }
                const raw = fs.readFileSync(outPath, 'utf8');
                const { parseSubtitle } = require('./subtitle-format');
                const parsed = parseSubtitle(raw, 'srt');
                const cues = (parsed.cues || []).map((cue) => ({
                    startMs: Math.max(0, Math.round(Number(cue.startMs) || 0) + clipStartMs),
                    endMs: Math.max(
                        0,
                        Math.round((cue.endMs != null ? cue.endMs : (Number(cue.startMs) || 0) + 1000) + clipStartMs),
                    ),
                    text: String(cue.text || '').trim(),
                })).filter((cue) => cue.text);
                if (!cues.length) {
                    return { ok: false, error: '重转写结果为空', code: 'ASR_EMPTY' };
                }
                onProgress?.({ stage: 'done', detail: '重转写完成' });
                return {
                    ok: true,
                    cues,
                    clipStartMs,
                    clipEndMs,
                    padMs,
                    sourceStartMs: startMs,
                    sourceEndMs: endMs,
                    result: waited.data?.result,
                    task,
                    asrModel,
                };
            };

            let lastFail = null;
            for (let i = 0; i < asrCandidates.length; i += 1) {
                const asrModel = asrCandidates[i];
                if (batchCancelled) {
                    return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                }
                // Avoid reusing stale SRT from a previous empty attempt
                try {
                    for (const name of fs.readdirSync(outputDir)) {
                        fs.rmSync(path.join(outputDir, name), { force: true });
                    }
                } catch { /* ignore */ }
                const outcome = await runAsrOnce(asrModel);
                if (outcome.ok) return outcome;
                lastFail = outcome;
                if (outcome.cancelled) return outcome;
                // Empty SenseVoice / missing Whisper → try next ASR candidate
                if (!isRetryableAsrFail(outcome)) return outcome;
                if (i < asrCandidates.length - 1) {
                    try {
                        console.warn(
                            `[engine] 局部重转写 ${asrModel} 未成功（${outcome.error || 'unknown'}），尝试 ${asrCandidates[i + 1]}`,
                        );
                    } catch { /* ignore */ }
                }
            }
            return lastFail || { ok: false, error: '重转写结果为空', code: 'ASR_EMPTY' };
        } catch (err) {
            return {
                ok: false,
                cancelled: err?.name === 'AbortError' || err?.code === 'cancelled' || batchCancelled,
                error: friendlyEngineError(err?.message || String(err)),
                code: (err?.name === 'AbortError' || batchCancelled) ? 'cancelled' : err?.code,
            };
        } finally {
            currentJobId = '';
            try {
                fs.rmSync(tempRoot, { recursive: true, force: true });
            } catch { /* ignore */ }
        }
    });
}

function stopEngineJobs() {
    batchCancelled = true;
    abortBatchMtAdapter();
    const jobId = currentJobId;
    if (jobId && engineBaseUrl) {
        cancelJob(engineBaseUrl, jobId).catch(() => {});
    }
    try {
        stopEngineProcessAndPort();
    } catch { /* ignore */ }
    stopLlamaServerQuiet();
}

function setupComputeTaskStatusIpc(register) {
    if (typeof register !== 'function') return;
    register('transub-compute-task-status', async () => {
        const computeLock = require('./compute-task-lock');
        return { ok: true, ...computeLock.getStatus() };
    });
}

module.exports = {
    setupEngineBridge,
    ensureEngineRunning,
    runEngineBatch,
    stopEngineJobs,
    stopEngineProcess,
    translateCuesWithEngineOpus,
    transcribeRangeWithEngine,
    resolveEngineEntrypoints,
    resolveEngineInstallPath,
    getBundledEnginePath,
    appendEngineLogLine,
};
