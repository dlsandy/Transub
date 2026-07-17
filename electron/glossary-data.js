const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const GLOSSARY_FILE_NAME = 'transub-glossary.json';

function getGlossaryFilePath() {
    return path.join(getWritableRoot(), GLOSSARY_FILE_NAME);
}

function emptyGlossary() {
    return {
        version: 1,
        updatedAt: null,
        entries: [],
    };
}

function readGlossary() {
    const filePath = getGlossaryFilePath();
    if (!fs.existsSync(filePath)) {
        return { ok: true, path: filePath, glossary: emptyGlossary(), exists: false };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const glossary = {
            version: Number(parsed.version) || 1,
            updatedAt: parsed.updatedAt || null,
            entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        };
        return { ok: true, path: filePath, glossary, exists: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: filePath };
    }
}

function writeGlossary(glossary) {
    const filePath = getGlossaryFilePath();
    try {
        const payload = {
            version: 1,
            updatedAt: new Date().toISOString(),
            entries: Array.isArray(glossary?.entries) ? glossary.entries : [],
        };
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        return { ok: true, path: filePath, glossary: payload };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: filePath };
    }
}

module.exports = {
    GLOSSARY_FILE_NAME,
    getGlossaryFilePath,
    emptyGlossary,
    readGlossary,
    writeGlossary,
};
