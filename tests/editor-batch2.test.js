const assert = require('assert');
const undoPatch = require('../src/js/undo-patch-core');
const magnet = require('../src/js/timeline-magnet-core');
const workspace = require('../src/js/editor-workspace-core');
const review = require('../src/js/bilingual-review-core');

describe('undo-patch-core', () => {
    it('encodes overlay for few changes', () => {
        const base = [
            { startMs: 0, endMs: 1000, text: 'a' },
            { startMs: 1000, endMs: 2000, text: 'b' },
            { startMs: 2000, endMs: 3000, text: 'c' },
        ];
        const next = base.map((c, i) => (i === 1 ? { ...c, text: 'B' } : { ...c }));
        const patch = undoPatch.encodeCuePatch(base, next);
        assert.strictEqual(patch.type, 'overlay');
        assert.strictEqual(patch.changes.length, 1);
        const decoded = undoPatch.decodeCuePatch(base, patch);
        assert.strictEqual(decoded[1].text, 'B');
        assert.strictEqual(decoded[0].text, 'a');
    });

    it('falls back to full when length changes', () => {
        const base = [{ startMs: 0, endMs: 1000, text: 'a' }];
        const next = [
            { startMs: 0, endMs: 1000, text: 'a' },
            { startMs: 1000, endMs: 2000, text: 'b' },
        ];
        const patch = undoPatch.encodeCuePatch(base, next);
        assert.strictEqual(patch.type, 'full');
        assert.strictEqual(undoPatch.decodeCuePatch(base, patch).length, 2);
    });
});

describe('timeline-magnet-core', () => {
    it('snaps start to neighbor end', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: 'a' },
            { startMs: 1100, endMs: 2000, text: 'b' },
        ];
        const targets = magnet.collectSnapTargets(cues, 1, { playheadMs: 500 });
        const res = magnet.snapDragTiming({
            mode: 'start',
            startMs: 1040,
            endMs: 2000,
            targets,
            thresholdMs: 80,
        });
        assert.strictEqual(res.startMs, 1000);
        assert.ok(res.snapped);
    });
});

describe('editor-workspace-core', () => {
    it('filters tool groups by mode', () => {
        assert.ok(workspace.isGroupVisible('polish', 'text'));
        assert.ok(workspace.isGroupVisible('polish', 'batch')); // via qc alias
        assert.ok(!workspace.isGroupVisible('polish', 'ai'));
        assert.ok(workspace.isGroupVisible('ai', 'ai'));
        assert.ok(workspace.isGroupVisible('pro', 'pro'));
        assert.ok(workspace.isGroupVisible('pro', 'ai pro'));
        assert.ok(workspace.isGroupVisible('ai', 'ai pro'));
        assert.ok(!workspace.isGroupVisible('polish', 'ai pro'));
        assert.strictEqual(workspace.normalizeMode('nope'), 'polish');
        assert.strictEqual(workspace.normalizeMode('pro'), 'pro');
    });

    it('exposes mode tool groups for compact toolbar', () => {
        assert.deepStrictEqual(workspace.groupsForMode('polish'), ['entry', 'text', 'qc', 'kept', 'history']);
        assert.deepStrictEqual(workspace.groupsForMode('timeline'), ['entry', 'timing', 'batch-timing', 'history']);
        assert.deepStrictEqual(workspace.groupsForMode('dual'), ['entry', 'text', 'dual', 'kept', 'history']);
        assert.deepStrictEqual(workspace.groupsForMode('ai'), ['entry', 'ai', 'text', 'history']);
        assert.deepStrictEqual(workspace.groupsForMode('pro'), ['entry', 'pro', 'history']);
        assert.ok(workspace.isGroupVisible('polish', 'kept'));
        assert.ok(workspace.isGroupVisible('dual', 'kept'));
        assert.ok(!workspace.isGroupVisible('timeline', 'kept'));
        assert.ok(!workspace.isGroupVisible('ai', 'kept'));
        assert.ok(!workspace.isGroupVisible('pro', 'kept'));
    });

    it('tour steps cover workspace modes and finish tools', () => {
        const steps = workspace.getTourSteps();
        assert.ok(steps.length >= 5);
        assert.ok(steps.some((s) => s.target === 'workspace' && /精修|时间轴|双语|AI|Pro/.test(s.body)));
        assert.ok(steps.some((s) => /审校/.test(s.body)));
        assert.ok(steps.some((s) => s.target === 'timeline' && /书签|A-B|波形/.test(s.body)));
        assert.ok(steps.some((s) => /F11|F12/.test(s.body)));
        assert.ok(steps.some((s) => s.target === 'finish' && /工作流|导出前检查/.test(s.body)));
        assert.ok(steps.some((s) => /▾/.test(s.body)));
    });
});

describe('bilingual-review-core', () => {
    it('flags empty translation and glossary miss', () => {
        const primary = [
            { startMs: 0, endMs: 1000, text: '' },
            { startMs: 1000, endMs: 2000, text: '你好世界' },
        ];
        const source = [
            { startMs: 0, endMs: 1000, text: 'こんにちは' },
            { startMs: 1000, endMs: 2000, text: 'タカシが来た' },
        ];
        const report = review.reviewBilingualPair(primary, source, {
            glossary: { entries: [{ canonical: '高志', aliases: ['タカシ'], enabled: true }] },
            dualApi: {
                findBestOverlapCue(cues, start, end) {
                    const list = cues || [];
                    for (let i = 0; i < list.length; i += 1) {
                        const c = list[i];
                        const a = c.startMs;
                        const b = c.endMs;
                        if (Math.min(end, b) - Math.max(start, a) > 0) {
                            return { cue: c, index: i, overlapMs: 500, match: 'overlap' };
                        }
                    }
                    return { cue: null, index: -1, overlapMs: 0, match: 'none' };
                },
            },
        });
        assert.ok(report.issues.some((i) => i.type === 'empty_translation'));
        assert.ok(report.issues.some((i) => i.type === 'glossary_miss'));
    });
});
