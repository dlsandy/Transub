const assert = require('assert');
const jev = require('../src/js/jev-decision-core');
const asr = require('../src/js/asr-second-opinion-core');
const repair = require('../src/js/asr-semantic-repair-core');

describe('jev-decision-core builders & partition', () => {
    it('builds choice/score/noul questions', () => {
        const c = jev.buildChoiceQuestion({
            instructions: 'pick',
            criteria: { a: 'A', b: 'B' },
        });
        assert.strictEqual(c.type, 'choice');
        assert.strictEqual(c.criteria.a, 'A');
        const s = jev.buildScoreQuestion({ instructions: 'rate', min: 0, max: 1 });
        assert.strictEqual(s.type, 'score');
        assert.strictEqual(s.max, 1);
        assert.ok(Array.isArray(s.criteria) && s.criteria.length >= 2);
        assert.deepStrictEqual(s.criteria, [...jev.DEFAULT_SCORE_CRITERIA]);
        const n = jev.buildNoulQuestion({ instructions: 'ping' });
        assert.strictEqual(n.type, 'noul');
    });

    it('normalizes OpenDecider discrete scores to unit interval', () => {
        const unit = jev.normalizeScoreToUnit({
            type: 'score',
            score: 1,
            expected: 1.5,
            probabilities: { 0: 0.1, 1: 0.4, 2: 0.3, 3: 0.2 },
            confidence: 0.4,
        });
        assert.ok(Math.abs(unit - 0.5) < 1e-6);
        assert.strictEqual(jev.isConfidentScore({
            type: 'score',
            score: 1,
            expected: 1.5,
            probabilities: { 0: 0.1, 1: 0.4, 2: 0.3, 3: 0.2 },
            confidence: 0.35,
        }, 0.65), true);
    });

    it('partitions binary choices by confidence', () => {
        const items = [{ id: 'q0' }, { id: 'q1' }, { id: 'q2' }];
        const part = jev.partitionBinaryChoices({
            q0: { type: 'choice', choice: 'accept', confidence: 0.9 },
            q1: { type: 'choice', choice: 'revert', confidence: 0.91 },
            q2: { type: 'choice', choice: 'accept', confidence: 0.4 },
        }, items, {
            minConfidence: 0.75,
            acceptChoices: ['accept'],
            rejectChoices: ['revert'],
        });
        assert.strictEqual(part.decided, 2);
        assert.strictEqual(part.accept.length, 1);
        assert.strictEqual(part.reject.length, 1);
        assert.strictEqual(part.undecided.length, 1);
    });

    it('picks confident scores', () => {
        const scores = jev.pickConfidentScores({
            s0: {
                type: 'score',
                score: 3,
                expected: 2.4,
                probabilities: { 0: 0.1, 1: 0.2, 2: 0.3, 3: 0.4 },
                confidence: 0.4,
            },
            s1: { type: 'score', score: 0.2, confidence: 0.2 },
            s2: {
                type: 'score',
                score: 2,
                expected: 1.8,
                probabilities: { 0: 0.2, 1: 0.2, 2: 0.22, 3: 0.2, 4: 0.18 },
                confidence: 0.22,
            },
        }, ['s0', 's1', 's2'], 0.65);
        assert.ok(scores.has('s0'));
        assert.ok(scores.get('s0') > 0.7);
        assert.strictEqual(scores.has('s1'), false);
        // expected present → keep even when nano max-prob is low
        assert.ok(scores.has('s2'));
    });

    it('soft-accepts nano binary Choice with clear margin', () => {
        assert.strictEqual(jev.isConfidentChoice({
            type: 'choice',
            choice: 'accept',
            confidence: 0.54,
            probabilities: { accept: 0.54, revert: 0.46 },
        }, 0.65), true);
        assert.strictEqual(jev.isConfidentChoice({
            type: 'choice',
            choice: 'trust_heuristic',
            confidence: 0.501,
            probabilities: { trust_heuristic: 0.501, distrust: 0.499 },
        }, 0.65), false);
    });
});

describe('asr second-opinion Laya helpers', () => {
    it('flags ambiguous keep_primary when texts differ', () => {
        const primary = [{ text: 'こんにちは' }];
        const opinion = [{ text: 'こんばんは' }];
        const winner = asr.chooseSecondOpinionWinner(primary, opinion);
        assert.strictEqual(winner.useOpinion, false);
        assert.strictEqual(asr.isAmbiguousSecondOpinionKeep(winner, primary, opinion), true);
        assert.strictEqual(
            asr.isAmbiguousSecondOpinionKeep(winner, primary, primary),
            false,
        );
    });

    it('builds and partitions second-opinion Choice', () => {
        const built = asr.buildSecondOpinionJevRequest([{
            id: 'w0',
            primaryText: 'あいうえお',
            opinionText: 'かきくけこもっと長い文',
        }]);
        assert.ok(built.questions.w0);
        assert.strictEqual(built.questions.w0.type, 'choice');
        const part = asr.partitionSecondOpinionJevAnswers({
            w0: { type: 'choice', choice: 'opinion', confidence: 0.9 },
        }, built.items, 0.75);
        assert.strictEqual(part.useOpinion.length, 1);
        assert.strictEqual(part.decided, 1);
    });
});

describe('asr semantic-repair Laya gate helpers', () => {
    it('gates substantial validate-ok edits', () => {
        const before = 'これはテストの文章ですよね';
        // Within hard max 1.45 but still a large rewrite → gate
        const after = 'これは校正後のテスト文章ですよね';
        assert.strictEqual(repair.validateRepairUpdate(before, after, { langKey: 'ja' }).ok, true);
        assert.strictEqual(repair.repairEditNeedsLayaGate(before, after, { langKey: 'ja' }), true);
        assert.strictEqual(
            repair.repairEditNeedsLayaGate('短い', '短い', { langKey: 'ja' }),
            false,
        );
    });

    it('soft length-drift is eligible for Laya', () => {
        const before = 'あいうえおかきくけこさしすせそ';
        const after = 'あいうえおかきくけこさしすせそたちつてとなにぬねの';
        assert.strictEqual(
            repair.validateRepairUpdate(before, after, { langKey: 'ja' }).reason,
            'length_drift',
        );
        assert.strictEqual(
            repair.isSoftLengthDriftCandidate(before, after, { langKey: 'ja' }),
            true,
        );
    });

    it('splits updates into direct vs gated', () => {
        const cues = [
            { index: 0, text: '短いOK' },
            { index: 1, text: 'これはテストの文章ですよね' },
        ];
        const split = repair.splitRepairUpdatesForLayaGate(cues, [
            { index: 0, text: '短いOKだ' },
            { index: 1, text: 'これは校正後のテスト文章ですよね' },
        ], { langKey: 'ja' });
        assert.ok(split.gated.some((g) => g.index === 1) || split.direct.some((d) => d.index === 1));
    });
});
