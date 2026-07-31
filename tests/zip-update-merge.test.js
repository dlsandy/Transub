const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    shouldPreserveSitePackageName,
    collectPreserveRelPaths,
    findPackageRoot,
    applyZipUpdateMerge,
    rimrafSafe,
} = require('../electron/zip-update-merge');

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('zip-update-merge', () => {
    it('matches site-package names that must be preserved', () => {
        assert.strictEqual(shouldPreserveSitePackageName('nvidia'), true);
        assert.strictEqual(shouldPreserveSitePackageName('nvidia_cublas_cu12'), true);
        assert.strictEqual(shouldPreserveSitePackageName('torch'), true);
        assert.strictEqual(shouldPreserveSitePackageName('torch-2.4.0.dist-info'), true);
        assert.strictEqual(shouldPreserveSitePackageName('torchaudio'), true);
        assert.strictEqual(shouldPreserveSitePackageName('onnxruntime'), true);
        assert.strictEqual(shouldPreserveSitePackageName('ctranslate2'), true);
        assert.strictEqual(shouldPreserveSitePackageName('faster_whisper'), true);
        assert.strictEqual(shouldPreserveSitePackageName('demucs'), true);
        assert.strictEqual(shouldPreserveSitePackageName('demucs-4.0.0.dist-info'), true);
        assert.strictEqual(shouldPreserveSitePackageName('requests'), false);
        assert.strictEqual(shouldPreserveSitePackageName('numpy'), true);
        assert.strictEqual(shouldPreserveSitePackageName('numpy-2.0.0.dist-info'), true);
        assert.strictEqual(shouldPreserveSitePackageName('av'), true);
        assert.strictEqual(shouldPreserveSitePackageName('tokenizers'), true);
        assert.strictEqual(shouldPreserveSitePackageName('torchvision'), true);
    });

    it('collects models, advanced-llm and heavy site-packages under install root', () => {
        const root = makeTempDir('transub-preserve-');
        try {
            const models = path.join(root, 'transub-engine', 'models', 'asr', 'foo');
            fs.mkdirSync(models, { recursive: true });
            fs.writeFileSync(path.join(models, 'model.bin'), 'user-model');
            const llm = path.join(root, 'advanced-llm', 'models');
            fs.mkdirSync(llm, { recursive: true });
            fs.writeFileSync(path.join(llm, 'x.gguf'), 'gguf');
            const site = path.join(root, 'transub-engine', 'runtime', 'Lib', 'site-packages');
            fs.mkdirSync(path.join(site, 'nvidia', 'cublas'), { recursive: true });
            fs.writeFileSync(path.join(site, 'nvidia', 'cublas', 'x.dll'), 'gpu');
            fs.mkdirSync(path.join(site, 'requests'), { recursive: true });
            fs.writeFileSync(path.join(site, 'requests', 'x.py'), 'keep-from-package');

            const rels = collectPreserveRelPaths(root);
            assert.ok(rels.some((r) => r.replace(/\\/g, '/').endsWith('transub-engine/models')
                || r.replace(/\\/g, '/') === 'transub-engine/models'));
            assert.ok(rels.some((r) => r === 'advanced-llm' || r.replace(/\\/g, '/') === 'advanced-llm'));
            assert.ok(rels.some((r) => /site-packages[\\/]+nvidia$/i.test(r)));
            assert.ok(!rels.some((r) => /requests/i.test(r)));
        } finally {
            rimrafSafe(root);
        }
    });

    it('finds package root with nested folder', () => {
        const extract = makeTempDir('transub-extract-');
        try {
            const nested = path.join(extract, 'Transub-2.0.0-win');
            fs.mkdirSync(nested, { recursive: true });
            fs.writeFileSync(path.join(nested, 'Transub.exe'), 'exe');
            assert.strictEqual(findPackageRoot(extract), nested);
        } finally {
            rimrafSafe(extract);
        }
    });

    it('merges package while preserving models, nvidia packages and advanced-llm', () => {
        const install = makeTempDir('transub-install-');
        const pkg = makeTempDir('transub-pkg-');
        try {
            // Current install with user data
            fs.mkdirSync(path.join(install, 'transub-engine', 'models', 'asr'), { recursive: true });
            fs.writeFileSync(path.join(install, 'transub-engine', 'models', 'asr', 'weights.bin'), 'KEEP-ME');
            const site = path.join(install, 'transub-engine', 'runtime', 'Lib', 'site-packages');
            fs.mkdirSync(path.join(site, 'nvidia'), { recursive: true });
            fs.writeFileSync(path.join(site, 'nvidia', 'marker.txt'), 'CUDA');
            fs.mkdirSync(path.join(site, 'requests'), { recursive: true });
            fs.writeFileSync(path.join(site, 'requests', 'old.py'), 'old-requests');
            fs.mkdirSync(path.join(install, 'advanced-llm', 'models'), { recursive: true });
            fs.writeFileSync(path.join(install, 'advanced-llm', 'models', 'local.gguf'), 'GGUF-KEEP');
            fs.mkdirSync(path.join(install, 'advanced-llm', 'runtime'), { recursive: true });
            fs.writeFileSync(path.join(install, 'advanced-llm', 'runtime', 'llama-server.exe'), 'LLM-RT');
            fs.writeFileSync(path.join(install, 'Transub.exe'), 'old-exe');
            fs.writeFileSync(path.join(install, 'old-only.txt'), 'stale');

            // New package (ships tiny models placeholder + would clobber advanced-llm if not preserved)
            fs.mkdirSync(path.join(pkg, 'transub-engine', 'models'), { recursive: true });
            fs.writeFileSync(path.join(pkg, 'transub-engine', 'models', '.gitkeep'), '');
            fs.mkdirSync(path.join(pkg, 'transub-engine', 'runtime', 'Lib', 'site-packages', 'requests'), { recursive: true });
            fs.writeFileSync(
                path.join(pkg, 'transub-engine', 'runtime', 'Lib', 'site-packages', 'requests', 'new.py'),
                'new-requests',
            );
            fs.mkdirSync(path.join(pkg, 'advanced-llm', 'models'), { recursive: true });
            fs.writeFileSync(path.join(pkg, 'advanced-llm', 'models', 'shipped.txt'), 'SHOULD-NOT-WIN');
            fs.writeFileSync(path.join(pkg, 'Transub.exe'), 'new-exe');
            fs.writeFileSync(path.join(pkg, 'resources.pak'), 'pak');

            const result = applyZipUpdateMerge({
                installRoot: install,
                packageRoot: pkg,
            });
            assert.strictEqual(result.ok, true);
            assert.strictEqual(
                fs.readFileSync(path.join(install, 'transub-engine', 'models', 'asr', 'weights.bin'), 'utf8'),
                'KEEP-ME',
            );
            assert.strictEqual(
                fs.readFileSync(path.join(install, 'transub-engine', 'runtime', 'Lib', 'site-packages', 'nvidia', 'marker.txt'), 'utf8'),
                'CUDA',
            );
            assert.strictEqual(
                fs.readFileSync(path.join(install, 'advanced-llm', 'models', 'local.gguf'), 'utf8'),
                'GGUF-KEEP',
            );
            assert.strictEqual(
                fs.readFileSync(path.join(install, 'advanced-llm', 'runtime', 'llama-server.exe'), 'utf8'),
                'LLM-RT',
            );
            assert.ok(!fs.existsSync(path.join(install, 'advanced-llm', 'models', 'shipped.txt')));
            assert.strictEqual(fs.readFileSync(path.join(install, 'Transub.exe'), 'utf8'), 'new-exe');
            assert.strictEqual(fs.readFileSync(path.join(install, 'resources.pak'), 'utf8'), 'pak');
            assert.strictEqual(
                fs.readFileSync(
                    path.join(install, 'transub-engine', 'runtime', 'Lib', 'site-packages', 'requests', 'new.py'),
                    'utf8',
                ),
                'new-requests',
            );
        } finally {
            rimrafSafe(install);
            rimrafSafe(pkg);
        }
    });

    it('unions stale preserveRelPaths with a fresh scan at apply time', () => {
        const install = makeTempDir('transub-install-fresh-');
        const pkg = makeTempDir('transub-pkg-fresh-');
        try {
            fs.writeFileSync(path.join(install, 'Transub.exe'), 'old');
            fs.mkdirSync(path.join(install, 'transub-engine', 'models'), { recursive: true });
            fs.writeFileSync(path.join(install, 'transub-engine', 'models', 'a.bin'), 'MODEL');
            const site = path.join(install, 'transub-engine', 'runtime', 'Lib', 'site-packages', 'torch');
            fs.mkdirSync(site, { recursive: true });
            fs.writeFileSync(path.join(site, 'x.py'), 'TORCH');

            fs.writeFileSync(path.join(pkg, 'Transub.exe'), 'new');
            fs.mkdirSync(path.join(pkg, 'transub-engine', 'models'), { recursive: true });
            fs.writeFileSync(path.join(pkg, 'transub-engine', 'models', 'b.bin'), 'PKG');
            fs.mkdirSync(path.join(pkg, 'transub-engine', 'runtime', 'Lib', 'site-packages', 'torch'), { recursive: true });
            fs.writeFileSync(path.join(pkg, 'transub-engine', 'runtime', 'Lib', 'site-packages', 'torch', 'x.py'), 'PKG-TORCH');

            // Stale list omitted torch (installed after download snapshot)
            applyZipUpdateMerge({
                installRoot: install,
                packageRoot: pkg,
                preserveRelPaths: [path.join('transub-engine', 'models')],
            });
            assert.strictEqual(
                fs.readFileSync(path.join(install, 'transub-engine', 'models', 'a.bin'), 'utf8'),
                'MODEL',
            );
            assert.strictEqual(
                fs.readFileSync(path.join(install, 'transub-engine', 'runtime', 'Lib', 'site-packages', 'torch', 'x.py'), 'utf8'),
                'TORCH',
            );
        } finally {
            rimrafSafe(install);
            rimrafSafe(pkg);
        }
    });
});
