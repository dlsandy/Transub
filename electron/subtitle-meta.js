const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

function metaFileNameForSubtitle(subPath) {
    const resolved = path.resolve(String(subPath || ''));
    if (!resolved) return '';
    const stem = path.basename(resolved, path.extname(resolved));
    return `${stem}.transub.json`;
}

/** 默认：项目可写根目录下的 temp/{stem}.transub.json */
function metaPathForSubtitle(subPath) {
    const name = metaFileNameForSubtitle(subPath);
    if (!name) return '';
    return path.join(getWritableRoot(), 'temp', name);
}

/** 旧版：与字幕同目录的 {stem}.transub.json（仅用于兼容读取） */
function legacyMetaPathForSubtitle(subPath) {
    const resolved = path.resolve(String(subPath || ''));
    if (!resolved) return '';
    const name = metaFileNameForSubtitle(resolved);
    if (!name) return '';
    return path.join(path.dirname(resolved), name);
}

function listMetaPathCandidates(subPath) {
    const primary = metaPathForSubtitle(subPath);
    const legacy = legacyMetaPathForSubtitle(subPath);
    const out = [];
    if (primary) out.push(primary);
    if (legacy && legacy !== primary) out.push(legacy);
    return out;
}

function readSubtitleMeta(subPath) {
    const candidates = listMetaPathCandidates(subPath);
    const primary = candidates[0] || '';
    if (!candidates.length) {
        return { ok: true, path: primary, meta: null, exists: false };
    }
    for (const metaPath of candidates) {
        if (!metaPath || !fs.existsSync(metaPath)) continue;
        try {
            const raw = fs.readFileSync(metaPath, 'utf8');
            const meta = JSON.parse(raw);
            if (!meta || typeof meta !== 'object') {
                return { ok: false, error: '元数据格式无效', path: metaPath };
            }
            return { ok: true, path: metaPath, meta, exists: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err), path: metaPath };
        }
    }
    return { ok: true, path: primary, meta: null, exists: false };
}

function writeSubtitleMeta(subPath, meta) {
    const metaPath = metaPathForSubtitle(subPath);
    if (!metaPath) return { ok: false, error: '缺少字幕路径' };
    if (!meta || typeof meta !== 'object') {
        return { ok: false, error: '缺少元数据' };
    }
    try {
        const dir = path.dirname(metaPath);
        fs.mkdirSync(dir, { recursive: true });
        const payload = {
            ...meta,
            updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(metaPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        return { ok: true, path: metaPath };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: metaPath };
    }
}

module.exports = {
    metaPathForSubtitle,
    legacyMetaPathForSubtitle,
    readSubtitleMeta,
    writeSubtitleMeta,
};
