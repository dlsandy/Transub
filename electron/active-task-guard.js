/**
 * Detect / stop heavy work when the user tries to close or quit the app.
 */

function computeLock() {
    return require('./compute-task-lock');
}

function twai() {
    return require('./transwithai-bridge');
}

/** @returns {boolean} */
function hasActiveTask() {
    try {
        if (computeLock().isBusy()) return true;
    } catch (_) { /* ignore */ }
    try {
        if (twai().isSubtitleJobRunning()) return true;
    } catch (_) { /* ignore */ }
    return false;
}

/** @returns {string} */
function getActiveTaskLabel() {
    try {
        const status = computeLock().getStatus();
        if (status?.busy && status.label) return String(status.label);
    } catch (_) { /* ignore */ }
    try {
        if (twai().isSubtitleJobRunning()) return '字幕生成任务';
    } catch (_) { /* ignore */ }
    return '任务';
}

function stopActiveJobs() {
    try {
        twai().stopSubtitleJobs();
    } catch (_) { /* ignore */ }
    try {
        require('./engine-bridge').stopEngineJobs();
    } catch (_) { /* ignore */ }
    try {
        require('./advanced-bridge').cancelContextReconstruct();
    } catch (_) { /* ignore */ }
    try {
        require('./sakura-translate').cancelSakuraTranslate();
    } catch (_) { /* ignore */ }
    // Belt-and-suspenders: cancel paths already stop these, but force-reclaim on close/quit.
    try {
        require('./advanced-llama-server').stopLlamaServer();
    } catch (_) { /* ignore */ }
}

module.exports = {
    hasActiveTask,
    getActiveTaskLabel,
    stopActiveJobs,
};
