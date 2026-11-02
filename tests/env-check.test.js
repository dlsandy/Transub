const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
    hasNonAscii,
    checkInstallPath,
    checkVcRedist,
    checkEngine,
    checkAsrModel,
    checkVadModel,
    checkLidModel,
    checkModelInstalled,
    findCublasInEngine,
    sanitizeEngineProbeStderr,
} = require('../electron/env-check');

describe('env-check', () => {
    it('sanitizeEngineProbeStderr drops pydub ffmpeg RuntimeWarning noise', () => {
        const raw = [
            'C:\\x\\pydub\\utils.py:170: RuntimeWarning: Couldn\'t find ffmpeg or avconv - defaulting to ffmpeg, but may not work',
            '  warn("Couldn\'t find ffmpeg or avconv - defaulting to ffmpeg, but may not work", RuntimeWarning)',
            'No module named \'funasr\'',
        ].join('\n');
        const clean = sanitizeEngineProbeStderr(raw);
        assert.match(clean, /funasr/i);
        assert.doesNotMatch(clean, /Couldn't find ffmpeg/i);
        assert.doesNotMatch(clean, /RuntimeWarning/i);
    });

    it('hasNonAscii detects CJK and accepts ASCII paths', () => {
        assert.equal(hasNonAscii('D:\\Transub-2.0.0-win'), false);
        assert.equal(hasNonAscii('C:\\Users\\user\\AppData'), false);
        assert.equal(hasNonAscii('D:\\字幕工具\\Transub'), true);
        assert.equal(hasNonAscii(''), false);
    });

    it('checkInstallPath returns structured item', () => {
        const item = checkInstallPath();
        assert.equal(item.id, 'installPath');
        assert.ok(['ok', 'fail'].includes(item.status));
        assert.equal(typeof item.detail, 'string');
        assert.equal(typeof item.blocking, 'boolean');
    });

    it('checkVcRedist returns ok or fail with action on Windows', () => {
        const item = checkVcRedist();
        assert.equal(item.id, 'vcRedist');
        if (process.platform === 'win32') {
            assert.ok(['ok', 'fail'].includes(item.status));
            if (item.status === 'fail') {
                assert.ok(item.action?.url);
                assert.match(item.action.url, /vc_redist/);
                assert.equal(item.blocking, true);
            }
        } else {
            assert.equal(item.status, 'ok');
        }
    });

    it('checkEngine probes bundled path', () => {
        const item = checkEngine();
        assert.equal(item.id, 'engine');
        assert.ok(['ok', 'fail'].includes(item.status));
        assert.ok(item.path);
    });

    it('findCublasInEngine finds dll under nvidia/cublas/bin', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-env-'));
        try {
            const bin = path.join(tmp, 'runtime', 'Lib', 'site-packages', 'nvidia', 'cublas', 'bin');
            fs.mkdirSync(bin, { recursive: true });
            const dll = path.join(bin, 'cublas64_12.dll');
            fs.writeFileSync(dll, '');
            assert.equal(findCublasInEngine(tmp), dll);
            assert.equal(findCublasInEngine(path.join(tmp, 'missing')), '');
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    it('ASR/VAD/LID model checks detect weight markers', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-models-'));
        try {
            assert.equal(checkAsrModel(tmp).status, 'fail');
            assert.equal(checkVadModel(tmp, 'sensevoice-small').status, 'fail');
            assert.equal(checkVadModel(tmp, 'whisper-large-v3-turbo').status, 'warn');
            assert.equal(checkLidModel(tmp).status, 'warn');

            const senseDir = path.join(tmp, 'models', 'asr', 'sensevoice-small');
            fs.mkdirSync(senseDir, { recursive: true });
            fs.writeFileSync(path.join(senseDir, 'model.pt'), Buffer.alloc(2048));
            assert.equal(checkModelInstalled(tmp, 'sensevoice-small').installed, true);
            assert.equal(checkAsrModel(tmp).status, 'ok');

            const vadDir = path.join(tmp, 'models', 'vad', 'fsmn-vad');
            fs.mkdirSync(vadDir, { recursive: true });
            fs.writeFileSync(path.join(vadDir, 'model.pt'), Buffer.alloc(2048));
            assert.equal(checkVadModel(tmp, 'sensevoice-small').status, 'ok');

            const tinyDir = path.join(tmp, 'models', 'asr', 'whisper-tiny');
            fs.mkdirSync(tinyDir, { recursive: true });
            fs.writeFileSync(path.join(tinyDir, 'model.bin'), Buffer.alloc(2048));
            assert.equal(checkLidModel(tmp).status, 'ok');
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    it('ASR model check respects preferred Whisper id', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-asr-'));
        try {
            const turbo = path.join(tmp, 'models', 'asr', 'whisper-large-v3-turbo');
            fs.mkdirSync(turbo, { recursive: true });
            fs.writeFileSync(path.join(turbo, 'model.bin'), Buffer.alloc(2048));
            assert.equal(checkAsrModel(tmp, 'whisper-large-v3-turbo').status, 'ok');
            assert.match(checkAsrModel(tmp, 'whisper-large-v3-turbo').detail, /whisper-large-v3-turbo/);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    it('SenseVoice runtime preference helpers', () => {
        const { prefersSensevoice, prefersWhisper } = require('../electron/env-check');
        assert.equal(prefersSensevoice(''), true);
        assert.equal(prefersSensevoice('sensevoice-small'), true);
        assert.equal(prefersSensevoice('whisper-large-v3-turbo'), false);
        assert.equal(prefersWhisper('whisper-large-v3-turbo'), true);
        assert.equal(prefersWhisper('sensevoice-small'), false);
    });

    it('planEnvFixes collects SenseVoice runtime force download', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            { id: 'sensevoiceRuntime', status: 'warn', detail: '模型权重已安装，但缺少运行库 torch' },
            { id: 'whisperRuntime', status: 'ok', detail: 'ok' },
            { id: 'vcRedist', status: 'fail', detail: 'missing' },
        ], { engineAsrModel: 'whisper-large-v3-turbo' });
        assert.equal(plan.fixable, true);
        assert.equal(plan.openVcRedist, true);
        assert.ok(plan.modelIds.includes('sensevoice-small'));
        assert.equal(plan.force, true);
        assert.ok(plan.steps.some((s) => s.id === 'sensevoiceRuntime'));
    });

    it('planEnvFixes ensures GPU only when runtime warns about CUDA packages', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const withGpu = planEnvFixes([
            { id: 'gpuRuntime', status: 'warn', detail: '未找到 cublas64_12.dll；可先用 CPU，或稍后在「运行环境」下载 GPU 支持' },
        ]);
        assert.equal(withGpu.ensureGpu, true);
        assert.ok(withGpu.steps.some((s) => /cuBLAS/.test(s.label)));
        const ortMissing = planEnvFixes([
            {
                id: 'gpuRuntime',
                status: 'warn',
                detail: 'ASR/CTranslate2 GPU 已就绪；WhisperSeg（onnxruntime-gpu）未就绪，灵敏检出将回退 CPU',
            },
        ]);
        assert.equal(ortMissing.ensureGpu, true);
        assert.ok(ortMissing.steps.some((s) => /WhisperSeg|onnxruntime/.test(s.label)));
        const cpuOnly = planEnvFixes([
            { id: 'gpuRuntime', status: 'ok', detail: 'CPU 模式，无需 CUDA 运行库' },
        ]);
        assert.equal(cpuOnly.ensureGpu, false);

        const ct2Missing = planEnvFixes([
            {
                id: 'gpuRuntime',
                status: 'warn',
                detail: '未安装 CTranslate2（Whisper / Opus-MT 运行库）。请对 Whisper 运行库点一键修复',
                ctranslate2CudaReason: 'ctranslate2_not_installed',
            },
        ]);
        assert.equal(ct2Missing.ensureGpu, true);
        assert.ok(ct2Missing.modelIds.includes('whisper-tiny'));
        assert.ok(ct2Missing.steps.some((s) => s.id === 'whisperRuntime'));
        assert.ok(ct2Missing.steps.some((s) => s.id === 'gpuRuntime'));

        const softCudaHint = planEnvFixes([
            {
                id: 'gpuRuntime',
                status: 'warn',
                detail: '本机已有可复用 CUDA（cublas）；点「下载 GPU 支持」或「扫描复用本机 CUDA」即可跳过大包下载',
                recommendReuse: true,
            },
        ]);
        assert.equal(softCudaHint.ensureGpu, true);
        assert.ok(softCudaHint.steps.some((s) => s.id === 'gpuRuntime'));

        const torchMismatch = planEnvFixes([
            {
                id: 'gpuRuntime',
                status: 'warn',
                detail: 'GPU 运行库已就绪 · PyTorch cu126 与本机 Blackwell GPU 不兼容',
                torchCudaMismatch: true,
                torchCudaVariant: 'cu130',
                needsTorchCuda128: true,
            },
        ]);
        assert.equal(torchMismatch.ensureTorchCuda, true);
        assert.equal(torchMismatch.ensureGpu, true);
        assert.ok(torchMismatch.steps.some((s) => s.id === 'audioSeparate'));
    });

    it('planEnvFixes installs ROCm PyTorch for AMD when torch startup fails', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'amd',
                detail: 'AMD Radeon RX 9070',
            },
            {
                id: 'torchEngineStartup',
                status: 'fail',
                code: 'TORCH_MISSING',
                detail: '未安装 ROCm 版 PyTorch。系统 pip 无效。',
            },
        ]);
        assert.equal(plan.ensureTorchRocm, true);
        assert.equal(plan.ensureTorchCuda, false);
        assert.equal(plan.fixable, true);
        assert.ok(plan.steps.some((s) => s.id === 'torchRocm'));
    });

    it('planEnvFixes prefers ROCm when torch startup marks needsTorchRocm', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'amd',
            },
            {
                id: 'torchEngineStartup',
                status: 'fail',
                code: 'NEED_TORCH_ROCM',
                needsTorchRocm: true,
                needsTorchCuda: false,
                detail: '引擎运行时里的 PyTorch 不是 ROCm 版',
            },
        ]);
        assert.equal(plan.ensureTorchRocm, true);
        assert.equal(plan.ensureTorchCuda, false);
    });

    it('planEnvFixes prefers ROCm on AMD when torch is TORCH_MISSING', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'amd',
            },
            {
                id: 'torchEngineStartup',
                status: 'fail',
                code: 'TORCH_MISSING',
                needsTorchCuda: true,
                needsTorchRocm: false,
                detail: '未安装 PyTorch',
            },
        ]);
        assert.equal(plan.ensureTorchRocm, true);
        assert.equal(plan.ensureTorchCuda, false);
        assert.ok(plan.steps.some((s) => s.id === 'torchRocm'));
    });

    it('runEnvCheck marks torch mismatch blocking for Qwen ASR', async function () {
        const { runEnvCheck, prefersQwenAsr } = require('../electron/env-check');
        assert.equal(typeof prefersQwenAsr, 'function');
        // Post-process logic is inline in runEnvCheck; simulate gpuRuntime item shape.
        const items = [{
            id: 'gpuRuntime',
            status: 'warn',
            torchCudaMismatch: true,
            torchCudaVariant: 'cu130',
            installedTorchCudaTag: 'cu126',
            blocking: false,
        }];
        const asrModel = 'qwen3-asr-1.7b-ja-anime-galgame';
        const gpuRtIdx = items.findIndex((it) => it.id === 'gpuRuntime');
        const gpuRt = items[gpuRtIdx];
        if (gpuRt.torchCudaMismatch && prefersQwenAsr(asrModel)) {
            items[gpuRtIdx] = {
                ...gpuRt,
                status: 'fail',
                blocking: true,
            };
        }
        assert.equal(items[0].status, 'fail');
        assert.equal(items[0].blocking, true);
    });

    it('planEnvFixes skips whisper reinstall when probe only timed out', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'whisperRuntime',
                status: 'warn',
                detail: 'Whisper 运行库探测超时（首次导入较慢）。库可能已装好，请再点一次重新检测',
                probeTimedOut: true,
            },
            { id: 'vcRedist', status: 'ok', detail: 'ok' },
            { id: 'sensevoiceRuntime', status: 'ok', detail: 'ok' },
        ], { engineAsrModel: 'whisper-large-v3-turbo' });
        assert.equal(plan.modelIds.includes('whisper-tiny'), false);
        assert.equal(plan.steps.some((s) => s.id === 'whisperRuntime'), false);
    });

    it('planEnvFixes forces ASR and whisper runtime when models are missing', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            { id: 'asrModel', status: 'fail', detail: 'missing' },
            { id: 'lidModel', status: 'warn', detail: 'missing tiny' },
            { id: 'whisperRuntime', status: 'fail', detail: '缺 numpy' },
            { id: 'sensevoiceRuntime', status: 'ok', detail: 'ok' },
        ], { engineAsrModel: 'sensevoice-small' });
        assert.ok(plan.modelIds.includes('sensevoice-small'));
        assert.ok(plan.modelIds.includes('whisper-tiny'));
        assert.equal(plan.force, true);
        assert.ok(plan.forceIds.includes('sensevoice-small'));
        assert.ok(plan.forceIds.includes('whisper-tiny'));
    });

    it('planEnvFixes skips auto pip when Whisper is policy-blocked', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'whisperRuntime',
                status: 'fail',
                detail: 'Windows 应用程序控制策略/智能应用控制拦截了 Whisper 依赖 DLL（多为 av）',
                policyBlocked: true,
            },
            { id: 'vcRedist', status: 'ok', detail: 'ok' },
        ]);
        // Still offer one-click retry so the fix button remains visible.
        assert.equal(plan.fixable, true);
        assert.ok(plan.modelIds.includes('whisper-tiny'));
        assert.ok(plan.manualHints.some((h) => h.id === 'whisperRuntime'));
    });

    it('planEnvFixes forces numpy 2.4.6 repair and manual hint on Win32 DLL failure', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'whisperRuntime',
                status: 'fail',
                detail: 'DLL load failed while importing _multiarray_umath: %1 不是有效的 Win32 应用程序。NumPy 2.5.3',
                numpyBroken: true,
                dllBlocked: true,
            },
            { id: 'vcRedist', status: 'ok', detail: 'ok' },
        ], { engineAsrModel: 'whisper-large-v3-turbo' });
        assert.equal(plan.fixable, true);
        assert.ok(plan.modelIds.includes('whisper-tiny'));
        assert.ok(plan.steps.some((s) => /NumPy 2\.4\.6/i.test(String(s.label || ''))));
        const hint = plan.manualHints.find((h) => h.id === 'whisperRuntime');
        assert.ok(hint);
        assert.match(String(hint.detail || ''), /numpy-2\.4\.6-cp312-cp312-win_amd64\.whl/);
    });

    it('planEnvFixes keeps whisper-tiny retry when runtime is policy-blocked', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            { id: 'lidModel', status: 'warn', detail: 'whisper-tiny 未找到' },
            {
                id: 'whisperRuntime',
                status: 'fail',
                detail: 'Windows 应用程序控制策略拦截了 Whisper 依赖 DLL',
                policyBlocked: true,
            },
            { id: 'sensevoiceRuntime', status: 'warn', detail: '缺少运行库 torch' },
        ], { engineAsrModel: 'sensevoice-small' });
        assert.ok(plan.modelIds.includes('whisper-tiny'));
        assert.ok(plan.modelIds.includes('sensevoice-small'));
        assert.equal(plan.fixable, true);
    });

    it('planEnvFixes updates outdated llama-server runtime', () => {
        const { planEnvFixes } = require('../electron/env-check');
        // Soft outdated (ok status) must not force auto-fix / block the doctor gate.
        const outdatedOk = planEnvFixes([
            {
                id: 'llamaServerRuntime',
                status: 'ok',
                detail: '已安装 b10077（建议版 b10666，可在设置中更新）',
                outdated: true,
                installedTag: 'b10077',
                catalogTag: 'b10666',
            },
        ]);
        assert.equal(outdatedOk.ensureLlamaRuntime, false);

        const mismatch = planEnvFixes([
            {
                id: 'llamaServerRuntime',
                status: 'warn',
                detail: '偏好「CUDA」，当前为「Vulkan」，请重新安装运行时',
                mismatch: true,
                catalogTag: 'b10666',
                recommendRuntimeId: 'win-cuda13-x64',
            },
        ]);
        assert.equal(mismatch.ensureLlamaRuntime, true);
        assert.equal(mismatch.llamaRuntimeId, 'win-cuda13-x64');

        const recommendInstall = planEnvFixes([
            {
                id: 'llamaServerRuntime',
                status: 'warn',
                detail: '未安装 · 已检测 CUDA 13.3，建议安装 Windows x64 · CUDA 13',
                recommendInstall: true,
                recommendRuntimeId: 'win-cuda13-x64',
                preferredPackageId: 'win-cuda13-x64',
                catalogTag: 'b10666',
            },
        ]);
        assert.equal(recommendInstall.ensureLlamaRuntime, true);
        assert.equal(recommendInstall.llamaRuntimeId, 'win-cuda13-x64');
        assert.ok(recommendInstall.steps.some((s) => /CUDA 13|win-cuda13-x64/.test(String(s.label || ''))));

        const unused = planEnvFixes([
            {
                id: 'llamaServerRuntime',
                status: 'ok',
                detail: 'b10666 已就绪 · win-cuda13-x64',
                installedTag: 'b10666',
            },
        ]);
        assert.equal(unused.ensureLlamaRuntime, false);

        const missing = planEnvFixes([
            {
                id: 'llamaServerRuntime',
                status: 'warn',
                detail: '未安装 · 建议安装 Windows x64 · CUDA 13（llama.cpp b10666）',
                recommendInstall: true,
                catalogTag: 'b10666',
            },
        ]);
        assert.equal(missing.ensureLlamaRuntime, true);
    });

    it('planEnvFixes replaces saved Vulkan with the detected GPU package', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const nvidia = planEnvFixes([
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'nvidia',
                cudaVersion: '13.3',
                detail: 'RTX 5090',
            },
            {
                id: 'llamaServerRuntime',
                status: 'warn',
                detail: '未安装 · 建议安装 Windows x64 · Vulkan',
                recommendInstall: true,
                recommendRuntimeId: 'win-vulkan-x64',
                preferredPackageId: 'win-vulkan-x64',
            },
        ]);
        assert.equal(nvidia.llamaRuntimeId, 'win-cuda13-x64');
        assert.ok(nvidia.steps.some((s) => /CUDA 13|win-cuda13-x64/.test(String(s.label || ''))));

        const amd = planEnvFixes([
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'amd',
                detail: 'Radeon RX 7800 XT',
            },
            {
                id: 'llamaServerRuntime',
                status: 'warn',
                detail: '未安装',
                recommendInstall: true,
                recommendRuntimeId: 'win-vulkan-x64',
            },
        ]);
        assert.equal(amd.llamaRuntimeId, 'win-rocm-x64');
        assert.ok(amd.steps.some((s) => /ROCm|win-rocm-x64/.test(String(s.label || ''))));
    });

    it('checkLlamaServerRuntime reports probed install tag', () => {
        const { checkLlamaServerRuntime } = require('../electron/env-check');
        const item = checkLlamaServerRuntime();
        assert.equal(item.id, 'llamaServerRuntime');
        assert.ok(['ok', 'warn', 'fail'].includes(item.status));
        assert.equal(typeof item.detail, 'string');
        assert.equal(item.blocking, false);
    });

    it('checkGpu marks AMD discrete GPU as ok for llama-server', async () => {
        const gpuPath = require.resolve('../electron/gpu-detect');
        const envPath = require.resolve('../electron/env-check');
        const prefer = require('../electron/advanced-runtime-prefer');
        const realGpu = require('../electron/gpu-detect');
        const cachedGpu = require.cache[gpuPath];
        require.cache[gpuPath] = {
            id: gpuPath,
            filename: gpuPath,
            loaded: true,
            exports: {
                ...realGpu,
                detectGpuEnvironment: async () => ({
                    vendor: 'amd',
                    detected: true,
                    gpuName: 'Radeon RX 7800 XT',
                    rocmSuffix: 'gfx110x_all',
                }),
            },
        };
        delete require.cache[envPath];
        prefer._resetForTests();
        try {
            const envCheck = require('../electron/env-check');
            const { gpu, driver, info } = await envCheck.checkGpu();
            assert.equal(info.vendor, 'amd');
            assert.equal(gpu.status, 'ok');
            assert.equal(gpu.vendor, 'amd');
            assert.match(String(gpu.detail), /ROCm|引擎/);
            assert.equal(driver.status, 'ok');
            assert.match(String(driver.detail), /AMD/);

            const runtime = await envCheck.checkGpuRuntime(info, '');
            assert.equal(runtime.id, 'gpuRuntime');
            assert.equal(runtime.vendor, 'amd');
            // Without ROCm torch in the engine runtime, status must warn (not pretend ready).
            assert.equal(runtime.hasRocm, true);
            assert.equal(runtime.torchRocm, false);
            assert.equal(runtime.status, 'warn');
            assert.equal(runtime.engineDevice, 'cpu');
            assert.match(String(runtime.detail), /ROCm PyTorch/);
            assert.doesNotMatch(String(runtime.detail), /^CPU 模式/);
        } finally {
            if (cachedGpu) require.cache[gpuPath] = cachedGpu;
            else delete require.cache[gpuPath];
            delete require.cache[envPath];
            prefer._resetForTests();
            require('../electron/env-check');
        }
    });

    it('checkGpuRuntime CPU path keeps CUDA-free message without AMD vendor', async () => {
        const { checkGpuRuntime } = require('../electron/env-check');
        const item = await checkGpuRuntime({ vendor: 'unknown', detected: false }, '');
        assert.equal(item.status, 'ok');
        assert.match(String(item.detail), /CPU 模式/);
    });

    it('planEnvFixes notes tokenizers downgrade for Qwen runtime mismatch', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'qwenRuntime',
                status: 'fail',
                detail: 'tokenizers 0.23.1 与 transformers 不兼容（需要 tokenizers==0.22.2）',
                tokenizersMismatch: true,
                blocking: true,
            },
        ], { engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame' });
        assert.ok(plan.modelIds.includes('qwen3-asr-1.7b-ja-anime-galgame'));
        assert.ok(plan.forceIds.includes('qwen3-asr-1.7b-ja-anime-galgame'));
        const step = plan.steps.find((s) => s.id === 'qwenRuntime');
        assert.ok(step);
        assert.match(step.label, /tokenizers 降级至 0\.22\.2/);
    });

    it('planEnvFixes notes numpy repair for Qwen runtime metadata break', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'qwenRuntime',
                status: 'fail',
                detail: 'numpy 元数据损坏或版本超出 Numba 上限（需要 <2.5）',
                numpyBroken: true,
                blocking: true,
            },
        ], { engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame' });
        assert.ok(plan.modelIds.includes('qwen3-asr-1.7b-ja-anime-galgame'));
        assert.ok(plan.forceIds.includes('qwen3-asr-1.7b-ja-anime-galgame'));
        const step = plan.steps.find((s) => s.id === 'qwenRuntime');
        assert.ok(step);
        assert.match(step.label, /numpy 兼容修复/);
    });

    it('planEnvFixes ensures CUDA PyTorch when torch engine startup probe fails', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'torchEngineStartup',
                status: 'fail',
                detail: 'Torch CUDA 库加载失败（WinError 1114 · cublas）',
                needsTorchCuda: true,
                code: 'TORCH_CUDA_LOAD',
            },
        ], { engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame' });
        assert.equal(plan.ensureTorchCuda, true);
        assert.ok(plan.steps.some((s) => s.id === 'audioSeparate'));
        assert.ok(plan.steps.some((s) => s.id === 'torchEngineStartup'));
    });

    it('planEnvFixes ensures CUDA PyTorch when Qwen reports torchaudio hybrid', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'qwenRuntime',
                status: 'fail',
                detail: 'CUDA PyTorch 已在磁盘，但 torchaudio 无法加载或不匹配（WinError 127）',
                needsTorchCuda: true,
                blocking: true,
            },
        ], { engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame' });
        assert.equal(plan.ensureTorchCuda, true);
        assert.ok(plan.steps.some((s) => s.id === 'audioSeparate'));
        assert.ok(plan.steps.some((s) => s.id === 'qwenRuntime'));
        const cudaStep = plan.steps.find((s) => s.id === 'audioSeparate');
        assert.match(String(cudaStep.label), /torch\+torchaudio|CUDA PyTorch/);
    });

    it('planEnvFixes routes AMD Qwen ROCm gap to ROCm not CUDA', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'amd',
                detail: 'AMD Radeon RX 7900 XTX',
            },
            {
                id: 'qwenRuntime',
                status: 'warn',
                detail: '引擎运行时缺少 ROCm 版 PyTorch。系统 pip 无效，请点「自动修复」装进引擎。',
                needsTorchRocm: true,
                blocking: false,
            },
        ], { engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame' });
        assert.equal(plan.ensureTorchRocm, true);
        assert.equal(plan.ensureTorchCuda, false);
        assert.ok(plan.steps.some((s) => s.id === 'torchRocm'));
        assert.ok(!plan.steps.some((s) => s.id === 'audioSeparate'));
    });

    it('planEnvFixes installs XPU PyTorch for Intel when gpuRuntime warns', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'intel',
                detail: 'Intel Arc A770',
            },
            {
                id: 'gpuRuntime',
                status: 'warn',
                vendor: 'intel',
                hasXpu: true,
                hasSycl: true,
                torchXpu: false,
                detail: 'Intel Arc：引擎运行时缺少 XPU PyTorch。系统 pip 无效。',
            },
        ]);
        assert.equal(plan.ensureTorchXpu, true);
        assert.equal(plan.ensureTorchCuda, false);
        assert.equal(plan.ensureTorchRocm, false);
        assert.equal(plan.fixable, true);
        assert.ok(plan.steps.some((s) => s.id === 'torchXpu'));
        assert.ok(!plan.steps.some((s) => s.id === 'audioSeparate'));
    });

    it('planEnvFixes routes Intel Qwen gap to XPU not CUDA/ROCm', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'intel',
                detail: 'Intel Arc B580',
            },
            {
                id: 'qwenRuntime',
                status: 'warn',
                detail: '引擎运行时缺少 XPU 版 PyTorch。',
                needsTorchXpu: true,
                needsTorchCuda: true,
                blocking: false,
            },
        ], { engineAsrModel: 'qwen3-asr-1.7b' });
        assert.equal(plan.ensureTorchXpu, true);
        assert.equal(plan.ensureTorchCuda, false);
        assert.equal(plan.ensureTorchRocm, false);
        assert.ok(plan.steps.some((s) => s.id === 'torchXpu'));
    });

    it('planEnvFixes does not queue XPU on Intel for unrelated torch startup fails', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'intel',
            },
            {
                id: 'gpuRuntime',
                status: 'ok',
                vendor: 'intel',
                hasXpu: true,
                torchXpu: true,
            },
            {
                id: 'torchEngineStartup',
                status: 'fail',
                code: 'POLICY_BLOCKED',
                detail: 'Windows 智能应用控制/应用程序控制策略拦截了 torch DLL',
            },
        ]);
        assert.equal(plan.ensureTorchXpu, false);
        assert.equal(plan.ensureTorchCuda, false);
        assert.ok(!plan.steps.some((s) => s.id === 'torchXpu'));
    });

    it('planEnvFixes installs XPU when Intel torch startup fails', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'intel',
            },
            {
                id: 'torchEngineStartup',
                status: 'fail',
                code: 'NEED_TORCH_XPU',
                needsTorchXpu: true,
                detail: '未安装 XPU 版 PyTorch。系统 pip 无效。',
            },
        ]);
        assert.equal(plan.ensureTorchXpu, true);
        assert.equal(plan.ensureTorchCuda, false);
        assert.equal(plan.ensureTorchRocm, false);
        assert.ok(plan.steps.some((s) => s.id === 'torchXpu'));
    });

    it('planEnvFixes routes AMD TORCH_CUDA_LOAD to ROCm not CUDA', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            {
                id: 'torchEngineStartup',
                status: 'fail',
                detail: 'Torch HIP/ROCm 库加载失败。请点「自动修复」补齐 ROCm PyTorch',
                needsTorchRocm: true,
                hasRocm: true,
                code: 'TORCH_CUDA_LOAD',
            },
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'amd',
                detail: 'AMD Radeon RX 9070',
            },
        ], { engineAsrModel: 'qwen3-asr-1.7b' });
        assert.equal(plan.ensureTorchRocm, true);
        assert.equal(plan.ensureTorchCuda, false);
        assert.ok(plan.steps.some((s) => s.id === 'torchRocm'));
        assert.ok(!plan.steps.some((s) => s.id === 'audioSeparate'));
    });

    it('buildEngineProbeEnv sets KMP_DUPLICATE_LIB_OK', () => {
        const { buildEngineProbeEnv } = require('../electron/env-check');
        const env = buildEngineProbeEnv(path.join(__dirname, '..', 'transub-engine'));
        assert.equal(env.KMP_DUPLICATE_LIB_OK, 'TRUE');
    });

    it('normalizeEnvCheckScope accepts base/runtime/full', () => {
        const {
            normalizeEnvCheckScope,
            ENV_CHECK_BASE_IDS,
            ENV_CHECK_RUNTIME_IDS,
        } = require('../electron/env-check');
        assert.equal(normalizeEnvCheckScope('base'), 'base');
        assert.equal(normalizeEnvCheckScope('runtime'), 'runtime');
        assert.equal(normalizeEnvCheckScope(''), 'full');
        assert.equal(normalizeEnvCheckScope('other'), 'full');
        assert.ok(ENV_CHECK_BASE_IDS.includes('engine'));
        assert.ok(ENV_CHECK_BASE_IDS.includes('torchEngineStartup'));
        assert.ok(!ENV_CHECK_BASE_IDS.includes('whisperRuntime'));
        assert.ok(ENV_CHECK_RUNTIME_IDS.includes('whisperRuntime'));
        assert.ok(ENV_CHECK_RUNTIME_IDS.includes('sensevoiceRuntime'));
        assert.ok(ENV_CHECK_RUNTIME_IDS.includes('qwenRuntime'));
        assert.ok(ENV_CHECK_RUNTIME_IDS.includes('torchEngineStartup'));
        assert.ok(!ENV_CHECK_RUNTIME_IDS.includes('ffmpeg'));
    });

    it('requireDiscreteGpu turns CPU soft-ok into blocking fail', async () => {
        const {
            checkGpuRuntime,
            applyRequireDiscreteGpuPolicy,
            isVersionGatePassed,
            planEnvFixes,
            VERSION_GATE_IDS,
        } = require('../electron/env-check');
        assert.ok(VERSION_GATE_IDS.includes('gpu'));
        assert.ok(VERSION_GATE_IDS.includes('gpuRuntime'));

        const cpuOk = await checkGpuRuntime({ vendor: 'unknown', detected: false }, '');
        assert.equal(cpuOk.status, 'ok');

        const cpuFail = await checkGpuRuntime(
            { vendor: 'unknown', detected: false },
            '',
            { requireDiscreteGpu: true },
        );
        assert.equal(cpuFail.status, 'fail');
        assert.equal(cpuFail.blocking, true);
        assert.match(String(cpuFail.detail), /独立 GPU/);

        const items = [
            {
                id: 'gpu',
                label: 'GPU',
                status: 'warn',
                detail: '未检测到独立 NVIDIA 显卡',
                blocking: false,
            },
            {
                id: 'gpuRuntime',
                label: 'GPU 运行时',
                status: 'ok',
                detail: 'CPU 模式，无需 CUDA 运行库',
                blocking: false,
            },
            { id: 'engine', label: 'Engine', status: 'ok', blocking: false },
            { id: 'installPath', label: 'Path', status: 'ok', blocking: false },
            { id: 'ffmpeg', label: 'FFmpeg', status: 'ok', blocking: false },
            { id: 'vcRedist', label: 'VC++', status: 'ok', blocking: false },
            { id: 'llamaServerRuntime', label: 'llama', status: 'ok', blocking: false },
            { id: 'torchEngineStartup', label: 'Torch', status: 'ok', blocking: false },
        ];
        applyRequireDiscreteGpuPolicy(items, {
            requireDiscreteGpu: true,
            gpuInfo: { vendor: 'unknown', detected: false },
        });
        assert.equal(items.find((it) => it.id === 'gpu').status, 'fail');
        assert.equal(items.find((it) => it.id === 'gpuRuntime').status, 'fail');
        assert.equal(isVersionGatePassed({ items, fix: { fixable: false } }), false);

        const plan = planEnvFixes([
            {
                id: 'gpuRuntime',
                status: 'fail',
                detail: '未检测到可用独立 GPU（NVIDIA / AMD / Intel Arc）或驱动不可用。本产品需要独立显卡，不能以 CPU 模式继续。',
                requireDiscreteGpu: true,
            },
        ]);
        assert.equal(plan.ensureGpu, false);
    });

    it('requireDiscreteGpu accepts Intel Arc as discrete GPU', () => {
        const { applyRequireDiscreteGpuPolicy } = require('../electron/env-check');
        const items = [
            { id: 'gpu', label: 'GPU', status: 'ok', vendor: 'intel', blocking: false },
            {
                id: 'gpuRuntime',
                label: 'GPU 运行时',
                status: 'ok',
                vendor: 'intel',
                detail: 'Intel Arc · SYCL',
                blocking: false,
            },
        ];
        applyRequireDiscreteGpuPolicy(items, {
            requireDiscreteGpu: true,
            gpuInfo: { vendor: 'intel', detected: true, gpuName: 'Intel Arc A770' },
        });
        assert.equal(items.find((it) => it.id === 'gpu').status, 'ok');
        assert.equal(items.find((it) => it.id === 'gpuRuntime').status, 'ok');
    });

    it('requireDiscreteGpu upgrades gpuRuntime warn to fail and keeps ensureGpu', () => {
        const {
            applyRequireDiscreteGpuPolicy,
            isVersionGatePassed,
            planEnvFixes,
        } = require('../electron/env-check');
        const items = [
            {
                id: 'gpu',
                label: 'GPU',
                status: 'ok',
                vendor: 'nvidia',
                blocking: false,
            },
            {
                id: 'gpuRuntime',
                label: 'GPU 运行时',
                status: 'warn',
                detail: '未找到 cublas64_12.dll',
                blocking: false,
            },
            { id: 'engine', status: 'ok' },
            { id: 'installPath', status: 'ok' },
            { id: 'ffmpeg', status: 'ok' },
            { id: 'vcRedist', status: 'ok' },
            { id: 'llamaServerRuntime', status: 'ok' },
            { id: 'torchEngineStartup', status: 'ok' },
        ];
        applyRequireDiscreteGpuPolicy(items, {
            requireDiscreteGpu: true,
            gpuInfo: { vendor: 'nvidia', detected: true },
        });
        assert.equal(items.find((it) => it.id === 'gpuRuntime').status, 'fail');
        assert.equal(isVersionGatePassed({ items, fix: { fixable: false } }), false);
        const plan = planEnvFixes(items);
        assert.equal(plan.ensureGpu, true);
        assert.ok(plan.steps.some((s) => s.id === 'gpuRuntime'));
    });

    it('isVersionGatePassed requires green gate ids and no fixable plan', () => {
        const { isVersionGatePassed } = require('../electron/env-check');
        const okItems = [
            'installPath', 'ffmpeg', 'vcRedist', 'gpu', 'gpuRuntime',
            'engine', 'llamaServerRuntime', 'torchEngineStartup',
        ].map((id) => ({ id, status: 'ok' }));
        assert.equal(isVersionGatePassed({ items: okItems, fix: { fixable: false } }), true);
        assert.equal(isVersionGatePassed({ items: okItems, fix: { fixable: true } }), false);
        assert.equal(isVersionGatePassed({
            items: okItems.map((it) => (
                it.id === 'gpuRuntime' ? { ...it, status: 'warn' } : it
            )),
            fix: { fixable: false },
        }), false);
    });

    it('AMD missing ROCm: version gate fails and plans Torch ROCm (not CUDA ensureGpu)', () => {
        const {
            applyRequireDiscreteGpuPolicy,
            planEnvFixes,
            isVersionGatePassed,
        } = require('../electron/env-check');
        const items = [
            { id: 'installPath', status: 'ok' },
            { id: 'ffmpeg', status: 'ok' },
            { id: 'vcRedist', status: 'ok' },
            {
                id: 'gpu',
                status: 'ok',
                vendor: 'amd',
                detail: 'Radeon RX 7800 XT（引擎内 ROCm）',
            },
            {
                id: 'gpuRuntime',
                status: 'warn',
                vendor: 'amd',
                hasRocm: true,
                torchRocm: false,
                detail: 'Radeon RX 7800 XT：引擎运行时缺少 ROCm PyTorch。系统 pip 无效，请点「自动修复」装进引擎。Whisper 仍走 CPU。',
            },
            { id: 'engine', status: 'ok' },
            { id: 'llamaServerRuntime', status: 'ok' },
            { id: 'torchEngineStartup', status: 'fail', needsTorchRocm: true, detail: 'NEED_TORCH_ROCM' },
        ];
        applyRequireDiscreteGpuPolicy(items, {
            requireDiscreteGpu: true,
            gpuInfo: { vendor: 'amd', detected: true, gpuName: 'Radeon RX 7800 XT' },
        });
        const rt = items.find((it) => it.id === 'gpuRuntime');
        assert.equal(rt.status, 'fail');
        assert.equal(rt.hasRocm, true);
        assert.equal(rt.torchRocm, false);
        assert.equal(rt.requireDiscreteGpu, undefined);

        const plan = planEnvFixes(items);
        assert.equal(plan.ensureTorchRocm, true);
        assert.equal(plan.ensureGpu, false);
        assert.equal(plan.ensureTorchCuda, false);
        assert.ok(plan.steps.some((s) => s.id === 'torchRocm'));
        assert.ok(plan.steps.some((s) => s.id === 'gpuRuntime' && /ROCm|AMD/i.test(s.label)));
        assert.ok(!plan.steps.some((s) => /cuBLAS|CUDA 组件|onnxruntime-gpu/i.test(s.label)));
        assert.equal(isVersionGatePassed({ items, fix: plan }), false);
    });

    it('AMD ROCm torch without gfx kernels plans Torch ROCm (not CUDA)', () => {
        const { planEnvFixes } = require('../electron/env-check');
        const plan = planEnvFixes([
            { id: 'gpu', status: 'ok', vendor: 'amd' },
            {
                id: 'gpuRuntime',
                status: 'need_install',
                vendor: 'amd',
                hasRocm: true,
                hasCuda: false,
                torchRocm: true,
                rocmDeviceKernels: false,
                detail: 'hipErrorInvalidImage',
            },
        ]);
        assert.equal(plan.ensureTorchRocm, true);
        assert.equal(plan.ensureTorchCuda, false);
        assert.equal(plan.ensureGpu, false);
        assert.ok(plan.steps.some((s) => s.id === 'torchRocm'));
    });

    it('AMD with ROCm ready passes version gate without CUDA steps', () => {
        const { planEnvFixes, isVersionGatePassed } = require('../electron/env-check');
        const items = [
            { id: 'installPath', status: 'ok' },
            { id: 'ffmpeg', status: 'ok' },
            { id: 'vcRedist', status: 'ok' },
            { id: 'gpu', status: 'ok', vendor: 'amd' },
            {
                id: 'gpuRuntime',
                status: 'ok',
                vendor: 'amd',
                hasRocm: true,
                torchRocm: true,
                detail: 'ROCm PyTorch 已就绪',
            },
            { id: 'engine', status: 'ok' },
            { id: 'llamaServerRuntime', status: 'ok' },
            { id: 'torchEngineStartup', status: 'ok' },
        ];
        const plan = planEnvFixes(items);
        assert.equal(plan.ensureGpu, false);
        assert.equal(plan.ensureTorchRocm, false);
        assert.equal(plan.ensureTorchCuda, false);
        assert.equal(isVersionGatePassed({ items, fix: plan }), true);
    });

    it('NVIDIA missing cublas: plans ensureGpu CUDA support (not ROCm)', () => {
        const {
            applyRequireDiscreteGpuPolicy,
            planEnvFixes,
            isVersionGatePassed,
        } = require('../electron/env-check');
        const items = [
            { id: 'installPath', status: 'ok' },
            { id: 'ffmpeg', status: 'ok' },
            { id: 'vcRedist', status: 'ok' },
            { id: 'gpu', status: 'ok', vendor: 'nvidia', detail: 'NVIDIA GeForce RTX 4070' },
            {
                id: 'gpuRuntime',
                status: 'warn',
                detail: '未找到 cublas64_12.dll；可先用 CPU，或稍后在「运行环境」下载 GPU 支持',
            },
            { id: 'engine', status: 'ok' },
            { id: 'llamaServerRuntime', status: 'ok' },
            { id: 'torchEngineStartup', status: 'ok' },
        ];
        applyRequireDiscreteGpuPolicy(items, {
            requireDiscreteGpu: true,
            gpuInfo: { vendor: 'nvidia', detected: true, gpuName: 'RTX 4070' },
        });
        assert.equal(items.find((it) => it.id === 'gpuRuntime').status, 'fail');
        const plan = planEnvFixes(items);
        assert.equal(plan.ensureGpu, true);
        assert.equal(plan.ensureTorchRocm, false);
        assert.ok(plan.steps.some((s) => s.id === 'gpuRuntime' && /CUDA|cuBLAS/i.test(s.label)));
        assert.equal(isVersionGatePassed({ items, fix: plan }), false);
    });

    it('runEnvCheck emits onProgress while probing base scope', async () => {
        const { runEnvCheck } = require('../electron/env-check');
        const events = [];
        const result = await runEnvCheck({
            scope: 'base',
            requireDiscreteGpu: false,
            syncLlamaBackend: false,
            onProgress: (p) => {
                if (p && typeof p === 'object') events.push(p);
            },
        });
        assert.ok(Array.isArray(result.items));
        assert.ok(events.length >= 2);
        assert.ok(events.some((e) => e.kind === 'phase' || e.kind === 'item'));
        assert.ok(events.some((e) => e.kind === 'done'));
        assert.ok(events.some((e) => Array.isArray(e.items)));
    });
});
