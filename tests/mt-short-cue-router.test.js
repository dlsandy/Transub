const assert = require('assert');
const router = require('../src/js/mt-short-cue-router-core');

describe('mt-short-cue-router-core', () => {
    it('whitelists pure interjections and moans', () => {
        assert.strictEqual(router.isWhitelistShortJaCue('うん'), true);
        assert.strictEqual(router.isWhitelistShortJaCue('はぁ…'), true);
        assert.strictEqual(router.isWhitelistShortJaCue('んっ'), true);
        assert.strictEqual(router.isWhitelistShortJaCue('……'), true);
    });

    it('rejects lexical or kanji short lines', () => {
        assert.strictEqual(router.isWhitelistShortJaCue('ダメ'), false);
        assert.strictEqual(router.isWhitelistShortJaCue('来て'), false);
        assert.strictEqual(router.isWhitelistShortJaCue('真琴'), false);
        assert.strictEqual(router.isWhitelistShortJaCue('気持ちいい'), false);
        assert.strictEqual(router.isWhitelistShortJaCue('こんにちは'), false);
    });

    it('partitions hybrid batch cues when enough short cues + small model', () => {
        const cues = [
            { index: 0, text: 'うん' },
            { index: 1, text: 'ダメ、やめて' },
            { index: 2, text: 'はぁ' },
            { index: 3, text: 'んっ' },
            { index: 4, text: 'はぁ…' },
            { index: 5, text: 'ふふ' },
            { index: 6, text: 'あ' },
            { index: 7, text: 'はい' },
            { index: 8, text: '……' },
        ];
        const part = router.partitionHybridMtCues(cues, {
            mainModelId: 'sakura-galtransl-7b-q6k',
            installedIds: ['sakura-galtransl-7b-q6k', 'sakura-1.5b'],
            minRouted: 8,
        });
        assert.strictEqual(part.smallModelId, 'sakura-1.5b');
        assert.ok(part.routed >= 8);
        assert.strictEqual(part.llmCues.length, 1);
        assert.strictEqual(part.llmCues[0].index, 1);
    });

    it('skips routing when too few short cues, engine MT, or small model missing', () => {
        const cues = [
            { index: 0, text: 'うん' },
            { index: 1, text: 'ダメ、やめて' },
            { index: 2, text: 'はぁ' },
        ];
        const few = router.partitionHybridMtCues(cues, {
            mainModelId: 'sakura-galtransl-7b-q6k',
            installedIds: ['sakura-galtransl-7b-q6k', 'sakura-1.5b'],
            minRouted: 8,
        });
        assert.strictEqual(few.routed, 0);

        const engine = router.partitionHybridMtCues(
            Array.from({ length: 10 }, (_, i) => ({ index: i, text: 'うん' })),
            {
                mainModelId: 'sakura-galtransl-7b-q6k',
                installedIds: ['sakura-galtransl-7b-q6k', 'sakura-1.5b'],
                engineExternalMt: true,
                minRouted: 8,
            },
        );
        assert.strictEqual(engine.routed, 0);

        const noSmall = router.partitionHybridMtCues(cues, {
            mainModelId: 'sakura-galtransl-7b-q6k',
            installedIds: ['sakura-galtransl-7b-q6k'],
        });
        assert.strictEqual(noSmall.routed, 0);

        const alreadySmall = router.partitionHybridMtCues(
            [{ index: 0, text: 'うん' }],
            {
                mainModelId: 'sakura-1.5b',
                installedIds: ['sakura-1.5b'],
            },
        );
        assert.strictEqual(alreadySmall.routed, 0);
    });

    it('merges translated updates by cue index', () => {
        const merged = router.mergeTranslatedCues(
            [{ index: 0, text: 'ja0' }, { index: 1, text: 'ja1' }],
            [{ index: 0, text: '嗯' }],
            [{ index: 1, text: '不要' }],
        );
        assert.strictEqual(merged[0].text, '嗯');
        assert.strictEqual(merged[1].text, '不要');
    });
});
