'use strict';

/**
 * Training-route classifier: ZH remap vs ASR vs skip vs re-MT.
 * Mirrors the judgment used in smart-translate comparison training.
 */
const { CLUSTER_ORDER } = require('./clusters');

const ROUTE = Object.freeze({
    zh_remap: 'zh_remap',
    asr: 'asr',
    skip: 'skip',
    re_mt: 're_mt',
});

const ROUTE_LABEL = Object.freeze({
    zh_remap: '改中文',
    asr: '听写纠错',
    skip: '跳过',
    re_mt: '宜重译',
});

/** Prefer training these clusters first (matches residual hot path). */
const CLUSTER_QUEUE = Object.freeze([
    'prompt_leak',
    'iku_shoot',
    'dechau_out',
    'yame_shoot',
    'iku_xing',
    'kiniri',
    'kimochi_stub',
    'clinical_rod',
    'invent_rod',
    'sfx_halluc',
    'latin',
    'heixiu',
    'ja_echo',
    'under_stub',
]);

const SKIP_ISSUES = new Set([
    'align_suspect',
    'align_gap',
    'moan_expand',
    'other',
    'asr_garbage',
]);

const ZH_REMAP_ISSUES = new Set([
    'prompt_leak',
    'iku_shoot',
    'dechau_out',
    'yame_shoot',
    'iku_xing',
    'kiniri',
    'kimochi_stub',
    'clinical_rod',
    'invent_rod',
    'sfx_halluc',
    'latin',
    'heixiu',
    'ja_echo',
]);

function primaryIssue(hit) {
    const issues = Array.isArray(hit?.issues) ? hit.issues : [];
    return CLUSTER_QUEUE.find((i) => issues.includes(i))
        || issues.find((i) => ZH_REMAP_ISSUES.has(i))
        || issues[0]
        || '';
}

/**
 * @param {object} hit
 * @returns {{ route: string, reason: string, issue: string, label: string }}
 */
function classifyTrainRoute(hit) {
    const issues = Array.isArray(hit?.issues) ? hit.issues : [];
    const src = String(hit?.src || '').trim();
    const issue = primaryIssue(hit);

    if (!issues.length) {
        return { route: ROUTE.skip, reason: '无问题标签', issue, label: ROUTE_LABEL.skip };
    }
    if (issues.every((i) => String(i).startsWith('fixed:'))) {
        return { route: ROUTE.skip, reason: '已修好样例', issue, label: ROUTE_LABEL.skip };
    }
    if (issues.some((i) => SKIP_ISSUES.has(i)) && !issues.some((i) => ZH_REMAP_ISSUES.has(i) || i === 'under_stub')) {
        return { route: ROUTE.skip, reason: '对齐/ASR糊片/次要问题', issue, label: ROUTE_LABEL.skip };
    }

    try {
        const lex = require('../../../src/js/mt-sanitize-lexicon');
        if (lex.isAsrGarbageJa?.(src)) {
            return { route: ROUTE.skip, reason: 'ASR糊片，跳过训练', issue, label: ROUTE_LABEL.skip };
        }
    } catch (_) { /* ignore */ }

    if (src.length <= 2 || /^[&＋+\-—…·.。,，、\s]+$/u.test(src)) {
        return { route: ROUTE.skip, reason: '日文锚点过短或残片', issue, label: ROUTE_LABEL.skip };
    }

    // Clear JA domain mishear → prefer ASR pair over ZH remap
    if (
        /[A-Za-z]{3,}/.test(src)
        && /[\u3040-\u30ff\u4e00-\u9fff]/.test(String(hit?.dst || hit?.after || ''))
        && issues.includes('latin') === false
    ) {
        return {
            route: ROUTE.asr,
            reason: '日文含疑似听写拉丁渣，优先听写纠错',
            issue,
            label: ROUTE_LABEL.asr,
        };
    }

    if (issues.includes('under_stub') && !issues.some((i) => ZH_REMAP_ISSUES.has(i))) {
        return {
            route: ROUTE.re_mt,
            reason: '短译欠译：宜重译或模型抽片段，勿整句入库',
            issue: 'under_stub',
            label: ROUTE_LABEL.re_mt,
        };
    }

    if (issues.some((i) => ZH_REMAP_ISSUES.has(i))) {
        return {
            route: ROUTE.zh_remap,
            reason: '译文侧可复用片段',
            issue,
            label: ROUTE_LABEL.zh_remap,
        };
    }

    return {
        route: ROUTE.skip,
        reason: '非高热度问题',
        issue,
        label: ROUTE_LABEL.skip,
    };
}

/**
 * Keep only hits matching cluster filter (chip / queue).
 * @param {object[]} hits
 * @param {string|string[]|null} cluster
 */
function filterHitsByCluster(hits, cluster) {
    const list = Array.isArray(hits) ? hits : [];
    if (!cluster) return list;
    const want = new Set(
        (Array.isArray(cluster) ? cluster : [cluster])
            .map((c) => String(c || '').trim())
            .filter(Boolean),
    );
    if (!want.size) return list;
    return list.filter((h) => (h.issues || []).some((i) => want.has(i)));
}

/**
 * Sort hits by cluster training queue, then original order.
 * @param {object[]} hits
 */
function sortHitsByClusterQueue(hits) {
    return (Array.isArray(hits) ? hits : [])
        .map((h, idx) => ({ h, idx, issue: primaryIssue(h) }))
        .sort((a, b) => {
            const ia = CLUSTER_QUEUE.indexOf(a.issue);
            const ib = CLUSTER_QUEUE.indexOf(b.issue);
            const ra = ia >= 0 ? ia : 900;
            const rb = ib >= 0 ? ib : 900;
            if (ra !== rb) return ra - rb;
            return a.idx - b.idx;
        })
        .map((x) => x.h);
}

/**
 * Soft hint when candidate ZH surface may oppose a declared strip↔remap intent.
 * Does not block; callers demote confidence.
 * @param {{ zhFrom?: string, zhTo?: string, mode?: string }} payload
 * @returns {{ risk: boolean, note: string, intents: string[] }|null}
 */
function opposingIntentHint(payload) {
    if (!payload || payload.mode === 'blank') return null;
    const from = String(payload.zhFrom || '');
    const to = String(payload.zhTo || payload.expect || '');
    if (!from && !to) return null;
    try {
        const intentCore = require('../../../src/js/mt-sanitize-intent-core');
        const opaque = require('../../../src/js/mt-opaque-strings');
        const intents = typeof intentCore.buildAllIntents === 'function'
            ? intentCore.buildAllIntents(opaque)
            : (intentCore.buildCanonicalIntents?.(opaque) || []);
        const hits = [];
        for (const it of intents) {
            const zh = String(it.zhSurface || '').trim();
            if (!zh || zh.length < 2) continue;
            const paired = Array.isArray(it.pairedWith) ? it.pairedWith : [];
            if (!paired.length) continue;
            if ((from && from.includes(zh)) || (to && to.includes(zh))) {
                hits.push(it.id);
            }
        }
        if (!hits.length) return null;
        return {
            risk: true,
            note: `触及对立意图面（${hits.slice(0, 3).join(', ')}），请确认 strip↔remap 双侧夹具`,
            intents: hits.slice(0, 8),
        };
    } catch (_) {
        return null;
    }
}

module.exports = {
    ROUTE,
    ROUTE_LABEL,
    CLUSTER_QUEUE,
    CLUSTER_ORDER,
    SKIP_ISSUES,
    ZH_REMAP_ISSUES,
    primaryIssue,
    classifyTrainRoute,
    filterHitsByCluster,
    sortHitsByClusterQueue,
    opposingIntentHint,
};
