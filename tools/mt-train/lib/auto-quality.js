'use strict';

/**
 * Confidence, collateral estimation, and same-remap merging for auto-train.
 */
const train = require('./train');

function remapFingerprint(payload) {
    if (!payload) return '';
    const mode = payload.mode === 'blank' ? 'blank' : 'replace';
    const from = String(payload.zhFrom || '');
    const to = mode === 'blank' ? '' : String(payload.zhTo || payload.expect || '');
    return `${mode}\u0000${from}\u0000${to}`;
}

/** Would this single rule change text given JA source? */
function ruleWouldChange(text, src, payload) {
    if (!payload) return false;
    const cur = String(text ?? '');
    const ja = String(src || '');
    const anchor = String(payload.jaAnchor || (payload.jaIncludes || [])[0] || '').trim();
    if (anchor && !ja.includes(anchor)) return false;
    if (payload.mode === 'blank') {
        if (payload.zhFrom && !cur.includes(payload.zhFrom)) return false;
        return cur !== '…';
    }
    const zhFrom = String(payload.zhFrom || '');
    if (!zhFrom || !cur.includes(zhFrom)) return false;
    return cur.split(zhFrom).join(String(payload.zhTo || '')) !== cur;
}

/**
 * Dry-run a candidate against a cue corpus.
 * @param {object} payload
 * @param {Array<{ ji?: any, src: string, dst?: string, after?: string }>} corpus
 * @param {{ targetJis?: Set<string>|string[] }} [opts]
 */
function estimateCollateral(payload, corpus, opts = {}) {
    const targets = new Set(
        (opts.targetJis ? [...opts.targetJis] : [])
            .map((x) => String(x)),
    );
    const list = Array.isArray(corpus) ? corpus : [];
    let totalHits = 0;
    const extras = [];
    const intended = [];
    for (const cue of list) {
        const text = cue.after != null ? cue.after : cue.dst;
        if (!ruleWouldChange(text, cue.src, payload)) continue;
        totalHits += 1;
        const ji = cue.ji != null ? String(cue.ji) : '';
        if (targets.size && ji && targets.has(ji)) intended.push(ji);
        else if (targets.size && ji && !targets.has(ji)) extras.push(ji);
        else if (!targets.size) intended.push(ji || '?');
    }
    const extra = extras.length;
    const ratio = list.length ? totalHits / list.length : 0;
    return {
        corpusSize: list.length,
        totalHits,
        intended: intended.length,
        extra,
        extraJis: extras.slice(0, 12),
        ratio,
        risky: extra > 3 || (list.length >= 20 && ratio > 0.08 && extra > 0),
    };
}

/**
 * Among JA strings, pick longest anchor that still matches every source.
 */
function pickSharedJaAnchor(srcs, fallbacks = []) {
    const sources = (srcs || []).map((s) => String(s || '')).filter(Boolean);
    if (!sources.length) return { anchor: '', shared: false };
    const candidates = [...fallbacks, ...sources]
        .map((s) => {
            const t = train.suggestJaAnchor(s) || s;
            return String(t || '').trim();
        })
        .filter(Boolean);
    // Unique, prefer longer
    const uniq = [...new Set(candidates)].sort((a, b) => b.length - a.length);
    for (const c of uniq) {
        if (c.length < 2) continue;
        if (sources.every((s) => s.includes(c))) {
            return { anchor: c, shared: true };
        }
    }
    // No shared — use longest single cue (merged rule will be review)
    const longest = sources.slice().sort((a, b) => b.length - a.length)[0] || '';
    return {
        anchor: train.suggestJaAnchor(longest) || longest,
        shared: false,
    };
}

/**
 * Merge proposals that share the same zhFrom→zhTo (replace/blank).
 * Keeps skip/error/needs_expect rows untouched.
 */
function mergeSameRemaps(proposals) {
    const passthrough = [];
    const groups = new Map();
    for (const p of proposals || []) {
        if (!p?.payload || !['ready', 'review', 'failed'].includes(p.status)) {
            passthrough.push(p);
            continue;
        }
        const fp = remapFingerprint(p.payload);
        if (!fp || (p.payload.mode !== 'blank' && !p.payload.zhFrom)) {
            passthrough.push(p);
            continue;
        }
        if (!groups.has(fp)) groups.set(fp, []);
        groups.get(fp).push(p);
    }

    const merged = [];
    let mergeCount = 0;
    for (const [, group] of groups) {
        if (group.length === 1) {
            merged.push(group[0]);
            continue;
        }
        mergeCount += 1;
        const srcs = group.map((g) => g.src || g.payload?.ja || '');
        const { anchor, shared } = pickSharedJaAnchor(
            srcs,
            group.map((g) => g.payload?.jaAnchor),
        );
        const bestTry = group.find((g) => g.trial?.matchesExpect)
            || group.find((g) => g.status === 'ready')
            || group[0];
        const jis = group.map((g) => g.ji);
        const payload = {
            ...bestTry.payload,
            jaAnchor: anchor,
            jaIncludes: anchor ? [anchor] : bestTry.payload.jaIncludes,
            note: `${bestTry.payload.note || ''} · merged×${group.length}`.trim(),
        };
        const allMatch = group.every((g) => g.trial?.matchesExpect);
        const status = !allMatch
            ? 'failed'
            : (shared ? (bestTry.status === 'review' ? 'review' : 'ready') : 'review');
        merged.push({
            ...bestTry,
            status,
            ji: jis[0],
            jis,
            src: srcs[0],
            mergedFrom: jis,
            mergeSize: group.length,
            reason: shared
                ? `${bestTry.reason || ''} · 已合并 ${group.length} 条同型替换`.trim()
                : `${bestTry.reason || ''} · 同型 ${group.length} 条但无公共锚点，需复核`.trim(),
            payload,
            accepted: false, // finalizeConfidence will set
            sharedAnchor: shared,
        });
        // Mark originals as absorbed (for UI transparency, keep short stubs)
        for (const g of group.slice(1)) {
            passthrough.push({
                status: 'duplicate',
                reason: `已并入 #${jis[0]} 同型规则（${group.length} 条合并）`,
                ji: g.ji,
                src: g.src,
                issue: g.issue,
                dupOf: jis[0],
                accepted: false,
            });
        }
    }
    return { proposals: [...merged, ...passthrough], mergeCount };
}

/**
 * @param {object} p proposal
 * @param {object|null} collateral
 */
function scoreConfidence(p, collateral = null, crossCollateral = null) {
    if (!p) {
        return { level: 'reject', label: '别写', score: 0, reasons: ['无候选'] };
    }
    if (['skipped', 'duplicate', 'exists', 'needs_expect', 'error'].includes(p.status)) {
        return {
            level: 'reject',
            label: '别写',
            score: 0,
            reasons: [p.reason || p.status],
        };
    }
    if (p.status === 'failed' || p.trial?.matchesExpect === false) {
        return {
            level: 'reject',
            label: '别写',
            score: 10,
            reasons: ['试跑未命中期望'],
        };
    }

    let score = 100;
    const reasons = [];
    const anchor = String(p.payload?.jaAnchor || '').trim();
    const fullJa = String(p.payload?.ja || p.src || '').trim();
    if (anchor.length <= 2) {
        score -= 45;
        reasons.push('锚点过短');
    } else if (anchor.length <= 4) {
        score -= 25;
        reasons.push('锚点偏短');
    }
    if (train.isLowReuseAnchor(anchor, fullJa)) {
        // Near-whole-sentence anchors barely reuse — reject.
        return {
            level: 'reject',
            label: '锚点过长',
            score: 18,
            reasons: ['日文锚点接近整句，复用性差'],
            collateral,
            crossCollateral,
            lowReuse: true,
            longAnchor: true,
        };
    }
    if (p.payload?.wholeSentence || p.payload?.expandStub) {
        const fromLen = String(p.payload.zhFrom || '').length;
        const zhLen = String(p.payload.zh || p.dst || '').length;
        const mostlyWhole = fromLen >= Math.max(12, Math.floor(zhLen * 0.85));
        // Whole-sentence remaps are low-reuse — reject as training rules.
        if (mostlyWhole && !p.payload.expandStub) {
            return {
                level: 'reject',
                label: '整句勿写',
                score: 12,
                reasons: ['整句替换复用性差，不适合写入全局规则'],
                collateral,
                crossCollateral,
                lowReuse: true,
            };
        }
        score -= p.payload.expandStub ? 15 : 35;
        reasons.push(p.payload.expandStub ? '短译补全（需确认）' : '接近整句替换');
    }
    if (p.sharedAnchor === false) {
        score -= 20;
        reasons.push('合并后无公共锚点');
    }
    if (p.mergeSize > 1 && p.sharedAnchor) {
        score += 5;
        reasons.push(`同型合并×${p.mergeSize}`);
    }
    if (collateral) {
        if (collateral.extra > 0) {
            score -= Math.min(55, collateral.extra * 12);
            reasons.push(`预计误伤 ${collateral.extra} 句`);
        }
        if (collateral.risky) {
            score -= 15;
            reasons.push('误伤比例偏高');
        }
        if (collateral.extra > 3) {
            return {
                level: 'reject',
                label: '别写',
                score: Math.min(score, 25),
                reasons,
                collateral,
                crossCollateral,
            };
        }
    }
    if (crossCollateral) {
        if (crossCollateral.totalHits > 0) {
            reasons.push(`跨片命中 ${crossCollateral.totalHits}（${crossCollateral.titlesHit} 部）`);
            // Modest reuse across titles is good; huge fan-out is risky
            if (crossCollateral.risky) {
                score -= 28;
                reasons.push('跨片命中偏多，锚点可能过宽');
            } else if (crossCollateral.titlesHit >= 2 && crossCollateral.totalHits <= 12) {
                score += 4;
                reasons.push('跨片可复用');
            }
        }
        if (crossCollateral.risky && crossCollateral.totalHits > 40) {
            return {
                level: 'reject',
                label: '别写',
                score: Math.min(score, 22),
                reasons,
                collateral,
                crossCollateral,
            };
        }
        if (crossCollateral.risky) {
            score = Math.min(score, 55);
        }
    }
    if (p.status === 'review') {
        score -= 15;
        if (!reasons.includes('需复核')) reasons.push('质量告警');
    }

    if (score >= 75 && p.trial?.matchesExpect) {
        return { level: 'auto', label: '可直接写', score, reasons, collateral, crossCollateral };
    }
    if (score >= 45 && p.trial?.matchesExpect) {
        return { level: 'review', label: '建议改', score, reasons, collateral, crossCollateral };
    }
    return { level: 'reject', label: '别写', score, reasons, collateral, crossCollateral };
}

/**
 * Merge → collateral → confidence. Mutates/returns enriched proposals.
 */
function finalizeProposals(proposals, opts = {}) {
    const corpus = Array.isArray(opts.corpus) ? opts.corpus : [];
    const crossMulti = opts.crossMulti || null;
    const estimateCrossTitleCollateral = opts.estimateCrossTitleCollateral
        || (() => {
            try {
                return require('./multi-corpus').estimateCrossTitleCollateral;
            } catch (_) {
                return null;
            }
        })();
    const { proposals: mergedList, mergeCount } = mergeSameRemaps(proposals);
    const out = [];
    let autoN = 0;
    let reviewN = 0;
    let rejectN = 0;

    for (const p of mergedList) {
        if (!p?.payload || !['ready', 'review', 'failed'].includes(p.status)) {
            out.push(p);
            continue;
        }
        const targetJis = new Set(
            (p.jis || p.mergedFrom || [p.ji]).map((x) => String(x)),
        );
        const collateral = corpus.length
            ? estimateCollateral(p.payload, corpus, { targetJis })
            : null;
        let crossCollateral = null;
        if (crossMulti && typeof estimateCrossTitleCollateral === 'function') {
            crossCollateral = estimateCrossTitleCollateral(p.payload, crossMulti);
        }
        const confidence = scoreConfidence(p, collateral, crossCollateral);
        const next = {
            ...p,
            collateral,
            crossCollateral,
            confidence,
            accepted: confidence.level === 'auto',
            force: false,
            // Map confidence onto status for older UI paths
            status: confidence.level === 'auto'
                ? 'ready'
                : (confidence.level === 'review' ? 'review' : (p.status === 'failed' ? 'failed' : 'review')),
        };
        if (confidence.level === 'reject' && p.trial?.matchesExpect === false) {
            next.status = 'failed';
        }
        if (confidence.level === 'reject' && p.trial?.matchesExpect) {
            next.status = 'review';
            next.accepted = false;
            next.forceRequired = true;
        }
        if (confidence.level === 'auto') autoN += 1;
        else if (confidence.level === 'review') reviewN += 1;
        else rejectN += 1;
        out.push(next);
    }

    return {
        proposals: out,
        mergeCount,
        confidence: { auto: autoN, review: reviewN, reject: rejectN },
        crossTitleCount: crossMulti?.titleCount || 0,
    };
}

function buildCorpusFromHits(hits) {
    const map = new Map();
    for (const h of hits || []) {
        const key = `${h.ji}|${h.src}|${h.dst}`;
        if (!map.has(key)) map.set(key, h);
    }
    return [...map.values()];
}

/**
 * Reuse gate for learning-wizard report buckets.
 * @returns {{ bucket: 'write'|'narrow'|'exclude', reason: string, lowReuse?: boolean }}
 */
function assessRuleReuse(p, opts = {}) {
    if (!p) return { bucket: 'exclude', reason: '无候选' };
    if (['skipped', 'duplicate', 'exists', 'error'].includes(p.status)) {
        return { bucket: 'exclude', reason: p.reason || p.status };
    }
    if (p.status === 'needs_expect') {
        return { bucket: 'narrow', reason: p.reason || '缺期望/片段（可手改后写入）' };
    }
    if (!p.payload) {
        return { bucket: 'exclude', reason: p.reason || '无规则载荷' };
    }

    const payload = p.payload;
    const mode = payload.mode === 'blank' ? 'blank' : 'replace';
    const from = String(payload.zhFrom || '');
    const dirty = String(payload.zh || p.dst || p.after || '');
    const anchor = String(payload.jaAnchor || '').trim();
    const fullJa = String(payload.ja || p.src || '').trim();

    if (mode === 'replace') {
        if (payload.unusable) {
            return {
                bucket: 'exclude',
                reason: '无法抽出短片段（整句已排除）',
                lowReuse: true,
            };
        }
        if (!from) {
            return {
                bucket: opts.wizardMode ? 'narrow' : 'exclude',
                reason: '缺少可替换片段 zhFrom（可手填）',
            };
        }
        const mostlyWhole = Boolean(payload.wholeSentence)
            && from.length >= Math.max(12, Math.floor(dirty.length * 0.85));
        if (mostlyWhole && !payload.expandStub) {
            return {
                bucket: 'exclude',
                reason: '整句替换复用性差（禁止单片整句特化）',
                lowReuse: true,
            };
        }
        if (from.length >= Math.max(16, Math.floor(dirty.length * 0.7)) && !payload.expandStub) {
            return { bucket: 'narrow', reason: '片段偏长，建议再缩短' };
        }
    }

    if (payload.longAnchor || train.isLowReuseAnchor(anchor, fullJa)) {
        return {
            bucket: opts.wizardMode ? 'narrow' : 'exclude',
            reason: '日文锚点偏长，请改成短短语后再写',
            lowReuse: true,
        };
    }
    if (anchor && anchor.length <= 2) {
        return { bucket: 'narrow', reason: '日文锚点过短，易误伤' };
    }

    const level = p.confidence?.level
        || (p.status === 'ready' ? 'auto' : (p.status === 'review' ? 'review' : 'reject'));
    if (level === 'reject' || p.status === 'failed') {
        // Wizard: keep editable short rules in「需收窄」instead of burying in 已排除
        if (
            opts.wizardMode
            && payload
            && (mode === 'blank' || (from && from.length < 16))
            && !payload.unusable
            && !(payload.wholeSentence && !payload.expandStub)
        ) {
            return {
                bucket: 'narrow',
                reason: (p.confidence?.reasons || []).join('；') || p.reason || '需改锚点/片段后重试',
            };
        }
        return {
            bucket: 'exclude',
            reason: (p.confidence?.reasons || []).join('；') || p.reason || '置信不足/试跑失败',
            lowReuse: Boolean(p.confidence?.lowReuse),
        };
    }
    if (level === 'auto' && p.trial?.matchesExpect !== false) {
        return { bucket: 'write', reason: p.reason || '可复用片段' };
    }
    // expandStub that passed trial → write in wizard
    if (opts.wizardMode && payload.expandStub && p.trial?.matchesExpect) {
        return { bucket: 'write', reason: p.reason || '短译补全（可写）' };
    }
    return { bucket: 'narrow', reason: p.reason || '需收窄锚点或片段' };
}

/**
 * Wizard-oriented buckets: 建议写入 / 需收窄 / 已排除
 */
function buildWizardReport(proposals, opts = {}) {
    const adopt = [];
    const review = [];
    const skip = [];
    let wholeFiltered = 0;
    for (const p of proposals || []) {
        const reuse = assessRuleReuse(p, opts);
        const row = { ...p, reuse };
        if (reuse.bucket === 'write') adopt.push(row);
        else if (reuse.bucket === 'narrow') review.push(row);
        else {
            if (reuse.lowReuse) wholeFiltered += 1;
            skip.push(row);
        }
    }
    return {
        adopt,
        review,
        skip,
        adoptCount: adopt.length,
        reviewCount: review.length,
        skipCount: skip.length,
        wholeFiltered,
    };
}

module.exports = {
    remapFingerprint,
    ruleWouldChange,
    estimateCollateral,
    pickSharedJaAnchor,
    mergeSameRemaps,
    scoreConfidence,
    finalizeProposals,
    buildCorpusFromHits,
    assessRuleReuse,
    buildWizardReport,
};
