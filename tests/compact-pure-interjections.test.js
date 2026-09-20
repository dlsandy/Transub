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

function writeSrtLongDur(filePath, cues) {
    const body = cues.map((c, i) => {
        const n = c.index != null ? c.index : i + 1;
        const start = c.startMs != null ? c.startMs : n * 2000;
        const end = c.endMs != null ? c.endMs : start + 2000;
        const fmt = (ms) => {
            const s = Math.floor(ms / 1000);
            const msPart = ms % 1000;
            return `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},${String(msPart).padStart(3, '0')}`;
        };
        return `${n}\n${fmt(start)} --> ${fmt(end)}\n${c.text}\n`;
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
            { index: 4, text: 'はぁ、はぁ' },
            { index: 5, text: 'ふふっ' },
        ]);
        writeSrt(zhPath, [
            { index: 1, text: '嗯' },
            { index: 2, text: '嗯，没问题吧？' },
            { index: 3, text: '哈啊' },
            { index: 4, text: '哈啊…哈啊' },
            { index: 5, text: '呵呵' },
        ]);

        const res = compactPureInterjectionSubtitlePair(zhPath, jaPath, { backupMode: 'off' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.dropped, 3);
        assert.strictEqual(res.afterCount, 2);

        const zhOut = fs.readFileSync(zhPath, 'utf8');
        const jaOut = fs.readFileSync(jaPath, 'utf8');
        assert.ok(zhOut.includes('嗯，没问题吧？'));
        assert.ok(!zhOut.includes('哈啊'));
        assert.ok(!zhOut.includes('呵呵'));
        assert.ok(jaOut.includes('うん、大丈夫？'));
        assert.ok(!jaOut.includes('はぁ'));
        assert.ok(!jaOut.includes('ふふっ'));
        // Renumbered; bridge filler 「嗯」 may remain when it links substantive neighbors
        assert.ok(/^1\n/m.test(zhOut));
        assert.ok(/^2\n/m.test(zhOut));
        assert.ok(!/^3\n/m.test(zhOut));
        assert.ok(zhOut.includes('嗯'));
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

    it('drops short acknowledgments like はい↔好的 and keeps semantic いい', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-compact-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [
            { index: 1, text: 'はい' },
            { index: 2, text: 'そう' },
            { index: 3, text: 'よし' },
            { index: 4, text: 'あっ…いい' },
            { index: 5, text: 'うん、大丈夫？' },
        ]);
        writeSrt(zhPath, [
            { index: 1, text: '好的' },
            { index: 2, text: '是啊' },
            { index: 3, text: '好' },
            { index: 4, text: '啊……' },
            { index: 5, text: '嗯，没问题吧？' },
        ]);

        const res = compactPureInterjectionSubtitlePair(zhPath, jaPath, { backupMode: 'off' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.dropped, 3);
        assert.strictEqual(res.afterCount, 2);

        const zhOut = fs.readFileSync(zhPath, 'utf8');
        const jaOut = fs.readFileSync(jaPath, 'utf8');
        assert.ok(zhOut.includes('啊……'));
        assert.ok(zhOut.includes('嗯，没问题吧？'));
        assert.ok(!zhOut.includes('好的'));
        assert.ok(!zhOut.includes('是啊'));
        assert.ok(jaOut.includes('あっ…いい'));
        assert.ok(jaOut.includes('うん、大丈夫？'));
        assert.ok(!jaOut.includes('はい'));
        assert.ok(!jaOut.includes('そう'));
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

describe('bilingual merged postprocess (viewing punct + filler clear)', () => {
    const { applySubtitlePostprocess } = require('../electron/extensions-bridge');

    it('clears punctuation and drops pure filler bilingual cues', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-bi-post-'));
        const biPath = path.join(dir, 'clip.srt');
        writeSrt(biPath, [
            { index: 1, text: '嗯\nうん' },
            { index: 2, text: '你好，世界。\nこんにちは。' },
            { index: 3, text: '哈啊\nはぁ' },
            { index: 4, text: '没问题吧？\n大丈夫？' },
        ]);
        const res = applySubtitlePostprocess(biPath, {
            viewingPunctMode: 'clear',
            dropBilingualDiscourse: true,
            dropBilingualOnomatopoeia: true,
            backupMode: 'off',
        });
        assert.strictEqual(res.ok, true);
        assert.ok(res.written);
        assert.ok(res.bilingualFillerDrop?.dropped >= 2, res.bilingualFillerDrop);
        const out = fs.readFileSync(biPath, 'utf8');
        assert.ok(!out.includes('嗯'));
        assert.ok(!out.includes('哈啊'));
        assert.ok(out.includes('你好 世界'));
        assert.ok(out.includes('没问题吧？'));
        assert.ok(out.includes('大丈夫？'));
        assert.ok(!out.includes('你好，世界'));
        assert.ok(!out.includes('こんにちは。'));
    });
});

describe('translation track removeNoise', () => {
    const { applySubtitlePostprocess } = require('../electron/extensions-bridge');

    it('keeps empty ZH slots when paired cleanup was skipped (blank retranslate)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-zh-empty-'));
        const zhPath = path.join(dir, 'clip.srt');
        writeSrt(zhPath, [
            { index: 1, text: '开头有译文' },
            { index: 2, text: '…' },
            { index: 3, text: '…' },
            { index: 4, text: '后面有译文' },
        ]);
        const res = applySubtitlePostprocess(zhPath, {
            removeNoise: true,
            removeHallucinations: true,
            backupMode: 'off',
        });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.afterCount, 4, 'must not delete blank MT slots on ZH track');
        const blocks = fs.readFileSync(zhPath, 'utf8').trim().split(/\n\n+/);
        assert.strictEqual(blocks.length, 4);
    });

    it('still removes empty cues on JA source tracks', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-ja-empty-'));
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [
            { index: 1, text: 'うん' },
            { index: 2, text: '' },
            { index: 3, text: '大丈夫？' },
        ]);
        const res = applySubtitlePostprocess(jaPath, {
            removeNoise: true,
            removeHallucinations: true,
            backupMode: 'off',
        });
        assert.strictEqual(res.ok, true);
        assert.ok(res.afterCount < 3, 'empty JA slots are noise');
    });
});
