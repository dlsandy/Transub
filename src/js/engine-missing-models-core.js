/**
 * Expected Opus MT ids + missing-model warn copy (pure).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineMissingModels = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineMissingModelsFactory() {
    const DEFAULT_OPUS_MT_BY_LANG = Object.freeze({
        ja: 'opus-mt-ja-zh',
        en: 'opus-mt-en-zh',
        ko: 'opus-mt-ko-zh',
        de: 'opus-mt-de-zh',
        es: 'opus-mt-es-zh',
        fi: 'opus-mt-fi-zh',
        sv: 'opus-mt-sv-zh',
    });
    /** source|apiTarget → opus id (intl pairs beyond *→zh). */
    const DEFAULT_OPUS_MT_BY_PAIR = Object.freeze({
        'ja|zh': 'opus-mt-ja-zh',
        'en|zh': 'opus-mt-en-zh',
        'ko|zh': 'opus-mt-ko-zh',
        'de|zh': 'opus-mt-de-zh',
        'es|zh': 'opus-mt-es-zh',
        'fi|zh': 'opus-mt-fi-zh',
        'sv|zh': 'opus-mt-sv-zh',
        'ja|en': 'opus-mt-ja-en',
    });
    const COMMON_OPUS_IDS = Object.freeze([
        'opus-mt-ja-zh',
        'opus-mt-en-zh',
        'opus-mt-ko-zh',
        'opus-mt-ja-en',
    ]);

    function defaultNormalizeLang(lang) {
        return String(lang || '').trim().toLowerCase().split('-')[0];
    }

    function isLikelyLlmMtId(mt, deps = {}) {
        const id = String(mt || '');
        if (!id) return false;
        if (deps.isSakuraMtModelId?.(id)) return true;
        if (deps.isLlmInferenceMtModel?.(id)) return true;
        return /^(qwen|llama|mistral|gemma|translategemma|chatglm|glm|yi-|deepseek|phi)/i.test(id);
    }

    function engineApiTargetFromSubtitle(raw) {
        const s = String(raw || '').trim();
        if (!s || /^zh/i.test(s) || /hans|hant|simplified|traditional/i.test(s)) return 'zh';
        if (/^en/i.test(s)) return 'en';
        if (/^ko/i.test(s)) return 'ko';
        if (/^ja/i.test(s)) return 'ja';
        return 'zh';
    }

    function pickOpusIdForSourceTarget(srcLang, subtitleTargetLang, langMap, pairMap) {
        const src = String(srcLang || '').trim().toLowerCase().split(/[-_]/)[0];
        if (!src) return '';
        const tgt = engineApiTargetFromSubtitle(subtitleTargetLang);
        const pairs = pairMap || DEFAULT_OPUS_MT_BY_PAIR;
        const pairKey = `${src}|${tgt}`;
        if (pairs[pairKey]) return pairs[pairKey];
        if (tgt !== 'zh') return '';
        const map = langMap || DEFAULT_OPUS_MT_BY_LANG;
        return map[src] || '';
    }

    /**
     * @param {{
     *   task: string,
     *   translateMode: string,
     *   explicitOpusMtId?: string,
     *   formLang?: string,
     *   subtitleTargetLang?: string,
     *   selectedItems?: object[],
     *   opusMtByLang?: object,
     *   opusMtByPair?: object,
     *   normalizeSenseLang?: (lang: string) => string,
     *   isSakuraMtModelId?: (id: string) => boolean,
     *   isLlmInferenceMtModel?: (id: string) => boolean,
     * }} ctx
     */
    /**
     * Opus-MT removed — never expect Helsinki opus-mt-* downloads.
     * Kept for API compatibility; always returns [].
     */
    function resolveExpectedOpusMtModelIds(_ctx = {}) {
        return [];
    }

    function anyCommonOpusMtInstalled(models, commonIds = COMMON_OPUS_IDS) {
        const list = Array.isArray(models) ? models : [];
        return (Array.isArray(commonIds) ? commonIds : COMMON_OPUS_IDS).some((id) => {
            const row = list.find((m) => m.id === id);
            return row && row.installed;
        });
    }

    /**
     * @returns {string} empty when ok; otherwise「未安装：…」
     */
    function warnIfSelectedEngineModelsMissing(ctx = {}) {
        const models = Array.isArray(ctx.cachedEngineModels) ? ctx.cachedEngineModels : [];
        if (!models.length) return '';
        const missing = [];
        const skipAsr = !!ctx.skipAsrModels;
        const asrId = String(ctx.asrModelId || '');
        if (!skipAsr && asrId) {
            const asr = models.find((m) => m.id === asrId);
            if (asr && !asr.installed) {
                missing.push(asr.incomplete ? `${asrId}（不完整）` : asrId);
            }
        }
        const expectedMt = resolveExpectedOpusMtModelIds(ctx);
        if (expectedMt.length) {
            for (const mtId of expectedMt) {
                const mt = models.find((m) => m.id === mtId);
                if (mt && !mt.installed) {
                    missing.push(mt.incomplete ? `${mtId}（不完整）` : mtId);
                } else if (!mt) {
                    missing.push(mtId);
                }
            }
        }
        const asrNeedsFsmn = !skipAsr && (!asrId || !String(asrId).includes('whisper'));
        if (asrNeedsFsmn) {
            const vad = models.find((m) => m.id === 'fsmn-vad');
            if (vad && !vad.installed) {
                missing.push(vad.incomplete ? 'fsmn-vad（不完整）' : 'fsmn-vad');
            }
        }
        return missing.length ? `未安装：${missing.join('、')}，请先下载模型` : '';
    }

    /** Option keys that a recognition preset may require on disk. */
    const PRESET_REQUIRED_MODEL_KEYS = Object.freeze([
        'engineAsrModel',
        'engineVadModel',
    ]);

    /** Runtime-bundled; never prompt a Hub download when applying a preset. */
    const BUNDLED_ALWAYS_READY_MODEL_IDS = Object.freeze(['silero-vad']);

    function isBundledAlwaysReadyModelId(id) {
        return BUNDLED_ALWAYS_READY_MODEL_IDS.includes(String(id || '').trim());
    }

    function collectRequiredModelIdsFromOptions(options = {}, keys = PRESET_REQUIRED_MODEL_KEYS) {
        const out = [];
        const seen = new Set();
        const keyList = Array.isArray(keys) && keys.length ? keys : PRESET_REQUIRED_MODEL_KEYS;
        for (const key of keyList) {
            const id = String(options?.[key] || '').trim();
            if (!id || seen.has(id) || isBundledAlwaysReadyModelId(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out;
    }

    /**
     * @param {string[]} modelIds
     * @param {Array<{id?: string, name?: string, installed?: boolean, incomplete?: boolean}>} catalog
     * @returns {Array<{id: string, name: string, reason: 'missing'|'not_installed'|'incomplete'}>}
     */
    function findMissingCatalogModels(modelIds, catalog = []) {
        const list = Array.isArray(catalog) ? catalog : [];
        const missing = [];
        const seen = new Set();
        for (const raw of (Array.isArray(modelIds) ? modelIds : [])) {
            const id = String(raw || '').trim();
            if (!id || seen.has(id) || isBundledAlwaysReadyModelId(id)) continue;
            seen.add(id);
            const row = list.find((m) => String(m?.id || '') === id);
            if (!row) {
                missing.push({ id, name: id, reason: 'missing' });
                continue;
            }
            if (!row.installed || row.incomplete) {
                missing.push({
                    id,
                    name: String(row.name || id).trim() || id,
                    reason: row.incomplete ? 'incomplete' : 'not_installed',
                });
            }
        }
        return missing;
    }

    function formatMissingModelsLabel(missing) {
        return (Array.isArray(missing) ? missing : []).map((m) => {
            const id = String(m?.id || '').trim();
            const name = String(m?.name || id).trim() || id;
            const label = name && name !== id ? `${name}（${id}）` : (name || id);
            if (!label) return '';
            return m?.reason === 'incomplete' ? `${label}（不完整）` : label;
        }).filter(Boolean).join('、');
    }

    /**
     * @param {{ contextLabel?: string, missing?: object[], settingsHint?: string }} opts
     */
    function buildMissingModelsConfirmCopy(opts = {}) {
        const list = formatMissingModelsLabel(opts.missing);
        const ctx = String(opts.contextLabel || '所选配置').trim() || '所选配置';
        const hint = String(opts.settingsHint || '设置 → 模型').trim() || '设置 → 模型';
        return {
            title: '需要先下载模型',
            message: list
                ? `${ctx}需要以下模型，但本机尚未就绪：\n${list}\n\n请先到「${hint}」下载后再选用。`
                : `${ctx}需要的模型尚未下载到本机。\n\n请先到「${hint}」下载后再选用。`,
            primaryLabel: '去下载',
            secondaryLabel: '取消',
        };
    }

    return {
        DEFAULT_OPUS_MT_BY_LANG,
        DEFAULT_OPUS_MT_BY_PAIR,
        COMMON_OPUS_IDS,
        PRESET_REQUIRED_MODEL_KEYS,
        BUNDLED_ALWAYS_READY_MODEL_IDS,
        resolveExpectedOpusMtModelIds,
        anyCommonOpusMtInstalled,
        warnIfSelectedEngineModelsMissing,
        collectRequiredModelIdsFromOptions,
        findMissingCatalogModels,
        formatMissingModelsLabel,
        buildMissingModelsConfirmCopy,
        pickOpusIdForSourceTarget,
        engineApiTargetFromSubtitle,
    };
}));
