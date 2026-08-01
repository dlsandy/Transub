const path = require('path');

const EDITABLE_FORMATS = new Set(['srt', 'vtt', 'lrc', 'ass']);

const DEFAULT_ASS_EVENT_FIELDS = [
    'Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text',
];

function detectFormat(filePath, rawContent = '') {
    const ext = path.extname(String(filePath || '')).slice(1).toLowerCase();
    if (ext === 'ssa') return 'ass';
    if (EDITABLE_FORMATS.has(ext)) return ext;
    const raw = String(rawContent || '');
    const head = raw.trimStart().slice(0, 64);
    if (/^\[Script Info\]/i.test(head) || /^Dialogue:\s*\d/im.test(raw)) return 'ass';
    const headUpper = head.slice(0, 32).toUpperCase();
    if (headUpper.startsWith('WEBVTT')) return 'vtt';
    if (/^\[\d{2}:/.test(raw.trim())) return 'lrc';
    if (/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(raw)) return 'srt';
    return ext || 'srt';
}

function stripBom(text) {
    return String(text || '').replace(/^\uFEFF/, '');
}

function parseSrtTimeMs(str) {
    const m = String(str || '').trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
    if (!m) return null;
    return (
        Number(m[1]) * 3600000
        + Number(m[2]) * 60000
        + Number(m[3]) * 1000
        + Number(m[4])
    );
}

function parseVttTimeMs(str) {
    const s = String(str || '').trim();
    let m = s.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
    if (m) {
        return Number(m[1]) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000 + Number(m[4]);
    }
    m = s.match(/^(\d{2}):(\d{2})\.(\d{3})$/);
    if (m) {
        return Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3]);
    }
    m = s.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
        return Number(m[1]) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000;
    }
    return null;
}

function parseLrcTimeMs(str) {
    const s = String(str || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
    if (!m) return null;
    const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
    return Number(m[1]) * 60000 + Number(m[2]) * 1000 + frac;
}

function formatSrtTimeMs(ms) {
    const n = Math.max(0, Math.round(Number(ms) || 0));
    const h = Math.floor(n / 3600000);
    const m = Math.floor((n % 3600000) / 60000);
    const s = Math.floor((n % 60000) / 1000);
    const f = n % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(f).padStart(3, '0')}`;
}

function formatVttTimeMs(ms) {
    const n = Math.max(0, Math.round(Number(ms) || 0));
    const h = Math.floor(n / 3600000);
    const m = Math.floor((n % 3600000) / 60000);
    const s = Math.floor((n % 60000) / 1000);
    const f = n % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(3, '0')}`;
}

function formatLrcTimeMs(ms) {
    const n = Math.max(0, Math.round(Number(ms) || 0));
    const m = Math.floor(n / 60000);
    const s = Math.floor((n % 60000) / 1000);
    const cs = Math.floor((n % 1000) / 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function parseAssTimeMs(str) {
    const m = String(str || '').trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,2})$/);
    if (!m) return null;
    const cs = Number(String(m[4]).padEnd(2, '0').slice(0, 2));
    return (
        Number(m[1]) * 3600000
        + Number(m[2]) * 60000
        + Number(m[3]) * 1000
        + cs * 10
    );
}

function parseTimeToMs(str, format) {
    if (format === 'vtt') return parseVttTimeMs(str);
    if (format === 'lrc') return parseLrcTimeMs(str);
    if (format === 'ass' || format === 'ssa') return parseAssTimeMs(str);
    return parseSrtTimeMs(str);
}

function formatTimeMs(ms, format) {
    if (format === 'vtt') return formatVttTimeMs(ms);
    if (format === 'lrc') return formatLrcTimeMs(ms);
    if (format === 'ass' || format === 'ssa') return formatAssTimeMs(ms);
    return formatSrtTimeMs(ms);
}

function normalizeCues(cues, format) {
    const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
    for (let i = 0; i < sorted.length; i += 1) {
        const cue = sorted[i];
        cue.index = i + 1;
        if (cue.endMs == null || cue.endMs <= cue.startMs) {
            const next = sorted[i + 1];
            cue.endMs = next ? Math.max(cue.startMs + 500, next.startMs - 1) : cue.startMs + 3000;
        }
        if (format === 'lrc' && cue.endMs == null) {
            const next = sorted[i + 1];
            cue.endMs = next ? next.startMs : cue.startMs + 3000;
        }
    }
    return sorted;
}

function parseSrt(raw) {
    const text = stripBom(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = text.split(/\n{2,}/);
    const cues = [];

    for (const block of blocks) {
        const lines = block.split('\n').map((l) => l.trimEnd()).filter((l, idx, arr) => !(idx === arr.length - 1 && l === ''));
        if (!lines.length) continue;

        let idxLine = 0;
        let index = cues.length + 1;
        if (/^\d+$/.test(lines[0].trim())) {
            index = Number(lines[0].trim());
            idxLine = 1;
        }
        const timing = lines[idxLine];
        if (!timing) continue;
        const arrow = timing.match(/^(.+?)\s*-->\s*(.+?)(?:\s+(?:X1:|align:|position:).*)?$/i);
        if (!arrow) continue;
        const startMs = parseSrtTimeMs(arrow[1]);
        const endMs = parseSrtTimeMs(arrow[2]);
        if (startMs == null) continue;
        const textLines = lines.slice(idxLine + 1);
        if (!textLines.length) continue;
        cues.push({
            index,
            startMs,
            endMs: endMs == null ? null : endMs,
            text: textLines.join('\n'),
        });
    }
    return normalizeCues(cues, 'srt');
}

function parseVtt(raw) {
    const text = stripBom(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n');
    const cues = [];
    let i = 0;
    while (i < lines.length && !lines[i].includes('-->')) i += 1;

    while (i < lines.length) {
        while (i < lines.length && !lines[i].includes('-->')) i += 1;
        if (i >= lines.length) break;
        const timing = lines[i].trim();
        const arrow = timing.match(/^(.+?)\s*-->\s*(.+?)(?:\s+(?:align:|position:|line:|size:).*)?$/i);
        i += 1;
        if (!arrow) continue;
        const startMs = parseVttTimeMs(arrow[1]);
        const endMs = parseVttTimeMs(arrow[2]);
        if (startMs == null) continue;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== '') {
            textLines.push(lines[i]);
            i += 1;
        }
        if (!textLines.length) continue;
        cues.push({
            index: cues.length + 1,
            startMs,
            endMs: endMs == null ? null : endMs,
            text: textLines.join('\n'),
        });
        while (i < lines.length && lines[i].trim() === '') i += 1;
    }
    return normalizeCues(cues, 'vtt');
}

function parseLrc(raw) {
    const text = stripBom(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n');
    const header = [];
    const cues = [];

    for (const line of lines) {
        const trimmed = line.trimEnd();
        if (!trimmed) continue;
        if (/^\[[a-zA-Z]+:/.test(trimmed)) {
            header.push(trimmed);
            continue;
        }
        const tagRe = /\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)(?:-(\d{1,2}:\d{2}(?:\.\d{1,3})?))?\]/g;
        let match;
        let lastIndex = 0;
        const tags = [];
        while ((match = tagRe.exec(trimmed)) !== null) {
            tags.push({ start: match[1], end: match[2] || null, pos: match.index });
            lastIndex = tagRe.lastIndex;
        }
        if (!tags.length) continue;
        const body = trimmed.slice(lastIndex).trim();
        for (const tag of tags) {
            const startMs = parseLrcTimeMs(tag.start);
            if (startMs == null) continue;
            const endMs = tag.end ? parseLrcTimeMs(tag.end) : null;
            cues.push({
                index: cues.length + 1,
                startMs,
                endMs,
                text: body,
            });
        }
    }
    return { cues: normalizeCues(cues, 'lrc'), header };
}

function splitAssEventFields(body, fieldCount) {
    const parts = [];
    let start = 0;
    const src = String(body || '');
    const maxSplits = Math.max(1, fieldCount) - 1;
    for (let i = 0; i < maxSplits; i += 1) {
        const idx = src.indexOf(',', start);
        if (idx < 0) {
            parts.push(src.slice(start));
            return parts;
        }
        parts.push(src.slice(start, idx));
        start = idx + 1;
    }
    parts.push(src.slice(start));
    return parts;
}

function fieldMapFromAssParts(parts, formatFields) {
    const map = {};
    for (let i = 0; i < formatFields.length; i += 1) {
        map[formatFields[i].toLowerCase()] = parts[i] != null ? parts[i] : '';
    }
    return map;
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
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        'Style: Default,Microsoft YaHei,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,48,1',
        '',
        '[Events]',
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ];
}

function parseAss(raw) {
    const text = stripBom(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n');
    let formatFields = [...DEFAULT_ASS_EVENT_FIELDS];
    let inEvents = false;
    const header = [];
    const cues = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (/^\[Events\]/i.test(trimmed)) {
            inEvents = true;
            header.push(line);
            continue;
        }
        if (/^\[[^\]]+\]/.test(trimmed)) {
            if (inEvents) break;
            header.push(line);
            continue;
        }
        if (!inEvents) {
            header.push(line);
            continue;
        }
        if (/^Format:/i.test(trimmed)) {
            const fields = trimmed.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
            if (fields.length) formatFields = fields;
            header.push(line);
            continue;
        }
        if (!/^Dialogue:/i.test(trimmed)) continue;
        const body = trimmed.slice('Dialogue:'.length).replace(/^\s*/, '');
        const parts = splitAssEventFields(body, formatFields.length);
        const fields = fieldMapFromAssParts(parts, formatFields);
        const startMs = parseAssTimeMs(fields.start);
        const endMs = parseAssTimeMs(fields.end);
        if (startMs == null) continue;
        const textRaw = fields.text != null ? fields.text : '';
        cues.push({
            index: cues.length + 1,
            startMs,
            endMs: endMs == null ? null : endMs,
            text: String(textRaw).replace(/\\N/gi, '\n'),
            ass: {
                layer: fields.layer != null && fields.layer !== '' ? fields.layer : (fields.marked || '0'),
                style: fields.style || 'Default',
                name: fields.name || '',
                marginL: fields.marginl || '0',
                marginR: fields.marginr || '0',
                marginV: fields.marginv || '0',
                effect: fields.effect || '',
            },
        });
    }

    const ensuredHeader = header.some((l) => /^\[Events\]/i.test(String(l).trim()))
        ? header
        : defaultAssHeaderLines();
    return { cues: normalizeCues(cues, 'ass'), header: ensuredHeader };
}

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

function parseSubtitle(raw, formatHint) {
    const format = formatHint || detectFormat('', raw);
    if (format === 'ass' || format === 'ssa') {
        const parsed = parseAss(raw);
        return { format: 'ass', cues: parsed.cues, header: parsed.header };
    }
    if (format === 'vtt') {
        return { format: 'vtt', cues: parseVtt(raw), header: ['WEBVTT', ''] };
    }
    if (format === 'lrc') {
        const parsed = parseLrc(raw);
        return { format: 'lrc', cues: parsed.cues, header: parsed.header };
    }
    return { format: 'srt', cues: parseSrt(raw), header: [] };
}

function serializeSrt(cues) {
    return cues.map((cue, i) => {
        const idx = cue.index != null ? cue.index : i + 1;
        const start = formatSrtTimeMs(cue.startMs);
        const end = formatSrtTimeMs(cue.endMs != null ? cue.endMs : cue.startMs + 2000);
        return `${idx}\n${start} --> ${end}\n${cue.text || ''}`;
    }).join('\n\n') + (cues.length ? '\n' : '');
}

function serializeVtt(cues, header) {
    const head = Array.isArray(header) && header.length
        ? header.filter((l) => l !== '').join('\n')
        : 'WEBVTT';
    const body = cues.map((cue) => {
        const start = formatVttTimeMs(cue.startMs);
        const end = formatVttTimeMs(cue.endMs != null ? cue.endMs : cue.startMs + 2000);
        return `${start} --> ${end}\n${cue.text || ''}`;
    }).join('\n\n');
    return body ? `${head}\n\n${body}\n` : `${head}\n`;
}

function serializeLrc(cues, header) {
    const headLines = Array.isArray(header) ? header.filter(Boolean) : [];
    const lines = cues.map((cue) => {
        const start = formatLrcTimeMs(cue.startMs);
        if (cue.endMs != null && cue.endMs > cue.startMs) {
            const end = formatLrcTimeMs(cue.endMs);
            return `[${start}-${end}]${cue.text || ''}`;
        }
        return `[${start}]${cue.text || ''}`;
    });
    const all = [...headLines, ...lines];
    return all.join('\n') + (all.length ? '\n' : '');
}

function serializeAss(cues, options = {}) {
    const title = String(options.title || 'Transub').replace(/[\r\n]/g, ' ');
    const speakers = Array.isArray(options.speakers) ? options.speakers : [];
    const cueMarkers = options.cueMarkers && typeof options.cueMarkers === 'object'
        ? options.cueMarkers
        : {};
    const dualApi = options.pairCues && Array.isArray(options.pairCues) ? options.pairCues : null;

    const styleLines = [
        'Style: Default,Microsoft YaHei,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,48,1',
    ];
    const speakerStyleName = new Map();
    speakers.forEach((sp, i) => {
        if (!sp?.id || !sp?.name) return;
        const safe = `Sp${i + 1}`;
        speakerStyleName.set(sp.id, safe);
        const color = assColourFromHex(sp.color || '#FFFFFF');
        styleLines.push(
            `Style: ${safe},Microsoft YaHei,48,${color},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,48,1`,
        );
    });
    if (dualApi) {
        // Alignment 2 = bottom-center; larger MarginV sits higher.
        // Default matches settings merge UI: 译文在上 (target-first) → Source lower.
        const order = String(options.lineOrder || options.dualLineOrder || 'target-first')
            .trim()
            .toLowerCase();
        const sourceFirst = order === 'source-first' || order === 'source';
        const srcMarginV = sourceFirst ? 112 : 56;
        styleLines.push(
            `Style: Source,Arial,40,&H00AAAAAA,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,${srcMarginV},1`,
        );
    }

    const header = [
        '[Script Info]',
        `Title: ${title}`,
        'ScriptType: v4.00+',
        'PlayResX: 1920',
        'PlayResY: 1080',
        'WrapStyle: 0',
        '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        ...styleLines,
        '',
        '[Events]',
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ].join('\n');

    const events = [];
    const list = Array.isArray(cues) ? cues : [];
    list.forEach((cue, index) => {
        const start = formatAssTimeMs(cue.startMs);
        const end = formatAssTimeMs(cue.endMs != null ? cue.endMs : cue.startMs + 2000);
        const key = `${index}:${Math.round(Number(cue.startMs) || 0)}`;
        const marker = cueMarkers[key] || null;
        const style = (marker?.speakerId && speakerStyleName.get(marker.speakerId)) || 'Default';
        const name = speakers.find((s) => s.id === marker?.speakerId)?.name || '';
        let text = String(cue.text || '').replace(/\r?\n/g, '\\N').replace(/,/g, '，') || ' ';
        events.push(`Dialogue: 0,${start},${end},${style},${escapeAssName(name)},0,0,0,,${text}`);
    });

    return `${header}\n${events.join('\n')}${events.length ? '\n' : ''}`;
}

function formatAssTimeMs(ms) {
    const n = Math.max(0, Math.round(Number(ms) || 0));
    const h = Math.floor(n / 3600000);
    const m = Math.floor((n % 3600000) / 60000);
    const s = Math.floor((n % 60000) / 1000);
    const cs = Math.floor((n % 1000) / 10);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function assColourFromHex(hex) {
    const raw = String(hex || '').replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) return '&H00FFFFFF';
    const r = raw.slice(0, 2);
    const g = raw.slice(2, 4);
    const b = raw.slice(4, 6);
    // ASS is &HAABBGGRR
    return `&H00${b}${g}${r}`.toUpperCase();
}

function escapeAssName(name) {
    return String(name || '').replace(/[,]/g, ' ').slice(0, 40);
}

function serializeSubtitle({ format, cues, header, assOptions }) {
    const fmt = String(format || 'srt').toLowerCase();
    if (fmt === 'ass' || fmt === 'ssa') {
        // Prefer round-trip when opening an existing ASS (preserve Script Info / Styles).
        if (Array.isArray(header) && header.some((l) => /^\[(?:Script Info|V4\+? Styles|Events)\]/i.test(String(l).trim()))) {
            return serializeAssDocument(cues, header);
        }
        if (assOptions && typeof assOptions === 'object') {
            return serializeAss(cues, assOptions);
        }
        return serializeAssDocument(cues, header);
    }
    const normalized = normalizeCues(cues.map((c) => ({ ...c })), format);
    if (format === 'vtt') return serializeVtt(normalized, header);
    if (format === 'lrc') return serializeLrc(normalized, header);
    return serializeSrt(normalized);
}

function isEditableFormat(format) {
    return EDITABLE_FORMATS.has(String(format || '').toLowerCase());
}

module.exports = {
    EDITABLE_FORMATS,
    detectFormat,
    parseSubtitle,
    serializeSubtitle,
    serializeAss,
    parseAss,
    parseTimeToMs,
    formatTimeMs,
    isEditableFormat,
};
