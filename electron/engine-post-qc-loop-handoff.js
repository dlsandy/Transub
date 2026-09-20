/**
 * Post-QC closed loop: plan → optional local retranscribe → clear freeze → force retranslate.
 */
const path = require('path');
const policy = require('../src/js/quality-pipeline-policy-core');
const loopPlan = require('../src/js/post-qc-loop-plan-core');
const freezeCore = require('../src/js/source-freeze-meta-core');
const { readSubtitleMeta, writeSubtitleMeta } = require('./subtitle-meta');
const { isPostTaskStopRequested, cancelledPostTaskResult } = require('./engine-batch-item');

function loadBandMeta(sourcePath) {
    if (!sourcePath) return { bandByIndex: {}, holdIndexes: [] };
    try {
        const read = readSubtitleMeta(sourcePath);
        const meta = read?.meta || {};
        return {
            bandByIndex: meta.cueRiskBands || meta.bandByIndex || {},
            holdIndexes: freezeCore.readHoldIndexesFromMeta(meta),
            meta,
            metaPath: sourcePath,
        };
    } catch {
        return { bandByIndex: {}, holdIndexes: [] };
    }
}

function clearFreezeOnSource(sourcePath, onLog) {
    if (!sourcePath) return;
    try {
        const read = readSubtitleMeta(sourcePath);
        if (!freezeCore.isSourceFrozen(read.meta)) return;
        const next = freezeCore.clearSourceFreeze(read.meta || {});
        writeSubtitleMeta(sourcePath, next);
        onLog?.('源定稿已解除（QC 闭环改源）');
    } catch (err) {
        onLog?.(`解除源定稿跳过: ${err.message || err}`);
    }
}

/**
 * @returns {{ ok: boolean, skipped?: boolean, reason?: string, plan?: string, retranscribed?: number, retranslated?: number }}
 */
async function runPostQcLoopHandoff({
    item,
    options = {},
    mediaPath = '',
    primaryAsr = '',
    engineTask = '',
    onProgress,
    onLog,
    event = null,
    pass = 0,
    shouldStop = null,
    signal = null,
} = {}) {
    const stopRequested = () => isPostTaskStopRequested({ shouldStop, signal });
    if (stopRequested()) {
        return cancelledPostTaskResult();
    }
    if (!policy.isQualityPipelineActive(options)) {
        return { ok: true, skipped: true, reason: 'pipeline_off' };
    }
    try {
        const blankPolicy = require('../src/js/blank-mt-retry-policy-core');
        if (blankPolicy.isInferenceBlankDirectFinalize?.(options)) {
            return { ok: true, skipped: true, reason: 'sentence_mt_direct_ellipsis' };
        }
    } catch { /* optional */ }
    const maxPasses = policy.resolveEffectivePostQcLoopMaxPasses
        ? policy.resolveEffectivePostQcLoopMaxPasses(options)
        : policy.clampPostQcLoopMaxPasses(options.postQcLoopMaxPasses);
    if (maxPasses <= 0 || pass >= maxPasses) {
        return { ok: true, skipped: true, reason: 'pass_budget' };
    }

    const srcPath = String(item?.sourceSubtitlePath || '').trim();
    const zhPath = String(
        item?.targetSubtitlePath || item?.subtitlePath || '',
    ).trim();
    if (!zhPath) {
        return { ok: true, skipped: true, reason: 'no_target' };
    }

    onProgress?.({
        stage: 'qc_loop',
        percent: 20,
        detail: 'QC 闭环规划…',
        itemStage: 'qc_loop',
    });

    if (stopRequested()) return cancelledPostTaskResult();

    const { readSubtitleDocument } = require('./extensions-bridge');
    const zhDoc = readSubtitleDocument(zhPath);
    if (!zhDoc?.ok) {
        return { ok: false, error: zhDoc?.error || '无法读取译文' };
    }
    const cues = zhDoc.cues || [];
    const qc = require('../src/js/subtitle-qc-core');
    const scanned = qc.scanCueIssues(cues, qc.defaultPostBatchQcScanOptions?.() || {});
    const issues = scanned?.issues || [];

    const bandMeta = loadBandMeta(srcPath);
    const plan = loopPlan.planPostQcLoop(cues, issues, {
        ...options,
        pass,
        postQcLoopMaxPasses: maxPasses,
        bandByIndex: bandMeta.bandByIndex,
        holdIndexes: bandMeta.holdIndexes,
        blankExhaustedIndexes: options.blankExhaustedIndexes || options.blankMtSkipLlmIndexes || [],
        maxRetranscribeRanges: options.qcSmartMaxRetranscribeRanges || 8,
        maxRetranslateIndexes: 40,
    });

    if (plan.skip) {
        const skipMsg = plan.reason === 'nothing_to_do'
            ? 'QC 闭环：无需动作'
            : plan.reason === 'mt_exhausted'
                ? 'QC 闭环跳过：空白已由主译/空白重译穷尽（避免重复重转）'
                : `QC 闭环跳过: ${plan.reason}`;
        onLog?.(skipMsg);
        return { ok: true, skipped: true, reason: plan.reason, plan: plan.plan };
    }

    if (stopRequested()) return cancelledPostTaskResult({ plan: plan.plan });

    onLog?.(`QC 闭环：${plan.plan}`);
    onProgress?.({
        stage: 'qc_loop',
        percent: 40,
        detail: plan.plan || 'QC 闭环…',
        itemStage: 'qc_loop',
    });

    let retranscribed = 0;
    if (plan.retranscribeRanges?.length && mediaPath && options.qcSmartRetranscribe !== false) {
        try {
            const { transcribeRangeWithEngine } = require('./engine-bridge');
            const {
                resolveQcRetranscribeEngineContext,
                releaseGpuAfterQcRetranscribeBurst,
            } = require('./engine-qc-retranscribe-options');
            const { options: engineOpts, primaryAsr: asrId } = resolveQcRetranscribeEngineContext({
                ...options,
                primaryAsr,
                mediaPath,
                _batchMode: true,
                allowDuringBatch: true,
            });
            const jaDoc = srcPath ? readSubtitleDocument(srcPath) : null;
            let jaCues = jaDoc?.ok ? [...(jaDoc.cues || [])] : null;

            for (let i = 0; i < plan.retranscribeRanges.length; i += 1) {
                if (stopRequested()) {
                    return cancelledPostTaskResult({
                        plan: plan.plan,
                        retranscribed,
                        retranslated: 0,
                    });
                }
                const range = plan.retranscribeRanges[i];
                onProgress?.({
                    stage: 'qc_loop',
                    percent: 40 + Math.round((i / Math.max(1, plan.retranscribeRanges.length)) * 30),
                    detail: `QC 闭环重转 ${i + 1}/${plan.retranscribeRanges.length}…`,
                    itemStage: 'qc_loop',
                });
                try {
                    const res = await transcribeRangeWithEngine({
                        mediaPath,
                        startMs: range.startMs,
                        endMs: range.endMs,
                        language: options.language || 'auto',
                        asrModel: asrId,
                        options: engineOpts,
                        allowDuringBatch: true,
                        _batchMode: true,
                        shouldStop: stopRequested,
                        signal,
                    }, {
                        options: engineOpts,
                        allowDuringBatch: true,
                        _batchMode: true,
                        shouldStop: stopRequested,
                        signal,
                        onProgress: (info) => {
                            onProgress?.({
                                stage: 'qc_loop',
                                percent: 40 + Math.round((i / Math.max(1, plan.retranscribeRanges.length)) * 30),
                                detail: info?.detail
                                    ? `QC 闭环重转 ${i + 1}/${plan.retranscribeRanges.length} · ${info.detail}`
                                    : `QC 闭环重转 ${i + 1}/${plan.retranscribeRanges.length}…`,
                                itemStage: 'qc_loop',
                            });
                        },
                    });
                    if (res?.cancelled || res?.code === 'cancelled') {
                        return cancelledPostTaskResult({
                            plan: plan.plan,
                            retranscribed,
                            retranslated: 0,
                        });
                    }
                    if (res?.ok && Array.isArray(res.cues) && res.cues.length && jaCues) {
                        const meta = require('../src/js/subtitle-meta-core');
                        const spliced = meta.replaceCuesInTimeRange?.(
                            jaCues,
                            range.startMs,
                            range.endMs,
                            res.cues,
                        );
                        if (spliced?.cues) {
                            jaCues = spliced.cues;
                            retranscribed += 1;
                        }
                    } else if (res && res.ok === false && res.error) {
                        onLog?.(`QC 闭环重转跳过窗 ${i + 1}: ${res.error}`);
                    }
                } catch (err) {
                    onLog?.(`QC 闭环重转跳过窗 ${i + 1}: ${err.message || err}`);
                }
            }
            try {
                await releaseGpuAfterQcRetranscribeBurst({ ...options, ...engineOpts });
            } catch (_) { /* optional */ }

            if (retranscribed > 0 && jaCues && srcPath) {
                const { writeSubtitleDocument } = require('./extensions-bridge');
                writeSubtitleDocument(srcPath, {
                    format: jaDoc.format,
                    cues: jaCues,
                    backupMode: 'off',
                });
                clearFreezeOnSource(srcPath, onLog);
                onLog?.(`QC 闭环：源轨已更新 ${retranscribed} 窗`);
            }
        } catch (err) {
            onLog?.(`QC 闭环重转跳过: ${err.message || err}`);
        }
    }

    let retranslated = 0;
    if (plan.retranslateIndexes?.length && srcPath) {
        if (stopRequested()) {
            return cancelledPostTaskResult({
                plan: plan.plan,
                retranscribed,
                retranslated: 0,
            });
        }
        onProgress?.({
            stage: 'qc_loop',
            percent: 80,
            detail: 'QC 闭环补译…',
            itemStage: 'qc_loop',
        });
        try {
            const { runBlankMtRetryForSubtitlePair } = require('./engine-blank-mt-retry');
            const res = await runBlankMtRetryForSubtitlePair({
                zhPath,
                jaPath: srcPath,
                options: {
                    ...options,
                    forceRetranslateIndexes: plan.retranslateIndexes,
                    // Do not expand to every leftover blank — plan already capped at 40.
                    forceRetranslateOnly: true,
                    // Hard cap: dialogMode must not inflate this back to 4 rounds.
                    blankMtRetryMaxRounds: 1,
                },
                forceRetranslateIndexes: plan.retranslateIndexes,
                maxCues: Math.min(40, plan.retranslateIndexes.length),
                maxRounds: 1,
                onLog,
                shouldStop: stopRequested,
                signal,
                onProgress: (info) => {
                    onProgress?.({
                        stage: 'qc_loop',
                        percent: Number(info?.pct) || 85,
                        detail: info?.detail || 'QC 闭环补译…',
                        itemStage: 'qc_loop',
                    });
                },
                event,
            });
            if (res?.cancelled || res?.code === 'cancelled') {
                return cancelledPostTaskResult({
                    plan: plan.plan,
                    retranscribed,
                    retranslated: Number(res?.recovered) || 0,
                });
            }
            retranslated = Number(res?.recovered) || 0;
            if (retranslated > 0) {
                onLog?.(`QC 闭环补译 ${retranslated} 条 · ${path.basename(zhPath)}`);
            }
        } catch (err) {
            onLog?.(`QC 闭环补译跳过: ${err.message || err}`);
        }
    }

    onProgress?.({
        stage: 'qc_loop',
        percent: 100,
        detail: 'QC 闭环完成',
        itemStage: 'qc_loop',
    });

    return {
        ok: true,
        plan: plan.plan,
        retranscribed,
        retranslated,
        pass,
    };
}

module.exports = {
    runPostQcLoopHandoff,
    loadBandMeta,
    clearFreezeOnSource,
};
