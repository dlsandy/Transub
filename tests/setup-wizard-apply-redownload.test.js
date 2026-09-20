const assert = require('assert');
const apply = require('../src/js/setup-wizard-apply-core.js');

describe('setup-wizard resolveRedownloadChoice', () => {
    it('primary skips installed models and keeps only missing ones', async () => {
        const api = apply.createSetupWizardApply({
            appConfirmChoice: async () => 'primary',
            modelLabel: (id) => id,
            getState: () => ({ installById: {} }),
        });
        const choice = await api.resolveRedownloadChoice(
            ['anime-whisper', 'sensevoice-small', 'silero-vad'],
            { 'anime-whisper': true, 'sensevoice-small': false },
        );
        assert.ok(choice);
        assert.strictEqual(choice.force, false);
        assert.deepStrictEqual(choice.modelIds, ['sensevoice-small']);
        assert.ok(choice.skippedIds.includes('anime-whisper'));
        assert.ok(choice.skippedIds.includes('silero-vad'));
    });

    it('tertiary force-redownloads all non-bundled selected models', async () => {
        const api = apply.createSetupWizardApply({
            appConfirmChoice: async () => 'tertiary',
            modelLabel: (id) => id,
            getState: () => ({ installById: {} }),
        });
        const choice = await api.resolveRedownloadChoice(
            ['anime-whisper', 'sensevoice-small'],
            { 'anime-whisper': true, 'sensevoice-small': false },
        );
        assert.ok(choice);
        assert.strictEqual(choice.force, true);
        assert.deepStrictEqual(choice.modelIds, ['anime-whisper', 'sensevoice-small']);
    });

    it('secondary / Escape cancels without downloading', async () => {
        const api = apply.createSetupWizardApply({
            appConfirmChoice: async () => 'secondary',
            modelLabel: (id) => id,
            getState: () => ({ installById: {} }),
        });
        const choice = await api.resolveRedownloadChoice(
            ['anime-whisper'],
            { 'anime-whisper': true },
        );
        assert.strictEqual(choice, null);
    });

    it('skips dialog when nothing is installed yet', async () => {
        let asked = false;
        const api = apply.createSetupWizardApply({
            appConfirmChoice: async () => {
                asked = true;
                return 'primary';
            },
            getState: () => ({ installById: {} }),
        });
        const choice = await api.resolveRedownloadChoice(
            ['sensevoice-small'],
            { 'sensevoice-small': false },
        );
        assert.strictEqual(asked, false);
        assert.deepStrictEqual(choice.modelIds, ['sensevoice-small']);
        assert.strictEqual(choice.force, false);
    });
});

describe('setup-wizard applyPlan feedback order', () => {
    it('enters downloads step before awaiting HF pick', async () => {
        const events = [];
        let releaseHf;
        const hfGate = new Promise((resolve) => { releaseHf = resolve; });
        const state = {
            applying: false,
            downloading: false,
            detect: { suggestedDevice: 'cpu', gpuVendor: '', recommend: null },
            modelPlan: {
                items: [{ id: 'sensevoice-small', required: true }],
                allDownloadIds: ['sensevoice-small'],
                asrModels: ['sensevoice-small'],
                mtModels: [],
                vadModels: [],
                engineProfile: 'balanced',
            },
            installById: {},
            catalogById: {},
            advancedEntitled: false,
            needs: { presetIds: [], targetLangs: ['zh-Hans'] },
            applied: {},
        };
        const prevDoc = global.document;
        const prevCore = global.TransubCore;
        global.document = {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({
                className: '',
                innerHTML: '',
            }),
        };
        global.TransubCore = {
            buildSavedOptionsFromForm: () => ({}),
            applyOptionsToForm: () => {},
            updateEnvBanner: () => {},
        };
        try {
            const api = apply.createSetupWizardApply({
                getState: () => state,
                readGoals: () => ({
                    task: 'transcribe',
                    language: 'auto',
                    variant: 'simplified',
                    profile: 'balanced',
                    asrModels: ['sensevoice-small'],
                    mtModels: [],
                }),
                resolveWizardPipeline: () => ({
                    asrModels: ['sensevoice-small'],
                    mtModels: [],
                    vadModels: ['fsmn-vad'],
                    subtitleTargetLang: 'zh-Hans',
                }),
                defaultVadFor: () => ['fsmn-vad'],
                showStep: (i) => { events.push(`show:${i}`); },
                getSteps: () => ['locale', 'needs', 'models', 'prepare', 'downloads', 'prefs'],
                stepIndexOf: (id) => ['locale', 'needs', 'models', 'prepare', 'downloads', 'prefs'].indexOf(id),
                ensureHfEndpointPicked: async () => {
                    events.push('hf-start');
                    await hfGate;
                    events.push('hf-done');
                    return { hfEndpoint: 'https://hf-mirror.com' };
                },
                currentHfEndpoint: () => 'https://hf-mirror.com',
                downloadUi: {
                    renderDownloadRows: () => { events.push('render-rows'); },
                    markSkipped: () => {},
                },
                $: (id) => {
                    if (id === 'wizardDeviceSelect' || id === 'wizardProfileSelect') return { value: '' };
                    if (id === 'setupWizardApplyList') {
                        return {
                            innerHTML: '',
                            appendChild: () => {},
                        };
                    }
                    if (id === 'setupWizardApplyStatus') {
                        return {
                            _t: '',
                            set textContent(v) { this._t = v; events.push(`status:${v}`); },
                            get textContent() { return this._t; },
                        };
                    }
                    if (id === 'engineInstallPathInput' || id === 'engineUrlInput') return { value: '' };
                    if (id === 'setupWizardNextBtn') return { textContent: '下一步', disabled: false };
                    if (id === 'setupWizardBackBtn') return { disabled: false };
                    if (id === 'setupWizardDoneSummary') return { textContent: '' };
                    return null;
                },
                electron: {
                    transWithAiSaveOptions: async () => ({ ok: true }),
                    transubEngineDownloadInfo: async () => ({
                        ok: true,
                        catalog: [{ id: 'sensevoice-small', installed: false }],
                    }),
                },
                uiTx: (t) => t,
                readAdvancedEntitled: async () => false,
                getNeeds: () => state.needs,
            });

            const done = api.applyPlan();
            await new Promise((r) => setImmediate(r));
            await new Promise((r) => setImmediate(r));

            assert.ok(events.includes('show:4'), `expected show downloads before HF done, got ${events.join(',')}`);
            assert.ok(events.includes('hf-start'));
            assert.ok(!events.includes('hf-done'));
            assert.strictEqual(state.applying, true);

            releaseHf();
            await done;
            assert.ok(events.includes('hf-done'));
            const showAt = events.indexOf('show:4');
            const hfAt = events.indexOf('hf-start');
            assert.ok(showAt >= 0 && hfAt > showAt, `show must precede hf-start: ${events.join(',')}`);
        } finally {
            global.document = prevDoc;
            global.TransubCore = prevCore;
        }
    });
});
