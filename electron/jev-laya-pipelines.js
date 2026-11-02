/**
 * Async Laya pipeline runners for Pro wedges (soft-fail everywhere).
 */
const jevCore = require('../src/js/jev-decision-core');
const pipe = require('../src/js/jev-laya-pipeline-core');
const { prepareJevDecideReady, decideChoiceChunks, invokeSystemOneWithSplitRetry } = require('./jev-decide');

async function runAcceptRevertGate(candidates, options = {}, {
    task = 'accept_revert',
    buildRequest,
    partition = pipe.partitionAcceptRevert,
    onLog,
    logLabel = 'Laya',
} = {}) {
    const empty = {
        accept: [],
        reject: [],
        undecided: candidates || [],
        decided: 0,
        skipped: true,
    };
    if (!candidates?.length) return empty;
    const auth = await prepareJevDecideReady(options, { onLog });
    if (!auth.ok) return empty;
    const builder = typeof buildRequest === 'function'
        ? buildRequest
        : (chunk) => pipe.buildAcceptRevertRequest(task, chunk);
    const decided = await decideChoiceChunks({
        auth,
        items: candidates,
        buildRequest: builder,
        partition: (answers, chunk, minConfidence) => partition(answers, chunk, minConfidence),
        signal: options.signal,
        timeoutMs: options.jevTimeoutMs || 30000,
    });
    if (decided.decided && onLog) {
        onLog(`${logLabel}：采纳 ${decided.accept?.length || 0} / 回退 ${decided.reject?.length || 0}`);
    }
    return decided;
}

async function runKeepSwapGate(candidates, options = {}, { onLog } = {}) {
    return runAcceptRevertGate(candidates, options, {
        buildRequest: (chunk) => pipe.buildKeepSwapRequest(chunk),
        partition: pipe.partitionKeepSwap,
        onLog,
        logLabel: 'Laya Hy-MT',
    });
}

async function runSemanticApplyGate(candidates, options = {}, { onLog } = {}) {
    return runAcceptRevertGate(candidates, options, {
        buildRequest: (chunk) => pipe.buildSemanticApplyRequest(chunk),
        partition: pipe.partitionAcceptRevert,
        onLog,
        logLabel: 'Laya 语义采纳',
    });
}

/**
 * Score-rank a list of cue candidates; returns Map id→score (partial).
 */
async function runScoreRank(candidates, options = {}, {
    task = 'score_rank',
    instructionsLead,
    signal,
} = {}) {
    const out = new Map();
    if (!candidates?.length) return out;
    const auth = await prepareJevDecideReady(options);
    if (!auth.ok) return out;
    const { invokeSystemOne } = require('./jev-client');
    // Nano Hub is flaky at full 32 Score questions; 16 keeps expected ranking + fewer unreachable.
    const chunks = jevCore.chunkPairsForSystemOne(candidates, 16);
    for (const chunk of chunks) {
        if (signal?.aborted || options.signal?.aborted) break;
        const built = pipe.buildScoreRankRequest(task, chunk, { instructionsLead });
        if (!built.items?.length) continue;
        const res = await invokeSystemOneWithSplitRetry(invokeSystemOne, {
            apiKey: auth.apiKey || '',
            endpoint: auth.endpoint,
            model: auth.model,
            state: built.state,
            questions: built.questions,
            signal: signal || options.signal,
            timeoutMs: Math.min(45000, Number(options.jevTimeoutMs) || 30000),
        });
        if (!res?.ok || !res.answers) continue;
        const scores = pipe.pickScores(res.answers, built.items, auth.minConfidence);
        for (const [id, score] of scores.entries()) out.set(id, score);
    }
    return out;
}

async function runPreMtSoftHold(candidates, options = {}, { onLog } = {}) {
    const decided = await runAcceptRevertGate(candidates, options, {
        buildRequest: (chunk) => pipe.buildPreMtHoldRequest(chunk),
        partition: pipe.partitionPreMtHold,
        onLog,
        logLabel: 'Laya 译前hold',
    });
    // accept = hold, reject = allow_mt
    return {
        hold: decided.accept || [],
        allow: decided.reject || [],
        undecided: decided.undecided || [],
        decided: decided.decided || 0,
        skipped: !!decided.skipped,
    };
}

async function runFilmBriefTrust(payload, options = {}) {
    const auth = await prepareJevDecideReady(options);
    if (!auth.ok) return { trustHeuristic: null, skipped: true, reason: auth.reason };
    const built = pipe.buildFilmBriefTrustRequest(payload);
    const decided = await decideChoiceChunks({
        auth,
        items: built.items,
        buildRequest: () => built,
        partition: (answers, chunk, minConfidence) => (
            pipe.partitionFilmBriefTrust(answers, chunk, minConfidence)
        ),
        signal: options.signal,
        timeoutMs: 20000,
    });
    if (decided.accept?.length) return { trustHeuristic: true, skipped: false };
    if (decided.reject?.length) return { trustHeuristic: false, skipped: false };
    return { trustHeuristic: null, skipped: false, reason: 'undecided' };
}

/**
 * Soft-AV 好舒服×気持ち* underfill: hard-expand sync + Laya Choice soft-band.
 * @returns {{ cues, changed, decided, skipped?, hardExpand?, expand?, keep?, blank? }}
 */
async function runKimochiUnderfillGate(zhCues, jaCues = [], options = {}, { onLog } = {}) {
    const collected = pipe.collectKimochiUnderfillCandidates(zhCues, jaCues, options);
    let hardExpand = collected.hardExpand || [];
    let soft = collected.soft || [];
    const empty = {
        cues: Array.isArray(zhCues) ? zhCues : [],
        changed: 0,
        decided: 0,
        skipped: true,
        hardExpand,
        expand: [],
        keep: [],
        blank: [],
        undecided: soft,
    };
    if (!hardExpand.length && !soft.length) return empty;

    let expand = [];
    let keep = [];
    let blank = [];
    let undecided = soft;
    let decided = 0;
    let skipped = !soft.length;

    if (soft.length) {
        const auth = await prepareJevDecideReady(options, { onLog });
        if (!auth.ok) {
            skipped = true;
            undecided = soft;
        } else {
            const part = await decideChoiceChunks({
                auth,
                items: soft,
                buildRequest: (chunk) => pipe.buildKimochiUnderfillRequest(chunk),
                partition: (answers, chunk, minConfidence) => (
                    pipe.partitionKimochiUnderfill(answers, chunk, minConfidence)
                ),
                signal: options.signal,
                timeoutMs: options.jevTimeoutMs || 30000,
            });
            expand = part.expand || part.accept || [];
            keep = part.keep || part.reject || [];
            blank = part.blank || [];
            undecided = part.undecided || [];
            decided = Number(part.decided) || 0;
            skipped = false;
            if (decided && onLog) {
                onLog(
                    `Laya 気持ち欠译：扩 ${expand.length} / 留 ${keep.length} / 空白重试 ${blank.length}`,
                );
            }
        }
    }

    const applied = pipe.applyKimochiUnderfillDecisions(zhCues, {
        hardExpand,
        expand,
        blank,
    }, { blankText: options.blankText != null ? options.blankText : '…' });

    return {
        cues: applied.cues,
        changed: applied.changed,
        decided: decided + hardExpand.length,
        skipped,
        hardExpand,
        expand,
        keep,
        blank,
        undecided,
    };
}

module.exports = {
    runAcceptRevertGate,
    runKeepSwapGate,
    runSemanticApplyGate,
    runScoreRank,
    runPreMtSoftHold,
    runFilmBriefTrust,
    runKimochiUnderfillGate,
    pipe,
};
