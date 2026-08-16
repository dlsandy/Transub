/**
 * Create + wait engine jobs with ASR model failover and optional checkpoint resume.
 * Pure orchestration over injected client fns (no Electron).
 */

const rangeAsrPolicy = require('./engine-range-asr-policy');

/**
 * @param {object} waited
 * @returns {{ empty: boolean, retryable: boolean, cancelled: boolean, error: string, code: string }}
 */
function classifyWaitFailure(waited) {
    const cancelled = !!(waited?.cancelled || waited?.error === 'cancelled');
    const error = String(waited?.error || waited?.data?.error?.message || '任务失败');
    const code = String(
        waited?.code
        || waited?.data?.error?.code
        || (cancelled ? 'cancelled' : ''),
    );
    const shaped = { ok: false, error, code, cancelled };
    return {
        empty: rangeAsrPolicy.isEmptyAsrFail(shaped),
        retryable: rangeAsrPolicy.isRetryableAsrFail(shaped) || code === 'idle_timeout',
        cancelled,
        error,
        code: code || (rangeAsrPolicy.isEmptyAsrFail(shaped) ? 'ASR_EMPTY' : ''),
    };
}

function isEngineNetworkFail(res) {
    if (!res || res.ok || res.cancelled) return false;
    const code = String(res.code || '').toLowerCase();
    if (code === 'timeout' || code === 'cancelled') return false;
    if (code === 'network') return true;
    return /引擎连接|fetch failed|failed to fetch|ECONNRESET|ECONNREFUSED|UND_ERR_SOCKET/i
        .test(String(res.error || res.data?.message || res.data?.error || ''));
}

/**
 * Run one createJob + waitJob cycle.
 */
async function runSingleEngineJob({
    baseUrl,
    jobBody,
    createJob,
    waitJob,
    shouldStop = null,
    onEvent = null,
    onJobCreated = null,
    createTimeoutMs = 60000,
    waitOptions = {},
    pingHealth = null,
    restartEngine = null,
    createNetworkRetries = 1,
} = {}) {
    let activeBaseUrl = baseUrl;
    const maxCreateTries = 1 + Math.max(0, Math.min(3, Math.floor(Number(createNetworkRetries) || 0)));

    async function prepare(forceRestart) {
        if (typeof shouldStop === 'function' && shouldStop()) {
            return { ok: false, cancelled: true, error: '已取消', code: 'cancelled' };
        }
        if (!forceRestart && typeof pingHealth === 'function') {
            try {
                const health = await pingHealth(activeBaseUrl);
                if (health?.ok) {
                    if (health.baseUrl) activeBaseUrl = health.baseUrl;
                    return { ok: true };
                }
                // Busy engine may miss a short health ping; still try createJob.
                if (String(health?.code || '') === 'timeout') {
                    return { ok: true };
                }
            } catch { /* treat as down */ }
        }
        if (typeof restartEngine === 'function' && (forceRestart || typeof pingHealth === 'function')) {
            const revived = await restartEngine({
                forceRestart: true,
                reason: forceRestart ? 'network' : 'unhealthy',
            });
            if (revived?.baseUrl) activeBaseUrl = revived.baseUrl;
            if (revived && revived.ok === false) {
                return {
                    ok: false,
                    cancelled: !!revived.cancelled,
                    error: String(revived.error || '引擎未就绪'),
                    code: revived.code || 'network',
                };
            }
        }
        return { ok: true };
    }

    const first = await prepare(false);
    if (first.ok === false) {
        return {
            ok: false,
            cancelled: !!first.cancelled,
            error: first.error,
            code: first.code || 'network',
        };
    }

    let created = await createJob(activeBaseUrl, jobBody, { timeoutMs: createTimeoutMs });
    for (let tryN = 1; tryN < maxCreateTries && (!created?.ok || !created?.data?.id); tryN += 1) {
        if (typeof shouldStop === 'function' && shouldStop()) {
            return { ok: false, cancelled: true, error: '已取消', code: 'cancelled' };
        }
        if (!isEngineNetworkFail(created) && !created?.cancelled) break;
        if (created?.cancelled) {
            return { ok: false, cancelled: true, error: '已取消', code: 'cancelled', created };
        }
        const revived = await prepare(true);
        if (revived.ok === false) {
            return {
                ok: false,
                cancelled: !!revived.cancelled,
                error: revived.error,
                code: revived.code || created?.code || 'network',
                created,
            };
        }
        created = await createJob(activeBaseUrl, jobBody, { timeoutMs: createTimeoutMs });
    }

    if (!created?.ok || !created?.data?.id) {
        return {
            ok: false,
            cancelled: !!created?.cancelled,
            error: String(
                created?.error
                || created?.data?.message
                || created?.data?.error
                || `创建任务失败 (HTTP ${created?.status || '?'})`,
            ),
            code: created?.code || '',
            created,
        };
    }
    const jobId = String(created.data.id);
    if (typeof onJobCreated === 'function') {
        try { onJobCreated(jobId, created); } catch { /* ignore */ }
    }
    const waited = await waitJob(activeBaseUrl, jobId, {
        shouldStop,
        onEvent,
        ...waitOptions,
    });
    if (!waited?.ok) {
        const fail = classifyWaitFailure(waited);
        return {
            ok: false,
            cancelled: fail.cancelled,
            error: fail.error,
            code: fail.code,
            jobId,
            waited,
            result: waited?.data?.result || null,
        };
    }
    return {
        ok: true,
        jobId,
        waited,
        result: waited.data?.result || null,
        asrModel: jobBody?.asrModel,
    };
}

/**
 * Try ASR model candidates until one yields a non-empty success (or non-retryable fail).
 */
async function runEngineJobWithAsrFailover({
    baseUrl,
    buildJobBody,
    primaryAsr,
    createJob,
    waitJob,
    shouldStop = null,
    onEvent = null,
    onCandidate = null,
    onJobCreated = null,
    createTimeoutMs = 60000,
    waitOptions = {},
    candidates = null,
    pingHealth = null,
    restartEngine = null,
    createNetworkRetries = 1,
} = {}) {
    const list = Array.isArray(candidates) && candidates.length
        ? candidates.map((c) => String(c || '').trim()).filter(Boolean)
        : rangeAsrPolicy.buildBatchAsrCandidates(primaryAsr);
    let lastFail = null;
    for (let i = 0; i < list.length; i += 1) {
        const asrModel = list[i];
        if (typeof shouldStop === 'function' && shouldStop()) {
            return { ok: false, cancelled: true, error: '已取消', code: 'cancelled' };
        }
        if (typeof onCandidate === 'function') {
            try {
                onCandidate({ asrModel, index: i, total: list.length, primaryAsr });
            } catch { /* ignore */ }
        }
        const jobBody = typeof buildJobBody === 'function'
            ? buildJobBody(asrModel)
            : { ...(buildJobBody || {}), asrModel };
        const outcome = await runSingleEngineJob({
            baseUrl,
            jobBody,
            createJob,
            waitJob,
            shouldStop,
            onEvent,
            onJobCreated,
            createTimeoutMs,
            waitOptions,
            pingHealth,
            restartEngine,
            createNetworkRetries,
        });
        if (outcome.ok) {
            return { ...outcome, asrModel, asrAttempts: i + 1, asrCandidates: list };
        }
        lastFail = outcome;
        if (outcome.cancelled) return outcome;
        const shaped = {
            ok: false,
            error: outcome.error,
            code: outcome.code,
            cancelled: outcome.cancelled,
        };
        // Empty result from a "successful" job with no cues — treat as empty.
        if (outcome.ok === false && !outcome.code && outcome.result) {
            const cues = outcome.result?.cues;
            const source = Array.isArray(cues?.source) ? cues.source
                : (Array.isArray(cues) ? cues : []);
            if (!source.length) {
                shaped.code = 'ASR_EMPTY';
                shaped.error = outcome.error || '未识别到有效字幕';
            }
        }
        if (!rangeAsrPolicy.isRetryableAsrFail(shaped) && outcome.code !== 'idle_timeout') {
            return { ...outcome, asrModel, asrAttempts: i + 1, asrCandidates: list };
        }
        if (i >= list.length - 1) break;
    }
    return {
        ...(lastFail || { ok: false, error: '任务失败' }),
        asrAttempts: list.length,
        asrCandidates: list,
    };
}

/**
 * Resume from checkpoint then wait.
 * @param {{
 *   baseUrl: string,
 *   fromJobId: string,
 *   resumeJob: Function,
 *   waitJob: Function,
 *   shouldStop?: Function|null,
 *   onEvent?: Function|null,
 *   waitOptions?: object,
 *   overrides?: object|null,
 * }} args
 */
async function resumeEngineJobAndWait({
    baseUrl,
    fromJobId,
    resumeJob,
    waitJob,
    shouldStop = null,
    onEvent = null,
    waitOptions = {},
    overrides = null,
} = {}) {
    const id = String(fromJobId || '').trim();
    if (!id) return { ok: false, error: '缺少可恢复的任务 id', code: 'RESUME_NO_ID' };
    if (typeof shouldStop === 'function' && shouldStop()) {
        return { ok: false, cancelled: true, error: '已取消', code: 'cancelled' };
    }
    const resumed = await resumeJob(baseUrl, id, {
        overrides: overrides && typeof overrides === 'object' ? overrides : undefined,
    });
    if (!resumed?.ok || !resumed?.data?.id) {
        return {
            ok: false,
            error: String(
                resumed?.error
                || resumed?.data?.message
                || resumed?.data?.error
                || '断点恢复失败',
            ),
            code: resumed?.data?.code || resumed?.code || 'RESUME_FAILED',
            resumed,
        };
    }
    const jobId = String(resumed.data.id);
    const waited = await waitJob(baseUrl, jobId, {
        shouldStop,
        onEvent,
        ...waitOptions,
    });
    if (!waited?.ok) {
        const fail = classifyWaitFailure(waited);
        return {
            ok: false,
            cancelled: fail.cancelled,
            error: fail.error,
            code: fail.code,
            jobId,
            resumedFrom: id,
            waited,
        };
    }
    return {
        ok: true,
        jobId,
        resumedFrom: id,
        waited,
        result: waited.data?.result || null,
    };
}

/**
 * After a failed wait, probe checkpoint for resume affordance.
 */
async function attachCheckpointResumeHint(baseUrl, jobId, getJobCheckpoint) {
    const id = String(jobId || '').trim();
    if (!id || typeof getJobCheckpoint !== 'function') {
        return { resumable: false };
    }
    try {
        const ck = await getJobCheckpoint(baseUrl, id);
        if (!ck?.ok) return { resumable: false, checkpoint: null };
        const stage = String(ck.data?.stage || '');
        const resumable = stage === 'asr_done' || stage === 'mt_done';
        return {
            resumable,
            resumeFromJobId: resumable ? id : '',
            checkpointStage: stage || '',
            sourceCueCount: ck.data?.sourceCueCount,
            zhCueCount: ck.data?.zhCueCount,
            checkpoint: ck.data,
        };
    } catch {
        return { resumable: false };
    }
}

module.exports = {
    classifyWaitFailure,
    isEngineNetworkFail,
    runSingleEngineJob,
    runEngineJobWithAsrFailover,
    resumeEngineJobAndWait,
    attachCheckpointResumeHint,
};
