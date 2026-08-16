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
        const o = parseInlineOverrides('{\\an8\\b1\\i1\\c&H0000FF&\\fs56}Hi');
        assert.strictEqual(o.alignment, 8);
        assert.strictEqual(o.bold, true);
        assert.strictEqual(o.italic, true);
        assert.ok(o.primaryColour);
        assert.strictEqual(o.fontsize, 56);
    });

    it('builds colour and fontsize override commands', () => {
        const {
            colourOverrideCommand,
            fontsizeOverrideCommand,
            setLeadingOverride,
        } = require('../src/js/ass-override-core');
        const { assColourFromHex } = require('../src/js/ass-styles-core');
        const c = colourOverrideCommand('#FF0000', { assColourFromHex });
        assert.strictEqual(c, 'c&H0000FF&');
        assert.strictEqual(fontsizeOverrideCommand(56), 'fs56');
        const next = setLeadingOverride('你好', c);
        assert.ok(next.startsWith('{\\c&H0000FF&}'));
        const sized = setLeadingOverride(next, 'fs56');
        assert.ok(sized.includes('\\fs56'));
    });

    it('applies effect presets and clears them', () => {
        const {
            listEffectPresets,
            applyEffectPreset,
            applyEffectPresetToCues,
            fadeCommand,
            normalizeDialogueEffect,
            listDialogueEffectPresets,
        } = require('../src/js/ass-override-core');
        assert.ok(listEffectPresets().length >= 8);
        assert.strictEqual(fadeCommand(200, 300), 'fad(200,300)');
        const faded = applyEffectPreset('你好', 'fade-quick');
        assert.strictEqual(faded.ok, true);
        assert.ok(faded.text.startsWith('{\\fad(150,150)}'));
        const moved = applyEffectPreset(faded.text, 'pos-bottom', { playResX: 1920, playResY: 1080 });
        assert.ok(moved.text.includes('\\pos('));
        assert.ok(moved.text.includes('\\fad(150,150)'));
        const cleared = applyEffectPreset(moved.text, 'clear-fx');
        assert.strictEqual(cleared.text, '你好');
        const batch = applyEffectPresetToCues(
            [
                { startMs: 0, endMs: 2000, text: 'A' },
                { startMs: 2000, endMs: 4000, text: 'B' },
            ],
            [0, 1],
            'blur-soft',
        );
        assert.strictEqual(batch.changed, 2);
        assert.ok(batch.cues[0].text.includes('\\blur'));
        assert.strictEqual(normalizeDialogueEffect('Banner;5;0;50'), 'Banner;5;0;50');
        assert.ok(listDialogueEffectPresets().some((p) => p.id.startsWith('Scroll')));
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

    it('parses pos overrides and maps play-res coordinates', () => {
        const {
            parseInlineOverrides,
            posCommand,
            setLeadingOverride,
            parsePlayResFromHeader,
            defaultPosForStyle,
            resolveCuePos,
            clientPointToPlayRes,
            playResToClientPoint,
        } = require('../src/js/ass-override-core');
        const inline = parseInlineOverrides('{\\pos(100,200)}Hi');
        assert.strictEqual(inline.posX, 100);
        assert.strictEqual(inline.posY, 200);
        assert.strictEqual(posCommand(10.4, 20.6), 'pos(10,21)');
        const withPos = setLeadingOverride('你好', posCommand(960, 980));
        assert.ok(withPos.startsWith('{\\pos(960,980)}'));
        const pr = parsePlayResFromHeader(['PlayResX: 1280', 'PlayResY: 720'], 1920, 1080);
        assert.strictEqual(pr.playResX, 1280);
        assert.strictEqual(pr.playResY, 720);
        const bottom = defaultPosForStyle({ alignment: 2, marginV: 60, marginL: 40, marginR: 40 }, 1920, 1080);
        assert.strictEqual(bottom.x, 960);
        assert.strictEqual(bottom.y, 1020);
        const resolved = resolveCuePos('{\\pos(11,22)}x', { alignment: 2 }, 1920, 1080);
        assert.strictEqual(resolved.fromOverride, true);
        assert.strictEqual(resolved.x, 11);
        const video = {
            videoWidth: 1920,
            videoHeight: 1080,
            getBoundingClientRect: () => ({ left: 100, top: 50, width: 960, height: 540 }),
        };
        const mapped = clientPointToPlayRes(100 + 480, 50 + 270, video, 1920, 1080);
        assert.strictEqual(mapped.x, 960);
        assert.strictEqual(mapped.y, 540);
        const back = playResToClientPoint(960, 540, video, 1920, 1080);
        assert.strictEqual(Math.round(back.clientX), 580);
        assert.strictEqual(Math.round(back.clientY), 320);
        const {
            posForAlignment,
            nudgePos,
            clampPosToPlayRes,
        } = require('../src/js/ass-override-core');
        const topLeft = posForAlignment(7, { marginV: 40, marginL: 30, marginR: 50 }, 1920, 1080);
        assert.strictEqual(topLeft.x, 30);
        assert.strictEqual(topLeft.y, 40);
        const nudged = nudgePos(10, 20, -5, 3, 100, 100);
        assert.strictEqual(nudged.x, 5);
        assert.strictEqual(nudged.y, 23);
        const clamped = clampPosToPlayRes(-1, 9999, 100, 200);
        assert.strictEqual(clamped.x, 0);
        assert.strictEqual(clamped.y, 200);
    });
});
