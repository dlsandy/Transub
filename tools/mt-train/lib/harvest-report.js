'use strict';

/**
 * Multi-route harvest for the learning wizard.
 * Remap is only one kind of fruit; ASR drafts and work-orders also count.
 */
const trainRoute = require('./train-route');
const autoQuality = require('./auto-quality');
const asrSuggest = require('./asr-suggest');

const WORK_ORDER_KIND = Object.freeze({
    re_align: 're_align',
    re_mt: 're_mt',
    asr_review: 'asr_review',
    covered: 'covered',
    other: 'other',
});

/**
 * @param {Record<string, number>} clusterCounts
 * @param {object[]} [allSamples] optional { cluster, ji, src, dst, after }[]
 */
function buildWorkOrders(clusterCounts = {}, allSamples = []) {
    const orders = [];
    const counts = clusterCounts || {};
    const byCluster = new Map();
    for (const s of allSamples || []) {
        const k = String(s.cluster || (s.issues && s.issues[0]) || '');
        if (!k) continue;
        if (!byCluster.has(k)) byCluster.set(k, []);
        const arr = byCluster.get(k);
        if (arr.length < 3) arr.push(s);
    }

    function push(id, kind, label, count, reason, action, clusterKey) {
        if (!(count > 0)) return;
        orders.push({
            id,
            kind,
            label,
            count,
            reason,
            action,
            samples: (byCluster.get(clusterKey) || []).map((s) => ({
                ji: s.ji,
                src: s.src,
                dst: s.dst,
                after: s.after,
            })),
        });
    }

    push(
        'align_gap',
        WORK_ORDER_KIND.re_align,
        '宜重对齐 / 重跑智能翻译',
        counts.align_gap || 0,
        '对齐空洞会计入「待修」，但不能学成清洗 remap',
        '检查分块错位或条数差；必要时减小翻译窗 / 重跑智能翻译',
        'align_gap',
    );
    push(
        'align_suspect',
        WORK_ORDER_KIND.re_align,
        '宜检查对齐',
        counts.align_suspect || 0,
        '可疑对齐，不适合直接写全局短规则',
        '人工核对时间轴后再决定是否重跑',
        'align_suspect',
    );
    push(
        'moan_expand',
        WORK_ORDER_KIND.other,
        '呻吟展开（次要）',
        counts.moan_expand || 0,
        '次要展示类问题，通常不必入库',
        '可忽略；若影响阅读再考虑润色策略',
        'moan_expand',
    );

    let fixedN = 0;
    for (const [k, n] of Object.entries(counts)) {
        if (String(k).startsWith('fixed:')) fixedN += Number(n) || 0;
    }
    if (fixedN > 0) {
        orders.push({
            id: 'already_fixed',
            kind: WORK_ORDER_KIND.covered,
            label: '现有规则已覆盖',
            count: fixedN,
            reason: '本片部分问题已被当前清洗修好（对照训练里也算「有结论」）',
            action: '无需再写同类 remap；可扫下一片或巩固对立意图夹具',
            samples: [],
        });
    }

    return orders;
}

/**
 * ASR draft rows from hits (route=asr or asr_garbage).
 * Human must fill `to` before write — never invent JA corrections blindly.
 * @param {object[]} hits
 * @param {{ max?: number }} [opts]
 */
function buildAsrDrafts(hits = [], opts = {}) {
    const max = Math.min(24, Math.max(1, Number(opts.max) || 12));
    const out = [];
    const seen = new Set();
    for (const h of hits) {
        if (out.length >= max) break;
        const issues = Array.isArray(h.issues) ? h.issues : [];
        const routed = trainRoute.classifyTrainRoute(h);
        const isAsr = routed.route === trainRoute.ROUTE.asr
            || issues.includes('asr_garbage')
            || h.cluster === 'asr_garbage';
        if (!isAsr) continue;
        const from = String(h.src || '').trim();
        if (!from || from.length < 2) continue;
        // Prefer a short reusable JA fragment
        let frag = from;
        if (frag.length > 18) {
            const parts = frag.split(/[、。．.…・！？!?\s　]+/).map((x) => x.trim()).filter((x) => x.length >= 2);
            frag = (parts.sort((a, b) => a.length - b.length)[0] || frag.slice(0, 14));
        }
        const key = frag;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            id: `asr-${h.ji}-${out.length}`,
            ji: h.ji,
            title: h.title || '',
            from: frag,
            to: '',
            fullJa: from,
            dst: h.dst || '',
            after: h.after || '',
            reason: routed.reason || '疑似听写错误，优先改 JA（ASR 域）而非中文 remap',
            route: trainRoute.ROUTE.asr,
            accepted: false,
            needsTo: true,
        });
    }
    return out.map((d) => asrSuggest.enrichAsrDraft(d));
}

/**
 * Under_stub / re_mt rows that stayed needs_expect → work-order samples.
 * @param {object[]} proposals
 */
function buildReMtWorkOrders(proposals = []) {
    const rows = (proposals || []).filter((p) => (
        p.status === 'needs_expect'
        && (p.route === trainRoute.ROUTE.re_mt || p.issue === 'under_stub')
    ));
    if (!rows.length) return null;
    return {
        id: 're_mt_stub',
        kind: WORK_ORDER_KIND.re_mt,
        label: '宜重译或手填期望',
        count: rows.length,
        reason: '短译欠译：内置启发式无法安全补全，整句入库会被拒绝',
        action: '重跑智能翻译该段，或在「改中文」需收窄里手填短期望后再测',
        samples: rows.slice(0, 5).map((p) => ({
            ji: p.ji,
            src: p.src,
            dst: p.dst,
            after: p.after,
        })),
    };
}

/**
 * @param {{
 *   clusterCounts?: Record<string, number>,
 *   allSamples?: object[],
 *   hits?: object[],
 *   proposals?: object[],
 *   wizardReport?: object,
 *   wizardMode?: boolean,
 * }} input
 */
function buildHarvestReport(input = {}) {
    const wizardReport = input.wizardReport
        || autoQuality.buildWizardReport(input.proposals || [], { wizardMode: input.wizardMode !== false });
    const workOrders = buildWorkOrders(input.clusterCounts || {}, input.allSamples || []);
    const reMt = buildReMtWorkOrders(input.proposals || []);
    if (reMt) workOrders.push(reMt);

    const asrDrafts = buildAsrDrafts(input.hits || input.allSamples || [], { max: 12 });

    const zhReady = wizardReport.adoptCount || 0;
    const zhReview = wizardReport.reviewCount || 0;
    const asrN = asrDrafts.length;
    const orderN = workOrders.length;
    const orderCueN = workOrders.reduce((n, o) => n + (Number(o.count) || 0), 0);

    const fruitful = zhReady > 0 || zhReview > 0 || asrN > 0 || orderN > 0;
    const parts = [];
    if (zhReady) parts.push(`${zhReady} 条可立刻改中文`);
    if (zhReview) parts.push(`${zhReview} 条需微调`);
    if (asrN) parts.push(`${asrN} 条听写建议`);
    if (orderN) parts.push(`${orderN} 类对照结论（${orderCueN} 条）`);
    const headline = fruitful
        ? `学完了：${parts.join(' · ')}`
        : '这轮没有可入库改法，可换一对字幕再试';

    return {
        fruitful,
        headline,
        summary: {
            zhRemapReady: zhReady,
            zhRemapReview: zhReview,
            zhRemapSkip: wizardReport.skipCount || 0,
            asrDraft: asrN,
            workOrder: orderN,
            workOrderCues: orderCueN,
        },
        zhRemap: wizardReport,
        asrDrafts,
        workOrders,
    };
}

module.exports = {
    WORK_ORDER_KIND,
    buildWorkOrders,
    buildAsrDrafts,
    buildReMtWorkOrders,
    buildHarvestReport,
};
