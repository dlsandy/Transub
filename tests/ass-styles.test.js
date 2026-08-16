'use strict';

const assert = require('assert');
const {
    DEFAULT_STYLE,
    parseStylesFromHeader,
    writeStylesToHeader,
    upsertStyleInHeader,
    deleteStyleFromHeader,
    renameStyleInHeader,
    applyStyleToCues,
    countStyleUsage,
    ensureAssHeader,
    styleToLine,
    hexFromAssColour,
    assColourFromHex,
    createStyleFromSpeakers,
} = require('../src/js/ass-styles-core');
const { parseSubtitle, serializeSubtitle } = require('../electron/subtitle-format');

describe('ass-styles-core', () => {
    it('parses styles from ASS header', () => {
        const header = [
            '[Script Info]',
            'Title: Demo',
            '',
            '[V4+ Styles]',
            'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
            'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,48,1',
            'Style: Source,Arial,40,&H00AAAAAA,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,112,1',
            '',
            '[Events]',
            'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        ];
        const parsed = parseStylesFromHeader(header);
        assert.strictEqual(parsed.hasSection, true);
        assert.strictEqual(parsed.styles.length, 2);
        assert.strictEqual(parsed.styles[0].name, 'Default');
        assert.strictEqual(parsed.styles[1].name, 'Source');
        assert.strictEqual(parsed.styles[1].fontsize, 40);
        assert.strictEqual(parsed.styles[1].marginV, 112);
        assert.strictEqual(hexFromAssColour(parsed.styles[1].primaryColour), '#AAAAAA');
    });

    it('upserts and round-trips styles in header for ASS save', () => {
        const header = ensureAssHeader([], 'Clip');
        const nextHeader = upsertStyleInHeader(header, {
            name: 'Title',
            fontname: 'Microsoft YaHei',
            fontsize: 64,
            primaryColour: '#FFCC00',
            alignment: 8,
            marginV: 24,
        }, { title: 'Clip' });
        const styles = parseStylesFromHeader(nextHeader).styles;
        const title = styles.find((s) => s.name === 'Title');
        assert.ok(title);
        assert.strictEqual(title.fontsize, 64);
        assert.strictEqual(title.alignment, 8);
        assert.strictEqual(hexFromAssColour(title.primaryColour), '#FFCC00');

        const cues = [{
            index: 1,
            startMs: 0,
            endMs: 2000,
            text: 'Hello',
            ass: { style: 'Title', layer: '0', name: '', marginL: '0', marginR: '0', marginV: '0', effect: '' },
        }];
        const out = serializeSubtitle({ format: 'ass', cues, header: nextHeader });
        assert.ok(out.includes('Style: Title,'));
        assert.ok(out.includes('Dialogue: 0,0:00:00.00,0:00:02.00,Title,'));
        const again = parseSubtitle(out, 'ass');
        assert.strictEqual(again.cues[0].ass.style, 'Title');
        const againStyles = parseStylesFromHeader(again.header).styles;
        assert.ok(againStyles.some((s) => s.name === 'Title' && s.fontsize === 64));
    });

    it('deletes style and remaps cue usage helpers', () => {
        let header = ensureAssHeader([], 'X');
        header = upsertStyleInHeader(header, { ...DEFAULT_STYLE, name: 'Sp1', primaryColour: '#FF0000' });
        const cues = [
            { text: 'a', ass: { style: 'Sp1' } },
            { text: 'b', ass: { style: 'Default' } },
        ];
        assert.strictEqual(countStyleUsage(cues, 'Sp1'), 1);
        const del = deleteStyleFromHeader(header, 'Sp1');
        assert.strictEqual(del.deleted, true);
        assert.ok(!parseStylesFromHeader(del.header).styles.some((s) => s.name === 'Sp1'));
        const applied = applyStyleToCues(cues, [0], 'Default');
        assert.strictEqual(applied.changed, 1);
        assert.strictEqual(applied.cues[0].ass.style, 'Default');
        const blocked = deleteStyleFromHeader(header, 'Default');
        assert.strictEqual(blocked.deleted, false);
    });

    it('renames style in header', () => {
        let header = ensureAssHeader([], 'X');
        header = upsertStyleInHeader(header, { ...DEFAULT_STYLE, name: 'Old' });
        const renamed = renameStyleInHeader(header, 'Old', 'New');
        assert.strictEqual(renamed.renamed, true);
        const names = parseStylesFromHeader(renamed.header).styles.map((s) => s.name);
        assert.ok(names.includes('New'));
        assert.ok(!names.includes('Old'));
    });

    it('creates speaker styles and colour helpers', () => {
        assert.strictEqual(assColourFromHex('#FF0000'), '&H000000FF');
        assert.strictEqual(hexFromAssColour('&H000000FF'), '#FF0000');
        const { styles, speakerStyleMap } = createStyleFromSpeakers([
            { id: 's1', name: 'A', color: '#112233' },
            { id: 's2', name: 'B', color: '#445566' },
        ]);
        assert.ok(styles.some((s) => s.name === 'Default'));
        assert.strictEqual(speakerStyleMap.s1, 'Sp1');
        assert.strictEqual(speakerStyleMap.s2, 'Sp2');
        assert.ok(styleToLine(styles[1]).includes('Sp1,'));
        const written = writeStylesToHeader([], styles, { title: 'Sp' });
        assert.ok(written.some((l) => /^Style: Sp1,/.test(l)));
    });

    it('maps speakers and builds dual ASS cues', () => {
        const {
            normalizeSpeakerStyleMap,
            mergeSpeakerStylesIntoList,
            ensureDualTemplateStyles,
            buildDualAssCues,
            applySpeakerMapToExportCues,
            applySpeakerMapToCues,
            listStylePresets,
            applyStylePreset,
            summarizeAssExport,
        } = require('../src/js/ass-styles-core');
        const speakers = [
            { id: 'spk_1', name: '甲', color: '#ff0000' },
            { id: 'spk_2', name: '乙', color: '#00ff00' },
        ];
        const map = normalizeSpeakerStyleMap({ spk_1: 'Lead' }, speakers);
        assert.strictEqual(map.spk_1, 'Lead');
        assert.strictEqual(map.spk_2, 'Sp2');
        const merged = mergeSpeakerStylesIntoList([], speakers, map);
        assert.ok(merged.styles.some((s) => s.name === 'Lead'));
        assert.ok(merged.styles.some((s) => s.name === 'Sp2'));
        const dual = ensureDualTemplateStyles([], { lineOrder: 'target-first', marginGap: 56 });
        assert.strictEqual(dual.sourceMarginV, 56);
        assert.strictEqual(dual.targetMarginV, 112);
        const cues = buildDualAssCues([
            { startMs: 0, endMs: 1000, sourceText: 'hello', targetText: '你好' },
        ], dual);
        assert.strictEqual(cues.length, 2);
        assert.strictEqual(cues[0].ass.style, 'Source');
        assert.strictEqual(cues[1].ass.style, 'ZH');
        const exported = applySpeakerMapToExportCues(
            [{ startMs: 0, endMs: 1000, text: 'hi' }],
            {
                speakers,
                cueMarkers: { '0:0': { speakerId: 'spk_1' } },
                speakerStyleMap: map,
            },
        );
        assert.strictEqual(exported[0].ass.style, 'Lead');
        assert.strictEqual(exported[0].ass.name, '甲');

        const applied = applySpeakerMapToCues(
            [{ startMs: 0, endMs: 1000, text: 'hi', ass: { style: 'Default' } }],
            {
                speakers,
                cueMarkers: { '0:0': { speakerId: 'spk_1' } },
                speakerStyleMap: map,
            },
        );
        assert.strictEqual(applied.changed, 1);
        assert.strictEqual(applied.cues[0].ass.style, 'Lead');

        const presets = listStylePresets();
        assert.ok(presets.length >= 7);
        assert.ok(presets.some((p) => p.id === 'box'));
        assert.ok(presets.some((p) => p.id === 'note'));
        assert.ok(presets.some((p) => p.id === 'karaoke'));
        assert.ok(presets.some((p) => p.id === 'neon'));
        const box = applyStylePreset([], 'box', { title: 'P' });
        assert.strictEqual(box.ok, true);
        assert.strictEqual(box.styles[0].borderStyle, 3);
        const pack = applyStylePreset([], 'dual-gray', { title: 'P' });
        assert.strictEqual(pack.ok, true);
        assert.ok(pack.styles.some((s) => s.name === 'Source'));
        assert.ok(pack.styles.some((s) => s.name === 'ZH'));
        assert.ok(summarizeAssExport({
            assMode: 'document',
            styles: [{ name: 'Default' }, { name: 'Lead' }],
            cueCount: 10,
        }).includes('文档样式'));
        assert.ok(summarizeAssExport({
            assMode: 'dual',
            lineOrder: 'target-first',
            cueCount: 10,
        }).includes('双语'));
    });

    it('converts SRT-like cues to ASS session', () => {
        const { convertDocumentToAss, parseStylesFromHeader } = require('../src/js/ass-styles-core');
        const result = convertDocumentToAss(
            [
                { startMs: 0, endMs: 1000, text: '你好' },
                { startMs: 1000, endMs: 2000, text: '世界', ass: { style: 'Title' } },
            ],
            [],
            { title: 'Clip', format: 'srt', path: 'F:/work/demo.srt' },
        );
        assert.strictEqual(result.format, 'ass');
        assert.strictEqual(result.pathChanged, true);
        assert.ok(String(result.path).endsWith('demo.ass'));
        assert.strictEqual(result.metaFilled, 1);
        assert.strictEqual(result.cues[0].ass.style, 'Default');
        assert.strictEqual(result.cues[1].ass.style, 'Title');
        assert.ok(parseStylesFromHeader(result.header).styles.some((s) => s.name === 'Default'));
        const again = convertDocumentToAss(result.cues, result.header, {
            format: 'ass',
            path: result.path,
        });
        assert.strictEqual(again.alreadyAss, true);
        assert.strictEqual(again.changed, false);
    });

    it('serializes ASS document for JASSUB preview', () => {
        const { serializeAssDocument, formatAssTimeMs } = require('../src/js/ass-styles-core');
        assert.strictEqual(formatAssTimeMs(3661050), '1:01:01.05');
        const header = ensureAssHeader([], 'Preview');
        const doc = serializeAssDocument([
            { startMs: 1000, endMs: 2500, text: '{\\an8}你好\\N世界', ass: { style: 'Default', name: 'A' } },
        ], header);
        assert.ok(doc.includes('[V4+ Styles]'));
        assert.ok(doc.includes('[Events]'));
        assert.ok(doc.includes('Dialogue: 0,0:00:01.00,0:00:02.50,Default,A,0,0,0,,{\\an8}你好\\N世界'));
    });
});
