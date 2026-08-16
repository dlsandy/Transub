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
            fontsize: null,
            posX: null,
            posY: null,
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
            const fs = tag.match(/^fs(\d+(?:\.\d+)?)$/i);
            if (fs) {
                out.fontsize = Number(fs[1]);
                continue;
            }
            const pos = tag.match(/^pos\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/i);
            if (pos) {
                out.posX = Number(pos[1]);
                out.posY = Number(pos[2]);
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

    /** Build ASS primary-colour override command from #RRGGBB. */
    function colourOverrideCommand(hex, stylesCore) {
        const colour = stylesCore?.assColourFromHex
            ? stylesCore.assColourFromHex(hex)
            : null;
        if (!colour) return null;
        // {\c&HBBGGRR&} — omit alpha for wider player compat
        const body = String(colour).replace(/^&H/i, '').replace(/&$/, '');
        const bgr = body.length >= 8 ? body.slice(2, 8) : body.slice(0, 6);
        return `c&H${bgr.toUpperCase()}&`;
    }

    function fontsizeOverrideCommand(size) {
        const n = Math.max(8, Math.min(200, Math.round(Number(size) || 0)));
        if (!n) return null;
        return `fs${n}`;
    }

    function clampInt(value, min, max, fallback) {
        const n = Math.round(Number(value));
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    function fadeCommand(inMs, outMs) {
        const a = clampInt(inMs, 0, 10000, 200);
        const b = clampInt(outMs, 0, 10000, 200);
        return `fad(${a},${b})`;
    }

    function blurCommand(amount) {
        const n = clampInt(amount, 0, 20, 1);
        return n <= 0 ? null : `blur${n}`;
    }

    function bordCommand(width) {
        const n = Math.max(0, Math.min(20, Number(width) || 0));
        return `bord${Number.isInteger(n) ? n : n.toFixed(1)}`;
    }

    function shadCommand(depth) {
        const n = Math.max(0, Math.min(20, Number(depth) || 0));
        return `shad${Number.isInteger(n) ? n : n.toFixed(1)}`;
    }

    function posCommand(x, y) {
        const px = clampInt(x, 0, 10000, 960);
        const py = clampInt(y, 0, 10000, 980);
        return `pos(${px},${py})`;
    }

    /**
     * Video element content box inside the layout rect (object-fit: contain).
     */
    function getVideoContentRect(video) {
        if (!video?.getBoundingClientRect) return null;
        const rect = video.getBoundingClientRect();
        const vw = Number(video.videoWidth) || 0;
        const vh = Number(video.videoHeight) || 0;
        if (!rect.width || !rect.height || !vw || !vh) {
            return {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                scale: 1,
            };
        }
        const scale = Math.min(rect.width / vw, rect.height / vh);
        const width = vw * scale;
        const height = vh * scale;
        return {
            left: rect.left + (rect.width - width) / 2,
            top: rect.top + (rect.height - height) / 2,
            width,
            height,
            scale,
        };
    }

    function parsePlayResFromHeader(headerLines, fallbackX = 1920, fallbackY = 1080) {
        let x = fallbackX;
        let y = fallbackY;
        for (const line of Array.isArray(headerLines) ? headerLines : []) {
            const s = String(line || '');
            const mx = s.match(/^PlayResX:\s*(\d+)/i);
            if (mx) x = Number(mx[1]) || x;
            const my = s.match(/^PlayResY:\s*(\d+)/i);
            if (my) y = Number(my[1]) || y;
        }
        return {
            playResX: Math.max(320, Math.round(x) || fallbackX),
            playResY: Math.max(240, Math.round(y) || fallbackY),
        };
    }

    function clientPointToPlayRes(clientX, clientY, video, playResX, playResY) {
        const box = getVideoContentRect(video);
        if (!box || !box.width || !box.height) return null;
        const prx = Math.max(1, Number(playResX) || 1920);
        const pry = Math.max(1, Number(playResY) || 1080);
        const nx = (Number(clientX) - box.left) / box.width;
        const ny = (Number(clientY) - box.top) / box.height;
        return {
            x: Math.max(0, Math.min(prx, Math.round(nx * prx))),
            y: Math.max(0, Math.min(pry, Math.round(ny * pry))),
            nx: Math.max(0, Math.min(1, nx)),
            ny: Math.max(0, Math.min(1, ny)),
        };
    }

    function playResToClientPoint(x, y, video, playResX, playResY) {
        const box = getVideoContentRect(video);
        if (!box || !box.width || !box.height) return null;
        const prx = Math.max(1, Number(playResX) || 1920);
        const pry = Math.max(1, Number(playResY) || 1080);
        return {
            clientX: box.left + (Number(x) / prx) * box.width,
            clientY: box.top + (Number(y) / pry) * box.height,
            leftPx: (Number(x) / prx) * box.width,
            topPx: (Number(y) / pry) * box.height,
        };
    }

    /**
     * Default alignment point when cue has no {\pos}.
     * Uses Style alignment + MarginV when available.
     */
    function defaultPosForStyle(styleObj, playResX, playResY) {
        const prx = Math.max(1, Number(playResX) || 1920);
        const pry = Math.max(1, Number(playResY) || 1080);
        const an = Math.min(9, Math.max(1, Number(styleObj?.alignment) || 2));
        const marginV = Math.max(0, Number(styleObj?.marginV) || 48);
        const marginL = Math.max(0, Number(styleObj?.marginL) || 40);
        const marginR = Math.max(0, Number(styleObj?.marginR) || 40);
        const col = [1, 4, 7].includes(an) ? 'left' : ([3, 6, 9].includes(an) ? 'right' : 'center');
        const row = an <= 3 ? 'bottom' : (an <= 6 ? 'middle' : 'top');
        let x = Math.round(prx / 2);
        if (col === 'left') x = marginL;
        if (col === 'right') x = prx - marginR;
        let y = pry - marginV;
        if (row === 'top') y = marginV;
        if (row === 'middle') y = Math.round(pry / 2);
        return { x, y, alignment: an };
    }

    function resolveCuePos(text, styleObj, playResX, playResY) {
        const inline = parseInlineOverrides(text);
        if (inline.posX != null && inline.posY != null) {
            return { x: inline.posX, y: inline.posY, fromOverride: true };
        }
        const def = defaultPosForStyle(styleObj, playResX, playResY);
        return { ...def, fromOverride: false };
    }

    /** Position for a numpad alignment (1–9), using Style margins when present. */
    function posForAlignment(alignment, styleObj, playResX, playResY) {
        const an = Math.min(9, Math.max(1, Number(alignment) || 2));
        return defaultPosForStyle({ ...(styleObj || {}), alignment: an }, playResX, playResY);
    }

    function clampPosToPlayRes(x, y, playResX, playResY) {
        const prx = Math.max(1, Number(playResX) || 1920);
        const pry = Math.max(1, Number(playResY) || 1080);
        return {
            x: Math.max(0, Math.min(prx, Math.round(Number(x) || 0))),
            y: Math.max(0, Math.min(pry, Math.round(Number(y) || 0))),
            playResX: prx,
            playResY: pry,
        };
    }

    function nudgePos(x, y, dx, dy, playResX, playResY) {
        return clampPosToPlayRes(
            (Number(x) || 0) + (Number(dx) || 0),
            (Number(y) || 0) + (Number(dy) || 0),
            playResX,
            playResY,
        );
    }

    function moveCommand(x1, y1, x2, y2, t1, t2) {
        const a = clampInt(x1, 0, 10000, 960);
        const b = clampInt(y1, 0, 10000, 980);
        const c = clampInt(x2, 0, 10000, 960);
        const d = clampInt(y2, 0, 10000, 900);
        if (t1 != null || t2 != null) {
            const ta = clampInt(t1, 0, 60000, 0);
            const tb = clampInt(t2, 0, 60000, 1000);
            return `move(${a},${b},${c},${d},${ta},${tb})`;
        }
        return `move(${a},${b},${c},${d})`;
    }

    function frzCommand(degrees) {
        const n = clampInt(degrees, -360, 360, 0);
        return `frz${n}`;
    }

    function alphaCommand(hexAa) {
        const raw = String(hexAa || '00').replace(/^&H/i, '').replace(/&$/i, '');
        const aa = /^[0-9A-Fa-f]{2}$/.test(raw) ? raw.toUpperCase() : '00';
        return `alpha&H${aa}&`;
    }

    const EFFECT_CLEAR_FAMILIES = [
        'fad', 'fade', 'blur', 'be', 'bord', 'shad', 'pos', 'move', 'frz', 'frx', 'fry',
        'fscx', 'fscy', 'org', 'clip', 'iclip', 'alpha', '1a', '2a', '3a', '4a',
    ];

    function clearLeadingOverrideFamilies(text, families) {
        let next = String(text ?? '');
        const list = Array.isArray(families) ? families : EFFECT_CLEAR_FAMILIES;
        for (const fam of list) {
            next = clearLeadingOverrideFamily(next, fam);
        }
        return next;
    }

    /**
     * Built-in ASS inline effect packs (leading override tags).
     * `build(options)` may use cueDurationMs / playResX / playResY.
     */
    function listEffectPresets() {
        return [
            {
                id: 'fade-soft',
                label: '淡入淡出',
                detail: '{\\fad(300,300)}',
                build: (opts = {}) => {
                    const dur = Math.max(0, Number(opts.cueDurationMs) || 0);
                    const half = dur > 0 ? Math.min(300, Math.floor(dur / 3)) : 300;
                    return fadeCommand(half || 200, half || 200);
                },
            },
            {
                id: 'fade-quick',
                label: '快淡入出',
                detail: '{\\fad(150,150)}',
                build: () => fadeCommand(150, 150),
            },
            {
                id: 'fade-in',
                label: '仅淡入',
                detail: '{\\fad(400,0)}',
                build: () => fadeCommand(400, 0),
            },
            {
                id: 'fade-out',
                label: '仅淡出',
                detail: '{\\fad(0,400)}',
                build: () => fadeCommand(0, 400),
            },
            {
                id: 'blur-soft',
                label: '柔光模糊',
                detail: '{\\blur1.5}',
                build: () => 'blur1.5',
            },
            {
                id: 'blur-strong',
                label: '强模糊',
                detail: '{\\blur3}',
                build: () => blurCommand(3),
            },
            {
                id: 'bord-thick',
                label: '加粗描边',
                detail: '{\\bord4}',
                build: () => bordCommand(4),
            },
            {
                id: 'shad-deep',
                label: '加深阴影',
                detail: '{\\shad3}',
                build: () => shadCommand(3),
            },
            {
                id: 'pos-bottom',
                label: '定位底部',
                detail: '{\\pos(960,980)} · PlayRes 1920×1080',
                build: (opts = {}) => {
                    const w = clampInt(opts.playResX, 320, 10000, 1920);
                    const h = clampInt(opts.playResY, 240, 10000, 1080);
                    return posCommand(Math.round(w / 2), Math.round(h * 0.907));
                },
            },
            {
                id: 'pos-top',
                label: '定位顶部',
                detail: '{\\pos(960,80)}',
                build: (opts = {}) => {
                    const w = clampInt(opts.playResX, 320, 10000, 1920);
                    const h = clampInt(opts.playResY, 240, 10000, 1080);
                    return posCommand(Math.round(w / 2), Math.round(h * 0.074));
                },
            },
            {
                id: 'move-up',
                label: '上移入画',
                detail: '{\\move} 自下而上',
                build: (opts = {}) => {
                    const w = clampInt(opts.playResX, 320, 10000, 1920);
                    const h = clampInt(opts.playResY, 240, 10000, 1080);
                    const dur = Math.max(400, Math.min(2000, Number(opts.cueDurationMs) || 800));
                    const x = Math.round(w / 2);
                    return moveCommand(x, Math.round(h * 0.98), x, Math.round(h * 0.88), 0, Math.min(800, dur));
                },
            },
            {
                id: 'frz-tilt',
                label: '轻微旋转',
                detail: '{\\frz-3}',
                build: () => frzCommand(-3),
            },
            {
                id: 'alpha-soft',
                label: '半透明',
                detail: '{\\alpha&H80&}',
                build: () => alphaCommand('80'),
            },
            {
                id: 'clear-fx',
                label: '清除特效标签',
                detail: '移除 fad/blur/pos/move 等常见特效',
                clear: true,
                families: EFFECT_CLEAR_FAMILIES,
            },
        ];
    }

    function applyEffectPreset(text, presetId, options = {}) {
        const presets = listEffectPresets();
        const hit = presets.find((p) => p.id === presetId);
        if (!hit) return { text: String(text ?? ''), ok: false, error: '未知特效' };
        if (hit.clear) {
            return {
                text: clearLeadingOverrideFamilies(text, hit.families || EFFECT_CLEAR_FAMILIES),
                ok: true,
                presetId: hit.id,
                label: hit.label,
                cleared: true,
            };
        }
        const cmd = typeof hit.build === 'function' ? hit.build(options) : hit.command;
        if (!cmd) return { text: String(text ?? ''), ok: false, error: '无法生成特效' };
        return {
            text: setLeadingOverride(text, cmd),
            ok: true,
            presetId: hit.id,
            label: hit.label,
            command: cmd,
        };
    }

    function applyEffectPresetToCues(cues, indexes, presetId, options = {}) {
        const list = Array.isArray(cues) ? cues.slice() : [];
        const set = new Set((Array.isArray(indexes) ? indexes : []).map((i) => Number(i)).filter((i) => Number.isInteger(i) && i >= 0));
        let changed = 0;
        let lastLabel = '';
        for (const i of set) {
            if (i >= list.length) continue;
            const cue = list[i];
            if (!cue) continue;
            const start = Number(cue.startMs) || 0;
            const end = cue.endMs != null && Number.isFinite(Number(cue.endMs))
                ? Number(cue.endMs)
                : start + 2000;
            const dur = Math.max(0, Math.round(end - start));
            const result = applyEffectPreset(cue.text || '', presetId, {
                ...options,
                cueDurationMs: dur,
            });
            if (!result.ok) continue;
            if (String(result.text) === String(cue.text || '')) continue;
            list[i] = { ...cue, text: result.text };
            changed += 1;
            lastLabel = result.label || lastLabel;
        }
        return { cues: list, changed, presetId, label: lastLabel };
    }

    const DIALOGUE_EFFECT_PRESETS = [
        { id: '', label: '（无 Effect）' },
        { id: 'Banner;5;0;50', label: 'Banner 横幅滚动' },
        { id: 'Scroll up;50;0;50', label: 'Scroll up 上滚' },
        { id: 'Scroll down;50;0;50', label: 'Scroll down 下滚' },
    ];

    function listDialogueEffectPresets() {
        return DIALOGUE_EFFECT_PRESETS.slice();
    }

    function normalizeDialogueEffect(value) {
        return String(value || '').replace(/,/g, ' ').trim().slice(0, 120);
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
        const fontSize = Math.max(12, Math.min(96, Number(inline.fontsize != null ? inline.fontsize : style?.fontsize) || 24));
        // Map PlayRes ~1080 style size to overlay clamp-ish px
        const previewPx = Math.round(Math.max(14, Math.min(40, fontSize * 0.45)));
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
        colourOverrideCommand,
        fontsizeOverrideCommand,
        fadeCommand,
        blurCommand,
        bordCommand,
        shadCommand,
        posCommand,
        getVideoContentRect,
        parsePlayResFromHeader,
        clientPointToPlayRes,
        playResToClientPoint,
        defaultPosForStyle,
        resolveCuePos,
        posForAlignment,
        clampPosToPlayRes,
        nudgePos,
        moveCommand,
        frzCommand,
        alphaCommand,
        EFFECT_CLEAR_FAMILIES,
        clearLeadingOverrideFamilies,
        listEffectPresets,
        applyEffectPreset,
        applyEffectPresetToCues,
        listDialogueEffectPresets,
        normalizeDialogueEffect,
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
