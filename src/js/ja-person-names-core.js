/**
 * Japanese given-name lexicon for MT sanitize / source justification.
 * kana/kanji → common ZH surfaces (fansub / Mandarin readings of the same kanji).
 * Sources: common JA given-name frequency lists + ZH fansub conventions
 * (e.g. 沪江「常见日文名字」、Wiktionary Appendix:Japanese given names).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubJaPersonNames = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function jaPersonNamesFactory() {
    /**
     * @typedef {{ kana: string[], kanji?: string[], zh: string[] }} JaNameEntry
     */

    /**
     * Core given-name map. Keep kana forms specific enough to avoid
     * false positives inside ordinary words (e.g. bare まい ⊂ うまい).
     * @type {JaNameEntry[]}
     */
    const JA_GIVEN_NAME_ENTRIES = Object.freeze([
        // —— Female / unisex (high frequency + AV/LN hallucination targets) ——
        { kana: ['まい'], kanji: ['舞', '麻衣', '真衣'], zh: ['舞', '麻衣', '真衣'], ambiguousKana: true },
        { kana: ['マイ'], kanji: ['舞', '麻衣'], zh: ['舞', '麻衣'] },
        { kana: ['あい', 'アイ'], kanji: ['愛', '亜依'], zh: ['爱', '爱酱'], ambiguousKana: true },
        { kana: ['あいか', 'アイカ'], kanji: ['愛香', '愛花', '藍香'], zh: ['爱香', '爱花', '蓝香'] },
        { kana: ['あいり', 'アイリ'], kanji: ['愛理', '愛梨', '愛莉'], zh: ['爱理', '爱梨', '爱莉'] },
        { kana: ['あおい', 'アオイ'], kanji: ['葵', '碧'], zh: ['葵', '碧'] },
        { kana: ['あかり', 'アカリ'], kanji: ['明里', '灯', '朱里'], zh: ['明里', '灯', '朱里'] },
        { kana: ['あき', 'アキ'], kanji: ['秋', '亜希'], zh: ['秋', '亚希'] },
        { kana: ['あきこ', 'アキコ'], kanji: ['明子', '秋子'], zh: ['明子', '秋子'] },
        { kana: ['あさみ', 'アサミ'], kanji: ['麻美', '朝美', '亜佐美'], zh: ['麻美', '朝美', '亚佐美'] },
        { kana: ['あすか', 'アスカ'], kanji: ['飛鳥', '明日香'], zh: ['飞鸟', '明日香', '阿斯卡'] },
        { kana: ['あや', 'アヤ'], kanji: ['彩', '綾', '亜矢'], zh: ['彩', '绫', '亚矢'], ambiguousKana: true },
        { kana: ['あやか', 'アヤカ'], kanji: ['彩花', '綾香', '絢香'], zh: ['彩花', '绫香', '绚香'] },
        { kana: ['あやこ', 'アヤコ'], kanji: ['彩子', '綾子'], zh: ['彩子', '绫子'] },
        { kana: ['あゆみ', 'アユミ'], kanji: ['歩', '歩美', '亜由美'], zh: ['步', '步美', '亚由美'] },
        { kana: ['あん', 'アン'], kanji: ['杏'], zh: ['杏'] },
        { kana: ['あんな', 'アンナ'], kanji: ['杏奈', '安奈'], zh: ['杏奈', '安奈', '安娜'] },

        { kana: ['えみ', 'エミ'], kanji: ['絵美', '恵美', '笑'], zh: ['绘美', '惠美', '笑'] },
        { kana: ['えみこ', 'エミコ'], kanji: ['恵美子', '絵美子'], zh: ['惠美子', '绘美子'] },
        { kana: ['えり', 'エリ'], kanji: ['絵里', '恵理', '英里'], zh: ['绘里', '惠理', '英里'] },
        { kana: ['えりか', 'エリカ'], kanji: ['絵里香', '恵梨香', '江梨花'], zh: ['绘里香', '惠梨香', '江梨花', '艾丽卡'] },
        { kana: ['えりな', 'エリナ'], kanji: ['絵里奈', '恵里奈'], zh: ['绘里奈', '惠里奈'] },

        { kana: ['かおり', 'カオリ'], kanji: ['香織', '香', '薫'], zh: ['香织', '香', '薰'] },
        // Stage/surname 香水 + given じゅん（純）— person name, never the noun「perfume」
        { kana: ['こうすい', 'コウスイ'], kanji: ['香水'], zh: ['香水纯', '香水'] },
        { kana: ['じゅん', 'ジュン'], kanji: ['純', '淳', '潤'], zh: ['纯', '淳', '润'], ambiguousKana: true },
        { kana: ['かおる', 'カオル'], kanji: ['薫', '馨', '香'], zh: ['薰', '馨', '香'] },
        { kana: ['かすみ', 'カスミ'], kanji: ['霞', '香澄'], zh: ['霞', '香澄'] },
        { kana: ['かな', 'カナ'], kanji: ['佳奈', '加奈', '香奈', '香菜', '夏奈'], zh: ['佳奈', '加奈', '香奈', '香菜', '夏奈'], ambiguousKana: true },
        { kana: ['かなこ', 'カナコ'], kanji: ['佳奈子', '加奈子'], zh: ['佳奈子', '加奈子'] },
        { kana: ['かのん', 'カノン'], kanji: ['花音', '嘉音', '楓音'], zh: ['花音', '嘉音', '枫音'] },
        { kana: ['かんな', 'カンナ'], kanji: ['環奈', '神奈', '神菜'], zh: ['环奈', '神奈', '神菜'] },
        { kana: ['かれん', 'カレン'], kanji: ['華恋', '可憐'], zh: ['华恋', '可怜', '凯伦'] },

        { kana: ['きょうこ', 'キョウコ'], kanji: ['京子', '今日子', '恭子'], zh: ['京子', '今日子', '恭子'] },
        { kana: ['きら', 'キラ'], kanji: ['綺羅', '煌'], zh: ['绮罗', '煌'] },
        { kana: ['けいこ', 'ケイコ'], kanji: ['恵子', '慶子', '圭子'], zh: ['惠子', '庆子', '圭子'] },

        { kana: ['さくら', 'サクラ'], kanji: ['桜', '櫻', '咲良'], zh: ['樱', '樱花', '咲良'] },
        { kana: ['さき', 'サキ'], kanji: ['咲', '早紀', '沙希'], zh: ['咲', '早纪', '沙希'] },
        { kana: ['さつき', 'サツキ'], kanji: ['皐月', '早月', '咲月'], zh: ['皐月', '沙月', '早月'] },
        { kana: ['さちこ', 'サチコ'], kanji: ['幸子'], zh: ['幸子'] },
        { kana: ['さとみ', 'サトミ'], kanji: ['里美', '聡美', '智美'], zh: ['里美', '聪美', '智美'] },
        { kana: ['さな', 'サナ'], kanji: ['紗奈', '沙奈', '咲奈'], zh: ['纱奈', '沙奈', '咲奈'] },
        { kana: ['さやか', 'サヤカ'], kanji: ['沙耶香', '彩花', '清花'], zh: ['沙耶香', '彩花', '清花'] },
        { kana: ['しおり', 'シオリ'], kanji: ['栞', '詩織'], zh: ['栞', '诗织'] },
        { kana: ['すず', 'スズ'], kanji: ['鈴'], zh: ['铃'] },
        { kana: ['すずね', 'スズネ'], kanji: ['鈴音'], zh: ['铃音'] },

        { kana: ['ちあき', 'チアキ'], kanji: ['千秋', '千明'], zh: ['千秋', '千明'] },
        { kana: ['ちか', 'チカ'], kanji: ['千夏', '智香'], zh: ['千夏', '智香'] },
        { kana: ['ちひろ', 'チヒロ'], kanji: ['千尋', '千紘'], zh: ['千寻', '千纮'] },

        { kana: ['つかさ', 'ツカサ'], kanji: ['司', 'つかさ'], zh: ['司'] },
        { kana: ['つばさ', 'ツバサ'], kanji: ['翼'], zh: ['翼'] },
        { kana: ['ともこ', 'トモコ'], kanji: ['智子', '朋子', '知子'], zh: ['智子', '朋子', '知子'] },
        { kana: ['ともみ', 'トモミ'], kanji: ['智美', '朋美'], zh: ['智美', '朋美'] },

        { kana: ['なな', 'ナナ'], kanji: ['奈々', '菜々', '七'], zh: ['奈奈', '菜菜', '七'], ambiguousKana: true },
        { kana: ['ななみ', 'ナナミ'], kanji: ['七海', '菜々美'], zh: ['七海', '菜菜美'] },
        { kana: ['なお', 'ナオ'], kanji: ['奈緒', '直', '尚'], zh: ['奈绪', '直', '尚'] },
        { kana: ['なおこ', 'ナオコ'], kanji: ['直子', '尚子'], zh: ['直子', '尚子'] },
        { kana: ['なつき', 'ナツキ'], kanji: ['夏希', '菜月'], zh: ['夏希', '菜月'] },
        { kana: ['なつみ', 'ナツミ'], kanji: ['夏美', '菜摘'], zh: ['夏美', '菜摘'] },
        { kana: ['にこ', 'ニコ', 'ニコる'], kanji: ['仁子'], zh: ['妮可', '尼可', '仁子'] },
        { kana: ['のあ', 'ノア'], kanji: ['乃愛', '希空'], zh: ['乃爱', '希空', '诺亚'] },
        { kana: ['のぞみ', 'ノゾミ'], kanji: ['望', '希'], zh: ['望', '希'] },
        { kana: ['のりこ', 'ノリコ'], kanji: ['紀子', '典子', '法子'], zh: ['纪子', '典子', '法子'] },

        { kana: ['はな', 'ハナ'], kanji: ['花', '華'], zh: ['花', '华', '花奈', '花菜'], ambiguousKana: true },
        { kana: ['はなこ', 'ハナコ'], kanji: ['花子'], zh: ['花子'] },
        { kana: ['はるか', 'ハルカ'], kanji: ['遥', '春香', '晴香', '遥香'], zh: ['遥', '春香', '晴香', '遥香'] },
        { kana: ['はるな', 'ハルナ'], kanji: ['陽菜', '春奈', '春菜', '遥奈'], zh: ['阳菜', '春奈', '春菜', '遥奈'] },
        { kana: ['ひかり', 'ヒカリ'], kanji: ['光', '輝'], zh: ['光', '辉'] },
        { kana: ['ひなた', 'ヒナタ'], kanji: ['日向', '陽向'], zh: ['日向', '阳向'] },
        { kana: ['ひなこ', 'ヒナコ'], kanji: ['日奈子', '雛子'], zh: ['日奈子', '雏子'] },
        { kana: ['ひとみ', 'ヒトミ'], kanji: ['瞳', '仁美'], zh: ['瞳', '仁美'] },
        { kana: ['ひろこ', 'ヒロコ'], kanji: ['浩子', '裕子', '博子'], zh: ['浩子', '裕子', '博子'] },
        { kana: ['ほのか', 'ホノカ'], kanji: ['穂香', '仄か'], zh: ['穗香', 'ほのか'] },

        { kana: ['まき', 'マキ'], kanji: ['真希', '真紀', '茉希'], zh: ['真希', '真纪', '茉希'] },
        { kana: ['まみ', 'マミ'], kanji: ['麻美', '真美'], zh: ['麻美', '真美'] },
        { kana: ['まゆ', 'マユ'], kanji: ['麻友', '真由', '茉友'], zh: ['麻友', '真由', '茉友'] },
        { kana: ['まゆみ', 'マユミ'], kanji: ['真由美', '麻由美'], zh: ['真由美', '麻由美'] },
        { kana: ['まり', 'マリ'], kanji: ['真理', '麻里', '鞠'], zh: ['真理', '麻里', '鞠'] },
        { kana: ['まりあ', 'マリア'], kanji: ['真莉亜', '麻里亜'], zh: ['玛丽亚', '真莉亚'] },
        { kana: ['まりこ', 'マリコ'], kanji: ['真理子', '麻里子', '鞠子'], zh: ['真理子', '麻里子', '鞠子'] },
        { kana: ['みお', 'ミオ'], kanji: ['美緒', '澪'], zh: ['美绪', '澪'] },
        { kana: ['みく', 'ミク'], kanji: ['美久', '未来'], zh: ['美久', '未来'] },
        { kana: ['みさき', 'ミサキ'], kanji: ['美咲', '実咲'], zh: ['美咲', '实咲'] },
        { kana: ['みつき', 'ミツキ'], kanji: ['美月', '光希'], zh: ['美月', '光希'] },
        { kana: ['みどり', 'ミドリ'], kanji: ['緑'], zh: ['绿', '绿子'] },
        { kana: ['みなみ', 'ミナミ'], kanji: ['南', '美波'], zh: ['南', '美波'] },
        { kana: ['みゆ', 'ミユ'], kanji: ['美優', '美結'], zh: ['美优', '美结'] },
        { kana: ['みゆき', 'ミユキ'], kanji: ['美幸', '深雪', '美雪'], zh: ['美幸', '深雪', '美雪'] },
        { kana: ['みらい', 'ミライ'], kanji: ['未来'], zh: ['未来'] },
        { kana: ['めぐみ', 'メグミ'], kanji: ['恵', '惠'], zh: ['惠', '惠美'] },
        { kana: ['もえ', 'モエ'], kanji: ['萌', '萌え'], zh: ['萌'] },
        { kana: ['ももこ', 'モモコ'], kanji: ['桃子', '百子'], zh: ['桃子', '百子'] },
        { kana: ['ももか', 'モモカ'], kanji: ['桃花', '百花'], zh: ['桃花', '百花'] },

        { kana: ['ゆい', 'ユイ'], kanji: ['結衣', '唯', '由衣', '優衣'], zh: ['结衣', '唯', '由衣', '优衣'], ambiguousKana: true },
        { kana: ['ゆいな', 'ユイナ'], kanji: ['結菜', '優奈', '友菜'], zh: ['结菜', '优奈', '友菜'] },
        { kana: ['ゆか', 'ユカ'], kanji: ['由香', '優香', '夕夏'], zh: ['由香', '优香', '夕夏'] },
        { kana: ['ゆかり', 'ユカリ'], kanji: ['由香里', '縁'], zh: ['由香里', '缘'] },
        { kana: ['ゆき', 'ユキ'], kanji: ['雪', '幸', '由紀'], zh: ['雪', '幸', '由纪'], ambiguousKana: true },
        { kana: ['ゆきこ', 'ユキコ'], kanji: ['雪子', '幸子', '由紀子'], zh: ['雪子', '幸子', '由纪子'] },
        { kana: ['ゆな', 'ユナ'], kanji: ['優奈', '柚奈', '結奈'], zh: ['优奈', '柚奈', '结奈'] },
        { kana: ['ゆめ', 'ユメ'], kanji: ['夢'], zh: ['梦'] },
        { kana: ['ゆり', 'ユリ'], kanji: ['百合', '由里'], zh: ['百合', '由里'] },
        { kana: ['ようこ', 'ヨウコ'], kanji: ['陽子', '洋子', '葉子'], zh: ['阳子', '洋子', '叶子'] },

        { kana: ['らん', 'ラン'], kanji: ['蘭', '藍'], zh: ['兰', '蓝'] },
        { kana: ['りお', 'リオ'], kanji: ['理緒', '凛緒', '莉緒'], zh: ['理绪', '凛绪', '莉绪'] },
        { kana: ['りこ', 'リコ'], kanji: ['理子', '莉子', '里子'], zh: ['理子', '莉子', '里子'] },
        { kana: ['りさ', 'リサ'], kanji: ['理沙', '梨沙', '里沙'], zh: ['理沙', '梨沙', '里沙'] },
        { kana: ['りな', 'リナ'], kanji: ['里奈', '莉奈', '梨奈', '莉那'], zh: ['里奈', '莉奈', '梨奈', '莉那'] },
        { kana: ['れい', 'レイ'], kanji: ['玲', '麗', '伶'], zh: ['玲', '丽', '伶'], ambiguousKana: true },
        { kana: ['れいな', 'レイナ'], kanji: ['玲奈', '麗奈', '伶奈'], zh: ['玲奈', '丽奈', '伶奈'] },
        { kana: ['れな', 'レナ'], kanji: ['玲奈', '麗奈', '伶奈'], zh: ['玲奈', '丽奈', '伶奈'] },
        { kana: ['りん', 'リン'], kanji: ['凛', '凜', '琳'], zh: ['凛', '琳'], ambiguousKana: true },
        { kana: ['るな', 'ルナ'], kanji: ['月', '瑠奈', '琉奈'], zh: ['露娜', '瑠奈', '琉奈', '月'] },
        { kana: ['るり', 'ルリ'], kanji: ['瑠璃', '琉璃'], zh: ['瑠璃', '琉璃'] },

        // —— Male ——
        { kana: ['あきら', 'アキラ'], kanji: ['明', '晃', '彰'], zh: ['明', '晃', '彰'] },
        { kana: ['あつし', 'アツシ'], kanji: ['篤', '淳', '厚'], zh: ['笃', '淳', '厚'] },
        { kana: ['かずき', 'カズキ'], kanji: ['一輝', '和希', '一樹'], zh: ['一辉', '和希', '一树'] },
        { kana: ['けんた', 'ケンタ'], kanji: ['健太', '賢太'], zh: ['健太', '贤太'] },
        { kana: ['けんじ', 'ケンジ'], kanji: ['健二', '賢治', '研二'], zh: ['健二', '贤治', '研二'] },
        { kana: ['こうき', 'コウキ'], kanji: ['光希', '幸輝', '航輝'], zh: ['光希', '幸辉', '航辉'] },
        { kana: ['こうじ', 'コウジ'], kanji: ['浩二', '幸二', '剛志'], zh: ['浩二', '幸二', '刚志'] },
        { kana: ['しょうた', 'ショウタ'], kanji: ['翔太', '章太'], zh: ['翔太', '章太', '奏翔'] },
        { kana: ['しんじ', 'シンジ'], kanji: ['真司', '慎二'], zh: ['真司', '慎二'] },
        { kana: ['たかし', 'タカシ'], kanji: ['隆', '孝', '貴'], zh: ['隆', '孝', '贵'] },
        { kana: ['たけし', 'タケシ'], kanji: ['武', '毅', '猛'], zh: ['武', '毅', '猛'] },
        { kana: ['たろう', 'タロウ'], kanji: ['太郎'], zh: ['太郎'] },
        { kana: ['だいき', 'ダイキ'], kanji: ['大輝', '大樹', '大希'], zh: ['大辉', '大树', '大希'] },
        { kana: ['つよし', 'ツヨシ'], kanji: ['剛', '毅'], zh: ['刚', '毅'] },
        { kana: ['ひろし', 'ヒロシ'], kanji: ['浩', '博', '弘'], zh: ['浩', '博', '弘'] },
        { kana: ['ひろと', 'ヒロト'], kanji: ['陽翔', '大翔', '紘人'], zh: ['阳翔', '大翔', '纮人'] },
        { kana: ['まこと', 'マコト'], kanji: ['誠', '真', '信'], zh: ['诚', '真', '信'] },
        { kana: ['まさと', 'マサト'], kanji: ['正人', '真人', '雅人'], zh: ['正人', '真人', '雅人'] },
        { kana: ['ゆうき', 'ユウキ'], kanji: ['勇気', '悠希', '優希', '結城'], zh: ['勇气', '悠希', '优希', '结城'] },
        { kana: ['ゆうた', 'ユウタ'], kanji: ['悠太', '雄太', '優太'], zh: ['悠太', '雄太', '优太'] },
        { kana: ['りく', 'リク'], kanji: ['陸', '璃空'], zh: ['陆', '璃空'] },
        { kana: ['りゅう', 'リュウ'], kanji: ['龍', '竜', '琉'], zh: ['龙', '琉'] },
        { kana: ['りょう', 'リョウ'], kanji: ['涼', '亮', '凌'], zh: ['凉', '亮', '凌'] },
        { kana: ['りょうた', 'リョウタ'], kanji: ['涼太', '亮太'], zh: ['凉太', '亮太'] },

        // —— Katakana western / nickname forms often in JA AV ASR ——
        { kana: ['トミー', 'トミ'], zh: ['汤米', '托米', 'tommy', 'Tommy'] },
        { kana: ['ジャック'], zh: ['杰克', 'Jack'] },
        { kana: ['マイク'], zh: ['麦克', 'Mike'] },
        { kana: ['ケン'], zh: ['肯', 'Ken'] },
        { kana: ['ジョー'], zh: ['乔', 'Joe'] },
        { kana: ['キャプテン'], zh: ['队长', '船长'] },
    ]);

    /**
     * Extra ZH stems frequently invented by Sakura/LN models with no JA source.
     * (Not always tied to a single kana reading.)
     */
    const EXTRA_POLLUTION_STEMS = Object.freeze([
        '斗碧', '绘真', '爱奈', '奏翔', '妮可', '绮罗', '露娜',
        '乃爱', '理绪', '莉奈', '纱奈', '沙奈', '玲奈', '佳奈',
        '真理', '美咲', '结衣', '阳菜', '春奈', '桃子', '环奈',
        '明日香', '飞鸟', '花音', '惠梨香', '绘里', '理子', '莉子',
        '麻衣', '真希', '七海', '奈奈', '铃音', '日奈子', '穗香',
        '仓木', '北野', '喜多野',
        // Whisper AV filler often misheard as these stems
        '琴音', '黄奈', '雏子', '真寻', '圣音',
        // Single-char / short cast tags often glued to cue ends
        '月', '琉', '律', '春', '桃', '玲', '陆', '舞', '花', '葵', '樱', '凛',
        '蓝', '兰', '翼', '光', '望', '萌', '杏', '铃', '雪', '梦',
    ]);

    /**
     * Extra tokens Whisper loops in JA ASR (not always ZH pollution stems).
     * Consecutive ≥2 runs are stripped before MT / justify checks.
     */
    const ASR_LOOP_EXTRA_TOKENS = Object.freeze([
        '嬉', '笑', '爱', '愛', '盐', '塩', '鸭', '鴨',
    ]);

    /** Family-name stems (ZH) sometimes hallucinated as trailing tags. */
    const EXTRA_SURNAME_POLLUTION = Object.freeze([
        '佐藤', '铃木', '高桥', '田中', '伊藤', '渡边', '山本', '中村',
        '小林', '加藤', '吉田', '山田', '佐佐木', '松本', '井上', '木村',
        '林', '清水', '山口', '阿部', '森', '池田', '桥本', '石川',
        '前田', '藤田', '小川', '冈田', '后藤', '长谷川', '石井', '村上',
        '近藤', '坂本', '远藤', '青木', '藤原', '西村', '福田', '太田',
        '三浦', '冈本', '松田', '中岛', '原田', '小野', '田村', '竹内',
        '金子', '中川', '中野', '原', '松井', '岩崎', '横山', '上田',
    ]);

    function escapeRegExp(text) {
        return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /** Hiragana forms that are also particles / common word pieces (かな＝「…かな？」). */
    function isAmbiguousHiraganaForm(form, entry) {
        const f = String(form || '').trim();
        if (!/^[ぁ-ん]+$/.test(f)) return false;
        if (entry?.ambiguousKana) return true;
        // Ultra-short hiragana given names are almost always ambiguous in ASR text
        if (f.length <= 2) return true;
        return false;
    }

    /**
     * Build a JA source matcher that avoids embedding false positives.
     * Ambiguous hiragana (かな/まい…) ONLY match with honorifics — never bare.
     * @param {string} form
     * @param {{ ambiguous?: boolean }} [opts]
     * @returns {RegExp|null}
     */
    function buildJaFormRegex(form, opts = {}) {
        const f = String(form || '').trim();
        if (!f) return null;
        const esc = escapeRegExp(f);
        const after = '(?=$|[^ぁ-ん]|[がをにはもやかのとてでへっ、。！？!?])';
        if (/^[ぁ-ん]+$/.test(f)) {
            if (opts.ambiguous) {
                // 「かなさん」OK；「大丈夫かなと」MUST NOT match
                return new RegExp(`(?:^|[^ぁ-ん])${esc}(?:さん|ちゃん|くん|君|様)`);
            }
            return new RegExp(`(?:^|[^ぁ-ん])${esc}(?:さん|ちゃん|くん|君|様)?${after}`);
        }
        if (/^[ァ-ヶー]+$/.test(f)) {
            // Allow reduplication (マイマイ) and trailing prolonged marks (トミーー)
            // but not prefixes (マイ⊂マイク)
            return new RegExp(
                `(?:^|[^ァ-ヶー])(?:${esc})+ー*(?:さん|ちゃん|くん|君|様)?(?=$|[^ァ-ヶーー]|[、。！？!?\\s])`,
            );
        }
        return new RegExp(esc);
    }

    /**
     * @returns {{ ja: RegExp, zh: string[], ambiguous?: boolean }[]}
     */
    function buildSourceNameHints(entries = JA_GIVEN_NAME_ENTRIES) {
        /** @type {{ ja: RegExp, zh: string[], ambiguous?: boolean }[]} */
        const out = [];
        for (const entry of entries) {
            const zh = [...new Set((entry.zh || []).map((z) => String(z || '').trim()).filter(Boolean))];
            if (!zh.length) continue;
            const forms = [
                ...(entry.kana || []),
                ...(entry.kanji || []),
            ].map((x) => String(x || '').trim()).filter(Boolean);
            for (const form of forms) {
                const ambiguous = isAmbiguousHiraganaForm(form, entry);
                // Skip bare ambiguous hiragana from hints — honorific regex covers them
                if (ambiguous && /^[ぁ-ん]+$/.test(form)) {
                    const re = buildJaFormRegex(form, { ambiguous: true });
                    if (re) out.push({ ja: re, zh, ambiguous: true });
                    continue;
                }
                const re = buildJaFormRegex(form, { ambiguous: false });
                if (!re) continue;
                out.push({ ja: re, zh, ambiguous: false });
            }
        }
        // Full stage names (surname + given) that bare honorific stems under-specify
        out.push({
            ja: /香水(?:じゅん|ジュン|純|纯)?(?:さん|ちゃん|くん)?/,
            zh: ['香水纯', '香水', '香水小姐'],
        });
        return out;
    }

    /**
     * @returns {Set<string>}
     */
    function buildPollutionNameStems(entries = JA_GIVEN_NAME_ENTRIES) {
        const set = new Set();
        for (const entry of entries) {
            for (const z of entry.zh || []) {
                const s = String(z || '').trim();
                if (s && !/^[A-Za-z]/.test(s)) set.add(s);
            }
            for (const k of entry.kanji || []) {
                const s = String(k || '').trim()
                    .replace(/桜/g, '樱')
                    .replace(/紀/g, '纪')
                    .replace(/絵/g, '绘')
                    .replace(/恵/g, '惠')
                    .replace(/綾/g, '绫')
                    .replace(/優/g, '优')
                    .replace(/麗/g, '丽')
                    .replace(/環/g, '环')
                    .replace(/楓/g, '枫')
                    .replace(/穂/g, '穗')
                    .replace(/歩/g, '步')
                    .replace(/輝/g, '辉')
                    .replace(/樹/g, '树')
                    .replace(/剛/g, '刚')
                    .replace(/涼/g, '凉')
                    .replace(/龍/g, '龙')
                    .replace(/緑/g, '绿')
                    .replace(/眞/g, '真');
                if (s) set.add(s);
            }
        }
        for (const s of EXTRA_POLLUTION_STEMS) set.add(s);
        for (const s of EXTRA_SURNAME_POLLUTION) set.add(s);
        return set;
    }

    /**
     * @returns {{
     *   kana: Set<string>,
     *   kanji: Set<string>,
     *   ambiguousKana: Set<string>,
     *   byKana: Map<string, string[]>,
     *   entryByKana: Map<string, object>
     * }}
     */
    function buildLexiconIndex(entries = JA_GIVEN_NAME_ENTRIES) {
        const kana = new Set();
        const kanji = new Set();
        const ambiguousKana = new Set();
        /** @type {Map<string, string[]>} */
        const byKana = new Map();
        /** @type {Map<string, object>} */
        const entryByKana = new Map();
        for (const entry of entries) {
            const zh = (entry.zh || []).map((z) => String(z || '').trim()).filter(Boolean);
            for (const k of entry.kana || []) {
                const s = String(k || '').trim();
                if (!s) continue;
                kana.add(s);
                entryByKana.set(s, entry);
                if (isAmbiguousHiraganaForm(s, entry)) ambiguousKana.add(s);
                if (!byKana.has(s)) byKana.set(s, []);
                byKana.get(s).push(...zh);
            }
            for (const k of entry.kanji || []) {
                const s = String(k || '').trim();
                if (s) kanji.add(s);
            }
        }
        return { kana, kanji, ambiguousKana, byKana, entryByKana };
    }

    const SOURCE_NAME_HINTS = Object.freeze(buildSourceNameHints());
    const POLLUTION_NAME_STEMS = buildPollutionNameStems();
    const LEXICON = buildLexiconIndex();

    /** Honorific-attached person mentions: short stem (1–4) immediately before さん. */
    const JA_PERSON_HONORIFIC_RE = /([一-龯ぁ-んァ-ンー]{1,4})(さん|くん|ちゃん|君|様|氏)/g;
    const JA_STEM_LEAD_JUNK_RE = /^[とのにへがをはもや、。\s　]+/;
    const JA_INTRO_COPULA = '(?:です|だよ|だね|だわ|だぞ|といいます|と言います|っていうの|って言います)';
    const JA_INTRO_SEP = '(?:^|[はがをにとのもやへ、。！？!?\\s　「『(\\[])';

    /**
     * Reject verb chunks wrongly attached before さん (勤めている香水 → keep 香水).
     * @param {string} stem
     * @returns {boolean}
     */
    function isPlausibleHonorificStem(stem) {
        const s = String(stem || '').trim().replace(JA_STEM_LEAD_JUNK_RE, '');
        if (!s) return false;
        const len = Array.from(s).length;
        if (len < 1 || len > 4) return false;
        if (/^[とのにへがをはもや]+$/.test(s)) return false;
        if (/(?:て(?:い)?る|てた|ました|ます|です|した|して|ある|ない|れる|せる|いる)$/.test(s)) {
            return false;
        }
        if (/ている|てる|ました|ます|です/.test(s)) return false;
        return true;
    }

    function isPlausibleIntroStem(stem) {
        const s = String(stem || '').trim();
        if (!s || s.length < 2) return false;
        if (/[んの]$/.test(s)) return false;
        // Mid-sentence particles mean we grabbed too much (私はかな)
        if (/[はがをにとのもやへ]/.test(s)) return false;
        if (LEXICON.kana.has(s) || LEXICON.kanji.has(s)) return true;
        if (/^[ァ-ヶー]{2,10}$/.test(s)) return true;
        if (/^[一-龯]{2,4}$/.test(s)) return true;
        return false;
    }

    /**
     * Extract JA person-like stems from source text (honorific + lexicon + intro).
     * @param {string} text
     * @returns {{ stem: string, honorific: string, full: string, via: string }[]}
     */
    function extractJaPersonRefs(text) {
        const raw = String(text || '');
        const out = [];
        const seen = new Set();

        function refineHonorificStem(stem) {
            let s = String(stem || '').trim().replace(JA_STEM_LEAD_JUNK_RE, '');
            if (!s) return '';
            // 勤めている香水 / いる香水 → 香水（取敬称前的汉字尾）
            const kanjiTail = s.match(/([一-龯]{1,4})$/);
            if (kanjiTail) {
                const head = s.slice(0, s.length - kanjiTail[1].length);
                if (head && /[ぁ-んァ-ンー]/.test(head)) {
                    return kanjiTail[1];
                }
            }
            // やってるリコ → リコ
            const kataTail = s.match(/([ァ-ヶー]{2,4})$/);
            if (kataTail) {
                const head = s.slice(0, s.length - kataTail[1].length);
                if (head && /[ぁ-ん一-龯]/.test(head)) {
                    return kataTail[1];
                }
            }
            return s;
        }

        function push(stem, honorific, full, via) {
            let s = String(stem || '').trim().replace(JA_STEM_LEAD_JUNK_RE, '');
            if (via === 'honorific') s = refineHonorificStem(s);
            if (!s || Array.from(s).length < 1) return;
            if (/^[とのにへがをはもや]+$/.test(s)) return;
            if (via === 'honorific' && !isPlausibleHonorificStem(s)) return;
            const key = `${s}\0${honorific || ''}\0${via}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ stem: s, honorific: honorific || '', full: full || s, via });
        }

        JA_PERSON_HONORIFIC_RE.lastIndex = 0;
        let m = JA_PERSON_HONORIFIC_RE.exec(raw);
        while (m) {
            push(m[1], m[2], m[0], 'honorific');
            m = JA_PERSON_HONORIFIC_RE.exec(raw);
        }

        // Self-intro: only lexicon / katakana / short kanji immediately before です
        // (avoids「動かないんです」and over-long「私はかなです」)
        const introForms = new Set([
            ...LEXICON.kana,
            ...LEXICON.kanji,
        ]);
        for (const form of introForms) {
            const f = String(form || '').trim();
            if (!f || !isPlausibleIntroStem(f)) continue;
            const re = new RegExp(`${JA_INTRO_SEP}${escapeRegExp(f)}${JA_INTRO_COPULA}`);
            if (re.test(raw)) {
                push(f, '', f, 'intro');
            }
        }
        // Free katakana self-intro not in lexicon (e.g. リコです)
        const kataIntro = new RegExp(`${JA_INTRO_SEP}([ァ-ヶー]{2,10})${JA_INTRO_COPULA}`, 'g');
        m = kataIntro.exec(raw);
        while (m) {
            push(m[1], '', m[0], 'intro');
            m = kataIntro.exec(raw);
        }

        // Lexicon hits — skip bare ambiguous hiragana (かな/まい…)
        for (const form of LEXICON.kana) {
            const ambiguous = LEXICON.ambiguousKana.has(form);
            const re = buildJaFormRegex(form, { ambiguous });
            if (re && re.test(raw)) {
                push(form, '', form, 'lexicon');
            }
        }
        for (const form of LEXICON.kanji) {
            if (raw.includes(form)) {
                push(form, '', form, 'lexicon');
            }
        }

        return out;
    }

    /**
     * Strip Whisper-style consecutive name/filler loops from JA (or ZH) cue text.
     * e.g. 玲奈玲奈玲奈 → '' ; あ葵葵葵葵 → あ ; 美咲さん stays.
     * @param {string} text
     * @returns {{ text: string, changed: boolean, stripped: string[] }}
     */
    function stripAsrHallucinationLoops(text) {
        const raw = String(text ?? '');
        let cur = raw;
        const stripped = [];
        const tokens = new Set([
            ...POLLUTION_NAME_STEMS,
            ...ASR_LOOP_EXTRA_TOKENS,
        ]);
        const list = [...tokens]
            .map((t) => String(t || '').trim())
            .filter((t) => t && Array.from(t).length <= 4)
            .sort((a, b) => Array.from(b).length - Array.from(a).length || b.localeCompare(a, 'zh-CN'));

        for (const tok of list) {
            const esc = escapeRegExp(tok);
            // Consecutive ≥2 (玲奈玲奈 / 葵葵葵)
            const reConsec = new RegExp(`(?:${esc}){2,}`, 'g');
            if (reConsec.test(cur)) {
                stripped.push(tok);
                cur = cur.replace(reConsec, '');
            }
            // tok…tok / tok...tok (ellipsis-separated loops)
            const reEllipsis = new RegExp(
                `(?:${esc})(?:\\s*[…⋅・.。]{1,6}\\s*(?:${esc}))+`,
                'g',
            );
            if (reEllipsis.test(cur)) {
                if (!stripped.includes(tok)) stripped.push(tok);
                cur = cur.replace(reEllipsis, '');
            }
        }

        cur = cur
            .replace(/[^\S\n]{2,}/g, ' ')
            .replace(/^[^\S\n]+|[^\S\n]+$/g, '')
            .trim();
        // Only collapse punctuation-only leftovers after we actually stripped loops
        if (stripped.length) {
            cur = cur
                .replace(/^[…⋅・.。～〜ー\s-]+|[…⋅・.。～〜ー\s-]+$/g, '')
                .trim();
            if (/^[…⋅・.\s。！？!?～〜ー\-'"]*$/.test(cur)) cur = '';
        }

        // Whole-cue pollution name with no honorific (玲奈 / 玲奈…) → drop
        if (isNameOnlyDebris(cur) && !/(さん|くん|ちゃん|君|様|氏)/.test(raw)) {
            if (!stripped.includes(cur.replace(/[…⋅・.。！？!?\s～〜\-ー'"]+/g, ''))) {
                stripped.push(cur.replace(/[…⋅・.。！？!?\s～〜\-ー'"]+/g, '') || 'name_only');
            }
            cur = '';
        }

        return { text: cur, changed: cur !== raw.trim(), stripped };
    }

    /**
     * @param {Array<{text?: string}>} cues
     * @returns {{ cues: object[], changed: number }}
     */
    function stripAsrHallucinationLoopsInCues(cues) {
        const list = Array.isArray(cues) ? cues : [];
        let changed = 0;
        const out = list.map((c) => {
            const result = stripAsrHallucinationLoops(c?.text);
            if (!result.changed) return c;
            changed += 1;
            return { ...c, text: result.text };
        });
        return { cues: out, changed };
    }

    /**
     * Strong evidence only: literal ZH/kanji (after stripping ASR loops), honorific, or katakana.
     * Bare `玲奈玲奈` loops must NOT justify translating 玲奈.
     * @param {string} token
     * @param {string} sourceText
     * @returns {boolean}
     */
    /** Normalize common JP/TW variants so 倉木 ≈ 仓木 for justify checks. */
    function normalizePersonStem(text) {
        return String(text || '')
            .replace(/倉/g, '仓')
            .replace(/黒/g, '黑')
            .replace(/桜/g, '樱')
            .replace(/実/g, '实')
            .replace(/国/g, '国')
            .replace(/絵/g, '绘')
            .replace(/恵/g, '惠');
    }

    function stemsMatch(a, b) {
        const x = normalizePersonStem(a);
        const y = normalizePersonStem(b);
        return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
    }

    function isNameOnlyDebris(text) {
        const bare = String(text || '')
            .trim()
            .replace(/[…⋅・.。！？!?？\s～〜\-ー'"]+/g, '');
        if (!bare || Array.from(bare).length > 4) return false;
        return POLLUTION_NAME_STEMS.has(bare);
    }

    function sourceStronglyJustifiesZhName(token, sourceText, options = {}) {
        const stem = String(token || '').trim()
            .replace(/(?:同学|小姐|先生|桑|君|酱|大人|老师)$/, '');
        if (!stem) return false;

        // Drop Whisper name-loops first — loops must not justify via includes / lexicon / hints
        const src = options.loopStrippedSource != null
            ? String(options.loopStrippedSource)
            : stripAsrHallucinationLoops(sourceText).text;
        const srcN = normalizePersonStem(src);
        const stemN = normalizePersonStem(stem);
        const tokenN = normalizePersonStem(token);

        // Whole-cue ASR name debris (「玲奈」「玲奈…」) is not real cast evidence
        const nameOnlyDebris = isNameOnlyDebris(src);
        if (!nameOnlyDebris && (srcN.includes(tokenN) || srcN.includes(stemN))) return true;

        // Honorific / intro only (ignore lexicon hits that were just loop debris)
        const refs = (options.personRefs
            || extractJaPersonRefs(src).filter((r) => r.via === 'honorific' || r.via === 'intro'));
        for (const r of refs) {
            if (r.via && r.via !== 'honorific' && r.via !== 'intro') continue;
            if (stemsMatch(stem, r.stem) || stemsMatch(token, r.stem)) return true;
            const zhForms = LEXICON.byKana.get(r.stem) || [];
            if (zhForms.some((z) => stemsMatch(stem, z) || stemsMatch(token, z))) return true;
            if (LEXICON.kanji.has(r.stem) && stemsMatch(stem, r.stem)) return true;
        }

        // Also accept honorific/intro on raw source (美咲さん) even if loops elsewhere
        if (nameOnlyDebris || refs.length === 0) {
            const rawRefs = extractJaPersonRefs(sourceText)
                .filter((r) => r.via === 'honorific' || r.via === 'intro');
            for (const r of rawRefs) {
                if (stemsMatch(stem, r.stem) || stemsMatch(token, r.stem)) return true;
                const zhForms = LEXICON.byKana.get(r.stem) || [];
                if (zhForms.some((z) => stemsMatch(stem, z) || stemsMatch(token, z))) return true;
            }
        }

        // Katakana / non-ambiguous hints against loop-stripped source only
        // (skip when source is name-only debris — avoids 玲奈↔玲奈 self-justify)
        if (!nameOnlyDebris) {
            for (const hint of SOURCE_NAME_HINTS) {
                if (hint.ambiguous) continue;
                if (!hint.ja.test(src)) continue;
                if (hint.zh.some((z) => z === stem || z === token || stem.includes(z) || token.includes(z) || z.includes(stem))) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Whether JA source justifies a ZH name token via lexicon / hints / honorifics.
     * Pollution-prone stems (佳奈/舞…) require strong justification.
     * @param {string} token
     * @param {string} sourceText
     * @param {{ loopStrippedSource?: string, personRefs?: object[] }} [options]
     * @returns {boolean}
     */
    function sourceJustifiesZhName(token, sourceText, options = {}) {
        const src = options.loopStrippedSource != null
            ? String(options.loopStrippedSource)
            : String(sourceText || '');
        const stem = String(token || '').trim()
            .replace(/(?:同学|小姐|先生|桑|君|酱|大人|老师)$/, '');
        if (!stem) return false;

        // High-frequency Sakura hallucinations: never trust weak particle matches
        if (POLLUTION_NAME_STEMS.has(stem) || POLLUTION_NAME_STEMS.has(token)) {
            return sourceStronglyJustifiesZhName(token, sourceText, options);
        }

        if (src.includes(token) || src.includes(stem)) return true;

        for (const hint of SOURCE_NAME_HINTS) {
            if (!hint.ja.test(src)) continue;
            if (hint.zh.some((z) => z === stem || z === token
                || stem.includes(z) || token.includes(z)
                || z.includes(stem))) {
                return true;
            }
        }

        const refs = extractJaPersonRefs(src);
        for (const r of refs) {
            if (stem === r.stem || token === r.stem
                || stem.includes(r.stem) || r.stem.includes(stem)) {
                return true;
            }
            const zhForms = LEXICON.byKana.get(r.stem) || [];
            if (zhForms.some((z) => z === stem || stem.includes(z) || z.includes(stem))) {
                return true;
            }
        }
        return false;
    }

    function isPollutionNameStem(token) {
        const t = String(token || '').trim()
            .replace(/(?:同学|小姐|先生|桑|君|酱|大人|老师)$/, '');
        if (!t) return false;
        return POLLUTION_NAME_STEMS.has(t);
    }

    /** Unusual stage/surname → preferred ZH full name (override bare lexicon). */
    const CAST_CANONICAL_ZH = Object.freeze({
        香水: '香水纯',
        香水じゅん: '香水纯',
        香水ジュン: '香水纯',
        香水純: '香水纯',
        香水纯: '香水纯',
    });

    /**
     * Preferred ZH surface for a JA person stem (cast table → lexicon → stem).
     * @param {string} stem
     * @param {{ honorific?: string }} [options]
     * @returns {string}
     */
    function resolveCanonicalZhPersonName(stem, options = {}) {
        const s = String(stem || '').trim();
        if (!s) return '';
        if (CAST_CANONICAL_ZH[s]) return CAST_CANONICAL_ZH[s];
        const fromKana = LEXICON.byKana.get(s);
        if (fromKana?.length) return String(fromKana[0]);
        if (LEXICON.kanji.has(s)) {
            // Prefer cast / first hint that lists this kanji
            for (const hint of SOURCE_NAME_HINTS) {
                if (hint.ja.test(s) && hint.zh?.length) return String(hint.zh[0]);
            }
            return s;
        }
        const honorific = String(options.honorific || '');
        if (honorific === 'さん' || honorific === 'ちゃん') {
            return `${s}小姐`;
        }
        if (honorific === 'くん' || honorific === '君') {
            return `${s}先生`;
        }
        return s;
    }

    /**
     * Harvest Xさん / Xくん from cue texts into glossary-like rows for prompts.
     * @param {Array<{text?:string}>} cues
     * @param {{ minCount?: number }} [options]
     * @returns {Array<{term:string,translation:string,info:string,aliases?:string[]}>}
     */
    function harvestHonorificCastTerms(cues, options = {}) {
        const minCount = Math.max(1, Number(options.minCount) || 1);
        /** @type {Map<string, { count: number, honorific: string }>} */
        const tallies = new Map();
        for (const c of cues || []) {
            const refs = extractJaPersonRefs(c?.text).filter((r) => r.via === 'honorific');
            for (const r of refs) {
                const prev = tallies.get(r.stem) || { count: 0, honorific: r.honorific };
                tallies.set(r.stem, {
                    count: prev.count + 1,
                    honorific: prev.honorific || r.honorific,
                });
            }
        }
        const out = [];
        for (const [stem, info] of tallies) {
            if (info.count < minCount) continue;
            const zh = resolveCanonicalZhPersonName(stem, { honorific: info.honorific });
            if (!zh) continue;
            const aliases = [];
            if (zh !== stem) aliases.push(stem);
            if (zh === '香水纯') {
                aliases.push('香水さん', '香水小姐', '香水');
            }
            out.push({
                term: stem,
                translation: zh,
                info: '人名',
                aliases: [...new Set(aliases)].filter((a) => a && a !== zh),
            });
        }
        return out.sort((a, b) => b.term.length - a.term.length || a.term.localeCompare(b.term, 'ja'));
    }

    return {
        JA_GIVEN_NAME_ENTRIES,
        EXTRA_POLLUTION_STEMS,
        EXTRA_SURNAME_POLLUTION,
        ASR_LOOP_EXTRA_TOKENS,
        SOURCE_NAME_HINTS,
        POLLUTION_NAME_STEMS,
        CAST_CANONICAL_ZH,
        LEXICON,
        buildJaFormRegex,
        buildSourceNameHints,
        buildPollutionNameStems,
        extractJaPersonRefs,
        isPlausibleHonorificStem,
        resolveCanonicalZhPersonName,
        harvestHonorificCastTerms,
        stripAsrHallucinationLoops,
        stripAsrHallucinationLoopsInCues,
        sourceJustifiesZhName,
        sourceStronglyJustifiesZhName,
        isPollutionNameStem,
        isNameOnlyDebris,
        isAmbiguousHiraganaForm,
    };
}));
