/**
 * Interrupt local MT / blank-retry / ellipsis LLM when the user hits Stop.
 * Cooperative AbortSignal alone may leave llama.cpp generating until the HTTP
 * client disconnect is honored — reclaim the managed server so wait unblocks.
 */

/**
 * @param {{
 *   scope?: 'batch' | 'item',
 *   engineBaseUrl?: string,
 * }} [opts]
 * @returns {Promise<{ ok: true, scope: string, sakuraCancelled: boolean, llamaStopped: boolean, engineLlmStopped: boolean }>}
 */
async function interruptLocalMtLlm(opts = {}) {
    const scope = opts.scope === 'item' ? 'item' : 'batch';
    let sakuraCancelled = false;
    let llamaStopped = false;
    let engineLlmStopped = false;

    try {
        const { cancelSakuraTranslate } = require('./sakura-translate');
        const r = cancelSakuraTranslate();
        sakuraCancelled = !!r?.cancelled;
    } catch { /* optional */ }

    // cancelSakuraTranslate already stops llama; call async reclaim as a second
    // chance when the editor-owned AbortController was never installed (batch
    // blank-retry passes its own signal).
    try {
        const llama = require('./advanced-llama-server');
        const stop = typeof llama.stopLlamaServerAsync === 'function'
            ? llama.stopLlamaServerAsync
            : llama.stopLlamaServer;
        const res = await stop();
        llamaStopped = !!res?.stopped;
    } catch { /* optional */ }

    const engineBaseUrl = String(opts.engineBaseUrl || '').trim();
    if (engineBaseUrl) {
        try {
            const { stopLlm } = require('./engine-llm-client');
            const res = await stopLlm(engineBaseUrl, {
                reason: scope === 'item' ? 'item-cancel' : 'batch-cancel',
            });
            engineLlmStopped = !!res?.ok;
        } catch { /* optional */ }
    }

    return {
        ok: true,
        scope,
        sakuraCancelled,
        llamaStopped,
        engineLlmStopped,
    };
}

module.exports = {
    interruptLocalMtLlm,
};
