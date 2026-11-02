const assert = require('assert');
const {
    loadClosedSmartTranslateCore,
    loadClosedContextReconstructCore,
    loadClosedHyMt230bHereticCatalog,
} = require('../electron/advanced-closed-api');

describe('advanced-closed-api', () => {
    it('loads unpackaged smart-translate helpers when closed core is present', () => {
        const core = loadClosedSmartTranslateCore();
        if (!core || typeof core.partitionDeterministicCues !== 'function') {
            // Public checkout without proprietary sources / `_advanced`
            return;
        }
        assert.strictEqual(typeof core.fallbackShortJaCue, 'function');
        const part = core.partitionDeterministicCues([
            { index: 0, text: 'あああ' },
            { index: 1, text: '待ってください' },
        ]);
        assert.ok(Array.isArray(part.llmCues));
        assert.ok(Array.isArray(part.prefilled));
    });

    it('loads unpackaged context-reconstruct helpers when closed core is present', () => {
        const core = loadClosedContextReconstructCore();
        if (!core || typeof core.chunkCues !== 'function') {
            return;
        }
        assert.strictEqual(typeof core.parseModelResponse, 'function');
        const chunks = core.chunkCues([
            { index: 0, text: 'a' },
            { index: 1, text: 'b' },
            { index: 2, text: 'c' },
        ], { windowCues: 5, overlapCues: 0 });
        assert.ok(Array.isArray(chunks));
        assert.ok(chunks.length >= 1);
        assert.ok(chunks[0].cues.length >= 1);
    });

    it('loads unpackaged Hy-MT2 30B Heretic catalog when closed core is present', () => {
        const api = loadClosedHyMt230bHereticCatalog();
        if (!api || typeof api.listCatalogEntries !== 'function') {
            // Public checkout without proprietary sources / `_advanced`
            return;
        }
        const rows = api.listCatalogEntries();
        assert.ok(Array.isArray(rows));
        assert.ok(rows.length >= 3);
        assert.ok(rows.some((r) => r.id === 'hy-mt2-30b-a3b-heretic'));
    });
});
