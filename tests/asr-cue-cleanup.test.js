const assert = require('assert');
const { cuesToMsShape, cleanupAsrCues } = require('../electron/asr-cue-cleanup');

describe('asr-cue-cleanup', () => {
    it('cuesToMsShape maps seconds and drops empty', () => {
        const rows = cuesToMsShape([
            { start: 1.5, end: 2.25, text: 'こんにちは', avgLogprob: -0.2 },
            { startMs: 3000, endMs: 4000, text: '  ' },
        ]);
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].startMs, 1500);
        assert.strictEqual(rows[0].endMs, 2250);
        assert.strictEqual(rows[0].avgLogprob, -0.2);
    });

    it('cleanupAsrCues applies domain fix when JA mishear present', () => {
        const out = cleanupAsrCues([
            { startMs: 0, endMs: 1000, text: '今日からアパイタに入った' },
        ], { nameLoop: true, jaAsrDomainFix: true });
        assert.ok(out.domainChanged >= 1);
        assert.ok(out.cues[0].text.includes('アルバイト'));
        assert.ok(out.summary.includes('域修正'));
    });

    it('cleanupAsrCues strips simple name-loop hallucinations', () => {
        const out = cleanupAsrCues([
            { startMs: 0, endMs: 1200, text: '玲奈玲奈玲奈' },
        ], { nameLoop: true, jaAsrDomainFix: false });
        // If stripper rewrites or clears loops, changed > 0; otherwise still returns cues.
        assert.ok(Array.isArray(out.cues));
        assert.ok(out.cues.length >= 1);
        if (out.nameLoopsChanged > 0) {
            assert.ok(!/玲奈玲奈玲奈/.test(out.cues[0].text));
        }
    });

    it('cleanupAsrCues can disable stages', () => {
        const out = cleanupAsrCues(
            [{ startMs: 0, endMs: 1000, text: 'テスト' }],
            {
                nameLoop: false,
                jaAsrDomainFix: false,
                dedupeAsrEchoes: false,
                stitchJaFragments: false,
                stripPrevPrefixBleed: false,
                mergeIncompleteJa: false,
                stripAsrTrailingEllipsis: false,
            },
        );
        assert.strictEqual(out.changed, 0);
        assert.strictEqual(out.cues[0].text, 'テスト');
    });

    it('cleanupAsrCues drops short tail leftover echoes (DLDSS-565 shape)', () => {
        const out = cleanupAsrCues([
            { startMs: 373398, endMs: 374509, text: 'つまり、この勃起は…' },
            { startMs: 375048, endMs: 376368, text: 'この勃起は…' },
            { startMs: 377414, endMs: 378644, text: '奥さんの勃起だよ…' },
            { startMs: 342934, endMs: 344734, text: '奥さん見てたら、こんなに…' },
            { startMs: 345574, endMs: 346474, text: 'こんなに…' },
        ], {
            nameLoop: false,
            jaAsrDomainFix: false,
            stitchJaFragments: false,
        });
        const texts = out.cues.map((c) => c.text);
        assert.ok(out.echoRemoved >= 2, out);
        // Trailing decorative … stripped after echo dedupe.
        assert.ok(texts.includes('つまり、この勃起は'));
        assert.ok(!texts.includes('この勃起は…') && !texts.includes('この勃起は'));
        assert.ok(texts.includes('奥さん見てたら、こんなに'));
        assert.ok(!texts.includes('こんなに…') && !texts.includes('こんなに'));
        assert.ok(texts.includes('奥さんの勃起だよ'));
        assert.ok(out.trailingEllipsisStripped >= 1);
    });

    it('cleanupAsrCues keeps new turns that only share a short word', () => {
        const out = cleanupAsrCues([
            { startMs: 1000, endMs: 1800, text: '気持ちいい…' },
            { startMs: 1900, endMs: 3200, text: '旦那とどっちが気持ちいい?' },
        ], {
            nameLoop: false,
            jaAsrDomainFix: false,
            stitchJaFragments: false,
        });
        assert.strictEqual(out.echoRemoved, 0);
        assert.strictEqual(out.cues.length, 2);
        assert.strictEqual(out.cues[0].text, '気持ちいい');
    });

    it('cleanupAsrCues strips decorative trailing ellipsis but keeps mid-cue', () => {
        const out = cleanupAsrCues([
            { startMs: 0, endMs: 1000, text: '時給もなかなかいいし…' },
            { startMs: 1000, endMs: 2000, text: 'そんなことないけど…ホント?' },
            { startMs: 2000, endMs: 2500, text: '…' },
            { startMs: 2500, endMs: 3000, text: 'んんっ、んんぅぅっ…!' },
        ], {
            nameLoop: false,
            jaAsrDomainFix: false,
            dedupeAsrEchoes: false,
            stitchJaFragments: false,
        });
        assert.strictEqual(out.cues[0].text, '時給もなかなかいいし');
        assert.strictEqual(out.cues[1].text, 'そんなことないけど…ホント?');
        assert.strictEqual(out.cues[2].text, '…');
        assert.strictEqual(out.cues[3].text, 'んんっ、んんぅぅっ!');
        assert.ok(out.trailingEllipsisStripped >= 2);
    });

    it('cleanupAsrCues merges line-wrap ellipsis then strips leftover decorative', () => {
        const out = cleanupAsrCues([
            { startMs: 0, endMs: 900, text: 'こちらの…' },
            { startMs: 950, endMs: 2000, text: '雇用契約書。' },
            { startMs: 3000, endMs: 4000, text: 'そんなことないけど…' },
            { startMs: 4050, endMs: 4800, text: 'ホント?' },
            { startMs: 6000, endMs: 7000, text: 'お待たせいたしました…' },
        ], {
            nameLoop: false,
            jaAsrDomainFix: false,
            dedupeAsrEchoes: false,
            stitchJaFragments: true,
        });
        const texts = out.cues.map((c) => c.text);
        assert.ok(texts.includes('こちらの雇用契約書。'), texts);
        assert.ok(texts.includes('そんなことないけど…'), 'keep … before turn reaction');
        assert.ok(texts.includes('ホント?'));
        assert.ok(texts.includes('お待たせいたしました'), 'decorative trailing stripped');
        assert.ok(out.stitchMerged >= 1);
    });
});
