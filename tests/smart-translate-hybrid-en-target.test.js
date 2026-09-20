'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

describe('smart-translate-hybrid EN target wiring', () => {
    it('forwards subtitleTargetLang into runSakuraTranslate', async () => {
        const hybridPath = path.resolve(__dirname, '../electron/smart-translate-hybrid.js');
        const sakuraPath = path.resolve(__dirname, '../electron/sakura-translate.js');
        delete require.cache[hybridPath];
        delete require.cache[sakuraPath];

        const seen = [];
        const originalLoad = Module._load;
        Module._load = function patched(request, parent, isMain) {
            const resolved = (() => {
                try {
                    return Module._resolveFilename(request, parent);
                } catch {
                    return request;
                }
            })();
            if (resolved === sakuraPath || request === './sakura-translate') {
                return {
                    runSakuraTranslate: async (payload) => {
                        seen.push(payload);
                        return {
                            ok: true,
                            cues: (payload.cues || []).map((c) => ({
                                index: c.index,
                                text: 'Sensei, please let me.',
                            })),
                            summary: 'mock',
                        };
                    },
                };
            }
            return originalLoad(request, parent, isMain);
        };

        try {
            const hybrid = require(hybridPath);
            const res = await hybrid.runHybridChunkTranslate({
                cues: [{ index: 1, text: '先生、お願いします' }],
                modelId: 'translategemma-4-sub-e4b',
                language: 'ja',
                subtitleTargetLang: 'en',
                targetLang: 'en',
                targetLanguage: 'English',
                contentProfile: 'av_soft',
                _engineExternalMt: true,
            });
            assert.strictEqual(res.ok, true);
            assert.ok(seen.length >= 1, 'expected sakura call');
            const last = seen[seen.length - 1];
            assert.strictEqual(last.subtitleTargetLang, 'en');
            assert.strictEqual(last.targetLang, 'en');
            assert.strictEqual(last.targetLanguage, 'English');
            assert.strictEqual(last.language, 'ja');
        } finally {
            Module._load = originalLoad;
            delete require.cache[hybridPath];
        }
    });
});
