'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    isVideoFile,
    isInternalTimingCachePath,
    scanVideosInDirectory,
    scanVideosInDirectoryAsync,
} = require('../electron/media-video-scan');

describe('media-video-scan', () => {
    let tmpRoot;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-scan-'));
        fs.writeFileSync(path.join(tmpRoot, 'a.mp4'), '');
        fs.writeFileSync(path.join(tmpRoot, 'b.mp3'), '');
        fs.writeFileSync(path.join(tmpRoot, 'note.txt'), '');
        const nested = path.join(tmpRoot, 'nested');
        fs.mkdirSync(nested);
        fs.writeFileSync(path.join(nested, 'c.mkv'), '');
    });

    afterEach(() => {
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    it('isVideoFile accepts media extensions', () => {
        assert.strictEqual(isVideoFile('x.mp4'), true);
        assert.strictEqual(isVideoFile('x.mp3'), true);
        assert.strictEqual(isVideoFile('x.txt'), false);
    });

    it('rejects internal timing-16k cache wav as job media', () => {
        assert.strictEqual(
            isInternalTimingCachePath('E:/x/.transub-cache/foo.timing-16k.wav'),
            true,
        );
        assert.strictEqual(isVideoFile('E:/x/.transub-cache/foo.timing-16k.wav'), false);
        assert.strictEqual(isVideoFile('E:/x/foo.timing-16k.wav'), false);
        assert.strictEqual(isVideoFile('E:/x/foo.mp4'), true);
    });

    it('scan skips .transub-cache directories', () => {
        const cache = path.join(tmpRoot, '.transub-cache');
        fs.mkdirSync(cache);
        fs.writeFileSync(path.join(cache, 'clip.timing-16k.wav'), '');
        fs.writeFileSync(path.join(cache, 'sneaky.mp4'), '');
        const files = scanVideosInDirectory(tmpRoot, true);
        assert.ok(!files.some((f) => f.includes('.transub-cache')));
        assert.ok(!files.some((f) => /timing-16k/i.test(f)));
        assert.strictEqual(files.length, 3);
    });

    it('scanVideosInDirectory finds nested media sync', () => {
        const files = scanVideosInDirectory(tmpRoot, true);
        assert.strictEqual(files.length, 3);
        assert.ok(files.some((f) => f.endsWith('a.mp4')));
        assert.ok(files.some((f) => f.endsWith('b.mp3')));
        assert.ok(files.some((f) => f.endsWith(`${path.sep}c.mkv`) || f.endsWith('/c.mkv')));
    });

    it('scanVideosInDirectoryAsync matches sync results', async () => {
        const syncFiles = scanVideosInDirectory(tmpRoot, true);
        const asyncFiles = await scanVideosInDirectoryAsync(tmpRoot, true);
        assert.deepStrictEqual(asyncFiles, syncFiles);
    });

    it('non-recursive skips nested', () => {
        const files = scanVideosInDirectory(tmpRoot, false);
        assert.strictEqual(files.length, 2);
        assert.ok(!files.some((f) => f.includes(`${path.sep}nested${path.sep}`)));
    });
});
