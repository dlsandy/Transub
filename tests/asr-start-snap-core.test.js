const assert = require('assert');
const snap = require('../src/js/asr-start-snap-core');

describe('asr-start-snap-core', () => {
    it('auto-runs only for soft quality and respects asrTiming/off', () => {
        assert.strictEqual(snap.shouldRunAsrStartSnap({
            contentProfile: 'av_soft',
            perfProfile: 'quality',
        }), true);
        assert.strictEqual(snap.shouldRunAsrStartSnap({
            contentProfile: 'av_soft',
            perfProfile: 'speed',
        }), false);
        assert.strictEqual(snap.shouldRunAsrStartSnap({
            contentProfile: 'film',
            perfProfile: 'quality',
        }), false);
        assert.strictEqual(snap.shouldRunAsrStartSnap({
            contentProfile: 'av_soft',
            perfProfile: 'quality',
            asrTiming: 'off',
        }), false);
        assert.strictEqual(snap.shouldRunAsrStartSnap({
            contentProfile: 'film',
            asrStartSnap: 'on',
        }), true);
    });

    it('flags long low-CPS soft cues and ranks them first', () => {
        const cues = [
            { startMs: 0, endMs: 2000, text: '短い' },
            { startMs: 3000, endMs: 10000, text: 'も感じるか?' },
            { startMs: 12000, endMs: 16000, text: 'これは普通の長さの対白ですよ' },
            { startMs: 20000, endMs: 26000, text: 'はぁ…んんっ…' },
        ];
        const selected = snap.selectStartSnapCandidates(cues, {
            contentProfile: 'av_soft',
            perfProfile: 'quality',
        });
        assert.ok(selected.length >= 2);
        assert.strictEqual(selected[0].text, 'も感じるか?');
        assert.ok(selected[0].cps < snap.LOW_CPS);
    });

    it('keeps tighten-only snaps and rejects expansions', () => {
        const cue = { startMs: 1000, endMs: 5000, text: 'はぁ…んんっ…' };
        const kept = snap.filterSnapForAsr({
            changed: true,
            startMs: 1800,
            endMs: 3200,
            reason: 'energy_bounds',
        }, cue, { startOnly: true, minShiftMs: 50 });
        assert.strictEqual(kept.changed, true);
        assert.strictEqual(kept.startMs, 1800);
        assert.strictEqual(kept.endMs, 5000);

        const expanded = snap.filterSnapForAsr({
            changed: true,
            startMs: 400,
            endMs: 5600,
            reason: 'energy_bounds',
        }, cue, { minShiftMs: 50 });
        assert.strictEqual(expanded.changed, false);
        assert.strictEqual(expanded.reason, 'unchanged');
    });
});
