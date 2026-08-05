const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { compactPureInterjectionSubtitlePair } = require('../electron/extensions-bridge');

function writeSrt(filePath, cues) {
    const body = cues.map((c, i) => {
        const n = c.index != null ? c.index : i + 1;
        const sec = String(n).padStart(2, '0');
        return `${n}\n00:00:${sec},000 --> 00:00:${sec},500\n${c.text}\n`;
    }).join('\n');
    fs.writeFileSync(filePath, body, 'utf8');
}

describe('compactPureInterjectionSubtitlePair', () => {
    it('drops paired pure fillers and renumbers both tracks', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-compact-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [
            { index: 1, text: 'うん' },
            { index: 2, text: 'うん、大丈夫？' },
            { index: 3, text: 'はぁ' },
        ]);
        writeSrt(zhPath, [
            { index: 1, text: '嗯' },
            { index: 2, text: '嗯，没问题吧？' },
            { index: 3, text: '哈啊' },
        ]);

        const res = compactPureInterjectionSubtitlePair(zhPath, jaPath, { backupMode: 'off' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.dropped, 2);
        assert.strictEqual(res.afterCount, 1);

        const zhOut = fs.readFileSync(zhPath, 'utf8');
        const jaOut = fs.readFileSync(jaPath, 'utf8');
        assert.ok(zhOut.includes('嗯，没问题吧？'));
        assert.ok(!zhOut.includes('哈啊'));
        assert.ok(jaOut.includes('うん、大丈夫？'));
        assert.ok(!jaOut.includes('はぁ'));
        // Renumbered to a single cue index 1
        assert.ok(/^1\n/m.test(zhOut));
        assert.ok(!/^2\n/m.test(zhOut));
        assert.ok(!/^3\n/m.test(zhOut));
        // Bare filler 「嗯」 cue removed; only the meaningful line remains
        assert.strictEqual((zhOut.match(/没问题吧/g) || []).length, 1);
    });

    it('keeps meaningful lines with trailing particles', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-compact-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [{ index: 1, text: '気持ちいいよ' }]);
        writeSrt(zhPath, [{ index: 1, text: '好舒服啊' }]);
        const res = compactPureInterjectionSubtitlePair(zhPath, jaPath, { backupMode: 'off' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.dropped, 0);
        assert.ok(fs.readFileSync(zhPath, 'utf8').includes('好舒服啊'));
    });

    it('skips when source missing', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-compact-'));
        const zhPath = path.join(dir, 'only.zh.srt');
        writeSrt(zhPath, [{ index: 1, text: '嗯' }]);
        const res = compactPureInterjectionSubtitlePair(zhPath, '', { backupMode: 'off' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.skipped, true);
        assert.ok(fs.readFileSync(zhPath, 'utf8').includes('嗯'));
    });
});
