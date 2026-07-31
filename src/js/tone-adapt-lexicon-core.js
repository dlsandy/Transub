/**
 * Tone-adapt lexicon loader (JA→ZH adult / soft-voice subtitle terms).
 * Entries and adult-tone prompts live in opaque `tone-adapt.tz1` (see tools/encode-tone-adapt.js).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubToneAdaptLexicon = api;
        // legacy alias
        global.TransubJaNsfwLexicon = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function toneAdaptLexiconFactory() {
    /**
     * @typedef {{
     *   ja: string[],
     *   zh: string,
     *   aliases?: string[],
     *   note?: string,
     *   kind?: 'moan'|'sfx'|'body'|'act'|'misc'
     * }} NsfwEntry
     */

    const EXAMPLES_TOKEN = '{{EXAMPLES}}';

    /** @type {NsfwEntry[]} */
    let NSFW_LEXICON_ENTRIES = Object.freeze([]);
    /** @type {{ fallbackExamples: string, sakuraNsfw: string, smartFaithful: string[] }} */
    let PROMPTS = {
        fallbackExamples: '',
        sakuraNsfw: '',
        smartFaithful: [],
    };

    function xorBuffer(buf, key) {
        const out = Buffer.alloc(buf.length);
        for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
        return out;
    }

    function decodeToneAdaptBuffer(buf) {
        const zlib = require('zlib');
        if (!Buffer.isBuffer(buf) || buf.length < 5) {
            throw new Error('tone-adapt: empty payload');
        }
        if (buf.subarray(0, 4).toString('utf8') !== 'TZ01') {
            throw new Error('tone-adapt: bad magic');
        }
        const key = Buffer.from('TransubToneAdapt1');
        const inflated = zlib.inflateSync(xorBuffer(buf.subarray(4), key));
        return JSON.parse(inflated.toString('utf8'));
    }

    function loadPayload() {
        try {
            if (typeof require === 'undefined' || typeof Buffer === 'undefined') return null;
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, 'tone-adapt.tz1');
            if (!fs.existsSync(filePath)) return null;
            return decodeToneAdaptBuffer(fs.readFileSync(filePath));
        } catch (_) {
            return null;
        }
    }

    function applyPayload(payload) {
        if (!payload || typeof payload !== 'object') return;
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        NSFW_LEXICON_ENTRIES = Object.freeze(entries.map((e) => ({
            ja: Array.isArray(e?.ja) ? e.ja.map((x) => String(x)) : [],
            zh: String(e?.zh || ''),
            ...(e?.note ? { note: String(e.note) } : {}),
            ...(e?.kind ? { kind: String(e.kind) } : {}),
            ...(Array.isArray(e?.aliases) ? { aliases: e.aliases.map((x) => String(x)) } : {}),
        })));
        const p = payload.prompts && typeof payload.prompts === 'object' ? payload.prompts : {};
        PROMPTS = {
            fallbackExamples: String(p.fallbackExamples || ''),
            sakuraNsfw: String(p.sakuraNsfw || ''),
            smartFaithful: Array.isArray(p.smartFaithful)
                ? p.smartFaithful.map((x) => String(x))
                : [],
        };
    }

    applyPayload(loadPayload());

    function normalizeJaKey(text) {
        return String(text || '')
            .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
            .replace(/[ーｰ―─～~]/g, '')
            .replace(/[っッ]/g, '')
            .replace(/\s+/g, '')
            .toLowerCase();
    }

    /**
     * @param {string} sourceText
     * @param {{ limit?: number, kinds?: string[] }} [options]
     * @returns {{ term: string, translation: string, info?: string, kind?: string }[]}
     */
    function pickTermsForText(sourceText, options = {}) {
        const raw = String(sourceText || '');
        if (!raw.trim()) return [];
        const limit = Math.max(1, Math.min(60, Number(options.limit) || 28));
        const kindFilter = Array.isArray(options.kinds) && options.kinds.length
            ? new Set(options.kinds.map((k) => String(k)))
            : null;
        const normSrc = normalizeJaKey(raw);
        const rawLower = raw.toLowerCase();
        const out = [];
        const seen = new Set();

        for (const entry of NSFW_LEXICON_ENTRIES) {
            if (kindFilter && entry.kind && !kindFilter.has(entry.kind)) continue;
            const forms = entry.ja || [];
            let hit = null;
            for (const form of forms) {
                const f = String(form || '').trim();
                if (!f) continue;
                if (raw.includes(f) || rawLower.includes(f.toLowerCase())) {
                    hit = f;
                    break;
                }
                const nf = normalizeJaKey(f);
                if (nf.length >= 2 && normSrc.includes(nf)) {
                    hit = f;
                    break;
                }
            }
            if (!hit) continue;
            const src = String(forms[0] || hit).trim();
            const key = normalizeJaKey(src) || src;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
                term: src,
                translation: entry.zh,
                info: entry.note || '',
                kind: entry.kind || 'misc',
                aliases: forms.slice(1),
            });
            if (out.length >= limit) break;
        }
        return out;
    }

    /**
     * Merge built-in NSFW hits after user glossary (user wins on same src).
     * @param {Array} userTerms
     * @param {string} sourceText
     * @param {{ limit?: number, enabled?: boolean }} [options]
     */
    function mergeNsfwGlossaryTerms(userTerms, sourceText, options = {}) {
        if (options.enabled === false) {
            return Array.isArray(userTerms) ? userTerms : [];
        }
        const user = Array.isArray(userTerms) ? userTerms : [];
        const picked = pickTermsForText(sourceText, { limit: options.limit || 28 });
        if (!picked.length) return user;

        const seen = new Set();
        const out = [];
        function keyOf(t) {
            return normalizeJaKey(t?.term || t?.src || '') || String(t?.term || t?.src || '').trim();
        }
        for (const t of user) {
            const k = keyOf(t);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            out.push(t);
        }
        for (const t of picked) {
            const k = keyOf(t);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            out.push({
                term: t.term,
                translation: t.translation,
                dst: t.translation,
                info: t.info,
                note: t.info,
                aliases: t.aliases,
            });
        }
        return out;
    }

    /**
     * Light leftover-kana cleanup: replace known NSFW kana still present in ZH cue.
     * Only when the same form appears in source (avoid inventing).
     * @param {string} text
     * @param {string} sourceText
     * @returns {{ text: string, changed: boolean, hits: string[] }}
     */
    function applyNsfwLexiconToText(text, sourceText) {
        let cur = String(text ?? '');
        const src = String(sourceText || '');
        if (!cur || !src) return { text: cur, changed: false, hits: [] };
        const hits = [];
        const ranked = [...NSFW_LEXICON_ENTRIES].sort(
            (a, b) => Math.max(...(b.ja || []).map((x) => x.length), 0)
                - Math.max(...(a.ja || []).map((x) => x.length), 0),
        );
        for (const entry of ranked) {
            for (const form of entry.ja || []) {
                const f = String(form || '').trim();
                if (f.length < 2) continue;
                if (!src.includes(f) && !normalizeJaKey(src).includes(normalizeJaKey(f))) continue;
                if (!cur.includes(f)) continue;
                cur = cur.split(f).join(entry.zh);
                hits.push(f);
            }
        }
        const next = cur.replace(/[^\S\n]{2,}/g, ' ').trim();
        return { text: next, changed: next !== String(text ?? '').trim(), hits };
    }

    /** Compact examples for system prompt (keep short). */
    function formatPromptExamples(limit = 12) {
        const moan = NSFW_LEXICON_ENTRIES.filter((e) => e.kind === 'moan').slice(0, 4);
        const sfx = NSFW_LEXICON_ENTRIES.filter((e) => e.kind === 'sfx').slice(0, 5);
        const body = NSFW_LEXICON_ENTRIES.filter((e) => e.kind === 'body').slice(0, 3);
        const pick = [...moan, ...sfx, ...body].slice(0, limit);
        if (!pick.length) return String(PROMPTS.fallbackExamples || '');
        return pick.map((e) => `${e.ja[0]}→${e.zh}`).join('/');
    }

    function fillExamples(template, examples) {
        const ex = String(examples || formatPromptExamples(14) || PROMPTS.fallbackExamples || '');
        return String(template || '').split(EXAMPLES_TOKEN).join(ex);
    }

    /** Sakura adult-tone system prompt (decoded from payload). */
    function getSakuraNsfwSystemPrompt(options = {}) {
        const examples = options.examples != null
            ? String(options.examples)
            : formatPromptExamples(Number(options.exampleLimit) || 14);
        const tpl = PROMPTS.sakuraNsfw;
        if (!tpl) {
            return fillExamples(
                '你是日译中字幕翻译。忠实传达语气。喘息与拟声译成自然中文。例：{{EXAMPLES}}。每行只译对应一行。',
                examples,
            );
        }
        return fillExamples(tpl, examples);
    }

    /** Extra system-prompt lines for smart-translate faithful tone. */
    function getSmartFaithfulPromptLines(options = {}) {
        const examples = options.examples != null
            ? String(options.examples)
            : formatPromptExamples(Number(options.exampleLimit) || 10);
        const lines = Array.isArray(PROMPTS.smartFaithful) ? PROMPTS.smartFaithful : [];
        if (!lines.length) {
            return [
                fillExamples('日语拟声与成人用语译成自然中文。例：{{EXAMPLES}}。', examples),
            ];
        }
        return lines.map((line) => fillExamples(line, examples));
    }

    return {
        NSFW_LEXICON_ENTRIES,
        normalizeJaKey,
        pickTermsForText,
        mergeNsfwGlossaryTerms,
        applyNsfwLexiconToText,
        formatPromptExamples,
        getSakuraNsfwSystemPrompt,
        getSmartFaithfulPromptLines,
    };
}));
