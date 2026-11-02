/**
 * Engine log path / save-options / generate alias / range / sakura IPC.
 * Extracted from engine-bridge setupEngineBridge (thin shell).
 */

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {object} host
 * @param {object} host.s mutable engine session (engineProc, batchRunning, …)
 * @param {object} host.h pure helpers / deps from engine-bridge
 */
function registerEngineOptionsIpc(register, host = {}) {
    if (typeof register !== 'function') {
        throw new Error('registerEngineOptionsIpc: register required');
    }
    const h = host.h;
    if (!h) throw new Error('registerEngineOptionsIpc: host.h required');

    const {
        readMergedOptions,
        syncEngineSessionPostTask,
        runEngineBatch,
        getEngineLogPath,
        loadSettings,
        saveSettings,
        mergeTransWithAiOptions,
        mergeEngineOptions,
        stripPostTaskFields,
        getAppRoot,
        transcribeRangeWithEngine,
        deferredEnsureTwai,
        fs,
    } = h;

    register('transub-engine-get-log-path', async () => ({
        ok: true,
        path: getEngineLogPath(),
        exists: fs.existsSync(getEngineLogPath()),
    }));
    
    register('transub-engine-save-options', async (_event, payload = {}) => {
        try {
            const current = loadSettings(() => getAppRoot()).options || {};
            const next = mergeTransWithAiOptions(mergeEngineOptions({
                ...current,
                ...stripPostTaskFields(payload || {}),
            }));
            saveSettings(() => getAppRoot(), next);
            return { ok: true, options: next };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
    
    register('transub-generate-subtitles', async (event, payload = {}) => {
        const payloadOptions = payload.options || {};
        syncEngineSessionPostTask(payloadOptions);
        const options = await readMergedOptions(payloadOptions);
        if (options.engineBackend === 'twai') {
            return { ok: false, error: '请使用 TransWithAI 生成通道（engineBackend=twai）' };
        }
        return runEngineBatch({
            items: payload.items || [],
            options,
            invokeSender: event.sender,
            minimizeToTray: !!payload.minimizeToTray,
        });
    });
    
    register('transub-transcribe-range', async (event, payload = {}) => {
        const options = await readMergedOptions(payload.options || {});
        if (options.engineBackend === 'twai') {
            deferredEnsureTwai();
            const { transcribeMediaRange } = require('./transwithai-bridge');
            return transcribeMediaRange(payload || {}, {
                getUserDataPath: () => require('./app-paths').getWritableRoot(),
                getAppRoot,
                onProgress: (progress) => {
                    try {
                        if (!event?.sender?.isDestroyed?.()) {
                            event.sender.send('transub-retranscribe-progress', progress);
                        }
                    } catch (_) { /* ignore */ }
                },
            });
        }
        return transcribeRangeWithEngine(payload || {}, {
            options,
            invokeSender: event.sender,
            onProgress: (progress) => {
                try {
                    if (!event?.sender?.isDestroyed?.()) {
                        event.sender.send('transub-retranscribe-progress', progress);
                    }
                } catch (_) { /* ignore */ }
            },
        });
    });
    
    // Defer Sakura IPC module load until first sakura-* call (editor path).
    let sakuraHandlers = null;
    const ensureSakuraHandlers = () => {
        if (sakuraHandlers) return sakuraHandlers;
        const captured = new Map();
        const { setupSakuraTranslateBridge } = require('./sakura-translate');
        setupSakuraTranslateBridge({
            register(channel, handler) {
                captured.set(channel, handler);
            },
        });
        sakuraHandlers = captured;
        return sakuraHandlers;
    };
    for (const channel of [
        'transub-sakura-status',
        'transub-sakura-translate',
        'transub-sakura-cancel-translate',
    ]) {
        register(channel, async (event, payload) => {
            const handler = ensureSakuraHandlers().get(channel);
            if (typeof handler !== 'function') {
                throw new Error(`[engine] sakura channel missing: ${channel}`);
            }
            return handler(event, payload);
        });
    }
}

module.exports = { registerEngineOptionsIpc };
