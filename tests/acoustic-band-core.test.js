const assert = require('assert');
const band = require('../src/js/acoustic-band-core');

describe('acoustic-band-core', () => {
    it('plans sliding windows past 1h for long media', () => {
        const wins = band.planProbeWindows({ durationSec: 7200, hopSec: 40, maxWindows: 18 });
        assert.ok(wins.length >= 8);
        assert.ok(wins[0].startSec >= 60);
        assert.ok(wins.some((w) => w.startSec > 3600));
    });

    it('merges same-hint windows with hysteresis', () => {
        const windows = [
            { startSec: 60, durationSec: 12, hint: 'soft' },
            { startSec: 100, durationSec: 12, hint: 'soft' },
            { startSec: 140, durationSec: 12, hint: 'noisy' },
            { startSec: 180, durationSec: 12, hint: 'soft' },
            { startSec: 220, durationSec: 12, hint: 'soft' },
        ];
        // noisy single flip between soft runs stays soft via hysteresis
        const bands = band.mergeWindowsToBands(windows, { minBandSec: 20 });
        assert.ok(bands.length >= 1);
        assert.strictEqual(bands[0].hint, 'soft');
        assert.ok(bands[0].endSec > 200);
    });

    it('maps soft TEN/FireRed patches to 0.35/0.30', () => {
        const ten = band.resolveBandPatch('soft', { engineVadModel: 'ten-vad', vadThreshold: 0.4 });
        assert.strictEqual(ten.overrides.vadThreshold, 0.35);
        const fire = band.resolveBandPatch('soft', { engineVadModel: 'firered-vad' });
        assert.strictEqual(fire.overrides.vadThreshold, 0.30);
        const music = band.resolveBandPatch('music', { vadThreshold: 0.3 });
        assert.ok(music.overrides.vadThreshold >= 0.55);
        assert.strictEqual(music.overrides.audioLightDenoise, true);
    });

    it('selects divergent bands preferring soft', () => {
        const selected = band.selectRelistenBands([
            { hint: 'music', startSec: 0, endSec: 60, durationSec: 60 },
            { hint: 'soft', startSec: 120, endSec: 180, durationSec: 60 },
            { hint: 'noisy', startSec: 200, endSec: 260, durationSec: 60 },
        ], { primaryHint: 'music', maxBands: 2 });
        assert.strictEqual(selected[0].hint, 'soft');
        assert.strictEqual(selected.length, 2);
    });

    it('accepts soft re-listen when recovering more text', () => {
        const ok = band.shouldAcceptBandRelisten(
            [{ text: 'あ' }],
            [{ text: 'ありがとう' }, { text: 'ございます' }],
            'soft',
        );
        assert.strictEqual(ok, true);
        const no = band.shouldAcceptBandRelisten(
            [{ text: 'はっきりした対白です' }],
            [{ text: '…' }],
            'soft',
        );
        assert.strictEqual(no, false);
    });

    it('defaults acousticBandAdapt to auto and skips speed unless on', () => {
        assert.strictEqual(band.shouldRunAcousticBandAdapt({}), true);
        assert.strictEqual(band.shouldRunAcousticBandAdapt({ perfProfile: 'speed' }), false);
        assert.strictEqual(band.shouldRunAcousticBandAdapt({
            perfProfile: 'speed',
            acousticBandAdapt: 'on',
        }), true);
        assert.strictEqual(band.shouldRunAcousticBandAdapt({ acousticBandAdapt: 'off' }), false);
    });
});
