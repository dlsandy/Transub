'use strict';

const assert = require('assert');
const sanitize = require('../src/js/mt-sanitize-core.js');
const autoQuality = require('../tools/mt-train/lib/auto-quality.js');
const autoPropose = require('../tools/mt-train/lib/auto-propose.js');
const train = require('../tools/mt-train/lib/train.js');

describe('mt-train auto-quality', () => {
    afterEach(() => {
        sanitize.reloadTrainedRemaps();
    });

    it('pickSharedJaAnchor finds common phrase', () => {
        const { anchor, shared } = autoQuality.pickSharedJaAnchor([
            'イッちゃうよお願い',
            'イッちゃうよだめ',
        ], ['イッちゃうよ']);
        assert.ok(shared);
        assert.ok(anchor.includes('イッちゃう'));
    });

    it('estimateCollateral counts extra hits', () => {
        const payload = {
            mode: 'replace',
            jaAnchor: 'イッ',
            zhFrom: '射了',
            zhTo: '去了',
        };
        const corpus = [
            { ji: 1, src: 'イッちゃう', dst: '要射了', after: '要射了' },
            { ji: 2, src: 'ダイッて', dst: '射了啊', after: '射了啊' },
            { ji: 3, src: '普通の会話', dst: '你好', after: '你好' },
        ];
        const col = autoQuality.estimateCollateral(payload, corpus, { targetJis: ['1'] });
        assert.ok(col.totalHits >= 1);
        assert.ok(col.extra >= 1);
    });

    it('mergeSameRemaps collapses identical zhFrom→zhTo', () => {
        const proposals = [
            {
                status: 'ready',
                ji: 1,
                src: 'イッちゃうよA',
                payload: {
                    mode: 'replace',
                    jaAnchor: 'イッちゃうよA',
                    zhFrom: '要射了',
                    zhTo: '要去了',
                    expect: '要去了啊',
                    zh: '要射了啊',
                },
                trial: { matchesExpect: true },
                accepted: true,
            },
            {
                status: 'ready',
                ji: 2,
                src: 'イッちゃうよB',
                payload: {
                    mode: 'replace',
                    jaAnchor: 'イッちゃうよB',
                    zhFrom: '要射了',
                    zhTo: '要去了',
                    expect: '要去了啊',
                    zh: '要射了啊',
                },
                trial: { matchesExpect: true },
                accepted: true,
            },
        ];
        const { proposals: out, mergeCount } = autoQuality.mergeSameRemaps(proposals);
        assert.strictEqual(mergeCount, 1);
        const merged = out.filter((p) => p.mergeSize === 2);
        assert.strictEqual(merged.length, 1);
        assert.ok(out.some((p) => p.status === 'duplicate'));
    });

    it('finalizeProposals attaches confidence and defaults accept auto only', () => {
        sanitize.reloadTrainedRemaps({ version: 1, zhRemaps: [], asrPairs: [] });
        const hits = [
            { ji: 10, src: 'イッちゃうよお願いしてる', dst: '要射了啊', after: '要射了啊', issues: ['iku_shoot'] },
            { ji: 11, src: 'イッちゃうよお願いしてるね', dst: '要射了啊', after: '要射了啊', issues: ['iku_shoot'] },
            { ji: 12, src: '別の文', dst: '要射了呀', after: '要射了呀', issues: ['iku_shoot'] },
        ];
        const out = autoPropose.proposeFromHits(sanitize, hits, {
            max: 8,
            corpus: hits,
            title: 'T',
        });
        assert.ok(out.confidence);
        const autos = out.proposals.filter((p) => p.confidence?.level === 'auto');
        for (const p of autos) assert.strictEqual(p.accepted, true);
        const reviews = out.proposals.filter((p) => p.confidence?.level === 'review');
        for (const p of reviews) assert.strictEqual(p.accepted, false);
    });

    it('scoreConfidence rejects high collateral', () => {
        const conf = autoQuality.scoreConfidence({
            status: 'ready',
            trial: { matchesExpect: true },
            payload: { jaAnchor: 'イッちゃうよ長いアンカーです', zhFrom: 'a', zhTo: 'b' },
        }, { extra: 5, totalHits: 6, intended: 1, risky: true });
        assert.strictEqual(conf.level, 'reject');
    });

    it('scoreConfidence rejects whole-sentence remaps', () => {
        const conf = autoQuality.scoreConfidence({
            status: 'ready',
            trial: { matchesExpect: true },
            payload: {
                jaAnchor: 'レッツイグ',
                zh: 'Let\'s go...Let\'s go',
                zhFrom: 'Let\'s go...Let\'s go',
                zhTo: '让我们去...让我们去',
                wholeSentence: true,
            },
        }, null);
        assert.strictEqual(conf.level, 'reject');
        assert.ok(conf.lowReuse);
    });

    it('buildWizardReport puts whole-sentence into exclude', () => {
        const report = autoQuality.buildWizardReport([
            {
                status: 'ready',
                ji: 1,
                confidence: { level: 'auto' },
                trial: { matchesExpect: true },
                payload: {
                    mode: 'replace',
                    jaAnchor: 'イッちゃう',
                    zh: '要射了',
                    zhFrom: '射了',
                    zhTo: '去了',
                },
            },
            {
                status: 'ready',
                ji: 2,
                confidence: { level: 'auto', lowReuse: true },
                trial: { matchesExpect: true },
                payload: {
                    mode: 'replace',
                    jaAnchor: 'high',
                    zh: '大家的情绪都好high啊真的',
                    zhFrom: '大家的情绪都好high啊真的',
                    zhTo: '大家的情绪都挺高的啊真的',
                    wholeSentence: true,
                },
            },
            {
                status: 'skipped',
                ji: 3,
                reason: '次要/对齐问题',
            },
        ]);
        assert.strictEqual(report.adoptCount, 1);
        assert.strictEqual(report.skipCount, 2);
        assert.ok(report.wholeFiltered >= 1);
        assert.strictEqual(report.adopt[0].ji, 1);
    });
});
