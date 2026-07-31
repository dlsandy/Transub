const assert = require('assert');
const sanitize = require('../src/js/mt-sanitize-core');

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
    });

    it('collapses honorific echoes and kinship 母小姐', () => {
        const a = sanitize.collapseHonorificEchoes('真琴小姐…小姐早泄倾向');
        assert.strictEqual(a.text, '真琴小姐早泄倾向');
        const b = sanitize.collapseHonorificEchoes('内村小姐…小姐…小姐');
        assert.strictEqual(b.text, '内村小姐');
        const c = sanitize.fixKinshipHonorificMistranslations('母小姐', 'お母さん。');
        assert.strictEqual(c.text, '妈妈');
        const d = sanitize.sanitizeMtCueText('さつし先生…先生感觉舒服吗？', 'さつしくんは気持ちいいですか?');
        assert.ok(!d.text.includes('先生…先生'));
        assert.ok(d.text.includes('先生'));
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
            '那根肉棒就是这么厉害。 汤米',
            'そんなのトミーーくんのおちんちんそれ。',
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
            'いく->去了 #高潮用语，',
            'ハメ->插进去',
            'メンエス->男士按摩店',
            'ほぐす->放松推拿 #勿译放松',
            '将下面术语表翻译成中文',
            '，翻译的行数是1行，请不要超过',
        ]) {
            assert.ok(sanitize.looksLikePromptLeak(line) || sanitize.looksLikeGlossaryDump(line), line);
            assert.ok(
                ['', '…'].includes(sanitize.sanitizeMtCueText(line, 'メンエスは風俗ではありません。').text),
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

        const paraphrased3 = '根据以下的英文句子，写出第四个单词是「阴茎」，但不能是同音异义词。第四个单词只有一种可能';
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
        const a = sanitize.correctJaAsrDomainMishears('免税しては風俗ではありません。');
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

    it('fixes ZH domain mistranslations conditioned on JA source', () => {
        const oil = sanitize.correctZhDomainMistranslations(
            '这是防晒油吗？',
            'これオイルなの?',
        );
        assert.ok(oil.changed);
        assert.strictEqual(oil.text, '这是按摩油吗？');

        const muka = sanitize.correctZhDomainMistranslations(
            '来，也来做一下小穴吧',
            'さあおむけもやっていきましょうか。',
        );
        assert.ok(muka.changed);
        assert.ok(muka.text.includes('仰躺'));
        assert.ok(!muka.text.includes('小穴'));

        const hogu = sanitize.correctZhDomainMistranslations(
            '最近也一直保持着高潮，大家的精力都变得旺盛起来了',
            'このところも丹念にはぐしていくので皆さん元気になってしまうんですけど',
        );
        assert.ok(hogu.changed);
        assert.ok(!hogu.text.includes('高潮'));

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
            '我不会放过你的，',
            '性的なサービスはできませんので、',
        );
        assert.ok(refuse.changed);
        assert.ok(refuse.text.includes('不能提供性服务'));

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
            'メインエスはマビサビ。トイレ追加します。紙パンツ。前向けになって。肩膀を。下半戦も。ほっぱい。はぶれていきます。祖父とは違います。関東いたします。丹念にはぐしていく。メスは、いい子。',
        );
        assert.ok(batch2.changed);
        assert.ok(batch2.text.includes('メンエスは'));
        assert.ok(batch2.text.includes('ギリギリの塩梅'));
        assert.ok(batch2.text.includes('オイル追加'));
        assert.ok(batch2.text.includes('半パンツ'));
        assert.ok(batch2.text.includes('仰向けになって'));
        assert.ok(batch2.text.includes('肩を'));
        assert.ok(batch2.text.includes('下半身'));
        assert.ok(batch2.text.includes('おっぱい'));
        assert.ok(batch2.text.includes('ほぐれて'));
        assert.ok(batch2.text.includes('風俗とは違います'));
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
    });

    it('sanitizeMtCueText applies domain fixes end-to-end', () => {
        const out = sanitize.sanitizeMtCueText(
            '来，也来做一下小穴吧',
            'さあおむけもやっていきましょうか。',
            { contentProfile: 'av_soft' },
        );
        assert.ok(out.flags.includes('domain_term'));
        assert.ok(out.text.includes('仰躺'));

        const batch = sanitize.sanitizeMtCues(
            [
                { index: 0, text: '不可以…不可以' },
                { index: 1, text: '这是防晒油吗？' },
            ],
            [
                { index: 0, text: '免税しては風俗ではありません。' },
                { index: 1, text: 'これオイルなの?' },
            ],
            { contentProfile: 'av_soft' },
        );
        assert.ok(batch.jaAsrDomainChanged >= 1);
        assert.ok(batch.sourceCues[0].text.includes('メンエス'));
        assert.ok(batch.cues[0].text.includes('不是风俗') || batch.cues[0].text === '');
        assert.ok(batch.cues[1].text.includes('按摩油'));
    });
});
