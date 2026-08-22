const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cudaScan = require('../electron/cuda-runtime-scan');

function writeFakeDll(filePath, bytes = cudaScan.MIN_DLL_BYTES + 100) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.alloc(bytes, 1));
}

describe('cuda-runtime-scan', () => {
    let tmpDir = '';

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-cuda-scan-'));
    });

    afterEach(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    });

    it('lists required companion dll names by major', () => {
        assert.deepStrictEqual(cudaScan.requiredDllNames(12), [
            'cudart64_12.dll',
            'cublas64_12.dll',
            'cublasLt64_12.dll',
        ]);
        assert.deepStrictEqual(cudaScan.requiredDllNames(13), [
            'cudart64_13.dll',
            'cublas64_13.dll',
            'cublasLt64_13.dll',
        ]);
        assert.deepStrictEqual(cudaScan.requiredDllNames(11), []);
    });

    it('finds toolkit-style bin via CUDA_PATH env', () => {
        const bin = path.join(tmpDir, 'cuda', 'bin');
        writeFakeDll(path.join(bin, 'cudart64_12.dll'));
        writeFakeDll(path.join(bin, 'cublas64_12.dll'));
        writeFakeDll(path.join(bin, 'cublasLt64_12.dll'));
        writeFakeDll(path.join(bin, 'cublas64_12.dll')); // overwrite ok

        const scan = cudaScan.scanReusableCudaRuntimes({
            major: 12,
            env: { CUDA_PATH: path.join(tmpDir, 'cuda'), PATH: '' },
            includePath: false,
            extraRoots: [],
        });
        assert.strictEqual(scan.ok, true);
        assert.ok(scan.best);
        assert.ok(String(scan.best.label).includes('CUDA_PATH') || scan.best.source === 'env');
        assert.strictEqual(scan.best.fileCount >= 3, true);
    });

    it('assembles pip nvidia split layout via extraRoots', () => {
        const site = path.join(tmpDir, 'site-packages');
        writeFakeDll(path.join(site, 'nvidia', 'cuda_runtime', 'bin', 'cudart64_13.dll'));
        writeFakeDll(path.join(site, 'nvidia', 'cublas', 'bin', 'cublas64_13.dll'));
        writeFakeDll(path.join(site, 'nvidia', 'cublas', 'bin', 'cublasLt64_13.dll'));

        const scan = cudaScan.scanReusableCudaRuntimes({
            major: 13,
            env: { PATH: '' },
            includePath: false,
            extraRoots: [site],
        });
        assert.strictEqual(scan.ok, true);
        assert.ok(scan.best);
        assert.strictEqual(scan.best.source, 'pip-nvidia');
    });

    it('rejects incomplete or tiny stub dlls', () => {
        const bin = path.join(tmpDir, 'partial', 'bin');
        writeFakeDll(path.join(bin, 'cudart64_12.dll'));
        // missing cublasLt
        writeFakeDll(path.join(bin, 'cublas64_12.dll'));
        fs.writeFileSync(path.join(bin, 'cublasLt64_12.dll'), Buffer.alloc(16, 1));

        const scan = cudaScan.scanReusableCudaRuntimes({
            major: 12,
            env: { CUDA_PATH: path.join(tmpDir, 'partial'), PATH: '' },
            includePath: false,
            extraRoots: [],
        });
        assert.strictEqual(scan.ok, false);
        assert.strictEqual(scan.best, null);
    });

    it('copies companion dlls into dest (hardlink or copy)', () => {
        const bin = path.join(tmpDir, 'src', 'bin');
        writeFakeDll(path.join(bin, 'cudart64_12.dll'), cudaScan.MIN_DLL_BYTES + 200);
        writeFakeDll(path.join(bin, 'cublas64_12.dll'), cudaScan.MIN_DLL_BYTES + 200);
        writeFakeDll(path.join(bin, 'cublasLt64_12.dll'), cudaScan.MIN_DLL_BYTES + 200);

        const dest = path.join(tmpDir, 'dest');
        const result = cudaScan.tryReuseSystemCudaCompanion({
            major: 12,
            destDir: dest,
            env: { CUDA_PATH: path.join(tmpDir, 'src'), PATH: '' },
            includePath: false,
            extraRoots: [],
        });
        assert.strictEqual(result.ok, true);
        assert.ok(fs.existsSync(path.join(dest, 'cudart64_12.dll')));
        assert.ok(fs.existsSync(path.join(dest, 'cublas64_12.dll')));
        assert.ok(fs.existsSync(path.join(dest, 'cublasLt64_12.dll')));
    });

    it('prefers toolkit over torch\\lib when both present', () => {
        const toolkitBin = path.join(tmpDir, 'toolkit', 'bin');
        const torchLib = path.join(tmpDir, 'python', 'torch', 'lib');
        for (const dir of [toolkitBin, torchLib]) {
            writeFakeDll(path.join(dir, 'cudart64_12.dll'), cudaScan.MIN_DLL_BYTES + 500);
            writeFakeDll(path.join(dir, 'cublas64_12.dll'), cudaScan.MIN_DLL_BYTES + 500);
            writeFakeDll(path.join(dir, 'cublasLt64_12.dll'), cudaScan.MIN_DLL_BYTES + 500);
        }

        const scan = cudaScan.scanReusableCudaRuntimes({
            major: 12,
            env: {
                CUDA_PATH: path.join(tmpDir, 'toolkit'),
                PATH: torchLib,
            },
            includePath: true,
            extraRoots: [],
        });
        assert.strictEqual(scan.ok, true);
        assert.ok(scan.best);
        assert.ok(!cudaScan._isTorchLibPath(scan.best.files[0]));
        assert.ok(scan.candidates.length >= 2);
        assert.ok(scan.candidates[0].score <= scan.candidates[1].score);
    });

    it('engineNvidiaExtraRoots resolves site-packages under engine root', () => {
        const engine = path.join(tmpDir, 'transub-engine');
        const sp = path.join(engine, 'runtime', 'Lib', 'site-packages');
        fs.mkdirSync(sp, { recursive: true });
        const roots = cudaScan.engineNvidiaExtraRoots(engine);
        assert.ok(roots.some((r) => pathKey(r) === pathKey(sp)));
    });
});

function pathKey(p) {
    const full = path.resolve(String(p || ''));
    return process.platform === 'win32' ? full.toLowerCase() : full;
}
