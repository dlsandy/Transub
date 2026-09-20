/**
 * Keep a copy of ASR (source-language) subtitles for re-translate / reconstruct.
 * Default location: <writableRoot>/subtitles
 * Naming: `{stem}.transcribe.srt` (legacy `{stem}.src.srt` still matched on lookup).
 * Shelf originals (`{stem}.original.srt`) share the same folder but are not pruned.
 */

const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const KEEP_EXTS = new Set(['.srt', '.vtt', '.lrc', '.ass']);
const PINS_FILE_NAME = 'transcript-keep-pins.json';
/** In-memory soft pins (editor open) — keys are resolved paths */
const softPins = new Set();

/** Hard pins loaded from disk once; invalidated on saveHardPins. */
let _hardPinsCache = null;

function normalizeTranscriptKeepOptions(options = {}) {
    return {
        // Always keep transcripts; UI no longer exposes an off switch.
        keepTranscript: true,
        transcriptKeepDir: String(options.transcriptKeepDir || '').trim(),
        // 0 = unlimited (no count / age prune).
        transcriptKeepLimit: 0,
        transcriptKeepDays: 0,
    };
}

function resolveTranscriptKeepDir(options = {}, { root } = {}) {
    const custom = String(options.transcriptKeepDir || '').trim();
    if (custom) return path.resolve(custom);
    const base = String(root || '').trim();
    if (base) return path.join(path.resolve(base), 'subtitles');
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
    if (_hardPinsCache) return _hardPinsCache;
    const filePath = getPinsFilePath();
    try {
        if (!fs.existsSync(filePath)) {
            _hardPinsCache = new Set();
            return _hardPinsCache;
        }
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const list = Array.isArray(raw?.paths) ? raw.paths : (Array.isArray(raw) ? raw : []);
        _hardPinsCache = new Set(
            list.map((p) => path.resolve(String(p || '').trim())).filter(Boolean),
        );
        return _hardPinsCache;
    } catch {
        _hardPinsCache = new Set();
        return _hardPinsCache;
    }
}

function saveHardPins(pinSet) {
    const filePath = getPinsFilePath();
    const paths = [...pinSet].filter(Boolean).slice(0, 500);
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify({ version: 1, paths }, null, 2)}\n`, 'utf8');
        _hardPinsCache = new Set(paths.map((p) => path.resolve(String(p || '').trim())).filter(Boolean));
    } catch {
        _hardPinsCache = null;
    }
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

/** Shelf 原文轨：`{stem}.original.srt` — share keep dir but skip prune/clear. */
function isOriginalKeepFile(filePath) {
    const name = basenameStem(filePath).toLowerCase();
    return name.endsWith('.original');
}

/**
 * Resolve media/subtitle stem for keep-directory lookup.
 * Strips common dual / role suffixes (.zh / .ja / .transcribe / .original / .src …).
 */
function resolveLookupStem({ videoPath = '', subPath = '', stem = '' } = {}) {
    const explicit = String(stem || '').trim();
    if (explicit) return explicit;
    const video = String(videoPath || '').trim();
    if (video) return basenameStem(video);
    const sub = String(subPath || '').trim();
    if (!sub) return '';
    let name = basenameStem(sub);
    name = name.replace(/\.(zh(-[a-z0-9]+)?|ja|en|ko|source|src|bilingual|bi|transcribe|original)$/i, '');
    return name;
}

/**
 * Build `{stem}.transcribe{ext}` basename for the keep directory.
 */
function buildTranscribeKeepBasename(srcPath, mediaPath = '') {
    const ext = path.extname(String(srcPath || '')) || '.srt';
    const stem = resolveLookupStem({ videoPath: mediaPath, subPath: srcPath }) || 'transcript';
    return `${stem}.transcribe${ext.toLowerCase()}`;
}

/**
 * Score a keep-dir candidate against a video basename stem.
 * Prefers `{stem}.transcribe.srt`; still accepts legacy `{stem}.src.srt`.
 * Rejects translation / bilingual / original tracks and fuzzy substring hits.
 */
function scoreKeptCandidate(filePath, stem) {
    const base = path.basename(String(filePath || ''));
    const ext = path.extname(base);
    const name = (ext ? base.slice(0, -ext.length) : base).toLowerCase();
    const stemLower = String(stem || '').toLowerCase();
    if (!stemLower || !name) return 0;

    // Exact same stem as the video (e.g. SQTE-704.srt)
    if (name === stemLower) return 100;

    // Same-name with role / language suffix (e.g. SQTE-704.transcribe.srt)
    if (name.startsWith(`${stemLower}.`)) {
        const rest = name.slice(stemLower.length + 1);
        if (/^(zh(-[a-z0-9]+)?|cht|chs|cn|bilingual|bi|target|dual|original)(\.|$)/i.test(rest)) return 0;
        if (/^transcribe(\.|$)/i.test(rest)) return 90;
        if (/^(src|source|ja|jp|en|ko|asr)(\.|$)/i.test(rest)) return 80;
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
    // Retention is unlimited: never auto-delete by count or age.
    void dir;
    void options;
    return { removed: 0, skippedPinned: 0 };
}

function clearTranscriptKeepDir(options = {}) {
    const dir = resolveTranscriptKeepDir(options);
    const files = listKeepSubtitleFiles(dir);
    const force = options.force === true;
    let removed = 0;
    let skippedPinned = 0;
    for (const f of files) {
        // Clear is for 转录缓存 — never wipe shelf 原文 unless force.
        if (!force && (isOriginalKeepFile(f.path) || isPinnedPath(f.path))) {
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

function buildTimingRefsFromParams({
    zhCues = null,
    targetSubtitlePath = '',
    subtitlePath = '',
    outputDir = '',
    mediaPath = '',
} = {}) {
    return {
        zhCues,
        targetSubtitlePath: targetSubtitlePath || subtitlePath,
        subtitlePath,
        outputDir,
        mediaPath,
    };
}

/**
 * Copy transcript subtitle files into the keep directory, then prune.
 * @param {string[]} sourcePaths
 * @param {object} options
 * @returns {{ ok: boolean, kept: string[], skipped?: boolean, error?: string, dir?: string }}
 */
function keepTranscriptFiles(sourcePaths, options = {}) {
    const opts = normalizeTranscriptKeepOptions(options);
    const list = [...new Set(
        (Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths])
            .map((p) => String(p || '').trim())
            .filter(Boolean)
            .map((p) => path.resolve(p)),
    )];
    if (!list.length) {
        return { ok: true, kept: [], skipped: true };
    }

    const kept = [];
    for (const src of list) {
        if (!fs.existsSync(src)) continue;
        if (!KEEP_EXTS.has(path.extname(src).toLowerCase())) continue;
        const cues = loadSubtitleAsEngineCues(src);
        if (!cues.length) continue;
        const enriched = enrichSourceCuesWithTiming(cues, {
            zhCues: opts.zhCues,
            targetSubtitlePath: opts.targetSubtitlePath,
            subtitlePath: opts.subtitlePath,
            outputDir: opts.outputDir,
            mediaPath: opts.mediaPath,
        });
        const keepCues = engineCuesToKeepCues(enriched);
        if (!keepCues.length) continue;
        const dir = resolveTranscriptKeepDir(opts);
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
            return { ok: false, kept, error: err.message || String(err), dir };
        }
        const mediaPath = String(opts.mediaPath || options.mediaPath || '').trim();
        const dest = path.join(dir, buildTranscribeKeepBasename(src, mediaPath));
        try {
            const { serializeSubtitle } = require('./subtitle-format');
            fs.writeFileSync(dest, serializeSubtitle({ format: 'srt', cues: keepCues }), 'utf8');
            try {
                const now = new Date();
                fs.utimesSync(dest, now, now);
            } catch { /* ignore */ }
            kept.push(dest);
        } catch (err) {
            return { ok: false, kept, error: err.message || String(err), dir };
        }
    }

    if (!kept.length) {
        return { ok: true, kept: [], skipped: true };
    }
    try {
        pruneTranscriptKeepDir(resolveTranscriptKeepDir(opts), opts);
    } catch { /* ignore */ }
    return { ok: true, kept, dir: resolveTranscriptKeepDir(opts) };
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
 * Normalize one engine / subtitle cue to { startMs, endMs }.
 * Accepts start/end seconds, startMs/endMs, or aligner-style start_time/end_time.
 */
function readCueTimingMs(c) {
    if (!c || typeof c !== 'object') {
        return { startMs: NaN, endMs: NaN, valid: false };
    }
    const startSec = Number(c.start ?? c.startSec ?? c.start_time);
    const endSec = Number(c.end ?? c.endSec ?? c.end_time);
    let startMs = Number(c.startMs);
    let endMs = Number(c.endMs);
    if (!Number.isFinite(startMs)) {
        startMs = Number.isFinite(startSec) ? Math.round(startSec * 1000) : NaN;
    }
    if (!Number.isFinite(endMs)) {
        endMs = Number.isFinite(endSec) ? Math.round(endSec * 1000) : NaN;
    }
    if (!Number.isFinite(startMs)) startMs = 0;
    if (!Number.isFinite(endMs)) endMs = startMs + 1000;
    startMs = Math.max(0, Math.round(startMs));
    endMs = Math.max(startMs + 1, Math.round(endMs));
    const spanMs = endMs - startMs;
    const valid = spanMs > 50 && !(startMs === 0 && spanMs <= 600);
    return { startMs, endMs, valid };
}

/**
 * Detect materialized ASR cues that lost real timeline (all ~0–0.5s, etc.).
 */
function cuesLackValidTiming(cues) {
    const list = Array.isArray(cues) ? cues : [];
    if (!list.length) return false;
    if (list.length === 1) {
        return !readCueTimingMs(list[0]).valid;
    }
    let valid = 0;
    let zeroShort = 0;
    const starts = new Set();
    for (const c of list) {
        const { startMs, endMs, valid: ok } = readCueTimingMs(c);
        if (ok) valid += 1;
        if (startMs <= 50 && (endMs - startMs) <= 600) zeroShort += 1;
        starts.add(startMs);
    }
    if (zeroShort >= list.length) return true;
    if (list.length < 4) return false;
    if (valid >= Math.max(4, Math.ceil(list.length * 0.25))) return false;
    if (zeroShort >= Math.ceil(list.length * 0.8)) return true;
    if (starts.size <= 2 && list.length >= 10) return true;
    const maxStart = list.reduce((m, c) => {
        const { startMs } = readCueTimingMs(c);
        return Math.max(m, startMs);
    }, 0);
    return maxStart < 1500 && list.length >= 10;
}

/**
 * Detect QC overlap-unpack fingerprint: ~500ms cues chained with gapMs=1
 * (MFYD-185 zh-cn after smart QC on a collapsed timeline).
 * Do not require "early" starts — a long pack can stretch past 2 minutes.
 */
function cuesLookQcPacked(cues) {
    const list = Array.isArray(cues) ? cues : [];
    if (list.length < 10) return false;
    let dur500 = 0;
    let gap1 = 0;
    for (let i = 0; i < list.length; i += 1) {
        const { startMs, endMs } = readCueTimingMs(list[i]);
        const dur = Math.max(0, endMs - startMs);
        if (dur >= 490 && dur <= 520) dur500 += 1;
        if (i > 0) {
            const prev = readCueTimingMs(list[i - 1]);
            if (startMs - prev.endMs === 1) gap1 += 1;
        }
    }
    const n = list.length;
    return dur500 >= Math.ceil(n * 0.65)
        && gap1 >= Math.ceil((n - 1) * 0.5);
}

/** True when a track cannot be trusted as a real media timeline. */
function cuesHaveBrokenTimeline(cues) {
    return cuesLackValidTiming(cues) || cuesLookQcPacked(cues);
}

function loadSubtitleCuesForTiming(filePath) {
    const p = String(filePath || '').trim();
    if (!p || !fs.existsSync(p)) return [];
    try {
        const { parseSubtitle } = require('./subtitle-format');
        const raw = fs.readFileSync(p, 'utf8');
        const ext = path.extname(p).replace(/^\./, '').toLowerCase() || 'srt';
        const parsed = parseSubtitle(raw, ext);
        return (parsed.cues || []).map((c) => ({
            startMs: Number(c.startMs) || 0,
            endMs: Number(c.endMs) || 0,
            text: String(c.text || '').trim(),
        })).filter((c) => c.text);
    } catch {
        return [];
    }
}

/** Load subtitle file into engine-style cue dicts (seconds + ms). */
function loadSubtitleAsEngineCues(filePath) {
    return loadSubtitleCuesForTiming(filePath).map((c, i) => ({
        start: c.startMs / 1000,
        end: c.endMs / 1000,
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text,
        index: i + 1,
    }));
}

/**
 * Candidate ZH / output subtitle paths that carry authoritative timeline after MT.
 */
function resolveZhTimingCandidatePaths({
    targetSubtitlePath = '',
    subtitlePath = '',
    outputDir = '',
    mediaPath = '',
} = {}) {
    const out = [];
    const add = (p) => {
        const s = String(p || '').trim();
        if (!s) return;
        out.push(path.resolve(s));
    };
    add(targetSubtitlePath);
    add(subtitlePath);
    const dir = String(outputDir || '').trim();
    const media = String(mediaPath || '').trim();
    if (dir && media) {
        const stem = path.basename(media, path.extname(media));
        for (const ext of ['.srt', '.vtt']) {
            add(path.join(dir, `${stem}${ext}`));
            add(path.join(dir, `${stem}.zh${ext}`));
        }
    }
    if (media) {
        const mediaDir = path.dirname(path.resolve(media));
        const stem = path.basename(media, path.extname(media));
        for (const ext of ['.srt', '.vtt']) {
            add(path.join(mediaDir, `${stem}${ext}`));
        }
    }
    return [...new Set(out)];
}

/**
 * Shelf `.original.srt` next to a broken `.transcribe.srt` (PRED-890-style collapse).
 */
function resolveOriginalTimingCandidatePaths({
    subtitlePath = '',
    outputDir = '',
    mediaPath = '',
} = {}) {
    const out = [];
    const add = (p) => {
        const s = String(p || '').trim();
        if (!s) return;
        out.push(path.resolve(s));
    };
    const sub = String(subtitlePath || '').trim();
    if (sub) {
        const dir = path.dirname(path.resolve(sub));
        add(path.join(dir, path.basename(sub).replace(/\.transcribe\./i, '.original.')));
        const stem = resolveLookupStem({ subPath: sub, videoPath: mediaPath });
        if (stem) {
            for (const ext of ['.srt', '.vtt']) {
                add(path.join(dir, `${stem}.original${ext}`));
            }
        }
    }
    const dir = String(outputDir || '').trim();
    const media = String(mediaPath || '').trim();
    const stem = resolveLookupStem({ videoPath: media, subPath: sub });
    if (stem) {
        for (const root of [dir, media ? path.dirname(path.resolve(media)) : ''].filter(Boolean)) {
            for (const ext of ['.srt', '.vtt']) {
                add(path.join(root, `${stem}.original${ext}`));
            }
        }
    }
    return [...new Set(out)];
}

function countValidTimingCues(cues) {
    const list = Array.isArray(cues) ? cues : [];
    let n = 0;
    for (const c of list) {
        if (readCueTimingMs(c).valid) n += 1;
    }
    return n;
}

function resolveSrcPartialPath({ outputDir = '', mediaPath = '' } = {}) {
    const dir = String(outputDir || '').trim();
    const media = String(mediaPath || '').trim();
    if (!dir || !media) return '';
    const stem = path.basename(media, path.extname(media));
    const candidate = path.join(dir, `${stem}.src.partial.srt`);
    return fs.existsSync(candidate) ? candidate : '';
}

/**
 * Pick ZH / partial ASR files to copy timeline from when engine cues.source lacks times.
 * Prefer on-disk translated subtitles — engine jobResult cue objects may lack start/end
 * even when write_subtitle already wrote correct times next to the media file.
 */
function resolveTimingReferenceCues({
    zhCues = null,
    targetSubtitlePath = '',
    subtitlePath = '',
    outputDir = '',
    mediaPath = '',
} = {}) {
    for (const candidate of resolveZhTimingCandidatePaths({
        targetSubtitlePath,
        subtitlePath,
        outputDir,
        mediaPath,
    })) {
        if (!fs.existsSync(candidate)) continue;
        const fromFile = loadSubtitleCuesForTiming(candidate);
        if (fromFile.length && !cuesLackValidTiming(fromFile)) return fromFile;
    }

    // Prefer shelf original when ZH is missing / also collapsed (PRED-890).
    for (const candidate of resolveOriginalTimingCandidatePaths({
        subtitlePath: subtitlePath || targetSubtitlePath,
        outputDir,
        mediaPath,
    })) {
        if (!fs.existsSync(candidate)) continue;
        const fromOrig = loadSubtitleCuesForTiming(candidate);
        if (fromOrig.length && !cuesLackValidTiming(fromOrig)) return fromOrig;
    }

    const partialPath = resolveSrcPartialPath({ outputDir, mediaPath });
    if (partialPath) {
        const fromPartial = loadSubtitleCuesForTiming(partialPath);
        if (fromPartial.length && !cuesLackValidTiming(fromPartial)) return fromPartial;
    }

    const mem = Array.isArray(zhCues) ? zhCues : [];
    if (mem.length && !cuesLackValidTiming(mem)) return mem;

    return [];
}

/**
 * Copy start/end from reference cues onto source text cues (index-aligned,
 * then text-matched when counts diverge after moan compact).
 */
function normalizeTimingMatchText(text) {
    return String(text || '')
        .replace(/[\s…・。、！!？?,，.．\-ー〜～「」『』（）()]/g, '')
        .toLowerCase();
}

function borrowTimingByTextMatch(sourceCues, refCues) {
    const src = Array.isArray(sourceCues) ? sourceCues : [];
    const ref = Array.isArray(refCues) ? refCues : [];
    if (!src.length || !ref.length) return src;

    const buckets = new Map();
    for (let i = 0; i < ref.length; i += 1) {
        const key = normalizeTimingMatchText(ref[i]?.text);
        if (!key || key.length < 2) continue;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(i);
    }
    const used = new Set();
    const out = src.map((c) => ({ ...(c && typeof c === 'object' ? c : {}) }));
    for (let i = 0; i < out.length; i += 1) {
        if (readCueTimingMs(out[i]).valid) continue;
        const key = normalizeTimingMatchText(out[i]?.text);
        if (!key) continue;
        const list = buckets.get(key) || [];
        const hit = list.find((j) => !used.has(j));
        if (hit == null) continue;
        used.add(hit);
        const timing = readCueTimingMs(ref[hit]);
        if (!timing.valid) continue;
        out[i] = {
            ...out[i],
            start: timing.startMs / 1000,
            end: timing.endMs / 1000,
            startMs: timing.startMs,
            endMs: timing.endMs,
        };
    }
    return out;
}

function borrowTimingOntoSourceCues(sourceCues, refCues) {
    const src = Array.isArray(sourceCues) ? sourceCues : [];
    const ref = Array.isArray(refCues) ? refCues : [];
    if (!src.length || !ref.length) return src;

    const n = Math.min(src.length, ref.length);
    let out = src.map((c) => ({ ...(c && typeof c === 'object' ? c : {}) }));
    for (let i = 0; i < n; i += 1) {
        const timing = readCueTimingMs(ref[i]);
        if (!timing.valid) continue;
        out[i] = {
            ...out[i],
            start: timing.startMs / 1000,
            end: timing.endMs / 1000,
            startMs: timing.startMs,
            endMs: timing.endMs,
        };
    }
    if (countValidTimingCues(out) >= Math.max(1, Math.ceil(src.length * 0.2))) {
        if (countValidTimingCues(out) < src.length) {
            out = borrowTimingByTextMatch(out, ref);
        }
        return out;
    }

    // Index align failed — text match (PRED-890: 825 original → 356 compact).
    out = borrowTimingByTextMatch(
        src.map((c) => ({ ...(c && typeof c === 'object' ? c : {}) })),
        ref,
    );
    if (countValidTimingCues(out) >= Math.max(1, Math.ceil(src.length * 0.2))) {
        return out;
    }

    // Index align failed (sparse valid ref) — try overlap against ms cues when any src timing exists.
    try {
        const dualCore = require('../src/js/dual-subtitle-core');
        const refMs = ref.map((c, i) => {
            const t = readCueTimingMs(c);
            return {
                index: i + 1,
                startMs: t.startMs,
                endMs: t.endMs,
                text: String(c?.text || ''),
            };
        });
        const index = dualCore.buildOverlapIndex?.(refMs) || null;
        if (!index || typeof dualCore.findBestOverlapCue !== 'function') return out;
        for (let i = 0; i < out.length; i += 1) {
            const cur = readCueTimingMs(out[i]);
            if (cur.valid) continue;
            const hit = dualCore.findBestOverlapCue(refMs, cur.startMs, cur.endMs, {
                index,
                maxStartGapMs: 4000,
            });
            if (!hit?.cue || hit.match === 'none') continue;
            const t = readCueTimingMs(hit.cue);
            if (!t.valid) continue;
            out[i] = {
                ...out[i],
                start: t.startMs / 1000,
                end: t.endMs / 1000,
                startMs: t.startMs,
                endMs: t.endMs,
            };
        }
    } catch { /* optional */ }

    return out;
}

function enrichSourceCuesWithTiming(sourceCues, refs = {}) {
    const list = Array.isArray(sourceCues) ? sourceCues : [];
    if (!list.length || !cuesLackValidTiming(list)) return list;
    const ref = resolveTimingReferenceCues(refs);
    if (!ref.length) return list;
    return borrowTimingOntoSourceCues(list, ref);
}

/**
 * Convert engine cue objects (start/end seconds or startMs) to editor cues.
 */
function engineCuesToKeepCues(sourceCues) {
    return (Array.isArray(sourceCues) ? sourceCues : [])
        .map((c, i) => {
            if (!c || typeof c !== 'object') return null;
            const timing = readCueTimingMs(c);
            const text = String(c.text || '').trim();
            if (!text) return null;
            return {
                index: i + 1,
                startMs: timing.startMs,
                endMs: timing.endMs,
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
    const dir = resolveTranscriptKeepDir(opts);
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
        return { ok: false, kept: [], error: err.message || String(err), dir };
    }

    const media = String(mediaPath || '').trim();
    const destName = buildTranscribeKeepBasename(
        media ? `${path.basename(media, path.extname(media))}.srt` : 'transcript.srt',
        media,
    );
    const dest = path.join(dir, destName);
    // Pass keep-dir dest so enrich can locate sibling `{stem}.original.srt` (PRED-890).
    const enriched = enrichSourceCuesWithTiming(sourceCues, {
        zhCues: options.zhCues,
        targetSubtitlePath: options.targetSubtitlePath,
        subtitlePath: options.subtitlePath || dest,
        outputDir: options.outputDir || dir,
        mediaPath,
    });
    const cues = engineCuesToKeepCues(enriched);
    if (!cues.length) {
        return { ok: true, kept: [], skipped: true };
    }

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
 * Prefer existing source files for JA text; always enrich timeline before keep write.
 */
function keepTranscriptFromJobResult({
    task = '',
    sourceSubtitlePath = '',
    sourceSubtitlePaths = null,
    subtitlePath = '',
    sourceCues = null,
    zhCues = null,
    targetSubtitlePath = '',
    outputDir = '',
    mediaPath = '',
    options = {},
} = {}) {
    const opts = normalizeTranscriptKeepOptions(options);
    const timingRefs = buildTimingRefsFromParams({
        zhCues,
        targetSubtitlePath,
        subtitlePath,
        outputDir,
        mediaPath,
    });
    const paths = resolveTranscriptSourcePaths({
        task,
        sourceSubtitlePath,
        sourceSubtitlePaths,
        subtitlePath,
    });
    let cues = Array.isArray(sourceCues) ? sourceCues : [];
    if (paths.length) {
        const fromDisk = [];
        for (const p of paths) {
            if (!fs.existsSync(p)) continue;
            fromDisk.push(...loadSubtitleAsEngineCues(p));
        }
        if (fromDisk.length) cues = fromDisk;
    }
    if (!cues.length) {
        return { ok: true, kept: [], skipped: true };
    }
    return keepTranscriptFromSourceCues(cues, mediaPath, {
        ...opts,
        ...timingRefs,
    });
}

/**
 * Re-write a kept transcript after ZH subtitle is on disk (post-batch timing refresh).
 */
function refreshKeptTranscriptTimings(keptPath, refs = {}, options = {}) {
    const kept = String(keptPath || '').trim();
    if (!kept || !fs.existsSync(kept)) {
        return { ok: true, skipped: true, reason: 'no_kept_file' };
    }
    const sourceCues = loadSubtitleAsEngineCues(kept);
    if (!sourceCues.length) {
        return { ok: true, skipped: true, reason: 'empty_kept' };
    }
    if (!cuesLackValidTiming(sourceCues)) {
        return { ok: true, skipped: true, reason: 'timing_ok' };
    }
    const enriched = enrichSourceCuesWithTiming(sourceCues, {
        ...refs,
        subtitlePath: refs.subtitlePath || kept,
        outputDir: refs.outputDir || path.dirname(kept),
    });
    if (!cuesLackValidTiming(enriched)) {
        const keepCues = engineCuesToKeepCues(enriched);
        try {
            const { serializeSubtitle } = require('./subtitle-format');
            fs.writeFileSync(kept, serializeSubtitle({ format: 'srt', cues: keepCues }), 'utf8');
            return { ok: true, refreshed: true, path: kept };
        } catch (err) {
            return { ok: false, error: err.message || String(err), path: kept };
        }
    }
    return { ok: true, skipped: true, reason: 'no_ref_timing' };
}

/** Count cues collapsed to a short t≈0 slot (credit-duration debris). */
function countZeroShortCues(cues, { maxStartMs = 50, maxSpanMs = 600 } = {}) {
    const list = Array.isArray(cues) ? cues : [];
    let n = 0;
    for (const c of list) {
        const { startMs, endMs } = readCueTimingMs(c);
        if (startMs <= maxStartMs && (endMs - startMs) <= maxSpanMs) n += 1;
    }
    return n;
}

/**
 * Snapshot healthy (non-zero-short) cue rows for later restore after post-batch corruption.
 * @returns {{ startMs: number, endMs: number, text: string }[]}
 */
function snapshotHealthyCueTimings(cues) {
    const list = Array.isArray(cues) ? cues : [];
    const out = [];
    for (const c of list) {
        const timing = readCueTimingMs(c);
        if (!timing.valid) continue;
        const text = String(c?.text ?? '').trim();
        if (!text) continue;
        out.push({
            startMs: timing.startMs,
            endMs: timing.endMs,
            text,
        });
    }
    return out;
}

/**
 * True when a track has a healthy body but a mass t≈0 short-cue pile (NIMA-083 post-batch).
 */
function cuesHaveMassZeroStartPile(cues, { minPile = 8 } = {}) {
    const list = Array.isArray(cues) ? cues : [];
    if (list.length < minPile + 4) return false;
    const zeroShort = countZeroShortCues(list);
    if (zeroShort < minPile) return false;
    const maxStart = list.reduce((m, c) => Math.max(m, readCueTimingMs(c).startMs), 0);
    return maxStart > 60000;
}

/**
 * True when non-credit dialogue was parked at t≈0 while a healthy body starts later
 * (NAAC-076: ending よろしく/ばいばい + opening 祐佳 collapsed onto credit timing,
 * then the rest of the track shifted earlier — massZero pile misses these because
 * spans are often >600ms).
 */
function cuesHaveStolenHeadDialogue(cues, { minStolen = 2 } = {}) {
    const list = Array.isArray(cues) ? cues : [];
    if (list.length < 10) return false;
    let isCredit = () => false;
    try {
        const creditCore = require('../src/js/subtitle-software-credit-core');
        isCredit = (t) => !!creditCore.isSoftwareCreditText?.(t);
    } catch { /* optional */ }
    const headStolen = [];
    let bodyMin = Infinity;
    let maxStart = 0;
    for (const c of list) {
        const { startMs } = readCueTimingMs(c);
        if (startMs > maxStart) maxStart = startMs;
        const text = String(c?.text ?? '').trim();
        if (!text) continue;
        if (startMs <= 50) {
            if (!isCredit(text)) headStolen.push(text);
            continue;
        }
        if (startMs < bodyMin) bodyMin = startMs;
    }
    if (headStolen.length < minStolen) return false;
    if (!(maxStart > 60000)) return false;
    // Body must clearly start after the credit window (not a true cold-open at 0).
    if (!(Number.isFinite(bodyMin) && bodyMin >= 5000)) return false;
    return true;
}

/** Mass t≈0 pile OR stolen head dialogue (credit-window contamination). */
function cuesHaveBrokenHeadTimeline(cues, opts = {}) {
    return cuesHaveMassZeroStartPile(cues, opts) || cuesHaveStolenHeadDialogue(cues, opts);
}

/**
 * True when the first non-credit dialogue rows diverge from a healthy engine snapshot
 * (off-by-one content shift without t≈0 parking — NAAC-076 after debris prune).
 */
function cuesHeadDivergesFromSnapshot(cues, snapshot, { check = 6, minMismatch = 2 } = {}) {
    const list = Array.isArray(cues) ? cues : [];
    const snap = Array.isArray(snapshot) ? snapshot : [];
    if (list.length < 8 || snap.length < 8) return false;
    let isCredit = () => false;
    try {
        const creditCore = require('../src/js/subtitle-software-credit-core');
        isCredit = (t) => !!creditCore.isSoftwareCreditText?.(t);
    } catch { /* optional */ }
    const norm = (t) => String(t || '').replace(/[\s　]+/g, '').trim();
    const take = (rows) => {
        const out = [];
        for (const c of rows) {
            const text = norm(c?.text);
            if (!text || isCredit(text)) continue;
            out.push({ text, startMs: readCueTimingMs(c).startMs });
            if (out.length >= check) break;
        }
        return out;
    };
    const a = take(list);
    const b = take(snap);
    if (a.length < minMismatch + 1 || b.length < minMismatch + 1) return false;
    let mism = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
        if (a[i].text !== b[i].text) mism += 1;
    }
    if (mism >= minMismatch) {
        const snapMax = snap.reduce((m, c) => Math.max(m, readCueTimingMs(c).startMs), 0);
        if (snapMax > 60000) return true;
    }
    // Body skew: head text may match while startMs sets diverge (paired restore miss).
    const startsOf = (rows) => {
        const set = new Set();
        for (const c of rows) {
            const text = norm(c?.text);
            if (!text || isCredit(text)) continue;
            const sm = Math.round(readCueTimingMs(c).startMs / 40) * 40;
            if (sm > 50) set.add(sm);
        }
        return set;
    };
    const aStarts = startsOf(list);
    const bStarts = startsOf(snap);
    if (aStarts.size < 8 || bStarts.size < 8) return false;
    let hit = 0;
    let onlyA = 0;
    let onlyB = 0;
    for (const sm of aStarts) {
        if (bStarts.has(sm)) hit += 1;
        else onlyA += 1;
    }
    for (const sm of bStarts) {
        if (!aStarts.has(sm)) onlyB += 1;
    }
    const overlap = hit / Math.min(aStarts.size, bStarts.size);
    if (overlap < 0.85) return true;
    // Many exclusive timings on either side ⇒ unpaired JA/ZH body (NAAC after one-sided restore).
    return onlyA >= 8 || onlyB >= 8;
}

/**
 * Restore zero-short / invalid timings from a healthy snapshot (text match),
 * or replace the whole list with the snapshot when the pile is catastrophic.
 * @returns {{ cues: object[], changed: boolean, restored: number, mode?: string }}
 */
function restoreCueTimingsFromSnapshot(cues, snapshot, options = {}) {
    const list = Array.isArray(cues) ? cues.map((c) => ({ ...c })) : [];
    const snap = Array.isArray(snapshot) ? snapshot : [];
    if (!list.length || !snap.length) {
        return { cues: list, changed: false, restored: 0 };
    }
    const headBroken = cuesHaveBrokenHeadTimeline(list)
        || cuesHeadDivergesFromSnapshot(list, snap, options);
    if (headBroken && snap.length >= Math.ceil(list.length * 0.45)) {
        // Catastrophic: texts at t≈0 no longer match (ZH all「等一下」 / stolen endings /
        // off-by-one dialogue shift) — take snapshot body.
        const rebuilt = snap.map((c, i) => ({
            index: i + 1,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text,
        }));
        return {
            cues: rebuilt,
            changed: true,
            restored: rebuilt.length,
            mode: 'snapshot_replace',
        };
    }
    const borrowed = borrowTimingByTextMatch(list, snap);
    let restored = 0;
    for (let i = 0; i < list.length; i += 1) {
        const before = readCueTimingMs(list[i]);
        const after = readCueTimingMs(borrowed[i]);
        if (!before.valid && after.valid) restored += 1;
        list[i] = borrowed[i];
    }
    return {
        cues: list,
        changed: restored > 0,
        restored,
        mode: restored > 0 ? 'text_match' : undefined,
    };
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
    readCueTimingMs,
    cuesLackValidTiming,
    cuesLookQcPacked,
    cuesHaveBrokenTimeline,
    countZeroShortCues,
    snapshotHealthyCueTimings,
    cuesHaveMassZeroStartPile,
    cuesHaveStolenHeadDialogue,
    cuesHaveBrokenHeadTimeline,
    cuesHeadDivergesFromSnapshot,
    restoreCueTimingsFromSnapshot,
    borrowTimingOntoSourceCues,
    borrowTimingByTextMatch,
    enrichSourceCuesWithTiming,
    resolveTimingReferenceCues,
    resolveOriginalTimingCandidatePaths,
    engineCuesToKeepCues,
    keepTranscriptFromSourceCues,
    keepTranscriptFromJobResult,
    refreshKeptTranscriptTimings,
    resolveZhTimingCandidatePaths,
    loadSubtitleAsEngineCues,
    findKeptTranscript,
    resolveLookupStem,
    buildTranscribeKeepBasename,
    isOriginalKeepFile,
    pinKeptTranscript,
    unpinKeptTranscript,
    isPinnedPath,
};
