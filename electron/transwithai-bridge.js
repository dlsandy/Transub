const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { dialog, BrowserWindow, shell } = require('electron');
const { resolveSafePath, asString, assertSafeExternalUrl } = require('./ipc-validate');
const { resolveLocalSubtitlePath, resolveLocalSubtitleBatch } = require('./subtitle-utils');
const { loadSettings, saveSettings } = require('./settings-data');
const { parseSubtitle } = require('./subtitle-format');

const DEFAULT_INSTALL_PATH = 'F:\\UltraTools\\TransWithAI';
const TRANWITHAI_RELEASES_URL = 'https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases';
const AUDIO_SUFFIXES = 'mp3,wav,flac,m4a,aac,ogg,wma,mp4,mkv,avi,mov,webm,flv,wmv';
const VALID_DEVICES = new Set(['cuda', 'cpu', 'cuda_low_vram', 'cuda_batch', 'amd', 'modal']);
const VALID_LOG_LEVELS = new Set(['DEBUG', 'INFO', 'WARNING', 'ERROR']);
const VALID_LANGUAGES = new Set(['auto', 'ja', 'zh', 'en']);
const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'webm', 'm4v', 'ts', 'mpeg', 'mpg', 'rmvb', 'rm', '3gp'];

/** @type {string[]} */
let pendingFilesForWindow = [];

let json5Parser = null;
function getJson5Parser() {
    if (json5Parser !== null) return json5Parser;
    json5Parser = require('json5');
    return json5Parser;
}

let jobRunning = false;
let jobCancelled = false;
/** @type {import('child_process').ChildProcess | null} */
let activeProc = null;

/** @type {null | {
 *   items: Array<{path:string,duration:number,status:string}>,
 *   rate: number|null,
 *   device: string,
 *   task: string,
 *   trayProgressEnabled: boolean,
 * }} */
let activeBatchTrayCtx = null;

function killActiveProc() {
    if (!activeProc) return;
    const proc = activeProc;
    activeProc = null;
    const pid = proc.pid;
    try {
        if (process.platform === 'win32' && pid) {
            const { execFile } = require('child_process');
            execFile('taskkill', ['/pid', String(pid), '/T', '/F'], {
                windowsHide: true,
                timeout: 8000,
            }, () => { /* ignore */ });
            return;
        }
        proc.kill();
    } catch (_) { /* ignore */ }
}

function stopSubtitleJobs() {
    jobCancelled = true;
    killActiveProc();
}

function isSubtitleJobRunning() {
    return jobRunning;
}

function normalizeInstallPath(input) {
    const raw = String(input || '').trim() || DEFAULT_INSTALL_PATH;
    return path.resolve(raw);
}

function getInferExePath(installPath, device) {
    const name = device === 'modal' ? 'modal_infer.exe' : 'infer.exe';
    return path.join(normalizeInstallPath(installPath), name);
}

const TRANSWITHAI_VERSION_RE = /程序版本[：:]\s*(v?\d+(?:\.\d+)+)/i;

function parseTransWithAiVersionText(text) {
    const matches = [...String(text || '').matchAll(/程序版本[：:]\s*(v?\d+(?:\.\d+)+)/gi)];
    if (matches.length) return matches[matches.length - 1][1];
    const single = String(text || '').match(TRANSWITHAI_VERSION_RE);
    return single ? single[1] : null;
}

function readTransWithAiVersionFromLog(installPath) {
    const logPath = path.join(normalizeInstallPath(installPath), 'latest.log');
    if (!fs.existsSync(logPath)) return null;
    try {
        const stat = fs.statSync(logPath);
        const readLen = Math.min(stat.size, 65536);
        const fd = fs.openSync(logPath, 'r');
        const buf = Buffer.alloc(readLen);
        fs.readSync(fd, buf, 0, readLen, Math.max(0, stat.size - readLen));
        fs.closeSync(fd);
        return parseTransWithAiVersionText(buf.toString('utf8'));
    } catch {
        return null;
    }
}

function probeTransWithAiVersionFromInfer(installPath, timeoutMs = 8000) {
    const inferExe = getInferExePath(installPath);
    return new Promise((resolve) => {
        let output = '';
        let settled = false;
        const finish = (version) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(version || null);
        };

        let proc;
        const timer = setTimeout(() => {
            try { proc?.kill(); } catch { /* ignore */ }
            finish(parseTransWithAiVersionText(output));
        }, timeoutMs);

        try {
            proc = spawn(inferExe, [], { windowsHide: true });
        } catch {
            finish(null);
            return;
        }

        const onData = (chunk) => { output += chunk.toString(); };
        proc.stdout?.on('data', onData);
        proc.stderr?.on('data', onData);
        proc.on('error', () => finish(null));
        proc.on('close', () => finish(parseTransWithAiVersionText(output)));
    });
}

async function detectTransWithAiVersion(installPath, options = {}) {
    const fromLog = readTransWithAiVersionFromLog(installPath);
    if (fromLog) return fromLog;
    // Spawning infer.exe can take several seconds — skip on cold-start / quick checks
    if (options.allowInferProbe === false) return null;
    return probeTransWithAiVersionFromInfer(installPath);
}

function validateInstall(installPath, device) {
    const resolved = normalizeInstallPath(installPath);
    const inferExe = getInferExePath(resolved, device);
    const label = device === 'modal' ? 'modal_infer.exe' : 'infer.exe';
    if (!fs.existsSync(inferExe)) {
        return {
            ok: false,
            path: resolved,
            error: `未找到TranWithAI`,
        };
    }
    return { ok: true, path: resolved, inferExe };
}

async function validateInstallWithVersion(installPath, options = {}) {
    const base = validateInstall(installPath);
    if (!base.ok) return base;
    const version = await detectTransWithAiVersion(base.path, {
        allowInferProbe: options.allowInferProbe !== false && !options.quick,
    });
    return { ...base, version: version || null, quick: !!options.quick };
}

const POST_TASK_OPTION_KEYS = new Set([
    'closeWindowOnComplete',
    'postTaskAction',
    'quitAppOnComplete',
    'shutdownOnComplete',
    'shutdownDelaySec',
    'openOutputFolderOnComplete',
    'sleepOnComplete',
    'playSoundOnComplete',
    'lastOutputDir',
]);

const DEFAULT_SESSION_POST_TASK = {
    closeWindowOnComplete: false,
    postTaskAction: 'none',
    quitAppOnComplete: false,
    shutdownOnComplete: false,
    shutdownDelaySec: 60,
    openOutputFolderOnComplete: false,
    sleepOnComplete: false,
    playSoundOnComplete: false,
    lastOutputDir: '',
};

/** @type {typeof DEFAULT_SESSION_POST_TASK} */
let sessionPostTaskOptions = { ...DEFAULT_SESSION_POST_TASK };

function stripPostTaskFields(options = {}) {
    const out = { ...options };
    POST_TASK_OPTION_KEYS.forEach((key) => { delete out[key]; });
    return out;
}

function getSessionPostTaskOptions() {
    return { ...sessionPostTaskOptions };
}

function setSessionPostTaskOptions(input = {}) {
    sessionPostTaskOptions = {
        ...DEFAULT_SESSION_POST_TASK,
        ...normalizePostTaskOptions({
            ...sessionPostTaskOptions,
            ...input,
        }),
    };
    return getSessionPostTaskOptions();
}

function resetSessionPostTaskOptions() {
    sessionPostTaskOptions = { ...DEFAULT_SESSION_POST_TASK };
}

function inferPostTaskAction(options = {}) {
    const action = String(options.postTaskAction || '').trim();
    if (['shutdown', 'quit', 'none', 'open_folder', 'sleep'].includes(action)) return action;
    if (options.sleepOnComplete) return 'sleep';
    if (options.openOutputFolderOnComplete) return 'open_folder';
    if (options.shutdownOnComplete) return 'shutdown';
    if (options.quitAppOnComplete) return 'quit';
    return 'none';
}

function normalizePostTaskOptions(options = {}) {
    const postTaskAction = inferPostTaskAction(options);
    return {
        postTaskAction,
        closeWindowOnComplete: !!options.closeWindowOnComplete,
        quitAppOnComplete: postTaskAction === 'quit' || postTaskAction === 'shutdown',
        shutdownOnComplete: postTaskAction === 'shutdown',
        shutdownDelaySec: Math.max(0, Math.min(600, Number(options.shutdownDelaySec) || 60)),
        openOutputFolderOnComplete: postTaskAction === 'open_folder' || !!options.openOutputFolderOnComplete,
        sleepOnComplete: postTaskAction === 'sleep' || !!options.sleepOnComplete,
        playSoundOnComplete: !!options.playSoundOnComplete,
        lastOutputDir: String(options.lastOutputDir || '').trim(),
    };
}

function mergeTransWithAiOptions(input = {}) {
    const merged = {
        installPath: DEFAULT_INSTALL_PATH,
        device: 'cuda',
        task: 'translate',
        overwrite: false,
        closeWindowOnComplete: false,
        postTaskAction: 'none',
        quitAppOnComplete: false,
        shutdownOnComplete: false,
        shutdownDelaySec: 60,
        subFormats: 'srt',
        modelPath: '',
        logLevel: 'DEBUG',
        mergeSegments: true,
        mergeMaxGapMs: 500,
        mergeMaxDurationMs: 10000,
        maxBatchSize: 8,
        beamSize: 5,
        language: 'auto',
        vadThreshold: 0.5,
        vadMinSpeechDurationMs: 300,
        vadMinSilenceDurationMs: 100,
        vadSpeechPadMs: 200,
        maxInitialTimestamp: 30,
        repetitionPenalty: 1.1,
        smartSplitWithVad: true,
        targetChunkDurationS: 30,
        retranscribeWarmLight: false,
        subtitleBakMode: 'off',
        trayProgressEnabled: false,
        minimizeToTrayOnStart: false,
        trayNotifyEnabled: false,
        postBatchQc: true,
        outputDir: '',
        outputMode: 'same',
        audioSuffixes: AUDIO_SUFFIXES,
        ffmpegPath: '',
        ...input,
    };
    return {
        ...merged,
        ...normalizePostTaskOptions(merged),
    };
}

function normalizeSubFormats(value) {
    const parts = String(value || '')
        .split(/[,;\s]+/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => ['srt', 'vtt', 'lrc'].includes(part));
    const unique = [...new Set(parts)];
    return unique.length ? unique.join(',') : 'srt';
}

function normalizeTransWithAiRuntimeOptions(options = {}) {
    const merged = mergeTransWithAiOptions(options);
    const language = String(merged.language || 'auto').trim().toLowerCase();
    return {
        installPath: normalizeInstallPath(merged.installPath),
        device: VALID_DEVICES.has(merged.device) ? merged.device : 'cuda',
        task: merged.task === 'transcribe' ? 'transcribe' : 'translate',
        overwrite: !!merged.overwrite,
        closeWindowOnComplete: !!merged.closeWindowOnComplete,
        subFormats: normalizeSubFormats(merged.subFormats),
        modelPath: String(merged.modelPath || '').trim(),
        logLevel: VALID_LOG_LEVELS.has(String(merged.logLevel || '').toUpperCase())
            ? String(merged.logLevel).toUpperCase()
            : 'DEBUG',
        mergeSegments: merged.mergeSegments !== false,
        mergeMaxGapMs: Math.max(0, Math.min(60000, Number(merged.mergeMaxGapMs) || 500)),
        mergeMaxDurationMs: Math.max(1000, Math.min(600000, Number(merged.mergeMaxDurationMs) || 10000)),
        maxBatchSize: Math.max(1, Math.min(32, Number(merged.maxBatchSize) || 8)),
        beamSize: Math.max(1, Math.min(20, Number(merged.beamSize) || 5)),
        language: VALID_LANGUAGES.has(language) ? language : 'auto',
        vadThreshold: Math.max(0.1, Math.min(0.9, Number(merged.vadThreshold) || 0.5)),
        vadMinSpeechDurationMs: Math.max(0, Math.min(5000, Number(merged.vadMinSpeechDurationMs) || 300)),
        vadMinSilenceDurationMs: Math.max(0, Math.min(5000, Number(merged.vadMinSilenceDurationMs) || 100)),
        vadSpeechPadMs: Math.max(0, Math.min(2000, Number(merged.vadSpeechPadMs) || 200)),
        maxInitialTimestamp: Math.max(0, Math.min(60, Number(merged.maxInitialTimestamp) || 30)),
        repetitionPenalty: Math.max(1, Math.min(2, Number(merged.repetitionPenalty) || 1.1)),
        smartSplitWithVad: merged.smartSplitWithVad !== false,
        targetChunkDurationS: Math.max(5, Math.min(30, Number(merged.targetChunkDurationS) || 30)),
        retranscribeWarmLight: !!merged.retranscribeWarmLight,
        subtitleBakMode: ['off', 'beside', 'appBackup'].includes(String(merged.subtitleBakMode || '').trim())
            ? String(merged.subtitleBakMode).trim()
            : 'off',
        trayProgressEnabled: !!merged.trayProgressEnabled,
        minimizeToTrayOnStart: !!merged.minimizeToTrayOnStart,
        trayNotifyEnabled: !!merged.trayNotifyEnabled,
        postBatchQc: merged.postBatchQc !== false,
        outputDir: String(merged.outputDir || '').trim(),
        outputMode: merged.outputMode === 'custom' ? 'custom' : 'same',
        audioSuffixes: normalizeAudioSuffixes(merged.audioSuffixes),
        ffmpegPath: String(merged.ffmpegPath || '').trim(),
        ...normalizePostTaskOptions(merged),
    };
}

function normalizeAudioSuffixes(value) {
    const parts = String(value || AUDIO_SUFFIXES)
        .split(/[,;\s]+/)
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
    return parts.length ? [...new Set(parts)].join(',') : AUDIO_SUFFIXES;
}

function buildTransWithAiOptionsFromPayload(payload = {}, current = {}) {
    return normalizeTransWithAiRuntimeOptions({ ...current, ...payload });
}

function resolveGenerationConfigPath(installPath, options = {}, getUserDataPath) {
    const basePath = path.join(normalizeInstallPath(installPath), 'generation_config.json5');
    const normalized = normalizeTransWithAiRuntimeOptions(options);
    const JSON5 = getJson5Parser();
    if (!JSON5 || !getUserDataPath) return basePath;

    let base = {};
    if (fs.existsSync(basePath)) {
        try {
            base = JSON5.parse(fs.readFileSync(basePath, 'utf8')) || {};
        } catch {
            base = {};
        }
    }

    const merged = { ...base };
    merged.task = normalized.task;
    if (normalized.language && normalized.language !== 'auto') {
        merged.language = normalized.language;
    } else {
        delete merged.language;
    }
    if (normalized.beamSize) merged.beam_size = normalized.beamSize;
    merged.vad_parameters = {
        ...(base.vad_parameters || {}),
        threshold: normalized.vadThreshold,
        min_speech_duration_ms: normalized.vadMinSpeechDurationMs,
        min_silence_duration_ms: normalized.vadMinSilenceDurationMs,
        speech_pad_ms: normalized.vadSpeechPadMs,
    };
    merged.max_initial_timestamp = normalized.maxInitialTimestamp;
    merged.repetition_penalty = normalized.repetitionPenalty;
    merged.smart_split_with_vad = normalized.smartSplitWithVad;
    merged.target_chunk_duration_s = normalized.targetChunkDurationS;
    merged.segment_merge = {
        ...(base.segment_merge || {}),
        enabled: normalized.mergeSegments,
        max_gap_ms: normalized.mergeMaxGapMs,
        max_duration_ms: normalized.mergeMaxDurationMs,
    };

    const cacheDir = path.join(getUserDataPath(), 'transwithai-config');
    fs.mkdirSync(cacheDir, { recursive: true });
    const outPath = path.join(cacheDir, 'generation_config.effective.json5');
    fs.writeFileSync(outPath, JSON5.stringify(merged, null, 2), 'utf8');
    return outPath;
}

function buildDeviceArgs(options = {}) {
    const merged = normalizeTransWithAiRuntimeOptions(options);
    const subFormats = merged.subFormats;
    const args = [];
    if (merged.device === 'cpu') {
        args.push('--device=cpu');
    } else if (merged.device === 'amd') {
        args.push('--device=amd');
    } else if (merged.device === 'modal') {
        args.push('--device=modal');
    } else {
        args.push('--device=cuda');
        if (merged.device === 'cuda_low_vram') {
            args.push('--compute_type=int8_float16');
        }
        if (merged.device === 'cuda_batch') {
            args.push('--enable_batching');
            args.push(`--max_batch_size=${merged.maxBatchSize}`);
        }
    }
    args.push(`--sub_formats=${subFormats}`);
    return args;
}

async function saveTransWithAiOptions(getAppRoot, patch) {
    const current = loadSettings(getAppRoot).options || {};
    const next = stripPostTaskFields({ ...current, ...patch });
    saveSettings(getAppRoot, next);
    syncTrayNotifyFromOptions(next);
}

function syncTrayNotifyFromOptions(options = {}) {
    try {
        const { setTrayNotifyEnabled } = require('./notifications');
        setTrayNotifyEnabled(!!options.trayNotifyEnabled);
    } catch { /* ignore */ }
}

function runPostSubtitleTaskActions(_options, result, windowManager) {
    if (result?.cancelled || jobCancelled) return;

    const merged = mergeTransWithAiOptions(getSessionPostTaskOptions());
    const hasFailure = (Number(result?.failed) || 0) > 0;

    if (merged.playSoundOnComplete && !hasFailure) {
        try {
            const { playCompletionSound } = require('./system-actions');
            playCompletionSound();
        } catch { /* ignore */ }
    }

    if (merged.openOutputFolderOnComplete && !hasFailure && merged.lastOutputDir) {
        try {
            const { openPathInShell } = require('./system-actions');
            openPathInShell(merged.lastOutputDir);
        } catch (err) {
            console.warn('[transwithai] 打开输出目录失败:', err.message || err);
        }
    }

    if (merged.closeWindowOnComplete && !hasFailure && windowManager?.closeMainWindow) {
        setTimeout(() => {
            try {
                windowManager.closeMainWindow();
            } catch (err) {
                console.warn('[transwithai] 关闭任务窗口失败:', err.message || err);
            }
        }, 2000);
    }

    const quit = !!merged.quitAppOnComplete;
    const shutdown = !!merged.shutdownOnComplete;
    const sleep = !!merged.sleepOnComplete;

    if (sleep && !hasFailure) {
        try {
            const { scheduleSystemSleep } = require('./system-actions');
            scheduleSystemSleep();
        } catch (err) {
            console.warn('[transwithai] 睡眠失败:', err.message || err);
        }
    }

    if (!quit && !shutdown) {
        if (!sleep) return;
        setTimeout(() => {
            try { windowManager?.quitApp?.(); } catch { /* ignore */ }
        }, sleep ? 1200 : 0);
        return;
    }
    if (hasFailure) return;
    if (result?.ok === false && !(Number(result?.skipped) > 0)) return;

    if (shutdown) {
        try {
            const { scheduleSystemShutdown } = require('./system-shutdown');
            const delaySec = merged.shutdownDelaySec;
            const res = scheduleSystemShutdown(
                delaySec,
                delaySec > 0
                    ? `字幕任务已完成，${delaySec} 秒后将关机`
                    : '字幕任务已完成，即将关机',
            );
            if (!res.ok) {
                console.warn('[transwithai] 安排关机失败:', res.error);
            }
        } catch (err) {
            console.warn('[transwithai] 安排关机失败:', err.message || err);
        }
    }

    if (quit || shutdown) {
        setTimeout(() => {
            try {
                windowManager?.quitApp?.();
            } catch (err) {
                console.warn('[transwithai] 退出应用失败:', err.message || err);
            }
        }, shutdown ? 800 : 300);
    }
}

function resolveInferOutputDir(resolvedVideo, options = {}) {
    const merged = normalizeTransWithAiRuntimeOptions(options);
    const videoDir = path.dirname(path.resolve(resolvedVideo));
    if (merged.outputMode === 'custom') {
        const custom = String(merged.outputDir || '').trim();
        if (custom) return path.resolve(custom);
    }
    return videoDir;
}

async function resolveSubtitlePathAfterWrite(resolvedVideo, outputDir, subFormats) {
    const dir = path.resolve(String(outputDir || path.dirname(resolvedVideo)));
    const formats = String(subFormats || 'srt').split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const stem = path.basename(resolvedVideo, path.extname(resolvedVideo));

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const found = resolveLocalSubtitlePath(resolvedVideo, dir);
        if (found) return found;
        for (const fmt of formats) {
            const direct = path.join(dir, `${stem}.${fmt}`);
            if (fs.existsSync(direct)) return direct;
        }
        if (attempt < 7) {
            await new Promise((resolve) => { setTimeout(resolve, 200); });
        }
    }
    return resolveLocalSubtitlePath(resolvedVideo, dir);
}

function buildInferArgs(installPath, videoPath, options = {}) {
    const merged = normalizeTransWithAiRuntimeOptions(options);
    const generationConfig = merged.generationConfigPath
        || path.join(normalizeInstallPath(installPath), 'generation_config.json5');
    const resolvedVideo = path.resolve(String(videoPath || ''));
    const outputDir = resolveInferOutputDir(resolvedVideo, merged);

    const args = [
        `--audio_suffixes=${merged.audioSuffixes || AUDIO_SUFFIXES}`,
        `--generation_config=${generationConfig}`,
        // 传入 infer 的 --log_level；DEBUG 可输出每句时间轴，便于 Transub 解析进度
        `--log_level=${merged.logLevel}`,
        `--task=${merged.task === 'transcribe' ? 'transcribe' : 'translate'}`,
        ...buildDeviceArgs(merged),
    ];

    if (merged.modelPath) {
        args.push(`--model_name_or_path=${merged.modelPath}`);
    }

    if (merged.mergeSegments) {
        args.push('--merge_segments');
        args.push(`--merge_max_gap_ms=${merged.mergeMaxGapMs}`);
        args.push(`--merge_max_duration_ms=${merged.mergeMaxDurationMs}`);
    } else {
        args.push('--no_merge_segments');
    }

    if (merged.overwrite) {
        args.push('--overwrite');
    }

    args.push(`--output_dir=${path.resolve(outputDir)}`);
    args.push(resolvedVideo);
    return args;
}

function parseChineseDurationSeconds(text) {
    const src = String(text || '');
    let sec = 0;
    const h = src.match(/(\d+)小时/);
    const m = src.match(/(\d+)分/);
    const s = src.match(/([\d.]+)秒/);
    if (h) sec += Number(h[1]) * 3600;
    if (m) sec += Number(m[1]) * 60;
    if (s) sec += Number(s[1]);
    return sec;
}

/** 将秒数格式化为 m:ss 或 h:mm:ss（用于视频时间轴） */
function formatMediaTime(totalSec) {
    const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}

/** 解析 infer 日志中的 MM:SS.ss 时间戳（分钟可超过 59） */
function parseInferTimestampMinutesSeconds(minStr, secStr) {
    return Number(minStr) * 60 + Number(secStr);
}

/** LRC 时间戳 MM:SS.cc（centiseconds）→ 秒 */
function parseLrcTimestampSeconds(minStr, secStr) {
    const min = Number(minStr) || 0;
    const secParts = String(secStr || '0').split('.');
    const sec = Number(secParts[0]) || 0;
    const cs = Number(secParts[1]) || 0;
    return min * 60 + sec + cs / 100;
}

/** 将 infer 各阶段局部进度映射为整条流水线 0–100%（转写前保持 0%，转写阶段 0–98%） */
function mapInferStageProgress(stage, rawPct = 0, videoCurrentSec = 0, videoTotalSec = 0) {
    const local = Math.max(0, Math.min(100, Number(rawPct) || 0));
    const mediaSec = Number(videoTotalSec) || 0;
    const currentSec = Number(videoCurrentSec) || 0;

    switch (stage) {
        case 'starting':
        case 'vad':
        case 'model':
            return 0;
        case 'transcribe': {
            const timelinePct = mediaSec >= 60
                ? Math.min(100, Math.round((currentSec / mediaSec) * 100))
                : local;
            return Math.min(98, Math.round((timelinePct / 100) * 98));
        }
        case 'save':
            return 99;
        case 'done':
            return 100;
        default:
            return inferStageRank(stage) >= INFER_STAGE_RANK.transcribe
                ? Math.min(98, local)
                : 0;
    }
}

/** 转写阶段墙钟时间约为片长的倍数（GPU 翻译经验值） */
const TRANSCRIBE_WALL_FACTOR = 0.35;
const SYNTHETIC_PROGRESS_INTERVAL_MS = 3000;

const INFER_STAGE_RANK = {
    starting: 0,
    vad: 1,
    model: 2,
    transcribe: 3,
    save: 4,
    done: 5,
};

function inferStageRank(stage) {
    return INFER_STAGE_RANK[stage] ?? 0;
}

function buildSyntheticTranscribeUpdate(mediaDurationSec, transcribeStartedAt, parseState = {}) {
    if (!mediaDurationSec || !transcribeStartedAt) return null;
    const elapsed = Math.max(0, (Date.now() - transcribeStartedAt) / 1000);
    const expectedWall = Math.max(45, mediaDurationSec * TRANSCRIBE_WALL_FACTOR);
    const ratio = Math.min(0.98, elapsed / expectedWall);
    const videoCurrentSec = Math.round(mediaDurationSec * ratio);
    const videoProgress = Math.min(98, Math.round(ratio * 100));
    const totalSec = parseState.mediaTotalSec || mediaDurationSec;
    return {
        stage: 'transcribe',
        videoProgress,
        videoCurrentSec,
        videoTotalSec: totalSec,
        detail: `转写 ${formatMediaTime(videoCurrentSec)} / ${formatMediaTime(totalSec)}`,
    };
}

function mapPipelinePercent(stage, rawPct, videoCurrentSec, videoTotalSec) {
    return mapInferStageProgress(stage, rawPct, videoCurrentSec, videoTotalSec);
}

function parseInferProgressLine(line, parseState = {}) {
    const text = String(line || '').trim();
    if (!text) return null;

    if (/正在初始化增强VAD/.test(text)) {
        return { stage: 'vad', videoProgress: 0, detail: '初始化 VAD…' };
    }
    if (/增强VAD已激活/.test(text)) {
        return { stage: 'vad', videoProgress: 0, detail: 'VAD 就绪' };
    }

    const vadProgressMatch = text.match(/VAD进度：\s*(\d+)\s*\/\s*(\d+)\s*块（([\d.]+)%）/);
    if (vadProgressMatch) {
        const current = Number(vadProgressMatch[1]) || 0;
        const total = Number(vadProgressMatch[2]) || 0;
        const pct = Math.max(0, Math.min(100, Math.round(Number(vadProgressMatch[3]) || 0)));
        const detail = total > 0 ? `VAD 分析 ${current}/${total} 块 · ${pct}%` : `VAD 分析 · ${pct}%`;
        // VAD 块进度仅用于详情文案，不写入 videoProgress / 时间轴，避免计入任务百分比
        return {
            stage: 'vad',
            videoProgress: 0,
            detail,
        };
    }

    if (/正在加载Whisper模型/.test(text)) {
        return { stage: 'model', videoProgress: 0, detail: '加载 Whisper 模型…' };
    }
    if (/模型运行精度/.test(text)) {
        return { stage: 'model', videoProgress: 0, detail: '模型已加载' };
    }

    const processingMatch = text.match(/正在处理（[^，]+，\s*(\d+)\s*\/\s*(\d+)）/);
    if (processingMatch) {
        const current = Number(processingMatch[1]) || 0;
        const total = Number(processingMatch[2]) || 0;
        return {
            stage: 'transcribe',
            videoProgress: 0,
            videoCurrentSec: current,
            videoTotalSec: total,
            detail: total > 0 ? `转写 / 翻译中（${current}/${total}）…` : '转写 / 翻译中…',
        };
    }
    if (/正在处理（/.test(text)) {
        return { stage: 'transcribe', videoProgress: 0, detail: '转写 / 翻译中…' };
    }

    const durationMatch = text.match(/时长：\s*(.+?)\s*→\s*(.+?)(?:（|$)/);
    if (durationMatch) {
        const mediaTotalSec = parseChineseDurationSeconds(durationMatch[1].trim());
        const speechTotalSec = parseChineseDurationSeconds(durationMatch[2].trim());
        if (mediaTotalSec > 0) {
            parseState.mediaTotalSec = mediaTotalSec;
        }
        if (speechTotalSec > 0) {
            parseState.speechTotalSec = speechTotalSec;
        }
        if (mediaTotalSec > 0) {
            const detail = speechTotalSec > 0
                ? `视频 ${formatMediaTime(mediaTotalSec)} · 有效语音 ${formatMediaTime(speechTotalSec)}`
                : `视频时长 ${formatMediaTime(mediaTotalSec)}`;
            return {
                videoProgress: 0,
                videoCurrentSec: 0,
                videoTotalSec: mediaTotalSec,
                detail,
                mediaTotalSec,
                speechTotalSec,
            };
        }
    }

    const simpleDurationMatch = text.match(/^时长：\s*(.+)$/);
    if (simpleDurationMatch && !text.includes('→')) {
        const mediaTotalSec = parseChineseDurationSeconds(simpleDurationMatch[1].trim());
        if (mediaTotalSec > 0) {
            parseState.mediaTotalSec = mediaTotalSec;
            parseState.speechTotalSec = mediaTotalSec;
            return {
                videoProgress: 0,
                videoCurrentSec: 0,
                videoTotalSec: mediaTotalSec,
                detail: `视频时长 ${formatMediaTime(mediaTotalSec)}`,
                mediaTotalSec,
                speechTotalSec: mediaTotalSec,
            };
        }
    }

    const segMatch = text.match(/\[\d+:\d+(?:\.\d+)?\s*-->\s*(\d+):([\d.]+)\]/);
    const timelineTotalSec = parseState.mediaTotalSec || parseState.speechTotalSec;
    if (segMatch && timelineTotalSec > 0) {
        const endSec = parseLrcTimestampSeconds(segMatch[1], segMatch[2]);
        const ratio = Math.min(1, endSec / timelineTotalSec);
        const videoProgress = Math.min(100, Math.round(ratio * 100));
        const detail = `转写 ${formatMediaTime(endSec)} / ${formatMediaTime(timelineTotalSec)}`;
        return {
            stage: 'transcribe',
            videoProgress,
            videoCurrentSec: endSec,
            videoTotalSec: timelineTotalSec,
            detail,
        };
    }

    if (
        /正在写入：/.test(text)
        || /(?:^|\s)已保存(?:\s|$|[：:])/.test(text)
        || /\bsaved\b/i.test(text)
        || /完成处理/.test(text)
    ) {
        const total = parseState.mediaTotalSec || parseState.speechTotalSec || 0;
        return {
            stage: 'save',
            videoProgress: total > 0 ? 99 : 0,
            videoCurrentSec: total,
            videoTotalSec: total,
            detail: '保存字幕…',
        };
    }

    return null;
}

function runInferOnce(installPath, videoPath, options = {}, onProgress, onInferLog) {
    const check = validateInstall(installPath, options.device);
    if (!check.ok) {
        return Promise.reject(new Error(check.error));
    }

    const resolvedVideo = path.resolve(String(videoPath || ''));
    if (!fs.existsSync(resolvedVideo)) {
        return Promise.reject(new Error('视频文件不存在'));
    }

    const args = buildInferArgs(check.path, resolvedVideo, options);
    const outputDir = resolveInferOutputDir(resolvedVideo, options);
    const durationHint = Number(options.durationHint) || 0;

    return Promise.resolve().then(async () => {
        let mediaDurationSec = durationHint;
        if (!mediaDurationSec) {
            try {
                const { probeVideo, resolveFfmpegValidation } = require('./ffmpeg-bridge');
                const validation = resolveFfmpegValidation(options.ffmpegPath);
                if (validation.ok) {
                    const probe = await probeVideo(resolvedVideo, validation.path);
                    mediaDurationSec = Number(probe.duration) || 0;
                }
            } catch {
                /* ffprobe 不可用时仅靠日志进度 */
            }
        }
        return { mediaDurationSec };
    }).then(({ mediaDurationSec }) => new Promise((resolve, reject) => {
        const proc = spawn(check.inferExe, args, {
            cwd: check.path,
            windowsHide: true,
            env: buildInferSpawnEnv(),
        });
        activeProc = proc;

        let stderr = '';
        const STDERR_MAX = 32 * 1024;
        const parseState = {};
        if (mediaDurationSec > 0) {
            parseState.mediaTotalSec = mediaDurationSec;
            parseState.speechTotalSec = mediaDurationSec;
        }
        let lastEmit = { stage: 'starting', videoProgress: -1, detail: '' };
        let lineBuffer = '';
        let transcribeStartedAt = 0;
        let currentStage = 'starting';
        let lastPipelinePct = 0;

        const markTranscribeStarted = () => {
            if (!transcribeStartedAt) transcribeStartedAt = Date.now();
        };

        const pushProgress = (update, { force = false } = {}) => {
            if (!update || typeof onProgress !== 'function') return;

            // 丢弃过期阶段（例如转写已开始后迟到的 VAD 行），避免把 VAD 块进度算进百分比
            if (
                update.stage
                && inferStageRank(update.stage) < inferStageRank(currentStage)
            ) {
                return;
            }

            if (update.stage && inferStageRank(update.stage) >= inferStageRank(currentStage)) {
                currentStage = update.stage;
            }
            const stage = currentStage;
            const preTranscribe = inferStageRank(stage) < INFER_STAGE_RANK.transcribe;

            if (update.stage === 'transcribe') markTranscribeStarted();

            if (transcribeStartedAt && preTranscribe) {
                return;
            }

            // 转写前阶段不使用时间轴字段参与百分比；详情仍可展示 VAD/模型文案
            const rawPct = preTranscribe ? 0 : (update.videoProgress ?? 0);
            const currentSec = preTranscribe ? 0 : (update.videoCurrentSec ?? 0);
            const totalSec = preTranscribe ? 0 : (update.videoTotalSec ?? 0);

            let pipelinePct = mapPipelinePercent(stage, rawPct, currentSec, totalSec);

            if (stage === 'done') {
                pipelinePct = 100;
            } else if (preTranscribe) {
                pipelinePct = 0;
            } else {
                pipelinePct = Math.max(lastPipelinePct, pipelinePct);
            }

            const detailChanged = update.detail !== lastEmit.detail;
            const progressChanged = pipelinePct > lastPipelinePct;
            if (!force && !progressChanged && !detailChanged) return;

            lastEmit = { ...update, stage };
            lastPipelinePct = pipelinePct;
            onProgress({
                ...update,
                stage,
                videoProgress: rawPct,
                videoCurrentSec: currentSec,
                videoTotalSec: totalSec,
                pipelineProgress: pipelinePct,
            });
        };

        const emitParsedLine = (rawLine) => {
            const update = parseInferProgressLine(rawLine, parseState);
            if (!update) return;
            if (/正在处理（/.test(String(rawLine || ''))) markTranscribeStarted();
            pushProgress(update);
        };

        const syntheticTimer = setInterval(() => {
            if (jobCancelled || !transcribeStartedAt) return;
            if (inferStageRank(currentStage) >= INFER_STAGE_RANK.save) return;
            const dur = parseState.mediaTotalSec || mediaDurationSec;
            if (!dur) return;
            const synthetic = buildSyntheticTranscribeUpdate(dur, transcribeStartedAt, parseState);
            if (!synthetic) return;
            pushProgress(synthetic);
        }, SYNTHETIC_PROGRESS_INTERVAL_MS);

        const handleStream = (chunk) => {
            const text = String(chunk || '');
            stderr = (stderr + text).slice(-STDERR_MAX);

            lineBuffer += text;
            const parts = lineBuffer.split(/\r\n|\n|\r/);
            lineBuffer = parts.pop() || '';
            for (const part of parts) {
                if (part.trim()) onInferLog?.(part);
                emitParsedLine(part);
            }
        };

        proc.stdout?.on('data', handleStream);
        proc.stderr?.on('data', handleStream);
        proc.on('error', (err) => {
            clearInterval(syntheticTimer);
            activeProc = null;
            reject(err);
        });
        proc.on('close', (code) => {
            clearInterval(syntheticTimer);
            activeProc = null;
            if (lineBuffer.trim()) {
                emitParsedLine(lineBuffer);
                lineBuffer = '';
            }
            if (jobCancelled) {
                reject(new Error('任务已取消'));
                return;
            }
            if (code === 0) {
                pushProgress({
                    stage: 'done',
                    videoProgress: 100,
                    videoCurrentSec: parseState.mediaTotalSec || parseState.speechTotalSec || mediaDurationSec || 0,
                    videoTotalSec: parseState.mediaTotalSec || parseState.speechTotalSec || mediaDurationSec || 0,
                    detail: '完成',
                }, { force: true });
                resolveSubtitlePathAfterWrite(
                    resolvedVideo,
                    outputDir,
                    normalizeTransWithAiRuntimeOptions(options).subFormats,
                ).then((subtitlePath) => {
                    resolve({
                        ok: true,
                        fullPath: resolvedVideo,
                        subtitlePath,
                    });
                }).catch(() => {
                    resolve({
                        ok: true,
                        fullPath: resolvedVideo,
                        subtitlePath: resolveLocalSubtitlePath(resolvedVideo, outputDir),
                    });
                });
                return;
            }
            const tail = stderr.trim().split(/\r?\n/).slice(-4).join(' ');
            reject(new Error(tail || `TransWithAI 退出码 ${code}`));
        });
    }));
}

function buildInferSpawnEnv() {
    return {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
    };
}

function waitForWebContentsReady(webContents) {
    if (!webContents || webContents.isDestroyed()) {
        return Promise.resolve(false);
    }
    if (!webContents.isLoading()) {
        return Promise.resolve(true);
    }
    return new Promise((resolve) => {
        webContents.once('did-finish-load', () => resolve(true));
    });
}

function notifySubtitleTask(windowManager, channel, payload) {
    if (!windowManager?.sendToRenderer) return false;
    return windowManager.sendToRenderer(channel, payload);
}

function getMainWebContents(windowManager) {
    const win = windowManager?.getMainWindow?.();
    if (!win || win.isDestroyed()) return null;
    const wc = win.webContents;
    if (!wc || wc.isDestroyed()) return null;
    return wc;
}

function isSameWebContents(a, b) {
    if (!a || !b || a.isDestroyed() || b.isDestroyed()) return false;
    return a.id === b.id;
}

function broadcastToSubtitleTaskUi(windowManager, invokeSender, channel, payload) {
    notifySubtitleTask(windowManager, channel, payload);
    if (!invokeSender || invokeSender.isDestroyed()) return;
    const mainWc = getMainWebContents(windowManager);
    if (mainWc && isSameWebContents(invokeSender, mainWc)) return;
    invokeSender.send(channel, payload);
}

function browserWindowFromEvent(event) {
    return BrowserWindow.fromWebContents(event.sender);
}

function isSubtitleTaskWebContents(webContents) {
    if (!webContents || webContents.isDestroyed()) return false;
    try {
        return String(webContents.getURL() || '').includes('index.html');
    } catch {
        return false;
    }
}

function updateTrayFromProgress(windowManager, progress = {}) {
    if (!windowManager?.updateTrayProgress || !activeBatchTrayCtx?.trayProgressEnabled) return;
    try {
        const eta = require('../src/js/eta-core');
        const index = Number(progress.index) || 0;
        const total = Number(progress.total) || activeBatchTrayCtx.items.length || 0;
        const itemProgress = Number(progress.itemProgress) || 0;
        const batchPct = eta.batchProgressPct({ index, total, itemProgress });
        const phase = String(progress.phase || '');
        const fullPath = String(progress.fullPath || progress.sourcePath || '').trim();
        if (fullPath && activeBatchTrayCtx.items.length) {
            const key = fullPath.replace(/\//g, '\\').toLowerCase();
            for (const item of activeBatchTrayCtx.items) {
                const ik = String(item.path || '').replace(/\//g, '\\').toLowerCase();
                if (ik !== key) continue;
                if (phase === 'done' || phase === 'skipped') item.status = phase === 'skipped' ? 'skipped' : 'done';
                else if (phase === 'failed') item.status = 'failed';
                else if (phase === 'running') item.status = 'running';
                break;
            }
        }
        const etaSec = eta.estimateEtaSec({
            items: activeBatchTrayCtx.items,
            activePath: phase === 'running' ? fullPath : '',
            videoCurrentSec: progress.videoCurrentSec,
            videoTotalSec: progress.videoTotalSec,
            itemStage: progress.itemStage,
            rate: activeBatchTrayCtx.rate,
        });
        windowManager.setTrayProgressEnabled?.(true);
        windowManager.updateTrayProgress({
            batchPct,
            index,
            total,
            etaText: eta.formatEtaCompact(etaSec),
        });
    } catch (_) { /* ignore */ }
}

function broadcastProgress(windowManager, progress, invokeSender) {
    broadcastToSubtitleTaskUi(windowManager, invokeSender, 'transwithai-progress', progress);
    updateTrayFromProgress(windowManager, progress);
}

async function notifySubtitleTaskJobStart(windowManager, payload, { minimizeToTray = true } = {}) {
    if (!windowManager?.createMainWindow) return false;
    const win = windowManager.createMainWindow({ startMinimizedToTray: minimizeToTray });
    if (!win || win.isDestroyed()) return false;
    const ready = await waitForWebContentsReady(win.webContents);
    if (!ready || win.isDestroyed()) return false;
    notifySubtitleTask(windowManager, 'subtitle-task-job-start', payload);
    return true;
}

async function executeSubtitleBatchLoop(items, options, check, windowManager, invokeSender, onBatchProgress) {
    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    const emitBatchProgress = (payload) => {
        onBatchProgress?.(payload);
        broadcastProgress(windowManager, payload, invokeSender);
    };

    for (let i = 0; i < items.length; i += 1) {
        if (jobCancelled) break;
        const item = items[i] || {};
        const fullPath = String(item.fullPath || item.path || item || '').trim();
        const sourcePath = String(item.sourcePath || fullPath).trim();
        const subtitleOutputDir = resolveInferOutputDir(fullPath, options);
        if (!fullPath) {
            skipped += 1;
            continue;
        }

        const itemOptions = {
            ...options,
            outputDir: subtitleOutputDir,
        };

        if (!options.overwrite) {
            const existing = resolveLocalSubtitlePath(fullPath, subtitleOutputDir);
            if (existing) {
                skipped += 1;
                emitBatchProgress({
                    index: i + 1,
                    total: items.length,
                    fullPath,
                    sourcePath,
                    phase: 'skipped',
                    subtitlePath: existing,
                    itemProgress: 100,
                    itemStage: 'skipped',
                    itemDetail: '已有字幕',
                });
                continue;
            }
        }

        emitBatchProgress({
            index: i + 1,
            total: items.length,
            fullPath,
            sourcePath,
            phase: 'running',
            itemProgress: 0,
            itemStage: 'starting',
            itemDetail: '准备中…',
        });

        try {
            const safePath = resolveSafePath(fullPath);
            const durationHint = Number(item.durationSec || item.duration || 0) || 0;
            const result = await runInferOnce(check.path, safePath, {
                ...itemOptions,
                durationHint,
            }, (update) => {
                const stage = update.stage || 'transcribe';
                emitBatchProgress({
                    index: i + 1,
                    total: items.length,
                    fullPath,
                    sourcePath,
                    phase: 'running',
                    itemProgress: update.pipelineProgress ?? mapInferStageProgress(
                        stage,
                        update.videoProgress ?? 0,
                        update.videoCurrentSec ?? 0,
                        update.videoTotalSec ?? 0,
                    ),
                    itemStage: stage,
                    itemDetail: update.detail,
                    videoCurrentSec: update.videoCurrentSec ?? 0,
                    videoTotalSec: update.videoTotalSec ?? 0,
                });
            }, (line) => {
                broadcastToSubtitleTaskUi(windowManager, invokeSender, 'transwithai-infer-log', { line });
            });
            setSessionPostTaskOptions({ lastOutputDir: subtitleOutputDir });
            generated += 1;
            emitBatchProgress({
                index: i + 1,
                total: items.length,
                fullPath,
                sourcePath,
                phase: 'done',
                subtitlePath: result.subtitlePath,
                itemProgress: 100,
                itemStage: 'done',
                itemDetail: '完成',
                videoCurrentSec: 0,
                videoTotalSec: 0,
            });
        } catch (err) {
            failed += 1;
            if (errors.length < 8) {
                errors.push(`${path.basename(fullPath)}: ${err.message || err}`);
            }
            emitBatchProgress({
                index: i + 1,
                total: items.length,
                fullPath,
                sourcePath,
                phase: 'failed',
                error: err.message || String(err),
                itemProgress: 100,
                itemStage: 'failed',
                itemDetail: err.message || String(err),
            });
        }
    }

    return jobCancelled
        ? {
            ok: false,
            cancelled: true,
            error: '任务已取消',
            generated,
            skipped,
            failed,
            total: items.length,
            errors,
        }
        : {
            ok: failed === 0,
            generated,
            skipped,
            failed,
            total: items.length,
            errors,
        };
}

/**
 * @param {object} params
 * @param {Array<{fullPath?: string}>} params.items
 * @param {object} params.options merged TransWithAI options
 * @param {object} params.windowManager
 * @param {import('electron').WebContents} [params.invokeSender]
 * @param {boolean} [params.manageJobState=true]
 * @param {boolean} [params.minimizeToTray] 任务开始时是否最小化到托盘；字幕任务窗口内启动时默认保持可见
 */
async function runSubtitleBatch({
    items,
    options,
    windowManager,
    invokeSender = null,
    manageJobState = true,
    onBatchProgress = null,
    getUserDataPath = null,
    minimizeToTray,
}) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
        return { ok: false, error: '缺少待处理视频' };
    }
    if (manageJobState && jobRunning) {
        return { ok: false, error: '已有字幕任务正在运行，请先在任务窗口等待完成' };
    }

    if (manageJobState) {
        jobRunning = true;
        jobCancelled = false;
    }

    try {
        const merged = normalizeTransWithAiRuntimeOptions(options || {});
        const check = validateInstall(merged.installPath, merged.device);
        if (!check.ok) {
            return { ok: false, error: check.error };
        }

        const runtimeOptions = {
            ...merged,
            generationConfigPath: getUserDataPath
                ? resolveGenerationConfigPath(check.path, merged, getUserDataPath)
                : path.join(check.path, 'generation_config.json5'),
        };

        const shouldMinimizeToTray = minimizeToTray !== undefined
            ? !!minimizeToTray
            : (runtimeOptions.minimizeToTrayOnStart || !isSubtitleTaskWebContents(invokeSender));

        const jobStartedAt = new Date().toISOString();
        const jobStartedMs = Date.now();
        const defaultOutputDir = String(merged.outputDir || '').trim();
        if (defaultOutputDir) {
            setSessionPostTaskOptions({ lastOutputDir: defaultOutputDir });
        }

        let historyRate = null;
        try {
            const { loadTaskHistory } = require('./task-history');
            const { rateFromHistory, DEFAULT_WALL_FACTOR } = require('../src/js/eta-core');
            historyRate = rateFromHistory(loadTaskHistory().entries, {
                device: runtimeOptions.device,
                task: runtimeOptions.task,
            }) ?? DEFAULT_WALL_FACTOR;
        } catch {
            historyRate = 0.35;
        }

        activeBatchTrayCtx = {
            items: list.map((item) => ({
                path: String(item?.fullPath || item?.path || item || '').trim(),
                duration: Math.max(0, Number(item?.durationSec || item?.duration) || 0),
                status: 'pending',
            })).filter((i) => i.path),
            rate: historyRate,
            device: runtimeOptions.device,
            task: runtimeOptions.task,
            trayProgressEnabled: !!runtimeOptions.trayProgressEnabled,
        };
        windowManager?.setTrayProgressEnabled?.(activeBatchTrayCtx.trayProgressEnabled);
        try {
            const { setTrayNotifyEnabled } = require('./notifications');
            setTrayNotifyEnabled(!!runtimeOptions.trayNotifyEnabled);
        } catch { /* ignore */ }

        await notifySubtitleTaskJobStart(windowManager, {
            total: list.length,
            items: list
                .map((item) => String(item?.fullPath || item?.path || item || '').trim())
                .filter(Boolean),
            startedAt: new Date().toISOString(),
            device: runtimeOptions.device,
        }, { minimizeToTray: shouldMinimizeToTray });

        const result = await executeSubtitleBatchLoop(list, runtimeOptions, check, windowManager, invokeSender, onBatchProgress);

        try {
            const { appendTaskHistory } = require('./task-history');
            const totalDurationSec = list.reduce(
                (sum, item) => sum + Math.max(0, Number(item?.durationSec || item?.duration) || 0),
                0,
            );
            appendTaskHistory({
                startedAt: jobStartedAt,
                finishedAt: new Date().toISOString(),
                wallSec: Math.max(0, Math.round((Date.now() - jobStartedMs) / 1000)),
                totalDurationSec,
                device: runtimeOptions.device,
                task: runtimeOptions.task,
                total: result.total,
                generated: result.generated,
                skipped: result.skipped,
                failed: result.failed,
                cancelled: !!result.cancelled,
                options: stripPostTaskFields(runtimeOptions),
                errors: result.errors,
            });
        } catch { /* ignore */ }

        try { windowManager?.clearTrayProgress?.(); } catch (_) { /* ignore */ }
        activeBatchTrayCtx = null;

        notifySubtitleTask(windowManager, 'subtitle-task-job-finished', result);
        if (!result.cancelled && manageJobState) {
            try {
                const { notifySubtitleComplete, setTrayNotifyEnabled } = require('./notifications');
                setTrayNotifyEnabled(!!runtimeOptions.trayNotifyEnabled);
                notifySubtitleComplete(`成功 ${result.generated}，跳过 ${result.skipped}，失败 ${result.failed}`);
            } catch { /* ignore */ }
            runPostSubtitleTaskActions(runtimeOptions, result, windowManager);
        }
        return result;
    } catch (err) {
        const fail = {
            ok: false,
            error: err.message || String(err),
            generated: 0,
            skipped: 0,
            failed: list.length,
            total: list.length,
        };
        try { windowManager?.clearTrayProgress?.(); } catch (_) { /* ignore */ }
        activeBatchTrayCtx = null;
        notifySubtitleTask(windowManager, 'subtitle-task-job-finished', fail);
        return fail;
    } finally {
        if (manageJobState) {
            jobRunning = false;
            jobCancelled = false;
            activeProc = null;
        }
        if (!jobRunning) {
            try { windowManager?.clearTrayProgress?.(); } catch (_) { /* ignore */ }
            activeBatchTrayCtx = null;
        }
    }
}

function setPendingFilesForWindow(files) {
    pendingFilesForWindow = Array.isArray(files)
        ? files.map((f) => asString(f, 4096)).filter(Boolean)
        : [];
}

function safeRmDir(dirPath) {
    try {
        fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
        /* ignore cleanup errors */
    }
}

/**
 * 重转写轻量/暖启动：缩小 beam、降低日志开销，并限制初始时间戳搜索范围以加快短窗推理。
 */
function applyRetranscribeWarmLightOptions(options = {}) {
    if (!options.retranscribeWarmLight) return options;
    return {
        ...options,
        beamSize: 1,
        logLevel: options.logLevel === 'ERROR' ? 'ERROR' : 'WARNING',
        maxInitialTimestamp: Math.min(Number(options.maxInitialTimestamp) || 30, 10),
    };
}

function mapRetranscribeProgressMessage(update = {}, { warmLight = false } = {}) {
    const prefix = warmLight ? '[轻量] ' : '';
    const stage = String(update.stage || '');
    const detail = String(update.detail || '').trim();
    switch (stage) {
        case 'warmup':
            return `${prefix}正在预热转写配置…`;
        case 'extract':
            return `${prefix}正在截取音频片段…`;
        case 'starting':
            return `${prefix}正在启动转写引擎…`;
        case 'vad':
            return detail
                ? `${prefix}${detail}`
                : `${prefix}正在初始化语音检测 (VAD)…`;
        case 'model':
            return detail
                ? `${prefix}${detail}`
                : `${prefix}正在加载 Whisper 模型，请稍候…`;
        case 'transcribe':
            return detail
                ? `${prefix}${detail}`
                : `${prefix}正在识别语音…`;
        case 'save':
            return `${prefix}正在写入字幕结果…`;
        case 'done':
            return `${prefix}重转写完成`;
        default:
            return detail || `${prefix}区间重转写进行中…`;
    }
}

/**
 * 对媒体区间裁剪后调用 infer，返回相对整片时间轴的 cues
 */
async function transcribeMediaRange(payload = {}, deps = {}) {
    const mediaPath = resolveSafePath(asString(payload.mediaPath || payload.videoPath, 4096).trim());
    const startMs = Math.max(0, Math.round(Number(payload.startMs) || 0));
    const endMs = Math.max(startMs + 200, Math.round(Number(payload.endMs) || 0));
    const padRaw = Number(payload.padMs);
    const padMs = Math.max(0, Math.min(2000, Math.round(Number.isFinite(padRaw) ? padRaw : 350)));
    const getUserDataPath = deps.getUserDataPath;
    const getAppRoot = deps.getAppRoot;
    const onProgress = typeof deps.onProgress === 'function' ? deps.onProgress : null;

    if (!mediaPath || !fs.existsSync(mediaPath)) {
        return { ok: false, error: '媒体文件不存在' };
    }
    if (endMs - startMs < 200) {
        return { ok: false, error: '字幕时间范围过短，无法重转写' };
    }
    if (jobRunning) {
        return { ok: false, error: '已有字幕任务正在运行，请稍后再试' };
    }

    const baseOptions = normalizeTransWithAiRuntimeOptions({
        ...(getAppRoot ? stripPostTaskFields(loadSettings(getAppRoot).options || {}) : {}),
        ...(payload.options || {}),
        overwrite: true,
        mergeSegments: false,
        subFormats: 'srt',
        outputMode: 'custom',
        postTaskAction: 'none',
        closeWindowOnComplete: false,
        playSoundOnComplete: false,
    });
    const warmLight = !!baseOptions.retranscribeWarmLight;
    const emitProgress = (update) => {
        if (!onProgress) return;
        const payloadOut = {
            ...update,
            warmLight,
            message: mapRetranscribeProgressMessage(update, { warmLight }),
        };
        try { onProgress(payloadOut); } catch (_) { /* ignore */ }
    };

    const check = validateInstall(baseOptions.installPath, baseOptions.device);
    if (!check.ok) {
        return { ok: false, error: check.error || 'TransWithAI 未正确安装' };
    }

    const clipStartMs = Math.max(0, startMs - padMs);
    const clipEndMs = endMs + padMs;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-re-'));
    const clipPath = path.join(tempRoot, 'clip.wav');
    const outputDir = path.join(tempRoot, 'out');
    fs.mkdirSync(outputDir, { recursive: true });

    jobRunning = true;
    jobCancelled = false;

    try {
        emitProgress({ stage: 'warmup', detail: warmLight ? '轻量模式：预热转写配置' : '预热转写配置' });
        const generationConfigPath = getUserDataPath
            ? resolveGenerationConfigPath(
                check.path,
                applyRetranscribeWarmLightOptions(baseOptions),
                getUserDataPath,
            )
            : path.join(check.path, 'generation_config.json5');

        emitProgress({ stage: 'extract', detail: '截取音频片段' });
        const { extractMediaRange } = require('./ffmpeg-bridge');
        const clip = await extractMediaRange(mediaPath, clipStartMs, clipEndMs, clipPath, {
            ffmpegPath: baseOptions.ffmpegPath || payload.ffmpegPath,
        });
        if (!clip.ok) {
            return { ok: false, error: clip.error || '截取音频失败' };
        }

        const runtimeOptions = applyRetranscribeWarmLightOptions({
            ...baseOptions,
            outputDir,
            outputMode: 'custom',
            generationConfigPath,
            durationHint: (clipEndMs - clipStartMs) / 1000,
        });

        emitProgress({
            stage: 'starting',
            detail: warmLight ? '轻量模式：启动转写引擎' : '启动转写引擎',
        });
        const result = await runInferOnce(
            check.path,
            clipPath,
            runtimeOptions,
            (update) => emitProgress(update || {}),
        );
        if (!result?.subtitlePath || !fs.existsSync(result.subtitlePath)) {
            return { ok: false, error: '重转写未生成字幕文件' };
        }

        emitProgress({ stage: 'save', detail: '解析字幕结果' });
        const raw = fs.readFileSync(result.subtitlePath, 'utf8');
        const parsed = parseSubtitle(raw, 'srt');
        const cues = (parsed.cues || []).map((cue) => ({
            startMs: Math.max(0, Math.round(Number(cue.startMs) || 0) + clipStartMs),
            endMs: Math.max(0, Math.round((cue.endMs != null ? cue.endMs : (cue.startMs + 1000)) + clipStartMs)),
            text: String(cue.text || '').trim(),
        })).filter((cue) => cue.text);

        if (!cues.length) {
            return { ok: false, error: '重转写结果为空' };
        }

        emitProgress({ stage: 'done', detail: '重转写完成' });
        return {
            ok: true,
            cues,
            clipStartMs,
            clipEndMs,
            padMs,
            sourceStartMs: startMs,
            sourceEndMs: endMs,
            subtitlePath: result.subtitlePath,
            task: runtimeOptions.task,
            language: runtimeOptions.language,
            warmLight,
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    } finally {
        jobRunning = false;
        jobCancelled = false;
        activeProc = null;
        safeRmDir(tempRoot);
    }
}

function setupTransWithAiBridge(api, deps) {
    const { register } = api;
    const { getUserDataPath, getAppRoot, windowManager } = deps;
    async function readOptions(override = {}) {
        return mergeTransWithAiOptions({
            ...(stripPostTaskFields(loadSettings(getAppRoot).options || {})),
            ...stripPostTaskFields(override),
        });
    }

    try {
        syncTrayNotifyFromOptions(loadSettings(getAppRoot).options || {});
    } catch { /* ignore */ }

    register('transwithai-validate', async (_event, payload = {}) => {
        try {
            const options = await readOptions(payload);
            return validateInstallWithVersion(payload.installPath || options.installPath, {
                quick: !!payload.quick,
                allowInferProbe: payload.probeVersion !== false && !payload.quick,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-generate-subtitles', async (event, payload = {}) => {
        const items = Array.isArray(payload.items) ? payload.items : [];
        const payloadOptions = payload.options || {};
        setSessionPostTaskOptions(payloadOptions);
        const options = await readOptions(stripPostTaskFields(payloadOptions));
        return runSubtitleBatch({
            items,
            options,
            windowManager,
            invokeSender: event.sender,
            manageJobState: true,
            getUserDataPath,
            minimizeToTray: payload.minimizeToTray,
        });
    });

    register('transwithai-cancel', async () => {
        if (!jobRunning) return { ok: true, cancelled: false };
        stopSubtitleJobs();
        return { ok: true, cancelled: true };
    });

    register('transub-transcribe-range', async (event, payload = {}) => {
        try {
            return await transcribeMediaRange(payload || {}, {
                getUserDataPath,
                getAppRoot,
                onProgress: (progress) => {
                    try {
                        if (!event?.sender?.isDestroyed?.()) {
                            event.sender.send('transub-retranscribe-progress', progress);
                        }
                    } catch (_) { /* ignore */ }
                },
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-get-options', async (_event, payload = {}) => {
        try {
            const options = await readOptions(payload);
            return { ok: true, options };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-set-post-task', async (_event, payload = {}) => {
        try {
            const options = setSessionPostTaskOptions(payload);
            return { ok: true, options };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-save-options', async (_event, payload = {}) => {
        try {
            if (payload.saveParams) {
                const current = await readOptions();
                const { saveParams, items, ...rest } = payload;
                const normalized = buildTransWithAiOptionsFromPayload(rest, current);
                await saveTransWithAiOptions(getAppRoot, stripPostTaskFields(normalized));
                return { ok: true };
            }

            const patch = {};
            if (payload.installPath != null) {
                patch.installPath = normalizeInstallPath(payload.installPath);
            }
            [
                'device', 'task', 'overwrite',
                'subFormats', 'modelPath', 'logLevel', 'mergeSegments',
                'mergeMaxGapMs', 'mergeMaxDurationMs', 'maxBatchSize',
                'beamSize', 'language', 'vadThreshold',
                'vadMinSpeechDurationMs', 'vadMinSilenceDurationMs', 'vadSpeechPadMs',
                'maxInitialTimestamp', 'repetitionPenalty', 'smartSplitWithVad', 'targetChunkDurationS',
                'retranscribeWarmLight', 'subtitleBakMode',
                'outputDir', 'outputMode', 'audioSuffixes', 'ffmpegPath',
            ]
                .forEach((key) => {
                    if (payload[key] != null) patch[key] = payload[key];
                });
            if (!Object.keys(patch).length) {
                return { ok: false, error: '无有效参数' };
            }
            const normalized = buildTransWithAiOptionsFromPayload(patch, await readOptions());
            await saveTransWithAiOptions(getAppRoot, stripPostTaskFields(normalized));
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('electron-select-folder', async (event, options = {}) => {
        const win = browserWindowFromEvent(event);
        const result = await dialog.showOpenDialog(win, {
            title: options.title || '选择文件夹',
            properties: ['openDirectory'],
            defaultPath: options.defaultPath || undefined,
        });
        if (result.canceled || !result.filePaths?.length) {
            return { ok: true, canceled: true };
        }
        return { ok: true, canceled: false, path: result.filePaths[0] };
    });

    register('transwithai-show-in-folder', async (_event, filePath) => {
        const p = asString(filePath, 4096).trim();
        if (!p) return { ok: false, error: '缺少路径' };
        shell.showItemInFolder(p);
        return { ok: true };
    });

    register('transwithai-open-external', async (_event, url) => {
        try {
            const u = assertSafeExternalUrl(url);
            await shell.openExternal(u);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-get-pending-files', async () => {
        const files = pendingFilesForWindow.slice();
        pendingFilesForWindow = [];
        return { ok: true, files };
    });

    register('transwithai-select-videos', async (event, options = {}) => {
        const win = browserWindowFromEvent(event);
        const result = await dialog.showOpenDialog(win, {
            title: options.title || '选择视频文件',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: '视频', extensions: VIDEO_EXTENSIONS }],
            defaultPath: options.defaultPath || undefined,
        });
        if (result.canceled || !result.filePaths?.length) {
            return { ok: true, canceled: true, files: [] };
        }
        return { ok: true, canceled: false, files: result.filePaths };
    });
}

module.exports = {
    DEFAULT_INSTALL_PATH,
    TRANWITHAI_RELEASES_URL,
    normalizeInstallPath,
    validateInstall,
    validateInstallWithVersion,
    detectTransWithAiVersion,
    mergeTransWithAiOptions,
    normalizeTransWithAiRuntimeOptions,
    buildTransWithAiOptionsFromPayload,
    buildInferArgs,
    runInferOnce,
    transcribeMediaRange,
    applyRetranscribeWarmLightOptions,
    mapRetranscribeProgressMessage,
    runSubtitleBatch,
    formatMediaTime,
    parseInferProgressLine,
    mapInferStageProgress,
    isSubtitleJobRunning,
    stopSubtitleJobs,
    setupTransWithAiBridge,
    setPendingFilesForWindow,
    resetSessionPostTaskOptions,
    setSessionPostTaskOptions,
    getSessionPostTaskOptions,
};
