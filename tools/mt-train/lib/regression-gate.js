'use strict';

/**
 * Pre-write regression gate: collateral + accidental edits on already-stable cues.
 */
const train = require('./train');
const autoQuality = require('./auto-quality');

/**
 * @param {object} sanitize
 * @param {object} payload candidate rule payload
 * @param {{
 *   corpus?: Array<{ ji?: any, src: string, dst?: string, after?: string, issues?: string[] }>,
 *   targetJis?: Set<string>|string[],
 *   maxScan?: number,
 * }} [opts]
 */
function runRegressionGate(sanitize, payload, opts = {}) {
    const reasons = [];
    if (!payload || payload.mode === 'asr') {
        return { ok: true, blocked: false, reasons: [], collateral: null, regressions: [] };
    }

    if (payload.mode !== 'blank') {
        const dirty = String(payload.zh || '');
        const from = String(payload.zhFrom || '');
        if (!from) {
            return {
                ok: false,
                blocked: true,
                reasons: ['缺少短片段 zhFrom'],
                collateral: null,
                regressions: [],
            };
        }
        if (train.isMostlyWholeFragment(from, dirty) && !payload.expandStub) {
            return {
                ok: false,
                blocked: true,
                reasons: ['整句替换复用性差，拒绝写入'],
                collateral: null,
                regressions: [],
                lowReuse: true,
            };
        }
        const forced = train.forceShortestFragment({
            dirty,
            expect: payload.expect,
            zhFrom: from,
            zhTo: payload.zhTo,
        });
        if (forced.unusable) {
            return {
                ok: false,
                blocked: true,
                reasons: ['无法收敛为短片段规则'],
                collateral: null,
                regressions: [],
                lowReuse: true,
            };
        }
    }

    const anchor = String(payload.jaAnchor || '').trim();
    const fullJa = String(payload.ja || '').trim();
    if (train.isLowReuseAnchor(anchor, fullJa)) {
        return {
            ok: false,
            blocked: true,
            reasons: ['日文锚点接近整句，复用性差'],
            collateral: null,
            regressions: [],
            lowReuse: true,
            longAnchor: true,
        };
    }

    const corpus = Array.isArray(opts.corpus) ? opts.corpus : [];
    const targetJis = new Set(
        (opts.targetJis ? [...opts.targetJis] : [])
            .map((x) => String(x))
            .filter(Boolean),
    );
    if (payload.ji != null) targetJis.add(String(payload.ji));
    if (Array.isArray(payload.jis)) {
        for (const j of payload.jis) targetJis.add(String(j));
    }

    const collateral = corpus.length
        ? autoQuality.estimateCollateral(payload, corpus, { targetJis })
        : null;

    if (collateral) {
        if (collateral.extra > 3) {
            reasons.push(`误伤额外 ${collateral.extra} 句`);
        }
        if (collateral.risky) {
            reasons.push('误伤比例偏高');
        }
    }

    const maxScan = Math.min(120, Math.max(20, Number(opts.maxScan) || 80));
    const regressions = [];
    const profile = { contentProfile: payload.contentProfile || 'av_soft' };

    for (const cue of corpus.slice(0, maxScan)) {
        const ji = cue.ji != null ? String(cue.ji) : '';
        if (ji && targetJis.has(ji)) continue;
        const text = cue.after != null ? cue.after : cue.dst;
        const src = cue.src || '';
        if (!autoQuality.ruleWouldChange(text, src, payload)) continue;

        let beforeText = String(text ?? '');
        try {
            if (sanitize && typeof sanitize.sanitizeMtCueText === 'function') {
                beforeText = String(sanitize.sanitizeMtCueText(text, src, profile).text ?? text);
            }
        } catch (_) { /* ignore */ }

        // Only treat as regression when the cue looked already stable
        const issues = Array.isArray(cue.issues) ? cue.issues : [];
        const stable = !issues.length
            || issues.every((i) => String(i).startsWith('fixed:'))
            || beforeText === '…'
            || beforeText === '';
        if (!stable) continue;

        if (!autoQuality.ruleWouldChange(beforeText, src, payload)) continue;
        regressions.push({
            ji: cue.ji,
            src: String(src).slice(0, 80),
            before: String(beforeText).slice(0, 80),
        });
        if (regressions.length >= 12) break;
    }

    if (regressions.length > 2) {
        reasons.push(`可能破坏 ${regressions.length} 条已稳定句`);
    }

    const blocked = reasons.length > 0
        || (collateral && (collateral.extra > 3 || collateral.risky))
        || regressions.length > 2;

    return {
        ok: !blocked,
        blocked: !!blocked,
        reasons,
        collateral,
        regressions,
    };
}

module.exports = {
    runRegressionGate,
};
