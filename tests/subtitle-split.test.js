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
} = require('../src/js/subtitle-split-core');

function testConnectedTextNotSplit() {
    assert.strictEqual(isConnectedText('今天天气很好我们去公园玩'), true);
    assert.strictEqual(isConnectedText('hello world'), false);
    assert.strictEqual(isConnectedText('第一行\n第二行'), false);

    const smartParts = splitTextSmart('今天天气很好我们去公园玩然后回家吃饭', { maxChars: 8 });
    assert.strictEqual(smartParts.length, 1);

    const charParts = splitTextByCharCount('abcdefghijklmnopqrstuvwxyz', 10);
    assert.strictEqual(charParts.length, 1);

    assert.strictEqual(splitTextIntoNParts('abcdefghij', 3), null);
}

function testSplitTextSmartOnPunctuation() {
    const connected = splitTextSmart('今天天气很好，我们去公园玩。然后回家吃饭。', {
        maxChars: 12,
        maxLineChars: 12,
    });
    assert.strictEqual(connected.length, 1, 'continuous text without whitespace should not split');

    const spaced = splitTextSmart('今天天气很好， 我们去公园玩。 然后回家吃饭。', {
        maxChars: 12,
        maxLineChars: 12,
    });
    assert.ok(spaced.length >= 2, 'text with spaces should split');
    assert.ok(spaced.every((p) => p.length > 0));
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

function main() {
    testConnectedTextNotSplit();
    testSplitTextSmartOnPunctuation();
    testSplitTextSmartShortText();
    testBuildCuesFromTextsCpsMode();
    testSnapSplitIndexNearPunctuation();
    testSplitTextByCharCount();
    testTextCharCountIgnoresSpaces();
    console.log('subtitle-split.test.js: all passed');
}

main();
