/**
 * Google TranslateGemma MT prompts + inference knobs (no network).
 * Official chat template expects structured {type,source_lang_code,target_lang_code,text};
 * OpenAI-compat servers receive that object as a JSON string user message (llama.cpp / GGUF).
 * @see https://huggingface.co/google/translategemma-4b-it
 * @see https://ollama.com/library/translategemma
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTranslateGemmaTranslate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function translategemmaTranslateCoreFactory() {
    const TG_STOP_TOKENS = Object.freeze([
        '<end_of_turn>',
        '<eos>',
        '"}\n',
        '" }',
        '"}',
    ]);

    const TG_SUBTITLE_CONTEXT_SIZE = 8192;
    const TG_WINDOW_LINES_DEFAULT = 1;

    const TG_INFERENCE = Object.freeze({
        temperature: 0.3,
        top_p: 0.9,
        repetition_penalty: 1.05,
        contextSize: TG_SUBTITLE_CONTEXT_SIZE,
        cachePrompt: true,
        llamaJinja: true,
        windowLines: TG_WINDOW_LINES_DEFAULT,
        stop: TG_STOP_TOKENS,
    });

    function loadTgProfile() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./translategemma-profile-core')
                : (global && global.TransubTranslateGemmaProfile);
        } catch (_) {
            return null;
        }
    }

    /** English display names for the Ollama-style natural prompt fallback. */
    const LANG_EN_NAMES = Object.freeze({
        aa: 'Afar',
        ab: 'Abkhazian',
        af: 'Afrikaans',
        am: 'Amharic',
        ar: 'Arabic',
        as: 'Assamese',
        az: 'Azerbaijani',
        be: 'Belarusian',
        bg: 'Bulgarian',
        bn: 'Bengali',
        bs: 'Bosnian',
        ca: 'Catalan',
        ceb: 'Cebuano',
        cs: 'Czech',
        cy: 'Welsh',
        da: 'Danish',
        de: 'German',
        el: 'Greek',
        en: 'English',
        eo: 'Esperanto',
        es: 'Spanish',
        et: 'Estonian',
        eu: 'Basque',
        fa: 'Persian',
        fi: 'Finnish',
        fr: 'French',
        fy: 'Western Frisian',
        ga: 'Irish',
        gd: 'Scottish Gaelic',
        gl: 'Galician',
        gu: 'Gujarati',
        ha: 'Hausa',
        he: 'Hebrew',
        hi: 'Hindi',
        hr: 'Croatian',
        ht: 'Haitian Creole',
        hu: 'Hungarian',
        hy: 'Armenian',
        id: 'Indonesian',
        ig: 'Igbo',
        is: 'Icelandic',
        it: 'Italian',
        ja: 'Japanese',
        jv: 'Javanese',
        ka: 'Georgian',
        kk: 'Kazakh',
        km: 'Khmer',
        kn: 'Kannada',
        ko: 'Korean',
        ku: 'Kurdish',
        ky: 'Kyrgyz',
        la: 'Latin',
        lb: 'Luxembourgish',
        lo: 'Lao',
        lt: 'Lithuanian',
        lv: 'Latvian',
        mg: 'Malagasy',
        mi: 'Maori',
        mk: 'Macedonian',
        ml: 'Malayalam',
        mn: 'Mongolian',
        mr: 'Marathi',
        ms: 'Malay',
        mt: 'Maltese',
        my: 'Burmese',
        ne: 'Nepali',
        nl: 'Dutch',
        no: 'Norwegian',
        ny: 'Nyanja',
        pa: 'Punjabi',
        pl: 'Polish',
        ps: 'Pashto',
        pt: 'Portuguese',
        ro: 'Romanian',
        ru: 'Russian',
        sd: 'Sindhi',
        si: 'Sinhala',
        sk: 'Slovak',
        sl: 'Slovenian',
        sm: 'Samoan',
        sn: 'Shona',
        so: 'Somali',
        sq: 'Albanian',
        sr: 'Serbian',
        st: 'Southern Sotho',
        su: 'Sundanese',
        sv: 'Swedish',
        sw: 'Swahili',
        ta: 'Tamil',
        te: 'Telugu',
        tg: 'Tajik',
        th: 'Thai',
        tk: 'Turkmen',
        tl: 'Tagalog',
        tr: 'Turkish',
        tt: 'Tatar',
        ug: 'Uyghur',
        uk: 'Ukrainian',
        ur: 'Urdu',
        uz: 'Uzbek',
        vi: 'Vietnamese',
        xh: 'Xhosa',
        yi: 'Yiddish',
        yo: 'Yoruba',
        zh: 'Chinese',
        'zh-Hans': 'Chinese',
        'zh-Hant': 'Chinese',
        zu: 'Zulu',
    });

    function isTranslateGemmaSubModel(modelIdOrFamily) {
        const s = String(modelIdOrFamily || '').trim().toLowerCase();
        if (!s) return false;
        if (s === 'translategemmasub' || s === 'translate-gemma-sub') return true;
        return /translategemma-.*-sub|translate[-_]?gemma[-_]?4[-_]?sub|gemma4[-_]?sub/i.test(s);
    }

    function isTranslateGemmaModel(modelIdOrFamily) {
        const s = String(modelIdOrFamily || '').trim().toLowerCase();
        if (!s) return false;
        if (isTranslateGemmaSubModel(s)) return true;
        if (s === 'translategemma' || s === 'translate-gemma') return true;
        return /translategemma|translate[-_]?gemma/i.test(s);
    }

    /** Google TranslateGemma JSON / natural prompts — excludes Sub subtitle format. */
    function isTranslateGemmaOfficialModel(modelIdOrFamily) {
        const s = String(modelIdOrFamily || '').trim().toLowerCase();
        if (!s || isTranslateGemmaSubModel(s)) return false;
        return isTranslateGemmaModel(s);
    }

    function loadTargetLangCore() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-target-lang-core')
                : (global && global.TransubSubtitleTargetLang);
        } catch (_) {
            return null;
        }
    }

    /**
     * Normalize to TranslateGemma ISO / regional codes (zh-Hans, en, ja, …).
     * @param {string} raw
     * @param {'source'|'target'} role
     */
    function normalizeTranslateGemmaLangCode(raw, role = 'source') {
        const t = String(raw || '').trim().replace(/_/g, '-');
        if (!t || /^(auto|unknown)$/i.test(t)) {
            return role === 'target' ? 'zh-Hans' : 'ja';
        }
        const lower = t.toLowerCase();
        if (
            lower === 'zh-hans' || lower === 'zh-cn' || lower === 'zh-sg'
            || lower === 'simplified' || lower === 'hans' || lower === 'cn'
            || lower === 'chinese'
        ) {
            return 'zh-Hans';
        }
        if (
            lower === 'zh-hant' || lower === 'zh-tw' || lower === 'zh-hk'
            || lower === 'zh-hant-tw' || lower === 'zh-hant-hk'
            || lower === 'traditional' || lower === 'traditional-tw'
            || lower === 'traditional-hk' || lower === 'hant' || lower === 'tw' || lower === 'hk'
        ) {
            return 'zh-Hant';
        }
        if (lower === 'zh') return role === 'target' ? 'zh-Hans' : 'zh';
        if (lower === 'en' || lower === 'eng' || lower === 'english') return 'en';
        if (lower === 'ja' || lower === 'jp' || lower === 'jpn' || lower === 'japanese') return 'ja';
        if (lower === 'ko' || lower === 'kr' || lower === 'kor' || lower === 'korean') return 'ko';
        const core = loadTargetLangCore();
        if (core?.normalizeSubtitleTargetLang) {
            const n = core.normalizeSubtitleTargetLang(t);
            if (n === 'zh-Hans') return 'zh-Hans';
            if (n === 'zh-Hant' || n === 'zh-Hant-TW' || n === 'zh-Hant-HK') return 'zh-Hant';
            if (n === 'en' || n === 'ja' || n === 'ko') return n;
        }
        // Keep regional forms like de-DE when already well-formed.
        if (/^[a-z]{2}(-[A-Za-z]{2,8})?$/.test(t)) {
            const parts = t.split('-');
            if (parts.length === 1) return parts[0].toLowerCase();
            return `${parts[0].toLowerCase()}-${parts[1]}`;
        }
        return lower.split('-')[0] || (role === 'target' ? 'zh-Hans' : 'ja');
    }

    function resolveSourceLangCode(options = {}) {
        const o = options && typeof options === 'object' ? options : {};
        const raw = o.sourceLangCode
            || o.sourceLanguage
            || o.language
            || o.asrLanguage
            || '';
        return normalizeTranslateGemmaLangCode(raw, 'source');
    }

    function resolveTargetLangCode(options = {}) {
        const o = options && typeof options === 'object' ? options : {};
        const core = loadTargetLangCore();
        let raw = o.targetLangCode || o.subtitleTargetLang || o.targetLang || o.targetLanguage || '';
        if (!raw && core?.resolveSubtitleTargetLang) {
            raw = core.resolveSubtitleTargetLang(o);
        }
        return normalizeTranslateGemmaLangCode(raw, 'target');
    }

    function languageDisplayName(code) {
        const c = String(code || '').trim();
        if (!c) return 'Unknown';
        if (LANG_EN_NAMES[c]) return LANG_EN_NAMES[c];
        const base = c.split('-')[0];
        if (LANG_EN_NAMES[base]) return LANG_EN_NAMES[base];
        return c;
    }

    function normalizeCueList(cues) {
        if (!Array.isArray(cues)) return [];
        return cues.map((c, i) => ({
            index: Number.isInteger(Number(c?.index)) ? Number(c.index) : i,
            text: String(c?.text ?? '').replace(/\r\n/g, '\n').trim(),
        }));
    }

    /**
     * Short laughter / breath / onomatopoeia / effort cues — PREVIOUS_TRANSLATION often
     * bleeds identity lines into these (reusable JA subtitle shape, not title-specific).
     * @param {string} text
     * @returns {boolean}
     */
    function isFragileShortSource(text) {
        const raw = String(text || '').replace(/\r\n/g, '\n').trim();
        if (!raw) return true;
        const compact = raw.replace(/\s+/g, '');
        const len = [...compact].length;
        if (len <= 10) {
            if (/^(?:[ぁ-んァ-ンーっッ…。.、！!？?\s]|[はあはぁふんんんっ])+[ぁ-んァ-ンーっッ…。.、！!？?\s]*$/u.test(compact)) {
                return true;
            }
            if (/^(?:あは+|はは+|えへ+|ふふ+|ひゃ+|う[わぁー]+|た[っー]+)+/u.test(compact)) {
                return true;
            }
        }
        if (len <= 14 && /^(?:頑張り|がんばり|いきま|行きま|行きます)/u.test(compact)) {
            return true;
        }
        // Keep post-ASR soft-game noise fragile even after domain remaps land.
        if (/ちゅ[くく]+|ボトミントン|バドミントン|マジポイント|マッチポイント|待ちポイント|待つポイント/u.test(compact) && len <= 24) {
            return true;
        }
        return false;
    }

    /**
     * ZH is bare ellipsis while JA still has recoverable lexical content.
     * @param {string} sourceText
     * @param {string} zhText
     * @returns {boolean}
     */
    function isPureEllipsisZh(text) {
        const t = String(text || '').trim();
        if (!t) return true;
        return /^(?:\.\.\.|……|…|\.{2,}|。{2,})+$/u.test(t);
    }

    function bareJaForEllipsis(text) {
        return String(text || '')
            .trim()
            .replace(/[\s　]+/g, '')
            .replace(/[。．.!！?？…·.•\-—_~～ー、，,・♡♥❤♪☆★]+/g, '');
    }

    function looksLikeTranslateGemmaEllipsisCollapse(sourceText, zhText) {
        if (!isPureEllipsisZh(zhText)) return false;
        const bare = bareJaForEllipsis(sourceText);
        if (!bare) return false;
        // Pure short moan / SFX — ellipsis placeholder is acceptable (delivery may prune).
        if (
            bare.length <= 8
            && /^(?:[あぁはふへうんっァー]+|ちゅ+|んちゅ*|ひゃ+|たっ+)+$/u.test(bare)
        ) {
            return false;
        }
        if (/[一-龥々]/.test(bare)) return true;
        if (/(?:なります|です|ます|だよ|ポイント|勝ち|待つ|本目|おっしゃ|人知れ|いきま|行きま|ダメ|だめ|嫌|ごめ|あり|好き|ください|奥さん|山下)/u.test(bare)) {
            return true;
        }
        return bare.length >= 3;
    }

    /**
     * Prefer keeping …… when JA trails off — sanitize sometimes strips trailing ellipsis.
     * @param {string} sourceText
     * @param {string} zhText
     * @returns {string}
     */
    function preserveTrailingEllipsis(sourceText, zhText) {
        const src = String(sourceText || '').trim();
        let zh = String(zhText || '').trim();
        if (!zh || isPureEllipsisZh(zh)) return zh;
        if (!/(?:…|\.{2,}|･･･|……)\s*$/u.test(src)) return zh;
        // Normalize single … / ... tails to …… for ZH subtitles.
        zh = zh.replace(/(?:\.{2,}|…|……)+\s*$/u, '');
        if (!zh.trim()) return '……';
        return `${zh.trim()}……`;
    }

    /**
     * ZH looks like a stuck self-ID / name stub (with or without source).
     * @param {string} zhText
     * @returns {boolean}
     */
    function looksLikeIdentityStubZh(zhText) {
        const zh = String(zhText || '').trim().replace(/\s+/g, ' ');
        if (!zh) return false;
        if ([...zh].length > 28) return false;
        if (/^(?:我叫[\u4e00-\u9fffA-Za-zー]{1,12}|我是[\u4e00-\u9fffA-Za-zー]{1,12})$/u.test(zh)) return true;
        if (/^(?:[\u4e00-\u9fffA-Za-zー]{1,12}\s*我是(?:你|你们)(?:的[\u4e00-\u9fffA-Za-z]{0,12})?)$/u.test(zh)) return true;
        if (/^(?:[\u4e00-\u9fffA-Za-zー]{1,12}\s*我是)$/u.test(zh)) return true;
        // Soft refusals disguised as name-card + "translator"
        if (/^(?:[\u4e00-\u9fffA-Za-zー]{1,12}\s*)?我是你们的翻译/u.test(zh)) return true;
        if (/我是你的好朋友/u.test(zh) && [...zh].length <= 20) return true;
        // Greeting + name bleed (いきまーす → 你好 祐佳)
        if (/^你好\s*[\u4e00-\u9fffA-Za-zー]{1,12}$/u.test(zh)) return true;
        // Huihui/dialog name-card spam with explicit space:「哦 佑佳」「我 佑佳」
        // (unspaced short lines are handled by recycle-guard when repeated)
        const NAME_CARD_TAIL_OK = /^(?:好的|没事|对了|这样|真的|可以|不是|什么|怎么|那个|这个|然后|所以|但是|可是|就是|还是|已经|现在|今天|明天|加油|开始|结束|过来|过去|回来|出去|进来|等等|一下|一点|一些|你们|我们|大家|自己)$/u;
        const interjectName = zh.match(/^(?:哦|啊|嗯|嘿|喂|哎|诶|喔)\s+([\u4e00-\u9fffA-Za-zー]{1,12})$/u);
        if (interjectName && !NAME_CARD_TAIL_OK.test(interjectName[1])) return true;
        const woName = zh.match(/^我\s+([\u4e00-\u9fffA-Za-zー]{1,12})$/u);
        if (woName && !NAME_CARD_TAIL_OK.test(woName[1])) return true;
        return false;
    }

    /**
     * Short JA self-intro only (お、祐佳です). Do not treat …でした / long lines as intro.
     * @param {string} sourceText
     * @returns {boolean}
     */
    function isJaSelfIntroSource(sourceText) {
        const s = String(sourceText || '').replace(/\s+/g, '');
        if (!s || [...s].length > 18) return false;
        if (/でした|ですが|ですけど|ですので|ですし/.test(s)) return false;
        return /^(?:[ぁ-んァ-ンおあうわっ、,.…・\-ー]{0,6})?[\u4e00-\u9fffぁ-んァ-ンー]{1,12}(?:です|だよ|だよん|ですよ|と申します|と言います)[。．.!！?？…]*$/u.test(s);
    }

    /**
     * Good first-person ZH for a JA self-intro (我是X / 我叫X), not 你-addressing.
     * @param {string} zhText
     * @returns {boolean}
     */
    function looksLikeGoodSelfIntroZh(zhText) {
        const zh = String(zhText || '').trim().replace(/\s+/g, ' ');
        if (!zh || [...zh].length > 18) return false;
        if (/你|你们/.test(zh)) return false;
        if (/^(?:啊?[，,]?\s*)?(?:我是|我叫)[\u4e00-\u9fffA-Za-zー]{1,12}$/u.test(zh)) return true;
        // Casual short intro (お、祐佳です → 哦 佑佳) — only OK on real self-intro JA.
        if (/^(?:哦|啊|嗯)[，,]?\s*[\u4e00-\u9fffA-Za-zー]{1,12}$/u.test(zh) && [...zh].length <= 8) {
            return true;
        }
        return false;
    }

    /**
     * ZH self-ID / name stub that does not match a self-intro source (identity bleed).
     * @param {string} sourceText
     * @param {string} zhText
     * @returns {boolean}
     */
    function looksLikeTranslateGemmaIdentityEcho(sourceText, zhText) {
        const src = String(sourceText || '').replace(/\s+/g, '');
        const zh = String(zhText || '').trim();
        if (!zh || !src) return false;
        if (isJaSelfIntroSource(src)) {
            // Real intro cue: only keep clean 我是/我叫 forms; reject 祐佳 我是你 etc.
            return !looksLikeGoodSelfIntroZh(zh);
        }
        if (!looksLikeIdentityStubZh(zh)) return false;
        return true;
    }

    /**
     * Invented exam/plot when JA has no such cue (映像で着れて → 考试).
     * @param {string} sourceText
     * @param {string} zhText
     * @returns {boolean}
     */
    function looksLikeTranslateGemmaInventedPlot(sourceText, zhText) {
        const src = String(sourceText || '');
        const zh = String(zhText || '').trim();
        if (!zh || !src) return false;
        if (/考试|試[验験]/.test(zh) && !/(?:試験|受験|テスト|試験)/.test(src)) return true;
        if (/好朋友/.test(zh) && !/(?:友達|友人|親友|仲良し)/.test(src)) return true;
        return false;
    }

    /**
     * Official structured payload as a JSON string (llama.cpp OpenAI + --jinja).
     */
    function buildStructuredUserContent(text, sourceCode, targetCode) {
        return JSON.stringify({
            type: 'text',
            source_lang_code: sourceCode,
            target_lang_code: targetCode,
            text: String(text || ''),
        });
    }

    /**
     * Ollama / Medium natural-language prompt (two blank lines before text).
     * @param {string} text
     * @param {string} sourceCode
     * @param {string} targetCode
     * @param {object} [options]
     */
    function buildNaturalUserContent(text, sourceCode, targetCode, options = {}) {
        const srcName = languageDisplayName(sourceCode);
        const tgtName = languageDisplayName(targetCode);
        const profile = loadTgProfile();
        const addon = profile?.getTranslateGemmaPromptAddon?.(
            options.modelId || options.engineMtModel || options.promptFamily || 'translategemma',
            'official',
        ) || '';
        const lines = [
            `You are a professional ${srcName} (${sourceCode}) to ${tgtName} (${targetCode}) translator. `
            + `Your goal is to accurately convey the meaning and nuances of the original ${srcName} text `
            + `while adhering to ${tgtName} grammar, vocabulary, and cultural sensitivities.`,
        ];
        if (addon) lines.push(addon);
        lines.push(
            `Produce only the ${tgtName} translation, without any additional explanations or commentary. `
            + `Please translate the following ${srcName} text into ${tgtName}:`,
            '',
            String(text || ''),
            '',
        );
        return lines.join('\n');
    }

    /**
     * @param {Array} chunkCuesList
     * @param {object} [options]
     * @returns {Array<{role:string,content:string}>}
     */
    function buildTranslateGemmaChatMessages(chunkCuesList, options = {}) {
        if (isTranslateGemmaSubModel(options.modelId || options.engineMtModel || options.promptFamily)) {
            return buildTranslateGemmaSubChatMessages(chunkCuesList, options);
        }
        const list = normalizeCueList(chunkCuesList);
        const joined = list.map((c) => c.text || '').join('\n');
        const sourceCode = resolveSourceLangCode(options);
        const targetCode = resolveTargetLangCode(options);
        const mode = String(options.translateGemmaPromptMode || options.tgPromptMode || 'structured')
            .trim()
            .toLowerCase();
        const content = mode === 'natural'
            ? buildNaturalUserContent(joined, sourceCode, targetCode, options)
            : buildStructuredUserContent(joined, sourceCode, targetCode);
        const msgs = [{ role: 'user', content }];
        const profile = loadTgProfile();
        const modelKey = options.modelId || options.engineMtModel || options.promptFamily || 'translategemma';
        const resolved = profile?.resolveTranslateGemmaTranslateProfile?.(modelKey);
        if (
            mode === 'structured'
            && resolved?.preferSystemAddon
            && options.tgSystemAddon !== false
        ) {
            const addon = profile?.getTranslateGemmaPromptAddon?.(modelKey, 'official') || '';
            if (addon) msgs.unshift({ role: 'system', content: addon });
        }
        return msgs;
    }

    /**
     * Previous cue context for Translate Gemma 4 Sub prompts.
     * Omits PREVIOUS_TRANSLATION for fragile short CURRENT cues to limit identity bleed.
     * @param {{ sourceCues?: Array, translatedByIndex?: Map|object, currentChunkCues?: Array }} args
     * @returns {{ previousSourceText?: string, previousTranslationText?: string }}
     */
    function buildPreviousContextFromCues({
        sourceCues,
        translatedByIndex,
        currentChunkCues,
    } = {}) {
        const chunk = Array.isArray(currentChunkCues) ? currentChunkCues : [];
        const first = chunk[0];
        if (!first) return {};
        const all = Array.isArray(sourceCues) ? sourceCues : [];
        const firstIdx = Number(first.index);
        const pos = all.findIndex((c) => Number(c?.index) === firstIdx);
        if (pos <= 0) return {};
        const prev = all[pos - 1];
        const prevSrc = String(prev?.text ?? '').replace(/\r\n/g, '\n').trim();
        let prevTgt = '';
        const prevIdx = Number(prev?.index);
        if (translatedByIndex && typeof translatedByIndex.get === 'function') {
            prevTgt = String(translatedByIndex.get(prevIdx) ?? '').trim();
        } else if (translatedByIndex && typeof translatedByIndex === 'object') {
            prevTgt = String(translatedByIndex[prevIdx] ?? translatedByIndex[String(prevIdx)] ?? '').trim();
        }
        const currentJoined = chunk.map((c) => String(c?.text ?? '').trim()).filter(Boolean).join('\n');
        const fragile = isFragileShortSource(currentJoined);
        const out = {};
        if (prevSrc) out.previousSourceText = prevSrc;
        // Drop poisoned identity stubs and fragile-short prior ZH (name/ID bleed).
        if (prevTgt && !fragile && !looksLikeIdentityStubZh(prevTgt)) {
            out.previousTranslationText = prevTgt;
        }
        return out;
    }

    /**
     * Translate Gemma 4 Sub — PREVIOUS_SOURCE / CURRENT_SOURCE subtitle format.
     * Previous blocks optional when context is unavailable.
     */
    function buildTranslateGemmaSubChatMessages(chunkCuesList, options = {}) {
        const list = normalizeCueList(chunkCuesList);
        const joined = list.map((c) => c.text || '').join('\n');
        const sourceCode = resolveSourceLangCode(options);
        const targetCode = resolveTargetLangCode(options);
        const srcName = languageDisplayName(sourceCode);
        const tgtName = languageDisplayName(targetCode);
        const style = String(options.translateGemmaSubStyle || options.tgSubStyle || 'neutral')
            .trim()
            .toLowerCase() || 'neutral';
        const styleLabel = style === 'friendly' || style === 'official' ? style : 'neutral';
        const ruleParts = [];
        if (Array.isArray(options.glossaryTerms) && options.glossaryTerms.length) {
            const gloss = options.glossaryTerms.slice(0, 12).map((t) => {
                const src = String(t?.term || t?.src || '').trim();
                const dst = String(t?.translation || t?.dst || '').trim();
                return src && dst && src !== dst ? `${src}->${dst}` : '';
            }).filter(Boolean);
            if (gloss.length) ruleParts.push(`glossary: ${gloss.join('; ')}`);
        }
        if (Array.isArray(options.castNames) && options.castNames.length) {
            ruleParts.push(`speakers: ${options.castNames.slice(0, 8).map((n) => String(n || '').trim()).filter(Boolean).join(', ')}`);
        }
        const rulesLine = ruleParts.length ? `RULES: ${ruleParts.join('; ')}.` : '';
        const profile = loadTgProfile();
        const addon = profile?.getTranslateGemmaPromptAddon?.(
            options.modelId || options.engineMtModel || options.promptFamily || 'translategemmasub',
            'sub',
        ) || '';
        const system = [
            `TASK: Translate ${srcName} subtitles into ${tgtName}.`,
            rulesLine,
            `STYLE: ${styleLabel}.`,
            'Translate only CURRENT_SOURCE. PREVIOUS_SOURCE and PREVIOUS_TRANSLATION are context only. '
            + 'Preserve meaning, tone, slang, profanity, uncertainty, repetitions and incomplete speech. '
            + 'Never output only “…” when CURRENT has real words; keep trailing ellipsis as ……. '
            + 'Return only the final translation without labels or commentary.',
            addon,
        ].filter(Boolean).join('\n');

        const prevSrc = String(options.previousSourceText || options.prevSourceText || '').trim();
        let prevTgt = String(options.previousTranslationText || options.prevTranslationText || '').trim();
        if (prevTgt && isFragileShortSource(joined)) {
            prevTgt = '';
        }
        const userParts = [];
        if (prevSrc) {
            userParts.push('[PREVIOUS_SOURCE]', prevSrc, '');
        }
        if (prevTgt) {
            userParts.push('[PREVIOUS_TRANSLATION]', prevTgt, '');
        }
        userParts.push('[CURRENT_SOURCE]', joined);
        if (String(targetCode || '').toLowerCase().startsWith('en')) {
            userParts.push('', 'OUTPUT LANGUAGE: English only. Never write Chinese characters.');
        } else if (String(targetCode || '').toLowerCase().startsWith('ko')) {
            userParts.push('', 'OUTPUT LANGUAGE: Korean only. Never write Chinese characters.');
        }
        return [
            { role: 'system', content: system },
            { role: 'user', content: userParts.join('\n') },
        ];
    }

    function stripTranslateGemmaLeak(text) {
        let out = String(text || '').trim();
        if (!out) return '';

        // Full JSON object response
        if (out.startsWith('{') && /"text"\s*:/.test(out)) {
            try {
                const parsed = JSON.parse(out);
                if (parsed && typeof parsed.text === 'string') {
                    out = parsed.text;
                }
            } catch (_) {
                const m = out.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/);
                if (m) {
                    try {
                        out = JSON.parse(`"${m[1]}"`);
                    } catch {
                        out = m[1]
                            .replace(/\\n/g, '\n')
                            .replace(/\\"/g, '"')
                            .replace(/\\\\/g, '\\');
                    }
                }
            }
        }

        // Continuation after assistant opens {"type":"text",...,"text":"
        out = out.replace(/^[\s\S]*?"text"\s*:\s*"/, '');
        out = out.replace(/"\s*\}\s*$/, '');
        out = out.replace(/"\s*\}\s*$/, '');

        for (const tok of TG_STOP_TOKENS) {
            if (tok === '"}' || tok === '" }' || tok === '"}\n') continue;
            out = out.split(tok).join('');
        }
        out = out.replace(/<\/?end_of_turn>/gi, '');
        out = out.replace(/^\s*```(?:\w+)?\s*/i, '').replace(/\s*```\s*$/i, '');
        return out.trim();
    }

    function stripTranslateGemmaSubLeak(text) {
        let out = String(text || '').trim();
        if (!out) return '';
        out = out.replace(/^\s*\[(?:CURRENT|PREVIOUS)_(?:SOURCE|TRANSLATION)\]\s*/i, '');
        out = out.replace(/<\/?end_of_turn>/gi, '');
        out = out.replace(/^\s*```(?:\w+)?\s*/i, '').replace(/\s*```\s*$/i, '');
        return out.trim();
    }

    function looksLikeTranslateGemmaMetaLeak(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (/帮你翻译|翻译这条字幕|我来帮你翻/u.test(t)) return true;
        if (/^(?:I(?:'ll| will)?\s+translate|Let me translate)\b/i.test(t)) return true;
        if (/as an AI language model/i.test(t)) return true;
        return false;
    }

    /**
     * Safety-refusal boilerplate (e.g. Gemma soft refusals on adult dialogue).
     * Prefers shared smart-translate detector; keeps local fallbacks for TG-only paths.
     */
    function looksLikeTranslateGemmaSafetyRefusal(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        try {
            const smart = (typeof module !== 'undefined' && module.exports)
                ? require('./advanced-smart-translate-core')
                : (global && global.TransubAdvancedSmartTranslate);
            if (typeof smart?.looksLikeRefusalText === 'function' && smart.looksLikeRefusalText(t)) {
                return true;
            }
        } catch (_) { /* optional */ }
        if (/对不起[，,]?(?:我)?(?:无法|不能)/u.test(t)) return true;
        if (/我不能(?:协助|帮助|翻译|处理)/u.test(t)) return true;
        if (/不能处理(?:包含)?敏感|包含敏感内容的请求/u.test(t)) return true;
        if (/如果你有其他问题或需要帮助/u.test(t)) return true;
        if (/cannot (?:assist|help|translate|process).*(?:sensitive|content)/i.test(t)) return true;
        return false;
    }

    function looksLikeTranslateGemmaPromptLeak(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (looksLikeTranslateGemmaSubPromptLeak(t)) return true;
        if (looksLikeTranslateGemmaMetaLeak(t)) return true;
        if (looksLikeTranslateGemmaSafetyRefusal(t)) return true;
        if (/^You are a professional\b/i.test(t) && /translator/i.test(t)) return true;
        if (/"source_lang_code"\s*:/.test(t) && /"target_lang_code"\s*:/.test(t) && /"type"\s*:\s*"text"/.test(t)) {
            return true;
        }
        if (/Produce only the .+ translation, without any additional explanations/i.test(t)) return true;
        if (/TranslateGemma (?:Sub )?profile:/i.test(t)) return true;
        return false;
    }

    /**
     * Reject bad TG outputs; restore trailing ellipsis when keeping the line.
     * @param {string} sourceText
     * @param {string} zhText
     * @returns {string}
     */
    function finalizeTranslateGemmaCue(sourceText, zhText) {
        const zh = String(zhText || '').trim();
        if (!zh) return '';
        if (looksLikeTranslateGemmaSafetyRefusal(zh)) return '';
        if (looksLikeTranslateGemmaMetaLeak(zh)) return '';
        if (looksLikeTranslateGemmaIdentityEcho(sourceText, zh)) return '';
        if (looksLikeTranslateGemmaInventedPlot(sourceText, zh)) return '';
        if (looksLikeTranslateGemmaEllipsisCollapse(sourceText, zh)) return '';
        if (isPureEllipsisZh(zh)) {
            const bare = bareJaForEllipsis(sourceText);
            if (
                bare
                && bare.length >= 2
                && !/^(?:[あぁはふへうんっァー]+|ちゅ+|んちゅ*|ひゃ+|たっ+)+$/u.test(bare)
            ) {
                return '';
            }
        }
        return preserveTrailingEllipsis(sourceText, zh);
    }

    /**
     * Delivery-time pass: blank identity/refusal/ellipsis collapse and restore trailing …….
     * @param {Array<{index?: number, text?: string}>} sourceCues
     * @param {Array<{index?: number, text?: string}>} zhCues
     * @returns {Array}
     */
    function finalizeTranslateGemmaCueList(sourceCues, zhCues) {
        const srcList = Array.isArray(sourceCues) ? sourceCues : [];
        const zhList = Array.isArray(zhCues) ? zhCues : [];
        const byIndex = new Map();
        for (let i = 0; i < srcList.length; i += 1) {
            const c = srcList[i];
            const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : i;
            byIndex.set(idx, String(c?.text ?? ''));
        }
        return zhList.map((c, i) => {
            const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : i;
            const src = byIndex.has(idx) ? byIndex.get(idx) : String(srcList[i]?.text ?? '');
            const next = finalizeTranslateGemmaCue(src, c?.text);
            if (next === String(c?.text ?? '')) return c;
            return { ...c, text: next };
        });
    }

    function looksLikeTranslateGemmaSubPromptLeak(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (/^TASK:\s*Translate\b/i.test(t)) return true;
        if (/\[CURRENT_SOURCE\]/i.test(t) || /\[PREVIOUS_SOURCE\]/i.test(t)) return true;
        if (/Translate only CURRENT_SOURCE/i.test(t)) return true;
        return false;
    }

    function resolveTranslateGemmaInferenceOptions(options = {}) {
        const o = options && typeof options === 'object' ? options : {};
        const modelKey = o.modelId || o.engineMtModel || o.promptFamily;
        const sub = isTranslateGemmaSubModel(modelKey);
        const profile = loadTgProfile()?.resolveTranslateGemmaTranslateProfile?.(modelKey);
        let contextSize = TG_SUBTITLE_CONTEXT_SIZE;
        if (Number.isFinite(Number(o.contextSize)) && Number(o.contextSize) >= 2048) {
            contextSize = Math.max(2048, Math.min(32768, Math.round(Number(o.contextSize))));
        }
        let windowLines = TG_WINDOW_LINES_DEFAULT;
        if (Number.isFinite(Number(o.windowLines)) && Number(o.windowLines) >= 1) {
            windowLines = Math.max(1, Math.min(4, Math.round(Number(o.windowLines))));
        }
        const defaultTemp = profile
            ? profile.temperature
            : (sub ? 0 : TG_INFERENCE.temperature);
        const defaultTopP = profile?.topP ?? TG_INFERENCE.top_p;
        const defaultRep = profile?.repetitionPenalty ?? TG_INFERENCE.repetition_penalty;
        return {
            ...TG_INFERENCE,
            temperature: Number.isFinite(Number(o.temperature))
                ? Math.max(0, Math.min(1, Number(o.temperature)))
                : defaultTemp,
            top_p: Number.isFinite(Number(o.top_p ?? o.topP))
                ? Math.max(0, Math.min(1, Number(o.top_p ?? o.topP)))
                : defaultTopP,
            repetition_penalty: Number.isFinite(Number(o.repetition_penalty ?? o.repetitionPenalty))
                ? Math.max(1, Math.min(2, Number(o.repetition_penalty ?? o.repetitionPenalty)))
                : defaultRep,
            contextSize,
            windowLines,
            llamaJinja: o.llamaJinja !== false,
            cachePrompt: o.cachePrompt !== false,
            preferSerialChunks: !!(profile?.preferSerialChunks || sub),
            stop: Array.isArray(o.stop) && o.stop.length ? o.stop : TG_STOP_TOKENS,
            sourceLangCode: resolveSourceLangCode(o),
            targetLangCode: resolveTargetLangCode(o),
        };
    }

    return {
        TG_INFERENCE,
        TG_STOP_TOKENS,
        TG_SUBTITLE_CONTEXT_SIZE,
        TG_WINDOW_LINES_DEFAULT,
        isTranslateGemmaModel,
        isTranslateGemmaSubModel,
        isTranslateGemmaOfficialModel,
        normalizeTranslateGemmaLangCode,
        resolveSourceLangCode,
        resolveTargetLangCode,
        languageDisplayName,
        buildStructuredUserContent,
        buildNaturalUserContent,
        isFragileShortSource,
        isPureEllipsisZh,
        looksLikeTranslateGemmaEllipsisCollapse,
        preserveTrailingEllipsis,
        looksLikeIdentityStubZh,
        isJaSelfIntroSource,
        looksLikeGoodSelfIntroZh,
        looksLikeTranslateGemmaIdentityEcho,
        looksLikeTranslateGemmaInventedPlot,
        looksLikeTranslateGemmaMetaLeak,
        looksLikeTranslateGemmaSafetyRefusal,
        finalizeTranslateGemmaCue,
        finalizeTranslateGemmaCueList,
        buildPreviousContextFromCues,
        buildTranslateGemmaChatMessages,
        buildTranslateGemmaSubChatMessages,
        stripTranslateGemmaLeak,
        stripTranslateGemmaSubLeak,
        looksLikeTranslateGemmaPromptLeak,
        looksLikeTranslateGemmaSubPromptLeak,
        resolveTranslateGemmaInferenceOptions,
    };
}));
