const assert = require('assert');
const {
    MT_BAND_LO,
    MT_BAND_HI,
    createMtUiProgressTracker,
    setMtUiCurrent,
    noteEngineTranslatePercent,
    mapAdapterMtProgress,
} = require('../electron/engine-mt-ui-progress');

describe('engine-mt-ui-progress', () => {
    it('maps adapter ticks into MT band without going backwards on batch reset', () => {
        const t = createMtUiProgressTracker();
        setMtUiCurrent(t, { file: 'D:/a.mp4', index1: 1, total: 1 });
        const a = mapAdapterMtProgress({ pct: 0, message: '开始' }, t);
        assert.strictEqual(a.stage, 'translate');
        assert.strictEqual(a.percent, MT_BAND_LO);
        assert.ok(a.detail.includes('开始') || a.detail === '开始');

        const b = mapAdapterMtProgress({ pct: 50, message: '窗口 5/10' }, t);
        assert.ok(b.percent > a.percent);
        assert.ok(b.percent < MT_BAND_HI);
        assert.match(b.detail, /窗口/);

        const beforeReset = b.percent;
        const c = mapAdapterMtProgress({ pct: 0, message: '下一批' }, t);
        assert.strictEqual(c.percent, beforeReset);

        const d = mapAdapterMtProgress({ pct: 40, message: '窗口 4/10' }, t);
        assert.ok(d.percent >= beforeReset);
    });

    it('engine SSE percent raises the floor for adapter bumps', () => {
        const t = createMtUiProgressTracker();
        setMtUiCurrent(t, { file: 'D:/a.mp4', index1: 1, total: 2 });
        noteEngineTranslatePercent(t, 80);
        const mapped = mapAdapterMtProgress({ pct: 10, message: '翻译中' }, t);
        assert.ok(mapped.percent >= 80);
        assert.ok(mapped.percent <= MT_BAND_HI);
    });

    it('returns null without a current file', () => {
        const t = createMtUiProgressTracker();
        assert.strictEqual(mapAdapterMtProgress({ pct: 50 }, t), null);
    });
});
