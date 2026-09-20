const assert = require('assert');
const path = require('path');
const live = require('../electron/live-batch-queue');

describe('live-batch-queue (main)', () => {
    afterEach(() => {
        live.end();
    });

    it('appends and skips upcoming items', () => {
        const list = [{ fullPath: path.resolve('a.mp4'), durationSec: 1 }];
        live.begin(list);
        const ap = live.append([{ fullPath: path.resolve('b.mp4'), durationSec: 2 }]);
        assert.strictEqual(ap.ok, true);
        assert.strictEqual(ap.appended.length, 1);
        assert.strictEqual(list.length, 2);

        live.setCurrent(path.resolve('a.mp4'));
        const sk = live.skip([path.resolve('a.mp4'), path.resolve('b.mp4')]);
        assert.strictEqual(sk.ok, true);
        assert.deepStrictEqual(sk.blocked.map((p) => live.normKey(p)), [
            live.normKey(path.resolve('a.mp4')),
        ]);
        assert.strictEqual(sk.skipped.length, 1);
        assert.strictEqual(live.consumeSkip(path.resolve('b.mp4')), true);
        assert.strictEqual(live.consumeSkip(path.resolve('b.mp4')), false);
    });

    it('rejects mutate when idle', () => {
        const ap = live.append([{ fullPath: 'x.mp4' }]);
        assert.strictEqual(ap.ok, false);
        assert.strictEqual(ap.code, 'no_batch');
    });

    it('getSnapshot reports idle and active queue', () => {
        const idle = live.getSnapshot();
        assert.strictEqual(idle.active, false);
        assert.deepStrictEqual(idle.paths, []);

        const a = path.resolve('a.mp4');
        const b = path.resolve('b.mp4');
        live.begin([{ fullPath: a }, { fullPath: b }]);
        live.setCurrent(a);
        live.skip([b]);
        const snap = live.getSnapshot();
        assert.strictEqual(snap.active, true);
        assert.strictEqual(snap.total, 2);
        assert.strictEqual(snap.currentIndex1, 1);
        assert.strictEqual(live.normKey(snap.current), live.normKey(a));
        assert.strictEqual(snap.skipped.length, 1);
        assert.strictEqual(live.normKey(snap.skipped[0]), live.normKey(b));
    });
});
