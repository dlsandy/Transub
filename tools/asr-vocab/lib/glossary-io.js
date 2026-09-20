'use strict';

/**
 * Convert between Transub glossary JSON, engine asrGlossary, and hotword file formats.
 */
const { normalizeGlossary, buildAsrGlossaryEntries } = require('../../../src/js/subtitle-glossary-core');

const KANA_RE = /[\u3040-\u30ff]/;
const HAN_RE = /[\u4e00-\u9fff]/;
const CJK_RE = /[\u3040-\u30ff\u4e00-\u9fff]/;

function isJaLike(text) {
    const s = String(text || '').trim();
    return !!s && (KANA_RE.test(s) || HAN_RE.test(s));
}

function isZhLike(text) {
    const s = String(text || '').trim();
    return !!s && HAN_RE.test(s) && !KANA_RE.test(s);
}

function makeEntryId() {
    return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyGlossary(meta = {}) {
    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        source: meta.source || null,
        note: meta.note || '',
        entries: [],
    };
}

/**
 * Parse one asr-hotword line:
 *   target | alias1 | alias2 ~~~ blacklist1 | blacklist2
 */
function parseHotwordLine(line) {
    const raw = String(line || '').trim();
    if (!raw || raw.startsWith('#')) return null;

    let mainPart = raw;
    let blacklist = [];
    const tildeIdx = raw.indexOf('~~~');
    if (tildeIdx >= 0) {
        mainPart = raw.slice(0, tildeIdx).trim();
        blacklist = raw.slice(tildeIdx + 3)
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean);
    }

    const parts = mainPart.split('|').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return null;

    const canonical = parts[0];
    const aliases = parts.slice(1).filter((a) => a.toLowerCase() !== canonical.toLowerCase());
    return { canonical, aliases, blacklist };
}

function hotwordTextToGlossary(text, meta = {}) {
    const doc = emptyGlossary(meta);
    const seen = new Set();
    for (const line of String(text || '').split(/\r?\n/)) {
        const row = parseHotwordLine(line);
        if (!row || !row.canonical) continue;
        const key = row.canonical.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const note = row.blacklist.length
            ? `blacklist: ${row.blacklist.join(' | ')}`
            : '';
        doc.entries.push({
            id: makeEntryId(),
            canonical: row.canonical,
            aliases: row.aliases,
            enabled: true,
            asrReplace: true,
            note,
        });
    }
    return normalizeGlossary(doc);
}

function parseThuoclLine(line) {
    const s = String(line || '').trim();
    if (!s || s.startsWith('#')) return null;
    const tab = s.indexOf('\t');
    if (tab >= 0) {
        const word = s.slice(0, tab).trim();
        const df = Number(s.slice(tab + 1).trim());
        if (!word) return null;
        return { term: word, df: Number.isFinite(df) ? df : 0 };
    }
    const parts = s.split(/\s+/);
    if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) {
        const df = Number(parts.pop());
        const word = parts.join(' ').trim();
        if (!word) return null;
        return { term: word, df };
    }
    return { term: s, df: 0 };
}

function parseNeologdSeedLine(line) {
    const s = String(line || '').trim();
    if (!s || s.startsWith('#')) return null;
    const cols = s.split(',');
    if (!cols.length) return null;
    const surface = String(cols[0] || '').trim();
    if (!surface || surface.length < 2) return null;
    return { term: surface };
}

function parsePlainTermLine(line) {
    const s = String(line || '').trim();
    if (!s || s.startsWith('#')) return null;
    const term = s.split('|')[0].trim();
    return term ? { term } : null;
}

function lexiconLinesToGlossary(lines, options = {}) {
    const format = String(options.format || 'auto').toLowerCase();
    const limit = Math.max(1, Number(options.limit) || 200);
    const minDf = Number(options.minDf) || 0;
    const jaOnly = options.jaOnly === true;
    const zhOnly = options.zhOnly === true;

    const rows = [];
    for (const line of lines) {
        let parsed = null;
        if (format === 'thuocl') parsed = parseThuoclLine(line);
        else if (format === 'neologd' || format === 'neologd-seed') parsed = parseNeologdSeedLine(line);
        else if (format === 'lines' || format === 'plain') parsed = parsePlainTermLine(line);
        else if (format === 'hotword') {
            const hw = parseHotwordLine(line);
            if (hw) parsed = { term: hw.canonical, aliases: hw.aliases };
        } else {
            parsed = parseThuoclLine(line)
                || parseNeologdSeedLine(line)
                || parsePlainTermLine(line);
        }
        if (!parsed || !parsed.term) continue;
        if (jaOnly && !isJaLike(parsed.term)) continue;
        if (zhOnly && !isZhLike(parsed.term)) continue;
        if (parsed.df != null && parsed.df < minDf) continue;
        rows.push(parsed);
    }

    if (format === 'thuocl' || rows.some((r) => r.df > 0)) {
        rows.sort((a, b) => (b.df || 0) - (a.df || 0) || a.term.localeCompare(b.term, 'zh-CN'));
    } else {
        rows.sort((a, b) => b.term.length - a.term.length || a.term.localeCompare(b.term, 'ja'));
    }

    const doc = emptyGlossary({
        source: options.source || 'lexicon-crop',
        note: options.note || '',
    });
    const seen = new Set();
    for (const row of rows.slice(0, limit)) {
        const key = row.term.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        doc.entries.push({
            id: makeEntryId(),
            canonical: row.term,
            aliases: Array.isArray(row.aliases) ? row.aliases : [],
            enabled: true,
            note: row.df != null && row.df > 0 ? `df=${row.df}` : '',
        });
    }
    return normalizeGlossary(doc);
}

function glossaryToEngineAsr(glossary) {
    return buildAsrGlossaryEntries(glossary);
}

function glossaryToHotwordsText(glossary, options = {}) {
    const maxTerms = Math.max(1, Number(options.maxTerms) || 500);
    const doc = normalizeGlossary(glossary);
    const terms = [];
    const seen = new Set();
    for (const entry of doc.entries) {
        if (entry.enabled === false) continue;
        for (const term of [entry.canonical, ...(entry.aliases || [])]) {
            const t = String(term || '').trim();
            if (!t) continue;
            const key = t.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            terms.push(t);
        }
    }
    terms.sort((a, b) => b.length - a.length || a.localeCompare(b, 'ja'));
    return `${terms.slice(0, maxTerms).join('\n')}\n`;
}

function mergeGlossaryDocs(base, extra) {
    const a = normalizeGlossary(base);
    const b = normalizeGlossary(extra);
    const byCanonical = new Map();
    for (const entry of a.entries) {
        byCanonical.set(entry.canonical.toLowerCase(), { ...entry });
    }
    for (const entry of b.entries) {
        const key = entry.canonical.toLowerCase();
        const prev = byCanonical.get(key);
        if (!prev) {
            byCanonical.set(key, { ...entry });
            continue;
        }
        const aliases = new Set([
            ...(prev.aliases || []),
            ...(entry.aliases || []),
        ]);
        byCanonical.set(key, {
            ...prev,
            aliases: [...aliases],
            note: [prev.note, entry.note].filter(Boolean).join('; '),
        });
    }
    return normalizeGlossary({
        version: 1,
        updatedAt: new Date().toISOString(),
        source: b.source || a.source || null,
        entries: [...byCanonical.values()],
    });
}

function anilistCharactersToGlossary(characters, meta = {}) {
    const {
        pickAnilistCanonical,
        buildAnilistAliases,
        shouldSkipAnilistCharacter,
    } = require('./anilist-glossary-build');
    const locale = String(meta.canonicalLocale || 'zh').toLowerCase();
    const doc = emptyGlossary({
        source: meta.source || 'anilist',
        note: meta.note || '',
    });
    const seen = new Set();
    for (const ch of characters || []) {
        const name = ch?.name || {};
        const opts = {
            canonicalLocale: locale,
            bangumiZh: ch?.bangumiZh || '',
        };
        if (shouldSkipAnilistCharacter(name, opts)) continue;

        const canonical = pickAnilistCanonical(name, opts);
        if (!canonical) continue;
        const key = normalizeNameKey(canonical);
        if (seen.has(key)) continue;
        seen.add(key);

        const aliases = buildAnilistAliases(name, canonical, opts);
        const roleNote = [String(ch?.role || '').trim(), meta.note || '']
            .filter(Boolean)
            .join(' · ');

        doc.entries.push({
            id: makeEntryId(),
            canonical,
            aliases,
            enabled: true,
            note: roleNote,
        });
    }
    doc.entries.sort((a, b) => b.canonical.length - a.canonical.length
        || a.canonical.localeCompare(b.canonical, 'zh-CN'));
    return normalizeGlossary(doc);
}

function normalizeNameKey(text) {
    return String(text || '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/[・·]/g, '')
        .toLowerCase();
}

function writeJson(filePath, data) {
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
    const out = { _: [] };
    for (const arg of argv) {
        const s = String(arg || '');
        const m = /^--([^=]+)=(.*)$/.exec(s);
        if (m) out[m[1]] = m[2];
        else if (s.startsWith('--')) out[s.slice(2)] = true;
        else if (s) out._.push(s);
    }
    return out;
}

module.exports = {
    isJaLike,
    isZhLike,
    parseHotwordLine,
    hotwordTextToGlossary,
    parseThuoclLine,
    parseNeologdSeedLine,
    lexiconLinesToGlossary,
    glossaryToEngineAsr,
    glossaryToHotwordsText,
    mergeGlossaryDocs,
    anilistCharactersToGlossary,
    emptyGlossary,
    writeJson,
    parseArgs,
};
