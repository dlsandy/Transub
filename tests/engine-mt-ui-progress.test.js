const assert = require('assert');
const { clearTranslateProgressSessions } = require('../electron/engine-job-progress');
const {
    MT_LOAD_LO,
    MT_BAND_LO,
    MT_BAND_HI,
    createMtUiProgressTracker,
    setMtUiCurrent,
    noteEngineTranslatePercent,
    mapMtLocalToOverall,
    mapAdapterMtProgress,
} = require('../electron/engine-mt-ui-progress');

describe('engine-mt-ui-progress', () => {
    beforeEach(() => {
        clearTranslateProgressSessions();
    });
    it('maps adapter ticks into load+MT bands without going backwards on batch reset', () => {
        const t = createMtUiProgressTracker();
        setMtUiCurrent(t, { file: 'D:/a.mp4', index1: 1, total: 1 });
        const a = mapAdapterMtProgress({ pct: 0, message: '开始' }, t);
        assert.strictEqual(a.stage, 'translate');
        assert.strictEqual(a.percent, MT_LOAD_LO);
        assert.ok(a.detail.includes('开始') || a.detail === '开始');

        const b = mapAdapterMtProgress({ pct: 50, message: '窗口 5/10' }, t);
        assert.ok(b.percent > a.percent);
        assert.ok(b.percent >= MT_BAND_LO);
        assert.ok(b.percent < MT_BAND_HI);
        assert.match(b.detail, /窗口/);

        const beforeReset = b.percent;
        const c = mapAdapterMtProgress({ pct: 0, message: '下一批' }, t);
        assert.strictEqual(c.percent, beforeReset);

        const d = mapAdapterMtProgress({ pct: 40, message: '窗口 4/10' }, t);
        assert.ok(d.percent >= beforeReset);
        const at100 = mapAdapterMtProgress({ pct: 100, message: '翻译 200/200' }, t);
        assert.strictEqual(at100.percent, MT_BAND_HI);
    });

    it('mapMtLocalToOverall covers load prep then translate', () => {
        assert.strictEqual(mapMtLocalToOverall(0), MT_LOAD_LO);
        assert.strictEqual(mapMtLocalToOverall(8), MT_BAND_LO);
        assert.ok(mapMtLocalToOverall(50) > MT_BAND_LO);
        assert.ok(mapMtLocalToOverall(100) <= MT_BAND_HI);
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

    it('adapter pct 100 on first tick stays in load band until batch detail', () => {
        const t = createMtUiProgressTracker();
        setMtUiCurrent(t, { file: 'D:/a.mp4', index1: 1, total: 1 });
        const at100 = mapAdapterMtProgress({ pct: 100, message: '完成' }, t);
        assert.ok(at100.percent <= 70, `expected load band, got ${at100.percent}`);
        const mid = mapAdapterMtProgress({ pct: 50, message: '翻译 50/200' }, t);
        assert.ok(mid.percent > at100.percent);
        assert.ok(mid.percent < MT_BAND_HI);
    });

    it('skips log-only film-brief dump lines from the status badge', () => {
        const t = createMtUiProgressTracker();
        setMtUiCurrent(t, { file: 'D:/a.mp4', index1: 1, total: 1 });
        const mapped = mapAdapterMtProgress({
            logOnly: true,
            message: '简要 · 概要：高中生围绕学园祭展开日常对话。',
        }, t);
        assert.strictEqual(mapped, null);
    });

    it('Sakura chunk ticks do not inflate to translate band top', () => {
        const {
            getTranslateProgressSession,
            softenTranslateProgressFields,
        } = require('../electron/engine-job-progress');
        const t = createMtUiProgressTracker();
        setMtUiCurrent(t, { file: 'D:/a.mp4', index1: 1, total: 1 });
        const session = getTranslateProgressSession('D:/a.mp4');
        softenTranslateProgressFields({
            stage: 'translate',
            percent: 65,
            detail: '翻译 0/1283',
        }, session);
        const chunkDone = mapAdapterMtProgress({
            pct: 100,
            message: '推理翻译 5/5 · 第 33–40 条 完成',
        }, t);
        assert.ok(chunkDone.percent < 75, `expected load/micro band, got ${chunkDone.percent}`);
        assert.ok(chunkDone.percent >= MT_LOAD_LO);

        softenTranslateProgressFields({
            stage: 'translate',
            percent: 71,
            detail: '翻译 40/1283',
        }, session);
        noteEngineTranslatePercent(t, 71);
        const mid = mapAdapterMtProgress({
            pct: 50,
            message: '推理翻译 2/5 · 第 49–56 条（推理中…）',
        }, t);
        assert.ok(mid.percent >= 71 && mid.percent < MT_BAND_HI, `mid ${mid.percent}`);
    });
});
