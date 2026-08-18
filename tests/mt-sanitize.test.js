const assert = require('assert');
const sanitize = require('../src/js/mt-sanitize-core');
const opaque = require('../src/js/mt-opaque-strings');
const { FIX } = opaque;

describe('mt-sanitize-core', () => {
    it('strips leading/trailing Chinese and English commas', () => {
        const lead = sanitize.stripEdgeCommas('，真的好好吃');
        assert.ok(lead.changed);
        assert.strictEqual(lead.text, '真的好好吃');

        const trail = sanitize.stripEdgeCommas('蓝，');
        assert.ok(trail.changed);
        assert.strictEqual(trail.text, '蓝');

        const en = sanitize.stripEdgeCommas(',really good,');
        assert.ok(en.changed);
        assert.strictEqual(en.text, 'really good');

        const mid = sanitize.stripEdgeCommas('真的太好吃了，让我有点');
        assert.ok(!mid.changed);
        assert.strictEqual(mid.text, '真的太好吃了，让我有点');

        const keepDun = sanitize.stripEdgeCommas('啊、嗯');
        assert.ok(!keepDun.changed);

        const viaSanitize = sanitize.sanitizeMtCueText('，真的好好吃', '本当においしい');
        assert.strictEqual(viaSanitize.text, '真的好好吃');
        assert.ok(viaSanitize.flags.includes('edge_comma'));

        const viaTrail = sanitize.sanitizeMtCueText('蓝，', 'あい');
        assert.strictEqual(viaTrail.text, '蓝');
        assert.ok(viaTrail.flags.includes('edge_comma'));
    });

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

        const hash = sanitize.stripMtArtifacts('摸_#G2643_和摸小穴_#G2643_都好舒服');
        assert.ok(hash.changed);
        assert.ok(!/_#G/.test(hash.text), hash.text);
        assert.ok(hash.text.includes('小穴'), hash.text);

        const split = sanitize.stripMtArtifacts('啊 太好了 那_ 么记得去医院哦');
        assert.ok(split.changed);
        assert.ok(split.text.includes('那么'), split.text);
        assert.ok(!/_/.test(split.text), split.text);

        const hashMid = sanitize.stripMtArtifacts('真的没有那_#_种事哦');
        assert.ok(hashMid.changed);
        assert.ok(hashMid.text.includes('那种'), hashMid.text);
        assert.ok(!/_/.test(hashMid.text), hashMid.text);
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
        const wifeSorry = sanitize.fixKinshipHonorificMistranslations(
            '对不起',
            'すいません奥さん',
        );
        assert.ok(wifeSorry.text.includes('太太'), wifeSorry.text);
        const wifeSorry2 = sanitize.sanitizeMtCueText('不好意思', 'すいません奥さん');
        assert.ok(wifeSorry2.text.includes('太太'), wifeSorry2.text);
        const neeName = sanitize.sanitizeMtCueText('呐呐', 'ねえねえ 翔平');
        assert.ok(neeName.text.includes('翔平'), neeName.text);
        assert.match(neeName.text, /呐/);
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
        assert.ok(sanitize.jaCueHasLexicalResidue('んふぁいその音ある はむあふぅ'));
        assert.ok(!sanitize.isMoanOrSfxHeavyJa('んふぁいその音ある はむあふぅ'));
        const wait = sanitize.recoverBlankedAdultZh('嗯', 'ちょ ちょっと待って待って');
        assert.ok(wait.changed);
        assert.ok(/等一下/.test(wait.text), wait.text);
        const gaman = sanitize.recoverBlankedAdultZh('嗯', 'ちょ我慢できないよ');
        assert.ok(gaman.changed);
        assert.ok(/忍不住/.test(gaman.text), gaman.text);
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
        assert.strictEqual(batch.cues[1].text, '哈…');
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

        const polishEcho = '改为符合原文语气';
        assert.ok(sanitize.looksLikePromptLeak(polishEcho));
        assert.ok(['', '…'].includes(sanitize.sanitizeMtCueText(polishEcho, 'だがな').text));
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

    it('locks film-level given names and 先輩 address to the majority form', () => {
        const named = sanitize.sanitizeMtCues(
            [
                { index: 0, text: '光希桑' },
                { index: 1, text: '公辉哥外表这么普通' },
                { index: 2, text: '皇木也发出娇喘了' },
                { index: 3, text: '光姬小姐也热吧' },
            ],
            [
                { index: 0, text: 'こうきさん' },
                { index: 1, text: '公輝さん地味な見た目で' },
                { index: 2, text: 'こうきさんもあやらひ声出て' },
                { index: 3, text: 'こうきさんも熱いでしょ?' },
            ],
            { unifyNames: true },
        );
        const joined = named.cues.map((c) => c.text).join('\n');
        assert.ok(joined.includes('光希'), joined);
        assert.ok(!joined.includes('公辉'), joined);
        assert.ok(!joined.includes('皇木'), joined);
        assert.ok(!joined.includes('光姬'), joined);

        const senpai = sanitize.sanitizeMtCues(
            [
                { index: 0, text: '学长怎么了' },
                { index: 1, text: '学长请停一下' },
                { index: 2, text: '学长真的好喜欢' },
                { index: 3, text: '学姐你怎么了' },
                { index: 4, text: '学长再多来一点' },
            ],
            [
                { index: 0, text: '先輩どうしたんですか' },
                { index: 1, text: '先輩止まって' },
                { index: 2, text: '先輩はほんとにお尻が好き' },
                { index: 3, text: '先輩どうしたんですか' },
                { index: 4, text: '先輩もっとして' },
            ],
            { unifyNames: true },
        );
        assert.ok(senpai.cues.every((c) => c.text.includes('学长')), senpai.cues.map((c) => c.text).join('|'));
        assert.ok(senpai.cues.every((c) => !c.text.includes('学姐')), senpai.cues.map((c) => c.text).join('|'));
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

        const wait = sanitize.correctJaAsrDomainMishears('はい 埋め合ったらごめんなさい');
        assert.ok(wait.text.includes('お待たせしたら'), wait.text);
        assert.ok(!wait.text.includes('埋め合っ'), wait.text);
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

        const kuri = sanitize.correctZhDomainMistranslations(FIX.kuriPenisBadZh, FIX.kuriLineJa);
        assert.ok(kuri.changed);
        assert.strictEqual(kuri.text, FIX.kuriClitOkZh);

        const kame = sanitize.correctZhDomainMistranslations(FIX.kamePenisBadZh, FIX.kameLineJa);
        assert.ok(kame.changed);
        assert.strictEqual(kame.text, FIX.kameGlansOkZh);

        const clitLatin = sanitize.correctZhDomainMistranslations(FIX.clitLatinBadZh, FIX.clitLatinJa);
        assert.ok(clitLatin.changed);
        assert.strictEqual(clitLatin.text, FIX.clitLatinOkZh);

        const manko = sanitize.correctZhDomainMistranslations(FIX.mankoHiraPenisBadZh, FIX.mankoHiraPenisJa);
        assert.ok(manko.changed);
        assert.strictEqual(manko.text, FIX.mankoHiraPenisOkZh);

        const chinMaru = sanitize.correctZhDomainMistranslations(FIX.chinMaruPenisBadZh, FIX.chinMaruPenisJa);
        assert.ok(chinMaru.changed);
        assert.strictEqual(chinMaru.text, FIX.chinMaruPenisOkZh);

        const erectStub = sanitize.correctZhDomainMistranslations(FIX.erectStubBadZh, FIX.erectStubJa);
        assert.ok(erectStub.changed);
        assert.strictEqual(erectStub.text, FIX.erectStubOkZh);

        const hardAlso = sanitize.correctZhDomainMistranslations(FIX.hardAlsoStubBadZh, FIX.hardAlsoStubJa);
        assert.ok(hardAlso.changed);
        assert.strictEqual(hardAlso.text, FIX.hardAlsoStubOkZh);

        const maybeLeak = sanitize.correctZhDomainMistranslations(FIX.maybeLeakZh, 'なんかこれでしょうね');
        assert.ok(maybeLeak.changed);
        assert.strictEqual(maybeLeak.text, FIX.maybeLeakOkZh);

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
        assert.ok(iku.changed || iku.text === FIX.ikuShootOkZh);
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
        assert.ok(ikuSou.changed || /射了|要射|能射|射出来/.test(ikuSou.text));
        assert.strictEqual(ikuSou.text, FIX.ikuSouOkZh);

        const ika = sanitize.correctZhDomainMistranslations(FIX.ikaSareBadZh, FIX.ikaSareJa);
        assert.ok(ika.changed || /射了|要射/.test(ika.text));
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
            ['はぁ…はぁ…かわいい', '哈…，好可爱'],
            ['んむぅ…あむぅ…', '嗯嗯'],
            ['オオォォッ!', '哦~~！'],
            ['ジー…', '盯……'],
            ['あひっ、ひっ…!', '啊啊'],
            ['ああ、隊長。', '啊，队长'],
            ['ねえ、てんつー', '喂，てんつー'],
            ['はぁ…だんなら…もっと入れて…', '哈…，那就再插进来'],
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
            ['はあっ…くそっ', '哈…，该死'],
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
        assert.ok(/哈…/.test(moan.text));

        const wetMix = sanitize.sanitizeMtCueText(
            '哈…，哈…',
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

    it('batch-0811pm: clinical vagina/penis soft remap + latin SFX / pinyin blank', () => {
        const av = { contentProfile: 'av_soft' };
        const vagina = sanitize.sanitizeMtCueText('你阴道里真的好热', '熱い身体は', av);
        assert.ok(vagina.text.includes('小穴') && !vagina.text.includes('阴道'), vagina.text);

        const yinbu = sanitize.sanitizeMtCueText('我要看看你的阴部啊', '見せて', av);
        assert.ok(yinbu.text.includes('小穴') && !yinbu.text.includes('阴部'), yinbu.text);

        const penis = sanitize.sanitizeMtCueText('已经像我的阴茎形状了？', 'もう俺の形になってる？', av);
        assert.ok(penis.text.includes('肉棒') && !penis.text.includes('阴茎'), penis.text);

        const glans = sanitize.sanitizeMtCueText('阴茎头好敏感', '亀頭が', av);
        assert.strictEqual(glans.text, '龟头好敏感');

        const lick = sanitize.sanitizeMtCueText('再舔舔', 'こっちも…こっちも舐めて…', av);
        assert.ok(/这边也/.test(lick.text), lick.text);

        const boeh = sanitize.sanitizeMtCueText('Boeh~', 'ん、ぁ…', av);
        assert.ok(boeh.flags.includes('latin_garbage') || !/Boeh/i.test(boeh.text), boeh.text);

        const yuk = sanitize.sanitizeMtCueText('哈 Yuk~', 'はぁ…', av);
        assert.ok(!/Yuk/i.test(yuk.text), yuk.text);

        assert.ok(sanitize.isLatinGarbageZh('Ima zhào liu le shéyo?', 'ち、ちっ、ちっ…'));
        const pinyin = sanitize.sanitizeMtCueText('Ima zhào liu le shéyo?', 'ち、ちっ、ちっ…', av);
        assert.ok(!/zhào|Ima/i.test(pinyin.text), pinyin.text);
    });

    it('batch-0811eve: mixed bump/_killchan strip + 出され/ちんちん stubs', () => {
        const av = { contentProfile: 'av_soft' };
        const bump = sanitize.sanitizeMtCueText('嗯 bump… bump', 'ぉ…あふぃ', av);
        assert.ok(!/bump/i.test(bump.text), bump.text);
        assert.ok(/嗯/.test(bump.text), bump.text);

        const kill = sanitize.sanitizeMtCueText('_killchan…', 'ワザル?', av);
        assert.ok(!/killchan/i.test(kill.text), kill.text);

        const dashite = sanitize.sanitizeMtCueText(
            '啊啊快停下啊我要射了出不来了',
            'ああっやめろぉっイッちゃい…出されませっイク',
            av,
        );
        assert.ok(/射出来/.test(dashite.text) && !/出不来/.test(dashite.text), dashite.text);
        assert.ok(!/射了射出来/.test(dashite.text), dashite.text);

        const touch = sanitize.sanitizeMtCueText('没摸呢', 'ちんちん触ってないよ', av);
        assert.ok(/肉棒/.test(touch.text) && /没摸/.test(touch.text), touch.text);
    });

    it('batch-0811night: latin scrap widen + manko climax + hard-rod stub', () => {
        const av = { contentProfile: 'av_soft' };
        const umm = sanitize.sanitizeMtCueText('啊 umm 嗯嗯…', 'ん', av);
        assert.ok(!/umm/i.test(umm.text), umm.text);

        const hya = sanitize.sanitizeMtCueText('啊哟哟…hya ma hya ma…', 'もう我慢できてないじゃんずっと', av);
        assert.ok(!/hya|ma ma/i.test(hya.text), hya.text);

        const already = sanitize.sanitizeMtCueText('你 already 要回家了吗？', 'もう帰るの', av);
        assert.ok(/已经/.test(already.text) && !/already/i.test(already.text), already.text);

        const manko = sanitize.sanitizeMtCueText(
            '哈啊、哈啊',
            '久司朗さんのおちんぽでわたしもおまんこいっちゃ…',
            av,
        );
        assert.ok(/去了|小穴/.test(manko.text) && !/射了/.test(manko.text), manko.text);

        const hard = sanitize.sanitizeMtCueText('哥哥…', 'おちんちん硬い…あ、あい…', av);
        assert.ok(/肉棒/.test(hard.text) && /硬/.test(hard.text), hard.text);

        const sfx = sanitize.sanitizeMtCueText('啊ひゅっ…啊、啊…', 'どうせよか何かの?', av);
        assert.ok(!/ひゅ/.test(sfx.text), sfx.text);
    });

    it('batch-engine-0811: English lemmas + under stubs + ロブA strip', () => {
        const av = { contentProfile: 'av_soft' };
        const impressive = sanitize.sanitizeMtCueText('好吧 真 impressive 啊', 'さあ、感心だ… ぉー', av);
        assert.ok(/令人佩服/.test(impressive.text) && !/impressive/i.test(impressive.text), impressive.text);

        const everyone = sanitize.sanitizeMtCueText('我给 everyone 都舔一遍', 'ほらみんなのも舐めてやるよ', av);
        assert.ok(/大家/.test(everyone.text) && !/everyone/i.test(everyone.text), everyone.text);

        const intro = sanitize.sanitizeMtCueText('我是渚', '渚です、よろしくお願いします', av);
        assert.ok(/请多指教/.test(intro.text), intro.text);

        const lick = sanitize.sanitizeMtCueText('亲一下', '一回すれ…一回舐めて', av);
        assert.strictEqual(lick.text, '舔一下');

        const oral = sanitize.sanitizeMtCueText('用嘴', '口で、口で舐めて欲しい', av);
        assert.ok(/舔/.test(oral.text), oral.text);

        const insert = sanitize.sanitizeMtCueText('不插', 'ぶちこんでやらない…入れてくださいんっ!', av);
        assert.ok(/插进来/.test(insert.text), insert.text);

        const hard = sanitize.sanitizeMtCueText('又伸', 'おちんちんまたすゆいな', av);
        assert.ok(/肉棒/.test(hard.text) && /硬/.test(hard.text), hard.text);

        const rob = sanitize.sanitizeMtCueText('啊，ロブA，你回来了。', 'あ、スヴェさんごめんあがってあがって!', av);
        assert.ok(!/ロブ/.test(rob.text) && /回来/.test(rob.text), rob.text);
    });

    it('batch-engine-0811n2: bedroom/better/鸡鸡/りね/姐姐 stubs', () => {
        const av = { contentProfile: 'av_soft' };
        const room = sanitize.sanitizeMtCueText(
            '能不能让我进 bedroom 里？',
            'アキラ部屋から出ててもらえないか?',
            av,
        );
        assert.ok(/房间|出去/.test(room.text) && !/bedroom|进房间里/i.test(room.text), room.text);

        const better = sanitize.sanitizeMtCueText('哈 不射是不是感觉 better？', 'はあっ…なきゃ気持ちいい?', av);
        assert.ok(/更好/.test(better.text) && !/better/i.test(better.text), better.text);

        const chick = sanitize.sanitizeMtCueText('的鸡鸡', 'キリカのおちんちん…', av);
        assert.ok(/肉棒/.test(chick.text) && !/鸡鸡/.test(chick.text), chick.text);

        const rine = sanitize.sanitizeMtCueText('りね 你咋了?', 'アきら、お前がか?', av);
        assert.ok(!/りね/.test(rine.text) && /咋了/.test(rine.text), rine.text);

        const jun = sanitize.sanitizeMtCueText('みゃーくん 感觉有点不一样', '淳くん、なんか雰囲気変わったね。', av);
        assert.ok(/淳/.test(jun.text) && !/みゃー/.test(jun.text), jun.text);

        const onee = sanitize.sanitizeMtCueText('姐姐', 'お姉ちゃん…お姉ちゃんを舐めたい', av);
        assert.ok(/舔/.test(onee.text) && /姐姐/.test(onee.text), onee.text);
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

        const pinpin = sanitize.sanitizeMtCueText('嗯~~！', FIX.pinpinLineJa, {
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

        // イッちゃいます → 要射了（NSFW口径）
        const itchai = sanitize.correctZhDomainMistranslations('要射了', 'イッちゃいます…');
        assert.ok(itchai.changed || /射了|要射/.test(itchai.text));
        assert.strictEqual(itchai.text, '要射了');

        // Bare 射了 / 快射了 / 又射了 under climax JA
        const shot = sanitize.correctZhDomainMistranslations('射了！', 'イクッ!');
        assert.ok(shot.changed || /射了|要射/.test(shot.text));
        assert.ok(/射了/.test(shot.text), shot.text);

        const again = sanitize.correctZhDomainMistranslations(
            '又射了，老师…哈…哈',
            'またイッちゃったの先生…はぁはぁ…',
        );
        assert.ok(again.changed || /射了|要射/.test(again.text));
        assert.ok(/又射了/.test(again.text), again.text);

        const soon = sanitize.correctZhDomainMistranslations('快射了', 'イキそう…ああイク…');
        assert.ok(soon.changed || /射了|要射/.test(soon.text));
        assert.ok(/快射了/.test(soon.text), soon.text);

        // Protect 不要射了
        const dont = sanitize.correctZhDomainMistranslations(
            '啊…啊啊…不、不要射了… 啊',
            'あっ…ああっ…だ、出しなきゃ… あ…',
        );
        assert.ok(/不要射了/.test(dont.text), dont.text);

        // Keep MIDA-728 iku-as-shoot fixture
        const iku = sanitize.correctZhDomainMistranslations(FIX.ikuShootBadZh, FIX.ikuShootJa);
        assert.ok(iku.changed || iku.text === FIX.ikuShootOkZh);
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
        assert.ok(/要射了/.test(aniku.text), aniku.text);

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
        assert.ok(penis.changed || /射了|要射/.test(penis.text));
        assert.ok(/肉棒/.test(penis.text) && !/阴茎/.test(penis.text), penis.text);

        const trunc = sanitize.correctZhDomainMistranslations('啊啊啊射了', 'ひゃああぁぁっイッちゃ…');
        assert.ok(trunc.changed || /射了|要射/.test(trunc.text));
        assert.ok(/射了/.test(trunc.text), trunc.text);

        const itte = sanitize.correctZhDomainMistranslations(
            '射了…射了…哈哈',
            'イッて…イッちゃ…はぁはぁ…',
        );
        assert.ok(itte.changed || /射了|要射/.test(itte.text));
        assert.ok(/射了/.test(itte.text), itte.text);

        const ikiso = sanitize.correctZhDomainMistranslations(
            '硬挺着…要射了…蓝君…蓝君',
            'はげしゅぎゅ…イきそ…んんっ藍くん…藍くん…',
        );
        assert.ok(ikiso.changed || /射了|要射/.test(ikiso.text));
        assert.ok(/要射了/.test(ikiso.text), ikiso.text);

        const grandpa = sanitize.correctZhDomainMistranslations(
            '爷爷也要出来了',
            'あばあも出ちゃいそう…出して…',
        );
        assert.ok(grandpa.changed || /射了|要射/.test(grandpa.text));
        assert.ok(!/爷爷/.test(grandpa.text), grandpa.text);
        assert.ok(/出来/.test(grandpa.text), grandpa.text);

        const juice = sanitize.correctZhDomainMistranslations('好像要射了', 'おしるみたい…');
        assert.ok(juice.changed || /射了|要射/.test(juice.text));
        assert.ok(/汁/.test(juice.text), juice.text);

        const name = sanitize.correctZhDomainMistranslations('一君', 'あっ、イク…');
        assert.ok(name.changed || /射了|要射/.test(name.text));
        assert.ok(/要射了/.test(name.text), name.text);

        const lick = sanitize.sanitizeMtCueText(
            '嗯嗯',
            'ほら舐めて…んんっんむ…から舐めて…',
            { contentProfile: 'av_soft' },
        );
        assert.ok(/舔/.test(lick.text), lick.text);

        const asr = sanitize.correctJaAsrDomainMishears('あばあも出ちゃいそう…');
        assert.ok(asr.changed || /射了|要射/.test(asr.text));
        assert.ok(/あ、もう/.test(asr.text), asr.text);

        // Anti-regression: prior IPZZ iku→came + kiniri
        const itchai = sanitize.correctZhDomainMistranslations('要射了', 'イッちゃいます…');
        assert.strictEqual(itchai.text, '要射了');
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
        assert.ok(iku.changed || /射了|要射/.test(iku.text));
        assert.strictEqual(iku.text, '要射了');

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
        assert.ok(xingle.changed || /射了|要射/.test(xingle.text));
        assert.ok(/要射了/.test(xingle.text) && !/行了/.test(xingle.text), xingle.text);

        const xingle2 = sanitize.correctZhDomainMistranslations('行了行了…', 'いくいく…');
        assert.ok(xingle2.changed || /射了|要射/.test(xingle2.text));
        assert.ok(/要射了/.test(xingle2.text) && !/行了/.test(xingle2.text), xingle2.text);

        const yame = sanitize.correctZhDomainMistranslations('哈…要射了…', 'はぁ…りゃめ…');
        assert.ok(yame.changed || /射了|要射/.test(yame.text));
        assert.ok(/不要/.test(yame.text), yame.text);

        // イッた / イきゅ climax scraps → 射了 / 要射了
        const itta = sanitize.correctZhDomainMistranslations('啊、射了…嗯呼', 'ああイッた…んふぅ');
        assert.ok(itta.changed || /射了|要射/.test(itta.text));
        assert.ok(/射了/.test(itta.text), itta.text);
        const ikyu = sanitize.correctZhDomainMistranslations('哈…要射了…', 'はぁ…イきゅ…');
        assert.ok(ikyu.changed || /射了|要射/.test(ikyu.text));
        assert.ok(/要射了/.test(ikyu.text), ikyu.text);

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

        // Anti-regression: 失去了/过去了 must never become 失射了/过射了
        const lost = sanitize.sanitizeMtCueText('结婚纪念日那天我们失去了所有', '結婚記念日にすべてを失った', {
            contentProfile: 'av_soft',
        });
        assert.ok(/失去了/.test(lost.text), lost.text);
        assert.ok(!/失射了/.test(lost.text), lost.text);
        const lostIku = sanitize.correctZhDomainMistranslations('我失去了你', 'イッちゃう…あなたを失った');
        assert.strictEqual(lostIku.text.includes('失射了'), false, lostIku.text);
        assert.ok(/失去了/.test(lostIku.text), lostIku.text);
        const passed = sanitize.correctZhDomainMistranslations('这件事已经过去了', 'それはもう過ぎた');
        assert.ok(/过去了/.test(passed.text), passed.text);
        assert.ok(!/过射了/.test(passed.text), passed.text);
        const softIku = sanitize.correctZhDomainMistranslations('啊，去了', 'イッた');
        assert.ok(/射了/.test(softIku.text), softIku.text);
        const softNoIku = sanitize.correctZhDomainMistranslations('啊，去了', '行った');
        assert.ok(/去了/.test(softNoIku.text), softNoIku.text);
        assert.ok(!/射了/.test(softNoIku.text), softNoIku.text);
    });

    it('batch IPZZ-859/JUR-768/IPZZ-900/SNOS-289: iku-shotOut / yame-shot / lick stub / wet latin', () => {
        const shotOut = sanitize.correctZhDomainMistranslations(
            '真的能射出来吧？',
            '本気でいけろイク…イク…イク…',
        );
        assert.ok(/能射|射出来|射了|要射/.test(shotOut.text), shotOut.text);
        assert.ok(/能射|射出来/.test(shotOut.text), shotOut.text);

        const shotOut2 = sanitize.correctZhDomainMistranslations(
            '射出来吧，去了…去了…',
            'イク…ん、ん、ん…',
        );
        assert.ok(shotOut2.changed || /射了|要射/.test(shotOut2.text));
        assert.ok(/射了/.test(shotOut2.text), shotOut2.text);

        const ikuzo = sanitize.correctZhDomainMistranslations('哈啊，我要射了', 'はいくぞ');
        assert.ok(ikuzo.changed || /射了|要射/.test(ikuzo.text));
        assert.ok(/要射了/.test(ikuzo.text), ikuzo.text);

        // Keep ejac ZH when JA has 出して / 出され
        const keepEjac = sanitize.correctZhDomainMistranslations(
            '要射了…要射了…好，我也要射了。',
            'イク…イク…おーし俺も出してやるぞ。',
        );
        assert.ok(/要射了/.test(keepEjac.text), keepEjac.text);
        const keepDasare = sanitize.correctZhDomainMistranslations(
            '射出来…要射了…！',
            '出されて… イク痛いもんイクイク…!',
        );
        assert.ok(/射出来/.test(keepDasare.text), keepDasare.text);

        const yameShot = sanitize.correctZhDomainMistranslations(
            '不要，射了…哈啊哈啊…',
            'やめ、あげて…はぁはぁ…',
        );
        assert.ok(yameShot.changed);
        assert.ok(/不要/.test(yameShot.text), yameShot.text);

        const lick = sanitize.correctZhDomainMistranslations(
            '遍…',
            'いっぱい舐めて…はぁはぁ…',
        );
        assert.ok(lick.changed);
        assert.ok(/舔/.test(lick.text), lick.text);

        const juba = sanitize.sanitizeMtCueText('ijuhab…ab!', 'じゅばばばばばばっ!', {
            contentProfile: 'av_soft',
        });
        assert.ok(juba.text === '' || juba.text === '…', juba.text);

        const gross = sanitize.sanitizeMtCueText('啊衣gross', 'あいぐっ', {
            contentProfile: 'av_soft',
        });
        assert.ok(!/gross/i.test(gross.text), gross.text);
        assert.ok(/啊|嗯/.test(gross.text), gross.text);

        const chupu = sanitize.sanitizeMtCueText('吃 pun…嗯', 'ちゅぷん…んっ…', {
            contentProfile: 'av_soft',
        });
        assert.ok(!/pun|吃吧/i.test(chupu.text), chupu.text);
    });

    it('batch2: prompt-leak / dechau-out / rame / first-lick / wet-sfx / otuki ASR', () => {
        for (const [zh, ja] of [
            ['将下面的【】号句子翻译成中文。 请勿删除。', 'ぢゅぱっ'],
            ['你将下面这句话翻译成中文了。 请勿删除。', 'ちょむ'],
            ['将下面的日文单词移至对应句中，但不输出句尾的「」或「，」。', 'なななな…'],
            ['哈啊…就这样把头靠在上面吧', 'ごぼっ!'],
        ]) {
            const r = sanitize.sanitizeMtCueText(zh, ja, { contentProfile: 'av_soft' });
            assert.ok(r.text === '' || r.text === '…', `${ja} → ${r.text}`);
            assert.ok(!/翻译|请勿|对应句|把头靠/.test(r.text), r.text);
        }

        const dechau = sanitize.correctZhDomainMistranslations(
            '哈啊…哈啊…又要出来了…嗯嗯',
            'はぁ…はぁ…また出ちゃいそう…んんっ',
        );
        assert.ok(dechau.changed || /射了|要射/.test(dechau.text));
        assert.ok(/又要射了/.test(dechau.text) && !/出来了/.test(dechau.text), dechau.text);

        const patient = sanitize.sanitizeMtCueText('哈啊…病人要出来了…', 'はぁ…病人出ちゃう…', {
            contentProfile: 'av_soft',
        });
        assert.ok(!/病人|出来了/.test(patient.text), patient.text);
        assert.ok(/要射了|射了/.test(patient.text), patient.text);

        const asrPatient = sanitize.correctJaAsrDomainMishears('はぁ…病人出ちゃう…');
        assert.ok(asrPatient.changed);
        assert.ok(/びんびん出ちゃう/.test(asrPatient.text) && !/病人/.test(asrPatient.text), asrPatient.text);

        const rame = sanitize.correctZhDomainMistranslations(
            '好棒…可能不行了但是好舒服…',
            'らめらめ…',
        );
        assert.ok(rame.changed);
        assert.strictEqual(rame.text, '不要不要');

        const firstLick = sanitize.correctZhDomainMistranslations(
            '那个…',
            'こんなに舐めてくれるの初めて…',
        );
        assert.ok(firstLick.changed);
        assert.ok(/舔/.test(firstLick.text), firstLick.text);

        const ikubang = sanitize.correctZhDomainMistranslations(
            '啊，啊，不行…啊，啊，啊…',
            'イクッ!',
        );
        assert.ok(ikubang.changed || /射了|要射/.test(ikubang.text));
        assert.ok(/要射了/.test(ikubang.text), ikubang.text);

        const otukiAsr = sanitize.correctJaAsrDomainMishears('おつきで…');
        assert.ok(otukiAsr.changed);
        assert.ok(/おっきくて/.test(otukiAsr.text), otukiAsr.text);
        const otuki = sanitize.sanitizeMtCueText(
            '在日本的一座城市，以螃蟹著名的地方',
            'おつきで…',
            { contentProfile: 'av_soft' },
        );
        assert.ok(!/螃蟹|城市/.test(otuki.text), otuki.text);
        assert.ok(/大/.test(otuki.text), otuki.text);

        // Anti-regression: keep 出して ejac ZH
        const keep = sanitize.correctZhDomainMistranslations(
            '要射了…要射了…好，我也要射了。',
            'イク…イク…おーし俺も出してやるぞ。',
        );
        assert.ok(/要射了/.test(keep.text), keep.text);
    });

    it('batch3: kimochi stubs + dechau with 外に出し', () => {
        const hot = sanitize.correctZhDomainMistranslations(
            '好热…',
            'はぁ…これ、気持ちいい?',
        );
        assert.ok(hot.changed);
        assert.ok(/舒服吗/.test(hot.text) && !/好热/.test(hot.text), hot.text);

        const feel = sanitize.correctZhDomainMistranslations('感觉好', '気持ちいい…ぉ…');
        assert.ok(feel.changed);
        assert.ok(/好舒服/.test(feel.text) && !/感觉好/.test(feel.text), feel.text);

        const moan = sanitize.correctZhDomainMistranslations('哈啊哈啊', '気持ちいい');
        assert.ok(moan.changed);
        assert.ok(/好舒服/.test(moan.text), moan.text);

        const soto = sanitize.correctZhDomainMistranslations(
            '要出来了，已经…要射在外面了…',
            '出ちゃいそう、もう…外に出しちゃだ…',
        );
        assert.ok(soto.changed || /射了|要射/.test(soto.text));
        assert.ok(/要射了/.test(soto.text) && /射在外面/.test(soto.text), soto.text);
        assert.ok(!/要出来了/.test(soto.text), soto.text);

        // Anti-regression: grandpa 出ちゃい + 出来了 keep path
        const grandpa = sanitize.correctZhDomainMistranslations(
            '爷爷也要出来了',
            'あばあも出ちゃいそう…出して…',
        );
        assert.ok(!/爷爷/.test(grandpa.text), grandpa.text);
        assert.ok(/出来/.test(grandpa.text), grandpa.text);
    });

    it('LULU-394: dashicha-dame ASR polarity + saicchi→seimen', () => {
        const asr1 = sanitize.correctJaAsrDomainMishears('また出しちゃダイッておうか…');
        assert.ok(asr1.changed);
        assert.ok(/出しちゃダメっていうか/.test(asr1.text), asr1.text);

        const flip = sanitize.sanitizeMtCueText('请射出来吧…', 'また出しちゃダイッておうか…', {
            contentProfile: 'av_soft',
        });
        assert.ok(flip.changed);
        assert.ok(/不能射|不许射/.test(flip.text) || /又说不能射/.test(flip.text), flip.text);
        assert.ok(!/请射/.test(flip.text), flip.text);

        const asr2 = sanitize.correctJaAsrDomainMishears('サイッチダメですから…');
        assert.ok(asr2.changed);
        assert.ok(/射精ダメ/.test(asr2.text) && !/サイッチ/.test(asr2.text), asr2.text);

        // Keep real 出してください request
        const keep = sanitize.sanitizeMtCueText('请射出来吧…', '出してくださいよ…', {
            contentProfile: 'av_soft',
        });
        assert.ok(/请射|射出来/.test(keep.text), keep.text);
    });

    it('batch-engine-0812: latin lemmas/SFX, 小鸡鸡, らめイク, kana scraps', () => {
        const av = { contentProfile: 'av_soft' };

        const pretty = sanitize.sanitizeMtCueText('还 pretty 有劲儿呢', 'まだ結構…', av);
        assert.ok(/挺/.test(pretty.text) && !/pretty/i.test(pretty.text), pretty.text);

        const senpai = sanitize.sanitizeMtCueText('嗯哼 senpai 嗯嗯', 'んふっふっふっせんぱい、んんー', av);
        assert.ok(/前辈/.test(senpai.text) && !/senpai/i.test(senpai.text), senpai.text);

        const addle = sanitize.sanitizeMtCueText('addle 里面不行 这么深处还在高潮', 'あだめ…中はダメです', av);
        assert.ok(!/addle/i.test(addle.text) && /里面不行/.test(addle.text), addle.text);

        const slur = sanitize.sanitizeMtCueText('啊 啊 嗯 slur slur', 'あ…あ…んんっジュルルルルルル', av);
        assert.ok(!/slur/i.test(slur.text), slur.text);

        const more = sanitize.sanitizeMtCueText('啊 more more 嗯啊 more more', 'あもっとしこしこし…', av);
        assert.ok(!/more/i.test(more.text) && /再/.test(more.text), more.text);

        const fuck = sanitize.sanitizeMtCueText('不行 fuck 好厉害', 'ダメ…んっ、ふぁっ、しゅごい…はぁ', av);
        assert.ok(!/fuck/i.test(fuck.text) && /不行/.test(fuck.text), fuck.text);

        const say = sanitize.sanitizeMtCueText('did you say it?', '言ったのか?', av);
        assert.ok(/你说了吗/.test(say.text) && !/did you/i.test(say.text), say.text);

        const bang = sanitize.sanitizeMtCueText('bang', 'ぶっ!', av);
        assert.ok(!/bang/i.test(bang.text), bang.text);

        const chick = sanitize.sanitizeMtCueText('啊好厉害 小鸡鸡 好舒服', 'あすごい…ちぃよ…おちんこ…気持ちいい', av);
        assert.ok(/肉棒/.test(chick.text) && !/鸡鸡/.test(chick.text), chick.text);

        const rame = sanitize.sanitizeMtCueText('该死该死的要射要射了', 'らめらめっイクイクッ!', av);
        assert.ok(/不行不行/.test(rame.text) && /要去了/.test(rame.text) && !/该死/.test(rame.text) && !/要射了/.test(rame.text), rame.text);

        const rameMoan = sanitize.sanitizeMtCueText(
            '嗯 来来来 一嗯 呜呜 好 呜',
            'んんっらめらめぇ…いっんんっひっくうっうれめぇ…',
            av,
        );
        assert.ok(!/要射了/.test(rameMoan.text), rameMoan.text);

        const chama = sanitize.sanitizeMtCueText('ちゃま 做我一个人的老师', '私だけの先生になってくだ', av);
        assert.ok(!/ちゃま/.test(chama.text) && /老师/.test(chama.text), chama.text);

        const chan = sanitize.sanitizeMtCueText('ちゃん 做我一个人的老师吧', '私だけの先生になってくだ', av);
        assert.ok(!/ちゃん/.test(chan.text) && /老师/.test(chan.text), chan.text);

        const teacher = sanitize.sanitizeMtCueText('…', '先生のちんこ舐めてくれないか?', av);
        assert.ok(/老师/.test(teacher.text) && /舔/.test(teacher.text) && /肉棒/.test(teacher.text), teacher.text);
    });

    it('batch-engine-0812am: ちくび≠鸡鸡, おこちょ, kun/Guam, stubs', () => {
        const av = { contentProfile: 'av_soft' };

        const nip = sanitize.sanitizeMtCueText('是鸡鸡吗？', 'ちくび?', av);
        assert.ok(/乳头/.test(nip.text) && !/鸡鸡/.test(nip.text), nip.text);

        const nip2 = sanitize.sanitizeMtCueText('鸡鸡 舒服吗?', 'ちくび、気持ちいい?', av);
        assert.ok(/乳头/.test(nip2.text) && !/鸡鸡/.test(nip2.text), nip2.text);

        const oko = sanitize.sanitizeMtCueText('想学长的鸡鸡 哈哈', '先輩のおこちょほしい…はぁはぁ…', av);
        assert.ok(/肉棒/.test(oko.text) && !/鸡鸡/.test(oko.text), oko.text);

        const kun = sanitize.sanitizeMtCueText('一君 加个 kun？', 'いちくん…くん付け?', av);
        assert.ok(/「君」/.test(kun.text) && !/kun/i.test(kun.text), kun.text);

        const guam = sanitize.sanitizeMtCueText('你喜欢夏威夷还是 Guam？', 'ハワイとグアもどっちが好き?', av);
        assert.ok(/关岛/.test(guam.text) && !/Guam/i.test(guam.text), guam.text);

        const scrap = sanitize.sanitizeMtCueText('在那里做乌冬面吗？ iorene？', 'そこでうどんくるのよいろね?', av);
        assert.ok(!/iorene/i.test(scrap.text) && /乌冬/.test(scrap.text), scrap.text);

        const leak = sanitize.sanitizeMtCueText('咦 皋小姐？改為「咦 ちゃん？」', 'えっ、皐さん?', av);
        assert.ok(/皋小姐/.test(leak.text) && !/改為|ちゃん/.test(leak.text), leak.text);

        const yame = sanitize.sanitizeMtCueText('哈哈 停住 要射了 热乎乎的', 'はぁはぁ…やめね…イッちゃう…熱くて…', av);
        assert.ok(/不要/.test(yame.text) && /要去了/.test(yame.text) && !/停住|要射了/.test(yame.text), yame.text);

        const hard = sanitize.sanitizeMtCueText('哈 硬了', 'はぁ…おちんちん、硬い…', av);
        assert.ok(/肉棒/.test(hard.text) && /硬/.test(hard.text), hard.text);

        const twitch = sanitize.sanitizeMtCueText('在颤抖', 'おちんちんピクピクして…', av);
        assert.ok(/肉棒/.test(twitch.text), twitch.text);

        const please = sanitize.sanitizeMtCueText('插进去', 'おちんちんぱいちょうだい…気持ちいい…', av);
        assert.ok(/肉棒/.test(please.text) && /给我/.test(please.text), please.text);
    });

    it('batch-engine-0812b: SNOS-298 おじんぽ / エッチ触って / 密着イッ', () => {
        const av = { contentProfile: 'av_soft' };

        const ojin = sanitize.sanitizeMtCueText('鸡鸡 嗯', 'おじんぽ、ん', av);
        assert.ok(/肉棒/.test(ojin.text) && !/鸡鸡/.test(ojin.text), ojin.text);

        const touch = sanitize.sanitizeMtCueText('请', 'エッチに触ってくださぃ…', av);
        assert.ok(/色气|摸/.test(touch.text) && !/^请$/.test(touch.text.trim()), touch.text);

        const missaku = sanitize.sanitizeMtCueText('要射了', '経は密着…密着したままイッたりされるのです', av);
        assert.ok(/贴着|高潮/.test(missaku.text) && !/^要射了$/.test(missaku.text.trim()), missaku.text);

        const iq = sanitize.sanitizeMtCueText('不好吧？ 啊', 'よくない? あイッちゃいますか?', av);
        assert.ok(/要去了吗/.test(iq.text) && !/要射了/.test(iq.text), iq.text);

        const yuri = sanitize.sanitizeMtCueText('Yuri 的笑容最迷人', 'ゆりのさんが一番キリ顔してます。', av);
        assert.ok(/Yuri/.test(yuri.text) && /笑容/.test(yuri.text), yuri.text);
    });

    it('batch-engine-0812noon: #/12 latin SFX, lick/fella stubs, 嘿咻, エロイン', () => {
        const av = { contentProfile: 'av_soft' };

        const die = sanitize.sanitizeMtCueText('死 die hu hu 犯规?', '死んじゃうじゃう、うふふふふっ…反則?', av);
        assert.ok(!/die|hu\b/i.test(die.text) && /犯规|死/.test(die.text), die.text);

        const han = sanitize.sanitizeMtCueText('嗯 啊 han 又要高潮了', 'んっ…はぁんっまたイキそう…', av);
        assert.ok(!/\bhan\b/i.test(han.text) && /高潮/.test(han.text), han.text);

        const darling = sanitize.sanitizeMtCueText('darling ん', 'ダーリンえりーン', av);
        assert.ok(/亲爱的/.test(darling.text) && !/darling/i.test(darling.text), darling.text);

        const lick = sanitize.sanitizeMtCueText('舔舔', 'ち、ちんちん舐めて…', av);
        assert.ok(/肉棒/.test(lick.text) && /舔/.test(lick.text), lick.text);

        const touch = sanitize.sanitizeMtCueText('亲 亲', 'エッチに触ってくださぃ…', av);
        assert.ok(/色气|摸/.test(touch.text), touch.text);

        const once = sanitize.sanitizeMtCueText('一次', '一回すれ…一回舐めて', av);
        assert.ok(/舔一次/.test(once.text), once.text);

        const yoro = sanitize.sanitizeMtCueText('你好', 'よろしくお願いします。', av);
        assert.ok(/请多指教/.test(yoro.text), yoro.text);

        const hard = sanitize.sanitizeMtCueText('啊 硬了', 'あ、おちんちん…かったら…', av);
        assert.ok(/肉棒/.test(hard.text) && /硬/.test(hard.text), hard.text);

        const fell = sanitize.sanitizeMtCueText(
            '用口舔',
            '口でな舐めてください…ふぇフェラ…フェラしてください…',
            av,
        );
        assert.ok(/嘴|口交|舔/.test(fell.text) && /请/.test(fell.text), fell.text);

        const like = sanitize.sanitizeMtCueText('小是啊', 'ねえちゃんはさ…んっフェラ好きだ…', av);
        assert.ok(/口交/.test(like.text), like.text);

        const sexed = sanitize.sanitizeMtCueText('射了', 'キステックスしたな…どうなった?', av);
        assert.ok(/做了/.test(sexed.text) && !/^射了$/.test(sexed.text.trim()), sexed.text);

        const heixiu = sanitize.sanitizeMtCueText(
            '好喜欢 我也好喜欢 啊嘿咻 哈哈',
            '大好き…私も大好き…あっそうくっ…はぁはぁっ…んくっ…',
            av,
        );
        assert.ok(!/嘿咻/.test(heixiu.text) && /喜欢/.test(heixiu.text), heixiu.text);

        const heroin = sanitize.sanitizeMtCueText('可以有Eロイン', 'エロインできる。', av);
        assert.ok(/女主角/.test(heroin.text) && !/ロイン/.test(heroin.text), heroin.text);

        const san = sanitize.sanitizeMtCueText(
            'さん 那个 在这里 平时这种事',
            '陽子さんが…だってその…こんなとこつはぁ…はぁ…普段こういうこと',
            av,
        );
        assert.ok(/陽子|阳子/.test(san.text) && !/^さん/.test(san.text.trim()), san.text);
    });

    it('batch-engine-0812eve: IPZZ-907/START-593 stubs + wet/latin', () => {
        const av = { contentProfile: 'av_soft' };

        const snot = sanitize.sanitizeMtCueText('snot ん', 'ぐすっ…もっへく… ん', av);
        assert.ok(!/snot/i.test(snot.text), snot.text);

        const buzz = sanitize.sanitizeMtCueText('buzz 哇', 'ちゅぶっ…! んっ', av);
        assert.ok(!/buzz/i.test(buzz.text), buzz.text);

        const big = sanitize.sanitizeMtCueText('硬得很', 'おちんちんしょんらいのおっきしてる…', av);
        assert.ok(/肉棒/.test(big.text) && /大|硬/.test(big.text), big.text);

        const nip = sanitize.sanitizeMtCueText('美砂', '乳首、舐めて欲しい…', av);
        assert.ok(/乳头/.test(nip.text) && /舔/.test(nip.text) && !/美砂/.test(nip.text), nip.text);

        const take = sanitize.sanitizeMtCueText('拿过来', '取って、直接触って…', av);
        assert.ok(/摸/.test(take.text) && /拿/.test(take.text), take.text);

        const lick = sanitize.sanitizeMtCueText('我稍微', '私はちょっと舐めてあげるから…', av);
        assert.ok(/舔/.test(lick.text), lick.text);

        const raw = sanitize.sanitizeMtCueText('硬挺的', '生のおちんちん…届いてる…おくちも…', av);
        assert.ok(/肉棒/.test(raw.text) && /顶/.test(raw.text), raw.text);

        const want = sanitize.sanitizeMtCueText('想要？', 'おちんちん欲しいの?', av);
        assert.ok(/肉棒/.test(want.text), want.text);

        const tag = sanitize.sanitizeMtCueText('啊 插进去 - あゆうこ', 'あ、入って…', av);
        assert.ok(!/あゆうこ/.test(tag.text) && /插/.test(tag.text), tag.text);

        const wet = sanitize.sanitizeMtCueText('哦汁 啊', 'ジュルルルルルルッ!', av);
        assert.ok(!/哦汁/.test(wet.text) || wet.text === '…' || !wet.text.trim() || /^[…·.\s]*$/.test(wet.text), wet.text);
    });

    it('batch-engine-0812late: FNS/DVAJ teacher stubs, ディル, sov/feira', () => {
        const av = { contentProfile: 'av_soft' };

        const sov = sanitize.sanitizeMtCueText('sov sov 加油', 'そ、そん…がんば…は…', av);
        assert.ok(!/sov/i.test(sov.text) && /加油/.test(sov.text), sov.text);

        const ima = sanitize.sanitizeMtCueText('大-ima', 'だいまー', av);
        assert.ok(!/ima/i.test(ima.text), ima.text);

        const feira = sanitize.sanitizeMtCueText('吧-feira', 'ぱいふぁい…', av);
        assert.ok(!/feira/i.test(feira.text), feira.text);

        const kiss = sanitize.sanitizeMtCueText('先生', '先生、いっぱいキスして…', av);
        assert.ok(/亲/.test(kiss.text) && /老师/.test(kiss.text), kiss.text);

        const lick = sanitize.sanitizeMtCueText('老师', 'せんせい、いっぱい舐めて…', av);
        assert.ok(/舔/.test(lick.text) && /老师/.test(lick.text), lick.text);

        const more = sanitize.sanitizeMtCueText('太棒了', 'トオベテタ…いっぱい舐めて…', av);
        assert.ok(/舔/.test(more.text), more.text);

        const rod = sanitize.sanitizeMtCueText('老公', 'お…おちんちん…しゅごい…', av);
        assert.ok(/肉棒/.test(rod.text) && !/老公/.test(rod.text), rod.text);

        const tip = sanitize.sanitizeMtCueText('软软的', 'おちんちんぽぽん…先っぽ弱いね…', av);
        assert.ok(/肉棒/.test(tip.text) && /敏感|前端/.test(tip.text), tip.text);

        const pan = sanitize.sanitizeMtCueText('竟然变成了老公的鸡鸡棒棒了 哈', 'っちゃった…はぁ…パンパン…', av);
        assert.ok(!/鸡鸡|肉棒/.test(pan.text) && /胀鼓鼓|哈/.test(pan.text), pan.text);

        const dil = sanitize.sanitizeMtCueText('难道你喜欢ディル？', 'もしかして奥とか好き?', av);
        assert.ok(!/ディル/.test(dil.text) && /喜欢/.test(dil.text), dil.text);
    });

    it('batch-engine-0812night: show/フェラ/キス/らめぇ stubs', () => {
        const av = { contentProfile: 'av_soft' };

        const show = sanitize.sanitizeMtCueText(
            'show 只前端的话就没什么意义',
            '見せて…先っぽだけだったらわけになんないよ',
            av,
        );
        assert.ok(/给我看/.test(show.text) && !/show/i.test(show.text), show.text);

        const fella = sanitize.sanitizeMtCueText('想', '口に…やられてみたいです…フェラ…', av);
        assert.ok(/口交/.test(fella.text), fella.text);

        const first = sanitize.sanitizeMtCueText('第一次', '初めてなんだ…どう?', av);
        assert.ok(/第一次/.test(first.text) && /怎么样/.test(first.text), first.text);

        const kiss = sanitize.sanitizeMtCueText('这边啊', 'こっちあん…キスキスしてね…', av);
        assert.ok(/亲/.test(kiss.text), kiss.text);

        const nro = sanitize.sanitizeMtCueText('好好看着哦 んろ', 'ちゃんと見てておろ…んろ…', av);
        assert.ok(!/んろ/.test(nro.text) && /看着/.test(nro.text), nro.text);

        const rame = sanitize.sanitizeMtCueText('啊 来啦', 'あ、らめぇ…イクイクイクイク…', av);
        assert.ok(/不行/.test(rame.text) && /要去了/.test(rame.text) && !/来啦/.test(rame.text) && !/要射了/.test(rame.text), rame.text);

        const nip = sanitize.sanitizeMtCueText('老师', 'せんせい、乳首でイキます…', av);
        assert.ok(/乳头/.test(nip.text) && /老师/.test(nip.text) && /要去了/.test(nip.text) && !/要射了/.test(nip.text), nip.text);

        const mankoShoot = sanitize.sanitizeMtCueText('要射了', 'おまんこいっちゃう…', av);
        assert.ok(/去了/.test(mankoShoot.text) && !/要射了/.test(mankoShoot.text), mankoShoot.text);

        const bad = sanitize.sanitizeMtCueText('不好意思', '悪い乳首ですよ、この…', av);
        assert.ok(/乳头/.test(bad.text) && !/不好意思/.test(bad.text), bad.text);

        const tip = sanitize.sanitizeMtCueText('不行', 'だめ、先っぽだけ…んふふ', av);
        assert.ok(/前端/.test(tip.text) && /不行/.test(tip.text), tip.text);
    });

    it('batch-engine-0812train: under stubs tip/dashite/iku/sensei', () => {
        const av = { contentProfile: 'av_soft' };

        const sorry = sanitize.sanitizeMtCueText('对不起', 'すみませんはい、先生', av);
        assert.ok(/老师/.test(sorry.text), sorry.text);

        const how = sanitize.sanitizeMtCueText('安达', '先生はどうするんですか?', av);
        assert.ok(/老师/.test(how.text) && /怎么办/.test(how.text) && !/安达/.test(how.text), how.text);

        const touch = sanitize.sanitizeMtCueText('给你开发', '触ってあげるから', av);
        assert.ok(/摸/.test(touch.text) && !/开发/.test(touch.text), touch.text);

        const tipOnly = sanitize.sanitizeMtCueText('那 嗯 嗯', 'じゃあ…ん、んっ…先っぽだけ…', av);
        assert.ok(/前端/.test(tipOnly.text), tipOnly.text);

        const dashiteTip = sanitize.sanitizeMtCueText('给我说', 'にぃに出して…先っぽ', av);
        assert.ok(/射|前端/.test(dashiteTip.text) && !/给我说/.test(dashiteTip.text), dashiteTip.text);

        const oppai = sanitize.sanitizeMtCueText('胸部前端', 'おっぱい先っぽ…すごい固くてきめ…', av);
        assert.ok(/硬/.test(oppai.text), oppai.text);

        const choudai = sanitize.sanitizeMtCueText('嗯嗯罗', 'んんろ…んふふ…んもっとちょうだい', av);
        assert.ok(/再|给/.test(choudai.text) && !/罗/.test(choudai.text), choudai.text);

        const chin = sanitize.sanitizeMtCueText('摸摸那里', 'いちんちん触って…', av);
        assert.ok(/肉棒/.test(chin.text), chin.text);

        const kimochi = sanitize.sanitizeMtCueText('请别在意', '気にもちょうだい…', av);
        assert.ok(/舒服/.test(kimochi.text) && !/别在意/.test(kimochi.text), kimochi.text);

        const rameDecha = sanitize.sanitizeMtCueText('真该死', 'らめぇおにいでちゃ…', av);
        assert.ok(/不行/.test(rameDecha.text) && /射/.test(rameDecha.text) && !/该死/.test(rameDecha.text), rameDecha.text);

        const ikuiku = sanitize.sanitizeMtCueText('快 快 啊 啊', 'イクイク…あ゛あ゛あ゛あ゛!', av);
        assert.ok(/要射了/.test(ikuiku.text), ikuiku.text);

        const shootShoot = sanitize.sanitizeMtCueText('射射！', 'イクイク…ッッ!', av);
        assert.ok(/要射了/.test(shootShoot.text), shootShoot.text);

        const rameIku = sanitize.sanitizeMtCueText('要射了', 'らめにいっちゃう…んんーっ!', av);
        assert.ok(/去了/.test(rameIku.text) && !/要射了/.test(rameIku.text), rameIku.text);

        const dashOk = sanitize.sanitizeMtCueText('那好吧?', 'じゃあ出してもいいよ?', av);
        assert.ok(/射/.test(dashOk.text), dashOk.text);

        const ippai = sanitize.sanitizeMtCueText('好了', 'はい、いっぱい出して…', av);
        assert.ok(/射/.test(ippai.text), ippai.text);

        const tatte = sanitize.sanitizeMtCueText('站着做', '立ったまま入れて…', av);
        assert.ok(/插/.test(tatte.text), tatte.text);

        const mada = sanitize.sanitizeMtCueText('好舒服', 'んんむ…んむ…んふっまだ入れちゃダメですか?', av);
        assert.ok(/插/.test(mada.text) && /不/.test(mada.text), mada.text);

        const lick = sanitize.sanitizeMtCueText('舔', 'ちくび舐めなめ…', av);
        assert.ok(/乳头/.test(lick.text), lick.text);

        const rub = sanitize.sanitizeMtCueText('吱 吱痒了', 'ち、ちくびこすれて…ちょっと…', av);
        assert.ok(/乳头/.test(rub.text) && /蹭/.test(rub.text), rub.text);

        const ikisou = sanitize.sanitizeMtCueText('啊 要射了', 'あ、イッちゃいそうよ。', av);
        assert.ok(/要去了/.test(ikisou.text) && !/要射了/.test(ikisou.text), ikisou.text);

        const look = sanitize.sanitizeMtCueText('看', 'ほら、先生のほら、見てみろ', av);
        assert.ok(/老师/.test(look.text), look.text);
    });

    it('batch-engine-0812algo: top-score nipple/sensei/rod/dashite/iku', () => {
        const av = { contentProfile: 'av_soft' };

        const neck = sanitize.sanitizeMtCueText('不行 恶心 脖子也恶心', 'だめ…きもひ…ちくびがきもひ…', av);
        assert.ok(/乳头/.test(neck.text) && !/脖子/.test(neck.text), neck.text);

        const drop = sanitize.sanitizeMtCueText('认真听也听不进去', '一生懸命に聞いてもダメ…乳首が…', av);
        assert.ok(/乳头/.test(drop.text), drop.text);

        const chest = sanitize.sanitizeMtCueText('怎么办，胸部好痒，好痒，忍不住了', 'どうしよう乳首が感じて感じて仕方ない', av);
        assert.ok(/乳头/.test(chest.text) && !/胸部/.test(chest.text), chest.text);

        const ano = sanitize.sanitizeMtCueText('那个', 'あの、先生', av);
        assert.ok(/老师/.test(ano.text), ano.text);

        const nitta = sanitize.sanitizeMtCueText('新田你看一下这个淫荡的乳头', '先生ほら見てください…このいやらしい乳首を…', av);
        assert.ok(/老师/.test(nitta.text) && !/新田/.test(nitta.text), nitta.text);

        const namero = sanitize.sanitizeMtCueText('给我舔', '舐めろ、先生の', av);
        assert.ok(/老师/.test(namero.text) && /舔/.test(namero.text), namero.text);

        const nani = sanitize.sanitizeMtCueText('还摸着那玩意儿，弄得湿漉漉的，嗯', 'オチンポもイジってジョブロベロベロベロつけてる…ん', av);
        assert.ok(/肉棒/.test(nani.text) && !/玩意/.test(nani.text), nani.text);

        const hard = sanitize.sanitizeMtCueText('要硬货', 'ちんちんを…', av);
        assert.ok(/肉棒/.test(hard.text) && !/硬货/.test(hard.text), hard.text);

        const sweat = sanitize.sanitizeMtCueText('这 可以流汗吗？', 'この…出してもいいですか?', av);
        assert.ok(/射/.test(sweat.text) && !/流汗/.test(sweat.text), sweat.text);

        const take = sanitize.sanitizeMtCueText('拿出来', '出してくれ', av);
        assert.strictEqual(take.text, '射出来');

        const rame = sanitize.sanitizeMtCueText('靠', 'らめぇ', av);
        assert.strictEqual(rame.text, '不行');

        const tip = sanitize.sanitizeMtCueText('你看 快从这儿射了 糟了', 'ほら、ここから先っぽ出ちゃいそうはぁ…やば', av);
        assert.ok(/前端/.test(tip.text), tip.text);

        const seme = sanitize.sanitizeMtCueText('我会好好责罚你', '先っぽいっぱい責めてあげるね…', av);
        assert.ok(/前端/.test(seme.text) && !/责罚/.test(seme.text), seme.text);

        const manko = sanitize.sanitizeMtCueText('刚才我的那个地方还被你碰了一下', 'さっき私のおまんこにビクビクしたが当たるんだけど…', av);
        assert.ok(/小穴/.test(manko.text) && !/那个地方/.test(manko.text), manko.text);

        const itteru = sanitize.sanitizeMtCueText('你 好厉害啊', 'な…すご…イッてるね…', av);
        assert.ok(/射了|去了|高潮/.test(itteru.text), itteru.text);

        const yao = sanitize.sanitizeMtCueText('要了 要了 不行 要了', 'イク…イク…ダメ…イッちゃう…', av);
        assert.ok(/要去了/.test(yao.text) && !/要了/.test(yao.text.replace(/要去了/g, '')) && !/要射了/.test(yao.text), yao.text);

        const spaced = sanitize.sanitizeMtCueText('嗯嗯啊啊 射 射 哈', 'ぅんんっあんっ…イクイクイクイク…はぁっ…', av);
        assert.ok(/要射了/.test(spaced.text), spaced.text);
    });

    it('batch-engine-0812algo2: nipple ASR / rod euphem / iku soft / rame', () => {
        const av = { contentProfile: 'av_soft' };

        const ichi = sanitize.sanitizeMtCueText('一搓两搓，嗯嗯', 'いちくびちたびに…んんっ!', av);
        assert.ok(/乳头/.test(ichi.text), ichi.text);

        const doki = sanitize.sanitizeMtCueText('心跳加速说话', 'ドキドキしゃべる…乳首いっぱい…', av);
        assert.ok(/乳头/.test(doki.text), doki.text);

        const tasty = sanitize.sanitizeMtCueText('啊恩 鸡头好吃？', 'あんっ、ちくびおいしい?', av);
        assert.ok(/乳头/.test(tasty.text) && !/鸡头/.test(tasty.text), tasty.text);

        const ochi = sanitize.sanitizeMtCueText('后仰？', 'おちくび?', av);
        assert.strictEqual(ochi.text, '乳头？');

        const nani = sanitize.sanitizeMtCueText('那个玩意儿一晚上走着走着就变态了', 'そのおちんちんが一晩歩いて変態れすね', av);
        assert.ok(/肉棒/.test(nani.text) && !/玩意/.test(nani.text), nani.text);

        const asa = sanitize.sanitizeMtCueText('哈 早上的玩意儿用乳头弄射了呢', 'はぁ…朝のちんぽ使って乳首でイっちゃったね…', av);
        assert.ok(/肉棒/.test(asa.text) && !/玩意/.test(asa.text), asa.text);

        const kudasai = sanitize.sanitizeMtCueText('把小穴给我顶一下 再顶点？', 'おまんこにおちんぽください…もっとおちんぽ?', av);
        assert.ok(/肉棒/.test(kudasai.text), kudasai.text);

        const yabai = sanitize.sanitizeMtCueText('说要出问题了', 'ちんちんやばいって…', av);
        assert.ok(/肉棒/.test(yabai.text), yabai.text);

        const kosu = sanitize.sanitizeMtCueText('摩擦着', 'ちんぽ擦って…', av);
        assert.ok(/肉棒/.test(kosu.text), kosu.text);

        const yamete = sanitize.sanitizeMtCueText('我给你吸好多乳头', '乳首いっぱい吸ってあげるからやめてくださ…', av);
        assert.ok(/不要/.test(yamete.text), yamete.text);

        const rame = sanitize.sanitizeMtCueText('真他妈的 好浓烈啊 不过啊啊', 'らめらめそれ…すごい濃いってんじゃんでもああっ', av);
        assert.ok(/不行/.test(rame.text) && /浓/.test(rame.text) && !/他妈/.test(rame.text), rame.text);

        const arame = sanitize.sanitizeMtCueText('啊嘞嘞', 'あらめぇぇ…', av);
        assert.ok(/不行/.test(arame.text), arame.text);

        const itchau = sanitize.sanitizeMtCueText('胸部 一点点 这么湿漉漉的 快湿透了呢', 'おっぱち、ちょっとずみっと…こんな濡れちゃうイッちゃってよね', av);
        assert.ok(/射了|去了/.test(itchau.text), itchau.text);

        const mou = sanitize.sanitizeMtCueText('再来一次再来一次 再 再来 啊', 'もう一回イッてもう一回っもっかい、もっかえぇ…っあんっ…', av);
        assert.ok(/高潮/.test(mou.text), mou.text);

        const name = sanitize.sanitizeMtCueText('尝尝？', '舐めてみる?', av);
        assert.ok(/舔/.test(name.text), name.text);

        const oppai = sanitize.sanitizeMtCueText('胸部也 拿出来 你看 呼 嗯 嗯嗯', 'おっぱいも、出して…ほらふぅっ、んっ、んんっ…', av);
        assert.ok(/露出来/.test(oppai.text) && !/射出来/.test(oppai.text), oppai.text);

        const manko = sanitize.sanitizeMtCueText('我为什么变成这样？', 'わたしもまんこもどうしてなった?', av);
        assert.ok(/小穴/.test(manko.text), manko.text);

        const voice = sanitize.sanitizeMtCueText('稍微大声点', 'ちょっと声出して', av);
        assert.ok(/大声/.test(voice.text) && !/射/.test(voice.text), voice.text);
    });

    it('batch-engine-0812algo3: iku/nipple/tip/sensei-face/lick', () => {
        const av = { contentProfile: 'av_soft' };

        const ikuNip = sanitize.sanitizeMtCueText('啊 要被乳头弄中了 嗯嗯', 'あもう舐め乳首でイキます…んんっあづい…', av);
        assert.ok(/要去了|乳头/.test(ikuNip.text) && !/弄中了/.test(ikuNip.text), ikuNip.text);

        const tipLove = sanitize.sanitizeMtCueText('最喜欢的部分', '大好きな先っぽ', av);
        assert.ok(/前端/.test(tipLove.text), tipLove.text);

        const chinFirst = sanitize.sanitizeMtCueText('这种 是从两边开始做的秘诀吗？', 'こんなちんぽ、両方から作るコツの初めてでしょ?', av);
        assert.ok(/肉棒/.test(chinFirst.text), chinFirst.text);

        const face = sanitize.sanitizeMtCueText('出去吧 教练的脸色啊', '出します…先生の顔にはぁ…', av);
        assert.ok(/射/.test(face.text) && /老师/.test(face.text) && !/教练/.test(face.text), face.text);

        const pain = sanitize.sanitizeMtCueText('不行不行能不啊痛痛！ 啊啊！', 'ダメダメできまあぅっ痛いぃっイクイクッ痛いっ!', av);
        assert.ok(/要射了/.test(pain.text) && /痛/.test(pain.text), pain.text);

        const lick = sanitize.sanitizeMtCueText('好 吸吮着 嗯', 'すごいしょけべ舐めてる…んー…', av);
        assert.ok(/舔/.test(lick.text), lick.text);

        const suki = sanitize.sanitizeMtCueText('拉得满满的 哈', 'すきにっぱい出してる…はぁぁっ…', av);
        assert.ok(/射/.test(suki.text), suki.text);

        const kami = sanitize.sanitizeMtCueText('啊嘞梅 啊恩 咬出来了', 'あらめっ、あんっ、噛み出して…', av);
        assert.ok(/不行/.test(kami.text) && /咬/.test(kami.text), kami.text);

        const naka = sanitize.sanitizeMtCueText('全部射进去 射到小腹那里去', 'ぜんちんせーしちょうだい…そこそこおくんくんにちょうだいで…っ!', av);
        assert.ok(/中出|里面/.test(naka.text), naka.text);

        const saliva = sanitize.sanitizeMtCueText('呵呵！ 流了好多口水', 'ふふあはは…あべろいっぱい出してる…', av);
        assert.ok(/口水/.test(saliva.text) && !/射/.test(saliva.text), saliva.text);
    });

    it('batch-engine-0813: 23-title fella/rod/manko/sensei/latin', () => {
        const av = { contentProfile: 'av_soft' };

        const fella = sanitize.sanitizeMtCueText('口炮', 'フェラちゃん…', av);
        assert.ok(/口交/.test(fella.text), fella.text);

        const senseiLick = sanitize.sanitizeMtCueText('老师', 'センセ…それ舐めて…', av);
        assert.ok(/老师/.test(senseiLick.text) && /舔/.test(senseiLick.text), senseiLick.text);

        const nipLick = sanitize.sanitizeMtCueText('乳头', '乳首、舐めて欲しい…', av);
        assert.ok(/舔乳头|乳头/.test(nipLick.text) && nipLick.text.length > 2, nipLick.text);

        const oji = sanitize.sanitizeMtCueText('大叔的', 'おじさんのちんちん…', av);
        assert.ok(/肉棒/.test(oji.text), oji.text);

        const hard = sanitize.sanitizeMtCueText('让你对吧？', 'ちんちん硬くさせてたよね?', av);
        assert.ok(/肉棒/.test(hard.text) && /硬|变硬/.test(hard.text) && !/鸡巴对吧/.test(hard.text), hard.text);

        const deka = sanitize.sanitizeMtCueText('大', 'デカチン…ってかちん…', av);
        assert.ok(/肉棒/.test(deka.text), deka.text);

        const yang = sanitize.sanitizeMtCueText('两根阳具', 'おちんぽ両様。', av);
        assert.ok(/肉棒/.test(yang.text) && !/阳具/.test(yang.text), yang.text);

        const touch = sanitize.sanitizeMtCueText('请摸下面', 'おちんちん触ってください', av);
        assert.ok(/肉棒/.test(touch.text) && !/下面/.test(touch.text), touch.text);

        const manko = sanitize.sanitizeMtCueText('阴唇都擦破了 呢', 'おまんこ擦れてます…ね', av);
        assert.ok(/小穴/.test(manko.text) && !/阴唇/.test(manko.text), manko.text);

        const uke = sanitize.sanitizeMtCueText('被你笑我也无所谓呢…', 'ウケイッちゃっても大丈夫ですからね…', av);
        assert.ok(/高潮/.test(uke.text) && !/笑/.test(uke.text), uke.text);

        const iq = sanitize.sanitizeMtCueText('不好？ 要去了吗？吗？ 吗？', 'よくない? あイッちゃいますか?', av);
        assert.ok(/要去了吗？/.test(iq.text) && !/吗？吗/.test(iq.text), iq.text);

        const sensei = sanitize.sanitizeMtCueText('有啥烦恼尽管说', '悩みがあったら何でも聞くから先生に遠慮なく言ってな', av);
        assert.ok(/老师/.test(sensei.text), sensei.text);

        const tama = sanitize.sanitizeMtCueText('tamā是？', 'タマは?', av);
        assert.ok(/蛋蛋/.test(tama.text) && !/tam/i.test(tama.text), tama.text);

        const neu = sanitize.sanitizeMtCueText('你不是 new 了个人吧？', '彼氏とかできたんじゃなかったっけ?', av);
        assert.ok(/交到/.test(neu.text) && !/new/i.test(neu.text), neu.text);

        const fellaSkill = sanitize.sanitizeMtCueText('挺在行的', '上手だねフェラ…', av);
        assert.ok(/口交/.test(fellaSkill.text), fellaSkill.text);

        const ojiHard = sanitize.sanitizeMtCueText('大叔的硬了', 'おじさまちんちん硬い…ふぅぅ…', av);
        assert.ok(/肉棒/.test(ojiHard.text) && /硬/.test(ojiHard.text), ojiHard.text);

        const ojiIn = sanitize.sanitizeMtCueText('你想把大叔的插进去吧?', 'おじさんのちんちんを中に入れたいでしょう?', av);
        assert.ok(/肉棒/.test(ojiIn.text) && /插/.test(ojiIn.text), ojiIn.text);

        const mankoDeep = sanitize.sanitizeMtCueText('一直深入到最深处', 'おまんこに上奥まで入っちゃうね', av);
        assert.ok(/小穴/.test(mankoDeep.text), mankoDeep.text);

        const likeSensei = sanitize.sanitizeMtCueText('我喜欢您', '私、先生のことが好きです', av);
        assert.ok(/老师/.test(likeSensei.text), likeSensei.text);

        const bero = sanitize.sanitizeMtCueText('呵呵哈哈 身体部位舔得很多', 'ふふあはは…あべろいっぱい出してる…', av);
        assert.ok(/口水|舌头/.test(bero.text) && !/身体部位/.test(bero.text), bero.text);

        const dashOk = sanitize.sanitizeMtCueText('这个 可以流出吗？', 'この…出してもいいですか?', av);
        assert.ok(/射/.test(dashOk.text), dashOk.text);

        const kitchen = sanitize.sanitizeMtCueText('餐饮店的厨房柱子？', '飲食でキッチンポール?', av);
        assert.ok(!/肉棒|鸡巴/.test(kitchen.text), kitchen.text);

        const takeTouch = sanitize.sanitizeMtCueText('拿下来', '取って、直接触って…', av);
        assert.ok(/摸/.test(takeTouch.text), takeTouch.text);

        const dameIku = sanitize.sanitizeMtCueText('嗯嗯！不行，伊甸你搞错了', 'んんんぅっダメイッちゃうよぉ…アリさま…', av);
        assert.ok(/要去了/.test(dameIku.text) && !/伊甸/.test(dameIku.text), dameIku.text);

        const tipRod = sanitize.sanitizeMtCueText('是不是前端在里面摩擦着？', 'おちんちんの先っぽ、中でこすれてる?', av);
        assert.ok(/肉棒/.test(tipRod.text) && /前端|摩擦/.test(tipRod.text), tipRod.text);

        const finger = sanitize.sanitizeMtCueText('试试手指', '指入れてみて…', av);
        assert.ok(/插/.test(finger.text), finger.text);

        const lickSheet = sanitize.sanitizeMtCueText('就有一张而已完全不一样', '一枚あるだけで全然違う…直接舐めてよぉ…', av);
        assert.ok(/舔/.test(lickSheet.text), lickSheet.text);

        const nipIku = sanitize.sanitizeMtCueText('又来乳头了', 'また乳首でいっちゃった', av);
        assert.ok(/乳头/.test(nipIku.text) && /去了|高潮/.test(nipIku.text), nipIku.text);

        const rameMis = sanitize.sanitizeMtCueText('啊 来啦', 'あ、らめぇ…', av);
        assert.ok(/不行|不要/.test(rameMis.text) && !/来啦/.test(rameMis.text), rameMis.text);

        const chinpoShow = sanitize.sanitizeMtCueText('看', '見して、ちんちん', av);
        assert.ok(/肉棒/.test(chinpoShow.text), chinpoShow.text);

        const wetSensei = sanitize.sanitizeMtCueText('已经湿透了 哈哈', 'もう濡れちゃった…はぁはぁ…先生…', av);
        assert.ok(/老师/.test(wetSensei.text), wetSensei.text);

        const bike = sanitize.sanitizeMtCueText('骑马式', 'バイクラ…', av);
        assert.ok(!/要射|要去|高潮/.test(bike.text), bike.text);

        const penisBlank = sanitize.sanitizeMtCueText('…', 'ペニス、ペニス…コクコク…', av);
        assert.ok(/肉棒/.test(penisBlank.text), penisBlank.text);

        const censoredRod = sanitize.sanitizeMtCueText('哈', 'はぁ…おち○ちんボクも一杯出したいです…はぁはぁ…', av);
        assert.ok(/肉棒/.test(censoredRod.text) && /射/.test(censoredRod.text), censoredRod.text);

        const toji = sanitize.sanitizeMtCueText('你是不是想看とーじさん？', 'とーじさん見たいんでしょ?', av);
        assert.ok(!/[\u3040-\u30ff]/.test(toji.text) && /想看/.test(toji.text), toji.text);

        const chan = sanitize.sanitizeMtCueText('啊啊 哈 ちゃん也 快要了', 'ああ…ははぁ…りんねちゃんも…いけそう…', av);
        assert.ok(!/ちゃん/.test(chan.text) && /快要|要/.test(chan.text), chan.text);

        const nee = sanitize.sanitizeMtCueText('好痒哩ねえ 忍不住想抚出了', 'きもひよいねいえまえ、撫出ちゃいそうだね…', av);
        assert.ok(!/ねえ|[\u3040-\u30ff]{2,}/.test(nee.text), nee.text);

        const phonetic = sanitize.sanitizeMtCueText('屁嗨哈 叩 Phonetic: pī hē há kòu pī。', 'ぴぃはいは、くぴーん…', av);
        assert.ok(!/Phonetic|pī|[A-Za-z]{3,}/i.test(phonetic.text), phonetic.text);

        const latinMix = sanitize.sanitizeMtCueText('嗯boutelburlbububibipuuhhiizz', 'んぶえぶるぶるぶぶびっぶぅひぃっ!', av);
        assert.ok(!/[A-Za-z]{3,}/.test(latinMix.text), latinMix.text);
    });

    it('batch-engine-0813: soft_go / yame_shoot polarity (らめイク / ダメイッちゃった / やめろ)', () => {
        const av = { contentProfile: 'av_soft' };

        // らめらめ + イクイク → female resist 要去了 (not male 要射了)
        const rameIku = sanitize.sanitizeMtCueText('不行不行…要射了', 'らめらめっ…イクイクイクイクイク…', av);
        assert.ok(/要去了/.test(rameIku.text) && !/要射了/.test(rameIku.text), rameIku.text);

        // ダメイッちゃった past — keep 要去了 (do not soft-upgrade to 射)
        const damePast = sanitize.sanitizeMtCueText('要去了…不行不行…', 'はぁっんんっダメイッちゃったわぁ…', av);
        assert.ok(/要去了/.test(damePast.text) && !/要射了/.test(damePast.text), damePast.text);

        const damePastBad = sanitize.sanitizeMtCueText('哈嗯 不行 我搞砸了', 'はぁっんんっダメイッちゃったわぁ…', av);
        assert.ok(/要去了/.test(damePastBad.text) && !/搞砸/.test(damePastBad.text), damePastBad.text);

        // ASR ダメディッチャ…イッちゃ — soft_go
        const dameAsr = sanitize.sanitizeMtCueText('不行了不行了', 'ダメディッチャ…イッちゃイッちゃ…ダメダメ…', av);
        assert.ok(/要去了/.test(dameAsr.text) && !/要射了/.test(dameAsr.text), dameAsr.text);

        // やめろ ≠ 别停; climax → 要去了
        const yamero = sanitize.sanitizeMtCueText('别停 要射了', 'やめろ、もっとイッちゃう…', av);
        assert.ok(/停下|不要/.test(yamero.text) && /要去了/.test(yamero.text) && !/别停/.test(yamero.text), yamero.text);

        // Male 明日出してくれ…いっく → 要射了 (oppose soft_go)
        const ashita = sanitize.sanitizeMtCueText('明天给我出来 要来了', '明日出してくれ…いっく…', av);
        assert.ok(/射给我|射/.test(ashita.text) && /要射了/.test(ashita.text) && !/要去了/.test(ashita.text), ashita.text);

        // もうイッてもいい? soft miss
        const ii = sanitize.sanitizeMtCueText('现在可以了吗?', 'もうイッてもいい?', av);
        assert.ok(/可以射了吗/.test(ii.text), ii.text);

        // Bare male イクイク still 要射了 (paired opposite of らめ)
        const ikuiku = sanitize.sanitizeMtCueText('来了来了', 'イクイク', av);
        assert.ok(/要射了/.test(ikuiku.text) && !/要去了/.test(ikuiku.text), ikuiku.text);
    });

    it('batch-engine-0813b: under soft-cover tip/rod/dashite/iku/choudai', () => {
        const av = { contentProfile: 'av_soft' };

        const tip = sanitize.sanitizeMtCueText('先头对着了', '先っちょ向けた…ふふふっ', av);
        assert.ok(/前端/.test(tip.text) && !/先头/.test(tip.text), tip.text);

        const tipSeme = sanitize.sanitizeMtCueText('先头好好地刺激一下', '先っぽいっぱい責めてあげるね…', av);
        assert.ok(/前端/.test(tipSeme.text) && !/先头/.test(tipSeme.text), tipSeme.text);

        const tipLove = sanitize.sanitizeMtCueText('最喜欢的那个先头', '大好きな先っぽ', av);
        assert.ok(/前端/.test(tipLove.text) && !/先头/.test(tipLove.text), tipLove.text);

        const rod = sanitize.sanitizeMtCueText('大大的阳物开始 大大的阳物', 'おっきいおちんちんが始まって…おっきいおちんちんを…', av);
        assert.ok(/肉棒/.test(rod.text) && !/阳物/.test(rod.text), rod.text);

        const dash = sanitize.sanitizeMtCueText('全都流出来', 'いっぱいっぱい出して…', av);
        assert.ok(/射出来/.test(dash.text) && !/流出来/.test(dash.text), dash.text);

        const dashTake = sanitize.sanitizeMtCueText('拿出来 嗯', '出してきて…んー…', av);
        assert.ok(/射出来/.test(dashTake.text), dashTake.text);

        const oshiri = sanitize.sanitizeMtCueText('拿出来', '出しておしり…', av);
        assert.ok(/屁股/.test(oshiri.text) && /射/.test(oshiri.text), oshiri.text);

        const arm = sanitize.sanitizeMtCueText('把手也拿出来', '腕も出して', av);
        assert.ok(!/射/.test(arm.text), arm.text);

        const senseiIku = sanitize.sanitizeMtCueText('嗯嗯 老师也泄了 哈呼哈呼 做着', 'あんんっ…先生もイッて…はぁはぁ…して…', av);
        assert.ok(/要去了/.test(senseiIku.text) && !/泄了/.test(senseiIku.text), senseiIku.text);

        const again = sanitize.sanitizeMtCueText('快憋不住了', 'あんまたいっちゃいそう', av);
        assert.ok(/又要去了/.test(again.text), again.text);

        const ore = sanitize.sanitizeMtCueText('那 来吧 剑丞 好啊 我快来了 嗯', 'じゃあ…ほら剣丞だしようないいんだよ俺イクよ…ん', av);
        assert.ok(/要射了/.test(ore.text), ore.text);

        const doctor = sanitize.sanitizeMtCueText('医生刚才', 'ちょっと先生から…しようって言われたの', av);
        assert.ok(/老师/.test(doctor.text) && !/医生/.test(doctor.text), doctor.text);

        const hand = sanitize.sanitizeMtCueText('还差一点 还差一点 射了', 'もちぃ…もちぃ…射精だしゅよ…手ぇちょうだい…', av);
        assert.ok(/把手给我/.test(hand.text), hand.text);

        const lick = sanitize.sanitizeMtCueText('大爷不出来的话 我就亲得满嘴都是', 'おじさんべろ出てこないから口ぐるいっぱい舐めちゃお…', av);
        assert.ok(/舔/.test(lick.text) && !/亲得满嘴/.test(lick.text), lick.text);
    });

    it('batch-engine-0813c: under_stub お願い / 反則 / wet ちゅぶっ / 出してんだ', () => {
        const av = { contentProfile: 'av_soft' };

        const onegai = sanitize.sanitizeMtCueText('听好了', 'いいですか、お願いする', av);
        assert.ok(/拜托/.test(onegai.text) && !/听好了/.test(onegai.text), onegai.text);

        const nagisa = sanitize.sanitizeMtCueText('渚', '渚です、よろしくお願いします', av);
        assert.ok(/我是渚/.test(nagisa.text) && /请多指教/.test(nagisa.text), nagisa.text);
        assert.ok(!/请多指教，请多指教/.test(nagisa.text), nagisa.text);

        const tanaka = sanitize.sanitizeMtCueText('你好', '田中です、よろしくお願いします', av);
        assert.ok(/我是田中/.test(tanaka.text) && /请多指教/.test(tanaka.text), tanaka.text);

        const chanto = sanitize.sanitizeMtCueText('那', 'じゃあ、ちゃんとお願いして', av);
        assert.ok(/求/.test(chanto.text) && chanto.text.length > 1, chanto.text);

        const hansoku = sanitize.sanitizeMtCueText('好好舔', 'いっぱい、舐めて…反則…', av);
        assert.ok(/舔/.test(hansoku.text) && /犯规/.test(hansoku.text), hansoku.text);

        const wet = sanitize.sanitizeMtCueText('吸吧吧', 'ちゅぶっぢゅぱっ', av);
        assert.ok(!/吸吧/.test(wet.text), wet.text);
        assert.ok(sanitize.isWetOralSfxOnlyJa('ちゅぶっぢゅぱっ'));

        const dashiteNda = sanitize.sanitizeMtCueText('哈哈 哈 你快点拿出来啊喂', 'はぁはぁ…はぁ…なに出してんだよめぇ…', av);
        assert.ok(/射/.test(dashiteNda.text), dashiteNda.text);
    });

    it('batch-engine-0817: rod under-cover / invent_rod strip / nipple polarity / fella', () => {
        const av = { contentProfile: 'av_soft' };

        const hard = sanitize.sanitizeMtCueText('变得好硬好硬', 'すごいおちんちんパンパンになって', av);
        assert.ok(/肉棒/.test(hard.text) && /硬/.test(hard.text), hard.text);

        const insert = sanitize.sanitizeMtCueText('把这根插进来也可以哦', 'これをちんちん入れてもいい', av);
        assert.ok(/肉棒/.test(insert.text) && !/肉棒肉棒/.test(insert.text), insert.text);

        const deka = sanitize.sanitizeMtCueText('大 硬邦邦的', 'デカチン…ってかちん…', av);
        assert.ok(/大肉棒|肉棒/.test(deka.text), deka.text);

        const bare = sanitize.sanitizeMtCueText('小穴', 'おちんちん…', av);
        assert.ok(/肉棒/.test(bare.text) && !/小穴/.test(bare.text), bare.text);

        const nipHyp = sanitize.sanitizeMtCueText('要去了', 'しに乳首舐められたらどうなっちゃうかな', av);
        assert.ok(/要去了/.test(nipHyp.text) && !/要射了|报告/.test(nipHyp.text), nipHyp.text);

        const nipReportPoison = sanitize.sanitizeMtCueText(
            '要去的时候要跟老师报告是乳头去的哦？',
            'しに乳首舐められたらどうなっちゃうかな',
            av,
        );
        assert.ok(/要去了/.test(nipReportPoison.text) && !/报告/.test(nipReportPoison.text), nipReportPoison.text);

        const inventShochu = sanitize.sanitizeMtCueText('黑黑的鸡鸡是烧酒吗？', '黒いんちって焼酎しかないの?', av);
        assert.ok(!/鸡鸡|肉棒/.test(inventShochu.text), inventShochu.text);

        const inventDitchin = sanitize.sanitizeMtCueText('迪鸡鸡最棒了', 'ディッチンコ最高…ふふっふふふっ', av);
        assert.ok(!/鸡鸡|肉棒/.test(inventDitchin.text), inventDitchin.text);

        const censored = sanitize.sanitizeMtCueText('这是什么鸡鸡…', 'なにこのち○こ…ぐすっ', av);
        assert.ok(/肉棒/.test(censored.text) && !/鸡鸡/.test(censored.text), censored.text);

        const npo = sanitize.sanitizeMtCueText('想要热热的鸡鸡插进来', '中に熱いンポ欲しい', av);
        assert.ok(/肉棒/.test(npo.text) && !/鸡鸡/.test(npo.text), npo.text);

        const fella = sanitize.sanitizeMtCueText('女朋友进到里面来了？', '上手だねフェラ…', av);
        assert.ok(/口交/.test(fella.text), fella.text);

        const skipDashite = sanitize.sanitizeMtCueText('等本人出来再复习吧', '本人出して復習したらいいか', av);
        assert.ok(!/射/.test(skipDashite.text), skipDashite.text);

        const skipIrete = sanitize.sanitizeMtCueText('做了个戴耳机的特技', 'イヤホンを入れみたいな', av);
        assert.ok(!/插进|肉棒/.test(skipIrete.text), skipIrete.text);

        const stickOut = sanitize.sanitizeMtCueText('把撅起来', 'お尻突き出してごらん', av);
        assert.ok(!/射/.test(stickOut.text), stickOut.text);

        const lickPass = sanitize.sanitizeMtCueText('摸', 'あ、舐められちゃうよ', av);
        assert.ok(/舔/.test(lickPass.text), lickPass.text);

        const taste = sanitize.sanitizeMtCueText('好好品尝这根的味吧', '味わってそうちんぽね生しんぽ味わい', av);
        assert.ok(/肉棒/.test(taste.text), taste.text);

        const nani = sanitize.sanitizeMtCueText('什么嘛', 'なにおちん…', av);
        assert.ok(/肉棒/.test(nani.text), nani.text);

        const ojisan = sanitize.sanitizeMtCueText('大叔的', 'おじさんのチンポ', av);
        assert.ok(/肉棒/.test(ojisan.text) && /大叔/.test(ojisan.text), ojisan.text);

        const wantIrete = sanitize.sanitizeMtCueText('想舔老师', '入れたくなっちゃった', av);
        assert.ok(/插/.test(wantIrete.text) && !/舔老师/.test(wantIrete.text), wantIrete.text);

        const wetLick = sanitize.sanitizeMtCueText('会更湿的', '舐めたらもっと濡れ。', av);
        assert.ok(/舔/.test(wetLick.text) && /湿/.test(wetLick.text), wetLick.text);

        const censoredClean = sanitize.sanitizeMtCueText(
            '那我就来帮小苍老师 把也清干净吧',
            'そら蒼先生が…おち○ちんもさっぱりさせてあげるね',
            av,
        );
        assert.ok(/肉棒/.test(censoredClean.text) && /老师/.test(censoredClean.text), censoredClean.text);

        const semenDash = sanitize.sanitizeMtCueText(
            '闻到好多精子的味道，感觉要高潮了',
            'もういっぱい出されて精子の匂い嗅いでたらなんかもらっ…',
            av,
        );
        assert.ok(/射/.test(semenDash.text), semenDash.text);
    });

    it('batch-engine-0817eve: 12-title rod/lick/irete/dashite + manko no invent_rod', () => {
        const av = { contentProfile: 'av_soft' };

        const mankoNoRod = sanitize.sanitizeMtCueText('哈 哈', 'スケベなおまんこに 失礼します あ', av);
        assert.ok(/小穴/.test(mankoNoRod.text) && !/肉棒/.test(mankoNoRod.text), mankoNoRod.text);

        const inventPoison = sanitize.sanitizeMtCueText('往我小穴里…嗯…插肉棒…', 'スケベなおまんこに 失礼します あ', av);
        assert.ok(!/肉棒/.test(inventPoison.text) || /おちん|ちんぽ/.test('スケベなおまんこに'), inventPoison.text);
        assert.ok(!/肉棒/.test(inventPoison.text), inventPoison.text);

        const sukebe = sanitize.sanitizeMtCueText('色色的 哈 哈', 'スケベなちんぽ はぁっはぁっ', av);
        assert.ok(/肉棒/.test(sukebe.text), sukebe.text);

        const moanRod = sanitize.sanitizeMtCueText('嗯嗯', 'おちんちん', av);
        assert.ok(/肉棒/.test(moanRod.text), moanRod.text);

        const dashMoan = sanitize.sanitizeMtCueText('嗯嗯', 'んむんむ 出して', av);
        assert.ok(/射/.test(dashMoan.text), dashMoan.text);

        const celeb = sanitize.sanitizeMtCueText('虽然我总是这样表现出名媛的感觉', 'こうやってセレブ感出してるけど', av);
        assert.ok(!/射/.test(celeb.text), celeb.text);

        const lickOppai = sanitize.sanitizeMtCueText('就算不是阿信的', '別にノブユじゃなくても ナオのおっぱいなら舐めちゃいそう', av);
        assert.ok(/舔/.test(lickOppai.text), lickOppai.text);

        const rameShame = sanitize.sanitizeMtCueText('老师…太羞耻了', '恥ずかしいからやめて え今使ってるでしょ先生', av);
        assert.ok(/不要|别/.test(rameShame.text) && /老师/.test(rameShame.text), rameShame.text);

        const senseiNaka = sanitize.sanitizeMtCueText('老师别再摸了 等等啊 老师 嗯嗯', '先生中入れないと触んないから待って待って先生んっ んんっ', av);
        assert.ok(/插|入/.test(senseiNaka.text) && /老师/.test(senseiNaka.text), senseiNaka.text);
    });

    it('batch-engine-0818am: rod behind/clean/urge + iku want + irete skip + no yame_shoot pin', () => {
        const av = { contentProfile: 'av_soft' };

        const behind = sanitize.sanitizeMtCueText(
            '来吧…插进去…',
            'ほら今度は陽鞠くんが後ろからおちんちん入れてごらん?',
            av,
        );
        assert.ok(/肉棒/.test(behind.text) && /后面/.test(behind.text), behind.text);

        const clean = sanitize.sanitizeMtCueText('变干净了', 'おちんちん綺麗になって', av);
        assert.ok(/肉棒/.test(clean.text), clean.text);

        const urge = sanitize.sanitizeMtCueText(
            '面对那根还想要更多更多的我',
            'もっともっとってならないおちんちんにさせないとね',
            av,
        );
        assert.ok(/肉棒/.test(urge.text), urge.text);

        const badKid = sanitize.sanitizeMtCueText(
            '真是个坏坏的呢',
            '悪い悪いのおちんちんですね',
            av,
        );
        assert.ok(/肉棒/.test(badKid.text), badKid.text);

        const wantIku = sanitize.sanitizeMtCueText(
            '肉棒小穴好想要大大的',
            'おっきいおちんちんが欲しい ああっイクッイッちゃう',
            av,
        );
        assert.ok(/要射了/.test(wantIku.text) && !/停下/.test(wantIku.text), wantIku.text);

        // 挿入必要なかった — not an irete under_stub; do not invent 插
        const noNeed = sanitize.sanitizeMtCueText(
            '那我舔了',
            '挿入必要なかったらろうぞ ごめんなさい ちょっと',
            av,
        );
        assert.ok(!/插进去|插入/.test(noNeed.text), noNeed.text);

        // Opposing: real やめろ+イッちゃう still soft_go (停下|不要 + 要去了)
        const yamero = sanitize.sanitizeMtCueText('别停 要射了', 'やめろ、もっとイッちゃう…', av);
        assert.ok(/停下|不要/.test(yamero.text) && /要去了/.test(yamero.text), yamero.text);

        // ADN-798 invent strip still holds
        const invent = sanitize.sanitizeMtCueText(
            '往我小穴里…嗯…插肉棒…',
            'スケベなおまんこに 失礼します あ',
            av,
        );
        assert.ok(!/肉棒/.test(invent.text), invent.text);
    });

    it('batch-engine-0818pm: shiko/forgive/naka + iku skip 开关/中行き', () => {
        const av = { contentProfile: 'av_soft' };

        const shiko = sanitize.sanitizeMtCueText(
            '大家都被激起了欲望',
            'みんなちんちんが起きさせてシコシコしてる',
            av,
        );
        assert.ok(/肉棒/.test(shiko.text) && /撸/.test(shiko.text), shiko.text);

        const sfx = sanitize.sanitizeMtCueText('咻 嗯嗯嗯~~', 'おちんちんぱひっ…んっんんーっ!', av);
        assert.ok(/肉棒/.test(sfx.text), sfx.text);

        const naka = sanitize.sanitizeMtCueText(
            '要不就在我身上滚来滚去…插进去…',
            '私に転がるかマラソンこの中におちんちん入れてよ',
            av,
        );
        assert.ok(/肉棒/.test(naka.text) && /插/.test(naka.text), naka.text);

        const lickQ = sanitize.sanitizeMtCueText('可以舔吗？', 'いちんちん舐めていい?', av);
        assert.ok(/肉棒/.test(lickQ.text) && /舔/.test(lickQ.text), lickQ.text);

        // スイッチ / 中行き must not force climax cover
        const sw = sanitize.sanitizeMtCueText('好像打开了什么开关一样', '良いスイッチ入ったんだ', av);
        assert.ok(!/要射了|要去了/.test(sw.text) || /开关/.test(sw.text), sw.text);

        const nakaIku = sanitize.sanitizeMtCueText(
            '果然一开始 和射在里面的感觉还是不一样啊',
            'やっぱはじめ…イクか中行きはまた違う感じだった',
            av,
        );
        assert.ok(!/要射了|要去了/.test(nakaIku.text) || /里面/.test(nakaIku.text), nakaIku.text);
    });

    it('batch-engine-0818dashite: 出して下さい touch-misread + もっと出して moan', () => {
        const av = { contentProfile: 'av_soft' };

        const kureTouch = sanitize.sanitizeMtCueText('请摸我吧', '出して下さい', av);
        assert.ok(/射/.test(kureTouch.text) && !/摸/.test(kureTouch.text), kureTouch.text);

        const kureTake = sanitize.sanitizeMtCueText('拿出来', '出して下さい', av);
        assert.ok(/射/.test(kureTake.text), kureTake.text);

        const moreMoan = sanitize.sanitizeMtCueText('嗯 嗯', 'ん ん んぅ もっと 出して', av);
        assert.ok(/射/.test(moreMoan.text), moreMoan.text);

        // Opposing: real 触って keeps 摸
        const touch = sanitize.sanitizeMtCueText('请摸我吧', '触って下さい', av);
        assert.ok(/摸/.test(touch.text) && !/射/.test(touch.text), touch.text);

        // Prior moan stub still covers
        const moan = sanitize.sanitizeMtCueText('嗯嗯', 'んむんむ 出して', av);
        assert.ok(/射/.test(moan.text), moan.text);
    });

    it('batch-engine-0818eve: rod yummy/thicker/azuke + touch/lick/sensei nama', () => {
        const av = { contentProfile: 'av_soft' };

        const yummy = sanitize.sanitizeMtCueText('好好吃', 'おちんちん美味しい', av);
        assert.ok(/肉棒/.test(yummy.text), yummy.text);

        const thick = sanitize.sanitizeMtCueText(
            '比你的还要粗呢 啊',
            'あなたのちんちんより太いよんんっ あっ',
            av,
        );
        assert.ok(/肉棒/.test(thick.text), thick.text);

        const hold = sanitize.sanitizeMtCueText('暂时保留', 'おちんちんはまだお預け', av);
        assert.ok(/肉棒/.test(hold.text), hold.text);

        const nakaBare = sanitize.sanitizeMtCueText(
            '要不就在我身上滚来滚去',
            '私に転がるかマラソンこの中におちんちん入れてよ',
            av,
        );
        assert.ok(/肉棒/.test(nakaBare.text) && /插/.test(nakaBare.text), nakaBare.text);

        const mouth = sanitize.sanitizeMtCueText(
            '射出来吧 射到我嘴里吧 啊哈 哈',
            '言い様だして お口にちょうだい あっはっはぁっ',
            av,
        );
        assert.ok(/嘴|给/.test(mouth.text), mouth.text);

        const touchMore = sanitize.sanitizeMtCueText(
            '感觉刚才有点半途而废啊',
            'なんか中途半端で終わっちゃった もっとちゃんと触って',
            av,
        );
        assert.ok(/摸/.test(touchMore.text), touchMore.text);

        const nama = sanitize.sanitizeMtCueText(
            '不行啦 我们这样子待在沙滩上 要是被谁看到了就糟了啊',
            'ダメだよ、先生と生とこうやってでこんだよ誰かに見られたらまずいよ。',
            av,
        );
        assert.ok(/老师/.test(nama.text) && /无套/.test(nama.text) && !/沙滩/.test(nama.text), nama.text);

        const lickTease = sanitize.sanitizeMtCueText(
            '要是再被你这样捉弄下去 我可受不了啊？',
            'いろいろとこ舐められるといじょうだろ?',
            av,
        );
        assert.ok(/舔/.test(lickTease.text), lickTease.text);

        const yameIki = sanitize.sanitizeMtCueText('不要，要射了', 'やめ イッちゃいそう', av);
        assert.ok(/要去了/.test(yameIki.text) && !/要射了/.test(yameIki.text), yameIki.text);

        // Opposing
        const hand = sanitize.sanitizeMtCueText('把手给我', '手ぇちょうだい', av);
        assert.ok(/给/.test(hand.text) && !/射/.test(hand.text), hand.text);

        const invent = sanitize.sanitizeMtCueText(
            '往我小穴里…嗯…插肉棒…',
            'スケベなおまんこに 失礼します あ',
            av,
        );
        assert.ok(!/肉棒/.test(invent.text), invent.text);
    });

    it('batch-engine-0818night: touch felt-good / 欲しい / お願い見て / 舐め教えて / 逃げちょうだい', () => {
        const av = { contentProfile: 'av_soft' };

        const felt = sanitize.sanitizeMtCueText(
            'G嘟嘟嘟',
            'いま触ってたら気持ちよかったでしょう?',
            av,
        );
        assert.ok(/摸/.test(felt.text) && /舒服/.test(felt.text) && !/G嘟|嘟嘟/.test(felt.text), felt.text);

        const want = sanitize.sanitizeMtCueText('摸我', '触って欲しいです', av);
        assert.ok(/想让你摸/.test(want.text), want.text);

        const look = sanitize.sanitizeMtCueText('哈 哈', 'すんませんからさはいちょっとお願い見てくれっ', av);
        assert.ok(/看/.test(look.text) && /求|拜托/.test(look.text), look.text);

        const teach = sanitize.sanitizeMtCueText('想让你舔', '舐めて教えて んっ', av);
        assert.ok(/舔/.test(teach.text) && /教/.test(teach.text), teach.text);

        const flee = sanitize.sanitizeMtCueText('快点 让我逃走吧 什么', '逃げられ ちょうだい なに?', av);
        assert.ok(/逃/.test(flee.text) && !/给我/.test(flee.text), flee.text);

        const hand = sanitize.sanitizeMtCueText('把手给我', '手ぇちょうだい', av);
        assert.ok(/给/.test(hand.text), hand.text);
    });

    it('batch-engine-0818fns244: makeup skip iku + rod/lick/rame under + お願い≠摸', () => {
        const av = { contentProfile: 'av_soft' };

        const makeup = sanitize.sanitizeMtCueText(
            '要是再努力化妆一下',
            'メイクとか頑張ったらもっと可愛くなると思うんだけどな',
            av,
        );
        assert.ok(!/要射了|要去了/.test(makeup.text), makeup.text);

        const manOf = sanitize.sanitizeMtCueText('那就是男人的', 'それが男の人の ちんちんで', av);
        assert.ok(/肉棒/.test(manOf.text), manOf.text);

        const say = sanitize.sanitizeMtCueText(
            '才能知道合不合得来啊 什么？',
            'ちんちん言ってみないとわかんないからさな なに?',
            av,
        );
        assert.ok(/肉棒/.test(say.text), say.text);

        const tooBig = sanitize.sanitizeMtCueText(
            '学长的太大了 有点容纳不下呢',
            'センパイのおちんちん大きくてちょっと収まらないです',
            av,
        );
        assert.ok(/肉棒/.test(tooBig.text), tooBig.text);

        const lickWorth = sanitize.sanitizeMtCueText('肉棒…', '先輩のちんぽ 舐め甲斐があります と', av);
        assert.ok(/舔/.test(lickWorth.text) && /肉棒/.test(lickWorth.text), lickWorth.text);

        const rame = sanitize.sanitizeMtCueText(
            '小穴哈 哈',
            'ああぁらめぇおまんこ引くいくいく んんんっ',
            av,
        );
        assert.ok(/不行|不要/.test(rame.text) && /小穴/.test(rame.text) && /要去了/.test(rame.text), rame.text);

        const hold = sanitize.sanitizeMtCueText(
            '肉棒…',
            'そのまま顔を起こしたら おちんちんも咥えれるでしょ?',
            av,
        );
        assert.ok(/肉棒/.test(hold.text) && /含/.test(hold.text), hold.text);

        const cleanQ = sanitize.sanitizeMtCueText(
            '肉棒…',
            '先輩のおちんちん綺麗にしてもいいですか? はぁ',
            av,
        );
        assert.ok(/肉棒/.test(cleanQ.text) && /清理|干净/.test(cleanQ.text), cleanQ.text);

        const onegai = sanitize.sanitizeMtCueText('请摸我', 'はぁ先輩もっと お願いします', av);
        assert.ok(/学长/.test(onegai.text) && /拜托/.test(onegai.text) && !/摸/.test(onegai.text), onegai.text);

        const lickSenpai = sanitize.sanitizeMtCueText('舔…', '先輩のも舐めたいです', av);
        assert.ok(/舔/.test(lickSenpai.text) && /学长/.test(lickSenpai.text) && !/^舔[…。]*$/.test(lickSenpai.text.trim()), lickSenpai.text);

        const order = sanitize.sanitizeMtCueText(
            '学长的好舒服',
            'センパイのおち○ちん気持ちいい んはぁっ',
            av,
        );
        assert.ok(/学长的肉棒/.test(order.text) && !/肉棒学长/.test(order.text), order.text);

        const touch = sanitize.sanitizeMtCueText('请摸我吧', '触って下さい', av);
        assert.ok(/摸/.test(touch.text) && !/射/.test(touch.text), touch.text);
    });

    it('batch-engine-0818snos323: 口に出して / おちんの乳首≠肉棒 / 舐めしてほしい', () => {
        const av = { contentProfile: 'av_soft' };

        const mouth = sanitize.sanitizeMtCueText('能说出来', '口に出して', av);
        assert.ok(/射/.test(mouth.text) && /嘴/.test(mouth.text) && !/说/.test(mouth.text), mouth.text);

        const nip = sanitize.sanitizeMtCueText('好舒服？', 'おちんの乳首 気持ちいい?', av);
        assert.ok(/乳头/.test(nip.text) && !/肉棒/.test(nip.text), nip.text);

        const nipBad = sanitize.sanitizeMtCueText('肉棒的乳头 好舒服？', 'おちんの乳首 気持ちいい?', av);
        assert.ok(/乳头/.test(nipBad.text) && !/肉棒/.test(nipBad.text) && !/^的/.test(nipBad.text), nipBad.text);

        const lickWant = sanitize.sanitizeMtCueText(
            '难道说',
            'もしかして 会社で なみ目舐めしてほしいな',
            av,
        );
        assert.ok(/舔/.test(lickWant.text), lickWant.text);

        const move = sanitize.sanitizeMtCueText(
            '好厉害',
            'すごい気持ちいい ねえねえ今度は動いて欲しいな',
            av,
        );
        assert.ok(/舒服/.test(move.text) && /动/.test(move.text), move.text);

        // Engine often stubs as spaced「哈 哈」— must not collapse to bare 好厉害 via すごい recover
        const moveHa = sanitize.sanitizeMtCueText(
            '哈 哈',
            'すごい気持ちいい ねえねえ今度は動いて欲しいな',
            av,
        );
        assert.ok(/舒服/.test(moveHa.text) && /动/.test(moveHa.text) && !/^好厉害$/.test(moveHa.text.trim()), moveHa.text);

        const moveHaEll = sanitize.sanitizeMtCueText(
            '哈…哈…',
            'すごい気持ちいい ねえねえ今度は動いて欲しいな',
            av,
        );
        assert.ok(/舒服/.test(moveHaEll.text) && /动/.test(moveHaEll.text), moveHaEll.text);

        // Opposing: bare すごい blank still recovers to 好厉害
        const sugoiBlank = sanitize.sanitizeMtCueText('…', 'すごい', av);
        assert.strictEqual(sugoiBlank.text.trim(), '好厉害');

        // Opposing: real rod + nipple keeps 肉棒
        const both = sanitize.sanitizeMtCueText('好舒服', 'おちんちんも乳首も気持ちいい', av);
        assert.ok(/肉棒/.test(both.text) || /乳头/.test(both.text), both.text);

        const invent = sanitize.sanitizeMtCueText(
            '往我小穴里…嗯…插肉棒…',
            'スケベなおまんこに 失礼します あ',
            av,
        );
        assert.ok(!/肉棒/.test(invent.text), invent.text);
    });

    it('batch-engine-0818same-atid: chinpo≠pussy / irete-tai / ejac-let / anal-iku / gloss-space', () => {
        const av = { contentProfile: 'av_soft' };

        const cmp = sanitize.sanitizeMtCueText(
            '小穴和其他的相比 怎么样呢？',
            '他のチンポ 旦那さんと比べてどうですか?',
            av,
        );
        assert.ok(/肉棒/.test(cmp.text) && !/小穴/.test(cmp.text), cmp.text);

        // Opposing: real manko keeps 小穴
        const mankoCmp = sanitize.sanitizeMtCueText(
            '小穴和其他的相比 怎么样呢？',
            '他のまんこ 旦那さんと比べてどうですか?',
            av,
        );
        assert.ok(/小穴/.test(mankoCmp.text) && !/肉棒/.test(mankoCmp.text), mankoCmp.text);

        const wantIn = sanitize.sanitizeMtCueText('想要吗？', 'あ あ 入れたいよ', av);
        assert.ok(/插/.test(wantIn.text), wantIn.text);

        const ouch = sanitize.sanitizeMtCueText('嗯 哈 哈 好痛啊', 'んぶっ はぁっはぁっ 痛たっあっおちんちんく', av);
        assert.ok(/肉棒/.test(ouch.text) && /痛/.test(ouch.text), ouch.text);

        const ejac = sanitize.sanitizeMtCueText(
            '让我在这个',
            '私のこの名奥さんのケツの穴の中に射精させてだめ',
            av,
        );
        assert.ok(/射/.test(ejac.text), ejac.text);

        const lickWhile = sanitize.sanitizeMtCueText('哈 真是的 一边舔着', 'はぁ もぉ おち○ちん舐めながら', av);
        assert.ok(/舔/.test(lickWhile.text) && /肉棒/.test(lickWhile.text), lickWhile.text);

        const anal = sanitize.sanitizeMtCueText('后庭 要用后庭去掉了', 'アナル アナルでイッちゃ', av);
        assert.ok(/后庭/.test(anal.text) && /要去了/.test(anal.text) && !/去掉/.test(anal.text), anal.text);
        assert.ok(!/要用后庭要去了/.test(anal.text), anal.text);

        const yes = sanitize.sanitizeMtCueText(
            'Yes 我还想要啊嗯 啊嗯 啊',
            'いえすっもっと欲しいですあんっ あんっ あんっ あっ',
            av,
        );
        assert.ok(!/\bYes\b/i.test(yes.text) && /想要/.test(yes.text), yes.text);

        const behind = sanitize.sanitizeMtCueText(
            '哈 哈…插进去…',
            'じゃあさはい 後ろから入れて欲しいの',
            av,
        );
        assert.ok(/后面|从后/.test(behind.text) && /插/.test(behind.text), behind.text);

        const hard = sanitize.sanitizeMtCueText(
            '呐 哥哥的也变得这么肉棒硬了',
            'ねにーちゃんのおちんちんもこんな硬くなってみたいで',
            av,
        );
        assert.ok(/肉棒也变得这么硬|肉棒变得这么硬/.test(hard.text) && !/肉棒硬/.test(hard.text), hard.text);

        const ring = sanitize.sanitizeMtCueText('小穴戒指', '指輪 お尻 まんこも', av);
        assert.ok(/戒指/.test(ring.text) && /屁股/.test(ring.text) && /小穴/.test(ring.text), ring.text);
        assert.ok(!/小穴戒指/.test(ring.text.replace(/\s/g, '')), ring.text);

        const wontLick = sanitize.sanitizeMtCueText('舔…', 'そうしても舐めてくれないんだろう', av);
        assert.ok(/舔/.test(wontLick.text) && /不会/.test(wontLick.text), wontLick.text);

        const dameIku = sanitize.sanitizeMtCueText(
            '要射了',
            'イッちゃいなさいダメダメ舌が突き上げてなりごめんなさい',
            av,
        );
        assert.ok(/要去了/.test(dameIku.text) && !/要射了/.test(dameIku.text), dameIku.text);

        const glossSp = sanitize.sanitizeMtCueText('GLOS S2630了', 'かゆからないのに', av);
        assert.ok(!/GLOS/i.test(glossSp.text), glossSp.text);

        // Opposing: bare 入れたい is insert; 手に入れたい stays acquire
        const teNi = sanitize.sanitizeMtCueText('想要吗？', '手に入れたいよ', av);
        assert.ok(!/插/.test(teNi.text), teNi.text);
    });

    it('batch-engine-0818ha: moan-stub 哈 哈 recovers lexical JA', () => {
        const av = { contentProfile: 'av_soft' };

        const onegaiMoan = sanitize.sanitizeMtCueText('哈 哈', 'ああぁぁ はぁはぁ お願いします', av);
        assert.ok(/拜托/.test(onegaiMoan.text) && !/哈/.test(onegaiMoan.text), onegaiMoan.text);

        const onegaiHa = sanitize.sanitizeMtCueText('哈 哈', 'はぁ お願いします', av);
        assert.ok(/拜托/.test(onegaiHa.text) && !/哈/.test(onegaiHa.text), onegaiHa.text);

        const onegaiBare = sanitize.sanitizeMtCueText('哈 哈', 'お願い', av);
        assert.ok(/拜托/.test(onegaiBare.text) && !/哈/.test(onegaiBare.text), onegaiBare.text);

        const stopPls = sanitize.sanitizeMtCueText(
            '哈 哈',
            'はぁはぁ しぇ本当にお願い もうやめてくれ',
            av,
        );
        assert.ok(/拜托/.test(stopPls.text) && /不要/.test(stopPls.text) && !/哈/.test(stopPls.text), stopPls.text);

        const suckManko = sanitize.sanitizeMtCueText(
            '哈 哈',
            'まんこちってしゃぶってんだから はぁはぁおりゃ',
            av,
        );
        assert.ok(/小穴/.test(suckManko.text) && /含/.test(suckManko.text) && !/哈/.test(suckManko.text), suckManko.text);

        const warmHand = sanitize.sanitizeMtCueText('哈 哈', '初めての手 あったかいね', av);
        assert.ok(/手/.test(warmHand.text) && /温暖/.test(warmHand.text) && !/哈/.test(warmHand.text), warmHand.text);

        const tongueNaka = sanitize.sanitizeMtCueText('哈 哈', 'こんな綺麗な舌に中出しできるなんて', av);
        assert.ok(/中出|射/.test(tongueNaka.text) && /舌/.test(tongueNaka.text) && !/哈/.test(tongueNaka.text), tongueNaka.text);

        const laughPls = sanitize.sanitizeMtCueText('哈 哈', 'あははお願いします', av);
        assert.ok(/拜托/.test(laughPls.text) && !/^哈哈$/.test(laughPls.text.trim()), laughPls.text);

        // Opposing: pure panting stays a breath gloss, not 拜托
        const pant = sanitize.sanitizeMtCueText('哈 哈', 'はぁはぁ', av);
        assert.ok(/哈/.test(pant.text) && !/拜托/.test(pant.text), pant.text);

        const pant2 = sanitize.sanitizeMtCueText('哈 哈', 'はあっはあっ', av);
        assert.ok(/哈/.test(pant2.text) && !/拜托/.test(pant2.text), pant2.text);

        // Opposing: good ZH is not overwritten
        const keep = sanitize.sanitizeMtCueText('哈哈，拜托了', 'ああぁぁ はぁはぁ お願いします', av);
        assert.ok(/拜托/.test(keep.text), keep.text);

        const yoro = sanitize.sanitizeMtCueText('哈 哈', 'よろしくお願いします。', av);
        assert.ok(/请多指教/.test(yoro.text) && !/哈/.test(yoro.text), yoro.text);

        const feel = sanitize.sanitizeMtCueText('哈 哈', 'あはは気持ちいい', av);
        assert.ok(/舒服/.test(feel.text), feel.text);

        const tongueWarm = sanitize.sanitizeMtCueText('哈 哈', 'あったかいべろ', av);
        assert.ok(/舌头/.test(tongueWarm.text) && /温暖/.test(tongueWarm.text), tongueWarm.text);

        const glueManko = sanitize.sanitizeMtCueText(
            '小穴哈 哈',
            'まんこちってしゃぶってんだから はぁはぁおりゃ',
            av,
        );
        assert.ok(/小穴/.test(glueManko.text) && /含/.test(glueManko.text) && !/哈/.test(glueManko.text), glueManko.text);

        const glueSensei = sanitize.sanitizeMtCueText('老师哈 哈', '先生お願いします', av);
        assert.ok(/老师/.test(glueSensei.text) && /拜托/.test(glueSensei.text) && !/哈/.test(glueSensei.text), glueSensei.text);

        const rameNn = sanitize.sanitizeMtCueText('嗯嗯', 'んんんっ ひっひっ らめっらめらめっ', av);
        assert.ok(/不行/.test(rameNn.text) && !/嗯嗯/.test(rameNn.text), rameNn.text);

        const talkHehe = sanitize.sanitizeMtCueText('呵呵！', 'ふふふ 前に話しながら出してたじゃん', av);
        assert.ok(/说话/.test(talkHehe.text) && /射/.test(talkHehe.text) && !/呵呵/.test(talkHehe.text), talkHehe.text);

        const talkHa = sanitize.sanitizeMtCueText('哈 哈', 'ふふふ 前に話しながら出してたじゃん', av);
        assert.ok(/说话/.test(talkHa.text) && /射/.test(talkHa.text), talkHa.text);

        // Opposing: pure laugh stays 呵呵
        const hehe = sanitize.sanitizeMtCueText('呵呵', 'ふふふ', av);
        assert.ok(/呵呵|哈/.test(hehe.text) && !/射/.test(hehe.text), hehe.text);

        const invent = sanitize.sanitizeMtCueText(
            '往我小穴里…嗯…插肉棒…',
            'スケベなおまんこに 失礼します あ',
            av,
        );
        assert.ok(!/肉棒/.test(invent.text), invent.text);
    });

    it('batch-engine-0818atid-rerun: rod kore/shite/ketsu + ass-dame + past iku + yame', () => {
        const av = { contentProfile: 'av_soft' };

        const kore = sanitize.sanitizeMtCueText('那个继续', 'あ んんっ ちんちんこれ んんっ ああ', av);
        assert.ok(/肉棒/.test(kore.text), kore.text);

        const shite = sanitize.sanitizeMtCueText('咳咳 诶嘿嘿哈 哈', 'ごほっ えへへはぁはぁ おちんちんして', av);
        assert.ok(/肉棒/.test(shite.text), shite.text);

        const split = sanitize.sanitizeMtCueText('虽然', '旦那以外の男のちんちんがケツ裂いちゃうけど', av);
        assert.ok(/肉棒/.test(split.text) && /屁股/.test(split.text), split.text);

        const lick = sanitize.sanitizeMtCueText(
            '请让他看看吧',
            '見せてあげてください旦那さんに他の男に舐められる男',
            av,
        );
        assert.ok(/舔/.test(lick.text) && /老公|丈夫/.test(lick.text), lick.text);

        const feelGo = sanitize.sanitizeMtCueText(
            '好舒服',
            '気持ちいい あ あたし出ていっちゃう いっひゃいなさい',
            av,
        );
        assert.ok(/舒服/.test(feelGo.text) && /要去了/.test(feelGo.text), feelGo.text);

        const itta = sanitize.sanitizeMtCueText('要射了', 'ああぁぁっ イッたよぉ ああぁぁっ', av);
        assert.ok(/去了|射了/.test(itta.text) && !/要射了/.test(itta.text), itta.text);

        const nari = sanitize.sanitizeMtCueText(
            '要射了',
            'お尻 お尻なんかでそんなイクことなりたくない なんだ?',
            av,
        );
        assert.ok(/不想|才不/.test(nari.text) && /屁股/.test(nari.text) && !/要射了/.test(nari.text), nari.text);

        const like = sanitize.sanitizeMtCueText(
            '要射了',
            '柔らかいからヌルヌルだから イッてるみたいだよ',
            av,
        );
        assert.ok(/好像/.test(like.text) && /去了/.test(like.text), like.text);

        const assDame = sanitize.sanitizeMtCueText(
            '还不能插进去吗？',
            'あっ ダメダメ ダメ お尻入れちゃダメ ワイのそこきゅ はぁ',
            av,
        );
        assert.ok(/屁股/.test(assDame.text) && /不能插/.test(assDame.text) && !/还不能/.test(assDame.text), assDame.text);

        // Opposing: まだ入れちゃダメ keeps 还不能插进去吗
        const mada = sanitize.sanitizeMtCueText('好舒服', 'まだ入れちゃダメ', av);
        assert.ok(/还不能插|插进去吗/.test(mada.text), mada.text);

        const yame = sanitize.sanitizeMtCueText(
            '等等我高潮了 不要要射了',
            'ちょっとあっイッちゃいました やめあっ',
            av,
        );
        assert.ok(/去了/.test(yame.text) && /停|不要/.test(yame.text) && !/要射了/.test(yame.text), yame.text);

        const rameIku = sanitize.sanitizeMtCueText('不要不要', 'らめらめ あっイっちゃって あっ', av);
        assert.ok(/要去了/.test(rameIku.text), rameIku.text);

        const uwaki = sanitize.sanitizeMtCueText(
            '小穴这边和这边 这边',
            'どっちにどっちに どっちに まんこ まんこ はぁ浮気しちゃったね はぁ',
            av,
        );
        assert.ok(/小穴/.test(uwaki.text) && /出轨/.test(uwaki.text), uwaki.text);

        const mankoGo = sanitize.sanitizeMtCueText(
            '要去了',
            '気持ちいいっ気持ちいいのよっああっケツおまんこイっちゃう ああっイッちゃう これ',
            av,
        );
        assert.ok(/小穴/.test(mankoGo.text) && /要去了/.test(mankoGo.text), mankoGo.text);
    });

    it('batch-engine-0818mida: 触ってたら yes-stub + 気持ちいいイキそう', () => {
        const av = { contentProfile: 'av_soft' };

        const tara = sanitize.sanitizeMtCueText('是啊', 'はい 触ってたら', av);
        assert.ok(/摸/.test(tara.text) && /是啊|对/.test(tara.text), tara.text);

        // Opposing: はい alone stays 是啊; 触ってない must not invent 摸着的话
        const hai = sanitize.sanitizeMtCueText('是啊', 'はい', av);
        assert.ok(/是啊/.test(hai.text) && !/摸/.test(hai.text), hai.text);
        const notTouch = sanitize.sanitizeMtCueText('没摸呢', 'ちんちん触ってないよ', av);
        assert.ok(/没摸|没/.test(notTouch.text) && !/摸着的话/.test(notTouch.text), notTouch.text);

        const ikisou = sanitize.sanitizeMtCueText(
            '啊啊 好舒服',
            'ああ 気持ちいい んんっあー いきそうんん イキそう',
            av,
        );
        assert.ok(/舒服/.test(ikisou.text) && /要射了|要去了/.test(ikisou.text), ikisou.text);

        const ikisouBare = sanitize.sanitizeMtCueText(
            '要射了',
            'ああ 気持ちいい んんっあー いきそうんん イキそう',
            av,
        );
        assert.ok(/舒服/.test(ikisouBare.text) && /要射了|要去了/.test(ikisouBare.text), ikisouBare.text);

        // Opposing: イキそう without 気持ちいい keeps climax-only
        const soonOnly = sanitize.sanitizeMtCueText('要射了', 'イキそう…ああイク…', av);
        assert.ok(/要射了|要去了|高潮/.test(soonOnly.text) && !/舒服/.test(soonOnly.text), soonOnly.text);
    });
});

