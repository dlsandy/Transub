'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../../..');
const TRAINED_PATH = path.join(ROOT, 'shared', 'mt-trained-remaps.json');

function b64encode(s) {
    return Buffer.from(String(s ?? ''), 'utf8').toString('base64');
}

function b64decode(s) {
    if (s == null || s === '') return '';
    try {
        return Buffer.from(String(s), 'base64').toString('utf8');
    } catch (_) {
        return '';
    }
}

function emptyPack() {
    return { version: 1, zhRemaps: [], asrPairs: [] };
}

function readPack() {
    try {
        if (!fs.existsSync(TRAINED_PATH)) return emptyPack();
        const raw = JSON.parse(fs.readFileSync(TRAINED_PATH, 'utf8'));
        return {
            version: Number(raw.version) || 1,
            zhRemaps: Array.isArray(raw.zhRemaps) ? raw.zhRemaps : [],
            asrPairs: Array.isArray(raw.asrPairs) ? raw.asrPairs : [],
        };
    } catch (_) {
        return emptyPack();
    }
}

function writePack(pack) {
    const next = {
        version: Number(pack.version) || 1,
        zhRemaps: Array.isArray(pack.zhRemaps) ? pack.zhRemaps : [],
        asrPairs: Array.isArray(pack.asrPairs) ? pack.asrPairs : [],
    };
    fs.mkdirSync(path.dirname(TRAINED_PATH), { recursive: true });
    fs.writeFileSync(TRAINED_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
}

function decodeZhRule(rule) {
    const jaIncludes = Array.isArray(rule.jaIncludesB64)
        ? rule.jaIncludesB64.map(b64decode).filter(Boolean)
        : (Array.isArray(rule.jaIncludes) ? rule.jaIncludes.map(String) : []);
    return {
        id: String(rule.id || ''),
        enabled: rule.enabled !== false,
        title: String(rule.title || ''),
        note: String(rule.note || ''),
        mode: rule.mode === 'blank' ? 'blank' : 'replace',
        pinFinal: rule.pinFinal !== false,
        flag: String(rule.flag || 'trained_remap'),
        jaIncludes,
        zhFrom: rule.zhFromB64 != null ? b64decode(rule.zhFromB64) : String(rule.zhFrom || ''),
        zhTo: rule.zhToB64 != null ? b64decode(rule.zhToB64) : String(rule.zhTo || ''),
        createdAt: rule.createdAt || null,
    };
}

function decodeAsrRule(rule) {
    return {
        id: String(rule.id || ''),
        enabled: rule.enabled !== false,
        title: String(rule.title || ''),
        note: String(rule.note || ''),
        from: rule.fromB64 != null ? b64decode(rule.fromB64) : String(rule.from || ''),
        to: rule.toB64 != null ? b64decode(rule.toB64) : String(rule.to || ''),
        createdAt: rule.createdAt || null,
    };
}

function listRules() {
    const pack = readPack();
    return {
        path: TRAINED_PATH,
        version: pack.version,
        zhRemaps: pack.zhRemaps.map(decodeZhRule),
        asrPairs: pack.asrPairs.map(decodeAsrRule),
    };
}

function newId() {
    return `tr_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

/** Anchors that are too generic for a global remap (high false-positive risk). */
const GENERIC_JA_ANCHORS = new Set([
    'いく', 'イク', 'イッ', 'あっ', 'あぁ', 'ん', 'うん', 'はっ', 'あっ…', 'んっ',
    '啊', '啊…', '…',
]);

/**
 * Prefer shortest local replace slice between dirty and expect.
 * When dirty is a short stub that is a prefix of expect (under_stub),
 * expand the whole dirty string → expect (not an empty zhFrom).
 * Whole-sentence remaps are marked unusable (must not enter the rule pack).
 */
function isMostlyWholeFragment(zhFrom, dirty) {
    const from = String(zhFrom || '');
    const text = String(dirty || '');
    if (!from || !text) return false;
    return from.length >= Math.max(12, Math.floor(text.length * 0.85));
}

function suggestLocalReplace(dirty, expect) {
    const a = String(dirty ?? '');
    const b = String(expect ?? '');
    if (a === b) return null;
    if (!a && b) {
        return { zhFrom: '', zhTo: b, wholeSentence: true, expandStub: true, unusable: true };
    }
    let start = 0;
    const minLen = Math.min(a.length, b.length);
    while (start < minLen && a[start] === b[start]) start += 1;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA -= 1;
        endB -= 1;
    }
    let zhFrom = a.slice(start, endA);
    let zhTo = b.slice(start, endB);
    // Prefix stub: 「请」→「请摸我…」 yields empty zhFrom; replace whole dirty instead.
    if (!zhFrom && a && b.startsWith(a)) {
        return { zhFrom: a, zhTo: b, wholeSentence: true, expandStub: true, unusable: a.length > 6 };
    }
    if (!zhFrom) {
        // No shared slice — whole-string replace is not a reusable rule
        return { zhFrom: a, zhTo: b, wholeSentence: true, expandStub: true, unusable: true };
    }
    if (zhFrom.length >= a.length && a.length > 12) {
        return { zhFrom, zhTo, wholeSentence: true, unusable: true };
    }
    const mostly = zhFrom.length >= Math.max(8, a.length * 0.85);
    return {
        zhFrom,
        zhTo,
        wholeSentence: mostly,
        unusable: mostly && a.length > 12,
    };
}

/**
 * Always prefer the shortest reusable fragment. Rejects whole-sentence rewrites.
 * @returns {{ zhFrom: string, zhTo: string, wholeSentence?: boolean, expandStub?: boolean, unusable?: boolean, source: string }}
 */
function forceShortestFragment({ dirty, expect, zhFrom, zhTo } = {}) {
    const text = String(dirty ?? '');
    const want = String(expect ?? '');
    const givenFrom = String(zhFrom ?? '').trim();
    const givenTo = zhTo != null ? String(zhTo) : '';

    if (want && want !== '…' && want !== '...' && text) {
        const sug = suggestLocalReplace(text, want);
        if (sug?.zhFrom && !sug.unusable) {
            return { ...sug, source: 'diff' };
        }
        if (sug?.expandStub && sug.zhFrom && sug.zhFrom.length <= 6 && !sug.unusable) {
            return { ...sug, source: 'stub' };
        }
    }

    if (givenFrom && text.includes(givenFrom) && !isMostlyWholeFragment(givenFrom, text)) {
        return {
            zhFrom: givenFrom,
            zhTo: givenTo,
            wholeSentence: false,
            source: 'given',
        };
    }

    if (givenFrom && want && want !== '…') {
        const sug = suggestLocalReplace(givenFrom, givenTo || want);
        if (sug?.zhFrom && !sug.unusable && !isMostlyWholeFragment(sug.zhFrom, text || givenFrom)) {
            return { ...sug, source: 'given_diff' };
        }
    }

    return {
        zhFrom: '',
        zhTo: '',
        wholeSentence: true,
        unusable: true,
        source: 'reject',
    };
}

/**
 * Prefer a short, reusable JA phrase (not the whole cue).
 * Prefers repeated tokens / katakana runs, then trims polite tails.
 */
function narrowJaAnchor(ja, opts = {}) {
    const s = String(ja || '').trim();
    if (!s) return '';
    const maxLen = Math.min(20, Math.max(6, Number(opts.maxLen) || 14));

    const kataRuns = s.match(/[ァ-ヴー]{3,}/gu) || [];
    const bestKata = kataRuns.slice().sort((a, b) => b.length - a.length)[0];
    if (bestKata
        && bestKata.length >= 3
        && bestKata.length <= maxLen
        && !GENERIC_JA_ANCHORS.has(bestKata)) {
        return bestKata;
    }

    const parts = s
        .split(/[、。．.…・！？!?,，\s　]+/u)
        .map((p) => p.trim())
        .filter((p) => p.length >= 2);
    const counts = new Map();
    for (const p of parts) counts.set(p, (counts.get(p) || 0) + 1);
    const repeated = [...counts.entries()]
        .filter(([p, n]) => n >= 2 && p.length <= maxLen && !GENERIC_JA_ANCHORS.has(p))
        .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
    if (repeated) return repeated[0];

    const contentParts = parts
        .filter((p) => p.length >= 3 && p.length <= maxLen && !GENERIC_JA_ANCHORS.has(p))
        .sort((a, b) => b.length - a.length);
    if (contentParts[0]) return contentParts[0];

    if (s.length <= maxLen) return s;
    const trimmed = s
        .replace(/(です|ます|でした|ましょう|だよ|だね|だわ|よ|ね|わ|さ|ぞ|ぜ)([!！?？…。．.]*)$/u, '$2')
        .replace(/[!！?？…。．.]+$/u, '')
        .trim();
    if (trimmed && trimmed.length >= 4 && trimmed.length <= maxLen) return trimmed;
    if (trimmed && trimmed.length > maxLen) return trimmed.slice(0, maxLen);
    return s.slice(0, maxLen);
}

/**
 * Prefer a concrete JA phrase: keep short cues whole; trim polite tails on long ones.
 * Full-cue anchors are unsafe for reuse — use narrowJaAnchor.
 */
function suggestJaAnchor(ja) {
    return narrowJaAnchor(ja, { maxLen: 14 });
}

/** True when anchor is nearly the whole cue or simply too long to reuse. */
function isLowReuseAnchor(anchor, fullJa = '') {
    const a = String(anchor || '').trim();
    const full = String(fullJa || '').trim();
    if (!a) return true;
    if (a.length >= 18) return true;
    if (full && a.length >= Math.max(14, Math.floor(full.length * 0.7))) return true;
    if (full && a === full && full.length > 10) return true;
    return false;
}

/**
 * Quality checks before try/apply. Does not block; returns warnings + tips.
 * @param {object} opts
 */
function assessRuleQuality(opts = {}) {
    const warnings = [];
    const tips = [];
    const kind = opts.kind === 'asr' ? 'asr' : 'zh';
    if (kind === 'asr') {
        const from = String(opts.from || opts.ja || '').trim();
        const to = String(opts.to || '').trim();
        if (from && to && from === to) {
            warnings.push('听写纠正前后相同，无需写入。');
        }
        if (from && from.length <= 2) {
            warnings.push('听写原文过短，可能误伤其它句子。');
        }
        tips.push('听写纠错改的是日文源；译错请用「改中文」。');
        return { warnings, tips, ok: warnings.length === 0 };
    }

    const mode = opts.mode === 'blank' ? 'blank' : 'replace';
    const jaAnchor = String(opts.jaAnchor || (opts.jaIncludes || [])[0] || opts.ja || '').trim();
    const zh = String(opts.zh || '');
    const expect = opts.expect != null ? String(opts.expect) : String(opts.zhTo || '');
    const pinFinal = opts.pinFinal !== false;

    if (mode === 'blank') {
        warnings.push('清空弱化会把整句变成「…」，仅用于确实不该出字的句子。');
        if (jaAnchor && jaAnchor.length <= 3) {
            warnings.push('清空规则的日文锚点过短，极易误伤。');
        }
        tips.push('能局部替换时不要用清空。');
        return { warnings, tips, ok: false };
    }

    if (!jaAnchor) {
        warnings.push('缺少日文锚点，规则会对所有句子尝试匹配中文片段。');
    } else if (GENERIC_JA_ANCHORS.has(jaAnchor) || jaAnchor.length <= 2) {
        warnings.push(`日文锚点「${jaAnchor}」过于宽泛，建议改用更具体的短语。`);
    }

    let sug = null;
    if (opts.zhFrom != null && String(opts.zhFrom)) {
        sug = {
            zhFrom: String(opts.zhFrom),
            zhTo: String(opts.zhTo != null ? opts.zhTo : expect),
            wholeSentence: false,
        };
        if (zh && sug.zhFrom.length >= Math.max(8, zh.length * 0.85)) sug.wholeSentence = true;
    } else if (zh && expect) {
        sug = suggestLocalReplace(zh, expect);
    }

    if (sug?.wholeSentence) {
        warnings.push('将学成接近整句替换，可能影响润色自然度；建议只改出错片段。');
    } else if (sug?.zhFrom) {
        tips.push(`将写入局部替换：「${sug.zhFrom}」→「${sug.zhTo}」。`);
    }

    if (!pinFinal) {
        tips.push('若试跑中段正确但最终被冲掉，请勾选「防润色冲掉」。');
    }

    if (opts.asrHint) {
        tips.push('该句日文已被听写纠错改写；若源听写仍错，请改用类型「听写纠错」。');
    }

    return {
        warnings,
        tips,
        suggestion: sug,
        ok: warnings.length === 0,
    };
}

function encodeZhRule(input) {
    const mode = input.mode === 'blank' ? 'blank' : 'replace';
    const jaIncludes = Array.isArray(input.jaIncludes)
        ? input.jaIncludes.map(String).filter(Boolean)
        : String(input.jaAnchor || input.src || '')
            .split(/\s+/).filter(Boolean).slice(0, 1);
    // Prefer single full JA cue as one include if provided
    const jaList = input.jaIncludes
        ? jaIncludes
        : (input.jaAnchor || input.src
            ? [String(input.jaAnchor || input.src)]
            : []);
    const pinFinal = mode === 'blank' ? true : input.pinFinal !== false;
    return {
        id: input.id || newId(),
        enabled: input.enabled !== false,
        title: String(input.title || ''),
        note: String(input.note || ''),
        mode,
        pinFinal,
        flag: String(input.flag || 'trained_remap'),
        jaIncludesB64: jaList.map(b64encode),
        zhFromB64: b64encode(input.zhFrom || ''),
        zhToB64: b64encode(mode === 'blank' ? '' : (input.zhTo || '')),
        createdAt: input.createdAt || new Date().toISOString(),
    };
}

function encodeAsrRule(input) {
    return {
        id: input.id || newId(),
        enabled: input.enabled !== false,
        title: String(input.title || ''),
        note: String(input.note || ''),
        fromB64: b64encode(input.from || ''),
        toB64: b64encode(input.to || ''),
        createdAt: input.createdAt || new Date().toISOString(),
    };
}

function buildHypotheticalPack(basePack, extraZh, extraAsr) {
    return {
        version: basePack.version || 1,
        zhRemaps: extraZh ? [...basePack.zhRemaps, extraZh] : basePack.zhRemaps.slice(),
        asrPairs: extraAsr ? [...basePack.asrPairs, extraAsr] : basePack.asrPairs.slice(),
    };
}

function inferUndoneBy(stages, expect) {
    if (!stages || expect == null) return null;
    const exp = String(expect);
    const final = String(stages.final ?? '');
    if (final === exp) return null;
    const afterDomain = String(stages.afterDomain ?? '');
    const afterFluency = String(stages.afterFluency ?? '');
    const afterRecover = String(stages.afterRecover ?? '');
    if (afterDomain === exp && afterFluency !== exp) return 'fluency';
    if (afterFluency === exp && afterRecover !== exp) return 'recover';
    if (afterDomain === exp && afterRecover !== exp) return 'recover';
    if (String(stages.afterPolish ?? '') === exp && afterDomain !== exp) return 'domain';
    if (afterDomain.includes(exp) || afterDomain === exp) return 'later';
    return null;
}

/**
 * @param {object} sanitize module
 * @param {{ ja: string, zh: string, expect?: string, contentProfile?: string }} opts
 */
function trySanitize(sanitize, opts = {}) {
    const ja = String(opts.ja || '');
    const zh = String(opts.zh || '');
    const expect = opts.expect != null ? String(opts.expect) : null;
    const contentProfile = opts.contentProfile || 'av_soft';
    const asr = sanitize.correctJaAsrDomainMishears
        ? sanitize.correctJaAsrDomainMishears(ja)
        : { text: ja, changed: false };
    const senseJa = asr.changed ? asr.text : ja;
    const result = sanitize.sanitizeMtCueText(zh, senseJa, {
        contentProfile,
        captureStages: true,
    });
    const quality = assessRuleQuality({
        kind: 'zh',
        mode: 'replace',
        jaAnchor: opts.jaAnchor || ja,
        zh,
        expect,
        pinFinal: opts.pinFinal,
        asrHint: Boolean(asr.changed || opts.asrHint),
    });
    const warnings = [...quality.warnings];
    const tips = [...quality.tips];
    const undoneBy = inferUndoneBy(result.stages, expect);
    if (undoneBy) {
        warnings.push(`领域/中段已接近期望，但被后续步骤改坏（${undoneBy}）。建议开启「防润色冲掉」。`);
    }
    return {
        ja,
        senseJa,
        asrChanged: Boolean(asr.changed),
        zh,
        expect,
        final: result.text,
        changed: result.changed,
        flags: result.flags || [],
        stages: result.stages || {},
        matchesExpect: expect == null ? null : result.text === expect,
        undoneBy,
        warnings,
        tips,
        suggestion: quality.suggestion || null,
    };
}

function applyWithTempPack(sanitize, pack, fn) {
    // Rebuild from full encoded pack for try, then restore disk state.
    sanitize.reloadTrainedRemaps(pack);
    try {
        return fn();
    } finally {
        sanitize.reloadTrainedRemaps();
    }
}

function tryWithCandidate(sanitize, opts = {}) {
    const pack = readPack();
    let extraZh = null;
    let extraAsr = null;
    const quality = assessRuleQuality(opts);
    if (opts.kind === 'asr') {
        extraAsr = encodeAsrRule({
            from: opts.from,
            to: opts.to,
            title: opts.title,
            note: opts.note,
        });
    } else {
        const mode = opts.mode === 'blank' ? 'blank' : 'replace';
        let zhFrom = opts.zhFrom;
        let zhTo = opts.zhTo;
        if (mode === 'replace' && !zhFrom && opts.zh != null && opts.expect != null) {
            const sug = suggestLocalReplace(opts.zh, opts.expect);
            if (sug) {
                zhFrom = sug.zhFrom;
                zhTo = sug.zhTo;
            }
        }
        if (mode === 'blank') {
            zhFrom = zhFrom || opts.zhFrom || '';
            zhTo = '';
        }
        const jaAnchor = opts.jaAnchor || opts.ja || '';
        const narrowed = suggestJaAnchor(jaAnchor);
        extraZh = encodeZhRule({
            title: opts.title,
            note: opts.note,
            mode,
            pinFinal: opts.pinFinal !== false,
            jaIncludes: opts.jaIncludes
                || (narrowed ? [narrowed] : (opts.ja ? [opts.ja] : [])),
            zhFrom: zhFrom || '',
            zhTo: zhTo || '',
        });
    }
    const hypo = buildHypotheticalPack(pack, extraZh, extraAsr);
    return applyWithTempPack(sanitize, hypo, () => {
        const trial = trySanitize(sanitize, {
            ja: opts.ja,
            zh: opts.zh,
            expect: opts.expect != null ? opts.expect : opts.zhTo,
            contentProfile: opts.contentProfile,
            pinFinal: opts.pinFinal,
            jaAnchor: opts.jaAnchor || opts.ja,
            asrHint: opts.asrHint,
        });
        const warnings = [...new Set([...(quality.warnings || []), ...(trial.warnings || [])])];
        const tips = [...new Set([...(quality.tips || []), ...(trial.tips || [])])];
        return {
            ...trial,
            warnings,
            tips,
            suggestion: quality.suggestion || trial.suggestion || null,
            candidate: extraZh ? decodeZhRule(extraZh) : decodeAsrRule(extraAsr),
            kind: opts.kind === 'asr' ? 'asr' : 'zh',
        };
    });
}

function zhRuleKey(decoded) {
    return [
        decoded.mode || 'replace',
        (decoded.jaIncludes || []).join('\u0001'),
        decoded.zhFrom || '',
    ].join('\u0002');
}

function addZhRemap(input) {
    const pack = readPack();
    const rule = encodeZhRule(input);
    const decoded = decodeZhRule(rule);
    const key = zhRuleKey(decoded);
    const idx = pack.zhRemaps.findIndex((r) => zhRuleKey(decodeZhRule(r)) === key);
    if (idx >= 0) {
        // Merge: keep id/createdAt, refresh target + pinFinal/note
        const prev = pack.zhRemaps[idx];
        rule.id = prev.id || rule.id;
        rule.createdAt = prev.createdAt || rule.createdAt;
        pack.zhRemaps[idx] = rule;
    } else {
        pack.zhRemaps.push(rule);
    }
    writePack(pack);
    return decodeZhRule(rule);
}

function addAsrPair(input) {
    const pack = readPack();
    const from = String(input.from || '');
    const to = String(input.to || '');
    if (!from || !to) throw new Error('听写纠错需要填写原文与纠正');
    const rule = encodeAsrRule(input);
    // Replace same from if present
    const idx = pack.asrPairs.findIndex((r) => decodeAsrRule(r).from === from);
    if (idx >= 0) pack.asrPairs[idx] = rule;
    else pack.asrPairs.push(rule);
    writePack(pack);
    return decodeAsrRule(rule);
}

function toggleRule(id, enabled) {
    const pack = readPack();
    let hit = null;
    for (const r of pack.zhRemaps) {
        if (r.id === id) {
            r.enabled = Boolean(enabled);
            hit = decodeZhRule(r);
        }
    }
    for (const r of pack.asrPairs) {
        if (r.id === id) {
            r.enabled = Boolean(enabled);
            hit = decodeAsrRule(r);
        }
    }
    if (!hit) throw new Error('规则不存在');
    writePack(pack);
    return hit;
}

function removeRule(id) {
    const pack = readPack();
    const zhBefore = pack.zhRemaps.length;
    const asrBefore = pack.asrPairs.length;
    pack.zhRemaps = pack.zhRemaps.filter((r) => r.id !== id);
    pack.asrPairs = pack.asrPairs.filter((r) => r.id !== id);
    if (pack.zhRemaps.length === zhBefore && pack.asrPairs.length === asrBefore) {
        throw new Error('规则不存在');
    }
    writePack(pack);
    return { ok: true, id };
}

function promoteSnippet(rulePlain) {
    const ja = (rulePlain.jaIncludes || [])[0] || '';
    const lines = [];
    lines.push('// Promote from mt-trained-remaps — review before pasting into mt-opaque-strings.js');
    if (rulePlain.mode === 'blank') {
        lines.push(`// blank when JA includes ${JSON.stringify(ja)}`);
        lines.push(`if (src.includes(d('${b64encode(ja)}')) && ${rulePlain.zhFrom ? `cur.includes(d('${b64encode(rulePlain.zhFrom)}'))` : 'true'}) {`);
        lines.push("    cur = '…';");
        lines.push("    note('domain_hallucination');");
        lines.push('}');
    } else {
        lines.push(`T.trainFrom = d('${b64encode(rulePlain.zhFrom)}');`);
        lines.push(`T.trainTo = d('${b64encode(rulePlain.zhTo)}');`);
        lines.push(`if (src.includes(d('${b64encode(ja)}')) && cur.includes(T.trainFrom)) {`);
        lines.push('    cur = cur.split(T.trainFrom).join(T.trainTo);');
        lines.push("    note('domain_term');");
        lines.push('}');
    }
    return lines.join('\n');
}

module.exports = {
    TRAINED_PATH,
    GENERIC_JA_ANCHORS,
    b64encode,
    b64decode,
    readPack,
    writePack,
    listRules,
    suggestLocalReplace,
    forceShortestFragment,
    isMostlyWholeFragment,
    suggestJaAnchor,
    narrowJaAnchor,
    isLowReuseAnchor,
    assessRuleQuality,
    encodeZhRule,
    encodeAsrRule,
    trySanitize,
    tryWithCandidate,
    addZhRemap,
    addAsrPair,
    toggleRule,
    removeRule,
    promoteSnippet,
};
