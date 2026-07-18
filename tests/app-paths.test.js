const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    getProjectRoot,
    getWritableRoot,
    getInstallRoot,
    findRendererRoot,
    getAppRoot,
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

describe('app-paths renderer root', () => {
    it('finds renderer-dist when index.html is present', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-renderer-'));
        const renderer = path.join(tmp, 'renderer-dist');
        fs.mkdirSync(renderer, { recursive: true });
        fs.writeFileSync(path.join(renderer, 'index.html'), '<html></html>\n');
        assert.strictEqual(findRendererRoot(tmp), renderer);
    });

    it('prefers asar app path over exe-adjacent files when packaged', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-packaged-'));
        const asarRoot = path.join(tmp, 'app');
        const exeDir = path.join(tmp, 'exe');
        const asarRenderer = path.join(asarRoot, 'renderer-dist');
        const looseRenderer = path.join(exeDir, 'renderer-dist');
        fs.mkdirSync(asarRenderer, { recursive: true });
        fs.mkdirSync(looseRenderer, { recursive: true });
        fs.writeFileSync(path.join(asarRenderer, 'index.html'), '<html>asar</html>\n');
        fs.writeFileSync(path.join(looseRenderer, 'index.html'), '<html>loose</html>\n');

        const prevExecPath = process.execPath;
        const prevResources = process.resourcesPath;
        Object.defineProperty(process, 'execPath', {
            configurable: true,
            value: path.join(exeDir, 'Transub.exe'),
        });
        Object.defineProperty(process, 'resourcesPath', {
            configurable: true,
            value: path.join(tmp, 'resources'),
        });
        try {
            const root = getAppRoot({
                isPackaged: true,
                getAppPath: () => asarRoot,
            });
            assert.strictEqual(root, asarRenderer);
        } finally {
            Object.defineProperty(process, 'execPath', {
                configurable: true,
                value: prevExecPath,
            });
            Object.defineProperty(process, 'resourcesPath', {
                configurable: true,
                value: prevResources,
            });
        }
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
