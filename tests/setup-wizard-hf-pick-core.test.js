const assert = require('assert');
const hf = require('../src/js/setup-wizard-hf-pick-core.js');
const plan = require('../src/js/setup-wizard-plan-core.js');

describe('setup-wizard-hf-pick-core', () => {
    it('formatHfPickStatus formats mirror win and fallback', () => {
        assert.match(
            hf.formatHfPickStatus({
                ok: true,
                label: '国内镜像',
                latencyMs: 120,
            }),
            /国内镜像/,
        );
        assert.match(
            hf.formatHfPickStatus({
                ok: false,
                fallback: true,
                label: '国内镜像',
            }),
            /回退/,
        );
        assert.ok(hf.formatHfPickStatus(null).includes('自动测速'));
    });

    it('createSetupWizardHfPick caches ensurePicked result', async () => {
        let calls = 0;
        const api = hf.createSetupWizardHfPick({
            electron: {
                async transubPickHfEndpoint() {
                    calls += 1;
                    return {
                        ok: true,
                        hfEndpoint: 'https://hf-mirror.com',
                        label: '国内镜像',
                        latencyMs: 50,
                        message: '下载源：国内镜像（约 50 ms）',
                    };
                },
            },
            getProxyPayload: () => ({}),
            getStatusEl: () => ({ textContent: '' }),
            uiTx: (t) => t,
        });
        const a = await api.ensurePicked();
        const b = await api.ensurePicked();
        assert.strictEqual(calls, 1);
        assert.strictEqual(a.hfEndpoint, 'https://hf-mirror.com');
        assert.strictEqual(b.hfEndpoint, a.hfEndpoint);
        api.clearCache();
        await api.ensurePicked({ force: true });
        assert.strictEqual(calls, 2);
    });
});

describe('setup-wizard-plan-core', () => {
    it('planNextEnabled gates Sakura without Whisper-JA', () => {
        const isSakura = (id) => /^sakura-/i.test(id);
        const hasJa = (ids) => (ids || []).some((id) => /whisper-ja/i.test(id));
        const bad = plan.planNextEnabled({
            asrIds: ['sensevoice-small'],
            mtIds: ['sakura-1.5b'],
            isSakuraModelId: isSakura,
            asrListHasWhisperJa: hasJa,
        });
        assert.strictEqual(bad.enabled, false);
        const good = plan.planNextEnabled({
            asrIds: ['whisper-ja-1.5b'],
            mtIds: ['sakura-1.5b'],
            isSakuraModelId: isSakura,
            asrListHasWhisperJa: hasJa,
        });
        assert.strictEqual(good.enabled, true);
    });
});
