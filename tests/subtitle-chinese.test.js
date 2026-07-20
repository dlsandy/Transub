const assert = require('assert');

const {
    convertText,
    convertCues,
    summarizeConversion,
    normalizeDirection,
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

function testConvertTextS2T() {
    const { text, changed } = convertText('中国软件发展', 's2t');
    assert.strictEqual(text, '中國軟件發展');
    assert.ok(changed >= 3);
}

function testConvertTextT2S() {
    const { text, changed } = convertText('中國軟件發展', 't2s');
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
    assert.strictEqual(result.cues[0].text, '打開軟件');
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
    const trad = convertText(sample, 's2t').text;
    const back = convertText(trad, 't2s').text;
    assert.strictEqual(back, sample);
}

function testDirectionLabel() {
    assert.strictEqual(directionLabel('s2t'), '简体 → 繁体');
    assert.strictEqual(directionLabel('t2s'), '繁体 → 简体');
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

function testProtectTermsKeepsGlossaryForms() {
    const { text } = convertText('中国软件发展', 's2t', { protectTerms: ['中国'] });
    assert.strictEqual(text, '中国軟件發展');
}

function testConvertCuesWithProtectTerms() {
    const cues = [{ startMs: 0, endMs: 1000, text: '中国软件' }];
    const result = convertCues(cues, {
        direction: 's2t',
        protectTerms: ['软件'],
    });
    assert.strictEqual(result.cues[0].text, '中國软件');
    assert.strictEqual(result.stats.cueTouched, 1);
    assert.ok(!result.cues[0].text.includes('軟件'));
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
