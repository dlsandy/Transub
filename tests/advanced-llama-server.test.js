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
            llamaServer.parseLlamaCppTag('version: 10453 (abcdef123)'),
            'b10453',
        );
        assert.strictEqual(
            llamaServer.parseLlamaCppTag('version: 0.3.0 (build 10621, commit c1d0e7a00)\nbuilt with Clang'),
            'b10621',
        );
        assert.strictEqual(
            llamaServer.parseLlamaCppTag('version: 0.3.0 (build 10666, commit abcdef123)\nbuilt with Clang'),
            'b10666',
        );
        assert.strictEqual(
            llamaServer.parseLlamaCppTag('version: 0.4.0 (build 10852, commit abcdef123)\nbuilt with Clang'),
            'b10852',
        );
        assert.strictEqual(
            llamaServer.parseLlamaCppTag('version: 0.4.1 (build 10964, commit abcdef123)\nbuilt with Clang'),
            'b10964',
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
            { tag: 'b10666', probedTag: 'b10666' },
        );
        assert.strictEqual(tag, 'b10666');
    });

    it('resolveRuntimeInstallPackage uses recommended pin by default', async () => {
        const resolved = await llamaServer.resolveRuntimeInstallPackage({
            runtimeId: 'win-vulkan-x64',
            channel: 'recommended',
        });
        assert.strictEqual(resolved.ok, true);
        assert.strictEqual(resolved.channel, 'recommended');
        assert.strictEqual(resolved.targetTag, catalog.LLAMA_CPP_TAG);
        assert.ok(resolved.pkg?.url.includes(catalog.LLAMA_CPP_TAG));
    });

    it('resolveRuntimeInstallPackage accepts explicit llamaCppTag', async () => {
        const resolved = await llamaServer.resolveRuntimeInstallPackage({
            runtimeId: 'win-cuda12-x64',
            channel: 'latest',
            llamaCppTag: 'b10999',
        });
        assert.strictEqual(resolved.ok, true);
        assert.strictEqual(resolved.channel, 'latest');
        assert.strictEqual(resolved.targetTag, 'b10999');
        assert.ok(resolved.pkg.url.includes('/download/b10999/'));
        assert.ok(resolved.pkg.url.includes('llama-b10999-'));
        assert.ok(String(resolved.pkg.companionUrl || '').includes('/download/b10999/'));
    });

    it('rejects semver-only tags that have no binary zips (v0.4.0 404 bug)', async () => {
        assert.strictEqual(catalog.normalizeLlamaCppTag('v0.4.0'), '');
        const bad = await llamaServer.resolveRuntimeInstallPackage({
            runtimeId: 'win-vulkan-x64',
            channel: 'recommended',
            llamaCppTag: 'v0.4.0',
        });
        assert.strictEqual(bad.ok, false);
        assert.strictEqual(bad.code, 'invalid_tag');

        const picked = llamaServer.pickLatestLlamaCppBuildRelease([
            {
                tag_name: 'v0.4.0',
                prerelease: false,
                html_url: 'https://github.com/ggml-org/llama.cpp/releases/tag/v0.4.0',
                assets: [{ name: 'nightly-tag.txt' }],
            },
            {
                tag_name: 'b10948',
                prerelease: true,
                html_url: 'https://github.com/ggml-org/llama.cpp/releases/tag/b10948',
                assets: [{ name: 'llama-b10948-bin-win-vulkan-x64.zip' }],
            },
        ]);
        assert.ok(picked);
        assert.strictEqual(picked.tag, 'b10948');
        assert.ok(picked.htmlUrl.includes('b10948'));
    });

    it('pickLatestLlamaCppBuildRelease skips semver stub without binaries', () => {
        const onlyStub = llamaServer.pickLatestLlamaCppBuildRelease([
            {
                tag_name: 'v0.4.0',
                assets: [{ name: 'nightly-tag.txt', browser_download_url: 'https://example/nightly-tag.txt' }],
            },
        ], {
            tag_name: 'v0.4.0',
            assets: [{ name: 'nightly-tag.txt', browser_download_url: 'https://example/nightly-tag.txt' }],
        });
        assert.ok(onlyStub);
        assert.strictEqual(onlyStub.tag, '');
        assert.ok(onlyStub.nightlyTagUrl);
    });

    it('resolveInstalledRuntimeTag skips live --version when meta has no tag', () => {
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'transub-llama-tag-'));
        const exe = path.join(dir, 'llama-server.exe');
        fs.writeFileSync(exe, 'not-a-real-binary');
        const t0 = Date.now();
        const tag = llamaServer.resolveInstalledRuntimeTag(exe, {});
        const elapsed = Date.now() - t0;
        fs.rmSync(dir, { recursive: true, force: true });
        assert.strictEqual(tag, '');
        assert.ok(elapsed < 800, `live --version should not run (${elapsed}ms)`);
    });

    it('syncRuntimePreferenceToHardware skips when CUDA is not preferred', () => {
        const prefer = require('../electron/advanced-runtime-prefer');
        prefer._resetForTests({ preferCuda: false, ready: true, gpuName: '', cudaVersion: '' });
        const res = llamaServer.syncRuntimePreferenceToHardware();
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.skipped, true);
        assert.strictEqual(res.reason, 'no_accel');
    });

    it('getDefaultRuntimeId prefers ROCm for AMD hints', () => {
        assert.strictEqual(
            catalog.getDefaultRuntimeId('win32', 'x64', { preferRocm: true }),
            'win-rocm-x64',
        );
        assert.strictEqual(
            catalog.getDefaultRuntimeId('linux', 'x64', { preferRocm: true }),
            'ubuntu-rocm-x64',
        );
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
        if (!process.env.TRANSUB_PROBE_LLAMA) return;
        const exe = path.join(__dirname, '..', 'advanced-llm', 'runtime', 'llama-server.exe');
        if (!fs.existsSync(exe)) return;
        const tag = llamaServer.probeLlamaServerTag(exe);
        // CUDA builds may exceed the short probe budget; empty tag is acceptable.
        if (!tag) return;
        assert.ok(/^b\d{4,}$/.test(tag), `unexpected tag: ${tag}`);
        // 本机若仍是旧构建，状态应标记可更新
        const installedBuild = Number(String(tag || '').replace(/^b/i, ''));
        const catalogBuild = Number(String(catalog.LLAMA_CPP_TAG || '').replace(/^b/i, ''));
        if (Number.isFinite(installedBuild) && Number.isFinite(catalogBuild) && installedBuild < catalogBuild) {
            const status = llamaServer.getRuntimeStatus({ runtimeId: 'win-cuda12-x64' });
            if (status.installed && status.exePath === exe) {
                assert.strictEqual(status.installedTag, tag);
                assert.strictEqual(status.outdated, true);
                assert.ok(String(status.message).includes(`可更新至建议版 ${catalog.LLAMA_CPP_TAG}`));
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
            'cudart-llama-bin-win-cuda-13.4-x64',
        );
        const cuda12 = catalog.getRuntimePackage('win32', 'x64', 'win-cuda12-x64');
        assert.strictEqual(
            llamaServer.resolveCompanionId(cuda12),
            'cudart-llama-bin-win-cuda-12.4-x64',
        );
        assert.strictEqual(llamaServer.resolveCompanionCudaMajor('cudart-llama-bin-win-cuda-13.4-x64'), 13);
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
                { packageId: 'win-cuda13-x64', companionId: 'cudart-llama-bin-win-cuda-13.4-x64' },
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

    it('exposes system cuda scan helper', () => {
        assert.strictEqual(typeof llamaServer.scanReusableCudaRuntimes, 'function');
        const scan = llamaServer.scanReusableCudaRuntimes({
            major: 12,
            env: { PATH: '' },
            includePath: false,
            extraRoots: [],
        });
        assert.ok(scan);
        assert.strictEqual(typeof scan.ok, 'boolean');
        assert.deepStrictEqual(scan.required, [
            'cudart64_12.dll',
            'cublas64_12.dll',
            'cublasLt64_12.dll',
        ]);
    });
});

describe('advanced-llama-server GPU handoff', () => {
    it('waitForGpuVramHeadroom resolves when enough VRAM is free', async () => {
        const sys = require('../electron/system-resources');
        const orig = sys.sampleGpu;
        let calls = 0;
        sys.sampleGpu = async () => {
            calls += 1;
            if (calls < 2) {
                return { memTotalMiB: 10240, memUsedMiB: 9000, utilPct: 40 };
            }
            return { memTotalMiB: 10240, memUsedMiB: 1200, utilPct: 10 };
        };
        try {
            const hit = await llamaServer.waitForGpuVramHeadroom({
                minFreeMiB: 5500,
                timeoutMs: 5000,
            });
            assert.strictEqual(hit.ok, true);
            assert.ok(hit.gpuFreeMiB >= 5500);
        } finally {
            sys.sampleGpu = orig;
        }
    });

    it('waitForGpuVramHeadroom skips when GPU probe unavailable', async () => {
        const sys = require('../electron/system-resources');
        const orig = sys.sampleGpu;
        sys.sampleGpu = async () => null;
        try {
            const hit = await llamaServer.waitForGpuVramHeadroom({
                minFreeMiB: 5500,
                timeoutMs: 5000,
            });
            assert.strictEqual(hit.ok, true);
            assert.strictEqual(hit.code, 'probe_unavailable');
        } finally {
            sys.sampleGpu = orig;
        }
    });

    it('resolveAutoCpuOnGpuBusy defaults off and honors explicit opts', () => {
        assert.strictEqual(llamaServer.resolveAutoCpuOnGpuBusy({ autoCpuOnGpuBusy: false }), false);
        assert.strictEqual(llamaServer.resolveAutoCpuOnGpuBusy({ autoCpuOnGpuBusy: true }), true);
        assert.strictEqual(llamaServer.resolveAutoCpuOnGpuBusy({ allowCpuFallback: true }), true);
        assert.strictEqual(llamaServer.resolveAutoCpuOnGpuBusy({ allowCpuFallback: false }), false);
    });
});
