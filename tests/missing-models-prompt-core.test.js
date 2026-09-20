'use strict';

const assert = require('assert');
const { createMissingModelsPrompt } = require('../src/js/missing-models-prompt-core.js');

describe('TransubMissingModelsPrompt', () => {
    it('exports createMissingModelsPrompt', () => {
        assert.strictEqual(typeof createMissingModelsPrompt, 'function');
    });

    it('ensureRequiredModelsReadyOrPrompt returns true when modelIds empty', async () => {
        const api = createMissingModelsPrompt({});
        assert.strictEqual(await api.ensureRequiredModelsReadyOrPrompt({}), true);
        assert.strictEqual(await api.ensureRequiredModelsReadyOrPrompt({ modelIds: [] }), true);
    });

    it('ensureRequiredModelsReadyOrPrompt returns true when catalog empty', async () => {
        let confirmCalled = 0;
        const api = createMissingModelsPrompt({
            getCachedEngineModels: () => [],
            refreshEngineModels: async () => {},
            appConfirm: async () => {
                confirmCalled += 1;
                return true;
            },
        });
        const ok = await api.ensureRequiredModelsReadyOrPrompt({
            modelIds: ['opus-mt-ja-zh'],
            catalog: [],
        });
        assert.strictEqual(ok, true);
        assert.strictEqual(confirmCalled, 0);
    });

    it('ensureRequiredModelsReadyOrPrompt prompts and returns false when missing', async () => {
        const opens = [];
        let confirmArg = null;
        const api = createMissingModelsPrompt({
            missingModelsApi: {
                findMissingCatalogModels: (ids) => ids.map((id) => ({ id, name: id, reason: 'missing' })),
                buildMissingModelsConfirmCopy: ({ contextLabel, missing, settingsHint }) => ({
                    title: '需要先下载模型',
                    message: `${contextLabel}|${missing.map((m) => m.id).join(',')}|${settingsHint}`,
                    primaryLabel: '去下载',
                    secondaryLabel: '取消',
                }),
            },
            appConfirm: async (copy) => {
                confirmArg = copy;
                return true;
            },
            resolveParamsTab: (tab) => tab,
            openAppSettings: (tab, opts) => { opens.push({ tab, opts }); },
        });
        const ok = await api.ensureRequiredModelsReadyOrPrompt({
            modelIds: ['opus-mt-ja-zh'],
            contextLabel: '测试',
            catalog: [{ id: 'other', installed: true }],
            settingsTab: 'models',
        });
        assert.strictEqual(ok, false);
        assert.ok(confirmArg?.message?.includes('opus-mt-ja-zh'));
        assert.strictEqual(opens.length, 1);
        assert.strictEqual(opens[0].tab, 'models');
        assert.strictEqual(opens[0].opts.openLibrary, true);
    });

    it('collectAdoptedSenseSupportGaps returns [] without adopted items', async () => {
        const api = createMissingModelsPrompt({
            getContentProfileApi: () => ({
                collectSenseSupportGaps: () => ({ missing: [{ id: 'x' }] }),
            }),
        });
        assert.deepStrictEqual(await api.collectAdoptedSenseSupportGaps([]), []);
        assert.deepStrictEqual(await api.collectAdoptedSenseSupportGaps([
            { sense: { adopted: false, classification: { profile: 'film' } } },
        ]), []);
    });

    it('promptInstallSenseSupportGaps returns continue for empty list', async () => {
        const api = createMissingModelsPrompt({});
        assert.strictEqual(await api.promptInstallSenseSupportGaps([]), 'continue');
    });

    it('promptInstallSenseSupportGaps install path calls installSenseSupportGaps', async () => {
        const downloads = [];
        const api = createMissingModelsPrompt({
            appConfirmChoice: async () => 'primary',
            openAppSettings: () => {},
            appendLog: () => {},
            showToast: () => {},
            uiTf: (s, vars) => s.replace('{count}', String(vars?.count ?? '')),
            downloadEngineModels: async (opts) => { downloads.push(opts); },
        });
        const result = await api.promptInstallSenseSupportGaps([
            { kind: 'model', id: 'opus-mt-ja-zh', label: 'JA→ZH' },
        ]);
        assert.strictEqual(result, 'install');
        assert.strictEqual(downloads.length, 1);
        assert.deepStrictEqual(downloads[0].modelIds, ['opus-mt-ja-zh']);
    });

    it('installSenseSupportGaps opens demucs path when needed', async () => {
        const calls = [];
        const api = createMissingModelsPrompt({
            openAppSettings: (tab) => { calls.push(['open', tab]); },
            setEngineModelsFilter: (f) => { calls.push(['filter', f]); },
            renderEngineModelsCards: () => { calls.push(['render']); },
            appendLog: () => {},
            showToast: () => {},
            ensureEngineDemucs: async () => { calls.push(['demucs']); },
        });
        await api.installSenseSupportGaps([{ kind: 'demucs', id: 'demucs' }]);
        assert.ok(calls.some((c) => c[0] === 'filter' && c[1] === 'separate'));
        assert.ok(calls.some((c) => c[0] === 'demucs'));
    });
});
