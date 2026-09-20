/**
 * Run polish / QC / 简繁 / preset for one batch item before emitting phase=done.
 * Keeps the next file from starting until this item's post-task chain finishes.
 */
const path = require('path');
const { remapBridgeProgress } = require('./engine-job-progress');
const itemPaths = require('../src/js/item-posttask-paths-core');
const postTaskProgress = require('../src/js/per-item-qc-pipeline-core');
const { isPostTaskStopRequested, cancelledPostTaskResult } = require('./engine-batch-item');

function normalizeQcFixMode(raw) {
    return postTaskProgress.normalizeQcFixMode(raw);
}

function isTranslateLikeTask(task) {
    const t = String(task || '').trim().toLowerCase();
    return t === 'translate' || t === 'dual' || t === 'translate_mt';
}

function normalizeChineseVariant(raw) {
    const allowed = new Set(['simplified', 'traditional', 'traditional-tw', 'traditional-hk']);
    const v = String(raw || 'simplified').trim().toLowerCase();
    return allowed.has(v) ? v : 'simplified';
}

function emitProgress(onProgress, engineTask, patch = {}) {
    if (typeof onProgress !== 'function') return;
    // patch.percent is stage-local 0–100; remap into job-wide bands.
    const remapped = remapBridgeProgress(engineTask, {
        stage: patch.stage,
        percent: patch.percent,
    });
    onProgress({
        ...patch,
        stage: remapped.stage || patch.stage,
        percent: remapped.percent,
        itemStage: patch.itemStage || remapped.stage || patch.stage,
        itemProgress: remapped.percent,
        itemDetail: patch.detail || patch.itemDetail || '',
        phase: 'running',
    });
}

function buildItemRecord(outPaths = {}, mediaPath = '') {
    return {
        path: mediaPath,
        subtitlePath: outPaths.subtitlePath || '',
        sourceSubtitlePath: outPaths.sourceSubtitlePath || '',
        targetSubtitlePath: outPaths.targetSubtitlePath || '',
        bilingualSubtitlePath: outPaths.bilingualSubtitlePath || '',
    };
}

async function runSpacePunctPass(paths, { onLog } = {}) {
    const { applySubtitlePostprocess } = require('./extensions-bridge');
    for (const subPath of paths) {
        try {
            const res = applySubtitlePostprocess(subPath, {
                spaceAfterChinesePunctuation: true,
                backupMode: 'off',
            });
            if (res?.ok && res.written) {
                onLog?.(`后处理 ${path.basename(subPath)} · ${res.summary || '句读后空格'}`);
            }
        } catch (err) {
            onLog?.(`后处理跳过 ${path.basename(subPath)}：${err.message || err}`);
        }
    }
}

function createSubtitleDocCache() {
    const cache = new Map();
    const { readSubtitleDocument } = require('./extensions-bridge');
    return {
        read(subPath) {
            const p = String(subPath || '').trim();
            if (!p) return { ok: false };
            if (cache.has(p)) return cache.get(p);
            const doc = readSubtitleDocument(p);
            cache.set(p, doc);
            return doc;
        },
        invalidate(subPath) {
            cache.delete(String(subPath || '').trim());
        },
        invalidateAll() {
            cache.clear();
        },
    };
}

function resolvePostBatchQcScanOptions(options = {}) {
    let qc;
    try {
        qc = require('../src/js/subtitle-qc-core');
    } catch {
        return { checkFluency: true, gapMs: 1, ...options };
    }
    return typeof qc.defaultPostBatchQcScanOptions === 'function'
        ? qc.defaultPostBatchQcScanOptions(options)
        : { checkFluency: true, gapMs: 1, ...options };
}

function scanDocIssueCount(doc, options = {}) {
    if (!doc?.ok || !Array.isArray(doc.cues)) return 0;
    let qc;
    try {
        qc = require('../src/js/subtitle-qc-core');
    } catch {
        return 0;
    }
    const { summary } = qc.scanCueIssues(doc.cues, resolvePostBatchQcScanOptions(options));
    return Number(summary?.total) || 0;
}

async function scanPathIssueCount(subPath, docCache = null, options = {}) {
    if (!subPath) return 0;
    try {
        const doc = docCache
            ? docCache.read(subPath)
            : require('./extensions-bridge').readSubtitleDocument(subPath);
        return scanDocIssueCount(doc, options);
    } catch {
        return 0;
    }
}

/** Task-list QC count uses the primary editable track (same file as subtitle editor). */
async function scanItemPrimaryQcIssueCount(item, docCache = null, options = {}) {
    const primary = itemPaths.pickSubtitlePath(item);
    if (!primary) return 0;
    return scanPathIssueCount(primary, docCache, options);
}

async function runBasicQcFix(subPath, ctx = {}) {
    const filePath = String(subPath || '').trim();
    if (!filePath) return { ok: false, error: 'missing_path' };

    const pairPath = String(ctx.pairPath || '').trim();
    if (pairPath && path.resolve(pairPath) !== path.resolve(filePath)) {
        try {
            const keep = require('./transcript-keep');
            const { rematerializeSubtitlePairFiles } = require('./mt-pair-rematerialize');
            const { readSubtitleDocument } = require('./extensions-bridge');
            const doc = readSubtitleDocument(filePath);
            const pairDoc = readSubtitleDocument(pairPath);
            if (
                doc?.ok
                && pairDoc?.ok
                && keep.cuesHaveBrokenTimeline(doc.cues)
                && !keep.cuesHaveBrokenTimeline(pairDoc.cues)
            ) {
                const rem = rematerializeSubtitlePairFiles(filePath, pairPath, {
                    force: true,
                    preferPositional: true,
                    backupMode: 'off',
                });
                if (rem?.written) {
                    ctx.onLog?.(`QC 一键修复前已按原文重铺时间轴：${path.basename(filePath)}`);
                }
            }
        } catch { /* optional */ }
    }

    const { applySubtitlePostprocess } = require('./extensions-bridge');
    return applySubtitlePostprocess(filePath, {
        cpsSplit: true,
        fixOverlap: true,
        fixCpsByExtend: true,
        enforceMinDur: true,
        enforceMaxDur: true,
        fixInvalid: true,
        // Guard MFYD-185 unpack on collapsed tracks (default in subtitle-qc-core).
        skipBrokenTimelineTimingFix: true,
        compressRepetition: true,
        removeNoise: true,
        removeHallucinations: true,
        removeDuplicates: true,
        maxCps: 18,
        maxSec: 10,
        gapMs: 1,
        backupMode: 'off',
    });
}

async function runSilenceSplit(subPath, mediaPath, maxChars) {
    if (!(maxChars > 0) || !mediaPath) return null;
    const qcSilenceSplit = require('./qc-silence-split');
    const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
    const doc = readSubtitleDocument(subPath);
    if (!doc?.ok || !Array.isArray(doc.cues) || !doc.cues.length) return null;
    const applied = await qcSilenceSplit.runQcSilenceSplitOnCues(doc.cues, {
        mediaPath,
        maxChars,
        backupMode: 'off',
    });
    if (applied.stats?.skipped || !(applied.stats?.splitCount > 0)) {
        return { ok: true, written: false, summary: qcSilenceSplit.summarizeQcSilenceSplit(applied.stats) };
    }
    const written = writeSubtitleDocument(subPath, {
        cues: applied.cues,
        format: doc.format,
        header: doc.header,
        backupMode: 'off',
    });
    if (!written.ok) return written;
    return {
        ok: true,
        written: true,
        summary: qcSilenceSplit.summarizeQcSilenceSplit(applied.stats),
    };
}

async function runItemQcAutoFix({
    item,
    paths,
    mediaPath,
    options,
    primaryAsr = '',
    engineTask,
    onProgress,
    onLog,
    event,
    shouldStop = null,
    signal = null,
}) {
    const mode = normalizeQcFixMode(options.postBatchQcFixMode);
    if (options.postBatchQc === false && mode === 'none') {
        return { issueCount: 0, qcFixedMode: '', qcFixedWritten: false, qcFixedSummary: '' };
    }
    if (isPostTaskStopRequested({ shouldStop, signal })) {
        return cancelledPostTaskResult({ issueCount: 0 });
    }

    emitProgress(onProgress, engineTask, {
        stage: 'qc_fix',
        percent: 0,
        detail: 'QC检测中…',
        itemStage: 'qc_fix',
    });

    const docCache = createSubtitleDocCache();
    let issueCount = await scanItemPrimaryQcIssueCount(item, docCache);
    const silenceMax = (() => {
        const maxChars = Number(options.qcSilenceSplitChars);
        return Number.isFinite(maxChars) && maxChars >= 0 ? maxChars : 15;
    })();

    const repairRequested = postTaskProgress.shouldRunQcRepairPass(mode);
    if (!repairRequested) {
        if (issueCount <= 0 && silenceMax > 0) {
            for (const subPath of paths) {
                await runSilenceSplit(subPath, mediaPath, silenceMax);
            }
        }
        return { issueCount, qcFixedMode: '', qcFixedWritten: false, qcFixedSummary: '' };
    }

    let smartEntitled = true;
    if (mode === 'smart') {
        try {
            const { requireQcSmartFix } = require('./advanced-bridge');
            smartEntitled = !!requireQcSmartFix().ok;
        } catch {
            smartEntitled = false;
        }
    }
    const repairMode = postTaskProgress.resolveQcRepairMode(mode, {
        smartEntitled,
        perfProfile: options.perfProfile,
    });

    emitProgress(onProgress, engineTask, {
        stage: 'qc_fix',
        percent: 10,
        detail: repairMode === 'smart' ? 'QC 智能修复 (Pro)…' : 'QC 一键修复…',
        itemStage: 'qc_fix',
    });
    if (repairMode === 'smart') {
        onLog?.('QC 智能修复 (Pro)…');
    } else if (mode === 'smart' && postTaskProgress.isSpeedPerfProfile(options.perfProfile)) {
        onLog?.('转写偏好为速度：QC 智能修复已改为一键修复…');
    } else if (mode === 'smart' && !smartEntitled) {
        onLog?.('QC 智能修复需 Pro，已改为一键修复…');
    } else {
        onLog?.('QC 一键修复…');
    }

    let qcFixedWritten = false;
    const summaryParts = [];
    let skipDialogueContentShiftRepair = options.skipDialogueContentShiftRepair === true;

    if (repairMode === 'smart') {
        const { runQcSmartFix } = require('./advanced-bridge');
        const profile = options.contentProfile || options.senseProfile || 'unknown';
        let preset = {};
        try {
            const profileApi = require('../src/js/content-profile-core');
            preset = profileApi.qcPresetForProfile?.(profile) || {};
        } catch { /* ignore */ }
        const { resolveQcRetranscribeEngineContext } = require('./engine-qc-retranscribe-options');
        const qcEngineCtx = resolveQcRetranscribeEngineContext({
            ...options,
            primaryAsr,
            _batchMode: true,
            allowDuringBatch: true,
        });
        const srcSidecar = String(item.sourceSubtitlePath || '').trim();
        for (const subPath of paths) {
            const pairPath = itemPaths.resolveQcSemanticPairPath(item, subPath);
            const sourceForAsr = pairPath || srcSidecar || subPath;
            try {
                const res = await runQcSmartFix({
                    path: subPath,
                    mediaPath,
                    profile,
                    ...preset,
                    engineOptions: qcEngineCtx.options,
                    primaryAsr: qcEngineCtx.primaryAsr,
                    _batchMode: true,
                    allowDuringBatch: true,
                    llmSplit: options.qcSmartLlmSplit !== false,
                    retranscribeConnected: options.qcSmartRetranscribe !== false,
                    smartFix: true,
                    pairPath: pairPath || undefined,
                    sourceSubtitlePath: sourceForAsr,
                    subtitlePath: subPath,
                    semanticReview: options.qcSmartSemanticReview !== false && !!pairPath,
                    intensity: options.qcSmartIntensity || preset.intensity || 'light',
                    maxRetranscribeRanges: Number(options.qcSmartMaxRetranscribeRanges) || 8,
                    qcSilenceSplitChars: silenceMax,
                    backupMode: 'off',
                    subtitleTargetLang: options.subtitleTargetLang || options.targetLang,
                    targetLang: options.targetLang || options.subtitleTargetLang,
                    targetLanguage: options.targetLanguage,
                    chineseSubtitleVariant: options.chineseSubtitleVariant,
                    translateMode: options.translateMode,
                    shouldStop,
                    signal,
                    isCancelled: () => isPostTaskStopRequested({ shouldStop, signal }),
                    onLog: (line) => onLog?.(line),
                    onProgress: (info) => {
                        emitProgress(onProgress, engineTask, {
                            stage: 'qc_fix',
                            percent: Number(info?.pct) || 50,
                            detail: info?.message || info?.detail || 'QC 智能修复 (Pro)…',
                            itemStage: 'qc_fix',
                        });
                    },
                }, event);
                docCache.invalidate(subPath);
                if (res?.ok === false) {
                    onLog?.(`QC 智能修复失败 ${path.basename(subPath)}：${res.error || res.code || '未知'}，改为一键修复…`);
                    const fallback = await runBasicQcFix(subPath, {
                        pairPath: pairPath || srcSidecar || '',
                        onLog,
                    });
                    docCache.invalidate(subPath);
                    if (fallback?.ok && fallback.written) {
                        qcFixedWritten = true;
                        if (fallback.summary) summaryParts.push(fallback.summary);
                    }
                    if (silenceMax > 0) await runSilenceSplit(subPath, mediaPath, silenceMax);
                    docCache.invalidate(subPath);
                } else {
                    if (res?.written) qcFixedWritten = true;
                    const line = res?.summary || (res?.written ? '已写回' : '智能处理无文本变更');
                    onLog?.(`QC 智能修复 ${path.basename(subPath)} · ${line}`);
                    if (line) summaryParts.push(line);
                    // QC 改过原文/条数后禁止整轨「错位回正」，否则易旋转移位成省略号风暴。
                    if (
                        Number(res?.retranscribe?.okCount) > 0
                        || res?.rematerialized
                        || /局部重转写/.test(String(res?.summary || ''))
                    ) {
                        skipDialogueContentShiftRepair = true;
                    }
                }
            } catch (err) {
                onLog?.(`QC 智能修复跳过 ${path.basename(subPath)}：${err.message || err}`);
            }
        }
    } else if (repairMode === 'fix') {
        const srcSidecar = String(item.sourceSubtitlePath || '').trim();
        for (const subPath of paths) {
            try {
                const pairPath = itemPaths.resolveQcSemanticPairPath(item, subPath);
                const res = await runBasicQcFix(subPath, {
                    pairPath: pairPath || srcSidecar || '',
                    onLog,
                });
                docCache.invalidate(subPath);
                if (res?.ok && res.written) {
                    qcFixedWritten = true;
                    onLog?.(`QC 修复 ${path.basename(subPath)} · ${res.summary || '已写回'}`);
                    if (res.summary) summaryParts.push(res.summary);
                }
                if (silenceMax > 0) await runSilenceSplit(subPath, mediaPath, silenceMax);
                docCache.invalidate(subPath);
            } catch (err) {
                onLog?.(`QC 修复跳过 ${path.basename(subPath)}：${err.message || err}`);
            }
        }
    }

    docCache.invalidateAll();
    issueCount = await scanItemPrimaryQcIssueCount(item, docCache);
    return {
        issueCount,
        qcFixedMode: repairMode,
        qcFixedWritten,
        qcFixedSummary: summaryParts.join('；').slice(0, 200),
        skipDialogueContentShiftRepair,
    };
}

async function runChineseConvert(paths, variant, { engineTask, onProgress, onLog } = {}) {
    if (!variant || variant === 'simplified') return;
    const { applySubtitlePostprocess } = require('./extensions-bridge');
    emitProgress(onProgress, engineTask, {
        stage: 'save',
        percent: 0,
        detail: '简繁转换中…',
        itemStage: 'save',
    });
    for (const subPath of paths) {
        try {
            const res = applySubtitlePostprocess(subPath, {
                chineseSubtitleVariant: variant,
                backupMode: 'off',
            });
            if (res?.ok && res.written) {
                onLog?.(`${path.basename(subPath)} · ${res.chinese?.summary || res.summary || '简繁转换'}`);
            }
        } catch (err) {
            onLog?.(`简繁转换跳过 ${path.basename(subPath)}：${err.message || err}`);
        }
    }
}

function shouldSkipFakeGreetingForMt(options = {}) {
    if (options.skipFakeGreeting === true) return true;
    if (options.smartTranslate === true) return true;
    const mode = String(options.translateMode || '').trim().toLowerCase();
    return mode === 'smart';
}

async function runFinalMtSanitizePass(item, options = {}, { engineTask, onProgress, onLog } = {}) {
    if (options.mtSanitize === false) return { changed: 0 };
    const srcPath = String(item?.sourceSubtitlePath || '').trim();
    if (!srcPath) return { changed: 0 };
    const batchPostprocessPlan = require('./engine-batch-postprocess-plan');
    const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(item, {
        resolve: path.resolve,
        existsSync: (p) => require('fs').existsSync(p),
    });
    if (!uniqueZh.length) return { changed: 0 };

    emitProgress(onProgress, engineTask, {
        stage: 'cleanup',
        percent: 95,
        detail: '后处理：译后清洗…',
        itemStage: 'cleanup',
    });

    const { sanitizeMtSubtitlePair } = require('./extensions-bridge');
    let lightSanitize = {};
    try {
        const modeApi = require('../src/js/settings-options-normalize-core');
        const sakuraCore = require('../src/js/sakura-translate-core');
        if (modeApi.isInferenceTranslateMode?.(options.translateMode)) {
            lightSanitize = sakuraCore.resolveLightMtFinalizeSanitizeOpts?.({
                modelId: options.engineLlmMtModel || options.engineMtModel,
            }) || {};
        }
    } catch { /* optional */ }
    let totalChanged = 0;
    for (const zhPath of uniqueZh) {
        try {
            const sm = sanitizeMtSubtitlePair(zhPath, srcPath, {
                contentProfile: options.contentProfile || options.senseProfile,
                senseProfile: options.senseProfile || options.contentProfile,
                sakuraNsfwPrompt: options.sakuraNsfwPrompt,
                nsfwPrompt: options.nsfwPrompt,
                smartTranslateFaithfulTone: options.smartTranslateFaithfulTone
                    || options.faithfulTone,
                faithfulTone: options.faithfulTone
                    || options.smartTranslateFaithfulTone,
                applyNsfwLexicon: options.applyNsfwLexicon,
                skipFakeGreeting: shouldSkipFakeGreetingForMt(options),
                subtitleTargetLang: options.subtitleTargetLang || options.targetLang,
                targetLang: options.targetLang || options.subtitleTargetLang,
                targetLanguage: options.targetLanguage,
                chineseSubtitleVariant: options.chineseSubtitleVariant,
                backupMode: 'off',
                skipDialogueContentShiftRepair: options.skipDialogueContentShiftRepair === true,
                ...lightSanitize,
            });
            if (sm?.ok && sm.changed) {
                totalChanged += Number(sm.changed) || 0;
                onLog?.(`${sm.summary || '译后清洗'} ${path.basename(zhPath)}`);
            }
        } catch (err) {
            onLog?.(`译后清洗跳过 ${path.basename(zhPath)}：${err.message || err}`);
        }
    }
    return { changed: totalChanged };
}

async function runBlankMtRetranslatePass(item, options = {}, { engineTask, onProgress, onLog, event, shouldStop, signal } = {}) {
    if (options.postBatchBlankRetranslate === false) {
        return { recovered: 0, left: 0, leftIndexes: [], exhaustedIndexes: [] };
    }
    const srcPath = String(item?.sourceSubtitlePath || '').trim();
    if (!srcPath) return { recovered: 0, left: 0, leftIndexes: [], exhaustedIndexes: [] };
    const batchPostprocessPlan = require('./engine-batch-postprocess-plan');
    const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(item, {
        resolve: path.resolve,
        existsSync: (p) => require('fs').existsSync(p),
    });
    if (!uniqueZh.length) return { recovered: 0, left: 0, leftIndexes: [], exhaustedIndexes: [] };

    emitProgress(onProgress, engineTask, {
        stage: 'cleanup',
        percent: 5,
        detail: '空白重译…',
        itemStage: 'cleanup',
    });

    const { runBlankMtRetryForSubtitlePair } = require('./engine-blank-mt-retry');
    let blankPolicy = null;
    try {
        blankPolicy = require('../src/js/blank-mt-retry-policy-core');
    } catch { /* optional */ }
    let totalRecovered = 0;
    let totalRounds = 0;
    let totalRetried = 0;
    let leftIndexes = [];
    let exhaustedIndexes = [];
    for (const zhPath of uniqueZh) {
        if (isPostTaskStopRequested({ shouldStop, signal })) {
            return {
                recovered: totalRecovered,
                left: leftIndexes.length,
                leftIndexes,
                exhaustedIndexes,
                cancelled: true,
                blankRounds: totalRounds,
            };
        }
        try {
            const res = await runBlankMtRetryForSubtitlePair({
                zhPath,
                jaPath: srcPath,
                options,
                skipLlmIndexes: options.blankMtSkipLlmIndexes || options.blankExhaustedIndexes,
                forceRetranslateIndexes: options.forceRetranslateIndexes,
                event,
                shouldStop,
                signal,
                onProgress: (info) => {
                    emitProgress(onProgress, engineTask, {
                        stage: 'cleanup',
                        percent: Number(info?.pct) || Number(info?.percent) || 50,
                        detail: info?.detail || info?.message || '空白重译…',
                        itemStage: 'cleanup',
                    });
                },
                onLog,
            });
            if (res?.cancelled || res?.code === 'cancelled') {
                return {
                    recovered: totalRecovered + (Number(res?.recovered) || 0),
                    left: leftIndexes.length,
                    leftIndexes,
                    exhaustedIndexes,
                    cancelled: true,
                    blankRounds: totalRounds,
                };
            }
            if (res?.ok && res.recovered) {
                totalRecovered += Number(res.recovered) || 0;
                onLog?.(`${res.summary || '空白重译'} ${path.basename(zhPath)}`);
            } else if (res?.ok === false && res.error) {
                onLog?.(`空白重译跳过 ${path.basename(zhPath)}：${res.error}`);
            }
            totalRounds += Number(res?.rounds) || 0;
            totalRetried += Number(res?.retried) || 0;
            leftIndexes = blankPolicy?.mergeBlankIndexLists?.(leftIndexes, res?.leftIndexes)
                || leftIndexes;
            exhaustedIndexes = blankPolicy?.mergeBlankIndexLists?.(
                exhaustedIndexes,
                res?.exhaustedIndexes,
            ) || exhaustedIndexes;
        } catch (err) {
            onLog?.(`空白重译跳过 ${path.basename(zhPath)}：${err.message || err}`);
        }
    }
    return {
        recovered: totalRecovered,
        left: leftIndexes.length,
        leftIndexes,
        exhaustedIndexes,
        blankRounds: totalRounds,
        blankRetried: totalRetried,
    };
}

/**
 * Final delivery: delete ZH cues whose text is only … / ... / blank MT placeholders,
 * and drop paired JA rows when lists are aligned (true delete + renumber).
 */
async function runDropUselessEllipsisPass(item, options = {}, { engineTask, onProgress, onLog } = {}) {
    let mayDrop = options.dropUselessEllipsis !== false;
    try {
        const policy = require('../src/js/mt-delivery-policy-core');
        if (typeof policy.mayDropUselessEllipsis === 'function') {
            mayDrop = policy.mayDropUselessEllipsis(options);
        }
    } catch { /* keep mayDrop */ }
    if (!mayDrop) {
        if (options.postBatchRemoveNoise === false) {
            onLog?.('已跳过省略号杂音清理（未勾选「完成后清理杂音 / 幻觉短句」）');
        }
        return { dropped: 0, skipped: true };
    }
    const srcPath = String(item?.sourceSubtitlePath || '').trim();
    if (!srcPath) return { dropped: 0 };
    const batchPostprocessPlan = require('./engine-batch-postprocess-plan');
    const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(item, {
        resolve: path.resolve,
        existsSync: (p) => require('fs').existsSync(p),
    });
    if (!uniqueZh.length) return { dropped: 0 };

    emitProgress(onProgress, engineTask, {
        stage: 'cleanup',
        percent: 98,
        detail: '后处理：删除仅省略号条目…',
        itemStage: 'cleanup',
    });

    const { removeEllipsisOnlyDeliveryPair } = require('./extensions-bridge');
    let totalDropped = 0;
    for (const zhPath of uniqueZh) {
        try {
            const sm = removeEllipsisOnlyDeliveryPair(zhPath, srcPath, {
                backupMode: 'off',
                writeSource: options.writeSource !== false,
                contentProfile: options.contentProfile || options.senseProfile || 'av_soft',
                senseProfile: options.senseProfile || options.contentProfile || 'av_soft',
                smartTranslateFaithfulTone: options.smartTranslateFaithfulTone !== false,
                sakuraNsfwPrompt: options.sakuraNsfwPrompt !== false,
                postBatchRemoveNoise: options.postBatchRemoveNoise !== false,
            });
            if (sm?.ok && (Number(sm?.dropped) || 0) > 0) {
                totalDropped += Number(sm.dropped) || 0;
                onLog?.(`${sm.summary || `删除仅省略号条目 ${sm.dropped} 条`} ${path.basename(zhPath)}`);
            } else if (sm?.ok && (Number(sm?.detFilled) || 0) > 0) {
                onLog?.(`${sm.summary || `省略号确定性补全 ${sm.detFilled} 条`} ${path.basename(zhPath)}`);
            } else if (sm?.ok === false && sm.error) {
                onLog?.(`删除仅省略号条目跳过 ${path.basename(zhPath)}：${sm.error}`);
            }
        } catch (err) {
            onLog?.(`删除仅省略号条目跳过 ${path.basename(zhPath)}：${err.message || err}`);
        }
    }
    return { dropped: totalDropped };
}

async function runTextPresetInsert(paths, groupId, { engineTask, onProgress, onLog } = {}) {
    const wantId = String(groupId || '').trim();
    if (!wantId) return;
    const { applyTextPresetGroupToSubtitle } = require('./post-batch-text-preset');
    emitProgress(onProgress, engineTask, {
        stage: 'save',
        percent: 50,
        detail: '插入字幕预设…',
        itemStage: 'save',
    });
    for (const subPath of paths) {
        try {
            const res = applyTextPresetGroupToSubtitle(subPath, wantId, {});
            if (res?.ok && res.written) {
                onLog?.(`${path.basename(subPath)} · ${res.summary || '已插入预设组'}`);
            }
        } catch (err) {
            onLog?.(`预设插入跳过 ${path.basename(subPath)}：${err.message || err}`);
        }
    }
}

function isSourceTrackSubtitlePath(subPath, item = {}) {
    const p = path.resolve(String(subPath || ''));
    if (!p || p === '.') return false;
    const src = String(item?.sourceSubtitlePath || '').trim();
    if (src && path.resolve(src) === p) return true;
    const base = path.basename(p);
    // Shelf 原文 / 转录 keep copies — always source-language watermark.
    if (/\.original\./i.test(base) || /_original\./i.test(base)) return true;
    if (/\.transcribe\./i.test(base) || /_transcribe\./i.test(base)) return true;
    if (/\.src\.|_src\.|\.source\./i.test(base)) return true;
    return false;
}

function resolveCreditLangForPath(subPath, item = {}, options = {}) {
    const creditCore = require('../src/js/subtitle-software-credit-core');
    const p = path.resolve(String(subPath || ''));
    if (isSourceTrackSubtitlePath(subPath, item)) {
        return creditCore.resolveSourceCreditLang(options.language);
    }
    const bi = String(item?.bilingualSubtitlePath || '').trim();
    if (bi && path.resolve(bi) === p) return 'bilingual';
    // Heuristic: JA / KO / EN / source sidecars keep source-language credit.
    const base = path.basename(p);
    if (/[.\\_-]ja(?:\.|$)/i.test(base)) return 'ja';
    if (/[.\\_-]ko(?:\.|$)/i.test(base)) return 'ko';
    if (/[.\\_-]en(?:\.|$)/i.test(base)) return 'en';
    if (/[.\\_-](?:zh|chs|cht)(?:\.|$)/i.test(base)) return 'zh';
    if (/\.dual\.|\.bi\.|bilingual/i.test(base) && options.mergeBilingualSubtitles) {
        return 'bilingual';
    }
    try {
        const { resolveMtTargetFields } = require('./sanitize-target-opts');
        const fields = resolveMtTargetFields(options);
        if (!fields.isZhTarget) {
            return creditCore.normalizeCreditLang(
                fields.engineTargetLanguage || fields.subtitleTargetLang || 'en',
            ) || 'en';
        }
    } catch { /* zh default */ }
    return 'zh';
}

function creditLangLogTag(lang, { isSource = false } = {}) {
    const mode = String(lang || '').trim().toLowerCase();
    if (mode === 'bilingual') return '双语';
    if (isSource) {
        if (mode === 'ja') return '原文JA';
        if (mode === 'ko') return '原文KO';
        if (mode === 'zh') return '原文ZH';
        if (mode === 'en') return '原文EN';
        return `原文${mode.toUpperCase() || 'EN'}`;
    }
    return '译文';
}

async function runSoftwareCreditInsert(paths, {
    mediaPath,
    item = {},
    options = {},
    engineTask,
    onProgress,
    onLog,
} = {}) {
    if (options.insertSoftwareCredit === false) return;
    const { applySoftwareCreditToSubtitle } = require('./subtitle-software-credit');
    emitProgress(onProgress, engineTask, {
        stage: 'postprocess',
        percent: 85,
        detail: '插入软件信息…',
        itemStage: 'postprocess',
    });

    const targets = [];
    const seen = new Set();
    const push = (p) => {
        const v = String(p || '').trim();
        if (!v || !/\.(srt|vtt|lrc)$/i.test(v)) return;
        let key;
        try {
            key = path.resolve(v);
        } catch {
            return;
        }
        if (seen.has(key)) return;
        seen.add(key);
        targets.push(v);
    };
    for (const p of (Array.isArray(paths) ? paths : [])) push(p);
    // Keep JA↔ZH cue counts aligned: localized credit on source track.
    push(item.sourceSubtitlePath);
    // Shelf「原文字幕」is snapshotted before credit insert (first-write-only). Always
    // watermark that sidecar too — otherwise 原文缺软件信息 while 译文/转录有.
    try {
        const { resolveOriginalSubtitlePath } = require('./subtitle-shelf');
        push(resolveOriginalSubtitlePath(mediaPath, options));
    } catch { /* optional */ }

    let sharedMediaDurationMs = Number(options.mediaDurationMs) || 0;
    for (const subPath of targets) {
        try {
            const lang = resolveCreditLangForPath(subPath, item, options);
            const isSource = isSourceTrackSubtitlePath(subPath, item);
            const res = await applySoftwareCreditToSubtitle(subPath, {
                mediaPath,
                mediaDurationMs: sharedMediaDurationMs > 0 ? sharedMediaDurationMs : undefined,
                ffprobePath: options.ffprobePath || options.ffmpegPath,
                lang,
                dualLineOrder: options.dualLineOrder,
            });
            if (sharedMediaDurationMs <= 0 && Number(res?.mediaDurationMs) > 0) {
                sharedMediaDurationMs = Number(res.mediaDurationMs);
            }
            if (res?.ok && res.written) {
                const langTag = creditLangLogTag(lang, { isSource });
                onLog?.(`${path.basename(subPath)} · ${res.summary || '已插入软件信息'}（${langTag}）`);
            } else if (res?.ok === false && res.error) {
                onLog?.(`软件信息跳过 ${path.basename(subPath)}：${res.error}`);
            }
        } catch (err) {
            onLog?.(`软件信息跳过 ${path.basename(subPath)}：${err.message || err}`);
        }
    }
}

/**
 * Re-apply viewing punct / noise / compress / filler compact after QC + blank re-MT.
 * Earlier applyPostBatchPipeline can be undone by retranscribe or recovered MT text.
 */
async function runFinalPostBatchPolish(paths, item, options = {}, {
    engineTask,
    translateLike = false,
    onProgress,
    onLog,
} = {}) {
    const list = (Array.isArray(paths) ? paths : []).filter(Boolean);
    if (!list.length) return;

    emitProgress(onProgress, engineTask, {
        stage: 'cleanup',
        percent: 99,
        detail: '后处理：观影精简…',
        itemStage: 'cleanup',
    });

    try {
        const { applyPostBatchPipeline } = require('./post-batch-pipeline');
        applyPostBatchPipeline(list, {
            ...options,
            // CPS already ran earlier / in QC; avoid re-splitting recovered cues.
            postBatchCpsSplit: false,
        }, {
            onLog,
        });
    } catch (err) {
        onLog?.(`观影后处理跳过：${err.message || err}`);
    }

    
    // fillBlank after viewing punct (… can reappear / slots reopen).
    if (translateLike) {
        try {
            const mtSanitize = require('../src/js/mt-sanitize-core');
            const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
            const batchPostprocessPlan = require('./engine-batch-postprocess-plan');
            const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(item, {
                resolve: path.resolve,
                existsSync: (p) => require('fs').existsSync(p),
            });
            const jaPath = String(item?.sourceSubtitlePath || '').trim();
            let jaCues = [];
            if (jaPath) {
                const jaDoc = readSubtitleDocument(jaPath);
                if (jaDoc?.ok) jaCues = jaDoc.cues || [];
            }
            if (jaCues.length && typeof mtSanitize.fillBlankZhSlotsFromJa === 'function') {
                for (const zhPath of uniqueZh) {
                    if (jaPath && path.resolve(jaPath) === path.resolve(zhPath)) continue;
                    const zhDoc = readSubtitleDocument(zhPath);
                    if (!zhDoc?.ok) continue;
                    const filled = mtSanitize.fillBlankZhSlotsFromJa(zhDoc.cues || [], jaCues);
                    if (!(filled?.filled > 0)) continue;
                    const written = writeSubtitleDocument(zhPath, {
                        cues: filled.cues,
                        format: zhDoc.format,
                        header: zhDoc.header,
                        backupMode: 'off',
                    });
                    if (written?.ok) {
                        onLog?.(`空白补译 · ${path.basename(zhPath)} · 润色后确定性补全 ${filled.filled} 条`);
                    }
                }
            }
        } catch (err) {
            onLog?.(`润色后空白补全失败：${err.message || err}`);
        }
    }

    if (!translateLike) return { underfillLeft: 0, underfillStats: null };

    const batchPostprocessPlan = require('./engine-batch-postprocess-plan');
    const {
        dropDiscourse,
        dropOnomatopoeia,
        shouldCompact,
    } = batchPostprocessPlan.resolveInterjectionDropFlags(options);
    if (shouldCompact) {
        try {
            const { compactPureInterjectionSubtitlePair } = require('./extensions-bridge');
            const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(item, {
                resolve: path.resolve,
                existsSync: (p) => require('fs').existsSync(p),
            });
            const jaPath = String(item?.sourceSubtitlePath || '').trim();
            for (const zhPath of uniqueZh) {
                if (jaPath && path.resolve(jaPath) === path.resolve(zhPath)) continue;
                const cm = compactPureInterjectionSubtitlePair(zhPath, jaPath, {
                    backupMode: 'off',
                    dropDiscourse,
                    dropOnomatopoeia,
                });
                if (cm?.ok && cm.dropped) {
                    onLog?.(`${cm.summary || '清除语气/拟声'} ${path.basename(zhPath)}`);
                }
            }
        } catch (err) {
            onLog?.(`清除语气/拟声跳过：${err.message || err}`);
        }
    }

    // Last: underfill QC after viewing punct + compact (bare「哈」/欠译「舔」/JA leak).
    let underfillLeft = 0;
    let underfillStats = null;
    try {
        const { applyDeliveryUnderfillRepair } = require('./delivery-underfill-repair');
        const uniqueZh = batchPostprocessPlan.collectUniqueZhSubtitlePaths(item, {
            resolve: path.resolve,
            existsSync: (p) => require('fs').existsSync(p),
        });
        const jaPath = String(item?.sourceSubtitlePath || '').trim();
        if (jaPath) {
            for (const zhPath of uniqueZh) {
                if (path.resolve(jaPath) === path.resolve(zhPath)) continue;
                const uf = applyDeliveryUnderfillRepair(zhPath, jaPath, {
                    backupMode: 'off',
                    skipFillBlank: false,
                });
                if (uf?.ok) {
                    underfillLeft += Number(uf.totalLeft) || 0;
                    underfillStats = uf.stats || underfillStats;
                    if (uf.repaired > 0 || uf.totalLeft > 0) {
                        onLog?.(`${uf.summary || '欠译护栏'} · ${path.basename(zhPath)}`);
                    }
                } else if (uf?.error) {
                    onLog?.(`欠译护栏跳过 ${path.basename(zhPath)}：${uf.error}`);
                }
            }
        }
    } catch (err) {
        onLog?.(`欠译护栏失败：${err.message || err}`);
    }
    return { underfillLeft, underfillStats };
}

/**
 * @param {{
 *   mediaPath: string,
 *   outPaths: object,
 *   options: object,
 *   engineTask?: string,
 *   polishAlreadyDone?: boolean,
 *   onProgress?: Function,
 *   onLog?: Function,
 *   event?: object,
 *   shouldStop?: Function,
 *   signal?: AbortSignal,
 * }} ctx
 */
async function runItemPostTaskHandoff(ctx = {}) {
    const {
        mediaPath,
        outPaths = {},
        options = {},
        primaryAsr = '',
        engineTask = options.task || 'transcribe',
        polishAlreadyDone = true,
        timingFallback = null,
        onProgress,
        onLog,
        event = null,
        shouldStop = null,
        signal = null,
    } = ctx;
    const stopCtx = { shouldStop, signal };
    if (isPostTaskStopRequested(stopCtx)) {
        return cancelledPostTaskResult({ issueCount: 0 });
    }

    const item = buildItemRecord(outPaths, mediaPath);
    const paths = itemPaths.collectPostBatchPaths(item);
    if (!paths.length) return { ok: true, skipped: true, issueCount: 0 };

    // Snapshot healthy timings before QC / blank / viewing polish can collapse t≈0 piles.
    const timingSnapshots = new Map();
    try {
        const keep = require('./transcript-keep');
        const { readSubtitleDocument } = require('./extensions-bridge');
        for (const p of paths) {
            try {
                const doc = readSubtitleDocument(p);
                if (!doc?.ok || !Array.isArray(doc.cues) || !doc.cues.length) continue;
                const snap = keep.snapshotHealthyCueTimings(doc.cues);
                if (snap.length >= 8) timingSnapshots.set(path.resolve(p), snap);
            } catch { /* optional */ }
        }
    } catch { /* optional */ }

    const chineseVariant = normalizeChineseVariant(options.chineseSubtitleVariant);
    const presetGroupId = String(options.postBatchTextPresetGroupId || '').trim();
    const translateLike = isTranslateLikeTask(engineTask);

    if (!polishAlreadyDone) {
        emitProgress(onProgress, engineTask, {
            stage: 'cleanup',
            percent: 0,
            detail: '后处理中…',
            itemStage: 'cleanup',
        });
        try {
            const { applyPostBatchPipeline } = require('./post-batch-pipeline');
            applyPostBatchPipeline(paths, options, {
                onProgress: (info) => {
                    emitProgress(onProgress, engineTask, {
                        stage: 'cleanup',
                        percent: 50,
                        detail: info?.detail || '后处理中…',
                        itemStage: 'cleanup',
                    });
                },
                onLog,
            });
        } catch (err) {
            onLog?.(`后处理跳过：${err.message || err}`);
        }
    } else if (translateLike) {
        emitProgress(onProgress, engineTask, {
            stage: 'cleanup',
            percent: 80,
            detail: '后处理中…',
            itemStage: 'cleanup',
        });
        await runSpacePunctPass(paths, { onLog });
    }

    if (isPostTaskStopRequested(stopCtx)) {
        onLog?.('任务收尾已停止');
        return cancelledPostTaskResult({ issueCount: 0 });
    }

    const qcEnabled = options.postBatchQc !== false
        || normalizeQcFixMode(options.postBatchQcFixMode) !== 'none';
    let issueCount = 0;
    let qcFixedMode = '';
    let qcFixedWritten = false;
    let qcFixedSummary = '';
    if (qcEnabled) {
        const qcRes = await runItemQcAutoFix({
            item,
            paths,
            mediaPath,
            options,
            primaryAsr,
            engineTask,
            onProgress,
            onLog,
            event,
            shouldStop,
            signal,
        });
        if (qcRes?.cancelled || isPostTaskStopRequested(stopCtx)) {
            onLog?.('任务收尾已停止');
            return cancelledPostTaskResult({
                issueCount: Number(qcRes?.issueCount) || 0,
            });
        }
        issueCount = Number(qcRes?.issueCount) || 0;
        qcFixedMode = String(qcRes?.qcFixedMode || '').trim();
        qcFixedWritten = !!qcRes?.qcFixedWritten;
        qcFixedSummary = String(qcRes?.qcFixedSummary || '').trim();
        if (qcRes?.skipDialogueContentShiftRepair) {
            options.skipDialogueContentShiftRepair = true;
        }
    }

    let qcLoopMeta = { retranscribed: 0, retranslated: 0, skipped: true };
    // Quality pipeline: after QC, closed-loop retranscribe/retranslate (before final sanitize).
    // Plot polish already ran inside MT; viewing polish stays after this block.
    if (translateLike) {
        if (isPostTaskStopRequested(stopCtx)) {
            onLog?.('任务收尾已停止');
            return cancelledPostTaskResult({ issueCount });
        }
        try {
            const { runPostQcLoopHandoff } = require('./engine-post-qc-loop-handoff');
            const loopRes = await runPostQcLoopHandoff({
                item,
                options,
                mediaPath,
                primaryAsr,
                engineTask,
                onProgress,
                onLog,
                event,
                pass: 0,
                shouldStop,
                signal,
            });
            if (loopRes?.cancelled || isPostTaskStopRequested(stopCtx)) {
                onLog?.('QC 闭环已停止');
                return cancelledPostTaskResult({
                    issueCount,
                    qcLoopRetranscribed: Number(loopRes?.retranscribed) || 0,
                    qcLoopRetranslated: Number(loopRes?.retranslated) || 0,
                });
            }
            qcLoopMeta = {
                retranscribed: Number(loopRes?.retranscribed) || 0,
                retranslated: Number(loopRes?.retranslated) || 0,
                skipped: !!loopRes?.skipped,
                reason: loopRes?.reason || '',
            };
            if ((Number(loopRes?.retranscribed) || 0) > 0) {
                options.skipDialogueContentShiftRepair = true;
            }
            if (loopRes?.retranslated || loopRes?.retranscribed) {
                onLog?.(
                    `QC 闭环完成：重转 ${loopRes.retranscribed || 0} 窗 · 补译 ${loopRes.retranslated || 0} 条`,
                );
            } else if (loopRes?.skipped && loopRes?.reason === 'low_signal') {
                onLog?.('QC 闭环跳过：风险/空白信号不足');
            } else if (loopRes?.skipped && loopRes?.reason === 'mt_exhausted') {
                onLog?.('QC 闭环跳过：空白已由主译/空白重译穷尽');
            }
        } catch (err) {
            onLog?.(`QC 闭环跳过：${err.message || err}`);
        }
    }

    if (isPostTaskStopRequested(stopCtx)) {
        onLog?.('任务收尾已停止');
        return cancelledPostTaskResult({ issueCount });
    }

    if (translateLike && options.mtSanitize !== false) {
        await runFinalMtSanitizePass(item, options, { engineTask, onProgress, onLog });
    }

    let blankMeta = { recovered: 0, left: 0, blankRounds: 0 };
    if (translateLike) {
        if (isPostTaskStopRequested(stopCtx)) {
            onLog?.('任务收尾已停止');
            return cancelledPostTaskResult({ issueCount });
        }
        let inferenceDirect = false;
        try {
            const blankPolicy = require('../src/js/blank-mt-retry-policy-core');
            inferenceDirect = !!blankPolicy.isInferenceBlankDirectFinalize?.(options);
        } catch { /* optional */ }
        if (inferenceDirect) {
            // 推理 / 混合句级：译后清洗后只做一次单条直译，不再邻窗空白重译。
            const { runEllipsisQuickDirectPass } = require('./engine-ellipsis-quick-direct');
            const direct = await runEllipsisQuickDirectPass(item, options, {
                engineTask,
                onProgress,
                onLog,
                event,
                shouldStop,
                signal,
            });
            if (direct?.cancelled || isPostTaskStopRequested(stopCtx)) {
                onLog?.('任务收尾已停止');
                return cancelledPostTaskResult({
                    issueCount,
                    blankRecovered: Number(direct?.filled) || 0,
                });
            }
            blankMeta = {
                recovered: Number(direct?.filled) || 0,
                left: Number(direct?.left) || 0,
                blankRounds: 1,
            };
        } else {
            // Final delivery blank pass: ignore main-MT exhausted indexes so leftover
            // lexical …… get another LLM / deterministic recover (avoid 漏翻).
            blankMeta = await runBlankMtRetranslatePass(item, {
                ...options,
                blankMtFinalPass: true,
                blankMtSkipLlmIndexes: [],
                blankExhaustedIndexes: [],
                attemptedBlankIndexes: [],
            }, {
                engineTask,
                onProgress,
                onLog,
                event,
                shouldStop,
                signal,
            }) || blankMeta;
            if (blankMeta?.cancelled || isPostTaskStopRequested(stopCtx)) {
                onLog?.('任务收尾已停止');
                return cancelledPostTaskResult({
                    issueCount,
                    blankRecovered: Number(blankMeta?.recovered) || 0,
                });
            }
            // Re-sanitize after blank recover — invent/glue/homograph guards + delivery finalize.
            if (options.mtSanitize !== false) {
                await runFinalMtSanitizePass(item, options, { engineTask, onProgress, onLog });
            }
        }
        await runDropUselessEllipsisPass(item, options, {
            engineTask,
            onProgress,
            onLog,
        });
    }

    if (isPostTaskStopRequested(stopCtx)) {
        onLog?.('任务收尾已停止');
        return cancelledPostTaskResult({ issueCount });
    }

    // Final viewing polish AFTER QC / blank re-MT — earlier post-batch can be undone by
    // retranscribe or recovered MT text (punctuation, repetition, fillers).
    // Ends with delivery underfill QC (bare「哈」/欠译「舔」) after viewing punct.
    const polishMeta = await runFinalPostBatchPolish(paths, item, options, {
        engineTask,
        translateLike,
        onProgress,
        onLog,
    }) || {};

    // 简繁放在观影后处理之后，避免空白重译补回的简体字漏转。
    if (translateLike && chineseVariant !== 'simplified') {
        await runChineseConvert(paths, chineseVariant, { engineTask, onProgress, onLog });
    }

    if (presetGroupId) {
        await runTextPresetInsert(paths, presetGroupId, { engineTask, onProgress, onLog });
    }

    if (options.insertSoftwareCredit !== false) {
        await runSoftwareCreditInsert(paths, {
            mediaPath,
            item,
            options,
            engineTask,
            onProgress,
            onLog,
        });
    }

    // Guard: restore timeline if post-batch/credit left a mass t≈0 debris pile.
    // Prefer pre-QC disk snapshot; if that was already corrupted (polish ran earlier in
    // the batch loop), fall back to in-memory jobResult cues (seconds → ms).
    {
        try {
            const keep = require('./transcript-keep');
            const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
            const creditCore = require('../src/js/subtitle-software-credit-core');

            const fallbackFromEngine = (list) => {
                if (!Array.isArray(list) || !list.length) return [];
                return list.map((c, i) => {
                    const startSec = Number(c.start ?? c.startSec);
                    const endSec = Number(c.end ?? c.endSec);
                    let startMs = Number(c.startMs);
                    let endMs = Number(c.endMs);
                    if (!Number.isFinite(startMs) || (startMs <= 0 && Number.isFinite(startSec) && startSec > 0.05)) {
                        startMs = Number.isFinite(startSec) ? Math.round(startSec * 1000) : NaN;
                    }
                    if (!Number.isFinite(endMs) || (endMs <= startMs && Number.isFinite(endSec))) {
                        endMs = Number.isFinite(endSec) ? Math.round(endSec * 1000) : NaN;
                    }
                    if (!Number.isFinite(startMs)) startMs = 0;
                    if (!Number.isFinite(endMs) || endMs <= startMs) endMs = startMs + 1000;
                    return {
                        index: i + 1,
                        startMs,
                        endMs,
                        text: String(c.text || ''),
                    };
                });
                // Keep blank ZH slots — filtering empty text desyncs JA↔ZH index pairs
                // (NAAC ちゅく→"" then prune-by-index shifts the whole restore snap).
            };

            const zhFallback = fallbackFromEngine(timingFallback?.zh || timingFallback?.target);
            const jaFallback = fallbackFromEngine(timingFallback?.ja || timingFallback?.source);

            // Prefer debris-pruned engine cues as restore snap (keeps 祐佳, drops ちゅく/ふせん).
            let zhEngineSnap = zhFallback;
            let jaEngineSnap = jaFallback;
            try {
                const mtSanitize = require('../src/js/mt-sanitize-core');
                if (
                    zhFallback.length
                    && jaFallback.length
                    && typeof mtSanitize.pruneAsrDebrisCuePairs === 'function'
                ) {
                    const pruned = mtSanitize.pruneAsrDebrisCuePairs(zhFallback, jaFallback, {
                        renumberIndexes: false,
                    });
                    if (Array.isArray(pruned?.cues) && Array.isArray(pruned?.sourceCues)
                        && pruned.sourceCues.length > 0) {
                        const cleaned = typeof mtSanitize.sanitizeMtCues === 'function'
                            ? mtSanitize.sanitizeMtCues(pruned.cues, pruned.sourceCues, {
                                contentProfile: options.contentProfile || options.senseProfile || 'av_soft',
                                postBatchRemoveNoise: options.postBatchRemoveNoise !== false,
                                dropAsrDebrisPairs: true,
                            })
                            : null;
                        if (cleaned?.cues?.length && cleaned?.sourceCues?.length) {
                            zhEngineSnap = cleaned.cues;
                            jaEngineSnap = cleaned.sourceCues;
                        } else {
                            zhEngineSnap = pruned.cues;
                            jaEngineSnap = pruned.sourceCues;
                        }
                    }
                }
            } catch { /* optional */ }

            const targets = [...paths];
            const srcPath = String(item?.sourceSubtitlePath || '').trim();
            if (srcPath) targets.push(srcPath);

            // Decide once for the JA↔ZH pair — restoring only one side leaves startMs skew.
            let pairNeedsRestore = false;
            const resolvedTargets = [];
            for (const subPath of targets) {
                if (!subPath || !/\.(srt|vtt|lrc)$/i.test(subPath)) continue;
                const key = path.resolve(subPath);
                const doc = readSubtitleDocument(subPath);
                if (!doc?.ok || !Array.isArray(doc.cues)) continue;
                const isSource = !!(srcPath && path.resolve(srcPath) === key);
                const engineFb = isSource ? jaEngineSnap : zhEngineSnap;
                const preSnap = timingSnapshots.get(key) || [];
                const brokenHead = keep.cuesHaveBrokenHeadTimeline(doc.cues);
                const divergesFromPre = preSnap.length
                    ? keep.cuesHeadDivergesFromSnapshot(doc.cues, preSnap)
                    : false;
                const divergesFromEngine = engineFb.length
                    ? keep.cuesHeadDivergesFromSnapshot(doc.cues, engineFb)
                    : false;
                if (brokenHead || divergesFromPre || divergesFromEngine) pairNeedsRestore = true;
                resolvedTargets.push({
                    subPath,
                    key,
                    doc,
                    isSource,
                    engineFb,
                    preSnap,
                });
            }
            // Prefer cleaned engine pair whenever timingFallback exists — postprocess / credit /
            // refreshKept can leave JA↔ZH unpaired even when heads still look fine (NAAC-076).
            if (zhEngineSnap.length >= 8 && jaEngineSnap.length >= 8) {
                pairNeedsRestore = true;
            }

            for (const row of resolvedTargets) {
                if (!pairNeedsRestore) continue;
                const { subPath, isSource, engineFb } = row;
                // Always prefer cleaned engine pair when available — text_match borrow is unsafe.
                const snap = (engineFb.length && !keep.cuesHaveBrokenHeadTimeline(engineFb))
                    ? engineFb
                    : (row.preSnap || []);
                if (!snap.length) continue;

                let cues = snap.map((c, i) => ({
                    index: i + 1,
                    startMs: c.startMs,
                    endMs: c.endMs,
                    text: c.text,
                }));
                if (options.insertSoftwareCredit !== false) {
                    const lang = resolveCreditLangForPath(subPath, item, options);
                    const applied = creditCore.insertSoftwareCreditIntoCues(cues, {
                        isPro: true,
                        lang,
                        dualLineOrder: options.dualLineOrder,
                        mediaDurationMs: Number(options.mediaDurationMs) || undefined,
                    });
                    if (Array.isArray(applied?.cues)) cues = applied.cues;
                }
                const written = writeSubtitleDocument(subPath, {
                    cues,
                    format: row.doc.format,
                    header: row.doc.header,
                    backupMode: 'off',
                });
                if (written?.ok) {
                    onLog?.(
                        `时间轴护栏 · ${path.basename(subPath)} · 已从`
                        + (snap === engineFb ? '任务结果' : '收尾前快照')
                        + '恢复（成对强制）',
                    );
                }
            }
        } catch (err) {
            onLog?.(`时间轴护栏跳过：${err.message || err}`);
        }
    }

    // Absolute last file mutation: timing restore / credit re-write from engine snaps can
    // reintroduce bare「…」that runDropUselessEllipsisPass already cleared earlier.
    if (translateLike) {
        await runDropUselessEllipsisPass(item, options, {
            engineTask,
            onProgress,
            onLog,
        });
    }

    const underfillStats = polishMeta.underfillStats || {};
    return {
        ok: true,
        issueCount,
        paths,
        qcFixedMode,
        qcFixedWritten,
        qcFixedSummary,
        underfillLeft: Number(polishMeta.underfillLeft) || 0,
        underfillStats,
        bareHaLeft: Number(underfillStats.bareHa) || 0,
        underLickLeft: Number(underfillStats.underLick) || 0,
        blankRecovered: Number(blankMeta.recovered) || 0,
        blankLeft: Number(blankMeta.left) || 0,
        blankRounds: Number(blankMeta.blankRounds) || 0,
        qcLoopRetranscribed: Number(qcLoopMeta.retranscribed) || 0,
        qcLoopRetranslated: Number(qcLoopMeta.retranslated) || 0,
    };
}

module.exports = {
    normalizeQcFixMode,
    isTranslateLikeTask,
    buildItemRecord,
    resolvePostBatchQcScanOptions,
    scanDocIssueCount,
    scanPathIssueCount,
    scanItemPrimaryQcIssueCount,
    shouldSkipFakeGreetingForMt,
    runFinalMtSanitizePass,
    runBlankMtRetranslatePass,
    runDropUselessEllipsisPass,
    runFinalPostBatchPolish,
    runItemPostTaskHandoff,
    resolveCreditLangForPath,
    isSourceTrackSubtitlePath,
};
