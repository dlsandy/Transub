const fs = require('fs');
const path = require('path');
const { dialog, shell, BrowserWindow, app } = require('electron');
const {
    probeVideo,
    resolveFfmpegValidation,
    validateFfmpegSetup,
    detectSilenceInRange,
    cancelActiveFfmpegJobs,
    extractWaveformPeaks,
} = require('./ffmpeg-bridge');
const { loadPresets, saveCustomPreset, deleteCustomPreset } = require('./presets-data');
const { loadTaskHistory, appendTaskHistory, clearTaskHistory } = require('./task-history');
const { loadEditorHistory, appendEditorHistory, clearEditorHistory } = require('./editor-history');
const { detectGpuEnvironment } = require('./gpu-detect');
const { resolveLocalSubtitlePath, resolveLocalSubtitleBatch, collectSubtitleSidecars, isSubtitleFile, guessVideoPathForSubtitle, VIDEO_EXTENSIONS: SUBTITLE_VIDEO_EXTENSIONS } = require('./subtitle-utils');
const { parseSubtitle, serializeSubtitle, detectFormat, isEditableFormat } = require('./subtitle-format');
const { resolveMediaUrl } = require('./media-protocol');
const { loadSettings, saveSettings, getSettingsFilePath } = require('./settings-data');
const { getProjectRoot, getWritableRoot } = require('./app-paths');
const { asString, assertEditableSubtitlePath, assertSubtitleMetaPath, assertVideoFilePath } = require('./ipc-validate');
const { refocusWindow } = require('./window-focus');
const { readSubtitleMeta, writeSubtitleMeta } = require('./subtitle-meta');
const {
    readSubtitleDraft,
    writeSubtitleDraft,
    clearSubtitleDraft,
    shouldOfferDraftRestore,
} = require('./subtitle-draft');
const modelCore = require('../src/js/transwithai-model-core');
function glossaryData() {
    // Lazy: avoid loading src/js shared cores when only opening updater / ffmpeg routes
    return require('./glossary-data');
}

function textPresetsData() {
    return require('./text-presets-data');
}

function editorWorkflowsData() {
    return require('./editor-workflows-data');
}
const {
    checkForAppUpdate,
    downloadAppUpdate,
    quitAndInstallUpdate,
    openUpdateDownload,
    setUpdateProgressListener,
} = require('./app-updater');

const VIDEO_EXTENSIONS = new Set([
    'mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'webm', 'm4v', 'ts', 'mpeg', 'mpg', 'rmvb', 'rm', '3gp',
]);

function isVideoFile(filePath) {
    const ext = path.extname(String(filePath || '')).slice(1).toLowerCase();
    return VIDEO_EXTENSIONS.has(ext);
}

function scanVideosInDirectory(rootDir, recursive = true) {
    const results = [];
    const queue = [path.resolve(rootDir)];
    const seen = new Set();

    while (queue.length) {
        const dir = queue.shift();
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (recursive) queue.push(full);
                continue;
            }
            if (!entry.isFile() || !isVideoFile(full)) continue;
            const key = process.platform === 'win32' ? full.toLowerCase() : full;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push(full);
        }
    }
    return results.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function readSubtitleDocument(filePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) return { ok: false, error: '字幕文件不存在' };
    if (!isSubtitleFile(path.basename(resolved))) return { ok: false, error: '不是支持的字幕文件' };
    try {
        const raw = fs.readFileSync(resolved, 'utf8');
        const format = detectFormat(resolved, raw);
        if (!isEditableFormat(format)) {
            return { ok: false, error: `暂不支持编辑 ${format.toUpperCase()} 格式，请使用 SRT / VTT / LRC` };
        }
        const parsed = parseSubtitle(raw, format);
        return {
            ok: true,
            path: resolved,
            basename: path.basename(resolved),
            format: parsed.format,
            cues: parsed.cues,
            header: parsed.header || [],
            cueCount: parsed.cues.length,
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function scanSubtitleQc(filePath, options = {}) {
    const doc = readSubtitleDocument(filePath);
    if (!doc.ok) return doc;
    let qc;
    try {
        qc = require('../src/js/subtitle-qc-core');
    } catch (err) {
        return { ok: false, error: err.message || '无法加载 QC 模块' };
    }
    const { issues, summary } = qc.scanCueIssues(doc.cues, {
        checkFluency: true,
        ...options,
    });
    const summaryText = typeof qc.summarizeScan === 'function'
        ? qc.summarizeScan(summary)
        : (summary?.total ? `${summary.total} 条有问题` : '未发现问题');
    const shortParts = [];
    if (summary?.overlap) shortParts.push(`重叠 ${summary.overlap}`);
    if (summary?.highCps) shortParts.push(`CPS ${summary.highCps}`);
    if (summary?.short) shortParts.push(`过短 ${summary.short}`);
    if (summary?.long) shortParts.push(`过长 ${summary.long}`);
    if (summary?.fluency) shortParts.push(`通顺度 ${summary.fluency}`);
    if (summary?.invalid) shortParts.push(`无效 ${summary.invalid}`);
    return {
        ok: true,
        path: doc.path,
        issueCount: Number(summary?.total) || 0,
        summary,
        summaryText,
        shortSummary: shortParts.length ? shortParts.join(' · ') : (summary?.total ? `${summary.total} 项` : '通过'),
        issues: Array.isArray(issues) ? issues.slice(0, 50) : [],
    };
}

/**
 * 批量后处理：可选句读后空格、CPS 智能拆分、清理杂音/幻觉短句、压缩叠词、翻译任务简繁体，写回字幕文件。
 * 顺序：句读后空格 → CPS 拆句 → 清理杂音 → 压缩叠词 → 简繁转换。
 */
function applySubtitlePostprocess(filePath, options = {}) {
    const doc = readSubtitleDocument(filePath);
    if (!doc.ok) return doc;

    let cues = doc.cues;
    const result = {
        ok: true,
        path: doc.path,
        beforeCount: cues.length,
        afterCount: cues.length,
        spacePunct: null,
        cpsSplit: null,
        noise: null,
        compressRep: null,
        chinese: null,
        written: false,
    };

    const doSpacePunct = options.spaceAfterChinesePunctuation === true;
    const doCpsSplit = options.cpsSplit === true;
    const doNoise = options.removeNoise === true || options.removeHallucinations === true;
    const doCompressRep = options.compressRepetition === true;
    const chineseVariant = String(options.chineseSubtitleVariant || '').trim();
    const doChinese = chineseVariant === 'simplified' || chineseVariant === 'traditional';

    if (doSpacePunct) {
        let chinese;
        try {
            chinese = require('../src/js/subtitle-chinese-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载简繁转换模块' };
        }
        const spaced = chinese.spaceAfterChinesePunctuationCues(cues);
        cues = spaced.cues;
        result.spacePunct = {
            summary: spaced.summary,
            stats: spaced.stats,
        };
    }

    if (doCpsSplit) {
        let qc;
        try {
            qc = require('../src/js/subtitle-qc-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载 QC 模块' };
        }
        const fix = qc.applyQcFixes(cues, {
            fixOverlap: options.fixOverlap !== false,
            fixCpsBySplit: true,
            fixCpsByExtend: options.fixCpsByExtend === true,
            enforceMinDur: options.enforceMinDur === true,
            enforceMaxDur: options.enforceMaxDur !== false,
            maxCps: Number(options.maxCps) || 18,
            maxSec: Number(options.maxSec) || 10,
            smartMaxChars: Number(options.smartMaxChars) || 20,
            smartLineChars: Number(options.smartLineChars) || 18,
            targetCps: Number(options.targetCps) || 3,
        });
        cues = fix.cues;
        result.cpsSplit = {
            summary: fix.summary,
            beforeCount: fix.beforeCount,
            afterCount: fix.afterCount,
            stats: fix.stats,
        };
    }

    if (doNoise) {
        let fluency;
        try {
            fluency = require('../src/js/subtitle-fluency-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载通顺度模块' };
        }
        const noise = fluency.removeNoiseFromCues(cues, {
            removeEmpty: options.removeEmpty !== false,
            removeFragments: options.removeFragments !== false,
            removeSoundEffects: options.removeSoundEffects !== false,
            removeSymbolOnly: options.removeSymbolOnly !== false,
            removeDuplicates: options.removeDuplicates === true,
            removeHallucinations: options.removeHallucinations !== false,
        });
        cues = noise.cues;
        result.noise = {
            summary: fluency.summarizeNoiseRemoval(noise.stats),
            stats: noise.stats,
        };
    }

    if (doCompressRep) {
        let fluency;
        try {
            fluency = require('../src/js/subtitle-fluency-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载通顺度模块' };
        }
        const compressed = fluency.compressRepetitionInCues(cues, {
            compressSingleChar: options.compressSingleChar !== false,
            addExclaim: options.addExclaim !== false,
            minRepeats: Number(options.minRepeats) || 3,
        });
        cues = compressed.cues;
        result.compressRep = {
            summary: compressed.summary,
            stats: compressed.stats,
        };
    }

    if (doChinese) {
        let chinese;
        try {
            chinese = require('../src/js/subtitle-chinese-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载简繁转换模块' };
        }
        let protectTerms = Array.isArray(options.protectTerms) ? options.protectTerms : null;
        if (!protectTerms) {
            try {
                const { readGlossary } = glossaryData();
                const { collectProtectTerms } = require('../src/js/subtitle-glossary-core');
                const gloss = readGlossary();
                if (gloss?.ok && gloss.glossary) {
                    protectTerms = collectProtectTerms(gloss.glossary);
                }
            } catch {
                /* glossary optional */
            }
        }
        const direction = chineseVariant === 'traditional' ? 's2t' : 't2s';
        const converted = chinese.convertCues(cues, {
            direction,
            protectTerms: protectTerms || [],
        });
        cues = converted.cues;
        result.chinese = {
            summary: converted.summary,
            stats: converted.stats,
        };
    }

    result.afterCount = cues.length;
    const changed = result.afterCount !== result.beforeCount
        || (result.spacePunct && Number(result.spacePunct.stats?.cueTouched) > 0)
        || (result.cpsSplit && Number(result.cpsSplit.stats?.affected) > 0)
        || (result.noise && Number(result.noise.stats?.removed) > 0)
        || (result.compressRep && Number(result.compressRep.stats?.cueTouched) > 0)
        || (result.chinese && Number(result.chinese.stats?.cueTouched) > 0);

    if (!changed) {
        return { ...result, written: false, summary: '无需后处理' };
    }
    if (!cues.length) {
        return { ok: false, error: '后处理后无剩余字幕，已取消写入', ...result, written: false };
    }

    const written = writeSubtitleDocument(doc.path, {
        cues,
        format: doc.format,
        header: doc.header,
        backupMode: options.backupMode || 'off',
    });
    if (!written.ok) return written;

    const parts = [];
    if (result.spacePunct?.summary && result.spacePunct.stats?.cueTouched) {
        parts.push(result.spacePunct.summary);
    }
    if (result.cpsSplit?.summary) parts.push(result.cpsSplit.summary);
    if (result.noise?.summary && result.noise.stats?.removed) parts.push(result.noise.summary);
    if (result.compressRep?.summary && result.compressRep.stats?.cueTouched) {
        parts.push(result.compressRep.summary.replace(/^将/, '已'));
    }
    if (result.chinese?.summary && result.chinese.stats?.cueTouched) parts.push(result.chinese.summary);
    return {
        ...result,
        written: true,
        summary: parts.join('；') || `已更新（${result.beforeCount} → ${result.afterCount} 条）`,
    };
}

function inspectWhisperModelDir(modelDir) {
    const dir = path.resolve(String(modelDir || ''));
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return {
            ok: false,
            path: dir,
            error: `模型目录不存在：${dir}`,
            hasModelBin: false,
            hasModelSafetensors: false,
            hasConfig: false,
            hasTokenizer: false,
            hasVocabulary: false,
            complete: false,
        };
    }
    const hasModelBin = fs.existsSync(path.join(dir, 'model.bin'));
    const hasModelSafetensors = fs.existsSync(path.join(dir, 'model.safetensors'));
    const hasConfig = fs.existsSync(path.join(dir, 'config.json'));
    const hasTokenizer = fs.existsSync(path.join(dir, 'tokenizer.json'));
    const hasVocabulary = fs.existsSync(path.join(dir, 'vocabulary.json'))
        || fs.existsSync(path.join(dir, 'vocabulary.txt'));
    const hasWeight = hasModelBin || hasModelSafetensors;
    const complete = hasWeight && hasConfig && hasTokenizer && hasVocabulary;
    let error = '';
    if (!hasWeight) {
        error = '缺少 model.bin 或 model.safetensors（需 CTranslate2 格式）';
    } else if (!hasModelBin && hasModelSafetensors && (!hasConfig || !hasTokenizer || !hasVocabulary)) {
        error = '仅有 model.safetensors，缺少配套文件。请下载完整 CT2 包 TransWithAI/whisper-ja-1.5B-ct2（含 model.bin、config.json、tokenizer.json、vocabulary.json）';
    } else if (!complete) {
        const missing = [];
        if (!hasConfig) missing.push('config.json');
        if (!hasTokenizer) missing.push('tokenizer.json');
        if (!hasVocabulary) missing.push('vocabulary.json');
        error = `模型目录不完整，缺少：${missing.join('、')}`;
    }

    let fingerprint = null;
    let detected = null;
    if (hasConfig) {
        try {
            const raw = fs.readFileSync(path.join(dir, 'config.json'), 'utf8');
            const config = JSON.parse(raw);
            fingerprint = modelCore.extractConfigFingerprint(config);
            detected = modelCore.detectModelKind({
                folderName: path.basename(dir),
                config,
            });
        } catch (_) {
            detected = modelCore.detectModelKind({ folderName: path.basename(dir) });
        }
    } else {
        detected = modelCore.detectModelKind({ folderName: path.basename(dir) });
    }

    return {
        ok: complete,
        path: dir,
        error: error || undefined,
        hasModelBin,
        hasModelSafetensors,
        hasConfig,
        hasTokenizer,
        hasVocabulary,
        complete,
        fingerprint: fingerprint || undefined,
        kind: detected?.kind || 'custom',
        kindSource: detected?.source || 'unknown',
        kindConfidence: detected?.confidence || 0,
        kindMatchId: detected?.matchId || undefined,
    };
}

function resolveModelDir(installPath, modelPath) {
    const install = path.resolve(String(installPath || ''));
    const raw = String(modelPath || '').trim();
    if (!raw) return path.join(install, 'models');
    if (path.isAbsolute(raw)) return path.resolve(raw);
    return path.resolve(install, raw);
}

function listTransWithAiModels(installPath) {
    const root = path.resolve(String(installPath || ''));
    const modelsDir = path.join(root, 'models');
    const items = [];
    const pushItem = (id, relPath, label, kind, ready, meta = {}) => {
        items.push({
            id,
            path: relPath,
            label,
            kind,
            ready: ready !== false,
            kindSource: meta.kindSource || 'unknown',
            kindConfidence: meta.kindConfidence || 0,
            kindMatchId: meta.kindMatchId,
            fingerprint: meta.fingerprint,
        });
    };

    if (!fs.existsSync(modelsDir)) {
        return { ok: true, modelsDir, items: [], note: '未找到 models 目录' };
    }

    const rootInfo = inspectWhisperModelDir(modelsDir);
    if (rootInfo.hasModelBin || rootInfo.hasModelSafetensors || rootInfo.hasConfig) {
        // Prefer file-feature kind; fall back to generic "root" only when unknown
        const rootKind = (rootInfo.kind === 'transcribe' || rootInfo.kind === 'translate')
            ? rootInfo.kind
            : 'root';
        const label = rootInfo.ok
            ? '默认主模型（models 根目录）'
            : '默认主模型（不完整）';
        pushItem('default', 'models', label, rootKind, rootInfo.ok, {
            kindSource: rootInfo.kindSource,
            kindConfidence: rootInfo.kindConfidence,
            kindMatchId: rootInfo.kindMatchId,
            fingerprint: rootInfo.fingerprint,
        });
    }

    let entries = [];
    try {
        entries = fs.readdirSync(modelsDir, { withFileTypes: true });
    } catch (err) {
        return { ok: false, error: err.message || String(err), modelsDir, items };
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'whisper-base') continue;
        const sub = path.join(modelsDir, entry.name);
        const info = inspectWhisperModelDir(sub);
        if (!info.hasModelBin && !info.hasModelSafetensors && !info.hasConfig) continue;
        const rel = path.join('models', entry.name).replace(/\\/g, '/');
        const kind = (info.kind === 'transcribe' || info.kind === 'translate')
            ? info.kind
            : 'custom';
        const label = info.ok ? entry.name : `${entry.name}（不完整）`;
        pushItem(entry.name, rel, label, kind, info.ok, {
            kindSource: info.kindSource,
            kindConfidence: info.kindConfidence,
            kindMatchId: info.kindMatchId,
            fingerprint: info.fingerprint,
        });
    }

    return { ok: true, modelsDir, items };
}

const SUBTITLE_BAK_MODES = new Set(['off', 'beside', 'appBackup']);

function normalizeSubtitleBakMode(value) {
    const mode = String(value || '').trim();
    return SUBTITLE_BAK_MODES.has(mode) ? mode : 'off';
}

function resolveSubtitleBackupPath(resolved, backupMode) {
    const mode = normalizeSubtitleBakMode(backupMode);
    if (mode === 'off') return null;
    if (mode === 'appBackup') {
        return path.join(getWritableRoot(), 'backup', `${path.basename(resolved)}.bak`);
    }
    return `${resolved}.bak`;
}

function resolveWriteBackupMode(payload = {}) {
    if (payload.backupMode != null) {
        return normalizeSubtitleBakMode(payload.backupMode);
    }
    if (payload.createBackup === true) return 'beside';
    if (payload.createBackup === false) return 'off';
    return 'off';
}

function writeSubtitleDocument(filePath, payload = {}) {
    const resolved = path.resolve(String(filePath || ''));
    const format = detectFormat(resolved, '');
    const saveFormat = isEditableFormat(payload.format) ? payload.format : format;
    if (!isEditableFormat(saveFormat)) {
        return { ok: false, error: '不支持的字幕格式' };
    }
    const cues = Array.isArray(payload.cues) ? payload.cues : [];
    if (!cues.length) return { ok: false, error: '字幕内容为空' };
    try {
        const content = serializeSubtitle({
            format: saveFormat,
            cues,
            header: payload.header,
        });
        let backupPath;
        const backupMode = resolveWriteBackupMode(payload);
        const targetBackup = resolveSubtitleBackupPath(resolved, backupMode);
        if (targetBackup && fs.existsSync(resolved)) {
            fs.mkdirSync(path.dirname(targetBackup), { recursive: true });
            fs.copyFileSync(resolved, targetBackup);
            backupPath = targetBackup;
        }
        fs.writeFileSync(resolved, content, 'utf8');
        return { ok: true, path: resolved, backupPath, cueCount: cues.length };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function listSubtitleSidecars(videoPath, outputDir) {
    const resolved = path.resolve(String(videoPath || ''));
    if (!fs.existsSync(resolved)) return { ok: false, error: '视频文件不存在' };
    const seen = new Set();
    const sidecars = [];
    const add = (p) => {
        const key = process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
        if (seen.has(key)) return;
        seen.add(key);
        sidecars.push(path.resolve(p));
    };

    for (const p of collectSubtitleSidecars(resolved)) add(p);

    if (outputDir) {
        const dir = path.resolve(String(outputDir));
        const stem = path.basename(resolved, path.extname(resolved));
        try {
            for (const name of fs.readdirSync(dir)) {
                if (!isSubtitleFile(name)) continue;
                const fileStem = name.slice(0, name.length - path.extname(name).length);
                if (fileStem === stem || fileStem.startsWith(`${stem}.`)) {
                    add(path.join(dir, name));
                }
            }
        } catch (_) { /* skip */ }
    }

    const items = sidecars.map((p) => {
        let format = detectFormat(p, '');
        let editable = isEditableFormat(format);
        if (editable) {
            try {
                const raw = fs.readFileSync(p, 'utf8');
                format = detectFormat(p, raw);
                editable = isEditableFormat(format);
            } catch (_) { editable = false; }
        }
        return {
            path: p,
            basename: path.basename(p),
            format,
            editable,
        };
    });
    return { ok: true, sidecars: items };
}

function readSubtitlePreview(filePath, maxLines = 24) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) return { ok: false, error: '字幕文件不存在' };
    try {
        const raw = fs.readFileSync(resolved, 'utf8');
        const lines = raw.split(/\r?\n/).slice(0, maxLines);
        return { ok: true, path: resolved, preview: lines.join('\n'), truncated: raw.split(/\r?\n/).length > maxLines };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function openLatestInferLog(installPath) {
    const logPath = path.join(path.resolve(String(installPath || '')), 'latest.log');
    if (!fs.existsSync(logPath)) return { ok: false, error: '未找到 latest.log' };
    shell.openPath(logPath);
    return { ok: true, path: logPath };
}

function browserWindowFromEvent(event) {
    return BrowserWindow.fromWebContents(event.sender);
}

function setupExtensionsBridge(api, deps) {
    const { register } = api;
    const { getAppRoot } = deps;

    register('ffmpeg-probe', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少路径' };
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPath = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            const validation = resolveFfmpegValidation(ffmpegPath);
            if (!validation.ok) return { ok: false, error: validation.error };
            return probeVideo(filePath, validation.path);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-validate', async (_event, payload = {}) => {
        try {
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPath = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            return validateFfmpegSetup(ffmpegPath, { quick: !!payload.quick });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-detect-silence', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少视频路径' };
            const startMs = Math.max(0, Math.round(Number(payload.startMs) || 0));
            const durationMs = Math.max(0, Math.round(Number(payload.durationMs) || 0));
            let endMs = Math.round(Number(payload.endMs) || 0);
            if (durationMs >= 200) {
                endMs = startMs + durationMs;
            } else if (!(endMs > startMs)) {
                endMs = startMs + Math.max(100, durationMs);
            }
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPathSetting = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            return detectSilenceInRange(filePath, startMs, endMs, {
                ffmpegPathSetting,
                noiseDb: Number(payload.noiseDb),
                minSilenceSec: Number(payload.minSilenceSec),
                minSegmentMs: Number(payload.minSegmentMs),
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-cancel', async () => {
        try {
            return cancelActiveFfmpegJobs();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('ffmpeg-extract-waveform', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少视频路径' };
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPathSetting = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            return extractWaveformPeaks(filePath, {
                ffmpegPathSetting,
                peaksPerSec: Number(payload.peaksPerSec),
                maxPeaks: Number(payload.maxPeaks),
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('electron-select-ffmpeg', async (event, options = {}) => {
        const win = browserWindowFromEvent(event);
        const result = await dialog.showOpenDialog(win, {
            title: options.title || '选择 ffmpeg.exe',
            properties: ['openFile'],
            filters: [
                { name: 'FFmpeg', extensions: ['exe'] },
                { name: '所有文件', extensions: ['*'] },
            ],
        });
        if (result.canceled || !result.filePaths?.length) {
            return { ok: true, canceled: true };
        }
        return { ok: true, canceled: false, path: result.filePaths[0] };
    });

    register('transwithai-scan-folder', async (_event, payload = {}) => {
        try {
            const folder = asString(payload.folder, 4096).trim();
            if (!folder || !fs.existsSync(folder)) return { ok: false, error: '文件夹不存在' };
            const files = scanVideosInDirectory(folder, payload.recursive !== false);
            return { ok: true, files };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-check-subtitles', async (_event, payload = {}) => {
        try {
            const paths = Array.isArray(payload.paths) ? payload.paths : [];
            const outputDir = asString(payload.outputDir, 4096).trim();
            const map = {};
            for (const p of paths) {
                const videoPath = asString(p, 4096).trim();
                if (!videoPath) continue;
                const sub = resolveLocalSubtitlePath(videoPath, outputDir || undefined);
                if (sub) map[videoPath] = sub;
            }
            return { ok: true, subtitles: map };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-get-presets', async () => {
        try {
            return { ok: true, presets: loadPresets().presets };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-save-preset', async (_event, payload = {}) => {
        try {
            const preset = saveCustomPreset(payload);
            return { ok: true, preset, presets: loadPresets().presets };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-delete-preset', async (_event, payload = {}) => {
        try {
            deleteCustomPreset(payload.id);
            return { ok: true, presets: loadPresets().presets };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-get-task-history', async () => {
        try {
            const entries = loadTaskHistory().entries.map((entry) => {
                const outputs = Array.isArray(entry.outputs)
                    ? entry.outputs.map((o) => {
                        const subtitlePath = String(o?.subtitlePath || '').trim();
                        const sourceSubtitlePath = String(o?.sourceSubtitlePath || '').trim();
                        const targetSubtitlePath = String(o?.targetSubtitlePath || '').trim();
                        const bilingualSubtitlePath = String(o?.bilingualSubtitlePath || '').trim();
                        const openPath = bilingualSubtitlePath || targetSubtitlePath || subtitlePath || sourceSubtitlePath;
                        return {
                            ...o,
                            openPath,
                            exists: !!(openPath && fs.existsSync(openPath)),
                        };
                    })
                    : [];
                return { ...entry, outputs };
            });
            return { ok: true, entries };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-clear-task-history', async () => {
        try {
            clearTaskHistory();
            return { ok: true, entries: [] };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-get-editor-history', async () => {
        try {
            const entries = loadEditorHistory().entries.map((entry) => ({
                ...entry,
                exists: !!(entry.path && fs.existsSync(entry.path)),
            }));
            return { ok: true, entries };
        } catch (err) {
            return { ok: false, error: err.message || String(err), entries: [] };
        }
    });

    register('transub-append-editor-history', async (_event, payload = {}) => {
        try {
            const record = appendEditorHistory(payload || {});
            if (!record) return { ok: false, error: '缺少字幕路径' };
            return { ok: true, entry: record, entries: loadEditorHistory().entries };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-clear-editor-history', async () => {
        try {
            clearEditorHistory();
            return { ok: true, entries: [] };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-file-exists', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path || payload.filePath || '', 4096).trim();
            if (!filePath) return { ok: false, error: '缺少路径' };
            const resolved = path.resolve(filePath);
            return {
                ok: true,
                path: resolved,
                exists: fs.existsSync(resolved),
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-detect-gpu', async () => {
        try {
            const info = await detectGpuEnvironment();
            return { ok: true, info };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-subtitle-preview', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return readSubtitlePreview(filePath, Number(payload.maxLines) || 24);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-read-subtitle', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return readSubtitleDocument(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-scan-subtitle-qc', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return scanSubtitleQc(filePath, payload.options || {});
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-apply-subtitle-postprocess', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return applySubtitlePostprocess(filePath, payload.options || payload || {});
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-list-models', async (_event, payload = {}) => {
        try {
            const installPath = asString(payload.installPath || loadSettings(getAppRoot).options?.installPath || '', 4096);
            return listTransWithAiModels(installPath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-validate-model', async (_event, payload = {}) => {
        try {
            const installPath = asString(
                payload.installPath || loadSettings(getAppRoot).options?.installPath || '',
                4096,
            );
            const modelPath = asString(payload.modelPath || '', 4096);
            const dir = resolveModelDir(installPath, modelPath);
            const info = inspectWhisperModelDir(dir);
            return { ...info, modelPath: modelPath || 'models', installPath };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-copy-subtitle-as', async (_event, payload = {}) => {
        try {
            const src = assertEditableSubtitlePath(payload.path || payload.sourcePath);
            const destName = asString(payload.destName || payload.asName || '', 512).trim();
            if (!destName) return { ok: false, error: '未指定目标文件名' };
            const dest = path.join(path.dirname(src), destName);
            if (path.resolve(dest) === path.resolve(src)) {
                return { ok: true, path: dest, skipped: true };
            }
            fs.copyFileSync(src, dest);
            return { ok: true, path: dest, source: src };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-read-subtitle-draft', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return readSubtitleDraft(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-write-subtitle-draft', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return writeSubtitleDraft(filePath, payload);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-clear-subtitle-draft', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return clearSubtitleDraft(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-check-subtitle-draft', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            return shouldOfferDraftRestore(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-write-subtitle', async (_event, payload = {}) => {
        try {
            const filePath = assertEditableSubtitlePath(payload.path);
            const settings = loadSettings(getAppRoot).options || {};
            const backupMode = payload.backupMode != null
                ? payload.backupMode
                : normalizeSubtitleBakMode(settings.subtitleBakMode);
            return writeSubtitleDocument(filePath, { ...payload, backupMode });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-export-subtitle', async (event, payload = {}) => {
        try {
            const cues = Array.isArray(payload.cues) ? payload.cues : [];
            if (!cues.length) return { ok: false, error: '字幕内容为空' };
            const formatHint = String(payload.format || 'srt').toLowerCase();
            const format = ['srt', 'vtt', 'lrc'].includes(formatHint) ? formatHint : 'srt';
            const defaultName = asString(payload.defaultName || payload.suggestedName || '', 512).trim()
                || `subtitle.${format}`;
            const title = asString(payload.title || '', 200).trim() || '导出字幕';
            const win = browserWindowFromEvent(event);
            const filters = format === 'vtt'
                ? [{ name: 'WebVTT', extensions: ['vtt'] }, { name: '所有字幕', extensions: ['srt', 'vtt', 'lrc'] }]
                : format === 'lrc'
                    ? [{ name: 'LRC', extensions: ['lrc'] }, { name: '所有字幕', extensions: ['srt', 'vtt', 'lrc'] }]
                    : [{ name: 'SubRip', extensions: ['srt'] }, { name: '所有字幕', extensions: ['srt', 'vtt', 'lrc'] }];
            const result = await dialog.showSaveDialog(win || undefined, {
                title,
                defaultPath: defaultName,
                filters,
            });
            refocusWindow(win);
            if (result.canceled || !result.filePath) return { ok: true, canceled: true };
            const dest = result.filePath;
            const ext = path.extname(dest).toLowerCase().replace(/^\./, '');
            const saveFormat = ['srt', 'vtt', 'lrc'].includes(ext) ? ext : format;
            return writeSubtitleDocument(dest, {
                format: saveFormat,
                cues,
                header: payload.header,
                backupMode: 'off',
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-delete-subtitle-files', async (_event, payload = {}) => {
        try {
            const rawPaths = Array.isArray(payload.paths) ? payload.paths : [payload.path];
            const deleted = [];
            const missing = [];
            for (const raw of rawPaths) {
                if (!raw) continue;
                const filePath = assertEditableSubtitlePath(raw);
                if (!fs.existsSync(filePath)) {
                    missing.push(filePath);
                    continue;
                }
                fs.unlinkSync(filePath);
                deleted.push(filePath);
            }
            if (!deleted.length && !missing.length) {
                return { ok: false, error: '未指定要删除的字幕文件' };
            }
            return { ok: true, deleted, missing };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-read-subtitle-meta', async (_event, payload = {}) => {
        try {
            const filePath = assertSubtitleMetaPath(payload.path);
            return readSubtitleMeta(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-write-subtitle-meta', async (_event, payload = {}) => {
        try {
            const filePath = assertSubtitleMetaPath(payload.path);
            return writeSubtitleMeta(filePath, payload.meta || payload);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-get-glossary', async (_event, payload = {}) => {
        try {
            const { readGlossary, readGlossaryByScope } = glossaryData();
            if (payload && (payload.scope || payload.subtitlePath || payload.path)) {
                const filePath = payload.subtitlePath || payload.path;
                if (filePath && String(payload.scope || '').toLowerCase() !== 'global') {
                    assertEditableSubtitlePath(filePath);
                }
                return readGlossaryByScope(payload);
            }
            return readGlossary();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-save-glossary', async (_event, payload = {}) => {
        try {
            const { writeGlossaryByScope } = glossaryData();
            const scope = String(payload.scope || 'global').toLowerCase();
            if (scope === 'project') {
                const filePath = payload.subtitlePath || payload.path;
                assertEditableSubtitlePath(filePath);
            }
            return writeGlossaryByScope(payload);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-export-glossary', async (event) => {
        try {
            const { readGlossary } = glossaryData();
            const win = browserWindowFromEvent(event);
            const current = readGlossary();
            if (!current.ok) return current;
            const result = await dialog.showSaveDialog(win || undefined, {
                title: '导出术语表',
                defaultPath: 'transub-glossary.json',
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            refocusWindow(win);
            if (result.canceled || !result.filePath) return { ok: true, canceled: true };
            fs.writeFileSync(
                result.filePath,
                `${JSON.stringify(current.glossary || { version: 1, entries: [] }, null, 2)}\n`,
                'utf8',
            );
            return { ok: true, path: result.filePath };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-import-glossary', async (event) => {
        try {
            const { writeGlossary } = glossaryData();
            const win = browserWindowFromEvent(event);
            const result = await dialog.showOpenDialog(win || undefined, {
                title: '导入术语表',
                properties: ['openFile'],
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            refocusWindow(win);
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true };
            }
            const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
            const glossary = {
                version: 1,
                entries: Array.isArray(parsed.entries) ? parsed.entries : [],
            };
            const saved = writeGlossary(glossary);
            if (!saved.ok) return saved;
            return { ok: true, glossary: saved.glossary, path: saved.path };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-get-text-presets', async () => {
        try {
            return textPresetsData().readTextPresets();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-save-text-presets', async (_event, payload = {}) => {
        try {
            const doc = payload.presetsDoc || payload;
            return textPresetsData().writeTextPresets(doc);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-export-text-presets', async (event) => {
        try {
            const { readTextPresets } = textPresetsData();
            const win = browserWindowFromEvent(event);
            const current = readTextPresets();
            if (!current.ok) return current;
            const result = await dialog.showSaveDialog(win || undefined, {
                title: '导出字幕文本预设',
                defaultPath: 'transub-text-presets.json',
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            refocusWindow(win);
            if (result.canceled || !result.filePath) return { ok: true, canceled: true };
            fs.writeFileSync(
                result.filePath,
                `${JSON.stringify(current.presetsDoc || { version: 1, presets: [] }, null, 2)}\n`,
                'utf8',
            );
            return { ok: true, path: result.filePath };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-import-text-presets', async (event) => {
        try {
            const { writeTextPresets } = textPresetsData();
            const win = browserWindowFromEvent(event);
            const result = await dialog.showOpenDialog(win || undefined, {
                title: '导入字幕文本预设',
                properties: ['openFile'],
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            refocusWindow(win);
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true };
            }
            const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
            const saved = writeTextPresets(parsed);
            if (!saved.ok) return saved;
            return { ok: true, presetsDoc: saved.presetsDoc, path: saved.path };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-get-editor-workflows', async () => {
        try {
            return editorWorkflowsData().readEditorWorkflows();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-save-editor-workflows', async (_event, payload = {}) => {
        try {
            const doc = payload.workflowsDoc || payload;
            return editorWorkflowsData().writeEditorWorkflows(doc);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-export-editor-workflows', async (event) => {
        try {
            const { readEditorWorkflows } = editorWorkflowsData();
            const win = browserWindowFromEvent(event);
            const current = readEditorWorkflows();
            if (!current.ok) return current;
            const result = await dialog.showSaveDialog(win || undefined, {
                title: '导出字幕编辑器工作流',
                defaultPath: 'transub-editor-workflows.json',
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            refocusWindow(win);
            if (result.canceled || !result.filePath) return { ok: true, canceled: true };
            fs.writeFileSync(
                result.filePath,
                `${JSON.stringify(current.workflowsDoc || { version: 1, workflows: [] }, null, 2)}\n`,
                'utf8',
            );
            return { ok: true, path: result.filePath };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-import-editor-workflows', async (event) => {
        try {
            const { writeEditorWorkflows, readEditorWorkflows } = editorWorkflowsData();
            const win = browserWindowFromEvent(event);
            const result = await dialog.showOpenDialog(win || undefined, {
                title: '导入字幕编辑器工作流',
                properties: ['openFile'],
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            refocusWindow(win);
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true };
            }
            const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
            const core = require('../src/js/subtitle-workflows-core');
            const incoming = core.normalizeWorkflowsDoc(parsed);
            const current = readEditorWorkflows();
            const base = current.ok ? current.workflowsDoc : core.emptyWorkflowsDoc();
            const merged = core.ensureBuiltinWorkflows(base);
            for (const wf of incoming.workflows) {
                if (wf.builtin) continue;
                const copy = {
                    ...wf,
                    id: core.makeWorkflowId(),
                    builtin: false,
                    steps: (wf.steps || []).map((s) => ({
                        ...s,
                        id: core.makeStepId(),
                        params: { ...(s.params || {}) },
                    })),
                };
                const up = core.upsertWorkflow(merged, copy);
                if (up.ok) {
                    merged.workflows = up.doc.workflows;
                    merged.activeId = up.doc.activeId;
                }
            }
            const saved = writeEditorWorkflows(merged);
            if (!saved.ok) return saved;
            return { ok: true, workflowsDoc: saved.workflowsDoc, path: saved.path };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-list-subtitle-sidecars', async (_event, payload = {}) => {
        try {
            const videoPath = asString(payload.videoPath, 4096).trim();
            const outputDir = asString(payload.outputDir, 4096).trim();
            if (!videoPath) return { ok: false, error: '缺少视频路径' };
            return listSubtitleSidecars(videoPath, outputDir || undefined);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-select-subtitle', async (event, options = {}) => {
        try {
            const win = browserWindowFromEvent(event);
            if (win && !win.isDestroyed()) {
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
            }
            const defaultPath = asString(options.defaultPath, 4096).trim();
            const result = await dialog.showOpenDialog(win || undefined, {
                title: options.title || '选择字幕文件',
                properties: ['openFile'],
                filters: [
                    { name: '字幕 (SRT / VTT / LRC)', extensions: ['srt', 'vtt', 'lrc'] },
                    { name: '所有文件', extensions: ['*'] },
                ],
                defaultPath: defaultPath || undefined,
            });
            refocusWindow(win);
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true };
            }
            const subPath = path.resolve(result.filePaths[0]);
            const videoPath = guessVideoPathForSubtitle(subPath) || '';
            return { ok: true, canceled: false, path: subPath, videoPath };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-select-editor-video', async (event, payload = {}) => {
        try {
            const win = browserWindowFromEvent(event);
            if (win && !win.isDestroyed()) {
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
            }
            const hintPath = asString(payload.defaultPath, 4096).trim();
            const defaultPath = hintPath ? path.dirname(path.resolve(hintPath)) : undefined;
            const result = await dialog.showOpenDialog(win, {
                title: payload.title || '选择关联视频',
                properties: ['openFile'],
                filters: [{ name: '视频', extensions: SUBTITLE_VIDEO_EXTENSIONS }],
                defaultPath,
            });
            refocusWindow(win);
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true };
            }
            return { ok: true, canceled: false, path: path.resolve(result.filePaths[0]) };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-guess-video-for-subtitle', async (_event, payload = {}) => {
        try {
            const subPath = asString(payload.path, 4096).trim();
            if (!subPath) return { ok: false, error: '缺少字幕路径' };
            const videoPath = guessVideoPathForSubtitle(subPath);
            return { ok: true, videoPath: videoPath || null };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-resolve-media-url', async (_event, payload = {}) => {
        try {
            const filePath = assertVideoFilePath(payload.path);
            return resolveMediaUrl(filePath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-open-latest-log', async (_event, payload = {}) => {
        try {
            return openLatestInferLog(payload.installPath);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-export-config', async (event) => {
        try {
            const win = browserWindowFromEvent(event);
            const result = await dialog.showSaveDialog(win, {
                title: '导出配置',
                defaultPath: path.join(getProjectRoot(), 'transub-config-export.json'),
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (result.canceled || !result.filePath) return { ok: true, canceled: true };
            const options = loadSettings(getAppRoot).options || {};
            fs.writeFileSync(result.filePath, `${JSON.stringify({ version: 1, options }, null, 2)}\n`, 'utf8');
            return { ok: true, path: result.filePath };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-import-config', async (event) => {
        try {
            const win = browserWindowFromEvent(event);
            const result = await dialog.showOpenDialog(win, {
                title: '导入配置',
                filters: [{ name: 'JSON', extensions: ['json'] }],
                properties: ['openFile'],
            });
            if (result.canceled || !result.filePaths?.length) return { ok: true, canceled: true };
            const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
            const options = parsed.options ?? parsed;
            if (!options || typeof options !== 'object') return { ok: false, error: '无效配置文件' };
            saveSettings(getAppRoot, options);
            try {
                const { setTrayNotifyEnabled } = require('./notifications');
                setTrayNotifyEnabled(!!options.trayNotifyEnabled);
            } catch { /* ignore */ }
            return { ok: true, options };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    // transub-get-app-version is registered in main.js (avoids loading this bridge at startup)

    register('transwithai-check-app-update', async () => {
        try {
            return await checkForAppUpdate();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-download-app-update', async (event) => {
        setUpdateProgressListener((progress) => {
            try {
                if (event?.sender && !event.sender.isDestroyed()) {
                    event.sender.send('transub-app-update-progress', progress);
                }
            } catch {
                /* ignore destroyed sender */
            }
        });
        try {
            return await downloadAppUpdate();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        } finally {
            setUpdateProgressListener(null);
        }
    });

    register('transub-quit-and-install-update', async () => {
        try {
            return quitAndInstallUpdate();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-open-update-page', async (_event, payload = {}) => {
        try {
            return await openUpdateDownload(payload.url || payload.downloadUrl || '');
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-open-path', async (_event, targetPath) => {
        try {
            const p = asString(targetPath, 4096).trim();
            if (!p) return { ok: false, error: '缺少路径' };
            const errMsg = await shell.openPath(path.resolve(p));
            return errMsg ? { ok: false, error: errMsg } : { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

}

module.exports = {
    setupExtensionsBridge,
    scanVideosInDirectory,
    appendTaskHistory,
    readSubtitleDocument,
    writeSubtitleDocument,
    normalizeSubtitleBakMode,
    resolveSubtitleBackupPath,
    scanSubtitleQc,
    listSubtitleSidecars,
    listTransWithAiModels,
    inspectWhisperModelDir,
    resolveModelDir,
};
