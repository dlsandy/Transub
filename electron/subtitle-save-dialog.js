/**
 * Shared save-dialog options for subtitle export / 另存为.
 */
const path = require('path');

const SAVE_FORMATS = Object.freeze(['srt', 'vtt', 'lrc', 'ass']);

/**
 * @param {unknown} raw
 * @param {string} [fallback]
 * @returns {'srt'|'vtt'|'lrc'|'ass'}
 */
function normalizeSaveFormat(raw, fallback = 'srt') {
    const hint = String(raw || '').toLowerCase().replace(/^\./, '');
    if (hint === 'ssa') return 'ass';
    if (SAVE_FORMATS.includes(hint)) return hint;
    const fb = String(fallback || 'srt').toLowerCase().replace(/^\./, '');
    if (fb === 'ssa') return 'ass';
    return SAVE_FORMATS.includes(fb) ? fb : 'srt';
}

/**
 * @param {string} format
 * @returns {Array<{ name: string, extensions: string[] }>}
 */
function subtitleSaveFilters(format) {
    const all = { name: '所有字幕', extensions: ['srt', 'vtt', 'lrc', 'ass'] };
    if (format === 'vtt') return [{ name: 'WebVTT', extensions: ['vtt'] }, all];
    if (format === 'lrc') return [{ name: 'LRC', extensions: ['lrc'] }, all];
    if (format === 'ass') return [{ name: 'Advanced SubStation', extensions: ['ass'] }, all];
    return [{ name: 'SubRip', extensions: ['srt'] }, all];
}

/**
 * @param {string} filePath
 * @param {string} [fallbackFormat]
 * @returns {'srt'|'vtt'|'lrc'|'ass'}
 */
function formatFromSavePath(filePath, fallbackFormat = 'srt') {
    const ext = path.extname(String(filePath || '')).toLowerCase().replace(/^\./, '');
    return normalizeSaveFormat(ext, fallbackFormat);
}

/**
 * @param {unknown} payload
 * @returns {{
 *   title: string,
 *   defaultPath: string,
 *   filters: Array<{ name: string, extensions: string[] }>,
 *   format: 'srt'|'vtt'|'lrc'|'ass',
 * }}
 */
function buildSubtitleSaveDialogOptions(payload = {}) {
    const src = payload && typeof payload === 'object' ? payload : {};
    const format = normalizeSaveFormat(src.format, 'srt');
    const defaultPath = String(src.defaultPath || src.defaultName || src.suggestedName || '').trim()
        || `subtitle.${format}`;
    const title = String(src.title || '').trim() || '另存为';
    return {
        title,
        defaultPath,
        filters: subtitleSaveFilters(format),
        format,
    };
}

/**
 * Ensure the chosen path has a subtitle extension Electron filters may omit.
 * @param {string} filePath
 * @param {string} [fallbackFormat]
 * @returns {string}
 */
function ensureSubtitleSaveExtension(filePath, fallbackFormat = 'srt') {
    const raw = String(filePath || '').trim();
    if (!raw) return raw;
    if (path.extname(raw)) return raw;
    const format = normalizeSaveFormat(fallbackFormat, 'srt');
    return `${raw}.${format}`;
}

module.exports = {
    SAVE_FORMATS,
    normalizeSaveFormat,
    subtitleSaveFilters,
    formatFromSavePath,
    buildSubtitleSaveDialogOptions,
    ensureSubtitleSaveExtension,
};
