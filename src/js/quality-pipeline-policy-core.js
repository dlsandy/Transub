/**
 * Quality pipeline v2 policy: when banding / pre-MT gate / post-QC loop are active.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubQualityPipelinePolicy = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function qualityPipelinePolicyFactory() {
    const DEFAULT_LOOP_MAX_PASSES = 1;
    const DEFAULT_RETRANSLATE_INDEX_CAP = 40;
    /** Skip QC loop when signal is below these (quality profile still on). */
    const DEFAULT_LOOP_MIN_RED = 1;
    const DEFAULT_LOOP_MIN_BLANK_RATIO = 0.02;
    const DEFAULT_LOOP_MIN_BLANK_ABS = 8;
    const DEFAULT_LOOP_MIN_ISSUES = 5;

    function normalizeQualityPipelineMode(value) {
        const v = String(value == null ? 'auto' : value).trim().toLowerCase();
        if (v === 'on' || v === 'true' || v === '1' || v === 'always') return 'on';
        if (v === 'off' || v === 'false' || v === '0' || v === 'no') return 'off';
        return 'auto';
    }

    function isSpeedPerfProfile(raw) {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            return isSpeedPerfProfile(raw.perfProfile);
        }
        const v = String(raw || '').trim().toLowerCase();
        return v === 'speed' || v === 'fast';
    }

    /**
     * auto → on when quality profile, off when speed.
     * on / off force regardless of perfProfile.
     */
    function isQualityPipelineActive(options = {}) {
        const mode = normalizeQualityPipelineMode(
            options.qualityPipelineMode != null
                ? options.qualityPipelineMode
                : options.mode,
        );
        if (mode === 'on') return true;
        if (mode === 'off') return false;
        return !isSpeedPerfProfile(options.perfProfile != null ? options.perfProfile : options);
    }

    function clampPostQcLoopMaxPasses(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return DEFAULT_LOOP_MAX_PASSES;
        return Math.max(0, Math.min(2, Math.round(n)));
    }

    /**
     * Effective max passes: speed profile forces 0 unless quality pipeline is forced on
     * and user explicitly set postQcLoopMaxPasses > 0 with pipeline on.
     */
    function resolveEffectivePostQcLoopMaxPasses(options = {}) {
        if (!isQualityPipelineActive(options)) return 0;
        const clamped = clampPostQcLoopMaxPasses(options.postQcLoopMaxPasses);
        if (isSpeedPerfProfile(options) && normalizeQualityPipelineMode(options.qualityPipelineMode) !== 'on') {
            return 0;
        }
        return clamped;
    }

    function clampPostQcRetranslateIndexCap(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return DEFAULT_RETRANSLATE_INDEX_CAP;
        return Math.max(0, Math.min(200, Math.round(n)));
    }

    /**
     * Skip expensive ASR+MT closed loop when residual risk/blank signal is low.
     * @returns {{ run: boolean, reason: string, red: number, blank: number, issues: number }}
     */
    function shouldRunPostQcLoopForSignal(input = {}) {
        const options = input.options && typeof input.options === 'object' ? input.options : {};
        if (options.postQcLoopForce === true) {
            return { run: true, reason: 'forced', red: 0, blank: 0, issues: 0 };
        }
        const bandByIndex = input.bandByIndex || {};
        let red = 0;
        let yellow = 0;
        for (const key of Object.keys(bandByIndex)) {
            const b = bandByIndex[key];
            if (b === 'red') red += 1;
            else if (b === 'yellow') yellow += 1;
        }
        if (Array.isArray(input.holdIndexes)) {
            red = Math.max(red, input.holdIndexes.length);
        }
        const blank = Math.max(0, Number(input.blankCount) || 0);
        const blankExhausted = Math.max(0, Number(input.blankExhaustedCount) || 0);
        const issues = Math.max(0, Number(input.issueCount) != null
            ? Number(input.issueCount)
            : (Array.isArray(input.issues) ? input.issues.length : 0));
        const cueCount = Math.max(0, Number(input.cueCount) || 0);
        const minRed = Math.max(0, Number(options.postQcLoopMinRed) || DEFAULT_LOOP_MIN_RED);
        const minBlankAbs = Math.max(1, Number(options.postQcLoopMinBlankAbs) || DEFAULT_LOOP_MIN_BLANK_ABS);
        const minBlankRatio = Math.max(0, Number(options.postQcLoopMinBlankRatio) || DEFAULT_LOOP_MIN_BLANK_RATIO);
        const minIssues = Math.max(1, Number(options.postQcLoopMinIssues) || DEFAULT_LOOP_MIN_ISSUES);
        const blankFloor = Math.max(minBlankAbs, Math.ceil(cueCount * minBlankRatio));

        if (red >= minRed) {
            return { run: true, reason: 'red_bands', red, blank, issues, blankExhausted };
        }
        // Main/post blank-MT already exhausted these slots — ASR+MT closed loop is
        // duplicate work unless risk bands say the *source* is bad.
        if (
            blank >= blankFloor
            && blankExhausted > 0
            && blankExhausted >= Math.ceil(blank * 0.75)
            && red < minRed
        ) {
            return {
                run: false,
                reason: 'mt_exhausted',
                red,
                blank,
                issues,
                blankExhausted,
            };
        }
        if (blank >= blankFloor) {
            return { run: true, reason: 'blank_density', red, blank, issues, blankExhausted };
        }
        if (issues >= minIssues && yellow > 0) {
            return { run: true, reason: 'issue_yellow', red, blank, issues, blankExhausted };
        }
        return { run: false, reason: 'low_signal', red, blank, issues, blankExhausted };
    }

    return {
        DEFAULT_LOOP_MAX_PASSES,
        DEFAULT_RETRANSLATE_INDEX_CAP,
        DEFAULT_LOOP_MIN_RED,
        DEFAULT_LOOP_MIN_BLANK_RATIO,
        DEFAULT_LOOP_MIN_BLANK_ABS,
        DEFAULT_LOOP_MIN_ISSUES,
        normalizeQualityPipelineMode,
        isSpeedPerfProfile,
        isQualityPipelineActive,
        clampPostQcLoopMaxPasses,
        resolveEffectivePostQcLoopMaxPasses,
        clampPostQcRetranslateIndexCap,
        shouldRunPostQcLoopForSignal,
    };
}));
