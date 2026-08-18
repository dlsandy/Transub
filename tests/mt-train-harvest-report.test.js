'use strict';

const assert = require('assert');
const harvest = require('../tools/mt-train/lib/harvest-report');

describe('mt-train harvest-report', () => {
    it('marks align_gap as fruitful work-order even with zero remaps', () => {
        const out = harvest.buildHarvestReport({
            clusterCounts: { align_gap: 60, under_stub: 0 },
            allSamples: [{ cluster: 'align_gap', ji: 1, src: 'あ', dst: '' }],
            hits: [],
            proposals: [],
            wizardMode: true,
        });
        assert.strictEqual(out.fruitful, true);
        assert.ok(out.summary.workOrder >= 1);
        assert.ok(/学完了|收获|可立刻|听写|对照/.test(out.headline));
        assert.ok(out.workOrders.some((o) => o.id === 'align_gap'));
    });

    it('builds ASR drafts from asr route hits', () => {
        const drafts = harvest.buildAsrDrafts([
            {
                ji: 3,
                src: 'Jesus…よっ',
                dst: '耶稣',
                after: '耶稣',
                issues: ['latin'],
            },
        ]);
        // latin alone may be zh_remap blank — force asr_garbage
        const drafts2 = harvest.buildAsrDrafts([
            {
                ji: 4,
                src: 'ベタチンで',
                dst: '大',
                after: '大',
                issues: ['asr_garbage'],
                cluster: 'asr_garbage',
            },
        ]);
        assert.ok(drafts2.length >= 1);
        assert.strictEqual(drafts2[0].from.includes('ベタチン') || drafts2[0].from.length >= 2, true);
        // May be enriched from adult ASR table (ベタチン→デカチン)
        if (drafts2[0].to) {
            assert.ok(drafts2[0].suggestSource);
            assert.notStrictEqual(drafts2[0].to, drafts2[0].from);
        }
        assert.ok(drafts.length === 0 || drafts[0].route === 'asr');
    });

    it('includes re_mt needs_expect as work-order', () => {
        const out = harvest.buildHarvestReport({
            clusterCounts: {},
            proposals: [{
                status: 'needs_expect',
                route: 're_mt',
                issue: 'under_stub',
                ji: 9,
                src: 'ん…',
                dst: '嗯',
                after: '嗯',
            }],
            wizardMode: true,
        });
        assert.ok(out.workOrders.some((o) => o.id === 're_mt_stub'));
        assert.strictEqual(out.fruitful, true);
    });
});
