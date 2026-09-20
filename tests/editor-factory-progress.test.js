const assert = require('assert');
const progress = require('../electron/editor-factory-progress');

describe('editor-factory-progress', () => {
    beforeEach(() => {
        progress._test.reset();
    });

    it('buffers events for late subscribers', () => {
        progress.emit('req1', { phase: 'start', message: 'go' });
        const got = [];
        const unsub = progress.subscribe('req1', (e) => got.push(e));
        assert.strictEqual(got.length, 1);
        assert.strictEqual(got[0].phase, 'start');
        progress.emit('req1', { phase: 'done', message: 'ok', pct: 100 });
        assert.strictEqual(got.length, 2);
        unsub();
    });

    it('makeProgressEmitter binds requestId', () => {
        const emit = progress.makeProgressEmitter('abc');
        const got = [];
        progress.subscribe('abc', (e) => got.push(e));
        emit({ phase: 'start', message: 'x' });
        assert.strictEqual(got[0].requestId, 'abc');
        assert.strictEqual(got[0].message, 'x');
    });
});
