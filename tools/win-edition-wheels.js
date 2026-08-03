/**
 * First-install edition wheel pins (CPU / CUDA).
 * Keep aligned with electron/engine-bridge.js manual package lists.
 */
'use strict';

/** @typedef {{ id: string, fileName: string, officialUrl: string, mirrorUrl: string }} WheelSpec */

/** @type {WheelSpec[]} */
const WHISPER_CPU_WHEELS = [
    {
        id: 'numpy',
        fileName: 'numpy-2.4.6-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/ab/ca/feab00bd44aa5fe1ad2c18f08b4d3bb92e26484b0b1d1443897809ed528c/numpy-2.4.6-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/ab/ca/feab00bd44aa5fe1ad2c18f08b4d3bb92e26484b0b1d1443897809ed528c/numpy-2.4.6-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'ctranslate2',
        fileName: 'ctranslate2-4.8.1-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/c0/82/0a5f7f2b03b4e10aacb3146715724e1b96bb993cc7d199be28c9825aa120/ctranslate2-4.8.1-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/c0/82/0a5f7f2b03b4e10aacb3146715724e1b96bb993cc7d199be28c9825aa120/ctranslate2-4.8.1-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'onnxruntime',
        fileName: 'onnxruntime-1.21.1-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/5f/9d/fb8895b2cb38c9965d4b4e0a9aa1398f3e3f16c4acb75cf3b61689780a65/onnxruntime-1.21.1-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/5f/9d/fb8895b2cb38c9965d4b4e0a9aa1398f3e3f16c4acb75cf3b61689780a65/onnxruntime-1.21.1-cp312-cp312-win_amd64.whl',
    },
];

/** @type {WheelSpec[]} */
const SENSEVOICE_CPU_WHEELS = [
    {
        id: 'numba',
        fileName: 'numba-0.66.0-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/fc/eb/9e6171e378822ab191c7abcfd3d8cfc8644516f6c7834c22e210e4acc070/numba-0.66.0-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/fc/eb/9e6171e378822ab191c7abcfd3d8cfc8644516f6c7834c22e210e4acc070/numba-0.66.0-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'llvmlite',
        fileName: 'llvmlite-0.48.0-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/16/78/d824ffff7521cd140dc2006e44ce2bc82e64b48d1b32e90e956308c85a74/llvmlite-0.48.0-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/16/78/d824ffff7521cd140dc2006e44ce2bc82e64b48d1b32e90e956308c85a74/llvmlite-0.48.0-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'torch',
        fileName: 'torch-2.9.1-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/b1/1a/64f5769025db846a82567fa5b7d21dba4558a7234ee631712ee4771c436c/torch-2.9.1-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/b1/1a/64f5769025db846a82567fa5b7d21dba4558a7234ee631712ee4771c436c/torch-2.9.1-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'torchaudio',
        fileName: 'torchaudio-2.9.1-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/2e/7c/df90eb0b337cbad59296ed91778e32be069330f5186256d4ce9ea603d324/torchaudio-2.9.1-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/2e/7c/df90eb0b337cbad59296ed91778e32be069330f5186256d4ce9ea603d324/torchaudio-2.9.1-cp312-cp312-win_amd64.whl',
    },
];

/** @type {WheelSpec[]} */
const NVIDIA_CU12_WHEELS = [
    {
        id: 'nvidia-cublas-cu12',
        fileName: 'nvidia_cublas_cu12-12.9.2.10-py3-none-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/20/e2/fc9a0e985249d873150276d5afb02e39a66817fedbf1a385724393e505ed/nvidia_cublas_cu12-12.9.2.10-py3-none-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/20/e2/fc9a0e985249d873150276d5afb02e39a66817fedbf1a385724393e505ed/nvidia_cublas_cu12-12.9.2.10-py3-none-win_amd64.whl',
    },
    {
        id: 'nvidia-cuda-runtime-cu12',
        fileName: 'nvidia_cuda_runtime_cu12-12.9.79-py3-none-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/59/df/e7c3a360be4f7b93cee39271b792669baeb3846c58a4df6dfcf187a7ffab/nvidia_cuda_runtime_cu12-12.9.79-py3-none-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/59/df/e7c3a360be4f7b93cee39271b792669baeb3846c58a4df6dfcf187a7ffab/nvidia_cuda_runtime_cu12-12.9.79-py3-none-win_amd64.whl',
    },
    {
        id: 'nvidia-cudnn-cu12',
        fileName: 'nvidia_cudnn_cu12-9.9.0.52-py3-none-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/6f/5c/f77147ce7e27a4e9087fb34b0539ff085c68e7093e96ee85576fe31fe064/nvidia_cudnn_cu12-9.9.0.52-py3-none-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/6f/5c/f77147ce7e27a4e9087fb34b0539ff085c68e7093e96ee85576fe31fe064/nvidia_cudnn_cu12-9.9.0.52-py3-none-win_amd64.whl',
    },
    {
        id: 'nvidia-cufft-cu12',
        fileName: 'nvidia_cufft_cu12-11.4.1.4-py3-none-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/20/ee/29955203338515b940bd4f60ffdbc073428f25ef9bfbce44c9a066aedc5c/nvidia_cufft_cu12-11.4.1.4-py3-none-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/20/ee/29955203338515b940bd4f60ffdbc073428f25ef9bfbce44c9a066aedc5c/nvidia_cufft_cu12-11.4.1.4-py3-none-win_amd64.whl',
    },
    {
        id: 'nvidia-curand-cu12',
        fileName: 'nvidia_curand_cu12-10.3.9.90-py3-none-win_amd64.whl',
        officialUrl: 'https://files.pythonhosted.org/packages/b9/75/70c05b2f3ed5be3bb30b7102b6eb78e100da4bbf6944fd6725c012831cab/nvidia_curand_cu12-10.3.9.90-py3-none-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pypi/packages/b9/75/70c05b2f3ed5be3bb30b7102b6eb78e100da4bbf6944fd6725c012831cab/nvidia_curand_cu12-10.3.9.90-py3-none-win_amd64.whl',
    },
];

/** @type {WheelSpec[]} */
const TORCH_CUDA_WHEELS = [
    {
        id: 'torch-cuda',
        fileName: 'torch-2.9.1+cu126-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://download.pytorch.org/whl/cu126/torch-2.9.1%2Bcu126-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pytorch-wheels/cu126/torch-2.9.1+cu126-cp312-cp312-win_amd64.whl',
    },
    {
        id: 'torchaudio-cuda',
        fileName: 'torchaudio-2.9.1+cu126-cp312-cp312-win_amd64.whl',
        officialUrl: 'https://download.pytorch.org/whl/cu126/torchaudio-2.9.1%2Bcu126-cp312-cp312-win_amd64.whl',
        mirrorUrl: 'https://mirrors.aliyun.com/pytorch-wheels/cu126/torchaudio-2.9.1+cu126-cp312-cp312-win_amd64.whl',
    },
];

/** onnxruntime-gpu 1.21.x (CUDA 12). Resolved via pip when direct pin missing. */
const ONNXRUNTIME_GPU_PIP = 'onnxruntime-gpu==1.21.1';

/** Site-package directory name prefixes safe to copy from a local CUDA runtime. */
const CUDA_LOCAL_COPY_PREFIXES = [
    'nvidia',
    'torch',
    'torchaudio',
    'torchvision',
    'functorch',
    'torchgen',
    'onnxruntime',
    'ctranslate2',
];

const EDITION_NAMES = ['cpu', 'cuda'];

const {
    standardZipName,
    legacyStandardZipName,
    editionZipName,
    websiteUpdateZipName,
    isEditionZipName,
    isAutoUpdateFullZipName,
    editionLabel,
} = require('../electron/release-artifact-names');

/** @param {'cpu'|'cuda'} edition */
function wheelsForEdition(edition) {
    if (edition === 'cpu') {
        return [...WHISPER_CPU_WHEELS, ...SENSEVOICE_CPU_WHEELS];
    }
    if (edition === 'cuda') {
        return [
            ...WHISPER_CPU_WHEELS.filter((w) => w.id !== 'onnxruntime'),
            ...NVIDIA_CU12_WHEELS,
            ...TORCH_CUDA_WHEELS,
            {
                id: 'numba',
                fileName: SENSEVOICE_CPU_WHEELS.find((w) => w.id === 'numba').fileName,
                officialUrl: SENSEVOICE_CPU_WHEELS.find((w) => w.id === 'numba').officialUrl,
                mirrorUrl: SENSEVOICE_CPU_WHEELS.find((w) => w.id === 'numba').mirrorUrl,
            },
            {
                id: 'llvmlite',
                fileName: SENSEVOICE_CPU_WHEELS.find((w) => w.id === 'llvmlite').fileName,
                officialUrl: SENSEVOICE_CPU_WHEELS.find((w) => w.id === 'llvmlite').officialUrl,
                mirrorUrl: SENSEVOICE_CPU_WHEELS.find((w) => w.id === 'llvmlite').mirrorUrl,
            },
        ];
    }
    return [];
}

module.exports = {
    WHISPER_CPU_WHEELS,
    SENSEVOICE_CPU_WHEELS,
    NVIDIA_CU12_WHEELS,
    TORCH_CUDA_WHEELS,
    ONNXRUNTIME_GPU_PIP,
    CUDA_LOCAL_COPY_PREFIXES,
    EDITION_NAMES,
    standardZipName,
    legacyStandardZipName,
    editionZipName,
    websiteUpdateZipName,
    isEditionZipName,
    isAutoUpdateFullZipName,
    editionLabel,
    wheelsForEdition,
};
