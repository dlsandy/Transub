'use strict';

/**
 * Build AniList character rows into Transub glossary entries (zh canonical for MT).
 */
const KANA_RE = /[\u3040-\u30ff]/;
const HAN_RE = /[\u4e00-\u9fff]/;
const CJK_RE = /[\u3040-\u30ff\u4e00-\u9fff]/;
const LATIN_RE = /[A-Za-z]/;

let openCcJaToZh = null;

function getOpenCcJaToZh() {
    if (openCcJaToZh !== null) return openCcJaToZh;
    try {
        const OpenCC = require('opencc-js');
        openCcJaToZh = OpenCC.Converter({ from: 'tw', to: 'cn' });
    } catch {
        openCcJaToZh = false;
    }
    return openCcJaToZh;
}

function normalizeNameKey(text) {
    return String(text || '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/[・·]/g, '')
        .toLowerCase();
}

function extractParenCjk(text) {
    const out = [];
    const re = /[（(]([^）)]+)[）)]/g;
    let m;
    while ((m = re.exec(String(text || '')))) {
        const inner = String(m[1] || '').trim();
        if (CJK_RE.test(inner)) out.push(inner);
    }
    return out;
}

function jaKanjiToZhSimplified(text) {
    const raw = String(text || '').trim();
    if (!raw || !HAN_RE.test(raw)) return '';
    const conv = getOpenCcJaToZh();
    if (!conv) return raw;
    try {
        return String(conv(raw)).trim();
    } catch {
        return raw;
    }
}

/** @param {object} name AniList CharacterName */
function collectAnilistNameForms(name) {
    const forms = new Set();
    const push = (v) => {
        const s = String(v || '').trim();
        if (s && s.length >= 1) forms.add(s);
    };
    push(name?.native);
    push(name?.full);
    push(name?.first);
    push(name?.last);
    for (const alt of name?.alternative || []) {
        push(alt);
        for (const p of extractParenCjk(alt)) push(p);
    }
    return [...forms];
}

function isZhLike(text) {
    const s = String(text || '').trim();
    if (!s || !HAN_RE.test(s) || KANA_RE.test(s)) return false;
    return jaKanjiToZhSimplified(s) === s;
}

function isJaLike(text) {
    const s = String(text || '').trim();
    return !!s && (KANA_RE.test(s) || HAN_RE.test(s));
}

/**
 * @param {object} name
 * @param {{ canonicalLocale?: string, bangumiZh?: string }} opts
 */
function pickAnilistCanonical(name, opts = {}) {
    const locale = String(opts.canonicalLocale || 'zh').toLowerCase();
    const forms = collectAnilistNameForms(name);
    const native = String(name?.native || '').trim();
    const full = String(name?.full || '').trim();
    const bangumiZh = String(opts.bangumiZh || '').trim();

    if (locale === 'zh') {
        if (bangumiZh) return bangumiZh;
        if (native) {
            const zh = jaKanjiToZhSimplified(native);
            if (zh) return zh;
        }
        const zhAlt = forms.find((f) => isZhLike(f));
        if (zhAlt) return zhAlt;
        for (const f of forms) {
            if (HAN_RE.test(f) && KANA_RE.test(f)) {
                const zh = jaKanjiToZhSimplified(f);
                if (zh) return zh;
            }
        }
        if (native && CJK_RE.test(native)) return native;
    }

    if (native) return native;
    if (full) return full;
    return forms[0] || '';
}

function buildAnilistAliases(name, canonical, opts = {}) {
    const locale = String(opts.canonicalLocale || 'zh').toLowerCase();
    const canonicalKey = normalizeNameKey(canonical);
    const aliases = new Set();
    const push = (v) => {
        const s = String(v || '').trim();
        if (!s || normalizeNameKey(s) === canonicalKey) return;
        if (s.length < 2 && !KANA_RE.test(s)) return;
        aliases.add(s);
    };

    const native = String(name?.native || '').trim();
    const full = String(name?.full || '').trim();

    for (const f of collectAnilistNameForms(name)) push(f);

    if (locale === 'zh') {
        if (native && normalizeNameKey(native) !== canonicalKey) push(native);
        if (full && normalizeNameKey(full) !== canonicalKey) push(full);
    }

    return [...aliases].sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-CN'));
}

/**
 * @param {object} name
 * @param {{ canonicalLocale?: string }} opts
 */
function shouldSkipAnilistCharacter(name, opts = {}) {
    const locale = String(opts.canonicalLocale || 'zh').toLowerCase();
    const canonical = pickAnilistCanonical(name, opts);
    if (!canonical || canonical.length < 2) return true;
    if (locale === 'zh') {
        const forms = collectAnilistNameForms(name);
        const hasCjk = forms.some((f) => CJK_RE.test(f));
        if (!hasCjk && LATIN_RE.test(canonical)) return true;
    }
    return false;
}

module.exports = {
    collectAnilistNameForms,
    pickAnilistCanonical,
    buildAnilistAliases,
    jaKanjiToZhSimplified,
    shouldSkipAnilistCharacter,
    normalizeNameKey,
    isZhLike,
    isJaLike,
};
