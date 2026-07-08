const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const HISTORY_FILE_NAME = 'transub-task-history.json';
const MAX_ENTRIES = 100;

function getHistoryFilePath() {
    return path.join(getWritableRoot(), HISTORY_FILE_NAME);
}

function loadTaskHistory() {
    const filePath = getHistoryFilePath();
    if (!fs.existsSync(filePath)) return { entries: [] };
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
    } catch {
        return { entries: [] };
    }
}

function appendTaskHistory(entry) {
    const filePath = getHistoryFilePath();
    const { entries } = loadTaskHistory();
    const record = {
        id: entry.id || `job-${Date.now()}`,
        startedAt: entry.startedAt || new Date().toISOString(),
        finishedAt: entry.finishedAt || new Date().toISOString(),
        total: Number(entry.total) || 0,
        generated: Number(entry.generated) || 0,
        skipped: Number(entry.skipped) || 0,
        failed: Number(entry.failed) || 0,
        cancelled: !!entry.cancelled,
        options: entry.options || {},
        errors: Array.isArray(entry.errors) ? entry.errors.slice(0, 8) : [],
    };
    const next = [record, ...entries].slice(0, MAX_ENTRIES);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({ version: 1, entries: next }, null, 2)}\n`, 'utf8');
    return record;
}

module.exports = {
    loadTaskHistory,
    appendTaskHistory,
};
