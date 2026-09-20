'use strict';

const assert = require('assert');
const { createPostBatchRunner } = require('../src/js/post-batch-runner-core.js');

function makeEls() {
    return {
        progressLabel: { textContent: '' },
        postBatchQcCheck: { checked: true },
        postBatchCpsSplitCheck: { checked: true },
        postBatchRemoveNoiseCheck: { checked: true },
        postBatchCompressRepCheck: { checked: true },
        postBatchViewingPunctModeSelect: { value: 'clear' },
        postBatchInterjectionModeSelect: { value: 'clear' },
        postBatchOnomatopoeiaModeSelect: { value: 'clear' },
        chineseSubtitleVariantSelect: { value: 'simplified' },
        quickTargetLangSelect: { value: 'simplified' },
        mergeBilingualOrderSelect: null,
        postBatchTextPresetGroupSelect: { value: '' },
    };
}

describe('TransubPostBatchRunner', () => {
    it('exports createPostBatchRunner', () => {
        assert.strictEqual(typeof createPostBatchRunner, 'function');
    });

    it('scanQcForItems returns zeros for empty targets', async () => {
        const runner = createPostBatchRunner({
            state: { items: [] },
            els: makeEls(),
            electron: { transubScanSubtitleQc: async () => ({ ok: true }) },
            getSubtitlePathForItem: () => 'a.srt',
            refreshListRow: () => {},
        });
        const out = await runner.scanQcForItems([]);
        assert.deepStrictEqual(out, { withIssues: 0, scanned: 0 });
    });

    it('runPostBatchQcSmartFix prompts when not entitled', async () => {
        let prompted = 0;
        const runner = createPostBatchRunner({
            state: { items: [], qcFixing: false, running: false },
            els: makeEls(),
            electron: { transubAdvancedQcSmartFix: async () => ({ ok: true }) },
            getAdvancedEntitled: () => false,
            promptProUnlockRequired: () => { prompted += 1; },
            appendLog: () => {},
            getPostBatchPathsForItem: () => ['a.srt'],
        });
        await runner.runPostBatchQcSmartFix(null, { confirm: false, quiet: false });
        assert.strictEqual(prompted, 1);
    });

    it('runPostBatchQcFix early-returns without postprocess IPC', async () => {
        const logs = [];
        const runner = createPostBatchRunner({
            state: { items: [], qcFixing: false, running: false },
            els: makeEls(),
            electron: {},
            appendLog: (msg, level) => { logs.push({ msg, level }); },
            getPostBatchPathsForItem: () => ['a.srt'],
        });
        await runner.runPostBatchQcFix(null, { confirm: false, quiet: false });
        assert.ok(logs.some((l) => String(l.msg).includes('不支持字幕后处理') && l.level === 'err'));
    });
});
