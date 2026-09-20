const assert = require('assert');
const api = require('../src/js/env-fix-progress-core.js');

describe('env-fix-progress-core', () => {
    it('collects auto steps and manual hints without duplicate ids', () => {
        const items = api.collectFixProgressItems({
            steps: [
                { id: 'qwenRuntime', label: '补齐 Qwen3-ASR 运行库' },
                { id: 'gpuRuntime', label: '下载 GPU 支持' },
                { id: 'qwenRuntime', label: 'dup' },
            ],
            manualHints: [
                { id: 'ffmpeg', label: 'FFmpeg', detail: '请手动安装' },
            ],
        });
        assert.deepStrictEqual(items.map((it) => it.id), ['qwenRuntime', 'gpuRuntime', 'ffmpeg']);
        assert.strictEqual(items[0].kind, 'auto');
        assert.strictEqual(items[2].kind, 'manual');
        assert.strictEqual(items[2].status, 'manual');
    });

    it('builds a choice message listing auto and manual items', () => {
        const msg = api.buildFixModeChoiceMessage({
            steps: [{ id: 'gpuRuntime', label: '下载 GPU 支持' }],
            manualHints: [{ id: 'engine', label: 'Transub Engine' }],
        });
        assert.ok(msg.includes('下载 GPU 支持'));
        assert.ok(msg.includes('Transub Engine'));
        assert.ok(msg.includes('自动修复会联网下载'));
    });

    it('maps fix phases to plan step ids', () => {
        const plan = {
            steps: [
                { id: 'vcRedist', label: 'VC' },
                { id: 'qwenRuntime', label: 'Qwen' },
                { id: 'whisperRuntime', label: 'Whisper' },
                { id: 'gpuRuntime', label: 'GPU' },
                { id: 'audioSeparate', label: 'Torch' },
                { id: 'torchEngineStartup', label: 'Torch startup' },
                { id: 'llamaServerRuntime', label: 'llama' },
            ],
        };
        assert.deepStrictEqual(api.stepIdsForFixPhase('vc', plan), ['vcRedist']);
        assert.deepStrictEqual(api.stepIdsForFixPhase('models', plan), ['qwenRuntime', 'whisperRuntime']);
        assert.deepStrictEqual(api.stepIdsForFixPhase('gpu', plan), ['gpuRuntime']);
        assert.deepStrictEqual(api.stepIdsForFixPhase('torch', plan), ['audioSeparate', 'torchEngineStartup']);
        assert.deepStrictEqual(api.stepIdsForFixPhase('llama', plan), ['llamaServerRuntime']);
    });

    it('formats transfer detail with size and speed', () => {
        assert.strictEqual(api.formatTransferDetail({}), '');
        const text = api.formatTransferDetail({
            downloadedBytes: 5 * 1024 * 1024,
            totalBytes: 10 * 1024 * 1024,
            bytesPerSecond: 1024 * 1024,
        });
        assert.ok(text.includes('5.0 MB / 10.0 MB'));
        assert.ok(text.includes('1.0 MB/s'));
    });

    it('matches progress text to the corresponding fix row', () => {
        const rows = [
            { id: 'qwenRuntime', kind: 'auto' },
            { id: 'gpuRuntime', kind: 'auto' },
            { id: 'whisperRuntime', kind: 'auto' },
        ];
        assert.strictEqual(
            api.matchFixStepFromProgress('正在安装 Qwen3-ASR 运行库（tokenizers==0.22.2）', rows, 'whisperRuntime'),
            'qwenRuntime',
        );
        assert.strictEqual(
            api.matchFixStepFromProgress('正在下载 GPU 支持（cublas64_12）', rows, 'qwenRuntime'),
            'gpuRuntime',
        );
        assert.strictEqual(
            api.matchFixStepFromProgress('无关文案', rows, 'whisperRuntime'),
            'whisperRuntime',
        );
    });
});
