/**
 * ASS override tags + approximate preview helpers (browser + Node)
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAssOverride = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function assOverrideCoreFactory() {
    const OVERRIDE_BLOCK_RE = /\{\\([^}]*)\}/g;

    const COMMON_FONTS = new Set([
        'arial', 'arial unicode ms', 'calibri', 'tahoma', 'verdana', 'segoe ui',
        'microsoft yahei', 'microsoft yahei ui', 'simhei', 'simsun', 'nsimsun',
        'fangsong', 'kaiti', 'dengxian', 'source han sans sc', 'source han sans cn',
        'noto sans cjk sc', 'noto sans sc', 'pingfang sc', 'hiragino sans gb',
        'wenquanyi micro hei', 'sarasa gothic sc', 'ibm plex sans',
        'times new roman', 'courier new', 'consolas',
    ]);

    function stripOverrideTags(text) {
        return String(text || '')
            .replace(OVERRIDE_BLOCK_RE, '')
            .replace(/\\[nN]/g, '\n')
            .replace(/\\h/g, ' ');
    }

    function parseOverrideTags(text) {
        const raw = String(text || '');
        const tags = [];
        let m;
        const re = /\{\\([^}]*)\}/g;
        while ((m = re.exec(raw)) !== null) {
            const body = m[1] || '';
            // Multiple commands may be packed: an8\b1\i1
            const parts = body.split('\\').map((p) => p.trim()).filter(Boolean);
            // First segment may already be command without leading empty
            const cmds = body.startsWith('\\')
                ? body.split('\\').filter(Boolean)
                : (parts.length ? parts : [body]);
            for (const cmd of cmds) {
                tags.push(String(cmd).trim());
            }
        }
        return tags;
    }

    function parseInlineOverrides(text) {
        const tags = parseOverrideTags(text);
        const out = {
            alignment: null,
            bold: null,
            italic: null,
            primaryColour: null,
        };
        for (const tag of tags) {
            const an = tag.match(/^an([1-9])$/i);
            if (an) {
                out.alignment = Number(an[1]);
                continue;
            }
            const a = tag.match(/^a([1-9])$/i);
            if (a) {
                out.alignment = Number(a[1]);
                continue;
            }
            const b = tag.match(/^b(-?\d+)$/i);
            if (b) {
                out.bold = Number(b[1]) !== 0;
                continue;
            }
            const i = tag.match(/^i(-?\d+)$/i);
            if (i) {
                out.italic = Number(i[1]) !== 0;
                continue;
            }
            const c = tag.match(/^c(&H[0-9A-Fa-f]{6,8}&?)$/i) || tag.match(/^1?c(&H[0-9A-Fa-f]{6,8}&?)$/i);
            if (c) {
                let colour = c[1].toUpperCase();
                if (!colour.endsWith('&')) colour += '&';
                if (/^&H[0-9A-F]{6}&$/i.test(colour)) colour = `&H00${colour.slice(2, 8)}&`;
                out.primaryColour = colour.replace(/&$/, '');
                continue;
            }
        }
        return out;
    }

    function setLeadingOverride(text, command) {
        const raw = String(text ?? '');
        const cmd = String(command || '').replace(/^\\/, '');
        if (!cmd) return raw;
        const family = cmd.replace(/[^a-zA-Z].*$/, '').toLowerCase();
        const m = raw.match(/^\{([^}]*)\}/);
        if (!m) return `{\\${cmd}}${raw}`;
        const tokens = [];
        const re = /\\([^\\]+)/g;
        let mm;
        while ((mm = re.exec(m[1])) !== null) tokens.push(mm[1]);
        let replaced = false;
        const nextTokens = tokens.map((tok) => {
            const key = String(tok).replace(/[^a-zA-Z].*$/, '').toLowerCase();
            if (key === family) {
                replaced = true;
                return cmd;
            }
            return tok;
        });
        if (!replaced) nextTokens.push(cmd);
        const block = `{${nextTokens.map((t) => `\\${t}`).join('')}}`;
        return block + raw.slice(m[0].length);
    }

    function clearLeadingOverrideFamily(text, family) {
        const raw = String(text ?? '');
        const fam = String(family || '').toLowerCase();
        const m = raw.match(/^\{([^}]*)\}/);
        if (!m || !fam) return raw;
        const tokens = [];
        const re = /\\([^\\]+)/g;
        let mm;
        while ((mm = re.exec(m[1])) !== null) tokens.push(mm[1]);
        const next = tokens.filter((tok) => String(tok).replace(/[^a-zA-Z].*$/, '').toLowerCase() !== fam);
        if (!next.length) return raw.slice(m[0].length);
        return `{${next.map((t) => `\\${t}`).join('')}}` + raw.slice(m[0].length);
    }

    function toggleLeadingBoolOverride(text, family, onCommand, offCommand) {
        const inline = parseInlineOverrides(text);
        const on = family === 'b' ? inline.bold : family === 'i' ? inline.italic : null;
        if (on) return clearLeadingOverrideFamily(text, family);
        return setLeadingOverride(text, onCommand || `${family}1`);
    }

    function insertSoftBreak(text, start, end) {
        const raw = String(text ?? '');
        const a = Math.max(0, Math.min(raw.length, Number(start) || 0));
        const b = Math.max(a, Math.min(raw.length, Number(end) || a));
        return {
            text: `${raw.slice(0, a)}\\N${raw.slice(b)}`,
            caret: a + 2,
        };
    }

    function wrapSelectionWithOverride(text, start, end, openCmd, closeCmd) {
        const raw = String(text ?? '');
        const a = Math.max(0, Math.min(raw.length, Number(start) || 0));
        const b = Math.max(a, Math.min(raw.length, Number(end) || a));
        const open = `{\\${String(openCmd || '').replace(/^\\/, '')}}`;
        const close = closeCmd != null ? `{\\${String(closeCmd).replace(/^\\/, '')}}` : '';
        if (a === b) {
            const next = raw.slice(0, a) + open + close + raw.slice(b);
            return { text: next, caret: a + open.length };
        }
        const next = raw.slice(0, a) + open + raw.slice(a, b) + close + raw.slice(b);
        return {
            text: next,
            selectionStart: a,
            selectionEnd: a + open.length + (b - a) + close.length,
        };
    }

    /**
     * Resolve approximate CSS preview from Style + inline overrides.
     */
    function resolvePreviewStyle(styleObj, text, options = {}) {
        const stylesCore = options.stylesCore || null;
        const style = styleObj && typeof styleObj === 'object' ? styleObj : null;
        const inline = parseInlineOverrides(text);
        const alignment = inline.alignment
            || (style?.alignment != null ? Number(style.alignment) : 2)
            || 2;
        let colorHex = '#FFFFFF';
        const colour = inline.primaryColour || style?.primaryColour;
        if (colour && stylesCore?.hexFromAssColour) {
            colorHex = stylesCore.hexFromAssColour(colour);
        } else if (colour && /^&H[0-9A-Fa-f]{8}$/i.test(colour)) {
            const m = colour.match(/^&H([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/i);
            if (m) colorHex = `#${m[4]}${m[3]}${m[2]}`.toUpperCase();
        }
        const bold = inline.bold != null ? inline.bold : !!(style && style.bold);
        const italic = inline.italic != null ? inline.italic : !!(style && style.italic);
        const fontSize = Math.max(12, Math.min(64, Number(style?.fontsize) || 24));
        // Map PlayRes ~1080 style size to overlay clamp-ish px
        const previewPx = Math.round(Math.max(14, Math.min(36, fontSize * 0.45)));
        return {
            alignment: Math.min(9, Math.max(1, alignment)),
            color: colorHex,
            fontFamily: style?.fontname || 'Microsoft YaHei, sans-serif',
            fontSizePx: previewPx,
            fontWeight: bold ? 700 : 400,
            fontStyle: italic ? 'italic' : 'normal',
            displayText: stripOverrideTags(text),
            approximate: true,
        };
    }

    function alignmentToCss(alignment) {
        const an = Math.min(9, Math.max(1, Number(alignment) || 2));
        const row = an <= 3 ? 'bottom' : (an <= 6 ? 'middle' : 'top');
        const col = [1, 4, 7].includes(an) ? 'left' : ([3, 6, 9].includes(an) ? 'right' : 'center');
        return { row, col, an };
    }

    function collectStyleFonts(styles) {
        const fonts = [];
        const seen = new Set();
        for (const style of Array.isArray(styles) ? styles : []) {
            const name = String(style?.fontname || '').trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            fonts.push(name);
        }
        return fonts;
    }

    function isCommonFont(fontname) {
        const key = String(fontname || '').trim().toLowerCase();
        if (!key) return true;
        if (COMMON_FONTS.has(key)) return true;
        // Family, fallback lists
        return key.split(',').some((part) => COMMON_FONTS.has(part.trim().toLowerCase()));
    }

    /**
     * @param {object} input
     * @param {object[]} [input.styles]
     * @param {string[]} [input.availableFonts] - lowercased local font family names if known
     */
    function buildFontChecklistItems(input = {}) {
        const fonts = collectStyleFonts(input.styles);
        const available = Array.isArray(input.availableFonts)
            ? new Set(input.availableFonts.map((f) => String(f || '').toLowerCase()))
            : null;
        if (!fonts.length) {
            return [{
                id: 'ass_fonts',
                severity: 'ok',
                label: 'ASS 字体',
                detail: '使用默认样式字体',
                count: 0,
            }];
        }
        const missing = [];
        const uncommon = [];
        for (const font of fonts) {
            const key = font.toLowerCase();
            if (available && available.size) {
                if (![...available].some((a) => a === key || a.includes(key) || key.includes(a))) {
                    missing.push(font);
                }
            } else if (!isCommonFont(font)) {
                uncommon.push(font);
            }
        }
        if (missing.length) {
            return [{
                id: 'ass_fonts',
                severity: 'warn',
                label: 'ASS 字体',
                detail: `本机可能缺失：${missing.slice(0, 3).join('、')}${missing.length > 3 ? '…' : ''}`,
                count: missing.length,
            }];
        }
        if (uncommon.length) {
            return [{
                id: 'ass_fonts',
                severity: 'info',
                label: 'ASS 字体',
                detail: `非常见字体（请确认播放器可用）：${uncommon.slice(0, 3).join('、')}${uncommon.length > 3 ? '…' : ''}`,
                count: uncommon.length,
            }];
        }
        return [{
            id: 'ass_fonts',
            severity: 'ok',
            label: 'ASS 字体',
            detail: `${fonts.length} 种字体 · 常见系统字体`,
            count: fonts.length,
        }];
    }

    return {
        COMMON_FONTS,
        stripOverrideTags,
        parseOverrideTags,
        parseInlineOverrides,
        setLeadingOverride,
        clearLeadingOverrideFamily,
        toggleLeadingBoolOverride,
        insertSoftBreak,
        wrapSelectionWithOverride,
        resolvePreviewStyle,
        alignmentToCss,
        collectStyleFonts,
        isCommonFont,
        buildFontChecklistItems,
    };
}));
