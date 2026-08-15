const assert = require('assert');
const path = require('path');
const fs = require('fs');
const llamaServer = require('../electron/advanced-llama-server');
const catalog = require('../src/js/advanced-managed-llm-catalog-core');

describe('advanced-llama-server version probe', () => {
    it('parses llama-server --version output', () => {
        assert.strictEqual(
            llamaServer.parseLlamaCppTag('version: 10077 (5735e10c4)\nbuilt with Clang'),
            'b10077',
        );
        assert.strictEqual(
            llamaServer.parseLlamaCppTag('version: 10437 (abcdef123)'),
            'b10437',
        );
        assert.strictEqual(
            llamaServer.parseLlamaCppTag('llama.cpp b9912 release'),
            'b9912',
        );
        assert.strictEqual(llamaServer.parseLlamaCppTag(''), '');
        assert.strictEqual(llamaServer.parseLlamaCppTag('no version here'), '');
        assert.strictEqual(llamaServer.parseLlamaCppTag('version: 0'), '');
        assert.strictEqual(llamaServer.parseLlamaCppTag('version: 99'), '');
    });

    it('resolveInstalledRuntimeTag prefers runtime.json over live --version', () => {
        const tag = llamaServer.resolveInstalledRuntimeTag(
            path.join(__dirname, 'does-not-exist-llama-server.exe'),
            { tag: 'b10437', probedTag: 'b10437' },
        );
        assert.strictEqual(tag, 'b10437');
    });

    it('syncRuntimePreferenceToHardware skips when CUDA is not preferred', () => {
        const prefer = require('../electron/advanced-runtime-prefer');
        prefer._resetForTests({ preferCuda: false, ready: true, gpuName: '', cudaVersion: '' });
        const res = llamaServer.syncRuntimePreferenceToHardware();
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.skipped, true);
        assert.strictEqual(res.reason, 'no_cuda');
    });

    it('getDefaultRuntimeId matches CUDA major from hints', () => {
        assert.strictEqual(
            catalog.getDefaultRuntimeId('win32', 'x64', { preferCuda: true, cudaVersion: '13.3' }),
            'win-cuda13-x64',
        );
        assert.strictEqual(
            catalog.getDefaultRuntimeId('win32', 'x64', { preferCuda: true, cudaVersion: '12.8' }),
            'win-cuda12-x64',
        );
    });

    it('probes local runtime binary when present', () => {
        const exe = path.join(__dirname, '..', 'advanced-llm', 'runtime', 'llama-server.exe');
        if (!fs.existsSync(exe)) return;
        const tag = llamaServer.probeLlamaServerTag(exe);
        // CUDA builds may exceed the short probe budget; empty tag is acceptable.
        if (!tag) return;
        assert.ok(/^b\d{4,}$/.test(tag), `unexpected tag: ${tag}`);
        // 本机若仍是旧构建，状态应标记可更新
        if (tag !== catalog.LLAMA_CPP_TAG) {
            const status = llamaServer.getRuntimeStatus({ runtimeId: 'win-cuda12-x64' });
            if (status.installed && status.exePath === exe) {
                assert.strictEqual(status.installedTag, tag);
                assert.strictEqual(status.outdated, true);
                assert.ok(String(status.message).includes(`可更新至 ${catalog.LLAMA_CPP_TAG}`));
            }
        }
    });
});

describe('advanced-llama-server companion reuse', () => {
    const os = require('os');
    let tmpDir = '';

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-cudart-reuse-'));
    });

    afterEach(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    });

    it('resolves stable companion id from package url', () => {
        const cuda13 = catalog.getRuntimePackage('win32', 'x64', 'win-cuda13-x64');
        assert.strictEqual(
            llamaServer.resolveCompanionId(cuda13),
            'cudart-llama-bin-win-cuda-13.3-x64',
        );
        const cuda12 = catalog.getRuntimePackage('win32', 'x64', 'win-cuda12-x64');
        assert.strictEqual(
            llamaServer.resolveCompanionId(cuda12),
            'cudart-llama-bin-win-cuda-12.4-x64',
        );
        assert.strictEqual(llamaServer.resolveCompanionCudaMajor('cudart-llama-bin-win-cuda-13.3-x64'), 13);
        assert.strictEqual(llamaServer.resolveCompanionCudaMajor('', 'win-cuda12-x64'), 12);
    });

    it('reuses cudart when same package and marker dlls exist', () => {
        const pkg = catalog.getRuntimePackage('win32', 'x64', 'win-cuda13-x64');
        fs.writeFileSync(path.join(tmpDir, 'cudart64_13.dll'), 'x');
        fs.writeFileSync(path.join(tmpDir, 'cublas64_13.dll'), 'x');
        assert.strictEqual(
            llamaServer.canReuseInstalledCompanion(
                pkg,
                { packageId: 'win-cuda13-x64', tag: 'b10000' },
                tmpDir,
            ),
            true,
        );
        assert.strictEqual(
            llamaServer.canReuseInstalledCompanion(
                pkg,
                { packageId: 'win-cuda13-x64', companionId: 'cudart-llama-bin-win-cuda-13.3-x64' },
                tmpDir,
                { force: true },
            ),
            true,
        );
    });

    it('does not reuse when cuda major changes or files missing', () => {
        const pkg13 = catalog.getRuntimePackage('win32', 'x64', 'win-cuda13-x64');
        fs.writeFileSync(path.join(tmpDir, 'cudart64_12.dll'), 'x');
        assert.strictEqual(
            llamaServer.canReuseInstalledCompanion(
                pkg13,
                { packageId: 'win-cuda12-x64', companionId: 'cudart-llama-bin-win-cuda-12.4-x64' },
                tmpDir,
            ),
            false,
        );
        assert.strictEqual(
            llamaServer.canReuseInstalledCompanion(
                pkg13,
                { packageId: 'win-cuda13-x64' },
                tmpDir,
            ),
            false,
        );
        assert.strictEqual(
            llamaServer.canReuseInstalledCompanion(
                pkg13,
                { packageId: 'win-cuda13-x64' },
                tmpDir,
                { reinstall: true },
            ),
            false,
        );
    });

    it('preserves companion artifacts for restore after runtime replace', () => {
        fs.writeFileSync(path.join(tmpDir, 'cudart64_13.dll'), 'keep-me');
        fs.writeFileSync(path.join(tmpDir, 'ggml-cuda.dll'), 'main-pkg');
        const keep = path.join(tmpDir, 'keep');
        const res = llamaServer.preserveCompanionArtifacts(tmpDir, keep);
        assert.strictEqual(res.ok, true);
        assert.ok(res.files.some((f) => /cudart64_13\.dll$/i.test(f)));
        assert.strictEqual(fs.readFileSync(path.join(keep, 'cudart64_13.dll'), 'utf8'), 'keep-me');
        assert.ok(!fs.existsSync(path.join(keep, 'ggml-cuda.dll')));
    });
});
