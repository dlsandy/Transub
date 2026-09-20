const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    readSubtitleDocument,
    writeSubtitleDocument,
    scanSubtitleQc,
    readSubtitlePreview,
    listSubtitleSidecars,
    isSourceSubtitleTrack,
    normalizeSubtitleBakMode,
    resolveSubtitleBackupPath,
    resolveWriteBackupMode,
} = require('../electron/extensions-subtitle-document');

describe('extensions-subtitle-document', () => {
    it('exports the expected helpers', () => {
        assert.strictEqual(typeof readSubtitleDocument, 'function');
        assert.strictEqual(typeof writeSubtitleDocument, 'function');
        assert.strictEqual(typeof scanSubtitleQc, 'function');
        assert.strictEqual(typeof readSubtitlePreview, 'function');
        assert.strictEqual(typeof listSubtitleSidecars, 'function');
        assert.strictEqual(typeof isSourceSubtitleTrack, 'function');
        assert.strictEqual(typeof normalizeSubtitleBakMode, 'function');
        assert.strictEqual(typeof resolveSubtitleBackupPath, 'function');
        assert.strictEqual(typeof resolveWriteBackupMode, 'function');
    });

    it('normalizeSubtitleBakMode clamps unknown values to off', () => {
        assert.strictEqual(normalizeSubtitleBakMode('beside'), 'beside');
        assert.strictEqual(normalizeSubtitleBakMode('appBackup'), 'appBackup');
        assert.strictEqual(normalizeSubtitleBakMode('off'), 'off');
        assert.strictEqual(normalizeSubtitleBakMode(''), 'off');
        assert.strictEqual(normalizeSubtitleBakMode('nope'), 'off');
        assert.strictEqual(normalizeSubtitleBakMode(null), 'off');
    });

    it('resolveWriteBackupMode honors backupMode and createBackup flags', () => {
        assert.strictEqual(resolveWriteBackupMode({ backupMode: 'beside' }), 'beside');
        assert.strictEqual(resolveWriteBackupMode({ createBackup: true }), 'beside');
        assert.strictEqual(resolveWriteBackupMode({ createBackup: false }), 'off');
        assert.strictEqual(resolveWriteBackupMode({}), 'off');
    });

    it('isSourceSubtitleTrack detects JA/source archive names', () => {
        assert.strictEqual(isSourceSubtitleTrack('movie.src.srt'), true);
        assert.strictEqual(isSourceSubtitleTrack('movie.ja.srt'), true);
        assert.strictEqual(isSourceSubtitleTrack('movie.transcribe.srt'), true);
        assert.strictEqual(isSourceSubtitleTrack('movie.original.srt'), true);
        assert.strictEqual(isSourceSubtitleTrack('movie.zh.srt'), false);
    });

    it('round-trips a simple SRT via read/write', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-subdoc-'));
        const file = path.join(dir, 'sample.srt');
        try {
            const cues = [
                { startMs: 0, endMs: 1000, text: 'hello' },
                { startMs: 1200, endMs: 2200, text: 'world' },
            ];
            const written = writeSubtitleDocument(file, { format: 'srt', cues });
            assert.strictEqual(written.ok, true);
            assert.strictEqual(written.cueCount, 2);

            const read = readSubtitleDocument(file);
            assert.strictEqual(read.ok, true);
            assert.strictEqual(read.format, 'srt');
            assert.strictEqual(read.cueCount, 2);
            assert.strictEqual(read.cues[0].text, 'hello');

            const preview = readSubtitlePreview(file, 8);
            assert.strictEqual(preview.ok, true);
            assert.ok(String(preview.preview).includes('hello'));
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('re-exports remain on extensions-bridge', () => {
        const bridge = require('../electron/extensions-bridge');
        assert.strictEqual(bridge.readSubtitleDocument, readSubtitleDocument);
        assert.strictEqual(bridge.writeSubtitleDocument, writeSubtitleDocument);
        assert.strictEqual(bridge.normalizeSubtitleBakMode, normalizeSubtitleBakMode);
        assert.strictEqual(bridge.resolveSubtitleBackupPath, resolveSubtitleBackupPath);
        assert.strictEqual(bridge.resolveWriteBackupMode, resolveWriteBackupMode);
        assert.strictEqual(bridge.scanSubtitleQc, scanSubtitleQc);
        assert.strictEqual(bridge.listSubtitleSidecars, listSubtitleSidecars);
        assert.strictEqual(bridge.readSubtitlePreview, readSubtitlePreview);
        assert.strictEqual(bridge.isSourceSubtitleTrack, isSourceSubtitleTrack);
    });
});
