'use strict';

const assert = require('assert');
const {
    listPacks,
    upsertPack,
    deletePack,
    getPack,
    createPackFromStyles,
} = require('../src/js/ass-style-packs-core');
const {
    buildDualDocumentFromTracks,
    parseStylesFromHeader,
} = require('../src/js/ass-styles-core');

describe('ass-style-packs-core', () => {
    const mem = {
        data: {},
        getItem(k) { return this.data[k] ?? null; },
        setItem(k, v) { this.data[k] = String(v); },
    };

    beforeEach(() => { mem.data = {}; });

    it('saves and deletes user packs', () => {
        const pack = createPackFromStyles('观影包', [
            { name: 'Default', fontname: 'Arial', fontsize: 48 },
            { name: 'Title', fontname: 'Arial', fontsize: 56 },
        ]);
        const saved = upsertPack(pack, mem);
        assert.strictEqual(saved.ok, true);
        assert.strictEqual(listPacks(mem).length, 1);
        assert.strictEqual(getPack(saved.pack.id, mem).name, '观影包');
        const del = deletePack(saved.pack.id, mem);
        assert.strictEqual(del.ok, true);
        assert.strictEqual(listPacks(mem).length, 0);
    });
});

describe('buildDualDocumentFromTracks', () => {
    it('expands primary+pair into Source/ZH dialogues', () => {
        const doc = buildDualDocumentFromTracks(
            [{ startMs: 0, endMs: 1000, text: '你好' }],
            [{ startMs: 0, endMs: 1000, text: 'hello' }],
            {
                title: 'Demo',
                primaryRole: 'target',
                dualTemplate: { lineOrder: 'target-first', sourceStyle: 'Source', targetStyle: 'ZH', marginGap: 56 },
            },
        );
        assert.strictEqual(doc.ok, true);
        assert.strictEqual(doc.pairCount, 1);
        assert.strictEqual(doc.dialogueCount, 2);
        assert.ok(doc.cues.some((c) => c.ass.style === 'Source' && c.text === 'hello'));
        assert.ok(doc.cues.some((c) => c.ass.style === 'ZH' && c.text === '你好'));
        const styles = parseStylesFromHeader(doc.header).styles;
        assert.ok(styles.some((s) => s.name === 'Source'));
        assert.ok(styles.some((s) => s.name === 'ZH'));
    });
});
