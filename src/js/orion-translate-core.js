/**
 * Orion-Qwen3 SFT JA→ZH subtitle prompts + JSONLINE parse (no network).
 * Official user-only templates (plain / glossary); greedy decode, thinking off.
 * @see https://huggingface.co/3tic/Orion-Qwen3-4B-SFT-v2608
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubOrionTranslate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function orionTranslateCoreFactory() {
    function loadSakuraCore() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./sakura-translate-core')
                : (global && global.TransubSakuraTranslate);
        } catch (_) {
            return null;
        }
    }

    const ORION_INFERENCE = Object.freeze({
        temperature: 0,
        top_p: 1,
        repetition_penalty: 1.05,
        contextSize: 4096,
        cachePrompt: true,
        windowLines: 6,
        enableThinking: false,
        maxTokensCap: 1024,
    });

    const PLAIN_HINT = '将以下文本翻译为简体中文，使用JSONLINE格式输出翻译结果，只需输出翻译结果，不要额外解释：';
    const GLOSSARY_HINT = '参考术语表中的译法，将以下文本翻译为简体中文，使用JSONLINE格式输出翻译结果，只需输出翻译结果：';

    function isOrionModel(modelIdOrFamily) {
        const s = String(modelIdOrFamily || '').trim().toLowerCase();
        if (!s) return false;
        if (s === 'orion') return true;
        return /orion[-_]?qwen|orion-?\d/i.test(s) || /^orion-/i.test(s);
    }

    function resolveOrionInferenceOptions(_options = {}) {
        return { ...ORION_INFERENCE };
    }

    function formatOrionGlossaryBlock(glossaryTerms, options = {}) {
        const sakura = loadSakuraCore();
        const block = sakura?.formatGlossaryBlock
            ? sakura.formatGlossaryBlock(glossaryTerms, { maxTerms: Number(options.maxTerms) || 40 })
            : '';
        if (!block) return '';
        const lines = String(block).split('\n').map((line) => {
            const t = String(line || '').trim();
            if (!t) return '';
            return t.replace(/->/g, '→');
        }).filter(Boolean);
        if (!lines.length) return '';
        return `术语表：\n${lines.join('\n')}`;
    }

    function formatJsonlineInput(cues) {
        const list = Array.isArray(cues) ? cues : [];
        return list.map((c, i) => {
            const key = String(i + 1);
            const text = String(c?.text || '').replace(/\r\n/g, '\n');
            return JSON.stringify({ [key]: text });
        }).join('\n');
    }

    function buildOrionUserContent(chunkCuesList, options = {}) {
        const sakura = loadSakuraCore();
        const list = sakura?.normalizeCueList
            ? sakura.normalizeCueList(chunkCuesList)
            : (Array.isArray(chunkCuesList) ? chunkCuesList : []);
        const joined = list.map((c) => c.text || '').join('\n');
        const terms = sakura?.resolveGlossaryTermsForPrompt
            ? sakura.resolveGlossaryTermsForPrompt({ ...options, promptFamily: 'orion' }, joined)
            : (Array.isArray(options.glossaryTerms) ? options.glossaryTerms : []);
        const glossary = formatOrionGlossaryBlock(terms, options);
        const body = formatJsonlineInput(list);
        let user = glossary
            ? `${glossary}\n\n${GLOSSARY_HINT}\n${body}`
            : `${PLAIN_HINT}\n${body}`;
        try {
            const emoApi = (typeof module !== 'undefined' && module.exports)
                ? require('./sensevoice-emotion-mt-style-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSensevoiceEmotionMtStyle : null);
            if (emoApi?.appendEmotionHintToUserContent) {
                user = emoApi.appendEmotionHintToUserContent(user, list, options);
            }
        } catch { /* optional */ }
        return user;
    }

    function buildOrionChatMessages(chunkCuesList, options = {}) {
        return [{ role: 'user', content: buildOrionUserContent(chunkCuesList, options) }];
    }

    function stripThink(text) {
        let t = String(text || '');
        try {
            const sanitizeApi = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-sanitize-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubMtSanitize : null);
            if (typeof sanitizeApi?.stripLlmThinkWrappers === 'function') {
                t = sanitizeApi.stripLlmThinkWrappers(t);
            }
        } catch { /* optional */ }
        return t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }

    /**
     * Map official JSONLINE assistant lines onto expected cues (1-based window keys).
     * @returns {{ ok: boolean, error?: string, cues: Array, lineCountMismatch?: boolean }|null}
     */
    function parseOrionJsonlineOutput(content, expectedCues) {
        const expected = Array.isArray(expectedCues) ? expectedCues : [];
        const raw = stripThink(content);
        if (!raw) return null;
        const byKey = new Map();
        const lineRe = /\{\s*"(\d+)"\s*:\s*((?:"(?:\\.|[^"\\])*")|null|\d+(?:\.\d+)?)\s*\}/g;
        let m;
        while ((m = lineRe.exec(raw)) !== null) {
            const key = m[1];
            let val = '';
            try {
                val = JSON.parse(m[2]);
            } catch {
                val = String(m[2] || '').replace(/^"|"$/g, '');
            }
            byKey.set(key, val == null ? '' : String(val));
        }
        if (!byKey.size) return null;
        const cues = expected.map((c, i) => ({
            index: Number.isInteger(Number(c?.index)) ? Number(c.index) : i,
            text: byKey.has(String(i + 1)) ? String(byKey.get(String(i + 1)) || '') : '',
        }));
        const filled = cues.filter((c) => String(c.text || '').trim()).length;
        if (filled === 0) return null;
        return {
            ok: true,
            cues,
            lineCountMismatch: filled !== expected.length,
        };
    }

    function estimateMaxTokens(cues) {
        const sakura = loadSakuraCore();
        const base = typeof sakura?.estimateMaxTokens === 'function'
            ? sakura.estimateMaxTokens(cues)
            : 256;
        return Math.max(64, Math.min(ORION_INFERENCE.maxTokensCap, base));
    }

    return {
        ORION_INFERENCE,
        PLAIN_HINT,
        GLOSSARY_HINT,
        isOrionModel,
        resolveOrionInferenceOptions,
        formatOrionGlossaryBlock,
        formatJsonlineInput,
        buildOrionUserContent,
        buildOrionChatMessages,
        parseOrionJsonlineOutput,
        estimateMaxTokens,
    };
}));
