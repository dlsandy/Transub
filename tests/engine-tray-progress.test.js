const assert = require('assert');
const trayProgress = require('../electron/engine-tray-progress');

describe('engine-tray-progress', () => {
    afterEach(() => {
        trayProgress._testReset();
    });

    it('buildTrayItems maps path and duration', () => {
        const items = trayProgress.buildTrayItems([
            { fullPath: 'F:\\a.mp4', duration: 120 },
            { path: 'F:\\b.mp4', durationSec: 60 },
            { path: '' },
        ]);
        assert.strictEqual(items.length, 2);
        assert.strictEqual(items[0].path, 'F:\\a.mp4');
        assert.strictEqual(items[0].duration, 120);
        assert.strictEqual(items[1].duration, 60);
        assert.strictEqual(items[0].status, 'pending');
    });

    it('skips tray updates when trayProgressEnabled is false', () => {
        const updates = [];
        const wm = {
            setTrayProgressEnabled: () => {},
            updateTrayProgress: (p) => updates.push(p),
            clearTrayProgress: () => {},
        };
        trayProgress.beginBatchTrayProgress(wm, {
            list: [{ path: 'a.mp4', duration: 100 }],
            merged: { trayProgressEnabled: false, task: 'translate', device: 'cuda' },
        });
        trayProgress.updateBatchTrayFromProgress({
            index: 1,
            total: 1,
            itemProgress: 40,
            phase: 'running',
            fullPath: 'a.mp4',
            itemStage: 'transcribe',
        });
        assert.strictEqual(updates.length, 0);
    });

    it('updates tray tooltip payload when enabled', () => {
        const updates = [];
        let enabled = null;
        const wm = {
            setTrayProgressEnabled: (v) => { enabled = v; },
            updateTrayProgress: (p) => updates.push(p),
            clearTrayProgress: () => {},
        };
        trayProgress.beginBatchTrayProgress(wm, {
            list: [{ path: 'a.mp4', duration: 100 }],
            merged: { trayProgressEnabled: true, task: 'translate', device: 'cuda' },
        });
        assert.strictEqual(enabled, true);
        trayProgress.updateBatchTrayFromProgress({
            index: 1,
            total: 1,
            itemProgress: 40,
            phase: 'running',
            fullPath: 'a.mp4',
            videoCurrentSec: 40,
            videoTotalSec: 100,
            itemStage: 'transcribe',
        });
        assert.strictEqual(updates.length, 1);
        assert.ok(Number.isFinite(updates[0].batchPct));
        assert.strictEqual(updates[0].index, 1);
        assert.strictEqual(updates[0].total, 1);
        assert.ok(String(updates[0].etaText || '').length > 0);
        assert.strictEqual(trayProgress._testGetCtx().items[0].status, 'running');
    });

    it('endBatchTrayProgress clears tray and context', () => {
        let cleared = 0;
        const wm = {
            setTrayProgressEnabled: () => {},
            updateTrayProgress: () => {},
            clearTrayProgress: () => { cleared += 1; },
        };
        trayProgress.beginBatchTrayProgress(wm, {
            list: [{ path: 'a.mp4', duration: 10 }],
            merged: { trayProgressEnabled: true },
        });
        trayProgress.endBatchTrayProgress();
        assert.strictEqual(cleared, 1);
        assert.strictEqual(trayProgress._testGetCtx(), null);
    });
});
