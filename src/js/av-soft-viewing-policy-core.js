/**
 * Soft-AV (日语软声) viewing policy.
 *
 * Product intent for watchability:
 * - Pure moan / SFX cues stay off the ZH subtitle track (audio already carries them).
 * - Lexical dialogue uses tight MT windows — wide multi-cue reasoning windows scramble
 *   pronouns / register across breath islands.
 *
 * Runtime overlay only (does not rewrite settings.json). Escape with
 * `avSoftViewingRespectUserModes: true` when a job must honor light/off modes.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAvSoftViewingPolicy = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function avSoftViewingPolicyFactory() {
    /** Cap GalTransl / Sakura soft windows (default elsewhere is 8). */
    const SOFT_MT_WINDOW_CAP_SAKURA = 3;
    /** Cap Murasaki / Orion soft windows (profiles may ask for 4–6). */
    const SOFT_MT_WINDOW_CAP_SCRIPT = 3;

    function isAvSoftJob(options = {}) {
        const profile = String(
            options.contentProfile
            || options.senseProfile
            || options.profile
            || '',
        ).trim().toLowerCase();
        return profile === 'av_soft';
    }

    function respectUserModes(options = {}) {
        return options.avSoftViewingRespectUserModes === true;
    }

    /**
     * Soft viewing pins clear so pure SFX never flash on screen.
     * @param {object} [options]
     * @param {'off'|'light'|'clear'} mode
     * @returns {'off'|'light'|'clear'}
     */
    function resolveAvSoftViewingCleanMode(options = {}, mode = 'clear') {
        const cur = String(mode || 'clear').trim().toLowerCase();
        const normalized = (cur === 'off' || cur === 'light' || cur === 'clear') ? cur : 'clear';
        if (!isAvSoftJob(options) || respectUserModes(options)) return normalized;
        return 'clear';
    }

    /**
     * Tighten reasoning MT windows for soft jobs unless caller set windowLines.
     * Hy-MT / Index / TranslateGemma already serial-1 — leave those alone.
     * @param {{
     *   promptFamily?: string,
     *   windowLines?: number,
     *   options?: object,
     * }} [input]
     * @returns {number}
     */
    function resolveAvSoftMtWindowLines(input = {}) {
        const options = input.options && typeof input.options === 'object' ? input.options : {};
        let windowLines = Math.max(1, Math.min(20, Math.round(Number(input.windowLines) || 1)));
        if (!isAvSoftJob(options)) return windowLines;
        if (Object.prototype.hasOwnProperty.call(options, 'windowLines')
            && Number.isFinite(Number(options.windowLines))
            && Number(options.windowLines) > 0) {
            // Caller-set window wins (sakura-translate already resolved into options).
            return Math.max(1, Math.min(20, Math.round(Number(options.windowLines))));
        }
        const fam = String(input.promptFamily || options.promptFamily || '').trim().toLowerCase();
        if (fam === 'hymt' || fam === 'hunyuan' || fam === 'index'
            || fam === 'translategemma' || fam === 'translategemmasub') {
            return windowLines;
        }
        if (fam === 'murasaki' || fam === 'orion') {
            return Math.min(windowLines, SOFT_MT_WINDOW_CAP_SCRIPT);
        }
        if (fam === 'sakura' || fam === 'galtransl' || !fam) {
            return Math.min(windowLines, SOFT_MT_WINDOW_CAP_SAKURA);
        }
        return Math.min(windowLines, SOFT_MT_WINDOW_CAP_SAKURA);
    }

    return {
        SOFT_MT_WINDOW_CAP_SAKURA,
        SOFT_MT_WINDOW_CAP_SCRIPT,
        isAvSoftJob,
        resolveAvSoftViewingCleanMode,
        resolveAvSoftMtWindowLines,
    };
}));
