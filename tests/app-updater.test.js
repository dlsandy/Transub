const assert = require('assert');
const {
    compareVersions,
    normalizeReleaseNotes,
    releaseVersion,
    CODEBERG_OWNER,
    CODEBERG_REPO,
    WEBSITE_UPDATES_BASE,
    websiteUpdateAssetUrl,
    appendWebsiteUpdateUrls,
    getCurrentVersion,
    getInstallKind,
    isPortableBuild,
    canUseElectronUpdater,
    canAutoInstallZip,
} = require('../electron/app-updater');

describe('app-updater', () => {
    it('compares semver versions', () => {
        assert.strictEqual(compareVersions('1.3.1', '1.3.0'), 1);
        assert.strictEqual(compareVersions('1.3.0', '1.3.0'), 0);
        assert.strictEqual(compareVersions('1.2.9', '1.3.0'), -1);
        assert.strictEqual(compareVersions('v2.0.0', '1.9.9'), 1);
    });

    it('normalizes release notes from string or electron-updater arrays', () => {
        assert.strictEqual(normalizeReleaseNotes('### BUG修复\n- fix'), '### BUG修复\n- fix');
        assert.strictEqual(
            normalizeReleaseNotes([{ version: '3.0.1', note: '- a\n- b' }]),
            '## 3.0.1\n- a\n- b',
        );
        assert.strictEqual(normalizeReleaseNotes(null), '');
        assert.strictEqual(normalizeReleaseNotes(''), '');
    });

    it('parses release version tags and exposes Codeberg mirror constants', () => {
        assert.strictEqual(releaseVersion({ tag_name: 'v3.0.1' }), '3.0.1');
        assert.strictEqual(releaseVersion({ name: '3.0.0' }), '3.0.0');
        assert.strictEqual(CODEBERG_OWNER, 'flyforyou');
        assert.strictEqual(CODEBERG_REPO, 'Transub');
    });

    it('builds official-site update asset URLs under /updates/{version}/', () => {
        assert.strictEqual(WEBSITE_UPDATES_BASE, 'https://www.transub.cc/updates');
        assert.strictEqual(
            websiteUpdateAssetUrl('3.0.3', 'Transub-3.0.3-win.zip'),
            'https://www.transub.cc/updates/3.0.3/Transub-3.0.3-win.zip',
        );
        assert.strictEqual(websiteUpdateAssetUrl('', 'a.zip'), '');
        assert.strictEqual(websiteUpdateAssetUrl('1.0.0', '../x.zip'), '');
    });

    it('appendWebsiteUpdateUrls mirrors discovered zip/manifest/block assets', () => {
        const state = {
            latestVersion: '3.0.3',
            zipName: 'Transub-3.0.3-win.zip',
            zipUrls: ['https://github.com/dlsandy/Transub/releases/download/v3.0.3/Transub-3.0.3-win.zip'],
            manifestName: 'Transub-3.0.3-update-manifest.json',
            manifestUrls: ['https://github.com/dlsandy/Transub/releases/download/v3.0.3/Transub-3.0.3-update-manifest.json'],
            deltaName: '',
            deltaUrls: [],
            componentUrls: {
                shell: ['https://github.com/dlsandy/Transub/releases/download/v3.0.3/Transub-3.0.3-win-shell.zip'],
                app: [],
                engine: [],
                other: [],
            },
        };
        assert.strictEqual(appendWebsiteUpdateUrls(state), true);
        assert.ok(state.zipUrls.some((u) => u.includes('transub.cc/updates/3.0.3/')));
        assert.ok(state.manifestUrls.some((u) => u.includes('transub.cc/updates/3.0.3/')));
        assert.ok(state.componentUrls.shell.some((u) => u.includes('win-shell.zip') && u.includes('transub.cc')));
        assert.strictEqual(state.deltaUrls.length, 0);
        assert.strictEqual(state.componentUrls.app.length, 0);
    });

    it('reads a current version string', () => {
        const v = getCurrentVersion();
        assert.ok(typeof v === 'string' && v.length > 0);
        assert.ok(/^\d+\.\d+\.\d+/.test(v));
    });

    it('reports install kind in unpackaged / portable tests', () => {
        const kind = getInstallKind();
        assert.ok(['dev', 'portable', 'zip', 'nsis', 'unsupported'].includes(kind));
        if (process.platform !== 'win32') {
            assert.strictEqual(kind, 'unsupported');
            assert.strictEqual(canUseElectronUpdater(), false);
            assert.strictEqual(canAutoInstallZip(), false);
            return;
        }
        // Vitest runs unpackaged → dev (unless PORTABLE_EXECUTABLE_DIR is set)
        if (isPortableBuild()) {
            assert.strictEqual(kind, 'portable');
            assert.strictEqual(canAutoInstallZip(), false);
        } else {
            assert.strictEqual(kind, 'dev');
            assert.strictEqual(canUseElectronUpdater(), false);
            assert.strictEqual(canAutoInstallZip(), false);
        }
    });
});
