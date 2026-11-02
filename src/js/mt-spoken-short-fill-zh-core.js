/**
 * Reusable JA→ZH deterministic fills for short spoken cues that otherwise ship as「…」.
 * Pattern families (te-request / naide / questions / stems), not title-locked glosses.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtSpokenShortFillZh = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtSpokenShortFillZhFactory() {
    function textLen(s) {
        return Array.from(String(s || '')).length;
    }

    function stripTrailPunct(s) {
        return String(s || '')
            .trim()
            .replace(/[。．.、，,\s！!？?～〜…·•・♡♥❤♪☆★「」『』（）()]+$/gu, '');
    }

    function qMark(s) {
        return /[?？]/.test(String(s || ''));
    }

    function hasEllipsis(s) {
        return /[…・]/.test(String(s || ''));
    }

    function withQ(zh, s) {
        if (!zh) return null;
        if (qMark(s) && !/[?？]$/.test(zh)) return `${zh}？`;
        return zh;
    }

    /**
     * Do not mint decorative trailing「…」on det-fills — viewing-clear strips them
     * and leftover bare/mid ellipsis is the main 成片 complaint (SY-228 / LTX).
     */
    function withEll(zh, _s) {
        return zh || null;
    }

    /** Exact / near-exact stems (punct stripped). */
    const STEM_ZH = Object.freeze({
        分かった: '知道了',
        わかった: '知道了',
        わかりました: '明白了',
        分かりました: '明白了',
        わかる: '明白',
        分かる: '明白',
        わかったよ: '知道了',
        分かったよ: '知道了',
        大好き: '最喜欢',
        だいすき: '最喜欢',
        大好きだよ: '最喜欢你',
        痛い: '好痛',
        痛いよ: '好痛',
        痛いです: '好痛',
        いこう: '走吧',
        行こう: '走吧',
        行こうよ: '走吧',
        たぶん: '大概',
        多分: '大概',
        まじ: '真的假的',
        マジ: '真的假的',
        うそだ: '骗人',
        嘘だ: '骗人',
        嘘でしょ: '骗人吧',
        うそでしょ: '骗人吧',
        そっか: '这样啊',
        そうか: '是吗',
        バイバイ: '拜拜',
        ばいばい: '拜拜',
        ティッシュ: '纸巾',
        いやよ: '不要',
        いやだ: '不要',
        いやぁ: '不要啊',
        ううん: '嗯嗯',
        イク: '要去了',
        いく: '要去了',
        いいですね: '真好啊',
        いいね: '真好',
        いいよ: '可以哦',
        いいだよ: '可以哦',
        大丈夫: '没事',
        大丈夫大丈夫: '没事没事',
        大丈夫よ: '没事的',
        大丈夫です: '没事',
        寂しい: '好寂寞',
        寂しいよ: '好寂寞',
        寂しいな: '好寂寞',
        寂しいです: '好寂寞',
        悲しい: '好难过',
        悲しいな: '好难过',
        悲しいです: '好难过',
        寒い: '好冷',
        寒いです: '好冷',
        帰る: '要回去了',
        帰ろう: '回去吧',
        後で: '待会见',
        後でね: '待会见',
        本当ですか: '真的吗',
        ほんとに: '真的',
        本当に: '真的',
        会社員です: '是公司职员',
        独身です: '是单身',
        独身だよ: '是单身哦',
        初めてだよ: '是第一次哦',
        初めてなんだ: '是第一次',
        変だよ: '好奇怪',
        合ってる: '对的',
        合ってます: '对的',
        間違ってる: '错了',
        間違ってます: '错了',
        見える: '看得见',
        見えてる: '看得见',
        見えてるよ: '看得见哦',
        見えてるの: '看得见吗',
        見えてます: '看得见',
        見えてますか: '看得见吗',
        見えますか: '看得见吗',
        彼女いる: '有女朋友',
        彼氏いる: '有男朋友',
        愛してる: '我爱你',
        愛してます: '我爱你',
        かゆい: '好痒',
        くすぐったい: '好痒',
        痛くない: '不痛',
        痛くないよ: '不痛哦',
        暑い: '好热',
        暑いよ: '好热',
        暑いです: '好热',
        そうなの: '是这样吗',
        そうですよ: '是的呀',
        そうです: '是的',
        違う: '不对',
        違うよ: '不对哦',
        違います: '不对',
        いらない: '不要',
        いらないよ: '不要',
        いらないです: '不要',
        行きましょう: '走吧',
        行きましょうか: '走吧',
        もう一回: '再来一次',
        もう一度: '再来一次',
        もっと強く: '再用力点',
        お疲れさま: '辛苦了',
        お疲れ様: '辛苦了',
        お疲れさまです: '辛苦了',
        はじめまして: '初次见面',
        初めまして: '初次见面',
        こちらこそ: '彼此彼此',
        なんでもない: '没什么',
        なんでもないよ: '没什么',
        何でもない: '没什么',
        何でもないよ: '没什么',
        問題ない: '没问题',
        問題ないよ: '没问题',
        平気: '没事',
        平気だよ: '没事的',
        平気です: '没事',
        // JUFE / soft-AV shelf class — reusable spoken shorts
        楽しみ: '好期待',
        楽しみだよ: '好期待',
        楽しみです: '好期待',
        最高: '太棒了',
        最高だよ: '太棒了',
        最高です: '太棒了',
        知った: '知道了',
        知ったよ: '知道了',
        セクシー: '好性感',
        セクシーだ: '好性感',
        セクシーだよ: '好性感',
        あったかい: '好暖和',
        あったかいよ: '好暖和',
        あたたかい: '好暖和',
        あたたかいよ: '好暖和',
        温かい: '好暖和',
        暖かい: '好暖和',
        よかった: '太好了',
        よかったよ: '太好了',
        こっちへ: '到这边来',
        こっちに: '到这边来',
        ほれ: '你看',
        ほら: '你看',
        ブラジャー: '胸罩',
        スパイシー: '好辣',
        スパイシーだ: '好辣',
        スパイシーだよ: '好辣',
        すごい: '好厉害',
        スゴイ: '好厉害',
        すごいい: '好厉害',
        いやらしい音: '好下流的声音',
        いやらしい音だよ: '好下流的声音',
        おいさん: '大叔',
        おじさん: '大叔',
        // DSAM / soft-AV spoken batch
        なんちゅう: '怎么说',
        なんちゅうの: '怎么说',
        お高い女: '很高傲的女人',
        お高い女だよ: '很高傲的女人啊',
        うるさい: '好吵',
        うるさ: '好吵',
        しょうがないじゃん: '没办法啊',
        しょうがない: '没办法',
        びちゃびちゃ: '湿漉漉的',
        びちゃびちゃだよ: '湿漉漉的',
        こっち: '这边',
        やっぱ: '果然',
        やっぱり: '果然',
        全然: '完全没有',
        全然だよ: '完全没有啊',
        全然だ: '完全没有',
        もう: '真是的',
        えっち: '好色',
        えっちー: '好色',
        エッチ: '好色',
        とうとう: '终于',
        まあ: '反正',
        // SY-228 / soft-AV hesitation — reusable ちょっと / refusal / surprise
        ちょっと: '等等',
        ちょっとよ: '等等啦',
        ちょっとよです: '等等啦',
        ちょっと待った: '等一下',
        ちょっと待って: '等一下',
        やです: '不要',
        やだ: '不要',
        いやだ: '不要',
        おかしいです: '好奇怪',
        おかしいですよ: '太奇怪了',
        おかしい: '好奇怪',
        飲み込みました: '咽下去了',
        せんせぇ: '老师',
        せんせー: '老师',
        センセ: '老师',
        センセー: '老师',
        // Batch desu / dayo shorts (XVSR / GVH / MIDA…)
        秘密: '是秘密',
        秘密です: '是秘密',
        素敵: '真漂亮',
        ステキ: '真漂亮',
        素敵です: '真漂亮',
        ステキです: '真漂亮',
        素敵ですよ: '真漂亮',
        ステキですよ: '真漂亮',
        特別: '很特别',
        特別だよ: '很特别哦',
        特別です: '很特别',
        重たい: '好重',
        重たいです: '好重',
        重い: '好重',
        いい声: '声音真好听',
        いい声です: '声音真好听',
        暴力: '这是暴力',
        暴力です: '这是暴力',
        努力: '是努力',
        努力です: '是努力',
        犯罪: '这是犯罪',
        犯罪だよ: '这是犯罪啊',
        犯罪です: '这是犯罪',
        素晴らしい: '太棒了',
        素晴らしいです: '太棒了',
        苦しい: '好难受',
        苦しいの: '难受吗',
        痛かった: '好痛',
        痛かったです: '好痛',
        大変: '糟了',
        大変だよ: '糟了',
        業務終了: '下班了',
        業務終了です: '下班了',
        動きたい: '想动',
        動きたいです: '想动起来',
        まだです: '还没',
        そこです: '就是那里',
        始めよ: '开始吧',
        始めよう: '开始吧',
        始めよー: '开始吧',
        ありがとう: '谢谢',
        ありがと: '谢谢',
        ありがとー: '谢谢',
        苦しそう: '看起来好难受',
        苦しそうだよ: '看起来好难受啊',
        めちゃ痛い: '好痛',
        めちゃ痛いです: '好痛',
        いい音: '声音真好',
        いい音です: '声音真好',
        トイレ: '厕所',
        トイレです: '厕所',
        調査中: '调查中',
        調査中です: '调查中',
        全然全然: '完全没有',
        ちがうね: '不对吧',
        ここ弱い: '这里很弱',
        ここ弱いです: '这里很弱',
        今帰った子ですよ: '刚回来的孩子哦',
        これからです: '从现在开始',
        // JERA / polite truncations & food-touch shorts
        美味しい: '好吃',
        美味しいです: '好吃',
        美味しかった: '很好吃',
        美味しかったです: '很好吃',
        熱い: '好烫',
        熱いです: '好烫',
        熱いですよ: '好烫',
        熱くなっちゃう: '要热起来了',
        本当です: '是真的',
        苦い: '好苦',
        苦いです: '好苦',
        邪魔: '碍事',
        邪魔です: '碍事',
        情けですよ: '真可怜啊',
        素敵な感じです: '感觉真棒',
        素敵なお尻です: '屁股真漂亮',
        こんな感じです: '就是这种感觉',
        こんな感じですよ: '就是这种感觉哦',
        ちょっとそうです: '差不多是这样',
        お互いそうですよ: '彼此彼此',
        気になっちゃいます: '会在意吗',
        全然素敵じゃないですよ: '一点也不棒啊',
        まっすぐ: '笔直',
        せっかく: '难得',
        車: '车',
        ってか: '话说',
        奥: '里面',
        着ないです: '不穿',
        確かに飲食店: '确实是餐饮店',
        淡泊みたいな: '有点淡泊',
        昔はよく行ってましたね: '以前常去呢',
        喋るようになるかもしれない: '也许会开始说话',
        もっとエッチなキャラになっちゃう: '会变成更色的角色',
        ちょっと性的なことです: '有点色情的事',
        まったくもう: '真是的',
        仲が良さ過ぎて: '关系好过头了',
        こんなこと言ったら: '要是这么说的话',
        ちょっと奥さんが羨ましい: '有点羡慕你太太',
        なんかあれですかね: '是那个吗',
        なんか結構: '怎么说还挺',
        なんてんだろ: '怎么说呢',
        久々で楽しかったですね: '好久没见了，真开心',
        もし運転が疲れなければ: '如果开车不太累的话',
        この人の家庭は壊したくないし: '也不想毁了这个人的家庭',
        酔っ払うとどうなっちゃうんです: '喝醉了会怎么样',
        いきそう: '要去了',
        // Soft-AV kinship / spoken shorts (ASR trunc 〜さ recovered elsewhere)
        僕: '我',
        ぼく: '我',
        こたろー: '小太郎',
        こたろう: '小太郎',
        ごちそうさま: '多谢款待',
        ごちそうさまです: '多谢款待',
        またです: '还要',
        しっかり洗わなきゃねー: '得好好洗呢',
        しっかり洗わなきゃね: '得好好洗呢',
        見てない見てない: '没看没看',
        パンパン: '胀鼓鼓的',
        パンパンだよ: '胀鼓鼓的',
        でもでも: '但是但是',
        遅くなった: '晚了',
        なんだなんだ: '什么啊',
        熱くてムチムチ: '又烫又肉感',
        '熱くて、ムチムチ': '又烫又肉感',
        // JERA / soft-AV productive shorts (ASR trunc + Xです family)
        こんにちは: '你好',
        こんにち: '你好',
        りがとう: '谢谢',
        全然いいです: '完全可以',
        仕方ないです: '没办法',
        触りたいです: '想摸',
        させたいです: '想让你做',
        よっぽどいいです: '相当不错',
        わかってるです: '我知道',
        いやじゃないです: '并不讨厌',
        誰かです: '是谁',
        ちょっと凄いです: '有点厉害',
        今日だけですよ: '只限今天哦',
        今日だけです: '只限今天',
        いいけど: '可以是可以',
        そうだな: '是啊',
        そうだよ: '是啊',
        そだよ: '是啊',
        静かだよ: '好安静啊',
        どこどこ: '哪里哪里',
        そんなそんな: '哪有哪有',
        理由理由: '理由啊',
        ふるふる: '抖抖',
        ちょいちょい: '经常',
        いぐいぐ: '要去了要去了',
        みくみく: '美久美久',
        まりしないです: '不怎么做',
        あまりしないです: '不怎么做',
        全然見た目通りです: '完全和外表一样',
        '全然、見た目通りです': '完全和外表一样',
        私からしたらそうだよ: '在我看来是这样',
        // Soft-AV discourse / trunc batch (MURIKURI / HAWA / DANDYA class)
        どうぞどうぞ: '请请',
        どうぞどうぞー: '请请',
        これこれ: '这个这个',
        無理無理: '不行不行',
        無理無理無理: '不行不行',
        おらおら: '喂喂',
        まだまだ: '还早呢',
        まだまだだよ: '还早呢',
        いい感じですよ: '感觉不错哦',
        いい感じです: '感觉不错',
        意味わかんないですよ: '搞不懂啊',
        意味わかんないです: '搞不懂',
        変態です: '是变态',
        変態: '变态',
        本当: '真的',
        噛む: '咬',
        罠: '陷阱',
        見て見て: '快看快看',
        '見て見てー': '快看快看',
        にゃにゃ: '喵喵',
        ふぐふぐ: '嗯嗯',
        いそーいそー: '着急着急',
        よいよい: '好啦好啦',
        いこいこ: '来来',
        こうだよ: '是这样哦',
        せんぱぁ: '前辈',
        せんぱい: '前辈',
        先輩: '前辈',
        姉さま: '姐姐',
        兄ちゃ: '哥哥',
        よろしくま: '请多指教',
        よろしくお願いします: '请多指教',
        た今いいよ: '现在可以哦',
        ただいまいいよ: '现在可以哦',
        らめです: '不要',
        おぱんつ: '内裤',
        なんやの: '什么啊',
        'な、なに': '什么',
        なになに: '什么什么',
        'なに、なに、なに': '什么什么',
        // DLDSS / soft-AV shorts
        生活です: '是生活',
        痛い痛い: '好痛好痛',
        弟: '弟弟',
        淳: '淳',
        それだよ: '就是这样',
        れだよ: '就是这样',
        頑張ってくれよ: '加油啊',
        '頑張ってくれよー': '加油啊',
        これケチャップだよ: '这是番茄酱哦',
        ケチャップ: '番茄酱',
        多少本気だよ: '有点认真哦',
        変な激しすぎだよ: '奇怪地太激烈了',
        リラックスしすぎです: '太放松了',
        だってじゃあだよ: '可是，那就这样吧',
        'だって、じゃあだよ': '可是，那就这样吧',
        // BAB / soft-AV shorts
        なんの: '什么',
        着きました: '到了',
        '着きましたー': '到了',
        してないしてない: '没有没有',
        ないない: '没有没有',
        撮って撮って: '拍啊拍啊',
        した: '做了',
        そうだそういうことだよ: '对，就是这么回事',
        'そうだ、そういうことだよ': '对，就是这么回事',
    });

    /**
     * te-form request / permission.
     * [stemBeforeTe, zhBase] — stem is matched before the て suffix.
     * Special: 見てて handled separately (redup).
     */
    const TE_STEMS = [
        ['見せ', '给我看看'],
        ['見', '看'],
        ['触っ', '摸摸'],
        ['さわっ', '摸摸'],
        ['抱い', '抱抱我'],
        ['だい', '抱抱我'],
        ['抱きしめ', '抱紧我'],
        ['撫で', '摸摸'],
        ['なで', '摸摸'],
        ['貸し', '借我'],
        ['かし', '借我'],
        ['出し', '拿出来'],
        ['つけ', '打开'],
        ['かい', '写'],
        ['書い', '写'],
        ['電話し', '打电话'],
        ['暗くし', '关暗一点'],
        ['窓閉め', '关窗'],
        ['窓開け', '开窗'],
        ['動い', '动起来'],
        ['やっ', '做吧'],
        ['優しくし', '温柔一点'],
        ['ゆっくりし', '慢一点'],
        ['深くし', '深一点'],
        ['強くし', '用力一点'],
        ['めくっ', '掀起来'],
    ];

    function matchTeFamily(noPunct, s) {
        if (/^見てて(?:ください|よ|ね)?$/u.test(noPunct)) {
            return withQ(withEll('看着', s), s);
        }
        if (/^おいで(?:よ|ね)?$/u.test(noPunct)) {
            return withQ(withEll('过来', s), s);
        }
        for (const [stem, zhBase] of TE_STEMS) {
            if (!zhBase) continue;
            const re = new RegExp(
                `^${stem}て(?:ください|くれ)?(?:よ|ね|な)?(?:いい(?:です)?(?:か)?)?$`,
                'u',
            );
            if (!re.test(noPunct)) continue;
            if (/いい(?:です)?(?:か)?$/u.test(noPunct)) {
                return withQ(`${zhBase}可以吗`, s);
            }
            if (/ください$/u.test(noPunct)) {
                if (zhBase === '给我看看') return withQ('请给我看看', s);
                if (zhBase === '看') return withQ('请看', s);
                if (zhBase === '借我') return withQ('请借我', s);
                return withQ(`请${zhBase}`, s);
            }
            return withQ(withEll(zhBase, s), s);
        }
        return null;
    }

    function matchNaideFamily(noPunct, s) {
        if (/^急がなくていい(?:です|よ)?$/u.test(noPunct)) return '不用着急';
        if (/^変なこと言わないで(?:よ|ね|ください)?$/u.test(noPunct)) {
            return withQ('别说怪话', s);
        }
        const pairs = [
            [/^やめないで(?:ください|よ|ね|くれ)?$/u, '别停'],
            [/^出さないで(?:ください|よ|ね|くれ)?$/u, '别拿出来'],
            [/^言わないで(?:ください|よ|ね|くれ)?$/u, '别说'],
            [/^急がないで(?:ください|よ|ね|くれ)?$/u, '别急'],
            [/^帰らないで(?:ください|よ|ね|くれ)?$/u, '别走'],
            [/^気にしないで(?:ください|よ|ね|くれ)?$/u, '别在意'],
        ];
        for (const [re, zhBase] of pairs) {
            if (!re.test(noPunct)) continue;
            if (/ください$/u.test(noPunct)) return withQ(`请${zhBase}`, s);
            return withQ(withEll(zhBase, s), s);
        }
        return null;
    }

    function matchQuestionFamily(noPunct, s) {
        if (/^何してるの$/u.test(noPunct) || /^なにしてるの$/u.test(noPunct)) {
            return '在做什么？';
        }
        if (/^何歳(?:です)?(?:か)?$/u.test(noPunct)) {
            return '多大了？';
        }
        if (/^触っていい(?:です)?(?:か)?$/u.test(noPunct)) {
            return withQ('可以摸吗', s);
        }
        if (/^抱いていい(?:です)?(?:か)?$/u.test(noPunct)) {
            return withQ('可以抱吗', s);
        }
        if (/^喉乾いた$/u.test(noPunct)) return '口渴了';
        if (/^変な感じ(?:がする)?$/u.test(noPunct)) {
            return withEll('好奇怪的感觉', s);
        }
        if (/^気にすることない(?:よ|です)?$/u.test(noPunct)) return '没什么好在意的';
        return null;
    }

    /** Strip leading breath/moan so はぁ…よかった / ふふ、スパイシーだ still fill.
     * Do not strip lone あ (breaks あの / あねちゃ). */
    function stripLeadMoanDiscourse(s) {
        return String(s || '')
            .replace(/^(?:(?:あぁ+|ああ+|はぁ+|はあ+|ひゃぁ*|うっ+|うわ+|あっ+|んっ+|んん+|ふふ+|へへ+)[っッー〜～…·.\s、，,]*)+/u, '')
            .replace(/^[…·.•\-—_~～\s、，,]+/u, '')
            .trim();
    }

    function matchVocativeChan(noPunct, s) {
        if (/あねちゃ[んン]?$/u.test(noPunct) || /姉ちゃ[んン]?$/u.test(noPunct)) {
            return withEll('姐姐', s);
        }
        const m = noPunct.match(
            /^(?:(?:あ+|あぁ+|ん+|ねえ+|ねぇ+)[？?]?[、，,]?\s*)?([一-龥ぁ-んァ-ンーA-Za-z]{2,8})ちゃん$/u,
        );
        if (!m) return null;
        const name = m[1];
        if (/^(?:ちゃん|お嬢|赤|おっ|まこっ?|あね)$/u.test(name)) return null;
        if (/^(?:あ+|あぁ+)/u.test(noPunct)) return withEll(`啊，${name}酱`, s);
        return withEll(`${name}酱`, s);
    }

    /**
     * Short Xです / Xだよ / Xの? that Hy-MT often blanks (reusable stems above + light patterns).
     */
    function matchDesuDayoFamily(noPunct, s) {
        if (/^苦しいの$/u.test(noPunct)) return withQ('难受吗', s);
        if (/^苦しそうだよ$/u.test(noPunct)) return withQ('看起来好难受啊', s);
        if (/^まだです$/u.test(noPunct)) return withQ('还没', s);
        if (/^手伝いしただけです$/u.test(noPunct)) return '只是帮忙而已';
        if (/^今だけやらないです$/u.test(noPunct)) return '现在先不要';
        if (/^そんな厳しくないですよ$/u.test(noPunct)) return '没那么严格啦';
        if (/^いやいや[、,，]?\s*そんなことないですよ$/u.test(noPunct)) return '不不不，没那回事';
        if (/^ここどこだよ$/u.test(noPunct)) return withQ('这是哪里啊', s);
        if (/^と[、,，]?\s*ありがと[ー〜～]*$/u.test(noPunct)) return '谢谢';
        if (/^ありがと[ー〜～]*$/u.test(noPunct)) return '谢谢';
        if (/^始めよ[ー〜～]*$/u.test(noPunct)) return '开始吧';
        // Generic short noun/adj + です/だよ (≤10 chars stem) when already in STEM_ZH via tryStem;
        // extra: うるいです ASR for 悪い/緩い → 好松 / 好难受 soft gloss
        if (/^うるいです$/u.test(noPunct)) return '好松';
        if (/^気にはさまってます$/u.test(noPunct)) return '卡在嗓子里了';
        if (/^ねー[、,，]?\s*ここ弱いです$/u.test(noPunct)) return '这里很弱';
        // ASR often drops leading あ：りがとうございます / ようございます
        // Anchor: whole-cue thanks only — anatomy+thanks handled in matchAdultStem.
        if (/^(?:と[、,，]?\s*)?(?:あ)?りがとうございます$/u.test(noPunct)) return '谢谢';
        if (/りがとうございます/u.test(noPunct) && textLen(noPunct) <= 12
            && !/[ぁ-んァ-ン]{3,}/u.test(noPunct.replace(/[ぁあ]?りがとうございます/u, ''))) {
            return '谢谢';
        }
        if (/^(?:よろし)?ようございます$/.test(noPunct)) return '您好';
        if (/^く[、,，]?\s*邪魔です$/.test(noPunct)) return '碍事';
        if (/^こんな[、,，]?\s*こんな感じです(?:よ)?$/.test(noPunct)) return '就是这种感觉哦';
        if (/^気になっちゃいます$/.test(noPunct)) return withQ('会在意吗', s);
        if (/^奥$/.test(noPunct)) return withQ('里面', s);
        if (/^擦れてる$/u.test(noPunct)) return withQ('在蹭吗', s);
        if (/^ちょっとどこがいいとかわかんないですけど$/u.test(noPunct)) {
            return '不太知道哪里好';
        }
        if (/^ないですそういうのじゃ全くないですね$/u.test(noPunct)) {
            return '没有，那种完全没有';
        }
        if (/^ご奉仕してからは$/u.test(noPunct)) return '奉仕之后';
        if (/^休めてはないけど/.test(noPunct) && /大丈夫/.test(noPunct)) {
            return '虽然没怎么休息，不过没事';
        }
        if (/気になっちゃって好きなのかな/.test(noPunct) && textLen(noPunct) <= 24) {
            return '而且还在意是不是喜欢呢';
        }
        if (/^そうですねま$/u.test(noPunct)) return '是啊';
        if (/^こういうのあんま嫌いですか$/u.test(noPunct)) return withQ('不太讨厌这种吗', s);
        if (/^苦かったけどなんかちょっと$/u.test(noPunct)) return '虽然有点苦';
        // Vocative pause only:「お、隼斗。」— never peel おいで / おしまい.
        if (/^お[、,，]\s*.+$/u.test(noPunct) && textLen(noPunct) <= 10) {
            const name = noPunct.replace(/^お[、,，]\s*/u, '');
            if (name && textLen(name) >= 2 && !/^(?:お|を|に|いで|しまい)$/u.test(name)) {
                return name;
            }
        }
        return null;
    }

    /**
     * ちょっと / ちょ stutter hesitation (often ships as bare「…」).
     */
    function matchChottoFamily(noPunct, s) {
        if (/^ここから近いところです$/u.test(noPunct)) return '离这里很近';
        if (/^なんですかちょっと$/u.test(noPunct)) return withQ('什么啊', s);
        if (/^いやちょっとおかしいです(?:よ)?$/u.test(noPunct)) return '好奇怪啊';
        if (/^や[、,，]?\s*ちょっと$/u.test(noPunct)) return '等等';
        if (/^ちょっとよです$/u.test(noPunct)) return '等等啦';
        if (/^ちょっと待[ったて]+$/u.test(noPunct)) return '等一下';
        // ちょ、ちょっと… / ちょちょちょ / ちょっとちょちょ / ちょ、ちょっ
        if (/^(?:ちょ[っツ]?[、,，\s]*)*(?:ちょっと)+(?:[、,，\s]*ちょ[っツ]?)*$/u.test(noPunct)) {
            return '等等';
        }
        if (/^(?:ちょ[っツ]?[、,，\s]*)+$/u.test(noPunct)) return '等等';
        if (/^ちょっと$/u.test(noPunct)) return '等等';
        if (/^ぷはっ[、,，\s]*ちょ$/u.test(noPunct)) return '等等';
        if (/^ちとちと$/u.test(noPunct)) return '一点点';
        return null;
    }

    function matchDayoFamily(noPunct, s) {
        // Xだよ / Xだ / Xですよ — stem already in STEM_ZH via stemLoose; handle redup / 音だよ
        if (/^(?:スゴイ|すごい){2,}[っッー〜～]*$/u.test(noPunct)) {
            return withEll('好厉害', s);
        }
        if (/^いやらしい音だ(?:よ|ね)?$/u.test(noPunct)) {
            return withEll('好下流的声音', s);
        }
        if (/^あの[、，,]?\s*はい[っッー〜～]*$/u.test(noPunct)) {
            return withEll('那个，好', s);
        }
        if (/^あねちゃ[んン]?$/u.test(noPunct) || /^姉ちゃ[んン]?$/u.test(noPunct)) {
            return withEll('姐姐', s);
        }
        // Single ねえ + name; leave ねえねえ redup for honorific sanitize (呐呐).
        if (/^(?:ねえ|ねぇ){2,}/u.test(noPunct)) return null;
        if (/^ねえ[？?]?[、,]?\s*.{1,8}$/u.test(noPunct) && textLen(noPunct) <= 12) {
            const rest = noPunct.replace(/^ねえ[？?]?[、,]?\s*/u, '');
            if (rest && !/^(?:ねえ|ねぇ)/u.test(rest) && !/[ぁ-んァ-ン]/.test(rest)) {
                return withQ(`喂，${rest}`, s);
            }
        }
        if (/^うるさ[ぁあ]+$/u.test(noPunct)) return withEll('好吵', s);
        if (/服めくって/.test(noPunct) && textLen(noPunct) <= 16) {
            return withQ('把上面衣服掀起来', s);
        }
        if (/一気に好きになった/.test(noPunct) && textLen(noPunct) <= 18) {
            return withQ('一下子就喜欢上了', s);
        }
        if (/お服邪魔じゃない/.test(noPunct)) return withQ('衣服不碍事吗', s);
        if (/上着たまま/.test(noPunct) && textLen(noPunct) <= 18) {
            return withQ('穿着上衣吗', s);
        }
        if (/ソーセージ/.test(noPunct) && textLen(noPunct) <= 22) {
            return withQ('什么香肠之类的', s);
        }
        if (/^ああ[、,]?\s*やっぱ/.test(noPunct) || /^やっぱ[ぁあ…]*$/.test(noPunct)) {
            return withEll('果然', s);
        }
        if (/^(?:ふふ+|あはは+|えへへ+)[、，,]?\s*(?:ね|もう|だーん*)?$/u.test(noPunct)) {
            if (/もう/.test(noPunct)) return withEll('真是的', s);
            if (/ね$/.test(noPunct)) return withEll('对吧', s);
            return withEll('哈哈', s);
        }
        if (/^(?:ふふ+|んふふ?)[、，,]?\s*ほら$/u.test(noPunct)) return '你看';
        if (/^(?:ふふっ?[、，,]?\s*)?とうとう[。．.]?$/u.test(noPunct)) return '终于';
        if (/ずれ|ずい[っつ]だ/.test(noPunct) && textLen(noPunct) <= 10) {
            return withEll('滑进去了', s);
        }
        return null;
    }

    /** Expand common ASR truncations before STEM / productive match. */
    function expandAsrTruncStem(noPunct) {
        let s = String(noPunct || '');
        if (s === 'こんにち') return 'こんにちは';
        if (s === 'りがとう' || s === 'ありがと') return 'ありがとう';
        if (s === 'そだよ') return 'そうだよ';
        if (s === 'まりしないです') return 'あまりしないです';
        if (s === 'よろしくま') return 'よろしくお願いします';
        if (s === 'た今いいよ') return 'ただいまいいよ';
        if (s === 'せんぱぁ') return 'せんぱい';
        if (s === 'れだよ') return 'それだよ';
        if (/^どうぞどうぞ[ー〜～]*$/u.test(s)) return 'どうぞどうぞ';
        if (/^見て見て[ー〜～]*$/u.test(s)) return '見て見て';
        if (/^いそーいそー[。．.]?$/u.test(s)) return 'いそーいそー';
        // Common Whisper domain slip
        s = s.replace(/ギラックス/gu, 'リラックス');
        return s;
    }

    /** Discourse / soft reduplication that Hy-MT blanks as「…」. */
    function matchDiscourseRedup(noPunct, s) {
        if (/^(?:どうぞ){2,}[ー〜～]*$/u.test(noPunct)) return '请请';
        if (/^(?:これ){2,}$/u.test(noPunct)) return '这个这个';
        if (/^(?:無理){2,}$/u.test(noPunct)) return '不行不行';
        if (/^(?:おら){2,}$/u.test(noPunct)) return '喂喂';
        if (/^(?:まだまだ)(?:だよ)?$/u.test(noPunct)) return withQ('还早呢', s);
        if (/^こんなまだまだだよ$/u.test(noPunct)) return '这样还早呢';
        if (/^まだ始まったばっかりだよ$/u.test(noPunct)) return '才刚刚开始呢';
        if (/^(?:にゃ){2,}$/u.test(noPunct) || /^にゃ[、,，]?\s*にゃ$/u.test(noPunct)) return '喵喵';
        if (/^(?:ふぐ){2,}$/u.test(noPunct)) return '嗯嗯';
        if (/^(?:よい){2,}$/u.test(noPunct)) return '好啦好啦';
        if (/^(?:いこ){2,}$/u.test(noPunct)) return '来来';
        if (/^(?:なに[、,，]?\s*){2,}なに?$/u.test(noPunct) || /^(?:なに){2,}$/u.test(noPunct)) {
            return withQ('什么什么', s);
        }
        if (/^(?:痛い){2,}$/u.test(noPunct)) return '好痛好痛';
        if (/^(?:ちょ){2,}[、,，]/.test(noPunct) && textLen(noPunct) <= 24) return '等等';
        // らめ／だめ redup (climax refusal)
        if (/^(?:らめ[、,，]?\s*){2,}らめ?$/u.test(noPunct) || /^(?:らめ){2,}$/u.test(noPunct)) {
            try {
                const opaque = require('./mt-opaque-strings');
                return opaque?.T?.dameDameZh || '不要不要';
            } catch { return '不要不要'; }
        }
        if (/^らめです$/u.test(noPunct)) {
            try {
                const opaque = require('./mt-opaque-strings');
                return opaque?.T?.dameZh || '不要';
            } catch { return '不要'; }
        }
        return null;
    }

    /**
     * Productive polite tails — reusable across titles (not film glosses).
     */
    function matchProductivePolite(noPunct, s) {
        if (/^こういう服好きですか$/u.test(noPunct)) return withQ('喜欢这样的衣服吗', s);
        if (/^この先[、,，]?\s*一時停止があります$/u.test(noPunct)) return '前面有暂停';
        if (/^ちょっと前の曲が多い$/u.test(noPunct)) return '稍早一点的歌比较多';
        if (/^追従そうですよ$/u.test(noPunct)) return '好像会跟着来哦';
        if (/^何回すれすか$/u.test(noPunct) || /^何回するん?ですか$/u.test(noPunct)) {
            return withQ('要做几次', s);
        }
        if (/^家とかだし$/u.test(noPunct)) return '毕竟是家里之类的';
        if (/^私も[、,，]?\s*この後予定ないかな$/u.test(noPunct)) return '我这边后面好像也没安排';
        if (/^めちゃめちゃイッチだよ$/u.test(noPunct)) return '超级敏感啊';
        if (/^ちゃん[、,，]?\s*私言いますね$/u.test(noPunct)) return '我跟你说哦';
        if (/^誰かという気にすることは$/u.test(noPunct)) return '会在意是谁吗';
        if (/^好きな人はいない(?:はいない)?けど気になったか$/u.test(noPunct)) {
            return '虽然没有喜欢的人，但有没有在意过呢';
        }
        if (/^全然[、,，]?\s*見た目通りです$/u.test(noPunct)) return '完全和外表一样';

        // 〜たいです(よ)
        const tai = noPunct.match(/^(.{1,8})たいです(よ)?$/u);
        if (tai) {
            const stemMap = {
                触り: '想摸', さわい: '想摸', させ: '想让你做', 見: '想看',
                行き: '想去', 愛し: '想爱', 抱き: '想抱', 舐め: '想舔',
            };
            if (stemMap[tai[1]]) return withEll(stemMap[tai[1]], s);
        }

        // 〜じゃないです(よ) — adult stems handled in matchAdultStem; avoid echoing JA stems.
        if (/^いやじゃないです(よ)?$/u.test(noPunct)) return '并不讨厌';

        // Short adj/noun + です / ですよ already in STEM; light だよ leftovers:
        if (/^静かだよ$/u.test(noPunct)) return '好安静啊';
        if (/^いいけど$/u.test(noPunct)) return '可以是可以';
        if (/^大きな器でいらっしゃいますね$/u.test(noPunct)) return '真是宽宏大量呢';
        if (/^いつもこんなエッチな匂いさせてるのな$/u.test(noPunct)) return '总是散发这种色色的味道呢';
        if (/^おしゃれな服とかも汚れちゃうから今日はもう家でゆっくりしよ$/u.test(noPunct)) {
            return withQ('时髦衣服也会弄脏，今天就在家慢慢来吧', s);
        }
        if (/^入れてやるぞ$/u.test(noPunct)) return '我要插进去了';
        if (/^見てみろな$/u.test(noPunct)) return '你看啊';
        if (/^顔の横に$/u.test(noPunct)) return '在脸旁边';
        if (/^今日中にな$/u.test(noPunct)) return '今天之内啊';
        if (/^気は楽になすからな$/u.test(noPunct)) return '放轻松就好';
        if (/^ごめんなきゃです$/u.test(noPunct) || /^ごめんなさいです$/u.test(noPunct)) return '对不起';
        // Nameです / サイン、Nameです — katakana/latin cast names only (not 秘密です)
        {
            const m = noPunct.match(/^(?:サイン[、,，]?\s*)?([ァ-ヴーA-Za-z]{2,8})です$/u);
            if (m && textLen(m[1]) <= 6 && !Object.prototype.hasOwnProperty.call(STEM_ZH, m[1])) {
                return `我是${m[1]}`;
            }
        }
        // そうだよ久我さ — affirm + clipped さん
        {
            const m = noPunct.match(/^そうだよ\s*([一-龥ぁ-んァ-ンー]{2,6})さ$/u);
            if (m) return `是啊，${m[1]}`;
        }
        // Name、ちゃ / Nameちゃんけ trunc
        {
            const m = noPunct.match(/^([一-龥ぁ-んァ-ンーA-Za-z]{2,8})[、,，]?\s*ちゃ(?:んけ)?$/u);
            if (m && !/^(?:はい|入っ?|あね|姉|兄)$/u.test(m[1])) return `${m[1]}酱`;
        }
        if (/^でも[、,，]?\s*ちょ$/u.test(noPunct)) return '但是，等等';
        if (/^ゲンなろうか$/u.test(noPunct)) return withQ('要生气了吗', s);
        if (/^乗ってこら[、,，]?\s*ここ$/u.test(noPunct)) return '骑过来，这里';
        if (/^苦しいしたです$/u.test(noPunct)) return '好难受';
        if (/^ちょした$/u.test(noPunct) || /^ちょっとした$/u.test(noPunct)) return '有点儿';
        if (/^と[、,，]?\s*私$/u.test(noPunct)) return '我';
        if (/^下からかみすら$/u.test(noPunct)) return '从下面咬啊';
        if (/^なんに[ぃい]+$/u.test(noPunct)) return withQ('什么啊', s);
        if (/^猫プリ$/u.test(noPunct)) return '猫普里';
        if (/^なにとも服の上からやも$/u.test(noPunct)) return '从衣服上面什么的';
        if (/リラックスしすぎです/.test(noPunct)) return '太放松了';
        if (/^変な激しすぎだよ$/u.test(noPunct)) return '奇怪地太激烈了';
        if (/^多少本気だよ$/u.test(noPunct)) return withQ('有点认真哦', s);
        if (/^これケチャップだよ$/u.test(noPunct)) return '这是番茄酱哦';
        if (/^だって[、,，]?\s*じゃあだよ$/u.test(noPunct)) return '可是，那就这样吧';
        if (/^頑張ってくれ[よー〜～]*$/u.test(noPunct)) return '加油啊';
        if (/^着きました[ー〜～]*$/u.test(noPunct)) return '到了';
        if (/^(?:してない){2,}$/u.test(noPunct) || /^(?:ない){2,}$/u.test(noPunct)) return '没有没有';
        if (/^(?:撮って){2,}$/u.test(noPunct)) return '拍啊拍啊';
        if (/^ちょっと酔うとなんかやりたくなっちゃう$/u.test(noPunct)) {
            return '稍微一醉就有点想做';
        }
        if (/^そうだ[、,，]?\s*そういうことだよ$/u.test(noPunct)) return '对，就是这么回事';
        if (/^スケベな[、,，]?\s*体勢だよ$/u.test(noPunct)) return '好色的姿势啊';
        if (/水玉のパンティ履いてんのね/.test(noPunct)) return '穿着波点内裤呢';
        if (/^(?:キス好き[、,，]?\s*){2,}キス好き?$/u.test(noPunct) || /^(?:キス好き){2,}$/u.test(noPunct)) {
            return '喜欢亲亲';
        }
        if (/ショートカウントです/.test(noPunct)) return '是短打点';
        if (/^デス[・･.]?シャーデ$/u.test(noPunct)) return 'Death Shade';
        // ぱりよ、季衣ちゃ — peel leading scrap, keep name+ちゃ
        {
            const m = noPunct.match(/^[ぁ-んァ-ン]{0,4}[、,，]?\s*([一-龥]{2,4})ちゃ$/u);
            if (m) return `${m[1]}酱`;
        }
        return null;
    }

    /**
     * ASR often clips お父さん/お姉さん → お父さ / お姉さ (shelf blanks as「…」).
     */
    function matchKinshipTrunc(noPunct, s) {
        if (/^(?:お)?父さ$/u.test(noPunct)) return withEll('爸爸', s);
        if (/^(?:お)?母さ$/u.test(noPunct)) return withEll('妈妈', s);
        if (/^奥さ$/u.test(noPunct) || /^奥さん$/u.test(noPunct)) return withEll('太太', s);
        if (/^(?:お)?(?:ねえ|姉)さ$/u.test(noPunct) || /^姉さま$/u.test(noPunct)) {
            return withEll('姐姐', s);
        }
        if (/^(?:お)?(?:にい|兄)さ$/u.test(noPunct) || /^兄ちゃ[んン]?$/u.test(noPunct) || /^兄$/u.test(noPunct)) {
            return withEll('哥哥', s);
        }
        if (/^弟$/u.test(noPunct) || /^弟[くん君]$/u.test(noPunct)) return withEll('弟弟', s);
        if (/^姉$/u.test(noPunct)) return withEll('姐姐', s);
        // Name + さ trunc (久我さ) — short name only; never peel うちの会社さ
        {
            const m = noPunct.match(/^([一-龥ぁ-んァ-ンーA-Za-z]{2,4})さ$/u);
            if (
                m
                && !/^(?:お父|お母|おねえ|おにい|父|母|姉|兄|奥)$/u.test(m[1])
                && !/[のはがをにでともへ]/u.test(m[1])
                && !/[一-龥]{3,}/u.test(m[1]) // avoid 会社 / multi-kanji nouns
            ) {
                return withEll(m[1], s);
            }
        }
        return null;
    }

    function matchAdultStem(noPunct) {
        try {
            const opaque = (typeof require === 'function') ? require('./mt-opaque-strings') : null;
            const T = opaque?.T;
            if (!T) return null;
            const oma = T.omankoJa;
            const manko = T.mankoHiraJa;
            if (oma && (noPunct === oma || noPunct === `${oma}だよ`)) {
                return /だよ/.test(noPunct) ? '小穴？' : '小穴';
            }
            if (manko && (noPunct === manko || noPunct === `お${manko}`)) return '小穴';
            if (oma && noPunct.startsWith(oma) && /だよ/.test(noPunct) && textLen(noPunct) <= 8) {
                return '小穴？';
            }

            const rod = T.rodZh || null;
            const ochin = T.ochinchinJa;
            if (rod && ochin) {
                const trunc = ochin.slice(0, -1);
                if (noPunct === ochin || noPunct === trunc) return rod;
            }
            const chin = T.chinChinHiraJa;
            if (rod && chin) {
                const trunc = chin.slice(0, -1);
                if (noPunct === chin || noPunct === trunc) return rod;
            }

            if (T.peeJa && noPunct === T.peeJa) return T.peeZh || null;

            const seishi = T.seishiSlangJa;
            const seishiK = T.seishiSlangKataJa;
            const semen = T.semenZh;
            if (seishi && semen) {
                const onlySeishi = new RegExp(`^(?:${escapeRegExp(seishi)}|${escapeRegExp(seishiK || seishi)})+$`);
                if (onlySeishi.test(noPunct)) return semen;
                if (noPunct.includes(seishi) && textLen(noPunct) <= 14) {
                    if (/^(?:ボク|僕|ぼく)(?:くん|君)?の/u.test(noPunct)) return `我的${semen}`;
                    return semen;
                }
            }
            if (T.panpanJa && (noPunct === T.panpanJa || noPunct === `${T.panpanJa}だよ`)) {
                return '胀鼓鼓的';
            }

            // チンポありがとう… — do not let bare りがとう strip wipe the rod lemma
            const rodLemmas = [
                T.chinpoJa,
                T.chinpoHiraJa,
                T.ochinchinJa,
                T.ochinpoJa,
                T.chinChinHiraJa,
            ].filter(Boolean);
            const hasRodLemma = rodLemmas.some((r) => {
                if (!r) return false;
                if (noPunct.includes(r)) return true;
                const trunc = r.slice(0, -1);
                return trunc.length >= 3 && noPunct.includes(trunc);
            });
            if (hasRodLemma && /ありがとう|りがとう/u.test(noPunct)) {
                const rod = T.meatRodZh || T.rodZh;
                return rod ? `谢谢${rod}` : '谢谢';
            }

            if (T.onanieJa && T.onanieZh && noPunct.includes(T.onanieJa) && /じゃないです/u.test(noPunct)) {
                return `才不是${T.onanieZh}什么的`;
            }
            if (noPunct === '汁' || noPunct === 'しる') {
                return T.loveJuiceZh || null;
            }
        } catch { /* optional */ }
        return null;
    }

    function escapeRegExp(s) {
        return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * @param {string} sourceText
     * @returns {string|null}
     */
    function fillSpokenShortJaZh(sourceText) {
        const s = String(sourceText || '').trim();
        if (!s) return null;
        // Software-credit JA blanked to「…」— restore localized credit (length > short cap).
        try {
            const credit = require('./subtitle-software-credit-core');
            if (credit.isSoftwareCreditText?.(s)) {
                return credit.buildSoftwareCreditText({
                    isPro: /\bPro\b/i.test(s),
                    lang: 'zh',
                });
            }
        } catch { /* optional */ }
        if (textLen(s) > 36) return null;
        // Mid ellipsis → pause (ああ…あねちゃ → ああ、あねちゃ); keep lead-moan peel working.
        let noPunct = stripTrailPunct(s).replace(/[…·.•]+/g, '、');
        if (!noPunct || textLen(noPunct) > 34) return null;

        noPunct = expandAsrTruncStem(noPunct);

        const adult = matchAdultStem(noPunct);
        if (adult) return adult;

        const kin = matchKinshipTrunc(noPunct, s);
        if (kin) return kin;

        const redup = matchDiscourseRedup(noPunct, s);
        if (redup) return redup;

        const productive = matchProductivePolite(noPunct, s);
        if (productive) return productive;

        // ASR trunc 入っちゃ → はいちゃ (soft-AV entry beat)
        if (/^(?:入っ?|はい)ちゃ[うっ]*$/u.test(noPunct)) return '进去了';

        // まっ、へいと — hesitation + short name / call
        if (/^まっ[、,，]?\s*.{1,8}$/u.test(noPunct) && textLen(noPunct) <= 10) {
            const rest = noPunct.replace(/^まっ[、,，]?\s*/u, '');
            if (rest && textLen(rest) >= 2) return rest;
        }

        // Name + clipped ちゃん (咲貴ちゃ) — exclude はいちゃ handled above
        {
            const m = noPunct.match(/^([一-龥ぁ-んァ-ンーA-Za-z]{2,8})ちゃ$/u);
            if (m && !/^(?:はい|入っ?|あね|姉)$/u.test(m[1])) {
                return withEll(`${m[1]}酱`, s);
            }
        }

        const tryStem = (key) => {
            if (Object.prototype.hasOwnProperty.call(STEM_ZH, key)) {
                return withQ(withEll(STEM_ZH[key], s), s);
            }
            const loose = key.replace(/(?:です)?(?:よ|ね|な|わ|だ)?$/u, '');
            if (loose !== key && Object.prototype.hasOwnProperty.call(STEM_ZH, loose)) {
                return withQ(withEll(STEM_ZH[loose], s), s);
            }
            const dayo = key.replace(/(?:だよ|だね|だわ|ですよ|です)$/u, '');
            if (dayo !== key && Object.prototype.hasOwnProperty.call(STEM_ZH, dayo)) {
                return withQ(withEll(STEM_ZH[dayo], s), s);
            }
            return null;
        };

        let hit = tryStem(noPunct);
        if (hit) return hit;

        const stripped = stripLeadMoanDiscourse(noPunct);
        if (stripped && stripped !== noPunct) {
            hit = tryStem(stripTrailPunct(stripped));
            if (hit) return hit;
            noPunct = stripTrailPunct(stripped);
        }

        const chottoHit = matchChottoFamily(noPunct, s);
        if (chottoHit) return chottoHit;

        const desuHit = matchDesuDayoFamily(noPunct, s);
        if (desuHit) return desuHit;

        const qHit = matchQuestionFamily(noPunct, s);
        if (qHit) return qHit;

        const teHit = matchTeFamily(noPunct, s);
        if (teHit) return teHit;

        const naideHit = matchNaideFamily(noPunct, s);
        if (naideHit) return naideHit;

        const voc = matchVocativeChan(noPunct, s);
        if (voc) return voc;

        const dayoHit = matchDayoFamily(noPunct, s);
        if (dayoHit) return dayoHit;

        if (/^(?:へー+|へえー*)$/u.test(noPunct)) return withEll('诶', s);
        if (/^(?:ふーん+)$/u.test(noPunct)) return withEll('哦', s);

        return null;
    }

    return {
        fillSpokenShortJaZh,
        STEM_ZH,
    };
}));
