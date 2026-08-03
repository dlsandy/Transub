const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    assignBlock,
    assignComponent,
    buildManifestFromDir,
    diffManifests,
    shouldUseFullZip,
    estimateIncrementalDownloadBytes,
    pickManifestAsset,
    pickBlockAsset,
    pickComponentAsset,
    pickDeltaAsset,
    writeBaseline,
    tryReadBaseline,
    verifyArchiveSha256,
    blockZipName,
    componentZipName,
    deltaZipName,
    FULL_ZIP_BYTE_RATIO,
    MANIFEST_FORMAT,
    sha256File,
} = require('../electron/update-manifest-core');
const { pickZipAsset: pickZipFromUpdater } = require('../electron/app-updater');
const { applyZipUpdateMerge, rimrafSafe } = require('../electron/zip-update-merge');

describe('update-manifest-core', () => {
    it('assigns blocks by path', () => {
        assert.strictEqual(assignBlock('resources/app.asar'), 'app');
        assert.strictEqual(assignBlock('_advanced/mod.js'), 'app');
        assert.strictEqual(assignBlock('Transub.exe'), 'shell');
        assert.strictEqual(assignBlock('locales/en-US.pak'), 'shell');
        assert.strictEqual(assignBlock('transub-engine/runtime/python.exe'), 'engine');
        assert.strictEqual(assignBlock('_internal/bin/ffmpeg.exe'), 'other');
        assert.strictEqual(assignBlock('docs/readme.txt'), 'other');
        // Deprecated alias still maps via assignBlock
        assert.strictEqual(assignComponent('Transub.exe'), 'shell');
    });

    it('builds a block-only manifest, diffs digests, and writes baseline', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-manifest-'));
        try {
            fs.mkdirSync(path.join(root, 'resources'), { recursive: true });
            fs.writeFileSync(path.join(root, 'Transub.exe'), 'exe-v1');
            fs.writeFileSync(path.join(root, 'resources', 'app.asar'), 'asar-v1');
            fs.mkdirSync(path.join(root, 'transub-engine'), { recursive: true });
            fs.writeFileSync(path.join(root, 'transub-engine', 'a.py'), 'print(1)\n');

            const manifest = buildManifestFromDir(root, {
                version: '9.9.9',
                fullZipName: 'Transub-9.9.9-win.zip',
                fullZipBytes: 1000,
            });
            assert.strictEqual(manifest.format, MANIFEST_FORMAT);
            assert.strictEqual(manifest.version, '9.9.9');
            assert.ok(!Array.isArray(manifest.files));
            assert.ok(manifest.blocks.app.fileCount >= 1);
            assert.ok(manifest.blocks.shell.fileCount >= 1);
            assert.ok(manifest.blocks.engine.fileCount >= 1);
            assert.ok(String(manifest.blocks.app.sha256).length === 64);

            const baseline = structuredClone(manifest);
            const remote = structuredClone(manifest);
            remote.blocks.app = {
                ...remote.blocks.app,
                sha256: 'a'.repeat(64),
                bytes: 99,
            };

            const diff = diffManifests(baseline, remote);
            assert.deepStrictEqual(diff.dirtyBlocks, ['app']);
            assert.deepStrictEqual(diff.changedFiles, []);
            assert.strictEqual(diff.downloadBytes, 99);
            assert.strictEqual(shouldUseFullZip(diff, 1000, {
                hasBaseline: true,
                remoteManifest: remote,
            }), false);
            assert.strictEqual(shouldUseFullZip(diff, 100, {
                hasBaseline: true,
                remoteManifest: remote,
            }), true);
            assert.strictEqual(shouldUseFullZip(diff, 1000, { hasBaseline: false }), true);

            const install = path.join(root, 'install');
            fs.mkdirSync(path.join(install, 'resources'), { recursive: true });
            writeBaseline(install, manifest);
            const loaded = tryReadBaseline(install);
            assert.strictEqual(loaded.version, '9.9.9');
            assert.ok(loaded.blocks.app.sha256);
            assert.ok(!Array.isArray(loaded.files));
        } finally {
            rimrafSafe(root);
        }
    });

    it('prefers delta zip bytes for full-zip heuristic', () => {
        const remoteManifest = {
            blocks: {
                engine: { name: 'e.zip', bytes: 5_000_000_000, sha256: 'b'.repeat(64), fileCount: 1 },
            },
            deltaZipBytes: 0,
        };
        const diff = {
            dirtyBlocks: ['engine'],
            dirtyComponents: ['engine'],
            downloadBytes: 5_000_000_000,
            changedFiles: [],
        };
        assert.strictEqual(
            estimateIncrementalDownloadBytes(diff, remoteManifest),
            5_000_000_000,
        );
        assert.strictEqual(
            shouldUseFullZip(diff, 50_000_000, {
                hasBaseline: true,
                remoteManifest,
            }),
            true,
        );
        // Small delta zip stays incremental even if engine block is huge
        assert.strictEqual(
            shouldUseFullZip(diff, 50_000_000, {
                hasBaseline: true,
                deltaZipBytes: 12_000,
                remoteManifest: {
                    ...remoteManifest,
                    deltaZipBytes: 12_000,
                },
            }),
            false,
        );
        // Oversized delta falls back to full
        assert.strictEqual(
            shouldUseFullZip(diff, 50_000_000, {
                hasBaseline: true,
                deltaZipBytes: 40_000_000,
            }),
            true,
        );
    });

    it('picks manifest / block / delta / full zip assets', () => {
        const release = {
            assets: [
                { name: 'Transub-1.0.0-win-app.zip', browser_download_url: 'https://x/app.zip' },
                { name: 'Transub-1.0.0-win-shell.zip', browser_download_url: 'https://x/shell.zip' },
                { name: 'Transub-1.0.0-win-delta.zip', browser_download_url: 'https://x/delta.zip' },
                { name: 'Transub-1.0.0-win-cpu.zip', browser_download_url: 'https://x/cpu.zip' },
                { name: 'Transub-1.0.0-win-cuda.zip', browser_download_url: 'https://x/cuda.zip' },
                { name: 'Transub-1.0.0-Win-CPU完整版.zip', browser_download_url: 'https://x/cpu2.zip' },
                { name: 'Transub-1.0.0-win.zip', browser_download_url: 'https://x/full.zip' },
                { name: 'Transub-1.0.0-Win-标准版.zip', browser_download_url: 'https://x/std.zip' },
                { name: 'Transub-1.0.0-update-manifest.json', browser_download_url: 'https://x/m.json' },
            ],
        };
        assert.strictEqual(pickManifestAsset(release).name, 'Transub-1.0.0-update-manifest.json');
        assert.strictEqual(pickBlockAsset(release, 'app', '1.0.0').name, 'Transub-1.0.0-win-app.zip');
        assert.strictEqual(pickComponentAsset(release, 'shell', '1.0.0').name, 'Transub-1.0.0-win-shell.zip');
        assert.strictEqual(pickDeltaAsset(release, '1.0.0').name, 'Transub-1.0.0-win-delta.zip');
        assert.strictEqual(pickZipFromUpdater(release).name, 'Transub-1.0.0-win.zip');
        assert.strictEqual(blockZipName('1.0.0', 'engine'), 'Transub-1.0.0-win-engine.zip');
        assert.strictEqual(componentZipName('1.0.0', 'engine'), 'Transub-1.0.0-win-engine.zip');
        assert.strictEqual(deltaZipName('1.0.0'), 'Transub-1.0.0-win-delta.zip');
        assert.ok(FULL_ZIP_BYTE_RATIO > 0.5);

        // Legacy electron → shell
        const legacy = {
            assets: [
                { name: 'Transub-1.0.0-win-electron.zip', browser_download_url: 'https://x/e.zip' },
            ],
        };
        assert.strictEqual(pickBlockAsset(legacy, 'shell', '1.0.0').name, 'Transub-1.0.0-win-electron.zip');
    });

    it('never auto-updates from CPU/CUDA/delta/block zips as full target', () => {
        const { isAutoUpdateFullZipName } = require('../electron/app-updater');
        const { isAutoUpdateFullZipName: fromTools } = require('../tools/win-edition-wheels');
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-win.zip'), true);
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-Win-标准版.zip'), true);
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-win-cpu.zip'), false);
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-Win-CPU完整版.zip'), false);
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-win-cuda.zip'), false);
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-Win-CUDA显卡版.zip'), false);
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-官网更新包.zip'), false);
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-update.zip'), false);
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-win-engine.zip'), false);
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-win-shell.zip'), false);
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-win-other.zip'), false);
        assert.strictEqual(isAutoUpdateFullZipName('Transub-1.0.0-win-delta.zip'), false);
        assert.strictEqual(fromTools('Transub-1.0.0-win.zip'), true);
        assert.strictEqual(fromTools('Transub-1.0.0-Win-标准版.zip'), true);
        assert.strictEqual(fromTools('Transub-1.0.0-win-cpu.zip'), false);
        assert.strictEqual(fromTools('Transub-1.0.0-Win-CPU完整版.zip'), false);
        assert.strictEqual(fromTools('Transub-1.0.0-win-delta.zip'), false);
        assert.strictEqual(fromTools('Transub-1.0.0-win-shell.zip'), false);
        const onlyEditions = {
            assets: [
                { name: 'Transub-1.0.0-Win-CPU完整版.zip', browser_download_url: 'https://x/cpu.zip' },
                { name: 'Transub-1.0.0-Win-CUDA显卡版.zip', browser_download_url: 'https://x/cuda.zip' },
            ],
        };
        assert.strictEqual(pickZipFromUpdater(onlyEditions), null);
    });

    it('verifies archive sha256 and applies partial merge', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-partial-'));
        try {
            const install = path.join(root, 'install');
            const pkg = path.join(root, 'pkg');
            fs.mkdirSync(path.join(install, 'resources'), { recursive: true });
            fs.mkdirSync(path.join(pkg, 'resources'), { recursive: true });
            fs.writeFileSync(path.join(install, 'Transub.exe'), 'old-exe');
            fs.writeFileSync(path.join(install, 'resources', 'app.asar'), 'old-asar');
            fs.writeFileSync(path.join(pkg, 'resources', 'app.asar'), 'new-asar');

            const archive = path.join(root, 'block.zip');
            fs.writeFileSync(archive, 'fake-zip-bytes');
            const sha = sha256File(archive);
            verifyArchiveSha256(archive, sha);
            assert.throws(() => verifyArchiveSha256(archive, '0'.repeat(64)));

            applyZipUpdateMerge({
                installRoot: install,
                packageRoot: pkg,
                allowPartial: true,
            });
            assert.strictEqual(
                fs.readFileSync(path.join(install, 'resources', 'app.asar'), 'utf8'),
                'new-asar',
            );
            assert.strictEqual(
                fs.readFileSync(path.join(install, 'Transub.exe'), 'utf8'),
                'old-exe',
            );
        } finally {
            rimrafSafe(root);
        }
    });
});
