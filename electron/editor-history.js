const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const HISTORY_FILE_NAME = 'transub-editor-history.json';
const MAX_ENTRIES = 30;

function getHistoryFilePath() {
    return path.join(getWritableRoot(), HISTORY_FILE_NAME);
}

function normalizeEntry(raw) {
    const subPath = String(raw?.path || '').trim();
    if (!subPath) return null;
    return {
        path: subPath,
        videoPath: String(raw?.videoPath || '').trim(),
        openedAt: String(raw?.openedAt || '').trim() || new Date().toISOString(),
        basename: String(raw?.basename || '').trim() || path.basename(subPath),
    };
}

function loadEditorHistory() {
    const filePath = getHistoryFilePath();
    if (!fs.existsSync(filePath)) return { entries: [] };
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const entries = Array.isArray(parsed.entries)
            ? parsed.entries.map(normalizeEntry).filter(Boolean)
            : [];
        return { entries };
    } catch {
        return { entries: [] };
    }
}

function saveEditorHistory(entries) {
    const filePath = getHistoryFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
        filePath,
        `${JSON.stringify({ version: 1, entries }, null, 2)}\n`,
        'utf8',
    );
}

function appendEditorHistory(entry) {
    const record = normalizeEntry({
        ...entry,
        openedAt: entry?.openedAt || new Date().toISOString(),
    });
    if (!record) return null;
    const key = process.platform === 'win32'
        ? record.path.toLowerCase()
        : record.path;
    const { entries } = loadEditorHistory();
    const next = [
        record,
        ...entries.filter((e) => {
            const k = process.platform === 'win32' ? e.path.toLowerCase() : e.path;
            return k !== key;
        }),
    ].slice(0, MAX_ENTRIES);
    saveEditorHistory(next);
    return record;
}

function clearEditorHistory() {
    saveEditorHistory([]);
    return { ok: true, entries: [] };
}

module.exports = {
    loadEditorHistory,
    appendEditorHistory,
    clearEditorHistory,
};
