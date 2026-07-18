const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

function draftFileNameForSubtitle(subPath) {
    const resolved = path.resolve(String(subPath || ''));
    if (!resolved) return '';
    const stem = path.basename(resolved, path.extname(resolved));
    return `${stem}.transub.draft.json`;
}

function draftPathForSubtitle(subPath) {
    const name = draftFileNameForSubtitle(subPath);
    if (!name) return '';
    return path.join(getWritableRoot(), 'temp', name);
}

function legacyDraftPathForSubtitle(subPath) {
    const resolved = path.resolve(String(subPath || ''));
    if (!resolved) return '';
    const name = draftFileNameForSubtitle(resolved);
    if (!name) return '';
    return path.join(path.dirname(resolved), name);
}

function listDraftPathCandidates(subPath) {
    const primary = draftPathForSubtitle(subPath);
    const legacy = legacyDraftPathForSubtitle(subPath);
    const out = [];
    if (primary) out.push(primary);
    if (legacy && legacy !== primary) out.push(legacy);
    return out;
}

function readSubtitleDraft(subPath) {
    const candidates = listDraftPathCandidates(subPath);
    const primary = candidates[0] || '';
    for (const draftPath of candidates) {
        if (!draftPath || !fs.existsSync(draftPath)) continue;
        try {
            const raw = fs.readFileSync(draftPath, 'utf8');
            const draft = JSON.parse(raw);
            if (!draft || typeof draft !== 'object') {
                return { ok: false, error: '草稿格式无效', path: draftPath };
            }
            return { ok: true, path: draftPath, draft, exists: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err), path: draftPath };
        }
    }
    return { ok: true, path: primary, draft: null, exists: false };
}

function writeSubtitleDraft(subPath, payload = {}) {
    const draftPath = draftPathForSubtitle(subPath);
    if (!draftPath) return { ok: false, error: '无效字幕路径' };
    try {
        fs.mkdirSync(path.dirname(draftPath), { recursive: true });
        const draft = {
            version: 1,
            subtitlePath: path.resolve(String(subPath || '')),
            savedAt: new Date().toISOString(),
            format: payload.format || 'srt',
            header: Array.isArray(payload.header) ? payload.header : [],
            cues: Array.isArray(payload.cues) ? payload.cues : [],
        };
        fs.writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
        return { ok: true, path: draftPath, savedAt: draft.savedAt };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function clearSubtitleDraft(subPath) {
    const candidates = listDraftPathCandidates(subPath);
    let removed = 0;
    for (const draftPath of candidates) {
        if (!draftPath || !fs.existsSync(draftPath)) continue;
        try {
            fs.unlinkSync(draftPath);
            removed += 1;
        } catch (_) { /* ignore */ }
    }
    return { ok: true, removed };
}

function shouldOfferDraftRestore(subPath) {
    const resolved = path.resolve(String(subPath || ''));
    const read = readSubtitleDraft(resolved);
    if (!read.ok || !read.exists || !read.draft) {
        return { ok: true, offer: false, reason: 'no_draft' };
    }
    const draftAt = Date.parse(read.draft.savedAt || '');
    if (!Number.isFinite(draftAt)) {
        return { ok: true, offer: false, reason: 'bad_draft_time' };
    }
    let fileMtime = 0;
    try {
        if (fs.existsSync(resolved)) {
            fileMtime = fs.statSync(resolved).mtimeMs;
        }
    } catch (_) {
        fileMtime = 0;
    }
    if (draftAt <= fileMtime) {
        return { ok: true, offer: false, reason: 'draft_older', path: read.path, draft: read.draft };
    }
    const cueCount = Array.isArray(read.draft.cues) ? read.draft.cues.length : 0;
    return {
        ok: true,
        offer: true,
        path: read.path,
        draft: read.draft,
        savedAt: read.draft.savedAt,
        cueCount,
    };
}

module.exports = {
    draftPathForSubtitle,
    readSubtitleDraft,
    writeSubtitleDraft,
    clearSubtitleDraft,
    shouldOfferDraftRestore,
};
