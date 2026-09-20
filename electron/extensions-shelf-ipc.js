/**
 * Subtitle shelf IPC channels (status / list / CRUD / open / preview / scan).
 * Extracted from extensions-bridge to keep the monolith thin.
 */

/**
 * @param {(channel: string, handler: Function) => void} register
 * @param {object} [_deps] reserved for future injection; handlers lazy-require subtitle-shelf
 */
function registerExtensionsShelfIpc(register, _deps = {}) {
    if (typeof register !== 'function') {
        throw new Error('registerExtensionsShelfIpc: register required');
    }

    register('transub-shelf-status', async () => {
        try {
            const { getShelfStatus } = require('./subtitle-shelf');
            return getShelfStatus();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-shelf-list', async (_event, payload = {}) => {
        try {
            const { listMediaSummariesAsync } = require('./subtitle-shelf');
            return await listMediaSummariesAsync({ query: payload?.query || '' });
        } catch (err) {
            return { ok: false, error: err.message || String(err), items: [] };
        }
    });

    register('transub-shelf-get-media', async (_event, payload = {}) => {
        try {
            const { getMediaDetail } = require('./subtitle-shelf');
            return getMediaDetail(payload?.mediaId || '');
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-shelf-delete-media', async (_event, payload = {}) => {
        try {
            const { deleteMedia } = require('./subtitle-shelf');
            return deleteMedia(payload?.mediaId || '');
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-shelf-delete-translation', async (_event, payload = {}) => {
        try {
            const { deleteTranslation } = require('./subtitle-shelf');
            return deleteTranslation(payload?.mediaId || '', payload?.lang || '');
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-shelf-register-translation', async (_event, payload = {}) => {
        try {
            const { registerTranslation } = require('./subtitle-shelf');
            return registerTranslation(
                payload?.mediaId || '',
                payload?.path || payload?.translationPath || '',
                payload?.options || payload || {},
            );
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-shelf-set-media-path', async (_event, payload = {}) => {
        try {
            const { setMediaPath } = require('./subtitle-shelf');
            return setMediaPath(payload?.mediaId || '', payload?.mediaPath || '', {
                clear: !!payload?.clear,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-shelf-rename-media', async (_event, payload = {}) => {
        try {
            const { renameMediaTitle } = require('./subtitle-shelf');
            return renameMediaTitle(payload?.mediaId || '', payload?.title || '');
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-shelf-open-slot', async (_event, payload = {}) => {
        try {
            const { openSlotPaths } = require('./subtitle-shelf');
            return openSlotPaths({
                mediaId: payload?.mediaId || '',
                slot: payload?.slot || '',
                lang: payload?.lang || '',
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-shelf-preview-slot', async (_event, payload = {}) => {
        try {
            const { previewSlot } = require('./subtitle-shelf');
            return previewSlot({
                mediaId: payload?.mediaId || '',
                slot: payload?.slot || '',
                lang: payload?.lang || '',
                limit: payload?.limit,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-shelf-scan-media', async (_event, payload = {}) => {
        try {
            const { scanMediaSidecars } = require('./subtitle-shelf');
            return scanMediaSidecars(payload?.mediaPath || '');
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });
}

module.exports = { registerExtensionsShelfIpc };
