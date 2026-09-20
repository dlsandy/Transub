'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('subtitle-utils dir list cache', () => {
    let tmpDir;
    let utils;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-sidecar-cache-'));
        delete require.cache[require.resolve('../electron/subtitle-utils')];
        utils = require('../electron/subtitle-utils');
        utils.invalidateDirListCache();
    });

    afterEach(() => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch { /* ignore */ }
        delete require.cache[require.resolve('../electron/subtitle-utils')];
    });

    it('collectSubtitleSidecars reuses short-TTL dir listing', () => {
        const video = path.join(tmpDir, 'Movie.mp4');
        fs.writeFileSync(video, '');
        fs.writeFileSync(path.join(tmpDir, 'Movie.zh-cn.srt'), '1\n');

        const first = utils.collectSubtitleSidecars(video);
        assert.ok(first.some((p) => /Movie\.zh-cn\.srt$/i.test(p)));

        // New sidecar appears on disk but within TTL the cached listing is used.
        fs.writeFileSync(path.join(tmpDir, 'Movie.ja.srt'), '1\n');
        const second = utils.collectSubtitleSidecars(video);
        assert.strictEqual(second.length, first.length);

        utils.invalidateDirListCache(tmpDir);
        const third = utils.collectSubtitleSidecars(video);
        assert.ok(third.some((p) => /Movie\.ja\.srt$/i.test(p)));
        assert.ok(third.length > first.length);
    });
});
