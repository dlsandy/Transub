const assert = require('assert');

const {
    convertText,
    convertCues,
    summarizeConversion,
    normalizeDirection,
    normalizeLocale,
    normalizeVariant,
    isTraditionalVariant,
    variantToConvertOptions,
    directionLabel,
    stripTranslatePromptLeakage,
    ensureSpaceAfterChinesePunctuation,
    spaceAfterChinesePunctuationCues,
} = require('../src/js/subtitle-chinese-core');

function testNormalizeDirection() {
    assert.strictEqual(normalizeDirection('s2t'), 's2t');
    assert.strictEqual(normalizeDirection('t2s'), 't2s');
    assert.strictEqual(normalizeDirection('S2T'), 's2t');
    assert.strictEqual(normalizeDirection('nope'), 's2t');
}

function testNormalizeVariantAndLocale() {
    assert.strictEqual(normalizeVariant('traditional'), 'traditional');
    assert.strictEqual(normalizeVariant('traditional-tw'), 'traditional-tw');
    assert.strictEqual(normalizeVariant('traditional-hk'), 'traditional-hk');
    assert.strictEqual(normalizeVariant('simplified'), 'simplified');
    assert.ok(isTraditionalVariant('traditional'));
    assert.ok(isTraditionalVariant('traditional-hk'));
    assert.ok(!isTraditionalVariant('simplified'));
    assert.deepStrictEqual(variantToConvertOptions('traditional'), { direction: 's2t', locale: 'twp' });
    assert.deepStrictEqual(variantToConvertOptions('traditional-tw'), { direction: 's2t', locale: 'tw' });
    assert.deepStrictEqual(variantToConvertOptions('traditional-hk'), { direction: 's2t', locale: 'hk' });
    assert.deepStrictEqual(variantToConvertOptions('simplified'), { direction: 't2s', locale: 'twp' });
    assert.strictEqual(normalizeLocale('tw'), 'tw');
    assert.strictEqual(normalizeLocale('nope'), 'twp');
}

function testConvertTextS2T() {
    const { text, changed } = convertText('中国软件发展', 's2t');
    assert.strictEqual(text, '中國軟體發展');
    assert.ok(changed >= 3);
}

function testConvertTextT2S() {
    const { text, changed } = convertText('中國軟體發展', 't2s');
    assert.strictEqual(text, '中国软件发展');
    assert.ok(changed >= 3);
}

function testConvertPreservesNonChinese() {
    const raw = 'Hello 世界 123\n第二行';
    const { text } = convertText(raw, 's2t');
    assert.ok(text.startsWith('Hello '));
    assert.ok(text.includes('123'));
    assert.ok(text.includes('\n'));
    assert.strictEqual(convertText(raw, 's2t').text, text);
}

function testConvertCuesAll() {
    const cues = [
        { startMs: 0, endMs: 1000, text: '打开软件' },
        { startMs: 1000, endMs: 2000, text: 'OK' },
        { startMs: 2000, endMs: 3000, text: '国家发展' },
    ];
    const result = convertCues(cues, { direction: 's2t' });
    assert.strictEqual(result.stats.cueTouched, 2);
    assert.ok(result.stats.charChanged >= 4);
    assert.strictEqual(result.cues[0].text, '開啟軟體');
    assert.strictEqual(result.cues[1].text, 'OK');
    assert.strictEqual(result.cues[2].text, '國家發展');
    assert.strictEqual(cues[0].text, '打开软件', 'input unchanged');
    assert.ok(summarizeConversion(result.stats).includes('2'));
}

function testConvertCuesSelectedIndexes() {
    const cues = [
        { startMs: 0, endMs: 1, text: '简体一' },
        { startMs: 1, endMs: 2, text: '简体二' },
    ];
    const result = convertCues(cues, { direction: 's2t', indexes: [1] });
    assert.strictEqual(result.stats.cueTouched, 1);
    assert.strictEqual(result.cues[0].text, '简体一');
    assert.strictEqual(result.cues[1].text, '簡體二');
}

function testRoundTripCommonChars() {
    const sample = '学习汉字与计算机网络';
    const trad = convertText(sample, 's2t', { locale: 'tw' }).text;
    const back = convertText(trad, 't2s', { locale: 'tw' }).text;
    assert.strictEqual(back, sample);
}

function testDirectionLabel() {
    assert.ok(directionLabel('s2t', 'twp').includes('繁体'));
    assert.ok(directionLabel('t2s').includes('简体'));
}

function testNoopWhenAlreadyTarget() {
    const cues = [{ startMs: 0, endMs: 1, text: 'Hello' }];
    const result = convertCues(cues, { direction: 's2t' });
    assert.strictEqual(result.stats.cueTouched, 0);
    assert.ok(result.summary.includes('无需转换'));
}

function testConvertPhraseLongestMatch() {
    const { text, changed } = convertText('一只狗', 's2t');
    assert.strictEqual(text, '一隻狗');
    assert.ok(changed >= 1);
}

function testConvertAmbiguousPhrasesAndTwPhrases() {
    assert.strictEqual(convertText('皇后后来发现头发干燥', 's2t').text, '皇后後來發現頭髮乾燥');
    assert.strictEqual(convertText('闹钟响了', 's2t').text, '鬧鐘響了');
    assert.strictEqual(convertText('复制复杂文件', 's2t').text, '複製複雜檔案');
    assert.strictEqual(convertText('为了里面的面包', 's2t').text, '為了裡面的麵包');
    assert.strictEqual(convertText('台风干旱', 's2t').text, '颱風乾旱');
    assert.strictEqual(convertText('软件网络视频信息', 's2t').text, '軟體網路影片資訊');
    assert.strictEqual(convertText('软件网络', 's2t', { locale: 'tw' }).text, '軟件網絡');
}

function testProtectTermsKeepsGlossaryForms() {
    const { text } = convertText('中国软件发展', 's2t', { protectTerms: ['中国'] });
    assert.strictEqual(text, '中国軟體發展');
}

function testConvertCuesWithProtectTerms() {
    const cues = [{ startMs: 0, endMs: 1000, text: '中国软件' }];
    const result = convertCues(cues, {
        direction: 's2t',
        protectTerms: ['软件'],
    });
    assert.strictEqual(result.cues[0].text, '中國软件');
    assert.strictEqual(result.stats.cueTouched, 1);
    assert.ok(!result.cues[0].text.includes('軟體'));
}

function testStripTranslatePromptLeakage() {
    assert.strictEqual(stripTranslatePromptLeakage('请使用简体中文输出。'), '');
    assert.strictEqual(stripTranslatePromptLeakage('你好请使用简体中文输出。世界'), '你好世界');
    assert.strictEqual(stripTranslatePromptLeakage('請使用繁體中文輸出。'), '');
    const res = convertCues([{ startMs: 0, endMs: 1000, text: '请使用简体中文输出。' }], {
        direction: 't2s',
    });
    assert.strictEqual(res.cues[0].text, '');
}

function testEnsureSpaceAfterChinesePunctuation() {
    assert.strictEqual(ensureSpaceAfterChinesePunctuation('你好。世界'), '你好。 世界');
    assert.strictEqual(ensureSpaceAfterChinesePunctuation('真的吗？好的！继续'), '真的吗？ 好的！ 继续');
    assert.strictEqual(ensureSpaceAfterChinesePunctuation('你好。 世界'), '你好。 世界');
    assert.strictEqual(ensureSpaceAfterChinesePunctuation('结束。'), '结束。');
    const res = spaceAfterChinesePunctuationCues([
        { startMs: 0, endMs: 1, text: '啊？怎么了！没事。' },
        { startMs: 1, endMs: 2, text: 'OK' },
    ]);
    assert.strictEqual(res.cues[0].text, '啊？ 怎么了！ 没事。');
    assert.strictEqual(res.cues[1].text, 'OK');
    assert.strictEqual(res.stats.cueTouched, 1);
}

describe('subtitle-chinese', () => {
    it('normalize direction', () => {
        testNormalizeDirection();
    });
    it('normalize variant and locale', () => {
        testNormalizeVariantAndLocale();
    });
    it('convert text s2t', () => {
        testConvertTextS2T();
    });
    it('convert text t2s', () => {
        testConvertTextT2S();
    });
    it('preserves non-chinese', () => {
        testConvertPreservesNonChinese();
    });
    it('convert cues all', () => {
        testConvertCuesAll();
    });
    it('convert selected indexes', () => {
        testConvertCuesSelectedIndexes();
    });
    it('round-trip common chars', () => {
        testRoundTripCommonChars();
    });
    it('direction label', () => {
        testDirectionLabel();
    });
    it('noop when no convertible chars', () => {
        testNoopWhenAlreadyTarget();
    });
    it('converts phrases with longest match', () => {
        testConvertPhraseLongestMatch();
    });
    it('handles ambiguous phrases and Taiwan lexicon', () => {
        testConvertAmbiguousPhrasesAndTwPhrases();
    });
    it('protectTerms keeps protected substrings', () => {
        testProtectTermsKeepsGlossaryForms();
    });
    it('convert cues honors protectTerms', () => {
        testConvertCuesWithProtectTerms();
    });
    it('strips leaked translate prompt text', () => {
        testStripTranslatePromptLeakage();
    });
    it('ensures space after Chinese punctuation', () => {
        testEnsureSpaceAfterChinesePunctuation();
    });
});
