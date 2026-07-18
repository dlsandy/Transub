const assert = require('assert');

const {
    splitTextSmart,
    splitTextByCharCount,
    splitTextIntoNParts,
    buildCuesFromTexts,
    snapSplitIndexNearPunctuation,
    summarizeSplitCues,
    textCharCount,
    isConnectedText,
    normalizeBreakWords,
    DEFAULT_BREAK_WORDS,
} = require('../src/js/subtitle-split-core');

function testConnectedTextNotSplit() {
    assert.strictEqual(isConnectedText('今天天气很好我们去公园玩'), true);
    assert.strictEqual(isConnectedText('hello world'), false);
    assert.strictEqual(isConnectedText('第一行\n第二行'), false);

    const smartParts = splitTextSmart('今天天气很好我们去公园玩稍后回家吃饭', {
        maxChars: 8,
        breakWords: [],
    });
    assert.strictEqual(smartParts.length, 1, 'continuous text without punct/break words should not hard-split');

    const charParts = splitTextByCharCount('abcdefghijklmnopqrstuvwxyz', 10);
    assert.strictEqual(charParts.length, 1);

    assert.strictEqual(splitTextIntoNParts('abcdefghij', 3), null);
}

function testSplitTextSmartOnPunctuation() {
    const connected = splitTextSmart('今天天气很好，我们去公园玩。然后回家吃饭。', {
        maxChars: 12,
        maxLineChars: 12,
    });
    assert.ok(connected.length >= 2, 'continuous text with punctuation should smart-split');

    const spaced = splitTextSmart('今天天气很好， 我们去公园玩。 然后回家吃饭。', {
        maxChars: 12,
        maxLineChars: 12,
    });
    assert.ok(spaced.length >= 2, 'text with spaces should split');
    assert.ok(spaced.every((p) => p.length > 0));
}

function testSplitTextSmartOnBreakWords() {
    const parts = splitTextSmart('今天天气很好然后我们去公园玩', {
        maxChars: 8,
        maxLineChars: 8,
        breakWords: ['然后'],
    });
    assert.ok(parts.length >= 2, 'custom break words should split continuous Chinese');
    assert.ok(parts.some((p) => p.includes('然后')), 'chunk should retain break word');

    const normalized = normalizeBreakWords(['然后', '然后', ' 因此 ', '', 'however']);
    assert.deepStrictEqual(normalized[0], 'however');
    assert.ok(normalized.includes('因此') && normalized.includes('然后'));
    assert.strictEqual(normalized.length, 3);
    assert.ok(DEFAULT_BREAK_WORDS.includes('但是'));

    const emptyBreak = splitTextSmart('hello world then goodbye friends', {
        maxChars: 12,
        breakWords: [],
    });
    assert.ok(emptyBreak.length >= 1);
}

function testSplitTextSmartShortText() {
    const parts = splitTextSmart('短句', { maxChars: 20, maxLineChars: 18 });
    assert.strictEqual(parts.length, 1);
    assert.strictEqual(parts[0], '短句');
}

function testBuildCuesFromTextsCpsMode() {
    const cues = buildCuesFromTexts(0, 6000, ['一二三四五', '六七八九十'], 'cps', {
        targetCps: 2,
        minDurMs: 500,
    });
    assert.strictEqual(cues.length, 2);
    assert.strictEqual(cues[0].startMs, 0);
    assert.strictEqual(cues[1].endMs, 6000);
    const stats = summarizeSplitCues(cues);
    assert.ok(stats.cpsMax <= 3.5, `expected moderate CPS, got ${stats.cpsMax}`);
}

function testSnapSplitIndexNearPunctuation() {
    const text = 'Hello，world! More text';
    const snapped = snapSplitIndexNearPunctuation(text, 8, 6);
    const left = text.slice(0, snapped).trim();
    const right = text.slice(snapped).trim();
    assert.ok(left.endsWith('，') || left.endsWith('!') || right.length > 0);
}

function testSplitTextByCharCount() {
    const connected = splitTextByCharCount('abcdefghijklmnopqrstuvwxyz', 10);
    assert.strictEqual(connected.length, 1);

    const parts = splitTextByCharCount('abc def ghi jkl mno pqr stu vwx yz', 10);
    assert.ok(parts.length >= 2);
    assert.ok(parts.join('').replace(/\s/g, '').includes('abcdef'));
}

function testTextCharCountIgnoresSpaces() {
    assert.strictEqual(textCharCount('a b c'), 3);
}

describe("subtitle-split", () => {
    it("connected text not split", () => {
        testConnectedTextNotSplit();
    });
    it("split text smart on punctuation", () => {
        testSplitTextSmartOnPunctuation();
    });
    it("split text smart on break words", () => {
        testSplitTextSmartOnBreakWords();
    });
    it("split text smart short text", () => {
        testSplitTextSmartShortText();
    });
    it("build cues from texts cps mode", () => {
        testBuildCuesFromTextsCpsMode();
    });
    it("snap split index near punctuation", () => {
        testSnapSplitIndexNearPunctuation();
    });
    it("split text by char count", () => {
        testSplitTextByCharCount();
    });
    it("text char count ignores spaces", () => {
        testTextCharCountIgnoresSpaces();
    });
});
