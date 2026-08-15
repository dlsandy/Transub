const assert = require('assert');
const { createEngineLogIo } = require('../electron/engine-log-io');

describe('engine-log-io', () => {
    it('emits kept lines and coalesces repeats', () => {
        const emitted = [];
        const io = createEngineLogIo({
            emitLine: (payload) => emitted.push(payload.line),
        });
        io.appendEngineLogLine('[engine] hello');
        io.appendEngineLogLine('[engine] hello');
        io.appendEngineLogLine('[engine] hello');
        io.appendEngineLogLine('[engine] next');
        assert.ok(emitted.some((l) => l.includes('hello')));
        assert.ok(emitted.some((l) => l.includes('重复')));
        assert.ok(emitted.some((l) => l.includes('next')));
    });

    it('drops tqdm noise and summarizes when many', () => {
        const emitted = [];
        const io = createEngineLogIo({
            emitLine: (payload) => emitted.push(payload.line),
        });
        for (let i = 0; i < 10; i += 1) {
            io.appendEngineLogLine('100%|████| 1/1 [00:01<00:00, 1.2s/it]');
        }
        io.appendEngineLogLine('[engine] done');
        assert.ok(emitted.some((l) => l.includes('省略')));
        assert.ok(emitted.some((l) => l.includes('done')));
    });

    it('flushEngineLogChunk splits CR lines', () => {
        const emitted = [];
        const io = createEngineLogIo({
            emitLine: (payload) => emitted.push(payload.line),
        });
        io.flushEngineLogChunk('[engine] a\r[engine] b\n');
        assert.ok(emitted.some((l) => l.includes('[engine] a')));
        assert.ok(emitted.some((l) => l.includes('[engine] b')));
    });
});
