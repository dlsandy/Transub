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
    probeAcousticWindow,
} = require('./ffmpeg-bridge');
const { loadPresets, saveCustomPreset, deleteCustomPreset } = require('./presets-data');
const { loadTaskHistory, appendTaskHistory, clearTaskHistory } = require('./task-history');
const { loadEditorHistory, appendEditorHistory, clearEditorHistory } = require('./editor-history');
const { detectGpuEnvironment } = require('./gpu-detect');
const { resolveLocalSubtitlePath, resolveLocalSubtitleBatch, collectSubtitleSidecars, isSubtitleFile, guessVideoPathForSubtitle, MEDIA_EXTENSIONS: SUBTITLE_MEDIA_EXTENSIONS, AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } = require('./subtitle-utils');
const { isMediaExt } = require('../src/js/media-extensions-core');
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

let _systemFontCache = null;
let _systemFontCacheAt = 0;

/**
 * Best-effort system font family list (cached ~10 min).
 * Windows: System.Drawing InstalledFontCollection via PowerShell.
 */
function listSystemFontFamilies() {
    const now = Date.now();
    if (_systemFontCache && (now - _systemFontCacheAt) < 10 * 60 * 1000) {
        return Promise.resolve(_systemFontCache);
    }
    const { execFile } = require('child_process');
    return new Promise((resolve) => {
        const finish = (fonts) => {
            const list = Array.from(new Set(
                (Array.isArray(fonts) ? fonts : [])
                    .map((f) => String(f || '').trim())
                    .filter(Boolean),
            )).sort((a, b) => a.localeCompare(b, 'en'));
            _systemFontCache = list;
            _systemFontCacheAt = Date.now();
            resolve(list);
        };
        if (process.platform === 'win32') {
            const ps = [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                "Add-Type -AssemblyName System.Drawing; "
                + "[System.Drawing.Text.InstalledFontCollection]::new().Families "
                + "| ForEach-Object { $_.Name }",
            ];
            execFile('powershell.exe', ps, {
                windowsHide: true,
                timeout: 15000,
                maxBuffer: 2 * 1024 * 1024,
                encoding: 'utf8',
            }, (err, stdout) => {
                if (err) {
                    finish([]);
                    return;
                }
                finish(String(stdout || '').split(/\r?\n/));
            });
            return;
        }
        execFile('fc-list', [':family'], {
            timeout: 10000,
            maxBuffer: 2 * 1024 * 1024,
            encoding: 'utf8',
        }, (err, stdout) => {
            if (err) {
                finish([]);
                return;
            }
            const names = [];
            for (const line of String(stdout || '').split(/\r?\n/)) {
                const family = line.split(',')[0].trim();
                if (family) names.push(family);
            }
            finish(names);
        });
    });
}
const {
    checkForAppUpdate,
    downloadAppUpdate,
    quitAndInstallUpdate,
    openUpdateDownload,
    setUpdateProgressListener,
} = require('./app-updater');

function isVideoFile(filePath) {
    return isMediaExt(filePath);
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
            return { ok: false, error: `暂不支持编辑 ${format.toUpperCase()} 格式，请使用 SRT / VTT / LRC / ASS` };
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
    if (summary?.splittable) shortParts.push(`可分割 ${summary.splittable}`);
    if (summary?.connected) shortParts.push(`连续文本 ${summary.connected}`);
    if (summary?.repetition) shortParts.push(`叠词 ${summary.repetition}`);
    if (summary?.short) shortParts.push(`过短 ${summary.short}`);
    if (summary?.long) shortParts.push(`过长 ${summary.long}`);
    if (summary?.duplicate) shortParts.push(`连续重复 ${summary.duplicate}`);
    if (summary?.fluency) shortParts.push(`通顺度 ${summary.fluency}`);
    if (summary?.invalid) shortParts.push(`无效 ${summary.invalid}`);
    if (summary?.autoFixable && summary?.advisory) {
        shortParts.push(`可修 ${summary.autoFixable}`);
    }
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
 * True for JA/source archive tracks (noise may be deleted).
 * Translation tracks should blank noise so cue count stays aligned.
 */
function isSourceSubtitleTrack(filePath) {
    const base = path.basename(String(filePath || ''));
    return /\.src\.|_src\.|\.source\./i.test(base)
        || /[.\\_-]ja(?:\.|$)/i.test(base);
}

/**
 * 批量后处理：可选句读后空格、CPS 智能拆分、清理杂音/幻觉短句、压缩叠词、翻译任务简繁体，写回字幕文件。
 * 顺序：句读后空格 → CPS 拆句 → 清理杂音 → 压缩叠词 → 观影精简标点 → 简繁转换（仅繁体变体；简体目标跳过 OpenCC）。
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
        jaStitch: null,
        compressRep: null,
        viewingPunct: null,
        fillerSoften: null,
        bilingualFillerDrop: null,
        chinese: null,
        written: false,
    };

    const doSpacePunct = options.spaceAfterChinesePunctuation === true;
    const doCpsSplit = options.cpsSplit === true;
    const doNoise = options.removeNoise === true || options.removeHallucinations === true;
    const doRemoveDuplicates = options.removeDuplicates === true;
    const doCompressRep = options.compressRepetition === true;
    const sourceTrack = isSourceSubtitleTrack(doc.path);
    // Default: delete noise (not blank to 「…」). For JA↔ZH alignment use
    // removeNoiseFromSubtitlePair / removeAlignedNoiseFromCuePairs instead.
    const blankInsteadOfRemove = options.blankInsteadOfRemove === true;
    // JA mid-phrase stitch only helps source tracks; skip on ZH.
    const stitchJaFragments = options.stitchJaFragments != null
        ? options.stitchJaFragments !== false
        : sourceTrack;
    const chineseVariant = String(options.chineseSubtitleVariant || '').trim();
    // MT already emits simplified; OpenCC twp→cn is unnecessary and can corrupt 么→幺.
    const doChinese = chineseVariant === 'traditional'
        || chineseVariant === 'traditional-tw'
        || chineseVariant === 'traditional-hk'
        || chineseVariant === 'traditional-twp';

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
            fixInvalid: options.fixInvalid !== false,
            maxCps: Number(options.maxCps) || 18,
            maxSec: Number(options.maxSec) || 10,
            smartMaxChars: Number(options.smartMaxChars) || 20,
            smartLineChars: Number(options.smartLineChars) || 18,
            targetCps: Number(options.targetCps) || 3,
            gapMs: Number(options.gapMs) >= 0 ? Number(options.gapMs) : 1,
        });
        cues = fix.cues;
        result.cpsSplit = {
            summary: fix.summary,
            beforeCount: fix.beforeCount,
            afterCount: fix.afterCount,
            stats: fix.stats,
            remaining: fix.remaining,
            remainingText: fix.remainingText,
        };
    }

    if (doNoise || doRemoveDuplicates) {
        let fluency;
        try {
            fluency = require('../src/js/subtitle-fluency-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载通顺度模块' };
        }
        // Stitch JA mid-phrase ASR splits before deleting leftover fragments.
        if (doNoise && stitchJaFragments && typeof fluency.stitchJaFragmentCues === 'function') {
            const stitched = fluency.stitchJaFragmentCues(cues, {
                maxGapMs: options.jaStitchMaxGapMs,
                maxMergedDurMs: options.jaStitchMaxMergedDurMs,
            });
            if (stitched.mergedPairs > 0) {
                cues = stitched.cues;
                result.jaStitch = {
                    summary: fluency.summarizeJaStitch(stitched.stats),
                    stats: stitched.stats,
                };
            }
        }
        const noise = fluency.removeNoiseFromCues(cues, {
            removeEmpty: doNoise && options.removeEmpty !== false,
            removeFragments: doNoise && options.removeFragments !== false,
            removeSoundEffects: doNoise && options.removeSoundEffects !== false,
            removeSymbolOnly: doNoise && options.removeSymbolOnly !== false,
            removeDuplicates: doRemoveDuplicates,
            removeHallucinations: doNoise && options.removeHallucinations !== false,
            blankInsteadOfRemove,
            blankPlaceholder: options.blankPlaceholder,
        });
        cues = noise.cues;
        result.noise = {
            summary: fluency.summarizeNoiseRemoval(noise.stats),
            stats: noise.stats,
        };
        // Mens-esthe / soft-AV ASR mishears on source tracks (免税→メンエス …)
        if (doNoise && options.jaAsrDomainFix !== false) {
            try {
                const mtSanitize = require('../src/js/mt-sanitize-core');
                if (typeof mtSanitize.correctJaAsrDomainMishearsInCues === 'function') {
                    const domain = mtSanitize.correctJaAsrDomainMishearsInCues(cues);
                    if (domain.changed > 0) {
                        cues = domain.cues;
                        result.jaAsrDomain = {
                            changed: domain.changed,
                            summary: `ASR领域纠错 ${domain.changed} 条`,
                        };
                    }
                }
            } catch { /* domain fix optional */ }
        }
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

    const doViewingPunctLevel = (() => {
        const fluency = (() => {
            try { return require('../src/js/subtitle-fluency-core'); } catch { return null; }
        })();
        const norm = fluency?.normalizeViewingCleanLevel
            || ((v, fb) => {
                const s = String(v ?? '').toLowerCase();
                if (s === 'off' || s === 'light' || s === 'clear') return s;
                return fb;
            });
        if (options.viewingPunctMode != null || options.simplifyViewingPunctuationLevel != null) {
            return norm(options.viewingPunctMode || options.simplifyViewingPunctuationLevel, 'off');
        }
        if (options.simplifyViewingPunctuation === true) return 'light';
        if (options.simplifyViewingPunctuation === false) return 'off';
        return 'off';
    })();
    if (doViewingPunctLevel !== 'off') {
        let fluency;
        try {
            fluency = require('../src/js/subtitle-fluency-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载通顺度模块' };
        }
        const simplified = fluency.simplifyViewingPunctuationInCues(cues, {
            level: doViewingPunctLevel,
        });
        cues = simplified.cues;
        result.viewingPunct = {
            summary: simplified.summary,
            stats: simplified.stats,
        };
    }

    // 语气/拟声轻度：仅压缩纯条目叠写，不删条（清除档在成对路径里做）
    const softenDiscourse = options.softenDiscourseFillers === true;
    const softenOnomatopoeia = options.softenOnomatopoeiaFillers === true;
    if (softenDiscourse || softenOnomatopoeia) {
        let fluency;
        try {
            fluency = require('../src/js/subtitle-fluency-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载通顺度模块' };
        }
        const lang = sourceTrack ? 'ja' : 'zh';
        const softStats = { cueTouched: 0, parts: [] };
        if (softenDiscourse && typeof fluency.softenPureFillerInCues === 'function') {
            const soft = fluency.softenPureFillerInCues(cues, { kind: 'discourse', lang });
            cues = soft.cues;
            if (soft.stats?.cueTouched) {
                softStats.cueTouched += soft.stats.cueTouched;
                softStats.parts.push(soft.summary);
            }
        }
        if (softenOnomatopoeia && typeof fluency.softenPureFillerInCues === 'function') {
            const soft = fluency.softenPureFillerInCues(cues, { kind: 'onomatopoeia', lang });
            cues = soft.cues;
            if (soft.stats?.cueTouched) {
                softStats.cueTouched += soft.stats.cueTouched;
                softStats.parts.push(soft.summary);
            }
        }
        if (softStats.cueTouched) {
            result.fillerSoften = {
                summary: softStats.parts.join(' · '),
                stats: softStats,
            };
        }
    }

    // 合并双语轨：清除档时按行内 JA+ZH 成对删除纯语气/拟声（无需旁路原文文件）
    const dropBiDiscourse = options.dropBilingualDiscourse === true
        || (options.dropBilingualPureFillers === true
            && options.dropBilingualDiscourse == null
            && options.dropBilingualOnomatopoeia == null);
    const dropBiOnomatopoeia = options.dropBilingualOnomatopoeia === true
        || (options.dropBilingualPureFillers === true
            && options.dropBilingualDiscourse == null
            && options.dropBilingualOnomatopoeia == null);
    if (dropBiDiscourse || dropBiOnomatopoeia) {
        let fluency;
        try {
            fluency = require('../src/js/subtitle-fluency-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载通顺度模块' };
        }
        if (typeof fluency.dropPureFillerBilingualCues === 'function') {
            const dropped = fluency.dropPureFillerBilingualCues(cues, {
                dropDiscourse: dropBiDiscourse,
                dropOnomatopoeia: dropBiOnomatopoeia,
            });
            if (!dropped.skipped && dropped.dropped) {
                cues = dropped.cues;
                result.bilingualFillerDrop = {
                    summary: dropped.summary,
                    dropped: dropped.dropped,
                    droppedIndexes: dropped.droppedIndexes,
                };
            }
        }
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
        const convertOpts = typeof chinese.variantToConvertOptions === 'function'
            ? chinese.variantToConvertOptions(chineseVariant)
            : { direction: 's2t', locale: 'twp' };
        const converted = chinese.convertCues(cues, {
            direction: convertOpts.direction,
            locale: convertOpts.locale,
            protectTerms: protectTerms || [],
        });
        cues = converted.cues;
        result.chinese = {
            summary: converted.summary,
            stats: converted.stats,
        };
    }

    result.afterCount = cues.length;
    const noiseTouched = result.noise && (
        Number(result.noise.stats?.removed) > 0
        || Number(result.noise.stats?.blanked) > 0
        || Number(result.noise.stats?.asrNameLoops) > 0
        || Number(result.noise.stats?.asrNormalize) > 0
    );
    const changed = result.afterCount !== result.beforeCount
        || (result.spacePunct && Number(result.spacePunct.stats?.cueTouched) > 0)
        || (result.cpsSplit && Number(result.cpsSplit.stats?.affected) > 0)
        || noiseTouched
        || (result.jaStitch && Number(result.jaStitch.stats?.mergedPairs) > 0)
        || (result.jaAsrDomain && Number(result.jaAsrDomain.changed) > 0)
        || (result.compressRep && Number(result.compressRep.stats?.cueTouched) > 0)
        || (result.viewingPunct && Number(result.viewingPunct.stats?.cueTouched) > 0)
        || (result.fillerSoften && Number(result.fillerSoften.stats?.cueTouched) > 0)
        || (result.bilingualFillerDrop && Number(result.bilingualFillerDrop.dropped) > 0)
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
    if (result.noise?.summary && (result.noise.stats?.removed || result.noise.stats?.blanked)) {
        parts.push(result.noise.summary);
    }
    if (result.compressRep?.summary && result.compressRep.stats?.cueTouched) {
        parts.push(result.compressRep.summary.replace(/^将/, '已'));
    }
    if (result.viewingPunct?.summary && result.viewingPunct.stats?.cueTouched) {
        parts.push(result.viewingPunct.summary);
    }
    if (result.fillerSoften?.summary && result.fillerSoften.stats?.cueTouched) {
        parts.push(result.fillerSoften.summary);
    }
    if (result.bilingualFillerDrop?.summary && result.bilingualFillerDrop.dropped) {
        parts.push(result.bilingualFillerDrop.summary);
    }
    if (result.chinese?.summary && result.chinese.stats?.cueTouched) parts.push(result.chinese.summary);
    return {
        ...result,
        written: true,
        summary: parts.join('；') || `已更新（${result.beforeCount} → ${result.afterCount} 条）`,
    };
}

/**
 * Delete noise from ZH+JA subtitle files together (union of noisy indexes) and renumber.
 * Keeps JA↔ZH cue counts aligned without blanking ZH to 「…」.
 * @param {string} targetPath
 * @param {string} sourcePath
 * @param {object} [options]
 */
function removeNoiseFromSubtitlePair(targetPath, sourcePath = '', options = {}) {
    const target = readSubtitleDocument(targetPath);
    if (!target.ok) return target;

    let sourceCues = Array.isArray(options.sourceCues) ? options.sourceCues : [];
    const srcPath = String(sourcePath || options.sourcePath || '').trim();
    let sourceDoc = null;
    if (srcPath) {
        try {
            if (fs.existsSync(path.resolve(srcPath))) {
                sourceDoc = readSubtitleDocument(srcPath);
                if (sourceDoc.ok && Array.isArray(sourceDoc.cues) && sourceDoc.cues.length) {
                    sourceCues = sourceDoc.cues;
                }
            }
        } catch { /* keep sourceCues fallback */ }
    }
    if (!sourceCues.length) {
        return {
            ok: true,
            removed: 0,
            skipped: true,
            reason: 'no_source',
            path: target.path,
        };
    }

    let fluency;
    try {
        fluency = require('../src/js/subtitle-fluency-core');
    } catch (err) {
        return { ok: false, error: err.message || '无法加载通顺度模块' };
    }
    if (typeof fluency.removeAlignedNoiseFromCuePairs !== 'function') {
        return { ok: false, error: '通顺度模块缺少成对清噪接口' };
    }

    const before = target.cues.length;
    const cleaned = fluency.removeAlignedNoiseFromCuePairs(target.cues, sourceCues, {
        removeEmpty: options.removeEmpty !== false,
        removeFragments: options.removeFragments !== false,
        removeSoundEffects: options.removeSoundEffects !== false,
        removeSymbolOnly: options.removeSymbolOnly !== false,
        removeDuplicates: options.removeDuplicates !== false,
        removeHallucinations: options.removeHallucinations !== false,
        hallucinationMaxChars: options.hallucinationMaxChars,
        hallucinationMaxDurMs: options.hallucinationMaxDurMs,
    });
    if (cleaned.skipped) {
        return {
            ok: true,
            removed: 0,
            skipped: true,
            reason: cleaned.reason || 'skipped',
            path: target.path,
            sourcePath: srcPath || undefined,
        };
    }
    if (!cleaned.stats?.removed) {
        return {
            ok: true,
            removed: 0,
            path: target.path,
            sourcePath: srcPath || undefined,
            summary: fluency.summarizeNoiseRemoval(cleaned.stats),
        };
    }
    if (!cleaned.zhCues.length) {
        return {
            ok: false,
            error: '清噪后无剩余字幕，已取消写入',
            removed: cleaned.stats?.removed || 0,
            path: target.path,
        };
    }

    const writtenZh = writeSubtitleDocument(target.path, {
        cues: cleaned.zhCues,
        format: target.format,
        header: target.header,
        backupMode: options.backupMode || 'off',
    });
    if (!writtenZh.ok) return writtenZh;

    let sourceWritten = false;
    if (
        options.writeSource !== false
        && sourceDoc?.ok
        && srcPath
        && fs.existsSync(path.resolve(srcPath))
    ) {
        const srcWrite = writeSubtitleDocument(sourceDoc.path, {
            cues: cleaned.jaCues,
            format: sourceDoc.format,
            header: sourceDoc.header,
            backupMode: options.backupMode || 'off',
        });
        sourceWritten = !!srcWrite.ok;
    }

    return {
        ok: true,
        removed: cleaned.stats?.removed || 0,
        beforeCount: before,
        afterCount: cleaned.zhCues.length,
        path: target.path,
        sourcePath: srcPath || undefined,
        sourceWritten,
        stats: cleaned.stats,
        summary: fluency.summarizeNoiseRemoval(cleaned.stats),
        written: true,
    };
}

/**
 * Optional compact delivery: drop pure interjection / moan cues from both ZH and JA
 * when both sides are filler-only, then renumber on write.
 * @param {string} targetPath - Chinese / translation subtitle
 * @param {string} [sourcePath] - Japanese / ASR source subtitle
 * @param {object} [options]
 * @returns {{ ok: boolean, dropped?: number, skipped?: boolean, reason?: string, path?: string, sourcePath?: string, summary?: string, error?: string }}
 */
function compactPureInterjectionSubtitlePair(targetPath, sourcePath = '', options = {}) {
    const target = readSubtitleDocument(targetPath);
    if (!target.ok) return target;

    let sourceCues = Array.isArray(options.sourceCues) ? options.sourceCues : [];
    const srcPath = String(sourcePath || options.sourcePath || '').trim();
    let sourceDoc = null;
    if (srcPath) {
        try {
            if (fs.existsSync(path.resolve(srcPath))) {
                sourceDoc = readSubtitleDocument(srcPath);
                if (sourceDoc.ok && Array.isArray(sourceDoc.cues) && sourceDoc.cues.length) {
                    sourceCues = sourceDoc.cues;
                }
            }
        } catch { /* keep sourceCues fallback */ }
    }
    if (!sourceCues.length) {
        return {
            ok: true,
            dropped: 0,
            skipped: true,
            reason: 'no_source',
            path: target.path,
        };
    }

    let fluency;
    try {
        fluency = require('../src/js/subtitle-fluency-core');
    } catch (err) {
        return { ok: false, error: err.message || '无法加载通顺度模块' };
    }
    if (typeof fluency.dropPureInterjectionPairs !== 'function') {
        return { ok: false, error: '通顺度模块缺少成对精简接口' };
    }

    const before = target.cues.length;
    const dropDiscourse = options.dropDiscourse !== false;
    const dropOnomatopoeia = options.dropOnomatopoeia !== false;
    const droppedRes = fluency.dropPureInterjectionPairs(target.cues, sourceCues, {
        dropDiscourse,
        dropOnomatopoeia,
    });
    if (droppedRes.skipped) {
        return {
            ok: true,
            dropped: 0,
            skipped: true,
            reason: droppedRes.reason || 'skipped',
            path: target.path,
            sourcePath: srcPath || undefined,
        };
    }
    if (!droppedRes.dropped) {
        return {
            ok: true,
            dropped: 0,
            path: target.path,
            sourcePath: srcPath || undefined,
            summary: fluency.summarizePureInterjectionDrop?.(0, {
                dropDiscourse,
                dropOnomatopoeia,
            })
                || '未发现可清除的纯语气/拟声条目',
        };
    }

    const writtenZh = writeSubtitleDocument(target.path, {
        cues: droppedRes.zhCues,
        format: target.format,
        header: target.header,
        backupMode: options.backupMode || 'off',
    });
    if (!writtenZh.ok) return writtenZh;

    let writtenSrc = false;
    if (
        options.writeSource !== false
        && sourceDoc?.ok
        && srcPath
        && fs.existsSync(path.resolve(srcPath))
    ) {
        const srcWrite = writeSubtitleDocument(sourceDoc.path, {
            cues: droppedRes.jaCues,
            format: sourceDoc.format,
            header: sourceDoc.header,
            backupMode: options.backupMode || 'off',
        });
        writtenSrc = !!srcWrite.ok;
    }

    const summary = fluency.summarizePureInterjectionDrop?.(droppedRes.dropped, {
        dropDiscourse,
        dropOnomatopoeia,
    })
        || `清除纯语气/拟声 ${droppedRes.dropped} 条`;
    return {
        ok: true,
        dropped: droppedRes.dropped,
        beforeCount: before,
        afterCount: droppedRes.zhCues.length,
        path: target.path,
        sourcePath: srcPath || undefined,
        sourceWritten: writtenSrc,
        summary,
    };
}

/**
 * File-level MT sanitize: strip trailing hallucinated names / Gloss / loops on ZH
 * against the JA source (covers Opus path and any adapter miss).
 * @param {string} targetPath - Chinese / translation subtitle
 * @param {string} [sourcePath] - Japanese / ASR source subtitle
 * @param {object} [options]
 * @returns {{ ok: boolean, changed?: number, skipped?: boolean, reason?: string, path?: string, summary?: string, flags?: object, error?: string }}
 */
function sanitizeMtSubtitlePair(targetPath, sourcePath = '', options = {}) {
    const target = readSubtitleDocument(targetPath);
    if (!target.ok) return target;

    let sourceCues = Array.isArray(options.sourceCues) ? options.sourceCues : [];
    const srcPath = String(sourcePath || options.sourcePath || '').trim();
    if (srcPath) {
        try {
            if (fs.existsSync(path.resolve(srcPath))) {
                const src = readSubtitleDocument(srcPath);
                if (src.ok && Array.isArray(src.cues) && src.cues.length) {
                    sourceCues = src.cues;
                }
            }
        } catch { /* keep sourceCues fallback */ }
    }
    if (!sourceCues.length) {
        return {
            ok: true,
            changed: 0,
            skipped: true,
            reason: 'no_source',
            path: target.path,
        };
    }

    // Drop Whisper JA name-loops on source before justify / ZH sanitize
    let sourceAsrCleaned = 0;
    try {
        const jaNames = require('../src/js/ja-person-names-core');
        if (typeof jaNames.stripAsrHallucinationLoopsInCues === 'function') {
            const srcClean = jaNames.stripAsrHallucinationLoopsInCues(sourceCues);
            sourceCues = srcClean.cues;
            sourceAsrCleaned = srcClean.changed || 0;
        }
    } catch { /* source ASR clean optional */ }

    // Mens-esthe / soft-AV ASR mishears (免税→メンエス, 本島→オイル, …)
    let sourceDomainCleaned = 0;
    try {
        const mtSanitizePre = require('../src/js/mt-sanitize-core');
        if (typeof mtSanitizePre.correctJaAsrDomainMishearsInCues === 'function') {
            const domainClean = mtSanitizePre.correctJaAsrDomainMishearsInCues(sourceCues);
            sourceCues = domainClean.cues;
            sourceDomainCleaned = domainClean.changed || 0;
        }
    } catch { /* domain ASR clean optional */ }

    if (
        (sourceAsrCleaned > 0 || sourceDomainCleaned > 0)
        && options.cleanSource !== false
        && srcPath
        && fs.existsSync(path.resolve(srcPath))
    ) {
        try {
            const srcDoc = readSubtitleDocument(srcPath);
            if (srcDoc.ok) {
                writeSubtitleDocument(srcDoc.path, {
                    cues: sourceCues,
                    format: srcDoc.format,
                    header: srcDoc.header,
                    backupMode: options.backupMode || 'off',
                });
            }
        } catch { /* keep going */ }
    }

    let mtSanitize;
    try {
        mtSanitize = require('../src/js/mt-sanitize-core');
    } catch (err) {
        return { ok: false, error: err.message || '无法加载译后清洗模块' };
    }

    const cleaned = mtSanitize.sanitizeMtCues(target.cues, sourceCues, {
        glossary: options.glossary,
        glossaryTerms: options.glossaryTerms,
        nameMap: options.nameMap,
        unifyNames: options.unifyNames !== false,
        sakuraNsfwPrompt: options.sakuraNsfwPrompt,
        nsfwPrompt: options.nsfwPrompt,
        contentProfile: options.contentProfile || options.senseProfile,
        senseProfile: options.senseProfile || options.contentProfile,
        faithfulTone: options.faithfulTone || options.smartTranslateFaithfulTone,
        smartTranslateFaithfulTone: options.smartTranslateFaithfulTone || options.faithfulTone,
        applyNsfwLexicon: options.applyNsfwLexicon,
        // Source already domain-corrected above; avoid double-counting flags only
        skipJaAsrDomain: sourceDomainCleaned > 0,
    });

    // Prefer domain-corrected source from sanitize when it rewrote again
    if (Array.isArray(cleaned.sourceCues) && cleaned.jaAsrDomainChanged > 0) {
        sourceCues = cleaned.sourceCues;
        sourceDomainCleaned += cleaned.jaAsrDomainChanged;
        if (options.cleanSource !== false && srcPath && fs.existsSync(path.resolve(srcPath))) {
            try {
                const srcDoc = readSubtitleDocument(srcPath);
                if (srcDoc.ok) {
                    writeSubtitleDocument(srcDoc.path, {
                        cues: sourceCues,
                        format: srcDoc.format,
                        header: srcDoc.header,
                        backupMode: options.backupMode || 'off',
                    });
                }
            } catch { /* ignore */ }
        }
    }

    if (!cleaned.changed) {
        return {
            ok: true,
            changed: 0,
            sourceAsrCleaned,
            sourceDomainCleaned,
            path: target.path,
            flags: cleaned.flags || {},
            summary: [
                sourceAsrCleaned ? `ASR叠名清理 ${sourceAsrCleaned} 条` : '',
                sourceDomainCleaned ? `ASR领域纠错 ${sourceDomainCleaned} 条` : '',
            ].filter(Boolean).join(' · ') || undefined,
        };
    }

    const written = writeSubtitleDocument(target.path, {
        cues: cleaned.cues,
        format: target.format,
        header: target.header,
        backupMode: options.backupMode || 'off',
    });
    if (!written.ok) return written;

    const bits = [`译后清洗 ${cleaned.changed} 条`];
    if (sourceAsrCleaned) bits.push(`ASR叠名 ${sourceAsrCleaned}`);
    if (sourceDomainCleaned) bits.push(`ASR领域 ${sourceDomainCleaned}`);
    return {
        ok: true,
        changed: cleaned.changed,
        sourceAsrCleaned,
        sourceDomainCleaned,
        path: target.path,
        flags: cleaned.flags || {},
        summary: bits.join(' · '),
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
    if (!fs.existsSync(resolved)) return { ok: false, error: '媒体文件不存在' };
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
        const editable = isEditableFormat(format);
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

    register('ffmpeg-probe-acoustic', async (_event, payload = {}) => {
        try {
            const filePath = asString(payload.path || payload.mediaPath, 4096).trim();
            if (!filePath) return { ok: false, error: '缺少路径' };
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPath = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            return await probeAcousticWindow(filePath, {
                ffmpegPath,
                durationSec: payload.durationSec,
                startSec: payload.startSec,
                noiseDb: payload.noiseDb,
                minSilenceSec: payload.minSilenceSec,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-sense-memory-lookup', async (_event, payload = {}) => {
        try {
            const { lookupSenseMemory } = require('./sense-memory');
            const keys = Array.isArray(payload.keys) ? payload.keys : [];
            return lookupSenseMemory(keys);
        } catch (err) {
            return { ok: false, error: err.message || String(err), hits: [] };
        }
    });

    register('transub-sense-memory-record', async (_event, payload = {}) => {
        try {
            const { recordSenseMemory } = require('./sense-memory');
            return recordSenseMemory(payload || {});
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-sense-memory-stats', async () => {
        try {
            const { getSenseMemoryStats } = require('./sense-memory');
            return getSenseMemoryStats();
        } catch (err) {
            return { ok: false, error: err.message || String(err), count: 0 };
        }
    });

    register('transub-sense-memory-clear', async () => {
        try {
            const { clearSenseMemory } = require('./sense-memory');
            return clearSenseMemory();
        } catch (err) {
            return { ok: false, error: err.message || String(err), cleared: 0 };
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

    register('transub-env-check', async (_event, payload = {}) => {
        try {
            const { runEnvCheck } = require('./env-check');
            const settings = loadSettings(getAppRoot).options || {};
            const ffmpegPath = payload.ffmpegPath != null
                ? asString(payload.ffmpegPath, 4096).trim()
                : settings.ffmpegPath;
            const engineInstallPath = payload.engineInstallPath != null
                ? asString(payload.engineInstallPath, 4096).trim()
                : String(settings.engineInstallPath || '').trim();
            const engineAsrModel = payload.engineAsrModel != null
                ? asString(payload.engineAsrModel, 128).trim()
                : String(settings.engineAsrModel || '').trim();
            return await runEnvCheck({
                ffmpegPath,
                engineInstallPath,
                engineAsrModel,
                // Wizard passes syncLlamaBackend:true to force CUDA 12/13 preference.
                syncLlamaBackend: !!payload.syncLlamaBackend,
                scope: payload.scope != null
                    ? asString(payload.scope, 32).trim()
                    : 'full',
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err), items: [] };
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

    register('transwithai-export-preset', async (event, payload = {}) => {
        try {
            const id = String(payload.id || '').trim();
            if (!id) return { ok: false, error: '缺少预设 id' };
            const preset = loadPresets().presets.find((p) => p.id === id);
            if (!preset) return { ok: false, error: '未找到该预设' };
            const win = browserWindowFromEvent(event);
            // eslint-disable-next-line no-control-regex -- strip Windows-illegal / control chars from filename
            const safeName = String(preset.name || 'preset').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 64);
            const result = await dialog.showSaveDialog(win, {
                title: '导出预设',
                defaultPath: path.join(getProjectRoot(), `${safeName}.json`),
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (result.canceled || !result.filePath) return { ok: true, canceled: true };
            fs.writeFileSync(result.filePath, `${JSON.stringify(preset, null, 2)}\n`, 'utf8');
            return { ok: true, path: result.filePath };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transwithai-import-preset', async (event) => {
        try {
            const win = browserWindowFromEvent(event);
            const result = await dialog.showOpenDialog(win, {
                title: '导入预设',
                filters: [{ name: 'JSON', extensions: ['json'] }],
                properties: ['openFile'],
            });
            if (result.canceled || !result.filePaths?.length) return { ok: true, canceled: true };
            const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
            const name = String(parsed?.name || '').trim();
            const options = parsed?.options && typeof parsed.options === 'object' ? parsed.options : null;
            if (!name || !options) return { ok: false, error: '文件需包含 name 与 options' };
            const preset = saveCustomPreset({ name, options });
            return { ok: true, preset, presets: loadPresets().presets };
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

    register('transub-library-status', async () => {
        try {
            const { getLibraryStatus } = require('./subtitle-library');
            return getLibraryStatus();
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-list', async (_event, payload = {}) => {
        try {
            const { listMediaSummaries } = require('./subtitle-library');
            return listMediaSummaries({
                query: payload.query || '',
                presetId: payload.presetId || '',
                mtModel: payload.mtModel || '',
                asrModel: payload.asrModel || '',
                mtProvider: payload.mtProvider || '',
                tag: payload.tag || '',
                recipeQuery: payload.recipeQuery || '',
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-get-media', async (_event, payload = {}) => {
        try {
            const { getMediaDetail } = require('./subtitle-library');
            const id = String(payload.mediaId || payload.id || '').trim();
            if (!id) return { ok: false, error: '缺少作品 ID' };
            return getMediaDetail(id, {
                presetId: payload.presetId || '',
                mtModel: payload.mtModel || '',
                asrModel: payload.asrModel || '',
                mtProvider: payload.mtProvider || '',
                tag: payload.tag || '',
                recipeQuery: payload.recipeQuery || '',
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-set-active', async (_event, payload = {}) => {
        try {
            const { setActiveVersion } = require('./subtitle-library');
            const versionId = String(payload.versionId || '').trim();
            if (!versionId) return { ok: false, error: '缺少版本 ID' };
            return setActiveVersion(versionId, {
                writeExport: payload.writeExport !== false,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-open-version', async (_event, payload = {}) => {
        try {
            const { openVersionPaths } = require('./subtitle-library');
            const versionId = String(payload.versionId || '').trim();
            if (!versionId) return { ok: false, error: '缺少版本 ID' };
            return openVersionPaths(versionId);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-preview-version', async (_event, payload = {}) => {
        try {
            const { previewVersion } = require('./subtitle-library');
            const versionId = String(payload.versionId || '').trim();
            if (!versionId) return { ok: false, error: '缺少版本 ID' };
            return previewVersion(versionId, {
                maxLines: payload.maxLines,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-load-version-cues', async (_event, payload = {}) => {
        try {
            const { loadVersionPlayback } = require('./subtitle-library');
            const versionId = String(payload.versionId || '').trim();
            if (!versionId) return { ok: false, error: '缺少版本 ID' };
            return loadVersionPlayback(versionId);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-diff', async (_event, payload = {}) => {
        try {
            const { diffVersions, diffAbPair } = require('./subtitle-library');
            if (payload.abPair || payload.trackId) {
                const trackId = String(payload.trackId || '').trim();
                if (!trackId) return { ok: false, error: '缺少轨道 ID' };
                return diffAbPair(trackId);
            }
            const a = String(payload.versionIdA || payload.a || '').trim();
            const b = String(payload.versionIdB || payload.b || '').trim();
            if (!a || !b) return { ok: false, error: '请选择两个版本' };
            return diffVersions(a, b);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-set-status', async (_event, payload = {}) => {
        try {
            const { setVersionStatus } = require('./subtitle-library');
            const versionId = String(payload.versionId || '').trim();
            const status = String(payload.status || '').trim();
            if (!versionId) return { ok: false, error: '缺少版本 ID' };
            return setVersionStatus(versionId, status);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-delete-version', async (_event, payload = {}) => {
        try {
            const { deleteVersion } = require('./subtitle-library');
            const versionId = String(payload.versionId || '').trim();
            if (!versionId) return { ok: false, error: '缺少版本 ID' };
            return deleteVersion(versionId);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-delete-media', async (_event, payload = {}) => {
        try {
            const { deleteMedia, deleteMediaBatch } = require('./subtitle-library');
            const mediaIds = Array.isArray(payload.mediaIds)
                ? payload.mediaIds
                : (payload.mediaId != null ? [payload.mediaId] : []);
            const ids = mediaIds.map((id) => String(id || '').trim()).filter(Boolean);
            if (!ids.length) return { ok: false, error: '缺少作品 ID' };
            if (ids.length === 1) return deleteMedia(ids[0]);
            return deleteMediaBatch(ids);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-set-note', async (_event, payload = {}) => {
        try {
            const { setVersionNote } = require('./subtitle-library');
            const versionId = String(payload.versionId || '').trim();
            if (!versionId) return { ok: false, error: '缺少版本 ID' };
            return setVersionNote(versionId, payload.note);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-set-ab-tag', async (_event, payload = {}) => {
        try {
            const { setVersionAbTag } = require('./subtitle-library');
            const versionId = String(payload.versionId || '').trim();
            if (!versionId) return { ok: false, error: '缺少版本 ID' };
            return setVersionAbTag(versionId, payload.abTag ?? payload.tag ?? '');
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-prepare-mt-train', async (_event, payload = {}) => {
        try {
            const { prepareLibraryMtTrainPair } = require('./subtitle-library');
            const mediaId = String(payload.mediaId || '').trim();
            if (!mediaId) return { ok: false, error: '缺少作品 ID' };
            return prepareLibraryMtTrainPair(mediaId, {
                preferTag: payload.preferTag || '',
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-export-pack', async (event, payload = {}) => {
        try {
            const { exportPublishPack, exportPublishPackBatch } = require('./subtitle-library');
            const mediaIds = Array.isArray(payload.mediaIds)
                ? payload.mediaIds.map((id) => String(id || '').trim()).filter(Boolean)
                : [];
            const mediaId = String(payload.mediaId || '').trim();
            const ids = mediaIds.length ? [...new Set(mediaIds)] : (mediaId ? [mediaId] : []);
            if (!ids.length) return { ok: false, error: '缺少作品 ID' };
            const win = browserWindowFromEvent(event);
            const result = await dialog.showOpenDialog(win || undefined, {
                title: ids.length > 1 ? '选择批量发布包导出目录' : '选择发布包导出目录',
                properties: ['openDirectory', 'createDirectory'],
            });
            refocusWindow(win);
            if (result.canceled || !result.filePaths?.[0]) {
                return { ok: true, canceled: true };
            }
            const preferPublished = payload.preferPublished !== false;
            if (ids.length === 1) {
                return exportPublishPack(ids[0], result.filePaths[0], { preferPublished });
            }
            return exportPublishPackBatch(ids, result.filePaths[0], { preferPublished });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-export-tags', async (event, payload = {}) => {
        try {
            const { exportTaggedVersions } = require('./subtitle-library');
            const mediaId = String(payload.mediaId || '').trim();
            if (!mediaId) return { ok: false, error: '缺少作品 ID' };
            const tags = Array.isArray(payload.tags) && payload.tags.length
                ? payload.tags
                : ['对照A', '对照B'];
            const win = browserWindowFromEvent(event);
            const result = await dialog.showOpenDialog(win || undefined, {
                title: '选择对照组导出目录',
                properties: ['openDirectory', 'createDirectory'],
            });
            refocusWindow(win);
            if (result.canceled || !result.filePaths?.[0]) {
                return { ok: true, canceled: true };
            }
            return exportTaggedVersions(mediaId, result.filePaths[0], { tags });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-export-corpus', async (event, payload = {}) => {
        try {
            const { exportCorpusJsonl } = require('./subtitle-library');
            const win = browserWindowFromEvent(event);
            const result = await dialog.showSaveDialog(win || undefined, {
                title: '导出语料 JSONL',
                defaultPath: 'transub-library-corpus.jsonl',
                filters: [
                    { name: 'JSONL', extensions: ['jsonl'] },
                    { name: 'JSON', extensions: ['json'] },
                ],
            });
            refocusWindow(win);
            if (result.canceled || !result.filePath) {
                return { ok: true, canceled: true };
            }
            return exportCorpusJsonl(result.filePath, {
                statuses: Array.isArray(payload.statuses) ? payload.statuses : undefined,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-set-media-path', async (event, payload = {}) => {
        try {
            const {
                setMediaAssociation,
            } = require('./subtitle-library');
            const mediaId = String(payload.mediaId || '').trim();
            if (!mediaId) return { ok: false, error: '缺少作品 ID' };
            if (payload.clear) {
                return setMediaAssociation(mediaId, '', { clear: true });
            }
            let mediaPath = String(payload.mediaPath || '').trim();
            if (payload.pick || !mediaPath) {
                const { MEDIA_EXTENSIONS } = require('../src/js/media-extensions-core');
                const win = browserWindowFromEvent(event);
                const result = await dialog.showOpenDialog(win || undefined, {
                    title: '选择关联的音视频',
                    properties: ['openFile'],
                    filters: [
                        { name: '音视频', extensions: [...MEDIA_EXTENSIONS] },
                        { name: '所有文件', extensions: ['*'] },
                    ],
                });
                refocusWindow(win);
                if (result.canceled || !result.filePaths?.[0]) {
                    return { ok: true, canceled: true };
                }
                mediaPath = result.filePaths[0];
            }
            return setMediaAssociation(mediaId, mediaPath, {
                updateTitle: payload.updateTitle === true,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-rename-media', async (_event, payload = {}) => {
        try {
            const { renameMediaTitle } = require('./subtitle-library');
            const mediaId = String(payload.mediaId || '').trim();
            const title = String(payload.title || '');
            if (!mediaId) return { ok: false, error: '缺少作品 ID' };
            return renameMediaTitle(mediaId, title);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-suggest-media', async (_event, payload = {}) => {
        try {
            const { suggestMediaAssociation } = require('./subtitle-library');
            const mediaId = String(payload.mediaId || '').trim();
            if (!mediaId) return { ok: false, error: '缺少作品 ID' };
            return suggestMediaAssociation(mediaId);
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-auto-link-media', async (_event, payload = {}) => {
        try {
            const { autoLinkMediaAssociation } = require('./subtitle-library');
            const mediaId = String(payload.mediaId || '').trim();
            if (!mediaId) return { ok: false, error: '缺少作品 ID' };
            return autoLinkMediaAssociation(mediaId, {
                updateTitle: payload.updateTitle === true,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-auto-link-media-batch', async (_event, payload = {}) => {
        try {
            const { autoLinkMediaBatch } = require('./subtitle-library');
            const mediaIds = Array.isArray(payload.mediaIds) ? payload.mediaIds : null;
            return autoLinkMediaBatch(mediaIds, {
                onlyUnlinkedOrMissing: payload.onlyUnlinkedOrMissing !== false,
                updateTitle: payload.updateTitle === true,
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-library-prepare-rerun', async (_event, payload = {}) => {
        try {
            const { prepareLibraryRerun } = require('./subtitle-library');
            const versionId = String(payload.versionId || '').trim();
            if (!versionId) return { ok: false, error: '缺少版本 ID' };
            return prepareLibraryRerun(versionId, {
                presetId: payload.presetId || '',
            });
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-clear-transcript-cache', async (_event, payload = {}) => {
        try {
            const { clearTranscriptKeepDir, resolveTranscriptKeepDir } = require('./transcript-keep');
            let options = payload && typeof payload === 'object' ? { ...payload } : {};
            if (!Object.keys(options).filter((k) => k !== 'force').length) {
                try {
                    const { loadSettings } = require('./settings-data');
                    options = { ...(loadSettings()?.options || {}), force: options.force !== false };
                } catch { /* ignore */ }
            }
            // Manual clear from settings should remove pinned files too unless force:false.
            if (options.force == null) options.force = true;
            const result = clearTranscriptKeepDir(options);
            return {
                ok: true,
                ...result,
                dir: result.dir || resolveTranscriptKeepDir(options),
            };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-find-kept-transcript', async (_event, payload = {}) => {
        try {
            const { findKeptTranscript } = require('./transcript-keep');
            let options = {};
            try {
                const { loadSettings } = require('./settings-data');
                options = loadSettings()?.options || {};
            } catch { /* ignore */ }
            if (payload?.options && typeof payload.options === 'object') {
                options = { ...options, ...payload.options };
            }
            return findKeptTranscript({
                videoPath: payload?.videoPath || '',
                subPath: payload?.subPath || payload?.path || '',
                stem: payload?.stem || '',
                options,
            });
        } catch (err) {
            return { ok: false, found: false, error: err.message || String(err) };
        }
    });

    register('transub-pin-kept-transcript', async (_event, payload = {}) => {
        try {
            const { pinKeptTranscript, unpinKeptTranscript } = require('./transcript-keep');
            const filePath = String(payload?.path || '').trim();
            if (!filePath) return { ok: false, error: '缺少路径' };
            if (payload?.unpin) {
                return unpinKeptTranscript(filePath, { hard: payload.hard !== false });
            }
            return pinKeptTranscript(filePath, { hard: !!payload?.hard });
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

    register('transub-compact-pure-interjections', async (_event, payload = {}) => {
        try {
            const targetPath = assertEditableSubtitlePath(payload.path || payload.targetPath);
            const sourcePath = payload.sourcePath
                ? assertEditableSubtitlePath(payload.sourcePath)
                : '';
            return compactPureInterjectionSubtitlePair(
                targetPath,
                sourcePath,
                payload.options || payload || {},
            );
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-merge-bilingual-subtitles', async (_event, payload = {}) => {
        try {
            const sourcePath = assertEditableSubtitlePath(payload.sourcePath);
            const targetPath = assertEditableSubtitlePath(payload.path || payload.targetPath);
            const { writeMergedBilingualSubtitleFiles } = require('./subtitle-fs-helpers');
            const mergedPath = writeMergedBilingualSubtitleFiles(sourcePath, targetPath, {
                primaryTrack: payload.primaryTrack || payload.dualPrimaryTrack || 'target',
                lineOrder: payload.lineOrder || payload.dualLineOrder || 'target-first',
                nameAsVideoStem: payload.nameAsVideoStem !== false,
            });
            return { ok: true, path: mergedPath };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-remove-noise-pair', async (_event, payload = {}) => {
        try {
            const targetPath = assertEditableSubtitlePath(payload.path || payload.targetPath);
            const sourcePath = payload.sourcePath
                ? assertEditableSubtitlePath(payload.sourcePath)
                : '';
            return removeNoiseFromSubtitlePair(
                targetPath,
                sourcePath,
                payload.options || payload || {},
            );
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
            const written = writeSubtitleDocument(filePath, { ...payload, backupMode });
            if (written?.ok) {
                try {
                    const { ingestEditedSubtitle } = require('./subtitle-library');
                    const ingested = ingestEditedSubtitle({
                        subtitlePath: written.path || filePath,
                        videoPath: payload.videoPath || '',
                        source: payload.librarySource || undefined,
                        status: payload.libraryStatus || undefined,
                        note: payload.libraryNote || '',
                        tags: payload.libraryTags || null,
                        bindingSourceVersionId: payload.librarySourceVersionId || null,
                        parentVersionId: payload.libraryParentVersionId || null,
                        recipe: payload.libraryRecipe || null,
                        setActive: payload.librarySetActive !== false,
                    });
                    if (ingested && typeof ingested === 'object') {
                        const verId = ingested.version?.id || '';
                        const activeId = ingested.track?.activeVersionId || '';
                        written.libraryIngest = {
                            ok: !!ingested.ok,
                            skipped: !!ingested.skipped,
                            versionId: verId,
                            mediaId: ingested.media?.id || '',
                            trackId: ingested.track?.id || '',
                            // Catalog truth: whether this version is the track's current active.
                            setActive: !!(verId && activeId && verId === activeId),
                        };
                    }
                } catch { /* ignore library ingest */ }
            }
            return written;
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-export-subtitle', async (event, payload = {}) => {
        try {
            const cues = Array.isArray(payload.cues) ? payload.cues : [];
            if (!cues.length) return { ok: false, error: '字幕内容为空' };
            const formatHint = String(payload.format || 'srt').toLowerCase();
            const format = ['srt', 'vtt', 'lrc', 'ass'].includes(formatHint) ? formatHint : 'srt';
            const defaultName = asString(payload.defaultName || payload.suggestedName || '', 512).trim()
                || `subtitle.${format}`;
            const title = asString(payload.title || '', 200).trim() || '导出字幕';
            const win = browserWindowFromEvent(event);
            const filters = format === 'vtt'
                ? [{ name: 'WebVTT', extensions: ['vtt'] }, { name: '所有字幕', extensions: ['srt', 'vtt', 'lrc', 'ass'] }]
                : format === 'lrc'
                    ? [{ name: 'LRC', extensions: ['lrc'] }, { name: '所有字幕', extensions: ['srt', 'vtt', 'lrc', 'ass'] }]
                    : format === 'ass'
                        ? [{ name: 'Advanced SubStation', extensions: ['ass'] }, { name: '所有字幕', extensions: ['srt', 'vtt', 'lrc', 'ass'] }]
                        : [{ name: 'SubRip', extensions: ['srt'] }, { name: '所有字幕', extensions: ['srt', 'vtt', 'lrc', 'ass'] }];
            const result = await dialog.showSaveDialog(win || undefined, {
                title,
                defaultPath: defaultName,
                filters,
            });
            refocusWindow(win);
            if (result.canceled || !result.filePath) return { ok: true, canceled: true };
            const dest = result.filePath;
            const ext = path.extname(dest).toLowerCase().replace(/^\./, '');
            const saveFormat = ['srt', 'vtt', 'lrc', 'ass'].includes(ext) ? ext : format;
            if (saveFormat === 'ass') {
                const { serializeAss, serializeSubtitle, serializeDualAss } = require('./subtitle-format');
                const assMode = String(payload.assMode || '').trim().toLowerCase();
                const header = Array.isArray(payload.header) ? payload.header : null;
                let content;
                if (assMode === 'dual' && Array.isArray(payload.pairCues)) {
                    content = serializeDualAss(cues, payload.pairCues, {
                        title: path.basename(dest, path.extname(dest)),
                        primaryRole: payload.primaryRole || payload.dualRole || 'target',
                        lineOrder: payload.lineOrder || payload.dualLineOrder,
                        dualTemplate: payload.dualTemplate,
                        sourceStyle: payload.sourceStyle,
                        targetStyle: payload.targetStyle,
                        marginGap: payload.marginGap,
                    });
                } else {
                    // Non-dual ASS always uses document styles (legacy "speakers" coerced).
                    content = serializeSubtitle({
                        format: 'ass',
                        cues,
                        header: header && header.length ? header : undefined,
                        assOptions: {
                            title: path.basename(dest, path.extname(dest)),
                            styles: payload.styles,
                            pairCues: payload.pairCues,
                            lineOrder: payload.lineOrder || payload.dualLineOrder,
                        },
                    });
                }
                fs.writeFileSync(dest, content, 'utf8');
                return {
                    ok: true,
                    path: dest,
                    cueCount: cues.length,
                    format: 'ass',
                    assMode: assMode === 'dual' ? 'dual' : 'document',
                };
            }
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

    register('transub-list-system-fonts', async () => {
        try {
            const fonts = await listSystemFontFamilies();
            return { ok: true, fonts, count: fonts.length };
        } catch (err) {
            return { ok: false, error: err.message || String(err), fonts: [] };
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
            const defaultPathHint = asString(options.defaultPath, 4096).trim();
            const { resolveDialogDefaultPath, rememberOpenPath } = require('./last-open-dir');
            const defaultPath = resolveDialogDefaultPath(getAppRoot, defaultPathHint);
            const multiple = !!options.multiple;
            const result = await dialog.showOpenDialog(win || undefined, {
                title: options.title || (multiple ? '选择字幕文件（可多选）' : '选择字幕文件'),
                properties: multiple
                    ? ['openFile', 'multiSelections']
                    : ['openFile'],
                filters: [
                    { name: '字幕 (SRT / VTT / LRC / ASS)', extensions: ['srt', 'vtt', 'lrc', 'ass', 'ssa'] },
                    { name: '所有文件', extensions: ['*'] },
                ],
                defaultPath: defaultPath || undefined,
            });
            refocusWindow(win);
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true };
            }
            rememberOpenPath(getAppRoot, result.filePaths[0]);
            if (multiple) {
                const paths = result.filePaths.map((p) => path.resolve(p));
                return {
                    ok: true,
                    canceled: false,
                    paths,
                    files: paths.map((subPath) => ({
                        path: subPath,
                        videoPath: guessVideoPathForSubtitle(subPath) || '',
                    })),
                };
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
            const { resolveDialogDefaultPath, rememberOpenPath } = require('./last-open-dir');
            const defaultPath = resolveDialogDefaultPath(getAppRoot, hintPath);
            const result = await dialog.showOpenDialog(win, {
                title: payload.title || '选择关联媒体',
                properties: ['openFile'],
                filters: [
                    { name: '媒体文件', extensions: [...SUBTITLE_MEDIA_EXTENSIONS] },
                    { name: '音频', extensions: [...AUDIO_EXTENSIONS] },
                    { name: '视频', extensions: [...VIDEO_EXTENSIONS] },
                ],
                defaultPath: defaultPath || undefined,
            });
            refocusWindow(win);
            if (result.canceled || !result.filePaths?.length) {
                return { ok: true, canceled: true };
            }
            const picked = path.resolve(result.filePaths[0]);
            rememberOpenPath(getAppRoot, picked);
            return { ok: true, canceled: false, path: picked };
        } catch (err) {
            return { ok: false, error: err.message || String(err) };
        }
    });

    register('transub-guess-video-for-subtitle', async (_event, payload = {}) => {
        try {
            const subPath = asString(payload.path, 4096).trim();
            if (!subPath) return { ok: false, error: '缺少字幕路径' };
            const preferPath = asString(payload.preferPath, 4096).trim();
            if (preferPath) {
                try {
                    const resolvedPrefer = path.resolve(preferPath);
                    if (fs.existsSync(resolvedPrefer)) {
                        return { ok: true, videoPath: resolvedPrefer, fromPrefer: true };
                    }
                } catch (_) { /* fall through to guess */ }
            }
            const videoPath = guessVideoPathForSubtitle(subPath);
            return { ok: true, videoPath: videoPath || null, fromPrefer: false };
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

    register('transub-download-app-update', async (event, _payload = {}) => {
        const { broadcastAppUpdateProgress } = require('./download-window');

        const pushProgress = (progress) => {
            try {
                if (event?.sender && !event.sender.isDestroyed()) {
                    event.sender.send('transub-app-update-progress', progress);
                }
            } catch {
                /* ignore destroyed sender */
            }
            broadcastAppUpdateProgress(progress);
        };

        setUpdateProgressListener(pushProgress);
        try {
            const result = await downloadAppUpdate();
            if (result?.ok) {
                pushProgress({
                    percent: 100,
                    phase: 'done',
                    ok: true,
                    message: result.message || '更新已下载，可重启安装',
                });
            } else {
                pushProgress({
                    percent: 0,
                    phase: 'error',
                    ok: false,
                    message: result?.error || '下载失败',
                });
            }
            return result;
        } catch (err) {
            pushProgress({
                percent: 0,
                phase: 'error',
                ok: false,
                message: err.message || String(err),
            });
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
    applySubtitlePostprocess,
    sanitizeMtSubtitlePair,
    removeNoiseFromSubtitlePair,
    compactPureInterjectionSubtitlePair,
    isSourceSubtitleTrack,
};
