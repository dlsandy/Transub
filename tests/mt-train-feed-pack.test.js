'use strict';

const assert = require('assert');
const feedPack = require('../tools/mt-train/lib/feed-pack');
const harvest = require('../tools/mt-train/lib/harvest-report');

describe('mt-train feed-pack', () => {
    it('builds markdown brief with paths and work-orders', () => {
        const h = harvest.buildHarvestReport({
            clusterCounts: { align_gap: 12, under_stub: 1 },
            allSamples: [
                { cluster: 'align_gap', ji: 2, src: 'あいう', dst: '', after: '' },
            ],
            proposals: [{
                status: 'needs_expect',
                route: 're_mt',
                issue: 'under_stub',
                ji: 5,
                src: 'お願い',
                dst: '请',
                after: '请',
            }],
            wizardMode: true,
        });
        const out = feedPack.buildFeedPack({
            title: 'DEMO-1',
            jaPath: 'F:/subtitles/DEMO-1.src.srt',
            zhPath: 'E:/un/DEMO-1.srt',
            harvest: h,
            scanSummary: { aligned: 100, liveHitCount: 13, alignGapCount: 12, trainableHitCount: 1 },
            tips: ['对齐空洞记入工单'],
        });
        assert.ok(out.ok);
        assert.ok(out.markdown.includes('智能翻译对照训练'));
        assert.ok(out.markdown.includes('DEMO-1'));
        assert.ok(out.markdown.includes('DEMO-1.src.srt'));
        assert.ok(out.markdown.includes('宜重对齐') || out.markdown.includes('align'));
        assert.ok(out.markdown.includes('回传检查清单'));
        assert.ok(out.meta.workOrder >= 1);
    });

    it('includes ASR and remap sections when present', () => {
        const out = feedPack.buildFeedPack({
            title: 'X',
            harvest: {
                headline: '本轮有收获',
                summary: { asrDraft: 1, zhRemapReady: 1 },
                workOrders: [],
                asrDrafts: [{ ji: 1, from: 'ベタチン', to: '', fullJa: 'ベタチンで' }],
                zhRemap: {
                    adopt: [{
                        ji: 2,
                        issue: 'iku_shoot',
                        payload: { zhFrom: '去', zhTo: '射', jaAnchor: 'イッ' },
                    }],
                    review: [],
                },
            },
        });
        assert.ok(out.markdown.includes('听写草案'));
        assert.ok(out.markdown.includes('ベタチン'));
        assert.ok(out.markdown.includes('改中文 remap'));
        assert.ok(out.markdown.includes('去'));
    });
});
