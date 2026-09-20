const assert = require('assert');
const { createPlayerLaunchUi, PLAYER_DOWNLOAD_URL } = require('../src/js/player-launch-ui-core.js');

describe('TransubPlayerLaunchUi', () => {
    it('exports createPlayerLaunchUi and download URL', () => {
        assert.strictEqual(typeof createPlayerLaunchUi, 'function');
        assert.strictEqual(PLAYER_DOWNLOAD_URL, 'https://www.transub.cc/en/#download');
    });

    it('openPlayerApp launches when IPC succeeds', async () => {
        const calls = [];
        const ui = createPlayerLaunchUi({
            electron: {
                transubOpenPlayer: async () => {
                    calls.push('open');
                    return { ok: true, pid: 1 };
                },
            },
            appConfirm: async () => {
                calls.push('confirm');
                return false;
            },
            showToast: () => { calls.push('toast'); },
            uiTf: (s) => s,
        });
        const r = await ui.openPlayerApp();
        assert.strictEqual(r.ok, true);
        assert.deepStrictEqual(calls, ['open']);
    });

    it('openPlayerApp prompts download when not installed', async () => {
        const calls = [];
        const ui = createPlayerLaunchUi({
            electron: {
                transubOpenPlayer: async () => ({
                    ok: false,
                    reason: 'not_installed',
                    error: '未找到 Transub Player',
                    downloadUrl: PLAYER_DOWNLOAD_URL,
                }),
                openExternal: async (url) => {
                    calls.push(['external', url]);
                    return { ok: true };
                },
            },
            appConfirm: async (opts) => {
                calls.push(['confirm', opts.title, opts.primaryLabel]);
                return true;
            },
            showToast: () => { calls.push('toast'); },
            uiTf: (s) => s,
        });
        const r = await ui.openPlayerApp();
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.openedDownload, true);
        assert.strictEqual(calls[0][0], 'confirm');
        assert.strictEqual(calls[1][0], 'external');
        assert.strictEqual(calls[1][1], PLAYER_DOWNLOAD_URL);
    });

    it('openPlayerApp cancels when user declines download', async () => {
        const ui = createPlayerLaunchUi({
            electron: {
                transubOpenPlayer: async () => ({
                    ok: false,
                    reason: 'not_installed',
                    downloadUrl: PLAYER_DOWNLOAD_URL,
                }),
                openExternal: async () => ({ ok: true }),
            },
            appConfirm: async () => false,
            showToast: () => {},
            uiTf: (s) => s,
        });
        const r = await ui.openPlayerApp();
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.cancelled, true);
    });
});
