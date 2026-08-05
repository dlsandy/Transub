const assert = require('assert');
const sanitize = require('../src/js/mt-sanitize-core');
const opaque = require('../src/js/mt-opaque-strings');
const { FIX } = opaque;

describe('mt-sanitize-core', () => {
    it('strips Gloss / __GLOSS placeholders', () => {
        const a = sanitize.stripMtArtifacts('Gloss2266__店。');
        assert.ok(a.changed);
        assert.strictEqual(a.text, '店。');

        const b = sanitize.stripMtArtifacts('请看 __GLOSS12__ 这边');
        assert.ok(b.changed);
        assert.ok(!b.text.includes('GLOSS'));
        assert.ok(b.text.includes('请看'));
        assert.ok(b.text.includes('这边'));

        const c = sanitize.stripMtArtifacts('也不可小觑__香水的代号__啊');
        assert.ok(c.changed);
        assert.strictEqual(c.text, '也不可小觑香水纯啊');

        const d = sanitize.stripMtArtifacts('我没有告诉任何人__GLOS2643__的');
        assert.ok(d.changed);
        assert.ok(!/__/.test(d.text));
        assert.ok(d.text.includes('我没有告诉任何人'));

        const e = sanitize.stripMtArtifacts('今天和香水的代号去哪儿？');
        assert.ok(e.changed);
        assert.ok(e.text.includes('香水纯'));
        assert.ok(!e.text.includes('代号'));

        const f = sanitize.stripMtArtifacts('GLOS2658克……GLOS2658克');
        assert.ok(f.changed);
        assert.ok(!/GLOS/i.test(f.text));
        assert.ok(f.glossHit);

        const g = sanitize.stripMtArtifacts('家务和日常GLOSSES2152这些我尽量做了');
        assert.ok(g.changed);
        assert.ok(!/GLOS/i.test(g.text), g.text);
        assert.ok(g.text.includes('日常') && g.text.includes('这些'), g.text);
    });

    it('collapses honorific echoes and kinship 母小姐', () => {
        const a = sanitize.collapseHonorificEchoes('真琴小姐…小姐早到倾向');
        assert.strictEqual(a.text, '真琴小姐早到倾向');
        const b = sanitize.collapseHonorificEchoes('内村小姐…小姐…小姐');
        assert.strictEqual(b.text, '内村小姐');
        const adj = sanitize.collapseHonorificEchoes('美羽小姐小姐多吃点哦');
        assert.strictEqual(adj.text, '美羽小姐多吃点哦');
        const c = sanitize.fixKinshipHonorificMistranslations('母小姐', 'お母さん。');
        assert.strictEqual(c.text, '妈妈');
        const wife = sanitize.fixKinshipHonorificMistranslations(
            '部长和奥小姐关系不错吗？',
            '部長は奥さんと仲はいいんですか?',
        );
        assert.ok(wife.text.includes('太太'), wife.text);
        assert.ok(!wife.text.includes('奥小姐'), wife.text);
        const wifeDup = sanitize.sanitizeMtCueText(
            '你最好快点回去找奥小姐回去找奥小姐',
            '早く奥さんとお子さんのもとに戻った方がいいですよ',
            { contentProfile: 'av_soft' },
        );
        assert.ok(wifeDup.text.includes('太太'), wifeDup.text);
        assert.ok(!wifeDup.text.includes('奥小姐'), wifeDup.text);
        assert.ok(!/太太太太|找太太回去找太太/.test(wifeDup.text), wifeDup.text);
        const husband = sanitize.fixKinshipHonorificMistranslations(
            '我要感谢旦那小姐',
            '旦那さんには感謝しかないですよ',
        );
        assert.ok(husband.text.includes('老公'), husband.text);
        assert.ok(!husband.text.includes('旦那小姐'), husband.text);
        // Spouse kinship gender from source (opaque fixture)
        const wifeAsDanna = sanitize.fixKinshipHonorificMistranslations(
            FIX.wifeBadZh,
            FIX.wifeJa,
        );
        assert.ok(wifeAsDanna.text.includes('太太'), wifeAsDanna.text);
        assert.ok(!wifeAsDanna.text.includes('老公'), wifeAsDanna.text);
        const meta = sanitize.correctZhDomainMistranslations(
            '和别的男人一起睡省略了怎么样？',
            '…他の男と、寝てくれないか?',
        );
        assert.ok(!meta.text.includes('省略'), meta.text);
        assert.ok(meta.text.includes('男人'), meta.text);
        const okaeri2 = sanitize.correctZhDomainMistranslations('啊，', 'あ、お帰り。');
        assert.ok(okaeri2.text.includes('欢迎回来'), okaeri2.text);
        const makun = sanitize.correctZhDomainMistranslations('…', 'まーくん');
        assert.strictEqual(makun.text, '阿马');
        const d = sanitize.sanitizeMtCueText('さつし先生…先生感觉舒服吗？', 'さつしくんは気持ちいいですか?');
        assert.ok(!d.text.includes('先生…先生'));
        // JA stem+honorific debris is stripped; keep the Chinese clause
        assert.ok(d.text.includes('感觉舒服'), d.text);
        assert.ok(!/[ぁ-ん]/.test(d.text), d.text);
    });

    it('strips 到的X / residual JA / 奥小姐 for お兄', () => {
        const a = sanitize.stripSpuriousNamePrefixes('称呼我到的美羽小姐', '美羽さん');
        assert.ok(!a.text.includes('到的'), a.text);
        assert.ok(a.text.includes('美羽'), a.text);

        // さん is gender-neutral → do not keep 小姐
        const san = sanitize.normalizeZhHonorificFromJaSan('美羽小姐多吃点哦', '美羽さんたくさん食べなさいね。');
        assert.strictEqual(san.text, '美羽多吃点哦');
        const keptLady = sanitize.normalizeZhHonorificFromJaSan('大小姐请用茶', 'お嬢様お茶をどうぞ');
        assert.ok(keptLady.text.includes('小姐') || keptLady.text.includes('大小姐'), keptLady.text);

        const b = sanitize.sanitizeMtCueText(
            '亲爱的奥小姐你来吧',
            'お兄さんどうぞ',
            { contentProfile: 'av_soft' },
        );
        assert.ok(!b.text.includes('奥小姐'), b.text);
        assert.ok(b.text.includes('哥哥') || !/奥/.test(b.text), b.text);

        const c = sanitize.stripResidualJaInZh(
            '你这个当儿子的老婆さあゆう小姐竟然做出这种事',
            '息子の嫁にこんなことして',
        );
        assert.ok(!/[ぁ-ん]/.test(c.text), c.text);
        assert.ok(c.text.includes('老婆'), c.text);
        assert.ok(c.text.includes('这种事'), c.text);
        assert.ok(!/老婆小姐/.test(c.text), c.text);

        const d = sanitize.stripResidualJaInZh('信じたく小姐多吃点哦', '信じたくさん食べなさいね。');
        assert.ok(!d.text.includes('信小姐'), d.text);
        assert.ok(d.text.includes('多吃点') || d.text === '', d.text);

        const e = sanitize.stripResidualJaInZh('真厉害，ゆう先生', 'すごいよユーサン');
        assert.ok(!/[ぁ-ん]/.test(e.text), e.text);
        assert.ok(!/(?:小姐|先生)$/.test(e.text.trim()), e.text);
    });

    it('strips trailing glued おはよう from JA ASR', () => {
        const a = sanitize.correctJaAsrDomainMishears('それなのにあっおはようございます');
        assert.ok(a.changed);
        assert.ok(!a.text.includes('おはよう'));
        assert.ok(a.text.includes('それなのに'));
        const keep = sanitize.correctJaAsrDomainMishears('おはようございます。');
        assert.ok(!keep.changed || keep.text.includes('おはよう'));
    });

    it('strips trailing orphan name tokens not in source', () => {
        const a = sanitize.stripTrailingOrphanName('我明白了，那就麻烦您了。 真理', 'かしこまりました');
        assert.ok(a.changed);
        assert.strictEqual(a.text, '我明白了，那就麻烦您了。');

        const b = sanitize.stripTrailingOrphanName('谢谢。', 'ありがとう');
        assert.ok(!b.changed);

        const kept = sanitize.stripTrailingOrphanName('好的 好的', 'はい');
        assert.ok(!kept.changed, 'common ending 好的 should stay');

        // Mid-clause predicates after comma must not be treated as cast tags
        const pred = sanitize.stripTrailingOrphanName('好的，明白了', 'はい、わかりました');
        assert.ok(!pred.changed, `predicate 明白了 must stay, got ${JSON.stringify(pred.text)}`);
        const pred2 = sanitize.stripTrailingOrphanName('嗯，知道了', 'うん、わかった');
        assert.ok(!pred2.changed, `predicate 知道了 must stay, got ${JSON.stringify(pred2.text)}`);
    });

    it('keeps short dialogue that wet-sfx used to truncate (ADN-791 blanks)', () => {
        const opts = {
            smartTranslateFaithfulTone: true,
            faithfulTone: true,
            applyNsfwLexicon: true,
            contentProfile: 'av_soft',
        };
        const a = sanitize.sanitizeMtCueText('好的，明白了。', 'はい、わかりました。', opts);
        assert.ok(a.text.includes('明白'), a.text);
        assert.ok(!/^[好的，…\s]+$/.test(a.text), a.text);

        const b = sanitize.sanitizeMtCueText('嗯，知道了。', 'うん、わかった。', opts);
        assert.ok(b.text.includes('知道'), b.text);

        const c = sanitize.sanitizeMtCueText('阿瓦夫塔大人，辛苦了。', 'あわふた様、お疲れ様です', opts);
        assert.ok(c.text.includes('辛苦'), c.text);
    });

    it('strips multi trailing orphans and unjustified cast tags', () => {
        const a = sanitize.stripTrailingOrphanName(
            '啊哇…哇！ 汤米 舞',
            'あっわっわーうまいなぁこれ何やってんだよトミーーはごめんご',
        );
        assert.ok(a.changed);
        assert.ok(!a.text.includes('舞'));
        // short emotional head may keep source-justified 汤米

        const b = sanitize.stripTrailingOrphanName(
            '你还是积极一点比较好吧。 佳奈',
            'もっと積極的になったほうがいいのかな。',
        );
        assert.ok(b.changed);
        assert.ok(!b.text.includes('佳奈'));

        const c = sanitize.stripTrailingOrphanName(
            '我们从什么时候开始在一起的呢？ 月',
            '2人をいつからつきあってんの?',
        );
        assert.ok(c.changed);
        assert.ok(!c.text.includes('月'));

        const d = sanitize.stripTrailingOrphanName(
            '请多指教。 汤米',
            'と、と、トミーーです。',
        );
        // short head — keep name for intro-like cues
        assert.ok(d.text.includes('汤米'), d.text);

        const e = sanitize.stripTrailingOrphanName(
            FIX.tommyMeatZh,
            FIX.tommyMeatJa,
        );
        // long dialogue + trailing-only cast tag → strip
        assert.ok(e.changed);
        assert.ok(!e.text.includes('汤米'), e.text);
    });

    it('strips katakana dash debris', () => {
        const a = sanitize.stripKatakanaDashDebris('ー你没有男朋友嘛。');
        assert.ok(a.changed);
        assert.ok(!a.text.startsWith('ー'));
        assert.ok(a.text.includes('你没有'));

        const b = sanitize.stripKatakanaDashDebris('诶?ー君？');
        assert.ok(b.changed);
        assert.ok(!b.text.includes('ー'));
        assert.ok(b.text.includes('君'));

        const c = sanitize.stripKatakanaDashDebris('嗯ー，你看起来很温柔，');
        assert.ok(c.changed);
        assert.strictEqual(c.text, '嗯，你看起来很温柔，');

        const d = sanitize.stripKatakanaDashDebris('ー? 啊啊消失了');
        assert.ok(d.changed);
        assert.ok(!d.text.includes('ー'));
    });

    it('strips prompt leaks and marks blank for retry', () => {
        const leaked = '将下面的日文句子,lex-0…01的句子翻译成中文。 共1行。 只输出译文，每行对应原文一行；不要编号、不要解释、不要空行；碎句与拟声勿删并勿并行走。 舞';
        const a = sanitize.stripPromptLeak(leaked);
        assert.ok(a.leaked);
        assert.ok(a.changed);
        assert.ok(!/将下面的日文|只输出译文|共\s*1\s*行/.test(a.text));

        const out = sanitize.sanitizeMtCueText(leaked, 'マイマイ');
        assert.ok(out.flags.includes('prompt_leak'));
        // Empty dialogue → ellipsis placeholder so engine/post won't drop the cue
        assert.ok(out.text === '' || out.text === '…');
        assert.ok(sanitize.isBlankOrPunctTranslation(out.text));

        assert.ok(sanitize.isBlankOrPunctTranslation('なれ?'));
        assert.ok(sanitize.isMostlyUntranslatedJa('なれ?'));
    });

    it('treats soft-omission fillers as blank vs substantive JA', () => {
        assert.ok(sanitize.isFillerOnlyZh('嗯，'));
        assert.ok(sanitize.isFillerOnlyZh('请'));
        assert.ok(sanitize.isFillerOnlyZh('啊'));
        assert.ok(sanitize.isSeverelyUnderTranslated('嗯，', 'うんちょっと結構緊張しちゃって'));
        assert.ok(sanitize.isSeverelyUnderTranslated('请', 'そうするならあってください。'));
        assert.ok(sanitize.isBlankOrPunctTranslation('嗯，', 'うんごちそうさまありがとうございました。'));
        assert.ok(sanitize.isBlankOrPunctTranslation('请', 'よろしくお願いします。'));
        assert.ok(sanitize.isPathologicalMtText('啊', 'すいません何か取り上げたとしてもすごい。'));
        // Short JA interjection may stay short
        assert.ok(!sanitize.isSeverelyUnderTranslated('嗯。', 'うん。'));
        assert.ok(!sanitize.isBlankOrPunctTranslation('嗯。', 'うん。'));
        // Moan-heavy JA may keep short ZH gloss
        assert.ok(sanitize.isMoanOrSfxHeavyJa('あんっ、あっ、んっ…'));
        assert.ok(!sanitize.isSeverelyUnderTranslated('啊…', 'あんっ、あっ、んっ…'));
    });

    it('rejects Japanese source echoed as Chinese translation', () => {
        const src = '本日担当させていただきます皐月と申しますお客様は男士按摩店';
        assert.ok(sanitize.looksLikeSourceEcho(src, src));
        assert.ok(sanitize.isMostlyUntranslatedJa(src));
        assert.ok(sanitize.isBlankOrPunctTranslation(src, src));
        assert.ok(['', '…'].includes(sanitize.sanitizeMtCueText(src, src).text));
        assert.ok(sanitize.sanitizeMtCueText(src, src).flags.includes('source_echo'));

        // Real Chinese translation must pass
        assert.ok(!sanitize.looksLikeSourceEcho('今天由我皐月为您服务，客人是男士按摩店', src));
        assert.ok(!sanitize.isMostlyUntranslatedJa('哈啊…哈啊'));
        const okZh = sanitize.sanitizeMtCueText('今天由我皐月为您服务。', src);
        assert.ok(okZh.text.includes('今天由我皐月为您服务'), okZh.text);
        assert.ok(!okZh.flags.includes('source_echo'));

        // Chinese identity is NOT a JA source-echo (avoid false "未译出")
        assert.ok(!sanitize.looksLikeSourceEcho('哈啊…哈啊', '哈啊…哈啊'));
        assert.ok(!sanitize.isBlankOrPunctTranslation('哈啊…哈啊', '哈啊…哈啊'));
        assert.ok(!sanitize.sourceLooksLikeJapanese('哈啊…哈啊'));
    });

    it('strips 译名表 / glossary-dump echoes (Sakura first-cue)', () => {
        const dump = '（译名表：按摩油：按摩油，按摩：按摩，按摩店：男士按摩店）：';
        assert.ok(sanitize.looksLikeGlossaryDump(dump));
        assert.ok(sanitize.looksLikePromptLeak(dump));
        assert.ok(sanitize.isBlankOrPunctTranslation(dump));
        assert.strictEqual(sanitize.stripPromptLeak(dump).text, '');
        assert.ok(['', '…'].includes(
            sanitize.sanitizeMtCueText(dump, '本日担当させていただきます皐月と申しますお客様は男士按摩店').text,
        ));

        const dump2 = '译名表：オイル：按摩油，メンズエステ：男士按摩店';
        assert.ok(sanitize.looksLikePromptLeak(dump2));
        assert.ok(['', '…'].includes(sanitize.sanitizeMtCueText(dump2, 'メンズエステへようこそ').text));

        // Single lexicon-line echoes (HMN-878 Sakura first cues)
        for (const line of [
            '哈啊->哈啊 #喘息/泄气',
            FIX.climaxGlossMeta,
            FIX.hameGloss,
            'メンエス->男士按摩店',
            'ほぐす->放松推拿 #勿译放松',
            '将下面术语表翻译成中文',
            '，翻译的行数是1行，请不要超过',
        ]) {
            assert.ok(sanitize.looksLikePromptLeak(line) || sanitize.looksLikeGlossaryDump(line), line);
            assert.ok(
                ['', '…'].includes(sanitize.sanitizeMtCueText(line, FIX.notSoaplandSrcJa).text),
                line,
            );
        }
        // Real dialogue with a single colon must not trip
        assert.ok(!sanitize.looksLikeGlossaryDump('时间：三点见'));
        assert.ok(!sanitize.looksLikePromptLeak('我是男士按摩店的服务员'));
    });

    it('strips paraphrased glossary force-translate leaks (Sakura first-cue)', () => {
        const paraphrased = '根据以下的英文描述，请在不翻译任何注释的情况下，将它翻译成「哈啊」，请勿翻译成别的词。如果描述中含有的单词不在此。';
        assert.ok(sanitize.looksLikePromptLeak(paraphrased));
        assert.ok(sanitize.isBlankOrPunctTranslation(paraphrased));
        assert.ok(sanitize.isPathologicalMtText(paraphrased, 'はぁ'));

        const stripped = sanitize.stripPromptLeak(paraphrased);
        assert.ok(stripped.leaked);
        assert.strictEqual(stripped.text, '');

        const out = sanitize.sanitizeMtCueText(paraphrased, 'はぁ');
        assert.ok(out.flags.includes('prompt_leak'));
        assert.ok(['', '…'].includes(out.text));

        const batch = sanitize.sanitizeMtCues(
            [
                { index: 0, text: paraphrased },
                { index: 1, text: '哈啊' },
            ],
            [
                { index: 0, text: 'はぁ' },
                { index: 1, text: 'はぁっ' },
            ],
        );
        assert.ok(['', '…'].includes(batch.cues[0].text));
        assert.strictEqual(batch.cues[1].text, '哈啊');
        assert.ok(batch.flags.prompt_leak >= 1);

        // Real short moan translation must not be flagged
        assert.ok(!sanitize.looksLikePromptLeak('哈啊'));
        assert.ok(!sanitize.looksLikePromptLeak('哈啊…好舒服'));

        const paraphrased2 = '根据以下的翻译记录，我将之照译出来，你无须复译';
        assert.ok(sanitize.looksLikePromptLeak(paraphrased2));
        assert.ok(['', '…'].includes(
            sanitize.sanitizeMtCueText(paraphrased2, '本日担当させていただきます。').text,
        ));

        const paraphrased3 = FIX.promptPenisMeta;
        assert.ok(sanitize.looksLikePromptLeak(paraphrased3));
        assert.ok(['', '…'].includes(
            sanitize.sanitizeMtCueText(paraphrased3, 'あもう出ちゃったんですか?').text,
        ));
    });

    it('strips NSFW / faithful system-prompt echoes (first cue)', () => {
        const truncated = '我是日译中字幕翻译。按汉化组习惯忠实传达语气，含成人向内容。严禁净化、和谐或委婉改写性相关与粗俗用语；术语表有的';
        assert.ok(sanitize.looksLikePromptLeak(truncated));
        assert.ok(sanitize.isBlankOrPunctTranslation(truncated));
        assert.strictEqual(sanitize.stripPromptLeak(truncated).text, '');
        assert.ok(['', '…'].includes(sanitize.sanitizeMtCueText(truncated, 'こんにちは').text));

        const fullHead = '你是日译中字幕翻译。按汉化组习惯忠实传达语气，含成人向内容。严禁净化、和谐或委婉改写性相关与粗俗用语；术语表有的敏感词必须按表统一。';
        assert.ok(sanitize.looksLikePromptLeak(fullHead));
        assert.ok(['', '…'].includes(sanitize.sanitizeMtCueText(fullHead, 'あっ').text));

        const faithful = '忠实语气模式（已开启）：按成人向/R 级影视本地化标准忠实传达原文。保留脏话等级、粗口、性相关与暴力相关语义；禁止净化、禁止医学化/委婉改写。';
        assert.ok(sanitize.looksLikePromptLeak(faithful));
        assert.ok(['', '…'].includes(sanitize.sanitizeMtCueText(faithful, 'くそ').text));

        // Ordinary dialogue must not trip on a single soft word
        assert.ok(!sanitize.looksLikePromptLeak('别净化空气了，开窗吧'));
        assert.ok(!sanitize.looksLikePromptLeak('术语表后面还有附录'));
    });

    it('strips single-char trailing names and orphan quotes', () => {
        const a = sanitize.stripTrailingOrphanName('好厉害啊，感觉有点奇怪。 玲', 'すごかったよ今なんか染みてきた');
        assert.ok(a.changed);
        assert.ok(!a.text.includes('玲'));

        // うまい must NOT justify trailing 舞 via まい false-positive
        const b = sanitize.stripTrailingOrphanName('呜。 舞', 'うまい。');
        assert.ok(b.changed);
        assert.ok(!b.text.includes('舞'), b.text);

        const q = sanitize.stripMtArtifacts('啊哈哈，这样也不错嘛。 」');
        assert.ok(q.changed);
        assert.ok(!q.text.includes('」'));
    });

    it('collapses pathological repetition loops', () => {
        const loop = `不要笑我啊 ${'笑我'.repeat(80)}`;
        const out = sanitize.sanitizeMtCueText(loop, '笑わせるつもりなんかなくて');
        assert.ok(out.changed);
        assert.ok(out.flags.includes('repeat'));
        assert.ok(out.text.length < 40, out.text);
        assert.ok(out.text.includes('笑我'));
    });

    it('collapses 上班的班的 style de-phrase echoes', () => {
        const raw = '在小小的旅行社上班的班的真琴小姐，和我结婚后过了五年';
        const out = sanitize.sanitizeMtCueText(raw, '小さな旅行代理店で同僚として働いていた真琴さんと結婚して');
        assert.ok(out.changed);
        assert.ok(out.flags.includes('de_phrase_echo'), out.flags);
        assert.ok(!/上班的班的/.test(out.text), out.text);
        assert.ok(out.text.includes('真琴'), out.text);

        const dup = sanitize.collapseDePhraseEchoes('朋友的朋友的来了');
        assert.ok(dup.changed);
        assert.strictEqual(dup.text, '朋友的来了');
    });

    it('caps length explosions vs short source', () => {
        const huge = '啊'.repeat(400);
        const out = sanitize.sanitizeMtCueText(huge, 'あっ');
        assert.ok(out.changed);
        assert.ok(out.text.length < 120, String(out.text.length));
    });

    it('sanitizes cue batches by index', () => {
        const result = sanitize.sanitizeMtCues(
            [
                { index: 0, text: `好舒服${'好舒服'.repeat(60)}` },
                { index: 1, text: '正常对白。 玲奈' },
                { index: 2, text: 'Gloss2592。 佳奈' },
            ],
            [
                { index: 0, text: 'いいよいっぱいきもちよくなって' },
                { index: 1, text: '普通の台詞' },
                { index: 2, text: 'きれいなお店。' },
            ],
        );
        assert.ok(result.changed >= 2);
        assert.ok(result.cues[0].text.length < 40);
        assert.ok(!result.cues[1].text.includes('玲奈'));
        assert.ok(!/Gloss/i.test(result.cues[2].text));
        assert.ok(!result.cues[2].text.includes('佳奈'));
    });

    it('detects pathological MT text', () => {
        assert.ok(sanitize.isPathologicalMtText('笑我'.repeat(100), '何してるの'));
        assert.ok(sanitize.isPathologicalMtText('Gloss12 here', 'a'));
        assert.ok(!sanitize.isPathologicalMtText('你好', 'こんにちは'));
    });

    it('unifies glossary name aliases to canonical', () => {
        const result = sanitize.sanitizeMtCues(
            [
                { index: 0, text: '花菜小姐今天来了' },
                { index: 1, text: '华小姐在大厅' },
                { index: 2, text: '北野同学好' },
            ],
            [
                { index: 0, text: '花さんが来た' },
                { index: 1, text: '花さんはホールに' },
                { index: 2, text: '北野くんこんにちは' },
            ],
            {
                glossaryTerms: [
                    {
                        term: '仓木花',
                        aliases: ['花菜小姐', '华小姐', '花奈', '花菜'],
                    },
                ],
                unifyNames: true,
            },
        );
        assert.ok(result.cues[0].text.includes('仓木花'));
        assert.ok(!result.cues[0].text.includes('花菜'));
        assert.ok(result.cues[1].text.includes('仓木花'));
        assert.ok(!result.cues[1].text.includes('华小姐'));
        assert.ok(result.flags.name_unify >= 1);
    });

    it('infers name consistency from JA honorific co-occurrence', () => {
        const result = sanitize.sanitizeMtCues(
            [
                { index: 0, text: '仓木同学辛苦了' },
                { index: 1, text: '仓木小姐在吗' },
                { index: 2, text: '仓木同学请等一下' },
            ],
            [
                { index: 0, text: '倉木さんお疲れ' },
                { index: 1, text: '倉木さんいる？' },
                { index: 2, text: '倉木さんちょっと' },
            ],
            { unifyNames: true },
        );
        const forms = result.cues.map((c) => c.text);
        // Majority is 仓木同学 (2) → 仓木小姐 should become 仓木同学
        assert.ok(forms.every((t) => t.includes('仓木同学')));
        assert.ok(forms.every((t) => !t.includes('仓木小姐')));
    });

    it('applies explicit nameMap overrides', () => {
        const named = sanitize.applyNameConsistency('花乃学姐来了', [
            { from: '花乃学姐', to: '仓木花' },
        ]);
        assert.ok(named.changed);
        assert.strictEqual(named.text, '仓木花来了');
    });

    it('corrects JA mens-esthe ASR mishears before MT justify', () => {
        const a = sanitize.correctJaAsrDomainMishears(FIX.notSoaplandSrcJa);
        assert.ok(a.changed);
        assert.ok(a.text.includes('メンエス'));
        assert.ok(!a.text.includes('免税'));

        const b = sanitize.correctJaAsrDomainMishears('さあ本島より追加しましたね。');
        assert.ok(b.text.includes('オイル'));
        assert.ok(!b.text.includes('本島'));

        const c = sanitize.correctJaAsrDomainMishearsInCues([
            { index: 0, text: 'メンズレスト来られるんですか?' },
            { index: 1, text: '普通の台詞' },
        ]);
        assert.strictEqual(c.changed, 1);
        assert.ok(c.cues[0].text.includes('メンズエステ'));
    });

    it('corrects MIDA-762 style JA ASR adult / soft domain mishears', () => {
        const batch = sanitize.correctJaAsrDomainMishears(FIX.midaAsrBatchJa);
        assert.ok(batch.changed);
        for (const expect of FIX.midaAsrExpect) {
            assert.ok(batch.text.includes(expect), 'missing expected ASR fix');
        }
        for (const gone of FIX.midaAsrGone) {
            assert.ok(!batch.text.includes(gone), 'ASR mishear remnant');
        }
        assert.ok(!batch.text.includes('一日の形'));
        assert.ok(!batch.text.includes('サイジ'));

        const koufun = sanitize.correctJaAsrDomainMishears(FIX.kounyuMishearJa);
        assert.ok(koufun.changed);
        assert.strictEqual(koufun.text, FIX.koufunCorrectJa);
    });

    it('corrects MIDA-734 climax / nipple / swollen domain + ASR', () => {
        const asrNama = sanitize.correctJaAsrDomainMishears(FIX.namaIkuJa);
        assert.ok(asrNama.changed);
        const nama = sanitize.correctZhDomainMistranslations(FIX.namaIkuBadZh, asrNama.text);
        assert.ok(nama.changed);
        assert.strictEqual(nama.text, FIX.namaIkuOkZh);

        const asrQ = sanitize.correctJaAsrDomainMishears(FIX.namaIkuQJa);
        assert.ok(asrQ.changed);
        const namaQ = sanitize.correctZhDomainMistranslations(FIX.namaIkuQBadZh, asrQ.text);
        assert.ok(namaQ.changed);
        assert.strictEqual(namaQ.text, FIX.namaIkuQOkZh);

        const ear = sanitize.correctZhDomainMistranslations(FIX.earBadZh, FIX.chikubiLineJa);
        assert.ok(ear.changed);
        assert.strictEqual(ear.text, FIX.nippleOkZh);

        const asrKin = sanitize.correctJaAsrDomainMishears(FIX.kinpanJa);
        assert.ok(asrKin.changed);
        assert.ok(asrKin.text.includes(opaque.T.chinpoJa));
        const kin = sanitize.correctZhDomainMistranslations(FIX.kinpanBadZh, asrKin.text);
        assert.ok(kin.changed);
        assert.strictEqual(kin.text, FIX.kinpanOkZh);

        const ochin = sanitize.correctJaAsrDomainMishears(FIX.ochinjuJa);
        assert.ok(ochin.changed);
        assert.strictEqual(ochin.text, FIX.ochinjuFixed);
    });

    it('corrects MIDA-730 face-cum / acchi / ear-bat ASR + truncated feel-good', () => {
        const face = sanitize.correctZhDomainMistranslations(FIX.faceCumBadZh, FIX.faceCumLineJa);
        assert.ok(face.changed);
        assert.strictEqual(face.text, FIX.faceCumOkZh);

        const iku = sanitize.correctZhDomainMistranslations(FIX.ikuDashiteBadZh, FIX.ikuDashiteJa);
        assert.ok(iku.changed);
        assert.strictEqual(iku.text, FIX.ikuDashiteOkZh);

        const acchi = sanitize.correctZhDomainMistranslations(FIX.acchiBadZh, FIX.acchiLineJa);
        assert.ok(acchi.changed);
        assert.strictEqual(acchi.text, FIX.acchiOkZh);

        const earBat = sanitize.correctJaAsrDomainMishears(FIX.earBatJa);
        assert.ok(earBat.changed);
        assert.strictEqual(earBat.text, FIX.earBatFixed);

        const trunc = sanitize.sanitizeMtCueText(FIX.truncFeelBadZh, FIX.truncFeelJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(trunc.changed);
        assert.ok(trunc.flags.includes('truncated_reactive'));
        assert.strictEqual(trunc.text, FIX.truncFeelOkZh);
    });

    it('corrects MIDA-729 chinpo euphemisms / toro / ahaha truncation + ASR', () => {
        const balls = sanitize.correctZhDomainMistranslations(FIX.chinpoBallsBadZh, FIX.chinpoBallsJa);
        assert.ok(balls.changed);
        assert.strictEqual(balls.text, FIX.chinpoBallsOkZh);

        const erect = sanitize.correctZhDomainMistranslations(FIX.chinpoErectBadZh, FIX.chinpoErectJa);
        assert.ok(erect.changed);
        assert.strictEqual(erect.text, FIX.chinpoErectOkZh);

        const toro = sanitize.correctZhDomainMistranslations(FIX.toroBadZh, FIX.toroLineJa);
        assert.ok(toro.changed);
        assert.strictEqual(toro.text, FIX.toroOkZh);

        const ahahaIku = sanitize.sanitizeMtCueText(FIX.ahahaIkuBadZh, FIX.ahahaIkuJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(ahahaIku.flags.includes('truncated_reactive'));
        assert.strictEqual(ahahaIku.text, FIX.ahahaIkuOkZh);

        const ahahaFeel = sanitize.sanitizeMtCueText(FIX.ahahaFeelBadZh, FIX.ahahaFeelJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(ahahaFeel.flags.includes('truncated_reactive'));
        assert.strictEqual(ahahaFeel.text, FIX.ahahaFeelOkZh);

        const trail = sanitize.sanitizeMtCueText(FIX.trailIkuBadZh, FIX.trailIkuJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(trail.flags.includes('truncated_reactive'));
        assert.strictEqual(trail.text, FIX.trailIkuOkZh);

        const ikemen = sanitize.correctJaAsrDomainMishears(FIX.ikemenChinJa);
        assert.ok(ikemen.changed);
        assert.strictEqual(ikemen.text, FIX.ikemenChinFixed);

        const ikucha = sanitize.correctJaAsrDomainMishears(FIX.ikuchaDupJa);
        assert.ok(ikucha.changed);
        assert.strictEqual(ikucha.text, FIX.ikuchaDupFixed);
    });

    it('recovers adult dialogue blanked to ellipsis / source-echo', () => {
        const ja = FIX.wantSexDayJa;
        const ok = FIX.wantSexDayOkZh;
        for (const bad of ['…', '...', '', '表示省略或遮挡的内容', ja]) {
            const out = sanitize.sanitizeMtCueText(bad, ja, { contentProfile: 'av_soft' });
            assert.strictEqual(out.text, ok, `input=${JSON.stringify(bad)}`);
            assert.ok(out.flags.includes('blank_adult_recover'));
        }
        // Mid-scene fake greeting blanks stay as ellipsis
        const greet = sanitize.sanitizeMtCueText('早上好。', 'おはようございます。', {
            contentProfile: 'av_soft',
            cueIndex: 100,
            totalCues: 200,
        });
        assert.strictEqual(greet.text, '…');
        assert.ok(greet.flags.includes('fake_greeting'));
    });

    it('corrects MIDA-728 sex euphemism / iku-as-shoot / chin-chick / chu trunc', () => {
        const sex = sanitize.correctZhDomainMistranslations(FIX.sexEuphemBadZh, FIX.sexEuphemJa);
        assert.ok(sex.changed);
        assert.strictEqual(sex.text, FIX.sexEuphemOkZh);

        const asa = sanitize.correctZhDomainMistranslations(FIX.asaSexBadZh, FIX.asaSexJa);
        assert.ok(asa.changed);
        assert.strictEqual(asa.text, FIX.asaSexOkZh);

        const iku = sanitize.correctZhDomainMistranslations(FIX.ikuShootBadZh, FIX.ikuShootJa);
        assert.ok(iku.changed);
        assert.strictEqual(iku.text, FIX.ikuShootOkZh);

        const chin = sanitize.correctZhDomainMistranslations(FIX.chinChickBadZh, FIX.chinChickJa);
        assert.ok(chin.changed);
        assert.strictEqual(chin.text, FIX.chinChickOkZh);

        const omanko = sanitize.correctZhDomainMistranslations(FIX.omankoBadZh, FIX.omankoJa);
        assert.ok(omanko.changed);
        assert.strictEqual(omanko.text, FIX.omankoOkZh);

        const chu = sanitize.sanitizeMtCueText(FIX.chuBadZh, FIX.chuLineJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(chu.flags.includes('truncated_reactive'));
        assert.strictEqual(chu.text, FIX.chuOkZh);

        const blank = sanitize.sanitizeMtCueText('…', FIX.wantSexDayJa, {
            contentProfile: 'av_soft',
        });
        assert.strictEqual(blank.text, FIX.wantSexDayOkZh);
    });

    it('recovers MBDD-2185 blank / trunc stubs and negation flips', () => {
        const oliver = sanitize.sanitizeMtCueText('…', FIX.oliverFeelJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(oliver.flags.includes('blank_adult_recover'));
        assert.strictEqual(oliver.text, FIX.oliverFeelOkZh);

        const genki = sanitize.sanitizeMtCueText('哥哥，', FIX.genkiNatteJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(genki.flags.includes('truncated_reactive'));
        assert.strictEqual(genki.text, FIX.genkiNatteOkZh);

        const itazura = sanitize.sanitizeMtCueText('哥哥，', FIX.itazuraJa, {
            contentProfile: 'av_soft',
        });
        assert.strictEqual(itazura.text, FIX.itazuraOkZh);

        const hora = sanitize.sanitizeMtCueText('来，', FIX.horaGenkiJa, {
            contentProfile: 'av_soft',
        });
        assert.strictEqual(hora.text, FIX.horaGenkiOkZh);

        const kasa = sanitize.sanitizeMtCueText('完了，', FIX.kasanatteruJa, {
            contentProfile: 'av_soft',
        });
        assert.strictEqual(kasa.text, FIX.kasanatteruOkZh);

        const naka = sanitize.correctZhDomainMistranslations(FIX.nakanaideBadZh, FIX.nakanaideJa);
        assert.ok(naka.changed);
        assert.strictEqual(naka.text, FIX.nakanaideOkZh);

        const meccha = sanitize.correctZhDomainMistranslations(FIX.mecchaIiBadZh, FIX.mecchaIiJa);
        assert.ok(meccha.changed);
        assert.strictEqual(meccha.text, FIX.mecchaIiOkZh);

        const nayama = sanitize.sanitizeMtCueText(FIX.nayamashiiBadZh, FIX.nayamashiiJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(nayama.flags.includes('truncated_reactive'));
        assert.strictEqual(nayama.text, FIX.nayamashiiOkZh);
    });

    it('corrects YUJ-069 ASR / adult blanks / sefri / chin-dup / chappy', () => {
        const asrChin = sanitize.correctJaAsrDomainMishears(FIX.ochinchinWaitJa);
        assert.ok(asrChin.changed);
        assert.strictEqual(asrChin.text, FIX.ochinchinWaitFixedJa);

        const asrSefri = sanitize.correctJaAsrDomainMishears(`うん。 ${FIX.shifureJa}${FIX.sefriSexJaSuffix}`);
        assert.ok(asrSefri.changed);
        assert.ok(asrSefri.text.includes(FIX.sefriJa));
        assert.ok(!asrSefri.text.includes(FIX.shifureJa));

        const blankNipple = sanitize.sanitizeMtCueText('…', FIX.nippleChinkoBlankJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(blankNipple.flags.includes('blank_adult_recover') || blankNipple.flags.includes('truncated_reactive'));
        assert.strictEqual(blankNipple.text, FIX.nippleChinkoOkZh);

        const blankWait = sanitize.sanitizeMtCueText('…', FIX.ochinchinWaitJa, {
            contentProfile: 'av_soft',
        });
        assert.strictEqual(blankWait.text, FIX.ochinchinWaitOkZh);

        const blankChappy = sanitize.sanitizeMtCueText('…', FIX.chappyCallJa, {
            contentProfile: 'av_soft',
        });
        assert.strictEqual(blankChappy.text, FIX.chappyCallOkZh);

        const thanks = sanitize.sanitizeMtCueText(FIX.chappyThanksBadZh, FIX.chappyThanksJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(thanks.flags.includes('truncated_reactive'));
        assert.strictEqual(thanks.text, FIX.chappyThanksOkZh);

        const nameru = sanitize.correctZhDomainMistranslations(FIX.nameruWakeBadZh, FIX.nameruWakeJa);
        assert.ok(nameru.changed);
        assert.strictEqual(nameru.text, FIX.nameruWakeOkZh);

        const chin = sanitize.correctZhDomainMistranslations(FIX.chinDupBadZh, FIX.chinDupJa);
        assert.ok(chin.changed);
        assert.strictEqual(chin.text, FIX.chinDupOkZh);

        const iku = sanitize.correctZhDomainMistranslations(FIX.ikuNippleBadZh, FIX.ikuNippleJa);
        assert.ok(iku.changed);
        assert.strictEqual(iku.text, FIX.ikuNippleOkZh);
    });

    it('batch residuals: hira-chin / ikusou / torottoro / ouchin ASR / blank iku', () => {
        const chin = sanitize.correctZhDomainMistranslations(FIX.hiraChinBadZh, FIX.hiraChinJa);
        assert.ok(chin.changed);
        assert.strictEqual(chin.text, FIX.hiraChinOkZh);

        const ikuSou = sanitize.correctZhDomainMistranslations(FIX.ikuSouBadZh, FIX.ikuSouJa);
        assert.ok(ikuSou.changed);
        assert.strictEqual(ikuSou.text, FIX.ikuSouOkZh);

        const ika = sanitize.correctZhDomainMistranslations(FIX.ikaSareBadZh, FIX.ikaSareJa);
        assert.ok(ika.changed);
        assert.strictEqual(ika.text, FIX.ikaSareOkZh);

        const balls = sanitize.correctZhDomainMistranslations(FIX.ballsChinBadZh, FIX.ballsChinJa);
        assert.ok(balls.changed);
        assert.strictEqual(balls.text, FIX.ballsChinOkZh);

        const toro = sanitize.correctZhDomainMistranslations(FIX.torottoroBadZh, FIX.torottoroJaFix);
        assert.ok(toro.changed);
        assert.strictEqual(toro.text, FIX.torottoroOkZh);

        const asr = sanitize.correctJaAsrDomainMishears(FIX.ouchinJa);
        assert.ok(asr.changed);
        assert.strictEqual(asr.text, FIX.ouchinFixed);
        const ouchin = sanitize.correctZhDomainMistranslations(FIX.ouchinBadZh, asr.text);
        assert.ok(ouchin.changed);
        assert.strictEqual(ouchin.text, FIX.ouchinOkZh);

        const blank = sanitize.sanitizeMtCueText('…', FIX.blankIkuJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(blank.flags.includes('blank_adult_recover') || blank.flags.includes('truncated_reactive'));
        assert.strictEqual(blank.text, FIX.blankIkuOkZh);
    });

    it('CAWD-999 / ADN-801: milk / view-spurt / choudai / iku-go / blanks', () => {
        const milk = sanitize.correctZhDomainMistranslations(FIX.chinpoMilkBadZh, FIX.chinpoMilkJa);
        assert.ok(milk.changed);
        assert.strictEqual(milk.text, FIX.chinpoMilkOkZh);

        const hold = sanitize.correctZhDomainMistranslations(FIX.cantHoldMilkBadZh, FIX.cantHoldMilkJa);
        assert.ok(hold.changed);
        assert.strictEqual(hold.text, FIX.cantHoldMilkOkZh);

        const view = sanitize.correctZhDomainMistranslations(FIX.viewSpurtBadZh, FIX.viewSpurtJa);
        assert.ok(view.changed);
        assert.strictEqual(view.text, FIX.viewSpurtOkZh);

        const choudai = sanitize.correctZhDomainMistranslations(FIX.choudaiHallBadZh, FIX.choudaiHallJa);
        assert.ok(choudai.changed);
        assert.strictEqual(choudai.text, FIX.choudaiHallOkZh);

        const itta = sanitize.correctZhDomainMistranslations(FIX.ittaBadZh, FIX.ittaJa);
        assert.ok(itta.changed);
        assert.strictEqual(itta.text, FIX.ittaOkZh);

        const ikitai = sanitize.correctZhDomainMistranslations(FIX.ikitaiBadZh, FIX.ikitaiJa);
        assert.ok(ikitai.changed);
        assert.strictEqual(ikitai.text, FIX.ikitaiOkZh);

        const ikuBare = sanitize.correctZhDomainMistranslations(FIX.ikuBareBadZh, FIX.ikuBareJa);
        assert.ok(ikuBare.changed);
        assert.strictEqual(ikuBare.text, FIX.ikuBareOkZh);

        const thanks = sanitize.sanitizeMtCueText('…', FIX.arigatouHaiJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(thanks.flags.includes('blank_adult_recover') || thanks.flags.includes('truncated_reactive'));
        assert.strictEqual(thanks.text, FIX.arigatouHaiOkZh);

        const dame = sanitize.sanitizeMtCueText('…', FIX.mouDameJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(dame.flags.includes('blank_adult_recover') || dame.flags.includes('truncated_reactive'));
        assert.strictEqual(dame.text, FIX.mouDameOkZh);

        const warui = sanitize.sanitizeMtCueText('…', FIX.kimochiWaruiJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(warui.flags.includes('blank_adult_recover') || warui.flags.includes('truncated_reactive'));
        assert.strictEqual(warui.text, FIX.kimochiWaruiOkZh);

        const moan = sanitize.sanitizeMtCueText('…', FIX.moanBlankJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(moan.flags.includes('blank_adult_recover') || moan.flags.includes('truncated_reactive'));
        assert.strictEqual(moan.text, FIX.moanBlankOkZh);
    });

    it('ADN-798/791 + residuals: milk ASR / nakadashi / sefri / iku-start / blanks', () => {
        const chinpaAsr = sanitize.correctJaAsrDomainMishears(FIX.chinpaMilkJa);
        assert.ok(chinpaAsr.changed);
        assert.strictEqual(chinpaAsr.text, FIX.chinpaMilkFixedJa);
        const chinpa = sanitize.correctZhDomainMistranslations(FIX.chinpaMilkBadZh, chinpaAsr.text);
        assert.ok(chinpa.changed);
        assert.strictEqual(chinpa.text, FIX.chinpaMilkOkZh);

        const coatAsr = sanitize.correctJaAsrDomainMishears(FIX.coatMilkJa);
        assert.ok(coatAsr.changed);
        assert.strictEqual(coatAsr.text, FIX.coatMilkFixedJa);
        const coat = sanitize.correctZhDomainMistranslations(FIX.coatMilkBadZh, coatAsr.text);
        assert.ok(coat.changed);
        assert.strictEqual(coat.text, FIX.coatMilkOkZh);

        const hard = sanitize.correctZhDomainMistranslations(FIX.hardOchinBadZh, FIX.hardOchinJa);
        assert.ok(hard.changed);
        assert.strictEqual(hard.text, FIX.hardOchinOkZh);

        const nakaAsr = sanitize.correctJaAsrDomainMishears(FIX.nakadashiSexJa);
        assert.ok(nakaAsr.changed);
        assert.ok(nakaAsr.text.includes(opaque.T.nakadashiJa));
        const naka = sanitize.correctZhDomainMistranslations(FIX.nakadashiSexBadZh, nakaAsr.text);
        assert.ok(naka.changed);
        assert.strictEqual(naka.text, FIX.nakadashiSexOkZh);

        const seed = sanitize.correctZhDomainMistranslations(FIX.seedSexBadZh, FIX.seedSexJa);
        assert.ok(seed.changed);
        assert.strictEqual(seed.text, FIX.seedSexOkZh);

        const ikuStart = sanitize.correctZhDomainMistranslations(FIX.ikuStartBadZh, FIX.ikuStartJa);
        assert.ok(ikuStart.changed);
        assert.strictEqual(ikuStart.text, FIX.ikuStartOkZh);

        const dash = sanitize.correctZhDomainMistranslations(FIX.dashichauComeBadZh, FIX.dashichauComeJa);
        assert.ok(dash.changed);
        assert.strictEqual(dash.text, FIX.dashichauComeOkZh);

        const sefri = sanitize.correctZhDomainMistranslations(FIX.sefriLineBadZh, FIX.sefriLineJa);
        assert.ok(sefri.changed);
        assert.strictEqual(sefri.text, FIX.sefriLineOkZh);

        const kin = sanitize.correctZhDomainMistranslations(FIX.kintamaTestBadZh, FIX.kintamaTestJa);
        assert.ok(kin.changed);
        assert.strictEqual(kin.text, FIX.kintamaTestOkZh);

        const lick = sanitize.correctZhDomainMistranslations(FIX.lickDadBadZh, FIX.lickDadJa);
        assert.ok(lick.changed);
        assert.strictEqual(lick.text, FIX.lickDadOkZh);

        const ugok = sanitize.sanitizeMtCueText('…', FIX.ugokanaiBlankJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(ugok.flags.includes('blank_adult_recover') || ugok.flags.includes('truncated_reactive'));
        assert.strictEqual(ugok.text, FIX.ugokanaiBlankOkZh);
    });

    it('expands adult domain: orgasm/erect/oral/squirt/blanks', () => {
        const zec = sanitize.correctZhDomainMistranslations(FIX.zecchouBadZh, FIX.zecchouJa);
        assert.ok(zec.changed);
        assert.strictEqual(zec.text, FIX.zecchouOkZh);

        const erect = sanitize.correctZhDomainMistranslations(FIX.erectLineBadZh, FIX.erectLineJa);
        assert.ok(erect.changed);
        assert.strictEqual(erect.text, FIX.erectLineOkZh);

        const nakaOnly = sanitize.correctZhDomainMistranslations(FIX.nakaOnlyBadZh, FIX.nakaOnlyJa);
        assert.ok(nakaOnly.changed);
        assert.strictEqual(nakaOnly.text, FIX.nakaOnlyOkZh);

        const nakaIn = sanitize.correctZhDomainMistranslations(FIX.nakaInBadZh, FIX.nakaInJa);
        assert.ok(nakaIn.changed);
        assert.strictEqual(nakaIn.text, FIX.nakaInOkZh);

        const fella = sanitize.correctZhDomainMistranslations(FIX.fellaLineBadZh, FIX.fellaLineJa);
        assert.ok(fella.changed);
        assert.strictEqual(fella.text, FIX.fellaLineOkZh);

        const kunni = sanitize.correctZhDomainMistranslations(FIX.kunniLineBadZh, FIX.kunniLineJa);
        assert.ok(kunni.changed);
        assert.strictEqual(kunni.text, FIX.kunniLineOkZh);

        const tekoki = sanitize.correctZhDomainMistranslations(FIX.tekokiLineBadZh, FIX.tekokiLineJa);
        assert.ok(tekoki.changed);
        assert.strictEqual(tekoki.text, FIX.tekokiLineOkZh);

        const shio = sanitize.correctZhDomainMistranslations(FIX.shioLineBadZh, FIX.shioLineJa);
        assert.ok(shio.changed);
        assert.strictEqual(shio.text, FIX.shioLineOkZh);

        const gok = sanitize.correctZhDomainMistranslations(FIX.gokkunLineBadZh, FIX.gokkunLineJa);
        assert.ok(gok.changed);
        assert.strictEqual(gok.text, FIX.gokkunLineOkZh);

        const mango = sanitize.correctZhDomainMistranslations(FIX.mangoLineBadZh, FIX.mangoLineJa);
        assert.ok(mango.changed);
        assert.strictEqual(mango.text, FIX.mangoLineOkZh);

        const samen = sanitize.correctZhDomainMistranslations(FIX.samenLineBadZh, FIX.samenLineJa);
        assert.ok(samen.changed);
        assert.strictEqual(samen.text, FIX.samenLineOkZh);

        const asrFella = sanitize.correctJaAsrDomainMishears(FIX.fellaAsrJa);
        assert.ok(asrFella.changed);
        assert.strictEqual(asrFella.text, FIX.fellaAsrFixed);

        const asrTekoki = sanitize.correctJaAsrDomainMishears(FIX.tekokiAsrJa);
        assert.ok(asrTekoki.changed);
        assert.strictEqual(asrTekoki.text, FIX.tekokiAsrFixed);

        for (const [ja, ok] of [
            [FIX.yameteBlankJa, FIX.yameteBlankOkZh],
            [FIX.nakaInJa, FIX.nakaInOkZh],
            [FIX.ireteBlankJa, FIX.ireteBlankOkZh],
            [FIX.fukakuBlankJa, FIX.fukakuBlankOkZh],
            [FIX.ikuQBlankJa, FIX.ikuQBlankOkZh],
        ]) {
            const blank = sanitize.sanitizeMtCueText('…', ja, { contentProfile: 'av_soft' });
            assert.ok(
                blank.flags.includes('blank_adult_recover') || blank.flags.includes('truncated_reactive'),
                ja,
            );
            assert.strictEqual(blank.text, ok);
        }
    });

    it('ADN-801 blank recover: chew / growl / address / truncated insert', () => {
        const av = { contentProfile: 'av_soft', smartTranslateFaithfulTone: true };
        const cases = [
            ['むぐむぐ…', '嗯嗯'],
            ['モグモグ', '嗯嗯'],
            ['ガルルルル…', '呜呜'],
            ['ああ、そうだ', '啊，是啊'],
            ['いいです、ほら。', '可以，你看'],
            ['はぁ…はぁ…かわいい', '哈啊，好可爱'],
            ['んむぅ…あむぅ…', '嗯嗯'],
            ['オオォォッ!', '哦——！'],
            ['ジー…', '盯……'],
            ['あひっ、ひっ…!', '啊啊'],
            ['ああ、隊長。', '啊，队长'],
            ['ねえ、てんつー', '喂，てんつー'],
            ['はぁ…だんなら…もっと入れて…', '哈啊，那就再插进来'],
        ];
        for (const [ja, ok] of cases) {
            const blank = sanitize.sanitizeMtCueText(ja.includes('入れて') ? '哈…' : '…', ja, av);
            assert.ok(
                blank.flags.includes('blank_adult_recover') || blank.flags.includes('truncated_reactive'),
                `${ja} → ${blank.text}`,
            );
            assert.strictEqual(blank.text, ok, ja);
        }
    });

    it('HODV-22089 blank recover: command / master greeting / damn / laugh', () => {
        const av = { contentProfile: 'av_soft', smartTranslateFaithfulTone: true, cueIndex: 100 };
        const cases = [
            ['かしこまりました…', '遵命'],
            ['はあっ…くそっ', '哈啊，该死'],
            ['大丈夫だってそんなこと気にしなくって', '没关系的，别在意那种事'],
            ['おはようございます、ご主人様', '早上好，主人'],
            ['フフフフフ…', '呵呵'],
            ['ぐびぐびぉ…', '嗯嗯'],
            ['あ… あぐううっ…!', '啊…'],
            ['いいです…', '可以'],
            ['えっと…', '那个…'],
        ];
        for (const [ja, ok] of cases) {
            const blank = sanitize.sanitizeMtCueText('…', ja, av);
            assert.ok(
                blank.flags.includes('blank_adult_recover') || blank.flags.includes('truncated_reactive'),
                `${ja} → ${blank.text}`,
            );
            assert.strictEqual(blank.text, ok, ja);
        }
    });

    it('skip-class discourse / bite / growl: common LLM miss patterns', () => {
        const av = { contentProfile: 'av_soft', smartTranslateFaithfulTone: true };
        const cases = [
            ['いや…', '不'],
            ['でも…', '但是'],
            ['だから…', '所以'],
            ['じゃあ…', '那就'],
            ['やっぱり…', '果然'],
            ['な…', '呐'],
            ['はむっ', '嗯嗯'],
            ['はむはむ…', '嗯嗯'],
            ['んぶっ!', '嗯嗯'],
            ['ダメ…', '不行'],
            ['駄目だよ', '不行'],
            ['お願いします', '拜托了'],
            ['グルルル…ッ!', '呜呜'],
            ['ジーッ', '盯'],
            ['えー…', '诶'],
            ['そうか', '是吗'],
        ];
        for (const [ja, ok] of cases) {
            const blank = sanitize.sanitizeMtCueText('…', ja, av);
            assert.ok(blank.text && blank.text !== '…', `${ja} → ${blank.text}`);
            // Trailing …… may be trimmed by pollution cleanup; accept stem match.
            const got = String(blank.text).replace(/[…·.。]+$/g, '');
            assert.strictEqual(got, ok, ja);
        }
    });

    it('FNS/HODV residuals: grandpa halluc / private-part / heixiu / sefri false-pos', () => {
        const grandpa = sanitize.correctZhDomainMistranslations(FIX.ikuGrandpaBadZh, FIX.ikuGrandpaJa);
        assert.ok(grandpa.changed);
        assert.strictEqual(grandpa.text, FIX.ikuGrandpaOkZh);

        const priv = sanitize.correctZhDomainMistranslations(FIX.omankoPrivateBadZh, FIX.omankoPrivateJa);
        assert.ok(priv.changed);
        assert.strictEqual(priv.text, FIX.omankoPrivateOkZh);

        const heixiu = sanitize.correctZhDomainMistranslations(FIX.heixiuLineBadZh, FIX.heixiuLineJa);
        assert.ok(heixiu.changed);
        assert.strictEqual(heixiu.text, FIX.heixiuLineOkZh);

        const below = sanitize.correctZhDomainMistranslations(FIX.belowThingBadZh, FIX.belowLickJa);
        assert.ok(below.changed);
        assert.strictEqual(below.text, FIX.belowThingOkZh);

        const sefriFalse = sanitize.correctZhDomainMistranslations(FIX.sefriFalseZh, FIX.sefriFalseJa);
        assert.ok(!sefriFalse.changed || !String(sefriFalse.text).includes('炮友'));
        assert.strictEqual(sefriFalse.text, FIX.sefriFalseZh);

        const erect = sanitize.correctZhDomainMistranslations(FIX.erectShootBadZh, FIX.erectShootJa);
        assert.ok(erect.changed);
        assert.strictEqual(erect.text, FIX.erectShootOkZh);

        const milk = sanitize.correctZhDomainMistranslations(FIX.milkOnlyBadZh, FIX.milkOnlyJa);
        assert.ok(milk.changed);
        assert.strictEqual(milk.text, FIX.milkOnlyOkZh);

        const oji = sanitize.correctJaAsrDomainMishears(FIX.ojiChinAsrJa);
        assert.ok(oji.changed);
        assert.strictEqual(oji.text, FIX.ojiChinAsrFixed);

        // existing sefri truncation still works
        const sefri = sanitize.correctZhDomainMistranslations(FIX.sefriLineBadZh, FIX.sefriLineJa);
        assert.ok(sefri.changed);
        assert.strictEqual(sefri.text, FIX.sefriLineOkZh);
    });

    it('ADN-791: itchau-start / iku-done / penis / irete / jugyou ASR / dechai', () => {
        const itchau = sanitize.correctZhDomainMistranslations(FIX.itchaunStartBadZh, FIX.itchaunStartJa);
        assert.ok(itchau.changed);
        assert.strictEqual(itchau.text, FIX.itchaunStartOkZh);

        const done = sanitize.correctZhDomainMistranslations(FIX.ikuDoneBadZh, FIX.ikuDoneJa);
        assert.ok(done.changed);
        assert.strictEqual(done.text, FIX.ikuDoneOkZh);

        const penis = sanitize.correctZhDomainMistranslations(FIX.chinPenisBadZh, FIX.chinPenisJa);
        assert.ok(penis.changed);
        assert.strictEqual(penis.text, FIX.chinPenisOkZh);

        const irete = sanitize.correctZhDomainMistranslations(FIX.iretePleaseBadZh, FIX.iretePleaseJa);
        assert.ok(irete.changed);
        assert.strictEqual(irete.text, FIX.iretePleaseOkZh);

        const jugyouAsr = sanitize.correctJaAsrDomainMishears(FIX.jugyouAsrJa);
        assert.ok(jugyouAsr.changed);
        assert.strictEqual(jugyouAsr.text, FIX.jugyouAsrFixed);
        const jugyou = sanitize.correctZhDomainMistranslations(FIX.jugyouBadZh, jugyouAsr.text);
        assert.ok(jugyou.changed);
        assert.strictEqual(jugyou.text, FIX.jugyouOkZh);

        const dechaiAsr = sanitize.correctJaAsrDomainMishears(FIX.dechaiJa);
        assert.ok(dechaiAsr.changed);
        assert.strictEqual(dechaiAsr.text, FIX.dechaiFixed);
        const dechai = sanitize.correctZhDomainMistranslations(FIX.dechaiBadZh, dechaiAsr.text);
        assert.ok(dechai.changed);
        assert.strictEqual(dechai.text, FIX.dechaiOkZh);

        const kuchun = sanitize.sanitizeMtCueText('…', FIX.kuchunBlankJa, { contentProfile: 'av_soft' });
        assert.ok(kuchun.flags.includes('wet_sfx') || kuchun.flags.includes('wet_sfx_ja'));
        assert.ok(kuchun.text === '…' || kuchun.text === '');
    });

    it('ADN-798: Sakura trunc / anatomy halluc / wet SFX / moan remap', () => {
        const kirei = sanitize.sanitizeMtCueText('来吧', 'キれいだよ、ミカ…', {
            contentProfile: 'av_soft',
        });
        assert.ok(/漂亮/.test(kirei.text));

        const demo = sanitize.sanitizeMtCueText('不过', 'でも、綺麗だよ。', {
            contentProfile: 'av_soft',
        });
        assert.ok(/漂亮/.test(demo.text));

        const sugokirei = sanitize.sanitizeMtCueText('好厉害', 'すごきれいだ。', {
            contentProfile: 'av_soft',
        });
        assert.ok(/漂亮/.test(sugokirei.text));

        const meat = sanitize.sanitizeMtCueText(
            FIX.dadRodLineZh,
            'お父さんのだからいいんですよ…そんな…',
            { contentProfile: 'av_soft' },
        );
        assert.ok(!meat.text.includes(opaque.T.meatRodZh));
        assert.ok(/爸爸/.test(meat.text));

        const hip = sanitize.sanitizeMtCueText(
            '这次是…我的屁股吗？ 怎幺了？',
            '今度は私の…気持ちいいですか?何を…',
            { contentProfile: 'av_soft' },
        );
        assert.ok(!/屁股/.test(hip.text));
        assert.ok(/什么|怎么/.test(hip.text));

        const whyYao = sanitize.sanitizeMtCueText(
            '为什幺会这样？',
            'どうしてこうなるの？',
            { contentProfile: 'general' },
        );
        assert.strictEqual(whyYao.text, '为什么会这样？');

        const iachu = sanitize.sanitizeMtCueText('好厉害', 'いっ、いあちゅい', {
            contentProfile: 'av_soft',
        });
        assert.ok(iachu.text.includes(opaque.T.aboutToCumPlainZh));

        const moan = sanitize.sanitizeMtCueText('啊', 'はぁ、はぁ、はぁ…', {
            contentProfile: 'av_soft',
        });
        assert.ok(/哈啊/.test(moan.text));

        const wetMix = sanitize.sanitizeMtCueText(
            '哈啊，哈啊',
            'はあっ、はあっ…すごいよ、ちゅるるっ',
            { contentProfile: 'av_soft' },
        );
        assert.ok(/好厉害/.test(wetMix.text));
        assert.ok(!/啾|噜/.test(wetMix.text));

        const growl = sanitize.sanitizeMtCueText('咕噜噜噜', 'グルルル…', {
            contentProfile: 'av_soft',
        });
        assert.ok(growl.text === '…' || growl.text === '');
    });

    it('av_soft strips wet oral SFX but keeps moans', () => {
        const drop = sanitize.sanitizeMtCueText('咕咚、咕咚…咕咚', '…ごくっ、ごくっ…ごくっ', {
            contentProfile: 'av_soft',
        });
        assert.ok(drop.flags.includes('wet_sfx') || drop.flags.includes('wet_sfx_ja'));
        assert.ok(drop.text === '…' || drop.text === '');

        const chuu = sanitize.sanitizeMtCueText('啾、啾、啾吧、啾', '…ちゅっ、ちゅっ、ちゅぱっ、ちゅっ', {
            contentProfile: 'av_soft',
        });
        assert.ok(chuu.flags.includes('wet_sfx'));
        assert.ok(chuu.text === '…' || chuu.text === '');

        const mixed = sanitize.sanitizeMtCueText('呼…啾…哈', 'ふぅ…ちゅっ…はぁ…', {
            contentProfile: 'av_soft',
        });
        assert.ok(mixed.flags.includes('wet_sfx'));
        assert.ok(!/啾/.test(mixed.text));
        assert.ok(/呼/.test(mixed.text) && /哈/.test(mixed.text));

        const moan = sanitize.sanitizeMtCueText('哈…哈…那…啊…哈', 'はぁ…はぁ…た…ぁ…はぁ…', {
            contentProfile: 'av_soft',
        });
        assert.ok(!moan.flags.includes('wet_sfx'));
        assert.ok(/哈/.test(moan.text));

        const kissVerb = sanitize.stripWetOralSfxFromJa('ちゅうして');
        assert.strictEqual(kissVerb.changed, false);
        assert.strictEqual(kissVerb.text, 'ちゅうして');
    });

    it('MIDA-762: male-genital / dekachin-size / kintama-epididymis / porchio', () => {
        const genital = sanitize.correctZhDomainMistranslations(FIX.maleGenitalBadZh, FIX.maleGenitalJa);
        assert.ok(genital.changed);
        assert.strictEqual(genital.text, FIX.maleGenitalOkZh);

        const deka = sanitize.correctZhDomainMistranslations(FIX.dekaSizeBadZh, FIX.dekaSizeJa);
        assert.ok(deka.changed);
        assert.strictEqual(deka.text, FIX.dekaSizeOkZh);

        const kin = sanitize.correctZhDomainMistranslations(FIX.kintamaEpiBadZh, FIX.kintamaEpiJa);
        assert.ok(kin.changed);
        assert.strictEqual(kin.text, FIX.kintamaEpiOkZh);

        const porchio = sanitize.correctZhDomainMistranslations(FIX.porchioBadZh, FIX.porchioLineJa);
        assert.ok(porchio.changed);
        assert.strictEqual(porchio.text, FIX.porchioOkZh);

        const cue = sanitize.sanitizeMtCueText(
            FIX.clinicalRubZh,
            FIX.chinpoRubJa,
            { contentProfile: 'av_soft' },
        );
        assert.ok(cue.changed);
        assert.ok(cue.text.includes(opaque.T.meatRodZh));
        assert.ok(!cue.text.includes(opaque.T.genitalZh));

        // Compound clinical MT without ochin JA (ASR garbage cue)
        const compound = sanitize.correctZhDomainMistranslations(
            FIX.compoundGenitalBadZh,
            'っぱいさこつりつけていいこれ',
        );
        assert.ok(compound.changed);
        assert.strictEqual(compound.text, FIX.compoundGenitalOkZh);

        // Truncated カチン ASR tail
        const kachin = sanitize.correctZhDomainMistranslations(
            FIX.kachinGenitalBadZh,
            FIX.kachinGenitalJa,
        );
        assert.ok(kachin.changed);
        assert.strictEqual(kachin.text, FIX.kachinGenitalOkZh);

        // Anatomy → penis gender-flip
        const omanko = sanitize.correctZhDomainMistranslations(
            FIX.omankoPenisBadZh,
            FIX.omankoPenisJa,
        );
        assert.ok(omanko.changed);
        assert.strictEqual(omanko.text, FIX.omankoPenisOkZh);

        // Dual-phrase collapse: clinical compound → big rod (not duplicated)
        const dual = sanitize.sanitizeMtCueText(
            FIX.dualClinicalZh,
            FIX.dualClinicalJa,
            { contentProfile: 'av_soft' },
        );
        assert.ok(dual.changed);
        assert.strictEqual(dual.text, FIX.dualClinicalOkZh);
    });

    it('keeps clinical rod remaps without reopening ADN-798 hallucination strip', () => {
        // ADN-798: invented anatomy with no JA rod cue → strip
        const halluc = sanitize.sanitizeMtCueText(
            FIX.dadRodLineZh,
            'お父さんのだからいいんですよ…そんな…',
            { contentProfile: 'av_soft' },
        );
        assert.ok(!halluc.text.includes(opaque.T.meatRodZh));
        assert.ok(/爸爸/.test(halluc.text));

        // MIDA-762: clinical ZH → colloquial rod must survive even when JA ASR lost cue
        const clinical = sanitize.correctZhDomainMistranslations(
            FIX.compoundGenitalBadZh,
            'っぱいさこつりつけていいこれ',
        );
        assert.ok(clinical.changed);
        assert.strictEqual(clinical.text, FIX.compoundGenitalOkZh);
        assert.ok(!clinical.flags.includes('domain_hallucination'));

        const truncated = sanitize.sanitizeMtCueText(
            FIX.kachinGenitalBadZh,
            FIX.kachinGenitalJa,
            { contentProfile: 'av_soft' },
        );
        assert.ok(truncated.changed);
        assert.strictEqual(truncated.text, FIX.kachinGenitalOkZh);
    });

    it('fixes ZH domain mistranslations conditioned on JA source', () => {
        const oil = sanitize.correctZhDomainMistranslations(
            '这是防晒油吗？',
            'これオイルなの?',
        );
        assert.ok(oil.changed);
        assert.strictEqual(oil.text, '这是按摩油吗？');

        const muka = sanitize.correctZhDomainMistranslations(
            FIX.smallHoleLineZh,
            FIX.proneLineJa,
        );
        assert.ok(muka.changed);
        assert.ok(muka.text.includes(FIX.lieZh));
        assert.ok(!muka.text.includes(FIX.smallHoleZh));

        const hogu = sanitize.correctZhDomainMistranslations(
            FIX.keepOrgasmLineZh,
            FIX.hoguLineJa,
        );
        assert.ok(hogu.changed);
        assert.ok(!hogu.text.includes(FIX.orgasmZh));

        const kori = sanitize.correctZhDomainMistranslations(
            '好厉害的集中力啊',
            'すっごい凝ってますね。',
        );
        assert.ok(kori.changed);
        assert.ok(!kori.text.includes('集中力'));

        const menzei = sanitize.correctZhDomainMistranslations(
            '啊啊，你有办法免税入境吗？',
            'ああよくメンエスに来られるんですか?',
        );
        assert.ok(menzei.changed);
        assert.ok(!menzei.text.includes('免税'));
        assert.ok(menzei.text.includes('经常来男士按摩'), menzei.text);

        const refuse = sanitize.correctZhDomainMistranslations(
            FIX.refuseBadZh,
            FIX.noSexLineJa,
        );
        assert.ok(refuse.changed);
        assert.ok(refuse.text.includes(FIX.noSexServiceZh.replace('，', '')) || refuse.text.includes('不能提供'));

        // MIDA-762: euphemism / ASR-domain collapses
        const world = sanitize.correctZhDomainMistranslations(FIX.worldListBadZh, FIX.worldListJa);
        assert.ok(world.changed);
        assert.strictEqual(world.text, FIX.worldListOkZh);

        const chicken = sanitize.correctZhDomainMistranslations(FIX.chickenWantZh, FIX.dekachinWantJa);
        assert.ok(chicken.changed);
        assert.strictEqual(chicken.text, FIX.dekachinWantOkZh);

        const project = sanitize.correctZhDomainMistranslations(FIX.bigProjectLineZh, FIX.dekachinLineJa);
        assert.ok(project.changed);
        assert.ok(project.text.includes(FIX.bigRodPhraseZh));
        assert.ok(!project.text.includes('项目'));

        const kintama = sanitize.correctZhDomainMistranslations(FIX.kintamaBadZh, FIX.kintamaLineJa);
        assert.ok(kintama.changed);
        assert.strictEqual(kintama.text, FIX.kintamaOkZh);

        const asrChinku = sanitize.correctJaAsrDomainMishears(FIX.chinkuLineJa);
        assert.ok(asrChinku.changed);
        assert.ok(asrChinku.text.includes(FIX.chinkoMo));
        const chinkuZh = sanitize.correctZhDomainMistranslations(FIX.chinkuBadZh, asrChinku.text);
        assert.ok(chinkuZh.changed);
        assert.ok(!chinkuZh.text.includes('胸部'));

        const iku = sanitize.correctZhDomainMistranslations(FIX.ikuBadZh, FIX.ikuLineJa);
        assert.ok(iku.changed);
        assert.strictEqual(iku.text, FIX.ikuOkZh);

        const intro = sanitize.correctZhDomainMistranslations(
            '哈啊…哈啊',
            '本日担当させていただきます皐月と申しますお客様はメンズエ',
        );
        assert.ok(intro.changed);
        assert.strictEqual(intro.text, '');
        assert.ok(intro.flags.includes('domain_hallucination'));

        // System-prompt bleed: 担当 → 负责翻译
        const tanto = sanitize.correctZhDomainMistranslations(
            '今天由我负责翻译',
            '本日担当させていただきます。',
        );
        assert.ok(tanto.changed);
        assert.ok(tanto.text.includes('今天由我负责'));
        assert.ok(!tanto.text.includes('翻译'));

        const tanto2 = sanitize.sanitizeMtCueText(
            '今天由我负责翻译。',
            '本日担当させていただきます。',
        );
        assert.ok(tanto2.text.includes('今天由我负责'));
        assert.ok(!tanto2.text.includes('翻译'));

        // HMN-878 style domain / ASR aftermath
        const satsuki = sanitize.sanitizeMtCueText('我叫作沙', 'さつきと申します。');
        assert.ok(satsuki.text.includes('皐月'), satsuki.text);

        const pants = sanitize.correctZhDomainMistranslations(
            '但是不能从头发内裤中露出，也不能自己撸来撸去哦',
            '髪パンツから露出したり、自分でシコシコしたりしちゃダメですからね。',
        );
        assert.ok(pants.changed);
        assert.ok(!pants.text.includes('头发内裤'), pants.text);

        const shoryaku = sanitize.correctZhDomainMistranslations(
            '最近我也在努力省略，',
            'このところも丹念に省していくので、',
        );
        assert.ok(shoryaku.changed);
        assert.ok(!shoryaku.text.includes('省略'), shoryaku.text);

        const meisu = sanitize.correctZhDomainMistranslations(
            '锤子可能还是当个好孩子比较好哦',
            'メイスは良い子にしてた方が良いことあるかもよ',
        );
        assert.ok(meisu.changed);
        assert.ok(meisu.text.includes('客人'));
        assert.ok(!meisu.text.includes('锤子'));

        const kuru = sanitize.correctZhDomainMistranslations(
            '好的，我来了。 是这样吗？',
            'はいよく来てますそうなんですね',
        );
        assert.ok(kuru.changed);
        assert.ok(kuru.text.includes('经常来'), kuru.text);

        const asr = sanitize.correctJaAsrDomainMishears(
            'メンズエスタは初めて。髪パンツから。メイスは良い子。丹念に省していく。歯圧だけ。リムを流す。',
        );
        assert.ok(asr.changed);
        assert.ok(asr.text.includes('メンズエステ'));
        assert.ok(asr.text.includes('半パンツ'));
        assert.ok(asr.text.includes('ゲストは'));
        assert.ok(asr.text.includes('ほぐして'));
        assert.ok(asr.text.includes('指圧'));
        assert.ok(asr.text.includes('リンパを流す'));

        const calf = sanitize.correctJaAsrDomainMishears('くらはぎもパンパンエスニャー');
        assert.ok(calf.changed);
        assert.ok(calf.text.includes('ふくらはぎ'));
        assert.ok(calf.text.includes('パンパンですねー'));
        assert.ok(!calf.text.includes('エスニャー'));

        const batch2 = sanitize.correctJaAsrDomainMishears(
            `メインエスはマビサビ。トイレ追加します。紙パンツ。前向けになって。肩膀を。下半戦も。${FIX.asrBatchAdultFrag}関東いたします。丹念にはぐしていく。メスは、いい子。`,
        );
        assert.ok(batch2.changed);
        assert.ok(batch2.text.includes('メンエスは'));
        assert.ok(batch2.text.includes('ギリギリの塩梅'));
        assert.ok(batch2.text.includes('オイル追加'));
        assert.ok(batch2.text.includes('半パンツ'));
        assert.ok(batch2.text.includes('仰向けになって'));
        assert.ok(batch2.text.includes('肩を'));
        assert.ok(batch2.text.includes('下半身'));
        assert.ok(batch2.text.includes(FIX.breastOut));
        assert.ok(batch2.text.includes('ほぐれて'));
        assert.ok(batch2.text.includes(FIX.fuzokuToDiffers));
        assert.ok(batch2.text.includes('担当いたします'));
        assert.ok(batch2.text.includes('ほぐして'));
        assert.ok(batch2.text.includes('ゲストは、'));
        assert.ok(!batch2.text.includes('はぐして'));
        assert.ok(!batch2.text.includes('メスは、'));

        const mesu = sanitize.correctZhDomainMistranslations(
            '雌性，乖乖的比较好哦',
            'メスは、いい子にしてたほうがいいことあるかもよ。',
        );
        assert.ok(mesu.changed);
        assert.ok(!mesu.text.includes('雌性'), mesu.text);
        assert.ok(mesu.text.includes('客人'));

        // Real 「翻訳」 in source must keep 翻译
        const realTr = sanitize.correctZhDomainMistranslations(
            '请帮我翻译一下',
            '翻訳をお願いします。',
        );
        assert.ok(!realTr.changed || realTr.text.includes('翻译'));

        const ohayo = sanitize.correctZhDomainMistranslations(
            '早上好',
            'おはようございます。',
            { contentProfile: 'av_soft', cueIndex: 81 },
        );
        assert.ok(ohayo.changed);
        assert.strictEqual(ohayo.text, '…');
        assert.ok(ohayo.flags.includes('fake_greeting'));

        // faithfulTone alone must NOT wipe mid-scene greetings
        const faithfulOnly = sanitize.correctZhDomainMistranslations(
            '早上好',
            'おはようございます。',
            { smartTranslateFaithfulTone: true, cueIndex: 81 },
        );
        assert.ok(!faithfulOnly.changed, 'faithfulTone alone should not blank 早上好');
        assert.strictEqual(faithfulOnly.text, '早上好');

        // Real early greeting must stay
        const early = sanitize.correctZhDomainMistranslations(
            '早上好',
            'おはようございます。',
            { contentProfile: 'av_soft', cueIndex: 2 },
        );
        assert.ok(!early.changed);

        const itchy = sanitize.correctZhDomainMistranslations(
            FIX.itchyZh,
            FIX.feelJa,
            { contentProfile: 'av_soft' },
        );
        assert.ok(itchy.changed);
        assert.ok(itchy.text.includes('舒服'), itchy.text);
        assert.ok(!itchy.text.includes('痒'), itchy.text);

        const okaeri = sanitize.correctZhDomainMistranslations('回家了', 'おかえり');
        assert.strictEqual(okaeri.text, '欢迎回来。');
        const tada = sanitize.correctZhDomainMistranslations('喂', 'ただいま');
        assert.strictEqual(tada.text, '我回来了。');

        const mickey = sanitize.correctZhDomainMistranslations(
            FIX.mickeyBadZh,
            FIX.mickeyJa,
        );
        assert.ok(mickey.text.includes(FIX.mickeyOkZh), mickey.text);
        assert.ok(!mickey.text.includes('米老鼠'), mickey.text);

        const kuro = sanitize.correctZhDomainMistranslations('…', 'クロちゃん、おかえり。');
        assert.ok(kuro.text.includes('欢迎回来'), kuro.text);
        assert.ok(kuro.text.includes('小黑'), kuro.text);

        const ed = sanitize.correctZhDomainMistranslations(
            FIX.edWarmLineZh,
            FIX.chinpoWarmJa,
        );
        assert.ok(!ed.text.includes(opaque.T.edZh), ed.text);

        const chan = sanitize.correctZhDomainMistranslations(
            FIX.aliceBadZh,
            FIX.aliceJa,
        );
        assert.ok(!chan.text.includes('小姐'), chan.text);
        assert.ok(chan.text.includes(FIX.aliceOkZh), chan.text);

        const arrow = sanitize.stripMtArtifacts('爱着Alice小姐的宫殿茶→爱着Alice的宫殿茶');
        assert.ok(arrow.changed);
        assert.ok(!arrow.text.includes('→'), arrow.text);
        assert.ok(arrow.text.includes('Alice'), arrow.text);

        const bleed = sanitize.correctZhDomainMistranslations(
            FIX.bleedZh,
            FIX.bleedJa,
        );
        assert.ok(bleed.flags.includes('synopsis_bleed'));
        assert.strictEqual(bleed.text, '');
    });

    it('sanitizeMtCueText applies domain fixes end-to-end', () => {
        const out = sanitize.sanitizeMtCueText(
            FIX.smallHoleLineZh,
            FIX.proneLineJa,
            { contentProfile: 'av_soft' },
        );
        assert.ok(out.flags.includes('domain_term'));
        assert.ok(out.text.includes(FIX.lieZh));

        const batch = sanitize.sanitizeMtCues(
            [
                { index: 0, text: FIX.cannotRepeatZh },
                { index: 1, text: '这是防晒油吗？' },
            ],
            [
                { index: 0, text: FIX.notSoaplandSrcJa },
                { index: 1, text: 'これオイルなの?' },
            ],
            { contentProfile: 'av_soft' },
        );
        assert.ok(batch.jaAsrDomainChanged >= 1);
        assert.ok(batch.sourceCues[0].text.includes('メンエス'));
        assert.ok(batch.cues[0].text.includes('不是风俗') || batch.cues[0].text === '');
        assert.ok(batch.cues[1].text.includes('按摩油'));
    });

    it('unsticks orphan / cross-cue ZH loops (IPZZ-745)', () => {
        const orphan = sanitize.polishOrphanStuckZh(
            '我有好好地在工作',
            'お兄ちゃん、早くしないと学校遅刻しちゃうよ。',
        );
        assert.ok(orphan.changed);
        assert.strictEqual(orphan.text, '…');

        const stuck = FIX.orphanStuckZh;
        const batch = sanitize.sanitizeMtCues(
            [
                { index: 0, text: '我有好好地在工作' },
                { index: 1, text: '我有好好地在工作' },
                { index: 2, text: '我有好好地在工作' },
                { index: 3, text: stuck },
                { index: 4, text: stuck },
                { index: 5, text: stuck },
            ],
            [
                { index: 0, text: 'ユーモア' },
                { index: 1, text: 'おわり' },
                { index: 2, text: 'お兄ちゃん、早くしないと学校遅刻しちゃうよ。' },
                { index: 3, text: 'んぅぅぅっ…!' },
                { index: 4, text: 'あんっ!' },
                { index: 5, text: 'あははは' },
            ],
            { contentProfile: 'av_soft', skipJaAsrDomain: true },
        );
        assert.ok(batch.flags.cross_cue_stuck >= 1 || batch.flags.orphan_stuck_zh >= 1);
        assert.ok(batch.cues.every((c) => c.text !== '我有好好地在工作'));
        assert.ok(batch.cues[5].text === '哈哈' || batch.cues[5].text === '…');
        assert.ok(
            batch.cues[3].text !== stuck
            || batch.cues[4].text !== stuck,
        );
    });

    it('SNOS-293 cafe / foot-job ASR + Sakura domain remaps', () => {
        // Prefer reload so shared/ja-asr-domain-fixes.json edits are live in watch mode.
        if (typeof sanitize.reloadJaAsrDomainFromBundled === 'function') {
            sanitize.reloadJaAsrDomainFromBundled();
        }

        const aru = sanitize.correctJaAsrDomainMishears('今日からアパイタに入った');
        assert.ok(aru.changed);
        assert.ok(aru.text.includes('アルバイト'));
        assert.ok(!aru.text.includes('アパイタ'));

        const kin = sanitize.correctJaAsrDomainMishears('気長します…もうちょっと…');
        assert.ok(kin.changed);
        assert.ok(kin.text.includes('緊張'));

        const yukkuri = sanitize.correctJaAsrDomainMishears('じゃあ、口安くねはいはい');
        assert.ok(yukkuri.changed);
        assert.ok(yukkuri.text.includes('ごゆっくりね'));

        const dare = sanitize.correctJaAsrDomainMishears('水なんて誰に根もあるし…');
        assert.ok(dare.changed);
        assert.ok(dare.text.includes('誰にでもある'));

        const hana = sanitize.correctJaAsrDomainMishears('ね、暗きハナデよろしくお願いします');
        assert.ok(hana.changed);
        assert.ok(hana.text.includes('倉木ハナで'));

        const kuraki = sanitize.correctJaAsrDomainMishears('蔵木さんの足、触っちゃった');
        assert.ok(kuraki.changed);
        assert.ok(kuraki.text.includes('倉木さん'));

        const fetish = sanitize.correctJaAsrDomainMishears('すごい好きで…足フェンジなの?');
        assert.ok(fetish.changed);
        assert.ok(fetish.text.includes('足フェチ'));
        assert.ok(!fetish.text.includes('フェンジ'));

        const busy = sanitize.correctZhDomainMistranslations(
            '从今天开始就是旺季了',
            aru.text,
        );
        assert.ok(busy.changed);
        assert.ok(busy.text.includes('打工'));
        assert.ok(!busy.text.includes('旺季'));

        const tense = sanitize.correctZhDomainMistranslations('气长了', kin.text);
        assert.ok(tense.changed);
        assert.ok(/紧张/.test(tense.text));

        const mouth = sanitize.correctZhDomainMistranslations(
            '那么，嘴巴放干净点，好…好！',
            yukkuri.text,
        );
        assert.ok(mouth.changed);
        assert.ok(/慢用/.test(mouth.text));
        assert.ok(!/嘴巴放干净/.test(mouth.text));

        const mouth2 = sanitize.correctZhDomainMistranslations(
            '那么，口令不难记呢好的',
            'じゃあ、口安くねはいはい',
        );
        assert.ok(mouth2.changed);
        assert.ok(/慢用/.test(mouth2.text));
        assert.ok(!/口令/.test(mouth2.text));

        const fen = sanitize.correctZhDomainMistranslations(
            '好喜欢…腿芬治吗？',
            fetish.text,
        );
        assert.ok(fen.changed);
        assert.ok(/恋足癖/.test(fen.text));
        assert.ok(!/芬治/.test(fen.text));

        const touch = sanitize.correctZhDomainMistranslations(
            '藏木同学的，',
            kuraki.text,
        );
        assert.ok(touch.changed);
        assert.ok(/脚/.test(touch.text));
        assert.ok(/碰到/.test(touch.text));

        assert.ok(sanitize.isLatinGarbageZh('Grubn', 'グラブンサンド…カスパイマスタ…'));
        assert.ok(sanitize.isBlankOrPunctTranslation('Grubn', 'グラブンサンド…カスパイマスタ…'));
        const grubn = sanitize.correctZhDomainMistranslations(
            'Grubn',
            'グラブンサンド…カスパイマスタ…',
        );
        assert.ok(grubn.changed);
        assert.strictEqual(grubn.text, '');

        const ankou = sanitize.correctZhDomainMistranslations(
            '呐，暗香请多指教',
            'ね、倉木ハナでよろしくお願いします',
        );
        assert.ok(ankou.changed);
        assert.ok(/仓木华/.test(ankou.text));
        assert.ok(!/暗香/.test(ankou.text));

        const hua = sanitize.correctZhDomainMistranslations(
            '呃，华你好，请多指教',
            'ね、暗きハナデよろしくお願いします',
        );
        assert.ok(hua.changed);
        assert.ok(/仓木华/.test(hua.text));
        assert.ok(!/华你好/.test(hua.text));

        assert.ok(sanitize.isSeverelyUnderTranslated('藏木同学的，', kuraki.text));

        const e2e = sanitize.sanitizeMtCueText(
            '从今天开始就是旺季了',
            '今日からアパイタに入った',
            { contentProfile: 'av_soft', faithfulTone: true, applyNsfwLexicon: true },
        );
        assert.ok(e2e.flags.includes('domain_term') || /打工/.test(e2e.text));
        assert.ok(/打工/.test(e2e.text));
        assert.ok(!/旺季/.test(e2e.text));

        assert.ok(sanitize.isSeverelyUnderTranslated('哈啊…', 'はぁ…疲れた…'));
        const tiredFb = sanitize.recoverBlankedAdultZh('哈啊…', 'はぁ…疲れた…', {
            contentProfile: 'av_soft',
        });
        assert.ok(tiredFb.changed);
        assert.ok(/累/.test(tiredFb.text), tiredFb.text);

        const etto = sanitize.sanitizeMtCueText('…', 'えっと、はい', {
            contentProfile: 'av_soft',
            faithfulTone: true,
        });
        assert.ok(/好的|嗯/.test(etto.text), etto.text);
        assert.ok(!/^[…·.]+$/.test(etto.text));

        const ichiban = sanitize.sanitizeMtCueText('…', 'もう一番疲れてるかも…', {
            contentProfile: 'av_soft',
            faithfulTone: true,
        });
        assert.ok(/累/.test(ichiban.text), ichiban.text);

        const osake = sanitize.correctJaAsrDomainMishears(
            'すみません、大変お酒ございましぇんしぇん…',
        );
        assert.ok(osake.changed);
        assert.ok(osake.text.includes('申し訳'));
        assert.ok(!osake.text.includes('お酒ござ'));
        const osakeZh = sanitize.correctZhDomainMistranslations(
            '不好意思，非常抱歉非常抱歉',
            osake.text,
        );
        assert.ok(osakeZh.changed);
        assert.ok(osakeZh.text.includes('非常抱歉'));
        assert.ok(!/非常抱歉非常抱歉/.test(osakeZh.text));

        const killer = sanitize.sanitizeMtCueText(
            'Killer do caca…Hemp尼斯克',
            'キリエルドッカレータ…ヘンペニスケ',
            { contentProfile: 'av_soft' },
        );
        assert.ok(killer.flags.includes('latin_garbage') || /^[…·.\s]*$/.test(killer.text), killer.text);
        assert.ok(!/Killer|Hemp/i.test(killer.text));

        const club = sanitize.sanitizeMtCueText(
            '…',
            'グラブンサンド…カスパイマスタ…',
            { contentProfile: 'av_soft', faithfulTone: true },
        );
        assert.ok(/三明治|俱乐部/.test(club.text), club.text);

        // Trailing ellipsis on dialogue must survive when no name was stripped
        const last = sanitize.sanitizeMtCueText(
            '这是最后一次了…',
            'これで最後だよ…',
            { contentProfile: 'av_soft' },
        );
        assert.ok(/最后一次/.test(last.text), last.text);
        assert.ok(/…/.test(last.text) || /最后一次了/.test(last.text), last.text);
    });

    it('SNOS-256/293: 気に入っちゃ vs 入っちゃ + limp/foot climax halluc', () => {
        if (typeof sanitize.reloadJaAsrDomainFromBundled === 'function') {
            sanitize.reloadJaAsrDomainFromBundled();
        }

        // Anti-regression: 気に入っちゃ must NOT become 进去了
        const liking = sanitize.sanitizeMtCueText('哈啊', '気に入っちゃってるじゃん…', {
            contentProfile: 'av_soft',
        });
        assert.ok(liking.changed);
        assert.ok(/中意/.test(liking.text), liking.text);
        assert.ok(!/进去/.test(liking.text), liking.text);

        // True insertion still recovers
        const insert = sanitize.sanitizeMtCueText('嗯嗯', 'ほんのに入っちゃってる?', {
            contentProfile: 'av_soft',
        });
        assert.ok(/进去/.test(insert.text), insert.text);

        const limpAsr = sanitize.correctJaAsrDomainMishears(FIX.limpAsrJa);
        assert.ok(limpAsr.changed);
        assert.ok(limpAsr.text.includes(FIX.limpFixedJa), limpAsr.text);

        const limp = sanitize.correctZhDomainMistranslations(
            FIX.climaxQZh,
            FIX.limpAsrJa,
        );
        assert.ok(limp.changed);
        assert.ok(/软了/.test(limp.text), limp.text);
        assert.ok(!opaque.RE.climaxHallucZhSrc.test(limp.text), limp.text);

        const foot = sanitize.correctZhDomainMistranslations(FIX.shootWantDoneZh, '足好きだね…');
        assert.ok(foot.changed);
        assert.ok(/脚/.test(foot.text), foot.text);
        assert.ok(!foot.text.includes(opaque.T.shootWantZh), foot.text);

        const cockHalluc = sanitize.sanitizeMtCueText(FIX.cockHallucZh, FIX.airiJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(!cockHalluc.text.includes(opaque.T.rodZh), cockHalluc.text);

        const pinpin = sanitize.sanitizeMtCueText('嗯——！', FIX.pinpinLineJa, {
            contentProfile: 'av_soft',
        });
        assert.ok(/硬|翘/.test(pinpin.text), pinpin.text);

        const chinponMis = opaque.d('44Gh44KT44G944KT');
        const chinponOk = opaque.d('44Gh44KT44G9');
        const chinpon = sanitize.correctJaAsrDomainMishears(FIX.chinponMishearJa);
        assert.ok(chinpon.changed);
        assert.ok(
            chinpon.text.includes(chinponOk) && !chinpon.text.includes(chinponMis),
            chinpon.text,
        );
        // Keep ADN-798 strip intact
        const halluc = sanitize.sanitizeMtCueText(
            FIX.dadRodLineZh,
            'お父さんのだからいいんですよ…そんな…',
            { contentProfile: 'av_soft' },
        );
        assert.ok(!halluc.text.includes(opaque.T.meatRodZh));
    });

    it('IPZZ-399/325: iku→came, blanks, moan-heixiu, foot-grind', () => {
        if (typeof sanitize.reloadJaAsrDomainFromBundled === 'function') {
            sanitize.reloadJaAsrDomainFromBundled();
        }

        // イッちゃいます → 要射了 → 要去了
        const itchai = sanitize.correctZhDomainMistranslations('要射了', 'イッちゃいます…');
        assert.ok(itchai.changed);
        assert.strictEqual(itchai.text, '要去了');

        // Bare 射了 / 快射了 / 又射了 under climax JA
        const shot = sanitize.correctZhDomainMistranslations('射了！', 'イクッ!');
        assert.ok(shot.changed);
        assert.ok(/去了/.test(shot.text) && !/射了/.test(shot.text), shot.text);

        const again = sanitize.correctZhDomainMistranslations(
            '又射了，老师…哈…哈',
            'またイッちゃったの先生…はぁはぁ…',
        );
        assert.ok(again.changed);
        assert.ok(/又去了/.test(again.text) && !/又射了/.test(again.text), again.text);

        const soon = sanitize.correctZhDomainMistranslations('快射了', 'イキそう…ああイク…');
        assert.ok(soon.changed);
        assert.ok(/快去了/.test(soon.text), soon.text);

        // Protect 不要射了
        const dont = sanitize.correctZhDomainMistranslations(
            '啊…啊啊…不、不要射了… 啊',
            'あっ…ああっ…だ、出しなきゃ… あ…',
        );
        assert.ok(/不要射了/.test(dont.text), dont.text);

        // Keep MIDA-728 iku-as-shoot fixture
        const iku = sanitize.correctZhDomainMistranslations(FIX.ikuShootBadZh, FIX.ikuShootJa);
        assert.ok(iku.changed);
        assert.strictEqual(iku.text, FIX.ikuShootOkZh);

        // Moan → 嘿咻 hallucination
        const heixiu = sanitize.correctZhDomainMistranslations('嘿咻…？', 'ひへくぅ…?');
        assert.ok(heixiu.changed);
        assert.ok(!/嘿咻/.test(heixiu.text), heixiu.text);

        // Blanks / stubs
        const grind = sanitize.correctZhDomainMistranslations('同学', '足穴ぐりぐりしてください');
        assert.ok(grind.changed);
        assert.ok(/脚/.test(grind.text), grind.text);

        const fella = sanitize.correctZhDomainMistranslations('还有', 'あと、フェラ…');
        assert.ok(fella.changed);
        assert.ok(/口交/.test(fella.text), fella.text);

        const insert = sanitize.sanitizeMtCueText('嗯嗯', 'んむおちんちん入れたくなってしまった', {
            contentProfile: 'av_soft',
        });
        assert.ok(/肉棒|进去/.test(insert.text), insert.text);

        const aniku = sanitize.sanitizeMtCueText('嗯嗯…', 'あんっ…イク…', {
            contentProfile: 'av_soft',
        });
        assert.ok(/要去了/.test(aniku.text), aniku.text);

        const kichi = sanitize.correctJaAsrDomainMishears('あ…きちんちん…');
        assert.ok(kichi.changed);
        assert.ok(/おちんちん/.test(kichi.text), kichi.text);

        // Anti-regression: 気に入っちゃ ≠ 进去了
        const liking = sanitize.sanitizeMtCueText('哈啊', '気に入っちゃってるじゃん…', {
            contentProfile: 'av_soft',
        });
        assert.ok(/中意/.test(liking.text) && !/进去/.test(liking.text), liking.text);
    });

    it('IPZZ-372: hira-chinpo / iku-trunc / grandpa-dechai / juice / lick', () => {
        if (typeof sanitize.reloadJaAsrDomainFromBundled === 'function') {
            sanitize.reloadJaAsrDomainFromBundled();
        }

        const penis = sanitize.correctZhDomainMistranslations(
            '怪人的阴茎硬起来了吧',
            '怪人のちんぽれてるのキツキツじゃん…',
        );
        assert.ok(penis.changed);
        assert.ok(/肉棒/.test(penis.text) && !/阴茎/.test(penis.text), penis.text);

        const trunc = sanitize.correctZhDomainMistranslations('啊啊啊射了', 'ひゃああぁぁっイッちゃ…');
        assert.ok(trunc.changed);
        assert.ok(/去了/.test(trunc.text) && !/射了/.test(trunc.text), trunc.text);

        const itte = sanitize.correctZhDomainMistranslations(
            '射了…射了…哈哈',
            'イッて…イッちゃ…はぁはぁ…',
        );
        assert.ok(itte.changed);
        assert.ok(/去了/.test(itte.text) && !/射了/.test(itte.text), itte.text);

        const ikiso = sanitize.correctZhDomainMistranslations(
            '硬挺着…要射了…蓝君…蓝君',
            'はげしゅぎゅ…イきそ…んんっ藍くん…藍くん…',
        );
        assert.ok(ikiso.changed);
        assert.ok(/要去了/.test(ikiso.text) && !/要射了/.test(ikiso.text), ikiso.text);

        const grandpa = sanitize.correctZhDomainMistranslations(
            '爷爷也要出来了',
            'あばあも出ちゃいそう…出して…',
        );
        assert.ok(grandpa.changed);
        assert.ok(!/爷爷/.test(grandpa.text), grandpa.text);
        assert.ok(/出来/.test(grandpa.text), grandpa.text);

        const juice = sanitize.correctZhDomainMistranslations('好像要射了', 'おしるみたい…');
        assert.ok(juice.changed);
        assert.ok(/汁/.test(juice.text) && !/要射/.test(juice.text), juice.text);

        const name = sanitize.correctZhDomainMistranslations('一君', 'あっ、イク…');
        assert.ok(name.changed);
        assert.ok(/要去了/.test(name.text), name.text);

        const lick = sanitize.sanitizeMtCueText(
            '嗯嗯',
            'ほら舐めて…んんっんむ…から舐めて…',
            { contentProfile: 'av_soft' },
        );
        assert.ok(/舔/.test(lick.text), lick.text);

        const asr = sanitize.correctJaAsrDomainMishears('あばあも出ちゃいそう…');
        assert.ok(asr.changed);
        assert.ok(/あ、もう/.test(asr.text), asr.text);

        // Anti-regression: prior IPZZ iku→came + kiniri
        const itchai = sanitize.correctZhDomainMistranslations('要射了', 'イッちゃいます…');
        assert.strictEqual(itchai.text, '要去了');
        const liking = sanitize.sanitizeMtCueText('哈啊', '気に入っちゃってるじゃん…', {
            contentProfile: 'av_soft',
        });
        assert.ok(/中意/.test(liking.text) && !/进去/.test(liking.text), liking.text);
    });

    it('SNOS-245: wet-sfx anatomy halluc / iku-repeat→行 / more-lick stub', () => {
        assert.ok(sanitize.isWetOralSfxOnlyJa('んじゅぶっ'));
        const sfx = sanitize.sanitizeMtCueText('阴茎', 'んじゅぶっ', {
            contentProfile: 'av_soft',
        });
        assert.ok(
            sfx.flags.includes('wet_sfx') || sfx.flags.includes('wet_sfx_ja'),
            sfx.flags.join(','),
        );
        assert.ok(sfx.text === '' || sfx.text === '…', sfx.text);
        assert.ok(!/阴茎/.test(sfx.text));

        // Keep prior wet-sfx strip intact
        const drop = sanitize.sanitizeMtCueText('咕咚、咕咚…咕咚', '…ごくっ、ごくっ…ごくっ', {
            contentProfile: 'av_soft',
        });
        assert.ok(drop.text === '…' || drop.text === '');

        const iku = sanitize.correctZhDomainMistranslations('行', 'いく…いくいくいく…');
        assert.ok(iku.changed);
        assert.strictEqual(iku.text, '要去了');

        // Do not rewrite 不行了
        const dame = sanitize.correctZhDomainMistranslations('啊、不行了', 'あ、だめぇ…');
        assert.ok(/不行了/.test(dame.text), dame.text);

        const lick = sanitize.correctZhDomainMistranslations(
            '呵',
            'はぁ…こっちももっと舐めて…おいてくれそう…',
        );
        assert.ok(lick.changed);
        assert.ok(/舔/.test(lick.text), lick.text);

        // Anti-regression: kiniri
        const liking = sanitize.sanitizeMtCueText('哈啊', '気に入っちゃってるじゃん…', {
            contentProfile: 'av_soft',
        });
        assert.ok(/中意/.test(liking.text) && !/进去/.test(liking.text), liking.text);
    });

    it('SNOS-245: opening BGM/SFX false ASR + iku→行了 + yame shoot halluc', () => {
        assert.ok(sanitize.isShioHitSfxOnlyJa('シオオォォッ!'));
        assert.ok(sanitize.isShioHitSfxOnlyJa('シオシオシオシオシッ!'));
        assert.ok(sanitize.isWetOralSfxOnlyJa('ちゅばっ、ちゅばっ、ちゅばっ!'));
        assert.ok(sanitize.isWetOralSfxOnlyJa('ちゅばっ'));

        for (const [zh, ja] of [
            ['初音哦…哦！', 'シオオォォッ!'],
            ['初音…初音啊！', 'シオシオシオシオシッ!'],
            ['湿哦…哦！', 'ぶぶシオオォォッ! ぱ'],
            ['Juventusbu…bu! 哼', 'じゅぶぶぶぶぶぶぶぶぶぶぶっ! ん'],
            ['吸吧，吸吧，吸吧！', 'ちゅばっ、ちゅばっ、ちゅばっ!'],
            ['吸吧', 'ちゅばっ'],
            ['吸吧！', 'ちゅばっ!'],
            ['亚莉罗大明撒', 'アヤロダイミッサ'],
        ]) {
            const r = sanitize.sanitizeMtCueText(zh, ja, { contentProfile: 'av_soft' });
            assert.ok(r.text === '' || r.text === '…', `${ja} → ${r.text}`);
            assert.ok(!/初音|吸吧|亚莉|湿哦|Juventus/i.test(r.text), r.text);
        }

        const bump = sanitize.sanitizeMtCueText('嗯 bump 哼哼…', 'んぶっんんっ', {
            contentProfile: 'av_soft',
        });
        assert.ok(!/\bbump\b/i.test(bump.text), bump.text);
        assert.ok(/嗯|哼/.test(bump.text), bump.text);

        // Real「初音」name in JA must not be blanked away from lexical ZH
        const name = sanitize.sanitizeMtCueText(
            '请对着镜头说出你的名字，',
            '初音のカメラに向かって名前をお願いします',
            { contentProfile: 'av_soft' },
        );
        assert.ok(/名字|镜头/.test(name.text), name.text);

        const xingle = sanitize.correctZhDomainMistranslations(
            '行了，行了…行了…',
            'いく、いくいくいく…',
        );
        assert.ok(xingle.changed);
        assert.ok(/要去了/.test(xingle.text) && !/行了/.test(xingle.text), xingle.text);

        const xingle2 = sanitize.correctZhDomainMistranslations('行了行了…', 'いくいく…');
        assert.ok(xingle2.changed);
        assert.ok(/要去了/.test(xingle2.text) && !/行了/.test(xingle2.text), xingle2.text);

        const yame = sanitize.correctZhDomainMistranslations('哈…要射了…', 'はぁ…りゃめ…');
        assert.ok(yame.changed);
        assert.ok(/不要/.test(yame.text) && !/要射/.test(yame.text), yame.text);

        // イッた / イきゅ climax scraps → 射了 / 要射了
        const itta = sanitize.correctZhDomainMistranslations('啊、射了…嗯呼', 'ああイッた…んふぅ');
        assert.ok(itta.changed);
        assert.ok(/去了/.test(itta.text) && !/射了/.test(itta.text), itta.text);
        const ikyu = sanitize.correctZhDomainMistranslations('哈…要射了…', 'はぁ…イきゅ…');
        assert.ok(ikyu.changed);
        assert.ok(/要去了/.test(ikyu.text) && !/要射/.test(ikyu.text), ikyu.text);

        const asr = sanitize.correctJaAsrDomainMishears('無用不明です…');
        assert.ok(asr.changed);
        assert.ok(/名前不明/.test(asr.text), asr.text);

        const mixedChu = sanitize.sanitizeMtCueText('吸吧…嗯哈…', 'ちゅばっ…んはっ…', {
            contentProfile: 'av_soft',
        });
        assert.ok(!/吸吧/.test(mixedChu.text), mixedChu.text);
        assert.ok(/嗯|哈/.test(mixedChu.text), mixedChu.text);

        const chan = sanitize.correctZhDomainMistranslations(
            '嗯！ 啊我小初音…去了…去了…',
            'んっ! ああ私ちゃんちゃん…イクイクイクイク…',
        );
        assert.ok(chan.changed);
        assert.ok(!/初音/.test(chan.text), chan.text);
    });
});
