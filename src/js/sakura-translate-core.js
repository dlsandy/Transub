/**
 * Sakura JA→ZH subtitle translation: prompts + line alignment (no network).
 */
(function (global, factory) {
    let nsfwLex = null;
    try {
        nsfwLex = (typeof module !== 'undefined' && module.exports)
            ? require('./tone-adapt-lexicon-core')
            : (global && (global.TransubToneAdaptLexicon || global.TransubJaNsfwLexicon));
    } catch (_) {
        nsfwLex = null;
    }
    const api = factory(nsfwLex);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSakuraTranslate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function sakuraTranslateFactory(nsfwLex) {
    const DEFAULT_WINDOW_LINES = 8;

    /** Default: short, anti-hallucination, line-safe. */
    const SYSTEM_PROMPT = [
        '你是一个日译中字幕翻译模型，译文需通顺自然口语化，避免翻译腔。',
        '联系上下文正确使用人称代词；仅在上下文明确时补「我/你」及已出现称呼，全局一致。',
        '不擅自添加原文中没有的代词、人名、称呼或旁白。',
        '专有名词仅使用原文已出现的写法或术语表译名；禁止臆造角色名。',
        '严禁添加原文未出现的常见臆造人名（如佳奈、舞、玲奈、真理、斗碧等），尤其不要在句末乱贴人名。',
        '每行只输出对应那一行的译文，禁止把多行挤进一行，禁止无意义叠词循环。',
        '原文仅为纯语气/拟声时可译为对应短语气词；有完整语义时须译全句，句末语气词可保留。',
    ].join('');

    /** GalTransl-tuned: keep subtitle line rules + VN-style voice/voice-subject caution. */
    const GALTRANSL_SYSTEM_PROMPT = [
        '你是一个视觉小说风格的日译中字幕翻译模型，译文需通顺自然口语化。',
        '联系上下文正确使用人称代词；注意不要混淆使役态和被动态的主语和宾语。',
        '不擅自添加原文中没有的代词、人名、称呼、旁白或特殊符号；禁止臆造角色名。',
        '严禁添加原文未出现的常见臆造人名（如佳奈、舞、玲奈、真理、斗碧等），尤其不要在句末乱贴人名。',
        '每行只输出对应那一行的译文，禁止把多行挤进一行，禁止无意义叠词循环，不要擅自增加或减少换行。',
        '原文仅为纯语气/拟声时可译为对应短语气词；有完整语义时须译全句，句末语气词可保留。',
    ].join('');

    const GALTRANSL_NSFW_EXTRA = '注意不要混淆使役态和被动态的主语和宾语；不要擅自添加原文没有的特殊符号。';

    function resolvePromptFamily(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const explicit = String(opts.promptFamily || '').trim().toLowerCase();
        if (explicit === 'galtransl') return 'galtransl';
        if (explicit === 'sakura') return 'sakura';
        const modelId = String(opts.modelId || opts.engineMtModel || '').trim();
        if (/galtransl/i.test(modelId)) return 'galtransl';
        try {
            const catalog = (typeof module !== 'undefined' && module.exports)
                ? require('./sakura-mt-catalog-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSakuraMtCatalog : null);
            if (catalog?.resolvePromptFamily) return catalog.resolvePromptFamily(modelId || opts);
        } catch (_) { /* ignore */ }
        return 'sakura';
    }

    /**
     * Adult-tone Sakura system prompt — body loaded from opaque tone-adapt payload.
     */
    function resolveNsfwSystemPrompt(options = {}) {
        let base = SYSTEM_PROMPT;
        if (nsfwLex?.getSakuraNsfwSystemPrompt) {
            base = nsfwLex.getSakuraNsfwSystemPrompt({ exampleLimit: 14 });
        }
        if (resolvePromptFamily(options) === 'galtransl') {
            return `${base}${GALTRANSL_NSFW_EXTRA}`;
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
        if (opts.sakuraNsfwPrompt === false || opts.nsfwPrompt === false) return false;
        if (opts.sakuraNsfwPrompt === true || opts.nsfwPrompt === true) return true;
        if (opts.faithfulTone || opts.smartTranslateFaithfulTone) return true;
        const profile = String(opts.contentProfile || opts.senseProfile || '').trim().toLowerCase();
        if (profile === 'av_soft') return true;
        const preset = String(opts.presetId || opts.activePresetId || '').trim().toLowerCase();
        if (/^ja-av|av-soft|av_soft/.test(preset)) return true;
        return false;
    }

    function resolveSystemPrompt(options = {}) {
        if (shouldUseNsfwPrompt(options)) return resolveNsfwSystemPrompt(options);
        return resolvePromptFamily(options) === 'galtransl' ? GALTRANSL_SYSTEM_PROMPT : SYSTEM_PROMPT;
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

    function resolveGlossaryTermsForPrompt(options = {}, sourceText = '') {
        const user = Array.isArray(options.glossaryTerms) ? options.glossaryTerms : [];
        if (!shouldUseNsfwPrompt(options) || !nsfwLex?.mergeNsfwGlossaryTerms) {
            return user;
        }
        return nsfwLex.mergeNsfwGlossaryTerms(user, sourceText, {
            enabled: options.nsfwLexicon !== false,
            limit: Number(options.nsfwLexiconLimit) || 28,
        });
    }

    function buildChatMessages(chunkCuesList, options = {}) {
        const list = normalizeCueList(chunkCuesList);
        const joined = list.map((c) => c.text || '').join('\n');
        const nsfw = shouldUseNsfwPrompt(options);
        const glossaryTerms = resolveGlossaryTermsForPrompt(options, joined);
        const glossary = formatGlossaryBlock(glossaryTerms, {
            maxTerms: nsfw ? 48 : 40,
        });
        const cast = formatCastNamesBlock(options.castNames);
        const lineRule = nsfw
            ? `共 ${list.length} 行。只输出译文，每行对应原文一行；不要编号、不要解释、不要空行；碎句与拟声勿删并勿并行走（条目删减由后处理完成）。原文仅为纯语气/拟声（如单独うん/はぁ）时可译为对应短语气词；对白有完整语义时禁止只输出语气词（嗯/啊/请/好的等），须译出完整意思，句末语气词可保留。`
            : `共 ${list.length} 行。只输出译文，每行对应原文一行，不要编号、不要解释、不要空行、不要额外内容。原文仅为纯语气/拟声时可短译；对白有完整语义时禁止只输出语气词（嗯/啊/请等），须译出完整意思。`;
        const prefix = [cast, glossary ? `根据以下术语表（可以为空）：\n${glossary}` : '']
            .filter(Boolean)
            .join('\n');
        const user = prefix
            ? `${prefix}\n将下面的日文文本${glossary ? '根据对应关系和备注' : ''}翻译成中文。${lineRule}\n${joined}`
            : `将下面的日文文本翻译成中文。${lineRule}\n${joined}`;
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
        // CJK ~1 token/char-ish; keep headroom small to limit runaway loops
        const est = Math.ceil(chars * 1.8) + (list.length * 4) + 32;
        return Math.max(48, Math.min(512, est));
    }

    /**
     * Align model output lines to cue indexes (pad/truncate to expected count).
     */
    function parseLineAlignedOutput(content, expectedCues) {
        const expected = normalizeCueList(expectedCues);
        const raw = String(content || '').replace(/\r\n/g, '\n').trim();
        if (!raw) {
            return { ok: false, error: '模型返回为空', cues: [] };
        }
        // Strip common markdown fences
        let text = raw;
        const fence = text.match(/^```(?:\w+)?\n([\s\S]*?)```$/);
        if (fence) text = fence[1].trim();

        let lines = text.split('\n').map((l) => l.trimEnd());
        // Drop leading/trailing empty lines only
        while (lines.length && !lines[0].trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

        // Model sometimes echoes the system prompt as line 0 (or before real cues).
        // Surplus preamble → drop; exact/deficit count → blank in place (don't shift / misalign).
        try {
            const sanitize = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (typeof globalThis !== 'undefined' && globalThis.TransubMtSanitize);
            const looksLeak = sanitize?.looksLikePromptLeak;
            if (typeof looksLeak === 'function') {
                while (lines.length > expected.length && looksLeak(lines[0].trim())) {
                    lines.shift();
                }
                if (lines.length && looksLeak(lines[0].trim())) {
                    lines[0] = '';
                }
            }
        } catch (_) { /* ignore */ }

        if (lines.length === 1 && expected.length > 1) {
            // Sometimes model joins with fullwidth/ascii separators
            const parts = lines[0].split(/\s*[|｜]\s*/).map((s) => s.trim()).filter(Boolean);
            if (parts.length === expected.length) lines = parts;
        }

        if (lines.length < expected.length) {
            while (lines.length < expected.length) lines.push('');
        } else if (lines.length > expected.length) {
            // Truncate surplus lines. Merging them into the last cue used to turn
            // model loop/collapse (e.g. "笑我"×N) into one mega-subtitle.
            lines = lines.slice(0, expected.length);
        }

        return {
            ok: true,
            cues: expected.map((c, i) => ({
                index: c.index,
                text: String(lines[i] ?? '').trim(),
            })),
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

    return {
        DEFAULT_WINDOW_LINES,
        SYSTEM_PROMPT,
        GALTRANSL_SYSTEM_PROMPT,
        get SYSTEM_PROMPT_NSFW() {
            return resolveNsfwSystemPrompt();
        },
        resolvePromptFamily,
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
        parseLineAlignedOutput,
        isBlankOrPunctTranslation,
        collectBlankTranslationIndexes,
    };
}));
