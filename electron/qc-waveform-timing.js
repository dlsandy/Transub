/**
 * QC waveform timing scan (ffmpeg PCM windows) + optional Laya Score triage.
 * Heuristics are authoritative; Laya only reorders already-flagged suspects.
 *
 * Performance notes (4K / long titles):
 * - Prefer a one-shot audio proxy WAV, then **slice PCM in-process** (no per-window ffmpeg).
 * - Reuse scan PCM for edge-snap (no second extract pass per cue).
 * - Hard wall-clock budget so QC cannot stall the batch UI at ~99%.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const core = require('../src/js/waveform-timing-suspect-core');

const SAMPLE_RATE = core.DEFAULT_SAMPLE_RATE;
const PRE_MS = core.DEFAULT_PRE_MS;
const POST_MS = core.DEFAULT_POST_MS;
/** Per-window ffmpeg budget when reading the original media (video). */
const EXTRACT_TIMEOUT_MS = 8000;
/** Per-window budget once audio has been demuxed to a PCM/WAV proxy (ffmpeg fallback). */
const EXTRACT_TIMEOUT_PROXY_MS = 2500;
/** Whole demux of the audio track (no video decode). */
const PROXY_DEMUX_TIMEOUT_MS = 90000;
/** Give up remaining QC windows after this many consecutive ffmpeg failures/timeouts. */
const MAX_CONSECUTIVE_EXTRACT_FAILS = 3;
/** Cap PCM window so a broken cue duration cannot decode minutes of audio. */
const MAX_EXTRACT_DURATION_SEC = 24;
/** Default wall-clock budget for one waveform phase (demux + scan + snap). */
const DEFAULT_PHASE_BUDGET_MS = 60000;
const DEFAULT_MAX_CANDIDATES = 28;
const DEFAULT_MAX_EDGE_SNAPS = 16;

const AUDIO_ONLY_EXT_RE = /\.(wav|wave|flac|mp3|m4a|aac|ogg|opus|wma)$/i;

function resolveFfmpeg(options = {}) {
    try {
        const ffmpeg = require('./ffmpeg-bridge');
        const resolved = ffmpeg.resolveFfmpegForExecution?.(
            options.ffmpegPathSetting || options.ffmpegPath,
        );
        if (resolved?.ok && resolved.path) return { ok: true, path: resolved.path };
        return { ok: false, error: resolved?.error || 'no_ffmpeg' };
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
}

function yieldEventLoop() {
    return new Promise((resolve) => setImmediate(resolve));
}

function isLikelyAudioOnlyPath(mediaPath) {
    return AUDIO_ONLY_EXT_RE.test(String(mediaPath || '').trim());
}

function isWavPath(mediaPath) {
    return /\.wav$/i.test(String(mediaPath || '').trim());
}

/**
 * Copy PCM out of Node Buffer pools. Int16Array views on allocUnsafe / concat
 * buffers get overwritten by later reads — that made edge-snap glue many cues
 * onto the same wrong energy window.
 */
function pcmInt16FromBytes(buf, byteLength) {
    const len = Math.max(0, Math.floor(Number(byteLength) || 0));
    const usable = len - (len % 2);
    if (!Buffer.isBuffer(buf) || usable < 2) return null;
    const copy = Buffer.allocUnsafeSlow
        ? Buffer.allocUnsafeSlow(usable)
        : Buffer.alloc(usable);
    buf.copy(copy, 0, 0, usable);
    return new Int16Array(copy.buffer, copy.byteOffset, usable / 2);
}

/** True when snaps would collapse the track into a glued early pile. */
function snapsLookCatastrophic(beforeCues, afterCues, snapChanged) {
    if (!(snapChanged > 0) || !Array.isArray(afterCues) || afterCues.length < 8) return false;
    try {
        const keep = require('./transcript-keep');
        if (typeof keep.cuesHaveBrokenTimeline === 'function'
            && keep.cuesHaveBrokenTimeline(afterCues)
            && !keep.cuesHaveBrokenTimeline(beforeCues)) {
            return true;
        }
        if (typeof keep.cuesHaveMassZeroStartPile === 'function'
            && keep.cuesHaveMassZeroStartPile(afterCues)
            && !keep.cuesHaveMassZeroStartPile(beforeCues)) {
            return true;
        }
    } catch { /* optional */ }
    // Majority of cues collapsed onto one startMs (SAN-494 prelude to mega-join).
    const startShare = (list) => {
        const counts = new Map();
        for (const c of list || []) {
            const sm = Math.round(Number(c?.startMs) || 0);
            counts.set(sm, (counts.get(sm) || 0) + 1);
        }
        let max = 0;
        for (const n of counts.values()) {
            if (n > max) max = n;
        }
        return list?.length ? max / list.length : 0;
    };
    if (startShare(afterCues) >= 0.5 && startShare(beforeCues) < 0.35) {
        return true;
    }
    // Dense overlap: >40% of neighboring pairs overlap after snap.
    let overlaps = 0;
    let pairs = 0;
    for (let i = 1; i < afterCues.length; i += 1) {
        const prevEnd = Number(afterCues[i - 1]?.endMs);
        const curStart = Number(afterCues[i]?.startMs);
        if (!Number.isFinite(prevEnd) || !Number.isFinite(curStart)) continue;
        pairs += 1;
        if (curStart < prevEnd - 40) overlaps += 1;
    }
    if (pairs >= 8 && overlaps / pairs > 0.4) return true;
    return false;
}

/**
 * Locate engine-persisted mix timing PCM
 * (`{timingPcmCacheRoot}/.transub-cache/{stem}.timing-16k.wav`).
 * Also probes legacy `{outputDir|mediaDir}/.transub-cache/` for older jobs.
 */
function resolveTimingAudioSidecar(mediaPath, options = {}) {
    const explicit = String(
        options.timingAudioPath
        || options.waveformAudioPath
        || options.qcTimingAudioPath
        || '',
    ).trim();
    if (explicit) {
        try {
            if (fs.existsSync(explicit) && fs.statSync(explicit).size > 64) return explicit;
        } catch { /* fall through */ }
    }
    const media = String(mediaPath || options.mediaPath || options.videoPath || '').trim();
    if (!media) return '';
    const stem = path.parse(media).name;
    if (!stem) return '';
    const roots = [];
    try {
        const { getTimingPcmCacheRoot } = require('./temp-cleanup');
        roots.push(getTimingPcmCacheRoot());
    } catch { /* optional */ }
    const explicitCache = String(options.timingPcmCacheRoot || options.timingPcmCacheDir || '').trim();
    if (explicitCache) roots.push(explicitCache);
    const outDir = String(options.outputDir || options.subtitleOutputDir || '').trim();
    if (outDir) roots.push(outDir);
    roots.push(path.dirname(media));
    const seen = new Set();
    for (const root of roots) {
        const key = path.resolve(root).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const candidate = path.join(root, '.transub-cache', `${stem}.timing-16k.wav`);
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).size > 64) {
                return candidate;
            }
        } catch { /* try next */ }
    }
    return '';
}

function cleanupTimingAudioSidecar(filePath, options = {}) {
    const p = String(filePath || '').trim();
    if (!p) return false;
    // Only remove engine/desktop cache files — never user media.
    const norm = p.replace(/\\/g, '/').toLowerCase();
    if (!norm.includes('/.transub-cache/') || !norm.endsWith('.timing-16k.wav')) {
        return false;
    }
    if (options.keepTimingAudio === true) return false;
    try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
        return true;
    } catch {
        return false;
    }
}

/**
 * Parse PCM WAV (mono s16le) header. Returns null when format is unsuitable
 * for direct slicing (must fall back to ffmpeg).
 */
function parsePcmWavHeader(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 44) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
        return null;
    }
    let offset = 12;
    let fmt = null;
    let dataOffset = -1;
    let dataSize = 0;
    while (offset + 8 <= buf.length) {
        const id = buf.toString('ascii', offset, offset + 4);
        const size = buf.readUInt32LE(offset + 4);
        const chunkStart = offset + 8;
        if (id === 'fmt ' && chunkStart + 16 <= buf.length) {
            fmt = {
                audioFormat: buf.readUInt16LE(chunkStart),
                channels: buf.readUInt16LE(chunkStart + 2),
                sampleRate: buf.readUInt32LE(chunkStart + 4),
                bitsPerSample: buf.readUInt16LE(chunkStart + 14),
            };
        } else if (id === 'data') {
            dataOffset = chunkStart;
            dataSize = size;
            break;
        }
        offset = chunkStart + size + (size % 2);
        // Guard against corrupt chunk sizes.
        if (offset <= chunkStart) break;
    }
    if (!fmt || dataOffset < 0) return null;
    if (fmt.audioFormat !== 1 || fmt.channels !== 1 || fmt.bitsPerSample !== 16) return null;
    if (!Number.isFinite(fmt.sampleRate) || fmt.sampleRate < 8000) return null;
    return {
        sampleRate: fmt.sampleRate,
        dataOffset,
        dataSize,
    };
}

/**
 * Open a mono s16 WAV for O(1) window slices (no ffmpeg spawn per cue).
 * @returns {{ sliceWindow: Function, close: Function, sampleRate: number, path: string }|null}
 */
function openWavPcmReader(filePath) {
    const resolved = String(filePath || '').trim();
    if (!resolved || !isWavPath(resolved)) return null;
    let fd;
    try {
        fd = fs.openSync(resolved, 'r');
        const head = Buffer.alloc(128 * 1024);
        const n = fs.readSync(fd, head, 0, head.length, 0);
        const meta = parsePcmWavHeader(head.subarray(0, n));
        if (!meta) {
            fs.closeSync(fd);
            return null;
        }
        const bytesPerSample = 2;
        return {
            path: resolved,
            sampleRate: meta.sampleRate,
            dataOffset: meta.dataOffset,
            dataSize: meta.dataSize,
            sliceWindow(startMs, endMs, options = {}) {
                const preMs = Number.isFinite(Number(options.preMs))
                    ? Math.max(0, Number(options.preMs))
                    : PRE_MS;
                const postMs = Number.isFinite(Number(options.postMs))
                    ? Math.max(0, Number(options.postMs))
                    : POST_MS;
                const ssMs = Math.max(0, (Number(startMs) || 0) - preMs);
                let durMs = Math.max(50, ((Number(endMs) || 0) + postMs) - ssMs);
                durMs = Math.min(MAX_EXTRACT_DURATION_SEC * 1000, durMs);
                const startSample = Math.floor((ssMs / 1000) * meta.sampleRate);
                let numSamples = Math.max(1, Math.floor((durMs / 1000) * meta.sampleRate));
                let startByte = startSample * bytesPerSample;
                let byteLen = numSamples * bytesPerSample;
                if (startByte >= meta.dataSize) {
                    return { ok: false, error: 'wav_oob' };
                }
                byteLen = Math.min(byteLen, meta.dataSize - startByte);
                byteLen -= byteLen % bytesPerSample;
                if (byteLen < bytesPerSample) {
                    return { ok: false, error: 'empty_pcm' };
                }
                const buf = Buffer.alloc(byteLen);
                const read = fs.readSync(fd, buf, 0, byteLen, meta.dataOffset + startByte);
                const usable = read - (read % bytesPerSample);
                if (usable < bytesPerSample) {
                    return { ok: false, error: 'empty_pcm' };
                }
                const pcm = pcmInt16FromBytes(buf, usable);
                if (!pcm?.length) return { ok: false, error: 'empty_pcm' };
                return {
                    ok: true,
                    pcm,
                    preMs,
                    postMs,
                    sampleRate: meta.sampleRate,
                    fromWav: true,
                };
            },
            close() {
                try { fs.closeSync(fd); } catch { /* ignore */ }
                fd = null;
            },
        };
    } catch {
        try { if (fd != null) fs.closeSync(fd); } catch { /* ignore */ }
        return null;
    }
}

function attachWavReader(session) {
    if (!session || session.wavReader || typeof session.spawn === 'function') return session;
    if (!isWavPath(session.mediaPath)) return session;
    const reader = openWavPcmReader(session.mediaPath);
    if (!reader) return session;
    const prevCleanup = session.cleanup;
    session.wavReader = reader;
    session.sliceDirect = true;
    session.cleanup = () => {
        try { reader.close(); } catch { /* ignore */ }
        try { return prevCleanup?.(); } catch { /* ignore */ }
        return undefined;
    };
    return session;
}

function killExtractProc(proc) {
    if (!proc) return;
    try {
        const ffmpeg = require('./ffmpeg-bridge');
        if (typeof ffmpeg.killFfmpegProc === 'function') {
            ffmpeg.killFfmpegProc(proc);
            return;
        }
    } catch { /* fall through */ }
    try {
        if (process.platform === 'win32' && proc.pid) {
            require('child_process').execFile(
                'taskkill',
                ['/pid', String(proc.pid), '/T', '/F'],
                { windowsHide: true, timeout: 8000 },
                () => {},
            );
            return;
        }
        proc.kill('SIGKILL');
    } catch { /* ignore */ }
}

function buildExtractArgs(mediaPath, startMs, endMs, options = {}) {
    const preMs = Number(options.preMs) || PRE_MS;
    const postMs = Number(options.postMs) || POST_MS;
    const sampleRate = Number(options.sampleRate) || SAMPLE_RATE;
    const ss = Math.max(0, (Number(startMs) || 0) - preMs) / 1000;
    let dur = Math.max(0.05, ((Number(endMs) || 0) + postMs - ((Number(startMs) || 0) - preMs)) / 1000);
    dur = Math.min(MAX_EXTRACT_DURATION_SEC, dur);
    const args = [
        '-hide_banner', '-nostdin', '-nostats', '-loglevel', 'error',
        '-hwaccel', 'none',
        '-ss', String(ss),
        '-t', String(dur),
        '-i', String(mediaPath),
        '-vn', '-sn', '-dn',
        '-map', '0:a:0?',
        '-ac', '1', '-ar', String(sampleRate),
        '-f', 's16le', 'pipe:1',
    ];
    return { args, preMs, postMs, sampleRate };
}

function runFfmpegOnce(ffPath, args, options = {}) {
    const spawnFn = typeof options.spawn === 'function' ? options.spawn : spawn;
    const timeoutMs = Math.max(300, Number(options.timeoutMs) || EXTRACT_TIMEOUT_MS);
    return new Promise((resolve) => {
        let settled = false;
        let chunks = [];
        let total = 0;
        let proc;
        let timer = null;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            resolve(result);
        };
        timer = setTimeout(() => {
            killExtractProc(proc);
            finish({ ok: false, error: 'ffmpeg_timeout', timedOut: true });
        }, timeoutMs);
        try {
            proc = spawnFn(ffPath, args, { windowsHide: true });
        } catch (err) {
            finish({ ok: false, error: err.message || String(err) });
            return;
        }
        try {
            const ffmpeg = require('./ffmpeg-bridge');
            ffmpeg.trackFfmpegProc?.(proc);
        } catch { /* optional */ }
        if (options.captureStdout !== false) {
            proc.stdout?.on?.('data', (chunk) => {
                const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                total += buf.length;
                if (options.maxStdoutBytes && total > options.maxStdoutBytes) {
                    killExtractProc(proc);
                    finish({ ok: false, error: 'pcm_too_large' });
                    return;
                }
                if (options.collectStdout !== false) chunks.push(buf);
            });
        }
        proc.stderr?.on?.('data', () => { /* discard */ });
        proc.on?.('error', (err) => {
            finish({ ok: false, error: err.message || String(err) });
        });
        proc.on?.('close', (code, signal) => {
            if (settled) return;
            if (signal || code === null) {
                finish({ ok: false, error: 'ffmpeg_killed', timedOut: true });
                return;
            }
            if (code !== 0) {
                finish({ ok: false, error: `ffmpeg_fail:${code}` });
                return;
            }
            const buf = chunks.length
                ? (chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, total))
                : Buffer.alloc(0);
            finish({ ok: true, buffer: buf, bytes: total });
        });
    });
}

/**
 * Async PCM extract. Prefer in-process WAV slice when a proxy reader is attached;
 * otherwise ffmpeg (never spawnSync — it blocks Electron main).
 */
function extractPcmWindow(mediaPath, startMs, endMs, options = {}) {
    const reader = options.wavReader
        || (options.waveformSession && options.waveformSession.wavReader)
        || null;
    // Injected spawn = unit-test path; never bypass with a real WAV reader.
    if (reader && typeof reader.sliceWindow === 'function' && typeof options.spawn !== 'function') {
        try {
            return Promise.resolve(reader.sliceWindow(startMs, endMs, options));
        } catch (err) {
            return Promise.resolve({ ok: false, error: err?.message || 'wav_slice' });
        }
    }

    const source = String(options.extractMediaPath || mediaPath || '').trim();
    const spawnFn = typeof options.spawn === 'function' ? options.spawn : spawn;
    const ff = typeof options.spawn === 'function'
        ? { ok: true, path: options.ffmpegPath || 'ffmpeg' }
        : resolveFfmpeg(options);
    if (!ff.ok) return Promise.resolve({ ok: false, error: ff.error });
    if (!source) return Promise.resolve({ ok: false, error: 'no_media' });
    const { args, preMs, postMs, sampleRate } = buildExtractArgs(source, startMs, endMs, options);
    const defaultTimeout = isLikelyAudioOnlyPath(source) || options.extractMediaPath
        ? EXTRACT_TIMEOUT_PROXY_MS
        : EXTRACT_TIMEOUT_MS;
    const timeoutMs = Math.max(300, Number(options.extractTimeoutMs) || defaultTimeout);

    return runFfmpegOnce(ff.path, args, {
        spawn: spawnFn,
        timeoutMs,
        maxStdoutBytes: 32 * 1024 * 1024,
        collectStdout: true,
    }).then((res) => {
        if (!res.ok) return res;
        const buf = res.buffer;
        if (!buf?.length) return { ok: false, error: 'empty_pcm' };
        const pcm = pcmInt16FromBytes(buf, buf.byteLength);
        if (!pcm?.length) return { ok: false, error: 'empty_pcm' };
        return {
            ok: true,
            pcm,
            preMs,
            postMs,
            sampleRate,
        };
    });
}

/**
 * Demux audio-only proxy so cue windows do not re-seek 4K video indexes.
 * Soft-fails: caller falls back to the original media path.
 */
async function demuxAudioProxy(mediaPath, outWav, options = {}) {
    const ff = typeof options.spawn === 'function'
        ? { ok: true, path: options.ffmpegPath || 'ffmpeg' }
        : resolveFfmpeg(options);
    if (!ff.ok) return { ok: false, error: ff.error };
    const args = [
        '-hide_banner', '-nostdin', '-nostats', '-loglevel', 'error',
        '-hwaccel', 'none',
        '-y',
        '-i', String(mediaPath),
        '-vn', '-sn', '-dn',
        '-map', '0:a:0?',
        '-ac', '1', '-ar', String(SAMPLE_RATE),
        '-c:a', 'pcm_s16le',
        String(outWav),
    ];
    const timeoutMs = Math.max(
        5000,
        Number(options.proxyDemuxTimeoutMs) || PROXY_DEMUX_TIMEOUT_MS,
    );
    const res = await runFfmpegOnce(ff.path, args, {
        spawn: typeof options.spawn === 'function' ? options.spawn : undefined,
        timeoutMs,
        captureStdout: true,
        collectStdout: false,
    });
    if (!res.ok) return res;
    try {
        if (!fs.existsSync(outWav) || fs.statSync(outWav).size < 64) {
            return { ok: false, error: 'proxy_empty' };
        }
    } catch (err) {
        return { ok: false, error: err?.message || 'proxy_missing' };
    }
    return { ok: true, path: outWav };
}

/**
 * One-shot extract session shared across JA + ZH waveform passes.
 * @returns {Promise<{
 *   mediaPath: string,
 *   isProxy: boolean,
 *   extractTimeoutMs: number,
 *   demuxFailed?: string,
 *   cleanup: () => Promise<void>|void,
 * }>}
 */
async function prepareWaveformExtractSession(mediaPath, options = {}) {
    if (options.waveformSession?.mediaPath) {
        return options.waveformSession;
    }
    const src = String(mediaPath || options.videoPath || '').trim();
    // Prefer engine mix timing PCM (written during island ASR) over a second demux.
    const timingSidecar = resolveTimingAudioSidecar(src, options);
    if (timingSidecar) {
        options.onProgress?.({
            phase: 'waveform-timing',
            message: '波形计时：复用引擎音轨…',
            pct: 2,
        });
        const cached = attachWavReader({
            mediaPath: timingSidecar,
            isProxy: true,
            fromTimingCache: true,
            extractTimeoutMs: EXTRACT_TIMEOUT_PROXY_MS,
            cleanup: () => {},
        });
        if (cached.wavReader) return cached;
        // Corrupt/unreadable cache → fall through to demux.
    }

    const sharedPath = String(options.waveformAudioPath || '').trim();
    if (sharedPath) {
        try {
            if (fs.existsSync(sharedPath)) {
                return attachWavReader({
                    mediaPath: sharedPath,
                    isProxy: true,
                    extractTimeoutMs: EXTRACT_TIMEOUT_PROXY_MS,
                    cleanup: () => {},
                });
            }
        } catch { /* fall through */ }
    }
    if (!src) {
        return {
            mediaPath: '',
            isProxy: false,
            extractTimeoutMs: EXTRACT_TIMEOUT_MS,
            cleanup: () => {},
        };
    }

    // Injected spawn (unit tests) or explicit opt-out: keep direct path.
    if (
        typeof options.spawn === 'function'
        || options.waveformSkipProxy === true
        || options.waveformPreferDirect === true
    ) {
        return {
            mediaPath: src,
            isProxy: false,
            extractTimeoutMs: EXTRACT_TIMEOUT_MS,
            cleanup: () => {},
        };
    }

    if (isLikelyAudioOnlyPath(src)) {
        return attachWavReader({
            mediaPath: src,
            isProxy: true,
            extractTimeoutMs: EXTRACT_TIMEOUT_PROXY_MS,
            cleanup: () => {},
        });
    }

    let dir = '';
    try {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-wave-'));
    } catch (err) {
        return {
            mediaPath: src,
            isProxy: false,
            extractTimeoutMs: EXTRACT_TIMEOUT_MS,
            demuxFailed: err?.message || 'tmpdir',
            cleanup: () => {},
        };
    }
    const outWav = path.join(dir, 'proxy.wav');
    options.onProgress?.({
        phase: 'waveform-timing',
        message: '波形计时：抽取音轨…',
        pct: 2,
    });
    const demuxed = await demuxAudioProxy(src, outWav, options);
    if (!demuxed.ok) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        return {
            mediaPath: src,
            isProxy: false,
            extractTimeoutMs: EXTRACT_TIMEOUT_MS,
            demuxFailed: demuxed.error || 'demux_fail',
            cleanup: () => {},
        };
    }
    return attachWavReader({
        mediaPath: outWav,
        isProxy: true,
        extractTimeoutMs: EXTRACT_TIMEOUT_PROXY_MS,
        tempDir: dir,
        cleanup: () => {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        },
    });
}

function resolveWaveformBudgets(options = {}) {
    let maxCandidates = Number(options.maxCandidates ?? options.waveformMaxCandidates);
    if (!Number.isFinite(maxCandidates) || maxCandidates <= 0) maxCandidates = DEFAULT_MAX_CANDIDATES;
    maxCandidates = Math.min(120, Math.max(4, Math.round(maxCandidates)));

    let maxEdgeSnaps = Number(options.maxEdgeSnaps);
    if (!Number.isFinite(maxEdgeSnaps) || maxEdgeSnaps <= 0) maxEdgeSnaps = DEFAULT_MAX_EDGE_SNAPS;
    maxEdgeSnaps = Math.min(80, Math.max(4, Math.round(maxEdgeSnaps)));

    const durationSec = Number(options.mediaDurationSec || options.durationSec) || 0;
    const height = Number(options.mediaHeight || options.videoHeight) || 0;
    if (durationSec >= 5400 || height >= 2160) {
        maxCandidates = Math.min(maxCandidates, 24);
        maxEdgeSnaps = Math.min(maxEdgeSnaps, 14);
    } else if (durationSec >= 3600 || height >= 1440) {
        maxCandidates = Math.min(maxCandidates, 28);
        maxEdgeSnaps = Math.min(maxEdgeSnaps, 16);
    }

    let budgetMs = Number(options.waveformPhaseBudgetMs);
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) budgetMs = DEFAULT_PHASE_BUDGET_MS;
    // Allow short explicit budgets (tests / residual ZH pass); clamp only the ceiling.
    budgetMs = Math.min(5 * 60 * 1000, Math.max(200, Math.round(budgetMs)));

    return { maxCandidates, maxEdgeSnaps, budgetMs };
}

function budgetExceeded(deadline) {
    return Number.isFinite(deadline) && Date.now() >= deadline;
}

/**
 * @param {object[]} cues
 * @param {{
 *   mediaPath?: string,
 *   videoPath?: string,
 *   issues?: object[],
 *   maxCandidates?: number,
 *   waveformTiming?: boolean,
 *   ffmpegPath?: string,
 *   onProgress?: Function,
 *   signal?: AbortSignal,
 *   deadline?: number,
 *   pcmByIndex?: Map,
 * }} options
 */
async function scanWaveformTimingSuspects(cues, options = {}) {
    if (options.waveformTiming === false || options.qcWaveformTiming === false) {
        return {
            ok: true,
            skipped: true,
            reason: 'disabled',
            analyses: [],
            suspects: [],
            issues: [],
            rankedIndexes: [],
            stats: { analyzed: 0, soft: 0, hard: 0, ok: 0 },
            pcmByIndex: options.pcmByIndex || new Map(),
        };
    }
    const mediaPath = String(
        options.extractMediaPath || options.mediaPath || options.videoPath || '',
    ).trim();
    if (!mediaPath) {
        return {
            ok: true,
            skipped: true,
            reason: 'no_media',
            analyses: [],
            suspects: [],
            issues: [],
            rankedIndexes: [],
            stats: { analyzed: 0, soft: 0, hard: 0, ok: 0 },
            pcmByIndex: options.pcmByIndex || new Map(),
        };
    }
    const ff = typeof options.spawn === 'function'
        ? { ok: true, path: options.ffmpegPath || 'ffmpeg' }
        : resolveFfmpeg(options);
    if (!ff.ok) {
        return {
            ok: false,
            skipped: true,
            reason: 'no_ffmpeg',
            error: ff.error,
            analyses: [],
            suspects: [],
            issues: [],
            rankedIndexes: [],
            stats: { analyzed: 0, soft: 0, hard: 0, ok: 0 },
            pcmByIndex: options.pcmByIndex || new Map(),
        };
    }

    const budgets = resolveWaveformBudgets(options);
    const candidates = core.pickWaveformCandidates(cues, options.issues, {
        maxCandidates: options.maxCandidates || budgets.maxCandidates,
    });
    const analyses = [];
    const pcmByIndex = options.pcmByIndex instanceof Map ? options.pcmByIndex : new Map();
    let extractFail = 0;
    let consecutiveFail = 0;
    let budgetAbort = false;
    const yieldEvery = Math.max(1, Number(options.yieldEvery) || 1);
    const progressEvery = Math.max(1, Number(options.progressEvery) || yieldEvery);
    let sliceDirectHits = 0;
    for (let i = 0; i < candidates.length; i += 1) {
        if (options.signal?.aborted) break;
        if (budgetExceeded(options.deadline)) {
            budgetAbort = true;
            options.onProgress?.({
                phase: 'waveform-timing',
                message: '波形计时扫描提前结束（时间预算）',
                pct: 40,
            });
            break;
        }
        const cue = candidates[i];
        if (i === 0 || ((i + 1) % progressEvery === 0) || i + 1 === candidates.length) {
            options.onProgress?.({
                phase: 'waveform-timing',
                message: `波形计时扫描 ${i + 1}/${candidates.length}…`,
                pct: Math.min(40, Math.round(((i + 1) / Math.max(1, candidates.length)) * 40)),
                current: i + 1,
                total: candidates.length,
            });
        }
        if (i % yieldEvery === 0) await yieldEventLoop();
        const pcm = await extractPcmWindow(mediaPath, cue.startMs, core.cueEndMs(cue), options);
        if (pcm?.fromWav) sliceDirectHits += 1;
        if (!pcm.ok) {
            extractFail += 1;
            consecutiveFail += 1;
            if (consecutiveFail >= MAX_CONSECUTIVE_EXTRACT_FAILS) {
                options.onProgress?.({
                    phase: 'waveform-timing',
                    message: '波形计时扫描跳过（媒体解码超时）',
                    pct: 40,
                });
                break;
            }
            continue;
        }
        consecutiveFail = 0;
        const idx = Number(cue.index);
        if (Number.isInteger(idx) && idx >= 0) {
            pcmByIndex.set(idx, {
                pcm: pcm.pcm,
                sampleRate: pcm.sampleRate,
                preMs: pcm.preMs,
                postMs: pcm.postMs,
            });
        }
        analyses.push(core.analyzeCuePcm(cue, pcm.pcm, {
            sampleRate: pcm.sampleRate,
            preMs: pcm.preMs,
            postMs: pcm.postMs,
        }));
    }

    const suspects = core.suspectsFromAnalyses(analyses);
    const stats = {
        analyzed: analyses.length,
        soft: analyses.filter((a) => a.label === 'soft').length,
        hard: analyses.filter((a) => a.label === 'hard').length,
        ok: analyses.filter((a) => a.label === 'ok').length,
        extractFail,
        consecutiveAbort: consecutiveFail >= MAX_CONSECUTIVE_EXTRACT_FAILS,
        budgetAbort,
        candidates: candidates.length,
        pcmCached: pcmByIndex.size,
        sliceDirectHits,
    };
    return {
        ok: true,
        skipped: false,
        analyses,
        suspects,
        issues: core.toQcIssues(suspects),
        rankedIndexes: core.orderSuspectIndexes(suspects),
        stats,
        pcmByIndex,
    };
}

/**
 * Laya Score triage among suspects only (never Choice keep/fix).
 * Soft-fails to heuristic severity order.
 */
async function rankWaveformSuspectsWithLaya(suspects, options = {}) {
    const list = Array.isArray(suspects) ? suspects : [];
    const heuristicOrder = core.orderSuspectIndexes(list);
    if (list.length < 4 || options.waveformTimingLaya === false) {
        return { rankedIndexes: heuristicOrder, usedLaya: false, reason: list.length < 4 ? 'few' : 'disabled' };
    }
    try {
        const { runScoreRank, pipe } = require('./jev-laya-pipelines');
        const scoreMap = await runScoreRank(
            list.slice(0, 32).map((s) => ({
                index: s.index,
                text: s.text,
                id: `s${s.index}`,
                reasons: [
                    Array.isArray(s.reasons) ? s.reasons.join(',') : 'timing_waveform',
                    core.featureBlurbForLaya(s),
                ].join(' | '),
                heuristicScore: s.severity,
            })),
            options,
            {
                task: 'waveform_timing_rank',
                instructionsLead: [
                    'Score how urgently this subtitle cue needs a timing fix (skip→must).',
                    'Higher when speech energy spills outside start/end, body is quiet vs pads, or duration mismatches text.',
                ].join(' '),
                signal: options.signal,
            },
        );
        if (!scoreMap?.size) {
            return { rankedIndexes: heuristicOrder, usedLaya: false, reason: 'no_scores' };
        }
        const heuristic = {};
        for (const s of list) heuristic[s.index] = s.severity;
        const ordered = pipe.mergeScoreReorder(
            list.map((s) => Number(s.index)),
            scoreMap,
            heuristic,
        );
        return {
            rankedIndexes: ordered.filter((n) => Number.isInteger(n)),
            usedLaya: true,
            scoreCount: scoreMap.size,
        };
    } catch (err) {
        return {
            rankedIndexes: heuristicOrder,
            usedLaya: false,
            reason: err?.message || 'laya_fail',
        };
    }
}

/**
 * Full QC phase: scan → optional Laya Score rank → edge snap on spill suspects.
 */
async function runQcWaveformTimingPhase(cues, options = {}) {
    const budgets = resolveWaveformBudgets(options);
    const phaseStartedAt = Date.now();
    const ownedSession = !options.waveformSession;
    const mediaPath = String(options.mediaPath || options.videoPath || '').trim();
    const session = options.waveformSession
        || await prepareWaveformExtractSession(mediaPath, {
            ...options,
            onProgress: options.onProgress,
        });
    // Demux (if owned) counts toward the same wall-clock budget as scan/snap.
    const spentMs = Date.now() - phaseStartedAt;
    const remainingMs = Math.max(0, budgets.budgetMs - spentMs);
    const deadline = Date.now() + remainingMs;

    const extractOpts = {
        ...options,
        maxCandidates: options.maxCandidates || budgets.maxCandidates,
        maxEdgeSnaps: options.maxEdgeSnaps || budgets.maxEdgeSnaps,
        extractMediaPath: session.mediaPath || mediaPath,
        extractTimeoutMs: Number(options.extractTimeoutMs)
            || session.extractTimeoutMs
            || EXTRACT_TIMEOUT_MS,
        wavReader: session.wavReader || options.wavReader || null,
        waveformSession: session,
        deadline,
        pcmByIndex: options.pcmByIndex instanceof Map ? options.pcmByIndex : new Map(),
        // Direct WAV slices are cheap — yield less often to keep the phase snappy.
        yieldEvery: session.sliceDirect ? 8 : 1,
    };

    try {
        const scanned = await scanWaveformTimingSuspects(cues, extractOpts);
        if (scanned.skipped) {
            return {
                ...scanned,
                rankedIndexes: scanned.rankedIndexes || [],
                usedLaya: false,
                cues,
                snapChanged: 0,
                snaps: [],
                waveformSession: session,
            };
        }

        let rankedIndexes = scanned.rankedIndexes || [];
        let usedLaya = false;
        let layaReason;
        let scoreCount;
        if (scanned.suspects?.length && !budgetExceeded(deadline) && !options.signal?.aborted) {
            const ranked = await rankWaveformSuspectsWithLaya(scanned.suspects, options);
            rankedIndexes = ranked.rankedIndexes?.length
                ? ranked.rankedIndexes
                : scanned.rankedIndexes;
            usedLaya = !!ranked.usedLaya;
            layaReason = ranked.reason;
            scoreCount = ranked.scoreCount;
        }

        // Edge snap: reuse scan PCM — avoid a second ffmpeg pass per cue.
        let workingCues = Array.isArray(cues) ? cues.slice() : [];
        let snaps = [];
        let snapChanged = 0;
        let snapExtractCalls = 0;
        let budgetAbortSnap = false;
        if (options.waveformEdgeSnap !== false && scanned.analyses?.length) {
            const byIdxAnalysis = new Map(scanned.analyses.map((a) => [Number(a.index), a]));
            const pcmByIndex = scanned.pcmByIndex instanceof Map ? scanned.pcmByIndex : new Map();
            const snapEligible = scanned.analyses
                .filter((a) => a && a.label !== 'ok'
                    && (a.reasons || []).some((r) => /spill|valley|too_short|body_quiet/.test(r)))
                .sort((a, b) => {
                    const spill = (x) => (Number(x.spillStart) || 0) + (Number(x.spillEnd) || 0);
                    return spill(b) - spill(a)
                        || (Number(b.severity) || 0) - (Number(a.severity) || 0)
                        || (Number(a.index) || 0) - (Number(b.index) || 0);
                })
                .map((a) => Number(a.index))
                .filter((n) => Number.isInteger(n) && n >= 0);
            const snapCap = Math.max(8, Number(options.maxEdgeSnaps) || budgets.maxEdgeSnaps);
            const snapTargets = snapEligible.slice(0, snapCap);

            const proposed = [];
            let snapConsecutiveFail = 0;
            for (const idx of snapTargets) {
                if (options.signal?.aborted) break;
                if (budgetExceeded(deadline)) {
                    budgetAbortSnap = true;
                    break;
                }
                const cue = { ...workingCues[idx], index: idx };
                if (!cue) continue;
                const prev = idx > 0 ? workingCues[idx - 1] : null;
                const next = idx < workingCues.length - 1 ? workingCues[idx + 1] : null;
                if ((proposed.length % Math.max(1, Number(extractOpts.yieldEvery) || 1)) === 0) {
                    await yieldEventLoop();
                }

                let pcm = pcmByIndex.get(idx) || null;
                if (!pcm) {
                    snapExtractCalls += 1;
                    const extracted = await extractPcmWindow(
                        extractOpts.extractMediaPath,
                        cue.startMs,
                        core.cueEndMs(cue),
                        extractOpts,
                    );
                    if (!extracted.ok) {
                        snapConsecutiveFail += 1;
                        if (snapConsecutiveFail >= MAX_CONSECUTIVE_EXTRACT_FAILS) break;
                        continue;
                    }
                    snapConsecutiveFail = 0;
                    pcm = {
                        pcm: extracted.pcm,
                        sampleRate: extracted.sampleRate,
                        preMs: extracted.preMs,
                        postMs: extracted.postMs,
                    };
                    pcmByIndex.set(idx, pcm);
                }

                const snap = core.proposeEdgeSnap(cue, pcm.pcm, {
                    analysis: byIdxAnalysis.get(Number(idx)),
                    sampleRate: pcm.sampleRate,
                    preMs: pcm.preMs,
                    postMs: pcm.postMs,
                    prevLimitMs: prev ? core.cueEndMs(prev) + 1 : undefined,
                    nextLimitMs: next ? Number(next.startMs) - 1 : undefined,
                });
                if (snap.changed) proposed.push(snap);
            }
            const beforeSnap = workingCues;
            const applied = core.applyEdgeSnapsToCues(workingCues, proposed, { gapMs: 1 });
            if (snapsLookCatastrophic(beforeSnap, applied.cues, applied.changed)) {
                options.onProgress?.({
                    phase: 'waveform-timing',
                    message: '波形边沿吸附已撤销（时间轴异常）',
                    pct: 42,
                });
                workingCues = beforeSnap;
                snapChanged = 0;
                snaps = [];
                scanned.stats = {
                    ...(scanned.stats || {}),
                    snapRejected: true,
                    snapRejectReason: 'catastrophic_timeline',
                };
            } else {
                workingCues = applied.cues;
                snapChanged = applied.changed;
                snaps = proposed;
                if (snapChanged > 0) {
                    options.onProgress?.({
                        phase: 'waveform-timing',
                        message: `波形边沿吸附 ${snapChanged} 条`,
                        pct: 42,
                        snapChanged,
                    });
                }
            }
            try {
                if (String(process.env.TRANSUB_WAVE_DEBUG || '').trim()) {
                    const dbg = path.join(__dirname, '..', 'tmp', `wave-snap-debug-${Date.now()}.json`);
                    fs.writeFileSync(dbg, `${JSON.stringify({
                        cueCount: workingCues.length,
                        analyzed: scanned.analyses?.length || 0,
                        snapEligible: snapEligible.length,
                        snapTargets: snapTargets.length,
                        snapProposed: proposed.length,
                        snapChanged,
                        snapExtractCalls,
                        isProxy: !!session.isProxy,
                        demuxFailed: session.demuxFailed || null,
                        edgeSnapEnabled: options.waveformEdgeSnap !== false,
                        mediaPath: String(options.mediaPath || options.videoPath || '').slice(0, 120),
                        sample: proposed.slice(0, 8).map((s) => ({
                            index: s.index,
                            changed: s.changed,
                            reason: s.reason,
                            startDelta: s.startDelta,
                            endDelta: s.endDelta,
                        })),
                    }, null, 2)}\n`);
                }
            } catch { /* debug only */ }

            scanned.stats = {
                ...(scanned.stats || {}),
                snapExtractCalls,
                budgetAbortSnap,
                usedProxy: !!session.isProxy,
                fromTimingCache: !!session.fromTimingCache,
                sliceDirect: !!session.sliceDirect,
                demuxFailed: session.demuxFailed || undefined,
            };
        }

        return {
            ...scanned,
            rankedIndexes,
            usedLaya,
            layaReason,
            scoreCount,
            cues: workingCues,
            snapChanged,
            snaps,
            waveformSession: session,
            budgetExhausted: !!(scanned.stats?.budgetAbort || budgetAbortSnap),
            stats: {
                ...(scanned.stats || {}),
                snapChanged,
                snapProposed: snaps.length,
                snapExtractCalls,
                budgetAbortSnap,
                usedProxy: !!session.isProxy,
                fromTimingCache: !!session.fromTimingCache,
                sliceDirect: !!session.sliceDirect,
                demuxFailed: session.demuxFailed || undefined,
                phaseBudgetMs: budgets.budgetMs,
            },
        };
    } finally {
        if (ownedSession) {
            try { await session.cleanup?.(); } catch { /* ignore */ }
        }
    }
}

/**
 * Re-rank planned silence-split points using mid-cue energy valleys (optional boost).
 * Soft-fails to original points.
 */
async function rerankSilenceSplitPointsWithValley(cue, pointsMs, options = {}) {
    const list = Array.isArray(pointsMs) ? pointsMs : [];
    if (list.length <= 1) return list;
    const mediaPath = String(options.mediaPath || options.videoPath || '').trim();
    if (!mediaPath) return list;
    try {
        // Single-window valley rank: do not pay for a full-film demux.
        const pcm = await extractPcmWindow(mediaPath, cue.startMs, core.cueEndMs(cue), {
            ...options,
            extractMediaPath: options.extractMediaPath || options.waveformAudioPath || mediaPath,
            waveformSkipProxy: true,
        });
        if (!pcm.ok) return list;
        const ranked = core.rankSplitPointsByValley(list, cue, pcm.pcm, {
            sampleRate: pcm.sampleRate,
            preMs: pcm.preMs,
            postMs: pcm.postMs,
            minValleyDepth: Number(options.minValleyDepth) || 0.25,
        });
        return ranked.length ? ranked : list;
    } catch {
        return list;
    }
}

function summarizeWaveformTiming(stats = {}, extra = {}) {
    if (extra.skipped) {
        if (extra.reason === 'no_media') return '已跳过波形计时（无媒体）';
        if (extra.reason === 'disabled') return '已跳过波形计时';
        return `已跳过波形计时（${extra.reason || 'skip'}）`;
    }
    const soft = Number(stats.soft) || 0;
    const hard = Number(stats.hard) || 0;
    const analyzed = Number(stats.analyzed) || 0;
    const snapChanged = Number(stats.snapChanged) || Number(extra.snapChanged) || 0;
    if (!analyzed && !snapChanged) return '波形计时：无候选';
    const parts = [];
    if (analyzed) parts.push(`波形计时扫描 ${analyzed} 条`);
    if (hard) parts.push(`强可疑 ${hard}`);
    if (soft) parts.push(`弱可疑 ${soft}`);
    if (snapChanged) parts.push(`边沿吸附 ${snapChanged}`);
    if (extra.usedLaya) parts.push('Laya Score 分流');
    if (stats.fromTimingCache) parts.push('复用引擎PCM');
    else if (stats.usedProxy) parts.push('音轨代理');
    if (stats.sliceDirect || Number(stats.sliceDirectHits) > 0) parts.push('内存切片');
    if (stats.budgetAbort || stats.budgetAbortSnap || extra.budgetExhausted) {
        parts.push('预算截断');
    }
    return parts.join(' · ') || '波形计时完成';
}

module.exports = {
    EXTRACT_TIMEOUT_MS,
    EXTRACT_TIMEOUT_PROXY_MS,
    PROXY_DEMUX_TIMEOUT_MS,
    DEFAULT_PHASE_BUDGET_MS,
    DEFAULT_MAX_CANDIDATES,
    DEFAULT_MAX_EDGE_SNAPS,
    MAX_CONSECUTIVE_EXTRACT_FAILS,
    extractPcmWindow,
    demuxAudioProxy,
    pcmInt16FromBytes,
    parsePcmWavHeader,
    openWavPcmReader,
    attachWavReader,
    resolveTimingAudioSidecar,
    cleanupTimingAudioSidecar,
    snapsLookCatastrophic,
    prepareWaveformExtractSession,
    resolveWaveformBudgets,
    scanWaveformTimingSuspects,
    rankWaveformSuspectsWithLaya,
    runQcWaveformTimingPhase,
    rerankSilenceSplitPointsWithValley,
    summarizeWaveformTiming,
    core,
};
