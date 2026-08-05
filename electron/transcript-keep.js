/**
 * Keep a copy of ASR (source-language) subtitles for re-translate / reconstruct.
 * Default location: <writableRoot>/subtitles
 */

const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const KEEP_EXTS = new Set(['.srt', '.vtt', '.lrc', '.ass']);
const PINS_FILE_NAME = 'transcript-keep-pins.json';
/** In-memory soft pins (editor open) — keys are resolved paths */
const softPins = new Set();

function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeTranscriptKeepOptions(options = {}) {
    return {
        keepTranscript: options.keepTranscript !== false,
        transcriptKeepDir: String(options.transcriptKeepDir || '').trim(),
        transcriptKeepLimit: clampInt(options.transcriptKeepLimit, 0, 9999, 200),
        transcriptKeepDays: clampInt(options.transcriptKeepDays, 0, 3650, 90),
    };
}

function resolveTranscriptKeepDir(options = {}) {
    const custom = String(options.transcriptKeepDir || '').trim();
    if (custom) return path.resolve(custom);
    return path.join(getWritableRoot(), 'subtitles');
}

function listKeepSubtitleFiles(dir) {
    if (!dir || !fs.existsSync(dir)) return [];
    let names;
    try {
        names = fs.readdirSync(dir);
    } catch {
        return [];
    }
    const out = [];
    for (const name of names) {
        const full = path.join(dir, name);
        let st;
        try {
            st = fs.statSync(full);
        } catch {
            continue;
        }
        if (!st.isFile()) continue;
        if (!KEEP_EXTS.has(path.extname(name).toLowerCase())) continue;
        out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size });
    }
    return out;
}

function getPinsFilePath() {
    return path.join(getWritableRoot(), PINS_FILE_NAME);
}

function loadHardPins() {
    const filePath = getPinsFilePath();
    try {
        if (!fs.existsSync(filePath)) return new Set();
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const list = Array.isArray(raw?.paths) ? raw.paths : (Array.isArray(raw) ? raw : []);
        return new Set(
            list.map((p) => path.resolve(String(p || '').trim())).filter(Boolean),
        );
    } catch {
        return new Set();
    }
}

function saveHardPins(pinSet) {
    const filePath = getPinsFilePath();
    const paths = [...pinSet].filter(Boolean).slice(0, 500);
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify({ version: 1, paths }, null, 2)}\n`, 'utf8');
    } catch { /* ignore */ }
}

function isPinnedPath(filePath) {
    const resolved = path.resolve(String(filePath || '').trim());
    if (!resolved) return false;
    if (softPins.has(resolved)) return true;
    return loadHardPins().has(resolved);
}

function pinKeptTranscript(filePath, { hard = false } = {}) {
    const resolved = path.resolve(String(filePath || '').trim());
    if (!resolved) return { ok: false, error: '缺少路径' };
    softPins.add(resolved);
    if (hard) {
        const pins = loadHardPins();
        pins.add(resolved);
        saveHardPins(pins);
    }
    return { ok: true, path: resolved, hard: !!hard };
}

function unpinKeptTranscript(filePath, { hard = true } = {}) {
    const resolved = path.resolve(String(filePath || '').trim());
    if (!resolved) return { ok: false, error: '缺少路径' };
    softPins.delete(resolved);
    if (hard) {
        const pins = loadHardPins();
        pins.delete(resolved);
        saveHardPins(pins);
    }
    return { ok: true, path: resolved };
}

function basenameStem(filePath) {
    const base = path.basename(String(filePath || ''));
    const ext = path.extname(base);
    return ext ? base.slice(0, -ext.length) : base;
}

/**
 * Resolve media/subtitle stem for keep-directory lookup.
 * Strips common dual suffixes (.zh / .ja / .en / .source / .src).
 */
function resolveLookupStem({ videoPath = '', subPath = '', stem = '' } = {}) {
    const explicit = String(stem || '').trim();
    if (explicit) return explicit;
    const video = String(videoPath || '').trim();
    if (video) return basenameStem(video);
    const sub = String(subPath || '').trim();
    if (!sub) return '';
    let name = basenameStem(sub);
    name = name.replace(/\.(zh|ja|en|source|src|bilingual|bi)$/i, '');
    return name;
}

/**
 * Score a keep-dir candidate against a video basename stem.
 * Same-name only: `{stem}.srt` or `{stem}.{src|source|ja|…}.srt`.
 * Rejects translation / bilingual tracks and fuzzy substring hits.
 */
function scoreKeptCandidate(filePath, stem) {
    const base = path.basename(String(filePath || ''));
    const ext = path.extname(base);
    const name = (ext ? base.slice(0, -ext.length) : base).toLowerCase();
    const stemLower = String(stem || '').toLowerCase();
    if (!stemLower || !name) return 0;

    // Exact same stem as the video (e.g. SQTE-704.srt)
    if (name === stemLower) return 100;

    // Same-name with role / language suffix (e.g. SQTE-704.src.srt)
    if (name.startsWith(`${stemLower}.`)) {
        const rest = name.slice(stemLower.length + 1);
        if (/^(zh|cht|chs|cn|bilingual|bi|target|dual)(\.|$)/i.test(rest)) return 0;
        if (/^(src|source|ja|jp|en|ko|orig|asr)(\.|$)/i.test(rest)) return 80;
        // Other same-prefix suffixes still count as same-name, but prefer source roles above
        return 50;
    }
    return 0;
}

/**
 * Find a kept ASR transcript for a video / subtitle stem.
 * @returns {{ ok: boolean, found: boolean, path?: string, mtimeMs?: number, size?: number, daysLeft?: number|null, dir?: string, pinned?: boolean }}
 */
function findKeptTranscript({
    videoPath = '',
    subPath = '',
    stem = '',
    options = {},
} = {}) {
    const opts = normalizeTranscriptKeepOptions(options);
    const dir = resolveTranscriptKeepDir(opts);
    const lookupStem = resolveLookupStem({ videoPath, subPath, stem });
    if (!lookupStem) {
        return { ok: true, found: false, dir, reason: 'no_stem' };
    }

    const files = listKeepSubtitleFiles(dir);
    if (!files.length) {
        return { ok: true, found: false, dir, stem: lookupStem };
    }

    let best = null;
    let bestScore = -Infinity;
    for (const f of files) {
        const score = scoreKeptCandidate(f.path, lookupStem);
        // Same-name threshold: exact stem or `{stem}.{role}` (see scoreKeptCandidate)
        if (score < 50) continue;
        const ranked = score + Math.min(10, f.mtimeMs / 1e13);
        if (ranked > bestScore) {
            bestScore = ranked;
            best = f;
        }
    }
    if (!best) {
        return { ok: true, found: false, dir, stem: lookupStem };
    }

    const daysLeft = (() => {
        if (!opts.transcriptKeepDays) return null;
        const expireAt = best.mtimeMs + opts.transcriptKeepDays * 24 * 60 * 60 * 1000;
        return Math.ceil((expireAt - Date.now()) / (24 * 60 * 60 * 1000));
    })();

    return {
        ok: true,
        found: true,
        path: best.path,
        mtimeMs: best.mtimeMs,
        size: best.size,
        daysLeft,
        dir,
        stem: lookupStem,
        pinned: isPinnedPath(best.path),
    };
}

function pruneTranscriptKeepDir(dir, options = {}) {
    const opts = normalizeTranscriptKeepOptions(options);
    const files = listKeepSubtitleFiles(dir);
    if (!files.length) return { removed: 0, skippedPinned: 0 };

    const now = Date.now();
    const remove = new Set();
    const hardPins = loadHardPins();
    let skippedPinned = 0;

    const isProtected = (filePath) => {
        const resolved = path.resolve(filePath);
        return softPins.has(resolved) || hardPins.has(resolved);
    };

    if (opts.transcriptKeepDays > 0) {
        const maxAgeMs = opts.transcriptKeepDays * 24 * 60 * 60 * 1000;
        for (const f of files) {
            if (now - f.mtimeMs > maxAgeMs) {
                if (isProtected(f.path)) {
                    skippedPinned += 1;
                    continue;
                }
                remove.add(f.path);
            }
        }
    }

    const remaining = files
        .filter((f) => !remove.has(f.path))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (opts.transcriptKeepLimit > 0 && remaining.length > opts.transcriptKeepLimit) {
        for (const f of remaining.slice(opts.transcriptKeepLimit)) {
            if (isProtected(f.path)) {
                skippedPinned += 1;
                continue;
            }
            remove.add(f.path);
        }
    }

    let removed = 0;
    for (const p of remove) {
        try {
            fs.unlinkSync(p);
            removed += 1;
        } catch { /* ignore */ }
    }
    return { removed, skippedPinned };
}

function clearTranscriptKeepDir(options = {}) {
    const dir = resolveTranscriptKeepDir(options);
    const files = listKeepSubtitleFiles(dir);
    const force = options.force === true;
    let removed = 0;
    let skippedPinned = 0;
    for (const f of files) {
        if (!force && isPinnedPath(f.path)) {
            skippedPinned += 1;
            continue;
        }
        try {
            fs.unlinkSync(f.path);
            removed += 1;
        } catch { /* ignore */ }
    }
    return { ok: true, dir, removed, skippedPinned };
}

/**
 * Copy transcript subtitle files into the keep directory, then prune.
 * @param {string[]} sourcePaths
 * @param {object} options
 * @returns {{ ok: boolean, kept: string[], skipped?: boolean, error?: string, dir?: string }}
 */
function keepTranscriptFiles(sourcePaths, options = {}) {
    const opts = normalizeTranscriptKeepOptions(options);
    if (!opts.keepTranscript) {
        return { ok: true, kept: [], skipped: true };
    }
    const list = [...new Set(
        (Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths])
            .map((p) => String(p || '').trim())
            .filter(Boolean)
            .map((p) => path.resolve(p)),
    )];
    if (!list.length) {
        return { ok: true, kept: [], skipped: true };
    }

    const dir = resolveTranscriptKeepDir(opts);
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
        return { ok: false, kept: [], error: err.message || String(err), dir };
    }

    const kept = [];
    for (const src of list) {
        if (!fs.existsSync(src)) continue;
        if (!KEEP_EXTS.has(path.extname(src).toLowerCase())) continue;
        const dest = path.join(dir, path.basename(src));
        try {
            if (path.resolve(src) === path.resolve(dest)) {
                kept.push(dest);
                continue;
            }
            fs.copyFileSync(src, dest);
            try {
                const now = new Date();
                fs.utimesSync(dest, now, now);
            } catch { /* ignore */ }
            kept.push(dest);
        } catch (err) {
            return {
                ok: false,
                kept,
                error: err.message || String(err),
                dir,
            };
        }
    }

    try {
        pruneTranscriptKeepDir(dir, opts);
    } catch { /* ignore */ }

    return { ok: true, kept, dir };
}

/**
 * Pick ASR / source-language paths from a finished item.
 */
function resolveTranscriptSourcePaths({
    task = '',
    sourceSubtitlePath = '',
    sourceSubtitlePaths = null,
    subtitlePath = '',
} = {}) {
    if (Array.isArray(sourceSubtitlePaths) && sourceSubtitlePaths.length) {
        return sourceSubtitlePaths.map((p) => String(p || '').trim()).filter(Boolean);
    }
    const source = String(sourceSubtitlePath || '').trim();
    if (source) return [source];
    const t = String(task || '').trim();
    if (t === 'transcribe') {
        const sub = String(subtitlePath || '').trim();
        return sub ? [sub] : [];
    }
    return [];
}

/**
 * Convert engine cue objects (start/end seconds or startMs) to editor cues.
 */
function engineCuesToKeepCues(sourceCues) {
    return (Array.isArray(sourceCues) ? sourceCues : [])
        .map((c, i) => {
            if (!c || typeof c !== 'object') return null;
            const startSec = Number(c.start ?? c.startSec);
            const endSec = Number(c.end ?? c.endSec);
            let startMs = Number(c.startMs);
            let endMs = Number(c.endMs);
            if (!Number.isFinite(startMs)) {
                startMs = Number.isFinite(startSec) ? Math.round(startSec * 1000) : 0;
            }
            if (!Number.isFinite(endMs)) {
                endMs = Number.isFinite(endSec) ? Math.round(endSec * 1000) : startMs + 1000;
            }
            const text = String(c.text || '').trim();
            if (!text) return null;
            return {
                index: i + 1,
                startMs: Math.max(0, Math.round(startMs)),
                endMs: Math.max(Math.round(startMs) + 1, Math.round(endMs)),
                text,
            };
        })
        .filter(Boolean);
}

/**
 * Write ASR cues into the keep directory when no source subtitle file was produced
 * (e.g. engine translate_mt deletes the temporary `.src.partial.*` after MT).
 */
function keepTranscriptFromSourceCues(sourceCues, mediaPath, options = {}) {
    const opts = normalizeTranscriptKeepOptions(options);
    if (!opts.keepTranscript) {
        return { ok: true, kept: [], skipped: true };
    }
    const cues = engineCuesToKeepCues(sourceCues);
    if (!cues.length) {
        return { ok: true, kept: [], skipped: true };
    }

    const dir = resolveTranscriptKeepDir(opts);
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
        return { ok: false, kept: [], error: err.message || String(err), dir };
    }

    const media = String(mediaPath || '').trim();
    const stem = media
        ? path.basename(media, path.extname(media))
        : 'transcript';
    const dest = path.join(dir, `${stem}.src.srt`);
    try {
        const { serializeSubtitle } = require('./subtitle-format');
        const content = serializeSubtitle({ format: 'srt', cues });
        fs.writeFileSync(dest, content, 'utf8');
        try {
            const now = new Date();
            fs.utimesSync(dest, now, now);
        } catch { /* ignore */ }
    } catch (err) {
        return { ok: false, kept: [], error: err.message || String(err), dir };
    }

    try {
        pruneTranscriptKeepDir(dir, opts);
    } catch { /* ignore */ }

    return { ok: true, kept: [dest], dir };
}

/**
 * Prefer copying existing source files; otherwise materialize from engine cues.source.
 */
function keepTranscriptFromJobResult({
    task = '',
    sourceSubtitlePath = '',
    sourceSubtitlePaths = null,
    subtitlePath = '',
    sourceCues = null,
    mediaPath = '',
    options = {},
} = {}) {
    const opts = normalizeTranscriptKeepOptions(options);
    if (!opts.keepTranscript) {
        return { ok: true, kept: [], skipped: true };
    }
    const paths = resolveTranscriptSourcePaths({
        task,
        sourceSubtitlePath,
        sourceSubtitlePaths,
        subtitlePath,
    });
    if (paths.length) {
        return keepTranscriptFiles(paths, opts);
    }
    return keepTranscriptFromSourceCues(sourceCues, mediaPath, opts);
}

module.exports = {
    KEEP_EXTS,
    normalizeTranscriptKeepOptions,
    resolveTranscriptKeepDir,
    listKeepSubtitleFiles,
    pruneTranscriptKeepDir,
    clearTranscriptKeepDir,
    keepTranscriptFiles,
    resolveTranscriptSourcePaths,
    engineCuesToKeepCues,
    keepTranscriptFromSourceCues,
    keepTranscriptFromJobResult,
    findKeptTranscript,
    resolveLookupStem,
    pinKeptTranscript,
    unpinKeptTranscript,
    isPinnedPath,
};
