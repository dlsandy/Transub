const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { removeNoiseFromSubtitlePair } = require('../electron/extensions-bridge');

function writeSrt(filePath, cues) {
    const body = cues.map((c, i) => {
        const n = c.index != null ? c.index : i + 1;
        const sec = String(Math.min(59, n)).padStart(2, '0');
        return `${n}\n00:00:${sec},000 --> 00:00:${sec},500\n${c.text}\n`;
    }).join('\n');
    fs.writeFileSync(filePath, body, 'utf8');
}

describe('removeNoiseFromSubtitlePair', () => {
    it('deletes aligned noise from both tracks (no … blank)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-noise-pair-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [
            { index: 1, text: 'うん' },
            { index: 2, text: '大丈夫？' },
            { index: 3, text: '完毕' },
        ]);
        writeSrt(zhPath, [
            { index: 1, text: '嗯' },
            { index: 2, text: '没问题吧？' },
            { index: 3, text: '好的' },
        ]);

        const res = removeNoiseFromSubtitlePair(zhPath, jaPath, {
            backupMode: 'off',
            removeHallucinations: true,
            removeDuplicates: false,
        });
        assert.strictEqual(res.ok, true);
        assert.ok(res.removed >= 1);

        const zhOut = fs.readFileSync(zhPath, 'utf8');
        const jaOut = fs.readFileSync(jaPath, 'utf8');
        assert.ok(zhOut.includes('没问题吧？'));
        assert.ok(!zhOut.includes('…'));
        // cue counts stay matched after renumber
        const zhCueCount = (zhOut.match(/^\d+\n/gm) || []).length;
        const jaCueCount = (jaOut.match(/^\d+\n/gm) || []).length;
        assert.strictEqual(zhCueCount, jaCueCount);
        assert.ok(!jaOut.includes('完毕'));
    });
});
