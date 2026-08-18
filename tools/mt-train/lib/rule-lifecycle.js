'use strict';

/**
 * Rule lifecycle: hit stats, stale detection, title filter helpers.
 */
const train = require('./train');
const autoQuality = require('./auto-quality');

const STALE_DAYS = 21;
const STALE_ZERO_HIT_DAYS = 7;

function daysSince(iso) {
    if (!iso) return Infinity;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return Infinity;
    return (Date.now() - t) / (86400 * 1000);
}

/**
 * @param {object} rule decoded zh/asr rule
 * @param {{ totalHits?: number, lastHitAt?: string|null }} stats
 */
function classifyLifecycle(rule, stats = {}) {
    const hits = Number(stats.totalHits != null ? stats.totalHits : rule.hitCount) || 0;
    const lastHitAt = stats.lastHitAt || rule.lastHitAt || null;
    const createdAt = rule.createdAt || null;
    const ageDays = daysSince(lastHitAt || createdAt);
    const enabled = rule.enabled !== false;

    let stale = false;
    let reason = '';
    if (!enabled) {
        reason = '已停用';
    } else if (hits === 0 && ageDays >= STALE_ZERO_HIT_DAYS) {
        stale = true;
        reason = `语料 0 命中且已 ${Math.floor(ageDays)} 天`;
    } else if (hits === 0 && !lastHitAt && daysSince(createdAt) >= STALE_ZERO_HIT_DAYS) {
        stale = true;
        reason = '写入后未见命中';
    } else if (lastHitAt && daysSince(lastHitAt) >= STALE_DAYS) {
        stale = true;
        reason = `已 ${Math.floor(daysSince(lastHitAt))} 天未命中`;
    }

    return {
        hitCount: hits,
        lastHitAt,
        createdAt,
        ageDays: Number.isFinite(ageDays) ? ageDays : null,
        stale,
        reason: reason || (hits ? `命中 ${hits}` : '暂无命中统计'),
        enabled,
    };
}

/**
 * Annotate rules with collateral stats from a corpus.
 * @param {object[]} rules decoded
 * @param {object[]} corpus
 * @param {{ persist?: boolean }} [opts]
 */
function annotateRules(rules, corpus, opts = {}) {
    const list = Array.isArray(rules) ? rules : [];
    const cues = Array.isArray(corpus) ? corpus : [];
    const out = [];
    const updates = [];

    for (const r of list) {
        let stats = { totalHits: 0, lastHitAt: r.lastHitAt || null };
        if (r.kind === 'asr' || r.from != null) {
            // ASR: count JA from→ occurrences
            const from = String(r.from || '');
            if (from && cues.length) {
                let n = 0;
                for (const c of cues) {
                    if (String(c.src || '').includes(from)) n += 1;
                }
                stats.totalHits = n;
                if (n > 0) stats.lastHitAt = new Date().toISOString();
            }
        } else {
            const payload = {
                mode: r.mode === 'blank' ? 'blank' : 'replace',
                zhFrom: r.zhFrom,
                zhTo: r.zhTo,
                jaAnchor: (r.jaIncludes || [])[0] || '',
            };
            if (cues.length) {
                const col = autoQuality.estimateCollateral(payload, cues, { targetJis: [] });
                stats.totalHits = col.totalHits;
                if (col.totalHits > 0) stats.lastHitAt = new Date().toISOString();
            }
        }
        const life = classifyLifecycle(r, stats);
        out.push({
            ...r,
            lifecycle: life,
            stats: {
                totalHits: life.hitCount,
                lastHitAt: life.lastHitAt,
                stale: life.stale,
                reason: life.reason,
            },
        });
        if (opts.persist && r.id) {
            updates.push({
                id: r.id,
                hitCount: life.hitCount,
                lastHitAt: life.lastHitAt || r.lastHitAt || null,
            });
        }
    }

    if (opts.persist && updates.length) {
        train.updateRuleStats(updates);
    }

    const stale = out.filter((r) => r.lifecycle?.stale && r.enabled !== false);
    return {
        rules: out,
        staleCount: stale.length,
        staleIds: stale.map((r) => r.id),
    };
}

function filterRulesByTitle(rules, q) {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return rules;
    return (rules || []).filter((r) => {
        const title = String(r.title || '').toLowerCase();
        const note = String(r.note || '').toLowerCase();
        const id = String(r.id || '').toLowerCase();
        return title.includes(needle) || note.includes(needle) || id.includes(needle);
    });
}

module.exports = {
    STALE_DAYS,
    STALE_ZERO_HIT_DAYS,
    daysSince,
    classifyLifecycle,
    annotateRules,
    filterRulesByTitle,
};
