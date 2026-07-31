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
});
