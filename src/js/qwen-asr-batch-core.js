/**
 * Qwen3-ASR TEN island batch sizing (auto / conservative / aggressive).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubQwenAsrBatch = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function qwenAsrBatchFactory() {
    const MODES = Object.freeze(['auto', 'conservative', 'aggressive']);

    /**
     * @param {unknown} value
     * @returns {'auto'|'conservative'|'aggressive'}
     */
    function normalizeQwenAsrBatchMode(value) {
        const v = String(value ?? '').trim().toLowerCase();
        if (v === 'conservative' || v === 'safe' || v === 'low') return 'conservative';
        if (v === 'aggressive' || v === 'fast' || v === 'high') return 'aggressive';
        return 'auto';
    }

    function isQwen17bModel(asrModelId) {
        return /1\.7/i.test(String(asrModelId || ''));
    }

    function isQwenAsrModel(asrModelId) {
        return /qwen3-asr/i.test(String(asrModelId || ''));
    }

    function legacyIslandBatchSize(asrModelId) {
        return isQwen17bModel(asrModelId) ? 8 : 16;
    }

    function islandBatchCap(asrModelId) {
        return isQwen17bModel(asrModelId) ? 16 : 32;
    }

    function asrRunsOnCuda(device) {
        const d = String(device || 'auto').trim().toLowerCase();
        if (d === 'cpu') return false;
        if (d === 'cuda') return true;
        return true;
    }

    function autoBatchFromVram(input = {}) {
        const is17 = !!input.is17b;
        const headroomFrac = Number(input.headroomFrac);
        const frac = Number.isFinite(headroomFrac) ? Math.max(0.35, Math.min(0.90, headroomFrac)) : 0.55;
        let avail = Number(input.gpuFreeMiB);
        if (!Number.isFinite(avail) || avail <= 0) avail = 0;
        const total = Number(input.gpuTotalMiB);
        if (avail <= 0 && Number.isFinite(total) && total > 0) {
            avail = Math.floor(total * frac);
        }
        if (avail <= 0) return legacyIslandBatchSize(is17 ? '1.7b' : '0.6b');
        if (is17) {
            if (avail >= 14000) return 16;
            if (avail >= 10000) return 12;
            if (avail >= 7000) return 8;
            if (avail >= 5000) return 6;
            return 4;
        }
        if (avail >= 12000) return 32;
        if (avail >= 8000) return 24;
        if (avail >= 5000) return 16;
        if (avail >= 3000) return 12;
        return 8;
    }

    function aggressiveBatchFromVram(input = {}) {
        const is17 = !!input.is17b;
        const base = input.base;
        const cap = input.cap;
        const autoN = input.autoN;
        const opt = Math.max(
            autoN,
            autoBatchFromVram({
                is17b: is17,
                gpuFreeMiB: input.gpuFreeMiB,
                gpuTotalMiB: input.gpuTotalMiB,
                headroomFrac: 0.80,
            }),
        );
        const total = Number(input.gpuTotalMiB) || 0;
        let out = opt;
        if (is17) {
            if (total >= 16000) out = Math.max(out, 16);
            else if (total >= 12000) out = Math.max(out, 12);
            else if (total >= 10000) out = Math.max(out, 10);
        } else {
            if (total >= 12000) out = Math.max(out, 32);
            else if (total >= 8000) out = Math.max(out, 24);
            else if (total >= 6000) out = Math.max(out, 20);
        }
        return Math.max(base, Math.min(cap, out));
    }

    /**
     * Mirror engine resolve_island_batch_size (hint / planning only).
     * @param {object} [input]
     * @returns {number}
     */
    function resolveIslandBatchSize(input = {}) {
        const mode = normalizeQwenAsrBatchMode(input.qwenAsrBatchMode ?? input.mode);
        const asr = String(input.asrModelId || input.engineAsrModel || '').trim();
        const is17 = isQwen17bModel(asr);
        const base = is17 ? 8 : 16;
        const cap = islandBatchCap(asr);
        if (!asrRunsOnCuda(input.device)) {
            return Math.max(1, Math.min(2, Math.floor(base / 4) || 1));
        }
        const autoN = Math.max(1, Math.min(cap, autoBatchFromVram({
            is17b: is17,
            gpuFreeMiB: input.gpuFreeMiB,
            gpuTotalMiB: input.gpuTotalMiB,
            headroomFrac: 0.55,
        })));
        let n;
        if (mode === 'conservative') n = Math.max(1, Math.min(base, autoN));
        else if (mode === 'aggressive') {
            n = aggressiveBatchFromVram({
                is17b: is17,
                base,
                cap,
                autoN,
                gpuFreeMiB: input.gpuFreeMiB,
                gpuTotalMiB: input.gpuTotalMiB,
            });
        } else n = autoN;
        const sessionCap = Number(input.sessionCap);
        if (Number.isFinite(sessionCap) && sessionCap > 0) {
            n = Math.min(n, Math.max(1, Math.floor(sessionCap)));
        }
        return Math.max(1, n);
    }

    /**
     * Settings hint under Qwen3 批大小 select.
     * @param {object} [input]
     */
    function formatQwenAsrBatchHintText(input = {}) {
        const asr = String(input.engineAsrModel || input.asrModelId || '').trim();
        if (!isQwenAsrModel(asr)) {
            return { visible: false, text: '' };
        }
        const savedMode = normalizeQwenAsrBatchMode(input.qwenAsrBatchMode);
        const perfSpeed = String(input.perfProfile || '').trim().toLowerCase() === 'speed';
        const effectiveMode = perfSpeed ? 'conservative' : savedMode;
        const batch = resolveIslandBatchSize({
            asrModelId: asr,
            qwenAsrBatchMode: effectiveMode,
            device: input.device || 'cuda',
            gpuFreeMiB: input.gpuFreeMiB,
            gpuTotalMiB: input.gpuTotalMiB,
            sessionCap: input.sessionCap,
        });
        const modeZh = effectiveMode === 'conservative' ? '保守'
            : (effectiveMode === 'aggressive' ? '激进' : '自动');
        const totalGb = Number(input.gpuTotalMiB) > 0
            ? `${(Number(input.gpuTotalMiB) / 1024).toFixed(1)}GB`
            : '';
        const vramNote = totalGb ? ` · 显存约 ${totalGb}` : '';
        const speedNote = perfSpeed && savedMode !== 'conservative'
            ? '（转写偏好=速度，批大小按保守执行）'
            : '';
        const capNote = Number(input.sessionCap) > 0 && batch <= Number(input.sessionCap)
            ? ' · 本会话 OOM 后已降批'
            : '';
        return {
            visible: true,
            text: `预计 TEN 人声帧约 ${batch} 段/批（${modeZh}${vramNote}）${speedNote}${capNote}。实际以任务开始时显存为准；OOM 会自动拆批。`,
            batch,
            effectiveMode,
        };
    }

    /**
     * @param {object} [input]
     */
    function describeQwenAsrBatchMode(input = {}) {
        const hint = formatQwenAsrBatchHintText(input);
        if (!hint.visible) {
            return { visible: false, label: '', detail: '' };
        }
        return {
            visible: true,
            label: `Qwen 批大小 · ${hint.effectiveMode === 'conservative' ? '保守' : (hint.effectiveMode === 'aggressive' ? '激进' : '自动')}`,
            detail: hint.text,
        };
    }

    return {
        MODES,
        normalizeQwenAsrBatchMode,
        isQwen17bModel,
        isQwenAsrModel,
        resolveIslandBatchSize,
        formatQwenAsrBatchHintText,
        describeQwenAsrBatchMode,
    };
}));
