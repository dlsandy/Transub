const assert = require('assert');
const persistKeys = require('../src/js/settings-persist-keys-core');
const {
    getNormalizedPersistKeys,
    assertPartialSaveKeysSubsetOfNormalize,
    PARTIAL_SAVE_OPTION_KEYS,
} = require('../electron/settings-persist-keys');

describe('settings-persist-keys', () => {
    it('lists normalized persist keys', () => {
        const keys = getNormalizedPersistKeys();
        assert.ok(keys.includes('engineBackend'));
        assert.ok(keys.includes('translateMode'));
        assert.ok(keys.length > 50);
    });

    it('partial-save keys are a subset of normalize keys', () => {
        const res = assertPartialSaveKeysSubsetOfNormalize();
        assert.ok(res.ok, `missing: ${res.missing.join(', ')}`);
        assert.ok(PARTIAL_SAVE_OPTION_KEYS.length > 40);
    });

    it('diffAssembleVsNormalize reports missing keys', () => {
        const diff = persistKeys.diffAssembleVsNormalize(
            { engineBackend: 'transub', notARealKey: 1 },
            { engineBackend: 'transub' },
        );
        assert.equal(diff.ok, false);
        assert.deepStrictEqual(diff.missing, ['notARealKey']);
    });
});
