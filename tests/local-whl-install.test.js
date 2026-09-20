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

    it('findWhlVariantConflictError rejects CPU+CUDA torch/torchaudio mixes', () => {
        const { findWhlVariantConflictError } = require('../electron/local-whl-install');
        const cpuCuda = findWhlVariantConflictError([
            'C:\\tmp\\torch-2.11.0+cu126-cp312-cp312-win_amd64.whl',
            'C:\\tmp\\torch-2.11.0-cp312-cp312-win_amd64.whl',
            'C:\\tmp\\funasr-1.3.30-py3-none-any.whl',
        ]);
        assert.ok(cpuCuda);
        assert.match(cpuCuda, /CPU 与 CUDA/);
        assert.match(cpuCuda, /torch/);

        const audioMix = findWhlVariantConflictError([
            'C:\\tmp\\torchaudio-2.11.0+cu126-cp312-cp312-win_amd64.whl',
            'C:\\tmp\\torchaudio-2.11.0-cp312-cp312-win_amd64.whl',
        ]);
        assert.ok(audioMix);
        assert.match(audioMix, /torchaudio/);

        const multiCuda = findWhlVariantConflictError([
            'C:\\tmp\\torch-2.11.0+cu126-cp312-cp312-win_amd64.whl',
            'C:\\tmp\\torch-2.11.0+cu128-cp312-cp312-win_amd64.whl',
        ]);
        assert.ok(multiCuda);
        assert.match(multiCuda, /CUDA 变体/);

        const ok = findWhlVariantConflictError([
            'C:\\tmp\\torch-2.11.0+cu126-cp312-cp312-win_amd64.whl',
            'C:\\tmp\\torchaudio-2.11.0+cu126-cp312-cp312-win_amd64.whl',
            'C:\\tmp\\funasr-1.3.30-py3-none-any.whl',
        ]);
        assert.strictEqual(ok, null);
    });

    it('resolveWhlVariantSelection drops CPU onnxruntime and keeps one GPU wheel', () => {
        const {
            resolveWhlVariantSelection,
            pickOrtGpuWheel,
        } = require('../electron/local-whl-install');
        const cpu = 'C:\\tmp\\onnxruntime-1.21.1-cp312-cp312-win_amd64.whl';
        const gpu121 = 'C:\\tmp\\onnxruntime_gpu-1.21.1-cp312-cp312-win_amd64.whl';
        const gpu128 = 'C:\\tmp\\onnxruntime_gpu-1.28.0-cp312-cp312-win_amd64.whl';
        const other = 'C:\\tmp\\nvidia_cublas_cu12-12.9.2.10-py3-none-win_amd64.whl';

        const mixed = resolveWhlVariantSelection([cpu, other, gpu121, gpu128], {
            ortGpuRequirement: 'onnxruntime-gpu>=1.21,<1.27',
        });
        assert.strictEqual(mixed.paths.length, 2);
        assert.ok(mixed.paths.some((p) => /cublas/i.test(p)));
        assert.ok(mixed.paths.some((p) => /onnxruntime_gpu-1\.21\.1/i.test(p)));
        assert.ok(!mixed.paths.some((p) => /[\\/]onnxruntime-1\.21/i.test(p)));
        assert.ok(mixed.note.includes('CPU'));
        // GPU last for install order
        assert.match(mixed.paths[mixed.paths.length - 1], /onnxruntime_gpu/i);

        const cuda13 = resolveWhlVariantSelection([gpu121, gpu128], {
            ortGpuDesiredTarget: 'cuda13',
        });
        assert.strictEqual(cuda13.paths.length, 1);
        assert.match(cuda13.paths[0], /1\.28\.0/);

        assert.match(
            pickOrtGpuWheel([gpu121, gpu128], { ortGpuRequirement: 'onnxruntime-gpu>=1.27' }),
            /1\.28\.0/,
        );
    });

    it('validateWhlFiles auto-adjusts ORT CPU+GPU mix on disk', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whl-ort-'));
        const cpu = path.join(dir, 'onnxruntime-1.21.1-cp312-cp312-win_amd64.whl');
        const gpu = path.join(dir, 'onnxruntime_gpu-1.21.1-cp312-cp312-win_amd64.whl');
        const extra = path.join(dir, 'onnxruntime_gpu-1.28.0-cp312-cp312-win_amd64.whl');
        fs.writeFileSync(cpu, Buffer.alloc(2048, 1));
        fs.writeFileSync(gpu, Buffer.alloc(2048, 2));
        fs.writeFileSync(extra, Buffer.alloc(2048, 3));
        try {
            const ok = validateWhlFiles([cpu, gpu, extra], {
                ortGpuRequirement: 'onnxruntime-gpu>=1.21,<1.27',
            });
            assert.strictEqual(ok.ok, true);
            assert.strictEqual(ok.paths.length, 1);
            assert.match(ok.paths[0], /onnxruntime_gpu-1\.21\.1/);
            assert.ok(ok.note);
            const args = buildLocalPipInstallArgs([cpu, gpu], {
                ortGpuRequirement: 'onnxruntime-gpu>=1.21,<1.27',
            });
            assert.ok(args.includes(ok.paths[0]));
            assert.ok(!args.some((a) => /onnxruntime-1\.21\.1/.test(String(a))));
        } finally {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
        }
    });

    it('validateWhlFiles rejects conflicting torch wheels on disk', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whl-mutex-'));
        const cpu = path.join(dir, 'torch-2.11.0-cp312-cp312-win_amd64.whl');
        const cuda = path.join(dir, 'torch-2.11.0+cu126-cp312-cp312-win_amd64.whl');
        fs.writeFileSync(cpu, Buffer.alloc(2048, 1));
        fs.writeFileSync(cuda, Buffer.alloc(2048, 2));
        try {
            const bad = validateWhlFiles([cpu, cuda]);
            assert.strictEqual(bad.ok, false);
            assert.match(bad.error, /CPU 与 CUDA/);
        } finally {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
        }
    });

    it('GPU_MANUAL_PACKAGES lists all CUDA12 pip packages', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'electron', 'engine-download-info.js'),
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

    it('GPU manual catalog includes onnxruntime-gpu for WhisperSeg', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'electron', 'engine-download-info.js'),
            'utf8',
        );
        assert.ok(src.includes('ORT_GPU_MANUAL_PACKAGES'), 'missing ORT_GPU_MANUAL_PACKAGES');
        assert.ok(
            /onnxruntime_gpu-1\.21\.1-cp312-cp312-win_amd64\.whl/.test(src),
            'missing CUDA 12 onnxruntime-gpu wheel',
        );
        assert.ok(
            /onnxruntime_gpu-1\.28\.0-cp312-cp312-win_amd64\.whl/.test(src),
            'missing CUDA 13 onnxruntime-gpu wheel',
        );
        assert.ok(
            src.includes("requirement: 'onnxruntime-gpu>=1.27'"),
            'missing CUDA 13 ORT requirement pin',
        );
        assert.ok(
            src.includes('resolveOrtGpuManualPackage'),
            'missing ORT package resolver',
        );
    });

    it('SenseVoice and Whisper manual packages use direct .whl URLs', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'electron', 'engine-download-info.js'),
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
        assert.ok(src.includes("id: 'scipy'"), 'missing scipy manual package');
        assert.ok(
            /scipy-1\.1[0-9]\.[0-9]+-cp312-cp312-win_amd64\.whl/.test(src),
            'scipy manual wheel should be cp312 win_amd64',
        );
        assert.ok(src.includes('TORCH_CUDA_MANUAL_PACKAGES'), 'missing TORCH_CUDA_MANUAL_PACKAGES');
        assert.ok(src.includes("kind === 'torch-cuda'"), 'missing torch-cuda download kind');
        assert.ok(
            /torch-2\.11\.0\+cu126-cp312-cp312-win_amd64\.whl/.test(src),
            'missing cu126 torch manual wheel',
        );
        assert.ok(
            /torch-2\.11\.0\+cu128-cp312-cp312-win_amd64\.whl/.test(src),
            'missing cu128 torch manual wheel for Blackwell',
        );
        assert.ok(
            /torch-2\.11\.0\+cu130-cp312-cp312-win_amd64\.whl/.test(src),
            'missing cu130 torch manual wheel for Blackwell + CUDA 13',
        );
        assert.ok(src.includes('resolveTorchCudaManualPackages'), 'missing torch variant resolver');
    });

    it('registerLocalWhlIpc exports pick/validate/install channels', () => {
        const { registerLocalWhlIpc } = require('../electron/local-whl-ipc');
        const channels = new Map();
        registerLocalWhlIpc((ch, handler) => channels.set(ch, handler), {
            isBatchRunning: () => false,
            isDownloadBusy: () => false,
            setDownloadBusy: () => {},
            getDownloadAbort: () => null,
            setDownloadAbort: () => {},
            readMergedOptions: async () => ({}),
            resolveEngineInstallPath: (p) => p || '',
            resolveEngineRuntimePython: () => null,
            getEngineProc: () => null,
            stopEngineProcess: () => {},
            sleep: async () => {},
            ensureEngineRunning: async () => ({ ok: false }),
            getAudioSeparateRuntime: async () => ({}),
            getGpuRuntime: async () => ({}),
        });
        assert.ok(typeof channels.get('transub-engine-pick-whl') === 'function');
        assert.ok(typeof channels.get('transub-engine-validate-whl') === 'function');
        assert.ok(typeof channels.get('transub-engine-install-local-wheels') === 'function');
    });
});
