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
        assert.equal(ct2Missing.ensureGpu, false);
        assert.ok(ct2Missing.modelIds.includes('whisper-tiny'));
        assert.ok(ct2Missing.steps.some((s) => s.id === 'whisperRuntime'));
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
        const outdated = planEnvFixes([
            {
                id: 'llamaServerRuntime',
                status: 'warn',
                detail: '已安装 b10077，可更新至 b10453 · win-cuda12-x64',
                outdated: true,
                installedTag: 'b10077',
                catalogTag: 'b10453',
            },
        ]);
        assert.equal(outdated.ensureLlamaRuntime, true);
        assert.equal(outdated.fixable, true);
        assert.ok(outdated.steps.some((s) => s.id === 'llamaServerRuntime'));

        const mismatch = planEnvFixes([
            {
                id: 'llamaServerRuntime',
                status: 'warn',
                detail: '偏好「CUDA」，当前为「Vulkan」，请重新安装运行时',
                mismatch: true,
                catalogTag: 'b10453',
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
                catalogTag: 'b10453',
            },
        ]);
        assert.equal(recommendInstall.ensureLlamaRuntime, true);
        assert.equal(recommendInstall.llamaRuntimeId, 'win-cuda13-x64');
        assert.ok(recommendInstall.steps.some((s) => /win-cuda13-x64/.test(String(s.label || ''))));

        const unused = planEnvFixes([
            {
                id: 'llamaServerRuntime',
                status: 'ok',
                detail: '未安装（使用软件内模型 / 智能翻译时按需安装 · llama.cpp b10453）',
            },
        ]);
        assert.equal(unused.ensureLlamaRuntime, false);
    });

    it('checkLlamaServerRuntime reports probed install tag', () => {
        const { checkLlamaServerRuntime } = require('../electron/env-check');
        const item = checkLlamaServerRuntime();
        assert.equal(item.id, 'llamaServerRuntime');
        assert.ok(['ok', 'warn', 'fail'].includes(item.status));
        assert.equal(typeof item.detail, 'string');
        assert.equal(item.blocking, false);
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
        assert.ok(!ENV_CHECK_BASE_IDS.includes('whisperRuntime'));
        assert.ok(ENV_CHECK_RUNTIME_IDS.includes('whisperRuntime'));
        assert.ok(ENV_CHECK_RUNTIME_IDS.includes('sensevoiceRuntime'));
        assert.ok(ENV_CHECK_RUNTIME_IDS.includes('qwenRuntime'));
        assert.ok(!ENV_CHECK_RUNTIME_IDS.includes('ffmpeg'));
    });
});
