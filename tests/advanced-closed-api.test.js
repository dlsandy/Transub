const assert = require('assert');
const { loadClosedSmartTranslateCore } = require('../electron/advanced-closed-api');

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
});
