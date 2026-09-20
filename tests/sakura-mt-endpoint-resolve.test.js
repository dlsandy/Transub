const assert = require('assert');
const Module = require('module');

describe('sakura-mt-endpoint-resolve', () => {
    const originalLoad = Module._load;
    let mockDoc = {};
    let mockLlmResult = null;
    let localCalls = 0;
    let lastResolveOverrides = null;

    beforeEach(() => {
        mockDoc = {
            llmSource: 'managed',
            byok: {
                provider: 'custom',
                baseUrl: 'http://192.168.31.107:8080/v1',
                model: 'Sakura-Galtransl-14B-v3.8',
            },
        };
        mockLlmResult = {
            ok: true,
            source: 'byok',
            apiKey: 'test-key',
            baseUrl: 'http://192.168.31.107:8080/v1',
            model: 'Sakura-Galtransl-14B-v3.8',
        };
        localCalls = 0;
        lastResolveOverrides = null;

        Module._load = function patched(request, parent, isMain) {
            if (request === './advanced-license-data'
                || request.endsWith('/advanced-license-data')) {
                return {
                    readAdvancedDoc: () => ({ ok: true, doc: mockDoc }),
                };
            }
            if (request === './advanced-llm-resolve'
                || request.endsWith('/advanced-llm-resolve')) {
                return {
                    resolveAdvancedLlmConfig: async (_doc, overrides) => {
                        lastResolveOverrides = overrides || {};
                        return mockLlmResult;
                    },
                };
            }
            if (request === './sakura-mt' || request.endsWith('/sakura-mt')) {
                return {
                    resolveSakuraEndpoint: async () => {
                        localCalls += 1;
                        return {
                            ok: true,
                            source: 'sakura',
                            apiKey: 'local',
                            baseUrl: 'http://127.0.0.1:39282/v1',
                            model: 'sakura-1.5b',
                            modelId: 'sakura-1.5b',
                        };
                    },
                };
            }
            // Isolate from live settings / Station so BYOK path is deterministic.
            if (request === './settings-data' || request.endsWith('/settings-data')) {
                return {
                    loadSettings: () => ({ options: { transubStationEnabled: false } }),
                };
            }
            if (request === './transub-station-client' || request.endsWith('/transub-station-client')) {
                return {
                    normalizeStationOptions: () => ({ transubStationEnabled: false }),
                    resolveStationSentenceMtEndpoint: async () => ({ ok: false }),
                };
            }
            return originalLoad(request, parent, isMain);
        };

        delete require.cache[require.resolve('../electron/sakura-mt-endpoint-resolve')];
        delete require.cache[require.resolve('../src/js/translate-mode-byok-policy-core')];
    });

    afterEach(() => {
        Module._load = originalLoad;
        delete require.cache[require.resolve('../electron/sakura-mt-endpoint-resolve')];
    });

    function load() {
        return require('../electron/sakura-mt-endpoint-resolve');
    }

    it('isByokSentenceMtPreferred only for external mode + configured byok', () => {
        const api = load();
        assert.strictEqual(api.isByokSentenceMtPreferred(mockDoc), false);
        assert.strictEqual(api.isByokSentenceMtPreferred(mockDoc, 'llm'), false);
        assert.strictEqual(api.isByokSentenceMtPreferred(mockDoc, 'external'), true);
        assert.strictEqual(api.isByokSentenceMtPreferred({
            byok: { baseUrl: '', model: 'x' },
        }, 'external'), false);
    });

    it('resolveSentenceMtEndpoint uses BYOK only when translateMode=external', async () => {
        const api = load();
        const ep = await api.resolveSentenceMtEndpoint({
            modelId: 'sakura-1.5b',
            translateMode: 'external',
        });
        assert.strictEqual(ep.ok, true);
        assert.strictEqual(ep.source, 'byok');
        assert.strictEqual(ep.model, 'Sakura-Galtransl-14B-v3.8');
        assert.strictEqual(ep.skipLocalEnsure, true);
        assert.strictEqual(ep.hostHint, '192.168.31.107:8080');
        assert.strictEqual(localCalls, 0);
        assert.strictEqual(lastResolveOverrides?.allowByok, true);
    });

    it('resolveSentenceMtEndpoint ignores legacy llmSource=byok for llm mode', async () => {
        mockDoc.llmSource = 'byok';
        const api = load();
        const ep = await api.resolveSentenceMtEndpoint({
            modelId: 'sakura-1.5b',
            translateMode: 'llm',
        });
        assert.strictEqual(ep.ok, true);
        assert.strictEqual(ep.source, 'sakura');
        assert.strictEqual(localCalls, 1);
    });

    it('resolveSentenceMtEndpoint fails hard for external when BYOK missing', async () => {
        mockLlmResult = { ok: false, code: 'byok_missing', error: 'missing' };
        const api = load();
        const ep = await api.resolveSentenceMtEndpoint({
            modelId: 'sakura-1.5b',
            translateMode: 'external',
        });
        assert.strictEqual(ep.ok, false);
        assert.strictEqual(ep.source, 'byok');
        assert.strictEqual(localCalls, 0);
    });

    it('resolveSentenceMtPromptFamily prefers specialized BYOK family', () => {
        const api = load();
        const fam = api.resolveSentenceMtPromptFamily('sakura-1.5b', {
            source: 'byok',
            model: 'Sakura-Galtransl-14B-v3.8',
        });
        assert.ok(fam);
    });
});
