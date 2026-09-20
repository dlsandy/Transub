const assert = require('assert');
const {
    compareVersions,
    normalizeReleaseNotes,
    releaseVersion,
    GITCODE_OWNER,
    GITCODE_REPO,
    WEBSITE_UPDATES_BASE,
    websiteUpdateAssetUrl,
    appendWebsiteUpdateUrls,
    getCurrentVersion,
    getInstallKind,
    isPortableBuild,
    canUseElectronUpdater,
    canAutoInstallZip,
    buildUpdateFailure,
    formatUpdateFailureMeta,
    normalizeUpdateSource,
    filterUrlsByUpdateSource,
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

    it('parses release version tags and exposes mirror host constants', () => {
        assert.strictEqual(releaseVersion({ tag_name: 'v3.0.1' }), '3.0.1');
        assert.strictEqual(releaseVersion({ name: '3.0.0' }), '3.0.0');
        assert.strictEqual(GITCODE_OWNER, 'AndyDai');
        assert.strictEqual(GITCODE_REPO, 'Transub');
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

    it('filterUrlsByUpdateSource excludes website mirrors and honors pinned nodes', () => {
        const urls = [
            'https://github.com/dlsandy/Transub/releases/download/v3.0.3/Transub-3.0.3-win.zip',
            'https://gitcode.com/AndyDai/Transub/releases/download/v3.0.3/Transub-3.0.3-win.zip',
            'https://www.transub.cc/updates/3.0.3/Transub-3.0.3-win.zip',
        ];
        assert.deepStrictEqual(
            filterUrlsByUpdateSource(urls, 'auto').filter((u) => /transub\.cc/i.test(u)),
            [],
        );
        assert.strictEqual(filterUrlsByUpdateSource(urls, 'github').length, 1);
        assert.ok(/github\.com/i.test(filterUrlsByUpdateSource(urls, 'github')[0]));
        assert.strictEqual(filterUrlsByUpdateSource(urls, 'gitcode').length, 1);
        assert.ok(/gitcode\.com/i.test(filterUrlsByUpdateSource(urls, 'gitcode')[0]));
    });

    it('normalizeUpdateSource accepts known node ids and maps legacy codeberg to auto', () => {
        assert.strictEqual(normalizeUpdateSource('GitCode'), 'gitcode');
        assert.strictEqual(normalizeUpdateSource('codeberg'), 'auto');
        assert.strictEqual(normalizeUpdateSource(''), 'auto');
        assert.strictEqual(normalizeUpdateSource('unknown'), 'auto');
    });

    it('exposes GitCode release constants for the domestic mirror channel', () => {
        assert.strictEqual(GITCODE_OWNER, 'AndyDai');
        assert.strictEqual(GITCODE_REPO, 'Transub');
        assert.ok(String(require('../electron/app-updater').GITCODE_RELEASES_URL).includes('gitcode.com'));
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

    it('buildUpdateFailure attaches structured diagnostic fields', () => {
        const err = Object.assign(new Error('增量包校验失败: a.zip'), {
            code: 'checksum',
            expectedSha: 'deadbeef',
            gotSha: 'cafebabe',
        });
        const fail = buildUpdateFailure(err, { preferredSource: 'GitCode', triedSources: ['GitHub', 'GitCode'] });
        assert.strictEqual(fail.ok, false);
        assert.strictEqual(fail.code, 'checksum');
        assert.strictEqual(fail.expectedSha, 'deadbeef');
        assert.ok(formatUpdateFailureMeta(fail).includes('GitCode'));
        assert.ok(formatUpdateFailureMeta(fail).includes('校验失败'));
    });
});
