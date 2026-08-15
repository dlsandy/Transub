'use strict';

const assert = require('assert');
const {
    stripOverrideTags,
    parseInlineOverrides,
    setLeadingOverride,
    toggleLeadingBoolOverride,
    insertSoftBreak,
    wrapSelectionWithOverride,
    resolvePreviewStyle,
    alignmentToCss,
    buildFontChecklistItems,
    isCommonFont,
} = require('../src/js/ass-override-core');
const { hexFromAssColour } = require('../src/js/ass-styles-core');

describe('ass-override-core', () => {
    it('strips override tags and soft breaks', () => {
        assert.strictEqual(stripOverrideTags('{\\an8}Hello{\\b1}'), 'Hello');
        assert.strictEqual(stripOverrideTags('A\\NB'), 'A\nB');
    });

    it('parses inline overrides', () => {
        const o = parseInlineOverrides('{\\an8\\b1\\i1\\c&H0000FF&}Hi');
        assert.strictEqual(o.alignment, 8);
        assert.strictEqual(o.bold, true);
        assert.strictEqual(o.italic, true);
        assert.ok(o.primaryColour);
    });

    it('sets and toggles leading overrides', () => {
        let t = setLeadingOverride('你好', 'an8');
        assert.strictEqual(t, '{\\an8}你好');
        t = setLeadingOverride(t, 'an2');
        assert.strictEqual(t, '{\\an2}你好');
        t = setLeadingOverride(t, 'b1');
        assert.ok(t.startsWith('{\\an2\\b1}') || t.startsWith('{\\b1\\an2}'));
        const toggled = toggleLeadingBoolOverride('{\\b1}x', 'b', 'b1');
        assert.strictEqual(toggled, 'x');
    });

    it('inserts soft break and wraps selection', () => {
        const br = insertSoftBreak('你好世界', 2, 2);
        assert.strictEqual(br.text, '你好\\N世界');
        const wrap = wrapSelectionWithOverride('abcd', 1, 3, 'b1', 'b0');
        assert.strictEqual(wrap.text, 'a{\\b1}bc{\\b0}d');
    });

    it('resolves approximate preview style', () => {
        const preview = resolvePreviewStyle({
            name: 'Default',
            fontname: 'Arial',
            fontsize: 48,
            primaryColour: '&H000000FF',
            bold: -1,
            italic: 0,
            alignment: 2,
        }, '{\\an8}Hello', {
            stylesCore: { hexFromAssColour },
        });
        assert.strictEqual(preview.alignment, 8);
        assert.strictEqual(preview.displayText, 'Hello');
        assert.strictEqual(preview.color, '#FF0000');
        assert.strictEqual(preview.fontWeight, 700);
        const css = alignmentToCss(8);
        assert.strictEqual(css.row, 'top');
        assert.strictEqual(css.col, 'center');
    });

    it('builds font checklist items', () => {
        assert.strictEqual(isCommonFont('Microsoft YaHei'), true);
        const uncommon = buildFontChecklistItems({
            styles: [{ fontname: 'TotallyFakeFontXYZ' }],
        });
        assert.strictEqual(uncommon[0].id, 'ass_fonts');
        assert.strictEqual(uncommon[0].severity, 'info');
        const ok = buildFontChecklistItems({
            styles: [{ fontname: 'Arial' }],
        });
        assert.strictEqual(ok[0].severity, 'ok');
        const missing = buildFontChecklistItems({
            styles: [{ fontname: 'MissingFont' }],
            availableFonts: ['arial'],
        });
        assert.strictEqual(missing[0].severity, 'warn');
    });
});
