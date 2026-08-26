/**
 * llama-server 并行 slot（-np）与客户端并发决策（纯逻辑，无 I/O）。
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubLlamaServerTuning = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function llamaServerTuningFactory() {
    const PARALLEL_MODES = Object.freeze(['off', 'auto', '2', '3', '4']);

    /**
     * @param {unknown} value
     * @returns {'off'|'auto'|'2'|'3'|'4'}
     */
    function normalizeLlamaParallelMode(value) {
        const v = String(value ?? '').trim().toLowerCase();
        if (v === 'off' || v === '0' || v === '1' || v === 'false' || v === 'no') return 'off';
        if (v === '2' || v === '3' || v === '4') return v;
        return 'auto';
    }

    function normalizeSmartTranslateParallel(value) {
        if (value === true || value === 1 || value === '1') return true;
        if (value === false || value === 0 || value === '0') return false;
        const v = String(value ?? '').trim().toLowerCase();
        return v === 'true' || v === 'yes' || v === 'on';
    }

    function normalizeSpeculativeEnabled(value) {
        if (value === true || value === 1 || value === '1') return true;
        if (value === false || value === 0 || value === '0') return false;
        const v = String(value ?? '').trim().toLowerCase();
        return v === 'true' || v === 'yes' || v === 'on';
    }

    /**
     * @param {number} paramBillion
     * @returns {number}
     */
    function modelWeightGiB(paramBillion) {
        const b = Number(paramBillion);
        if (!Number.isFinite(b) || b <= 0) return 6;
        if (b <= 1.5) return 2.5;
        if (b <= 3) return 3.5;
        if (b <= 7) return 6;
        if (b <= 14) return 10;
        if (b <= 32) return 18;
        return 24;
    }

    /**
     * Rough KV / slot overhead GiB for heuristics only.
     * @param {number} paramBillion
     * @param {number} contextSize
     * @returns {number}
     */
    function slotOverheadGiB(paramBillion, contextSize) {
        const ctx = Math.max(512, Number(contextSize) || 8192);
        const ctxFactor = ctx / 4096;
        const b = Number(paramBillion) || 7;
        if (b <= 3) return 0.55 * ctxFactor;
        if (b <= 7) return 0.85 * ctxFactor;
        return 1.2 * ctxFactor;
    }

    /**
     * @param {object} [input]
     * @returns {number} 1..4
     */
    function resolveParallelSlots(input = {}) {
        const mode = normalizeLlamaParallelMode(input.mode ?? input.llamaParallelMode);
        const purpose = String(input.purpose || 'mt').trim().toLowerCase();
        const smartOk = normalizeSmartTranslateParallel(
            input.smartTranslateParallel ?? input.llamaSmartTranslateParallel,
        );
        if (mode === 'off') return 1;
        if (purpose === 'smart' && !smartOk) return 1;
        if (input.afterAsr === true) return 1;

        const nGpuLayers = Number(input.nGpuLayers);
        if (Number.isFinite(nGpuLayers) && nGpuLayers <= 0) return 1;

        const paramBillion = Number(input.paramBillion);
        const contextSize = Number(input.contextSize) || 8192;
        const gpuFreeMiB = Number(input.gpuFreeMiB);
        const gpuTotalMiB = Number(input.gpuTotalMiB);
        const freeMiB = Number.isFinite(gpuFreeMiB) && gpuFreeMiB > 0
            ? gpuFreeMiB
            : (Number.isFinite(gpuTotalMiB) && gpuTotalMiB > 0
                ? Math.round(gpuTotalMiB * 0.55)
                : null);

        const capByModel = (() => {
            const b = Number.isFinite(paramBillion) ? paramBillion : 7;
            if (b <= 3) return 3;
            if (b <= 7) return 2;
            return 1;
        })();

        const maxByVram = (() => {
            if (!freeMiB) return capByModel;
            const freeGiB = freeMiB / 1024;
            const base = modelWeightGiB(paramBillion);
            const overhead = slotOverheadGiB(paramBillion, contextSize);
            const headroom = freeGiB - base;
            if (headroom < overhead * 0.5) return 1;
            const extra = Math.floor(Math.max(0, headroom) / Math.max(0.35, overhead));
            return Math.max(1, Math.min(4, 1 + extra));
        })();

        const ceiling = Math.min(capByModel, maxByVram);
        if (mode === '2' || mode === '3' || mode === '4') {
            return Math.max(1, Math.min(Number(mode), ceiling));
        }
        return Math.max(1, Math.min(ceiling, capByModel));
    }

    /**
     * @param {object} input
     * @returns {string[]}
     */
    function buildLlamaServerSpawnArgs(input = {}) {
        const modelPath = String(input.modelPath || '').trim();
        const host = String(input.host || '127.0.0.1').trim() || '127.0.0.1';
        const port = Number(input.port);
        const contextSize = Number(input.contextSize);
        const nGpuLayers = Number(input.nGpuLayers);
        const alias = String(input.alias || input.modelId || 'model').trim() || 'model';
        const parallelSlots = Math.max(1, Math.min(4, Math.round(Number(input.parallelSlots) || 1)));

        const args = [
            '-m', modelPath,
            '--host', host,
            '--port', String(Number.isFinite(port) ? port : 39281),
            '-c', String(Number.isFinite(contextSize) ? contextSize : 8192),
            '-ngl', String(Number.isFinite(nGpuLayers) ? nGpuLayers : 99),
            '-a', alias,
        ];
        if (parallelSlots > 1) {
            args.push('-np', String(parallelSlots));
        }
        const draftModelPath = String(input.draftModelPath || '').trim();
        if (input.speculativeEnabled && draftModelPath) {
            args.push('-md', draftModelPath);
            args.push('--spec-type', 'draft-simple');
            const nMax = Number(input.specDraftNMax);
            args.push(
                '--spec-draft-n-max',
                String(Number.isFinite(nMax) && nMax >= 1 ? Math.min(8, Math.round(nMax)) : 3),
            );
        }
        return args;
    }

    /**
     * @param {object} [managed]
     * @param {object} [input]
     * @returns {{ mode: string, smartTranslateParallel: boolean, slots: number, clientConcurrency: number }}
     */
    function resolveLlamaParallelPlan(managed = {}, input = {}) {
        const mode = normalizeLlamaParallelMode(
            input.mode ?? managed.llamaParallelMode,
        );
        const smartTranslateParallel = normalizeSmartTranslateParallel(
            input.smartTranslateParallel ?? managed.llamaSmartTranslateParallel,
        );
        const slots = resolveParallelSlots({
            mode,
            smartTranslateParallel,
            llamaSmartTranslateParallel: smartTranslateParallel,
            purpose: input.purpose || 'mt',
            afterAsr: input.afterAsr === true,
            paramBillion: input.paramBillion,
            contextSize: input.contextSize,
            nGpuLayers: input.nGpuLayers,
            gpuFreeMiB: input.gpuFreeMiB,
            gpuTotalMiB: input.gpuTotalMiB,
        });
        return {
            mode,
            smartTranslateParallel,
            slots,
            clientConcurrency: slots,
        };
    }

    return {
        PARALLEL_MODES,
        normalizeLlamaParallelMode,
        normalizeSmartTranslateParallel,
        normalizeSpeculativeEnabled,
        resolveParallelSlots,
        resolveLlamaParallelPlan,
        buildLlamaServerSpawnArgs,
    };
}));
