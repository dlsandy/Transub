/**
 * Settings option normalize / clamp helpers (pure — no DOM).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSettingsOptionsNormalize = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function settingsOptionsNormalizeFactory() {
    const POST_BATCH_QC_FIX_MODES = Object.freeze(['none', 'fix', 'smart']);
    const VIEWING_CLEAN_MODES = Object.freeze(['off', 'light', 'clear']);
    const CHINESE_SUBTITLE_VARIANTS = Object.freeze([
        'simplified',
        'traditional',
        'traditional-tw',
        'traditional-hk',
    ]);
    const SUBTITLE_BAK_MODES = Object.freeze(['off', 'beside', 'appBackup']);
    const AUTO_UPDATE_INTERVALS = Object.freeze(['off', 'daily', 'weekly', 'monthly']);

    function numOrFinite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function normalizePostBatchQcFixMode(value) {
        const mode = String(value || '').trim().toLowerCase();
        return POST_BATCH_QC_FIX_MODES.includes(mode) ? mode : 'none';
    }

    function normalizeViewingCleanMode(value, fallback = 'clear') {
        const mode = String(value || '').trim().toLowerCase();
        if (VIEWING_CLEAN_MODES.includes(mode)) return mode;
        return VIEWING_CLEAN_MODES.includes(fallback) ? fallback : 'clear';
    }

    function normalizeChineseSubtitleVariant(raw) {
        const cv = String(raw || 'simplified');
        return CHINESE_SUBTITLE_VARIANTS.includes(cv) ? cv : 'simplified';
    }

    function chineseSubtitleVariantLabel(variant) {
        if (variant === 'simplified') return '转简体';
        if (variant === 'traditional-hk') return '转繁体（香港）';
        if (variant === 'traditional-tw') return '转繁体（台湾字形）';
        return '转繁体（台湾）';
    }

    function clampVadMaxSingleSegmentMs(raw) {
        const text = String(raw ?? '').trim();
        const n = text === '' ? NaN : Number(text);
        if (!Number.isFinite(n)) return 30000;
        return Math.max(5000, Math.min(60000, Math.round(n)));
    }

    function clampHallucinationSilenceThreshold(raw) {
        if (raw == null || String(raw).trim() === '') return null;
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) return null;
        return Math.max(0.1, Math.min(30, n));
    }

    function clampTranscriptKeepLimit(raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) return 200;
        return Math.max(0, Math.min(9999, Math.round(n)));
    }

    function clampTranscriptKeepDays(raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) return 90;
        return Math.max(0, Math.min(3650, Math.round(n)));
    }

    function normalizeSubtitleBakMode(value) {
        const v = String(value || '');
        return SUBTITLE_BAK_MODES.includes(v) ? v : 'off';
    }

    function normalizeStartupWindow(value) {
        return value === 'editor' ? 'editor' : 'generator';
    }

    function normalizeAutoUpdateCheckInterval(value) {
        const v = String(value || '');
        return AUTO_UPDATE_INTERVALS.includes(v) ? v : 'weekly';
    }

    function clampPolishSampleLimit(raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) return 36;
        return Math.max(4, Math.min(36, Math.round(n)));
    }

    function clampQcSmartMaxRetranscribeRanges(raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) return 8;
        return Math.max(1, Math.min(24, Math.round(n)));
    }

    function normalizeQcSmartIntensity(value) {
        const v = String(value || '').trim().toLowerCase();
        if (v === 'medium' || v === 'strong' || v === 'light') return v;
        return 'light';
    }

    /** Empty / invalid → null (caller uses film built-in defaults). */
    function optionalFiniteNumber(raw, { min, max } = {}) {
        if (raw == null || String(raw).trim() === '') return null;
        const n = Number(raw);
        if (!Number.isFinite(n)) return null;
        let out = n;
        if (Number.isFinite(min)) out = Math.max(min, out);
        if (Number.isFinite(max)) out = Math.min(max, out);
        return out;
    }

    /**
     * Persist engineMtModel from translate mode + form picks.
     * smart → ''; llm/sakura → LLM id; else Opus id.
     */
    function resolveEngineMtModelForPersist(mode, opusMtModel, llmMtModel) {
        const m = String(mode || '');
        if (m === 'smart') return '';
        if (m === 'llm' || m === 'sakura') return String(llmMtModel || '');
        return String(opusMtModel || '');
    }

    /**
     * Legacy boolean flags derived from viewing-clean three-way modes.
     */
    function viewingCleanModesToLegacyFlags(punctMode, interjectionMode, onomatopoeiaMode) {
        const punct = normalizeViewingCleanMode(punctMode, 'clear');
        const interj = normalizeViewingCleanMode(interjectionMode, 'clear');
        const onomato = normalizeViewingCleanMode(onomatopoeiaMode, 'clear');
        return {
            postBatchSimplifyViewingPunctuation: punct !== 'off',
            postBatchCompactPureInterjections: interj === 'clear' || onomato === 'clear',
        };
    }

    return {
        POST_BATCH_QC_FIX_MODES,
        VIEWING_CLEAN_MODES,
        CHINESE_SUBTITLE_VARIANTS,
        SUBTITLE_BAK_MODES,
        AUTO_UPDATE_INTERVALS,
        numOrFinite,
        normalizePostBatchQcFixMode,
        normalizeViewingCleanMode,
        normalizeChineseSubtitleVariant,
        chineseSubtitleVariantLabel,
        clampVadMaxSingleSegmentMs,
        clampHallucinationSilenceThreshold,
        clampTranscriptKeepLimit,
        clampTranscriptKeepDays,
        clampPolishSampleLimit,
        clampQcSmartMaxRetranscribeRanges,
        normalizeQcSmartIntensity,
        optionalFiniteNumber,
        normalizeSubtitleBakMode,
        normalizeStartupWindow,
        normalizeAutoUpdateCheckInterval,
        resolveEngineMtModelForPersist,
        viewingCleanModesToLegacyFlags,
    };
}));
