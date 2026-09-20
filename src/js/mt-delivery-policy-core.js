/**
 * MT delivery policy: never write raw ZH recovery onto non-Chinese 成片.
 * Intl may still use localized short-fill / adult surfaces.
 */
(function (global, factory) {
    let targetLangCore = null;
    try {
        targetLangCore = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-target-lang-core')
            : (global && global.TransubSubtitleTargetLang);
    } catch {
        targetLangCore = null;
    }
    const api = factory(targetLangCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtDeliveryPolicy = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtDeliveryPolicyFactory(targetLangCore) {
    function resolveLayers(options = {}) {
        if (options && options._sanitizeLayers && typeof options._sanitizeLayers === 'object') {
            return options._sanitizeLayers;
        }
        if (targetLangCore?.resolveSanitizeLayers) {
            return targetLangCore.resolveSanitizeLayers(options || {});
        }
        const lang = String(options?.subtitleTargetLang || options?.targetLang || 'zh-Hans');
        const zhDeep = /^zh/i.test(lang) || /中文|hans|hant/i.test(lang) || !lang;
        return {
            lang: zhDeep ? (lang || 'zh-Hans') : lang,
            zhDeep,
            zhBlankRecover: zhDeep,
        };
    }

    /** True when deterministic ZH blank-fill / adult recover may write. */
    function mayWriteZhRecovery(options = {}) {
        const layers = resolveLayers(options);
        if (layers.zhBlankRecover === false || layers.zhDeep === false) return false;
        if (targetLangCore?.isZhSubtitleTarget) {
            return targetLangCore.isZhSubtitleTarget(layers.lang);
        }
        return true;
    }

    function isZhDeliveryTarget(options = {}) {
        return mayWriteZhRecovery(options);
    }

    /**
     * Fill blank/ellipsis for any 成片语.
     * ZH: opaque recover + short ZH tables.
     * Intl: localized short-fill / adult surfaces only (never raw ZH).
     */
    function fillBlankForTarget(text, sourceText, options = {}, helpers = {}) {
        const cur = String(text ?? '');
        const src = String(sourceText ?? '');
        if (!src.trim()) return { text: cur, changed: false, skipped: true };
        const mtSanitize = helpers.mtSanitize
            || (typeof require === 'function' ? (() => {
                try { return require('./mt-sanitize-core'); } catch { return null; }
            })() : null);
        const smartCore = helpers.smartCore
            || (typeof require === 'function' ? (() => {
                try { return require('./advanced-smart-translate-core'); } catch { return null; }
            })() : null);

        if (mtSanitize?.recoverBlankedAdultZh) {
            const recovered = mtSanitize.recoverBlankedAdultZh(cur, src, options);
            if (recovered?.changed && String(recovered.text || '').trim()
                && !mtSanitize.isEllipsisOrEmptyZh?.(recovered.text)) {
                return { text: recovered.text, changed: true, via: 'recoverBlankedAdultZh' };
            }
        }
        const fb = smartCore?.fallbackShortJaCue?.(src, options);
        if (fb && String(fb).trim() && !mtSanitize?.isEllipsisOrEmptyZh?.(fb)) {
            return { text: fb, changed: true, via: 'fallbackShortJaCue' };
        }
        return { text: cur, changed: false };
    }

    /**
     * Whether delivery may DELETE moan/SFX/debris ellipsis slots (and paired JA).
     * Gate:「完成后清理杂音 / 幻觉短句」(postBatchRemoveNoise). Fill/recover stays allowed.
     * Explicit dropUselessEllipsis:false still blocks mid-pipeline blank-retry keep-slots.
     */
    function mayDropUselessEllipsis(options = {}) {
        const o = options && typeof options === 'object' ? options : {};
        if (o.postBatchRemoveNoise === false) return false;
        if (o.dropUselessEllipsis === false) return false;
        return true;
    }

    return {
        resolveLayers,
        mayWriteZhRecovery,
        isZhDeliveryTarget,
        fillBlankForTarget,
        mayDropUselessEllipsis,
    };
}));
