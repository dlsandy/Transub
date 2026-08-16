/**
 * ASS V4+ Styles — parse / upsert / apply (browser + Node)
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAssStyles = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function assStylesCoreFactory() {
    const DEFAULT_STYLE_FORMAT = [
        'Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour', 'OutlineColour', 'BackColour',
        'Bold', 'Italic', 'Underline', 'StrikeOut', 'ScaleX', 'ScaleY', 'Spacing', 'Angle',
        'BorderStyle', 'Outline', 'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding',
    ];

    const DEFAULT_STYLE = Object.freeze({
        name: 'Default',
        fontname: 'Microsoft YaHei',
        fontsize: 48,
        primaryColour: '&H00FFFFFF',
        secondaryColour: '&H000000FF',
        outlineColour: '&H00000000',
        backColour: '&H80000000',
        bold: 0,
        italic: 0,
        underline: 0,
        strikeOut: 0,
        scaleX: 100,
        scaleY: 100,
        spacing: 0,
        angle: 0,
        borderStyle: 1,
        outline: 2,
        shadow: 1,
        alignment: 2,
        marginL: 40,
        marginR: 40,
        marginV: 48,
        encoding: 1,
    });

    function cloneStyle(style) {
        return { ...DEFAULT_STYLE, ...(style && typeof style === 'object' ? style : {}) };
    }

    function defaultAssHeaderLines(title = 'Transub') {
        const safeTitle = String(title || 'Transub').replace(/[\r\n]/g, ' ');
        return [
            '[Script Info]',
            `Title: ${safeTitle}`,
            'ScriptType: v4.00+',
            'PlayResX: 1920',
            'PlayResY: 1080',
            'WrapStyle: 0',
            '',
            '[V4+ Styles]',
            `Format: ${DEFAULT_STYLE_FORMAT.join(', ')}`,
            styleToLine(DEFAULT_STYLE),
            '',
            '[Events]',
            'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        ];
    }

    function sanitizeStyleName(name) {
        const raw = String(name || '').replace(/[,]/g, ' ').trim();
        return raw.slice(0, 64) || 'Default';
    }

    function normalizeAssColour(value) {
        const s = String(value || '').trim();
        if (/^&H[0-9A-Fa-f]{8}$/i.test(s)) return `&H${s.slice(2).toUpperCase()}`;
        if (/^#[0-9A-Fa-f]{6}$/.test(s)) return assColourFromHex(s);
        if (/^[0-9A-Fa-f]{6}$/.test(s)) return assColourFromHex(`#${s}`);
        return DEFAULT_STYLE.primaryColour;
    }

    function assColourFromHex(hex) {
        const raw = String(hex || '').replace('#', '').trim();
        if (!/^[0-9a-fA-F]{6}$/.test(raw)) return '&H00FFFFFF';
        const r = raw.slice(0, 2);
        const g = raw.slice(2, 4);
        const b = raw.slice(4, 6);
        return `&H00${b}${g}${r}`.toUpperCase();
    }

    function hexFromAssColour(colour) {
        const s = String(colour || '').trim();
        const m = s.match(/^&H([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/i);
        if (!m) return '#FFFFFF';
        const bb = m[2];
        const gg = m[3];
        const rr = m[4];
        return `#${rr}${gg}${bb}`.toUpperCase();
    }

    function toInt(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? Math.round(n) : fallback;
    }

    function normalizeStyle(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const name = sanitizeStyleName(src.name || src.Name || DEFAULT_STYLE.name);
        return {
            name,
            fontname: String(src.fontname || src.Fontname || DEFAULT_STYLE.fontname).replace(/,/g, ' ').trim() || DEFAULT_STYLE.fontname,
            fontsize: Math.max(1, toInt(src.fontsize ?? src.Fontsize, DEFAULT_STYLE.fontsize)),
            primaryColour: normalizeAssColour(src.primaryColour || src.PrimaryColour),
            secondaryColour: normalizeAssColour(src.secondaryColour || src.SecondaryColour || DEFAULT_STYLE.secondaryColour),
            outlineColour: normalizeAssColour(src.outlineColour || src.OutlineColour || DEFAULT_STYLE.outlineColour),
            backColour: normalizeAssColour(src.backColour || src.BackColour || DEFAULT_STYLE.backColour),
            bold: toInt(src.bold ?? src.Bold, 0) ? -1 : 0,
            italic: toInt(src.italic ?? src.Italic, 0) ? -1 : 0,
            underline: toInt(src.underline ?? src.Underline, 0) ? -1 : 0,
            strikeOut: toInt(src.strikeOut ?? src.StrikeOut, 0) ? -1 : 0,
            scaleX: Math.max(0, toInt(src.scaleX ?? src.ScaleX, DEFAULT_STYLE.scaleX)),
            scaleY: Math.max(0, toInt(src.scaleY ?? src.ScaleY, DEFAULT_STYLE.scaleY)),
            spacing: toInt(src.spacing ?? src.Spacing, DEFAULT_STYLE.spacing),
            angle: toInt(src.angle ?? src.Angle, DEFAULT_STYLE.angle),
            borderStyle: toInt(src.borderStyle ?? src.BorderStyle, DEFAULT_STYLE.borderStyle) || 1,
            outline: Math.max(0, Number(src.outline ?? src.Outline ?? DEFAULT_STYLE.outline) || 0),
            shadow: Math.max(0, Number(src.shadow ?? src.Shadow ?? DEFAULT_STYLE.shadow) || 0),
            alignment: Math.min(9, Math.max(1, toInt(src.alignment ?? src.Alignment, DEFAULT_STYLE.alignment))),
            marginL: Math.max(0, toInt(src.marginL ?? src.MarginL, DEFAULT_STYLE.marginL)),
            marginR: Math.max(0, toInt(src.marginR ?? src.MarginR, DEFAULT_STYLE.marginR)),
            marginV: Math.max(0, toInt(src.marginV ?? src.MarginV, DEFAULT_STYLE.marginV)),
            encoding: toInt(src.encoding ?? src.Encoding, DEFAULT_STYLE.encoding),
        };
    }

    function styleToLine(style) {
        const s = normalizeStyle(style);
        const values = [
            s.name, s.fontname, s.fontsize, s.primaryColour, s.secondaryColour, s.outlineColour, s.backColour,
            s.bold, s.italic, s.underline, s.strikeOut, s.scaleX, s.scaleY, s.spacing, s.angle,
            s.borderStyle, s.outline, s.shadow, s.alignment, s.marginL, s.marginR, s.marginV, s.encoding,
        ];
        return `Style: ${values.join(',')}`;
    }

    function parseStyleLine(line, formatFields) {
        const trimmed = String(line || '').trim();
        if (!/^Style:/i.test(trimmed)) return null;
        const body = trimmed.slice(trimmed.indexOf(':') + 1).replace(/^\s*/, '');
        const parts = body.split(',');
        const fields = Array.isArray(formatFields) && formatFields.length
            ? formatFields
            : DEFAULT_STYLE_FORMAT;
        const map = {};
        for (let i = 0; i < fields.length; i += 1) {
            const key = String(fields[i] || '').trim();
            if (!key) continue;
            map[key] = parts[i] != null ? String(parts[i]).trim() : '';
        }
        // Name may contain no commas; remaining text after last mapped field is ignored.
        if (parts.length > fields.length && fields.length) {
            const lastKey = String(fields[fields.length - 1] || '').trim();
            if (lastKey) map[lastKey] = parts.slice(fields.length - 1).join(',').trim();
        }
        return normalizeStyle(map);
    }

    function findStylesSection(headerLines) {
        const lines = Array.isArray(headerLines) ? headerLines.map((l) => String(l ?? '')) : [];
        let start = -1;
        let end = lines.length;
        for (let i = 0; i < lines.length; i += 1) {
            const t = lines[i].trim();
            if (/^\[V4\+?\s*Styles\]/i.test(t)) {
                start = i;
                continue;
            }
            if (start >= 0 && /^\[[^\]]+\]/.test(t)) {
                end = i;
                break;
            }
        }
        return { lines, start, end };
    }

    /**
     * @returns {{ styles: object[], formatFields: string[], hasSection: boolean }}
     */
    function parseStylesFromHeader(headerLines) {
        const { lines, start, end } = findStylesSection(headerLines);
        if (start < 0) {
            return { styles: [cloneStyle(DEFAULT_STYLE)], formatFields: [...DEFAULT_STYLE_FORMAT], hasSection: false };
        }
        let formatFields = [...DEFAULT_STYLE_FORMAT];
        const styles = [];
        for (let i = start + 1; i < end; i += 1) {
            const trimmed = lines[i].trim();
            if (!trimmed) continue;
            if (/^Format:/i.test(trimmed)) {
                const fields = trimmed.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
                if (fields.length) formatFields = fields;
                continue;
            }
            const style = parseStyleLine(trimmed, formatFields);
            if (style) styles.push(style);
        }
        if (!styles.length) styles.push(cloneStyle(DEFAULT_STYLE));
        return { styles, formatFields, hasSection: true };
    }

    function ensureAssHeader(headerLines, title) {
        const lines = Array.isArray(headerLines) ? headerLines.map((l) => String(l ?? '')) : [];
        const hasScript = lines.some((l) => /^\[Script Info\]/i.test(l.trim()));
        const hasStyles = lines.some((l) => /^\[V4\+?\s*Styles\]/i.test(l.trim()));
        const hasEvents = lines.some((l) => /^\[Events\]/i.test(l.trim()));
        if (hasScript && hasStyles && hasEvents) return lines;
        return defaultAssHeaderLines(title);
    }

    /**
     * Replace [V4+ Styles] block content with the given styles list.
     * Creates a default header if missing.
     */
    function writeStylesToHeader(headerLines, styles, options = {}) {
        const title = options.title || 'Transub';
        let lines = ensureAssHeader(headerLines, title);
        let { start, end } = findStylesSection(lines);
        if (start < 0) {
            lines = defaultAssHeaderLines(title);
            ({ start, end } = findStylesSection(lines));
        }
        const list = Array.isArray(styles) && styles.length
            ? styles.map((s) => normalizeStyle(s))
            : [cloneStyle(DEFAULT_STYLE)];
        // Ensure unique names; keep first Default if none.
        const seen = new Set();
        const unique = [];
        for (const style of list) {
            let name = style.name;
            let n = 2;
            while (seen.has(name.toLowerCase())) {
                name = `${style.name}_${n}`;
                n += 1;
            }
            seen.add(name.toLowerCase());
            unique.push({ ...style, name });
        }
        if (![...seen].includes('default')) {
            unique.unshift(cloneStyle(DEFAULT_STYLE));
        }
        const block = [
            '[V4+ Styles]',
            `Format: ${DEFAULT_STYLE_FORMAT.join(', ')}`,
            ...unique.map((s) => styleToLine(s)),
        ];
        const next = [
            ...lines.slice(0, start),
            ...block,
            ...lines.slice(end),
        ];
        return next;
    }

    function upsertStyleInHeader(headerLines, style, options = {}) {
        const parsed = parseStylesFromHeader(headerLines);
        const nextStyle = normalizeStyle(style);
        const idx = parsed.styles.findIndex((s) => s.name.toLowerCase() === nextStyle.name.toLowerCase());
        const styles = parsed.styles.slice();
        if (idx >= 0) styles[idx] = nextStyle;
        else styles.push(nextStyle);
        return writeStylesToHeader(headerLines, styles, options);
    }

    function renameStyleInHeader(headerLines, oldName, newName, options = {}) {
        const from = sanitizeStyleName(oldName);
        const to = sanitizeStyleName(newName);
        if (!from || from.toLowerCase() === to.toLowerCase()) {
            return { header: Array.isArray(headerLines) ? headerLines.slice() : [], renamed: false, styleName: from };
        }
        const parsed = parseStylesFromHeader(headerLines);
        const styles = parsed.styles.map((s) => (
            s.name.toLowerCase() === from.toLowerCase() ? { ...s, name: to } : s
        ));
        if (from.toLowerCase() === 'default') {
            // Keep a Default style present for players.
            if (!styles.some((s) => s.name.toLowerCase() === 'default')) {
                styles.unshift(cloneStyle(DEFAULT_STYLE));
            }
        }
        return {
            header: writeStylesToHeader(headerLines, styles, options),
            renamed: true,
            styleName: to,
            oldName: from,
        };
    }

    function deleteStyleFromHeader(headerLines, styleName, options = {}) {
        const name = sanitizeStyleName(styleName);
        if (name.toLowerCase() === 'default') {
            return { header: Array.isArray(headerLines) ? headerLines.slice() : [], deleted: false, error: '不能删除 Default 样式' };
        }
        const parsed = parseStylesFromHeader(headerLines);
        const styles = parsed.styles.filter((s) => s.name.toLowerCase() !== name.toLowerCase());
        if (styles.length === parsed.styles.length) {
            return { header: Array.isArray(headerLines) ? headerLines.slice() : [], deleted: false, error: '样式不存在' };
        }
        return {
            header: writeStylesToHeader(headerLines, styles, options),
            deleted: true,
            styleName: name,
            fallback: 'Default',
        };
    }

    function countStyleUsage(cues, styleName) {
        const name = sanitizeStyleName(styleName).toLowerCase();
        let count = 0;
        for (const cue of Array.isArray(cues) ? cues : []) {
            const style = String(cue?.ass?.style || 'Default').trim() || 'Default';
            if (style.toLowerCase() === name) count += 1;
        }
        return count;
    }

    /**
     * Apply style name to cue indexes. Returns new cues array (shallow-copied changed items).
     */
    function applyStyleToCues(cues, indexes, styleName) {
        const name = sanitizeStyleName(styleName);
        const list = Array.isArray(cues) ? cues.slice() : [];
        const set = new Set((Array.isArray(indexes) ? indexes : []).map((i) => Number(i)).filter((i) => Number.isInteger(i) && i >= 0));
        let changed = 0;
        for (const i of set) {
            if (i >= list.length) continue;
            const cue = list[i];
            if (!cue) continue;
            const ass = cue.ass && typeof cue.ass === 'object' ? { ...cue.ass } : {};
            if (String(ass.style || 'Default') === name) continue;
            ass.style = name;
            list[i] = { ...cue, ass };
            changed += 1;
        }
        return { cues: list, changed, styleName: name };
    }

    function defaultAssMeta(partial) {
        const src = partial && typeof partial === 'object' ? partial : {};
        return {
            layer: src.layer != null && src.layer !== '' ? String(src.layer) : '0',
            style: sanitizeStyleName(src.style || 'Default'),
            name: String(src.name || '').slice(0, 40),
            marginL: src.marginL != null && src.marginL !== '' ? String(src.marginL) : '0',
            marginR: src.marginR != null && src.marginR !== '' ? String(src.marginR) : '0',
            marginV: src.marginV != null && src.marginV !== '' ? String(src.marginV) : '0',
            effect: String(src.effect || '').replace(/,/g, ' '),
        };
    }

    /**
     * Convert an in-memory subtitle document to ASS edit session
     * (header + cue.ass meta). Optionally rewrite path stem to .ass.
     */
    function convertDocumentToAss(cues, headerLines, options = {}) {
        const title = options.title || 'Transub';
        const prevFormat = String(options.format || '').toLowerCase();
        const alreadyAss = prevFormat === 'ass' || prevFormat === 'ssa';
        const header = ensureAssHeader(headerLines, title);
        let metaFilled = 0;
        const list = (Array.isArray(cues) ? cues : []).map((cue) => {
            if (cue?.ass && typeof cue.ass === 'object' && String(cue.ass.style || '').trim()) {
                return cue;
            }
            metaFilled += 1;
            return { ...cue, ass: defaultAssMeta(cue?.ass) };
        });
        let pathOut = options.path != null ? String(options.path) : '';
        let pathChanged = false;
        if (pathOut && !/\.(ass|ssa)$/i.test(pathOut)) {
            const next = pathOut.replace(/\.[^.\\/]+$/, '') + '.ass';
            if (next !== pathOut) {
                pathOut = next;
                pathChanged = true;
            }
        }
        return {
            cues: list,
            header,
            format: 'ass',
            path: pathOut || options.path || '',
            pathChanged,
            alreadyAss,
            metaFilled,
            changed: !alreadyAss || metaFilled > 0 || pathChanged,
        };
    }

    function uniqueStyleName(existingNames, base) {
        const root = sanitizeStyleName(base || 'Style');
        const taken = new Set((Array.isArray(existingNames) ? existingNames : []).map((n) => String(n || '').toLowerCase()));
        if (!taken.has(root.toLowerCase())) return root;
        let n = 2;
        while (taken.has(`${root}${n}`.toLowerCase())) n += 1;
        return `${root}${n}`;
    }

    function createStyleFromSpeakers(speakers, options = {}) {
        const baseFont = options.fontname || DEFAULT_STYLE.fontname;
        const fontsize = options.fontsize != null ? options.fontsize : DEFAULT_STYLE.fontsize;
        const styles = [cloneStyle(DEFAULT_STYLE)];
        const map = {};
        (Array.isArray(speakers) ? speakers : []).forEach((sp, i) => {
            if (!sp?.id) return;
            const name = uniqueStyleName(styles.map((s) => s.name), `Sp${i + 1}`);
            styles.push(normalizeStyle({
                ...DEFAULT_STYLE,
                name,
                fontname: baseFont,
                fontsize,
                primaryColour: assColourFromHex(sp.color || '#FFFFFF'),
            }));
            map[sp.id] = name;
        });
        return { styles, speakerStyleMap: map };
    }

    function normalizeSpeakerStyleMap(raw, speakers) {
        const out = {};
        const src = raw && typeof raw === 'object' ? raw : {};
        for (const [id, styleName] of Object.entries(src)) {
            const sid = String(id || '').trim();
            if (!sid) continue;
            out[sid] = sanitizeStyleName(styleName);
        }
        (Array.isArray(speakers) ? speakers : []).forEach((sp, i) => {
            if (!sp?.id) return;
            if (!out[sp.id]) out[sp.id] = `Sp${i + 1}`;
        });
        return out;
    }

    function mergeSpeakerStylesIntoList(styles, speakers, speakerStyleMap) {
        const list = Array.isArray(styles) && styles.length
            ? styles.map((s) => normalizeStyle(s))
            : [cloneStyle(DEFAULT_STYLE)];
        const byName = new Map(list.map((s) => [s.name.toLowerCase(), s]));
        const map = normalizeSpeakerStyleMap(speakerStyleMap, speakers);
        (Array.isArray(speakers) ? speakers : []).forEach((sp, i) => {
            if (!sp?.id) return;
            const styleName = map[sp.id] || `Sp${i + 1}`;
            map[sp.id] = styleName;
            if (byName.has(styleName.toLowerCase())) return;
            const created = normalizeStyle({
                ...DEFAULT_STYLE,
                name: styleName,
                primaryColour: assColourFromHex(sp.color || '#FFFFFF'),
            });
            list.push(created);
            byName.set(styleName.toLowerCase(), created);
        });
        if (!byName.has('default')) list.unshift(cloneStyle(DEFAULT_STYLE));
        return { styles: list, speakerStyleMap: map };
    }

    /**
     * Copy cues with Dialogue Style/Name filled from speaker markers + map (export helper).
     */
    function applySpeakerMapToExportCues(cues, options = {}) {
        const speakers = Array.isArray(options.speakers) ? options.speakers : [];
        const cueMarkers = options.cueMarkers && typeof options.cueMarkers === 'object' ? options.cueMarkers : {};
        const map = normalizeSpeakerStyleMap(options.speakerStyleMap, speakers);
        const cueMarkerKey = typeof options.cueMarkerKey === 'function'
            ? options.cueMarkerKey
            : (cue, index) => `${index}:${Math.round(Number(cue?.startMs) || 0)}`;
        const list = Array.isArray(cues) ? cues : [];
        return list.map((cue, index) => {
            const key = cueMarkerKey(cue, index);
            const marker = cueMarkers[key] || null;
            const sp = marker?.speakerId
                ? speakers.find((s) => s.id === marker.speakerId)
                : null;
            const styleName = (sp && map[sp.id])
                || String(cue?.ass?.style || 'Default').trim()
                || 'Default';
            const ass = cue?.ass && typeof cue.ass === 'object' ? { ...cue.ass } : {};
            ass.style = sanitizeStyleName(styleName);
            if (sp?.name) ass.name = String(sp.name).slice(0, 40);
            return { ...cue, ass };
        });
    }

    function dualMarginPair(lineOrder, gap = 56) {
        const g = Math.max(24, Math.round(Number(gap) || 56));
        const order = String(lineOrder || 'target-first').trim().toLowerCase();
        const sourceFirst = order === 'source-first' || order === 'source';
        // Alignment 2 bottom-center; larger MarginV sits higher.
        return {
            sourceMarginV: sourceFirst ? g * 2 : g,
            targetMarginV: sourceFirst ? g : g * 2,
            sourceFirst,
        };
    }

    /**
     * Ensure Source + ZH (or custom) styles exist with stacked MarginV.
     */
    function ensureDualTemplateStyles(styles, options = {}) {
        const sourceName = sanitizeStyleName(options.sourceStyle || 'Source');
        const targetName = sanitizeStyleName(options.targetStyle || 'ZH');
        const margins = dualMarginPair(options.lineOrder, options.marginGap);
        const list = Array.isArray(styles) ? styles.map((s) => normalizeStyle(s)) : [];
        const byName = new Map(list.map((s) => [s.name.toLowerCase(), s]));
        const upsert = (name, patch) => {
            const key = name.toLowerCase();
            const prev = byName.get(key);
            const next = normalizeStyle({ ...(prev || DEFAULT_STYLE), ...patch, name });
            if (prev) {
                const idx = list.findIndex((s) => s.name.toLowerCase() === key);
                if (idx >= 0) list[idx] = next;
            } else {
                list.push(next);
            }
            byName.set(key, next);
        };
        upsert(sourceName, {
            fontname: options.sourceFont || 'Arial',
            fontsize: options.sourceSize != null ? options.sourceSize : 40,
            primaryColour: options.sourceColour || '&H00AAAAAA',
            marginV: margins.sourceMarginV,
            alignment: 2,
        });
        upsert(targetName, {
            fontname: options.targetFont || DEFAULT_STYLE.fontname,
            fontsize: options.targetSize != null ? options.targetSize : 48,
            primaryColour: options.targetColour || '&H00FFFFFF',
            marginV: margins.targetMarginV,
            alignment: 2,
        });
        if (!byName.has('default') && targetName.toLowerCase() !== 'default') {
            list.unshift(cloneStyle(DEFAULT_STYLE));
        }
        return {
            styles: list,
            sourceStyle: sourceName,
            targetStyle: targetName,
            ...margins,
        };
    }

    /**
     * Build dual Dialogue cue list (two rows per pair) for serializeAssDocument.
     * pairs: [{ startMs, endMs, sourceText, targetText }]
     */
    function buildDualAssCues(pairs, options = {}) {
        const sourceStyle = sanitizeStyleName(options.sourceStyle || 'Source');
        const targetStyle = sanitizeStyleName(options.targetStyle || 'ZH');
        const out = [];
        (Array.isArray(pairs) ? pairs : []).forEach((pair) => {
            const startMs = Number(pair?.startMs) || 0;
            const endMs = Math.max(startMs, Number(pair?.endMs) || startMs + 2000);
            const sourceText = String(pair?.sourceText || '').trim();
            const targetText = String(pair?.targetText || '').trim();
            if (sourceText) {
                out.push({
                    startMs,
                    endMs,
                    text: sourceText,
                    ass: { layer: '0', style: sourceStyle, name: '', marginL: '0', marginR: '0', marginV: '0', effect: '' },
                });
            }
            if (targetText) {
                out.push({
                    startMs,
                    endMs,
                    text: targetText,
                    ass: { layer: '0', style: targetStyle, name: '', marginL: '0', marginR: '0', marginV: '0', effect: '' },
                });
            }
        });
        // Preserve lineOrder for export/serialize: target-first shows ZH then Source in file
        // when both exist at same time — build order already Source then ZH; callers that need
        // visual stack rely on MarginV from ensureDualTemplateStyles.
        if (String(options.lineOrder || '').toLowerCase() === 'target-first'
            || String(options.lineOrder || '') === 'target') {
            // Keep Source then ZH; MarginV handles visual stacking.
        }
        return out;
    }

    function pickSecondaryText(pairList, startMs, endMs, findOverlap) {
        if (typeof findOverlap === 'function') {
            const hit = findOverlap(pairList, startMs, endMs);
            return String(hit?.cue?.text || hit?.text || '').trim();
        }
        let best = null;
        let bestDist = Infinity;
        for (const p of Array.isArray(pairList) ? pairList : []) {
            const ps = Number(p?.startMs) || 0;
            const pe = Math.max(ps, Number(p?.endMs) || ps);
            const overlap = Math.min(endMs, pe) - Math.max(startMs, ps);
            const dist = overlap > 0 ? -overlap : Math.abs(ps - startMs);
            if (dist < bestDist) {
                bestDist = dist;
                best = p;
            }
        }
        return String(best?.text || '').trim();
    }

    /**
     * Build in-editor dual ASS document (header + Source/ZH Dialogue cues)
     * from primary track + pair track.
     */
    function buildDualDocumentFromTracks(primaryCues, pairCues, options = {}) {
        const title = String(options.title || 'Transub Dual').replace(/[\r\n]/g, ' ');
        const primaryRole = options.primaryRole === 'source' ? 'source' : 'target';
        const template = normalizeDualTemplate({
            ...options.dualTemplate,
            lineOrder: options.lineOrder || options.dualTemplate?.lineOrder,
            sourceStyle: options.sourceStyle || options.dualTemplate?.sourceStyle,
            targetStyle: options.targetStyle || options.dualTemplate?.targetStyle,
            marginGap: options.marginGap != null ? options.marginGap : options.dualTemplate?.marginGap,
        });
        const pairs = [];
        const list = Array.isArray(primaryCues) ? primaryCues : [];
        const pairList = Array.isArray(pairCues) ? pairCues : [];
        const findOverlap = typeof options.findBestOverlapCue === 'function'
            ? options.findBestOverlapCue
            : null;

        list.forEach((cue) => {
            const startMs = Number(cue?.startMs) || 0;
            const endMs = Math.max(startMs, Number(cue?.endMs) || startMs + 2000);
            const primary = String(cue?.text || '').trim();
            const secondary = pickSecondaryText(pairList, startMs, endMs, findOverlap);
            let sourceText = '';
            let targetText = '';
            if (primaryRole === 'source') {
                sourceText = primary;
                targetText = secondary;
            } else {
                targetText = primary;
                sourceText = secondary;
            }
            if (sourceText || targetText) {
                pairs.push({ startMs, endMs, sourceText, targetText });
            }
        });

        const baseStyles = Array.isArray(options.existingStyles) ? options.existingStyles : [];
        const ensured = ensureDualTemplateStyles(baseStyles, {
            lineOrder: template.lineOrder,
            sourceStyle: template.sourceStyle,
            targetStyle: template.targetStyle,
            marginGap: template.marginGap,
        });
        const header = writeStylesToHeader(
            options.headerLines || defaultAssHeaderLines(title),
            ensured.styles,
            { title },
        );
        const titled = header.map((l) => (/^Title:/i.test(String(l).trim()) ? `Title: ${title}` : l));
        const cues = buildDualAssCues(pairs, {
            sourceStyle: ensured.sourceStyle,
            targetStyle: ensured.targetStyle,
            lineOrder: template.lineOrder,
        });
        return {
            ok: true,
            cues,
            header: titled,
            template,
            pairCount: pairs.length,
            dialogueCount: cues.length,
            sourceStyle: ensured.sourceStyle,
            targetStyle: ensured.targetStyle,
        };
    }

    function defaultDualTemplate() {
        return {
            preset: 'watch',
            lineOrder: 'target-first',
            sourceStyle: 'Source',
            targetStyle: 'ZH',
            marginGap: 56,
        };
    }

    function normalizeDualTemplate(raw) {
        const base = defaultDualTemplate();
        if (!raw || typeof raw !== 'object') return base;
        const preset = String(raw.preset || base.preset).trim() || base.preset;
        const lineOrder = String(raw.lineOrder || base.lineOrder).trim().toLowerCase();
        return {
            preset: ['watch', 'source-top', 'target-only'].includes(preset) ? preset : base.preset,
            lineOrder: lineOrder === 'source-first' || lineOrder === 'source' ? 'source-first' : 'target-first',
            sourceStyle: sanitizeStyleName(raw.sourceStyle || base.sourceStyle),
            targetStyle: sanitizeStyleName(raw.targetStyle || base.targetStyle),
            marginGap: Math.max(24, Math.min(200, Math.round(Number(raw.marginGap) || base.marginGap))),
        };
    }

    /**
     * Built-in style packs for one-click apply.
     * Each pack returns full style list (includes Default).
     */
    function listStylePresets() {
        return [
            {
                id: 'watch',
                label: '观影白字',
                detail: '微软雅黑 48 · 白字黑边 · 底部居中',
                styles: () => [
                    normalizeStyle({
                        ...DEFAULT_STYLE,
                        name: 'Default',
                        fontname: 'Microsoft YaHei',
                        fontsize: 48,
                        primaryColour: '&H00FFFFFF',
                        outlineColour: '&H00000000',
                        outline: 2,
                        shadow: 1,
                        alignment: 2,
                        marginV: 48,
                    }),
                ],
            },
            {
                id: 'large',
                label: '大字号观影',
                detail: '字号 64 · 加粗描边 · 适合远距离',
                styles: () => [
                    normalizeStyle({
                        ...DEFAULT_STYLE,
                        name: 'Default',
                        fontname: 'Microsoft YaHei',
                        fontsize: 64,
                        primaryColour: '&H00FFFFFF',
                        outline: 3,
                        shadow: 2,
                        alignment: 2,
                        marginV: 56,
                    }),
                ],
            },
            {
                id: 'dual-gray',
                label: '双行灰原',
                detail: 'ZH 白字 + Source 灰色小字（译文在上）',
                styles: () => ensureDualTemplateStyles([], {
                    lineOrder: 'target-first',
                    sourceStyle: 'Source',
                    targetStyle: 'ZH',
                    marginGap: 56,
                }).styles,
                dualTemplate: {
                    preset: 'watch',
                    lineOrder: 'target-first',
                    sourceStyle: 'Source',
                    targetStyle: 'ZH',
                    marginGap: 56,
                },
            },
            {
                id: 'top-title',
                label: '顶部标题',
                detail: 'Default 顶中对齐 · 适合片头/注记',
                styles: () => [
                    normalizeStyle({
                        ...DEFAULT_STYLE,
                        name: 'Default',
                        fontname: 'Microsoft YaHei',
                        fontsize: 42,
                        primaryColour: '&H00FFFFFF',
                        alignment: 8,
                        marginV: 36,
                    }),
                    normalizeStyle({
                        ...DEFAULT_STYLE,
                        name: 'Title',
                        fontname: 'Microsoft YaHei',
                        fontsize: 56,
                        primaryColour: '&H0000E5FF',
                        alignment: 8,
                        marginV: 28,
                        bold: -1,
                    }),
                ],
            },
            {
                id: 'box',
                label: '盒底字幕',
                detail: 'BorderStyle=3 不透明底盒 · 远场更易读',
                styles: () => [
                    normalizeStyle({
                        ...DEFAULT_STYLE,
                        name: 'Default',
                        fontname: 'Microsoft YaHei',
                        fontsize: 46,
                        primaryColour: '&H00FFFFFF',
                        outlineColour: '&H00000000',
                        backColour: '&H80000000',
                        borderStyle: 3,
                        outline: 4,
                        shadow: 0,
                        alignment: 2,
                        marginV: 52,
                    }),
                ],
            },
            {
                id: 'note',
                label: '注释顶注',
                detail: '小号灰字顶中 · 适合旁白/注记',
                styles: () => [
                    normalizeStyle({
                        ...DEFAULT_STYLE,
                        name: 'Default',
                        fontname: 'Microsoft YaHei',
                        fontsize: 48,
                        primaryColour: '&H00FFFFFF',
                        alignment: 2,
                        marginV: 48,
                    }),
                    normalizeStyle({
                        ...DEFAULT_STYLE,
                        name: 'Note',
                        fontname: 'Microsoft YaHei',
                        fontsize: 32,
                        primaryColour: '&H00B0B0B0',
                        outline: 1,
                        shadow: 0,
                        alignment: 8,
                        marginV: 28,
                    }),
                ],
            },
            {
                id: 'karaoke',
                label: '歌词粗描边',
                detail: '大字 + 厚描边 · 适合歌词/高潮',
                styles: () => [
                    normalizeStyle({
                        ...DEFAULT_STYLE,
                        name: 'Default',
                        fontname: 'Microsoft YaHei',
                        fontsize: 60,
                        primaryColour: '&H00FFFFFF',
                        outlineColour: '&H00000000',
                        outline: 4,
                        shadow: 2,
                        bold: -1,
                        alignment: 2,
                        marginV: 64,
                    }),
                ],
            },
            {
                id: 'neon',
                label: '霓虹黄字',
                detail: '亮黄主色 + 紫描边 · 强调条',
                styles: () => [
                    normalizeStyle({
                        ...DEFAULT_STYLE,
                        name: 'Default',
                        fontname: 'Microsoft YaHei',
                        fontsize: 50,
                        primaryColour: '&H0000E5FF',
                        outlineColour: '&H00C000C0',
                        outline: 3,
                        shadow: 1,
                        bold: -1,
                        alignment: 2,
                        marginV: 52,
                    }),
                    normalizeStyle({
                        ...DEFAULT_STYLE,
                        name: 'Emphasis',
                        fontname: 'Microsoft YaHei',
                        fontsize: 44,
                        primaryColour: '&H0000FFFF',
                        outlineColour: '&H00000000',
                        outline: 2,
                        alignment: 8,
                        marginV: 36,
                    }),
                ],
            },
        ];
    }

    function formatAssTimeMs(ms) {
        const n = Math.max(0, Math.round(Number(ms) || 0));
        const h = Math.floor(n / 3600000);
        const m = Math.floor((n % 3600000) / 60000);
        const s = Math.floor((n % 60000) / 1000);
        const cs = Math.floor((n % 1000) / 10);
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    }

    function escapeAssName(name) {
        return String(name || '').replace(/[,]/g, ' ').slice(0, 40);
    }

    /**
     * Serialize cues + ASS header into a full document (export / JASSUB preview).
     */
    function serializeAssDocument(cues, header) {
        const headLines = Array.isArray(header) && header.length
            ? header.map((l) => String(l ?? ''))
            : defaultAssHeaderLines();
        while (headLines.length && headLines[headLines.length - 1] === '') headLines.pop();
        const evIdx = headLines.findIndex((l) => /^\[Events\]/i.test(String(l).trim()));
        if (evIdx < 0) {
            headLines.push('', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
        } else {
            const hasFormatAfter = headLines.slice(evIdx + 1).some((l) => /^Format:/i.test(String(l).trim()));
            if (!hasFormatAfter) {
                headLines.splice(evIdx + 1, 0, 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
            }
        }

        const events = (Array.isArray(cues) ? cues : []).map((cue) => {
            const start = formatAssTimeMs(cue.startMs);
            const end = formatAssTimeMs(cue.endMs != null ? cue.endMs : cue.startMs + 2000);
            const meta = cue.ass && typeof cue.ass === 'object' ? cue.ass : {};
            const layer = meta.layer != null && meta.layer !== '' ? meta.layer : '0';
            const style = String(meta.style || 'Default').replace(/,/g, ' ');
            const name = escapeAssName(meta.name || '');
            const marginL = meta.marginL != null && meta.marginL !== '' ? meta.marginL : '0';
            const marginR = meta.marginR != null && meta.marginR !== '' ? meta.marginR : '0';
            const marginV = meta.marginV != null && meta.marginV !== '' ? meta.marginV : '0';
            const effect = String(meta.effect || '').replace(/,/g, ' ');
            const text = String(cue.text || '').replace(/\r?\n/g, '\\N');
            return `Dialogue: ${layer},${start},${end},${style},${name},${marginL},${marginR},${marginV},${effect},${text}`;
        });

        return `${headLines.join('\n')}\n${events.join('\n')}${events.length ? '\n' : ''}`;
    }

    function applyStylePreset(headerLines, presetId, options = {}) {
        const presets = listStylePresets();
        const hit = presets.find((p) => p.id === presetId);
        if (!hit) {
            return { header: Array.isArray(headerLines) ? headerLines.slice() : [], ok: false, error: '未知预设' };
        }
        const styles = typeof hit.styles === 'function' ? hit.styles() : hit.styles;
        const header = writeStylesToHeader(headerLines, styles, options);
        return {
            header,
            ok: true,
            presetId: hit.id,
            label: hit.label,
            styles,
            dualTemplate: hit.dualTemplate ? normalizeDualTemplate(hit.dualTemplate) : null,
        };
    }

    /**
     * Apply speakerStyleMap onto cue.ass.style (+ Name) for all cues with speakers.
     */
    function applySpeakerMapToCues(cues, options = {}) {
        const speakers = Array.isArray(options.speakers) ? options.speakers : [];
        const cueMarkers = options.cueMarkers && typeof options.cueMarkers === 'object' ? options.cueMarkers : {};
        const map = normalizeSpeakerStyleMap(options.speakerStyleMap, speakers);
        const cueMarkerKey = typeof options.cueMarkerKey === 'function'
            ? options.cueMarkerKey
            : (cue, index) => `${index}:${Math.round(Number(cue?.startMs) || 0)}`;
        const list = Array.isArray(cues) ? cues.slice() : [];
        let changed = 0;
        list.forEach((cue, index) => {
            const key = cueMarkerKey(cue, index);
            const marker = cueMarkers[key] || null;
            if (!marker?.speakerId) return;
            const sp = speakers.find((s) => s.id === marker.speakerId);
            if (!sp) return;
            const styleName = map[sp.id] || 'Default';
            const ass = cue?.ass && typeof cue.ass === 'object' ? { ...cue.ass } : {};
            const nextStyle = sanitizeStyleName(styleName);
            const nextName = String(sp.name || '').slice(0, 40);
            if (String(ass.style || 'Default') === nextStyle && String(ass.name || '') === nextName) return;
            ass.style = nextStyle;
            ass.name = nextName;
            list[index] = { ...cue, ass };
            changed += 1;
        });
        return { cues: list, changed, speakerStyleMap: map };
    }

    function summarizeAssExport(options = {}) {
        const styles = Array.isArray(options.styles) ? options.styles : [];
        const mode = String(options.assMode || 'document');
        const parts = [];
        if (mode === 'dual') {
            parts.push('双语 Source+ZH');
            parts.push(`行序 ${options.lineOrder || 'target-first'}`);
        } else {
            parts.push(`文档样式 ${styles.length || 'Default'} 项`);
        }
        if (options.cueCount != null) parts.push(`${options.cueCount} 条字幕`);
        return parts.join(' · ');
    }

    return {
        DEFAULT_STYLE,
        DEFAULT_STYLE_FORMAT,
        cloneStyle,
        defaultAssHeaderLines,
        sanitizeStyleName,
        normalizeAssColour,
        assColourFromHex,
        hexFromAssColour,
        normalizeStyle,
        styleToLine,
        parseStyleLine,
        parseStylesFromHeader,
        ensureAssHeader,
        writeStylesToHeader,
        upsertStyleInHeader,
        renameStyleInHeader,
        deleteStyleFromHeader,
        countStyleUsage,
        applyStyleToCues,
        defaultAssMeta,
        convertDocumentToAss,
        uniqueStyleName,
        createStyleFromSpeakers,
        normalizeSpeakerStyleMap,
        mergeSpeakerStylesIntoList,
        applySpeakerMapToExportCues,
        applySpeakerMapToCues,
        dualMarginPair,
        ensureDualTemplateStyles,
        buildDualAssCues,
        buildDualDocumentFromTracks,
        defaultDualTemplate,
        normalizeDualTemplate,
        listStylePresets,
        applyStylePreset,
        summarizeAssExport,
        formatAssTimeMs,
        serializeAssDocument,
    };
}));
