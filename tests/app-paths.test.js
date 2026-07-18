const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    getProjectRoot,
    getWritableRoot,
    getInstallRoot,
} = require('../electron/app-paths');
const { isPathInsideInstallTree } = require('../electron/ffmpeg-bridge');

describe('app-paths writable root', () => {
    it('uses PORTABLE_EXECUTABLE_DIR when set', () => {
        const portable = path.join(os.tmpdir(), 'transub-portable-home');
        const root = getWritableRoot({ PORTABLE_EXECUTABLE_DIR: portable });
        assert.strictEqual(root, path.resolve(portable));
    });

    it('falls back to project root when not packaged and not portable', () => {
        const env = { ...process.env };
        delete env.PORTABLE_EXECUTABLE_DIR;
        const root = getWritableRoot(env);
        assert.strictEqual(root, getProjectRoot());
    });

    it('exposes install root separately from project root shape', () => {
        const install = getInstallRoot();
        assert.ok(typeof install === 'string' && install.length > 0);
        assert.ok(fs.existsSync(install) || install === getProjectRoot());
    });
});

describe('ffmpeg install-tree guard', () => {
    it('detects paths under the install / project root', () => {
        const root = getInstallRoot();
        assert.strictEqual(isPathInsideInstallTree(path.join(root, '_internal', 'bin')), true);
        assert.strictEqual(isPathInsideInstallTree(path.join(root, 'ffmpeg.exe')), true);
    });

    it('allows paths outside the install tree', () => {
        const outside = path.join(os.tmpdir(), 'external-ffmpeg-bin');
        assert.strictEqual(isPathInsideInstallTree(outside), false);
    });

    it('ignores empty paths', () => {
        assert.strictEqual(isPathInsideInstallTree(''), false);
        assert.strictEqual(isPathInsideInstallTree(null), false);
    });
});
