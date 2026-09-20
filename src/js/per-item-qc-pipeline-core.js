/**
 * Per-item post-task progress bands (95–100%) — polish → QC → finalize.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPerItemQcPipeline = api;
        global.TransubItemPosttaskProgress = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function itemPosttaskProgressFactory() {
    const QC_STAGE = 'qc_fix';
    const POLISH_STAGE = 'cleanup';
    const FINALIZE_STAGE = 'save';

    function normalizeQcFixMode(mode) {
        const v = String(mode || 'none').trim().toLowerCase();
        if (v === 'fix' || v === 'smart' || v === 'none') return v;
        return 'none';
    }

    function shouldRunQcRepairPass(qcFixMode) {
        const mode = normalizeQcFixMode(qcFixMode);
        return mode === 'fix' || mode === 'smart';
    }

    function isSpeedPerfProfile(raw) {
        const v = String(raw || '').trim().toLowerCase();
        return v === 'speed' || v === 'fast';
    }

    function resolveQcRepairMode(qcFixMode, { smartEntitled = true, perfProfile } = {}) {
        const mode = normalizeQcFixMode(qcFixMode);
        // Speed profile: skip extra ASR in smart QC; keep CPU 一键修复.
        if (mode === 'smart' && isSpeedPerfProfile(perfProfile)) return 'fix';
        if (mode === 'smart' && !smartEntitled) return 'fix';
        return mode;
    }

    function clampPct(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(100, n));
    }

    function scaleBand(localPct, lo, hi) {
        const ratio = clampPct(localPct) / 100;
        return Math.round(lo + (hi - lo) * ratio);
    }

    function mapPostTaskProgress(phase, localPct = 0) {
        const p = String(phase || '').trim().toLowerCase();
        if (p === 'polish' || p === 'postprocess' || p === 'cleanup') return scaleBand(localPct, 95, 98);
        if (p === 'qc' || p === 'scan' || p === 'fix' || p === 'silence' || p === 'qc_loop' || p === 'loop') {
            return scaleBand(localPct, 98, 99);
        }
        if (p === 'finalize' || p === 'chinese' || p === 'preset') return scaleBand(localPct, 99, 100);
        return scaleBand(localPct, 95, 100);
    }

    /** @deprecated use mapPostTaskProgress('qc', …) */
    function mapQcFixProgress(localPct = 0) {
        return scaleBand(localPct, 98, 100);
    }

    function shouldDeferItemDone(ctx = {}) {
        return shouldRunItemPostTask({ hasSubtitle: true, ...ctx });
    }

    function shouldRunItemPostTask({
        hasSubtitle = false,
        polishAlreadyDone = false,
        autofixShouldRun = false,
        qcScanEnabled = false,
        qcFixMode = 'none',
        chineseVariant = 'simplified',
        textPresetGroupId = '',
        insertSoftwareCredit = false,
    } = {}) {
        if (!hasSubtitle) return false;
        if (!polishAlreadyDone && autofixShouldRun) return true;
        if (qcScanEnabled || normalizeQcFixMode(qcFixMode) !== 'none') return true;
        const zh = String(chineseVariant || 'simplified').trim().toLowerCase();
        if (zh && zh !== 'simplified') return true;
        if (String(textPresetGroupId || '').trim()) return true;
        if (insertSoftwareCredit) return true;
        return false;
    }

    function postTaskPhaseDetail(phase) {
        const p = String(phase || '').trim().toLowerCase();
        if (p === 'polish' || p === 'postprocess') return '后处理中…';
        if (p === 'scan') return 'QC检测中…';
        if (p === 'fix') return 'QC修复中…';
        if (p === 'silence') return '超长句静音分割…';
        if (p === 'qc_loop' || p === 'loop') return 'QC 闭环补译…';
        if (p === 'chinese') return '简繁转换中…';
        if (p === 'preset') return '插入字幕预设…';
        if (p === 'qc') return 'QC修复中…';
        return '收尾处理中…';
    }

    /** @deprecated */
    function qcPhaseDetail(phase) {
        return postTaskPhaseDetail(phase);
    }

    return {
        QC_STAGE,
        POLISH_STAGE,
        FINALIZE_STAGE,
        normalizeQcFixMode,
        shouldRunQcRepairPass,
        isSpeedPerfProfile,
        resolveQcRepairMode,
        mapPostTaskProgress,
        mapQcFixProgress,
        shouldDeferItemDone,
        shouldRunItemPostTask,
        postTaskPhaseDetail,
        qcPhaseDetail,
    };
}));
