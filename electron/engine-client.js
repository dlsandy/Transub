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

/**
 * Poll job until terminal state; optional onEvent for progress snapshots.
 * @param {object} [options]
 * @param {() => boolean} [options.shouldStop] - return true to abort wait early (UI cancel)
 */
async function waitJob(baseUrl, jobId, {
    intervalMs = 500,
    timeoutMs = 3600000,
    /** Per-poll HTTP timeout; keep high so ASR-busy engines don't fail the wait. */
    pollTimeoutMs = 60000,
    onEvent = null,
    signal = undefined,
    shouldStop = null,
} = {}) {
    const started = Date.now();
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
        if (Date.now() - started > timeoutMs) {
            return { ok: false, error: '任务超时' };
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
            if (typeof shouldStop === 'function' && shouldStop()) {
                return { ok: false, error: '已取消', cancelled: true };
            }
            await new Promise((r) => setTimeout(r, intervalMs));
            continue;
        }
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
            return { ok: true, data: res.data };
        }
        if (status === 'error' || status === 'cancelled') {
            return {
                ok: false,
                error: res.data?.error?.message || status,
                cancelled: status === 'cancelled',
                data: res.data,
            };
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
}

module.exports = {
    joinUrl,
    engineFetch,
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
    waitJob,
};
