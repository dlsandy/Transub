const assert = require('assert');

const {
    normalizeGlossary,
    scanGlossaryIssues,
    applyGlossaryToCues,
    parseAliasesInput,
    upsertEntry,
    replaceTerm,
    mergeGlossaries,
} = require('../src/js/subtitle-glossary-core');

function testParseAliasesInput() {
    const aliases = parseAliasesInput('Harry Potter，哈利・波特; HP\n哈利点');
    assert.ok(aliases.includes('Harry Potter'));
    assert.ok(aliases.includes('哈利・波特'));
    assert.ok(aliases.includes('HP'));
}

function testScanDetectsVariants() {
    const glossary = normalizeGlossary({
        entries: [{
            id: '1',
            canonical: '哈利波特',
            aliases: ['Harry Potter', '哈利・波特'],
        }],
    });
    const cues = [
        { startMs: 0, endMs: 1000, text: 'Harry Potter 来了' },
        { startMs: 1000, endMs: 2000, text: '哈利・波特开战' },
        { startMs: 2000, endMs: 3000, text: '哈利波特获胜' },
    ];
    const { issues, summary } = scanGlossaryIssues(cues, glossary);
    assert.ok(summary.total >= 1);
    assert.ok(issues[0].formsFound.length >= 2);
    assert.strictEqual(issues[0].type, 'variant');
}

function testApplyUnifiesAliases() {
    const glossary = {
        entries: [{
            id: '1',
            canonical: '哈利波特',
            aliases: ['Harry Potter', '哈利・波特'],
        }],
    };
    const cues = [
        { startMs: 0, endMs: 1000, text: 'Harry Potter 与 哈利・波特' },
    ];
    const result = applyGlossaryToCues(cues, glossary);
    assert.ok(result.stats.replaceCount >= 2);
    assert.strictEqual(result.cues[0].text, '哈利波特 与 哈利波特');
    assert.strictEqual(cues[0].text, 'Harry Potter 与 哈利・波特', 'input unchanged');
}

function testAsciiWordBoundary() {
    const { text, count } = replaceTerm('catalog and cat', 'cat', '猫', false);
    assert.strictEqual(count, 1);
    assert.strictEqual(text, 'catalog and 猫');
}

function testUpsertEntry() {
    const doc = normalizeGlossary({ entries: [] });
    const added = upsertEntry(doc, {
        canonical: 'Transub',
        aliases: 'TransSub, transub app',
    });
    assert.ok(added.ok);
    assert.strictEqual(added.glossary.entries.length, 1);
    assert.ok(added.glossary.entries[0].aliases.includes('TransSub'));
}

function testAliasOnlyIssue() {
    const glossary = {
        entries: [{
            canonical: 'OpenAI',
            aliases: ['OAI', 'open ai'],
        }],
    };
    const cues = [{ startMs: 0, endMs: 1, text: 'OAI is cool' }];
    const { issues } = scanGlossaryIssues(cues, glossary);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].type, 'alias_only');
}

function testMergeGlossariesProjectOverridesGlobal() {
    const merged = mergeGlossaries(
        { entries: [{ id: 'g1', canonical: 'Transub', aliases: ['TransSub'] }] },
        { entries: [{ id: 'p1', canonical: 'transub', aliases: ['TS'], note: 'project' }] },
    );
    assert.strictEqual(merged.entries.length, 1);
    assert.strictEqual(merged.entries[0].id, 'p1');
    assert.ok(merged.entries[0].aliases.includes('TS'));
}

describe("subtitle-glossary", () => {
    it("parse aliases input", () => {
        testParseAliasesInput();
    });
    it("scan detects variants", () => {
        testScanDetectsVariants();
    });
    it("apply unifies aliases", () => {
        testApplyUnifiesAliases();
    });
    it("ascii word boundary", () => {
        testAsciiWordBoundary();
    });
    it("upsert entry", () => {
        testUpsertEntry();
    });
    it("alias only issue", () => {
        testAliasOnlyIssue();
    });
    it("merge glossaries with project override", () => {
        testMergeGlossariesProjectOverridesGlobal();
    });
});
