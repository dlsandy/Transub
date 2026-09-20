/**
 * ASR-related settings normalization (perfProfile).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAsrSettings = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function asrSettingsFactory() {
    function normalizePerfProfile(raw, fallback = 'quality') {
        const v = String(raw || '').trim().toLowerCase();
        if (v === 'speed' || v === 'fast') return 'speed';
        if (v === 'quality' || v === 'accurate' || v === 'balanced') return 'quality';
        return fallback === 'speed' ? 'speed' : 'quality';
    }

    function isSpeedPerfProfile(raw) {
        return normalizePerfProfile(raw, 'quality') === 'speed';
    }

    /**
     * @param {object} [input]
     * @returns {{ perfProfile: 'quality'|'speed' }}
     */
    function normalizeAsrExtraOptions(input = {}) {
        return {
            perfProfile: normalizePerfProfile(input.perfProfile, 'quality'),
        };
    }

    /**
     * In-window auto ASR recommend chips are disabled (kept API for dismiss/apply wiring).
     * @param {{ currentAsr?: string, recommendedAsr?: string, profile?: string }} input
     */
    function describeAsrRecommendChip(input = {}) {
        const recommended = String(input.recommendedAsr || '').trim();
        const profile = String(input.profile || '').trim();
        return {
            visible: false,
            label: '',
            detail: '',
            recommendedAsr: recommended,
            profile,
            applyLabel: '应用推荐',
        };
    }

    function needsWindowedAsrTip(asrModelId) {
        return /anime-whisper|kotoba-whisper/i.test(String(asrModelId || ''));
    }

    function isQwenAsrModel(asrModelId) {
        return /qwen3-asr|qwen3-forced-aligner/i.test(String(asrModelId || ''));
    }

    function describeQwenAsrRuntimeTip(asrModelId) {
        if (!isQwenAsrModel(asrModelId)) {
            return { visible: false, text: '' };
        }
        return {
            visible: true,
            text: (
                'Qwen3-ASR 依赖 PyTorch（transformers≥5.13 · 原生 -hf）。'
                + '有 NVIDIA 显卡时，首次下载模型或转写会自动安装 CUDA 版 PyTorch（约 2.5GB，通常需 10–30 分钟）。'
                + '建议先在「系统检查」一键修复或下载模型时预装运行库；卡住可用「手动下载」→ CUDA PyTorch。'
            ),
        };
    }

    function describeWindowedAsrTip(_asrModelId) {
        // UI tip removed: windowing still happens in the engine when needed.
        return { visible: false, text: '' };
    }

    /**
     * Hardware /models/recommend is no longer auto-applied in-window or during sense.
     * Callers may still pass ctx for logging; ASR selection stays as configured.
     * @param {object} overrides
     * @param {{
     *   recommendedAsr?: string,
     *   profile?: string,
     *   installedModels?: Array<{id:string,installed?:boolean}|string>,
     * }} [ctx]
     * @returns {{ overrides: object, notes: string[], changed: boolean }}
     */
    function applyHardwareAsrRecommend(overrides = {}, _ctx = {}) {
        return { overrides: { ...(overrides || {}) }, notes: [], changed: false };
    }

    return {
        normalizePerfProfile,
        isSpeedPerfProfile,
        normalizeAsrExtraOptions,
        describeAsrRecommendChip,
        needsWindowedAsrTip,
        isQwenAsrModel,
        describeQwenAsrRuntimeTip,
        describeWindowedAsrTip,
        applyHardwareAsrRecommend,
    };
}));
