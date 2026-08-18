'use strict';

/**
 * Build a paste-ready brief for the「智能翻译对照训练」agent chat.
 * Wizard harvest → human/agent multilayer fixes (opaque / ASR / prompt / re-run).
 */

const LAYER_HINT = Object.freeze({
    re_align: '重跑智能翻译 / 查分块对齐（通常不写 remap）',
    re_mt: '重跑该段翻译，或对照后写 opaque/语义规则（禁整句 remap）',
    asr_review: 'JA ASR 域对（opaque 成人 ASR 或 ja-asr-domain-fixes）',
    covered: '现有规则已覆盖 — 可补对立意图夹具 / 冒烟，勿再堆同类 remap',
    other: '次要 — 按需处理',
    zh_remap: '短 zhFrom→zhTo + 日文锚点（mt-trained-remaps / sanitize）',
    asr: '听写 JA from→to（ASR 域，勿当中文 remap）',
});

function clip(s, max = 80) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
}

function sampleLines(samples = [], limit = 3) {
    return (samples || []).slice(0, limit).map((s) => {
        const ji = s.ji != null ? `#${s.ji}` : '#?';
        const ja = clip(s.src, 72);
        const zh = clip(s.after || s.dst, 72);
        return `  - ${ji} JA「${ja}」 / ZH「${zh}」`;
    });
}

/**
 * @param {{
 *   title?: string,
 *   jaPath?: string,
 *   zhPath?: string,
 *   harvest?: object,
 *   scanSummary?: object,
 *   tips?: string[],
 * }} input
 * @returns {{ ok: boolean, markdown: string, plain: string, meta: object }}
 */
function buildFeedPack(input = {}) {
    const harvest = input.harvest || {};
    const summary = harvest.summary || {};
    const title = String(input.title || '').trim() || '（未命名）';
    const jaPath = String(input.jaPath || '').trim();
    const zhPath = String(input.zhPath || '').trim();
    const scan = input.scanSummary || {};
    const tips = Array.isArray(input.tips) ? input.tips.filter(Boolean) : [];

    const lines = [];
    lines.push('# 智能翻译对照训练 · 投喂包');
    lines.push('');
    lines.push('请按本 brief 对照日中字幕，做**可复用**优化（opaque / ASR / prompt / sanitize / 夹具）。');
    lines.push('禁止单片门控；短片段优先；strip↔remap 对立需双侧夹具。写完跑全量 `tests/mt-sanitize.test.js`，涉及 D01/ASR 再 `encode:tdp`。');
    lines.push('');
    lines.push('## 片子');
    lines.push(`- 标题：${title}`);
    if (jaPath) lines.push(`- JA：\`${jaPath}\``);
    if (zhPath) lines.push(`- ZH：\`${zhPath}\``);
    if (scan.aligned != null || scan.liveHitCount != null) {
        lines.push(
            `- 扫描：对齐 ${scan.aligned ?? '—'} · 待修 ${scan.liveHitCount ?? '—'}`
            + (scan.alignGapCount != null ? ` · 空洞 ${scan.alignGapCount}` : '')
            + (scan.trainableHitCount != null ? ` · 可学热点 ${scan.trainableHitCount}` : ''),
        );
    }
    if (harvest.headline) lines.push(`- 向导结论：${harvest.headline}`);
    lines.push('');

    lines.push('## 建议落点（按优先级）');
    const orders = Array.isArray(harvest.workOrders) ? harvest.workOrders : [];
    const asrDrafts = Array.isArray(harvest.asrDrafts) ? harvest.asrDrafts : [];
    const zhAdopt = harvest.zhRemap?.adopt || [];
    const zhReview = harvest.zhRemap?.review || [];

    let step = 1;
    for (const o of orders) {
        const layer = LAYER_HINT[o.kind] || LAYER_HINT.other;
        lines.push(`### ${step}. 工单 · ${o.label || o.id} ×${o.count || 0}`);
        step += 1;
        lines.push(`- 建议层：${layer}`);
        if (o.reason) lines.push(`- 原因：${o.reason}`);
        if (o.action) lines.push(`- 动作：${o.action}`);
        const samples = sampleLines(o.samples);
        if (samples.length) {
            lines.push('- 样例：');
            lines.push(...samples);
        }
        lines.push('');
    }

    if (asrDrafts.length) {
        lines.push(`### ${step}. 听写草案 ×${asrDrafts.length}`);
        step += 1;
        lines.push(`- 建议层：${LAYER_HINT.asr}`);
        lines.push('- 填好正确日文 `to` 后可写入 ASR 域；或在对照训练里并入 opaque 成人 ASR / D01。');
        for (const d of asrDrafts.slice(0, 8)) {
            lines.push(`  - #${d.ji ?? '?'} from「${clip(d.from, 40)}」→ to「${clip(d.to, 40) || '（待填）'}」`);
            if (d.fullJa && d.fullJa !== d.from) lines.push(`    全文 JA：${clip(d.fullJa, 64)}`);
        }
        lines.push('');
    }

    if (zhAdopt.length || zhReview.length) {
        lines.push(`### ${step}. 改中文 remap（向导已抽）`);
        step += 1;
        lines.push(`- 建议层：${LAYER_HINT.zh_remap}`);
        lines.push(`- 可写 ${zhAdopt.length} · 需收窄 ${zhReview.length}（可在向导内测后写入；对照训练侧重对立意图与夹具）`);
        for (const p of [...zhAdopt, ...zhReview].slice(0, 6)) {
            const pay = p.payload || {};
            const frag = pay.mode === 'blank'
                ? `blank「${clip(pay.zhFrom, 24)}」`
                : `「${clip(pay.zhFrom, 24)}」→「${clip(pay.zhTo, 24)}」`;
            lines.push(`  - #${p.ji ?? '?'} ${p.issue || ''} ${frag} · 锚「${clip(pay.jaAnchor, 20)}」`);
        }
        lines.push('');
    }

    if (!orders.length && !asrDrafts.length && !zhAdopt.length && !zhReview.length) {
        lines.push('（本轮向导未给出工单 / ASR / remap — 仍请通读片子找系统性模式。）');
        lines.push('');
    }

    if (tips.length) {
        lines.push('## 向导提示');
        for (const t of tips.slice(0, 8)) lines.push(`- ${t}`);
        lines.push('');
    }

    lines.push('## 回传检查清单');
    lines.push('- [ ] 规则跨片名可复用（番号仅作 smoke / provenance）');
    lines.push('- [ ] strip↔remap 同 ZH 表面已声明 `pairedWith` + fixture');
    lines.push('- [ ] 全量 `tests/mt-sanitize.test.js`');
    lines.push('- [ ] 若改 ASR/D01：`tests/tdp-pack.test.js` + `npm run encode:tdp`');
    lines.push('- [ ] `npm run report:mt-conflicts`');
    lines.push('');

    const markdown = lines.join('\n');
    return {
        ok: true,
        markdown,
        plain: markdown,
        meta: {
            title,
            jaPath,
            zhPath,
            workOrder: summary.workOrder || orders.length,
            asrDraft: summary.asrDraft || asrDrafts.length,
            zhRemapReady: summary.zhRemapReady || zhAdopt.length,
            zhRemapReview: summary.zhRemapReview || zhReview.length,
            generatedAt: new Date().toISOString(),
        },
    };
}

module.exports = {
    LAYER_HINT,
    buildFeedPack,
};
