const path = require('path');

const EDITABLE_FORMATS = new Set(['srt', 'vtt', 'lrc']);

function detectFormat(filePath, rawContent = '') {
    const ext = path.extname(String(filePath || '')).slice(1).toLowerCase();
    if (EDITABLE_FORMATS.has(ext)) return ext;
    const head = String(rawContent || '').trimStart().slice(0, 32).toUpperCase();
    if (head.startsWith('WEBVTT')) return 'vtt';
    if (/^\[\d{2}:/.test(String(rawContent || '').trim())) return 'lrc';
    if (/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(String(rawContent || ''))) return 'srt';
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

function parseTimeToMs(str, format) {
    if (format === 'vtt') return parseVttTimeMs(str);
    if (format === 'lrc') return parseLrcTimeMs(str);
    return parseSrtTimeMs(str);
}

function formatTimeMs(ms, format) {
    if (format === 'vtt') return formatVttTimeMs(ms);
    if (format === 'lrc') return formatLrcTimeMs(ms);
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

function parseSubtitle(raw, formatHint) {
    const format = formatHint || detectFormat('', raw);
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

function serializeSubtitle({ format, cues, header }) {
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
    parseTimeToMs,
    formatTimeMs,
    isEditableFormat,
};
