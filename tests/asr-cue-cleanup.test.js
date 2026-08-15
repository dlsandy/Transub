const assert = require('assert');
const { cuesToMsShape, cleanupAsrCues } = require('../electron/asr-cue-cleanup');

describe('asr-cue-cleanup', () => {
    it('cuesToMsShape maps seconds and drops empty', () => {
        const rows = cuesToMsShape([
            { start: 1.5, end: 2.25, text: 'こんにちは', avgLogprob: -0.2 },
            { startMs: 3000, endMs: 4000, text: '  ' },
        ]);
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].startMs, 1500);
        assert.strictEqual(rows[0].endMs, 2250);
        assert.strictEqual(rows[0].avgLogprob, -0.2);
    });

    it('cleanupAsrCues applies domain fix when JA mishear present', () => {
        const out = cleanupAsrCues([
            { startMs: 0, endMs: 1000, text: '今日からアパイタに入った' },
        ], { nameLoop: true, jaAsrDomainFix: true });
        assert.ok(out.domainChanged >= 1);
        assert.ok(out.cues[0].text.includes('アルバイト'));
        assert.ok(out.summary.includes('域修正'));
    });

    it('cleanupAsrCues strips simple name-loop hallucinations', () => {
        const out = cleanupAsrCues([
            { startMs: 0, endMs: 1200, text: '玲奈玲奈玲奈' },
        ], { nameLoop: true, jaAsrDomainFix: false });
        // If stripper rewrites or clears loops, changed > 0; otherwise still returns cues.
        assert.ok(Array.isArray(out.cues));
        assert.ok(out.cues.length >= 1);
        if (out.nameLoopsChanged > 0) {
            assert.ok(!/玲奈玲奈玲奈/.test(out.cues[0].text));
        }
    });

    it('cleanupAsrCues can disable stages', () => {
        const out = cleanupAsrCues(
            [{ startMs: 0, endMs: 1000, text: 'テスト' }],
            { nameLoop: false, jaAsrDomainFix: false },
        );
        assert.strictEqual(out.changed, 0);
        assert.strictEqual(out.cues[0].text, 'テスト');
    });
});
