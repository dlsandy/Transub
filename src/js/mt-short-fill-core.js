/**
 * Multi-target short-fill surfaces for JA→zh/en/ko/ja deterministic cues.
 *
 * EN / KO 成片 short-fill use independent JA→EN / JA→KO tables
 * (`lookupEnFromJa` / `fallbackShortJaCueEn`, `lookupKoFromJa` / `fallbackShortJaCueKo`).
 * `localizeZhShortFill` remains for scrubbing model ZH leaks on intl delivery —
 * not the EN/KO short-fill path.
 */
(function (global, factory) {
    let targetLangCore = null;
    try {
        targetLangCore = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-target-lang-core')
            : (global && global.TransubSubtitleTargetLang);
    } catch {
        targetLangCore = null;
    }
    const api = factory(targetLangCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMtShortFill = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mtShortFillFactory(targetLangCore) {
    /** ZH short-fill / discourse surface → English */
    const EN_FROM_ZH = Object.freeze({
        '好开心': 'So happy',
        '没事': "It's fine",
        '不要': "Don't",
        '才没有那种事': "That's not true at all",
        '舒服吗？': 'Does it feel good?',
        '舒服吗?': 'Does it feel good?',
        '啊，但是…': 'Ah, but…',
        '非常感谢': 'Thank you so much',
        '好厉害…': 'Amazing…',
        '好舒服…': 'Feels so good…',
        '好舒服': 'Feels so good',
        '要射了': "I'm coming",
        '要射了…': "I'm coming…",
        '要射了吗': 'Are you coming?',
        '要去了': "I'm coming",
        '要去了…': "I'm coming…",
        '要去了吗': 'Are you coming?',
        '要射出来了': "I'm about to cum",
        '要射出来吗？': 'Are you about to cum?',
        '啊，进去了……': "Ah, it's in…",
        '啊，进去了…': "Ah, it's in…",
        '进去了': "It's in",
        '好烫': "It's hot",
        '好烫…': "It's hot…",
        '好热': "It's hot",
        '好硬啊': 'So hard',
        '是工作': "It's work",
        '早饭': 'Breakfast',
        '早上好': 'Good morning',
        '没关系': "It's fine",
        '啊，没关系': "Ah, I'm fine",
        '什么意思啊': 'What do you mean',
        '哎……': 'Hey…',
        '感觉': 'That feeling',
        '不': 'No',
        '不行': "No",
        '不行……': 'No…',
        '但是': 'But',
        '你好。': 'Hello.',
        '你看': 'Look',
        '先': 'First',
        '再见': 'Bye',
        '再见啦': 'See you',
        '别管了': 'Leave it',
        '别走': "Don't go",
        '原来如此': 'I see',
        '又是屁股吗？': 'That again?',
        '可以': 'Okay',
        '可以的话': 'If you want',
        '可以，你看': 'Okay, look',
        '可能是最累的一次了': 'Might be the most tiring yet',
        '呐': 'Hey',
        '呜呜': 'Grr',
        '呵呵': 'Hehe',
        '呵呵，开玩笑的': 'Hehe, just kidding',
        '呼': 'Phew',
        '咦': 'Huh',
        '哈…': 'Ha…',
        '哈…哈…': 'Ha… ha…',
        '啊': 'Ah',
        '啊……': 'Ah…',
        '啊…': 'Ah…',
        '啊~~！': 'Ahh~!',
        '啊~~': 'Ahh~',
        '舔': 'Lick',
        '老师…': 'Sensei…',
        '老师': 'Sensei',
        '哎': 'Hey',
        '哦~~！': 'Oh~!',
        '啊啊': 'Ahh',
        '啊，托您的福': 'Ah, thanks to you',
        '啊，是啊': 'Ah, yeah',
        '啊，知道了': 'Ah, got it',
        '啊，知道了。': 'Ah, got it.',
        '啧': 'Tsk',
        '喂': 'Hey',
        '喂，你': 'Hey, you',
        '喂，你好': 'Hello?',
        '嗯': 'Mm',
        '嗯……': 'Mm…',
        '嗯嗯': 'Mm-hmm',
        '嗯嗯，哈…': 'Mm-hmm, ha…',
        '嗯嗯，好厉害': 'Mm-hmm, amazing',
        '嗯，好的': 'Mm, okay',
        '嗯，是啊': 'Mm, yeah',
        '嗯，知道了': 'Mm, got it',
        '嗯，知道了。': 'Mm, got it.',
        '因为': 'Because',
        '太好了': 'Great',
        '失陪了': 'Excuse me',
        '失陪了。': 'Excuse me.',
        '好': 'Okay',
        '好厉害': 'Amazing',
        '好大': 'So big',
        '好的。': 'Okay.',
        '好的': 'Okay',
        '好的，借我': 'Okay, lend it to me',
        '好的，失陪了': 'Okay, excuse me',
        '好的，失陪了。': 'Okay, excuse me.',
        '好的，明白了': 'Okay, understood',
        '好的，明白了。': 'Okay, understood.',
        '对不起。': 'Sorry.',
        '对吧': 'Right?',
        '已经': 'Already',
        '怎么了': "What's wrong",
        '怎么了？': "What's wrong?",
        '想要': 'I want it',
        '慢走。': 'Take care.',
        '我回来了。': "I'm home.",
        '我走了。': "I'm heading out.",
        '所以': 'So',
        '托您的福': 'Thanks to you',
        '拜托了': 'Please',
        '接下来': 'Next',
        '早。': 'Morning.',
        '早上好。': 'Good morning.',
        '早上好，主人': 'Good morning, Master',
        '早啊': 'Morning',
        '明白了': 'Understood',
        '明白了。': 'Understood.',
        '有变更吗？': 'A change?',
        '有变更吗': 'A change?',
        '我也是。': 'Same here.',
        '我也是': 'Same here.',
        '这是第一次': "This is my first time.",
        '这是第一次。': "This is my first time.",
        '喜欢': 'I like it',
        '喜欢…': 'I like it…',
        '哇…': 'Whoa…',
        '是吗': 'Is that so',
        '是啊': 'Yeah',
        '晚上好。': 'Good evening.',
        '果然': 'I knew it',
        '欢迎回来。': 'Welcome back.',
        '然后': 'And then',
        '盯……': 'Stare…',
        '真棒': 'Nice',
        '真的': 'Really',
        '真的啊': 'Really',
        '知道了': 'Got it',
        '知道了。': 'Got it.',
        '等一下': 'Wait',
        '糟了': 'Oh no',
        '给了': 'I gave it',
        '而且': 'And',
        '至今为止': 'Until now',
        '说不定': 'Maybe',
        '诶': 'Eh',
        '诶诶': 'Eh',
        '诶？什么': 'Huh? What',
        '谢谢': 'Thanks',
        '谢谢。': 'Thanks.',
        '谢谢，爸爸': 'Thanks, Dad',
        '这个': 'This',
        '这是最后一次了…': 'This is the last time…',
        '遵命': 'Yes, sir',
        '那个': 'Um',
        '那个……': 'Um…',
        '那么': 'Well then',
        '那就': 'Then',
        '阿马': 'Ma-kun',
        '你啊': 'Hey you',
        '老师': 'Teacher',
        '前辈': 'Senpai',
        '什么': 'What',
        '为什么': 'Why',
        '冰淇淋': 'Ice cream',
        '妈妈': 'Mom',
        '爸爸': 'Dad',
        '雏': 'Hina',
        '亨纳克斯': 'Hennax',
        '脑机接口': 'Brain-computer interface',
        '竹打': 'Bamboo striking',
        '好可怜': 'Poor thing',
        '你': 'You',
        '阿斯姆': 'Asmu',
        '米塞里奥·杜夫': 'Miserio Duve',
    });

    /** ZH short-fill surface → Korean */
    const KO_FROM_ZH = Object.freeze({
        '不': '아니',
        '不行': '안 돼',
        '不行……': '안 돼…',
        '但是': '하지만',
        '你好。': '안녕.',
        '你看': '봐',
        '先': '먼저',
        '再见': '안녕',
        '再见啦': '또 봐',
        '别管了': '그냥 둬',
        '别走': '가지 마',
        '原来如此': '그렇구나',
        '又是屁股吗？': '또야?',
        '可以': '괜찮아',
        '可以的话': '괜찮다면',
        '可以，你看': '괜찮아, 봐',
        '可能是最累的一次了': '제일 힘든 번일지도',
        '呐': '야',
        '呜呜': '크르릉',
        '呵呵': '흐흐',
        '呵呵，开玩笑的': '흐흐, 장난이야',
        '呼': '후',
        '咦': '어',
        '哈…': '하…',
        '哎': '야',
        '哦~~！': '오~!',
        '啊啊': '아아',
        '啊，托您的福': '아, 덕분에',
        '啊，是啊': '아, 맞아',
        '啊，知道了': '아, 알겠어',
        '啊，知道了。': '아, 알겠어.',
        '啧': '칫',
        '喂': '야',
        '喂，你': '야, 너',
        '喂，你好': '여보세요',
        '嗯': '응',
        '嗯……': '응…',
        '嗯嗯': '응응',
        '嗯嗯，哈…': '응응, 하…',
        '嗯嗯，好厉害': '응응, 대단해',
        '嗯，好的': '응, 알겠어',
        '嗯，是啊': '응, 맞아',
        '嗯，知道了': '응, 알겠어',
        '嗯，知道了。': '응, 알겠어.',
        '因为': '왜냐하면',
        '太好了': '잘됐다',
        '失陪了': '실례합니다',
        '失陪了。': '실례합니다.',
        '好': '좋아',
        '好厉害': '대단해',
        '好大': '커',
        '好的。': '알겠어.',
        '好的': '알겠어',
        '好的，借我': '응, 빌려줘',
        '好的，失陪了': '알겠어, 실례할게',
        '好的，失陪了。': '알겠어, 실례할게.',
        '好的，明白了': '알겠어, 이해했어',
        '好的，明白了。': '알겠어, 이해했어.',
        '对不起。': '미안해.',
        '对吧': '그치',
        '已经': '벌써',
        '怎么了': '왜 그래',
        '怎么了？': '왜 그래?',
        '想要': '원해',
        '慢走。': '조심히 가.',
        '我回来了。': '다녀왔어.',
        '我走了。': '다녀올게.',
        '所以': '그래서',
        '托您的福': '덕분에',
        '拜托了': '부탁해',
        '接下来': '이제',
        '早。': '안녕.',
        '早上好。': '좋은 아침.',
        '早上好，主人': '좋은 아침, 주인님',
        '早啊': '안녕',
        '明白了': '알겠어',
        '明白了。': '알겠어.',
        '是吗': '그래?',
        '是啊': '맞아',
        '晚上好。': '좋은 저녁.',
        '果然': '역시',
        '欢迎回来。': '어서 와.',
        '然后': '그리고',
        '盯……': '뚫어져라…',
        '真棒': '좋다',
        '真的': '진짜',
        '真的啊': '진짜야',
        '知道了': '알겠어',
        '知道了。': '알겠어.',
        '等一下': '잠깐',
        '糟了': '큰일',
        '给了': '줬어',
        '而且': '게다가',
        '至今为止': '지금까지',
        '说不定': '어쩌면',
        '诶': '에',
        '诶诶': '에에',
        '诶？什么': '에? 뭐',
        '谢谢': '고마워',
        '谢谢。': '고마워.',
        '谢谢，爸爸': '고마워, 아빠',
        '这个': '이거',
        '这是最后一次了…': '이번이 마지막이야…',
        '遵命': '알겠습니다',
        '那个': '그',
        '那个……': '그게…',
        '那么': '그럼',
        '那就': '그럼',
        '阿马': '마 군',
        '你啊': '야 너',
        '老师': '선생님',
        '前辈': '선배',
        '什么': '뭐',
        '为什么': '왜',
        '冰淇淋': '아이스크림',
        '妈妈': '엄마',
        '爸爸': '아빠',
        '雏': '히나',
        '亨纳克斯': '헨낙스',
        '脑机接口': '뇌-컴퓨터 인터페이스',
        '竹打': '대나무 치기',
        '好可怜': '불쌍해',
        '你': '너',
        '阿斯姆': '아스무',
        '米塞里奥·杜夫': '미세리오 두브',
        '要射了': '싸겠어',
        '要射了…': '싸겠어…',
        '要射了吗': '싸겠어?',
        '要去了': '갈 것 같아',
        '要去了…': '갈 것 같아…',
        '要去了吗': '갈 것 같아?',
        '要射出来了': '쌀 것 같아',
        '要射出来吗？': '쌀 것 같아?',
        '好烫': '뜨거워',
        '好烫…': '뜨거워…',
        '好热': '뜨거워',
        '好硬啊': '단단하네',
        '是工作': '일이야',
        '早饭': '아침밥',
        '没关系': '괜찮아',
        '啊，没关系': '아, 괜찮아',
        '什么意思啊': '무슨 뜻이야',
        '我也是。': '나도야.',
        '我也是': '나도야',
        '这是第一次': '처음이야',
        '这是第一次。': '처음이야.',
        '有变更吗？': '변경이야?',
        '有变更吗': '변경이야?',
        '喜欢': '좋아해',
        '喜欢…': '좋아해…',
        '哇…': '와…',
        '好舒服': '기분 좋아',
        '好舒服…': '기분 좋아…',
        '舒服吗？': '기분 좋아?',
        '舒服吗?': '기분 좋아?',
        '可以吗': '괜찮아?',
        '可以吗？': '괜찮아?',
        '什么？': '뭐?',
        '为什么？': '왜?',
        '是的': '맞아',
        '请': '부탁해',
        '请…': '부탁해…',
        '不要…': '안 돼…',
        '那么……': '그럼…',
        '那就……': '그럼…',
        '呐…': '야…',
        '感觉不错': '느낌 좋은데',
        '怎么样': '어때',
        '怎么样？': '어때?',
        '再多点': '더',
        '再多点？': '더?',
        '好的，请': '알겠어, 자',
        '啊，但是…': '아, 하지만…',
        '等一下…等一下…': '잠깐… 잠깐…',
    });

    function resolveTargetLang(opts = {}) {
        if (typeof opts === 'string') {
            return targetLangCore?.normalizeSubtitleTargetLang?.(opts)
                || targetLangCore?.resolveSubtitleTargetLang?.({ targetLang: opts })
                || String(opts || '').trim()
                || 'zh-Hans';
        }
        const o = opts && typeof opts === 'object' ? opts : {};
        if (targetLangCore?.resolveSubtitleTargetLang) {
            return targetLangCore.resolveSubtitleTargetLang(o);
        }
        return String(o.subtitleTargetLang || o.targetLang || 'zh-Hans').trim() || 'zh-Hans';
    }

    function isZhLang(lang) {
        if (targetLangCore?.isZhSubtitleTarget) return targetLangCore.isZhSubtitleTarget(lang);
        return /^zh/i.test(String(lang || '')) || /中文|hans|hant/i.test(String(lang || ''));
    }

    function bucketLang(lang) {
        const n = String(lang || '').trim();
        if (isZhLang(n)) return 'zh';
        if (/^ko/i.test(n) || n === '한국어') return 'ko';
        if (/^ja/i.test(n) || n === '日本語') return 'ja';
        if (/^en/i.test(n) || /english/i.test(n)) return 'en';
        return 'en';
    }

    function lookupMap(map, zh) {
        const t = String(zh || '').trim();
        if (!t) return '';
        if (Object.prototype.hasOwnProperty.call(map, t)) return map[t];
        const noPeriod = t.replace(/[。．.]+$/g, '');
        if (noPeriod !== t && Object.prototype.hasOwnProperty.call(map, noPeriod)) {
            return map[noPeriod];
        }
        const withPeriod = `${noPeriod}。`;
        if (Object.prototype.hasOwnProperty.call(map, withPeriod)) return map[withPeriod];
        return '';
    }

    /**
     * Localize a ZH short-fill / discourse surface for 成片目标语.
     * @param {string} zhFill
     * @param {string|object} targetOpts
     * @param {string} [sourceText] JA source (used for ja passthrough)
     */
    function localizeZhShortFill(zhFill, targetOpts = {}, sourceText = '') {
        const zh = String(zhFill || '').trim();
        if (!zh) return '';
        const lang = resolveTargetLang(targetOpts);
        const bucket = bucketLang(lang);
        if (bucket === 'zh') return zh;
        if (bucket === 'ja') {
            const src = String(sourceText || '').trim();
            return src || '';
        }
        if (bucket === 'ko') return lookupMap(KO_FROM_ZH, zh);
        const enHit = lookupMap(EN_FROM_ZH, zh);
        if (enHit) return enHit;
        // Soft-AV moan / breath shapes not listed exactly in the table.
        const moan = zh.replace(/\s+/g, '');
        if (/^[啊阿]+[~～~]*[!！]?$/.test(moan)) return 'Ah';
        if (/^[啊阿]+[…·.。]{1,6}$/.test(moan)) return 'Ah…';
        if (/^[嗯唔]+[…·.。]*$/.test(moan)) return 'Mm…';
        if (/^(?:哈[…·.。]*){1,4}$/.test(moan)) return 'Ha…';
        if (/^[啊阿]+[~～~]+[!！]?$/.test(moan)) return 'Ahh~!';
        if (moan === '老师' || /^老师[…·.。]+$/.test(moan)) return moan.endsWith('…') || /[…·]/.test(moan) ? 'Sensei…' : 'Sensei';
        if (moan === '舔' || moan === '舔…') return 'Lick';
        // Mixed ZH stocks (e.g. 要射了…要射了…哈…) → replace longest keys first.
        // Skip when source still looks like Japanese (kana present) — 好き contains 好.
        if (/[\u4e00-\u9fff]/.test(zh) && !/[\u3040-\u30ff]/.test(zh)) {
            const keys = Object.keys(EN_FROM_ZH).sort((a, b) => [...b].length - [...a].length);
            let out = zh;
            let hit = false;
            for (const k of keys) {
                if (!k || !out.includes(k)) continue;
                out = out.split(k).join(EN_FROM_ZH[k]);
                hit = true;
            }
            // Residual short moans
            out = out
                .replace(/[哈]+(?=[…·.。~～!]|$)/g, 'Ha')
                .replace(/[啊阿]+(?=[…·.。~～!]|$)/g, 'Ah')
                .replace(/[嗯唔]+(?=[…·.。~～!]|$)/g, 'Mm')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (hit && out && !/[\u4e00-\u9fff]/.test(out)) return out;
        }
        return '';
    }

    /** Independent JA→EN short-fill map (EN 成片 runtime; never returns ZH). */
    const enFromJa = Object.create(null);
    const EN_FROM_JA_SEED = Object.freeze({
        'おはよう': 'Morning.',
        'おはよう。': 'Morning.',
        'おはようございます': 'Good morning.',
        'おはようございます。': 'Good morning.',
        'こんにちは': 'Hello.',
        'こんにちは。': 'Hello.',
        'こんばんは': 'Good evening.',
        'こんばんは。': 'Good evening.',
        'ありがとう': 'Thanks',
        'ありがとう。': 'Thanks.',
        'ありがとうございます': 'Thank you',
        'ありがとうございます。': 'Thank you',
        'うん': 'Mm-hmm',
        'うん。': 'Mm-hmm',
        'うんうん': 'Mm-hmm',
        'ええ': 'Mm-hmm',
        'ええ。': 'Mm-hmm',
        'はい': 'Okay',
        'はい。': 'Okay.',
        'だめ': 'No',
        'ダメ': 'No',
        '駄目': 'No',
        '仕事だよ': "It's work",
        '仕事だよ。': "It's work",
        'あつい': "It's hot",
        'あつい…': "It's hot…",
        '熱い': "It's hot",
        '熱い…': "It's hot…",
        '朝ごはん': 'Breakfast',
        '朝ごはん。': 'Breakfast',
        '承知しました': 'Understood',
        '承知しました。': 'Understood.',
        'さようなら': 'Goodbye.',
        'さようなら。': 'Goodbye.',
        'いや、私もです。': 'Same here.',
        'いや、私もです': 'Same here.',
        'こんなの初めてですよ': 'This is my first time.',
        'こんなの初めてですよ。': 'This is my first time.',
        'す、好きです…': 'I like it…',
        'す、好きです': 'I like it',
        '好きです…': 'I like it…',
        '好きです': 'I like it',
        '変更ですか?': 'A change?',
        '変更ですか？': 'A change?',
        '変更ですか': 'A change?',
        'いい?': 'Okay?',
        'いい？': 'Okay?',
        'いい': 'Okay',
    });
    Object.assign(enFromJa, EN_FROM_JA_SEED);

    /**
     * Project a JA→ZH map into the independent JA→EN table (init only).
     * Runtime EN short-fill reads EN_FROM_JA only — no ZH hop.
     * @param {Record<string, string>} jaToZh
     * @returns {number} newly added entries
     */
    function projectJaZhMapToEn(jaToZh) {
        const src = jaToZh && typeof jaToZh === 'object' ? jaToZh : {};
        let added = 0;
        for (const [ja, zh] of Object.entries(src)) {
            const key = String(ja || '').trim();
            if (!key || Object.prototype.hasOwnProperty.call(enFromJa, key)) continue;
            const en = lookupMap(EN_FROM_ZH, zh);
            if (!en) continue;
            enFromJa[key] = en;
            added += 1;
        }
        return added;
    }

    function mergeEnFromJa(entries) {
        const src = entries && typeof entries === 'object' ? entries : {};
        let added = 0;
        for (const [ja, en] of Object.entries(src)) {
            const key = String(ja || '').trim();
            const val = String(en || '').trim();
            if (!key || !val) continue;
            if (!Object.prototype.hasOwnProperty.call(enFromJa, key)) added += 1;
            enFromJa[key] = val;
        }
        return added;
    }

    /**
     * Exact / lightly normalized JA→EN lookup.
     * @param {string} sourceText
     * @returns {string}
     */
    function lookupEnFromJa(sourceText) {
        const s = String(sourceText || '').trim();
        if (!s) return '';
        if (Object.prototype.hasOwnProperty.call(enFromJa, s)) return enFromJa[s];
        const noPunct = s.replace(/[。．.、，,\s！!？?～〜…·•]+$/g, '');
        if (noPunct && Object.prototype.hasOwnProperty.call(enFromJa, noPunct)) {
            const base = enFromJa[noPunct];
            if (/[…・]/.test(s) && base && !/[.!?…]$/.test(base)) return `${base}…`;
            return base;
        }
        if (/^(ね|ねえ|え|ええ|うん|はい|ほら|そう)[。．.!！?？…～〜ー]*$/u.test(s)) {
            const key = noPunct || s.replace(/[…～〜ー]+$/g, '');
            if (key && Object.prototype.hasOwnProperty.call(enFromJa, key)) return enFromJa[key];
        }
        return '';
    }

    function textLenSafe(s) {
        return Array.from(String(s || '').replace(/\s+/g, '')).length;
    }

    /**
     * JA→EN short-fill heuristics (English literals only; no ZH intermediate).
     * @param {string} sourceText
     * @returns {string}
     */
    function fallbackShortJaCueEn(sourceText) {
        const s = String(sourceText || '').trim();
        if (!s) return '';
        const exact = lookupEnFromJa(s);
        if (exact) return exact;

        const noPunct = s.replace(/[。．.、，,\s！!？?～〜…·•]+$/g, '');
        const stem = noPunct.replace(/[〜～]+$/g, '');
        if (textLenSafe(s) <= 14 && stem && Object.prototype.hasOwnProperty.call(enFromJa, stem)) {
            const base = enFromJa[stem];
            return /[…・]/.test(s) && base && !/[.!?…]$/.test(base) ? `${base}…` : base;
        }

        if (textLenSafe(s) <= 14) {
            if (/^じゃあね/.test(noPunct) && textLenSafe(s) <= 10) return 'See you';
            if (/^またね/.test(noPunct) && textLenSafe(s) <= 8) return 'Bye';
            if (/^それじゃあ/.test(stem) && textLenSafe(s) <= 12) {
                return /[…・]/.test(s) ? 'Well then…' : 'Well then';
            }
            if (/^それじゃ$/.test(stem) || /^それじゃ[あぁ]/.test(stem)) {
                return /[…・]/.test(s) ? 'Well then…' : 'Well then';
            }
            if (/^じゃあ(?!ね)/.test(stem) && textLenSafe(s) <= 8) {
                return /[…・]/.test(s) ? 'Then…' : 'Then';
            }
            if (/^(?:だめ|ダメ|駄目)(?:だよ|だって|です)?[。．.!！?？…\s]*$/u.test(s)) {
                return /[…・]/.test(s) ? 'No…' : 'No';
            }
            if (/^お願いします[。．.!！?？…\s]*$/u.test(s)) return 'Please';
            if (/^帰らないで[。．.!！?？…\s]*$/u.test(s)) return "Don't go";
            if (/^はい[\s　]+どうぞ[。．.!！?？…\s]*$/u.test(s)) return 'Okay, go ahead';
            if (/^どうぞ[。．.!！?？…\s]*$/u.test(s)) return 'Please';
            if (/^(?:そうですね|そうだね)[。．.!！?？…\s]*$/u.test(s)) return 'Yeah';
            if (/^(?:そうです|そうだよ)[。．.!！?？…\s]*$/u.test(s)) return 'Yes';
            if (/^何ですか[。．.!！?？…\s]*$/u.test(s)) return 'What?';
            if (/^(?:なに|何)[。．.!！?？…\s]*$/u.test(s)) return /[?？]/.test(s) ? 'What?' : 'What';
            if (/^もっと[。．.!！?？…\s]*$/u.test(s)) return /[?？]/.test(s) ? 'More?' : 'More';
            if (/^どうして[。．.!！?？…\s]*$/u.test(s)) return /[?？]/.test(s) ? 'Why?' : 'Why';
            if (/気持ちよ[かき]|きもちよ[かきぅ]|きもちい[いぃ]?[かき]?|気持ちいい|きもちいい|気持ちよ[くかたっ]|きもちよ[くかたっ]/u.test(s) && textLenSafe(s) <= 18) {
                return /[?？]/.test(s) ? 'Does it feel good?' : 'Feels so good';
            }
            if (/出しちゃう[かよ]?[。．.!！?？…\s]*$/u.test(s) && textLenSafe(s) <= 12) {
                return /[?？]/.test(s) ? 'Are you about to cum?' : "I'm about to cum";
            }
            if (/^(?:どう|どうかな|どうだろう)[?？！!…。．.\s]*$/u.test(s)) {
                return /[?？]/.test(s) ? 'How is it?' : 'How is it';
            }
            if (/^(?:いいですか|宜しいですか)[?？！!…。．.\s]*$/u.test(s)) {
                return 'Is that okay?';
            }
            if (/^(?:すご[うおぉー～〜い]*|すっごい)[っッ…。．.!！?\s]*$/u.test(s)) return 'Amazing';
            if (/^(?:わぁ+|わあ+)[っッ…。．.!！?\s]*$/u.test(s)) return 'Whoa…';
            if (/^やば[いっ]?[…。．.!！?\s]*$/u.test(s) || /^あ[、,]?\s*やば/u.test(s)) return 'Oh no';
            if (/^あ[、,]?\s*でも[。．.!！?？…\s]*$/u.test(s)) return 'Ah, but…';
            if (/ちょっと…?ちょっと/u.test(s) && textLenSafe(s) <= 16) return 'Wait… wait…';
        }

        if (/^やめ[っろ]?[…·.\s]*$/u.test(s) || /^やめて[…·.\s]*$/u.test(s) || /^やだ[…·.\s]*$/u.test(s)) {
            return /[…・]/.test(s) ? "Don't…" : "Don't";
        }
        if (/かしこまりました/.test(s) && textLenSafe(s) <= 14) return 'Yes, sir';
        if (/おはよう/.test(s) && /ご主人様|ご主人|主人様/.test(s)) return 'Good morning, Master';

        const bare = s.replace(/[\s…・!?！？。、,~～〜゛゜]/g, '');
        const moanOnly = /^(?:[あぁアァうぅウゥおぉオォんンっッ゛゜はひふへほハヒフヘホー〜～…・!?！？。、,\s~～〜]+)$/u;
        if (moanOnly.test(s) && Array.from(bare).length <= 14) {
            if (/[はヒひふヘへほハヒフヘホ]/.test(s) || /はぁ|はあっ|フー/.test(s)) return 'Ha…';
            if (/[あぁアァ]/.test(s) || /あ゛/.test(s)) return 'Ahh';
            if (/[えぇエェー]/.test(s) || /えー|へー/.test(s)) return 'Eh';
            return 'Mm-hmm';
        }
        if (/^(?:フフ+|ふふ+)[っッ]?[…。．.!！?\s]*$/.test(s)) return 'Hehe';
        if (/^(?:ジー+|じー+)[っッ…。．.!！?\s]*$/.test(s)) return 'Stare…';
        if (/イク|イキ|イッ|いく|いっ/.test(s) && textLenSafe(s) <= 24) return "I'm coming";
        return '';
    }

    function getEnFromJaTable() {
        return Object.freeze({ ...enFromJa });
    }

    /** Independent JA→KO short-fill map (KO 成片 runtime; never returns ZH). */
    const koFromJa = Object.create(null);
    const KO_FROM_JA_SEED = Object.freeze({
        'おはよう': '안녕.',
        'おはよう。': '안녕.',
        'おはようございます': '좋은 아침.',
        'おはようございます。': '좋은 아침.',
        'こんにちは': '안녕.',
        'こんにちは。': '안녕.',
        'こんばんは': '좋은 저녁.',
        'こんばんは。': '좋은 저녁.',
        'ありがとう': '고마워',
        'ありがとう。': '고마워.',
        'ありがとうございます': '고마워',
        'ありがとうございます。': '고마워.',
        'うん': '응응',
        'うん。': '응응',
        'うんうん': '응응',
        'ええ': '응응',
        'ええ。': '응응',
        'はい': '알겠어',
        'はい。': '알겠어.',
        'だめ': '안 돼',
        'ダメ': '안 돼',
        '駄目': '안 돼',
        '仕事だよ': '일이야',
        '仕事だよ。': '일이야',
        'あつい': '뜨거워',
        'あつい…': '뜨거워…',
        '熱い': '뜨거워',
        '熱い…': '뜨거워…',
        '朝ごはん': '아침밥',
        '朝ごはん。': '아침밥',
        '承知しました': '알겠어',
        '承知しました。': '알겠어.',
        'さようなら': '안녕.',
        'さようなら。': '안녕.',
        'いや、私もです。': '나도야.',
        'いや、私もです': '나도야',
        'こんなの初めてですよ': '처음이야',
        'こんなの初めてですよ。': '처음이야.',
        'す、好きです…': '좋아해…',
        'す、好きです': '좋아해',
        '好きです…': '좋아해…',
        '好きです': '좋아해',
        '変更ですか?': '변경이야?',
        '変更ですか？': '변경이야?',
        '変更ですか': '변경이야?',
        'いい?': '괜찮아?',
        'いい？': '괜찮아?',
        'いい': '괜찮아',
    });
    Object.assign(koFromJa, KO_FROM_JA_SEED);

    /**
     * Project a JA→ZH map into the independent JA→KO table (init only).
     * @param {Record<string, string>} jaToZh
     * @returns {number}
     */
    function projectJaZhMapToKo(jaToZh) {
        const src = jaToZh && typeof jaToZh === 'object' ? jaToZh : {};
        let added = 0;
        for (const [ja, zh] of Object.entries(src)) {
            const key = String(ja || '').trim();
            if (!key || Object.prototype.hasOwnProperty.call(koFromJa, key)) continue;
            const ko = lookupMap(KO_FROM_ZH, zh);
            if (!ko) continue;
            koFromJa[key] = ko;
            added += 1;
        }
        return added;
    }

    function mergeKoFromJa(entries) {
        const src = entries && typeof entries === 'object' ? entries : {};
        let added = 0;
        for (const [ja, ko] of Object.entries(src)) {
            const key = String(ja || '').trim();
            const val = String(ko || '').trim();
            if (!key || !val) continue;
            if (!Object.prototype.hasOwnProperty.call(koFromJa, key)) added += 1;
            koFromJa[key] = val;
        }
        return added;
    }

    /**
     * Exact / lightly normalized JA→KO lookup.
     * @param {string} sourceText
     * @returns {string}
     */
    function lookupKoFromJa(sourceText) {
        const s = String(sourceText || '').trim();
        if (!s) return '';
        if (Object.prototype.hasOwnProperty.call(koFromJa, s)) return koFromJa[s];
        const noPunct = s.replace(/[。．.、，,\s！!？?～〜…·•]+$/g, '');
        if (noPunct && Object.prototype.hasOwnProperty.call(koFromJa, noPunct)) {
            const base = koFromJa[noPunct];
            if (/[…・]/.test(s) && base && !/[.!?…?]$/.test(base)) return `${base}…`;
            return base;
        }
        if (/^(ね|ねえ|え|ええ|うん|はい|ほら|そう)[。．.!！?？…～〜ー]*$/u.test(s)) {
            const key = noPunct || s.replace(/[…～〜ー]+$/g, '');
            if (key && Object.prototype.hasOwnProperty.call(koFromJa, key)) return koFromJa[key];
        }
        return '';
    }

    /**
     * JA→KO short-fill heuristics (Korean literals only; no ZH intermediate).
     * @param {string} sourceText
     * @returns {string}
     */
    function fallbackShortJaCueKo(sourceText) {
        const s = String(sourceText || '').trim();
        if (!s) return '';
        const exact = lookupKoFromJa(s);
        if (exact) return exact;

        const noPunct = s.replace(/[。．.、，,\s！!？?～〜…·•]+$/g, '');
        const stem = noPunct.replace(/[〜～]+$/g, '');
        if (textLenSafe(s) <= 14 && stem && Object.prototype.hasOwnProperty.call(koFromJa, stem)) {
            const base = koFromJa[stem];
            return /[…・]/.test(s) && base && !/[.!?…?]$/.test(base) ? `${base}…` : base;
        }

        if (textLenSafe(s) <= 14) {
            if (/^じゃあね/.test(noPunct) && textLenSafe(s) <= 10) return '또 봐';
            if (/^またね/.test(noPunct) && textLenSafe(s) <= 8) return '안녕';
            if (/^それじゃあ/.test(stem) && textLenSafe(s) <= 12) {
                return /[…・]/.test(s) ? '그럼…' : '그럼';
            }
            if (/^それじゃ$/.test(stem) || /^それじゃ[あぁ]/.test(stem)) {
                return /[…・]/.test(s) ? '그럼…' : '그럼';
            }
            if (/^じゃあ(?!ね)/.test(stem) && textLenSafe(s) <= 8) {
                return /[…・]/.test(s) ? '그럼…' : '그럼';
            }
            if (/^(?:だめ|ダメ|駄目)(?:だよ|だって|です)?[。．.!！?？…\s]*$/u.test(s)) {
                return /[…・]/.test(s) ? '안 돼…' : '안 돼';
            }
            if (/^お願いします[。．.!！?？…\s]*$/u.test(s)) return '부탁해';
            if (/^帰らないで[。．.!！?？…\s]*$/u.test(s)) return '가지 마';
            if (/^はい[\s　]+どうぞ[。．.!！?？…\s]*$/u.test(s)) return '알겠어, 자';
            if (/^どうぞ[。．.!！?？…\s]*$/u.test(s)) return '부탁해';
            if (/^(?:そうですね|そうだね)[。．.!！?？…\s]*$/u.test(s)) return '맞아';
            if (/^(?:そうです|そうだよ)[。．.!！?？…\s]*$/u.test(s)) return '맞아';
            if (/^何ですか[。．.!！?？…\s]*$/u.test(s)) return '뭐?';
            if (/^(?:なに|何)[。．.!！?？…\s]*$/u.test(s)) return /[?？]/.test(s) ? '뭐?' : '뭐';
            if (/^もっと[。．.!！?？…\s]*$/u.test(s)) return /[?？]/.test(s) ? '더?' : '더';
            if (/^どうして[。．.!！?？…\s]*$/u.test(s)) return /[?？]/.test(s) ? '왜?' : '왜';
            if (/気持ちよ[かき]|きもちよ[かきぅ]|きもちい[いぃ]?[かき]?|気持ちいい|きもちいい|気持ちよ[くかたっ]|きもちよ[くかたっ]/u.test(s) && textLenSafe(s) <= 18) {
                return /[?？]/.test(s) ? '기분 좋아?' : '기분 좋아';
            }
            if (/出しちゃう[かよ]?[。．.!！?？…\s]*$/u.test(s) && textLenSafe(s) <= 12) {
                return /[?？]/.test(s) ? '쌀 것 같아?' : '쌀 것 같아';
            }
            if (/^(?:どう|どうかな|どうだろう)[?？！!…。．.\s]*$/u.test(s)) {
                return /[?？]/.test(s) ? '어때?' : '어때';
            }
            if (/^(?:いいですか|宜しいですか)[?？！!…。．.\s]*$/u.test(s)) {
                return '괜찮아?';
            }
            if (/^(?:すご[うおぉー～〜い]*|すっごい)[っッ…。．.!！?\s]*$/u.test(s)) return '대단해';
            if (/^(?:わぁ+|わあ+)[っッ…。．.!！?\s]*$/u.test(s)) return '와…';
            if (/^やば[いっ]?[…。．.!！?\s]*$/u.test(s) || /^あ[、,]?\s*やば/u.test(s)) return '큰일';
            if (/^あ[、,]?\s*でも[。．.!！?？…\s]*$/u.test(s)) return '아, 하지만…';
            if (/ちょっと…?ちょっと/u.test(s) && textLenSafe(s) <= 16) return '잠깐… 잠깐…';
        }

        if (/^やめ[っろ]?[…·.\s]*$/u.test(s) || /^やめて[…·.\s]*$/u.test(s) || /^やだ[…·.\s]*$/u.test(s)) {
            return /[…・]/.test(s) ? '안 돼…' : '안 돼';
        }
        if (/かしこまりました/.test(s) && textLenSafe(s) <= 14) return '알겠습니다';
        if (/おはよう/.test(s) && /ご主人様|ご主人|主人様/.test(s)) return '좋은 아침, 주인님';

        const bare = s.replace(/[\s…・!?！？。、,~～〜゛゜]/g, '');
        const moanOnly = /^(?:[あぁアァうぅウゥおぉオォんンっッ゛゜はひふへほハヒフヘホー〜～…・!?！？。、,\s~～〜]+)$/u;
        if (moanOnly.test(s) && Array.from(bare).length <= 14) {
            if (/[はヒひふヘへほハヒフヘホ]/.test(s) || /はぁ|はあっ|フー/.test(s)) return '하…';
            if (/[あぁアァ]/.test(s) || /あ゛/.test(s)) return '아아';
            if (/[えぇエェー]/.test(s) || /えー|へー/.test(s)) return '에에';
            return '응응';
        }
        if (/^(?:フフ+|ふふ+)[っッ]?[…。．.!！?\s]*$/.test(s)) return '흐흐';
        if (/^(?:ジー+|じー+)[っッ…。．.!！?\s]*$/.test(s)) return '뚫어져라…';
        if (/イク|イキ|イッ|いく|いっ/.test(s) && textLenSafe(s) <= 24) return '싸겠어';
        return '';
    }

    function getKoFromJaTable() {
        return Object.freeze({ ...koFromJa });
    }

    /**
     * Suffix for dual / sidecar naming from 成片目标语.
     * Chinese → BCP-47-ish file tags: zh-cn / zh-tw / zh-hk (e.g. SNOS-329.zh-cn.srt).
     */
    function dualTargetSuffixFromLang(targetOpts = {}) {
        const lang = resolveTargetLang(targetOpts);
        const n = String(lang || '').trim();
        const lower = n.toLowerCase();
        if (/^en\b/i.test(n) || lower === 'english') return 'en';
        if (/^ko\b/i.test(n) || lower === '한국어') return 'ko';
        if (/^ja\b/i.test(n) || lower === '日本語') return 'ja';
        if (
            n === 'zh-Hant-HK'
            || lower === 'zh-hk'
            || lower === 'traditional-hk'
            || lower === 'hk'
        ) {
            return 'zh-hk';
        }
        if (
            n === 'zh-Hant'
            || n === 'zh-Hant-TW'
            || lower === 'zh-tw'
            || lower === 'zh-hant'
            || lower === 'traditional'
            || lower === 'traditional-tw'
            || lower === 'tw'
        ) {
            return 'zh-tw';
        }
        return 'zh-cn';
    }

    return {
        EN_FROM_ZH,
        KO_FROM_ZH,
        EN_FROM_JA_SEED,
        KO_FROM_JA_SEED,
        resolveTargetLang,
        bucketLang,
        isZhLang,
        localizeZhShortFill,
        projectJaZhMapToEn,
        mergeEnFromJa,
        lookupEnFromJa,
        fallbackShortJaCueEn,
        getEnFromJaTable,
        projectJaZhMapToKo,
        mergeKoFromJa,
        lookupKoFromJa,
        fallbackShortJaCueKo,
        getKoFromJaTable,
        dualTargetSuffixFromLang,
    };
}));
