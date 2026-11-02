const assert = require('assert');
const {
    proposeGlossaryDraftsFromCues,
    applyGlossaryDrafts,
    formatDraftConfirmMessage,
    DRAFT_NOTE,
} = require('../src/js/glossary-gendict-core');

describe('glossary-gendict-core', () => {
    it('proposes honorific cast drafts and skips existing glossary', () => {
        const cues = [
            { text: '香水さん、待って' },
            { text: '香水さんありがとう' },
            { text: '普通の台詞です' },
        ];
        const empty = proposeGlossaryDraftsFromCues(cues, { entries: [] }, { minCount: 2 });
        assert.ok(empty.drafts.length >= 1);
        assert.ok(empty.drafts.some((d) => d.role === 'character'));
        assert.strictEqual(empty.drafts[0].promptInject, 'hit');
        assert.ok(empty.drafts[0].note.includes(DRAFT_NOTE));

        const existing = {
            entries: [{
                id: 'g1',
                canonical: empty.drafts[0].canonical,
                aliases: empty.drafts[0].aliases || [],
                role: 'character',
            }],
        };
        const again = proposeGlossaryDraftsFromCues(cues, existing, { minCount: 2 });
        assert.ok(again.skippedExisting >= 1);
    });

    it('applies confirmed drafts via upsert', () => {
        const cues = [
            { text: '太郎さん来た' },
            { text: '太郎さんだ' },
        ];
        const proposed = proposeGlossaryDraftsFromCues(cues, null, {
            minCount: 2,
            includeKatakana: false,
        });
        // May be empty if 太郎 not in person lexicon — still exercise apply path.
        const drafts = proposed.drafts.length
            ? proposed.drafts
            : [{
                canonical: '太郎',
                aliases: ['太郎さん'],
                role: 'character',
                promptInject: 'hit',
                note: DRAFT_NOTE,
            }];
        const applied = applyGlossaryDrafts({ entries: [] }, drafts);
        assert.strictEqual(applied.ok, true);
        assert.ok(applied.added >= 1);
        assert.strictEqual(applied.glossary.entries[0].promptInject, 'hit');
        const skipped = applyGlossaryDrafts({ entries: [] }, drafts.map((d) => ({ ...d, selected: false })));
        assert.strictEqual(skipped.added, 0);
        assert.ok(skipped.skipped >= 1);
        assert.ok(formatDraftConfirmMessage(drafts).includes('太郎') || formatDraftConfirmMessage(drafts).includes('写入'));
    });

    it('harvests repeated katakana names', () => {
        const cues = [
            { text: 'フランが来た' },
            { text: 'フランだよ' },
            { text: 'こんにちは' },
        ];
        const proposed = proposeGlossaryDraftsFromCues(cues, { entries: [] }, {
            minCount: 2,
            includeKatakana: true,
        });
        assert.ok(proposed.drafts.some((d) => d.canonical === 'フラン' || (d.aliases || []).includes('フラン')));
    });
});
