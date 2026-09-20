/**
 * Scene presets workspace helpers — unit tests.
 */
const assert = require('assert');
const core = require('../src/js/scene-presets-core');

describe('scene-presets-core', () => {
    const sample = [
        { id: 'a', group: 'ja', name: 'Anime Whisper', description: 'soft', builtin: true },
        { id: 'b', group: 'ja', name: 'Variant', description: 'other soft', builtin: true },
        { id: 'c', group: 'western', name: 'Film', description: 'film', builtin: true },
        { id: 'd', name: 'My preset', description: 'custom one', builtin: false, group: 'talk' },
        { id: 'e', group: '软声', name: 'legacy soft', builtin: true },
    ];

    it('normalizes legacy Chinese groups and defaults', () => {
        assert.strictEqual(core.groupOf(sample[3]), 'talk');
        assert.strictEqual(core.groupOf({ builtin: true }), 'other');
        assert.strictEqual(core.groupOf(sample[4]), 'ja');
        assert.strictEqual(core.normalizeGroupKey('动漫'), 'ja');
        assert.strictEqual(core.normalizeGroupKey('影视'), 'western');
        assert.strictEqual(core.normalizeGroupKey('对话'), 'talk');
        assert.strictEqual(core.groupLabel('ja'), '日剧/动漫');
    });

    it('filters builtin by default secondary', () => {
        const rows = core.filterPresets(sample, 'all', 'builtin', '');
        assert.deepStrictEqual(rows.map((p) => p.id), ['a', 'b', 'c', 'e']);
    });

    it('filters custom secondary and by group/query', () => {
        const custom = core.filterPresets(sample, 'all', 'custom', '');
        assert.deepStrictEqual(custom.map((p) => p.id), ['d']);
        const soft = core.filterPresets(sample, 'ja', 'builtin', '');
        assert.deepStrictEqual(soft.map((p) => p.id), ['a', 'b', 'e']);
        const q = core.filterPresets(sample, 'all', 'custom', 'custom');
        assert.deepStrictEqual(q.map((p) => p.id), ['d']);
    });

    it('counts groups and secondary', () => {
        const counts = core.countByGroup(sample);
        assert.strictEqual(counts.all, 5);
        assert.strictEqual(counts.ja, 3);
        assert.strictEqual(counts.talk, 1);
        const sec = core.countSecondary(sample, 'ja');
        assert.strictEqual(sec.builtin, 3);
        assert.strictEqual(sec.custom, 0);
    });

    it('orders known groups first', () => {
        assert.deepStrictEqual(core.orderedGroupKeys(sample), ['ja', 'western', 'talk']);
    });

    it('clamps detail width', () => {
        assert.ok(core.clampDetailWidth(100, 800) >= core.MIN_DETAIL_WIDTH);
        assert.ok(core.clampDetailWidth(900, 600) < 900);
    });

    it('detects builtin vs editable', () => {
        assert.strictEqual(core.isBuiltinPreset(sample[0]), true);
        assert.strictEqual(core.canEditPreset(sample[3]), true);
        assert.strictEqual(core.canEditPreset(sample[0]), false);
    });

    it('builds custom clone from existing preset', () => {
        const clone = core.buildCustomClone(sample[0], {
            options: { language: 'ja', engineAsrModel: 'anime-whisper', task: 'translate' },
        });
        assert.strictEqual(clone.builtin, false);
        assert.ok(String(clone.name).includes('副本'));
        assert.strictEqual(clone.options.language, 'ja');
        assert.strictEqual(clone.options.task, undefined);
        assert.strictEqual(clone.group, 'ja');
    });

    it('merges editable option fields', () => {
        const next = core.mergeEditableOptions(
            { language: 'ja', vadEnabled: true, engineAsrModel: 'x' },
            { language: 'zh', vadEnabled: false, beamSize: '5', hallucinationSilenceThreshold: '' },
        );
        assert.strictEqual(next.language, 'zh');
        assert.strictEqual(next.vadEnabled, false);
        assert.strictEqual(next.beamSize, 5);
        assert.strictEqual(next.hallucinationSilenceThreshold, undefined);
        assert.strictEqual(next.engineAsrModel, 'x');
    });

    it('maps legacy secondary filters to builtin', () => {
        assert.strictEqual(core.normalizeSecondary('primary'), 'builtin');
        assert.strictEqual(core.normalizeSecondary('all'), 'builtin');
        assert.strictEqual(core.normalizeSecondary('custom'), 'custom');
    });
});
