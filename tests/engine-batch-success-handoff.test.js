const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    listSubtitleSeedTargets,
    engineCuesToMs,
    handoffAsrConfidence,
    runBatchSuccessHandoff,
} = require('../electron/engine-batch-success-handoff');

describe('engine-batch-success-handoff', () => {
    it('listSubtitleSeedTargets dedupes', () => {
        const a = path.resolve('a.srt');
        const list = listSubtitleSeedTargets({
            sourceSubtitlePath: a,
            subtitlePath: a,
            targetSubtitlePath: 'b.srt',
        });
        assert.strictEqual(list.length, 2);
    });

    it('engineCuesToMs maps seconds', () => {
        const ms = engineCuesToMs([{ start: 1.5, end: 2, text: 'x' }]);
        assert.strictEqual(ms[0].startMs, 1500);
        assert.strictEqual(ms[0].endMs, 2000);
    });

    it('handoffAsrConfidence seeds sidecar', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-handoff-'));
        const subPath = path.join(dir, 'out.srt');
        fs.writeFileSync(subPath, '1\n00:00:00,000 --> 00:00:01,000\nhello\n');
        const res = handoffAsrConfidence({
            cues: { source: [{ start: 0, end: 1, text: 'hello', confidence: 0.92 }] },
        }, { sourceSubtitlePath: subPath });
        assert.ok(res.ok);
        assert.ok(res.entryCount >= 1);
        const handoff = runBatchSuccessHandoff({
            cues: { source: [{ start: 0, end: 1, text: 'hello', confidence: 0.92 }] },
        }, { sourceSubtitlePath: subPath });
        assert.ok(handoff.logs.some((l) => l.includes('置信度')));
        assert.strictEqual(handoff.speakers, undefined);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
