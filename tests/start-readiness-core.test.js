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
        assert.ok(ready.computeStartBlockReason({
            autoSenseEnabled: true,
            items: [{ selected: true, status: 'ready', sense: { status: 'sensing' } }],
        }).includes('感知'));
        assert.strictEqual(ready.computeStartBlockReason({
            items: [{ selected: true, status: 'ready' }],
        }), '');
    });

    it('buildReadinessStripViewModel tones', () => {
        const warn = ready.buildReadinessStripViewModel({
            backend: 'transub',
            task: 'translate',
            taskLabel: '翻译',
            mode: 'smart',
            modeLabel: 'Pro译',
            asrLabel: 'sensevoice-small',
            engineOk: true,
            advancedEntitled: false,
        });
        assert.strictEqual(warn.tone, 'warn');
        assert.strictEqual(warn.action.action, 'pro');
        assert.ok(warn.text.includes('需解锁 Pro'));

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

    it('buildParamsModeChipViewModel shows manual ASR when no preset', () => {
        const sense = ready.buildParamsModeChipViewModel({
            autoEnabled: true,
            autoSenseUi: { chipLabel: '闲置', tone: 'idle' },
        });
        assert.strictEqual(sense.label, '智能感知');

        const preset = ready.buildParamsModeChipViewModel({
            autoEnabled: false,
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
