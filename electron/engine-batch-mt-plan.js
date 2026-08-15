/**
 * Engine batch MT mode / model / adapter options plan (pure).
 */

/**
 * @param {object[]} list
 * @param {object} merged
 * @param {{
 *   mergeSenseOverrides: (base: object, overrides: object) => object,
 *   sanitizeSakuraMtForLanguage: (opts: object, lang: string) => { options: object },
 * }} deps
 */
function buildSanitizedFileMergedList(list, merged, deps) {
    const merge = deps.mergeSenseOverrides || ((base, ov) => ({ ...base, ...ov }));
    const sanitize = deps.sanitizeSakuraMtForLanguage
        || ((opts) => ({ options: opts }));
    return (Array.isArray(list) ? list : []).map((it) => {
        const fo = merge(merged, it?.optionOverrides || {});
        return sanitize(fo, fo.language).options;
    });
}

/**
 * @param {{
 *   fileMergedList: object[],
 *   merged: object,
 *   listLength: number,
 *   isLlmMtId: (id: string) => boolean,
 * }} input
 */
function resolveBatchMtPlan({
    fileMergedList = [],
    merged = {},
    listLength = 0,
    isLlmMtId = () => false,
} = {}) {
    const translateLikeBatch = merged.task === 'translate' || merged.task === 'dual';
    const batchWantsSmart = translateLikeBatch && (
        !!merged.smartTranslate
        || fileMergedList.some((fo) => !!fo.smartTranslate)
    );
    const sakuraFile = fileMergedList.find((fo) => (
        isLlmMtId(fo.engineMtModel)
        && !fo.smartTranslate
        && translateLikeBatch
    ));
    const batchWantsSakura = translateLikeBatch && !batchWantsSmart && (
        !!sakuraFile
        || (
            listLength === 0
            && isLlmMtId(merged.engineMtModel)
            && !merged.smartTranslate
        )
    );
    const sakuraModelId = sakuraFile?.engineMtModel
        || (listLength === 0 && isLlmMtId(merged.engineMtModel) ? merged.engineMtModel : null);

    return {
        translateLikeBatch,
        batchWantsSmart,
        batchWantsSakura,
        sakuraModelId,
        sakuraFile: sakuraFile || null,
    };
}

/**
 * Whether any item / merged options needs film audio Pro gate.
 */
function batchNeedsFilmAudioGate(list, merged, mergeSenseOverrides) {
    if (merged?.filmAudioEnhance || merged?.filmVadPreset) return true;
    const merge = mergeSenseOverrides || ((base, ov) => ({ ...base, ...ov }));
    return (Array.isArray(list) ? list : []).some((it) => {
        const fo = merge(merged, it?.optionOverrides || {});
        return !!(fo.filmAudioEnhance || fo.filmVadPreset);
    });
}

/**
 * Build options bag for startEngineMtAdapter (without signal / onProgress).
 */
function resolveBatchMtAdapterLaunch({
    batchWantsSmart = false,
    sakuraModelId = null,
    merged = {},
    list = [],
} = {}) {
    const sakuraNsfwFromItems = (Array.isArray(list) ? list : []).some((item) => {
        const o = item?.optionOverrides || {};
        return o.sakuraNsfwPrompt === true;
    });
    const sakuraNsfwPrompt = merged.sakuraNsfwPrompt === false
        ? false
        : (
            merged.sakuraNsfwPrompt === true
            || sakuraNsfwFromItems
            || !!merged.smartTranslateFaithfulTone
        );
    return {
        mode: batchWantsSmart ? 'smart' : 'sakura',
        modelId: batchWantsSmart
            ? merged.engineMtModel
            : (sakuraModelId || merged.engineMtModel),
        options: {
            ...merged,
            sakuraNsfwPrompt,
            ...(batchWantsSmart
                ? {
                    windowCues: merged.windowCues ?? 8,
                    overlapCues: merged.overlapCues ?? 2,
                }
                : {}),
        },
    };
}

module.exports = {
    buildSanitizedFileMergedList,
    resolveBatchMtPlan,
    batchNeedsFilmAudioGate,
    resolveBatchMtAdapterLaunch,
};
