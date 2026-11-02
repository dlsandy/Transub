/**
 * IPC for Pro Jev API key (thin; logic in jev-runtime).
 */
function registerJevIpc(register, runtime) {
    if (typeof register !== 'function' || !runtime) return;

    register('transub-advanced-save-jev', async (_event, payload = {}) => (
        runtime.saveJevConfig(payload || {})
    ));
    register('transub-advanced-clear-jev-key', async () => runtime.clearJevKey());
    register('transub-advanced-test-jev', async (_event, payload = {}) => (
        runtime.testJev(payload || {})
    ));
    register('transub-advanced-probe-jev', async (_event, payload = {}) => (
        runtime.probeJev(payload || {})
    ));
    const local = require('./jev-local-service');
    register('transub-advanced-laya-local-status', async (_event, payload = {}) => (
        local.getLocalLayaStatus(payload || {})
    ));
    register('transub-advanced-laya-install', async (_event, payload = {}) => (
        local.installLocalLaya(payload || {})
    ));
    register('transub-advanced-laya-start', async (_event, payload = {}) => (
        local.startLocalLaya(payload || {})
    ));
}

module.exports = {
    registerJevIpc,
};
