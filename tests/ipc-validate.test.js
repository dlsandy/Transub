const assert = require('assert');
const path = require('path');
const {
    isSafeExternalUrl,
    assertSafeExternalUrl,
    assertEditableSubtitlePath,
    assertVideoFilePath,
    assertUserFilePath,
} = require('../electron/ipc-validate');

function testSafeExternalUrl() {
    assert.strictEqual(isSafeExternalUrl('https://example.com/a'), true);
    assert.strictEqual(isSafeExternalUrl('http://example.com'), true);
    assert.strictEqual(isSafeExternalUrl('file:///C:/Windows/notepad.exe'), false);
    assert.strictEqual(isSafeExternalUrl('javascript:alert(1)'), false);
    assert.strictEqual(isSafeExternalUrl(''), false);
    assert.throws(() => assertSafeExternalUrl('file:///tmp/x'), /http\/https/);
}

function testSubtitlePathExt() {
    const srt = assertEditableSubtitlePath('C:\\Videos\\a.srt');
    assert.ok(srt.toLowerCase().endsWith('.srt'));
    const ass = assertEditableSubtitlePath('C:\\Videos\\a.ass');
    assert.ok(ass.toLowerCase().endsWith('.ass'));
    const ssa = assertEditableSubtitlePath('C:\\Videos\\a.ssa');
    assert.ok(ssa.toLowerCase().endsWith('.ssa'));
    assert.throws(() => assertEditableSubtitlePath('C:\\Videos\\a.exe'), (err) => /\u6269\u5c55\u540d/.test(err.message));
    assert.throws(() => assertEditableSubtitlePath(''), (err) => /\u7f3a\u5c11/.test(err.message));
}

function testVideoPathExt() {
    const mp4 = assertVideoFilePath('D:\\clip.mp4');
    assert.ok(mp4.toLowerCase().endsWith('.mp4'));
    const mp3 = assertVideoFilePath('D:\\podcast.mp3');
    assert.ok(mp3.toLowerCase().endsWith('.mp3'));
    const wav = assertVideoFilePath('E:\\voice.wav');
    assert.ok(wav.toLowerCase().endsWith('.wav'));
    assert.throws(() => assertVideoFilePath('D:\\clip.srt'), (err) => /\u6269\u5c55\u540d/.test(err.message));
}

function testNullByteRejected() {
    assert.throws(() => assertUserFilePath('C:\\a\0b.srt'), (err) => /\u975e\u6cd5/.test(err.message));
}

function testResolveAbsolute() {
    const rel = assertUserFilePath(path.join('tmp', 'x.srt'));
    assert.strictEqual(path.isAbsolute(rel), true);
}

describe('ipc-validate', () => {
    it('validates safe external URLs', () => { testSafeExternalUrl(); });
    it('validates subtitle path extensions', () => { testSubtitlePathExt(); });
    it('validates video path extensions', () => { testVideoPathExt(); });
    it('rejects null bytes in paths', () => { testNullByteRejected(); });
    it('resolves relative paths to absolute', () => { testResolveAbsolute(); });
});
