const assert = require('assert');
const ui = require('../src/js/compute-busy-ui-core');
const asrSettings = require('../src/js/asr-settings-core');
const batchRecovery = require('../src/js/batch-recovery-core');

describe('compute-busy-ui-core', () => {
    it('formats elapsed and builds strip view', () => {
        assert.strictEqual(ui.formatComputeElapsed(Date.now() - 5000, Date.now()), '5s');
        const idle = ui.buildComputeBusyStripView({ busy: false });
        assert.strictEqual(idle.visible, false);
        const busy = ui.buildComputeBusyStripView({
            busy: true,
            label: '引擎区间重转写',
            owner: 'editor',
            since: Date.now() - 120000,
            now: Date.now(),
        });
        assert.strictEqual(busy.visible, true);
        assert.ok(busy.text.includes('引擎区间重转写'));
        assert.ok(busy.text.includes('已用'));
        assert.strictEqual(busy.showCancel, true);
    });

    it('parses window progress and tips windowed ASR', () => {
        assert.deepStrictEqual(ui.parseAsrWindowProgress('转写中 · 分窗 3/12'), {
            current: 3,
            total: 12,
            label: '分窗 3/12',
        });
        assert.ok(ui.annotateProgressWithWindow('转写中', '分窗 2/8').includes('分窗 2/8'));
        assert.ok(ui.needsWindowedAsrTip('anime-whisper'));
        assert.ok(ui.needsWindowedAsrTip('kotoba-whisper-v2.0-faster'));
        assert.ok(!ui.needsWindowedAsrTip('sensevoice-small'));
        assert.strictEqual(asrSettings.describeWindowedAsrTip('anime-whisper').visible, false);
        assert.strictEqual(ui.describeWindowedAsrTip('anime-whisper').visible, false);
        assert.strictEqual(
            ui.formatAsrFailoverTrail(['a', 'b', 'c'], 2),
            'a → b',
        );
    });
});

describe('batch-recovery failover trail', () => {
    it('includes tried ASR trail in guidance', () => {
        const g = batchRecovery.buildBatchFailureGuidance({
            message: '未识别到有效字幕',
            code: 'ASR_EMPTY',
            asrCandidates: ['whisper-ja-1.5b', 'sensevoice-small', 'whisper-tiny'],
            asrAttempts: 3,
        });
        assert.ok(g.asrTrail.includes('whisper-ja-1.5b'));
        assert.ok(g.shortTip.includes('已试'));
        assert.strictEqual(
            g.actions.find((a) => a.id === 'switch-device-cpu')?.label,
            '改用 CPU 并重试',
        );
        assert.ok(g.actions.find((a) => a.id === 'open-models')?.title?.includes('已试'));
    });
});
