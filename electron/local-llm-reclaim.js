/**
 * Reclaim local llama-server VRAM when leaving editor / starting engine ASR.
 * Soft idle keep-alive (≈5 min) alone left models hot after editor close,
 * so homepage Whisper/Opus often OOM'd until restart.
 */

const EDITOR_OWNED_KINDS = new Set([
    'advanced_reconstruct',
    'advanced_film_reconstruct',
    'advanced_smart_translate',
    'advanced_semantic_review',
    'advanced_batch_reconstruct',
    'sakura_translate',
    'managed_llm_perf',
]);

function stopLocalLlmQuiet() {
    try {
        const res = require('./advanced-llama-server').stopLlamaServer();
        return { ok: true, stopped: !!res?.stopped };
    } catch (_) {
        return { ok: true, stopped: false };
    }
}

async function stopLocalLlmQuietAsync() {
    try {
        const llama = require('./advanced-llama-server');
        const stop = typeof llama.stopLlamaServerAsync === 'function'
            ? llama.stopLlamaServerAsync
            : llama.stopLlamaServer;
        const res = await stop();
        return { ok: true, stopped: !!res?.stopped };
    } catch (_) {
        return { ok: true, stopped: false };
    }
}

/**
 * Last subtitle editor closed: free idle llama, or cancel editor-owned LLM jobs.
 * Do not kill llama while homepage engine/TWAI (or nested external MT) holds the lock.
 * Uses local lock snapshot only — never spawnSync-probes the engine (editor-close path).
 * @returns {{ ok: true, action: 'idle'|'cancelled'|'skipped', kind?: string }}
 */
function reclaimLocalLlmWhenEditorsGone() {
    let kind = '';
    try {
        const lock = require('./compute-task-lock');
        const status = typeof lock.getLocalStatus === 'function'
            ? lock.getLocalStatus()
            : lock.getStatus();
        if (status?.busy) {
            kind = String(status.kind || '').trim();
            if (EDITOR_OWNED_KINDS.has(kind)) {
                try {
                    require('./advanced-bridge').cancelContextReconstruct();
                } catch (_) { /* ignore */ }
                try {
                    require('./sakura-translate').cancelSakuraTranslate();
                } catch (_) { /* ignore */ }
                stopLocalLlmQuiet();
                return { ok: true, action: 'cancelled', kind };
            }
            // engine_batch / engine_range / twai_* may still need llama for external MT
            return { ok: true, action: 'skipped', kind };
        }
    } catch (_) { /* ignore */ }

    stopLocalLlmQuiet();
    return { ok: true, action: 'idle', kind: kind || undefined };
}

/**
 * Async reclaim for editor-close — never blocks the main process event loop.
 */
async function reclaimLocalLlmWhenEditorsGoneAsync() {
    let kind = '';
    try {
        const lock = require('./compute-task-lock');
        const status = typeof lock.getLocalStatus === 'function'
            ? lock.getLocalStatus()
            : lock.getStatus();
        if (status?.busy) {
            kind = String(status.kind || '').trim();
            if (EDITOR_OWNED_KINDS.has(kind)) {
                try {
                    require('./advanced-bridge').cancelContextReconstruct();
                } catch (_) { /* ignore */ }
                try {
                    require('./sakura-translate').cancelSakuraTranslate();
                } catch (_) { /* ignore */ }
                await stopLocalLlmQuietAsync();
                return { ok: true, action: 'cancelled', kind };
            }
            return { ok: true, action: 'skipped', kind };
        }
    } catch (_) { /* ignore */ }

    await stopLocalLlmQuietAsync();
    return { ok: true, action: 'idle', kind: kind || undefined };
}

/**
 * Before engine ASR/MT: drop idle llama so Whisper can allocate VRAM.
 * Sakura / smart-translate restart llama later in the same batch if needed.
 */
async function reclaimLocalLlmBeforeEngineJob(appendLog) {
    const res = await stopLocalLlmQuietAsync();
    if (res.stopped && typeof appendLog === 'function') {
        try {
            appendLog('[engine] 已停止本地 LLM（腾出显存给识别）');
        } catch (_) { /* ignore */ }
    }
    return res;
}

/**
 * Before each batch item's ASR / Demucs: free desktop llama, engine-owned llama,
 * and (when requested) engine ASR VRAM.
 *
 * Batch-start reclaim alone left llama warm after item-1 MT/QC, so item-2 Demucs
 * often OOMs while a single-file run succeeds.
 *
 * @param {((line: string) => void)|null|undefined} appendLog
 * @param {{
 *   baseUrl?: string,
 *   releaseEngineGpu?: boolean,
 *   reason?: string,
 *   timeoutMs?: number,
 * }} [opts]
 */
async function reclaimComputeBeforeBatchItem(appendLog, opts = {}) {
    const baseUrl = String(opts.baseUrl || '').trim();
    const releaseEngineGpu = opts.releaseEngineGpu !== false;
    const timeoutMs = Math.max(3000, Number(opts.timeoutMs) || 15000);
    const reason = String(opts.reason || 'pre_batch_item').trim() || 'pre_batch_item';

    const desktop = await reclaimLocalLlmBeforeEngineJob(appendLog);

    let engineLlmStopped = false;
    if (baseUrl) {
        try {
            const { stopLlm } = require('./engine-llm-client');
            const stopped = await stopLlm(baseUrl, { reason, timeoutMs });
            engineLlmStopped = !!(stopped?.ok && stopped.data?.stopped);
            if (engineLlmStopped && typeof appendLog === 'function') {
                try {
                    appendLog('[engine] 已停止引擎内 LLM（腾出显存给识别/人声分离）');
                } catch (_) { /* ignore */ }
            }
        } catch (_) { /* optional — older engines lack /v1/llm */ }
    }

    let gpuReleased = false;
    if (baseUrl && releaseEngineGpu) {
        try {
            const { releaseGpuMemory } = require('./engine-client');
            const released = await releaseGpuMemory(baseUrl, { timeoutMs });
            gpuReleased = !!(released?.ok);
        } catch (_) { /* optional */ }
    }

    return {
        ok: true,
        desktopStopped: !!desktop?.stopped,
        engineLlmStopped,
        gpuReleased,
    };
}

module.exports = {
    EDITOR_OWNED_KINDS,
    stopLocalLlmQuiet,
    stopLocalLlmQuietAsync,
    reclaimLocalLlmWhenEditorsGone,
    reclaimLocalLlmWhenEditorsGoneAsync,
    reclaimLocalLlmBeforeEngineJob,
    reclaimComputeBeforeBatchItem,
};
