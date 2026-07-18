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
        { path: 'a.mp4', duration: 100, status: 'running' },
        { path: 'b.mp4', duration: 200, status: 'pending' },
    ];
    const etaSec = eta.estimateEtaSec({
        items,
        activePath: 'a.mp4',
        videoCurrentSec: 40,
        videoTotalSec: 100,
        itemStage: 'transcribe',
        rate: 0.5,
    });
    // remaining media: 60 + 200 = 260 → *0.5 = 130; pending preFloor +15
    assert.strictEqual(etaSec, 145);
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
    testBatchProgressPct();
    testBuildTrayTooltip();
    console.log('eta-core.test.js: ok');
}

if (typeof describe === 'function') {
    describe('eta-core', () => {
        it('rateFromHistory', testRateFromHistory);
        it('estimateEtaSec', testEstimateEtaSec);
        it('batchProgressPct', testBatchProgressPct);
        it('buildTrayTooltip', testBuildTrayTooltip);
    });
} else {
    run();
}

module.exports = { run };
