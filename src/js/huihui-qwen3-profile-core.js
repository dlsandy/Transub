/**
 * Huihui Qwen3 Abliterated — translate / polish profile (sampling + short prompt addons).
 * Meaning-first, fluency second; no network.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubHuihuiQwen3Profile = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function huihuiQwen3ProfileFactory() {
    /** Short system-prompt addon for line MT / chat translate. */
    const LINE_PROMPT_ADDON = [
        'Huihui/消融模型专属：先忠实还原原文语意与极性（动作、对象、否定/疑问），再口语通顺；',
        '禁止为顺口整句换写或同义漂改；无成人锚点的对白禁止性化或加戏。',
        '非自我介绍条目禁止输出「哦/啊/我 + 人名」名片残句（如「哦 佑佳」「我 佑佳」）；',
        '人名只在原文确有该称呼时出现，禁止把片头角色名盖到无关短句上。',
    ].join('');

    /** Short system-prompt addon for plot polish. */
    const POLISH_PROMPT_ADDON = [
        'Huihui/消融模型润色：只修欠译/错译/病句与称呼；禁止为顺口整句换写或改意图；',
        '无成人锚点时禁止性化。',
    ].join('');

    function probeString(modelIdOrEntry) {
        if (modelIdOrEntry == null) return '';
        if (typeof modelIdOrEntry === 'object') {
            return [
                modelIdOrEntry.id,
                modelIdOrEntry.fileName,
                modelIdOrEntry.name,
                modelIdOrEntry.ggufUrl,
            ].map((x) => String(x || '')).join(' ');
        }
        return String(modelIdOrEntry || '');
    }

    /**
     * @param {string|object|null|undefined} modelIdOrEntry
     * @returns {boolean}
     */
    function isHuihuiQwen3Model(modelIdOrEntry) {
        const s = probeString(modelIdOrEntry).toLowerCase();
        if (!s.trim()) return false;
        // Qwen chat/LLM only — exclude Huihui Hunyuan / HY-MT packs (translate-only).
        if (/hunyuan|hy[-_]?mt|chimera/i.test(s) && !/qwen/i.test(s)) return false;
        if (/huihui/.test(s) && /qwen/i.test(s)) return true;
        if (/qwen3(?:\.5)?[-_]?\d+(?:\.\d+)?b[-_]?abliterated/.test(s)) return true;
        if (/qwen35[-_]?\d+(?:\.\d+)?b[-_]?abliterated/.test(s)) return true;
        if (/abliterated/.test(s) && /qwen3/.test(s)) return true;
        return false;
    }

    /**
     * Approximate dense / total param size from id / filename (2 / 4 / 8 / 9 / 14 / 30 / 35…).
     * @param {string|object|null|undefined} modelIdOrEntry
     * @returns {number}
     */
    function resolveHuihuiParamBillion(modelIdOrEntry) {
        if (modelIdOrEntry && typeof modelIdOrEntry === 'object') {
            const pb = Number(modelIdOrEntry.paramBillion);
            if (Number.isFinite(pb) && pb > 0) return pb;
        }
        const s = probeString(modelIdOrEntry);
        const m = s.match(/qwen3\.5[-_]?(\d+(?:\.\d+)?)b/i)
            || s.match(/qwen35[-_]?(\d+(?:\.\d+)?)b/i)
            || s.match(/qwen3[-_]?(\d+(?:\.\d+)?)b/i)
            || s.match(/(\d+(?:\.\d+)?)b[-_]?a\d+b/i)
            || s.match(/(\d+(?:\.\d+)?)b[-_]?abliterated/i);
        if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n) && n > 0) return n;
        }
        return 8;
    }

    /**
     * @param {string|object|null|undefined} modelIdOrEntry
     * @returns {null|{
     *   temperature: number,
     *   polishTemperature: number,
     *   topP: number,
     *   repeatPenalty: number,
     *   frequencyPenalty: number,
     *   disableThinking: true,
     *   linePromptAddon: string,
     *   polishPromptAddon: string,
     *   preferPlotPolish: true,
     *   preferFaithfulVerify: true,
     *   paramBillion: number,
     * }}
     */
    function resolveHuihuiTranslateProfile(modelIdOrEntry) {
        if (!isHuihuiQwen3Model(modelIdOrEntry)) return null;
        const pb = resolveHuihuiParamBillion(modelIdOrEntry);
        let temperature = 0.15;
        let polishTemperature = 0.23;
        if (pb <= 4.5) {
            temperature = 0.14;
            polishTemperature = 0.22;
        } else if (pb >= 12) {
            temperature = 0.16;
            polishTemperature = 0.24;
        }
        return {
            temperature,
            polishTemperature,
            topP: 0.8,
            repeatPenalty: 1.08,
            frequencyPenalty: 0.12,
            disableThinking: true,
            linePromptAddon: LINE_PROMPT_ADDON,
            polishPromptAddon: POLISH_PROMPT_ADDON,
            preferPlotPolish: true,
            preferFaithfulVerify: true,
            paramBillion: pb,
        };
    }

    /**
     * Catalog-shaped chatDefaults fragment (no prompt strings).
     * @param {string|object|null|undefined} modelIdOrEntry
     * @returns {null|object}
     */
    function resolveHuihuiChatDefaults(modelIdOrEntry) {
        const p = resolveHuihuiTranslateProfile(modelIdOrEntry);
        if (!p) return null;
        return {
            disableThinking: true,
            temperature: p.temperature,
            polishTemperature: p.polishTemperature,
            topP: p.topP,
            repeatPenalty: p.repeatPenalty,
            frequencyPenalty: p.frequencyPenalty,
        };
    }

    /**
     * @param {'line'|'polish'} [role]
     * @param {string|object|null|undefined} modelIdOrEntry
     * @returns {string}
     */
    function getHuihuiPromptAddon(modelIdOrEntry, role = 'line') {
        const p = resolveHuihuiTranslateProfile(modelIdOrEntry);
        if (!p) return '';
        return role === 'polish' ? p.polishPromptAddon : p.linePromptAddon;
    }

    return {
        LINE_PROMPT_ADDON,
        POLISH_PROMPT_ADDON,
        isHuihuiQwen3Model,
        resolveHuihuiParamBillion,
        resolveHuihuiTranslateProfile,
        resolveHuihuiChatDefaults,
        getHuihuiPromptAddon,
    };
}));
