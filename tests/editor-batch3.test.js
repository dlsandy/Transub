const assert = require('assert');
const meta = require('../src/js/subtitle-meta-core');
const findCore = require('../src/js/find-replace-core');
const speakerSuggest = require('../src/js/speaker-suggest-core');
const { serializeAss } = require('../electron/subtitle-format');
const { parseIssues } = require('../electron/advanced-bilingual-semantic');
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
        assert.strictEqual(high.source, 'asr');
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
        assert.strictEqual(doc.entries[0].source, 'asr');
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
    it('emits speaker styles and dialogue names', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: '你好' },
            { startMs: 1200, endMs: 2200, text: '世界' },
        ];
        const speakers = [
            { id: 'spk_1', name: '甲', color: '#ff0000' },
            { id: 'spk_2', name: '乙', color: '#00ff00' },
        ];
        const cueMarkers = {
            '0:0': { speakerId: 'spk_1' },
            '1:1200': { speakerId: 'spk_2' },
        };
        const ass = serializeAss(cues, { title: 'Test', speakers, cueMarkers });
        assert.ok(ass.includes('Style: Sp1'));
        assert.ok(ass.includes('Style: Sp2'));
        assert.ok(ass.includes(',甲,'));
        assert.ok(ass.includes(',乙,'));
        assert.ok(ass.includes('Dialogue:'));
    });

    it('stacks bilingual Source style at bottom (not screen top)', () => {
        const cues = [{ startMs: 0, endMs: 1000, text: '译文' }];
        const ass = serializeAss(cues, {
            title: 'Dual',
            pairCues: [{ startMs: 0, endMs: 1000, text: 'source' }],
        });
        const sourceStyle = ass.split('\n').find((line) => line.startsWith('Style: Source,'));
        assert.ok(sourceStyle, 'expected Style: Source');
        // Fields: ... Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
        const parts = sourceStyle.split(',');
        assert.strictEqual(parts[18], '2', 'Alignment should be bottom-center like SRT');
        assert.ok(Number(parts[21]) > 56, 'Source MarginV should sit above ZH');
        assert.ok(!/,8,40,40,40,1$/.test(sourceStyle), 'must not use top-center Alignment 8');
    });
});

describe('bilingual semantic parse', () => {
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

describe('speaker-suggest-core', () => {
    it('switches speaker after long gap', () => {
        const cues = [
            { startMs: 0, endMs: 800, text: 'a' },
            { startMs: 900, endMs: 1600, text: 'b' },
            { startMs: 4000, endMs: 4800, text: 'c' },
        ];
        const res = speakerSuggest.suggestAlternatingSpeakers(cues, { switchGapMs: 1400 });
        assert.strictEqual(res.speakers.length, 2);
        assert.strictEqual(res.cueMarkers['0:0'].speakerId, res.speakers[0].id);
        assert.strictEqual(res.cueMarkers['1:900'].speakerId, res.speakers[0].id);
        assert.strictEqual(res.cueMarkers['2:4000'].speakerId, res.speakers[1].id);
    });
});

describe('entitlement features', () => {
    it('exports bilingual and ass feature ids', () => {
        assert.strictEqual(entitlement.FEATURE_BILINGUAL_SEMANTIC_REVIEW, 'bilingualSemanticReview');
        assert.strictEqual(entitlement.FEATURE_ASS_STYLE_EXPORT, 'assStyleExport');
        assert.ok(entitlement.hasFeature(['*'], entitlement.FEATURE_ASS_STYLE_EXPORT));
    });
});
