const assert = require('assert');
const fs = require('fs');
const path = require('path');
const intent = require('../src/js/mt-sanitize-intent-core');
const opaque = require('../src/js/mt-opaque-strings');

describe('mt-sanitize-intent-core', () => {
    it('resolves canonical intents from opaque T/FIX without plaintext literals in defs', () => {
        const intents = intent.buildCanonicalIntents(opaque);
        const strip = intents.find((i) => i.id === 'strip.meatRod.hallucination');
        const remap = intents.find((i) => i.id === 'remap.clinicalRod.toMeatRod');
        assert.ok(strip);
        assert.ok(remap);
        assert.strictEqual(strip.kind, 'strip');
        assert.strictEqual(remap.kind, 'remap');
        assert.strictEqual(strip.zhSurface, opaque.T.meatRodZh);
        assert.strictEqual(remap.zhSurface, opaque.T.meatRodZh);
        assert.ok(strip.pairedWith.includes('remap.clinicalRod.toMeatRod'));
        assert.ok(remap.pairedWith.includes('strip.meatRod.hallucination'));
    });

    it('exposes getSanitizeIntents on opaque', () => {
        const list = opaque.getSanitizeIntents();
        assert.ok(Array.isArray(list));
        assert.ok(list.some((i) => i.id === 'strip.meatRod.hallucination'));
        assert.ok(list.some((i) => i.kind === 'asr'));
    });

    it('lists declared opposing pairs', () => {
        const intents = intent.buildCanonicalIntents(opaque);
        const pairs = intent.listOpposingPairs(intents);
        assert.ok(pairs.some((p) =>
            (p.a === 'strip.meatRod.hallucination' && p.b === 'remap.clinicalRod.toMeatRod')
            || (p.b === 'strip.meatRod.hallucination' && p.a === 'remap.clinicalRod.toMeatRod')));
    });

    it('flags undeclared strip vs remap on same ZH as high', () => {
        const fake = [
            {
                id: 'strip.foo',
                kind: 'strip',
                layer: 'opaque',
                zhSurface: '假词',
                pairedWith: [],
                fixtureRefs: [],
            },
            {
                id: 'remap.foo',
                kind: 'remap',
                layer: 'opaque',
                zhSurface: '假词',
                pairedWith: [],
                fixtureRefs: [],
            },
        ];
        const { conflicts } = intent.analyzeDeclaredConflicts(fake);
        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].kind, 'undeclared_strip_vs_remap_same_zh');
        assert.strictEqual(conflicts[0].severity, 'high');
    });

    it('does not high-flag declared meatRod opposing pair', () => {
        const intents = intent.buildCanonicalIntents(opaque);
        const { conflicts, warnings } = intent.analyzeDeclaredConflicts(intents);
        assert.strictEqual(conflicts.filter((c) => c.kind === 'undeclared_strip_vs_remap_same_zh').length, 0);
        assert.ok(warnings.some((w) => w.kind === 'declared_opposing_pair'));
    });

    it('detects missing fixtureRefs against test source', () => {
        const intents = [{
            id: 'strip.x',
            kind: 'strip',
            zhSurface: 'x',
            pairedWith: [],
            fixtureRefs: ['this fixture title does not exist XYZ'],
        }];
        const missing = intent.analyzeMissingFixtureRefs(intents, "it('other test') {}");
        assert.strictEqual(missing.length, 1);
        assert.strictEqual(missing[0].kind, 'missing_fixture_ref');
    });

    it('canonical fixtureRefs exist in mt-sanitize.test.js', () => {
        const testSource = fs.readFileSync(
            path.join(__dirname, 'mt-sanitize.test.js'),
            'utf8',
        );
        const { conflicts } = intent.analyzeIntents({ opaque, testSource });
        const missing = conflicts.filter((c) => c.kind === 'missing_fixture_ref');
        assert.deepStrictEqual(missing, [], JSON.stringify(missing, null, 2));
    });

    it('marks canonical intents reusable with smokeTitles provenance only', () => {
        const intents = intent.buildCanonicalIntents(opaque);
        const strip = intents.find((i) => i.id === 'strip.meatRod.hallucination');
        assert.strictEqual(strip.reusable, true);
        assert.ok(Array.isArray(strip.smokeTitles) && strip.smokeTitles.includes('ADN-798'));
        assert.ok(strip.jaForbidHint);
        const warnings = intent.analyzeReuseDiscipline(intents);
        assert.strictEqual(warnings.filter((w) => w.kind === 'non_reusable_intent').length, 0);
        assert.strictEqual(warnings.filter((w) => w.kind === 'missing_reuse_condition_hint').length, 0);
    });

    it('flags reusable:false as high conflict', () => {
        const bad = [{
            id: 'strip.filmOnly',
            kind: 'strip',
            reusable: false,
            zhSurface: 'x',
            pairedWith: [],
            fixtureRefs: [],
        }];
        const warnings = intent.analyzeReuseDiscipline(bad);
        assert.strictEqual(warnings.length, 1);
        assert.strictEqual(warnings[0].severity, 'high');
    });
});
