'use strict';

/**
 * Training-scan policy: adult anchors, residual classes, recover coverage.
 * Keeps under_formable noise out of hot training queues.
 */
const lexicon = require('../../../src/js/mt-sanitize-lexicon');

const HOT_CLASSES = new Set([
    lexicon.RESIDUAL_CLASS.reusable_semantic,
    lexicon.RESIDUAL_CLASS.under_stub,
    lexicon.RESIDUAL_CLASS.latin_scrap,
    lexicon.RESIDUAL_CLASS.ja_echo,
    lexicon.RESIDUAL_CLASS.source_echo_re_mt,
]);

function textLen(s) {
    return lexicon.textLen ? lexicon.textLen(s) : [...String(s || '').replace(/\s/g, '')].length;
}

/**
 * @param {{ src: string, dst: string, after: string, flags?: string[] }} row
 */
function classifyRow(row) {
    return lexicon.classifyResidual(row.src, row.dst, row.after, row.flags || []);
}

/**
 * True when under-translation is worth training (adult JA + insufficient ZH).
 */
function isTrainableUnder(row) {
    const src = String(row.src || '');
    const after = String(row.after || '');
    if (lexicon.isAsrGarbageJa(src)) return false;
    if (!lexicon.isAdultJaAnchor(src)) return false;
    if (lexicon.isZhSufficientForJa(src, after, row.flags || [])) return false;
    const cover = lexicon.zhCoverJaAnchors(src, after);
    if (cover.missing.length > 0) return true;
    if (textLen(after) <= 4 && textLen(src) >= 8) return true;
    const flags = row.flags || [];
    return flags.some((f) => /blank|under|trunc|empty|source_echo/.test(f));
}

/**
 * Latin leftover worth reporting (exclude justified romanization).
 */
function isTrainableLatin(row) {
    const after = String(row.after || '');
    if (!/[A-Za-zÀ-ɏ]{3,}/.test(after)) return false;
    if (/Mizumi|cosplay|OK|DVD|AV|Kiss|maybe|SP|HD|USB|WIFI|GPS/i.test(after)) return false;
    if (lexicon.isJustifiedLatinLeak(after, row.src)) return false;
    return true;
}

/**
 * Recover coverage for adult short/blank ZH vs JA — sufficiency-aware.
 * @returns {{ adultShort: number, recovered: number, unrecovered: number, rate: number, sufficient: number }}
 */
function recoverCoverage(rows = []) {
    let adultShort = 0;
    let recovered = 0;
    let sufficient = 0;
    for (const row of rows) {
        const src = String(row.src || '');
        const dst = String(row.dst || '');
        const after = String(row.after || '');
        if (!lexicon.isAdultJaAnchor(src)) continue;
        if (lexicon.isAsrGarbageJa(src)) continue;
        const dstLen = textLen(dst);
        const srcLen = textLen(src);
        const wasShort = dstLen <= 4 && srcLen >= 8;
        const wasBlank = !dst.trim() || /^[…·.\s]*$/.test(dst.trim());
        const wasInsufficient = !lexicon.isZhSufficientForJa(src, dst, []);
        if (!wasShort && !wasBlank && !wasInsufficient) continue;
        adultShort += 1;
        if (lexicon.isZhSufficientForJa(src, after, row.flags || [])) {
            recovered += 1;
            sufficient += 1;
        } else if (textLen(after) >= 5 && after !== dst) {
            // Partial improve but still missing anchors — not full recover
        }
    }
    const unrecovered = adultShort - recovered;
    return {
        adultShort,
        recovered,
        unrecovered,
        sufficient,
        rate: adultShort ? recovered / adultShort : 1,
    };
}

/**
 * Bucket a sanitized aligned cue for training reports.
 */
function bucketResidual(row) {
    if (row.alignGap) return 'align_gap';
    const cls = classifyRow(row);
    if (cls === lexicon.RESIDUAL_CLASS.asr_garbage) return 'asr_garbage';
    if (cls === lexicon.RESIDUAL_CLASS.sufficient) return null;
    if (cls === lexicon.RESIDUAL_CLASS.source_echo_re_mt) return 'source_echo_re_mt';
    if (cls === lexicon.RESIDUAL_CLASS.latin_scrap && isTrainableLatin(row)) return 'latin_left';
    if (cls === lexicon.RESIDUAL_CLASS.ja_echo) return 'ja_echo';
    if (cls === lexicon.RESIDUAL_CLASS.under_stub && isTrainableUnder(row)) return 'under_formable';
    if (/阴道|阴部/.test(row.after || '') || (/阴茎/.test(row.after || '') && !/阴茎头|龟头/.test(row.after || ''))) {
        return 'clinical_left';
    }
    if (/嘿咻|黑袖|黑修/.test(row.after || '')) return 'heixiu';
    const polarity = lexicon.classifyClimaxPolarity(row.src || '');
    if (
        /去了|要去了/.test(row.after || '')
        && /イ[クッ]|射|出[しさ]/.test(row.src || '')
        && polarity !== lexicon.CLIMAX_POLARITY.prefer_go
        && !/まんこ|おまんこ|乳首|ちくび/.test(row.src || '')
    ) {
        return 'soft_go';
    }
    if (
        /肉棒|鸡巴|鸡鸡/.test(row.after || '')
        && !lexicon.jaHasRodCue(row.src)
        && /[\u4e00-\u9fff]/.test(row.after || '')
    ) {
        return 'invent_rod';
    }
    if (!HOT_CLASSES.has(cls)) return null;
    return cls;
}

/**
 * Rank rows by unified residual score (higher = train first).
 */
function rankResiduals(rows = []) {
    const freq = new Map();
    for (const row of rows) {
        const cover = lexicon.zhCoverJaAnchors(row.src, row.after);
        const key = `${classifyRow(row)}:${cover.missing.sort().join(',')}`;
        freq.set(key, (freq.get(key) || 0) + 1);
    }
    return rows
        .map((row) => {
            const cover = lexicon.zhCoverJaAnchors(row.src, row.after);
            const key = `${classifyRow(row)}:${cover.missing.sort().join(',')}`;
            const scored = lexicon.residualScore(row, { batchFreq: freq.get(key) || 1 });
            return { ...row, ...scored, batchFreq: freq.get(key) || 1 };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score || a.i - b.i);
}

module.exports = {
    HOT_CLASSES,
    RESIDUAL_CLASS: lexicon.RESIDUAL_CLASS,
    CLIMAX_POLARITY: lexicon.CLIMAX_POLARITY,
    classifyRow,
    isTrainableUnder,
    isTrainableLatin,
    isAdultJaAnchor: lexicon.isAdultJaAnchor,
    isAsrGarbageJa: lexicon.isAsrGarbageJa,
    isZhSufficientForJa: lexicon.isZhSufficientForJa,
    recoverCoverage,
    bucketResidual,
    rankResiduals,
    residualScore: lexicon.residualScore,
    lexicon,
};
