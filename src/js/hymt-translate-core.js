/**
 * Tencent Hy-MT2 JA→ZH subtitle prompts + inference knobs (no network).
 * Reuses Sakura glossary / AV / NSFW lexicon merge for full Transub training assets.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubHyMtTranslate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function hymtTranslateCoreFactory() {
    function loadSakuraCore() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./sakura-translate-core')
                : (global && global.TransubSakuraTranslate);
        } catch (_) {
            return null;
        }
    }

    function loadNsfwLex() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./tone-adapt-lexicon-core')
                : (global && (global.TransubToneAdaptLexicon || global.TransubJaNsfwLexicon));
        } catch (_) {
            return null;
        }
    }

    const HYMT_STOP_TOKENS = Object.freeze([
        '<|hy_end_of_assistant|>',
        '<|hy_User|>',
        '<|hy_Assistant|>',
        '<|hy_begin_of_sentence|>',
    ]);

    /** Default / soft-AV full headroom. Short non-soft runs may drop to FAST. */
    const HYMT_SUBTITLE_CONTEXT_SIZE = 8192;
    const HYMT_SUBTITLE_CONTEXT_SIZE_FAST = 4096;
    /** Blank retranslate micro-batches (quality). Failures fall back to size 1. */
    const HYMT_BLANK_RETRY_BATCH = 4;
    const HYMT_BLANK_RETRY_BATCH_SPEED = 1;
    /**
     * Keep windows tight: soft prefs + glossary crowd KV and raise mid-window skips.
     * Soft 8→4 after ADN-806 log (整窗 8 空白 / 百级仍漏).
     */
    const HYMT_WINDOW_LINES_SOFT = 1;
    /** All Hy-MT profiles: 1-line windows — multi-line positional zip silently scrambles (SAME-250). */
    const HYMT_WINDOW_LINES_DEFAULT = 1;
    const HYMT_WINDOW_LINES_TIGHT = 1;
    /** Prompt budget: Hy-MT2 follows short official templates better than long Sakura-style dumps. */
    const HYMT_MAX_TERMINOLOGY = 16;
    const HYMT_MAX_TERM_NOTE = 0;
    const HYMT_MAX_CAST_NAMES = 8;
    const HYMT_NSFW_EXAMPLE_LIMIT = 4;
    const HYMT_GLOSSARY_MERGE = Object.freeze({
        avActorGlossaryLimit: 8,
        avDomainGlossaryLimit: 6,
        nsfwLexiconLimit: 8,
    });

    const HYMT_INFERENCE = Object.freeze({
        // Official README suggests 0.7; slightly lower for subtitle fidelity while
        // Style prompt + post gates keep natural spoken ZH without mass invent.
        temperature: 0.5,
        top_p: 0.6,
        repetition_penalty: 1.05,
        contextSize: HYMT_SUBTITLE_CONTEXT_SIZE,
        cachePrompt: true,
    });

    /**
     * Official Style 【target_style】 anchors (short — Hy-MT follows Style better than long prefs).
     * Adult tone only when the source line itself is adult — never sexualize
     * hospital / meal / greeting / narration lines in soft-AV titles (IPZZ-957).
     */
    const HYMT_STYLE_SPOKEN = '自然口语化简体中文字幕对白；先忠实完整译出语义、不漏译不错译，再求听感自然；忌书面腔与翻译腔；禁止为顺口改意；不臆造原文没有的情节、人名或旁白';
    const HYMT_STYLE_SOFT_MUNDANE = '自然口语化简体中文字幕对白；按字面忠实翻译、不漏译不错译；听感自然；禁止臆造成人向内容或额外情节';
    const HYMT_STYLE_SOFT_ADULT = '自然口语化简体中文字幕对白；原文有成人语义则忠实传达、不净化不拒译；完整译出、不漏译不错译；听感自然；禁止为顺口改意；不臆造原文没有的内容';
    /** @deprecated use HYMT_STYLE_* — kept for callers/tests */
    const HYMT_SOFT_STYLE_HINT = HYMT_STYLE_SOFT_ADULT;

    function isHyMtModel(modelIdOrFamily) {
        const s = String(modelIdOrFamily || '').trim().toLowerCase();
        if (!s) return false;
        if (s === 'hymt') return true;
        // Hy-MT2 only — do not treat Hunyuan-MT / HY-MT1.5 / Chimera as Hy-MT2.
        if (/chimera|hunyuan-mt(?!2)|hy-?mt1\.?5|hy-?mt15/i.test(s) && !/^hy-?mt2/i.test(s)) return false;
        return /^hy-?mt2/i.test(s);
    }

    /**
     * Hunyuan-MT / Chimera / HY-MT1.5 — official direct-translate template, not Hy-MT2 Style.
     * @param {string} modelIdOrFamily
     */
    function isHunyuanMtModel(modelIdOrFamily) {
        const s = String(modelIdOrFamily || '').trim().toLowerCase();
        if (!s) return false;
        if (s === 'hunyuan' || s === 'hunyuan-mt') return true;
        if (/translategemma|translate[-_]?gemma|hy-?mt2/i.test(s)) return false;
        return /hunyuan.*chimera|chimera.*abliterat|^hunyuan-mt|hy-?mt1\.?5|hy-?mt15/i.test(s);
    }

    function shouldUseSoftHyMtPrompt(options = {}) {
        const sakuraCore = loadSakuraCore();
        if (sakuraCore?.shouldUseNsfwPrompt) {
            return sakuraCore.shouldUseNsfwPrompt(options);
        }
        const profile = String(options.contentProfile || options.senseProfile || '').trim().toLowerCase();
        return profile === 'av_soft';
    }

    /**
     * Soft-AV register only when this chunk's JA actually has adult anchors.
     * Hospital / meal / greeting windows must not inherit NSFW style (IPZZ-957).
     */
    function cueTextHasAdultJaAnchor(text) {
        const src = String(text || '');
        if (!src.trim()) return false;
        if (/気持ち(?:いい|よ)|きもち(?:いい|ぃ|っ)|キモチイイ|エロ[いく]|いやらし/.test(src)) return true;
        if (/(?:ちんぽ|チンポ|ちんちん|おちん|まんこ|おまんこ|ンポ|ペニス)/.test(src)) return true;
        if (/(?:セックス|せっくす|SEX)/i.test(src)) return true;
        if (/(?:犯[しす]|陵辱|痴女|淫乱|肉棒|中出し)/.test(src)) return true;
        if (/(?:挿れて|挿入|入って|入れて|入れる|入れたい|入れちゃ)/.test(src)
            && !/廊下|手に入れ|気に入れ|腰入れ|入れますか|お茶入れ|入れてきます|入れてくる|入れて来/.test(src)) return true;
        if (/(?:イキ|イッ|いっちゃ|いくわ|出して|射精)/.test(src)) return true;
        if (/(?:咥|しゃぶ|フェラ|舐めて)/.test(src)) return true;
        if (/(?:触って|つねって)/.test(src) && !/検査|診察|熱/.test(src)) return true;
        try {
            const lex = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-lexicon')
                : null;
            // Broad lexicon still flags bare 入れますか / 先生 — only trust when
            // stronger sexual lemmas above already missed and text is short adult scrap.
            // Require real adult lemmas — bare まん also hits まんじゅう (steamed bun).
            if (lex?.isAdultJaAnchor?.(src)
                && /(?:ちんぽ|チンポ|ちんちん|おちん|まんこ|おまんこ|マンコ|イキ|イッ|咥|フェラ|挿入|セックス|犯)/.test(src)) {
                return true;
            }
        } catch (_) { /* optional */ }
        return false;
    }

    function chunkHasAdultJaAnchor(cues) {
        const list = Array.isArray(cues) ? cues : [];
        return list.some((c) => cueTextHasAdultJaAnchor(c?.text));
    }

    /** Soft style + NSFW examples only when the job is soft AND this chunk needs it. */
    function shouldApplySoftHyMtStyle(options = {}, chunkCues = null) {
        if (!shouldUseSoftHyMtPrompt(options)) return false;
        if (options.forceSoftHyMtStyle === true) return true;
        if (options.forceSoftHyMtStyle === false) return false;
        if (chunkCues == null) return true;
        return chunkHasAdultJaAnchor(chunkCues);
    }

    /** Instruction fragments Hy-MT2 sometimes echoes as cue text (from buildSoftPreferenceLines). */
    const HYMT_META_LINE_RES = Object.freeze([
        /专有名词(?:仅|只)使用原文已出现的写法或术语表(?:中的)?译名[^。\n]*/g,
        /专名只用原文或术语表[^。\n]*/g,
        /禁止臆造角色名[^。\n]*/g,
        /禁臆造人名[^。\n]*/g,
        /绝对不会随意创造角色名[^。\n]*/g,
        /总共有?\d+行原文[^。\n]*/g,
        /共\s*\d+\s*行(?:原文)?[^。\n]*/g,
        /我?会逐行将其翻译(?:成|为)(?:简体)?中文[^。\n]*/g,
        /(?:准确)?逐行(?:翻译|译)为(?:简体)?中文[^。\n]*/g,
        /行数与顺序必须与原文一致[^。\n]*/g,
        /请将以下文本(?:准确)?翻译为(?:简体)?中文[^。\n]*/g,
        /将以下文本翻译为(?:简体)?中文[^。\n]*/g,
        /注意翻译的风格要严格符合【[^】]+】[^。\n]*/g,
        /注意只需要输出翻译后的结果[^。\n]*/g,
        /保留等量的(?:换行)?分隔符[^。\n]*/g,
        /联系上下文正确使用人称代词[^。\n]*/g,
        /注意不要混淆使役态和被动态[^。\n]*/g,
        /勿混使役\/?被动[^。\n]*/g,
        /不擅自添加原文没有的代词、人名、称呼或旁白[^。\n]*/g,
        /碎句与拟声勿删[^。\n]*/g,
        /忠实(?:完整)?翻译每一行的全部语义[^。\n]*/g,
        /忠实译全句语义[^。\n]*/g,
        /禁止(?:用)?省略号[^。\n]*/g,
        /禁止跳过[、，,\/]?合并或漏译[^。\n]*/g,
        /禁止跳过\/合并\/漏译[^。\n]*/g,
        /禁止漏译[^。\n]*/g,
        /只输出译文[^。\n]*/g,
        /不要解释[^。\n]*/g,
        /参考下面的翻译[^。\n]*/g,
        /将以下(?:日语)?文本准确?翻译为(?:简体)?中文[^。\n]*/g,
        /将下方【待翻译文本】准确翻译为(?:简体)?中文[^。\n]*/g,
        /【待翻译文本】/g,
        /【翻译任务】/g,
    ]);

    function looksLikeHyMtPromptLeak(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (/^专有名词(?:仅|只)使用原文/.test(t)) return true;
        if (/^专名只用原文/.test(t)) return true;
        if (/总共有?\d+行原文|共\s*\d+\s*行/.test(t) && /逐行|翻译|译为/.test(t)) return true;
        if (/我?会逐行将其翻译(?:成|为)中文/.test(t)) return true;
        if (/术语表(?:中的)?译名/.test(t) && /禁止臆造|创造角色名|禁臆造/.test(t)) return true;
        if (/【待翻译文本】|【翻译任务】/.test(t)) return true;
        if (/行数与顺序必须与原文一致/.test(t)) return true;
        if (/注意翻译的风格要严格符合【|风格严格符合【/.test(t)) return true;
        if (/使役态和被动态|使役\/?被动/.test(t) && /主语|主宾/.test(t)) return true;
        if (/禁止(?:用)?省略号/.test(t) && /代替对白|漏译|拒答/.test(t)) return true;
        if (/忠实(?:完整)?翻译每一行的全部语义|忠实译全句语义/.test(t)) return true;
        if (/原文仅为纯语气/.test(t)) return true;
        if (/时可译为对应短语气词/.test(t)) return true;
        if (/对白有完整语义/.test(t) && /禁止只输出语气词|须译出完整意思/.test(t)) return true;
        if (/^对应短语气词/.test(t) || (/对应短语气词/.test(t) && /对白有完整语/.test(t))) return true;
        return false;
    }

    function stripHyMtMetaInstructions(text) {
        let out = String(text || '');
        for (const re of HYMT_META_LINE_RES) {
            out = out.replace(re, '');
        }
        return out.replace(/^\s*[、，,；;]\s*/gm, '').replace(/\s{2,}/g, ' ').trim();
    }

    function stripHyMtLeak(text) {
        let out = String(text || '');
        for (const tok of HYMT_STOP_TOKENS) {
            out = out.split(tok).join('');
        }
        out = out.replace(/<\|hy[^>|]*[>|]/g, '');
        out = stripHyMtMetaInstructions(out);
        return out.trim();
    }

    function prioritizeHyMtTerms(glossaryTerms, sourceText, maxTerms) {
        const max = Math.max(4, Math.min(24, Math.round(Number(maxTerms) || HYMT_MAX_TERMINOLOGY)));
        const srcText = String(sourceText || '');
        const hit = [];
        const rest = [];
        const seen = new Set();
        for (const t of (Array.isArray(glossaryTerms) ? glossaryTerms : [])) {
            const src = String(t?.term || t?.src || '').trim();
            const dst = String(t?.translation || t?.dst || '').trim();
            if (!src || !dst || src === dst) continue;
            const key = `${src}\0${dst}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (srcText && srcText.includes(src)) hit.push(t);
            else rest.push(t);
        }
        // Prefer terms that appear in this chunk; fill remainder only if room.
        return (hit.length ? hit.concat(rest) : rest).slice(0, max);
    }

    function resolveHyMtGlossaryTerms(options = {}, sourceText = '') {
        const sakuraCore = loadSakuraCore();
        const mergeOpts = {
            ...options,
            avActorGlossaryLimit: Number(options.avActorGlossaryLimit) || HYMT_GLOSSARY_MERGE.avActorGlossaryLimit,
            avDomainGlossaryLimit: Number(options.avDomainGlossaryLimit) || HYMT_GLOSSARY_MERGE.avDomainGlossaryLimit,
            nsfwLexiconLimit: Number(options.nsfwLexiconLimit) || HYMT_GLOSSARY_MERGE.nsfwLexiconLimit,
        };
        let terms;
        if (sakuraCore?.resolveGlossaryTermsForPrompt) {
            terms = sakuraCore.resolveGlossaryTermsForPrompt(mergeOpts, sourceText);
        } else {
            terms = Array.isArray(options.glossaryTerms) ? options.glossaryTerms : [];
        }
        const max = Math.max(4, Math.min(24, Number(options.hyMtMaxTerminology) || HYMT_MAX_TERMINOLOGY));
        return prioritizeHyMtTerms(terms, sourceText, max);
    }

    function formatHyMtTerminologyBlock(glossaryTerms, options = {}) {
        const terms = Array.isArray(glossaryTerms) ? glossaryTerms : [];
        if (!terms.length) return '';
        const max = Math.max(4, Math.min(24, Number(options.maxTerms) || HYMT_MAX_TERMINOLOGY));
        const noteMax = Math.max(0, Math.min(40, Number(options.maxNoteChars ?? HYMT_MAX_TERM_NOTE)));
        const lines = [];
        for (const t of terms.slice(0, max)) {
            const src = String(t?.term || t?.src || '').trim();
            const dst = String(t?.translation || t?.dst || '').trim();
            if (!src || !dst || src === dst) continue;
            let info = String(t?.info || t?.note || '').trim();
            if (info && noteMax > 0) {
                if (info.length > noteMax) info = `${info.slice(0, noteMax).trim()}…`;
                lines.push(`${src} 翻译成 ${dst}（${info}）`);
            } else {
                lines.push(`${src} 翻译成 ${dst}`);
            }
        }
        return lines.join('\n');
    }

    function formatHyMtNsfwExampleHint(options = {}) {
        const nsfwLex = loadNsfwLex();
        if (!shouldUseSoftHyMtPrompt(options) || !nsfwLex?.formatPromptExamples) return '';
        if (options.omitNsfwExamples || options._hyMtHasTerminology) return '';
        if (options._chunkSoftStyle === false) return '';
        const limit = Math.max(2, Math.min(8, Number(options.nsfwExampleLimit) || HYMT_NSFW_EXAMPLE_LIMIT));
        const examples = nsfwLex.formatPromptExamples(limit);
        if (!examples) return '';
        return `拟声参考（仅原文相近时用）：${examples}`;
    }

    function buildSoftPreferenceLines(options = {}, lineCount = 1) {
        const sakuraCore = loadSakuraCore();
        const softJob = shouldUseSoftHyMtPrompt(options);
        const soft = options._chunkSoftStyle != null
            ? options._chunkSoftStyle === true
            : softJob;
        const prefs = [];
        const cast = sakuraCore?.formatCastNamesBlock
            ? sakuraCore.formatCastNamesBlock(options.castNames, { maxNames: HYMT_MAX_CAST_NAMES })
            : '';
        if (cast) prefs.push(cast.replace(/^出场人物/, '出场人物沿用'));
        // Compact prefs — Hy-MT2 instruction-following degrades with long preference dumps.
        prefs.push(`共 ${lineCount} 行；准确逐行译为简体中文，恰好 ${lineCount} 行、同序；保留等量换行分隔；禁止跳过/合并/漏译/空行/编号。`);
        prefs.push('忠实译全句语义；禁止摘要、半句、用省略号（…/...）/空白/拒答代替对白；须全简体中文，勿假名助词残片、半日半中或原文回声。');
        if (soft) {
            prefs.push(`风格严格符合【${HYMT_SOFT_STYLE_HINT}】。人称依上下文；勿混使役/被动主宾；勿添原文没有的代词/人名/旁白/性相关措辞；专名只用原文或术语表，禁臆造人名；纯拟声可短译，有语义须译全，禁只出语气词。`);
        } else {
            prefs.push('先忠实还原语意再口语通顺；人称正确；不臆造人名；主宾勿颠倒；禁止为顺口漏译/改意；无成人语义的句子禁止译成性相关措辞。纯拟声可短译，有语义须译全。');
        }
        const exampleHint = formatHyMtNsfwExampleHint({ ...options, _chunkSoftStyle: soft });
        if (exampleHint) prefs.push(exampleHint);
        prefs.push('只输出译文，不要解释。');
        return prefs;
    }

    /**
     * Resolve official Style 【target_style】 for this chunk.
     */
    function resolveHyMtStyleHint(options = {}, chunkCues = null) {
        if (typeof options.hyMtStyleHint === 'string' && options.hyMtStyleHint.trim()) {
            return options.hyMtStyleHint.trim();
        }
        try {
            const styleCore = (typeof module !== 'undefined' && module.exports)
                ? require('./translate-style-core')
                : (global && global.TransubTranslateStyle);
            const styleEnabled = styleCore?.normalizeTranslateStyleEnabled
                ? styleCore.normalizeTranslateStyleEnabled(options.translateStyleEnabled)
                : !!options.translateStyleEnabled;
            if (styleEnabled) {
                const preset = styleCore?.normalizeTranslateStylePreset
                    ? styleCore.normalizeTranslateStylePreset(options.translateStylePreset)
                    : '';
                if (preset && preset !== styleCore.DEFAULT_PRESET) {
                    const hint = styleCore.resolveHyMtStyleHintFromOptions?.(options);
                    if (hint) return hint;
                }
                // Explicit natural_spoken still beats soft-adult default when user pinned style.
                if (preset === styleCore.DEFAULT_PRESET
                    && Object.prototype.hasOwnProperty.call(options, 'translateStylePreset')
                    && String(options.translateStylePreset || '').trim()) {
                    const hint = styleCore.resolveHyMtStyleHintFromOptions?.(options);
                    if (hint) return hint;
                }
            }
        } catch (_) { /* ignore */ }
        if (!shouldUseSoftHyMtPrompt(options)) return HYMT_STYLE_SPOKEN;
        return shouldApplySoftHyMtStyle(options, chunkCues)
            ? HYMT_STYLE_SOFT_ADULT
            : HYMT_STYLE_SOFT_MUNDANE;
    }

    /**
     * Official Hy-MT2 Default / Terminology / Style (+ light Delimiters for multi-line).
     * @see https://huggingface.co/tencent/Hy-MT2-7B
     */
    function buildOfficialHyMtChatMessages(list, options = {}) {
        const joined = list.map((c) => String(c?.text || '').trim()).join('\n');
        const n = Math.max(1, list.length);
        const softChunk = shouldApplySoftHyMtStyle(options, list);
        const glossaryTerms = resolveHyMtGlossaryTerms({
            ...options,
            nsfwLexicon: softChunk ? options.nsfwLexicon : false,
            avGlossary: softChunk ? options.avGlossary : false,
            avActorGlossary: softChunk ? options.avActorGlossary : false,
        }, joined);
        const terminology = formatHyMtTerminologyBlock(glossaryTerms, {
            maxTerms: Number(options.hyMtMaxTerminology) || HYMT_MAX_TERMINOLOGY,
            maxNoteChars: options.hyMtMaxTermNote ?? HYMT_MAX_TERM_NOTE,
        });
        const style = resolveHyMtStyleHint(options, list);
        const lines = [];
        if (terminology) {
            lines.push('参考下面的翻译：', terminology, '');
        }
        // Official Style (spoken natural) — better fidelity+自然 than bare Default for subtitles.
        // Multi-line: fold Delimiters (换行) into one short clause.
        if (n > 1) {
            lines.push(
                `请将以下文本准确翻译为简体中文。注意翻译的风格要严格符合【${style}】。`
                + '你必须在译文中保留等量的换行分隔符，绝对不可遗漏、合并或跳过任一行，注意只需要输出翻译后的结果，不要额外解释：',
            );
        } else {
            lines.push(
                `请将以下文本翻译为简体中文。注意翻译的风格要严格符合【${style}】`,
            );
        }
        lines.push(joined);
        return [{ role: 'user', content: lines.join('\n') }];
    }

    /**
     * Ultra-short template for blank / quality / ellipsis hard-fail retries only.
     * Keep short to avoid refusal; still ask for complete spoken ZH.
     */
    function buildMinimalHyMtChatMessages(list, options = {}) {
        const joined = list.map((c) => String(c?.text || '').trim()).join('\n');
        const soft = shouldApplySoftHyMtStyle(options, list);
        const n = Math.max(1, list.length);
        const glossaryTerms = resolveHyMtGlossaryTerms({
            ...options,
            hyMtMaxTerminology: Math.min(4, Number(options.hyMtMaxTerminology) || 4),
            avActorGlossaryLimit: soft ? 2 : 0,
            avDomainGlossaryLimit: soft ? 2 : 0,
            nsfwLexiconLimit: soft ? 2 : 0,
            nsfwLexicon: soft,
            avGlossary: soft ? options.avGlossary : false,
            avActorGlossary: soft ? options.avActorGlossary : false,
        }, joined);
        const terminology = formatHyMtTerminologyBlock(glossaryTerms, {
            maxTerms: 4,
            maxNoteChars: 0,
        });
        const style = resolveHyMtStyleHint(options, list);
        const lines = [];
        if (terminology) {
            lines.push('参考下面的翻译：', terminology, '');
        }
        // Official Default + compact style clause (retry path must stay short).
        if (n === 1) {
            lines.push(
                `将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释。风格符合【${style}】：`,
            );
            if (options._qualityRetry || options.hyMtQualityRetry) {
                try {
                    const qg = require('./hymt-quality-guard-core');
                    lines.push(qg.qualityRetryHint(options));
                } catch (_) {
                    lines.push('请完整、准确地翻译本行，禁止漏译或错译。');
                }
            }
            if (options._ellipsisHardFail || options._ellipsisHardFailLong) {
                lines.push(
                    options._ellipsisHardFailLong
                        ? '上一版用省略号敷衍；本行日语有完整语义，必须逐句译出，严禁只输出省略号、空白或语气词。'
                        : '禁止只用省略号（…/...）或空白代替本行译文；有字就译，不得拒答。',
                );
            }
            lines.push(joined);
        } else {
            lines.push(
                `将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释。风格符合【${style}】；保留等量换行、不可漏行：`,
                joined,
            );
        }
        return [{ role: 'user', content: lines.join('\n') }];
    }

    /**
     * Hy-MT2 prompts: prefer official Style/Terminology; Personalization only when requested.
     * No system prompt (model default).
     */
    function buildHyMtChatMessages(chunkCuesList, options = {}) {
        const sakuraCore = loadSakuraCore();
        const list = sakuraCore?.normalizeCueList
            ? sakuraCore.normalizeCueList(chunkCuesList)
            : (Array.isArray(chunkCuesList) ? chunkCuesList : []);
        // Blank / quality / align fallback: minimal official Default (+ style clause).
        if (options._blankRetry || options.hyMtMinimalPrompt) {
            return buildMinimalHyMtChatMessages(list, options);
        }
        // Optional: full Personalization dump (legacy / explicit).
        if (options.hyMtFullSoftPrompt === true) {
            const softChunk = shouldApplySoftHyMtStyle(options, list);
            const joined = list.map((c) => String(c?.text || '').trim()).join('\n');
            const glossaryTerms = resolveHyMtGlossaryTerms({
                ...options,
                nsfwLexicon: softChunk ? options.nsfwLexicon : false,
                avGlossary: softChunk ? options.avGlossary : false,
                avActorGlossary: softChunk ? options.avActorGlossary : false,
            }, joined);
            const terminology = formatHyMtTerminologyBlock(glossaryTerms, {
                maxTerms: Number(options.hyMtMaxTerminology) || HYMT_MAX_TERMINOLOGY,
                maxNoteChars: options.hyMtMaxTermNote ?? HYMT_MAX_TERM_NOTE,
            });
            const prefs = buildSoftPreferenceLines({
                ...options,
                _hyMtHasTerminology: !!terminology,
                _chunkSoftStyle: softChunk,
            }, list.length);
            const user = [
                '【待翻译文本】',
                joined,
                '',
                '【翻译任务】',
                ...prefs.map((p, i) => `${i + 1}、${p}`),
                `${prefs.length + 1}、将【待翻译文本】翻译为简体中文。`,
            ].join('\n');
            return [{ role: 'user', content: user }];
        }
        // Default path: official Style (+ Terminology / Delimiters).
        return buildOfficialHyMtChatMessages(list, options);
    }

    function countGlossaryTermsForPrompt(options = {}) {
        const userN = Array.isArray(options.glossaryTerms) ? options.glossaryTerms.length : 0;
        if (Number.isFinite(Number(options.hyMtTermCount))) {
            return Math.max(0, Math.round(Number(options.hyMtTermCount)));
        }
        // Soft AV merges actor/domain/nsfw terms — approximate pressure without dumping full merge.
        if (shouldUseSoftHyMtPrompt(options)) {
            return Math.min(
                HYMT_MAX_TERMINOLOGY,
                userN
                    + HYMT_GLOSSARY_MERGE.avActorGlossaryLimit
                    + HYMT_GLOSSARY_MERGE.avDomainGlossaryLimit,
            );
        }
        return Math.min(HYMT_MAX_TERMINOLOGY, userN);
    }

    /**
     * Soft AV / large glossary → 8192; otherwise 4096 to shrink KV and speed decode.
     * @param {object} [options]
     * @returns {number}
     */
    function resolveHyMtContextSize(options = {}) {
        if (Number.isFinite(Number(options.contextSize)) && Number(options.contextSize) >= 2048) {
            return Math.max(2048, Math.min(32768, Math.round(Number(options.contextSize))));
        }
        const soft = shouldUseSoftHyMtPrompt(options);
        const glossaryN = countGlossaryTermsForPrompt(options);
        if (soft || glossaryN >= 8) return HYMT_SUBTITLE_CONTEXT_SIZE;
        return HYMT_SUBTITLE_CONTEXT_SIZE_FAST;
    }

    /**
     * Modest windows; shrink further when glossary pressure is high.
     * @param {object} [options]
     * @returns {number}
     */
    function resolveHyMtWindowLines(options = {}) {
        if (Number.isFinite(Number(options.windowLines)) && Number(options.windowLines) >= 1) {
            return Math.max(1, Math.min(20, Math.round(Number(options.windowLines))));
        }
        const soft = shouldUseSoftHyMtPrompt(options);
        const glossaryN = countGlossaryTermsForPrompt(options);
        if (soft && glossaryN >= HYMT_MAX_TERMINOLOGY) return HYMT_WINDOW_LINES_TIGHT;
        if (soft) return HYMT_WINDOW_LINES_SOFT;
        return HYMT_WINDOW_LINES_DEFAULT;
    }

    /**
     * Try deterministic fill for blank MT slots (moans / short JA) before calling the model.
     * @param {string} sourceText
     * @param {object} [options]
     * @returns {{ text: string, changed: boolean }|null}
     */
    function tryDeterministicBlankFill(sourceText, options = {}) {
        const src = String(sourceText || '').trim();
        if (!src) return null;
        try {
            const ellipsisPolicy = (typeof module !== 'undefined' && module.exports)
                ? require('./hymt-ellipsis-policy-core')
                : (global && global.TransubHyMtEllipsisPolicy);
            const det = ellipsisPolicy?.deterministicEllipsisFill?.(src, options);
            if (det && String(det).trim()) {
                return { text: String(det).trim(), changed: true };
            }
        } catch (_) { /* optional */ }
        try {
            const mtSanitize = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (global && global.TransubMtSanitize);
            if (typeof mtSanitize?.recoverBlankedAdultZh === 'function') {
                const hit = mtSanitize.recoverBlankedAdultZh('…', src, {
                    ...options,
                    skipFakeGreeting: true,
                });
                if (
                    hit?.changed
                    && hit.text
                    && !mtSanitize.isBlankOrPunctTranslation?.(hit.text, src)
                ) {
                    return { text: String(hit.text), changed: true };
                }
            }
        } catch (_) { /* optional */ }
        return null;
    }

    /**
     * Split blank cues into small retry batches.
     * @param {object[]} cues
     * @param {number} [batchSize]
     * @returns {object[][]}
     */
    function resolveHyMtBlankRetryBatchSize(options = {}) {
        if (Number.isFinite(Number(options.hyMtBlankRetryBatch)) && Number(options.hyMtBlankRetryBatch) > 0) {
            return Math.max(1, Math.min(8, Math.round(Number(options.hyMtBlankRetryBatch))));
        }
        if (Number.isFinite(Number(options.blankRetryBatchSize)) && Number(options.blankRetryBatchSize) > 0) {
            return Math.max(1, Math.min(8, Math.round(Number(options.blankRetryBatchSize))));
        }
        const perf = String(options.perfProfile || '').trim().toLowerCase();
        if (perf === 'speed' || perf === 'fast') return HYMT_BLANK_RETRY_BATCH_SPEED;
        return HYMT_BLANK_RETRY_BATCH;
    }

    function chunkBlankRetryCues(cues, batchSize = HYMT_BLANK_RETRY_BATCH) {
        const list = Array.isArray(cues) ? cues : [];
        const size = Math.max(1, Math.min(8, Math.round(Number(batchSize) || HYMT_BLANK_RETRY_BATCH)));
        const out = [];
        for (let i = 0; i < list.length; i += size) {
            out.push(list.slice(i, i + size));
        }
        return out;
    }

    /**
     * Partition blank retry cues: deterministic fills vs model retry.
     * @param {object[]} blankCues - source cues that need fill
     * @param {object} [options]
     * @returns {{ prefilled: object[], retryCues: object[], skipped: number }}
     */
    function partitionBlankRetryCues(blankCues, options = {}) {
        const prefilled = [];
        const retryCues = [];
        for (const cue of (blankCues || [])) {
            const src = String(cue?.text || '').trim();
            const hit = tryDeterministicBlankFill(src, options);
            if (hit?.changed) {
                prefilled.push({ index: cue.index, text: hit.text, startMs: cue.startMs, endMs: cue.endMs });
            } else {
                retryCues.push(cue);
            }
        }
        return { prefilled, retryCues, skipped: prefilled.length };
    }

    function resolveHyMtInferenceOptions(options = {}) {
        const contextSize = resolveHyMtContextSize(options);
        const soft = shouldUseSoftHyMtPrompt(options);
        return {
            temperature: HYMT_INFERENCE.temperature,
            top_p: HYMT_INFERENCE.top_p,
            repetition_penalty: HYMT_INFERENCE.repetition_penalty,
            stop: [...HYMT_STOP_TOKENS],
            contextSize,
            // Soft-AV: disable prompt cache so adult chunks don't bleed register into hospital/meal windows.
            cachePrompt: soft ? false : options.cachePrompt !== false,
            llamaJinja: true,
            windowLines: resolveHyMtWindowLines({ ...options, contextSize }),
        };
    }

    /** Official Hunyuan-MT-7B language display names (Chinese) for ZH↔XX template. */
    const HUNYUAN_LANG_ZH_NAMES = Object.freeze({
        zh: '中文',
        'zh-Hans': '中文',
        'zh-Hant': '繁体中文',
        en: '英语',
        ja: '日语',
        ko: '韩语',
        fr: '法语',
        de: '德语',
        es: '西班牙语',
        ru: '俄语',
        ar: '阿拉伯语',
        th: '泰语',
        vi: '越南语',
        pt: '葡萄牙语',
        it: '意大利语',
    });

    function resolveHunyuanTargetLangLabel(options = {}) {
        const o = options && typeof options === 'object' ? options : {};
        const raw = String(
            o.targetLangCode || o.subtitleTargetLang || o.targetLang || o.targetLanguage || 'zh',
        ).trim().replace(/_/g, '-');
        const lower = raw.toLowerCase() || 'zh';
        if (HUNYUAN_LANG_ZH_NAMES[raw]) return HUNYUAN_LANG_ZH_NAMES[raw];
        if (HUNYUAN_LANG_ZH_NAMES[lower]) return HUNYUAN_LANG_ZH_NAMES[lower];
        if (/^zh/i.test(lower)) {
            if (/hant|tw|hk/i.test(lower)) return '繁体中文';
            return '中文';
        }
        const base = lower.split('-')[0];
        return HUNYUAN_LANG_ZH_NAMES[base] || raw || '中文';
    }

    function isHunyuanZhTarget(options = {}) {
        const label = resolveHunyuanTargetLangLabel(options);
        return label === '中文' || label === '繁体中文';
    }

    /**
     * Official Hunyuan-MT-7B direct-translate prompts (also used for abliterated Chimera weights).
     * No system prompt — model default.
     */
    function buildHunyuanMtChatMessages(chunkCuesList, options = {}) {
        const sakuraCore = loadSakuraCore();
        const list = sakuraCore?.normalizeCueList
            ? sakuraCore.normalizeCueList(chunkCuesList)
            : (Array.isArray(chunkCuesList) ? chunkCuesList : []);
        const joined = list.map((c) => String(c?.text || '').trim()).join('\n');
        const targetLabel = resolveHunyuanTargetLangLabel(options);
        const content = isHunyuanZhTarget(options)
            ? `把下面的文本翻译成${targetLabel}，不要额外解释。\n\n${joined}`
            : `Translate the following segment into ${targetLabel}, without additional explanation.\n\n${joined}`;
        return [{ role: 'user', content }];
    }

    function resolveHunyuanMtInferenceOptions(options = {}) {
        const o = options && typeof options === 'object' ? options : {};
        let contextSize = HYMT_SUBTITLE_CONTEXT_SIZE;
        if (Number.isFinite(Number(o.contextSize)) && Number(o.contextSize) >= 2048) {
            contextSize = Math.max(2048, Math.min(32768, Math.round(Number(o.contextSize))));
        }
        // Official Hunyuan-MT-7B README defaults (slightly cooler for subtitles).
        return {
            temperature: Number.isFinite(Number(o.temperature))
                ? Math.max(0, Math.min(1, Number(o.temperature)))
                : 0.5,
            top_p: Number.isFinite(Number(o.top_p ?? o.topP))
                ? Math.max(0, Math.min(1, Number(o.top_p ?? o.topP)))
                : 0.6,
            repetition_penalty: Number.isFinite(Number(o.repetition_penalty ?? o.repetitionPenalty))
                ? Math.max(1, Math.min(2, Number(o.repetition_penalty ?? o.repetitionPenalty)))
                : 1.05,
            stop: Array.isArray(o.stop) && o.stop.length ? o.stop : [...HYMT_STOP_TOKENS],
            contextSize,
            cachePrompt: o.cachePrompt !== false,
            llamaJinja: o.llamaJinja !== false,
            windowLines: 1,
        };
    }

    return {
        HYMT_STOP_TOKENS,
        HYMT_SUBTITLE_CONTEXT_SIZE,
        HYMT_SUBTITLE_CONTEXT_SIZE_FAST,
        HYMT_BLANK_RETRY_BATCH,
        HYMT_BLANK_RETRY_BATCH_SPEED,
        HYMT_WINDOW_LINES_SOFT,
        HYMT_WINDOW_LINES_DEFAULT,
        HYMT_WINDOW_LINES_TIGHT,
        HYMT_MAX_TERMINOLOGY,
        HYMT_MAX_TERM_NOTE,
        HYMT_MAX_CAST_NAMES,
        HYMT_NSFW_EXAMPLE_LIMIT,
        HYMT_GLOSSARY_MERGE,
        HYMT_INFERENCE,
        HYMT_SOFT_STYLE_HINT,
        HYMT_STYLE_SPOKEN,
        HYMT_STYLE_SOFT_MUNDANE,
        HYMT_STYLE_SOFT_ADULT,
        isHyMtModel,
        isHunyuanMtModel,
        shouldUseSoftHyMtPrompt,
        cueTextHasAdultJaAnchor,
        chunkHasAdultJaAnchor,
        shouldApplySoftHyMtStyle,
        resolveHyMtStyleHint,
        stripHyMtLeak,
        stripHyMtMetaInstructions,
        looksLikeHyMtPromptLeak,
        HYMT_META_LINE_RES,
        prioritizeHyMtTerms,
        resolveHyMtGlossaryTerms,
        formatHyMtTerminologyBlock,
        formatHyMtNsfwExampleHint,
        buildSoftPreferenceLines,
        buildMinimalHyMtChatMessages,
        buildOfficialHyMtChatMessages,
        buildHyMtChatMessages,
        resolveHyMtContextSize,
        resolveHyMtWindowLines,
        tryDeterministicBlankFill,
        resolveHyMtBlankRetryBatchSize,
        chunkBlankRetryCues,
        partitionBlankRetryCues,
        resolveHyMtInferenceOptions,
        buildHunyuanMtChatMessages,
        resolveHunyuanMtInferenceOptions,
        // Quality guard re-exports (漏翻 / 错翻)
        assessHyMtCueQuality: (...args) => {
            try { return require('./hymt-quality-guard-core').assessHyMtCueQuality(...args); }
            catch { return { ok: true, reasons: [], severity: 'none' }; }
        },
        collectHyMtQualityRetryIndexes: (...args) => {
            try { return require('./hymt-quality-guard-core').collectHyMtQualityRetryIndexes(...args); }
            catch { return { indexes: [], byReason: {} }; }
        },
    };
}));
