const test = require('node:test');
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
} = require('../electron/env-check');

test('hasNonAscii detects CJK and accepts ASCII paths', () => {
    assert.equal(hasNonAscii('D:\\Transub-2.0.0-win'), false);
    assert.equal(hasNonAscii('C:\\Users\\user\\AppData'), false);
    assert.equal(hasNonAscii('D:\\字幕工具\\Transub'), true);
    assert.equal(hasNonAscii(''), false);
});

test('checkInstallPath returns structured item', () => {
    const item = checkInstallPath();
    assert.equal(item.id, 'installPath');
    assert.ok(['ok', 'fail'].includes(item.status));
    assert.equal(typeof item.detail, 'string');
    assert.equal(typeof item.blocking, 'boolean');
});

test('checkVcRedist returns ok or fail with action on Windows', () => {
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

test('checkEngine probes bundled path', () => {
    const item = checkEngine();
    assert.equal(item.id, 'engine');
    assert.ok(['ok', 'fail'].includes(item.status));
    assert.ok(item.path);
});

test('findCublasInEngine finds dll under nvidia/cublas/bin', () => {
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

test('ASR/VAD/LID model checks detect weight markers', () => {
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

test('ASR model check respects preferred Whisper id', () => {
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

test('SenseVoice runtime preference helpers', () => {
    const { prefersSensevoice, prefersWhisper } = require('../electron/env-check');
    assert.equal(prefersSensevoice(''), true);
    assert.equal(prefersSensevoice('sensevoice-small'), true);
    assert.equal(prefersSensevoice('whisper-large-v3-turbo'), false);
    assert.equal(prefersWhisper('whisper-large-v3-turbo'), true);
    assert.equal(prefersWhisper('sensevoice-small'), false);
});

test('planEnvFixes collects SenseVoice runtime force download', () => {
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

test('planEnvFixes ensures GPU only when runtime warns about CUDA packages', () => {
    const { planEnvFixes } = require('../electron/env-check');
    const withGpu = planEnvFixes([
        { id: 'gpuRuntime', status: 'warn', detail: '未找到 cublas64_12.dll；可先用 CPU，或稍后在「环境」下载 GPU 支持' },
    ]);
    assert.equal(withGpu.ensureGpu, true);
    const cpuOnly = planEnvFixes([
        { id: 'gpuRuntime', status: 'ok', detail: 'CPU 模式，无需 CUDA 运行库' },
    ]);
    assert.equal(cpuOnly.ensureGpu, false);
});

test('planEnvFixes forces ASR and whisper runtime when models are missing', () => {
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

test('planEnvFixes skips auto pip when Whisper is policy-blocked', () => {
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
    assert.equal(plan.fixable, false);
    assert.equal(plan.modelIds.includes('whisper-tiny'), false);
    assert.ok(plan.manualHints.some((h) => h.id === 'whisperRuntime'));
});
