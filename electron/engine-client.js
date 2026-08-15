/**
 * Pure HTTP client for Transub Engine API v1 (Node / tests).
 */

function joinUrl(base, pathPart) {
    const b = String(base || '').replace(/\/+$/, '');
    const p = String(pathPart || '');
    if (!p) return b;
    return `${b}${p.startsWith('/') ? p : `/${p}`}`;
}

async function engineFetch(baseUrl, pathPart, options = {}) {
    const url = joinUrl(baseUrl, pathPart);
    const {
        method = 'GET',
        body = undefined,
        headers = {},
        timeoutMs = 30000,
        signal = undefined,
    } = options;

    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
    }, Math.max(1000, Number(timeoutMs) || 30000));
    const onOuterAbort = () => ctrl.abort();
    if (signal) {
        if (signal.aborted) ctrl.abort();
        else signal.addEventListener('abort', onOuterAbort, { once: true });
    }

    try {
        const res = await fetch(url, {
            method,
            headers: {
                Accept: 'application/json',
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...headers,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: ctrl.signal,
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = { raw: text };
        }
        return {
            ok: res.ok && data?.ok !== false,
            status: res.status,
            data,
        };
    } catch (err) {
        // fetch AbortError message is English ("This operation was aborted");
        // never leak it to UI — callers expect structured ok:false results.
        if (err?.name === 'AbortError') {
            if (signal?.aborted && !timedOut) {
                return {
                    ok: false,
                    status: 0,
                    data: null,
                    error: '已取消',
                    code: 'cancelled',
                    cancelled: true,
                };
            }
            return {
                ok: false,
                status: 0,
                data: null,
                error: '请求超时',
                code: 'timeout',
            };
        }
        return {
            ok: false,
            status: 0,
            data: null,
            error: err?.message || String(err),
            code: 'network',
        };
    } finally {
        clearTimeout(timer);
        if (signal) {
            try { signal.removeEventListener('abort', onOuterAbort); } catch { /* ignore */ }
        }
    }
}

async function getHealth(baseUrl, options = {}) {
    return engineFetch(baseUrl, '/v1/health', { ...options, method: 'GET', timeoutMs: options.timeoutMs || 5000 });
}

async function getCapabilities(baseUrl, options = {}) {
    return engineFetch(baseUrl, '/v1/capabilities', { ...options, method: 'GET' });
}

async function listModels(baseUrl, options = {}) {
    return engineFetch(baseUrl, '/v1/models', { ...options, method: 'GET' });
}

async function recommendModels(baseUrl, body = {}, options = {}) {
    return engineFetch(baseUrl, '/v1/models/recommend', {
        ...options,
        method: 'POST',
        body,
    });
}

async function detectLanguage(baseUrl, body = {}, options = {}) {
    return engineFetch(baseUrl, '/v1/detect-language', {
        ...options,
        method: 'POST',
        body,
        // First call may pip-install faster-whisper + numpy into the embeddable runtime.
        timeoutMs: options.timeoutMs || 600000,
    });
}

/**
 * Text-only Opus / engine MT (no media).
 * Body: { cues: [{id,text,start?,end?}], language?, mtModel?, device?, targetLanguage? }
 */
async function translateCuesMt(baseUrl, body = {}, options = {}) {
    const cueCount = Array.isArray(body?.cues) ? body.cues.length : 0;
    const timeoutMs = options.timeoutMs
        || Math.max(120000, Math.min(900000, 30000 + cueCount * 400));
    return engineFetch(baseUrl, '/v1/mt/translate', {
        ...options,
        method: 'POST',
        body,
        timeoutMs,
    });
}

async function downloadModels(baseUrl, body = {}, options = {}) {
    return engineFetch(baseUrl, '/v1/models/download-sync', {
        ...options,
        method: 'POST',
        body,
        timeoutMs: options.timeoutMs || 600000,
    });
}

/**
 * Consume Engine SSE (`text/event-stream`) and invoke onEvent for each JSON payload.
 */
async function engineFetchSse(baseUrl, pathPart, {
    method = 'POST',
    body = undefined,
    headers = {},
    timeoutMs = 1800000,
    signal = undefined,
    onEvent = null,
} = {}) {
    const url = joinUrl(baseUrl, pathPart);
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
    }, Math.max(1000, Number(timeoutMs) || 1800000));
    const onOuterAbort = () => ctrl.abort();
    if (signal) {
        if (signal.aborted) ctrl.abort();
        else signal.addEventListener('abort', onOuterAbort, { once: true });
    }

    let lastPayload = null;
    try {
        const res = await fetch(url, {
            method,
            headers: {
                Accept: 'text/event-stream',
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...headers,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
            const text = await res.text().catch(() => '');
            let data = null;
            try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
            return {
                ok: false,
                status: res.status,
                data,
                error: data?.message || data?.error || `HTTP ${res.status}`,
            };
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let sep;
            while ((sep = buffer.indexOf('\n\n')) >= 0) {
                const chunk = buffer.slice(0, sep);
                buffer = buffer.slice(sep + 2);
                const lines = chunk.split(/\r?\n/);
                const dataLines = lines
                    .filter((ln) => ln.startsWith('data:'))
                    .map((ln) => ln.slice(5).trimStart());
                if (!dataLines.length) continue;
                const raw = dataLines.join('\n');
                let payload = null;
                try {
                    payload = JSON.parse(raw);
                } catch {
                    payload = { type: 'progress', detail: raw };
                }
                lastPayload = payload;
                if (typeof onEvent === 'function') {
                    try { onEvent(payload); } catch { /* ignore */ }
                }
            }
        }
        const ok = !(lastPayload && (lastPayload.type === 'error' || lastPayload.ok === false));
        return { ok, status: res.status, data: lastPayload };
    } catch (err) {
        if (err?.name === 'AbortError') {
            if (signal?.aborted && !timedOut) {
                return {
                    ok: false,
                    cancelled: true,
                    error: '已取消',
                    code: 'cancelled',
                    data: lastPayload,
                };
            }
            return {
                ok: false,
                error: '请求超时',
                code: 'timeout',
                data: lastPayload,
            };
        }
        return { ok: false, error: err.message || String(err), data: lastPayload };
    } finally {
        clearTimeout(timer);
        if (signal) {
            try { signal.removeEventListener('abort', onOuterAbort); } catch { /* ignore */ }
        }
    }
}

async function downloadModelsStream(baseUrl, body = {}, options = {}) {
    return engineFetchSse(baseUrl, '/v1/models/download', {
        ...options,
        method: 'POST',
        body,
        timeoutMs: options.timeoutMs || 1800000,
        onEvent: options.onEvent,
        signal: options.signal,
    });
}

async function getGpuRuntime(baseUrl, options = {}) {
    return engineFetch(baseUrl, '/v1/runtime/gpu', {
        ...options,
        method: 'GET',
        timeoutMs: options.timeoutMs || 15000,
    });
}

async function getAsrWhisperRuntime(baseUrl, options = {}) {
    return engineFetch(baseUrl, '/v1/runtime/asr-whisper', {
        ...options,
        method: 'GET',
        timeoutMs: options.timeoutMs || 15000,
    });
}

async function ensureGpuRuntime(baseUrl, body = {}, options = {}) {
    return engineFetch(baseUrl, '/v1/runtime/ensure-gpu', {
        ...options,
        method: 'POST',
        body,
        timeoutMs: options.timeoutMs || 1800000,
    });
}

async function ensureGpuRuntimeStream(baseUrl, body = {}, options = {}) {
    return engineFetchSse(baseUrl, '/v1/runtime/ensure-gpu-stream', {
        ...options,
        method: 'POST',
        body,
        timeoutMs: options.timeoutMs || 1800000,
        onEvent: options.onEvent,
        signal: options.signal,
    });
}

async function releaseGpuMemory(baseUrl, options = {}) {
    return engineFetch(baseUrl, '/v1/runtime/release-gpu', {
        ...options,
        method: 'POST',
        body: {},
        timeoutMs: options.timeoutMs || 30000,
    });
}

async function getAudioSeparateRuntime(baseUrl, options = {}) {
    return engineFetch(baseUrl, '/v1/runtime/audio-separate', {
        ...options,
        method: 'GET',
        timeoutMs: options.timeoutMs || 15000,
    });
}

async function ensureAudioSeparateRuntime(baseUrl, body = {}, options = {}) {
    return engineFetch(baseUrl, '/v1/runtime/ensure-audio-separate', {
        ...options,
        method: 'POST',
        body,
        timeoutMs: options.timeoutMs || 3600000,
    });
}

async function ensureAudioSeparateRuntimeStream(baseUrl, body = {}, options = {}) {
    return engineFetchSse(baseUrl, '/v1/runtime/ensure-audio-separate-stream', {
        ...options,
        method: 'POST',
        body,
        timeoutMs: options.timeoutMs || 3600000,
        onEvent: options.onEvent,
        signal: options.signal,
    });
}

async function createJob(baseUrl, body = {}, options = {}) {
    return engineFetch(baseUrl, '/v1/jobs', {
        ...options,
        method: 'POST',
        body,
        timeoutMs: options.timeoutMs || 600000,
    });
}

async function getJob(baseUrl, jobId, options = {}) {
    return engineFetch(baseUrl, `/v1/jobs/${encodeURIComponent(jobId)}`, {
        ...options,
        method: 'GET',
    });
}

async function cancelJob(baseUrl, jobId, options = {}) {
    return engineFetch(baseUrl, `/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
        ...options,
        method: 'POST',
        body: {},
    });
}

async function resumeJob(baseUrl, jobId, options = {}) {
    const overrides = options.overrides && typeof options.overrides === 'object'
        ? options.overrides
        : null;
    const body = overrides && Object.keys(overrides).length
        ? { overrides }
        : {};
    return engineFetch(baseUrl, `/v1/jobs/${encodeURIComponent(jobId)}/resume`, {
        ...options,
        method: 'POST',
        body,
        timeoutMs: options.timeoutMs || 60000,
    });
}

async function getJobCheckpoint(baseUrl, jobId, options = {}) {
    return engineFetch(baseUrl, `/v1/jobs/${encodeURIComponent(jobId)}/checkpoint`, {
        ...options,
        method: 'GET',
        timeoutMs: options.timeoutMs || 15000,
    });
}

/**
 * Prefer SSE job events; on stream failure fall back to poll.
 * Terminal SSE events do not always include full result — always GET job once done.
 */
async function waitJobViaEvents(baseUrl, jobId, {
    idleTimeoutMs = 3600000,
    timeoutMs = undefined,
    onEvent = null,
    signal = undefined,
    shouldStop = null,
} = {}) {
    const idleMs = Math.max(1000, Number(idleTimeoutMs ?? timeoutMs) || 3600000);
    let lastActivityAt = Date.now();
    let lastStatus = '';
    let lastProgressKey = '';
    let terminal = null;

    const bump = (ev) => {
        lastActivityAt = Date.now();
        const progress = ev?.progress || (ev?.type === 'progress' ? ev : null) || null;
        const status = ev?.status
            || (ev?.type === 'done' ? 'done'
                : ev?.type === 'error' ? 'error'
                    : ev?.type === 'cancelled' ? 'cancelled'
                        : '');
        const progressKey = progress
            ? `${progress.stage || ''}|${progress.percent ?? ''}|${progress.detail || ''}`
            : `${ev?.type || ''}|${ev?.detail || ''}`;
        if (typeof onEvent === 'function') {
            if (status && status !== lastStatus) {
                onEvent({ type: 'status', status, data: ev, progress: progress || ev });
                lastStatus = status;
            } else if (progressKey && progressKey !== lastProgressKey) {
                onEvent({
                    type: 'progress',
                    status: status || lastStatus || 'running',
                    data: ev,
                    progress: progress || {
                        stage: ev?.stage,
                        detail: ev?.detail,
                        percent: ev?.percent,
                        processedSec: ev?.processedSec,
                        mediaDurationSec: ev?.mediaDurationSec ?? ev?.audioDurationSec,
                    },
                });
            }
        }
        if (progressKey) lastProgressKey = progressKey;
        if (ev?.type === 'done' || status === 'done') terminal = { kind: 'done' };
        if (ev?.type === 'error' || status === 'error') {
            terminal = { kind: 'error', error: ev?.message || ev?.error || 'error' };
        }
        if (ev?.type === 'cancelled' || status === 'cancelled') {
            terminal = { kind: 'cancelled' };
        }
    };

    const ctrl = new AbortController();
    const onOuterAbort = () => ctrl.abort();
    if (signal) {
        if (signal.aborted) ctrl.abort();
        else signal.addEventListener('abort', onOuterAbort, { once: true });
    }

    const idleWatch = setInterval(() => {
        if (Date.now() - lastActivityAt > idleMs) {
            try { ctrl.abort(); } catch { /* ignore */ }
        }
    }, 2000);

    const stopPoll = setInterval(() => {
        if (typeof shouldStop === 'function' && shouldStop()) {
            try { ctrl.abort(); } catch { /* ignore */ }
        }
    }, 250);

    try {
        const sse = await engineFetchSse(baseUrl, `/v1/jobs/${encodeURIComponent(jobId)}/events`, {
            method: 'GET',
            timeoutMs: idleMs,
            signal: ctrl.signal,
            onEvent: (payload) => {
                if (typeof shouldStop === 'function' && shouldStop()) return;
                bump(payload && typeof payload === 'object' ? payload : { detail: payload });
            },
        });
        if (typeof shouldStop === 'function' && shouldStop()) {
            return { ok: false, error: '已取消', cancelled: true };
        }
        if (sse?.cancelled || sse?.code === 'cancelled') {
            return { ok: false, error: '已取消', cancelled: true };
        }
        if (Date.now() - lastActivityAt > idleMs && !terminal) {
            return { ok: false, error: '任务长时间无响应', code: 'idle_timeout' };
        }
        // SSE connection failed before useful events — let caller fall back to poll.
        if (!sse?.ok && !terminal) {
            return {
                ok: false,
                error: sse?.error || 'sse_unavailable',
                code: 'sse_unavailable',
                sse,
            };
        }
        if (terminal?.kind === 'cancelled') {
            return { ok: false, error: '已取消', cancelled: true };
        }
        // Always refresh final job snapshot (result / error payload).
        const finalJob = await getJob(baseUrl, jobId, { signal, timeoutMs: 60000 });
        if (!finalJob.ok) {
            if (terminal?.kind === 'done') {
                return { ok: false, error: finalJob.error || 'job snapshot failed', data: finalJob.data };
            }
            if (terminal?.kind === 'error') {
                return { ok: false, error: terminal.error || '任务失败', data: finalJob.data };
            }
            return {
                ok: false,
                error: sse?.error || finalJob.error || 'sse_unavailable',
                code: 'sse_unavailable',
            };
        }
        const status = finalJob.data?.status || '';
        if (status === 'done') return { ok: true, data: finalJob.data, via: 'sse' };
        if (status === 'error' || status === 'cancelled') {
            return {
                ok: false,
                error: finalJob.data?.error?.message || status,
                cancelled: status === 'cancelled',
                data: finalJob.data,
                via: 'sse',
            };
        }
        // Stream ended early while job still running — fall back.
        return { ok: false, error: 'sse_incomplete', code: 'sse_unavailable', data: finalJob.data };
    } finally {
        clearInterval(idleWatch);
        clearInterval(stopPoll);
        if (signal) {
            try { signal.removeEventListener('abort', onOuterAbort); } catch { /* ignore */ }
        }
    }
}

/**
 * Wait until job terminal. Prefer SSE events; fall back to HTTP poll.
 * Fails only on prolonged idle (no successful engine response), not total wall time.
 * @param {object} [options]
 * @param {boolean} [options.preferSse=true]
 * @param {number} [options.timeoutMs] - alias of idleTimeoutMs (compat)
 * @param {number} [options.idleTimeoutMs] - abort after this long with no successful poll (default 1h)
 * @param {() => boolean} [options.shouldStop] - return true to abort wait early (UI cancel)
 */
async function waitJob(baseUrl, jobId, {
    intervalMs = 500,
    timeoutMs = undefined,
    idleTimeoutMs = undefined,
    /** Per-poll HTTP timeout; keep high so ASR-busy engines don't fail the wait. */
    pollTimeoutMs = 60000,
    onEvent = null,
    signal = undefined,
    shouldStop = null,
    preferSse = true,
} = {}) {
    const idleMs = Math.max(
        1000,
        Number(idleTimeoutMs ?? timeoutMs) || 3600000,
    );
    if (preferSse !== false) {
        const viaSse = await waitJobViaEvents(baseUrl, jobId, {
            idleTimeoutMs: idleMs,
            onEvent,
            signal,
            shouldStop,
        });
        if (viaSse?.code !== 'sse_unavailable' && viaSse?.error !== 'sse_incomplete') {
            return viaSse;
        }
        // Fall through to poll.
    }
    let lastActivityAt = Date.now();
    let lastStatus = '';
    let lastProgressKey = '';
    const perPollMs = Math.max(1000, Number(pollTimeoutMs) || 60000);
    while (true) {
        if (typeof shouldStop === 'function' && shouldStop()) {
            return { ok: false, error: '已取消', cancelled: true };
        }
        if (signal?.aborted) {
            return { ok: false, error: '已取消', cancelled: true };
        }
        if (Date.now() - lastActivityAt > idleMs) {
            return { ok: false, error: '任务长时间无响应', code: 'idle_timeout' };
        }
        // Poll timeout must tolerate engine blocking HTTP while ASR runs.
        const res = await getJob(baseUrl, jobId, { signal, timeoutMs: perPollMs });
        if (typeof shouldStop === 'function' && shouldStop()) {
            return { ok: false, error: '已取消', cancelled: true };
        }
        if (res?.cancelled || res?.code === 'cancelled') {
            return { ok: false, error: '已取消', cancelled: true };
        }
        if (!res.ok && res.status === 404) {
            if (typeof shouldStop === 'function' && shouldStop()) {
                return { ok: false, error: '已取消', cancelled: true };
            }
            return { ok: false, error: 'job not found', data: res.data };
        }
        if (!res.ok) {
            // Timeout/network while engine is busy on inference — keep polling.
            // Do not refresh lastActivityAt: prolonged silence still trips idle timeout.
            if (typeof shouldStop === 'function' && shouldStop()) {
                return { ok: false, error: '已取消', cancelled: true };
            }
            await new Promise((r) => setTimeout(r, intervalMs));
            continue;
        }
        // Engine answered — job may still take many hours; only idle silence fails.
        lastActivityAt = Date.now();
        const status = res.data?.status || '';
        const progress = res.data?.progress || null;
        const progressKey = progress
            ? `${progress.stage || ''}|${progress.percent ?? ''}|${progress.detail || ''}|${res.data?.eventCount ?? ''}`
            : '';
        if (typeof onEvent === 'function') {
            if (status !== lastStatus) {
                onEvent({ type: 'status', status, data: res.data, progress });
                lastStatus = status;
            } else if (progressKey && progressKey !== lastProgressKey) {
                onEvent({ type: 'progress', status, data: res.data, progress });
            }
        }
        if (progressKey) lastProgressKey = progressKey;
        if (status === 'done') {
            return { ok: true, data: res.data, via: 'poll' };
        }
        if (status === 'error' || status === 'cancelled') {
            return {
                ok: false,
                error: res.data?.error?.message || status,
                cancelled: status === 'cancelled',
                data: res.data,
                via: 'poll',
            };
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
}

module.exports = {
    joinUrl,
    engineFetch,
    engineFetchSse,
    getHealth,
    getCapabilities,
    listModels,
    recommendModels,
    detectLanguage,
    translateCuesMt,
    downloadModels,
    downloadModelsStream,
    getGpuRuntime,
    getAsrWhisperRuntime,
    ensureGpuRuntime,
    ensureGpuRuntimeStream,
    releaseGpuMemory,
    getAudioSeparateRuntime,
    ensureAudioSeparateRuntime,
    ensureAudioSeparateRuntimeStream,
    createJob,
    getJob,
    cancelJob,
    resumeJob,
    getJobCheckpoint,
    waitJobViaEvents,
    waitJob,
};
