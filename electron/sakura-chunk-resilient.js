/**
 * Sakura / sentence-MT chunk recovery: half-window then per-cue after timeout/fail.
 * Keeps successful lines; avoids leaving a whole multi-cue window blank.
 */
const sakuraCore = require('../src/js/sakura-translate-core');
const longTrackPolicy = require('../src/js/mt-long-track-policy-core');

/**
 * @param {object} deps
 * @param {Array} deps.chunkCues
 * @param {object} deps.batchCtx
 * @param {function} deps.translateCueBatch
 * @param {object} [deps.priorBatch]
 * @param {function} [deps.send]
 * @param {AbortSignal} [deps.signal]
 * @param {string} [deps.rangeParen]
 * @param {number} [deps.chunkIndex1Based]
 * @param {number} [deps.totalChunks]
 * @param {number} [deps.pctStart]
 * @returns {Promise<{ok:boolean, cues?:Array, recovered?:boolean, error?:string, code?:string}>}
 */
async function recoverSakuraChunkAfterFailure(deps = {}) {
    const chunkCues = Array.isArray(deps.chunkCues) ? deps.chunkCues : [];
    const translateCueBatch = deps.translateCueBatch;
    const batchCtx = deps.batchCtx && typeof deps.batchCtx === 'object' ? deps.batchCtx : {};
    const priorBatch = deps.priorBatch || null;
    const send = typeof deps.send === 'function' ? deps.send : null;
    const signal = deps.signal;
    const halfMin = longTrackPolicy.HALF_WINDOW_MIN;

    if (typeof translateCueBatch !== 'function') {
        return priorBatch && typeof priorBatch === 'object'
            ? priorBatch
            : { ok: false, error: 'translateCueBatch missing', code: 'chunk_failed' };
    }
    if (!longTrackPolicy.shouldAttemptChunkSplitRecovery(chunkCues, {
        halfMin,
        aborted: !!(signal?.aborted),
    })) {
        return priorBatch && typeof priorBatch === 'object'
            ? priorBatch
            : { ok: false, error: 'chunk too small for split', code: 'chunk_failed' };
    }

    const half = Math.max(halfMin, Math.ceil(chunkCues.length / 2));
    const rangeParen = String(deps.rangeParen || '');
    const chunkIndex1Based = Math.max(1, Math.round(Number(deps.chunkIndex1Based) || 1));
    const totalChunks = Math.max(1, Math.round(Number(deps.totalChunks) || 1));
    const pctStart = Number.isFinite(Number(deps.pctStart))
        ? Math.round(Number(deps.pctStart))
        : undefined;

    send?.({
        phase: 'chunk-retry',
        detail: `第 ${chunkIndex1Based} 块${rangeParen}仍失败，降窗（${half} 条）重译…`,
        percent: pctStart,
        pct: pctStart,
        chunk: chunkIndex1Based,
        total: totalChunks,
    });

    const subChunks = longTrackPolicy.planHalfWindowSlices(chunkCues, {
        halfMin,
        chunkCuesFn: (list, opts) => sakuraCore.chunkCues(list, opts),
    });

    const maps = new Map();
    for (const u of priorBatch?.cues || []) {
        const text = String(u?.text ?? '').trim();
        if (!text) continue;
        const idx = Number(u.index);
        if (Number.isInteger(idx)) maps.set(idx, String(u.text ?? ''));
    }

    let anyOk = maps.size > 0;
    let lastError = String(priorBatch?.error || '');
    let lastCode = priorBatch?.code || '';

    const translateOneCue = async (cue) => {
        const one = await translateCueBatch([cue], {
            ...batchCtx,
            _lineAlignFallback: true,
            maxTokens: sakuraCore.estimateMaxTokens([cue]),
        });
        if (one?.ok) {
            anyOk = true;
            for (const u of one.cues || []) {
                const t = String(u?.text ?? '');
                if (t.trim()) maps.set(Number(u.index), t);
            }
            return true;
        }
        lastError = one?.error || lastError;
        lastCode = one?.code || lastCode;
        return false;
    };

    for (let s = 0; s < subChunks.length; s += 1) {
        if (signal?.aborted) {
            return { ok: false, error: '已取消', code: 'cancelled' };
        }
        const sub = subChunks[s];
        let subBatch = await translateCueBatch(sub, {
            ...batchCtx,
            note: [batchCtx.note, '降窗重译：严格按行一对一输出，禁止合并邻条。']
                .filter(Boolean)
                .join('\n'),
        });
        if (signal?.aborted || subBatch?.code === 'cancelled') {
            return { ok: false, error: '已取消', code: 'cancelled' };
        }

        if (!subBatch.ok && sub.length > halfMin) {
            send?.({
                phase: 'chunk-retry',
                detail: `第 ${chunkIndex1Based} 块子窗 ${s + 1}/${subChunks.length}${rangeParen}失败，逐条重译…`,
                percent: pctStart,
                pct: pctStart,
                chunk: chunkIndex1Based,
                total: totalChunks,
            });
            for (const cue of sub) {
                if (signal?.aborted) {
                    return { ok: false, error: '已取消', code: 'cancelled' };
                }
                await translateOneCue(cue);
            }
            continue;
        }

        if (!subBatch.ok) {
            lastError = subBatch.error || lastError;
            lastCode = subBatch.code || lastCode;
            if (sub.length === 1) {
                await translateOneCue(sub[0]);
            }
            continue;
        }

        anyOk = true;
        for (const u of subBatch.cues || []) {
            maps.set(Number(u.index), String(u.text ?? ''));
        }
    }

    if (!anyOk) {
        return {
            ok: false,
            error: lastError || '降窗重译失败',
            code: lastCode || 'chunk_failed',
            cues: [],
            recovered: false,
        };
    }

    const cues = chunkCues.map((c) => ({
        index: c.index,
        text: maps.has(Number(c.index)) ? maps.get(Number(c.index)) : '',
    }));
    return {
        ok: true,
        cues,
        recovered: true,
        incomplete: cues
            .filter((u) => !String(u.text || '').trim())
            .map((u) => u.index),
        content: '',
        refused: false,
    };
}

module.exports = {
    recoverSakuraChunkAfterFailure,
};
