const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizeMtSubtitlePair } = require('../electron/extensions-bridge');

function writeSrt(filePath, cues) {
    const body = cues.map((c, i) => {
        const n = c.index != null ? c.index : i + 1;
        return `${n}\n00:00:${String(n).padStart(2, '0')},000 --> 00:00:${String(n).padStart(2, '0')},500\n${c.text}\n`;
    }).join('\n');
    fs.writeFileSync(filePath, body, 'utf8');
}

describe('sanitizeMtSubtitlePair', () => {
    it('strips trailing hallucinated names on disk ZH vs JA', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-mt-san-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [
            { index: 1, text: 'どこが動かないんですか?' },
            { index: 2, text: 'かしこまりました、お願いします。' },
        ]);
        writeSrt(zhPath, [
            { index: 1, text: '哪里动了？ 佳奈' },
            { index: 2, text: '我明白了，那就麻烦您了。 真理' },
        ]);

        const res = sanitizeMtSubtitlePair(zhPath, jaPath, { backupMode: 'off' });
        assert.strictEqual(res.ok, true);
        assert.ok(res.changed >= 2);

        const out = fs.readFileSync(zhPath, 'utf8');
        assert.ok(!out.includes('佳奈'));
        assert.ok(!out.includes('真理'));
        assert.ok(out.includes('哪里动了？'));
        assert.ok(out.includes('我明白了'));
    });

    it('skips when source missing', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-mt-san-'));
        const zhPath = path.join(dir, 'only.zh.srt');
        writeSrt(zhPath, [{ index: 1, text: '哪里动了？ 佳奈' }]);
        const res = sanitizeMtSubtitlePair(zhPath, '', { backupMode: 'off' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.skipped, true);
        assert.ok(fs.readFileSync(zhPath, 'utf8').includes('佳奈'));
    });

    it('uses sourceCues fallback when file gone', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-mt-san-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        writeSrt(zhPath, [{ index: 1, text: '哪里动了？ 佳奈' }]);
        const res = sanitizeMtSubtitlePair(zhPath, '', {
            backupMode: 'off',
            sourceCues: [{ index: 1, text: 'どこが動かないんですか?' }],
        });
        assert.strictEqual(res.ok, true);
        assert.ok(res.changed >= 1);
        assert.ok(!fs.readFileSync(zhPath, 'utf8').includes('佳奈'));
    });
});
