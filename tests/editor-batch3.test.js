const assert = require('assert');
const meta = require('../src/js/subtitle-meta-core');
const findCore = require('../src/js/find-replace-core');
const { serializeAss } = require('../electron/subtitle-format');
let parseIssues;
try {
    ({ parseIssues } = require('../electron/advanced-bilingual-semantic'));
} catch (_) {
    // Public checkout without proprietary bilingual-semantic module
}
const { seedAsrConfidenceMeta, pickEngineCuesForConfidence } = require('../electron/asr-confidence-seed');
const entitlement = require('../src/js/advanced-entitlement-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('confidenceFromAsrMeta', () => {
    it('maps avgLogprob into [0,1]', () => {
        const high = meta.confidenceFromAsrMeta({ avgLogprob: -0.15, noSpeechProb: 0.1 });
        const low = meta.confidenceFromAsrMeta({ avgLogprob: -0.9, noSpeechProb: 0.7 });
        assert.ok(high.confidence > 0.7);
        assert.ok(high.source === 'asr' || high.source === 'asr_logprob');
        assert.ok(low.confidence < 0.4);
        assert.ok(low.low);
        assert.ok(low.flags.includes('low_logprob'));
    });

    it('builds sidecar entries from engine cues', () => {
        const doc = meta.buildAsrSidecarFromEngineCues([
            { start: 0, end: 1.2, text: 'hello', avgLogprob: -0.2, noSpeechProb: 0.05 },
            { start: 1.2, end: 2.0, text: 'world', avg_logprob: -0.8, no_speech_prob: 0.6 },
        ]);
        assert.strictEqual(doc.entries.length, 2);
        assert.ok(doc.entries[0].confidence > doc.entries[1].confidence);
        assert.ok(doc.entries[0].source === 'asr' || doc.entries[0].source === 'asr_logprob');
    });
});

describe('asr-confidence-seed', () => {
    it('picks engine cue lists and writes sidecar', () => {
        const cues = pickEngineCuesForConfidence({
            cues: { source: [{ start: 0, end: 1, text: 'a', avgLogprob: -0.3 }] },
        });
        assert.strictEqual(cues.length, 1);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-asr-'));
        const subPath = path.join(dir, 'sample.srt');
        fs.writeFileSync(subPath, '1\n00:00:00,000 --> 00:00:01,000\na\n');
        const seeded = seedAsrConfidenceMeta(subPath, cues);
        assert.ok(seeded.ok);
        assert.ok(seeded.entryCount >= 1);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('serializeAss', () => {
    it('emits Default style and empty Name without speakers', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: '你好' },
            { startMs: 1200, endMs: 2200, text: '世界' },
        ];
        const ass = serializeAss(cues, { title: 'Test' });
        assert.ok(ass.includes('Style: Default,'));
        assert.ok(!ass.includes('Style: Sp1'));
        assert.ok(ass.includes('Dialogue:'));
        assert.ok(ass.includes(',Default,,0,0,0,,你好'));
    });

    it('uses cue.ass.style and cue.ass.name when present', () => {
        const cues = [
            {
                startMs: 0,
                endMs: 1000,
                text: '你好',
                ass: { style: 'Lead', name: '甲' },
            },
        ];
        const ass = serializeAss(cues, { title: 'Map' });
        assert.ok(ass.includes(',Lead,甲,'));
    });

    it('stacks bilingual Source style at bottom (not screen top)', () => {
        const cues = [{ startMs: 0, endMs: 1000, text: '译文' }];
        const ass = serializeAss(cues, {
            title: 'Dual',
            pairCues: [{ startMs: 0, endMs: 1000, text: 'source' }],
            lineOrder: 'source-first',
        });
        const sourceStyle = ass.split('\n').find((line) => line.startsWith('Style: Source,'));
        assert.ok(sourceStyle, 'expected Style: Source');
        // Fields: ... Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
        const parts = sourceStyle.split(',');
        assert.strictEqual(parts[18], '2', 'Alignment should be bottom-center like SRT');
        assert.ok(Number(parts[21]) > 56, 'Source MarginV should sit above ZH');
        assert.ok(!/,8,40,40,40,1$/.test(sourceStyle), 'must not use top-center Alignment 8');
    });

    it('places Source below ZH for target-first line order (default)', () => {
        const cues = [{ startMs: 0, endMs: 1000, text: '译文' }];
        const ass = serializeAss(cues, {
            title: 'Dual',
            pairCues: [{ startMs: 0, endMs: 1000, text: 'source' }],
        });
        const sourceStyle = ass.split('\n').find((line) => line.startsWith('Style: Source,'));
        assert.ok(sourceStyle, 'expected Style: Source');
        const parts = sourceStyle.split(',');
        assert.strictEqual(parts[18], '2', 'Alignment should be bottom-center');
        assert.strictEqual(Number(parts[21]), 56, 'Source MarginV should sit below ZH when 译文在上');
    });
});

describe('serializeDualAss', () => {
    const { serializeDualAss } = require('../electron/subtitle-format');

    it('emits Source+ZH dialogues with stacked margins', () => {
        const primary = [{ startMs: 0, endMs: 1000, text: '你好' }];
        const pair = [{ startMs: 0, endMs: 1000, text: 'hello' }];
        const ass = serializeDualAss(primary, pair, {
            title: 'DualDoc',
            primaryRole: 'target',
            lineOrder: 'target-first',
        });
        assert.ok(ass.includes('Style: Source,'));
        assert.ok(ass.includes('Style: ZH,'));
        assert.ok(ass.includes(',Source,,'));
        assert.ok(ass.includes(',ZH,,'));
        assert.ok(ass.includes('hello'));
        assert.ok(ass.includes('你好'));
        const sourceStyle = ass.split('\n').find((line) => line.startsWith('Style: Source,'));
        const zhStyle = ass.split('\n').find((line) => line.startsWith('Style: ZH,'));
        assert.strictEqual(Number(sourceStyle.split(',')[21]), 56);
        assert.strictEqual(Number(zhStyle.split(',')[21]), 112);
    });
});

describe('bilingual semantic parse', () => {
    before(function () {
        if (typeof parseIssues !== 'function') this.skip();
    });

    it('parses fenced JSON issues', () => {
        const issues = parseIssues('```json\n{"issues":[{"index":2,"type":"omission","message":"漏译姓名","severity":"warn"}]}\n```');
        assert.strictEqual(issues.length, 1);
        assert.strictEqual(issues[0].index, 2);
        assert.strictEqual(issues[0].type, 'omission');
    });
});

describe('find-replace-core', () => {
    it('collects case-insensitive matches', () => {
        const matches = findCore.collectFindMatches(
            [{ text: 'Hello World' }, { text: 'hello again' }],
            'hello',
            false,
        );
        assert.strictEqual(matches.length, 2);
        assert.strictEqual(matches[0].cueIdx, 0);
        assert.strictEqual(matches[0].start, 0);
        assert.ok(findCore.shouldOffloadFind(250));
        assert.ok(!findCore.shouldOffloadFind(10));
    });
});

describe('entitlement features', () => {
    it('exports bilingual and ass feature ids', () => {
        assert.strictEqual(entitlement.FEATURE_BILINGUAL_SEMANTIC_REVIEW, 'bilingualSemanticReview');
        assert.strictEqual(entitlement.FEATURE_ASS_STYLE_EXPORT, 'assStyleExport');
        assert.ok(entitlement.hasFeature(['*'], entitlement.FEATURE_ASS_STYLE_EXPORT));
    });
});
