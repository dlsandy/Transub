/**
 * llama-server 默认后端偏好：有可用 NVIDIA（驱动 CUDA ≥12）时优先 CUDA 12。
 */
const { detectGpuEnvironment } = require('./gpu-detect');

/** @type {{ preferCuda: boolean, ready: boolean, gpuName: string, cudaVersion: string }} */
let state = {
    preferCuda: false,
    ready: false,
    gpuName: '',
    cudaVersion: '',
};

/** @type {Promise<object>|null} */
let inflight = null;

function shouldPreferCuda12(info) {
    if (!info || info.vendor !== 'nvidia' || !info.detected) return false;
    const major = Number(String(info.cudaVersion || '').split('.')[0]);
    // 驱动 banner 标明 CUDA 12+；若未解析到版本但已检出 NVIDIA，仍优先 CUDA 12
    if (Number.isFinite(major)) return major >= 12;
    return true;
}

function getHints() {
    return {
        preferCuda: !!state.preferCuda,
        ready: !!state.ready,
        gpuName: state.gpuName || '',
        cudaVersion: state.cudaVersion || '',
    };
}

function applyGpuInfo(info) {
    state = {
        preferCuda: shouldPreferCuda12(info),
        ready: true,
        gpuName: String(info?.gpuName || '').trim(),
        cudaVersion: String(info?.cudaVersion || '').trim(),
    };
    return getHints();
}

/**
 * 异步探测并缓存偏好。可重复调用；并发共用同一 Promise。
 * @returns {Promise<{ preferCuda: boolean, ready: boolean, gpuName: string, cudaVersion: string }>}
 */
async function refreshPreferCuda() {
    if (inflight) return inflight;
    inflight = (async () => {
        try {
            const info = await detectGpuEnvironment();
            return applyGpuInfo(info);
        } catch (_) {
            state = {
                preferCuda: false,
                ready: true,
                gpuName: '',
                cudaVersion: '',
            };
            return getHints();
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

/**
 * 确保已探测过（安装运行时前调用）。
 */
async function ensurePreferCudaReady() {
    if (state.ready) return getHints();
    return refreshPreferCuda();
}

module.exports = {
    shouldPreferCuda12,
    getHints,
    refreshPreferCuda,
    ensurePreferCudaReady,
    /** @internal tests */
    _resetForTests(next = null) {
        state = next && typeof next === 'object'
            ? {
                preferCuda: !!next.preferCuda,
                ready: next.ready !== false,
                gpuName: String(next.gpuName || ''),
                cudaVersion: String(next.cudaVersion || ''),
            }
            : { preferCuda: false, ready: false, gpuName: '', cudaVersion: '' };
        inflight = null;
    },
};
