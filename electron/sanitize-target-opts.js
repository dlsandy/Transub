/**
 * Pick subtitle target-lang fields for mt-sanitize / external MT adapter.
 */
'use strict';

function pickSanitizeTargetOpts(ctx = {}) {
    const o = ctx && typeof ctx === 'object' ? ctx : {};
    let subtitleTargetLang = o.subtitleTargetLang || o.targetLang || '';
    if (!subtitleTargetLang) {
        try {
            const tgt = require('../src/js/subtitle-target-lang-core');
            subtitleTargetLang = tgt.resolveSubtitleTargetLang(o);
        } catch {
            subtitleTargetLang = '';
        }
    }
    return {
        chineseSubtitleVariant: o.chineseSubtitleVariant,
        subtitleTargetLang: subtitleTargetLang || undefined,
        targetLang: o.targetLang || subtitleTargetLang || undefined,
        targetLanguage: o.targetLanguage,
        nonChineseTarget: o.nonChineseTarget,
        translateTarget: o.translateTarget,
    };
}

/**
 * Resolve 成片目标语 for Engine external MT / smart / sakura calls.
 * Never let bare engine default `targetLanguage: "zh"` clobber subtitleTargetLang.
 *
 * @param {object} [options] session / form options
 * @param {object} [engineParsed] body from Engine POST (may have targetLanguage=zh)
 */
function resolveMtTargetFields(options = {}, engineParsed = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const parsed = engineParsed && typeof engineParsed === 'object' ? engineParsed : {};

    let tgt = null;
    let mtRoute = null;
    try {
        tgt = require('../src/js/subtitle-target-lang-core');
    } catch { /* optional */ }
    try {
        mtRoute = require('../src/js/mt-target-route-core');
    } catch { /* optional */ }

    const bag = {
        subtitleTargetLang: opts.subtitleTargetLang || opts.targetLang || '',
        targetLang: opts.targetLang || opts.subtitleTargetLang || '',
        chineseSubtitleVariant: opts.chineseSubtitleVariant,
        targetLanguage: opts.targetLanguage,
        translateTarget: opts.translateTarget,
        nonChineseTarget: opts.nonChineseTarget,
    };

    // Explicit human / code on options wins; ignore engine bare "zh" when we have subtitleTargetLang
    const optLabel = String(opts.targetLanguage || '').trim();
    const engCode = String(parsed.targetLanguage || '').trim();
    if (!bag.subtitleTargetLang && !bag.targetLang) {
        if (optLabel && optLabel.toLowerCase() !== 'zh') {
            bag.targetLanguage = optLabel;
        } else if (engCode && engCode.toLowerCase() !== 'zh') {
            bag.targetLanguage = engCode;
        } else if (optLabel) {
            bag.targetLanguage = optLabel;
        }
    } else if (optLabel && optLabel.toLowerCase() === 'zh') {
        // Drop misleading engine/API zh when user selected en/ja/ko
        bag.targetLanguage = undefined;
    }

    const lang = tgt?.resolveSubtitleTargetLang
        ? tgt.resolveSubtitleTargetLang(bag)
        : String(bag.subtitleTargetLang || bag.targetLang || 'zh-Hans');
    const route = mtRoute?.resolveMtTargetRoute
        ? mtRoute.resolveMtTargetRoute({ ...opts, ...bag, subtitleTargetLang: lang, targetLang: lang })
        : {
            targetLang: lang,
            isZhTarget: /^zh/i.test(lang),
            engineTargetLanguage: /^en/i.test(lang) ? 'en' : (/^ko/i.test(lang) ? 'ko' : (/^ja/i.test(lang) ? 'ja' : 'zh')),
            targetLanguageLabel: lang === 'en' ? 'English' : lang,
        };

    const label = route.targetLanguageLabel
        || (tgt?.subtitleTargetLangLabel ? tgt.subtitleTargetLangLabel(lang) : lang);
    const variant = tgt?.chineseSubtitleVariantFromTargetLang
        ? tgt.chineseSubtitleVariantFromTargetLang(lang)
        : String(opts.chineseSubtitleVariant || 'simplified');

    return {
        subtitleTargetLang: lang,
        targetLang: lang,
        targetLanguage: label,
        engineTargetLanguage: route.engineTargetLanguage || 'zh',
        chineseSubtitleVariant: variant,
        isZhTarget: route.isZhTarget === true,
        disableHybridMt: route.disableHybridMt === true,
        allowHybridMt: route.disableHybridMt !== true,
    };
}

module.exports = {
    pickSanitizeTargetOpts,
    resolveMtTargetFields,
};
