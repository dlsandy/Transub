/**
 * Compute-task lock status / force-release / cancel IPC.
 * Extracted from engine-bridge to keep the monolith thin.
 */

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {object} host
 * @param {() => any} host.getEngineProc
 * @param {() => string} host.getEngineBaseUrl
 * @param {() => boolean} host.isBatchRunning
 * @param {() => void} host.stopEngineJobs
 */
function registerEngineComputeIpc(register, host = {}) {
    if (typeof register !== 'function') return;
    const {
        getEngineProc,
        getEngineBaseUrl,
        isBatchRunning,
        stopEngineJobs,
    } = host;

    register('transub-compute-task-status', async (_event, opts = {}) => {
        const computeLock = require('./compute-task-lock');
        const explicitUrl = String(opts?.engineUrl || '').trim().replace(/\/+$/, '');
        if (explicitUrl) {
            computeLock.setEngineLockBaseUrl(explicitUrl);
        } else if (getEngineProc() && getEngineBaseUrl()) {
            // Only pin the live child URL — avoid probing DEFAULT when engine never started.
            computeLock.setEngineLockBaseUrl(getEngineBaseUrl());
        }
        let llamaServer = null;
        try {
            const st = require('./advanced-llama-server').getServerState?.();
            if (st) {
                llamaServer = {
                    modelId: st.modelId || '',
                    nGpuLayers: st.nGpuLayers,
                    parallelSlots: st.parallelSlots,
                    backend: Number(st.nGpuLayers) > 0 ? 'cuda' : 'cpu',
                };
            }
        } catch { /* ignore */ }
        return {
            ok: true,
            ...computeLock.getStatus(),
            batchRunning: !!isBatchRunning(),
            llamaServer,
        };
    });
    register('transub-compute-task-force-release', async () => {
        const computeLock = require('./compute-task-lock');
        const before = computeLock.getStatus();
        const res = computeLock.forceRelease();
        return { ok: true, released: !!res?.released, before };
    });
    register('transub-compute-task-cancel', async () => {
        const computeLock = require('./compute-task-lock');
        const before = computeLock.getStatus();
        try {
            require('./active-task-guard').stopActiveJobs();
        } catch {
            // Fallback if guard fails: still cancel engine jobs from this module.
            try { stopEngineJobs(); } catch { /* ignore */ }
        }
        // Do not forceRelease here — holders release in finally; avoids orphaning mid-cancel.
        return {
            ok: true,
            stopped: true,
            before: before?.busy ? before : null,
            busy: !!computeLock.getStatus()?.busy,
        };
    });
}

module.exports = { registerEngineComputeIpc };
