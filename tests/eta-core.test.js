const assert = require('assert');
const eta = require('../src/js/eta-core');

function testRateFromHistory() {
    const entries = [
        { wallSec: 100, totalDurationSec: 200, device: 'cuda', task: 'translate' },
        { wallSec: 120, totalDurationSec: 200, device: 'cuda', task: 'translate' },
        { wallSec: 80, totalDurationSec: 200, device: 'cuda', task: 'translate' },
        { wallSec: 10, totalDurationSec: 200, device: 'cpu', task: 'translate' },
    ];
    const rate = eta.rateFromHistory(entries, { device: 'cuda', task: 'translate' });
    assert.ok(Math.abs(rate - 0.5) < 1e-9);
}

function testEstimateEtaSec() {
    const items = [
        { path: 'a.mp4', duration: 100, status: 'running', startedAt: Date.now() - 60000 },
        { path: 'b.mp4', duration: 200, status: 'pending' },
    ];
    const etaSec = eta.estimateEtaSec({
        items,
        activePath: 'a.mp4',
        videoCurrentSec: 40,
        videoTotalSec: 100,
        itemStage: 'transcribe',
        itemProgress: 40,
        activeStartedAt: Date.now() - 60000,
        rate: 0.5,
    });
    // Progress-based: 60s @40% → ~90s remain + pending b (200*0.5+15≈115)
    assert.ok(etaSec >= 80 && etaSec <= 220, `expected sane transcribe ETA, got ${etaSec}`);

    const translateEta = eta.estimateEtaSec({
        items: [{ path: 'a.mp4', duration: 3600, status: 'running', startedAt: Date.now() - 120000 }],
        activePath: 'a.mp4',
        itemStage: 'translate',
        itemProgress: 80,
        activeStartedAt: Date.now() - 120000,
        rate: 0.35,
    });
    // Must not treat full 3600s media as remaining at translate@80%
    assert.ok(translateEta < 3600, `translate ETA too high: ${translateEta}`);
}

function testHeavyMtTranslateEtaNotCrushed() {
    // Classic bug: overall 70% (translate just started) + media tail clamp → ~2–3 min for 1h film.
    const startedAt = Date.now() - (20 * 60 * 1000);
    const translateStartedAt = Date.now() - (8 * 60 * 1000);
    const etaSec = eta.estimateEtaSec({
        items: [{ path: 'a.mp4', duration: 3600, status: 'running', startedAt }],
        activePath: 'a.mp4',
        videoTotalSec: 3600,
        itemStage: 'translate',
        itemProgress: 70,
        itemDetail: '翻译 40/800',
        activeStartedAt: startedAt,
        translateStageStartedAt: translateStartedAt,
        mtModelId: 'hy-mt2-30b-a3b-heretic-mini',
        mtWeightGiB: 10.5,
        moe: true,
        mtParamBillion: 30,
        mtActiveParamBillion: 3,
        rate: 0.35,
    });
    // 8 min for 40/800 cues → ~152 min remain; must not collapse to media-tail minutes.
    assert.ok(etaSec >= 45 * 60, `30B cue ETA too optimistic: ${etaSec}s`);
    assert.ok(etaSec <= 6 * 3600, `30B cue ETA absurdly high: ${etaSec}s`);
}

function testResolveMtEtaScale() {
    assert.ok(eta.resolveMtEtaScale({ mtModelId: 'hy-mt2-30b-a3b-heretic' }) >= 8);
    assert.ok(eta.resolveMtEtaScale({ mtModelId: 'sakura-1.5b' }) <= 1.01);
    assert.ok(eta.parseTranslateCueProgress('翻译 12/100')?.done === 12);
    assert.strictEqual(eta.parseTranslateCueProgress('Hy-MT2 翻译 2/5'), null);
    assert.ok(eta.translateBandLocalPct(65) === 0);
    assert.ok(eta.translateBandLocalPct(80) > 40 && eta.translateBandLocalPct(80) < 60);
}

function testBatchProgressPct() {
    assert.strictEqual(eta.batchProgressPct({ index: 2, total: 4, itemProgress: 50 }), 38);
}

function testBuildTrayTooltip() {
    const tip = eta.buildTrayTooltip({
        batchPct: 40,
        index: 2,
        total: 5,
        etaText: '约 3 分钟',
    });
    assert.ok(tip.includes('第 2/5'));
    assert.ok(tip.includes('40%'));
    assert.ok(tip.includes('约 3 分钟'));
}

function run() {
    testRateFromHistory();
    testEstimateEtaSec();
    testHeavyMtTranslateEtaNotCrushed();
    testResolveMtEtaScale();
    testBatchProgressPct();
    testBuildTrayTooltip();
    console.log('eta-core.test.js: ok');
}

if (typeof describe === 'function') {
    describe('eta-core', () => {
        it('rateFromHistory', testRateFromHistory);
        it('estimateEtaSec', testEstimateEtaSec);
        it('heavy Hy-MT2 30B translate ETA uses cues, not media clamp', testHeavyMtTranslateEtaNotCrushed);
        it('resolveMtEtaScale / parseTranslateCueProgress', testResolveMtEtaScale);
        it('batchProgressPct', testBatchProgressPct);
        it('buildTrayTooltip', testBuildTrayTooltip);
    });
} else {
    run();
}

module.exports = { run };
