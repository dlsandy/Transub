/**
 * Translation style presets + prompt hints (pure — no DOM).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTranslateStyle = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function translateStyleFactory() {
    const DEFAULT_PRESET = 'natural_spoken';
    const CUSTOM_PRESET = 'custom';
    const STYLE_OPTION_KEYS = Object.freeze([
        'translateStyleEnabled',
        'translateStylePreset',
        'translateStyleCustomNote',
    ]);

    function normalizeTranslateStyleEnabled(raw) {
        if (raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'on') return true;
        if (raw === false || raw === 0 || raw === '0' || raw === 'false' || raw === 'off') return false;
        // Legacy saves had no flag but always applied a preset — treat missing as off (opt-in).
        return false;
    }

    /** @type {ReadonlyArray<{ id: string, label: string, short: string, proOnly?: boolean }>} */
    const PRESETS = Object.freeze([
        { id: 'natural_spoken', label: '自然口语', short: '口语' },
        { id: 'film_dialogue', label: '影视对白', short: '对白' },
        { id: 'anime_ln', label: '动画/轻小说', short: '动画' },
        { id: 'restrained', label: '克制写实', short: '写实' },
        { id: 'news_narration', label: '新闻/旁白', short: '旁白' },
        { id: 'business', label: '商务礼貌', short: '商务' },
        { id: 'classical', label: '文言/古风', short: '古风' },
        { id: 'literal', label: '忠实直译', short: '直译' },
        { id: 'web_slang', label: '网感口语', short: '网感' },
        { id: 'academic', label: '学术/术语', short: '学术' },
        { id: CUSTOM_PRESET, label: '自定义（高级）', short: '自定义', proOnly: true },
    ]);

    const PRESET_IDS = Object.freeze(new Set(PRESETS.map((p) => p.id)));

    const PROMPT_BY_PRESET = Object.freeze({
        natural_spoken: '译文必须是自然口语对白：在忠实还原原文语意的前提下通顺、像人说出口的话，避免翻译腔与书面套话；禁止为顺口而漏译或改意。',
        film_dialogue: '译文必须像影视对白：先忠实还原语意，再求简洁有节奏、像演员说出口；禁止旁白腔、解说腔与书面套话。',
        anime_ln: '译文必须保留动画/轻小说角色口癖与夸张语气，并忠实还原原文语意；禁止改成书面语、新闻腔或旁白。',
        restrained: '译文必须克制写实：平实少修辞，忠实原意；禁止戏谑、网感用语与过度口语化。',
        news_narration: '译文必须是新闻/纪录片旁白体：书面规范、主谓清晰、语意完整；禁止口语语气词、省略与弹幕感。',
        business: '译文必须是商务礼貌体：正式得体、语意准确；禁止俚语、粗口与过度口语。',
        classical: '译文须略文言或半文半白，且忠实原意；禁止现代网络语与弹幕感。',
        literal: '译文必须忠实直译：尽量保留原文结构与措辞，通顺即可；禁止大幅意译润色。',
        web_slang: '译文必须是网感口语：在不改原意的前提下句子更短、更口语化，可带适度弹幕/短视频语感；禁止过火或低俗堆砌。',
        academic: '译文必须是学术/术语体：专名统一、表述准确、忠实原意；禁止比喻与口语化修辞。',
    });

    const HYMT_STYLE_BY_PRESET = Object.freeze({
        natural_spoken: '自然口语；忠实还原语意、不漏译不错译；通顺自然，避免翻译腔',
        film_dialogue: '影视对白；忠实语意；简洁有节奏，像演员说出口的话',
        anime_ln: '动画/轻小说口语；忠实语意；保留角色口癖与语气',
        restrained: '克制写实；忠实语意；平实少修辞',
        news_narration: '新闻/纪录片旁白；忠实语意；书面规范、主谓清晰',
        business: '商务礼貌体；忠实语意；正式得体',
        classical: '半文半白，略古风；忠实语意；勿现代网络语',
        literal: '忠实直译，贴原文结构，少意译润色',
        web_slang: '网感口语；不改原意；短句、口语化，适度弹幕感',
        academic: '学术术语体；忠实准确；少比喻',
    });

    function normalizeTranslateStylePreset(raw, { entitled = true } = {}) {
        const id = String(raw || '').trim().toLowerCase();
        if (!id || id === 'default' || id === 'global') return DEFAULT_PRESET;
        if (id === CUSTOM_PRESET) {
            return entitled ? CUSTOM_PRESET : DEFAULT_PRESET;
        }
        return PRESET_IDS.has(id) ? id : DEFAULT_PRESET;
    }

    function normalizeTranslateStyleCustomNote(raw) {
        return String(raw || '').trim().slice(0, 200);
    }

    function getPresetMeta(id) {
        return PRESETS.find((p) => p.id === id) || PRESETS[0];
    }

    function getPresetLabel(id) {
        return getPresetMeta(id).label;
    }

    function getPresetShortLabel(id) {
        return getPresetMeta(id).short;
    }

    /**
     * @returns {Array<{ id: string, label: string, proOnly?: boolean }>}
     */
    function listPresetOptions({ entitled = true } = {}) {
        return PRESETS.filter((p) => !p.proOnly || entitled).map((p) => ({
            id: p.id,
            label: p.label,
            proOnly: !!p.proOnly,
        }));
    }

    /**
     * Resolve effective style from global + optional per-item override.
     * @param {object} [opts]
     * @returns {{ enabled: boolean, preset: string, customNote: string, label: string, short: string, followGlobal: boolean }}
     */
    function resolveEffectiveTranslateStyle(opts = {}) {
        const entitled = opts.entitled !== false;
        const enabled = normalizeTranslateStyleEnabled(
            opts.enabled != null ? opts.enabled : opts.translateStyleEnabled,
        );
        const globalPreset = normalizeTranslateStylePreset(opts.globalPreset, { entitled });
        const globalNote = normalizeTranslateStyleCustomNote(opts.globalNote);
        const itemPresetRaw = opts.itemPreset;
        const followGlobal = itemPresetRaw == null || String(itemPresetRaw).trim() === '';
        const preset = followGlobal
            ? globalPreset
            : normalizeTranslateStylePreset(itemPresetRaw, { entitled });
        const itemNote = normalizeTranslateStyleCustomNote(opts.itemNote);
        const customNote = preset === CUSTOM_PRESET
            ? (followGlobal ? globalNote : (itemNote || globalNote))
            : '';
        const meta = getPresetMeta(preset);
        return {
            enabled,
            preset,
            customNote,
            label: meta.label,
            short: meta.short,
            followGlobal,
        };
    }

    function resolveFromOptions(options = {}, overrides = {}, entitled = true) {
        const base = options && typeof options === 'object' ? options : {};
        const ov = overrides && typeof overrides === 'object' ? overrides : {};
        const hasItemPreset = Object.prototype.hasOwnProperty.call(ov, 'translateStylePreset');
        const hasItemNote = Object.prototype.hasOwnProperty.call(ov, 'translateStyleCustomNote');
        const enabled = Object.prototype.hasOwnProperty.call(ov, 'translateStyleEnabled')
            ? ov.translateStyleEnabled
            : base.translateStyleEnabled;
        return resolveEffectiveTranslateStyle({
            enabled,
            globalPreset: base.translateStylePreset,
            globalNote: base.translateStyleCustomNote,
            itemPreset: hasItemPreset ? ov.translateStylePreset : null,
            itemNote: hasItemNote ? ov.translateStyleCustomNote : undefined,
            entitled,
        });
    }

    function buildStylePromptLine(resolved) {
        const r = resolved && typeof resolved === 'object'
            ? resolved
            : resolveEffectiveTranslateStyle(resolved || {});
        if (!r.enabled) return '';
        if (r.preset === CUSTOM_PRESET) {
            const note = String(r.customNote || '').trim();
            return note
                ? `【强制译文风格】${note}。全文保持该风格，禁止改成其他文风。`
                    + '禁止输出助手套话；禁止用短问候填充无关对白行。'
                : '';
        }
        const line = PROMPT_BY_PRESET[r.preset] || '';
        if (!line) return '';
        const label = getPresetLabel(r.preset);
        return `【强制译文风格·${label}】${line}`
            + '全文保持该风格，禁止改成其他文风。'
            + '禁止输出「好的」「我会按照要求」「以下是翻译结果」「我来翻译」等助手套话；'
            + '禁止用「早上好」「你好」等短句填充无关对白行。';
    }

    function buildStyleUserPrefix(options = {}) {
        const line = buildStylePromptLine(resolveFromOptions(options));
        return line ? `${line}\n` : '';
    }

    function appendStyleToSystemPrompt(basePrompt, options = {}) {
        const line = buildStylePromptLine(resolveFromOptions(options));
        const base = String(basePrompt || '').trim();
        if (!line) return base;
        return base ? `${base}\n${line}` : line;
    }

    function resolveHyMtStyleHintFromOptions(options = {}) {
        const resolved = resolveFromOptions(options);
        if (!resolved.enabled) return '';
        if (resolved.preset === CUSTOM_PRESET) {
            const note = String(resolved.customNote || '').trim();
            return note || '';
        }
        return HYMT_STYLE_BY_PRESET[resolved.preset] || HYMT_STYLE_BY_PRESET.natural_spoken;
    }

    function buildPolishStyleHint(options = {}) {
        const line = buildStylePromptLine(resolveFromOptions(options));
        if (!line) return '';
        return line.replace(/^译文风格：/, '译文风格要求：');
    }

    function normalizeTranslateStyleOptions(options = {}, { entitled = true } = {}) {
        const enabled = normalizeTranslateStyleEnabled(options.translateStyleEnabled);
        const preset = normalizeTranslateStylePreset(options.translateStylePreset, { entitled });
        const note = preset === CUSTOM_PRESET
            ? normalizeTranslateStyleCustomNote(options.translateStyleCustomNote)
            : '';
        return {
            translateStyleEnabled: enabled,
            translateStylePreset: preset,
            translateStyleCustomNote: note,
        };
    }

    function mergeTranslateStyleOverrides(base = {}, overrides = {}) {
        if (!overrides || typeof overrides !== 'object') return { ...base };
        const out = { ...base };
        for (const key of STYLE_OPTION_KEYS) {
            if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
            out[key] = overrides[key];
        }
        return out;
    }

    function pickTranslateStyleOverrides(patch = {}) {
        const out = {};
        for (const key of STYLE_OPTION_KEYS) {
            if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
            out[key] = patch[key];
        }
        return out;
    }

    /** Per-item override patch; null preset = follow global (omit key). */
    function buildItemStyleOverrides(item = {}, { globalPreset, globalNote } = {}) {
        const rawPreset = item?.translateStylePreset;
        const followGlobal = rawPreset == null || String(rawPreset).trim() === '';
        const ov = {};
        if (!followGlobal) {
            ov.translateStylePreset = normalizeTranslateStylePreset(rawPreset);
            if (ov.translateStylePreset === CUSTOM_PRESET) {
                const note = normalizeTranslateStyleCustomNote(
                    item.translateStyleCustomNote ?? globalNote,
                );
                if (note) ov.translateStyleCustomNote = note;
            }
        } else if (item?.translateStyleCustomNote) {
            // Should not happen without custom preset; ignore.
        }
        return Object.keys(ov).length ? ov : undefined;
    }

    function shouldShowStyleBadge(item = {}, globalPreset = DEFAULT_PRESET) {
        const raw = item?.translateStylePreset;
        if (raw == null || String(raw).trim() === '') return false;
        return normalizeTranslateStylePreset(raw) !== normalizeTranslateStylePreset(globalPreset);
    }

    /**
     * Weak sense → style mapping (user override / explicit item preset wins).
     * @param {object} [input]
     * @returns {{ preset: string, reason: string }|null}
     */
    function suggestTranslateStyleFromSense(input = {}) {
        const profile = String(input.profile || input.contentProfile || '').trim().toLowerCase();
        const presetId = String(input.presetId || input.activePresetId || '').trim().toLowerCase();
        const reasons = Array.isArray(input.reasons) ? input.reasons : [];
        const hint = `${reasons.join(' ')} ${presetId}`.toLowerCase();

        if (/documentary|纪录片|旁白|新闻|资讯|紀錄/.test(hint)) {
            return { preset: 'news_narration', reason: '感知：纪录片/旁白类' };
        }
        if (/anime|动画|アニメ|galgame|gal|轻小说|ova|oad|特番/.test(hint)) {
            return { preset: 'anime_ln', reason: '感知：动画/Gal 类' };
        }
        if (/galtransl|anime-whisper|ja-anime|galgame/.test(presetId)) {
            return { preset: 'anime_ln', reason: '感知：动画/Gal 预设' };
        }
        if (profile === 'av_soft') {
            return { preset: 'natural_spoken', reason: '感知：软声对白' };
        }
        if (profile === 'film') {
            return { preset: 'film_dialogue', reason: '感知：影视对白' };
        }
        if (profile === 'talk') {
            return { preset: 'natural_spoken', reason: '感知：对话节目' };
        }
        return null;
    }

    function canApplySenseStyleSuggestion(item = {}) {
        if (item.translateStyleUserSet) return false;
        const raw = item.translateStylePreset;
        return raw == null || String(raw).trim() === '';
    }

    /**
     * Copy per-item style fields when job start rebuilds list rows.
     * @returns {object} patch (may be empty)
     */
    function pickItemStyleFields(prev = {}) {
        const out = {};
        if (!prev || typeof prev !== 'object') return out;
        if (Object.prototype.hasOwnProperty.call(prev, 'translateStylePreset')) {
            out.translateStylePreset = prev.translateStylePreset;
        }
        if (prev.translateStyleCustomNote) {
            out.translateStyleCustomNote = prev.translateStyleCustomNote;
        }
        if (prev.translateStyleUserSet) out.translateStyleUserSet = true;
        if (prev.translateStyleSenseSuggested) out.translateStyleSenseSuggested = true;
        return out;
    }

    /**
     * Apply weak style suggestion onto item when it differs from global default.
     * @returns {{ preset: string, reason: string, label: string }|null}
     */
    function applySenseStyleSuggestionToItem(item = {}, globalPreset = DEFAULT_PRESET) {
        if (!canApplySenseStyleSuggestion(item)) return null;
        const suggestion = suggestTranslateStyleFromSense({
            profile: item.sense?.classification?.profile,
            presetId: item.sense?.classification?.presetId,
            reasons: item.sense?.classification?.reasons,
        });
        if (!suggestion?.preset) return null;
        if (normalizeTranslateStylePreset(suggestion.preset)
            === normalizeTranslateStylePreset(globalPreset)) {
            return null;
        }
        item.translateStylePreset = suggestion.preset;
        item.translateStyleSenseSuggested = true;
        return {
            ...suggestion,
            label: getPresetLabel(suggestion.preset),
        };
    }

    return {
        DEFAULT_PRESET,
        CUSTOM_PRESET,
        PRESETS,
        STYLE_OPTION_KEYS,
        normalizeTranslateStyleEnabled,
        normalizeTranslateStylePreset,
        normalizeTranslateStyleCustomNote,
        normalizeTranslateStyleOptions,
        getPresetLabel,
        getPresetShortLabel,
        listPresetOptions,
        resolveEffectiveTranslateStyle,
        resolveFromOptions,
        buildStylePromptLine,
        buildStyleUserPrefix,
        appendStyleToSystemPrompt,
        resolveHyMtStyleHintFromOptions,
        buildPolishStyleHint,
        mergeTranslateStyleOverrides,
        pickTranslateStyleOverrides,
        buildItemStyleOverrides,
        shouldShowStyleBadge,
        suggestTranslateStyleFromSense,
        canApplySenseStyleSuggestion,
        pickItemStyleFields,
        applySenseStyleSuggestionToItem,
    };
}));
