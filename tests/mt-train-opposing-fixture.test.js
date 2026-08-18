'use strict';

const assert = require('assert');
const opposing = require('../tools/mt-train/lib/opposing-fixture');

describe('mt-train opposing-fixture', () => {
    it('builds paired strip↔remap mocha for meatRod surface', () => {
        const proposals = [{
            ji: 10,
            src: 'もう俺の形になってる？',
            dst: '已经像我的阴茎形状了？',
            after: '已经像我的阴茎形状了？',
            opposingIntent: {
                risk: true,
                intents: ['strip.meatRod.hallucination', 'remap.clinicalRod.toMeatRod'],
                note: 'test',
            },
            payload: {
                mode: 'replace',
                ja: 'もう俺の形になってる？',
                zh: '已经像我的阴茎形状了？',
                zhFrom: '阴茎',
                zhTo: '肉棒',
                jaAnchor: '形',
            },
        }];
        const out = opposing.buildOpposingFixtureDraft({
            proposals,
            suiteName: 'oppose-test',
        });
        assert.ok(out.count >= 1);
        assert.ok(out.body.includes('strip↔remap') || out.body.includes('oppose'));
        assert.ok(out.body.includes('肉棒'));
        assert.ok(out.body.includes('sanitizeMtCueText'));
        assert.ok(out.body.includes('assert.ok(!stripped.text.includes'));
        assert.ok(out.checklist.length >= 1);
        assert.ok(out.groups[0].intentIds.includes('strip.meatRod.hallucination'));
    });

    it('returns empty count when no opposing risk', () => {
        const out = opposing.buildOpposingFixtureDraft({
            proposals: [{
                ji: 1,
                payload: { mode: 'replace', zhFrom: '去', zhTo: '射', jaAnchor: 'イッ' },
            }],
        });
        assert.strictEqual(out.count, 0);
    });
});
