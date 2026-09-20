/**
 * Sakura JA→ZH subtitle translation: prompts + line alignment (no network).
 */
(function (global, factory) {
    let nsfwLex = null;
    let avGlossary = null;
    try {
        nsfwLex = (typeof module !== 'undefined' && module.exports)
            ? require('./tone-adapt-lexicon-core')
            : (global && (global.TransubToneAdaptLexicon || global.TransubJaNsfwLexicon));
    } catch (_) {
        nsfwLex = null;
    }
    try {
        avGlossary = (typeof module !== 'undefined' && module.exports)
            ? require('./av-glossary-core')
            : (global && global.TransubAvGlossary);
    } catch (_) {
        avGlossary = null;
    }
    let hymtCore = null;
    try {
        hymtCore = (typeof module !== 'undefined' && module.exports)
            ? require('./hymt-translate-core')
            : (global && global.TransubHyMtTranslate);
    } catch (_) {
        hymtCore = null;
    }
    let tgCore = null;
    try {
        tgCore = (typeof module !== 'undefined' && module.exports)
            ? require('./translategemma-translate-core')
            : (global && global.TransubTranslateGemmaTranslate);
    } catch (_) {
        tgCore = null;
    }
    const api = factory(nsfwLex, avGlossary, hymtCore, tgCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSakuraTranslate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function sakuraTranslateFactory(nsfwLex, avGlossary, hymtCore, tgCore) {
    const DEFAULT_WINDOW_LINES = 8;

    /** Default: short, anti-hallucination, line-safe. Meaning first, then fluency. */
    const SYSTEM_PROMPT = [
        '你是一个日译中字幕翻译模型：先忠实还原原文语意（不漏译、不错译、不摘要），再以通顺自然口语表达，避免翻译腔。',
        '联系上下文正确使用人称代词；仅在上下文明确时补「我/你」及已出现称呼，全局一致。',
        '不擅自添加原文中没有的代词、人名、称呼或旁白。',
        '专有名词仅使用原文已出现的写法或术语表译名；禁止臆造角色名。',
        '严禁添加原文未出现的常见臆造人名（如佳奈、舞、玲奈、真理、斗碧等），尤其不要在句末乱贴人名。',
        '每行只输出对应那一行的译文，禁止把多行挤进一行，禁止无意义叠词循环。',
        '原文仅为纯语气/拟声时可译为对应短语气词；有完整语义时须译全句，句末语气词可保留。',
    ].join('');

    /**
     * Official GalTransl v3.7 / v4 system (SakuraLLM). Extra subtitle line-rules
     * belong here only if they stay off the user colon-tail — stuffing 共N行 / 拟声
     * into the user prompt after 「翻译成中文：」 collapses 7B to … / stock gloss.
     */
    const GALTRANSL_SYSTEM_PROMPT = [
        '你是一个视觉小说翻译模型，可以通顺地使用给定的风格翻译文本，并联系上下文正确使用人称代词，',
        '注意不要混淆使役态和被动态的主语和宾语，不要擅自添加原文中没有的特殊符号，也不要擅自增加或减少换行。',
    ].join('');

    /** Official SakuraLLM LN-Korean (KO→ZH). */
    const LN_KOREAN_SYSTEM_PROMPT = '你是一个轻小说翻译模型，可以流畅通顺地以轻小说的风格将韩文翻译成简体中文。';

    /** LN-ko2ja has no official system text; keep a short line-safe hint. */
    const LN_KO2JA_SYSTEM_PROMPT = [
        'あなたは韓国語から日本語への字幕翻訳モデルです。',
        '原文の意味を忠実に訳し、一行は一行に対応させ、説明や番号を付けないでください。',
    ].join('');

    function resolvePromptFamily(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const explicit = String(opts.promptFamily || '').trim().toLowerCase();
        if (explicit === 'galtransl') return 'galtransl';
        if (explicit === 'ln-korean' || explicit === 'lnkorean') return 'ln-korean';
        if (explicit === 'ln-ko2ja' || explicit === 'lnko2ja' || explicit === 'ko2ja') return 'ln-ko2ja';
        if (explicit === 'hymt') return 'hymt';
        if (explicit === 'hunyuan' || explicit === 'hunyuan-mt') return 'hunyuan';
        if (explicit === 'translategemmasub' || explicit === 'translate-gemma-sub') return 'translategemmasub';
        if (explicit === 'translategemma' || explicit === 'translate-gemma') return 'translategemma';
        if (explicit === 'sakura') return 'sakura';
        const modelId = String(opts.modelId || opts.engineMtModel || '').trim();
        if (/galtransl/i.test(modelId)) return 'galtransl';
        if (/ln[-_]?korean|sakura[-_]?ln[-_]?korean/i.test(modelId)) return 'ln-korean';
        if (/ln[-_]?ko2ja|sakura[-_]?ln[-_]?ko2ja|ko2ja/i.test(modelId)) return 'ln-ko2ja';
        if (hymtCore?.isHunyuanMtModel?.(modelId)) return 'hunyuan';
        if (hymtCore?.isHyMtModel?.(modelId)) return 'hymt';
        if (tgCore?.isTranslateGemmaSubModel?.(modelId)) return 'translategemmasub';
        if (tgCore?.isTranslateGemmaOfficialModel?.(modelId)) return 'translategemma';
        try {
            const catalog = (typeof module !== 'undefined' && module.exports)
                ? require('./sakura-mt-catalog-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSakuraMtCatalog : null);
            if (catalog?.resolvePromptFamily) return catalog.resolvePromptFamily(modelId || opts);
        } catch (_) { /* ignore */ }
        return 'sakura';
    }

    /**
     * Whole-track finalize sanitize knobs for light MT families (GalTransl).
     * Keep streak unstick (重复粘贴) but skip invent→… wipe that blanks good paraphrases.
     * Spread into sanitizeMtCues opts from Sakura pipeline and Pro hybrid post-sanitize.
     * @param {object|string} [options] modelId / promptFamily or family string
     * @returns {object} partial sanitize opts (empty when not a light family)
     */
    function resolveLightMtFinalizeSanitizeOpts(options = {}) {
        const family = typeof options === 'string'
            ? resolvePromptFamily({ promptFamily: options, modelId: options })
            : resolvePromptFamily(options && typeof options === 'object' ? options : {});
        if (family !== 'galtransl') return {};
        return {
            unstickCrossCueZh: true,
            unstickInventWipe: false,
            dropUselessEllipsis: false,
            // GalTransl 收尾只做单条省略号直译；整轨错位回正误触发会制造数百条「…」。
            skipDialogueContentShiftRepair: true,
        };
    }

    /**
     * Adult-tone Sakura system prompt — body loaded from opaque tone-adapt payload.
     */
    function resolveNsfwSystemPrompt(options = {}) {
        // GalTransl is trained on adult VN with its own system text — Sakura NSFW
        // example dumps pull it off-distribution (empty / … / 我是Name stock).
        const family = resolvePromptFamily(options);
        if (family === 'galtransl') {
            return GALTRANSL_SYSTEM_PROMPT;
        }
        // KO specialists are not trained on JA NSFW system dumps.
        if (family === 'ln-korean') return LN_KOREAN_SYSTEM_PROMPT;
        if (family === 'ln-ko2ja') return LN_KO2JA_SYSTEM_PROMPT;
        let base = SYSTEM_PROMPT;
        if (nsfwLex?.getSakuraNsfwSystemPrompt) {
            base = nsfwLex.getSakuraNsfwSystemPrompt({ exampleLimit: 14 });
        }
        return base;
    }

    /**
     * Whether to use the NSFW-enhanced Sakura system prompt.
     * Explicit false wins; else true / av_soft / AV preset / faithful tone.
     * @param {object} [options]
     * @returns {boolean}
     */
    function shouldUseNsfwPrompt(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const family = resolvePromptFamily(opts);
        if (family === 'ln-korean' || family === 'ln-ko2ja') return false;
        if (opts.sakuraNsfwPrompt === false || opts.nsfwPrompt === false) return false;
        if (opts.sakuraNsfwPrompt === true || opts.nsfwPrompt === true) return true;
        if (opts.faithfulTone || opts.smartTranslateFaithfulTone) return true;
        const profile = String(opts.contentProfile || opts.senseProfile || '').trim().toLowerCase();
        if (profile === 'av_soft') return true;
        const preset = String(opts.presetId || opts.activePresetId || '').trim().toLowerCase();
        if (/^ja-av|av-soft|av_soft/.test(preset)) return true;
        return false;
    }

    function loadTranslateStyleCore() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./translate-style-core')
                : (global && global.TransubTranslateStyle);
        } catch (_) {
            return null;
        }
    }

    function resolveSystemPrompt(options = {}) {
        const family = resolvePromptFamily(options);
        if (family === 'ln-korean') return LN_KOREAN_SYSTEM_PROMPT;
        if (family === 'ln-ko2ja') return LN_KO2JA_SYSTEM_PROMPT;
        let base;
        if (shouldUseNsfwPrompt(options)) base = resolveNsfwSystemPrompt(options);
        else base = family === 'galtransl' ? GALTRANSL_SYSTEM_PROMPT : SYSTEM_PROMPT;
        if (family === 'galtransl') {
            // Final ellipsis quick-direct: keep official template shape; only reinforce via system.
            if (options._ellipsisQuickDirect || options.ellipsisQuickDirect) {
                return `${base}原文有实义时禁止只输出省略号或空白，必须给出对应的完整中文译文。`;
            }
            return base;
        }
        const styleCore = loadTranslateStyleCore();
        if (styleCore?.appendStyleToSystemPrompt) {
            return styleCore.appendStyleToSystemPrompt(base, options);
        }
        return base;
    }

    function normalizeCueList(cues) {
        if (!Array.isArray(cues)) return [];
        return cues.map((c, i) => ({
            index: Number.isInteger(Number(c?.index)) ? Number(c.index) : i,
            startMs: c?.startMs,
            endMs: c?.endMs,
            text: String(c?.text ?? '').replace(/\r\n/g, '\n').trim(),
        }));
    }

    function chunkCues(cues, options = {}) {
        const list = normalizeCueList(cues);
        const windowSize = Math.max(1, Math.min(20, Number(options.windowLines) || DEFAULT_WINDOW_LINES));
        const chunks = [];
        for (let i = 0; i < list.length; i += windowSize) {
            chunks.push(list.slice(i, i + windowSize));
        }
        return chunks;
    }

    /**
     * Human-readable cue ordinal range for progress logs (avoids "1/1" looking stuck).
     * Engine external MT uses 0-based ids → pass oneBasedDisplay:true.
     * @param {Array} cues
     * @param {{ oneBasedDisplay?: boolean|null }} [options]
     * @returns {string} e.g. "第 9–16 条" or ""
     */
    function formatCueOrdinalRange(cues, options = {}) {
        const idxs = (Array.isArray(cues) ? cues : [])
            .map((c) => Number(c?.index))
            .filter((n) => Number.isFinite(n));
        if (!idxs.length) return '';
        const min = Math.min(...idxs);
        const max = Math.max(...idxs);
        let shift = 0;
        if (options.oneBasedDisplay === true) shift = 1;
        else if (options.oneBasedDisplay === false) shift = 0;
        else shift = idxs.includes(0) ? 1 : 0;
        const a = min + shift;
        const b = max + shift;
        return a === b ? `第 ${a} 条` : `第 ${a}–${b} 条`;
    }

    function formatGlossaryBlock(glossaryTerms, options = {}) {
        const terms = Array.isArray(glossaryTerms) ? glossaryTerms : [];
        if (!terms.length) return '';
        const max = Math.max(8, Math.min(60, Number(options.maxTerms) || 40));
        const lines = [];
        for (const t of terms.slice(0, max)) {
            const src = String(t?.term || t?.src || '').trim();
            // Do not fall back to term→term identity; that trains small models to echo 译名表 dumps.
            const dst = String(t?.translation || t?.dst || '').trim();
            if (!src || !dst || src === dst) continue;
            const info = String(t?.info || t?.note || '').trim();
            lines.push(info ? `${src}->${dst} #${info}` : `${src}->${dst}`);
        }
        return lines.join('\n');
    }

    function formatCastNamesBlock(names, options = {}) {
        const max = Math.max(4, Math.min(24, Number(options.maxNames) || 16));
        const list = [];
        const seen = new Set();
        for (const n of Array.isArray(names) ? names : []) {
            const s = String(n || '').trim();
            if (!s || seen.has(s)) continue;
            seen.add(s);
            list.push(s);
            if (list.length >= max) break;
        }
        if (!list.length) return '';
        return `出场人物（沿用这些写法，禁止发明人名）：${list.join('、')}`;
    }

    function shouldMergeAvGlossary(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        if (opts.avGlossary === false || opts.avActorGlossary === false) return false;
        if (opts.avGlossary === true || opts.avActorGlossary === true) return true;
        // GalTransl already knows soft-AV JA; SakuraDict substring injects (セックス→做爱
        // inside セックスレス) poison the official empty-glossary template.
        if (resolvePromptFamily(opts) === 'galtransl') return false;
        if (shouldUseNsfwPrompt(opts)) return true;
        const profile = String(opts.contentProfile || opts.senseProfile || '').trim().toLowerCase();
        if (profile === 'av_soft') return true;
        const preset = String(opts.presetId || opts.activePresetId || '').trim().toLowerCase();
        return /^ja-av|av-soft|av_soft/.test(preset);
    }

    function resolveGlossaryTermsForPrompt(options = {}, sourceText = '') {
        let user = Array.isArray(options.glossaryTerms) ? options.glossaryTerms : [];
        const targetOpts = {
            targetLang: options.targetLang || options.subtitleTargetLang,
            subtitleTargetLang: options.subtitleTargetLang || options.targetLang,
            chineseSubtitleVariant: options.chineseSubtitleVariant,
            targetLanguage: options.targetLanguage,
        };
        if (shouldMergeAvGlossary(options) && avGlossary?.mergeAvGlossaryTerms) {
            user = avGlossary.mergeAvGlossaryTerms(user, sourceText, {
                maxActorTerms: Number(options.avActorGlossaryLimit) || 20,
                maxDomainTerms: Number(options.avDomainGlossaryLimit) || 12,
                avGlossary: true,
                avDomainGlossary: options.avDomainGlossary,
                ...targetOpts,
            });
        }
        let pickApi = null;
        try {
            pickApi = (typeof module !== 'undefined' && module.exports)
                ? require('./glossary-target-pick-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubGlossaryTargetPick : null);
        } catch { /* optional */ }
        const allowZhLex = !pickApi?.shouldInjectZhLexiconForTarget
            || pickApi.shouldInjectZhLexiconForTarget(targetOpts);
        if (!allowZhLex || !shouldUseNsfwPrompt(options) || !nsfwLex?.mergeNsfwGlossaryTerms) {
            return user;
        }
        // GalTransl official template expects an empty glossary by default; injecting
        // NSFW stems (セックス→做爱) poisons compounds like セックスレス.
        const family = resolvePromptFamily(options);
        if (family === 'galtransl' || family === 'ln-korean' || family === 'ln-ko2ja') {
            return user;
        }
        return nsfwLex.mergeNsfwGlossaryTerms(user, sourceText, {
            enabled: options.nsfwLexicon !== false,
            limit: Number(options.nsfwLexiconLimit) || 28,
        });
    }

    /**
     * Official GalTransl v3.7 / v4 user template (SakuraLLM / GalTransl pipeline):
     * `根据以下术语表（可以为空）：\n{dict}\n\n将下面的日文文本根据对应关系和备注翻译成中文：{src}`
     * Source must follow the colon immediately (same line). Line-count / 拟声 rules
     * between the colon and JA make IQ4 and Q6_K alike emit … or 好厉害 / 我是Name.
     */
    function buildGalTranslChatMessages(chunkCuesList, options = {}) {
        const list = normalizeCueList(chunkCuesList);
        const joined = list.map((c) => c.text || '').join('\n');
        const glossaryTerms = resolveGlossaryTermsForPrompt(options, joined);
        const glossary = formatGlossaryBlock(glossaryTerms, { maxTerms: 48 });
        const user = `根据以下术语表（可以为空）：\n${glossary}\n\n将下面的日文文本根据对应关系和备注翻译成中文：${joined}`;
        return [
            { role: 'system', content: resolveSystemPrompt({ ...options, promptFamily: 'galtransl' }) },
            { role: 'user', content: user },
        ];
    }

    /** Official LN-Korean user shape: `翻译成中文：\n{text}` (source after colon+newline). */
    function buildLnKoreanChatMessages(chunkCuesList, options = {}) {
        const list = normalizeCueList(chunkCuesList);
        const joined = list.map((c) => c.text || '').join('\n');
        return [
            { role: 'system', content: resolveSystemPrompt({ ...options, promptFamily: 'ln-korean' }) },
            { role: 'user', content: `翻译成中文：\n${joined}` },
        ];
    }

    /** Official LN-ko2ja user shape: `日本語に訳してください\n{text}`. */
    function buildLnKo2jaChatMessages(chunkCuesList, options = {}) {
        const list = normalizeCueList(chunkCuesList);
        const joined = list.map((c) => c.text || '').join('\n');
        return [
            { role: 'system', content: resolveSystemPrompt({ ...options, promptFamily: 'ln-ko2ja' }) },
            { role: 'user', content: `日本語に訳してください\n${joined}` },
        ];
    }

    function buildChatMessages(chunkCuesList, options = {}) {
        const family = resolvePromptFamily(options);
        if (family === 'galtransl') {
            return buildGalTranslChatMessages(chunkCuesList, options);
        }
        if (family === 'ln-korean') {
            return buildLnKoreanChatMessages(chunkCuesList, options);
        }
        if (family === 'ln-ko2ja') {
            return buildLnKo2jaChatMessages(chunkCuesList, options);
        }
        if (family === 'translategemmasub' && tgCore?.buildTranslateGemmaSubChatMessages) {
            return tgCore.buildTranslateGemmaSubChatMessages(chunkCuesList, options);
        }
        if (family === 'translategemma' && tgCore?.buildTranslateGemmaChatMessages) {
            return tgCore.buildTranslateGemmaChatMessages(chunkCuesList, options);
        }
        if (family === 'hunyuan' && hymtCore?.buildHunyuanMtChatMessages) {
            return hymtCore.buildHunyuanMtChatMessages(chunkCuesList, options);
        }
        if (family === 'hymt' && hymtCore?.buildHyMtChatMessages) {
            return hymtCore.buildHyMtChatMessages(chunkCuesList, options);
        }
        const list = normalizeCueList(chunkCuesList);
        const joined = list.map((c) => c.text || '').join('\n');
        const nsfw = shouldUseNsfwPrompt(options);
        const glossaryTerms = resolveGlossaryTermsForPrompt(options, joined);
        const glossary = formatGlossaryBlock(glossaryTerms, {
            maxTerms: nsfw ? 48 : 40,
        });
        const cast = formatCastNamesBlock(options.castNames);
        const lineRule = nsfw
            ? `共 ${list.length} 行。只输出译文，每行对应原文一行；不要编号、不要解释、不要空行；碎句与拟声勿删并勿并行走（条目删减由后处理完成）。须忠实还原语意，禁止漏译/错译/摘要；原文仅为纯语气/拟声（如单独うん/はぁ）时可译为对应短语气词；对白有完整语义时禁止只输出语气词（嗯/啊/请/好的等），须译出完整意思，句末语气词可保留。`
            : `共 ${list.length} 行。只输出译文，每行对应原文一行，不要编号、不要解释、不要空行、不要额外内容。须忠实还原语意，禁止漏译/错译/摘要；原文仅为纯语气/拟声时可短译；对白有完整语义时禁止只输出语气词（嗯/啊/请等），须译出完整意思。`;
        const prefix = [cast, glossary ? `根据以下术语表（可以为空）：\n${glossary}` : '']
            .filter(Boolean)
            .join('\n');
        const styleCore = loadTranslateStyleCore();
        const stylePrefix = styleCore?.buildStyleUserPrefix?.(options) || '';
        let targetLabel = '中文';
        try {
            const tgt = (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-target-lang-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleTargetLang : null);
            if (tgt?.resolveSubtitleTargetLang && tgt?.subtitleTargetLangLabel) {
                const lang = tgt.resolveSubtitleTargetLang(options);
                if (lang && !tgt.isZhSubtitleTarget(lang)) {
                    targetLabel = tgt.subtitleTargetLangLabel(lang);
                }
            }
        } catch { /* keep 中文 */ }
        const userBody = prefix
            ? `${prefix}\n将下面的日文文本${glossary ? '根据对应关系和备注' : ''}翻译成${targetLabel}。${lineRule}\n${joined}`
            : `将下面的日文文本翻译成${targetLabel}。${lineRule}\n${joined}`;
        const user = `${stylePrefix}${userBody}`;
        return [
            { role: 'system', content: resolveSystemPrompt(options) },
            { role: 'user', content: user },
        ];
    }

    /**
     * Cap generation length so llama-server won't fill the whole context
     * (common cause of multi-minute stalls on later batch chunks).
     * @param {Array} cues
     * @returns {number}
     */
    function estimateMaxTokens(cues) {
        const list = normalizeCueList(cues);
        let chars = 0;
        for (const c of list) chars += String(c.text || '').length;
        // CJK ~1–2 tokens/char; multi-cue soft windows need decode headroom beyond 512.
        const est = Math.ceil(chars * 2.2) + (list.length * 8) + 48;
        const floor = list.length >= 4
            ? Math.min(768, 128 + (list.length * 64))
            : 64;
        return Math.max(floor, Math.min(1024, est));
    }

    /**
     * Align model output lines to cue indexes (pad/truncate to expected count).
     * When got < expected, sets lineCountMismatch — callers must not trust
     * positional alignment (mid-window skip shifts later lines onto wrong JA).
     */
    function parseLineAlignedOutput(content, expectedCues) {
        const expected = normalizeCueList(expectedCues);
        let raw = String(content || '').replace(/\r\n/g, '\n').trim();
        if (!raw) {
            return { ok: false, error: '模型返回为空', cues: [], lineCountMismatch: false };
        }
        // Strip common markdown fences
        let text = raw;
        const fence = text.match(/^```(?:\w+)?\n([\s\S]*?)```$/);
        if (fence) text = fence[1].trim();

        let sanitizeApi = null;
        try {
            sanitizeApi = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (typeof globalThis !== 'undefined' && globalThis.TransubMtSanitize);
            if (typeof sanitizeApi?.stripLlmThinkWrappers === 'function') {
                text = sanitizeApi.stripLlmThinkWrappers(text);
            }
        } catch (_) { /* optional */ }

        let lines = text.split('\n').map((l) => l.trimEnd());
        // Drop leading/trailing empty lines only
        while (lines.length && !lines[0].trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        if (tgCore?.stripTranslateGemmaLeak) {
            lines = lines.map((line) => tgCore.stripTranslateGemmaLeak(line));
        }
        if (tgCore?.stripTranslateGemmaSubLeak) {
            lines = lines.map((line) => tgCore.stripTranslateGemmaSubLeak(line));
        }
        if (hymtCore?.stripHyMtLeak) {
            lines = lines.map((line) => hymtCore.stripHyMtLeak(line));
        }

        // Always peel leading/trailing /no_think control lines before length math —
        // otherwise surplus truncate keeps the control token and drops the last real cue
        // (whole-window shift → “英文字幕完全错乱”).
        const isControlLine = (line) => {
            const t = String(line || '').trim();
            if (!t) return false;
            if (typeof sanitizeApi?.looksLikeLlmControlLine === 'function') {
                return sanitizeApi.looksLikeLlmControlLine(t);
            }
            return /^\/?no_think\b/i.test(t)
                || /^\/think\b/i.test(t)
                || /^\/[\u4e00-\u9fff]{1,4}[A-Za-z0-9_]*[\s。．.!！?？]*$/.test(t);
        };
        while (lines.length && isControlLine(lines[0])) lines.shift();
        while (lines.length && isControlLine(lines[lines.length - 1])) lines.pop();

        // Model sometimes echoes the system prompt as line 0 (or before real cues).
        // Surplus preamble → drop; exact/deficit count → blank in place (don't shift / misalign).
        let lineIsLeak = () => false;
        try {
            const sanitize = sanitizeApi;
            const looksLeak = sanitize?.looksLikePromptLeak;
            const looksHyMtLeak = hymtCore?.looksLikeHyMtPromptLeak;
            const looksTgLeak = tgCore?.looksLikeTranslateGemmaPromptLeak;
            lineIsLeak = (line) => {
                const t = String(line || '').trim();
                if (!t) return false;
                if (isControlLine(t)) return true;
                if (typeof looksTgLeak === 'function' && looksTgLeak(t)) return true;
                if (typeof looksHyMtLeak === 'function' && looksHyMtLeak(t)) return true;
                if (typeof sanitize?.looksLikeEnMtMetaLeak === 'function' && sanitize.looksLikeEnMtMetaLeak(t)) {
                    return true;
                }
                return typeof looksLeak === 'function' && looksLeak(t);
            };
            while (lines.length > expected.length && lineIsLeak(lines[0])) {
                lines.shift();
            }
            // Drop leading empty leftovers from prior control peels when we still have surplus
            while (lines.length > expected.length && !String(lines[0] || '').trim()) {
                lines.shift();
            }
            lines = lines.map((line) => {
                if (lineIsLeak(line) || isControlLine(line)) return '';
                let out = line;
                if (typeof sanitize?.stripLlmControlTokens === 'function') {
                    out = sanitize.stripLlmControlTokens(out).text;
                }
                if (typeof sanitize?.stripNumberedListMtArtifact === 'function') {
                    out = sanitize.stripNumberedListMtArtifact(out).text;
                }
                return out;
            });
        } catch (_) { /* ignore */ }

        if (lines.length === 1 && expected.length > 1) {
            // Sometimes model joins with fullwidth/ascii separators
            const parts = lines[0].split(/\s*[|｜]\s*/).map((s) => s.trim()).filter(Boolean);
            if (parts.length === expected.length) lines = parts;
        }

        const gotLineCount = lines.length;
        const expectedLineCount = expected.length;
        const lineCountMismatch = gotLineCount !== expectedLineCount;

        if (lines.length < expected.length) {
            while (lines.length < expected.length) lines.push('');
        } else if (lines.length > expected.length) {
            // Surplus count: drop leading instruction echoes before head-truncating.
            // Undetected prompt line 0 + N dialogue lines used to keep the leak and drop
            // the last real cue (FTHTD-193 whole-track misalign from cue ~81).
            while (lines.length > expected.length && (lineIsLeak(lines[0]) || isControlLine(lines[0]) || !String(lines[0] || '').trim())) {
                lines.shift();
            }
            if (lines.length > expected.length) {
                // Truncate surplus lines. Merging them into the last cue used to turn
                // model loop/collapse (e.g. "笑我"×N) into one mega-subtitle.
                lines = lines.slice(0, expected.length);
            }
        }

        return {
            ok: true,
            cues: expected.map((c, i) => {
                let text = String(lines[i] ?? '').trim();
                if (tgCore?.finalizeTranslateGemmaCue) {
                    text = tgCore.finalizeTranslateGemmaCue(c.text, text);
                } else {
                    if (
                        tgCore?.looksLikeTranslateGemmaIdentityEcho
                        && tgCore.looksLikeTranslateGemmaIdentityEcho(c.text, text)
                    ) {
                        text = '';
                    }
                    if (
                        tgCore?.looksLikeTranslateGemmaEllipsisCollapse
                        && tgCore.looksLikeTranslateGemmaEllipsisCollapse(c.text, text)
                    ) {
                        text = '';
                    }
                    if (
                        tgCore?.looksLikeTranslateGemmaSafetyRefusal
                        && tgCore.looksLikeTranslateGemmaSafetyRefusal(text)
                    ) {
                        text = '';
                    }
                    if (text && tgCore?.preserveTrailingEllipsis) {
                        text = tgCore.preserveTrailingEllipsis(c.text, text);
                    }
                }
                return {
                    index: c.index,
                    text,
                };
            }),
            lineCountMismatch,
            gotLineCount,
            expectedLineCount,
        };
    }

    /**
     * Indexes whose source was non-empty but translation is blank / punctuation-only.
     * @param {Array} sourceCues
     * @param {Array} translatedCues
     * @returns {number[]}
     */
    function isBlankOrPunctTranslation(text, sourceText = '') {
        try {
            const sanitize = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (typeof globalThis !== 'undefined' && globalThis.TransubMtSanitize);
            if (sanitize?.isBlankOrPunctTranslation) {
                return sanitize.isBlankOrPunctTranslation(text, sourceText);
            }
        } catch (_) { /* ignore */ }
        const t = String(text || '').trim();
        if (!t) return true;
        if (sourceText && t === String(sourceText).trim()) return true;
        return /^[。．.、，,\s…·•\-—_~～]+$/.test(t);
    }

    /**
     * Detect silent exact-count mis-attach inside a multi-line window.
     * Hy-MT may skip JA[i] yet still emit N lines → count matches, later ZH on wrong JA.
     * @returns {{ suspicious: boolean, reason?: string, offset0?: object, offset1?: object }}
     */
    /**
     * JA→ZH semantic pairs for silent +1 detection when digit/kata anchors are absent
     * (soft dialogue: セクシー/桜/デート). Literal ZH needles only — no adult slang.
     */
    const POSITIONAL_SEMANTIC_PAIRS = [
        [/セクシー/, ['性感']],
        [/桜/, ['樱']],
        [/お洋服|洋服/, ['衣服', '穿']],
        [/大丈夫/, ['没事', '没问题', '大丈夫']],
        [/気持ち(?:いい|良い|よい)|きもち(?:いい|ぃ)/, ['舒服', '爽']],
        [/Vログ|ブイログ/, ['Vlog', 'vlog', '博客']],
        [/デート/, ['约会']],
        [/後輩/, ['后辈']],
        [/先輩/, ['前辈']],
        [/彼女/, ['女友', '女朋友']],
        [/高校/, ['高中']],
        [/撮[るっりてた]|撮れて/, ['拍']],
        [/遅れ/, ['迟到', '晚了']],
        [/私服/, ['便服', '私服']],
        [/可愛い/, ['可爱']],
        [/似合/, ['合适', '适合']],
        [/天気/, ['天气']],
        [/待[っつた]/, ['等']],
        [/気になって|気になる/, ['在意', '关心', '在乎']],
        [/落ち[るりた]/, ['掉', '落', '摔']],
        [/お出かけ|出かけ/, ['出门', '出去']],
        [/上司|部下/, ['上司', '下属', '上下级']],
        [/先輩|センパイ|せんぱい/, ['前辈', '学长', '学姐']],
    ];

    function assessPositionalAlignQuality(sourceCues, translatedCues) {
        const src = normalizeCueList(sourceCues);
        const zhList = Array.isArray(translatedCues) ? translatedCues : [];
        if (src.length < 3) return { suspicious: false };
        const byIndex = new Map();
        for (const u of zhList) {
            const idx = Number(u?.index);
            if (Number.isInteger(idx)) byIndex.set(idx, String(u?.text ?? '').trim());
        }
        const zhTexts = src.map((c) => (
            byIndex.has(c.index) ? byIndex.get(c.index) : String(c.text ?? '').trim()
        ));

        function extractAnchors(jaText) {
            const t = String(jaText || '');
            const out = [];
            const nums = t.match(/[0-9０-９]{1,6}/g);
            if (nums) out.push(...nums);
            const kata = t.match(/[ァ-ヴー]{3,}/g);
            if (kata) out.push(...kata);
            // Kanji numerals / 倍 units (Hy-MT silent +N often moves these)
            const kanjiNum = t.match(/[一二三四五六七八九十百千万億兆兩两]{1,8}(?:倍|回|人|歳|歳|分|秒)?/g);
            if (kanjiNum) out.push(...kanjiNum.filter((s) => s.length >= 2));
            return [...new Set(out)];
        }

        function extractSemanticNeedles(jaText) {
            const t = String(jaText || '');
            const out = [];
            for (const [re, needles] of POSITIONAL_SEMANTIC_PAIRS) {
                if (re.test(t)) out.push(...needles);
            }
            return [...new Set(out)];
        }

        function scoreOffset(off, mode = 'literal') {
            let hits = 0;
            let checks = 0;
            for (let i = 0; i < src.length; i += 1) {
                const anchors = mode === 'semantic'
                    ? extractSemanticNeedles(src[i].text)
                    : extractAnchors(src[i].text);
                if (!anchors.length) continue;
                const j = i + off;
                if (j < 0 || j >= zhTexts.length) continue;
                const zt = zhTexts[j] || '';
                if (!zt || /^…+$/.test(zt)) continue;
                checks += 1;
                if (anchors.some((a) => zt.includes(a))) hits += 1;
            }
            return { hits, checks };
        }

        function clearShift(preferred, baseline) {
            return preferred.hits > baseline.hits
                && preferred.hits >= 1
                && (baseline.hits === 0 || preferred.hits >= baseline.hits + 2)
                && (baseline.checks + preferred.checks) >= 2;
        }

        const z0 = scoreOffset(0);
        const z1 = scoreOffset(1);
        const zNeg = scoreOffset(-1);
        if (clearShift(z1, z0)) {
            return { suspicious: true, reason: 'offset_plus_one', offset0: z0, offset1: z1 };
        }
        if (clearShift(zNeg, z0)) {
            return { suspicious: true, reason: 'offset_minus_one', offset0: z0, offset1: zNeg };
        }

        const s0 = scoreOffset(0, 'semantic');
        const s1 = scoreOffset(1, 'semantic');
        const sNeg = scoreOffset(-1, 'semantic');
        // Soft dialogue often has few digit/kata anchors; semantic needles catch silent +1.
        if (clearShift(s1, s0) || (s1.hits >= 2 && s1.hits > s0.hits && s0.hits <= 1)) {
            return {
                suspicious: true,
                reason: 'offset_plus_one_semantic',
                offset0: s0,
                offset1: s1,
            };
        }
        if (clearShift(sNeg, s0) || (sNeg.hits >= 2 && sNeg.hits > s0.hits && s0.hits <= 1)) {
            return {
                suspicious: true,
                reason: 'offset_minus_one_semantic',
                offset0: s0,
                offset1: sNeg,
            };
        }
        // Opening soft-AV scramble: many strong needles miss at offset 0 without a clean +1 win.
        if (s0.checks >= 4 && s0.hits / s0.checks <= 0.35) {
            return {
                suspicious: true,
                reason: 'semantic_hit_rate_low',
                offset0: s0,
                offset1: s1,
            };
        }

        // Short reactive JA glued to next line's long ZH (どう? ← セクシー…).
        let reactiveMisfit = 0;
        for (let i = 0; i < src.length - 1; i += 1) {
            const ja = String(src[i].text || '').trim();
            const nextJa = String(src[i + 1].text || '').trim();
            const zh = zhTexts[i] || '';
            const nextZh = zhTexts[i + 1] || '';
            const jl = [...ja.replace(/\s/g, '')].length;
            const njl = [...nextJa.replace(/\s/g, '')].length;
            const zl = [...zh.replace(/\s/g, '')].length;
            const nzl = [...nextZh.replace(/\s/g, '')].length;
            if (
                jl >= 1 && jl <= 4
                && zl >= Math.max(8, jl * 3)
                && njl >= 6
                && nzl >= 2
                && /^(?:どう|なに|何|えっ?|あっ?|うん|はい|ねえ?|ほら|そう|ってわけで)[。．.!！?？…ー〜～っッ\s]*$/u.test(ja)
            ) {
                const nextNeedles = extractSemanticNeedles(nextJa);
                // Only flag when ZH looks like the *next* JA's content, not a legit long answer to どう?
                if (nextNeedles.length && nextNeedles.some((n) => zh.includes(n))) {
                    reactiveMisfit += 1;
                } else if (!nextNeedles.length && zl >= Math.max(12, njl)) {
                    reactiveMisfit += 1;
                }
            }
        }
        if (reactiveMisfit >= 1 && src.length >= 3) {
            return {
                suspicious: true,
                reason: 'reactive_long_zh_misfit',
                reactiveMisfit,
            };
        }

        // Substantive JA blanked while neighbors have text — likely mid-skip scramble residue.
        let substantiveBlank = 0;
        let substantive = 0;
        for (let i = 0; i < src.length; i += 1) {
            const ja = String(src[i].text || '').trim();
            const jl = [...ja.replace(/\s/g, '')].length;
            if (jl < 4) continue;
            if (/^[ぁ-んァ-ンーっッはぁアうぐずひゃんむ]+$/u.test(ja.replace(/\s/g, ''))) continue;
            substantive += 1;
            const zt = zhTexts[i] || '';
            if (!zt || isBlankOrPunctTranslation(zt, ja)) substantiveBlank += 1;
        }
        if (substantive >= 3 && substantiveBlank >= 2 && substantiveBlank / substantive >= 0.5) {
            return {
                suspicious: true,
                reason: 'substantive_blank_cluster',
                substantive,
                substantiveBlank,
            };
        }
        return { suspicious: false, offset0: z0, offset1: z1, semantic0: s0, semantic1: s1 };
    }

    function collectBlankTranslationIndexes(sourceCues, translatedCues) {
        const byIndex = new Map();
        for (const u of translatedCues || []) {
            const idx = Number(u?.index);
            if (!Number.isInteger(idx)) continue;
            byIndex.set(idx, String(u?.text ?? '').trim());
        }
        const out = [];
        for (const c of normalizeCueList(sourceCues)) {
            const src = String(c.text || '').trim();
            if (!src) continue;
            const translated = byIndex.has(c.index) ? byIndex.get(c.index) : '';
            if (isBlankOrPunctTranslation(translated, src)) out.push(c.index);
        }
        return out;
    }

    /**
     * Empty / ellipsis / punct-only — no invent-as-blank heuristics.
     * Used by GalTransl mid-pass so sanitize false-positives cannot seed blank-retry storms.
     */
    function isLiteralBlankTranslation(text) {
        const t = String(text || '').trim();
        if (!t) return true;
        if (/^(?:\.\.\.|……|…)+$/.test(t)) return true;
        if (/^[。．.、，,\s…·•\-—_~～]+$/.test(t)) return true;
        return false;
    }

    /**
     * GalTransl window silent +1: consecutive ZH share a long prefix / paraphrase
     * while JA lines diverge (MFYD-182 opening: 医学角度坦白 / 实话实说 on 隣に座っている).
     * @returns {{ suspicious: boolean, reason?: string, pairs?: number }}
     */
    function assessNeighborParaphraseBleed(sourceCues, translatedCues, options = {}) {
        const src = normalizeCueList(sourceCues);
        const zhList = Array.isArray(translatedCues) ? translatedCues : [];
        if (src.length < 2) return { suspicious: false };
        const byIndex = new Map();
        for (const u of zhList) {
            const idx = Number(u?.index);
            if (Number.isInteger(idx)) byIndex.set(idx, String(u?.text ?? '').trim());
        }
        const minPrefix = Math.max(6, Math.min(16, Number(options.minPrefix) || 8));
        let pairs = 0;
        for (let i = 1; i < src.length; i += 1) {
            const prev = byIndex.has(src[i - 1].index) ? byIndex.get(src[i - 1].index) : '';
            const cur = byIndex.has(src[i].index) ? byIndex.get(src[i].index) : '';
            if (isLiteralBlankTranslation(prev) || isLiteralBlankTranslation(cur)) continue;
            if (prev.length < minPrefix || cur.length < minPrefix) continue;
            let p = 0;
            const lim = Math.min(prev.length, cur.length);
            while (p < lim && prev[p] === cur[p]) p += 1;
            if (p < minPrefix) continue;
            const jaPrev = String(src[i - 1].text || '').replace(/\s/g, '');
            const jaCur = String(src[i].text || '').replace(/\s/g, '');
            // JA must diverge — identical JA legitimately shares ZH.
            if (!jaPrev || !jaCur || jaPrev === jaCur) continue;
            let jp = 0;
            const jlim = Math.min(jaPrev.length, jaCur.length, 12);
            while (jp < jlim && jaPrev[jp] === jaCur[jp]) jp += 1;
            if (jp >= 8) continue;
            pairs += 1;
        }
        if (pairs >= 1 && src.length <= 12) {
            return { suspicious: true, reason: 'neighbor_paraphrase_bleed', pairs };
        }
        if (pairs >= 2) {
            return { suspicious: true, reason: 'neighbor_paraphrase_bleed', pairs };
        }
        return { suspicious: false, pairs };
    }

    function collectLiteralBlankTranslationIndexes(sourceCues, translatedCues) {
        const byIndex = new Map();
        for (const u of translatedCues || []) {
            const idx = Number(u?.index);
            if (!Number.isInteger(idx)) continue;
            byIndex.set(idx, String(u?.text ?? '').trim());
        }
        const out = [];
        for (const c of normalizeCueList(sourceCues)) {
            const src = String(c.text || '').trim();
            if (!src) continue;
            const translated = byIndex.has(c.index) ? byIndex.get(c.index) : '';
            if (isLiteralBlankTranslation(translated)) out.push(c.index);
        }
        return out;
    }

    /**
     * Source cues whose ZH is still empty/ellipsis after the main MT + blank-retry path.
     * Skips ASR-garbage JA (should stay blank/deleted). Used for final quick-direct fill.
     * @returns {object[]} cue objects from source
     */
    function collectCuesForEllipsisQuickDirect(sourceCues, translatedCues, options = {}) {
        const indexes = collectLiteralBlankTranslationIndexes(sourceCues, translatedCues);
        if (!indexes.length) return [];
        const bySrc = new Map(
            normalizeCueList(sourceCues).map((c) => [Number(c.index), c]),
        );
        let isAsrGarbageJa = null;
        try {
            const lex = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-lexicon')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubMtSanitizeLexicon : null);
            if (typeof lex?.isAsrGarbageJa === 'function') isAsrGarbageJa = lex.isAsrGarbageJa;
        } catch (_) { /* optional */ }
        const cues = [];
        for (const idx of indexes) {
            const cue = bySrc.get(Number(idx));
            if (!cue) continue;
            const ja = String(cue.text || '').trim();
            if (!ja) continue;
            if (isAsrGarbageJa?.(ja)) continue;
            if (typeof options.shouldSkip === 'function' && options.shouldSkip(cue)) continue;
            cues.push(cue);
        }
        const maxN = Number(options.maxCount);
        if (Number.isFinite(maxN) && maxN >= 0 && cues.length > maxN) {
            return cues.slice(0, Math.max(0, Math.round(maxN)));
        }
        return cues;
    }

    /**
     * Whole-track / sliding-window cue indexes that look mis-attached or invented.
     * Used as a final blank-retry gate after multi-chunk MT (FNS-256 silent shift).
     * @returns {number[]}
     */
    function collectMisalignedCueIndexes(sourceCues, translatedCues, options = {}) {
        const src = normalizeCueList(sourceCues);
        const zhList = Array.isArray(translatedCues) ? translatedCues : [];
        const byIndex = new Map();
        for (const u of zhList) {
            const idx = Number(u?.index);
            if (Number.isInteger(idx)) byIndex.set(idx, String(u?.text ?? '').trim());
        }
        const bad = new Set();
        let sanitize = null;
        try {
            sanitize = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (typeof globalThis !== 'undefined' && globalThis.TransubMtSanitize);
        } catch (_) { /* optional */ }

        for (const c of src) {
            const ja = String(c.text || '').trim();
            if (!ja) continue;
            const zh = byIndex.has(c.index) ? byIndex.get(c.index) : '';
            if (!zh) {
                bad.add(c.index);
                continue;
            }
            if (typeof sanitize?.looksLikeFilmingZhInvent === 'function'
                && sanitize.looksLikeFilmingZhInvent(zh, ja)) {
                bad.add(c.index);
                continue;
            }
            if (typeof sanitize?.looksLikeMissingFilmingZh === 'function'
                && sanitize.looksLikeMissingFilmingZh(zh, ja)) {
                bad.add(c.index);
                continue;
            }
            if (typeof sanitize?.looksLikeCrossCuePlotBleed === 'function'
                && sanitize.looksLikeCrossCuePlotBleed(zh, ja)) {
                bad.add(c.index);
                continue;
            }
            if (typeof sanitize?.looksLikeSemanticMisattach === 'function'
                && sanitize.looksLikeSemanticMisattach(zh, ja)) {
                bad.add(c.index);
                continue;
            }
            if (isBlankOrPunctTranslation(zh, ja)) bad.add(c.index);
        }

        const windowSize = Math.max(3, Math.min(12, Number(options.windowSize) || 8));
        const step = Math.max(2, Math.floor(windowSize / 2));
        for (let i = 0; i < src.length; i += step) {
            const slice = src.slice(i, i + windowSize);
            if (slice.length < 3) break;
            const sliceZh = slice.map((c) => ({
                index: c.index,
                text: byIndex.has(c.index) ? byIndex.get(c.index) : '',
            }));
            const pos = assessPositionalAlignQuality(slice, sliceZh);
            if (pos?.suspicious) {
                // Soft window reasons coexist with correct islands — per-cue detectors
                // above already catch invent/misattach/blank. Mass-blanking the slice
                // seeded false 空白重译 / QC 闭环 on lecture dialogue (MFYD-182).
                const reason = String(pos.reason || '');
                if (
                    reason === 'semantic_hit_rate_low'
                    || reason === 'reactive_long_zh_misfit'
                    || reason === 'substantive_blank_cluster'
                    || reason === 'offset_plus_one_semantic'
                    || reason === 'offset_minus_one_semantic'
                ) {
                    continue;
                }
                // Hard literal ±1 digit/kata shift: only mark cues that fail anchors at 0
                // or already look empty/invent — never wipe a whole healthy island.
                if (reason === 'offset_plus_one' || reason === 'offset_minus_one') {
                    for (const c of slice) {
                        const zh = byIndex.has(c.index) ? byIndex.get(c.index) : '';
                        if (!zh || isBlankOrPunctTranslation(zh, c.text)) {
                            bad.add(c.index);
                            continue;
                        }
                        if (typeof sanitize?.looksLikeFilmingZhInvent === 'function'
                            && sanitize.looksLikeFilmingZhInvent(zh, c.text)) {
                            bad.add(c.index);
                            continue;
                        }
                        if (typeof sanitize?.looksLikeSemanticMisattach === 'function'
                            && sanitize.looksLikeSemanticMisattach(zh, c.text)) {
                            bad.add(c.index);
                        }
                    }
                    continue;
                }
                for (const c of slice) bad.add(c.index);
            }
        }
        return [...bad].filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
    }

    return {
        DEFAULT_WINDOW_LINES,
        SYSTEM_PROMPT,
        GALTRANSL_SYSTEM_PROMPT,
        LN_KOREAN_SYSTEM_PROMPT,
        LN_KO2JA_SYSTEM_PROMPT,
        get SYSTEM_PROMPT_NSFW() {
            return resolveNsfwSystemPrompt();
        },
        resolvePromptFamily,
        resolveLightMtFinalizeSanitizeOpts,
        shouldUseNsfwPrompt,
        resolveSystemPrompt,
        normalizeCueList,
        chunkCues,
        formatCueOrdinalRange,
        formatGlossaryBlock,
        formatCastNamesBlock,
        resolveGlossaryTermsForPrompt,
        buildChatMessages,
        estimateMaxTokens,
        buildGalTranslChatMessages,
        buildLnKoreanChatMessages,
        buildLnKo2jaChatMessages,
        parseLineAlignedOutput,
        assessPositionalAlignQuality,
        isBlankOrPunctTranslation,
        isLiteralBlankTranslation,
        collectBlankTranslationIndexes,
        collectLiteralBlankTranslationIndexes,
        collectCuesForEllipsisQuickDirect,
        assessNeighborParaphraseBleed,
        collectMisalignedCueIndexes,
    };
}));
