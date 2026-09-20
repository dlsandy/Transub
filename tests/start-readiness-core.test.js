const assert = require('assert');
const ready = require('../src/js/start-readiness-core');

describe('start-readiness-core', () => {
    it('computeStartBlockReason matrix', () => {
        assert.ok(ready.computeStartBlockReason({ running: true }).includes('进行中'));
        assert.ok(ready.computeStartBlockReason({
            computeBusy: true,
            computeBusyLabel: '编辑器重转写',
        }).includes('编辑器重转写'));
        assert.strictEqual(
            ready.computeStartBlockReason({ items: [] }),
            '请先添加媒体文件',
        );
        assert.strictEqual(
            ready.computeStartBlockReason({
                items: [{ selected: false, status: 'ready' }],
            }),
            '请勾选要处理的条目',
        );
        assert.strictEqual(ready.computeStartBlockReason({
            items: [{ selected: true, status: 'ready' }],
        }), '');
        assert.ok(ready.computeStartBlockReason({
            batchStartInFlight: true,
            items: [{ selected: true, status: 'ready' }],
        }).includes('进行中'));
    });

    it('buildReadinessStripViewModel tones', () => {
        const warn = ready.buildReadinessStripViewModel({
            backend: 'transub',
            task: 'translate',
            taskLabel: '翻译',
            mode: 'smart',
            modeLabel: '智能',
            asrLabel: 'sensevoice-small',
            engineOk: true,
            advancedEntitled: false,
        });
        assert.strictEqual(warn.tone, 'warn');
        assert.strictEqual(warn.action.action, 'pro');
        assert.ok(warn.text.includes('需解锁 Pro'));

        const degraded = ready.buildReadinessStripViewModel({
            backend: 'transub',
            task: 'translate',
            taskLabel: '翻译',
            mode: 'smart',
            modeLabel: '智能',
            asrLabel: 'sensevoice-small',
            engineOk: true,
            advancedEntitled: true,
            smartStripPart: '智能译降级 · 缺专训',
            smartTone: 'warn',
            smartAction: { label: '去下载专训模型', action: 'models' },
        });
        assert.strictEqual(degraded.tone, 'warn');
        assert.ok(degraded.text.includes('智能译降级'));
        assert.strictEqual(degraded.action.action, 'models');

        const ok = ready.buildReadinessStripViewModel({
            backend: 'transub',
            task: 'transcribe',
            taskLabel: '识别',
            mode: 'engine',
            modeLabel: '机器',
            engineOk: true,
            asrLabel: 'whisper-tiny',
        });
        assert.strictEqual(ok.tone, 'ok');
        assert.strictEqual(ok.action, null);

        const recIgnored = ready.buildReadinessStripViewModel({
            backend: 'transub',
            task: 'transcribe',
            taskLabel: '识别',
            mode: 'engine',
            modeLabel: '机器',
            engineOk: true,
            asrLabel: 'whisper-tiny',
            recommendedAsr: 'sensevoice-small',
        });
        assert.strictEqual(recIgnored.tone, 'ok');
        assert.strictEqual(recIgnored.action, null);
        assert.ok(!String(recIgnored.text || '').includes('推荐'));
    });

    it('buildReadinessStripViewModel shows BYOK for 推理翻译', () => {
        const byok = ready.buildReadinessStripViewModel({
            backend: 'transub',
            task: 'translate',
            taskLabel: '翻译',
            mode: 'llm',
            modeLabel: '推理翻译',
            asrLabel: 'sensevoice-small',
            engineOk: true,
            sentenceMtByok: true,
            sentenceMtByokLabel: '推理 BYOK · Sakura-Galtransl-14B-v3.8',
            llmPreferId: 'sakura-1.5b',
        });
        assert.strictEqual(byok.tone, 'ok');
        assert.ok(byok.text.includes('推理 BYOK · Sakura-Galtransl-14B-v3.8'));
        assert.ok(!byok.text.includes('推理 智能→'));
    });

    it('shouldForceReleaseStaleComputeLock only when idle', () => {
        assert.strictEqual(ready.shouldForceReleaseStaleComputeLock({
            computeBusy: true,
            running: false,
        }), true);
        assert.strictEqual(ready.shouldForceReleaseStaleComputeLock({
            computeBusy: true,
            running: true,
        }), false);
        assert.strictEqual(ready.shouldForceReleaseStaleComputeLock({
            computeBusy: false,
        }), false);
    });

    it('shouldClearStuckSubtitleTaskFlags when main is idle', () => {
        assert.strictEqual(ready.shouldClearStuckSubtitleTaskFlags({
            running: true,
            computeBusy: false,
            batchRunning: false,
        }), true);
        assert.strictEqual(ready.shouldClearStuckSubtitleTaskFlags({
            retranslateBusy: true,
            computeBusy: false,
            batchRunning: false,
        }), true);
        assert.strictEqual(ready.shouldClearStuckSubtitleTaskFlags({
            running: true,
            batchRunning: true,
        }), false);
        assert.strictEqual(ready.shouldClearStuckSubtitleTaskFlags({
            running: true,
            computeBusy: true,
        }), false);
        assert.strictEqual(ready.shouldClearStuckSubtitleTaskFlags({
            running: false,
            retranslateBusy: false,
        }), false);
    });

    it('buildParamsModeChipViewModel shows manual ASR when no preset', () => {
        const preset = ready.buildParamsModeChipViewModel({
            presetId: 'film',
            presetName: '影视对白',
        });
        assert.strictEqual(preset.label, '影视对白');

        const manual = ready.buildParamsModeChipViewModel({
            autoEnabled: false,
            asrModelLabel: 'kotoba-whisper-v2.0',
        });
        assert.strictEqual(manual.label, 'kotoba-whis…');
        assert.match(manual.title, /手动 ASR/);

        const shortAsr = ready.buildParamsModeChipViewModel({
            autoEnabled: false,
            asrModelLabel: 'sensevoice',
        });
        assert.strictEqual(shortAsr.label, 'sensevoice');

        const emptyCustom = ready.buildParamsModeChipViewModel({
            autoEnabled: false,
        });
        assert.strictEqual(emptyCustom.label, '设置');
    });
});
