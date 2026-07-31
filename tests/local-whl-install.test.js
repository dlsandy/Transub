const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    normalizeWhlPaths,
    validateWhlFiles,
    guessPackageIdFromWhl,
    buildLocalPipInstallArgs,
} = require('../electron/local-whl-install');

describe('local-whl-install', () => {
    it('normalizes and dedupes .whl paths', () => {
        const a = path.join('C:', 'tmp', 'nvidia_cublas_cu12-12.0-py3-none-win_amd64.whl');
        const paths = normalizeWhlPaths([a, a, 'C:\\tmp\\not-a-wheel.bin', '']);
        assert.strictEqual(paths.length, 1);
        assert.ok(paths[0].toLowerCase().endsWith('.whl'));
    });

    it('validateWhlFiles rejects missing or tiny files', () => {
        const missing = validateWhlFiles([path.join(os.tmpdir(), `missing-${Date.now()}.whl`)]);
        assert.strictEqual(missing.ok, false);

        const tiny = path.join(os.tmpdir(), `tiny-${Date.now()}.whl`);
        fs.writeFileSync(tiny, 'x');
        try {
            const bad = validateWhlFiles([tiny]);
            assert.strictEqual(bad.ok, false);
            assert.match(bad.error, /过小/);
        } finally {
            try { fs.unlinkSync(tiny); } catch (_) { /* ignore */ }
        }
    });

    it('validateWhlFiles accepts a real-sized wheel file', () => {
        const file = path.join(os.tmpdir(), `ok-${Date.now()}.whl`);
        fs.writeFileSync(file, Buffer.alloc(2048, 1));
        try {
            const ok = validateWhlFiles([file]);
            assert.strictEqual(ok.ok, true);
            assert.strictEqual(ok.paths.length, 1);
            const args = buildLocalPipInstallArgs(ok.paths);
            assert.ok(args.includes('pip'));
            assert.ok(args.includes('--no-index'));
            assert.ok(args.includes('--no-deps'));
            assert.ok(args.includes('--force-reinstall'));
            assert.ok(args.includes(ok.paths[0]));
            assert.ok(!args.includes('-i'));
        } finally {
            try { fs.unlinkSync(file); } catch (_) { /* ignore */ }
        }
    });

    it('guesses package id from wheel filename', () => {
        assert.strictEqual(
            guessPackageIdFromWhl('nvidia_cublas_cu12-12.4.5.8-py3-none-win_amd64.whl'),
            'nvidia-cublas-cu12',
        );
        assert.strictEqual(
            guessPackageIdFromWhl('torch-2.5.1+cu126-cp312-cp312-win_amd64.whl'),
            'torch',
        );
    });

    it('GPU_MANUAL_PACKAGES lists all CUDA12 pip packages', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'electron', 'engine-bridge.js'),
            'utf8',
        );
        for (const id of [
            'nvidia-cublas-cu12',
            'nvidia-cuda-runtime-cu12',
            'nvidia-cudnn-cu12',
            'nvidia-cufft-cu12',
            'nvidia-curand-cu12',
        ]) {
            assert.ok(src.includes(`id: '${id}'`), `missing ${id}`);
        }
        assert.ok(
            /mirrorUrl:\s*'https:\/\/mirrors\.aliyun\.com\/pypi\/packages\/[^']+\.whl'/.test(src),
            'GPU packages should use direct .whl mirror URLs',
        );
        assert.ok(
            !/mirrorUrl:\s*'https:\/\/mirrors\.aliyun\.com\/pypi\/simple\/nvidia-cublas/.test(src),
            'GPU packages should not point at simple index pages',
        );
    });

    it('SenseVoice and Whisper manual packages use direct .whl URLs', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'electron', 'engine-bridge.js'),
            'utf8',
        );
        assert.ok(src.includes("id: 'torch'"), 'missing torch');
        assert.ok(src.includes("id: 'funasr'"), 'missing funasr');
        assert.ok(src.includes("id: 'faster-whisper'"), 'missing faster-whisper');
        assert.ok(src.includes("kind === 'whisper'"), 'missing whisper download kind');
        assert.ok(
            /numpy-2\.4\.[0-9]+-cp312-cp312-win_amd64\.whl/.test(src),
            'numpy manual wheel should be 2.4.x (<2.5 for numba)',
        );
        assert.ok(!/numpy-2\.5\./.test(src), 'numpy 2.5+ breaks numba binary wheels');
        assert.ok(src.includes("id: 'numba'"), 'missing numba manual package');
    });
});
