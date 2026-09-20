const assert = require('assert');
const policy = require('../src/js/quality-pipeline-policy-core');
const band = require('../src/js/cue-risk-band-core');
const gate = require('../src/js/pre-mt-qc-gate-core');
const freeze = require('../src/js/source-freeze-meta-core');
const loop = require('../src/js/post-qc-loop-plan-core');

describe('quality-pipeline-policy-core', () => {
    it('normalizes mode and activates on quality auto', () => {
        assert.strictEqual(policy.normalizeQualityPipelineMode('AUTO'), 'auto');
        assert.strictEqual(policy.normalizeQualityPipelineMode('on'), 'on');
        assert.strictEqual(policy.normalizeQualityPipelineMode(false), 'off');
        assert.strictEqual(policy.isQualityPipelineActive({
            qualityPipelineMode: 'auto',
            perfProfile: 'quality',
        }), true);
        assert.strictEqual(policy.isQualityPipelineActive({
            qualityPipelineMode: 'auto',
            perfProfile: 'speed',
        }), false);
        assert.strictEqual(policy.isQualityPipelineActive({
            qualityPipelineMode: 'on',
            perfProfile: 'speed',
        }), true);
        assert.strictEqual(policy.isQualityPipelineActive({
            qualityPipelineMode: 'off',
            perfProfile: 'quality',
        }), false);
    });

    it('clamps loop passes and retranslate cap', () => {
        assert.strictEqual(policy.clampPostQcLoopMaxPasses(99), 2);
        assert.strictEqual(policy.clampPostQcLoopMaxPasses(-1), 0);
        assert.strictEqual(policy.clampPostQcLoopMaxPasses(undefined), 1);
        assert.strictEqual(policy.clampPostQcRetranslateIndexCap(999), 200);
        assert.strictEqual(policy.clampPostQcRetranslateIndexCap('x'), 40);
    });
});

describe('cue-risk-band-core', () => {
    it('bands green / yellow / red by confidence and scrap', () => {
        const cues = [
            { text: 'こんにちは', startMs: 0, endMs: 1000 },
            { text: 'ちょっと', startMs: 1000, endMs: 2000 },
            { text: 'あアあアあアあア', startMs: 2000, endMs: 3000 },
            { text: '', startMs: 3000, endMs: 4000 },
        ];
        const anns = [
            { confidence: 0.9, low: false, flags: [] },
            { confidence: 0.48, low: true, flags: ['low_score'] },
            { confidence: 0.2, low: true, flags: ['hallucination'] },
            { confidence: 0.1, low: true, flags: [] },
        ];
        const result = band.bandCues(cues, anns);
        assert.strictEqual(result.byIndex[0], 'green');
        assert.strictEqual(result.byIndex[1], 'yellow');
        assert.strictEqual(result.byIndex[2], 'red');
        assert.strictEqual(result.byIndex[3], 'red');
        assert.ok(result.summary.red >= 2);
        assert.ok(result.summary.yellow >= 1);
    });

    it('prioritizes red then yellow for SO quota', () => {
        const picked = band.prioritizeIndexesByBand(
            [5, 1, 3, 2, 4],
            { 1: 'green', 2: 'yellow', 3: 'red', 4: 'yellow', 5: 'green' },
            3,
        );
        assert.deepStrictEqual(picked, [3, 2, 4]);
    });
});

describe('pre-mt-qc-gate-core', () => {
    it('holds red indexes and still allows MT for remaining cues', () => {
        const cues = [
            { text: 'こんにちは、元気ですか', startMs: 0, endMs: 1200 },
            { text: '', startMs: 1200, endMs: 2200 },
            { text: 'また明日会いましょう', startMs: 2200, endMs: 3400 },
        ];
        const bandResult = band.bandCues(cues, [
            { confidence: 0.9 },
            { confidence: 0.1, low: true },
            { confidence: 0.85 },
        ]);
        assert.strictEqual(bandResult.byIndex[0], 'green');
        assert.strictEqual(bandResult.byIndex[1], 'red');
        const res = gate.evaluatePreMtQcGate(cues, { bandResult });
        assert.strictEqual(res.allowMt, true);
        assert.ok(res.holdIndexes.includes(1));
        assert.strictEqual(res.reason, 'partial_hold');
    });

    it('holds invalid timing cues', () => {
        const cues = [
            { text: 'a', startMs: 500, endMs: 100 },
            { text: 'b', startMs: 1000, endMs: 2000 },
        ];
        const res = gate.evaluatePreMtQcGate(cues, {
            bandResult: { redIndexes: [], yellowIndexes: [], summary: { green: 2, yellow: 0, red: 0, total: 2 } },
        });
        assert.ok(res.holdIndexes.includes(0));
        assert.strictEqual(res.allowMt, true);
    });
});

describe('source-freeze-meta-core', () => {
    it('applies and clears freeze on meta', () => {
        const cues = [{ text: 'hi', startMs: 0, endMs: 500 }];
        const frozen = freeze.applySourceFreeze({ entries: [] }, cues, {
            holdIndexes: [2],
            frozenAt: '2026-01-01T00:00:00.000Z',
        });
        assert.strictEqual(frozen.sourceFrozen, true);
        assert.strictEqual(frozen.sourceCueCount, 1);
        assert.deepStrictEqual(frozen.holdIndexes, [2]);
        assert.ok(freeze.isSourceFrozen(frozen));
        const cleared = freeze.clearSourceFreeze(frozen);
        assert.strictEqual(cleared.sourceFrozen, false);
        assert.strictEqual(cleared.holdIndexes, undefined);
        assert.ok(cleared.unfrozenAt);
    });
});

describe('post-qc-loop-plan-core', () => {
    it('plans retranslate for blank/weird and respects pass budget', () => {
        const cues = [
            { text: '源1', startMs: 0, endMs: 1000 },
            { text: '源2', startMs: 1000, endMs: 2000 },
            { text: '源3', startMs: 2000, endMs: 3000 },
        ];
        const issues = [
            { index: 0, types: ['blank'], textPreview: '…' },
            { index: 1, types: ['weird'], textPreview: '怪句' },
            { index: 2, types: ['connected'], textPreview: '很长连续' },
        ];
        const plan = loop.planPostQcLoop(cues, issues, {
            postQcLoopMaxPasses: 1,
            pass: 0,
            bandByIndex: { 0: 'red', 1: 'yellow', 2: 'yellow' },
            holdIndexes: [0],
            maxRetranslateIndexes: 40,
            maxRetranscribeRanges: 8,
        });
        assert.strictEqual(plan.skip, false);
        assert.ok(plan.retranslateIndexes.includes(0));
        assert.ok(plan.retranslateIndexes.includes(1));
        assert.strictEqual((plan.retranscribeRanges || []).length, 0, 'red alone must not re-ASR');
        const done = loop.planPostQcLoop(cues, issues, {
            postQcLoopMaxPasses: 1,
            pass: 1,
        });
        assert.strictEqual(done.skip, true);
        assert.strictEqual(done.reason, 'pass_budget');
    });
});
