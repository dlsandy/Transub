const assert = require('assert');
const { parseAcousticProbeLog } = require('../electron/ffmpeg-bridge');

describe('ffmpeg acoustic probe parse', () => {
    it('flags music-like dense audio', () => {
        const log = [
            '[silencedetect @] silence_start: 0.1',
            '[silencedetect @] silence_end: 0.2',
            '[Parsed_volumedetect_0 @] mean_volume: -18.5 dB',
            '[Parsed_volumedetect_0 @] max_volume: -6.0 dB',
        ].join('\n');
        const hit = parseAcousticProbeLog(log, 12);
        assert.strictEqual(hit.ok, true);
        assert.ok(hit.musicLikely);
        assert.strictEqual(hit.hint, 'music');
    });

    it('flags soft sparse dialogue', () => {
        const log = [
            '[silencedetect @] silence_start: 0.0',
            '[silencedetect @] silence_end: 3.0',
            '[silencedetect @] silence_start: 5.0',
            '[silencedetect @] silence_end: 9.0',
            '[Parsed_volumedetect_0 @] mean_volume: -38.0 dB',
            '[Parsed_volumedetect_0 @] max_volume: -12.0 dB',
        ].join('\n');
        const hit = parseAcousticProbeLog(log, 12);
        assert.ok(hit.softSparse);
        assert.strictEqual(hit.hint, 'soft');
    });
});
