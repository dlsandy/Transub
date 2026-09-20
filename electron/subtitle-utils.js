const fs = require('fs');
const path = require('path');
const {
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
    MEDIA_EXTENSIONS,
} = require('../src/js/media-extensions-core');

const SUBTITLE_EXTS = ['.srt', '.vtt', '.lrc', '.ass', '.ssa', '.sub', '.sup', '.idx'];
const PREFERRED_SUBTITLE_EXTS = ['.srt', '.vtt', '.lrc'];
const EDITABLE_SUBTITLE_EXTS = ['.srt', '.vtt', '.lrc', '.ass', '.ssa'];

/** Short-TTL readdir cache — sidecar scans repeat the same dirs during a batch. */
const DIR_LIST_TTL_MS = 2500;
const _dirListCache = new Map(); // dir -> { at, names }

function listDirCached(dir) {
    const key = process.platform === 'win32'
        ? String(dir || '').toLowerCase()
        : String(dir || '');
    if (!key) return [];
    const hit = _dirListCache.get(key);
    const now = Date.now();
    if (hit && (now - hit.at) < DIR_LIST_TTL_MS) {
        return hit.names;
    }
    let names;
    try {
        names = fs.readdirSync(dir);
    } catch {
        names = [];
    }
    _dirListCache.set(key, { at: now, names });
    // Bound cache size for long-lived processes scanning many folders.
    if (_dirListCache.size > 64) {
        const oldest = _dirListCache.keys().next().value;
        if (oldest != null) _dirListCache.delete(oldest);
    }
    return names;
}

function invalidateDirListCache(dir) {
    if (dir == null || dir === '') {
        _dirListCache.clear();
        return;
    }
    const key = process.platform === 'win32'
        ? String(dir).toLowerCase()
        : String(dir);
    _dirListCache.delete(key);
}

function extRank(filePath) {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    const idx = PREFERRED_SUBTITLE_EXTS.indexOf(ext);
    return idx >= 0 ? idx : PREFERRED_SUBTITLE_EXTS.length + SUBTITLE_EXTS.indexOf(ext);
}

/**
 * Prefer unsuffixed sidecars (same name as media / merged bilingual) over *.zh.*,
 * then other language tags, then source-language sidecars — so "编辑字幕" opens
 * the playable track when both exist.
 */
function trackRank(filePath) {
    const base = path.basename(String(filePath || ''), path.extname(filePath)).toLowerCase();
    const parts = base.split('.');
    if (parts.length < 2) return 0;
    const tag = parts[parts.length - 1];
    if (tag === 'bilingual') return 0;
    if (tag === 'zh' || tag === 'zh-cn' || tag.startsWith('zh-')) return 1;
    if (tag === 'source' || tag === 'ja' || tag === 'en') return 3;
    if (/^[a-z]{2,8}(?:-[a-z0-9]{2,8}){0,2}$/.test(tag)) return 2;
    return 1;
}

function pickPreferredSidecar(candidates) {
    if (!candidates.length) return null;
    return [...candidates].sort((a, b) => {
        const byExt = extRank(a) - extRank(b);
        if (byExt !== 0) return byExt;
        return trackRank(a) - trackRank(b);
    })[0];
}

function matchSidecarsInDir(dir, stem) {
    const matches = [];
    try {
        for (const name of listDirCached(dir)) {
            if (!isSubtitleFile(name)) continue;
            const fileStem = name.slice(0, name.length - path.extname(name).length);
            if (fileStem === stem || fileStem.startsWith(`${stem}.`)) {
                matches.push(path.join(dir, name));
            }
        }
    } catch (_) { /* skip */ }
    return matches;
}

function isSubtitleFile(fileName) {
    const lower = String(fileName || '').toLowerCase();
    return SUBTITLE_EXTS.some((ext) => lower.endsWith(ext));
}

function collectSubtitleSidecars(videoPath) {
    const resolved = path.resolve(String(videoPath || ''));
    const dir = path.dirname(resolved);
    const stem = path.basename(resolved, path.extname(resolved));
    const sidecars = [];
    const seen = new Set();

    const add = (p) => {
        const key = process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
        if (seen.has(key)) return;
        seen.add(key);
        sidecars.push(path.resolve(p));
    };

    try {
        for (const name of listDirCached(dir)) {
            if (!isSubtitleFile(name)) continue;
            const fileStem = name.slice(0, name.length - path.extname(name).length);
            if (fileStem === stem || fileStem.startsWith(`${stem}.`)) {
                add(path.join(dir, name));
            }
        }
    } catch (_) { /* skip */ }

    return sidecars;
}

function resolveLocalSubtitlePath(videoPath, preferredDir) {
    const resolved = path.resolve(String(videoPath || ''));
    const dir = preferredDir
        ? path.resolve(String(preferredDir))
        : path.dirname(resolved);
    const stem = path.basename(resolved, path.extname(resolved));

    const matches = matchSidecarsInDir(dir, stem);
    const picked = pickPreferredSidecar(matches);
    if (picked) return picked;

    if (preferredDir) return null;

    const sidecars = collectSubtitleSidecars(resolved);
    return pickPreferredSidecar(sidecars);
}

/**
 * Resolve dual-track paths for a video: `{stem}.{src}.{ext}` + `{stem}.{tgt}.{ext}`.
 */
function resolveDualSubtitlePaths(videoPath, preferredDir, {
    sourceSuffix = 'source',
    targetSuffix = 'zh-cn',
    subFormats = 'srt',
} = {}) {
    const resolved = path.resolve(String(videoPath || ''));
    const dir = preferredDir
        ? path.resolve(String(preferredDir))
        : path.dirname(resolved);
    const stem = path.basename(resolved, path.extname(resolved));
    const formats = String(subFormats || 'srt')
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => ['srt', 'vtt', 'lrc'].includes(s));
    const uniqueFormats = formats.length ? [...new Set(formats)] : ['srt'];
    const src = String(sourceSuffix || 'source').toLowerCase();
    const tgtRaw = targetSuffix == null ? 'zh-cn' : String(targetSuffix).trim().toLowerCase();
    const tgt = tgtRaw;

    const sourcePaths = [];
    const targetPaths = [];
    const legacyTargetTags = tgt === 'zh-cn' ? ['zh', 'chs', 'cn'] : [];
    for (const fmt of uniqueFormats) {
        const sourcePath = path.join(dir, `${stem}.${src}.${fmt}`);
        const targetPath = tgt
            ? path.join(dir, `${stem}.${tgt}.${fmt}`)
            : path.join(dir, `${stem}.${fmt}`);
        if (fs.existsSync(sourcePath)) sourcePaths.push(sourcePath);
        if (fs.existsSync(targetPath)) targetPaths.push(targetPath);
        for (const legacy of legacyTargetTags) {
            const legacyPath = path.join(dir, `${stem}.${legacy}.${fmt}`);
            if (fs.existsSync(legacyPath)) targetPaths.push(legacyPath);
        }
    }

    return {
        dir,
        stem,
        sourceSuffix: src,
        targetSuffix: tgt,
        formats: uniqueFormats,
        sourcePaths,
        targetPaths,
        sourcePath: pickPreferredSidecar(sourcePaths),
        targetPath: pickPreferredSidecar(targetPaths),
        complete: uniqueFormats.every((fmt) => {
            const srcOk = fs.existsSync(path.join(dir, `${stem}.${src}.${fmt}`));
            const tgtOk = tgt
                ? (
                    fs.existsSync(path.join(dir, `${stem}.${tgt}.${fmt}`))
                    || legacyTargetTags.some((legacy) => fs.existsSync(path.join(dir, `${stem}.${legacy}.${fmt}`)))
                )
                : fs.existsSync(path.join(dir, `${stem}.${fmt}`));
            return srcOk && tgtOk;
        }),
    };
}

function resolveLocalSubtitleBatch(entries = []) {
    const results = {};
    for (const entry of entries) {
        const key = String(entry?.id ?? entry?.fullPath ?? '');
        if (!key || !entry?.fullPath) continue;
        const subPath = resolveLocalSubtitlePath(entry.fullPath);
        if (subPath) results[key] = subPath;
    }
    return results;
}

function isEditableSubtitleFile(fileName) {
    const lower = String(fileName || '').toLowerCase();
    return EDITABLE_SUBTITLE_EXTS.some((ext) => lower.endsWith(ext));
}

/** Trailing basename tags commonly used for subtitle tracks (not part of the media stem). */
const SUBTITLE_STEM_TAGS = new Set([
    'src', 'source', 'orig', 'original',
    'zh', 'chs', 'cht', 'cn', 'tw', 'hk',
    'zh-cn', 'zh-tw', 'zh-hk', 'zh-hans', 'zh-hant',
    'ja', 'jp', 'en', 'ko', 'kr',
    'bilingual', 'dual', 'cc', 'sdh', 'forced',
]);

/**
 * Candidate media basenames for a subtitle stem, longest-first.
 * e.g. Show.Name.S01E01.zh → [Show.Name.S01E01.zh, Show.Name.S01E01]
 *      movie.src → [movie.src, movie]
 */
function mediaStemCandidatesFromSubtitle(subStem) {
    const raw = String(subStem || '').trim();
    const out = [];
    const seen = new Set();
    const add = (value) => {
        const v = String(value || '').trim();
        if (!v || seen.has(v)) return;
        seen.add(v);
        out.push(v);
    };
    add(raw);
    let cur = raw;
    while (true) {
        const dot = cur.lastIndexOf('.');
        if (dot <= 0) break;
        const tag = cur.slice(dot + 1);
        const base = cur.slice(0, dot);
        if (!base) break;
        const tagLower = tag.toLowerCase();
        const stripTag = SUBTITLE_STEM_TAGS.has(tagLower)
            || /^[a-z]{2,3}$/i.test(tag)
            || /^[a-z]{2,3}([-_][a-z0-9]{2,8})?$/i.test(tag);
        if (!stripTag) break;
        add(base);
        cur = base;
    }
    return out;
}

function guessVideoPathForSubtitle(subtitlePath) {
    const subPath = path.resolve(String(subtitlePath || ''));
    if (!fs.existsSync(subPath)) return null;
    const dir = path.dirname(subPath);
    const subExt = path.extname(subPath);
    const subStem = path.basename(subPath, subExt);
    const stemCandidates = mediaStemCandidatesFromSubtitle(subStem);

    // Prefer video sidecars, then audio (podcasts / audio-only jobs).
    const mediaExts = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
    const mediaExtSet = new Set(mediaExts.map((e) => String(e).toLowerCase()));
    const seen = new Set();

    for (const stem of stemCandidates) {
        for (const ext of mediaExts) {
            const candidate = path.join(dir, `${stem}.${ext}`);
            const key = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
            if (seen.has(key)) continue;
            seen.add(key);
            if (fs.existsSync(candidate)) return candidate;
        }
    }

    // Directory scan: match exact stem, or subtitle stem = mediaStem + track tag
    // (handles odd casing / unexpected extensions already in MEDIA list).
    try {
        let best = null;
        let bestStemLen = -1;
        for (const name of listDirCached(dir)) {
            const extWithDot = path.extname(name);
            const ext = extWithDot.slice(1).toLowerCase();
            if (!mediaExtSet.has(ext)) continue;
            const mediaStem = name.slice(0, name.length - extWithDot.length);
            if (!mediaStem) continue;
            const matched = stemCandidates.some((stem) => (
                stem === mediaStem || stem.startsWith(`${mediaStem}.`)
            ));
            if (!matched) continue;
            if (mediaStem.length > bestStemLen) {
                bestStemLen = mediaStem.length;
                best = path.join(dir, name);
            }
        }
        if (best) return best;
    } catch (_) { /* ignore unreadable dirs */ }

    return null;
}

module.exports = {
    SUBTITLE_EXTS,
    PREFERRED_SUBTITLE_EXTS,
    EDITABLE_SUBTITLE_EXTS,
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
    MEDIA_EXTENSIONS,
    isSubtitleFile,
    isEditableSubtitleFile,
    collectSubtitleSidecars,
    pickPreferredSidecar,
    resolveLocalSubtitlePath,
    resolveLocalSubtitleBatch,
    resolveDualSubtitlePaths,
    guessVideoPathForSubtitle,
    mediaStemCandidatesFromSubtitle,
    invalidateDirListCache,
};
