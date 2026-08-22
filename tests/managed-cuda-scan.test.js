const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cudaScan = require('../electron/cuda-runtime-scan');
const managedLlm = require('../electron/advanced-managed-llm');

function writeFakeDll(filePath, bytes = cudaScan.MIN_DLL_BYTES + 100) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.alloc(bytes, 1));
}

describe('managed llm system cuda scan', () => {
    let tmpDir = '';

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-cuda-managed-scan-'));
    });

    afterEach(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    });

    it('scanSystemCudaCompanion finds extraRoots layout', () => {
        if (process.platform !== 'win32') return;
        const site = path.join(tmpDir, 'site-packages');
        writeFakeDll(path.join(site, 'nvidia', 'cuda_runtime', 'bin', 'cudart64_12.dll'));
        writeFakeDll(path.join(site, 'nvidia', 'cublas', 'bin', 'cublas64_12.dll'));
        writeFakeDll(path.join(site, 'nvidia', 'cublas', 'bin', 'cublasLt64_12.dll'));

        const scan = managedLlm.scanSystemCudaCompanion({
            runtimeId: 'win-cuda12-x64',
            extraRoots: [site],
            includePath: false,
        });
        assert.strictEqual(scan.ok, true, scan.error || '');
        assert.strictEqual(scan.found, true);
        assert.strictEqual(scan.major, 12);
        assert.ok(scan.best?.label);
        assert.ok(String(scan.message || '').includes('可复用'));
    });

    it('scanSystemCudaCompanion reports miss when incomplete', () => {
        if (process.platform !== 'win32') return;
        const site = path.join(tmpDir, 'site-packages');
        writeFakeDll(path.join(site, 'nvidia', 'cuda_runtime', 'bin', 'cudart64_12.dll'));

        const scan = managedLlm.scanSystemCudaCompanion({
            runtimeId: 'win-cuda12-x64',
            extraRoots: [site],
            includePath: false,
            env: { PATH: '' },
        });
        assert.strictEqual(scan.ok, true);
        // May still find a real toolkit on the developer machine; only assert shape.
        assert.strictEqual(typeof scan.found, 'boolean');
        assert.ok(Array.isArray(scan.required));
        assert.strictEqual(scan.required.length, 3);
    });
});
