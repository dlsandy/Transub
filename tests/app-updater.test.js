const assert = require('assert');
const {
    compareVersions,
    getCurrentVersion,
} = require('../electron/app-updater');

describe('app-updater', () => {
    it('compares semver versions', () => {
        assert.strictEqual(compareVersions('1.3.1', '1.3.0'), 1);
        assert.strictEqual(compareVersions('1.3.0', '1.3.0'), 0);
        assert.strictEqual(compareVersions('1.2.9', '1.3.0'), -1);
        assert.strictEqual(compareVersions('v2.0.0', '1.9.9'), 1);
    });

    it('reads a current version string', () => {
        const v = getCurrentVersion();
        assert.ok(typeof v === 'string' && v.length > 0);
        assert.ok(/^\d+\.\d+\.\d+/.test(v));
    });
});
