/**
 * FEATURE FROZEN — TransWithAI compatibility backend.
 * Crash fixes only; no new capabilities. Prefer Transub Engine (`engineBackend=transub`).
 * Target removal: major version 4.x. See docs/architecture.md / docs/engine-boundary.md.
 */
const fs = require('fs');
const os = require('os');
const twaiProgress = require('./transwithai-progress-parse');
const { normalizeTransWithAiRuntimeOptions } = require('./transwithai-runtime-options-normalize');
const path = require('path');
const { spawn } = require('child_process');
const { dialog, BrowserWindow, shell } = require('electron');
const { resolveSafePath, asString, assertSafeExternalUrl } = require('./ipc-validate');
const { resolveLocalSubtitlePath, resolveLocalSubtitleBatch, resolveDualSubtitlePaths } = require('./subtitle-utils');
const { loadSettings, saveSettings } = require('./settings-data');
const { parseSubtitle } = require('./subtitle-format');
const dualCore = require('../src/js/dual-subtitle-core');
const modelCore = require('../src/js/transwithai-model-core');
const {
    DEFAULT_INSTALL_PATH,
    AUDIO_SUFFIXES,
    DEFAULT_SESSION_POST_TASK,
    stripPostTaskFields,
    normalizePostTaskOptions,
    mergeTransWithAiOptions,
} = require('./transwithai-options');
const {
    dualTargetPathFromSource,
    renameStemSubtitlesWithSuffix,
    writeMergedBilingualSubtitleFiles,
    unlinkSubtitleFilesQuietly,
} = require('./subtitle-fs-helpers');
const {
    waitForWebContentsReady,
    notifySubtitleTask,
    broadcastToSubtitleTaskUi,
} = require('./subtitle-task-ui');
const {
    createPostSubtitleTaskRunner,
    createDeferredBatchFinalize,
    notifyBatchComplete,
} = require('./subtitle-batch-lifecycle');
const { applyPostBatchPipeline } = require('./post-batch-pipeline');
const { createTranswithAiBatchLoop } = require('./transwithai-batch-loop');
const {
    MEDIA_EXTENSIONS,
    AUDIO_EXTENSIONS,
    VIDEO_EXTENSIONS,
} = require('../src/js/media-extensions-core');

const TRANWITHAI_RELEASES_URL = 'https://github.com/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases';
const TRANWITHAI_LATEST_API = 'https://api.github.com/repos/TransWithAI/Faster-Whisper-TransWithAI-ChickenRice/releases/latest';

function inferTaskArg(task) {
    return task === 'transcribe' ? 'transcribe' : 'translate';
}

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
/** Stop the in-flight file only; batch loop continues with remaining items. */
let itemCancelled = false;
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
    itemCancelled = false;
    killActiveProc();
}

function cancelCurrentSubtitleItem() {
    if (!jobRunning) {
        return { ok: false, cancelled: false, error: '没有进行中的字幕批次', code: 'no_batch' };
    }
    itemCancelled = true;
    killActiveProc();
    try {
        require('./advanced-bridge').cancelContextReconstruct?.();
    } catch { /* ignore */ }
    try {
        require('./sakura-translate').cancelSakuraTranslate?.();
    } catch { /* ignore */ }
    return { ok: true, cancelled: true, scope: 'current' };
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

function normalizeEngineVersion(raw) {
    return String(raw || '').trim().replace(/^v/i, '');
}

async function fetchTransWithAiLatestRelease() {
    const res = await fetch(TRANWITHAI_LATEST_API, {
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Transub-Engine-Updater',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });
    if (!res.ok) {
        throw new Error(`GitHub API ${res.status}`);
    }
    return res.json();
}

/**
 * Compare installed TransWithAI version with GitHub latest release.
 * @param {string} installPath
 * @param {{ allowInferProbe?: boolean }} [options]
 */
async function checkTransWithAiEngineUpdate(installPath, options = {}) {
    const { compareVersions } = require('./app-updater');
    const check = validateInstall(installPath);
    let currentVersion = null;
    if (check.ok) {
        currentVersion = normalizeEngineVersion(await detectTransWithAiVersion(check.path, {
            allowInferProbe: options.allowInferProbe !== false,
        }));
    }

    let release;
    try {
        release = await fetchTransWithAiLatestRelease();
    } catch (err) {
        return {
            ok: false,
            installed: !!check.ok,
            currentVersion: currentVersion || null,
            error: err?.message || '检查引擎更新失败',
            releasesUrl: TRANWITHAI_RELEASES_URL,
        };
    }

    const latestVersion = normalizeEngineVersion(release?.tag_name || release?.name || '');
    const releaseUrl = String(release?.html_url || '').trim() || TRANWITHAI_RELEASES_URL;
    if (!latestVersion) {
        return {
            ok: true,
            installed: !!check.ok,
            currentVersion: currentVersion || null,
            latestVersion: null,
            updateAvailable: false,
            releasesUrl: TRANWITHAI_RELEASES_URL,
            releaseUrl,
            message: '无法解析 GitHub 最新版本号',
        };
    }

    const updateAvailable = !!(currentVersion && compareVersions(latestVersion, currentVersion) > 0);
    let message;
    if (!check.ok) {
        message = `本地未检测到引擎；GitHub 最新为 v${latestVersion}`;
    } else if (!currentVersion) {
        message = `已安装，但未能识别本地版本；GitHub 最新为 v${latestVersion}`;
    } else if (updateAvailable) {
        message = `发现新版本 v${latestVersion}（当前 v${currentVersion}）`;
    } else if (compareVersions(latestVersion, currentVersion) === 0) {
        message = `已是最新版本 v${currentVersion}`;
    } else {
        message = `当前 v${currentVersion}，GitHub 最新 v${latestVersion}`;
    }

    return {
        ok: true,
        installed: !!check.ok,
        currentVersion: currentVersion || null,
        latestVersion,
        updateAvailable,
        releasesUrl: TRANWITHAI_RELEASES_URL,
        releaseUrl,
        message,
    };
}

/** @type {typeof DEFAULT_SESSION_POST_TASK} */
let sessionPostTaskOptions = { ...DEFAULT_SESSION_POST_TASK };

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
    // dual 为 Transub 编排任务，写入引擎配置时映射为 translate（实际按 pass 覆盖）
    merged.task = inferTaskArg(normalized.task);
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
    merged.no_speech_threshold = normalized.noSpeechThreshold;
    merged.log_prob_threshold = normalized.logProbThreshold;
    merged.compression_ratio_threshold = normalized.compressionRatioThreshold;
    if (normalized.hallucinationSilenceThreshold != null) {
        merged.hallucination_silence_threshold = normalized.hallucinationSilenceThreshold;
        // faster-whisper 要求 word_timestamps=True 时 hallucination_silence_threshold 才生效
        merged.word_timestamps = true;
    } else {
        delete merged.hallucination_silence_threshold;
    }

    if (normalized.glossaryPromptEnabled !== false) {
        try {
            const { readGlossary } = require('./glossary-data');
            const {
                buildAsrPromptHints,
                buildJaAvAsrPromptHints,
            } = require('../src/js/subtitle-glossary-core');
            const gloss = readGlossary();
            if (gloss?.ok && gloss.glossary) {
                const hints = buildAsrPromptHints(gloss.glossary);
                if (hints.termCount > 0) {
                    if (hints.initial_prompt) merged.initial_prompt = hints.initial_prompt;
                    if (hints.hotwords) merged.hotwords = hints.hotwords;
                }
            }
            const lang = String(normalized.language || merged.language || '').toLowerCase();
            const profile = String(
                normalized.contentProfile || normalized.senseProfile || '',
            ).toLowerCase();
            // Only inject mens-esthe bias for av_soft — all-JA injection polluted drama (JUR-809).
            const wantDomain = /av[_-]?soft|ja[_-]?av|^av$/.test(profile);
            if (wantDomain && typeof buildJaAvAsrPromptHints === 'function') {
                const domain = buildJaAvAsrPromptHints({
                    hint: [
                        normalized.mediaPath,
                        normalized.inputPath,
                        normalized.title,
                        normalized.fileName,
                        merged.media_path,
                    ].filter(Boolean).join(' '),
                    title: normalized.title,
                    mediaPath: normalized.mediaPath || normalized.inputPath,
                });
                if (domain.initial_prompt) {
                    const cur = String(merged.initial_prompt || '');
                    if (!/メンズエステ|メンエス|自然な会話/.test(cur)) {
                        merged.initial_prompt = cur
                            ? `${domain.initial_prompt}${cur}`
                            : domain.initial_prompt;
                    }
                }
                if (domain.hotwords) {
                    const seen = new Set();
                    const parts = [];
                    for (const part of `${merged.hotwords || ''} ${domain.hotwords}`.split(/\s+/)) {
                        if (part && !seen.has(part)) {
                            seen.add(part);
                            parts.push(part);
                        }
                    }
                    merged.hotwords = parts.join(' ');
                }
            }
        } catch {
            /* glossary optional */
        }
    } else {
        delete merged.initial_prompt;
        delete merged.hotwords;
    }

    // 简/繁体由批量完成后的 OpenCC 后处理负责，勿写入 initial_prompt（易被模型复述进字幕）

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
    syncMinimizeToTrayFromOptions(next);
    syncAutoUpdateCheckFromSavedOptions(next);
    try {
        require('./i18n').initFromOptions(next);
    } catch { /* optional */ }
    try {
        const { rebuildTrayMenus } = require('./i18n-runtime');
        rebuildTrayMenus();
    } catch { /* optional */ }
    try {
        const { applyProxyFromSettings } = require('./proxy-settings');
        const { session } = require('electron');
        await applyProxyFromSettings(next, { session: session.defaultSession });
    } catch (err) {
        console.warn('[proxy] apply on save failed:', err?.message || err);
    }
    broadcastSettingsUpdated(next);
}

function syncAutoUpdateCheckFromSavedOptions(options = {}) {
    try {
        const { syncAutoUpdateCheckFromOptions } = require('./auto-update-check');
        const { app } = require('electron');
        syncAutoUpdateCheckFromOptions(app, options);
    } catch { /* ignore */ }
}

function broadcastSettingsUpdated(options = {}) {
    try {
        const payload = { options: stripPostTaskFields(options) || {} };
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win || win.isDestroyed() || win.webContents.isDestroyed()) continue;
            win.webContents.send('transub-settings-updated', payload);
        }
    } catch { /* ignore */ }
}

function syncTrayNotifyFromOptions(options = {}) {
    try {
        const { setTrayNotifyEnabled } = require('./notifications');
        setTrayNotifyEnabled(!!options.trayNotifyEnabled);
    } catch { /* ignore */ }
}

/** @type {{ setMinimizeToTrayEnabled?: Function } | null} */
let trayUiWindowManager = null;

function syncMinimizeToTrayFromOptions(options = {}) {
    try {
        trayUiWindowManager?.setMinimizeToTrayEnabled?.(options.minimizeToTrayEnabled !== false);
    } catch { /* ignore */ }
}

const runPostSubtitleTaskActions = createPostSubtitleTaskRunner({
    getSessionPostTaskOptions,
    normalizePostTaskOptions,
    isJobCancelled: () => jobCancelled,
});

const {
    deferBatchFinalize,
    flushDeferredBatchFinalize,
    clearDeferredBatchFinalize,
} = createDeferredBatchFinalize({
    notifyBatchComplete,
    runPostSubtitleTaskActions,
});

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
        // Prefer exact `{stem}.{ext}` (engine default) before any suffixed sidecars
        for (const fmt of formats) {
            const direct = path.join(dir, `${stem}.${fmt}`);
            if (fs.existsSync(direct)) return direct;
        }
        const found = resolveLocalSubtitlePath(resolvedVideo, dir);
        if (found) {
            const foundBase = path.basename(found, path.extname(found));
            // Ignore `{stem}.{lang}.{ext}` while waiting for plain stem output
            if (foundBase === stem) return found;
        }
        if (attempt < 7) {
            await new Promise((resolve) => { setTimeout(resolve, 200); });
        }
    }
    for (const fmt of formats) {
        const direct = path.join(dir, `${stem}.${fmt}`);
        if (fs.existsSync(direct)) return direct;
    }
    return resolveLocalSubtitlePath(resolvedVideo, dir);
}

function resolveInferModelPath(installPath, modelPath) {
    const raw = String(modelPath || '').trim();
    if (!raw) return '';
    if (path.isAbsolute(raw)) return path.resolve(raw);
    return path.resolve(normalizeInstallPath(installPath), raw);
}

function buildDualPassOptions(baseOptions, task, checkPath, getUserDataPath) {
    const passModel = modelCore.resolvePassModelPath(baseOptions, task);
    const pass = {
        ...baseOptions,
        task,
        modelPath: passModel,
        overwrite: true,
    };
    return {
        ...pass,
        generationConfigPath: getUserDataPath
            ? resolveGenerationConfigPath(checkPath, pass, getUserDataPath)
            : path.join(checkPath, 'generation_config.json5'),
    };
}

function buildInferArgs(installPath, videoPath, options = {}) {
    const generationConfigOverride = String(options.generationConfigPath || '').trim();
    const merged = normalizeTransWithAiRuntimeOptions(options);
    const generationConfig = generationConfigOverride
        || path.join(normalizeInstallPath(installPath), 'generation_config.json5');
    const resolvedVideo = path.resolve(String(videoPath || ''));
    const outputDir = resolveInferOutputDir(resolvedVideo, merged);
    const inferTask = merged.task === 'dual'
        ? inferTaskArg(options.task || merged.task)
        : inferTaskArg(merged.task);
    // Prefer explicit pass modelPath; otherwise resolve from dedicated fields
    const passModelRaw = String(options.modelPath || '').trim()
        || modelCore.resolvePassModelPath(merged, inferTask);
    const modelAbs = resolveInferModelPath(installPath, passModelRaw);

    const args = [
        `--audio_suffixes=${merged.audioSuffixes || AUDIO_SUFFIXES}`,
        `--generation_config=${generationConfig}`,
        // 传入 infer 的 --log_level；DEBUG 可输出每句时间轴，便于 Transub 解析进度
        `--log_level=${merged.logLevel}`,
        `--task=${inferTask}`,
        ...buildDeviceArgs(merged),
    ];

    if (modelAbs) {
        args.push(`--model_name_or_path=${modelAbs}`);
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


const {
    parseChineseDurationSeconds,
    formatMediaTime,
    parseInferTimestampMinutesSeconds,
    parseLrcTimestampSeconds,
    mapInferStageProgress,
    TRANSCRIBE_WALL_FACTOR,
    SYNTHETIC_PROGRESS_INTERVAL_MS,
    INFER_STAGE_RANK,
    inferStageRank,
    buildSyntheticTranscribeUpdate,
    mapPipelinePercent,
    parseInferProgressLine,
} = twaiProgress;

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
            if (jobCancelled || itemCancelled || !transcribeStartedAt) return;
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
            if (jobCancelled || itemCancelled) {
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

async function notifySubtitleTaskJobStartLocal(windowManager, payload, { minimizeToTray = true } = {}) {
    if (!windowManager?.createMainWindow) return false;
    const win = windowManager.createMainWindow({ startMinimizedToTray: minimizeToTray });
    if (!win || win.isDestroyed()) return false;
    const ready = await waitForWebContentsReady(win.webContents);
    if (!ready || win.isDestroyed()) return false;
    notifySubtitleTask(windowManager, 'subtitle-task-job-start', payload);
    return true;
}

function getTranswithAiBatchLoop() {
    return createTranswithAiBatchLoop({
        get jobCancelled() { return jobCancelled; },
        get itemCancelled() { return itemCancelled; },
        set itemCancelled(v) { itemCancelled = !!v; },
        dualCore,
        modelCore,
        broadcastProgress,
        broadcastToSubtitleTaskUi,
        resolveInferOutputDir,
        resolveDualSubtitlePaths,
        resolveLocalSubtitlePath,
        runInferOnce,
        mapInferStageProgress,
        resolveSafePath,
        buildDualPassOptions,
        renameStemSubtitlesWithSuffix,
        dualTargetPathFromSource,
        applyPostBatchPipeline,
        setSessionPostTaskOptions,
        writeMergedBilingualSubtitleFiles,
        unlinkSubtitleFilesQuietly,
    });
}

async function executeSubtitleBatchLoop(...args) {
    return getTranswithAiBatchLoop().executeSubtitleBatchLoop(...args);
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
        return { ok: false, error: '已有字幕任务正在运行，请先在任务窗口等待完成', code: 'compute_busy' };
    }

    if (manageJobState) {
        const computeLock = require('./compute-task-lock');
        return computeLock.runWithComputeLock({
            kind: 'twai_batch',
            owner: '主程序',
            source: 'runSubtitleBatch',
        }, async () => {
            jobRunning = true;
            jobCancelled = false;
            itemCancelled = false;
            try {
                return await runSubtitleBatchBody({
                    items: list,
                    options,
                    windowManager,
                    invokeSender,
                    manageJobState,
                    onBatchProgress,
                    getUserDataPath,
                    minimizeToTray,
                });
            } finally {
                jobRunning = false;
                jobCancelled = false;
                itemCancelled = false;
                activeProc = null;
            }
        });
    }

    return runSubtitleBatchBody({
        items: list,
        options,
        windowManager,
        invokeSender,
        manageJobState,
        onBatchProgress,
        getUserDataPath,
        minimizeToTray,
    });
}

async function runSubtitleBatchBody({
    items: list,
    options,
    windowManager,
    invokeSender = null,
    manageJobState = true,
    onBatchProgress = null,
    getUserDataPath = null,
    minimizeToTray,
}) {
    try {
        const merged = normalizeTransWithAiRuntimeOptions(options || {});

        if (merged.smartTranslate && (merged.task === 'translate' || merged.task === 'dual')) {
            try {
                const { requireSmartTranslate } = require('./advanced-gates');
                const gate = requireSmartTranslate({
                    faithfulTone: !!merged.smartTranslateFaithfulTone,
                });
                if (!gate.ok) {
                    return {
                        ok: false,
                        error: gate.error
                            || '智能翻译需解锁 Pro',
                        code: gate.code || 'not_entitled',
                    };
                }
            } catch (err) {
                return {
                    ok: false,
                    error: err.message || '无法校验智能翻译资格',
                };
            }
        }

        // Soft-fill empty model paths from install models dir when possible
        try {
            const { listTransWithAiModels } = require('./extensions-bridge');
            const listed = listTransWithAiModels(merged.installPath);
            if (listed?.ok) {
                Object.assign(merged, modelCore.fillMissingModelPaths(merged, listed.items || []));
            }
        } catch { /* list may be unavailable in some test contexts */ }

        if (merged.task === 'dual'
            || merged.task === 'transcribe'
            || merged.task === 'translate') {
            try {
                const { listTransWithAiModels } = require('./extensions-bridge');
                const listed = listTransWithAiModels(merged.installPath);
                const gate = modelCore.validateModelsForTask(merged, listed?.items || [], merged.task);
                if (!gate.ok) {
                    return { ok: false, error: gate.error || '模型配置无效' };
                }
                if (gate.options) Object.assign(merged, gate.options);
            } catch (err) {
                // If listing fails, still allow run when paths are explicitly set
                const gate = modelCore.validateModelsForTask(merged, [], merged.task);
                if (!gate.ok && (merged.task === 'dual')) {
                    return { ok: false, error: gate.error || err.message || '模型配置无效' };
                }
            }
        }

        const check = validateInstall(merged.installPath, merged.device);
        if (!check.ok) {
            return { ok: false, error: check.error };
        }

        const runtimeOptions = {
            ...merged,
            generationConfigPath: merged.task === 'dual'
                ? null
                : (getUserDataPath
                    ? resolveGenerationConfigPath(check.path, merged, getUserDataPath)
                    : path.join(check.path, 'generation_config.json5')),
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
            const fallback = runtimeOptions.task === 'dual'
                ? DEFAULT_WALL_FACTOR * 2
                : DEFAULT_WALL_FACTOR;
            historyRate = rateFromHistory(loadTaskHistory().entries, {
                device: runtimeOptions.device,
                task: runtimeOptions.task,
            }) ?? fallback;
        } catch {
            historyRate = runtimeOptions.task === 'dual' ? 0.7 : 0.35;
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

        await notifySubtitleTaskJobStartLocal(windowManager, {
            total: list.length,
            items: list
                .map((item) => String(item?.fullPath || item?.path || item || '').trim())
                .filter(Boolean),
            startedAt: new Date().toISOString(),
            device: runtimeOptions.device,
            backend: 'twai',
        }, { minimizeToTray: shouldMinimizeToTray });

        const liveBatch = require('./live-batch-queue');
        liveBatch.begin(list);
        let result;
        try {
            result = await executeSubtitleBatchLoop(
                list,
                runtimeOptions,
                check,
                windowManager,
                invokeSender,
                onBatchProgress,
                { getUserDataPath },
            );
        } finally {
            liveBatch.end();
        }

        try {
            const { appendTaskHistory } = require('./task-history');
            const totalDurationSec = list.reduce(
                (sum, item) => sum + Math.max(0, Number(item?.durationSec || item?.duration) || 0),
                0,
            );
            const historyRecord = appendTaskHistory({
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
                outputs: result.outputs,
            });
            try {
                const { ingestBatchHistoryEntry } = require('./subtitle-shelf');
                ingestBatchHistoryEntry(historyRecord);
            } catch { /* ignore */ }
        } catch { /* ignore */ }

        try { windowManager?.clearTrayProgress?.(); } catch (_) { /* ignore */ }
        activeBatchTrayCtx = null;

        notifySubtitleTask(windowManager, 'subtitle-task-job-finished', result);
        if (!result.cancelled && manageJobState) {
            // Tray notify / sound / shutdown wait until UI finishes post-batch (incl. QC fix).
            deferBatchFinalize(runtimeOptions, result, windowManager);
        } else if (result.cancelled) {
            clearDeferredBatchFinalize();
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
            itemCancelled = false;
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

function mapRetranscribeProgressMessage(update = {}, { warmLight = false, task = 'transcribe' } = {}) {
    const prefix = warmLight ? '[轻量] ' : '';
    const stage = String(update.stage || '');
    const isTranslate = String(task || '') === 'translate';
    let detail = String(update.detail || '').trim()
        .replace(/^(转写\s*\/\s*翻译中|转写中|翻译中|转写|翻译|识别中)\s*[·•]?\s*/u, '')
        .trim();
    switch (stage) {
        case 'warmup':
            return `${prefix}预热配置…`;
        case 'extract':
            return `${prefix}截取音频…`;
        case 'starting':
            return `${prefix}启动引擎…`;
        case 'vad':
            return detail ? `${prefix}${detail}` : `${prefix}初始化语音检测…`;
        case 'model':
            return detail ? `${prefix}${detail}` : `${prefix}加载模型…`;
        case 'transcribe':
            if (detail) return `${prefix}${detail}`;
            return `${prefix}${isTranslate ? '翻译中…' : '识别中…'}`;
        case 'save':
            return `${prefix}整理结果…`;
        case 'done':
            return `${prefix}${isTranslate ? '重译完成' : '重转写完成'}`;
        default:
            return detail || `${prefix}${isTranslate ? '重译进行中…' : '重转写进行中…'}`;
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
        return { ok: false, error: '已有字幕任务正在运行，请稍后再试', code: 'compute_busy' };
    }

    const computeLock = require('./compute-task-lock');
    return computeLock.runWithComputeLock({
        kind: 'twai_range',
        owner: '字幕编辑器',
        source: 'transcribeMediaRange',
    }, async () => {
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
        const rangeTask = payload.options?.task === 'translate' ? 'translate' : 'transcribe';
        baseOptions.task = rangeTask;
        baseOptions.modelPath = modelCore.resolvePassModelPath(baseOptions, rangeTask);
        const warmLight = !!baseOptions.retranscribeWarmLight;
        const emitProgress = (update) => {
            if (!onProgress) return;
            const payloadOut = {
                ...update,
                warmLight,
                message: mapRetranscribeProgressMessage(update, { warmLight, task: rangeTask }),
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
        itemCancelled = false;
        const actionNoun = rangeTask === 'translate' ? '重译' : '重转写';

        try {
            emitProgress({ stage: 'warmup', detail: warmLight ? '轻量模式：预热配置' : '预热配置' });
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
                detail: warmLight ? '轻量模式：启动引擎' : '启动引擎',
            });
            const result = await runInferOnce(
                check.path,
                clipPath,
                runtimeOptions,
                (update) => emitProgress(update || {}),
            );
            if (!result?.subtitlePath || !fs.existsSync(result.subtitlePath)) {
                return { ok: false, error: `${actionNoun}未生成字幕文件` };
            }

            emitProgress({ stage: 'save', detail: '解析字幕结果' });
            const raw = await fs.promises.readFile(result.subtitlePath, 'utf8');
            const parsed = parseSubtitle(raw, 'srt');
            const cues = (parsed.cues || []).map((cue) => ({
                startMs: Math.max(0, Math.round(Number(cue.startMs) || 0) + clipStartMs),
                endMs: Math.max(0, Math.round((cue.endMs != null ? cue.endMs : (cue.startMs + 1000)) + clipStartMs)),
                text: String(cue.text || '').trim(),
            })).filter((cue) => cue.text);

            if (!cues.length) {
                return { ok: false, error: `${actionNoun}结果为空` };
            }

            emitProgress({ stage: 'done', detail: `${actionNoun}完成` });
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
            itemCancelled = false;
            activeProc = null;
            safeRmDir(tempRoot);
            try {
                require('./temp-cleanup').cleanupAfterJob();
            } catch { /* ignore */ }
        }
    });
}

function setupTransWithAiBridge(api, deps) {
    const { register } = api;
    const { getUserDataPath, getAppRoot, windowManager } = deps;
    trayUiWindowManager = windowManager || null;
    async function readOptions(override = {}) {
        return mergeTransWithAiOptions({
            ...(stripPostTaskFields(loadSettings(getAppRoot).options || {})),
            ...stripPostTaskFields(override),
        });
    }

    try {
        const opts = loadSettings(getAppRoot).options || {};
        syncTrayNotifyFromOptions(opts);
        syncMinimizeToTrayFromOptions(opts);
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

    register('transwithai-check-engine-update', async (_event, payload = {}) => {
        try {
            const options = await readOptions(payload || {});
            return await checkTransWithAiEngineUpdate(
                payload?.installPath || options.installPath,
                { allowInferProbe: payload?.probeVersion !== false },
            );
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

    register('transwithai-cancel-current', async () => cancelCurrentSubtitleItem());

    // transub-transcribe-range is owned by engine-bridge (dispatches to TWAI when engineBackend=twai)

    // transwithai-get-options is registered in main.js (lightweight cold-start path)

    register('transub-batch-finalize', async (_event, payload = {}) => {
        try {
            return flushDeferredBatchFinalize(payload || {});
        } catch (err) {
            return { ok: false, error: err?.message || String(err) };
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
                'engineBackend', 'engineInstallPath', 'engineUrl', 'engineHfEndpoint', 'engineHfToken',
                'engineProfile', 'engineAsrModel', 'engineMtModel',
                'engineOpusMtModel', 'engineLlmMtModel', 'engineVadModel',
                'engineAutoStart',
                'translateMode',
                'proxyEnabled', 'proxyUrl', 'proxyBypass', 'githubMirrorUrls',
                'transubStationEnabled', 'transubStationUrl', 'transubStationModel',
                'device', 'task', 'overwrite',
                'subFormats', 'modelPath', 'transcribeModelPath', 'translateModelPath',
                'logLevel', 'mergeSegments',
                'mergeMaxGapMs', 'mergeMaxDurationMs', 'maxBatchSize',
                'beamSize', 'language', 'vadThreshold',
                'vadMinSpeechDurationMs', 'vadMinSilenceDurationMs', 'vadSpeechPadMs',
                'maxInitialTimestamp', 'repetitionPenalty',
                'noSpeechThreshold', 'logProbThreshold', 'compressionRatioThreshold',
                'hallucinationSilenceThreshold', 'glossaryPromptEnabled', 'glossaryMtEnabled',
                'chineseSubtitleVariant',
                'subtitleTargetLang',
                'lastMtByTarget',
                'dualTargetSuffix', 'dualPrimaryTrack', 'dualDisplayMode', 'dualLineOrder',
                'mergeBilingualSubtitles', 'deleteSourcesAfterMergeBilingual',
                'outputWriteTarget', 'outputWriteSource', 'targetSubtitleNaming',
                'insertSoftwareCredit',
                'includeWords', 'karaokeVtt', 'releaseGpuAfter', 'autoCpuOnGpuBusy',
                'postBatchCpsSplit', 'postBatchRemoveNoise', 'postBatchCompressRepetition',
                'postBatchViewingPunctMode', 'postBatchInterjectionMode', 'postBatchOnomatopoeiaMode',
                'postBatchTextPresetGroupId',
                'postBatchSimplifyViewingPunctuation',
                'postBatchCompactPureInterjections',
                'postBatchContextReconstruct',
                'smartTranslate',
                'smartTranslateFaithfulTone',
                'translateStyleEnabled',
                'translateStylePreset',
                'translateStyleCustomNote',
                'smartTranslateHybridMt',
                'smartTranslatePlotPolish',
                'smartTranslateFaithfulVerify',
                'smartTranslateAddressConsistency',
                'asrSecondOpinion',
                'qualityPipelineMode',
                'postQcLoopMaxPasses',
                'asrBadPoolDrafts',
                'asrSemanticRepair',
                'filmBriefSampleMode',
                'smartTranslatePolishSampleLimit',
                'sakuraNsfwPrompt',
                'filmAudioEnhance', 'filmVadPreset',
                'filmVadThreshold', 'filmVadMinSpeechDurationMs',
                'filmVadMinSilenceDurationMs', 'filmHallucinationSilenceThreshold',
                'neuralDiarize',
                'qcSmartLlmSplit', 'qcSmartRetranscribe', 'qcSmartSemanticReview',
                'qcSmartIntensity', 'qcSmartMaxRetranscribeRanges',
                'vadEnabled', 'vadSensitive', 'vadAggressive', 'audioLightDenoise',
                'autoSuggestSpeakers', 'speakerCount', 'perfProfile', 'qwenAsrBatchMode',
                'vadMaxSingleSegmentMs',
                'smartSplitWithVad', 'targetChunkDurationS',
                'retranscribeWarmLight', 'subtitleBakMode',
                'keepTranscript', 'transcriptKeepDir', 'transcriptKeepLimit', 'transcriptKeepDays',
                'shelfOpenAfterBatch',
                'trayProgressEnabled', 'showTaskResourceUsage', 'minimizeToTrayEnabled', 'minimizeToTrayOnStart', 'trayNotifyEnabled', 'startupWindow',
                'subtitleEditorBackend', 'subtitleEditorPath',
                'uiLocale',
                'rememberLastOpenDir',
                'autoScanFolders', 'autoScanRecursive',
                'wizardContentTypes', 'wizardPresetIds', 'wizardTargetLangs',
                'autoUpdateCheckInterval', 'lastAutoUpdateCheckAt',
                'postBatchQc',
                'postBatchQcFixMode',
                'qcSilenceSplitChars',
                'externalImportAction',
                'activePresetId',
                'activeComboPlanId',
                'mtUseForm',
                'outputDir', 'outputMode', 'audioSuffixes', 'ffmpegPath', 'settingsUiMode',
                'burnContainer', 'burnEncoderId', 'burnAudioMode', 'burnCrf',
                'burnResolutionId', 'burnFpsId', 'burnEncodeSpeedId',
                'burnOutputSuffix', 'burnOutputDir',
            ]
                .forEach((key) => {
                    // Allow empty string (e.g. engineHfEndpoint = official hub)
                    if (payload[key] !== undefined && payload[key] !== null) patch[key] = payload[key];
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

    register('transub-test-proxy', async (_event, payload = {}) => {
        try {
            const { testProxyConnectivity, normalizeProxyOptions } = require('./proxy-settings');
            return await testProxyConnectivity(normalizeProxyOptions(payload || {}));
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-station-probe', async (_event, payload = {}) => {
        try {
            const station = require('./transub-station-client');
            const opts = station.normalizeStationOptions(payload || {});
            return await station.probeStationReady({
                stationUrl: opts.transubStationUrl,
                timeoutMs: Number(payload?.timeoutMs) || 8000,
            });
        } catch (err) {
            return { ok: false, ready: false, error: err.message || String(err) };
        }
    });

    register('transub-station-fetch-config', async (_event, payload = {}) => {
        try {
            const station = require('./transub-station-client');
            const opts = station.normalizeStationOptions(payload || {});
            return await station.fetchClientConfig({
                stationUrl: opts.transubStationUrl,
                timeoutMs: Number(payload?.timeoutMs) || 8000,
            });
        } catch (err) {
            return { ok: false, ready: false, error: err.message || String(err) };
        }
    });

    register('transub-station-list-models', async (_event, payload = {}) => {
        try {
            const station = require('./transub-station-client');
            const opts = station.normalizeStationOptions(payload || {});
            return await station.listStationModels({
                stationUrl: opts.transubStationUrl,
                preferredModel: opts.transubStationModel
                    || String(payload?.preferredModel || '').trim(),
                timeoutMs: Number(payload?.timeoutMs) || 8000,
            });
        } catch (err) {
            return { ok: false, models: [], error: err.message || String(err) };
        }
    });

    register('transub-station-select-model', async (_event, payload = {}) => {
        try {
            const station = require('./transub-station-client');
            const opts = station.normalizeStationOptions(payload || {});
            return await station.selectStationModel({
                stationUrl: opts.transubStationUrl,
                model: String(payload?.model || opts.transubStationModel || '').trim(),
                wait: payload?.wait !== false,
                // Sync switch waits for Station ready (GGUF load); allow up to 3 min.
                timeoutMs: Number(payload?.timeoutMs) || 180000,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-test-hf-endpoint', async (_event, payload = {}) => {
        try {
            const { testHfEndpointConnectivity } = require('./proxy-settings');
            return await testHfEndpointConnectivity(payload || {});
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-pick-hf-endpoint', async (_event, payload = {}) => {
        try {
            const { pickBestHfEndpoint } = require('./proxy-settings');
            return await pickBestHfEndpoint(payload || {});
        } catch (err) {
            return { ok: false, error: err.message || String(err), fallback: true, hfEndpoint: 'https://hf-mirror.com' };
        }
    });

    register('transub-test-github-mirrors', async (_event, payload = {}) => {
        try {
            const { testGithubMirrorsConnectivity } = require('./github-mirrors');
            return await testGithubMirrorsConnectivity(payload || {});
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('electron-select-folder', async (event, options = {}) => {
        const win = browserWindowFromEvent(event);
        const { resolveDialogDefaultPath, rememberOpenPath } = require('./last-open-dir');
        const explicit = String(options.defaultPath || '').trim();
        const defaultPath = explicit
            || (options.useLastOpenDir
                ? resolveDialogDefaultPath(getAppRoot)
                : undefined);
        const result = await dialog.showOpenDialog(win, {
            title: options.title || '选择文件夹',
            properties: ['openDirectory'],
            defaultPath: defaultPath || undefined,
        });
        if (result.canceled || !result.filePaths?.length) {
            return { ok: true, canceled: true };
        }
        const picked = result.filePaths[0];
        if (options.useLastOpenDir) {
            rememberOpenPath(getAppRoot, picked);
        }
        return { ok: true, canceled: false, path: picked };
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
        let handoffOptions = null;
        let handoffMeta = null;
        try {
            const handoff = require('./player-handoff').consumePendingHandoffOptions();
            handoffOptions = handoff?.formPatch || null;
            handoffMeta = handoff?.meta || null;
        } catch (_) { /* ignore */ }
        return { ok: true, files, handoffOptions, handoffMeta };
    });

    register('transwithai-select-videos', async (event, options = {}) => {
        const win = browserWindowFromEvent(event);
        const { resolveDialogDefaultPath, rememberOpenPath } = require('./last-open-dir');
        const defaultPath = resolveDialogDefaultPath(getAppRoot, options.defaultPath);
        const result = await dialog.showOpenDialog(win, {
            title: options.title || '选择媒体文件',
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: '媒体文件', extensions: [...MEDIA_EXTENSIONS] },
                { name: '音频', extensions: [...AUDIO_EXTENSIONS] },
                { name: '视频', extensions: [...VIDEO_EXTENSIONS] },
            ],
            defaultPath: defaultPath || undefined,
        });
        if (result.canceled || !result.filePaths?.length) {
            return { ok: true, canceled: true, files: [] };
        }
        rememberOpenPath(getAppRoot, result.filePaths[0]);
        return { ok: true, canceled: false, files: result.filePaths };
    });
}

module.exports = {
    DEFAULT_INSTALL_PATH,
    TRANWITHAI_RELEASES_URL,
    normalizeInstallPath,
    validateInstall,
    validateInstallWithVersion,
    checkTransWithAiEngineUpdate,
    detectTransWithAiVersion,
    mergeTransWithAiOptions,
    normalizeTransWithAiRuntimeOptions,
    buildTransWithAiOptionsFromPayload,
    buildInferArgs,
    renameStemSubtitlesWithSuffix,
    resolveInferModelPath,
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
    cancelCurrentSubtitleItem,
    setupTransWithAiBridge,
    setPendingFilesForWindow,
    resetSessionPostTaskOptions,
    setSessionPostTaskOptions,
    getSessionPostTaskOptions,
    saveTransWithAiOptions,
    runPostSubtitleTaskActions,
    deferBatchFinalize,
    flushDeferredBatchFinalize,
    clearDeferredBatchFinalize,
    writeMergedBilingualSubtitleFiles,
};
