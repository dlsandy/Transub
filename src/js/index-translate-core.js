/**
 * IndexTeam Index-Translate multilingual subtitle prompts + inference knobs (no network).
 * Official Chinese instruction template; greedy decode; thinking off.
 * @see https://huggingface.co/IndexTeam/Index-Translate-35B-A3B-preview
 * @see https://github.com/bilibili/Index-Translate
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubIndexTranslate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function indexTranslateCoreFactory() {
    function loadSakuraCore() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./sakura-translate-core')
                : (global && global.TransubSakuraTranslate);
        } catch (_) {
            return null;
        }
    }

    function loadTargetLangCore() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-target-lang-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleTargetLang : null);
        } catch (_) {
            return null;
        }
    }

    const INDEX_STOP_TOKENS = Object.freeze([
        '<|im_end|>',
        '<|endoftext|>',
        '<|im_start|>',
    ]);

    const INDEX_SUBTITLE_CONTEXT_SIZE = 8192;
    const INDEX_WINDOW_LINES_DEFAULT = 1;
    const INDEX_MAX_TERMINOLOGY = 16;

    const INDEX_INFERENCE = Object.freeze({
        // Official GGUF card: temperature 0 + enable_thinking false.
        temperature: 0,
        top_p: 1,
        repetition_penalty: 1.05,
        contextSize: INDEX_SUBTITLE_CONTEXT_SIZE,
        cachePrompt: true,
        llamaJinja: true,
        windowLines: INDEX_WINDOW_LINES_DEFAULT,
        enableThinking: false,
        stop: INDEX_STOP_TOKENS,
    });

    /** Source language → Chinese name used by Index training prompts. */
    const SOURCE_LANG_ZH = Object.freeze({
        ja: '日语',
        en: '英语',
        ko: '韩语',
        zh: '中文',
        'zh-cn': '中文',
        'zh-hans': '中文',
        'zh-hant': '中文',
        yue: '粤语',
        'zh-yue': '粤语',
        cantonese: '粤语',
        de: '德语',
        fr: '法语',
        es: '西班牙语',
        ru: '俄语',
        vi: '越南语',
        th: '泰语',
        id: '印尼语',
        pt: '葡萄牙语',
        it: '意大利语',
        ar: '阿拉伯语',
        hi: '印地语',
    });

    /** Target language → Chinese name (Index prompt uses 英语 / 简体中文 …). */
    const TARGET_LANG_ZH = Object.freeze({
        en: '英语',
        ja: '日语',
        ko: '韩语',
        'zh-hans': '简体中文',
        zh: '简体中文',
        'zh-hant': '繁体中文',
        'zh-hant-tw': '繁体中文',
        'zh-hant-hk': '繁体中文（香港）',
    });

    function isIndexTranslateModel(modelIdOrFamily) {
        const s = String(modelIdOrFamily || '').trim().toLowerCase();
        if (!s) return false;
        if (s === 'index' || s === 'indextranslate' || s === 'index-translate') return true;
        return /index[-_]?translate|indexteam[-_]?index[-_]?translate/i.test(s);
    }

    function normalizeLangKey(raw) {
        return String(raw || '').trim().toLowerCase();
    }

    function resolveSourceLangZh(options = {}, chunkCues = null) {
        const raw = String(
            options.language || options.sourceLanguage || options.sourceLang || '',
        ).trim().toLowerCase();
        if (!raw || raw === 'auto' || raw === 'unknown') return '';
        if (SOURCE_LANG_ZH[raw]) return SOURCE_LANG_ZH[raw];
        const base = raw.split(/[-_]/)[0];
        if (SOURCE_LANG_ZH[base]) return SOURCE_LANG_ZH[base];
        try {
            const tgt = loadTargetLangCore();
            if (typeof tgt?.shouldUseYueToMandarinPrompt === 'function'
                && tgt.shouldUseYueToMandarinPrompt(options, chunkCues)) {
                return '粤语';
            }
        } catch (_) { /* optional */ }
        return '';
    }

    function resolveTargetLangZh(options = {}) {
        const tgt = loadTargetLangCore();
        let lang = '';
        try {
            if (typeof tgt?.resolveSubtitleTargetLang === 'function') {
                lang = String(tgt.resolveSubtitleTargetLang(options) || '').trim();
            }
        } catch (_) { /* optional */ }
        if (!lang) {
            lang = String(
                options.subtitleTargetLang || options.targetLang || options.targetLanguage || 'zh-Hans',
            ).trim();
        }
        const key = String(lang || '').trim().toLowerCase();
        if (TARGET_LANG_ZH[key]) return TARGET_LANG_ZH[key];
        const base = key.split(/[-_]/)[0];
        if (base === 'zh') {
            if (/hant|tw|hk|繁/.test(key)) return '繁体中文';
            return '简体中文';
        }
        if (TARGET_LANG_ZH[base]) return TARGET_LANG_ZH[base];
        try {
            if (typeof tgt?.subtitleTargetLangLabel === 'function') {
                const label = String(tgt.subtitleTargetLangLabel(lang) || '').trim();
                if (label === 'English') return '英语';
                if (label === '日本語') return '日语';
                if (label === '한국어') return '韩语';
                if (label) return label;
            }
        } catch (_) { /* optional */ }
        return '简体中文';
    }

    function resolveIndexInferenceOptions(_options = {}) {
        return { ...INDEX_INFERENCE };
    }

    function formatIndexGlossaryBlock(glossaryTerms, options = {}) {
        const sakura = loadSakuraCore();
        const max = Math.max(0, Math.min(
            INDEX_MAX_TERMINOLOGY,
            Number(options.indexMaxTerminology) || INDEX_MAX_TERMINOLOGY,
        ));
        const block = sakura?.formatGlossaryBlock
            ? sakura.formatGlossaryBlock(glossaryTerms, { maxTerms: max })
            : '';
        if (!block) return '';
        const lines = String(block).split('\n').map((line) => String(line || '').trim()).filter(Boolean);
        if (!lines.length) return '';
        return `术语约束（必须遵守）：\n${lines.join('\n')}`;
    }

    /**
     * Official Index-Translate user content (Chinese instruction template).
     * Multi-line: keep equal newlines; no explanations.
     */
    function buildIndexUserContent(chunkCuesList, options = {}) {
        const sakura = loadSakuraCore();
        const list = sakura?.normalizeCueList
            ? sakura.normalizeCueList(chunkCuesList)
            : (Array.isArray(chunkCuesList) ? chunkCuesList : []);
        const joined = list.map((c) => String(c?.text || '').trim()).join('\n');
        const targetZh = resolveTargetLangZh(options);
        const sourceZh = resolveSourceLangZh(options, list);
        const terms = sakura?.resolveGlossaryTermsForPrompt
            ? sakura.resolveGlossaryTermsForPrompt({ ...options, promptFamily: 'index' }, joined)
            : (Array.isArray(options.glossaryTerms) ? options.glossaryTerms : []);
        const glossary = formatIndexGlossaryBlock(terms, options);
        const n = Math.max(1, list.length);
        const head = sourceZh
            ? `请将以下${sourceZh}文本翻译为${targetZh}，直接输出翻译结果，不要进行任何解释。`
            : `请将以下文本翻译为${targetZh}，直接输出翻译结果，不要进行任何解释。`;
        const parts = [];
        if (glossary) {
            parts.push(glossary, '');
            parts.push(
                n > 1
                    ? `请将以下文本翻译为${targetZh}，并且严格遵循所有约束要求；保留等量换行、不可漏行；直接输出翻译结果，不要进行任何解释。`
                    : `请将以下文本翻译为${targetZh}，并且严格遵循所有约束要求；直接输出翻译结果，不要进行任何解释。`,
            );
        } else if (n > 1) {
            parts.push(`${head}保留等量换行、不可漏行。`);
        } else {
            parts.push(head);
        }
        if (options._blankRetry || options._ellipsisHardFail || options.indexMinimalPrompt) {
            parts.push('有字须译；禁止省略号或空白代替译文。');
        } else if (n === 1) {
            // Soft-AV short cues (やっほー / あいさつ) often collapse to … without this nudge.
            parts.push('短句也须译出语义或语气；禁止仅用省略号代替译文。');
        }
        parts.push('', joined);
        let content = parts.join('\n');
        try {
            const emoApi = (typeof module !== 'undefined' && module.exports)
                ? require('./sensevoice-emotion-mt-style-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSensevoiceEmotionMtStyle : null);
            if (emoApi?.appendEmotionHintToUserContent) {
                content = emoApi.appendEmotionHintToUserContent(content, list, options);
            }
        } catch { /* optional */ }
        return content;
    }

    function buildIndexChatMessages(chunkCuesList, options = {}) {
        return [{ role: 'user', content: buildIndexUserContent(chunkCuesList, options) }];
    }

    /** Instruction fragments Index sometimes echoes as cue text. */
    const INDEX_META_LINE_RES = Object.freeze([
        /请将以下(?:[\u4e00-\u9fff]{0,8})?文本翻译为[\u4e00-\u9fffA-Za-z]{2,24}[^。\n]*/g,
        /直接输出翻译结果[^。\n]*/g,
        /不要进行任何解释[^。\n]*/g,
        /并且严格遵循所有约束要求[^。\n]*/g,
        /保留等量换行[^。\n]*/g,
        /术语约束（必须遵守）[：:]?/g,
        /有字须译[^。\n]*/g,
        /禁止省略号或空白代替译文[^。\n]*/g,
        /短句也须译出语义或语气[^。\n]*/g,
    ]);

    function stripIndexLeak(text) {
        let t = String(text || '');
        for (const re of INDEX_META_LINE_RES) {
            t = t.replace(re, '');
        }
        return t.replace(/\n{3,}/g, '\n\n').trim();
    }

    function looksLikeIndexPromptLeak(text) {
        const s = String(text || '');
        if (!s.trim()) return false;
        return /请将以下.*翻译为/.test(s)
            || /直接输出翻译结果/.test(s)
            || /不要进行任何解释/.test(s)
            || /严格遵循所有约束要求/.test(s);
    }

    return {
        INDEX_INFERENCE,
        INDEX_STOP_TOKENS,
        INDEX_SUBTITLE_CONTEXT_SIZE,
        INDEX_WINDOW_LINES_DEFAULT,
        INDEX_MAX_TERMINOLOGY,
        isIndexTranslateModel,
        resolveSourceLangZh,
        resolveTargetLangZh,
        resolveIndexInferenceOptions,
        formatIndexGlossaryBlock,
        buildIndexUserContent,
        buildIndexChatMessages,
        stripIndexLeak,
        looksLikeIndexPromptLeak,
        normalizeLangKey,
    };
}));
