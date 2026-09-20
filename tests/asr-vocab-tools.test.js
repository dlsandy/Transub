#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    parseHotwordLine,
    hotwordTextToGlossary,
    parseThuoclLine,
    lexiconLinesToGlossary,
    glossaryToEngineAsr,
    glossaryToHotwordsText,
    mergeGlossaryDocs,
    anilistCharactersToGlossary,
} = require('../tools/asr-vocab/lib/glossary-io');

describe('asr-vocab glossary-io', () => {
    it('parses asr-hotword lines with blacklist note', () => {
        const row = parseHotwordLine('転売 | 天売 | てんばい ~~~ 転売禁止');
        assert.strictEqual(row.canonical, '転売');
        assert.deepStrictEqual(row.aliases, ['天売', 'てんばい']);
        assert.ok(row.blacklist.includes('転売禁止'));
    });

    it('converts hotword file to glossary', () => {
        const doc = hotwordTextToGlossary('# comment\nClaude | cloud | 克劳德\n');
        assert.strictEqual(doc.entries.length, 1);
        assert.strictEqual(doc.entries[0].canonical, 'Claude');
        assert.ok(doc.entries[0].aliases.includes('cloud'));
    });

    it('parses THUOCL tab lines and sorts by DF', () => {
        const a = parseThuoclLine('二氧化碳\t120');
        const b = parseThuoclLine('虚拟地址\t800');
        assert.strictEqual(a.term, '二氧化碳');
        assert.strictEqual(b.df, 800);
        const doc = lexiconLinesToGlossary([
            '二氧化碳\t120',
            '虚拟地址\t800',
            '# skip',
        ], { format: 'thuocl', limit: 10 });
        assert.strictEqual(doc.entries[0].canonical, '虚拟地址');
    });

    it('exports engine asr wrong/correct pairs from aliases', () => {
        const pairs = glossaryToEngineAsr({
            entries: [{
                canonical: '転売',
                aliases: ['天売'],
                asrReplace: true,
                enabled: true,
            }],
        });
        assert.strictEqual(pairs.length, 1);
        assert.deepStrictEqual(pairs[0], { wrong: '天売', correct: '転売', stage: 'asr' });
    });

    it('skips AniList-style entries without asrReplace', () => {
        const pairs = glossaryToEngineAsr({
            entries: [{
                canonical: '長門有希',
                aliases: ['Yuki Nagato'],
                enabled: true,
                note: 'AniList',
            }],
        });
        assert.strictEqual(pairs.length, 0);
    });

    it('builds hotwords text longest-first', () => {
        const text = glossaryToHotwordsText({
            entries: [
                { canonical: 'AB', aliases: ['A'], enabled: true },
                { canonical: 'XYZ', enabled: true },
            ],
        });
        const lines = text.trim().split('\n');
        assert.strictEqual(lines[0], 'XYZ');
    });

    it('merges glossaries by canonical', () => {
        const merged = mergeGlossaryDocs(
            { entries: [{ canonical: '舞', aliases: ['マイ'], enabled: true }] },
            { entries: [{ canonical: '舞', aliases: ['まい'], enabled: true }] },
        );
        assert.strictEqual(merged.entries.length, 1);
        assert.ok(merged.entries[0].aliases.includes('マイ'));
        assert.ok(merged.entries[0].aliases.includes('まい'));
    });

    it('maps AniList character nodes to JA glossary', () => {
        const doc = anilistCharactersToGlossary([
            {
                role: 'MAIN',
                name: {
                    full: 'Yuki Nagato',
                    native: '長門有希',
                    alternative: ['長門 有希'],
                },
            },
        ], { canonicalLocale: 'ja' });
        assert.strictEqual(doc.entries.length, 1);
        assert.strictEqual(doc.entries[0].canonical, '長門有希');
        assert.ok(doc.entries[0].aliases.includes('Yuki Nagato'));
    });
});
