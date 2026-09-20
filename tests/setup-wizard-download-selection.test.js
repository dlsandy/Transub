const assert = require('assert');
const goals = require('../src/js/setup-wizard-goals-core.js');

describe('setup-wizard download respects model checkboxes', () => {
    it('collectDownloadModelIds keeps empty mtModels empty', () => {
        const api = goals.createSetupWizardGoals({
            getState: () => ({ detect: {}, advancedEntitled: false }),
        });
        const ids = api.collectDownloadModelIds({
            task: 'translate',
            profile: 'balanced',
            language: 'ja',
            asrModels: ['sensevoice-small'],
            mtModels: [],
            asrModel: 'sensevoice-small',
            mtModel: '',
        });
        assert.ok(ids.includes('sensevoice-small'));
        assert.ok(!ids.some((id) => /^sakura-/i.test(id)), `unexpected sakura in ${ids}`);
        assert.ok(!ids.some((id) => goals.isManagedLlmModelId(id)), `unexpected llm in ${ids}`);
    });

    it('collectDownloadModelIds still adds default MT when mtModels omitted', () => {
        const api = goals.createSetupWizardGoals({
            getState: () => ({ detect: {}, advancedEntitled: false }),
        });
        const ids = api.collectDownloadModelIds({
            task: 'translate',
            profile: 'balanced',
            language: 'ja',
            asrModels: ['sensevoice-small'],
            asrModel: 'sensevoice-small',
        });
        assert.ok(ids.includes('sensevoice-small'));
        assert.ok(ids.some((id) => /^sakura-/i.test(id) || goals.isManagedLlmModelId(id) || /^opus-mt-/i.test(id)));
    });
});
