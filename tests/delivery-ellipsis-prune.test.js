const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { removeEllipsisOnlyDeliveryPair } = require('../electron/extensions-bridge');

function writeSrt(filePath, cues) {
    const body = cues.map((c, i) => {
        const n = c.index != null ? c.index : i + 1;
        const sec = String(Math.min(59, n)).padStart(2, '0');
        return `${n}\n00:00:${sec},000 --> 00:00:${sec},500\n${c.text}\n`;
    }).join('\n');
    fs.writeFileSync(filePath, body, 'utf8');
}

function countCues(text) {
    return (text.match(/^\d+\r?\n\d{2}:\d{2}:\d{2},\d{3}/gm) || []).length;
}

describe('removeEllipsisOnlyDeliveryPair', () => {
    it('deletes ZH cues that are only ellipsis and paired JA rows', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-ellipsis-prune-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [
            { index: 1, text: 'こんにちは' },
            { index: 2, text: 'あんっ…はぁ' },
            { index: 3, text: 'さよなら' },
        ]);
        writeSrt(zhPath, [
            { index: 1, text: '你好' },
            { index: 2, text: '…' },
            { index: 3, text: '再见' },
        ]);

        const res = removeEllipsisOnlyDeliveryPair(zhPath, jaPath, { backupMode: 'off' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.dropped, 1);
        assert.strictEqual(res.afterCount, 2);

        const zhOut = fs.readFileSync(zhPath, 'utf8');
        const jaOut = fs.readFileSync(jaPath, 'utf8');
        assert.ok(zhOut.includes('你好'));
        assert.ok(zhOut.includes('再见'));
        assert.ok(!/^\d+\r?\n[\s\S]*?\n…\s*$/m.test(zhOut));
        assert.ok(jaOut.includes('こんにちは'));
        assert.ok(jaOut.includes('さよなら'));
        assert.ok(!jaOut.includes('あんっ'));
        assert.strictEqual(countCues(zhOut), countCues(jaOut));
    });

    it('fills self-intro と申します instead of pair-deleting (IESP-763)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-ellipsis-kanae-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [
            { index: 1, text: '失礼いたします' },
            { index: 2, text: '加奈と申します。' },
            { index: 3, text: '本日はよろしくお願いとします' },
        ]);
        writeSrt(zhPath, [
            { index: 1, text: '打扰了' },
            { index: 2, text: '…' },
            { index: 3, text: '今天还请多多指教' },
        ]);
        const res = removeEllipsisOnlyDeliveryPair(zhPath, jaPath, { backupMode: 'off' });
        assert.strictEqual(res.ok, true, res.error || res.reason);
        const zhOut = fs.readFileSync(zhPath, 'utf8');
        const jaOut = fs.readFileSync(jaPath, 'utf8');
        assert.ok(jaOut.includes('加奈と申します'), 'must not delete substantive JA self-intro');
        assert.ok(
            zhOut.includes('我叫加奈') || zhOut.includes('加奈'),
            `expected intro fill, got: ${zhOut}`,
        );
        assert.ok(!/(^|\n)…(\r?\n|$)/.test(zhOut.replace(/\r/g, '')), 'intro should not stay bare …');
        assert.strictEqual(countCues(zhOut), countCues(jaOut));
        assert.ok(Number(res.detFilled) >= 1 || zhOut.includes('我叫加奈'), JSON.stringify(res));
    });

    it('keeps substantive unrecovered lexical JA rather than pair-deleting', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-ellipsis-keep-lex-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [
            { index: 1, text: 'こんにちは' },
            { index: 2, text: 'ちゃんと洗えてますか?' },
            { index: 3, text: 'さよなら' },
        ]);
        writeSrt(zhPath, [
            { index: 1, text: '你好' },
            { index: 2, text: '…' },
            { index: 3, text: '再见' },
        ]);
        const res = removeEllipsisOnlyDeliveryPair(zhPath, jaPath, { backupMode: 'off' });
        assert.strictEqual(res.ok, true, res.error || res.reason);
        const jaOut = fs.readFileSync(jaPath, 'utf8');
        assert.ok(jaOut.includes('ちゃんと洗えてますか'), 'must keep lexical JA when ZH unrecovered');
        assert.strictEqual(countCues(fs.readFileSync(zhPath, 'utf8')), countCues(jaOut));
    });

    it('does not treat colloquial hiragana dialogue as ASR garbage', () => {
        const lex = require('../src/js/mt-sanitize-lexicon');
        const opaque = require('../src/js/mt-opaque-strings');
        assert.ok(!lex.isAsrGarbageJa('まだいいってゆってないんだから'));
        assert.ok(!lex.isAsrGarbageJa('おっきくなってきちゃった'));
        assert.ok(!lex.looksLikeUnusableAsrJa('まだいいってゆってないんだから'));
        assert.ok(!lex.looksLikeUnusableAsrJa('おっきくなってきちゃった'));
        assert.ok(!lex.isAsrGarbageJa('ほんならそれとびっくりするかな…'));
        assert.ok(!lex.isAsrGarbageJa('どんなことされちゃいたい?'));
        assert.ok(!lex.looksLikeUnusableAsrJa('ほんならそれとびっくりするかな…'));
        assert.ok(!lex.looksLikeUnusableAsrJa('どんなことされちゃいたい?'));
        // Soft-AV body/texture hiragana (IPZZ-996) — not Whisper mash
        assert.ok(!lex.isAsrGarbageJa(opaque.FIX.softOppaiYarakuteJa));
        assert.ok(!lex.looksLikeUnusableAsrJa(opaque.FIX.softOppaiYarakuteJa));
    });

    it('deletes ... and …… placeholder forms', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-ellipsis-prune-'));
        const zhPath = path.join(dir, 'only.zh.srt');
        writeSrt(zhPath, [
            { index: 1, text: '...' },
            { index: 2, text: '……' },
            { index: 3, text: '保留' },
        ]);

        const res = removeEllipsisOnlyDeliveryPair(zhPath, '', { backupMode: 'off' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.dropped, 2);
        const zhOut = fs.readFileSync(zhPath, 'utf8');
        assert.ok(zhOut.includes('保留'));
        assert.strictEqual(countCues(zhOut), 1);
    });

    it('time-prunes moan ellipsis on unpaired tracks without inventing JA slots', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-ellipsis-unpaired-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        const bodyJa = [
            '1\n00:00:01,000 --> 00:00:01,500\nこんにちは\n',
            '2\n00:00:02,000 --> 00:00:02,500\nはぁ はぁ\n',
            '3\n00:00:03,000 --> 00:00:03,500\nさよなら\n',
            '4\n00:00:04,000 --> 00:00:04,500\nありがとう\n',
        ].join('\n');
        const bodyZh = [
            '1\n00:00:01,000 --> 00:00:01,500\n你好\n',
            '2\n00:00:02,000 --> 00:00:02,500\n…\n',
            '3\n00:00:03,000 --> 00:00:03,500\n再见\n',
        ].join('\n');
        fs.writeFileSync(jaPath, bodyJa, 'utf8');
        fs.writeFileSync(zhPath, bodyZh, 'utf8');
        const res = removeEllipsisOnlyDeliveryPair(zhPath, jaPath, { backupMode: 'off' });
        assert.strictEqual(res.ok, true, res.error || res.reason);
        assert.ok(res.unpairedTimePrune || res.dropped >= 1, JSON.stringify(res));
        assert.strictEqual(res.dropped, 1);
        const zhOut = fs.readFileSync(zhPath, 'utf8');
        assert.ok(zhOut.includes('你好'));
        assert.ok(zhOut.includes('再见'));
        assert.ok(!zhOut.includes('…'));
        // JA unchanged when unpaired (no invent / no paired delete)
        assert.ok(fs.readFileSync(jaPath, 'utf8').includes('はぁ'));
        assert.strictEqual(countCues(zhOut), 2);
    });

    it('last-chance fills lexical JA blanks when possible — never pair-deletes substantive JA', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-ellipsis-keep-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [
            { index: 1, text: 'こんにちは' },
            { index: 2, text: '明日は学校に行きます' },
            { index: 3, text: 'じゃあね' },
        ]);
        writeSrt(zhPath, [
            { index: 1, text: '你好' },
            { index: 2, text: '……' },
            { index: 3, text: '再见' },
        ]);
        const res = removeEllipsisOnlyDeliveryPair(zhPath, jaPath, { backupMode: 'off' });
        assert.strictEqual(res.ok, true);
        const zhOut = fs.readFileSync(zhPath, 'utf8');
        const jaOut = fs.readFileSync(jaPath, 'utf8');
        assert.ok(zhOut.includes('你好'));
        assert.ok(zhOut.includes('再见'));
        assert.ok(jaOut.includes('明日は学校に行きます'), 'substantive JA must survive');
        assert.ok(
            Number(res.detFilled) >= 1
            || Number(res.keptLexicalBlank) >= 1
            || Number(res.dropped) >= 1
            || res.skipped,
            JSON.stringify(res),
        );
        assert.strictEqual(countCues(zhOut), countCues(jaOut));
    });

    it('hard-drops pure ん breath that was wrongly filled as 嗯', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-ellipsis-nn-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [
            { index: 1, text: 'こんにちは' },
            { index: 2, text: 'ん、んん…' },
            { index: 3, text: 'んん…んん' },
            { index: 4, text: 'さよなら' },
        ]);
        writeSrt(zhPath, [
            { index: 1, text: '你好' },
            { index: 2, text: '嗯' },
            { index: 3, text: '嗯' },
            { index: 4, text: '再见' },
        ]);
        const res = removeEllipsisOnlyDeliveryPair(zhPath, jaPath, {
            backupMode: 'off',
            postBatchRemoveNoise: true,
        });
        assert.strictEqual(res.ok, true, res.error || res.reason);
        assert.ok(Number(res.dropped) >= 2, `expected ん→嗯 drops, got ${JSON.stringify(res)}`);
        const zhOut = fs.readFileSync(zhPath, 'utf8');
        assert.ok(zhOut.includes('你好'));
        assert.ok(zhOut.includes('再见'));
        assert.ok(!/(^|\n)嗯(\r?\n|$)/.test(zhOut.replace(/\r/g, '')), zhOut);
    });

    it('hard-drops ASR debris / moan ellipsis even when isSubstantiveJa is loose', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-ellipsis-debris-'));
        const zhPath = path.join(dir, 'clip.zh.srt');
        const jaPath = path.join(dir, 'clip.src.srt');
        writeSrt(jaPath, [
            { index: 1, text: 'こんにちは' },
            { index: 2, text: 'アザブイコ?' },
            { index: 3, text: 'んっ…きゅんっ' },
            { index: 4, text: 'お高い女だよ。' },
            { index: 5, text: 'さよなら' },
        ]);
        writeSrt(zhPath, [
            { index: 1, text: '你好' },
            { index: 2, text: '…' },
            { index: 3, text: '…' },
            { index: 4, text: '…' },
            { index: 5, text: '再见' },
        ]);
        const res = removeEllipsisOnlyDeliveryPair(zhPath, jaPath, {
            backupMode: 'off',
            postBatchRemoveNoise: true,
        });
        assert.strictEqual(res.ok, true, res.error || res.reason);
        assert.ok(Number(res.dropped) >= 2, `expected debris/moan drops, got ${JSON.stringify(res)}`);
        const zhOut = fs.readFileSync(zhPath, 'utf8');
        assert.ok(zhOut.includes('你好'));
        assert.ok(zhOut.includes('再见'));
        assert.ok(!zhOut.includes('アザブイコ'));
        // Lexical お高い女 should fill, not remain bare …
        assert.ok(
            zhOut.includes('很高傲') || zhOut.includes('高傲') || Number(res.detFilled) >= 1,
            `expected det-fill for お高い女, got ${zhOut}`,
        );
        assert.ok(!/(^|\n)…(\r?\n|$)/.test(zhOut.replace(/\r/g, '')) || Number(res.keptLexicalBlank) === 0);
    });
});
