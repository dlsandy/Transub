const assert = require('assert');
const {
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
    MEDIA_EXTENSIONS,
    isVideoExt,
    isAudioExt,
    isMediaExt,
    getMediaMime,
    isMediaMimeType,
    DEFAULT_AUDIO_SUFFIXES,
} = require('../src/js/media-extensions-core');

describe('media-extensions-core', () => {
    it('includes common audio and video extensions', () => {
        assert.ok(AUDIO_EXTENSIONS.includes('mp3'));
        assert.ok(AUDIO_EXTENSIONS.includes('wav'));
        assert.ok(AUDIO_EXTENSIONS.includes('opus'));
        assert.ok(VIDEO_EXTENSIONS.includes('mp4'));
        assert.ok(MEDIA_EXTENSIONS.includes('mp3'));
        assert.ok(MEDIA_EXTENSIONS.includes('mp4'));
        assert.ok(DEFAULT_AUDIO_SUFFIXES.includes('mp3'));
        assert.ok(DEFAULT_AUDIO_SUFFIXES.includes('opus'));
    });

    it('classifies paths and MIME types', () => {
        assert.strictEqual(isAudioExt('track.mp3'), true);
        assert.strictEqual(isAudioExt('.FLAC'), true);
        assert.strictEqual(isVideoExt('clip.mkv'), true);
        assert.strictEqual(isMediaExt('C:\\\\a\\\\b.m4a'), true);
        assert.strictEqual(isMediaExt('notes.txt'), false);
        assert.strictEqual(getMediaMime('x.mp3'), 'audio/mpeg');
        assert.strictEqual(getMediaMime('x.mp4'), 'video/mp4');
        assert.strictEqual(isMediaMimeType('audio/wav'), true);
        assert.strictEqual(isMediaMimeType('video/webm'), true);
        assert.strictEqual(isMediaMimeType('text/plain'), false);
    });
});
