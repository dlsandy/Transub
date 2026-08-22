const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { scanFoldersForMissingSubtitles, normalizeFolderList } = require('../electron/media-auto-scan');
const autoScan = require('../src/js/auto-scan-folders-core');

describe('auto-scan folders', () => {
    it('normalizes folder list and log text', () => {
        const folders = autoScan.normalizeAutoScanFolders([
            'D:\\Media\\A',
            'D:/Media/A',
            '',
            'E:/More',
        ]);
        assert.deepStrictEqual(folders, ['D:\\Media\\A', 'E:/More']);
        const msg = autoScan.formatAutoScanLog({
            folderCount: 2,
            scanned: 5,
            added: 3,
            skippedHasSub: 1,
            skippedDup: 1,
            skippedMissingFolder: 0,
        });
        assert.match(msg, /加入 3/);
        assert.match(msg, /已有字幕跳过 1/);
        assert.match(msg, /列表已有跳过 1/);
    });

    it('scans only media without sidecar subtitles', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-autoscan-'));
        try {
            const withSub = path.join(root, 'a.mp4');
            const missing = path.join(root, 'b.mp4');
            const nestedDir = path.join(root, 'nested');
            fs.mkdirSync(nestedDir);
            const nested = path.join(nestedDir, 'c.mp4');
            fs.writeFileSync(withSub, 'x');
            fs.writeFileSync(missing, 'x');
            fs.writeFileSync(nested, 'x');
            fs.writeFileSync(path.join(root, 'a.srt'), '1\n');

            const scanVideosInDirectory = (dir, recursive) => {
                const out = [];
                const walk = (d) => {
                    for (const name of fs.readdirSync(d)) {
                        const full = path.join(d, name);
                        const st = fs.statSync(full);
                        if (st.isDirectory()) {
                            if (recursive) walk(full);
                        } else if (/\.mp4$/i.test(name)) out.push(full);
                    }
                };
                walk(dir);
                return out;
            };

            const rec = scanFoldersForMissingSubtitles({
                folders: [root],
                recursive: true,
                scanVideosInDirectory,
            });
            assert.strictEqual(rec.ok, true);
            assert.strictEqual(rec.scanned, 3);
            assert.strictEqual(rec.skippedHasSub, 1);
            assert.deepStrictEqual(rec.files.sort(), [missing, nested].sort());

            const flat = scanFoldersForMissingSubtitles({
                folders: [root],
                recursive: false,
                scanVideosInDirectory,
            });
            assert.strictEqual(flat.scanned, 2);
            assert.deepStrictEqual(flat.files, [missing]);

            assert.deepStrictEqual(normalizeFolderList([root, root]).length, 1);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
