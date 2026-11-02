const assert = require('assert');
const {
    parseSensevoiceRich,
    normalizeSensevoiceRichTagsMode,
    buildRichFlags,
    attachRichFromSidecarEntries,
    isNonspeechEvent,
} = require('../src/js/sensevoice-rich-tags-core');
const {
    normalizeSensevoiceEmotionMtStyle,
    buildEmotionMtStyleBlock,
    hintForEmotion,
} = require('../src/js/sensevoice-emotion-mt-style-core');
const {
    selectGlossaryTermsForBatch,
    applyConditionalPostReplace,
    normalizeEntry,
} = require('../src/js/subtitle-glossary-core');
const { buildAsrSidecarFromEngineCues } = require('../src/js/subtitle-meta-core');
const { bandCueAtIndex } = require('../src/js/cue-risk-band-core');
const { applyPreMtOnomatopoeiaClean } = require('../src/js/pre-mt-onomatopoeia-clean-core');

describe('sensevoice rich tags + glossary workflow', () => {
    it('parses SenseVoice rich tags and cleans text', () => {
        const rich = parseSensevoiceRich('<|ja|><|HAPPY|><|Laughter|><|withitn|>笑什么啊');
        assert.strictEqual(rich.text, '笑什么啊');
        assert.strictEqual(rich.emotion, 'HAPPY');
        assert.strictEqual(rich.audioEvent, 'LAUGHTER');
        assert.strictEqual(rich.senseLang, 'ja');
        assert.ok(buildRichFlags(rich).includes('sv_nonspeech'));
        assert.ok(buildRichFlags(rich).includes('sv_laughter'));
    });

    it('drops EMO_UNKNOWN and maps MUSIC→BGM', () => {
        const rich = parseSensevoiceRich('<|en|><|EMO_UNKNOWN|><|Music|>hello');
        assert.strictEqual(rich.emotion, null);
        assert.strictEqual(rich.audioEvent, 'BGM');
        assert.strictEqual(rich.text, 'hello');
    });

    it('seeds sidecar with rich fields when mode is sidecar', () => {
        const doc = buildAsrSidecarFromEngineCues([
            {
                start: 1,
                end: 2,
                text: 'あはは',
                emotion: 'HAPPY',
                audioEvent: 'LAUGHTER',
                confidence: 0.9,
            },
        ], { sensevoiceRichTags: 'sidecar', allowHeuristic: true });
        assert.strictEqual(doc.entries[0].emotion, 'HAPPY');
        assert.strictEqual(doc.entries[0].audioEvent, 'LAUGHTER');
        assert.ok(doc.entries[0].flags.includes('sv_laughter'));
    });

    it('strips rich fields when sensevoiceRichTags=off', () => {
        const doc = buildAsrSidecarFromEngineCues([
            {
                start: 1,
                end: 2,
                text: 'あはは',
                emotion: 'HAPPY',
                audioEvent: 'LAUGHTER',
                confidence: 0.9,
            },
        ], { sensevoiceRichTags: 'off', allowHeuristic: true });
        assert.strictEqual(doc.entries[0].emotion, undefined);
        assert.ok(!doc.entries[0].flags.includes('sv_laughter'));
    });

    it('bands nonspeech yellow', () => {
        const cues = [{ text: 'これは普通の台詞です', startMs: 0, endMs: 1500 }];
        const ann = [{ confidence: 0.9, flags: ['sv_nonspeech'], audioEvent: 'LAUGHTER' }];
        const band = bandCueAtIndex(cues, 0, ann, {});
        assert.strictEqual(band.band, 'yellow');
        assert.ok(band.reasons.includes('sv_nonspeech'));
    });

    it('emotion MT style default off', () => {
        assert.strictEqual(normalizeSensevoiceEmotionMtStyle(undefined), 'off');
        assert.strictEqual(buildEmotionMtStyleBlock(
            [{ emotion: 'HAPPY' }],
            { sensevoiceEmotionMtStyle: 'off', sensevoiceRichTags: 'sidecar' },
        ), '');
        const block = buildEmotionMtStyleBlock(
            [{ emotion: 'HAPPY' }],
            { sensevoiceEmotionMtStyle: 'hint', sensevoiceRichTags: 'sidecar' },
        );
        assert.ok(block.includes('轻松'));
        assert.ok(hintForEmotion('NEUTRAL') === '');
    });

    it('glossary hit-only injects characters always and terms on hit', () => {
        const glossary = {
            entries: [
                normalizeEntry({
                    canonical: '芙兰',
                    aliases: ['フラン'],
                    role: 'character',
                    note: '女·老师',
                }),
                normalizeEntry({
                    canonical: '房东',
                    aliases: ['大家さん'],
                    role: 'term',
                }),
                normalizeEntry({
                    canonical: '未出现词',
                    aliases: ['ゼツメツ'],
                    role: 'term',
                }),
            ],
        };
        const hit = selectGlossaryTermsForBatch(glossary, 'フランさん、こんにちは', {
            glossaryPromptInjectMode: 'hitOnly',
            glossaryAlwaysCharacterMax: 8,
        });
        const terms = hit.map((t) => t.translation || t.dst);
        assert.ok(terms.includes('芙兰'));
        assert.ok(!terms.includes('未出现词'));
    });

    it('conditional postReplace applies when predicates match', () => {
        const glossary = {
            entries: [
                normalizeEntry({
                    canonical: '芙兰',
                    aliases: ['フラン'],
                    postReplace: {
                        enabled: true,
                        when: { srcIncludes: ['さん'], dstIncludes: ['小姐'] },
                        replace: [{ from: '芙兰小姐', to: '芙兰' }],
                    },
                }),
            ],
        };
        const { cues, changed } = applyConditionalPostReplace(
            [{ text: '芙兰小姐好', sourceText: 'フランさん' }],
            glossary,
            {},
        );
        assert.strictEqual(changed, 1);
        assert.strictEqual(cues[0].text, '芙兰好');
    });

    it('pre-mt clear drops short nonspeech SenseVoice events', () => {
        const result = applyPreMtOnomatopoeiaClean(
            [
                { text: 'あはは', audioEvent: 'LAUGHTER' },
                { text: 'これは台詞です', audioEvent: 'SPEECH' },
            ],
            { postBatchOnomatopoeiaMode: 'clear', sourceLang: 'ja' },
        );
        assert.ok(result.dropped >= 1);
        assert.strictEqual(result.cues.length, 1);
        assert.ok(result.cues[0].text.includes('台詞'));
    });

    it('normalizeSensevoiceRichTagsMode accepts sdh', () => {
        assert.strictEqual(normalizeSensevoiceRichTagsMode('sdh'), 'sdh');
        assert.strictEqual(isNonspeechEvent('LAUGHTER'), true);
        assert.strictEqual(isNonspeechEvent('SPEECH'), false);
    });

    it('attachRichFromSidecarEntries merges by overlap', () => {
        const cues = [{ startMs: 1000, endMs: 2000, text: 'hi' }];
        const next = attachRichFromSidecarEntries(cues, [{
            startMs: 1000,
            endMs: 2000,
            emotion: 'SAD',
            audioEvent: 'CRY',
        }], { sensevoiceRichTags: 'sidecar' });
        assert.strictEqual(next[0].emotion, 'SAD');
        assert.strictEqual(next[0].audioEvent, 'CRY');
    });

    it('applyAudioEventSideNotes prepends [笑声] in sdh mode', () => {
        const { applyAudioEventSideNotes, sideNoteForAudioEvent } = require('../src/js/sensevoice-rich-tags-core');
        assert.strictEqual(sideNoteForAudioEvent('LAUGHTER'), '[笑声]');
        const { cues, changed } = applyAudioEventSideNotes(
            [{ text: 'あはは', audioEvent: 'LAUGHTER' }, { text: '普通', audioEvent: 'SPEECH' }],
            { sensevoiceRichTags: 'sdh' },
        );
        assert.strictEqual(changed, 1);
        assert.strictEqual(cues[0].text, '[笑声]あはは');
        assert.strictEqual(cues[1].text, '普通');
        const again = applyAudioEventSideNotes(cues, { sensevoiceRichTags: 'sdh' });
        assert.strictEqual(again.changed, 0);
    });

    it('glossaryRoleLabelZh labels character', () => {
        const { glossaryRoleLabelZh } = require('../src/js/subtitle-glossary-core');
        assert.strictEqual(glossaryRoleLabelZh('character'), '角色');
        assert.strictEqual(glossaryRoleLabelZh('term'), '');
    });

    it('upsertEntry preserves postReplace when form omits it', () => {
        const { upsertEntry, normalizeEntry } = require('../src/js/subtitle-glossary-core');
        const first = upsertEntry({ entries: [] }, normalizeEntry({
            id: 'g_keep',
            canonical: '芙兰',
            role: 'character',
            postReplace: {
                enabled: true,
                when: { srcIncludes: ['さん'] },
                replace: [{ from: '芙兰小姐', to: '芙兰' }],
            },
        }));
        const second = upsertEntry(first.glossary, {
            id: 'g_keep',
            canonical: '芙兰',
            note: '女·老师',
            role: 'character',
            promptInject: 'always',
        });
        assert.ok(second.entry.postReplace);
        assert.strictEqual(second.entry.note, '女·老师');
        assert.deepStrictEqual(second.entry.postReplace.replace[0], { from: '芙兰小姐', to: '芙兰' });
    });

    it('parse/format postReplace form fields round-trip', () => {
        const {
            parsePostReplaceFormFields,
            formatPostReplaceFormFields,
        } = require('../src/js/subtitle-glossary-core');
        const parsed = parsePostReplaceFormFields({
            enabled: true,
            srcIncludes: 'さん，ちゃん',
            dstIncludes: '小姐',
            replaceText: '芙兰小姐→芙兰\n太郎小姐 -> 太郎',
        });
        assert.ok(parsed);
        assert.deepStrictEqual(parsed.when.srcIncludes, ['さん', 'ちゃん']);
        assert.strictEqual(parsed.replace.length, 2);
        const fields = formatPostReplaceFormFields(parsed);
        assert.ok(fields.replaceText.includes('芙兰小姐→芙兰'));
        assert.ok(fields.srcIncludes.includes('さん'));
    });

    it('builtin address postReplace cleans dup honorific and oka/danna', () => {
        const {
            applyBuiltinAddressPostReplaceToText,
            applyConditionalPostReplace,
        } = require('../src/js/subtitle-glossary-core');
        const dup = applyBuiltinAddressPostReplaceToText('王小姐小姐来了', '');
        assert.strictEqual(dup.text, '王小姐来了');
        assert.ok(dup.reasons.includes('builtin_dup_honorific'));
        const oka = applyBuiltinAddressPostReplaceToText('奥小姐在吗', '奥さんいますか');
        assert.strictEqual(oka.text, '太太在吗');
        const danna = applyBuiltinAddressPostReplaceToText('旦那小姐呢', '旦那は');
        assert.strictEqual(danna.text, '老公呢');
        const batch = applyConditionalPostReplace(
            [{ text: '小姐小姐好', sourceText: 'hello' }],
            { entries: [] },
            {},
        );
        assert.strictEqual(batch.changed, 1);
        assert.strictEqual(batch.cues[0].text, '小姐好');
    });

    it('upsertEntry clears postReplace when form passes null', () => {
        const { upsertEntry, normalizeEntry } = require('../src/js/subtitle-glossary-core');
        const first = upsertEntry({ entries: [] }, normalizeEntry({
            id: 'g_clear',
            canonical: '芙兰',
            postReplace: {
                enabled: true,
                replace: [{ from: '芙兰小姐', to: '芙兰' }],
            },
        }));
        const cleared = upsertEntry(first.glossary, {
            id: 'g_clear',
            canonical: '芙兰',
            postReplace: null,
        });
        assert.ok(!cleared.entry.postReplace);
    });

    it('formatRichTagsBadge renders emotion and nonspeech event chips', () => {
        const {
            formatRichTagsBadge,
            emotionLabelZh,
            audioEventLabelZh,
        } = require('../src/js/sensevoice-rich-tags-core');
        assert.strictEqual(emotionLabelZh('HAPPY'), '开心');
        assert.strictEqual(audioEventLabelZh('LAUGHTER'), '笑声');
        assert.strictEqual(audioEventLabelZh('SPEECH'), '');
        const badge = formatRichTagsBadge(
            { text: 'あはは', emotion: 'HAPPY', audioEvent: 'LAUGHTER' },
            null,
        );
        assert.ok(badge.html.includes('开心'));
        assert.ok(badge.html.includes('笑声'));
        assert.ok(badge.title.includes('情感'));
        const neutral = formatRichTagsBadge({ emotion: 'NEUTRAL', audioEvent: 'SPEECH' }, null);
        assert.strictEqual(neutral.html, '');
    });

    it('mergeConfidenceAnnotations keeps emotion from sidecar', () => {
        const { mergeConfidenceAnnotations } = require('../src/js/subtitle-meta-core');
        const cues = [{ startMs: 0, endMs: 1000, text: 'hi' }];
        const sidecar = {
            entries: [{
                index: 0,
                startMs: 0,
                endMs: 1000,
                text: 'hi',
                confidence: 0.9,
                source: 'asr',
                emotion: 'SAD',
                audioEvent: 'CRY',
            }],
        };
        const meta = mergeConfidenceAnnotations(cues, sidecar, {});
        assert.strictEqual(meta[0].emotion, 'SAD');
        assert.strictEqual(meta[0].audioEvent, 'CRY');
    });
});
