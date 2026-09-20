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

module.exports = {
    EDITOR_OWNED_KINDS,
    stopLocalLlmQuiet,
    stopLocalLlmQuietAsync,
    reclaimLocalLlmWhenEditorsGone,
    reclaimLocalLlmWhenEditorsGoneAsync,
    reclaimLocalLlmBeforeEngineJob,
};
