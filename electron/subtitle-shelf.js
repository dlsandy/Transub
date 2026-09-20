/**
 * Subtitle shelf store — sidecar files + {writableRoot}/subtitle-shelf/index.json
 */
const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');
const core = require('../src/js/subtitle-shelf-core');

const {
    SHELF_DIR_NAME,
    mediaIdFromPath,
    normPathKey,
    langCodeFromOptions,
    sourceLangFromOptions,
    langLabel,
    inferLangFromFilename,
    looksLikeSourceSubtitle,
    buildOriginalSidecarPath,
    emptyIndex,
    normalizeIndex,
    normalizeMedia,
    mediaSummary,
    pathExt,
    basenameStem,
} = core;

function getShelfRoot(root = getWritableRoot()) {
    return path.join(root || getWritableRoot(), SHELF_DIR_NAME);
}

function getIndexPath(root) {
    return path.join(getShelfRoot(root), 'index.json');
}

function softFail(err, extra = {}) {
    return { ok: false, error: err?.message || String(err || 'unknown'), ...extra };
}

/** In-memory shelf index cache — avoid repeated sync read/parse on hot batch paths. */
let _indexCacheRoot = '';
let _indexCache = null;

/** Short-TTL exists memo — list/detail/heal hit the same paths repeatedly. */
const EXISTS_TTL_MS = 3000;
const _existsCache = new Map(); // resolvedPath -> { ok, at }

function invalidateIndexCache() {
    _indexCacheRoot = '';
    _indexCache = null;
}

function invalidateExistsCache(filePath) {
    if (filePath == null || filePath === '') {
        _existsCache.clear();
        return;
    }
    try {
        _existsCache.delete(path.resolve(String(filePath).trim()));
    } catch { /* ignore */ }
}

function rememberExists(resolvedPath, ok) {
    const key = String(resolvedPath || '');
    if (!key) return;
    _existsCache.set(key, { ok: !!ok, at: Date.now() });
    if (_existsCache.size > 2048) {
        const drop = _existsCache.size - 1536;
        let n = 0;
        for (const k of _existsCache.keys()) {
            _existsCache.delete(k);
            n += 1;
            if (n >= drop) break;
        }
    }
}

function fileExists(p) {
    const resolved = String(p || '').trim();
    if (!resolved) return false;
    let key;
    try {
        key = path.resolve(resolved);
    } catch {
        return false;
    }
    const now = Date.now();
    const hit = _existsCache.get(key);
    if (hit && (now - hit.at) < EXISTS_TTL_MS) return hit.ok;
    let ok = false;
    try {
        ok = fs.existsSync(key);
    } catch {
        ok = false;
    }
    rememberExists(key, ok);
    return ok;
}

async function fileExistsAsync(p) {
    const resolved = String(p || '').trim();
    if (!resolved) return false;
    let key;
    try {
        key = path.resolve(resolved);
    } catch {
        return false;
    }
    const now = Date.now();
    const hit = _existsCache.get(key);
    if (hit && (now - hit.at) < EXISTS_TTL_MS) return hit.ok;
    let ok = false;
    try {
        await fs.promises.access(key, fs.constants.F_OK);
        ok = true;
    } catch {
        ok = false;
    }
    rememberExists(key, ok);
    return ok;
}

/** Software-dir `subtitles/` (or custom transcriptKeepDir / shelf-test root). */
function resolveSubtitlesDir(options = {}, { root } = {}) {
    try {
        const { resolveTranscriptKeepDir } = require('./transcript-keep');
        return resolveTranscriptKeepDir(options, { root });
    } catch {
        const custom = String(options.transcriptKeepDir || '').trim();
        if (custom) return path.resolve(custom);
        const base = String(root || '').trim() || getWritableRoot();
        return path.join(base, 'subtitles');
    }
}

function atomicWriteJson(filePath, data) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const body = `${JSON.stringify(data, null, 2)}\n`;
    fs.writeFileSync(tmp, body, 'utf8');
    try {
        fs.renameSync(tmp, filePath);
    } catch {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
        fs.renameSync(tmp, filePath);
    }
}

function loadIndex(root) {
    const indexPath = getIndexPath(root);
    const rootKey = String(root || getWritableRoot() || '');
    if (_indexCache && _indexCacheRoot === rootKey) {
        return normalizeIndex(_indexCache);
    }
    try {
        if (!fs.existsSync(indexPath)) {
            const empty = emptyIndex();
            _indexCacheRoot = rootKey;
            _indexCache = empty;
            return empty;
        }
        const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        const normalized = normalizeIndex(raw);
        _indexCacheRoot = rootKey;
        _indexCache = normalized;
        return normalized;
    } catch {
        invalidateIndexCache();
        return emptyIndex();
    }
}

function saveIndex(index, root) {
    const normalized = normalizeIndex(index);
    normalized.updatedAt = new Date().toISOString();
    atomicWriteJson(getIndexPath(root), normalized);
    _indexCacheRoot = String(root || getWritableRoot() || '');
    _indexCache = normalized;
    return normalized;
}

function notifyShelfChanged() {
    try {
        const winMod = require('./subtitle-shelf-window');
        if (typeof winMod.notifyShelfCatalogChanged === 'function') {
            winMod.notifyShelfCatalogChanged();
        }
    } catch { /* optional */ }
}

function findKeptTranscriptPath(videoPath, options = {}) {
    try {
        const { findKeptTranscript } = require('./transcript-keep');
        const kept = findKeptTranscript({ videoPath, options });
        if (kept?.found && kept.path) return String(kept.path).trim();
    } catch { /* ignore */ }
    return '';
}

function resolveTranscriptPath(out, options = {}) {
    const source = String(out?.sourceSubtitlePath || '').trim();
    if (source && fileExists(source)) return source;

    const sub = String(out?.subtitlePath || '').trim();
    const target = String(out?.targetSubtitlePath || '').trim();
    // Prefer this batch's live outputs before keep-dir lookup — same basename
    // stems can collide across unrelated media under software/subtitles.
    if (sub && !target && looksLikeSourceSubtitle(sub) && fileExists(sub)) {
        return sub;
    }
    // ASR-only: subtitlePath is the transcript even without lang markers
    if (sub && !target && !String(out?.bilingualSubtitlePath || '').trim() && fileExists(sub)) {
        const inferred = inferLangFromFilename(sub);
        if (!inferred || inferred === 'source' || inferred === 'original') return sub;
    }

    const videoPath = String(out?.videoPath || '').trim();
    if (videoPath) {
        const kept = findKeptTranscriptPath(videoPath, options);
        if (kept) return kept;
    }

    return source || '';
}

function resolveTranslationPath(out, transcriptPath) {
    const target = String(out?.targetSubtitlePath || '').trim();
    if (target && fileExists(target)) return target;
    const sub = String(out?.subtitlePath || '').trim();
    const src = String(transcriptPath || out?.sourceSubtitlePath || '').trim();
    if (sub && src && normPathKey(sub) !== normPathKey(src) && fileExists(sub)) {
        return sub;
    }
    const bilingual = String(out?.bilingualSubtitlePath || '').trim();
    if (bilingual && fileExists(bilingual)) return bilingual;
    return '';
}

function ensureOriginal(media, transcriptPath, sourceLang, options = {}, { root } = {}) {
    const m = media && typeof media === 'object' ? media : {};
    const existingPath = String(m.original?.path || '').trim();
    const transcript = String(transcriptPath || m.transcript?.path || '').trim();

    const tryHealBrokenOriginal = (origPath) => {
        const dest = String(origPath || '').trim();
        if (!dest || !fileExists(dest) || !transcript || !fileExists(transcript)) return false;
        try {
            const keep = require('./transcript-keep');
            const origBroken = keep.cuesHaveBrokenTimeline(keep.loadSubtitleAsEngineCues(dest));
            const trOk = !keep.cuesHaveBrokenTimeline(keep.loadSubtitleAsEngineCues(transcript));
            if (origBroken && trOk) {
                fs.copyFileSync(transcript, dest);
                invalidateExistsCache(dest);
                return true;
            }
        } catch { /* keep existing */ }
        return false;
    };

    if (existingPath && fileExists(existingPath)) {
        tryHealBrokenOriginal(existingPath);
        m.original = {
            path: existingPath,
            lang: m.original.lang || sourceLang || 'source',
            updatedAt: new Date().toISOString(),
        };
        m.broken = false;
        return m;
    }

    if (!transcript || !fileExists(transcript)) {
        if (!existingPath) m.broken = true;
        return m;
    }

    const mediaPath = String(m.mediaPath || '').trim();
    const ext = pathExt(transcript) || '.srt';
    const keepDir = resolveSubtitlesDir(options, { root });
    const dest = mediaPath
        ? buildOriginalSidecarPath(mediaPath, ext, keepDir)
        : path.join(keepDir, `${basenameStem(transcript).replace(/\.(transcribe|src|source|ja|jp|en|ko)$/i, '')}.original${ext}`);

    try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        // 原文槽位只在首次创建；已存在则保留内容（再跑 ASR 只更新转录）。
        // 例外：已有原文时间轴全丢/被 QC 挤成 0.5s 链，且转录轨完好 → 用转录覆盖救回。
        if (fileExists(dest)) {
            tryHealBrokenOriginal(dest);
        } else {
            fs.copyFileSync(transcript, dest);
            invalidateExistsCache(dest);
        }
        m.original = {
            path: dest,
            lang: sourceLang || 'source',
            updatedAt: new Date().toISOString(),
        };
        m.broken = false;
    } catch (err) {
        m.broken = true;
        m._ensureOriginalError = err?.message || String(err);
    }
    return m;
}

function healMedia(m, options = {}, { root } = {}) {
    const media = normalizeMedia(m);
    if (!media) return null;
    const originalOk = media.original?.path && fileExists(media.original.path);
    if (originalOk) {
        media.broken = false;
        return media;
    }
    const transcriptPath = media.transcript?.path || '';
    ensureOriginal(
        media,
        transcriptPath,
        media.transcript?.lang || media.original?.lang || 'source',
        options,
        { root },
    );
    return normalizeMedia(media);
}

function upsertTranslation(media, translationPath, options = {}) {
    if (!translationPath || !fileExists(translationPath)) return media;
    const lang = langCodeFromOptions(options);
    const label = langLabel(lang);
    const list = Array.isArray(media.translations) ? [...media.translations] : [];
    const entry = {
        lang,
        label,
        path: path.resolve(translationPath),
        updatedAt: new Date().toISOString(),
    };
    const idx = list.findIndex((t) => String(t.lang) === lang);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    media.translations = list;
    return media;
}

/**
 * Persist a translation path onto an existing shelf media entry.
 * @param {string} mediaId
 * @param {string} translationPath
 * @param {object} [options] lang / chineseSubtitleVariant / …
 * @param {{ root?: string }} [ctx]
 */
function registerTranslation(mediaId, translationPath, options = {}, { root } = {}) {
    try {
        const id = String(mediaId || '').trim();
        const dest = String(translationPath || '').trim();
        if (!id) return { ok: false, error: '缺少 mediaId' };
        if (!dest) return { ok: false, error: '缺少译文路径' };
        if (!fileExists(dest)) return { ok: false, error: '译文文件不存在' };
        const index = loadIndex(root);
        let media = index.media[id];
        if (!media) return { ok: false, error: '条目不存在' };
        media = healMedia(media, options, { root }) || media;
        upsertTranslation(media, dest, options);
        media.broken = false;
        media.updatedAt = new Date().toISOString();
        index.media[id] = normalizeMedia(media) || media;
        saveIndex(index, root);
        notifyShelfChanged();
        return { ok: true, mediaId: id, media: index.media[id] };
    } catch (err) {
        return softFail(err);
    }
}

function getShelfStatus(root) {
    try {
        const shelfRoot = getShelfRoot(root);
        const index = loadIndex(root);
        const mediaList = Object.values(index.media || {});
        let translationCount = 0;
        for (const m of mediaList) {
            translationCount += Array.isArray(m.translations) ? m.translations.length : 0;
        }
        return {
            ok: true,
            root: shelfRoot,
            mediaCount: mediaList.length,
            translationCount,
            updatedAt: index.updatedAt || '',
        };
    } catch (err) {
        return softFail(err);
    }
}

function listMediaSummaries({ query = '', root, checkMediaExists = true } = {}) {
    try {
        const index = loadIndex(root);
        const q = String(query || '').trim().toLowerCase();
        const out = [];
        // List trusts the index — no healMedia/ensureOriginal (those copy on every open).
        // mediaExists is filled below (sync memo) or by listMediaSummariesAsync (parallel).
        const existsByPath = checkMediaExists ? new Map() : null;
        for (const raw of Object.values(index.media || {})) {
            const m = normalizeMedia(raw);
            if (!m) continue;
            if (m.broken || !m.original?.path) continue;
            const summary = mediaSummary(m);
            if (existsByPath) {
                const mp = String(m.mediaPath || '').trim();
                if (!mp) {
                    summary.mediaExists = false;
                } else if (existsByPath.has(mp)) {
                    summary.mediaExists = existsByPath.get(mp);
                } else {
                    const ok = fileExists(mp);
                    existsByPath.set(mp, ok);
                    summary.mediaExists = ok;
                }
            }
            if (q) {
                const hay = `${summary.title} ${summary.mediaPath} ${summary.translationLabels.join(' ')}`.toLowerCase();
                if (!hay.includes(q)) continue;
            }
            out.push(summary);
        }
        out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        return { ok: true, items: out };
    } catch (err) {
        return softFail(err, { items: [] });
    }
}

/**
 * List with parallel mediaExists checks (preferred for IPC — avoids sync exists storm).
 */
async function listMediaSummariesAsync({ query = '', root } = {}) {
    const base = listMediaSummaries({ query, root, checkMediaExists: false });
    if (!base.ok) return base;
    const groups = new Map();
    for (const it of base.items) {
        const mp = String(it.mediaPath || '').trim();
        if (!mp) {
            it.mediaExists = false;
            continue;
        }
        if (!groups.has(mp)) groups.set(mp, []);
        groups.get(mp).push(it);
    }
    await Promise.all([...groups.entries()].map(async ([mp, items]) => {
        const ok = await fileExistsAsync(mp);
        for (const it of items) it.mediaExists = ok;
    }));
    return base;
}

function getMediaDetail(mediaId, { root } = {}) {
    try {
        const id = String(mediaId || '').trim();
        if (!id) return { ok: false, error: '缺少 mediaId' };
        const index = loadIndex(root);
        let m = index.media[id];
        if (!m) return { ok: false, error: '条目不存在' };
        m = healMedia(m, {}, { root }) || m;
        index.media[id] = m;
        try { saveIndex(index, root); } catch { /* ignore */ }

        const withExists = (slot) => {
            if (!slot || !slot.path) return null;
            return { ...slot, exists: fileExists(slot.path) };
        };
        return {
            ok: true,
            media: {
                ...m,
                mediaExists: fileExists(m.mediaPath),
                transcript: withExists(m.transcript),
                original: withExists(m.original),
                translations: (m.translations || []).map((t) => ({
                    ...t,
                    exists: fileExists(t.path),
                })),
            },
        };
    } catch (err) {
        return softFail(err);
    }
}

function ingestBatchHistoryEntry(entry, { root } = {}) {
    try {
        const outputs = Array.isArray(entry?.outputs) ? entry.outputs : [];
        const options = entry?.options && typeof entry.options === 'object' ? entry.options : {};
        const sourceLang = sourceLangFromOptions(options);
        const index = loadIndex(root);
        let ingested = 0;
        let skipped = 0;
        const failed = 0;

        for (const out of outputs) {
            const status = String(out?.status || '').trim().toLowerCase();
            if (status === 'cancelled' || status === 'failed' || status === 'skipped') {
                skipped += 1;
                continue;
            }
            if (status && status !== 'done' && status !== 'generated' && status !== 'ok') {
                skipped += 1;
                continue;
            }

            const videoPath = String(out?.videoPath || out?.path || '').trim();
            if (!videoPath) {
                skipped += 1;
                continue;
            }
            const resolvedVideo = path.resolve(videoPath);
            const mediaId = mediaIdFromPath(resolvedVideo);
            if (!mediaId) {
                skipped += 1;
                continue;
            }

            const transcriptPath = resolveTranscriptPath(out, options);
            const translationPath = resolveTranslationPath(out, transcriptPath);

            let media = index.media[mediaId] || {
                id: mediaId,
                mediaPath: resolvedVideo,
                title: path.basename(resolvedVideo, path.extname(resolvedVideo)),
                transcript: null,
                original: null,
                translations: [],
                updatedAt: new Date().toISOString(),
            };
            media.mediaPath = resolvedVideo;
            if (!media.title) {
                media.title = path.basename(resolvedVideo, path.extname(resolvedVideo));
            }

            if (transcriptPath && fileExists(transcriptPath)) {
                media.transcript = {
                    path: path.resolve(transcriptPath),
                    lang: sourceLang,
                    updatedAt: new Date().toISOString(),
                };
            }

            ensureOriginal(media, media.transcript?.path || transcriptPath, sourceLang, options, { root });

            if (translationPath) {
                upsertTranslation(media, translationPath, options);
            }

            const hasTranscript = !!(media.transcript && media.transcript.path);
            const hasOriginal = !!(media.original && media.original.path && fileExists(media.original.path));
            if (!hasTranscript && !hasOriginal) {
                skipped += 1;
                continue;
            }
            if (!hasOriginal) {
                skipped += 1;
                continue;
            }

            media.broken = false;
            media.updatedAt = new Date().toISOString();
            index.media[mediaId] = normalizeMedia(media) || media;
            ingested += 1;
        }

        if (ingested > 0) {
            saveIndex(index, root);
            notifyShelfChanged();
        }
        return { ok: true, ingested, skipped, failed };
    } catch (err) {
        return softFail(err, { ingested: 0, skipped: 0, failed: 0 });
    }
}

function deleteMedia(mediaId, { root } = {}) {
    try {
        const id = String(mediaId || '').trim();
        if (!id) return { ok: false, error: '缺少 mediaId' };
        const index = loadIndex(root);
        if (!index.media[id]) return { ok: false, error: '条目不存在' };
        delete index.media[id];
        saveIndex(index, root);
        notifyShelfChanged();
        return { ok: true };
    } catch (err) {
        return softFail(err);
    }
}

function deleteTranslation(mediaId, lang, { root } = {}) {
    try {
        const id = String(mediaId || '').trim();
        const code = String(lang || '').trim();
        if (!id || !code) return { ok: false, error: '缺少参数' };
        const index = loadIndex(root);
        const m = index.media[id];
        if (!m) return { ok: false, error: '条目不存在' };
        m.translations = (m.translations || []).filter((t) => String(t.lang) !== code);
        m.updatedAt = new Date().toISOString();
        index.media[id] = m;
        saveIndex(index, root);
        notifyShelfChanged();
        return { ok: true };
    } catch (err) {
        return softFail(err);
    }
}

function setMediaPath(mediaId, mediaPath, { clear = false, root } = {}) {
    try {
        const id = String(mediaId || '').trim();
        if (!id) return { ok: false, error: '缺少 mediaId' };
        const index = loadIndex(root);
        const m = index.media[id];
        if (!m) return { ok: false, error: '条目不存在' };
        if (clear) {
            m.mediaPath = '';
        } else {
            const p = String(mediaPath || '').trim();
            if (!p) return { ok: false, error: '缺少媒体路径' };
            m.mediaPath = path.resolve(p);
            if (!m.title) {
                m.title = path.basename(m.mediaPath, path.extname(m.mediaPath));
            }
        }
        m.updatedAt = new Date().toISOString();
        index.media[id] = m;
        saveIndex(index, root);
        notifyShelfChanged();
        return { ok: true, media: m };
    } catch (err) {
        return softFail(err);
    }
}

function renameMediaTitle(mediaId, title, { root } = {}) {
    try {
        const id = String(mediaId || '').trim();
        const next = String(title || '').trim();
        if (!id) return { ok: false, error: '缺少 mediaId' };
        if (!next) return { ok: false, error: '标题不能为空' };
        const index = loadIndex(root);
        const m = index.media[id];
        if (!m) return { ok: false, error: '条目不存在' };
        m.title = next;
        m.updatedAt = new Date().toISOString();
        index.media[id] = m;
        saveIndex(index, root);
        notifyShelfChanged();
        return { ok: true, media: m };
    } catch (err) {
        return softFail(err);
    }
}

function openSlotPaths({ mediaId, slot, lang, root } = {}) {
    try {
        const id = String(mediaId || '').trim();
        if (!id) return { ok: false, error: '缺少 mediaId' };
        const detail = getMediaDetail(id, { root });
        if (!detail.ok) return detail;
        const m = detail.media;
        const kind = String(slot || '').trim().toLowerCase();
        let subPath = '';
        if (kind === 'transcript' || kind === 'asr' || kind === '转录') {
            subPath = m.transcript?.path || '';
        } else if (kind === 'original' || kind === 'source' || kind === '原文') {
            subPath = m.original?.path || '';
        } else if (kind === 'translation' || kind === 'target' || kind === '译文') {
            const code = String(lang || '').trim();
            const hit = (m.translations || []).find((t) => String(t.lang) === code);
            subPath = hit?.path || '';
        } else {
            return { ok: false, error: '未知槽位' };
        }
        if (!subPath) return { ok: false, error: '该槽位无字幕路径' };
        return {
            ok: true,
            path: subPath,
            videoPath: m.mediaPath || '',
            mediaId: id,
        };
    } catch (err) {
        return softFail(err);
    }
}

/**
 * Parse a shelf slot into cue preview rows (truncated).
 * @param {{ mediaId?: string, slot?: string, lang?: string, root?: string, limit?: number }} opts
 */
function previewSlot({ mediaId, slot, lang, root, limit } = {}) {
    try {
        const opened = openSlotPaths({ mediaId, slot, lang, root });
        if (!opened.ok) return opened;
        const filePath = String(opened.path || '').trim();
        if (!fileExists(filePath)) {
            return { ok: false, error: '字幕文件不存在', path: filePath };
        }
        let raw = '';
        try {
            raw = fs.readFileSync(filePath, 'utf8');
        } catch (err) {
            return softFail(err, { path: filePath });
        }
        const { parseSubtitle, detectFormat } = require('./subtitle-format');
        const formatHint = detectFormat(filePath, raw) || pathExt(filePath).replace(/^\./, '') || 'srt';
        const parsed = parseSubtitle(raw, formatHint);
        const allCues = Array.isArray(parsed?.cues) ? parsed.cues : [];
        const max = Number.isFinite(Number(limit)) ? Number(limit) : (core.PREVIEW_CUE_LIMIT || 300);
        const cut = typeof core.truncatePreviewCues === 'function'
            ? core.truncatePreviewCues(allCues, max)
            : { cues: allCues.slice(0, max), cueCount: allCues.length, truncated: allCues.length > max };
        const cues = (cut.cues || []).map((c) => ({
            startMs: Number(c.startMs) || 0,
            endMs: Number(c.endMs) || 0,
            text: String(c.text || '').replace(/\r?\n/g, ' ').trim(),
        }));
        return {
            ok: true,
            path: filePath,
            videoPath: opened.videoPath || '',
            mediaId: opened.mediaId || '',
            format: parsed?.format || formatHint,
            cueCount: cut.cueCount,
            truncated: !!cut.truncated,
            cues,
        };
    } catch (err) {
        return softFail(err);
    }
}

function scanMediaSidecars(mediaPath, { root, options = {} } = {}) {
    try {
        const resolved = path.resolve(String(mediaPath || '').trim());
        if (!resolved || !fileExists(resolved)) {
            return { ok: false, error: '媒体不存在' };
        }
        const dir = path.dirname(resolved);
        const stem = path.basename(resolved, path.extname(resolved));
        const keepDir = resolveSubtitlesDir(options, { root });
        const scanDirs = [...new Set([dir, keepDir].filter(Boolean))];

        const mediaId = mediaIdFromPath(resolved);
        const index = loadIndex(root);
        let media = index.media[mediaId] || {
            id: mediaId,
            mediaPath: resolved,
            title: stem,
            transcript: null,
            original: null,
            translations: [],
            updatedAt: new Date().toISOString(),
        };
        media.mediaPath = resolved;

        const subExts = new Set(['.srt', '.vtt', '.ass', '.lrc']);
        for (const scanDir of scanDirs) {
            let names;
            try {
                if (!fs.existsSync(scanDir)) continue;
                names = fs.readdirSync(scanDir);
            } catch {
                continue;
            }
            for (const name of names) {
                const full = path.join(scanDir, name);
                let st;
                try { st = fs.statSync(full); } catch { continue; }
                if (!st.isFile()) continue;
                const ext = path.extname(name).toLowerCase();
                if (!subExts.has(ext)) continue;
                const base = path.basename(name, ext);
                if (!base.toLowerCase().startsWith(stem.toLowerCase())) continue;
                if (base.toLowerCase() === stem.toLowerCase()) {
                    if (!media.transcript) {
                        media.transcript = {
                            path: full,
                            lang: 'source',
                            updatedAt: new Date().toISOString(),
                        };
                    }
                    continue;
                }
                const inferred = inferLangFromFilename(full);
                if (inferred === 'original') {
                    if (!media.original || !fileExists(media.original.path)) {
                        media.original = {
                            path: full,
                            lang: 'source',
                            updatedAt: new Date().toISOString(),
                        };
                    }
                } else if (inferred === 'source') {
                    if (!media.transcript) {
                        media.transcript = {
                            path: full,
                            lang: 'source',
                            updatedAt: new Date().toISOString(),
                        };
                    }
                } else if (inferred && inferred !== 'dual') {
                    const code = inferred === 'zh' ? 'zh-Hans' : inferred;
                    upsertTranslation(media, full, {
                        translateTarget: code,
                        chineseSubtitleVariant: code === 'zh-Hant' ? 'traditional' : 'simplified',
                        nonChineseTarget: ['en', 'ja', 'ko'].includes(code) ? code : '',
                    });
                }
            }
        }

        ensureOriginal(media, media.transcript?.path, 'source', options, { root });
        if (!media.original?.path || !fileExists(media.original.path)) {
            return { ok: false, error: '无法建立原文槽位', mediaId };
        }
        media.broken = false;
        media.updatedAt = new Date().toISOString();
        index.media[mediaId] = normalizeMedia(media) || media;
        saveIndex(index, root);
        notifyShelfChanged();
        return { ok: true, mediaId, media: index.media[mediaId] };
    } catch (err) {
        return softFail(err);
    }
}

/**
 * Bootstrap (or load) a shelf media row for mid-pipeline ingest.
 * @returns {{ mediaId: string, media: object, resolvedVideo: string } | null}
 */
function bootstrapMediaEntry(index, mediaPath) {
    const resolvedVideo = path.resolve(String(mediaPath || '').trim());
    if (!resolvedVideo) return null;
    const mediaId = mediaIdFromPath(resolvedVideo);
    if (!mediaId) return null;
    let media = index.media[mediaId];
    if (!media) {
        media = {
            id: mediaId,
            mediaPath: resolvedVideo,
            title: path.basename(resolvedVideo, path.extname(resolvedVideo)),
            transcript: null,
            original: null,
            translations: [],
            updatedAt: new Date().toISOString(),
        };
    }
    media.mediaPath = resolvedVideo;
    if (!media.title) {
        media.title = path.basename(resolvedVideo, path.extname(resolvedVideo));
    }
    return { mediaId, media, resolvedVideo };
}

function applyTranscriptSlot(media, transcriptPath, sourceLang) {
    const dest = String(transcriptPath || '').trim();
    if (!dest || !fileExists(dest)) return false;
    media.transcript = {
        path: path.resolve(dest),
        lang: sourceLang || media.transcript?.lang || 'source',
        updatedAt: new Date().toISOString(),
    };
    return true;
}

/**
 * Mid-pipeline: ASR keep done → upsert 转录槽位（不强制建原文）.
 * @param {{ mediaPath?: string, transcriptPath?: string, options?: object }} input
 */
function ingestPipelineTranscript(input = {}, { root } = {}) {
    try {
        const mediaPath = String(input.mediaPath || '').trim();
        const transcriptPath = String(input.transcriptPath || '').trim();
        const options = input.options && typeof input.options === 'object' ? input.options : {};
        if (!mediaPath) return { ok: false, error: '缺少媒体路径' };
        if (!transcriptPath || !fileExists(transcriptPath)) {
            return { ok: false, error: '转录文件不存在', skipped: true };
        }
        const index = loadIndex(root);
        const boot = bootstrapMediaEntry(index, mediaPath);
        if (!boot) return { ok: false, error: '无法解析媒体' };
        const sourceLang = sourceLangFromOptions(options);
        applyTranscriptSlot(boot.media, transcriptPath, sourceLang);
        boot.media.updatedAt = new Date().toISOString();
        // Visible in list only after original exists; keep broken until ensureOriginal.
        if (!(boot.media.original?.path && fileExists(boot.media.original.path))) {
            boot.media.broken = true;
        } else {
            boot.media.broken = false;
        }
        index.media[boot.mediaId] = normalizeMedia(boot.media) || boot.media;
        saveIndex(index, root);
        notifyShelfChanged();
        return { ok: true, stage: 'transcript', mediaId: boot.mediaId, media: index.media[boot.mediaId] };
    } catch (err) {
        return softFail(err);
    }
}

/**
 * Resolve the shelf「原文字幕」sidecar path for a media file (index first, then keep-dir).
 * Used after software-credit insert: mid-pipeline ensureOriginal is first-write-only, so the
 * watermark must be applied to `.original` explicitly at posttask.
 * @param {string} mediaPath
 * @param {object} [options]
 * @param {{ root?: string }} [ctx]
 * @returns {string} absolute path or ''
 */
function resolveOriginalSubtitlePath(mediaPath, options = {}, { root } = {}) {
    const video = String(mediaPath || '').trim();
    if (!video) return '';
    try {
        const resolvedVideo = path.resolve(video);
        const index = loadIndex(root);
        const mediaId = mediaIdFromPath(resolvedVideo);
        const fromIndex = String(index?.media?.[mediaId]?.original?.path || '').trim();
        if (fromIndex && fileExists(fromIndex)) return path.resolve(fromIndex);

        const keepDir = resolveSubtitlesDir(options, { root });
        const transcript = String(index?.media?.[mediaId]?.transcript?.path || '').trim();
        const ext = (transcript && pathExt(transcript)) || '.srt';
        const dest = buildOriginalSidecarPath(resolvedVideo, ext, keepDir);
        if (dest && fileExists(dest)) return path.resolve(dest);
    } catch { /* soft */ }
    return '';
}

/**
 * Mid-pipeline: 原文定稿 → ensure `.original` sidecar + index（首次创建后内容不变）.
 * Also refreshes transcript slot when transcriptPath is provided.
 * @param {{ mediaPath?: string, transcriptPath?: string, options?: object }} input
 */
function ingestPipelineOriginal(input = {}, { root } = {}) {
    try {
        const mediaPath = String(input.mediaPath || '').trim();
        const options = input.options && typeof input.options === 'object' ? input.options : {};
        if (!mediaPath) return { ok: false, error: '缺少媒体路径' };
        const index = loadIndex(root);
        const boot = bootstrapMediaEntry(index, mediaPath);
        if (!boot) return { ok: false, error: '无法解析媒体' };
        const sourceLang = sourceLangFromOptions(options);
        let transcriptPath = String(input.transcriptPath || '').trim();
        if (!transcriptPath) {
            transcriptPath = String(boot.media.transcript?.path || '').trim();
        }
        if (!transcriptPath) {
            transcriptPath = findKeptTranscriptPath(mediaPath, options);
        }
        if (transcriptPath) {
            applyTranscriptSlot(boot.media, transcriptPath, sourceLang);
        }
        ensureOriginal(
            boot.media,
            boot.media.transcript?.path || transcriptPath,
            sourceLang,
            options,
            { root },
        );
        if (!boot.media.original?.path || !fileExists(boot.media.original.path)) {
            return {
                ok: false,
                error: boot.media._ensureOriginalError || '无法建立原文槽位',
                mediaId: boot.mediaId,
            };
        }
        boot.media.broken = false;
        boot.media.updatedAt = new Date().toISOString();
        index.media[boot.mediaId] = normalizeMedia(boot.media) || boot.media;
        saveIndex(index, root);
        notifyShelfChanged();
        return { ok: true, stage: 'original', mediaId: boot.mediaId, media: index.media[boot.mediaId] };
    } catch (err) {
        return softFail(err);
    }
}

/**
 * Mid-pipeline: 单条任务成功 → upsert 译文槽位.
 * @param {{ mediaPath?: string, translationPath?: string, outPaths?: object, options?: object }} input
 */
function ingestPipelineTranslation(input = {}, { root } = {}) {
    try {
        const mediaPath = String(input.mediaPath || '').trim();
        const options = input.options && typeof input.options === 'object' ? input.options : {};
        if (!mediaPath) return { ok: false, error: '缺少媒体路径' };
        const out = input.outPaths && typeof input.outPaths === 'object'
            ? { ...input.outPaths, videoPath: mediaPath }
            : { videoPath: mediaPath };
        const transcriptPath = resolveTranscriptPath(out, options)
            || String(input.transcriptPath || '').trim();
        let translationPath = String(input.translationPath || '').trim();
        if (!translationPath) {
            translationPath = resolveTranslationPath(out, transcriptPath);
        }
        if (!translationPath || !fileExists(translationPath)) {
            return { ok: false, error: '译文文件不存在', skipped: true };
        }
        const index = loadIndex(root);
        const boot = bootstrapMediaEntry(index, mediaPath);
        if (!boot) return { ok: false, error: '无法解析媒体' };
        const sourceLang = sourceLangFromOptions(options);
        if (transcriptPath) {
            applyTranscriptSlot(boot.media, transcriptPath, sourceLang);
        }
        ensureOriginal(
            boot.media,
            boot.media.transcript?.path || transcriptPath,
            sourceLang,
            options,
            { root },
        );
        upsertTranslation(boot.media, translationPath, options);
        boot.media.broken = !(boot.media.original?.path && fileExists(boot.media.original.path));
        boot.media.updatedAt = new Date().toISOString();
        index.media[boot.mediaId] = normalizeMedia(boot.media) || boot.media;
        saveIndex(index, root);
        notifyShelfChanged();
        return {
            ok: true,
            stage: 'translation',
            mediaId: boot.mediaId,
            media: index.media[boot.mediaId],
            translationPath: path.resolve(translationPath),
        };
    } catch (err) {
        return softFail(err);
    }
}

module.exports = {
    getShelfRoot,
    loadIndex,
    saveIndex,
    getShelfStatus,
    listMediaSummaries,
    listMediaSummariesAsync,
    getMediaDetail,
    ingestBatchHistoryEntry,
    ingestPipelineTranscript,
    ingestPipelineOriginal,
    ingestPipelineTranslation,
    resolveOriginalSubtitlePath,
    deleteMedia,
    deleteTranslation,
    upsertTranslation,
    registerTranslation,
    setMediaPath,
    renameMediaTitle,
    openSlotPaths,
    previewSlot,
    scanMediaSidecars,
    healMedia,
    ensureOriginal,
    notifyShelfChanged,
};
