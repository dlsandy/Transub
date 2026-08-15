const assert = require('assert');
const { createProgressEmitter } = require('../electron/engine-progress-emit');

describe('engine-progress-emit', () => {
    it('emitToSubtitleUi fans out and skips duplicate main sender', () => {
        const sent = [];
        const main = { id: 1, isDestroyed: () => false, send: (ch, p) => sent.push(['main', ch, p]) };
        const other = { id: 2, isDestroyed: () => false, send: (ch, p) => sent.push(['other', ch, p]) };
        const emitter = createProgressEmitter({
            getWindowManager: () => ({
                getMainWindow: () => ({ isDestroyed: () => false, webContents: main }),
                sendToRenderer: (ch, p) => sent.push(['wm', ch, p]),
            }),
            appendEngineLogLine: () => {},
        });
        emitter.emitToSubtitleUi('ch', { a: 1 }, main);
        assert.ok(sent.some((x) => x[0] === 'wm'));
        assert.ok(!sent.some((x) => x[0] === 'other' || (x[0] === 'main' && x[1] === 'ch')));

        sent.length = 0;
        emitter.emitToSubtitleUi('ch', { a: 2 }, other);
        assert.ok(sent.some((x) => x[0] === 'other'));
    });

    it('sendProgress throttles heartbeat logs', () => {
        const logs = [];
        let t = 1000;
        const emitter = createProgressEmitter({
            getWindowManager: () => ({
                getMainWindow: () => null,
                sendToRenderer: () => {},
            }),
            appendEngineLogLine: (line) => logs.push(line),
            now: () => t,
        });
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'transcribe',
            detail: '转写中 00:10',
            percent: 10,
        });
        t += 1000;
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'transcribe',
            detail: '转写中 00:20',
            percent: 20,
        });
        assert.strictEqual(logs.length, 1);
        t += 13000;
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'transcribe',
            detail: '转写中 00:30',
            percent: 30,
        });
        assert.strictEqual(logs.length, 2);
    });

    it('buildProgressLogKey normalizes counters', () => {
        const emitter = createProgressEmitter({
            getWindowManager: () => null,
            appendEngineLogLine: () => {},
        });
        const a = emitter.buildProgressLogKey('translate', '翻译 10/100');
        const b = emitter.buildProgressLogKey('translate', '翻译 20/100');
        assert.strictEqual(a, b);
    });
});
