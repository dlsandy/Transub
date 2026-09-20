const assert = require('assert');
const slot = require('../src/js/mt-subtitle-slot-core');

describe('mt-subtitle-slot-core', () => {
    it('isBlankMtSlotText detects MT placeholders', () => {
        assert.strictEqual(slot.isBlankMtSlotText(''), true);
        assert.strictEqual(slot.isBlankMtSlotText('…'), true);
        assert.strictEqual(slot.isBlankMtSlotText('...'), true);
        assert.strictEqual(slot.isBlankMtSlotText('你好'), false);
    });

    it('buildTranslationTrackNoiseOptions never removes empty slots', () => {
        const opts = slot.buildTranslationTrackNoiseOptions({ removeHallucinations: true });
        assert.strictEqual(opts.removeEmpty, false);
        assert.strictEqual(opts.removeFragments, false);
        assert.strictEqual(opts.removeSoundEffects, false);
        assert.strictEqual(opts.removeSymbolOnly, false);
        assert.strictEqual(opts.removeHallucinations, true);
    });

    it('detectTranslationSlotMassDeletion blocks 919→156 style loss', () => {
        const hit = slot.detectTranslationSlotMassDeletion({
            beforeCount: 919,
            afterCount: 156,
            sourceCount: 919,
            isTranslationTrack: true,
        });
        assert.strictEqual(hit.blocked, true);
        assert.strictEqual(hit.reason, 'translation_slot_mass_deletion');
    });

    it('detectTranslationSlotMassDeletion allows moderate paired cleanup', () => {
        const ok = slot.detectTranslationSlotMassDeletion({
            beforeCount: 919,
            afterCount: 850,
            sourceCount: 919,
            isTranslationTrack: true,
        });
        assert.strictEqual(ok.blocked, false);
    });

    it('guardTranslationTrackNoiseStep reverts empty deletions', () => {
        const before = [
            { index: 1, text: '…' },
            { index: 2, text: '对白' },
        ];
        const after = [{ index: 2, text: '对白' }];
        const res = slot.guardTranslationTrackNoiseStep({
            beforeCues: before,
            afterCues: after,
            noiseStats: { empty: 1, removed: 1 },
            isTranslationTrack: true,
        });
        assert.strictEqual(res.reverted, true);
        assert.strictEqual(res.cues.length, 2);
    });
});
