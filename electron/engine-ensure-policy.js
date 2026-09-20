/**
 * Decide whether ensureEngineRunning may kill/restart the engine child.
 * Opening Settings → 模型 refreshes the catalog via ensureEngineRunning; a short
 * /v1/health timeout while ASR blocks the event loop must not taskkill the job.
 */

const ENGINE_JOB_KINDS = new Set([
    'engine_batch',
    'engine_range',
    'engine_resume',
    'engine_opus_text',
]);

/**
 * @param {string} [kind]
 * @returns {boolean}
 */
function isEngineComputeKind(kind) {
    const k = String(kind || '').trim();
    if (!k) return false;
    if (ENGINE_JOB_KINDS.has(k)) return true;
    return k.startsWith('engine_');
}

/**
 * @param {{
 *   forceRestart?: boolean,
 *   batchRunning?: boolean,
 *   computeBusyKind?: string,
 *   childAlive?: boolean,
 * }} input
 * @returns {{
 *   allowKill: boolean,
 *   allowForceRestart: boolean,
 *   treatAsRunning: boolean,
 *   reason: string,
 * }}
 */
function decideEngineEnsureAction(input = {}) {
    const forceRestart = !!input.forceRestart;
    const batchRunning = !!input.batchRunning;
    const childAlive = !!input.childAlive;
    const busyKind = String(input.computeBusyKind || '').trim();
    const engineJob = batchRunning || isEngineComputeKind(busyKind);

    // Mid-batch ACCESS_VIOLATION / native crash leaves no child — must allow respawn
    // so nested second-opinion / range failover can continue.
    if (engineJob && !childAlive) {
        return {
            allowKill: true,
            allowForceRestart: true,
            treatAsRunning: false,
            reason: 'dead_child_respawn',
        };
    }

    // Explicit forceRestart (Torch reimport poison, post-extras reload, crash recovery)
    // must kill a *live* poisoned child. Catalog / Settings probes use forceRestart=false
    // and still hit compute_busy below.
    if (engineJob && forceRestart) {
        return {
            allowKill: true,
            allowForceRestart: true,
            treatAsRunning: false,
            reason: 'explicit_force_restart',
        };
    }

    if (engineJob) {
        return {
            allowKill: false,
            allowForceRestart: false,
            // Prefer soft-success so list/catalog callers do not spuriously fail
            // while the batch still holds a live child.
            treatAsRunning: true,
            reason: 'compute_busy',
        };
    }

    return {
        allowKill: true,
        allowForceRestart: true,
        treatAsRunning: false,
        reason: 'idle',
    };
}

module.exports = {
    ENGINE_JOB_KINDS,
    isEngineComputeKind,
    decideEngineEnsureAction,
};
