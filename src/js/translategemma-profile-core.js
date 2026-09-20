/**
 * Translate Gemma / Gemma 4 Sub — MT profile (sampling + short prompt addons).
 * Meaning-first, fluency second; no network.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTranslateGemmaProfile = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function translategemmaProfileFactory() {
    /**
     * Short addon for official prompts (natural user text, or optional system beside structured JSON).
     * Tuned from JA→ZH subtitle failure shapes: self-ID drift, invented plot, short-cue expansion.
     */
    const OFFICIAL_PROMPT_ADDON = [
        'TranslateGemma profile: preserve meaning, polarity (negation/questions), tone and slang first; ',
        'do not paraphrase for fluency; do not invent plot, exams, romance, or adult content without clear source anchors. ',
        'Japanese 「Nameです／だよ」 is speaker self-ID (first person), never address Name as “you”. ',
        'Pure laughter, breath, or onomatopoeia stay short — do not expand into full sentences. ',
        'Never replace a cue that has real words with only “…”/“...” — translate the words; keep trailing ellipsis as …… when the source trails off. ',
        'Never refuse or sanitize: do not output safety boilerplate (e.g. “I cannot process sensitive content”); always return a dialogue translation. ',
        'Never output translator meta (e.g. “I will translate”, “帮你翻译”).',
    ].join('');

    /** Short addon appended to Translate Gemma 4 Sub system prompt. */
    const SUB_PROMPT_ADDON = [
        'TranslateGemma Sub profile: preserve meaning, polarity, tone, slang and incomplete speech; ',
        'do not paraphrase for fluency; do not invent plot, exams, romance, friendship claims, or adult content without anchors. ',
        'PREVIOUS_SOURCE / PREVIOUS_TRANSLATION are context only — translate only CURRENT_SOURCE. ',
        'Never copy names, self-ID, or wording from PREVIOUS into CURRENT. ',
        'Never emit stuck name-card lines (e.g. “我叫X” / “X 我是你”) unless CURRENT itself is a self-intro. ',
        'If CURRENT is only laughter/breath/onomatopoeia/effort (頑張る/行く), keep it short; do not reuse prior identity lines. ',
        'Never replace lexical CURRENT with only “…”/“...” — translate content; preserve trailing ellipsis as …… when source trails off. ',
        'Never refuse or sanitize: never output safety boilerplate; always translate the spoken line. ',
        'Never output translator meta (e.g. “I will translate”, “帮你翻译”).',
        'When the target language is English: keep soft moans, breath, and effort as short English '
            + '(Ah / Nngh / Hah…); do not expand into narration; never output Chinese characters.',
    ].join('');

    function probeString(modelIdOrEntry) {
        if (modelIdOrEntry == null) return '';
        if (typeof modelIdOrEntry === 'object') {
            return [
                modelIdOrEntry.id,
                modelIdOrEntry.fileName,
                modelIdOrEntry.name,
                modelIdOrEntry.ggufUrl,
                modelIdOrEntry.promptFamily,
                modelIdOrEntry.family,
            ].map((x) => String(x || '')).join(' ');
        }
        return String(modelIdOrEntry || '');
    }

    function isTranslateGemmaSubModel(modelIdOrEntry) {
        const s = probeString(modelIdOrEntry).toLowerCase();
        if (!s.trim()) return false;
        if (s === 'translategemmasub' || s === 'translate-gemma-sub') return true;
        return /translategemma-.*-sub|translate[-_]?gemma[-_]?4[-_]?sub|gemma4[-_]?sub|translategemmasub/i.test(s);
    }

    /**
     * @param {string|object|null|undefined} modelIdOrEntry
     * @returns {boolean}
     */
    function isTranslateGemmaProfileModel(modelIdOrEntry) {
        const s = probeString(modelIdOrEntry).toLowerCase();
        if (!s.trim()) return false;
        if (isTranslateGemmaSubModel(s)) return true;
        if (s === 'translategemma' || s === 'translate-gemma') return true;
        return /translategemma|translate[-_]?gemma/i.test(s);
    }

    /**
     * Approximate dense param size from id / filename (4 / 12 / 27).
     * @param {string|object|null|undefined} modelIdOrEntry
     * @returns {number}
     */
    function resolveTranslateGemmaParamBillion(modelIdOrEntry) {
        if (modelIdOrEntry && typeof modelIdOrEntry === 'object') {
            const pb = Number(modelIdOrEntry.paramBillion);
            if (Number.isFinite(pb) && pb > 0) return pb;
        }
        const s = probeString(modelIdOrEntry);
        const m = s.match(/translategemma[-_]?(\d+(?:\.\d+)?)b/i)
            || s.match(/translate[-_]?gemma[-_]?(\d+(?:\.\d+)?)b/i)
            || s.match(/(\d+(?:\.\d+)?)b[-_]?(?:it|sub)?/i);
        if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n) && n > 0) return n;
        }
        if (isTranslateGemmaSubModel(modelIdOrEntry)) return 4;
        return 12;
    }

    /**
     * @param {string|object|null|undefined} modelIdOrEntry
     * @returns {null|{
     *   temperature: number,
     *   topP: number,
     *   repetitionPenalty: number,
     *   isSub: boolean,
     *   preferSerialChunks: boolean,
     *   officialPromptAddon: string,
     *   subPromptAddon: string,
     *   paramBillion: number,
     * }}
     */
    function resolveTranslateGemmaTranslateProfile(modelIdOrEntry) {
        if (!isTranslateGemmaProfileModel(modelIdOrEntry)) return null;
        const isSub = isTranslateGemmaSubModel(modelIdOrEntry);
        const pb = resolveTranslateGemmaParamBillion(modelIdOrEntry);
        let temperature = 0.25;
        let topP = 0.9;
        let repetitionPenalty = 1.06;
        if (isSub) {
            temperature = 0;
            topP = 0.9;
            repetitionPenalty = 1.05;
        } else if (pb <= 4.5) {
            temperature = 0.2;
            topP = 0.85;
            repetitionPenalty = 1.08;
        } else if (pb >= 24) {
            temperature = 0.3;
            topP = 0.9;
            repetitionPenalty = 1.05;
        }
        return {
            temperature,
            topP,
            repetitionPenalty,
            isSub,
            preferSerialChunks: isSub,
            /** Allow a short system addon beside official structured JSON user payload. */
            preferSystemAddon: !isSub,
            officialPromptAddon: OFFICIAL_PROMPT_ADDON,
            subPromptAddon: SUB_PROMPT_ADDON,
            paramBillion: pb,
        };
    }

    /**
     * Catalog-shaped MT defaults fragment (no prompt strings).
     * @param {string|object|null|undefined} modelIdOrEntry
     * @returns {null|object}
     */
    function resolveTranslateGemmaMtDefaults(modelIdOrEntry) {
        const p = resolveTranslateGemmaTranslateProfile(modelIdOrEntry);
        if (!p) return null;
        return {
            temperature: p.temperature,
            topP: p.topP,
            repetitionPenalty: p.repetitionPenalty,
        };
    }

    /**
     * @param {string|object|null|undefined} modelIdOrEntry
     * @param {'official'|'sub'} [role]
     * @returns {string}
     */
    function getTranslateGemmaPromptAddon(modelIdOrEntry, role = 'official') {
        const p = resolveTranslateGemmaTranslateProfile(modelIdOrEntry);
        if (!p) return '';
        if (role === 'sub' || p.isSub) return p.subPromptAddon;
        return p.officialPromptAddon;
    }

    return {
        OFFICIAL_PROMPT_ADDON,
        SUB_PROMPT_ADDON,
        isTranslateGemmaProfileModel,
        isTranslateGemmaSubModel,
        resolveTranslateGemmaParamBillion,
        resolveTranslateGemmaTranslateProfile,
        resolveTranslateGemmaMtDefaults,
        getTranslateGemmaPromptAddon,
    };
}));
