const assert = require('assert');
const {
    normalizeMediaLangTag,
    parseMediaMetaFromFfprobeOutput,
} = require('../electron/ffmpeg-bridge');

describe('ffmpeg media language tags', () => {
    it('keeps product languages and drops exotic ISO codes like nn', () => {
        assert.strictEqual(normalizeMediaLangTag('jpn'), 'ja');
        assert.strictEqual(normalizeMediaLangTag('eng'), 'en');
        assert.strictEqual(normalizeMediaLangTag('chi'), 'zh');
        assert.strictEqual(normalizeMediaLangTag('yue'), 'yue');
        assert.strictEqual(normalizeMediaLangTag('nn'), '');
        assert.strictEqual(normalizeMediaLangTag('de'), '');
        assert.strictEqual(normalizeMediaLangTag('fr'), '');
        assert.strictEqual(normalizeMediaLangTag('und'), '');
    });

    it('probe meta does not promote nn container tags into language', () => {
        const info = parseMediaMetaFromFfprobeOutput(JSON.stringify({
            streams: [
                { codec_type: 'audio', tags: { language: 'nn' } },
                { codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 },
            ],
            format: { duration: '100', tags: { language: 'nn' } },
        }));
        assert.strictEqual(info.language, '');
        assert.deepStrictEqual(info.audioLanguages, []);
    });
});
