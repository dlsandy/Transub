const assert = require('assert');
const { createAdvancedSmartTranslateFile } = require('../electron/advanced-smart-translate-file');

function mockHost(overrides = {}) {
    return {
        runSmartTranslate: async () => ({ ok: true, cues: [] }),
        asPlainObject: (v) => (v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : {}),
        asString: (v) => String(v ?? ''),
        ...overrides,
    };
}

describe('createAdvancedSmartTranslateFile', () => {
    it('rejects incomplete host', () => {
        assert.throws(
            () => createAdvancedSmartTranslateFile({}),
            /createAdvancedSmartTranslateFile: host\.\w+ required/,
        );
        assert.throws(
            () => createAdvancedSmartTranslateFile({
                runSmartTranslate: async () => ({}),
                asPlainObject: (v) => v || {},
            }),
            /host\.asString required/,
        );
    });

    it('exports smartTranslateSubtitleFile', () => {
        const api = createAdvancedSmartTranslateFile(mockHost());
        assert.strictEqual(typeof api.smartTranslateSubtitleFile, 'function');
    });

    it('missing sourcePath returns { ok: false }', async () => {
        const { smartTranslateSubtitleFile } = createAdvancedSmartTranslateFile(mockHost());
        const res = await smartTranslateSubtitleFile({});
        assert.strictEqual(res.ok, false);
        assert.ok(res.error);
    });
});
