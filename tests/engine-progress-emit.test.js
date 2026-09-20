const assert = require('assert');
const { createProgressEmitter } = require('../electron/engine-progress-emit');

describe('engine-progress-emit', () => {
    it('emitToSubtitleUi fans out and skips duplicate main sender', () => {
        const sent = [];
        const main = { id: 1, isDestroyed: () => false, send: (ch, p) => sent.push(['main', ch, p]) };
        const other = { id: 2, isDestroyed: () => false, send: (ch, p) => sent.push(['other', ch, p]) };
        const emitter = createProgressEmitter({
            progressCoalesceMs: 0,
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
            progressCoalesceMs: 0,
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

    it('sendProgress coalesces high-frequency running IPC', async () => {
        const sent = [];
        let now = 0;
        const emitter = createProgressEmitter({
            progressCoalesceMs: 50,
            now: () => now,
            getWindowManager: () => ({
                getMainWindow: () => null,
                sendToRenderer: (ch, p) => sent.push([ch, p]),
            }),
            appendEngineLogLine: () => {},
        });
        emitter.sendProgress(null, {
            file: 'a.mp4', index1: 1, total: 1, stage: 'transcribe', detail: '转写中 1', percent: 10,
        });
        emitter.sendProgress(null, {
            file: 'a.mp4', index1: 1, total: 1, stage: 'transcribe', detail: '转写中 2', percent: 20,
        });
        emitter.sendProgress(null, {
            file: 'a.mp4', index1: 1, total: 1, stage: 'transcribe', detail: '转写中 3', percent: 30,
        });
        assert.strictEqual(sent.length, 0);
        await new Promise((r) => setTimeout(r, 80));
        const twai = sent.filter((x) => x[0] === 'transwithai-progress');
        assert.ok(twai.length >= 1);
        assert.ok(Number(twai[twai.length - 1][1].itemProgress) >= 30);
        emitter._testResetThrottle();
    });

    it('sendProgress flushes coalesce when the next queue file starts', async () => {
        const sent = [];
        const emitter = createProgressEmitter({
            progressCoalesceMs: 80,
            getWindowManager: () => ({
                getMainWindow: () => null,
                sendToRenderer: (ch, p) => sent.push([ch, p]),
            }),
            appendEngineLogLine: () => {},
        });
        emitter.sendProgress(null, {
            file: 'a.mp4', index1: 1, total: 2, stage: 'save', detail: '保存字幕', percent: 97,
        });
        emitter.sendProgress(null, {
            file: 'b.mp4', index1: 2, total: 2, stage: 'starting', detail: '准备引擎任务…', percent: 0,
        });
        const twai = sent.filter((x) => x[0] === 'transwithai-progress').map((x) => x[1]);
        assert.ok(twai.some((p) => String(p.fullPath || p.file || '').includes('a.mp4')));
        assert.ok(twai.some((p) => (
            String(p.fullPath || p.file || '').includes('b.mp4')
            && String(p.itemStage || p.stage) === 'starting'
        )));
        emitter._testResetThrottle();
    });

    it('sendProgress holds engine done before per-item QC finish', () => {
        const sent = [];
        const emitter = createProgressEmitter({
            progressCoalesceMs: 0,
            getWindowManager: () => ({
                getMainWindow: () => null,
                sendToRenderer: (ch, p) => sent.push([ch, p]),
            }),
            appendEngineLogLine: () => {},
        });
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'done',
            detail: '翻译完成',
            percent: 100,
        });
        const twai = sent.find((x) => x[0] === 'transwithai-progress')?.[1];
        assert.strictEqual(twai.phase, 'running');
        assert.strictEqual(twai.itemStage, 'save');
        assert.strictEqual(twai.itemProgress, 97);
    });

    it('sendProgress keeps running percent monotonic per file', () => {
        const sent = [];
        const emitter = createProgressEmitter({
            progressCoalesceMs: 0,
            getWindowManager: () => ({
                getMainWindow: () => null,
                sendToRenderer: (ch, p) => sent.push([ch, p]),
            }),
            appendEngineLogLine: () => {},
        });
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'cleanup',
            detail: '后处理',
            percent: 97,
        });
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'cleanup',
            detail: '后处理',
            percent: 95,
        });
        const twai = sent.filter((x) => x[0] === 'transwithai-progress').map((x) => x[1]);
        assert.strictEqual(twai[0].itemProgress, 97);
        assert.strictEqual(twai[1].itemProgress, 97);
    });

    it('sendProgress softens premature translate@95 before UI', () => {
        const sent = [];
        const emitter = createProgressEmitter({
            progressCoalesceMs: 0,
            getWindowManager: () => ({
                getMainWindow: () => null,
                sendToRenderer: (ch, p) => sent.push([ch, p]),
            }),
            appendEngineLogLine: () => {},
        });
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'transcribe',
            detail: '提取原文',
            percent: 62,
        });
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'translate',
            detail: '翻译完成',
            percent: 95,
        });
        const twai = sent.filter((x) => x[0] === 'transwithai-progress').map((x) => x[1]);
        assert.ok(twai[1].itemProgress <= 70, `got ${twai[1].itemProgress}`);
    });

    it('sendProgress recovers translate band after premature save@97', () => {
        const sent = [];
        const emitter = createProgressEmitter({
            progressCoalesceMs: 0,
            getWindowManager: () => ({
                getMainWindow: () => null,
                sendToRenderer: (ch, p) => sent.push([ch, p]),
            }),
            appendEngineLogLine: () => {},
        });
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'done',
            detail: '转写完成',
            percent: 100,
        });
        const afterAsr = sent.filter((x) => x[0] === 'transwithai-progress').map((x) => x[1]);
        assert.ok(afterAsr[0].itemProgress <= 65, `asr hold ${afterAsr[0].itemProgress}`);

        sent.length = 0;
        // Simulate a stale save@97 floor then a real translate tick.
        emitter.sendProgress(null, {
            file: 'b.mp4',
            index1: 1,
            total: 1,
            stage: 'save',
            detail: '收尾中…',
            percent: 97,
        });
        emitter.sendProgress(null, {
            file: 'b.mp4',
            index1: 1,
            total: 1,
            stage: 'translate',
            detail: '翻译 0/100',
            percent: 65,
        });
        const twai = sent.filter((x) => x[0] === 'transwithai-progress').map((x) => x[1]);
        assert.ok(twai[1].itemProgress <= 70, `got ${twai[1].itemProgress}`);
        assert.ok(twai[1].itemProgress >= 65, `got ${twai[1].itemProgress}`);
    });

    it('sendProgress ignores bare done without percent', () => {
        const sent = [];
        const emitter = createProgressEmitter({
            progressCoalesceMs: 0,
            getWindowManager: () => ({
                getMainWindow: () => null,
                sendToRenderer: (ch, p) => sent.push([ch, p]),
            }),
            appendEngineLogLine: () => {},
        });
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'transcribe',
            detail: '提取原文',
            percent: 60,
        });
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'done',
        });
        const twai = sent.filter((x) => x[0] === 'transwithai-progress').map((x) => x[1]);
        assert.strictEqual(twai.length, 1);
        assert.strictEqual(twai[0].itemProgress, 60);
    });

    it('sendProgress forwards qc fields on transwithai-progress', () => {
        const sent = [];
        const emitter = createProgressEmitter({
            progressCoalesceMs: 0,
            getWindowManager: () => ({
                getMainWindow: () => null,
                sendToRenderer: (ch, p) => sent.push([ch, p]),
            }),
            appendEngineLogLine: () => {},
        });
        emitter.sendProgress(null, {
            file: 'a.mp4',
            index1: 1,
            total: 1,
            stage: 'done',
            phase: 'done',
            detail: '完成 · QC 15 项',
            percent: 100,
            qcIssueCount: 15,
            qcFixedMode: 'smart',
            qcFixedWritten: true,
            qcFixedSummary: '规则修复；智能断句 2 条',
        });
        const twai = sent.find((x) => x[0] === 'transwithai-progress')?.[1];
        assert.ok(twai);
        assert.strictEqual(twai.phase, 'done');
        assert.strictEqual(twai.qcIssueCount, 15);
        assert.strictEqual(twai.qcFixedMode, 'smart');
        assert.strictEqual(twai.qcFixedWritten, true);
    });

    it('sendProgress keeps cancelled phase for row stop', () => {
        const sent = [];
        const emitter = createProgressEmitter({
            progressCoalesceMs: 0,
            getWindowManager: () => ({
                getMainWindow: () => null,
                sendToRenderer: (ch, p) => sent.push([ch, p]),
            }),
            appendEngineLogLine: () => {},
        });
        emitter.sendProgress(null, {
            file: 'b.mp4',
            index1: 2,
            total: 3,
            stage: 'cancelled',
            detail: '已取消',
            error: 'cancelled',
            percent: 0,
        });
        const twai = sent.find((x) => x[0] === 'transwithai-progress')?.[1];
        assert.ok(twai);
        assert.strictEqual(twai.phase, 'cancelled');
        assert.strictEqual(twai.itemStage, 'cancelled');
    });

    it('buildProgressLogKey normalizes counters', () => {
        const emitter = createProgressEmitter({
            progressCoalesceMs: 0,
            getWindowManager: () => null,
            appendEngineLogLine: () => {},
        });
        const a = emitter.buildProgressLogKey('translate', '翻译 10/100');
        const b = emitter.buildProgressLogKey('translate', '翻译 20/100');
        assert.strictEqual(a, b);
    });
});
