/**
 * End-to-end desktop smoke for SenseVoice rich tags + GalTransl glossary workflow.
 * Fixture-driven (no live ASR / GPU). Covers parse → sidecar → badge → emotion hint →
 * sdh side notes → hit-only inject → conditional postReplace → GenDict drafts.
 */
const assert = require('assert');
const {
    parseSensevoiceRich,
    buildRichFlags,
    applyAudioEventSideNotes,
    formatRichTagsBadge,
    attachRichFromSidecarEntries,
} = require('../src/js/sensevoice-rich-tags-core');
const { buildAsrSidecarFromEngineCues, mergeConfidenceAnnotations } = require('../src/js/subtitle-meta-core');
const {
    buildEmotionMtStyleBlock,
    appendEmotionHintToUserContent,
} = require('../src/js/sensevoice-emotion-mt-style-core');
const {
    normalizeEntry,
    selectGlossaryTermsForBatch,
    applyConditionalPostReplace,
} = require('../src/js/subtitle-glossary-core');
const { proposeGlossaryDraftsFromCues, applyGlossaryDrafts } = require('../src/js/glossary-gendict-core');
const sakura = require('../src/js/sakura-translate-core');

describe('sensevoice + glossary workflow smoke (fixture E2E)', () => {
    const engineCues = [
        {
            start: 1,
            end: 2.2,
            text: parseSensevoiceRich('<|ja|><|HAPPY|><|Laughter|><|withitn|>笑ってるよ香水さん').text,
            emotion: 'HAPPY',
            audioEvent: 'LAUGHTER',
            senseLang: 'ja',
            confidence: 0.92,
        },
        {
            start: 3,
            end: 4.5,
            text: '香水さん、待って',
            emotion: 'ANGRY',
            audioEvent: 'SPEECH',
            senseLang: 'ja',
            confidence: 0.88,
        },
        {
            start: 5,
            end: 6.5,
            text: '香水さんありがとう',
            emotion: 'NEUTRAL',
            audioEvent: 'SPEECH',
            senseLang: 'ja',
            confidence: 0.9,
        },
    ];

    it('sidecar + badge + meta round-trip', () => {
        const rich = parseSensevoiceRich('<|ja|><|HAPPY|><|Laughter|><|withitn|>笑ってるよ');
        assert.ok(buildRichFlags(rich).includes('sv_laughter'));
        const doc = buildAsrSidecarFromEngineCues(engineCues, {
            sensevoiceRichTags: 'sidecar',
            allowHeuristic: true,
        });
        assert.strictEqual(doc.entries[0].emotion, 'HAPPY');
        assert.strictEqual(doc.entries[0].audioEvent, 'LAUGHTER');
        const cuesMs = engineCues.map((c, i) => ({
            index: i,
            startMs: Math.round(c.start * 1000),
            endMs: Math.round(c.end * 1000),
            text: c.text,
        }));
        const withRich = attachRichFromSidecarEntries(cuesMs, doc.entries, {
            sensevoiceRichTags: 'sidecar',
        });
        assert.strictEqual(withRich[0].emotion, 'HAPPY');
        const meta = mergeConfidenceAnnotations(withRich, doc, {});
        assert.strictEqual(meta[0].emotion, 'HAPPY');
        const badge = formatRichTagsBadge(withRich[0], meta[0]);
        assert.ok(badge.html.includes('开心'));
        assert.ok(badge.html.includes('笑声'));
    });

    it('sdh side notes are idempotent', () => {
        const cues = [
            { text: 'あはは', audioEvent: 'LAUGHTER' },
            { text: '普通', audioEvent: 'SPEECH' },
        ];
        const once = applyAudioEventSideNotes(cues, { sensevoiceRichTags: 'sdh' });
        assert.strictEqual(once.changed, 1);
        assert.ok(once.cues[0].text.startsWith('[笑声]'));
        const twice = applyAudioEventSideNotes(once.cues, { sensevoiceRichTags: 'sdh' });
        assert.strictEqual(twice.changed, 0);
    });

    it('emotion hint off vs hint; sakura preserves emotion on cues', () => {
        const list = [
            { index: 0, text: '待って', emotion: 'ANGRY' },
        ];
        const off = buildEmotionMtStyleBlock(list, {
            sensevoiceEmotionMtStyle: 'off',
            sensevoiceRichTags: 'sidecar',
        });
        assert.strictEqual(off, '');
        const on = appendEmotionHintToUserContent('本体', list, {
            sensevoiceEmotionMtStyle: 'hint',
            sensevoiceRichTags: 'sidecar',
        });
        assert.ok(on.includes('急促'));
        const msgs = sakura.buildGalTranslChatMessages(list, {
            sensevoiceEmotionMtStyle: 'hint',
            sensevoiceRichTags: 'sidecar',
            glossaryTerms: [],
        });
        assert.ok(msgs[1].content.includes('急促') || msgs[1].content.includes('语气'));
    });

    it('glossary hit-only + conditional postReplace + GenDict drafts', () => {
        const glossary = {
            entries: [
                normalizeEntry({
                    canonical: '香水纯',
                    aliases: ['香水さん', '香水'],
                    role: 'character',
                    note: '直呼',
                    promptInject: 'always',
                    postReplace: {
                        enabled: true,
                        when: { srcIncludes: ['さん'], dstIncludes: ['小姐'] },
                        replace: [{ from: '香水纯小姐', to: '香水纯' }],
                    },
                }),
            ],
        };
        const jaBlob = engineCues.map((c) => c.text).join('\n');
        const terms = selectGlossaryTermsForBatch(glossary, jaBlob, {
            glossaryPromptInjectMode: 'hitOnly',
            glossaryAlwaysCharacterMax: 8,
        });
        assert.ok(terms.some((t) => (t.translation || t.dst) === '香水纯'));

        const post = applyConditionalPostReplace(
            [{ text: '香水纯小姐好', sourceText: '香水さん' }],
            glossary,
            {},
        );
        assert.strictEqual(post.changed, 1);
        assert.strictEqual(post.cues[0].text, '香水纯好');

        const proposed = proposeGlossaryDraftsFromCues(engineCues, { entries: [] }, { minCount: 2 });
        assert.ok(proposed.drafts.length >= 1);
        const applied = applyGlossaryDrafts({ entries: [] }, proposed.drafts);
        assert.ok(applied.added >= 1);
        assert.ok(applied.glossary.entries[0].note.includes('GenDict'));
    });
});
