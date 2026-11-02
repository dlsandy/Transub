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

    it('replaceTimeline writes expanded ZH and companion JA', async () => {
        const writes = [];
        const Module = require('module');
        const pathKey = require.resolve('../electron/extensions-subtitle-document');
        const original = Module._cache[pathKey];
        Module._cache[pathKey] = {
            id: pathKey,
            filename: pathKey,
            loaded: true,
            exports: {
                readSubtitleDocument: () => ({
                    ok: true,
                    format: 'srt',
                    cues: [
                        { index: 0, startMs: 0, endMs: 4000, text: '先輩待ってもういいよ行こう' },
                    ],
                }),
                writeSubtitleDocument: (filePath, doc) => {
                    writes.push({ filePath, cues: doc.cues });
                    return { ok: true, path: filePath };
                },
            },
        };
        try {
            // Reload factory against stubbed document module.
            delete require.cache[require.resolve('../electron/advanced-smart-translate-file')];
            const { createAdvancedSmartTranslateFile: create } = require('../electron/advanced-smart-translate-file');
            const { smartTranslateSubtitleFile } = create(mockHost({
                runSmartTranslate: async () => ({
                    ok: true,
                    replaceTimeline: true,
                    splitCount: 1,
                    cues: [
                        { index: 0, startMs: 0, endMs: 2000, text: '学长等等' },
                        { index: 1, startMs: 2000, endMs: 4000, text: '已经可以了走吧' },
                    ],
                    sourceCues: [
                        { index: 0, startMs: 0, endMs: 2000, text: '先輩待って' },
                        { index: 1, startMs: 2000, endMs: 4000, text: 'もういいよ行こう' },
                    ],
                    message: 'ok',
                }),
            }));
            const res = await smartTranslateSubtitleFile({
                sourcePath: 'F:/tmp/in.src.srt',
                destPath: 'F:/tmp/out.zh.srt',
            });
            assert.strictEqual(res.ok, true);
            assert.strictEqual(res.replaceTimeline, true);
            assert.strictEqual(writes.length, 2);
            assert.strictEqual(writes[0].cues.length, 2);
            assert.strictEqual(writes[1].cues.length, 2);
            assert.ok(writes.some((w) => /in\.src\.srt$/.test(String(w.filePath).replace(/\\/g, '/'))));
            assert.ok(writes.some((w) => /out\.zh\.srt$/.test(String(w.filePath).replace(/\\/g, '/'))));
        } finally {
            if (original) Module._cache[pathKey] = original;
            else delete Module._cache[pathKey];
            delete require.cache[require.resolve('../electron/advanced-smart-translate-file')];
        }
    });
});
