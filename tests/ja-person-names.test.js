const assert = require('assert');
const jaNames = require('../src/js/ja-person-names-core');
const sanitize = require('../src/js/mt-sanitize-core');

describe('ja-person-names-core', () => {
    it('exposes a sizable given-name lexicon', () => {
        assert.ok(jaNames.JA_GIVEN_NAME_ENTRIES.length >= 80);
        assert.ok(jaNames.POLLUTION_NAME_STEMS.size >= 120);
        assert.ok(jaNames.SOURCE_NAME_HINTS.length >= 80);
        assert.ok(jaNames.POLLUTION_NAME_STEMS.has('佳奈'));
        assert.ok(jaNames.POLLUTION_NAME_STEMS.has('美咲'));
        assert.ok(jaNames.POLLUTION_NAME_STEMS.has('结衣'));
        assert.ok(jaNames.POLLUTION_NAME_STEMS.has('佐藤'));
        assert.ok(jaNames.isPollutionNameStem('玲奈'));
        assert.ok(jaNames.isPollutionNameStem('阳菜酱'));
    });

    it('does not treat うまい as justifying 舞', () => {
        assert.ok(!jaNames.sourceJustifiesZhName('舞', 'うまい。'));
        assert.ok(!jaNames.sourceJustifiesZhName('舞', 'すごくうまいなぁ'));
    });

    it('does not treat sentence-final かな particle as 佳奈', () => {
        assert.ok(!jaNames.sourceJustifiesZhName('佳奈', 'いや…本当に大丈夫かなと思っちゃって'));
        assert.ok(!jaNames.sourceJustifiesZhName('佳奈', 'いいかな'));
        assert.ok(!jaNames.sourceJustifiesZhName('佳奈', 'どこが動かないんですか?'));
        const refs = jaNames.extractJaPersonRefs('大丈夫かなと思っちゃって');
        assert.ok(!refs.some((r) => r.stem === 'かな'), JSON.stringify(refs));
    });

    it('still justifies 佳奈/舞 with honorific, intro, or katakana name', () => {
        assert.ok(jaNames.sourceJustifiesZhName('佳奈', 'かなさん、こっち来て'));
        assert.ok(jaNames.sourceJustifiesZhName('佳奈', '私はかなです。よろしく'));
        assert.ok(jaNames.sourceJustifiesZhName('舞', 'マイマイ'));
        assert.ok(jaNames.sourceJustifiesZhName('舞', 'マイ、こっち'));
        assert.ok(!jaNames.sourceJustifiesZhName('舞', 'マイクを持って'));
    });

    it('extracts honorific, intro, and lexicon person refs', () => {
        const a = jaNames.extractJaPersonRefs('倉木さんと北野くん');
        assert.ok(a.some((r) => r.stem === '倉木' && r.via === 'honorific'), JSON.stringify(a));
        assert.ok(a.some((r) => r.stem === '北野'), JSON.stringify(a));

        const kousui = jaNames.extractJaPersonRefs('こちらは取引先の会社に勤めている香水さん。');
        assert.ok(
            kousui.some((r) => r.stem === '香水' && r.via === 'honorific'),
            JSON.stringify(kousui),
        );
        assert.ok(!kousui.some((r) => /勤/.test(r.stem)), JSON.stringify(kousui));
        assert.strictEqual(jaNames.resolveCanonicalZhPersonName('香水'), '香水纯');
        const cast = jaNames.harvestHonorificCastTerms([
            { text: '香水さんがうまくやってくれたおかげで' },
            { text: 'こちらは取引先の会社に勤めている香水さん。' },
        ]);
        assert.ok(cast.some((t) => t.term === '香水' && t.translation === '香水纯'), JSON.stringify(cast));

        const b = jaNames.extractJaPersonRefs('あたし、はるなです');
        assert.ok(b.some((r) => r.stem.includes('はるな') || r.via === 'intro' || r.via === 'lexicon'));

        const c = jaNames.extractJaPersonRefs('みさきが来たよ');
        assert.ok(c.some((r) => r.stem === 'みさき' && r.via === 'lexicon'));
    });

    it('keeps source-justified trailing names, strips pollution', () => {
        const keep = sanitize.stripTrailingOrphanName(
            '请多指教。 汤米',
            'と、と、トミーーです。',
        );
        assert.ok(keep.text.includes('汤米'), keep.text);

        const strip = sanitize.stripTrailingOrphanName(
            '门开不了了。 美咲',
            '扉が動かなくなっちゃって',
        );
        assert.ok(strip.changed);
        assert.ok(!strip.text.includes('美咲'));

        // Particle かな must NOT protect trailing 佳奈
        const particle = sanitize.stripTrailingOrphanName(
            '我真的觉得可以。 佳奈',
            'いや…本当に大丈夫かなと思っちゃって',
        );
        assert.ok(particle.changed);
        assert.ok(!particle.text.includes('佳奈'), particle.text);

        const kanaStripLong = sanitize.stripTrailingOrphanName(
            '你先到那边等我一下好吗。 佳奈',
            'かな、こっち来て',
        );
        // Bare かな without honorific is weak — strip trailing pollution
        assert.ok(!kanaStripLong.text.includes('佳奈'), kanaStripLong.text);

        // Short intro bare name may keep; trailing 美咲桑 cast-tag on dialogue strips
        const shortKeep = sanitize.stripTrailingOrphanName(
            '请多指教。 佳奈',
            'かなです。よろしく',
        );
        assert.ok(shortKeep.text.includes('佳奈'), shortKeep.text);

        const honorificStrip = sanitize.stripTrailingOrphanName(
            '看来进展得很顺利呢。 美咲桑',
            '美咲さんとは上手く行っているみたいですね',
        );
        assert.ok(!honorificStrip.text.includes('美咲'), honorificStrip.text);
    });

    it('strips Whisper ASR name loops and does not justify from them', () => {
        const loop = jaNames.stripAsrHallucinationLoops('あ〜玲奈玲奈玲奈玲奈');
        assert.ok(loop.changed);
        assert.ok(!loop.text.includes('玲奈'), loop.text);

        const keepHonorific = jaNames.stripAsrHallucinationLoops(
            '美咲さんとは上手く行っているみたいですね',
        );
        assert.ok(keepHonorific.text.includes('美咲さん'));

        assert.ok(!jaNames.sourceJustifiesZhName('玲奈', 'あ〜玲奈玲奈玲奈玲奈'));
        assert.ok(!jaNames.sourceJustifiesZhName('玲奈', '嬉玲奈玲奈玲奈玲奈'));
        assert.ok(!jaNames.sourceJustifiesZhName('玲奈', '玲奈'));
        assert.ok(!jaNames.sourceJustifiesZhName('玲奈', '玲奈…'));
        assert.ok(jaNames.sourceJustifiesZhName('美咲', '美咲さんとは上手く行っているみたいですね'));

        const mid = sanitize.sanitizeMtCueText('好厉害玲奈…玲奈', '凄い玲奈玲奈玲奈玲奈');
        assert.ok(!mid.text.includes('玲奈'), mid.text);

        const unjust = sanitize.sanitizeMtCueText('嬉玲奈…玲奈', 'れば割れば割れこれはまずい');
        assert.ok(!unjust.text.includes('玲奈'), unjust.text);

        const nameOnly = sanitize.sanitizeMtCueText('玲奈…', '玲奈…');
        assert.ok(!nameOnly.text.includes('玲奈'), nameOnly.text);

        const danceLoop = sanitize.sanitizeMtCueText('谁才是舞…舞', 'どっちのが');
        assert.ok(!danceLoop.text.includes('舞'), danceLoop.text);
    });
});
