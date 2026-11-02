const assert = require('assert');
const core = require('../src/js/waveform-timing-suspect-core');
const {
    planMergedQcRetranscribeRanges,
    selectQcRetranscribeTargets,
} = require('../src/js/subtitle-qc-smart-core');

describe('waveform-timing-suspect-core', () => {
    function tone(hz, ms, sampleRate = 16000, amp = 0.2) {
        const n = Math.round((ms / 1000) * sampleRate);
        const out = new Int16Array(n);
        for (let i = 0; i < n; i += 1) {
            out[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / sampleRate) * amp * 32767);
        }
        return out;
    }

    function concatInt16(parts) {
        const len = parts.reduce((s, p) => s + p.length, 0);
        const out = new Int16Array(len);
        let o = 0;
        for (const p of parts) {
            out.set(p, o);
            o += p.length;
        }
        return out;
    }

    it('labels quiet body as hard', () => {
        const pre = tone(200, 600, 16000, 0.25);
        const body = tone(200, 800, 16000, 0.002);
        const post = tone(200, 600, 16000, 0.25);
        const pcm = concatInt16([pre, body, post]);
        const row = core.analyzeCuePcm({
            index: 1,
            startMs: 1000,
            endMs: 1800,
            text: 'いかがですか',
        }, pcm, { sampleRate: 16000, preMs: 600, postMs: 600 });
        assert.strictEqual(row.label, 'hard');
        assert.ok(row.reasons.includes('body_quiet'));
    });

    it('labels clean mid speech as ok', () => {
        const pre = tone(100, 600, 16000, 0.01);
        const body = tone(300, 1000, 16000, 0.25);
        const post = tone(100, 600, 16000, 0.01);
        const pcm = concatInt16([pre, body, post]);
        const row = core.analyzeCuePcm({
            index: 2,
            startMs: 0,
            endMs: 1000,
            text: '今日はいい天気ですね',
        }, pcm, { sampleRate: 16000, preMs: 600, postMs: 600 });
        assert.strictEqual(row.label, 'ok');
    });

    it('merges waveform issues and orders by severity', () => {
        const suspects = [
            { index: 3, label: 'soft', reasons: ['high_cps'], severity: 1, text: 'a' },
            { index: 1, label: 'hard', reasons: ['body_quiet'], severity: 3, text: 'b' },
        ];
        const issues = core.mergeWaveformIssues([], suspects);
        assert.ok(issues.some((i) => i.index === 1 && i.types.includes('timing_waveform')));
        assert.deepStrictEqual(core.orderSuspectIndexes(suspects), [1, 3]);
    });

    it('soft-includes longer mid-duration lines without CPS flags', () => {
        const cues = [
            { startMs: 0, endMs: 2000, text: 'これは十分に長いセリフですよね' },
            { startMs: 3000, endMs: 3200, text: '短' },
        ];
        const picked = core.pickWaveformCandidates(cues, [], { maxCandidates: 8 });
        assert.ok(picked.some((c) => c.index === 0));
        assert.ok(!picked.some((c) => c.index === 1));
    });

    it('picks candidates from structural issues', () => {
        const cues = [
            { startMs: 0, endMs: 500, text: '短' },
            { startMs: 1000, endMs: 1200, text: 'あいうえおかきくけこ' },
            { startMs: 2000, endMs: 4000, text: '普通のセリフです' },
        ];
        const picked = core.pickWaveformCandidates(cues, [
            { index: 1, types: ['high_cps'] },
        ], { maxCandidates: 4 });
        assert.ok(picked.some((c) => c.index === 1));
    });

    it('proposes edge snap when forced on spill window', () => {
        const pre = tone(220, 600, 16000, 0.28);
        const body = tone(330, 900, 16000, 0.22);
        const post = tone(100, 600, 16000, 0.01);
        const pcm = concatInt16([pre, body, post]);
        const cue = { index: 5, startMs: 10000, endMs: 10900, text: '测试句子一二三四' };
        const analysis = core.analyzeCuePcm(cue, pcm, { sampleRate: 16000, preMs: 600, postMs: 600 });
        const snap = core.proposeEdgeSnap(cue, pcm, {
            analysis,
            sampleRate: 16000,
            preMs: 600,
            postMs: 600,
            force: true,
        });
        assert.ok(snap.changed || analysis.label !== 'ok');
        if (snap.changed) {
            assert.ok(snap.endMs - snap.startMs >= 300);
        }
    });

    it('ranks mid-cue valley split points first', () => {
        const pre = tone(100, 600, 16000, 0.02);
        const a = tone(300, 400, 16000, 0.25);
        const valley = tone(100, 200, 16000, 0.01);
        const b = tone(300, 400, 16000, 0.25);
        const post = tone(100, 600, 16000, 0.02);
        const pcm = concatInt16([pre, a, valley, b, post]);
        const cue = { index: 1, startMs: 0, endMs: 1000, text: '前面一段然后后面一段' };
        const ranked = core.rankSplitPointsByValley([200, 600, 850], cue, pcm, {
            sampleRate: 16000,
            preMs: 600,
            postMs: 600,
        });
        assert.strictEqual(ranked[0], 600);
    });
});

describe('QC retranscribe merge with waveform timing', () => {
    it('fills leftover slots with Score-ordered waveform indexes before low-conf', () => {
        const cues = [];
        for (let i = 0; i < 10; i += 1) {
            cues.push({
                startMs: i * 3000,
                endMs: i * 3000 + 2000,
                text: `段${i}`,
            });
        }
        const issues = [
            { index: 0, types: ['connected'], messages: ['连续'] },
            { index: 8, types: ['timing_waveform', 'timing_waveform_hard'], messages: ['波形'] },
            { index: 7, types: ['timing_waveform', 'timing_waveform_soft'], messages: ['波形'] },
        ];
        const merged = planMergedQcRetranscribeRanges(cues, issues, [9], {
            maxRanges: 2,
            waveformIndexes: [8, 7],
        });
        assert.ok(merged.connectedIndexes.includes(0));
        assert.ok(merged.indexes.includes(8), `expected waveform 8 in ${merged.indexes}`);
        assert.ok(merged.plan.includes('波形计时') || merged.plan.includes('连续'));
        const targets = selectQcRetranscribeTargets(issues, {});
        assert.ok(targets.some((t) => t.types.includes('timing_waveform')));
    });
});
