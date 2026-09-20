/**
 * IPC for mid-batch append / skip / override updates.
 */
function setupLiveBatchBridge(api) {
    const { register } = api;
    const liveBatch = require('./live-batch-queue');

    register('transub-live-batch-append', async (_event, payload = {}) => {
        try {
            return liveBatch.append(payload.items || []);
        } catch (err) {
            return { ok: false, appended: [], total: 0, error: err.message || String(err) };
        }
    });

    register('transub-live-batch-skip', async (_event, payload = {}) => {
        try {
            return liveBatch.skip(payload.paths || []);
        } catch (err) {
            return {
                ok: false,
                skipped: [],
                blocked: [],
                total: 0,
                error: err.message || String(err),
            };
        }
    });

    register('transub-live-batch-update-overrides', async (_event, payload = {}) => {
        try {
            return liveBatch.updateOverrides(
                payload.path || payload.fullPath || '',
                payload.optionOverrides,
            );
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-live-batch-snapshot', async () => {
        try {
            return { ok: true, ...liveBatch.getSnapshot() };
        } catch (err) {
            return {
                ok: false,
                active: false,
                paths: [],
                current: '',
                currentIndex1: 0,
                total: 0,
                skipped: [],
                error: err.message || String(err),
            };
        }
    });
}

module.exports = {
    setupLiveBatchBridge,
};
