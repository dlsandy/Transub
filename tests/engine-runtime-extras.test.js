const assert = require('assert');
const {
    modelIdsNeedWhisperExtras,
    modelIdsNeedSensevoiceExtras,
    modelIdsNeedQwenExtras,
    ensureRuntimeExtrasOffline,
} = require('../electron/engine-runtime-extras');
const {
    resolveEngineEntrypoints,
    findEngineBundledFfmpeg,
    injectNvidiaCudaPathEnv,
} = require('../electron/engine-runtime-env');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('engine-runtime-extras', () => {
    it('modelIdsNeedWhisperExtras ignores whisperseg', () => {
        assert.strictEqual(modelIdsNeedWhisperExtras(['whisper-large-v3']), true);
        assert.strictEqual(modelIdsNeedWhisperExtras(['whisperseg-asmr']), false);
        assert.strictEqual(modelIdsNeedWhisperExtras(['sensevoice-small']), false);
    });

    it('modelIdsNeedSensevoiceExtras', () => {
        assert.strictEqual(modelIdsNeedSensevoiceExtras(['sensevoice-small']), true);
        assert.strictEqual(modelIdsNeedSensevoiceExtras(['whisper-tiny']), false);
    });

    it('modelIdsNeedQwenExtras', () => {
        assert.strictEqual(modelIdsNeedQwenExtras(['qwen3-asr-0.6b']), true);
        assert.strictEqual(modelIdsNeedQwenExtras(['qwen3-forced-aligner-0.6b']), true);
        assert.strictEqual(modelIdsNeedQwenExtras(['whisper-tiny']), false);
    });

    it('ensureRuntimeExtrasOffline validates python path', async () => {
        const missing = await ensureRuntimeExtrasOffline({
            pythonPath: path.join(os.tmpdir(), 'no-such-python.exe'),
            command: 'ensure-asr-whisper',
        });
        assert.strictEqual(missing.ok, false);
        assert.ok(String(missing.error).includes('Python'));

        const noCmd = await ensureRuntimeExtrasOffline({
            pythonPath: process.execPath,
            command: '',
        });
        assert.strictEqual(noCmd.ok, false);
    });
});

describe('engine-runtime-env entrypoints', () => {
    it('resolveEngineEntrypoints returns null for empty dir', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-ep-'));
        assert.strictEqual(resolveEngineEntrypoints(dir), null);
        assert.strictEqual(findEngineBundledFfmpeg(dir), '');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('injectNvidiaCudaPathEnv is idempotent on empty install', () => {
        const env = injectNvidiaCudaPathEnv({ PATH: 'C:\\x' }, path.join(os.tmpdir(), 'no-engine'));
        assert.ok(env.PATH.includes('C:\\x') || env.PATH.includes('C:/x') || env.PATH);
    });
});
