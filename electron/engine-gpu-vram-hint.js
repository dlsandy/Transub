/**
 * Sample GPU VRAM before Engine job create (Qwen island batch sizing).
 * Uses nvidia-smi via system-resources — avoids post-load torch mem_get_info skew.
 */

async function sampleJobGpuVramHint(options = {}) {
    const device = String(options.device || 'auto').trim().toLowerCase();
    if (device === 'cpu') return {};
    try {
        const gpu = await require('./system-resources').sampleGpu();
        const total = Number(gpu?.memTotalMiB);
        if (!Number.isFinite(total) || total <= 0) return {};
        const gpuTotalMiB = Math.max(0, Math.round(total));
        const used = Number(gpu?.memUsedMiB);
        const gpuFreeMiB = Math.max(
            0,
            Math.round(gpuTotalMiB - (Number.isFinite(used) ? used : 0)),
        );
        return { gpuFreeMiB, gpuTotalMiB };
    } catch {
        return {};
    }
}

module.exports = {
    sampleJobGpuVramHint,
};
