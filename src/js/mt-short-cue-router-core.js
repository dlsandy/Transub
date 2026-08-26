/**
 * Hybrid MT: route ultra-short low-semantic JA cues to a small Sakura model.
 * Conservative whitelist — lexical short lines stay on the main GalTransl model.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtShortCueRouter = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtShortCueRouterFactory() {
    const DEFAULT_SMALL_MT_MODEL_ID = 'sakura-1.5b';
    const SMALL_MT_MODEL_PREF = Object.freeze(['sakura-1.5b']);
    const MAX_SHORT_CUE_GRAPHEMES = 6;

    /** Short JA with semantic skeleton — never route to small model. */
    const LEXICAL_BLOCK_RE = /(?:待っ|やめ|我慢|気持|お願い|先輩|大丈夫|本当|ほんと|だめ|ダメ|駄目|恥ずか|来て|行[っく]|見て|知っ|言[っわ]|思[うっ]|し[てた]|いい|ちょっ|変|好き|嫌|違|無理|痛|深|中|出)/u;

    const PURE_INTERJECTION_RE = /^(?:うん|ん|んー|んっ|あ|ああ|あぁ|はい|え|え\?|へ\?|ふ|ふふ|ふふっ|うふ|うふふ|はぁ+|ハァ+|んん+|あん|あんっ|くっ|ちっ|お|おっ|ひゃ|ひょ)[!！?？…。．.〜～ー]*$/u;

    const MOAN_SFX_ONLY_RE = /^[はハはぁアァあぅうゥウんンー〜～っッふフひヒへヘほホくクちチ!！?？…。．.\s♡♥❤、，,。.]+$/u;

    function normalizeJaSource(text) {
        return String(text ?? '').trim().replace(/\s+/g, '');
    }

    function graphemeLen(text) {
        return [...String(text || '')].length;
    }

    function hasKanji(text) {
        return /[一-龯々〆ヵヶ]/.test(String(text || ''));
    }

    function normalizeRoutingEnabled(value) {
        if (value === false || value === 0) return false;
        const v = String(value ?? '').trim().toLowerCase();
        if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
        return true;
    }

    /**
     * @param {string} text JA source cue
     * @returns {boolean}
     */
    function isWhitelistShortJaCue(text) {
        const s = normalizeJaSource(text);
        if (!s) return false;
        if (hasKanji(s)) return false;
        if (graphemeLen(s) > MAX_SHORT_CUE_GRAPHEMES) return false;
        if (LEXICAL_BLOCK_RE.test(s)) return false;
        if (/^[…・.…]+$/u.test(s)) return true;
        if (PURE_INTERJECTION_RE.test(s)) return true;
        if (graphemeLen(s) <= 4 && MOAN_SFX_ONLY_RE.test(s)) return true;
        if (graphemeLen(s) <= 3 && MOAN_SFX_ONLY_RE.test(s.replace(/[!！?？…。．.〜～ー]+/gu, ''))) {
            return true;
        }
        return false;
    }

    /**
     * @param {{ installedIds?: string[], mainModelId?: string }} [input]
     * @returns {string}
     */
    function pickSmallMtModelId(input = {}) {
        const mainId = String(input.mainModelId || '').trim().toLowerCase();
        if (mainId.includes('1.5b') || mainId.includes('1.7b')) return '';
        const installed = (Array.isArray(input.installedIds) ? input.installedIds : [])
            .map((x) => String(x || '').trim())
            .filter(Boolean);
        const lower = new Map(installed.map((id) => [id.toLowerCase(), id]));
        for (const pref of SMALL_MT_MODEL_PREF) {
            const hit = lower.get(pref.toLowerCase());
            if (hit) return hit;
        }
        return '';
    }

    /**
     * @param {Array<{ index?: number, text?: string }>} cues
     * @param {object} [options]
     * @returns {{
     *   llmCues: Array,
     *   smallModelCues: Array,
     *   smallModelId: string,
     *   routed: number,
     * }}
     */
    function partitionHybridMtCues(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const empty = {
            llmCues: list.slice(),
            smallModelCues: [],
            smallModelId: '',
            routed: 0,
        };
        // Engine ASR→MT batches must not swap 1.5B↔7B (VRAM thrash / llama crash).
        if (options.allowModelSwap === false || options.engineExternalMt === true) {
            return empty;
        }
        const enabled = normalizeRoutingEnabled(
            options.enabled ?? options.hybridShortCueRouting,
        );
        const smallModelId = enabled
            ? pickSmallMtModelId({
                installedIds: options.installedIds,
                mainModelId: options.mainModelId,
            })
            : '';
        if (!smallModelId) return empty;

        const llmCues = [];
        const smallModelCues = [];
        for (const cue of list) {
            const src = String(cue?.text ?? '').trim();
            if (!src) {
                llmCues.push(cue);
                continue;
            }
            if (isWhitelistShortJaCue(src)) {
                smallModelCues.push(cue);
            } else {
                llmCues.push(cue);
            }
        }
        // Swapping models for a handful of cues is slower and less stable than GalTransl alone.
        const minRouted = Math.max(1, Math.min(
            64,
            Number.isFinite(Number(options.minRouted)) ? Math.round(Number(options.minRouted)) : 8,
        ));
        if (smallModelCues.length < minRouted) {
            return empty;
        }
        return {
            llmCues,
            smallModelCues,
            smallModelId,
            routed: smallModelCues.length,
        };
    }

    /**
     * @param {Array} sourceCues
     * @param {...Array} updateLists translated cue rows keyed by index
     * @returns {Array}
     */
    function mergeTranslatedCues(sourceCues, ...updateLists) {
        const map = new Map();
        for (const list of updateLists) {
            for (const u of Array.isArray(list) ? list : []) {
                if (u == null || u.index == null) continue;
                map.set(Number(u.index), String(u.text ?? ''));
            }
        }
        return (Array.isArray(sourceCues) ? sourceCues : []).map((c) => {
            const idx = Number(c?.index);
            if (!map.has(idx)) return c;
            return { ...c, text: map.get(idx) };
        });
    }

    return {
        DEFAULT_SMALL_MT_MODEL_ID,
        MAX_SHORT_CUE_GRAPHEMES,
        normalizeRoutingEnabled,
        isWhitelistShortJaCue,
        pickSmallMtModelId,
        partitionHybridMtCues,
        mergeTranslatedCues,
    };
}));
