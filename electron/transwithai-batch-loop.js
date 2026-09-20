/**
 * TransWithAI subtitle batch loop — per-file infer / dual / smart-translate orchestration.
 * FEATURE FROZEN — structure extract only; bound via createTranswithAiBatchLoop(host).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_HOST_KEYS = [
    'jobCancelled',
    'dualCore',
    'modelCore',
    'broadcastProgress',
    'broadcastToSubtitleTaskUi',
    'resolveInferOutputDir',
    'resolveDualSubtitlePaths',
    'resolveLocalSubtitlePath',
    'runInferOnce',
    'mapInferStageProgress',
    'resolveSafePath',
    'buildDualPassOptions',
    'renameStemSubtitlesWithSuffix',
    'dualTargetPathFromSource',
    'applyPostBatchPipeline',
    'setSessionPostTaskOptions',
    'writeMergedBilingualSubtitleFiles',
    'unlinkSubtitleFilesQuietly',
];

/**
 * @param {object} host bridge bindings (mutable: jobCancelled / itemCancelled via getters)
 */
function createTranswithAiBatchLoop(host) {
    if (!host || typeof host !== 'object') {
        throw new Error('createTranswithAiBatchLoop: host required');
    }
    const missing = REQUIRED_HOST_KEYS.filter((k) => {
        if (k === 'jobCancelled') return !('jobCancelled' in host);
        return host[k] == null;
    });
    if (missing.length) {
        throw new Error('createTranswithAiBatchLoop: incomplete host (missing: ' + missing.join(', ') + ')');
    }

    const stopRequested = () => !!(host.jobCancelled || host.itemCancelled);
    const {
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
    } = host;

    async function executeSubtitleBatchLoop(items, options, check, windowManager, invokeSender, onBatchProgress, extra = {}) {
        let generated = 0;
        let skipped = 0;
        let failed = 0;
        const errors = [];
        const outputs = [];
        const getUserDataPath = extra.getUserDataPath || null;
        const isDual = options.task === 'dual';
        const useSmartTranslate = !!options.smartTranslate
            && (options.task === 'translate' || options.task === 'dual');
        const sourceSuffix = dualCore.resolveDualSourceSuffix(options.language, options.dualTargetSuffix);
        const targetSuffix = dualCore.normalizeDualTargetSuffix(options.dualTargetSuffix);

        const emitBatchProgress = (payload) => {
            onBatchProgress?.(payload);
            broadcastProgress(windowManager, payload, invokeSender);
        };

        const finishItemWithPostTask = async ({
            progressMetaBase,
            outPaths,
            doneDetail = '完成',
        }) => {
            let postTaskMeta = { issueCount: 0 };
            try {
                const { runItemPostTaskHandoff } = require('./engine-item-posttask-handoff');
                postTaskMeta = await runItemPostTaskHandoff({
                    mediaPath: progressMetaBase.fullPath,
                    outPaths,
                    options,
                    engineTask: options.task,
                    polishAlreadyDone: true,
                    onProgress: (info) => {
                        emitBatchProgress({
                            ...progressMetaBase,
                            ...info,
                            phase: info.phase || 'running',
                        });
                    },
                    onLog: (line) => {
                        broadcastToSubtitleTaskUi(
                            windowManager,
                            invokeSender,
                            'transwithai-infer-log',
                            { line: `[post] ${line}`, source: 'twai' },
                        );
                    },
                    event: invokeSender ? { sender: invokeSender } : null,
                }) || postTaskMeta;
            } catch (err) {
                broadcastToSubtitleTaskUi(windowManager, invokeSender, 'transwithai-infer-log', {
                    line: `[post] 任务收尾跳过：${err.message || err}`,
                    source: 'twai',
                });
            }
            const detail = Number(postTaskMeta.issueCount) > 0
                ? `${doneDetail} · QC ${postTaskMeta.issueCount} 项`
                : doneDetail;
            emitBatchProgress({
                ...progressMetaBase,
                phase: 'done',
                subtitlePath: outPaths.subtitlePath,
                sourceSubtitlePath: outPaths.sourceSubtitlePath,
                targetSubtitlePath: outPaths.targetSubtitlePath,
                bilingualSubtitlePath: outPaths.bilingualSubtitlePath,
                itemProgress: 100,
                itemStage: 'done',
                itemDetail: detail,
                videoCurrentSec: 0,
                videoTotalSec: 0,
                qcIssueCount: Number(postTaskMeta.issueCount) || 0,
                qcFixedMode: postTaskMeta.qcFixedMode || '',
                qcFixedWritten: !!postTaskMeta.qcFixedWritten,
                qcFixedSummary: postTaskMeta.qcFixedSummary || '',
            });
            return postTaskMeta;
        };

        const runSingleInferItem = async (safePath, itemOptions, durationHint, progressMeta) => {
            const result = await runInferOnce(check.path, safePath, {
                ...itemOptions,
                durationHint,
            }, (update) => {
                const stage = update.stage || 'transcribe';
                const pipelinePct = update.pipelineProgress ?? mapInferStageProgress(
                    stage,
                    update.videoProgress ?? 0,
                    update.videoCurrentSec ?? 0,
                    update.videoTotalSec ?? 0,
                );
                const dualPhase = progressMeta?.dualPhase || null;
                const itemProgress = dualPhase
                    ? dualCore.mapDualPassProgress(progressMeta.passIndex || 0, pipelinePct)
                    : pipelinePct;
                // 阶段名由前端 stageLabel 展示；此处只传时间轴 / 语音检测 / 模型等补充信息
                let detail = String(update.detail || '').trim() || undefined;
                if (detail) {
                    detail = detail
                        .replace(/^(转写\s*\/\s*翻译中|转写中|翻译中|转写|翻译|识别中)\s*[·•]?\s*/u, '')
                        .trim() || undefined;
                }
                emitBatchProgress({
                    index: progressMeta.index,
                    total: progressMeta.total,
                    fullPath: progressMeta.fullPath,
                    sourcePath: progressMeta.sourcePath,
                    phase: 'running',
                    itemProgress,
                    itemStage: stage,
                    itemDetail: detail,
                    itemDualPhase: dualPhase || undefined,
                    videoCurrentSec: update.videoCurrentSec ?? 0,
                    videoTotalSec: update.videoTotalSec ?? 0,
                });
            }, (line) => {
                broadcastToSubtitleTaskUi(windowManager, invokeSender, 'transwithai-infer-log', { line });
            });
            return result;
        };

        for (let i = 0; i < items.length; i += 1) {
            if (host.jobCancelled) break;
            const item = items[i] || {};
            const fullPath = String(item.fullPath || item.path || item || '').trim();
            const sourcePath = String(item.sourcePath || fullPath).trim();
            const subtitleOutputDir = resolveInferOutputDir(fullPath, options);
            if (!fullPath) {
                skipped += 1;
                continue;
            }

            const liveBatch = require('./live-batch-queue');
            if (liveBatch.consumeSkip(fullPath)) {
                skipped += 1;
                emitBatchProgress({
                    index: i + 1,
                    total: items.length,
                    fullPath,
                    sourcePath,
                    phase: 'cancelled',
                    itemProgress: 0,
                    itemStage: 'cancelled',
                    itemDetail: '已从队列移除',
                    error: 'cancelled',
                });
                continue;
            }

            const itemOptions = {
                ...options,
                outputDir: subtitleOutputDir,
            };
            const progressMetaBase = {
                index: i + 1,
                total: items.length,
                fullPath,
                sourcePath,
            };

            liveBatch.setCurrent(fullPath);
            if (stopRequested()) {
                if (host.itemCancelled && !host.jobCancelled) {
                    host.itemCancelled = false;
                    skipped += 1;
                    emitBatchProgress({
                        ...progressMetaBase,
                        phase: 'cancelled',
                        itemProgress: 0,
                        itemStage: 'cancelled',
                        itemDetail: '已取消',
                        error: 'cancelled',
                    });
                    liveBatch.clearCurrent();
                    continue;
                }
                liveBatch.clearCurrent();
                break;
            }
            try {
            if (!options.overwrite) {
                if (isDual) {
                    const pair = resolveDualSubtitlePaths(fullPath, subtitleOutputDir, {
                        sourceSuffix,
                        targetSuffix,
                        subFormats: options.subFormats,
                    });
                    if (pair.complete) {
                        skipped += 1;
                        outputs.push({
                            videoPath: fullPath,
                            subtitlePath: pair.targetPath || pair.sourcePath || '',
                            sourceSubtitlePath: pair.sourcePath || '',
                            targetSubtitlePath: pair.targetPath || '',
                            status: 'skipped',
                        });
                        emitBatchProgress({
                            ...progressMetaBase,
                            phase: 'skipped',
                            subtitlePath: pair.targetPath || pair.sourcePath,
                            sourceSubtitlePath: pair.sourcePath || undefined,
                            targetSubtitlePath: pair.targetPath || undefined,
                            itemProgress: 100,
                            itemStage: 'skipped',
                            itemDetail: '已有双语字幕',
                        });
                        continue;
                    }
                } else {
                    const existing = resolveLocalSubtitlePath(fullPath, subtitleOutputDir);
                    if (existing) {
                        skipped += 1;
                        outputs.push({
                            videoPath: fullPath,
                            subtitlePath: existing,
                            status: 'skipped',
                        });
                        emitBatchProgress({
                            ...progressMetaBase,
                            phase: 'skipped',
                            subtitlePath: existing,
                            itemProgress: 100,
                            itemStage: 'skipped',
                            itemDetail: '已有字幕',
                        });
                        continue;
                    }
                }
            }

            emitBatchProgress({
                ...progressMetaBase,
                phase: 'running',
                itemProgress: 0,
                itemStage: 'starting',
                itemDualPhase: isDual ? 'transcribe' : undefined,
            });

            try {
                const safePath = resolveSafePath(fullPath);
                const durationHint = Number(item.durationSec || item.duration || 0) || 0;

                if (!isDual) {
                    const wantSmart = useSmartTranslate && options.task === 'translate';
                    const singleOpts = {
                        ...itemOptions,
                        task: wantSmart ? 'transcribe' : itemOptions.task,
                        modelPath: modelCore.resolvePassModelPath(
                            itemOptions,
                            wantSmart ? 'transcribe' : itemOptions.task,
                        ),
                    };
                    const result = await runSingleInferItem(safePath, singleOpts, durationHint, progressMetaBase);
                    let subtitlePath = result.subtitlePath || '';

                    if (wantSmart && subtitlePath) {
                        // Archive ASR transcript before smart translate overwrites in place.
                        try {
                            const { keepTranscriptFiles } = require('./transcript-keep');
                            keepTranscriptFiles([subtitlePath], options);
                        } catch { /* ignore */ }
                        emitBatchProgress({
                            ...progressMetaBase,
                            phase: 'running',
                            itemProgress: 65,
                            itemStage: 'translate',
                            itemDetail: '智能翻译中…',
                            itemDualPhase: 'translate',
                            subtitlePath,
                        });
                        const { smartTranslateSubtitleFile } = require('./advanced-bridge');
                        const translated = await smartTranslateSubtitleFile({
                            sourcePath: subtitlePath,
                            destPath: subtitlePath,
                            chineseSubtitleVariant: options.chineseSubtitleVariant,
                            smartTranslateFaithfulTone: !!options.smartTranslateFaithfulTone,
                            signal: extra.signal,
                            _batchMode: true,
                            onProgress: (info) => {
                                const pct = Number(info?.pct);
                                const mapped = Number.isFinite(pct)
                                    ? mapInferStageProgress('translate', pct)
                                    : 65;
                                emitBatchProgress({
                                    ...progressMetaBase,
                                    phase: 'running',
                                    itemProgress: mapped,
                                    itemStage: 'translate',
                                    itemDetail: info?.message || '智能翻译中…',
                                    itemDualPhase: 'translate',
                                    subtitlePath,
                                });
                            },
                        });
                        if (!translated?.ok) {
                            throw new Error(translated?.error || '智能翻译失败');
                        }
                        subtitlePath = translated.path || subtitlePath;
                    } else if (options.task === 'transcribe' && subtitlePath) {
                        try {
                            const { keepTranscriptFiles } = require('./transcript-keep');
                            keepTranscriptFiles([subtitlePath], options);
                        } catch { /* ignore */ }
                    }

                    applyPostBatchPipeline([subtitlePath], options, {
                        onLog: (line) => {
                            broadcastToSubtitleTaskUi(
                                windowManager,
                                invokeSender,
                                'transwithai-infer-log',
                                { line: `[post] ${line}`, source: 'twai' },
                            );
                        },
                    });

                    setSessionPostTaskOptions({ lastOutputDir: subtitleOutputDir });
                    generated += 1;
                    outputs.push({
                        videoPath: fullPath,
                        subtitlePath,
                        status: 'done',
                    });
                    await finishItemWithPostTask({
                        progressMetaBase,
                        outPaths: { subtitlePath },
                        doneDetail: '完成',
                    });
                    continue;
                }

                // —— dual: transcribe → rename → translate → rename ——
                let sourceSubtitlePath = null;
                let targetSubtitlePath = null;
                let sourceSubtitlePaths = [];
                let targetSubtitlePaths = [];

                try {
                    const transcribeOpts = buildDualPassOptions(itemOptions, 'transcribe', check.path, getUserDataPath);
                    await runSingleInferItem(safePath, transcribeOpts, durationHint, {
                        ...progressMetaBase,
                        dualPhase: 'transcribe',
                        passIndex: 0,
                    });
                    const sourceRenamed = renameStemSubtitlesWithSuffix(
                        safePath,
                        subtitleOutputDir,
                        options.subFormats,
                        sourceSuffix,
                        { overwrite: true },
                    );
                    sourceSubtitlePaths = sourceRenamed;
                    sourceSubtitlePath = sourceRenamed[0] || null;

                    emitBatchProgress({
                        ...progressMetaBase,
                        phase: 'running',
                        itemProgress: 49,
                        itemStage: 'starting',
                        itemDetail: useSmartTranslate ? '智能翻译中…' : undefined,
                        itemDualPhase: 'translate',
                        sourceSubtitlePath,
                    });

                    if (useSmartTranslate) {
                        const { smartTranslateSubtitleFile } = require('./advanced-bridge');
                        targetSubtitlePaths = [];
                        for (let si = 0; si < sourceSubtitlePaths.length; si += 1) {
                            const srcPath = sourceSubtitlePaths[si];
                            const destPath = dualTargetPathFromSource(srcPath, sourceSuffix, targetSuffix);
                            const translated = await smartTranslateSubtitleFile({
                                sourcePath: srcPath,
                                destPath,
                                chineseSubtitleVariant: options.chineseSubtitleVariant,
                                smartTranslateFaithfulTone: !!options.smartTranslateFaithfulTone,
                                signal: extra.signal,
                                _batchMode: true,
                                onProgress: (info) => {
                                    const pct = Number(info?.pct);
                                    const mapped = Number.isFinite(pct)
                                        ? mapInferStageProgress('translate', pct)
                                        : 65;
                                    emitBatchProgress({
                                        ...progressMetaBase,
                                        phase: 'running',
                                        itemProgress: mapped,
                                        itemStage: 'translate',
                                        itemDetail: info?.message || '智能翻译中…',
                                        itemDualPhase: 'translate',
                                        sourceSubtitlePath,
                                    });
                                },
                            });
                            if (!translated?.ok) {
                                throw new Error(translated?.error || '智能翻译失败');
                            }
                            targetSubtitlePaths.push(translated.path || destPath);
                        }
                        targetSubtitlePath = targetSubtitlePaths[0] || null;
                    } else {
                        const translateOpts = buildDualPassOptions(itemOptions, 'translate', check.path, getUserDataPath);
                        await runSingleInferItem(safePath, translateOpts, durationHint, {
                            ...progressMetaBase,
                            dualPhase: 'translate',
                            passIndex: 1,
                        });
                        const targetRenamed = renameStemSubtitlesWithSuffix(
                            safePath,
                            subtitleOutputDir,
                            options.subFormats,
                            targetSuffix,
                            { overwrite: true },
                        );
                        targetSubtitlePaths = targetRenamed;
                        targetSubtitlePath = targetRenamed[0] || null;
                    }
                } catch (dualErr) {
                    const msg = dualErr.message || String(dualErr);
                    const wrapped = new Error(
                        sourceSubtitlePath
                            ? `翻译失败（原文已保留）：${msg}`
                            : msg,
                    );
                    wrapped.sourceSubtitlePath = sourceSubtitlePath;
                    throw wrapped;
                }

                let bilingualSubtitlePath = null;
                let deletedSourcesAfterMerge = false;
                // Archive source-language tracks before optional merge deletion.
                let keptSourcePaths = [];
                if (sourceSubtitlePaths.length) {
                    try {
                        const { keepTranscriptFiles } = require('./transcript-keep');
                        const kept = keepTranscriptFiles(sourceSubtitlePaths, options);
                        if (kept?.ok && Array.isArray(kept.kept)) keptSourcePaths = kept.kept.filter(Boolean);
                    } catch { /* ignore */ }
                }

                // Postprocess + compact MUST run before merge so the player-facing
                // `{stem}.srt` bilingual file inherits viewing punct / filler cleanup.
                applyPostBatchPipeline([
                    targetSubtitlePath,
                    sourceSubtitlePath,
                    ...sourceSubtitlePaths,
                    ...targetSubtitlePaths,
                ], options, {
                    onLog: (line) => {
                        broadcastToSubtitleTaskUi(
                            windowManager,
                            invokeSender,
                            'transwithai-infer-log',
                            { line: `[post] ${line}`, source: 'twai' },
                        );
                    },
                });

                {
                    const batchPostprocessPlan = require('./engine-batch-postprocess-plan');
                    const {
                        dropDiscourse,
                        dropOnomatopoeia,
                        shouldCompact,
                    } = batchPostprocessPlan.resolveInterjectionDropFlags(options);
                    if (shouldCompact) {
                        try {
                            const { compactPureInterjectionSubtitlePair } = require('./extensions-bridge');
                            const zhPaths = [
                                targetSubtitlePath,
                                ...targetSubtitlePaths,
                            ].filter(Boolean);
                            const jaPath = sourceSubtitlePath || sourceSubtitlePaths[0] || '';
                            const uniqueZh = [...new Set(zhPaths.map((p) => path.resolve(String(p))))]
                                .filter((subPath) => /\.(srt|vtt|lrc)$/i.test(subPath) && fs.existsSync(subPath));
                            for (const zhPath of uniqueZh) {
                                if (jaPath && path.resolve(String(jaPath)) === zhPath) continue;
                                const cm = compactPureInterjectionSubtitlePair(zhPath, jaPath, {
                                    backupMode: 'off',
                                    dropDiscourse,
                                    dropOnomatopoeia,
                                });
                                if (cm?.ok && cm.dropped) {
                                    broadcastToSubtitleTaskUi(
                                        windowManager,
                                        invokeSender,
                                        'transwithai-infer-log',
                                        {
                                            line: `[post] ${cm.summary || '清除语气/拟声'} ${path.basename(zhPath)}`,
                                            source: 'twai',
                                        },
                                    );
                                }
                            }
                        } catch (err) {
                            broadcastToSubtitleTaskUi(
                                windowManager,
                                invokeSender,
                                'transwithai-infer-log',
                                {
                                    line: `[post] 清除语气/拟声跳过：${err.message || err}`,
                                    source: 'twai',
                                },
                            );
                        }
                    }
                }

                if (options.mergeBilingualSubtitles && sourceSubtitlePaths.length && targetSubtitlePaths.length) {
                    try {
                        // Always name merged file like the media (players auto-load `{stem}.srt`).
                        const nameAsVideoStem = true;
                        const mergedPaths = [];
                        for (const src of sourceSubtitlePaths) {
                            const srcExt = path.extname(src).toLowerCase();
                            const tgt = targetSubtitlePaths.find(
                                (t) => path.extname(t).toLowerCase() === srcExt,
                            );
                            if (!tgt) continue;
                            mergedPaths.push(writeMergedBilingualSubtitleFiles(src, tgt, {
                                primaryTrack: options.dualPrimaryTrack,
                                lineOrder: options.dualLineOrder || 'target-first',
                                nameAsVideoStem,
                            }));
                        }
                        bilingualSubtitlePath = mergedPaths.find((p) => /\.srt$/i.test(p))
                            || mergedPaths[0]
                            || null;
                        if (bilingualSubtitlePath && options.deleteSourcesAfterMergeBilingual) {
                            unlinkSubtitleFilesQuietly([...sourceSubtitlePaths, ...targetSubtitlePaths]);
                            deletedSourcesAfterMerge = true;
                            sourceSubtitlePath = null;
                            targetSubtitlePath = null;
                            sourceSubtitlePaths = [];
                            targetSubtitlePaths = [];
                        }
                    } catch (mergeErr) {
                        const msg = mergeErr.message || String(mergeErr);
                        broadcastToSubtitleTaskUi(windowManager, invokeSender, 'transwithai-infer-log', {
                            line: `[warn] 双语轨已生成，但合并失败：${msg}`,
                        });
                    }
                }
                // History / 保留转录原文：旁路删除后仍指向本次转录的 keep 归档
                if ((!sourceSubtitlePath || !fs.existsSync(sourceSubtitlePath)) && keptSourcePaths[0]) {
                    sourceSubtitlePath = keptSourcePaths[0];
                }

                // Safety pass on the merged bilingual file (viewing punct + in-cue filler clear).
                if (bilingualSubtitlePath) {
                    applyPostBatchPipeline([bilingualSubtitlePath], options, {
                        onLog: (line) => {
                            broadcastToSubtitleTaskUi(
                                windowManager,
                                invokeSender,
                                'transwithai-infer-log',
                                { line: `[post] ${line}`, source: 'twai' },
                            );
                        },
                    });
                }

                setSessionPostTaskOptions({ lastOutputDir: subtitleOutputDir });
                generated += 1;
                outputs.push({
                    videoPath: fullPath,
                    subtitlePath: bilingualSubtitlePath || targetSubtitlePath || sourceSubtitlePath || '',
                    sourceSubtitlePath: sourceSubtitlePath || '',
                    targetSubtitlePath: targetSubtitlePath || '',
                    bilingualSubtitlePath: bilingualSubtitlePath || '',
                    status: 'done',
                });
                const mergeDetail = bilingualSubtitlePath
                    ? (deletedSourcesAfterMerge ? '已合并并清理原轨' : '已合并双语')
                    : '完成';
                await finishItemWithPostTask({
                    progressMetaBase,
                    outPaths: {
                        subtitlePath: bilingualSubtitlePath || targetSubtitlePath || sourceSubtitlePath || '',
                        sourceSubtitlePath: sourceSubtitlePath || undefined,
                        targetSubtitlePath: targetSubtitlePath || undefined,
                        bilingualSubtitlePath: bilingualSubtitlePath || undefined,
                    },
                    doneDetail: mergeDetail,
                });
            } catch (err) {
                const msg = String(err?.message || err || '');
                const isItemCancel = !!host.itemCancelled && !host.jobCancelled;
                const isCancel = isItemCancel
                    || !!host.jobCancelled
                    || /取消|cancelled/i.test(msg);
                if (isItemCancel) {
                    host.itemCancelled = false;
                    skipped += 1;
                    emitBatchProgress({
                        ...progressMetaBase,
                        phase: 'cancelled',
                        error: 'cancelled',
                        itemProgress: 0,
                        itemStage: 'cancelled',
                        itemDetail: '已取消',
                    });
                    continue;
                }
                failed += 1;
                if (errors.length < 8) {
                    errors.push(`${path.basename(fullPath)}: ${msg}`);
                }
                if (err.sourceSubtitlePath) {
                    outputs.push({
                        videoPath: fullPath,
                        subtitlePath: err.sourceSubtitlePath,
                        sourceSubtitlePath: err.sourceSubtitlePath,
                        status: isCancel ? 'cancelled' : 'failed',
                    });
                }
                emitBatchProgress({
                    ...progressMetaBase,
                    phase: isCancel ? 'cancelled' : 'failed',
                    error: isCancel ? 'cancelled' : msg,
                    sourceSubtitlePath: err.sourceSubtitlePath || undefined,
                    subtitlePath: err.sourceSubtitlePath || undefined,
                    itemProgress: isCancel ? 0 : 100,
                    itemStage: isCancel ? 'cancelled' : 'failed',
                    itemDetail: isCancel ? '已取消' : msg,
                });
            }
            } finally {
                require('./live-batch-queue').clearCurrent();
            }
        }

        try {
            if (useSmartTranslate) {
                require('./advanced-llama-server').stopLlamaServer();
            }
        } catch (_) { /* ignore */ }

        return host.jobCancelled
            ? {
                ok: false,
                cancelled: true,
                error: '任务已取消',
                generated,
                skipped,
                failed,
                total: items.length,
                errors,
                outputs,
            }
            : {
                ok: failed === 0,
                generated,
                skipped,
                failed,
                total: items.length,
                errors,
                outputs,
            };
    }

    return { executeSubtitleBatchLoop };
}

module.exports = {
    createTranswithAiBatchLoop,
    REQUIRED_HOST_KEYS,
};
