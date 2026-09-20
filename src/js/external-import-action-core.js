/**
 * External CLI / shell import action policy (pure).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubExternalImportAction = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function externalImportActionFactory() {
    const EXTERNAL_IMPORT_ACTIONS = Object.freeze([
        'list_only',
        'list_and_start',
        'list_when_idle',
    ]);

    const DEFAULT_EXTERNAL_IMPORT_ACTION = 'list_when_idle';

    const DEFAULT_RESOURCE_IDLE_THRESHOLDS = Object.freeze({
        /** NVIDIA GPU utilization (%). Ignored when GPU metrics unavailable. */
        maxGpuUtilPct: 15,
        /** VRAM used / total (%). Ignored when GPU metrics unavailable. */
        maxVramUsedPct: 75,
        /** System RAM used / total (%). */
        maxMemoryUsedPct: 85,
    });

    /** Consecutive low-usage polls required before auto-start (~15s interval in app). */
    const REQUIRED_RESOURCE_IDLE_STREAK = 2;

    const EXTERNAL_IMPORT_ACTION_LABELS = Object.freeze({
        list_only: '仅加入任务列表',
        list_and_start: '加入并立即开始',
        list_when_idle: '加入后，资源空闲时自动开始',
    });

    function normalizeExternalImportAction(value, fallback = DEFAULT_EXTERNAL_IMPORT_ACTION) {
        const raw = String(value ?? '').trim().toLowerCase();
        if (EXTERNAL_IMPORT_ACTIONS.includes(raw)) return raw;
        const fb = String(fallback ?? DEFAULT_EXTERNAL_IMPORT_ACTION).trim().toLowerCase();
        return EXTERNAL_IMPORT_ACTIONS.includes(fb) ? fb : DEFAULT_EXTERNAL_IMPORT_ACTION;
    }

    function externalImportActionLabel(action) {
        const key = normalizeExternalImportAction(action);
        return EXTERNAL_IMPORT_ACTION_LABELS[key] || EXTERNAL_IMPORT_ACTION_LABELS.list_only;
    }

    function vramUsedPct(gpu) {
        if (!gpu || typeof gpu !== 'object') return null;
        const total = Number(gpu.memTotalMiB);
        const used = Number(gpu.memUsedMiB);
        if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(used)) return null;
        return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
    }

    /**
     * @param {object|null|undefined} sample from sampleSystemResources()
     * @param {object} [thresholds]
     * @returns {{ ok: boolean, blockers: string[] }}
     */
    function evaluateResourceIdleSample(sample, thresholds = {}) {
        const t = { ...DEFAULT_RESOURCE_IDLE_THRESHOLDS, ...thresholds };
        const blockers = [];

        const memPct = sample?.memory?.usedPct;
        if (memPct != null && Number.isFinite(memPct) && memPct > t.maxMemoryUsedPct) {
            blockers.push(`内存 ${memPct}%`);
        }

        const gpu = sample?.gpu;
        if (gpu && typeof gpu === 'object') {
            const gpuUtil = Number(gpu.utilPct);
            if (Number.isFinite(gpuUtil) && gpuUtil > t.maxGpuUtilPct) {
                blockers.push(`GPU ${gpuUtil}%`);
            }
            const vramPct = vramUsedPct(gpu);
            if (vramPct != null && vramPct > t.maxVramUsedPct) {
                blockers.push(`显存 ${vramPct}%`);
            }
        }

        return { ok: blockers.length === 0, blockers };
    }

    function formatResourceIdleBlockers(blockers = []) {
        const list = Array.isArray(blockers) ? blockers.filter(Boolean) : [];
        return list.length ? list.join(' · ') : '';
    }

    return {
        EXTERNAL_IMPORT_ACTIONS,
        DEFAULT_EXTERNAL_IMPORT_ACTION,
        DEFAULT_RESOURCE_IDLE_THRESHOLDS,
        REQUIRED_RESOURCE_IDLE_STREAK,
        EXTERNAL_IMPORT_ACTION_LABELS,
        normalizeExternalImportAction,
        externalImportActionLabel,
        vramUsedPct,
        evaluateResourceIdleSample,
        formatResourceIdleBlockers,
    };
}));
