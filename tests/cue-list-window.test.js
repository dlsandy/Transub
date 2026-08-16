const assert = require('assert');
const win = require('../src/js/cue-list-window-core');

describe('cue-list-window-core', () => {
    it('virtualizes only above threshold', () => {
        assert.strictEqual(win.shouldVirtualize(50), false);
        assert.strictEqual(win.shouldVirtualize(200), true);
    });

    it('computes padded window', () => {
        const w = win.computeWindow({
            scrollTop: 720,
            viewportHeight: 360,
            total: 500,
            rowHeight: 36,
            overscan: 2,
        });
        assert.ok(w.start >= 0);
        assert.ok(w.end > w.start);
        assert.ok(w.end <= 500);
        assert.strictEqual(w.topPad, w.start * 36);
        assert.ok(w.bottomPad >= 0);
    });

    it('scrollTopForIndex keeps row in view (nearest)', () => {
        const below = win.scrollTopForIndex({
            index: 50,
            total: 500,
            viewportHeight: 360,
            rowHeight: 36,
            currentScrollTop: 0,
            align: 'nearest',
        });
        assert.ok(below >= 50 * 36 - 360);
        assert.ok(below <= 50 * 36);

        const above = win.scrollTopForIndex({
            index: 2,
            total: 500,
            viewportHeight: 360,
            rowHeight: 36,
            currentScrollTop: 2000,
            align: 'nearest',
        });
        assert.strictEqual(above, 2 * 36);
    });
});
