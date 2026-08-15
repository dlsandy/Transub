const assert = require('assert');
const {
    buildSenseFailureGuidance,
    enrichAutoSenseUiForErrors,
} = require('../src/js/sense-recovery-core');

describe('sense-recovery-core', () => {
    it('buildSenseFailureGuidance returns actionable shortTip', () => {
        const g = buildSenseFailureGuidance({
            message: '模型未就绪',
            autoEnabled: true,
        });
        assert.ok(g.tip.includes('模型未就绪'));
        assert.ok(g.shortTip.includes('指定 ASR'));
        assert.strictEqual(g.primaryAction.id, 'open-models');
        assert.ok(Array.isArray(g.actions) && g.actions.length >= 3);
        assert.strictEqual(g.actions[0].id, 'open-models');
    });

    it('infers deep-resense for timeout errors', () => {
        const g = buildSenseFailureGuidance({ message: '感知超时', autoEnabled: true });
        assert.strictEqual(g.primaryAction.id, 'deep-resense');
        assert.ok(g.logLine.includes('深度感知'));
    });

    it('enrichAutoSenseUiForErrors warns when errorCount > 0', () => {
        const ui = enrichAutoSenseUiForErrors(
            { chipLabel: '感知开', tone: 'ok' },
            { errorCount: 2, autoEnabled: true },
        );
        assert.strictEqual(ui.tone, 'warn');
        assert.ok(ui.chipLabel.includes('2'));
        assert.ok(ui.detail.includes('深度感知') || ui.detail.includes('关感知'));
        assert.strictEqual(ui.senseErrorCount, 2);
    });

    it('enrichAutoSenseUiForErrors is no-op when no errors', () => {
        const base = { chipLabel: '感知开', tone: 'ok' };
        assert.strictEqual(enrichAutoSenseUiForErrors(base, { errorCount: 0 }), base);
    });
});
