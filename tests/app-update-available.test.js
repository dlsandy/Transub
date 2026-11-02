const assert = require('assert');
const {
    rememberAppUpdateCheckResult,
    getAppUpdateAvailability,
} = require('../electron/app-update-available');

describe('app-update-available', () => {
    it('remembers updateAvailable check results for the titlebar badge', () => {
        rememberAppUpdateCheckResult({
            ok: true,
            updateAvailable: true,
            latestVersion: '9.9.9',
            currentVersion: '9.9.8',
        });
        const notice = getAppUpdateAvailability();
        assert.strictEqual(notice.updateAvailable, true);
        assert.strictEqual(notice.latestVersion, '9.9.9');
        assert.strictEqual(notice.currentVersion, '9.9.8');

        rememberAppUpdateCheckResult({
            ok: true,
            updateAvailable: false,
            latestVersion: '9.9.8',
            currentVersion: '9.9.8',
        });
        const cleared = getAppUpdateAvailability();
        assert.strictEqual(cleared.updateAvailable, false);
        assert.strictEqual(cleared.latestVersion, '');
    });

    it('ignores failed checks', () => {
        rememberAppUpdateCheckResult({
            ok: true,
            updateAvailable: true,
            latestVersion: '1.0.1',
            currentVersion: '1.0.0',
        });
        rememberAppUpdateCheckResult({ ok: false, error: 'network' });
        const notice = getAppUpdateAvailability();
        assert.strictEqual(notice.updateAvailable, true);
        assert.strictEqual(notice.latestVersion, '1.0.1');
    });
});
