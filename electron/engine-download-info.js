/**
 * Engine Hub / GPU / runtime package catalogs and download-info builders.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveEngineRuntimePython } = require('./engine-runtime-env');
const {
    buildHubUrls: defaultBuildHubUrls,
    normalizeHfEndpoint: defaultNormalizeHfEndpoint,
} = require('./engine-download-urls');

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
    'whisper-large-v2': {
        hubId: 'Systran/faster-whisper-large-v2',
        kind: 'asr',
        name: 'Whisper large-v2',
        note: '可选 · 经典 large-v2 CT2；多语种高质量识别（非默认安装）',
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
        note: 'kotoba-v2.0 动画演技微调；软声听写更稳；引擎自动禁 prompt 并分窗转写（避免全片崩溃）',
    },
    'kotoba-whisper-v2.0-faster': {
        hubId: 'kotoba-tech/kotoba-whisper-v2.0-faster',
        kind: 'asr',
        name: 'Kotoba Whisper v2.0（日语）',
        note: 'kotoba 日语蒸馏 Whisper；通用日语、段级时间戳可用；偏广播域，非软声特化',
    },
    'reazonspeech-k2': {
        hubId: 'reazon-research/reazonspeech-k2-v2',
        kind: 'asr',
        name: 'ReazonSpeech K2（日语）',
        note: 'Zipformer/sherpa-onnx；自带 subword 时间戳；≤25s 分窗；偏广播域',
    },
    'parakeet-tdt-ctc-0.6b-ja': {
        hubId: 'nvidia/parakeet-tdt_ctc-0.6b-ja',
        kind: 'asr',
        name: 'Parakeet TDT-CTC 0.6B（日语）',
        note: 'NVIDIA NeMo 日语 ASR；带标点；按需安装 nemo_toolkit；长片分窗',
    },
    'parakeet-tdt-0.6b-v2': {
        hubId: 'nvidia/parakeet-tdt-0.6b-v2',
        kind: 'asr',
        name: 'Parakeet TDT 0.6B v2（英语）',
        note: 'NVIDIA NeMo 英语 ASR；标点/大小写/词级时间戳；OpenASR 前列',
    },
    'parakeet-tdt-0.6b-v3': {
        hubId: 'nvidia/parakeet-tdt-0.6b-v3',
        kind: 'asr',
        name: 'Parakeet TDT 0.6B v3（欧语多语）',
        note: '25 种欧语自动检测；标点/大小写/时间戳；不含中日韩',
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
        id: 'scipy',
        name: 'SciPy（funasr / librosa 依赖）',
        fileName: 'scipy-1.15.3-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/e6/eb/3bf6ea8ab7f1503dca3a10df2e4b9c3f6b3316df07f6c0ded94b281c7101/scipy-1.15.3-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/e6/eb/3bf6ea8ab7f1503dca3a10df2e4b9c3f6b3316df07f6c0ded94b281c7101/scipy-1.15.3-cp312-cp312-win_amd64.whl',
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

function manualPlaceHintForModel(spec = {}) {
    const mid = String(spec.id || '').toLowerCase();
    const kindName = String(spec.kind || '').toLowerCase();
    const be = String(spec.backend || '').toLowerCase();
    let weightFile = '模型权重文件';
    if (
        be.includes('whisper')
        || mid.includes('whisper')
        || mid === 'anime-whisper'
        || mid.startsWith('kotoba-')
    ) {
        weightFile = 'model.bin';
    } else if (be === 'reazon-k2' || mid.includes('reazon')) {
        weightFile = 'encoder-*.onnx 与 tokens.txt';
    } else if (be.includes('qwen') || mid.includes('qwen3')) {
        weightFile = 'model.safetensors（或分片）';
    } else if (be.includes('whisperseg') || mid.includes('whisperseg')) {
        weightFile = 'model.onnx';
    } else if (kindName === 'mt' || be.includes('opus') || be.includes('marian')) {
        weightFile = 'pytorch_model.bin 或 model.safetensors';
    } else if (
        kindName === 'vad'
        || mid.includes('sensevoice')
        || mid.includes('fsmn')
        || be.includes('sensevoice')
        || be.includes('fsmn')
    ) {
        weightFile = 'model.pt';
    } else if (kindName === 'asr') {
        weightFile = 'model.pt 或 model.bin';
    }
    return {
        weightFile,
        placeSteps: [
            '在打开的仓库页下载全部文件（可用「下载整个仓库」或逐个下载）',
            '将文件直接放入下方目录（不要再套一层同名文件夹）',
            `确认关键权重「${weightFile}」为完整文件（不能是几十字节的 LFS 指针）`,
        ].join('\n'),
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

async function buildEngineDownloadInfo(payload = {}, deps = {}) {
    const mergeEngineOptions = deps.mergeEngineOptions;
    const resolveEngineInstallPath = deps.resolveEngineInstallPath;
    const ensureEngineRunning = deps.ensureEngineRunning;
    const listModels = deps.listModels;
    const buildHubUrls = deps.buildHubUrls;
    const normalizeHfEndpoint = deps.normalizeHfEndpoint;
    if (typeof mergeEngineOptions !== 'function' || typeof resolveEngineInstallPath !== 'function') {
        throw new Error('buildEngineDownloadInfo: mergeEngineOptions/resolveEngineInstallPath required');
    }
    if (typeof ensureEngineRunning !== 'function' || typeof listModels !== 'function') {
        throw new Error('buildEngineDownloadInfo: ensureEngineRunning/listModels required');
    }
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
                wheelHint: '请先装 numpy 2.4.x 与 numba/llvmlite/scipy，再装 torch / torchaudio / funasr。可多选后一次安装。',
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
        const backend = String(live.backend || fallback.backend || '').trim();
        const place = manualPlaceHintForModel({ id, kind: kindName, backend });
        const sizeHint = Number(live.size_hint_mb) > 0
            ? `约 ${live.size_hint_mb} MB`
            : (fallback.sizeHint || '');
        return {
            id,
            name,
            kind: kindName,
            hubId,
            backend,
            bundled: !hubId,
            officialUrl: urls.officialUrl,
            mirrorUrl: urls.mirrorUrl,
            defaultUrl: urls.mirrorUrl || urls.officialUrl,
            localDir,
            folder: localDir,
            sizeHint,
            weightFile: place.weightFile,
            placeSteps: place.placeSteps,
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
            hint: '勾选需要的模型后点「开始下载」。Opus/ASR/VAD 走引擎 Hub；Sakura 走本地 GGUF（含 llama-server）。网络不佳时可在卡片上「手动下载」。',
            catalog,
            selectedIds: catalog.filter((c) => c.selected).map((c) => c.id),
            items,
        },
    };
}


async function buildEngineDownloadInfoWrapped(payload = {}, deps = {}) {
    return buildEngineDownloadInfo(payload, {
        buildHubUrls: deps.buildHubUrls || defaultBuildHubUrls,
        normalizeHfEndpoint: deps.normalizeHfEndpoint || defaultNormalizeHfEndpoint,
        ...deps,
    });
}

module.exports = {
    ENGINE_MODEL_HUB_FALLBACK,
    ENGINE_PROFILE_MODELS,
    GPU_MANUAL_PACKAGES,
    ORT_GPU_MANUAL_PACKAGES,
    SENSEVOICE_MANUAL_PACKAGES,
    WHISPER_MANUAL_PACKAGES,
    detectDriverCudaMajorQuick,
    resolveOrtGpuManualPackage,
    mapGpuManualItem,
    getEngineModelsRoot,
    uniqueIds,
    resolveDownloadModelIds,
    manualPlaceHintForModel,
    normalizeEngineDownloadKind,
    buildEngineDownloadInfo: buildEngineDownloadInfoWrapped,
};
