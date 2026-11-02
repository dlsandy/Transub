const assert = require('assert');
const pipe = require('../src/js/jev-laya-pipeline-core');
const polish = require('../src/js/smart-translate-polish-core');

describe('jev-laya-pipeline-core', () => {
    it('builds keep/swap and score requests', () => {
        const ks = pipe.buildKeepSwapRequest([{
            index: 0,
            oldText: '你好',
            newText: '您好啊朋友',
            sourceText: 'こんにちは',
        }]);
        assert.ok(ks.questions.k0);
        assert.strictEqual(ks.questions.k0.type, 'choice');
        const sc = pipe.buildScoreRankRequest('t', [{ index: 1, text: '译文', sourceText: '原文' }]);
        assert.ok(sc.questions.s1);
        assert.strictEqual(sc.questions.s1.type, 'score');
    });

    it('partitions keep_new vs keep_old', () => {
        const items = [{ id: 'k0' }, { id: 'k1' }];
        const part = pipe.partitionKeepSwap({
            k0: { type: 'choice', choice: 'keep_new', confidence: 0.9 },
            k1: { type: 'choice', choice: 'keep_old', confidence: 0.9 },
        }, items, 0.75);
        assert.strictEqual(part.accept.length, 1);
        assert.strictEqual(part.reject.length, 1);
    });

    it('classifies polish soft vs hard via relaxed filter', () => {
        const prev = new Map([[0, '这是一句测试译文'], [1, '短']]);
        const updates = [
            { index: 0, text: '这是一句明显拉长很多但主题仍在的测试译文内容呀' },
            { index: 1, text: '短一点' },
        ];
        const classified = polish.classifyPlotPolishUpdates(updates, prev, {});
        assert.ok(classified.keep || classified.soft || classified.hardDrop);
        assert.ok(Array.isArray(classified.soft));
    });

    it('merges score reorder', () => {
        const scores = new Map([['s2', 0.9], ['s0', 0.2]]);
        const ordered = pipe.mergeScoreReorder([0, 1, 2], scores, { 1: 9 });
        assert.strictEqual(ordered[0], 2);
    });

    it('mid-band polish score helper', () => {
        assert.strictEqual(pipe.isMidBandPolishScore(3), true);
        assert.strictEqual(pipe.isMidBandPolishScore(1.5), true);
        assert.strictEqual(pipe.isMidBandPolishScore(9), false);
        assert.strictEqual(pipe.isMidBandPolishScore(0.5), false);
    });

    it('classifies kimochi underfill soft vs hard bands', () => {
        assert.strictEqual(
            pipe.classifyKimochiUnderfillBand('好舒服', '気持ちいい', { _polishChanged: false }),
            'hard_keep',
        );
        assert.strictEqual(
            pipe.classifyKimochiUnderfillBand('好舒服', 'めっちゃ気持ちいい', {
                _polishChanged: true,
                _polishText: '超级好舒服',
            }),
            'hard_expand',
        );
        assert.strictEqual(
            pipe.classifyKimochiUnderfillBand('好舒服', 'みんなのおかげで気持ちよくなっちゃう', {
                _polishChanged: false,
            }),
            'soft',
        );
        assert.strictEqual(
            pipe.classifyKimochiUnderfillBand('谢谢', '気持ちいい'),
            'skip',
        );
    });

    it('builds and partitions kimochi underfill Choice', () => {
        const items = [{
            index: 3,
            id: 'kf3',
            currentText: '好舒服',
            expandText: '嘴巴好舒服',
            sourceText: '口が気持ちいい',
            hasExpand: true,
        }];
        const built = pipe.buildKimochiUnderfillRequest(items);
        assert.ok(built.questions.kf3);
        assert.strictEqual(built.questions.kf3.type, 'choice');
        assert.ok(built.questions.kf3.criteria.expand);
        assert.ok(built.questions.kf3.criteria.keep_stub);
        assert.ok(built.questions.kf3.criteria.blank_retry);

        const part = pipe.partitionKimochiUnderfill({
            kf3: { type: 'choice', choice: 'expand', confidence: 0.9 },
        }, items, 0.65);
        assert.strictEqual(part.expand.length, 1);
        assert.strictEqual(part.keep.length, 0);

        const blanked = pipe.partitionKimochiUnderfill({
            kf3: { type: 'choice', choice: 'blank_retry', confidence: 0.9 },
        }, items, 0.65);
        assert.strictEqual(blanked.blank.length, 1);

        const kept = pipe.partitionKimochiUnderfill({
            kf3: { type: 'choice', choice: 'keep_stub', confidence: 0.9 },
        }, items, 0.65);
        assert.strictEqual(kept.keep.length, 1);
    });

    it('applies kimochi underfill expand and blank decisions', () => {
        const cues = [
            { index: 0, text: '好舒服' },
            { index: 1, text: '好舒服' },
            { index: 2, text: '好舒服' },
        ];
        const applied = pipe.applyKimochiUnderfillDecisions(cues, {
            hardExpand: [{ index: 0, expandText: '超级好舒服' }],
            expand: [{ index: 1, expandText: '嘴巴好舒服' }],
            blank: [{ index: 2 }],
        }, { blankText: '' });
        assert.strictEqual(applied.changed, 3);
        assert.strictEqual(applied.cues[0].text, '超级好舒服');
        assert.strictEqual(applied.cues[1].text, '嘴巴好舒服');
        assert.strictEqual(applied.cues[2].text, '');
    });

    it('collects soft kimochi stubs over richer JA', () => {
        const zh = [{ index: 1, text: '好舒服' }];
        const ja = [{ index: 1, text: 'みんなのおかげで気持ちよくなっちゃうよ' }];
        const collected = pipe.collectKimochiUnderfillCandidates(zh, ja);
        assert.ok(collected.soft.length + collected.hardExpand.length >= 1);
    });

    it('score rank instructions ask for full-scale differentiation', () => {
        const sc = pipe.buildScoreRankRequest('t', [{ index: 1, text: '译文', sourceText: '原文' }]);
        assert.ok(String(sc.questions.s1.instructions).includes('full scale'));
        assert.ok(Array.isArray(sc.questions.s1.criteria) && sc.questions.s1.criteria.length >= 4);
    });
});
