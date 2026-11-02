/**
 * Shared Laya System One decide helpers for Pro pipelines
 * (faithfulness verify, ASR second opinion, semantic repair gate, …).
 */
const jevCore = require('../src/js/jev-decision-core');
const jevSecrets = require('./jev-secrets');

/**
 * Gate + auth for a decide call. Soft-fails when Laya is off / speed / unavailable.
 * @param {object} [options]
 * @returns {{ ok: true, apiKey: string, endpoint: string, model: string, minConfidence: number }
 *   | { ok: false, reason: string, error?: string }}
 */
function prepareJevDecide(options = {}) {
    if (!jevCore.isJevDecisionEnabled(options)) {
        return { ok: false, reason: 'disabled' };
    }
    if (jevCore.shouldSkipJevForPerfProfile(options)) {
        return { ok: false, reason: 'speed_skip' };
    }
    try {
        const { requireJevDecision } = require('./advanced-gates');
        const gate = requireJevDecision();
        if (!gate.ok) {
            return { ok: false, reason: 'not_entitled', error: gate.error };
        }
        const { readAdvancedDoc } = require('./advanced-license-data');
        const doc = readAdvancedDoc().doc;
        jevSecrets.loadJevKeyBlob(doc?.jevKeyBlob || '');
    } catch (err) {
        return { ok: false, reason: 'unavailable', error: err?.message };
    }

    const endpoint = options.jevEndpoint || options.jevDecisionEndpoint || 'local';
    const resolved = jevCore.resolveJevEndpoint(endpoint);
    const got = jevSecrets.getJevApiKey();
    if (!got.ok) {
        return { ok: false, reason: 'decrypt_failed', error: got.error };
    }
    if (jevCore.requiresApiKey(resolved) && !got.apiKey) {
        return { ok: false, reason: 'missing_key' };
    }
    return {
        ok: true,
        apiKey: got.apiKey || '',
        endpoint,
        model: options.jevModel || jevCore.DEFAULT_MODEL,
        minConfidence: jevCore.clampJevMinConfidence(options.jevDecisionMinConfidence),
    };
}

/**
 * Same as prepareJevDecide, but for local auto mode first ensures OpenDecider
 * is installed/started (Pro task path). Soft: ensure failure still returns auth
 * so callers can soft-skip on unreachable.
 *
 * @param {object} [options]
 * @param {{ onLog?: (line: string) => void }} [deps]
 */
async function prepareJevDecideReady(options = {}, deps = {}) {
    try {
        const { ensureLocalLayaForProTask } = require('./jev-laya-ensure');
        const ensured = await ensureLocalLayaForProTask(options, {
            onLog: typeof deps.onLog === 'function' ? deps.onLog : undefined,
        });
        if (!ensured?.ok && !ensured?.skipped && typeof deps.onLog === 'function') {
            deps.onLog(
                `[laya] 自动安装/启动未成功：${ensured?.error || 'unknown'}（决策辅助可能回退）`,
            );
        }
    } catch (_) { /* soft */ }
    return prepareJevDecide(options);
}

/**
 * Invoke System One; on HTTP/server failure with multiple questions, binary-split and merge.
 * @param {Function} invokeSystemOne
 * @param {object} opts
 * @returns {Promise<{ ok: boolean, answers?: object, error?: string, splitRetries?: number }>}
 */
async function invokeSystemOneWithSplitRetry(invokeSystemOne, opts = {}) {
    const questions = opts.questions && typeof opts.questions === 'object' ? opts.questions : {};
    const keys = Object.keys(questions);
    let res;
    try {
        res = await invokeSystemOne(opts);
    } catch (err) {
        res = { ok: false, error: err?.message || String(err) };
    }
    if (res?.ok && res.answers) return { ...res, splitRetries: 0 };
    if (keys.length <= 1) return res || { ok: false, error: 'invoke_failed' };

    const mid = Math.ceil(keys.length / 2);
    const leftKeys = keys.slice(0, mid);
    const rightKeys = keys.slice(mid);
    const pickQs = (list) => {
        const out = {};
        for (const k of list) out[k] = questions[k];
        return out;
    };
    const left = await invokeSystemOneWithSplitRetry(invokeSystemOne, {
        ...opts,
        questions: pickQs(leftKeys),
    });
    const right = await invokeSystemOneWithSplitRetry(invokeSystemOne, {
        ...opts,
        questions: pickQs(rightKeys),
    });
    const answers = {
        ...(left?.ok && left.answers ? left.answers : {}),
        ...(right?.ok && right.answers ? right.answers : {}),
    };
    const got = Object.keys(answers).length;
    if (!got) {
        return {
            ok: false,
            error: res?.error || left?.error || right?.error || 'split_retry_failed',
            splitRetries: 1 + (left?.splitRetries || 0) + (right?.splitRetries || 0),
        };
    }
    return {
        ok: true,
        answers,
        partial: got < keys.length,
        splitRetries: 1 + (left?.splitRetries || 0) + (right?.splitRetries || 0),
        error: got < keys.length ? (res?.error || 'partial_after_split') : undefined,
    };
}

/**
 * Chunked System One Choice invoke.
 * @param {object} args
 * @param {ReturnType<typeof prepareJevDecide>} args.auth
 * @param {any[]} args.items
 * @param {(chunk: any[]) => { state: any, questions: object, items?: any[] }} args.buildRequest
 * @param {(answers: object, chunk: any[], minConfidence: number) => {
 *   accept?: any[], reject?: any[], undecided?: any[], auto?: any[], needLlm?: any[], decided?: number
 * }} args.partition
 * @param {AbortSignal} [args.signal]
 * @param {number} [args.timeoutMs]
 */
async function decideChoiceChunks({
    auth,
    items,
    buildRequest,
    partition,
    signal,
    timeoutMs,
} = {}) {
    const empty = {
        accept: [],
        reject: [],
        undecided: Array.isArray(items) ? items.slice() : [],
        decided: 0,
        skipped: true,
        reason: 'no_auth',
    };
    if (!auth?.ok) return empty;
    if (!items?.length || typeof buildRequest !== 'function' || typeof partition !== 'function') {
        return { ...empty, reason: 'bad_args', undecided: items || [] };
    }

    const { invokeSystemOne } = require('./jev-client');
    const chunks = jevCore.chunkPairsForSystemOne(items);
    const accept = [];
    const reject = [];
    const undecided = [];
    let decided = 0;
    let splitRetries = 0;

    for (const chunk of chunks) {
        if (signal?.aborted) {
            undecided.push(...chunk);
            continue;
        }
        let built;
        try {
            built = buildRequest(chunk);
        } catch {
            undecided.push(...chunk);
            continue;
        }
        if (!built?.questions || !Object.keys(built.questions).length) {
            undecided.push(...chunk);
            continue;
        }
        const res = await invokeSystemOneWithSplitRetry(invokeSystemOne, {
            apiKey: auth.apiKey || '',
            endpoint: auth.endpoint,
            model: auth.model,
            state: built.state,
            questions: built.questions,
            signal,
            timeoutMs: Math.min(45000, Number(timeoutMs) || 30000),
        });
        splitRetries += Number(res?.splitRetries) || 0;
        if (!res?.ok || !res.answers) {
            undecided.push(...chunk);
            continue;
        }
        const part = partition(res.answers, chunk, auth.minConfidence) || {};
        if (Array.isArray(part.accept)) accept.push(...part.accept);
        if (Array.isArray(part.reject)) reject.push(...part.reject);
        if (Array.isArray(part.undecided)) undecided.push(...part.undecided);
        // Compat with verify partition shape
        if (Array.isArray(part.auto)) accept.push(...part.auto);
        if (Array.isArray(part.needLlm)) undecided.push(...part.needLlm);
        decided += Number(part.decided) || 0;
    }

    return {
        accept,
        reject,
        undecided,
        decided,
        skipped: false,
        reason: decided ? 'decided' : 'no_confident',
        splitRetries,
    };
}

module.exports = {
    prepareJevDecide,
    prepareJevDecideReady,
    decideChoiceChunks,
    invokeSystemOneWithSplitRetry,
};
