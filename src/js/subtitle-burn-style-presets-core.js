/**
 * Burn-in style presets (Pro) — pure helpers (browser + Node).
 * Dual-line target/source style packs + localStorage custom CRUD.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleBurnStylePresets = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function burnStylePresetsFactory() {
    const STORAGE_KEY = 'transub-burn-style-presets';
    const MAX_CUSTOM = 32;
    const MAX_NAME = 40;
    /** Free tier may apply these builtin presets as-is (no custom edit/save). */
    const FREE_BUILTIN_PRESET_IDS = Object.freeze(['watch-white', 'large-watch']);

    const ALIGN_OPTIONS = Object.freeze([
        { id: 1, label: '左下' },
        { id: 2, label: '中下' },
        { id: 3, label: '右下' },
        { id: 4, label: '左中' },
        { id: 5, label: '正中' },
        { id: 6, label: '右中' },
        { id: 7, label: '左上' },
        { id: 8, label: '中上' },
        { id: 9, label: '右上' },
    ]);

    const BORDER_STYLE_OPTIONS = Object.freeze([
        { id: 1, label: '描边+阴影' },
        { id: 3, label: '不透明底盒' },
    ]);

    function clampInt(n, min, max, fallback) {
        const v = Math.round(Number(n));
        if (!Number.isFinite(v)) return fallback;
        return Math.min(max, Math.max(min, v));
    }

    function clampFloat(n, min, max, fallback) {
        const v = Number(n);
        if (!Number.isFinite(v)) return fallback;
        return Math.min(max, Math.max(min, v));
    }

    function normalizeHexColor(raw, fallback = '#FFFFFF') {
        const s = String(raw || '').trim();
        const m = s.match(/^#?([0-9a-fA-F]{6})$/);
        if (!m) return fallback;
        return `#${m[1].toUpperCase()}`;
    }

    /**
     * ASS colour &HAABBGGRR. opacityPct 0–100 → AA (0=opaque, 100=transparent).
     */
    function hexToAssColour(hex, opacityPct = 100) {
        const h = normalizeHexColor(hex).slice(1);
        const rr = h.slice(0, 2);
        const gg = h.slice(2, 4);
        const bb = h.slice(4, 6);
        const op = clampInt(opacityPct, 0, 100, 100);
        const aa = (255 - Math.round((op / 100) * 255)).toString(16).padStart(2, '0').toUpperCase();
        return `&H${aa}${bb}${gg}${rr}`;
    }

    function defaultLineStyle(role = 'target') {
        if (role === 'source') {
            return {
                fontName: 'Arial',
                fontSize: 16,
                primaryColor: '#AAAAAA',
                shadow: 0,
                shadowColor: '#000000',
                borderStyle: 1,
                outline: 1,
                outlineColor: '#000000',
                outlineAlpha: 100,
                bold: false,
                italic: false,
            };
        }
        return {
            fontName: 'Microsoft YaHei',
            fontSize: 22,
            primaryColor: '#FFFFFF',
            shadow: 0,
            shadowColor: '#000000',
            borderStyle: 1,
            outline: 2,
            outlineColor: '#000000',
            outlineAlpha: 100,
            bold: false,
            italic: false,
        };
    }

    function normalizeLineStyle(raw, role = 'target') {
        const base = defaultLineStyle(role);
        const src = raw && typeof raw === 'object' ? raw : {};
        return {
            fontName: String(src.fontName || base.fontName).replace(/,/g, ' ').trim().slice(0, 64) || base.fontName,
            fontSize: clampInt(src.fontSize, 10, 96, base.fontSize),
            primaryColor: normalizeHexColor(src.primaryColor, base.primaryColor),
            shadow: clampFloat(src.shadow, 0, 12, base.shadow),
            shadowColor: normalizeHexColor(src.shadowColor, base.shadowColor),
            borderStyle: Number(src.borderStyle) === 3 ? 3 : 1,
            outline: clampFloat(src.outline, 0, 12, base.outline),
            outlineColor: normalizeHexColor(src.outlineColor, base.outlineColor),
            outlineAlpha: clampInt(src.outlineAlpha, 0, 100, base.outlineAlpha),
            bold: src.bold === true || src.bold === -1 || src.bold === 1,
            italic: src.italic === true || src.italic === -1 || src.italic === 1,
        };
    }

    function defaultBurnStyle() {
        return {
            target: defaultLineStyle('target'),
            source: defaultLineStyle('source'),
            marginV: 40,
            marginL: 40,
            marginR: 40,
            lineGap: 28,
            alignment: 2,
            lineOrder: 'target-first',
            enableSource: true,
        };
    }

    function normalizeBurnStyle(raw) {
        const base = defaultBurnStyle();
        const src = raw && typeof raw === 'object' ? raw : {};
        // Flat basicStyle compatibility (legacy burn chips).
        const flatTarget = {
            fontName: src.fontName,
            fontSize: src.fontSize,
            primaryColor: src.primaryColor,
            outline: src.outline,
            shadow: src.shadow,
            shadowColor: src.shadowColor,
            borderStyle: src.borderStyle,
            outlineColor: src.outlineColor,
            outlineAlpha: src.outlineAlpha,
            bold: src.bold,
            italic: src.italic,
        };
        const hasNested = src.target && typeof src.target === 'object';
        const lineOrder = String(src.lineOrder || base.lineOrder).trim().toLowerCase();
        return {
            target: normalizeLineStyle(hasNested ? src.target : { ...base.target, ...flatTarget }, 'target'),
            source: normalizeLineStyle(src.source || base.source, 'source'),
            marginV: clampInt(src.marginV, 0, 400, base.marginV),
            marginL: clampInt(src.marginL, 0, 400, base.marginL),
            marginR: clampInt(src.marginR, 0, 400, base.marginR),
            lineGap: clampInt(src.lineGap, 8, 200, base.lineGap),
            alignment: clampInt(src.alignment, 1, 9, base.alignment),
            lineOrder: lineOrder === 'source-first' || lineOrder === 'source' ? 'source-first' : 'target-first',
            enableSource: src.enableSource === true,
        };
    }

    /**
     * Flatten to legacy basicStyle shape used by burn chips / jobs.
     */
    function toBasicStyle(burnStyleInput) {
        const s = normalizeBurnStyle(burnStyleInput);
        return {
            fontName: s.target.fontName,
            fontSize: s.target.fontSize,
            primaryColor: s.target.primaryColor,
            outline: s.target.outline,
            marginV: s.marginV,
            shadow: s.target.shadow,
            shadowColor: s.target.shadowColor,
            borderStyle: s.target.borderStyle,
            outlineColor: s.target.outlineColor,
            outlineAlpha: s.target.outlineAlpha,
            bold: s.target.bold,
            italic: s.target.italic,
            marginL: s.marginL,
            marginR: s.marginR,
            alignment: s.alignment,
            lineGap: s.lineGap,
            lineOrder: s.lineOrder,
            enableSource: s.enableSource,
            source: { ...s.source },
            target: { ...s.target },
        };
    }

    function dualMargins(style) {
        const s = normalizeBurnStyle(style);
        const gap = s.lineGap;
        const base = s.marginV;
        if (s.lineOrder === 'source-first') {
            return { sourceMarginV: base + gap, targetMarginV: base };
        }
        return { targetMarginV: base + gap, sourceMarginV: base };
    }

    function buildForceStyle(styleInput) {
        const s = normalizeBurnStyle(styleInput);
        const t = s.target;
        const parts = [];
        if (t.fontName) parts.push(`FontName=${t.fontName}`);
        parts.push(`FontSize=${t.fontSize}`);
        parts.push(`PrimaryColour=${hexToAssColour(t.primaryColor, 100)}`);
        parts.push(`OutlineColour=${hexToAssColour(t.outlineColor, t.outlineAlpha)}`);
        parts.push(`BackColour=${hexToAssColour(t.shadowColor, 50)}`);
        parts.push(`Bold=${t.bold ? -1 : 0}`);
        parts.push(`Italic=${t.italic ? -1 : 0}`);
        parts.push(`BorderStyle=${t.borderStyle}`);
        parts.push(`Outline=${t.outline}`);
        parts.push(`Shadow=${t.shadow}`);
        parts.push(`Alignment=${s.alignment}`);
        parts.push(`MarginL=${s.marginL}`);
        parts.push(`MarginR=${s.marginR}`);
        parts.push(`MarginV=${s.marginV}`);
        return parts.join(',');
    }

    function lineToAssStyleFields(line, extras = {}) {
        const l = normalizeLineStyle(line, extras.role || 'target');
        return {
            fontname: l.fontName,
            fontsize: Math.round(l.fontSize * 2),
            primaryColour: hexToAssColour(l.primaryColor, 100),
            outlineColour: hexToAssColour(l.outlineColor, l.outlineAlpha),
            backColour: hexToAssColour(l.shadowColor, 50),
            bold: l.bold ? -1 : 0,
            italic: l.italic ? -1 : 0,
            borderStyle: l.borderStyle,
            outline: l.outline,
            shadow: l.shadow,
            alignment: extras.alignment != null ? extras.alignment : 2,
            marginL: extras.marginL != null ? extras.marginL : 40,
            marginR: extras.marginR != null ? extras.marginR : 40,
            marginV: extras.marginV != null ? extras.marginV : 40,
        };
    }

    function styleLineAss(name, fields) {
        const f = fields || {};
        return [
            'Style: ',
            name, ',',
            f.fontname || 'Arial', ',',
            f.fontsize != null ? f.fontsize : 44, ',',
            f.primaryColour || '&H00FFFFFF', ',',
            '&H000000FF', ',',
            f.outlineColour || '&H00000000', ',',
            f.backColour || '&H80000000', ',',
            f.bold || 0, ',',
            f.italic || 0, ',',
            '0,0,100,100,0,0,',
            f.borderStyle != null ? f.borderStyle : 1, ',',
            f.outline != null ? f.outline : 2, ',',
            f.shadow != null ? f.shadow : 0, ',',
            f.alignment != null ? f.alignment : 2, ',',
            f.marginL != null ? f.marginL : 40, ',',
            f.marginR != null ? f.marginR : 40, ',',
            f.marginV != null ? f.marginV : 40, ',',
            '1',
        ].join('');
    }

    /**
     * Rewrite Default / ZH / Source style lines in an ASS document from burn style.
     */
    function rewriteAssDocumentStyles(assText, burnStyleInput) {
        const text = String(assText || '');
        if (!/\[V4\+?\s*Styles\]/i.test(text)) {
            return { ok: false, error: '不是有效的 ASS 文档' };
        }
        const s = normalizeBurnStyle(burnStyleInput);
        const margins = dualMargins(s);
        const targetFields = lineToAssStyleFields(s.target, {
            role: 'target',
            alignment: s.alignment,
            marginL: s.marginL,
            marginR: s.marginR,
            marginV: s.enableSource ? margins.targetMarginV : s.marginV,
        });
        const sourceFields = lineToAssStyleFields(s.source, {
            role: 'source',
            alignment: s.alignment,
            marginL: s.marginL,
            marginR: s.marginR,
            marginV: margins.sourceMarginV,
        });
        const defaultFields = { ...targetFields };

        const replaceStyle = (body, styleName, fields) => {
            const re = new RegExp(`^Style:\\s*${styleName}\\b.*$`, 'im');
            const line = styleLineAss(styleName, fields);
            if (re.test(body)) return body.replace(re, line);
            // Insert after Format: line inside styles section if missing.
            return body.replace(
                /(\[V4\+?\s*Styles\][^\n]*\nFormat:[^\n]*\n)/i,
                `$1${line}\n`,
            );
        };

        let next = text;
        next = replaceStyle(next, 'Default', defaultFields);
        next = replaceStyle(next, 'ZH', targetFields);
        if (s.enableSource) {
            next = replaceStyle(next, 'Source', sourceFields);
        }
        return { ok: true, text: next, dual: s.enableSource };
    }

    function presetId() {
        return `burnstyle_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    }

    function sanitizeName(name) {
        return String(name || '').replace(/[\r\n]/g, ' ').trim().slice(0, MAX_NAME) || '我的样式';
    }

    function isFreeBuiltinPresetId(id) {
        return FREE_BUILTIN_PRESET_IDS.includes(String(id || '').trim());
    }

    function canUsePreset(id, { proEntitled = false } = {}) {
        const want = String(id || '').trim();
        if (!want) return { ok: false, error: '缺少预设' };
        if (proEntitled) return { ok: true, free: isFreeBuiltinPresetId(want) };
        if (isFreeBuiltinPresetId(want)) return { ok: true, free: true };
        const pack = getBuiltin(want) || null;
        if (pack?.builtin) {
            return { ok: false, error: '该内置预设需要 Pro', needPro: true, free: false };
        }
        return { ok: false, error: '自定义样式预设需要 Pro', needPro: true, free: false };
    }

    function listBuiltinPresets() {
        return [
            {
                id: 'watch-white',
                name: '观影白字',
                detail: '雅黑白字 · 黑描边 · 底部居中',
                builtin: true,
                free: true,
                style: normalizeBurnStyle({
                    target: {
                        fontName: 'Microsoft YaHei',
                        fontSize: 22,
                        primaryColor: '#FFFFFF',
                        outline: 2,
                        outlineColor: '#000000',
                        outlineAlpha: 100,
                        shadow: 1,
                        shadowColor: '#000000',
                        borderStyle: 1,
                    },
                    source: {
                        fontName: 'Arial',
                        fontSize: 15,
                        primaryColor: '#B0B0B0',
                        outline: 1,
                        outlineColor: '#000000',
                        outlineAlpha: 100,
                        shadow: 0,
                        borderStyle: 1,
                    },
                    marginV: 40,
                    lineGap: 28,
                    alignment: 2,
                    enableSource: true,
                }),
            },
            {
                id: 'large-watch',
                name: '大字号观影',
                detail: '字号加大 · 粗描边 · 适合远距',
                builtin: true,
                free: true,
                style: normalizeBurnStyle({
                    target: {
                        fontName: 'Microsoft YaHei',
                        fontSize: 30,
                        primaryColor: '#FFFFFF',
                        outline: 3,
                        outlineColor: '#000000',
                        shadow: 2,
                        borderStyle: 1,
                    },
                    source: {
                        fontName: 'Arial',
                        fontSize: 18,
                        primaryColor: '#CCCCCC',
                        outline: 2,
                        borderStyle: 1,
                    },
                    marginV: 48,
                    lineGap: 34,
                    alignment: 2,
                    enableSource: true,
                }),
            },
            {
                id: 'dual-gray',
                name: '双行灰原',
                detail: '译文白字 + 原文灰色小字',
                builtin: true,
                free: false,
                style: normalizeBurnStyle({
                    target: {
                        fontName: 'Microsoft YaHei',
                        fontSize: 22,
                        primaryColor: '#FFFFFF',
                        outline: 2,
                        shadow: 1,
                        borderStyle: 1,
                    },
                    source: {
                        fontName: 'Arial',
                        fontSize: 14,
                        primaryColor: '#999999',
                        outline: 1,
                        outlineColor: '#000000',
                        shadow: 0,
                        borderStyle: 1,
                    },
                    marginV: 36,
                    lineGap: 30,
                    alignment: 2,
                    lineOrder: 'target-first',
                    enableSource: true,
                }),
            },
            {
                id: 'box-bottom',
                name: '盒底字幕',
                detail: '不透明底盒 · 远场更易读',
                builtin: true,
                free: false,
                style: normalizeBurnStyle({
                    target: {
                        fontName: 'Microsoft YaHei',
                        fontSize: 22,
                        primaryColor: '#FFFFFF',
                        outline: 4,
                        outlineColor: '#000000',
                        outlineAlpha: 100,
                        shadow: 0,
                        shadowColor: '#000000',
                        borderStyle: 3,
                    },
                    source: {
                        fontName: 'Arial',
                        fontSize: 15,
                        primaryColor: '#E0E0E0',
                        outline: 3,
                        borderStyle: 3,
                        shadow: 0,
                    },
                    marginV: 44,
                    lineGap: 32,
                    alignment: 2,
                    enableSource: true,
                }),
            },
            {
                id: 'yellow-classic',
                name: '经典黄字',
                detail: '黄字黑边 · 常见硬字幕风格',
                builtin: true,
                free: false,
                style: normalizeBurnStyle({
                    target: {
                        fontName: 'Microsoft YaHei',
                        fontSize: 24,
                        primaryColor: '#FFFF00',
                        outline: 2,
                        outlineColor: '#000000',
                        shadow: 1,
                        shadowColor: '#000000',
                        borderStyle: 1,
                    },
                    source: {
                        fontName: 'Arial',
                        fontSize: 16,
                        primaryColor: '#FFD700',
                        outline: 1,
                        borderStyle: 1,
                    },
                    marginV: 40,
                    lineGap: 28,
                    alignment: 2,
                    enableSource: true,
                }),
            },
            {
                id: 'top-note',
                name: '顶部注释',
                detail: '顶中对齐 · 适合片头/注记',
                builtin: true,
                free: false,
                style: normalizeBurnStyle({
                    target: {
                        fontName: 'Microsoft YaHei',
                        fontSize: 20,
                        primaryColor: '#FFFFFF',
                        outline: 2,
                        shadow: 1,
                        borderStyle: 1,
                    },
                    source: {
                        fontName: 'Arial',
                        fontSize: 14,
                        primaryColor: '#B0B0B0',
                        outline: 1,
                        borderStyle: 1,
                    },
                    marginV: 36,
                    lineGap: 26,
                    alignment: 8,
                    enableSource: false,
                }),
            },
        ];
    }

    function getBuiltin(id) {
        const want = String(id || '').trim();
        return listBuiltinPresets().find((p) => p.id === want) || null;
    }

    function defaultFreePreset() {
        return getBuiltin(FREE_BUILTIN_PRESET_IDS[0]);
    }

    function normalizeCustomPreset(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const style = normalizeBurnStyle(raw.style || raw);
        return {
            id: String(raw.id || presetId()).slice(0, 64),
            name: sanitizeName(raw.name),
            detail: String(raw.detail || '').trim().slice(0, 80),
            builtin: false,
            style,
            createdAt: String(raw.createdAt || new Date().toISOString()),
            updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString()),
        };
    }

    function readStorage(storage) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store?.getItem) return [];
        try {
            const raw = store.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.presets) ? parsed.presets : []);
            return list.map(normalizeCustomPreset).filter(Boolean).slice(0, MAX_CUSTOM);
        } catch (_) {
            return [];
        }
    }

    function writeStorage(presets, storage) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store?.setItem) return { ok: false, error: '无本地存储' };
        try {
            store.setItem(STORAGE_KEY, JSON.stringify({
                version: 1,
                presets: (Array.isArray(presets) ? presets : []).slice(0, MAX_CUSTOM),
            }));
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    }

    function listCustomPresets(storage) {
        return readStorage(storage);
    }

    function listAllPresets(storage) {
        return [
            ...listBuiltinPresets(),
            ...listCustomPresets(storage),
        ];
    }

    function getPreset(id, storage) {
        const want = String(id || '').trim();
        if (!want) return null;
        return getBuiltin(want) || listCustomPresets(storage).find((p) => p.id === want) || null;
    }

    function upsertCustomPreset(input, storage) {
        const pack = normalizeCustomPreset({
            ...input,
            id: input?.id && !String(input.id).startsWith('builtin') ? input.id : (input?.id || presetId()),
            builtin: false,
            updatedAt: new Date().toISOString(),
            createdAt: input?.createdAt || new Date().toISOString(),
        });
        if (!pack) return { ok: false, error: '预设无效' };
        if (getBuiltin(pack.id)) {
            return { ok: false, error: '不能覆盖内置预设，请另存为新预设' };
        }
        const list = listCustomPresets(storage).filter((p) => p.id !== pack.id);
        list.unshift(pack);
        const written = writeStorage(list.slice(0, MAX_CUSTOM), storage);
        if (!written.ok) return written;
        return { ok: true, preset: pack };
    }

    function deleteCustomPreset(id, storage) {
        const want = String(id || '').trim();
        if (!want) return { ok: false, error: '缺少预设 id' };
        if (getBuiltin(want)) return { ok: false, error: '不能删除内置预设' };
        const prev = listCustomPresets(storage);
        const next = prev.filter((p) => p.id !== want);
        if (next.length === prev.length) return { ok: false, error: '找不到该预设' };
        const written = writeStorage(next, storage);
        if (!written.ok) return written;
        return { ok: true, deletedId: want };
    }

    function summarizeStyle(styleInput) {
        const s = normalizeBurnStyle(styleInput);
        const t = s.target;
        const bits = [
            t.fontName || '默认字体',
            `${t.fontSize}px`,
            t.primaryColor,
            `描边${t.outline}`,
            `阴影${t.shadow}`,
            `边距${s.marginV}`,
        ];
        if (s.enableSource) bits.push(`双语行距${s.lineGap}`);
        return bits.join(' · ');
    }

    return {
        STORAGE_KEY,
        MAX_CUSTOM,
        FREE_BUILTIN_PRESET_IDS,
        ALIGN_OPTIONS,
        BORDER_STYLE_OPTIONS,
        defaultLineStyle,
        defaultBurnStyle,
        normalizeLineStyle,
        normalizeBurnStyle,
        normalizeHexColor,
        hexToAssColour,
        toBasicStyle,
        dualMargins,
        buildForceStyle,
        lineToAssStyleFields,
        rewriteAssDocumentStyles,
        listBuiltinPresets,
        listCustomPresets,
        listAllPresets,
        getBuiltin,
        getPreset,
        defaultFreePreset,
        isFreeBuiltinPresetId,
        canUsePreset,
        upsertCustomPreset,
        deleteCustomPreset,
        sanitizeName,
        summarizeStyle,
        presetId,
    };
}));
