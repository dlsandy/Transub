'use strict';

/**
 * Auto-propose sanitize training rules from scan hits.
 * Human must confirm before apply — never writes by itself.
 */
const train = require('./train');
const autoQuality = require('./auto-quality');

const HOT = new Set([
    'prompt_leak', 'iku_shoot', 'dechau_out', 'yame_shoot', 'iku_xing',
    'kiniri', 'kimochi_stub', 'clinical_rod', 'invent_rod', 'sfx_halluc', 'latin',
    'heixiu', 'under_stub', 'ja_echo',
]);

const SKIP_ISSUES = new Set(['align_suspect', 'align_gap', 'moan_expand', 'other', 'asr_garbage']);

function primaryHotIssue(hit) {
    const issues = Array.isArray(hit?.issues) ? hit.issues : [];
    return issues.find((i) => HOT.has(i)) || '';
}

function shouldSkipHit(hit) {
    const src = String(hit?.src || '').trim();
    const dst = String(hit?.dst || '').trim();
    const issues = Array.isArray(hit?.issues) ? hit.issues : [];
    if (!issues.length) return '无问题标签';
    if (issues.every((i) => String(i).startsWith('fixed:'))) return '已修好样例';
    if (issues.some((i) => SKIP_ISSUES.has(i)) && !issues.some((i) => HOT.has(i))) {
        return '次要/对齐问题';
    }
    try {
        const lex = require('../../../src/js/mt-sanitize-lexicon');
        if (lex.isAsrGarbageJa?.(src)) return 'ASR糊片，跳过训练';
        // Hot issues (iku_shoot / invent_rod / …) still need training even when
        // the ZH surface "covers" JA anchors — e.g. 要去了 vs 要射了.
        if (
            lex.isZhSufficientForJa?.(src, String(hit?.after || dst), hit?.flags || [])
            && !issues.some((i) => HOT.has(i))
        ) {
            return 'ZH已充分覆盖锚点';
        }
    } catch (_) { /* ignore */ }
    if (src.length <= 2 || /^[&＋+\-—…·.。,，、\s]+$/u.test(src)) {
        return '日文锚点过短或残片';
    }
    if (src.length <= 4 && dst.length >= 10) return '疑似对齐错误';
    if (!primaryHotIssue(hit) && !hit.expect) return '非高热度问题且无期望';
    return '';
}

/**
 * Heuristic expect when no model/human expect is provided.
 * @returns {{ expect: string, mode: 'replace'|'blank', reason: string }|null}
 */
function heuristicExpect(hit) {
    const issue = primaryHotIssue(hit);
    const dirty = String(hit.after || hit.dst || '');
    if (!issue || !dirty) return null;

    if (issue === 'prompt_leak' || issue === 'sfx_halluc' || issue === 'latin' || issue === 'heixiu') {
        return { expect: '…', mode: 'blank', reason: `${issue} → 清空弱化` };
    }
    if (issue === 'iku_shoot') {
        // NSFW口径：升格「射了」；勿动「失去了/过去了」等非高潮复合词
        const ja = String(hit.src || '');
        const climaxJa = /イッ|イキ|イク|いく|いっちゃ|射精/.test(ja);
        let next = dirty
            .replace(/射精了/g, '射了')
            .replace(/射精/g, '射了')
            .replace(/要去了/g, '要射了')
            .replace(/快去了/g, '快射了')
            .replace(/又去了/g, '又射了')
            .replace(/已经去了/g, '已经射了')
            .replace(/想去/g, '想射');
        if (climaxJa) {
            next = next.replace(/(?<![失过死进出来回带拿离散褪消辞夺忘除抹])去了/g, '射了');
        }
        next = next.replace(/失射了/g, '失去了').replace(/过射了/g, '过去了');
        if (next === dirty) return null;
        return { expect: next, mode: 'replace', reason: 'iku_shoot：去了/射精→射了（启发式）' };
    }

    if (issue === 'dechau_out') {
        let next = dirty
            .replace(/又要出来了/g, '又要射了')
            .replace(/要出来了/g, '要射了')
            .replace(/出来了/g, '射了');
        if (next === dirty) return null;
        return { expect: next, mode: 'replace', reason: 'dechau_out：出来→射（启发式）' };
    }
    if (issue === 'yame_shoot') {
        let next = dirty
            .replace(/不要射了/g, '不要了')
            .replace(/别射了/g, '别这样')
            .replace(/要射了/g, '停下')
            .replace(/射了/g, '停下')
            .replace(/射出来/g, '停下');
        if (next === dirty) return null;
        return { expect: next, mode: 'replace', reason: 'yame_shoot：误射→停下（启发式）' };
    }
    if (issue === 'iku_xing') {
        let next = dirty.replace(/行了/g, '要射了');
        if (next === dirty) return null;
        return { expect: next, mode: 'replace', reason: 'iku_xing：行了→要射了' };
    }
    if (issue === 'kiniri') {
        let next = dirty.replace(/进去了/g, '喜欢上了').replace(/进入了/g, '喜欢上了');
        if (next === dirty) return null;
        return { expect: next, mode: 'replace', reason: 'kiniri：进去→喜欢上了' };
    }
    if (issue === 'kimochi_stub') {
        return { expect: '好舒服', mode: 'replace', reason: 'kimochi_stub：补全「舒服」' };
    }
    if (issue === 'clinical_rod' || issue === 'invent_rod') {
        const ja = String(hit.src || '');
        // Anatomy gender/part flip before generic clinical→肉棒
        if (/クリトリス|クリ[もがをはっ]/.test(ja) && /阴茎/.test(dirty)) {
            return {
                expect: dirty.replace(/阴茎/g, '阴蒂'),
                mode: 'replace',
                reason: `${issue}：クリ误译阴茎→阴蒂`,
            };
        }
        if (/(?:お)?まんこ|マンコ/.test(ja) && /阴茎/.test(dirty) && !/おちん|ちんぽ|チ○|ち○/.test(ja)) {
            return {
                expect: dirty.replace(/阴茎/g, '小穴'),
                mode: 'replace',
                reason: `${issue}：まんこ误译阴茎→小穴`,
            };
        }
        if (/亀頭/.test(ja) && /阴茎/.test(dirty)) {
            return {
                expect: dirty.replace(/阴茎/g, '龟头'),
                mode: 'replace',
                reason: `${issue}：亀頭误译阴茎→龟头`,
            };
        }
        // NSFW domain: clinical invent → 肉棒 (not euphemism)
        let next = dirty
            .replace(/阴茎/g, '肉棒')
            .replace(/生殖器/g, '肉棒')
            .replace(/性器官/g, '肉棒')
            .replace(/小鸡鸡/g, '肉棒')
            .replace(/那东西/g, '肉棒');
        if (next === dirty) return null;
        return { expect: next, mode: 'replace', reason: `${issue}：临床词→肉棒` };
    }

    if (issue === 'ja_echo') {
        return { expect: '…', mode: 'blank', reason: 'ja_echo：日文残留→清空' };
    }
    if (issue === 'under_stub') {
        return null; // needs model / human
    }
    return null;
}

function buildProposalPayload(hit, { title, expect, mode, pinFinal, zhFrom, zhTo, jaAnchor } = {}) {
    const issue = primaryHotIssue(hit);
    const dirty = String(hit.dst || hit.after || '');
    const ja = String(hit.src || '');
    const resolvedMode = mode === 'blank' ? 'blank' : 'replace';
    const expectText = resolvedMode === 'blank' ? '…' : String(expect || '').trim();
    let frag = null;
    if (resolvedMode === 'replace') {
        frag = train.forceShortestFragment({
            dirty,
            expect: expectText,
            zhFrom,
            zhTo,
        });
    }
    const anchor = String(jaAnchor || '').trim()
        || train.narrowJaAnchor(ja, { maxLen: 14 })
        || ja;
    const narrowed = train.narrowJaAnchor(anchor, { maxLen: 14 }) || anchor;
    const longAnchor = train.isLowReuseAnchor(narrowed, ja);

    return {
        kind: 'zh',
        mode: resolvedMode,
        title: title || hit.title || '',
        note: (hit.issues || []).join(',') || issue,
        ja,
        zh: dirty,
        expect: expectText,
        zhFrom: frag?.zhFrom || (resolvedMode === 'blank' ? (hit.after || dirty) : ''),
        zhTo: resolvedMode === 'blank' ? '' : (frag ? frag.zhTo : expectText),
        jaAnchor: narrowed,
        pinFinal: pinFinal !== false,
        contentProfile: 'av_soft',
        asrHint: Boolean(hit.asr),
        issue,
        ji: hit.ji,
        wholeSentence: Boolean(frag?.wholeSentence),
        expandStub: Boolean(frag?.expandStub),
        unusable: Boolean(frag?.unusable),
        fragSource: frag?.source || '',
        longAnchor,
    };
}

function proposalRuleKey(payload) {
    if (!payload) return '';
    const mode = payload.mode === 'blank' ? 'blank' : 'replace';
    const ja = String(payload.jaAnchor || (payload.jaIncludes || [])[0] || payload.ja || '');
    const from = String(payload.zhFrom || '');
    const to = mode === 'blank' ? '' : String(payload.zhTo || payload.expect || '');
    return `${mode}\u0001${ja}\u0001${from}\u0001${to}`;
}

function listExistingRuleKeys() {
    const keys = new Set();
    try {
        const listed = train.listRules();
        for (const r of listed.zhRemaps || []) {
            if (r.enabled === false) continue;
            keys.add(proposalRuleKey({
                mode: r.mode,
                jaAnchor: (r.jaIncludes || [])[0] || '',
                zhFrom: r.zhFrom,
                zhTo: r.zhTo,
            }));
        }
    } catch (_) { /* ignore */ }
    return keys;
}

/**
 * @param {object} sanitize
 * @param {object[]} hits
 * @param {{ title?: string, max?: number, expects?: Record<string,string>|Array, pinFinal?: boolean }} opts
 */
function proposeFromHits(sanitize, hits, opts = {}) {
    const max = Math.min(40, Math.max(1, Number(opts.max) || 12));
    const title = opts.title || '';
    /** @type {Map<string, { expect: string, mode?: string, zhFrom?: string, zhTo?: string, jaAnchor?: string }>} */
    const expectMap = new Map();
    if (Array.isArray(opts.expects)) {
        for (const row of opts.expects) {
            if (row && row.ji != null && (row.expect != null || row.zhFrom != null || row.mode === 'blank')) {
                expectMap.set(String(row.ji), {
                    expect: row.expect != null ? String(row.expect) : '',
                    mode: row.mode,
                    zhFrom: row.zhFrom,
                    zhTo: row.zhTo,
                    jaAnchor: row.jaAnchor,
                });
            }
        }
    } else if (opts.expects && typeof opts.expects === 'object') {
        for (const [k, v] of Object.entries(opts.expects)) {
            expectMap.set(String(k), { expect: String(v) });
        }
    }

    const existingKeys = listExistingRuleKeys();
    const ranked = (Array.isArray(hits) ? hits : [])
        .map((h, idx) => ({ h, idx, hot: primaryHotIssue(h) }))
        .filter((x) => x.hot || expectMap.has(String(x.h.ji)) || shouldSkipHit(x.h))
        .sort((a, b) => {
            const ra = a.hot ? 0 : (expectMap.has(String(a.h.ji)) ? 1 : 2);
            const rb = b.hot ? 0 : (expectMap.has(String(b.h.ji)) ? 1 : 2);
            if (ra !== rb) return ra - rb;
            return a.idx - b.idx;
        });

    const proposals = [];
    let skipped = 0;
    const maxSkipShown = Math.min(8, max);
    const seenKeys = new Map(); // ruleKey -> proposal index

    for (const { h } of ranked) {
        const actionableCount = proposals.filter((p) => !['skipped', 'duplicate', 'exists'].includes(p.status)).length;
        if (actionableCount >= max) break;
        const skip = shouldSkipHit(h);
        if (skip && !expectMap.has(String(h.ji))) {
            skipped += 1;
            if (proposals.filter((p) => p.status === 'skipped').length < maxSkipShown) {
                proposals.push({
                    status: 'skipped',
                    reason: skip,
                    ji: h.ji,
                    src: h.src,
                    dst: h.dst,
                    after: h.after,
                    issues: h.issues || [],
                });
            }
            continue;
        }
        if (skip) {
            if (/锚点过短|对齐|残片/.test(skip)) {
                skipped += 1;
                proposals.push({
                    status: 'skipped',
                    reason: skip,
                    ji: h.ji,
                    src: h.src,
                    issues: h.issues || [],
                });
                continue;
            }
        }

        const providedRow = expectMap.get(String(h.ji));
        let mode = 'replace';
        let expect = providedRow?.expect || '';
        let source = providedRow ? 'model_or_user' : '';
        let reason = providedRow ? '使用模型/用户期望' : '';
        let zhFromOverride = providedRow?.zhFrom;
        let zhToOverride = providedRow?.zhTo;
        let jaAnchorOverride = providedRow?.jaAnchor;

        // Prefer domain heuristic blank/local over free-form whole-sentence model output
        // for leak-like issues when model did not explicitly request blank.
        const hot = primaryHotIssue(h);
        if (providedRow && ['prompt_leak', 'sfx_halluc', 'latin', 'heixiu', 'ja_echo'].includes(hot)
            && providedRow.mode !== 'blank'
            && expect !== '…' && expect !== '...') {
            const heurBlank = heuristicExpect(h);
            if (heurBlank?.mode === 'blank') {
                expect = heurBlank.expect;
                mode = 'blank';
                source = 'heuristic_override';
                reason = `${heurBlank.reason}（覆盖整句翻译）`;
                zhFromOverride = undefined;
                zhToOverride = undefined;
            }
        }

        if (!expect && !zhFromOverride) {
            const heur = heuristicExpect(h);
            if (!heur) {
                skipped += 1;
                proposals.push({
                    status: 'needs_expect',
                    reason: '启发式无法生成期望（可用模型抽片段）',
                    ji: h.ji,
                    src: h.src,
                    dst: h.dst,
                    after: h.after,
                    issues: h.issues || [],
                    issue: primaryHotIssue(h),
                });
                continue;
            }
            expect = heur.expect;
            mode = heur.mode;
            source = 'heuristic';
            reason = heur.reason;
        } else if (providedRow?.mode === 'blank' || expect === '…' || expect === '...') {
            mode = 'blank';
            expect = '…';
        } else if (zhFromOverride && !expect) {
            // Fragment-only model output: synthesize expect for try-run
            const dirty = String(h.dst || h.after || '');
            const to = String(zhToOverride || '');
            expect = dirty.split(String(zhFromOverride)).join(to);
            mode = 'replace';
            reason = reason || '使用模型局部片段';
        }

        let pinFinal = opts.pinFinal !== false;
        let payload = buildProposalPayload(h, {
            title,
            expect,
            mode,
            pinFinal,
            zhFrom: zhFromOverride,
            zhTo: zhToOverride,
            jaAnchor: jaAnchorOverride,
        });
        if (payload.mode === 'replace' && (payload.unusable || !payload.zhFrom)) {
            skipped += 1;
            proposals.push({
                status: 'skipped',
                reason: payload.unusable
                    ? '无法抽出短片段（整句润色已排除）'
                    : '缺少可替换短片段',
                ji: h.ji,
                src: h.src,
                dst: h.dst,
                after: h.after,
                issues: h.issues || [],
                issue: payload.issue,
                payload,
                source,
                accepted: false,
            });
            continue;
        }
        const quality = train.assessRuleQuality(payload);
        let trial = null;
        try {
            trial = train.tryWithCandidate(sanitize, payload);
            // If mid-pipeline was right but later stages undid it, retry with pinFinal
            if (!trial.matchesExpect && trial.undoneBy && !payload.pinFinal) {
                pinFinal = true;
                payload = buildProposalPayload(h, {
                    title,
                    expect,
                    mode,
                    pinFinal: true,
                    zhFrom: zhFromOverride,
                    zhTo: zhToOverride,
                    jaAnchor: jaAnchorOverride,
                });
                trial = train.tryWithCandidate(sanitize, payload);
                reason = `${reason} · 已自动开启防润色`;
            }
        } catch (err) {
            proposals.push({
                status: 'error',
                reason: err.message || String(err),
                ji: h.ji,
                payload,
                source,
            });
            continue;
        }

        const ruleKey = proposalRuleKey(payload);
        if (existingKeys.has(ruleKey)) {
            skipped += 1;
            proposals.push({
                status: 'exists',
                reason: '相同规则已在已学规则中（已跳过）',
                ji: h.ji,
                src: h.src,
                dst: h.dst,
                after: h.after,
                issues: h.issues || [],
                issue: payload.issue,
                payload,
                source,
                accepted: false,
            });
            continue;
        }
        if (seenKeys.has(ruleKey)) {
            const prevIdx = seenKeys.get(ruleKey);
            const prev = proposals[prevIdx];
            skipped += 1;
            proposals.push({
                status: 'duplicate',
                reason: `与 #${prev?.ji ?? '?'} 规则重复，已合并勾选`,
                ji: h.ji,
                src: h.src,
                issue: payload.issue,
                dupOf: prev?.ji,
                accepted: false,
            });
            continue;
        }

        const blocking = (quality.warnings || []).some((w) => /宽泛|过短|残片/.test(w));
        const status = trial.matchesExpect
            ? (blocking || payload.wholeSentence ? 'review' : 'ready')
            : 'failed';

        const item = {
            status,
            reason,
            source,
            ji: h.ji,
            src: h.src,
            dst: h.dst,
            after: h.after,
            issues: h.issues || [],
            issue: payload.issue,
            payload,
            ruleKey,
            trial: {
                matchesExpect: trial.matchesExpect,
                final: trial.final,
                warnings: trial.warnings || [],
                tips: trial.tips || [],
                undoneBy: trial.undoneBy || null,
                suggestion: trial.suggestion || quality.suggestion || null,
            },
            quality,
            accepted: status === 'ready',
        };
        seenKeys.set(ruleKey, proposals.length);
        proposals.push(item);
    }

    const corpus = autoQuality.buildCorpusFromHits([
        ...(Array.isArray(hits) ? hits : []),
        ...(Array.isArray(opts.corpus) ? opts.corpus : []),
    ]);
    const finalized = autoQuality.finalizeProposals(proposals, { corpus });
    const next = finalized.proposals;

    const ready = next.filter((p) => p.confidence?.level === 'auto' || p.status === 'ready').length;
    const review = next.filter((p) => p.confidence?.level === 'review' || p.status === 'review').length;
    const failed = next.filter((p) => p.status === 'failed').length;
    const needs = next.filter((p) => p.status === 'needs_expect').length;
    const dupes = next.filter((p) => p.status === 'duplicate' || p.status === 'exists').length;

    return {
        ok: true,
        count: next.length,
        ready,
        review,
        failed,
        needsExpect: needs,
        skipped,
        duplicates: dupes,
        mergeCount: finalized.mergeCount || 0,
        confidence: finalized.confidence || null,
        proposals: next,
        hint: '只写入跨片名可复用片段。整句润色与单片特化已排除；「需收窄」请改短 zhFrom 或锚点后再写。',
    };
}

/**
 * Apply accepted proposals (human-confirmed).
 * @param {object[]} proposals
 * @param {{ onlyReady?: boolean }} opts
 */
function applyProposals(proposals, opts = {}) {
    const onlyReady = opts.onlyReady !== false;
    const applied = [];
    const rejected = [];
    for (const p of Array.isArray(proposals) ? proposals : []) {
        if (!p || !p.payload) {
            rejected.push({ ji: p?.ji, reason: '无候选载荷' });
            continue;
        }
        if (!p.accepted) {
            rejected.push({ ji: p.ji, reason: '未勾选确认' });
            continue;
        }
        if (onlyReady && p.status !== 'ready' && p.status !== 'review') {
            rejected.push({ ji: p.ji, reason: `状态不可写入：${p.status}` });
            continue;
        }
        if (p.status === 'review' && !p.force) {
            rejected.push({ ji: p.ji, reason: '需人工复核（勾选并标记「仍要写入」）' });
            continue;
        }
        if (p.confidence?.level === 'reject' && !p.force) {
            rejected.push({ ji: p.ji, reason: '置信度为「别写」，未强制' });
            continue;
        }
        if (p.trial && p.trial.matchesExpect === false) {
            rejected.push({ ji: p.ji, reason: '试跑未命中期望' });
            continue;
        }
        try {
            const body = p.payload;
            let rule;
            if (body.kind === 'asr') {
                rule = train.addAsrPair(body);
            } else {
                const mode = body.mode === 'blank' ? 'blank' : 'replace';
                let zhFrom = body.zhFrom;
                let zhTo = body.zhTo;
                if (mode === 'replace' && !zhFrom && body.zh != null && body.expect != null) {
                    const sug = train.suggestLocalReplace(body.zh, body.expect);
                    if (sug) {
                        zhFrom = sug.zhFrom;
                        zhTo = sug.zhTo;
                    }
                }
                const jaAnchor = body.jaAnchor || body.ja || '';
                rule = train.addZhRemap({
                    title: body.title,
                    note: body.note,
                    mode,
                    pinFinal: body.pinFinal !== false,
                    jaIncludes: body.jaIncludes || (jaAnchor ? [train.suggestJaAnchor(jaAnchor) || jaAnchor] : []),
                    zhFrom: zhFrom || '',
                    zhTo: mode === 'blank' ? '' : (zhTo || ''),
                });
            }
            applied.push({ ji: p.ji, rule });
        } catch (err) {
            rejected.push({ ji: p.ji, reason: err.message || String(err) });
        }
    }
    return {
        ok: true,
        applied: applied.length,
        rejected: rejected.length,
        rules: applied,
        rejectedItems: rejected,
    };
}

module.exports = {
    HOT,
    primaryHotIssue,
    shouldSkipHit,
    heuristicExpect,
    buildProposalPayload,
    proposalRuleKey,
    proposeFromHits,
    applyProposals,
    autoQuality,
};
