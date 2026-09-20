const assert = require('assert');
const steps = require('../src/js/setup-wizard-steps-core.js');

describe('setup-wizard-steps-core', () => {
    it('STEPS order is locale → needs → models → prepare → downloads → prefs', () => {
        assert.deepStrictEqual([...steps.STEPS], [
            'locale',
            'needs',
            'models',
            'prepare',
            'downloads',
            'prefs',
        ]);
        assert.ok(!steps.STEPS.includes('appearance'));
        assert.ok(!steps.STEPS.includes('samples'));
        assert.ok(!steps.STEPS.includes('confirm'));
        assert.ok(!steps.STEPS.includes('done'));
        assert.ok(steps.STEP_TITLES.locale);
        assert.ok(steps.STEP_TITLES.needs);
        assert.ok(steps.STEP_TITLES.models);
        assert.ok(steps.STEP_TITLES.prepare);
        assert.ok(steps.STEP_TITLES.downloads);
        assert.ok(steps.STEP_TITLES.prefs);
    });

    it('createSetupWizardSteps showStep clamps index via state', () => {
        const state = {
            stepIndex: 0,
            applying: false,
            detecting: false,
            fixing: false,
            sensing: false,
            downloading: false,
            hadSettings: false,
            samples: [],
        };
        const api = steps.createSetupWizardSteps({
            getState: () => state,
            $: () => null,
            uiTf: (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k]),
            uiTx: (t) => t,
            closeAllModelDropdowns: () => {},
            onEnterStep: () => {},
            refineNextButton: () => {},
        });
        api.showStep(99);
        assert.strictEqual(state.stepIndex, steps.STEPS.length - 1);
        assert.strictEqual(api.currentStepId(), 'prefs');
        api.showStep(-3);
        assert.strictEqual(state.stepIndex, 0);
        assert.strictEqual(api.currentStepId(), 'locale');
    });
});
