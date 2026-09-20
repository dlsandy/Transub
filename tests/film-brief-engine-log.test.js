const assert = require('assert');
const {
    clipText,
    characterLabel,
    formatSampleHint,
    formatFilmBriefEngineLogLines,
    emitFilmBriefToProgress,
} = require('../electron/film-brief-engine-log');

describe('film-brief-engine-log', () => {
    it('clips long text with an ellipsis', () => {
        assert.strictEqual(clipText('abc', 5), 'abc');
        assert.strictEqual(clipText('abcdefghij', 5), 'abcd…');
        assert.strictEqual(clipText('  foo\nbar  ', 20), 'foo bar');
    });

    it('formats character labels with optional role', () => {
        assert.strictEqual(characterLabel('真琴'), '真琴');
        assert.strictEqual(characterLabel({ name: '真琴', role: '女主' }), '真琴（女主）');
        assert.strictEqual(characterLabel({ name: '' }), '');
    });

    it('formats sample hint with totals', () => {
        assert.strictEqual(formatSampleHint({ sampleCount: 80, sampleTotal: 1240 }), '取样 80/1240 句');
        assert.strictEqual(formatSampleHint({ sampleCount: 50 }), '取样 50 句');
        assert.strictEqual(formatSampleHint({}), '');
    });

    it('formats a concise film brief for the engine log', () => {
        const lines = formatFilmBriefEngineLogLines({
            titleGuess: '春物',
            genre: '恋爱喜剧',
            tone: '轻松口语',
            synopsis: '高中生围绕学园祭展开日常对话。',
            characters: [
                { name: '真琴', role: '女主' },
                { name: '先輩', role: '男主' },
            ],
            terms: [{ term: '学园祭', meaning: '校园活动' }],
        }, { sampleCount: 80, sampleTotal: 1240 });
        assert.strictEqual(lines[0], '影片简要已就绪 · 取样 80/1240 句');
        assert.ok(lines.some((l) => l.includes('恋爱喜剧') && l.includes('轻松口语')));
        assert.ok(lines.some((l) => l.includes('人物：真琴（女主）、先輩（男主）')));
        assert.ok(lines.some((l) => l.includes('专名：学园祭：校园活动')));
        assert.ok(lines.some((l) => l.includes('概要：高中生围绕学园祭展开日常对话。')));
    });

    it('caps long name lists and synopsis', () => {
        const chars = Array.from({ length: 12 }, (_, i) => ({ name: `角色${i + 1}` }));
        const lines = formatFilmBriefEngineLogLines({
            synopsis: '甲'.repeat(200),
            characters: chars,
        });
        const people = lines.find((l) => l.includes('人物：'));
        assert.ok(people.includes('等4项'));
        const synopsis = lines.find((l) => l.includes('概要：'));
        assert.ok(synopsis.endsWith('…'));
        assert.ok(synopsis.length < 180);
    });

    it('formats a skip notice', () => {
        const lines = formatFilmBriefEngineLogLines(null, { skipped: true, skipReason: '智能翻译' });
        assert.deepStrictEqual(lines, ['影片简要已跳过（智能翻译）']);
    });

    it('emits once per session and marks extra lines logOnly', () => {
        const session = { briefSourceCues: new Array(80), briefCueTotal: 200 };
        const events = [];
        const brief = {
            genre: '恋爱喜剧',
            characters: [{ name: '真琴' }],
            synopsis: '学园日常。',
        };
        const first = emitFilmBriefToProgress((info) => events.push(info), session, brief);
        const second = emitFilmBriefToProgress((info) => events.push(info), session, brief);
        assert.ok(first.length >= 3);
        assert.deepStrictEqual(second, []);
        assert.strictEqual(session.filmBriefLogged, true);
        assert.strictEqual(events[0].phase, 'film-brief');
        assert.ok(events[0].message.includes('影片简要已就绪'));
        assert.ok(events[0].logOnly !== true);
        assert.ok(events.slice(1).every((e) => e.logOnly === true && e.phase === 'film-brief-detail'));
    });
});
