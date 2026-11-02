/**
 * llama-server 默认后端偏好：
 * - 有可用 NVIDIA（驱动 CUDA ≥12）时优先 CUDA（12/13 由目录按 hints.cudaVersion 选择）
 * - 有 AMD 独显时优先 ROCm
 * - 有 Intel Arc 时优先 SYCL
 * - 否则默认 Vulkan
 */
const { detectGpuEnvironment } = require('./gpu-detect');

/** @type {{ preferCuda: boolean, preferRocm: boolean, preferSycl: boolean, ready: boolean, gpuName: string, cudaVersion: string }} */
let state = {
    preferCuda: false,
    preferRocm: false,
    preferSycl: false,
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

function shouldPreferRocm(info) {
    return !!(info && info.vendor === 'amd' && info.detected);
}

function shouldPreferSycl(info) {
    return !!(info && info.vendor === 'intel' && info.detected);
}

function emptyHints(ready = false) {
    return {
        preferCuda: false,
        preferRocm: false,
        preferSycl: false,
        ready: !!ready,
        gpuName: '',
        cudaVersion: '',
    };
}

function getHints() {
    return {
        preferCuda: !!state.preferCuda,
        preferRocm: !!state.preferRocm,
        preferSycl: !!state.preferSycl,
        ready: !!state.ready,
        gpuName: state.gpuName || '',
        cudaVersion: state.cudaVersion || '',
    };
}

function applyGpuInfo(info) {
    state = {
        preferCuda: shouldPreferCuda12(info),
        preferRocm: shouldPreferRocm(info),
        preferSycl: shouldPreferSycl(info),
        ready: true,
        gpuName: String(info?.gpuName || '').trim(),
        cudaVersion: String(info?.cudaVersion || '').trim(),
    };
    return getHints();
}

/**
 * 异步探测并缓存偏好。可重复调用；并发共用同一 Promise。
 * @returns {Promise<{ preferCuda: boolean, preferRocm: boolean, preferSycl: boolean, ready: boolean, gpuName: string, cudaVersion: string }>}
 */
async function refreshPreferCuda() {
    if (inflight) return inflight;
    inflight = (async () => {
        try {
            const info = await detectGpuEnvironment();
            return applyGpuInfo(info);
        } catch (_) {
            state = emptyHints(true);
            return getHints();
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

/**
 * Ensure probe is fresh before install/download. Stale ready=true with no accel
 * previously left repair paths stuck on Vulkan.
 */
async function ensurePreferCudaReady() {
    return refreshPreferCuda();
}

function hasAccelPreference(hints) {
    return !!(hints && (hints.preferCuda || hints.preferRocm || hints.preferSycl));
}

function vendorFromHints(hints) {
    if (hints?.preferCuda) return 'nvidia';
    if (hints?.preferRocm) return 'amd';
    if (hints?.preferSycl) return 'intel';
    return 'cpu';
}

/**
 * Discrete NVIDIA/AMD/Intel → matching CUDA/ROCm/SYCL package id; else ''.
 * Uses live gpuInfo when provided so env-check / repair do not depend on a stale cache.
 * @param {object|null} [gpuInfo]
 * @param {object} [cachedHints]
 * @returns {string}
 */
function runtimeIdFromGpuInfo(gpuInfo = null, cachedHints = {}) {
    const catalog = require('../src/js/advanced-managed-llm-catalog-core');
    const info = gpuInfo && typeof gpuInfo === 'object' ? gpuInfo : null;
    const nvidia = info?.vendor === 'nvidia' && info?.detected;
    const amd = info?.vendor === 'amd' && info?.detected;
    const intel = info?.vendor === 'intel' && info?.detected;
    /** @type {object} */
    let hints = cachedHints && typeof cachedHints === 'object' ? { ...cachedHints } : {};
    if (nvidia) {
        hints = {
            preferCuda: true,
            preferRocm: false,
            preferSycl: false,
            ready: true,
            cudaVersion: String(info.cudaVersion || hints.cudaVersion || ''),
            gpuName: String(info.gpuName || hints.gpuName || ''),
        };
    } else if (amd) {
        hints = {
            preferCuda: false,
            preferRocm: true,
            preferSycl: false,
            ready: true,
            cudaVersion: '',
            gpuName: String(info.gpuName || hints.gpuName || ''),
        };
    } else if (intel) {
        hints = {
            preferCuda: false,
            preferRocm: false,
            preferSycl: true,
            ready: true,
            cudaVersion: '',
            gpuName: String(info.gpuName || hints.gpuName || ''),
        };
    }
    if (!hasAccelPreference(hints)) return '';
    return catalog.getDefaultRuntimeId(process.platform, process.arch, hints) || '';
}

/**
 * Fresh GPU probe → install package for repair / manual download / auto-install.
 * @param {{ runtimeId?: string, packageId?: string, forceRefresh?: boolean, gpuInfo?: object|null }} [opts]
 * @returns {Promise<{ hints: object, runtimeId: string, pkg: object|null, gpuInfo: object|null }>}
 */
async function resolveInstallRuntimeSelection(opts = {}) {
    const catalog = require('../src/js/advanced-managed-llm-catalog-core');
    const options = opts && typeof opts === 'object' ? opts : {};
    let gpuInfo = options.gpuInfo && typeof options.gpuInfo === 'object' ? options.gpuInfo : null;
    let hints;
    if (gpuInfo) {
        hints = applyGpuInfo(gpuInfo);
    } else if (options.forceRefresh === false) {
        hints = await ensurePreferCudaReady();
    } else {
        hints = await refreshPreferCuda();
        try {
            // refresh already applied; re-read for callers that want vendor fields
            gpuInfo = {
                vendor: vendorFromHints(hints),
                detected: hasAccelPreference(hints),
                cudaVersion: hints.cudaVersion || '',
                gpuName: hints.gpuName || '',
            };
        } catch (_) {
            gpuInfo = null;
        }
    }
    const explicit = String(options.runtimeId || options.packageId || '').trim();
    const fromGpu = runtimeIdFromGpuInfo(gpuInfo, hints);
    const runtimeId = fromGpu
        || catalog.pickInstallRuntimeId(explicit, process.platform, process.arch, hints)
        || catalog.getDefaultRuntimeId(process.platform, process.arch, hints)
        || '';
    const pkg = runtimeId
        ? catalog.getRuntimePackage(process.platform, process.arch, runtimeId, hints)
        : null;
    return { hints, runtimeId, pkg, gpuInfo };
}

module.exports = {
    shouldPreferCuda12,
    shouldPreferRocm,
    shouldPreferSycl,
    getHints,
    applyGpuInfo,
    refreshPreferCuda,
    ensurePreferCudaReady,
    runtimeIdFromGpuInfo,
    resolveInstallRuntimeSelection,
    /** @internal tests */
    _resetForTests(next = null) {
        state = next && typeof next === 'object'
            ? {
                preferCuda: !!next.preferCuda,
                preferRocm: !!next.preferRocm,
                preferSycl: !!next.preferSycl,
                ready: next.ready !== false,
                gpuName: String(next.gpuName || ''),
                cudaVersion: String(next.cudaVersion || ''),
            }
            : emptyHints(false);
        inflight = null;
    },
};
