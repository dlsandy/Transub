/**
 * Translation-track slot preservation: blank MT stubs must never be treated as
 * deletable noise on ZH-only paths (paired JA↔ZH cleanup uses fluency-core instead).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtSubtitleSlot = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtSubtitleSlotCoreFactory() {
    const BLANK_MT_SLOT_RES = /^(?:\.\.\.|……|…|[。．.、，,\s…·•\-—_~～]+)$/;

    /** True when MT left an empty / ellipsis placeholder (not real dialogue). */
    function isBlankMtSlotText(text) {
        const t = String(text ?? '').trim();
        if (!t) return true;
        return BLANK_MT_SLOT_RES.test(t);
    }

    /**
     * Noise removal opts for translated (ZH) tracks — never delete empty slots.
     * @param {object} [base]
     */
    function buildTranslationTrackNoiseOptions(base = {}) {
        return {
            ...base,
            removeEmpty: false,
            removeFragments: false,
            removeSoundEffects: false,
            removeSymbolOnly: false,
            removeDuplicates: base.removeDuplicates === true,
            removeHallucinations: base.removeHallucinations !== false,
            blankInsteadOfRemove: base.blankInsteadOfRemove === true,
        };
    }

    /**
     * Full noise removal for JA / source tracks.
     * @param {object} [base]
     */
    function buildSourceTrackNoiseOptions(base = {}) {
        return {
            removeEmpty: base.removeEmpty !== false,
            removeFragments: base.removeFragments !== false,
            removeSoundEffects: base.removeSoundEffects !== false,
            removeSymbolOnly: base.removeSymbolOnly !== false,
            removeDuplicates: base.removeDuplicates !== false,
            removeHallucinations: base.removeHallucinations !== false,
            blankInsteadOfRemove: base.blankInsteadOfRemove === true,
            blankPlaceholder: base.blankPlaceholder,
            ...base,
        };
    }

    /**
     * Block writes when a translation file lost most cues while JA source stayed dense.
     * @param {{
     *   beforeCount?: number,
     *   afterCount?: number,
     *   sourceCount?: number,
     *   isTranslationTrack?: boolean,
     *   minKeepRatio?: number,
     * }} ctx
     */
    function detectTranslationSlotMassDeletion(ctx = {}) {
        const before = Math.max(0, Number(ctx.beforeCount) || 0);
        const after = Math.max(0, Number(ctx.afterCount) || 0);
        const sourceCount = Math.max(0, Number(ctx.sourceCount) || 0);
        const minKeepRatio = Number(ctx.minKeepRatio) > 0 ? Number(ctx.minKeepRatio) : 0.85;
        if (before < 10) return { blocked: false };
        const removed = before - after;
        if (removed <= 0) return { blocked: false };
        const ratio = after / before;
        if (ratio >= minKeepRatio) return { blocked: false };

        if (sourceCount >= before * 0.85 && after < sourceCount * minKeepRatio) {
            return {
                blocked: true,
                reason: 'translation_slot_mass_deletion',
                beforeCount: before,
                afterCount: after,
                sourceCount,
                removed,
                ratio,
            };
        }
        if (ctx.isTranslationTrack && ratio < 0.5 && removed >= 20) {
            return {
                blocked: true,
                reason: 'translation_cue_mass_loss',
                beforeCount: before,
                afterCount: after,
                sourceCount,
                removed,
                ratio,
            };
        }
        return { blocked: false };
    }

    /**
     * Safety net: if empty-slot deletion ran on a translation track, revert noise step.
     * @param {{ beforeCues: object[], afterCues: object[], noiseStats?: object, isTranslationTrack?: boolean }} ctx
     */
    function guardTranslationTrackNoiseStep(ctx = {}) {
        const beforeCues = Array.isArray(ctx.beforeCues) ? ctx.beforeCues : [];
        const afterCues = Array.isArray(ctx.afterCues) ? ctx.afterCues : [];
        if (!ctx.isTranslationTrack) {
            return { reverted: false, cues: afterCues };
        }
        const emptyRemoved = Number(ctx.noiseStats?.empty) || 0;
        const guard = detectTranslationSlotMassDeletion({
            beforeCount: beforeCues.length,
            afterCount: afterCues.length,
            isTranslationTrack: true,
        });
        if (guard.blocked || (emptyRemoved > 0 && afterCues.length < beforeCues.length)) {
            return {
                reverted: true,
                cues: beforeCues,
                guard: guard.blocked ? guard : {
                    blocked: true,
                    reason: 'translation_empty_slot_deletion',
                    beforeCount: beforeCues.length,
                    afterCount: afterCues.length,
                    emptyRemoved,
                },
            };
        }
        return { reverted: false, cues: afterCues };
    }

    return {
        isBlankMtSlotText,
        buildTranslationTrackNoiseOptions,
        buildSourceTrackNoiseOptions,
        detectTranslationSlotMassDeletion,
        guardTranslationTrackNoiseStep,
    };
}));
