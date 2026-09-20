const assert = require('assert');
const presets = require('../src/js/subtitle-burn-style-presets-core');

describe('subtitle-burn-style-presets-core', () => {
    it('lists builtin presets with dual styles', () => {
        const list = presets.listBuiltinPresets();
        assert.ok(list.length >= 5);
        const dual = list.find((p) => p.id === 'dual-gray');
        assert.ok(dual);
        assert.strictEqual(dual.style.enableSource, true);
        assert.ok(dual.style.target.fontSize >= 10);
        assert.ok(dual.style.source.primaryColor);
        const free = list.filter((p) => p.free);
        assert.deepStrictEqual(free.map((p) => p.id).sort(), ['large-watch', 'watch-white']);
    });

    it('gates free vs pro presets', () => {
        assert.strictEqual(presets.canUsePreset('watch-white', { proEntitled: false }).ok, true);
        assert.strictEqual(presets.canUsePreset('large-watch', { proEntitled: false }).ok, true);
        assert.strictEqual(presets.canUsePreset('dual-gray', { proEntitled: false }).ok, false);
        assert.strictEqual(presets.canUsePreset('dual-gray', { proEntitled: true }).ok, true);
        assert.ok(presets.defaultFreePreset()?.id === 'watch-white');
    });

    it('builds rich force_style from burn style', () => {
        const force = presets.buildForceStyle({
            target: {
                fontName: 'Microsoft YaHei',
                fontSize: 24,
                primaryColor: '#FFFFFF',
                outline: 2,
                outlineColor: '#000000',
                outlineAlpha: 100,
                shadow: 1,
                borderStyle: 1,
            },
            marginV: 48,
            marginL: 32,
            marginR: 32,
            alignment: 2,
        });
        assert.ok(force.includes('FontName=Microsoft YaHei'));
        assert.ok(force.includes('FontSize=24'));
        assert.ok(force.includes('Shadow=1'));
        assert.ok(force.includes('Alignment=2'));
        assert.ok(force.includes('MarginV=48'));
        assert.ok(force.includes('MarginL=32'));
    });

    it('custom preset CRUD in memory storage', () => {
        const store = {
            data: {},
            getItem(k) { return this.data[k] || null; },
            setItem(k, v) { this.data[k] = String(v); },
        };
        const created = presets.upsertCustomPreset({
            name: '测试黄字',
            style: {
                enableSource: true,
                target: { fontSize: 26, primaryColor: '#FFFF00', outline: 2 },
                source: { fontSize: 14, primaryColor: '#AAAAAA' },
                marginV: 42,
                lineGap: 30,
            },
        }, store);
        assert.strictEqual(created.ok, true);
        assert.strictEqual(presets.listCustomPresets(store).length, 1);
        const got = presets.getPreset(created.preset.id, store);
        assert.ok(got);
        assert.strictEqual(got.style.target.primaryColor, '#FFFF00');

        const del = presets.deleteCustomPreset(created.preset.id, store);
        assert.strictEqual(del.ok, true);
        assert.strictEqual(presets.listCustomPresets(store).length, 0);
    });

    it('refuses deleting builtin', () => {
        const res = presets.deleteCustomPreset('watch-white');
        assert.strictEqual(res.ok, false);
    });

    it('rewrites ASS Default/ZH/Source styles', () => {
        const ass = `[Script Info]
Title: Test
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,40,1
Style: ZH,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,56,1
Style: Source,Arial,40,&H00AAAAAA,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,2,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,ZH,,0,0,0,,你好
`;
        const out = presets.rewriteAssDocumentStyles(ass, {
            enableSource: true,
            target: { fontName: 'Microsoft YaHei', fontSize: 22, primaryColor: '#FFFFFF', outline: 3 },
            source: { fontName: 'Arial', fontSize: 14, primaryColor: '#999999' },
            marginV: 40,
            lineGap: 28,
            alignment: 2,
        });
        assert.strictEqual(out.ok, true);
        assert.ok(/Style: ZH,Microsoft YaHei,/i.test(out.text));
        assert.ok(/Style: Source,Arial,/i.test(out.text));
        assert.ok(out.text.includes('你好'));
    });

    it('toBasicStyle flattens target for burn chips', () => {
        const basic = presets.toBasicStyle({
            enableSource: true,
            target: { fontSize: 28, primaryColor: '#00FF00', outline: 3 },
            marginV: 50,
        });
        assert.strictEqual(basic.fontSize, 28);
        assert.strictEqual(basic.primaryColor, '#00FF00');
        assert.strictEqual(basic.outline, 3);
        assert.strictEqual(basic.marginV, 50);
        assert.strictEqual(basic.enableSource, true);
    });
});
