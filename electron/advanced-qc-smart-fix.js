/**
 * Pro QC 智能修复编排：规则修复 → 静音/LLM 断句 → 局部重转写 → 润色 → 语义审阅 → 写回。
 * 仅编排与门控/IPC 进度；闭源算法仍经 advanced-closed-api / _advanced。
 */
const { asString, asPlainObject } = require('./ipc-validate');
const { readAdvancedDoc } = require('./advanced-license-data');
const { resolveAdvancedLlmConfig } = require('./advanced-llm-resolve');
const { logAdvancedLlmToEngine } = require('./advanced-llm-log');

/**
 * @param {object} host
 * @param {() => object} host.requireQcSmartFix
 * @param {(llm: object, input?: object) => void} host.releaseManagedLlmAfterJob
 * @param {(payload: object, event?: object) => Promise<object>} host.runContextReconstructBody
 * @param {(payload: object, event?: object) => Promise<object>} host.runBilingualSemanticReviewBody
 */
function createAdvancedQcSmartFix(host = {}) {
    if (typeof host.requireQcSmartFix !== 'function') {
        throw new Error('createAdvancedQcSmartFix: host.requireQcSmartFix required');
    }
    if (typeof host.releaseManagedLlmAfterJob !== 'function') {
        throw new Error('createAdvancedQcSmartFix: host.releaseManagedLlmAfterJob required');
    }
    if (typeof host.runContextReconstructBody !== 'function') {
        throw new Error('createAdvancedQcSmartFix: host.runContextReconstructBody required');
    }
    if (typeof host.runBilingualSemanticReviewBody !== 'function') {
        throw new Error('createAdvancedQcSmartFix: host.runBilingualSemanticReviewBody required');
    }

    /** Restore Transub watermark text after QC mutate (www → ww！ etc.). */
    function healSoftwareCreditCues(cues) {
        try {
            const creditCore = require('../src/js/subtitle-software-credit-core');
            if (typeof creditCore.normalizeSoftwareCreditInCues !== 'function') {
                return { cues: Array.isArray(cues) ? cues : [], changed: 0 };
            }
            return creditCore.normalizeSoftwareCreditInCues(cues);
        } catch (_) {
            return { cues: Array.isArray(cues) ? cues : [], changed: 0 };
        }
    }

    /**
     * QC 智能修复：规则修复 →（可选）局部重转写 → 语境重构润色 → 写回。
     * 重转写走引擎锁，LLM 润色走 Pro 锁，避免嵌套互斥。
     */
    async function runQcSmartFix(payload = {}, event = null) {
        const gate = host.requireQcSmartFix();
        if (!gate.ok) return gate;

        const input = asPlainObject(payload);
        const prepared = await prepareQcSmartFixState(input, event);
        if (!prepared?.ok) return prepared;
        if (prepared.done) return prepared.result;

        const computeLock = require('./compute-task-lock');
        return computeLock.runWithComputeLockUnlessNested({
            kind: 'advanced_qc_smart_fix',
            owner: 'Pro',
            source: 'runQcSmartFix',
        }, payload, () => finishQcSmartFixWithLlm(prepared, input, event));
    }

    function sendQcSmartProgress(event, input, info) {
        try {
            event?.sender?.send?.('transub-advanced-reconstruct-progress', {
                mode: 'qc-smart',
                ...info,
            });
        } catch (_) { /* ignore */ }
        if (typeof input.onProgress === 'function') {
            try { input.onProgress(info); } catch (_) { /* ignore */ }
        }
    }

    /**
     * LLM 智能断句（in-memory）：对高 CPS / 连续文本给出 breakIndices。
     */
    async function runQcLlmSplitRequest(payload = {}, event = null) {
        const gate = host.requireQcSmartFix();
        if (!gate.ok) return gate;

        const input = asPlainObject(payload);
        const smartCore = require('../src/js/subtitle-qc-smart-core');
        const items = Array.isArray(input.cues) ? input.cues : [];
        if (!items.length) {
            return { ok: true, splits: [], skipped: true, summary: '无断句目标' };
        }

        const doc = readAdvancedDoc().doc;
        const dryRun = !!input.dryRun
            || !!doc.reconstructMock
            || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim() === '1'
            || String(process.env.TRANSUB_ADVANCED_RECONSTRUCT_MOCK || '').trim().toLowerCase() === 'true';

        sendQcSmartProgress(event, input, {
            phase: 'llm-split',
            message: `智能断句 ${items.length} 条…`,
            pct: 20,
            targetCount: items.length,
        });

        if (dryRun) {
            const mocked = smartCore.mockLlmSplitCues(items);
            return {
                ok: true,
                splits: mocked.splits || [],
                via: 'mock',
                summary: `智能断句（模拟） ${mocked.splits?.length || 0} 条`,
            };
        }

        let llm;
        try {
            llm = await resolveAdvancedLlmConfig(doc, { requireReconstructCapable: true });
            if (!llm.ok) return llm;
            logAdvancedLlmToEngine(llm, { feature: '智能断句' });
            const { chatCompletions } = require('./advanced-llm-client');
            const messages = smartCore.buildLlmSplitChatMessages(items);
            const res = await chatCompletions({
                apiKey: llm.apiKey,
                baseUrl: llm.baseUrl,
                model: llm.model,
                messages,
                temperature: 0.2,
                timeoutMs: 120000,
                signal: input.signal,
                disableThinking: true,
            });
            if (!res?.ok) return res;
            const content = res.content || res.text || res.message || '';
            const parsed = smartCore.parseLlmSplitResponse(
                content,
                items.map((c) => c.index),
            );
            if (!parsed.ok) return parsed;
            return {
                ok: true,
                splits: parsed.splits,
                via: llm.source || 'llm',
                llmSource: llm.source,
                summary: `智能断句 ${parsed.splits.length} 条`,
            };
        } finally {
            try {
                host.releaseManagedLlmAfterJob(llm, input);
            } catch (_) { /* ignore */ }
        }
    }

    async function runQcLlmSplitOnCues(cues, issues, input, event) {
        const smartCore = require('../src/js/subtitle-qc-smart-core');
        if (input.llmSplit === false) {
            return { cues, stats: { skipped: true, reason: 'disabled' } };
        }
        const targets = smartCore.selectQcLlmSplitTargets(issues, {
            maxTargets: Number(input.maxLlmSplitTargets) || smartCore.DEFAULT_MAX_LLM_SPLIT,
            types: input.llmSplitTypes,
        });
        const filteredTargets = typeof smartCore.filterSoftwareCreditTargets === 'function'
            ? smartCore.filterSoftwareCreditTargets(cues, targets)
            : targets;
        if (!filteredTargets.length) {
            return {
                cues,
                stats: {
                    skipped: true,
                    reason: 'no_targets',
                    plan: smartCore.summarizeQcLlmSplitPlan(filteredTargets),
                },
            };
        }

        const items = smartCore.buildQcLlmSplitPayload(cues, filteredTargets, {
            smartMaxChars: Number(input.smartMaxChars) || 20,
        });
        const computeLock = require('./compute-task-lock');
        const llmRes = await computeLock.runWithComputeLockUnlessNested({
            kind: 'advanced_qc_llm_split',
            owner: 'Pro',
            source: 'runQcLlmSplitOnCues',
        }, input, () => runQcLlmSplitRequest({
            ...input,
            cues: items,
        }, event));

        if (!llmRes?.ok) {
            return {
                cues,
                stats: {
                    skipped: false,
                    failed: true,
                    error: llmRes?.error || '智能断句失败',
                    plan: smartCore.summarizeQcLlmSplitPlan(filteredTargets),
                },
            };
        }

        const applied = smartCore.applyQcLlmSplitResults(cues, llmRes.splits || [], {
            targetCps: Number(input.targetCps) || 3,
            minSec: Number(input.minSec) || 0.5,
            useCpsTime: input.useCpsTime !== false,
        });

        if (applied.splitCount > 0) {
            const qc = require('../src/js/subtitle-qc-core');
            qc.applySmartAdjustToCues(applied.cues, {
                fixOverlap: true,
                fixCps: false,
                enforceMinDur: false,
                enforceMaxDur: false,
                gapMs: Number(input.gapMs) >= 0 ? Number(input.gapMs) : 1,
            });
        }

        return {
            cues: applied.cues,
            stats: {
                skipped: false,
                splitCount: applied.splitCount,
                added: applied.added,
                targetCount: filteredTargets.length,
                via: llmRes.via,
                plan: smartCore.summarizeQcLlmSplitPlan(filteredTargets, {
                    maxTargets: Number(input.maxLlmSplitTargets) || smartCore.DEFAULT_MAX_LLM_SPLIT,
                }),
            },
        };
    }

    async function runQcSilenceSplitPhase(cues, input, event) {
        const qcSilenceSplit = require('./qc-silence-split');
        const maxChars = qcSilenceSplit.clampQcSilenceSplitChars(
            input.qcSilenceSplitChars ?? input.maxChars,
        );
        if (!(maxChars > 0)) {
            return { cues, stats: { skipped: true, reason: 'disabled', splitCount: 0, added: 0 } };
        }
        const mediaPath = asString(input.mediaPath || input.videoPath, 4096).trim();
        if (!mediaPath) {
            return { cues, stats: { skipped: true, reason: 'no_media', splitCount: 0, added: 0 } };
        }

        sendQcSmartProgress(event, input, {
            phase: 'silence-split',
            message: `超长句静音分割（>${maxChars} 字）…`,
            pct: 8,
        });

        const applied = await qcSilenceSplit.runQcSilenceSplitOnCues(cues, {
            mediaPath,
            maxChars,
            ffmpegPath: (() => {
                const fromInput = asString(input.ffmpegPath, 4096).trim();
                if (fromInput) return fromInput;
                try {
                    const { loadSettings } = require('./settings-data');
                    return String(loadSettings()?.options?.ffmpegPath || '').trim();
                } catch {
                    return '';
                }
            })(),
            silenceDb: input.silenceDb,
            silenceDur: input.silenceDur,
            gapMs: input.gapMs,
            fixOverlap: input.fixOverlap !== false,
            onProgress: (info) => {
                sendQcSmartProgress(event, input, {
                    phase: 'silence-split',
                    message: `超长句静音分割 ${info.current}/${info.total}…`,
                    pct: 8 + Math.min(12, Math.round((info.current / Math.max(1, info.total)) * 12)),
                });
            },
            signal: input.signal,
            isCancelled: input.isCancelled,
        });

        return {
            cues: applied.cues,
            stats: {
                ...applied.stats,
                summary: qcSilenceSplit.summarizeQcSilenceSplit(applied.stats),
            },
        };
    }

    async function loadLowConfidenceIndexesForQc(cues, input = {}) {
        const list = Array.isArray(cues) ? cues : [];
        if (!list.length) return [];
        const explicit = Array.isArray(input.lowConfidenceIndexes)
            ? input.lowConfidenceIndexes
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n) && n >= 0 && n < list.length)
            : null;
        if (explicit) return [...new Set(explicit)].sort((a, b) => a - b);
        if (input.retranscribeLowConfidence === false) return [];

        const metaPath = asString(
            input.sourceSubtitlePath
                || input.pairPath
                || input.subtitlePath
                || input.path
                || input.subPath
                || '',
            4096,
        ).trim();
        if (!metaPath) return [];
        try {
            const { readSubtitleMeta } = require('./subtitle-meta');
            const metaCore = require('../src/js/subtitle-meta-core');
            const read = readSubtitleMeta(metaPath);
            if (!read?.ok || !read.meta) return [];
            const anns = typeof metaCore.mergeConfidenceAnnotations === 'function'
                ? metaCore.mergeConfidenceAnnotations(list, read.meta, {
                    lowThreshold: input.lowConfidenceThreshold,
                })
                : [];
            return anns
                .map((a, i) => (a?.low ? i : -1))
                .filter((i) => i >= 0);
        } catch (_) {
            return [];
        }
    }

    async function runQcRetranscribeOnCues(cues, issues, input, event) {
        const smartCore = require('../src/js/subtitle-qc-smart-core');
        const meta = require('../src/js/subtitle-meta-core');
        const qc = require('../src/js/subtitle-qc-core');
        const mediaPath = asString(input.mediaPath || input.videoPath, 4096).trim();
        if (!mediaPath || input.retranscribeConnected === false) {
            return { cues, stats: { skipped: true, reason: mediaPath ? 'disabled' : 'no_media' } };
        }

        const writeTarget = typeof smartCore.resolveQcRetranscribeWriteTarget === 'function'
            ? smartCore.resolveQcRetranscribeWriteTarget(input)
            : {
                writePath: asString(input.path || input.subtitlePath || '', 4096).trim(),
                writeKind: 'self',
                keepTargetText: false,
                confidencePath: asString(input.subtitlePath || input.path || '', 4096).trim(),
            };
        const writeToSource = writeTarget.writeKind === 'source' && !!writeTarget.writePath;

        const lowConfidenceIndexes = await loadLowConfidenceIndexesForQc(cues, input);
        const merged = typeof smartCore.planMergedQcRetranscribeRanges === 'function'
            ? smartCore.planMergedQcRetranscribeRanges(cues, issues, lowConfidenceIndexes, {
                maxTargets: Number(input.maxRetranscribeTargets) || 24,
                maxRanges: Number(input.maxRetranscribeRanges) || smartCore.DEFAULT_MAX_RETRANSCRIBE_RANGES,
                maxDurationSec: Number(input.maxRetranscribeSec) || smartCore.DEFAULT_MAX_RANGE_SEC,
                mergeAdjacentGapMs: Number(input.mergeAdjacentGapMs) || smartCore.DEFAULT_MERGE_GAP_MS,
            })
            : null;
        const ranges = merged?.ranges || (() => {
            const targets = smartCore.selectQcRetranscribeTargets(issues, {
                maxTargets: Number(input.maxRetranscribeTargets) || 24,
            });
            return smartCore.buildQcRetranscribeRanges(cues, targets.map((t) => t.index), {
                maxRanges: Number(input.maxRetranscribeRanges) || smartCore.DEFAULT_MAX_RETRANSCRIBE_RANGES,
                maxDurationSec: Number(input.maxRetranscribeSec) || smartCore.DEFAULT_MAX_RANGE_SEC,
                mergeAdjacentGapMs: Number(input.mergeAdjacentGapMs) || smartCore.DEFAULT_MERGE_GAP_MS,
            });
        })();
        const planText = merged?.plan
            || smartCore.summarizeQcRetranscribePlan(ranges);
        if (!ranges.length) {
            return {
                cues,
                stats: {
                    skipped: true,
                    reason: 'no_ranges',
                    plan: planText,
                    writeKind: writeTarget.writeKind,
                    lowConfidenceCueCount: lowConfidenceIndexes.length,
                },
            };
        }

        // 译文轨保持中文；有对照原文时 ASR 只写入原文轨。
        let working = cues;
        let pairWorking = null;
        let pairDocMeta = null;
        if (writeToSource) {
            try {
                const { readSubtitleDocument } = require('./extensions-bridge');
                if (Array.isArray(input.pairCues) && input.pairCues.length) {
                    pairWorking = input.pairCues.map((c) => ({ ...c }));
                } else {
                    const pairDoc = readSubtitleDocument(writeTarget.writePath);
                    if (pairDoc?.ok && Array.isArray(pairDoc.cues)) {
                        pairWorking = pairDoc.cues.map((c) => ({ ...c }));
                        pairDocMeta = { format: pairDoc.format, header: pairDoc.header };
                    }
                }
            } catch { /* optional */ }
            if (!pairWorking?.length) {
                return {
                    cues,
                    stats: {
                        skipped: true,
                        reason: 'no_source_cues',
                        plan: planText,
                        writeKind: 'source',
                    },
                };
            }
        }

        let okCount = 0;
        let failCount = 0;
        let replaced = 0;
        const { transcribeRangeWithEngine, appendEngineLogLine } = require('./engine-bridge');
        const {
            resolveQcRetranscribeEngineContext,
            releaseGpuAfterQcRetranscribeBurst,
        } = require('./engine-qc-retranscribe-options');
        const { options: engineOpts, primaryAsr, burstMode } = resolveQcRetranscribeEngineContext(input);
        const logRetranscribe = (line) => {
            if (typeof input.onLog === 'function') {
                input.onLog(line);
                return;
            }
            try {
                appendEngineLogLine(line, event?.sender || null);
            } catch {
                try { console.warn(line); } catch { /* ignore */ }
            }
        };
        logRetranscribe(
            `[qc-smart] 局部重转写计划 ${ranges.length} 窗 · ASR=${primaryAsr}`
            + (writeToSource ? ' · 写入原文轨' : ''),
        );

        try {
            for (let i = 0; i < ranges.length; i += 1) {
                const range = ranges[i];
                sendQcSmartProgress(event, input, {
                    phase: 'retranscribe',
                    message: `局部重转写 ${i + 1}/${ranges.length}…`,
                    pct: Math.round(8 + (i / Math.max(1, ranges.length)) * 22),
                    range: i + 1,
                    totalRanges: ranges.length,
                });
                try {
                    const res = await transcribeRangeWithEngine({
                        mediaPath,
                        startMs: range.startMs,
                        endMs: range.endMs,
                        padMs: Number(input.padMs) >= 0 ? Number(input.padMs) : smartCore.DEFAULT_PAD_MS,
                        // 置信度 sidecar 跟写入轨走（原文对照时写 .transcribe，勿写译文）
                        subtitlePath: writeTarget.confidencePath || writeTarget.writePath,
                        asrModel: primaryAsr,
                        options: engineOpts,
                        skipLlmReclaim: burstMode && i > 0,
                        allowDuringBatch: !!(input.allowDuringBatch || input._batchMode),
                        _batchMode: !!input._batchMode,
                        _skipComputeLock: !!(input._skipComputeLock || input._batchMode || input.allowDuringBatch),
                    }, {
                        options: engineOpts,
                        skipLlmReclaim: burstMode && i > 0,
                        allowDuringBatch: !!(input.allowDuringBatch || input._batchMode),
                        _batchMode: !!input._batchMode,
                        _skipComputeLock: !!(input._skipComputeLock || input._batchMode || input.allowDuringBatch),
                        invokeSender: event?.sender || null,
                        onProgress: (info) => sendQcSmartProgress(event, input, {
                            phase: 'retranscribe',
                            message: info?.detail || info?.message || `局部重转写 ${i + 1}/${ranges.length}`,
                            pct: Math.round(8 + ((i + 0.5) / Math.max(1, ranges.length)) * 22),
                            stage: info?.stage,
                        }),
                    });
                    if (!res?.ok || !Array.isArray(res.cues) || !res.cues.length) {
                        failCount += 1;
                        const code = String(res?.code || '').trim();
                        const triedAsr = String(res?.asrModel || primaryAsr || engineOpts.engineAsrModel || '').trim();
                        const why = String(res?.error || '重转写结果为空').trim();
                        logRetranscribe(
                            `[qc-smart] 局部重转写 ${i + 1}/${ranges.length} 失败`
                            + (triedAsr ? ` · ASR=${triedAsr}` : '')
                            + (code ? ` · ${code}` : '')
                            + ` · ${why}`,
                        );
                        continue;
                    }
                    if (writeToSource) {
                        const replacedDoc = meta.replaceCuesInTimeRange(
                            pairWorking,
                            range.startMs,
                            range.endMs,
                            res.cues,
                        );
                        pairWorking = replacedDoc.cues;
                        replaced += Number(replacedDoc.replaced) || 0;
                    } else {
                        const replacedDoc = meta.replaceCuesInTimeRange(
                            working,
                            range.startMs,
                            range.endMs,
                            res.cues,
                        );
                        working = replacedDoc.cues;
                        replaced += Number(replacedDoc.replaced) || 0;
                    }
                    okCount += 1;
                    logRetranscribe(
                        `[qc-smart] 局部重转写 ${i + 1}/${ranges.length} 成功 · ${res.cues.length} 条`
                        + (writeToSource ? '（原文）' : ''),
                    );
                } catch (err) {
                    failCount += 1;
                    logRetranscribe(
                        `[qc-smart] 局部重转写 ${i + 1}/${ranges.length} 异常 · ASR=${primaryAsr} · ${err?.message || err}`,
                    );
                }
            }
        } finally {
            if (burstMode && ranges.length > 0) {
                try {
                    const released = await releaseGpuAfterQcRetranscribeBurst(engineOpts);
                    if (released?.ok) {
                        logRetranscribe('[qc-smart] 局部重转写批次结束 · 已释放 GPU');
                    }
                } catch { /* ignore */ }
            }
        }

        if (writeToSource && okCount > 0 && pairWorking) {
            try {
                const { writeSubtitleDocument, readSubtitleDocument } = require('./extensions-bridge');
                if (!pairDocMeta) {
                    const pairDoc = readSubtitleDocument(writeTarget.writePath);
                    if (pairDoc?.ok) {
                        pairDocMeta = { format: pairDoc.format, header: pairDoc.header };
                    }
                }
                const written = writeSubtitleDocument(writeTarget.writePath, {
                    cues: pairWorking,
                    format: pairDocMeta?.format || 'srt',
                    header: pairDocMeta?.header,
                    backupMode: input.backupMode || 'off',
                });
                if (written?.ok) {
                    input.pairCues = pairWorking;
                    try {
                        const { clearFreezeOnSource } = require('./engine-post-qc-loop-handoff');
                        clearFreezeOnSource(writeTarget.writePath, (line) => logRetranscribe(`[qc-smart] ${line}`));
                    } catch { /* optional */ }
                    logRetranscribe(
                        `[qc-smart] 局部重转写已写回原文 ${okCount} 窗 → ${require('path').basename(writeTarget.writePath)}`,
                    );
                } else {
                    logRetranscribe(
                        `[qc-smart] 原文写回失败：${written?.error || 'unknown'}`,
                    );
                }
            } catch (err) {
                logRetranscribe(`[qc-smart] 原文写回异常：${err?.message || err}`);
            }
        }

        if (okCount > 0 && !writeToSource) {
            const adj = qc.applySmartAdjustToCues(working, {
                fixOverlap: true,
                fixCps: false,
                enforceMinDur: false,
                enforceMaxDur: false,
                gapMs: Number(input.gapMs) >= 0 ? Number(input.gapMs) : 1,
            });
            void adj;
        }

        return {
            cues: working,
            stats: {
                skipped: false,
                okCount,
                failCount,
                replaced,
                rangeCount: ranges.length,
                plan: planText,
                writeKind: writeTarget.writeKind,
                writePath: writeTarget.writePath,
                connectedCueCount: merged?.connectedIndexes?.length || 0,
                lowConfidenceCueCount: merged?.lowConfidenceIndexes?.length || lowConfidenceIndexes.length,
                indexes: merged?.indexes || ranges.flatMap((r) => r.indexes || []),
            },
        };
    }

    function resolveQcSmartProfile(input = {}) {
        const contentProfile = (() => {
            try { return require('../src/js/content-profile-core'); } catch { return null; }
        })();
        const explicit = asString(input.profile, 64).trim();
        if (explicit) return { profile: explicit, contentProfile };
        const mediaPath = asString(input.mediaPath || input.videoPath, 4096).trim();
        if (mediaPath && contentProfile?.classifyContentProfile) {
            try {
                const c = contentProfile.classifyContentProfile({ path: mediaPath });
                if (c?.profile) return { profile: c.profile, contentProfile };
            } catch (_) { /* ignore */ }
        }
        return { profile: 'unknown', contentProfile };
    }

    /**
     * QC 联动：对问题条做双语语义审阅，可选采纳 suggestedTarget。
     */
    async function runQcSemanticReviewOnCues(cues, issues, input, event, extra = {}) {
        const smartCore = require('../src/js/subtitle-qc-smart-core');
        const pairCues = Array.isArray(input.pairCues) ? input.pairCues : [];
        if (!pairCues.length) return { ok: true, skipped: true, reason: 'no_pair' };

        let dualApi = null;
        try {
            dualApi = require('../src/js/dual-subtitle-core');
        } catch (_) { /* optional */ }

        const blankPrefer = smartCore.collectBlankEllipsisIndexes(cues, pairCues, {
            findBestOverlapCue: dualApi?.findBestOverlapCue || null,
            maxIndexes: input.maxSemanticPairs || 40,
        });
        const mergedIssues = smartCore.mergeBlankEllipsisIssues(cues, issues, {
            blankIndexes: blankPrefer,
            pairCues,
            findBestOverlapCue: dualApi?.findBestOverlapCue || null,
        });
        const indexesRaw = smartCore.selectQcSemanticIndexes(mergedIssues, {
            maxPairs: input.maxSemanticPairs || 40,
            preferIndexes: extra.preferIndexes,
            blankPreferIndexes: blankPrefer,
        });
        const indexes = typeof smartCore.filterSoftwareCreditTargets === 'function'
            ? smartCore.filterSoftwareCreditTargets(
                cues,
                indexesRaw.map((index) => ({ index })),
            ).map((t) => t.index)
            : indexesRaw;
        if (!indexes.length) return { ok: true, skipped: true, reason: 'no_targets' };

        const pairs = smartCore.buildQcSemanticPairs(cues, pairCues, indexes, dualApi);
        if (!pairs.length) return { ok: true, skipped: true, reason: 'empty_pairs' };

        const blankInBatch = indexes.filter((i) => blankPrefer.includes(i)).length;
        sendQcSmartProgress(event, input, {
            phase: 'semantic',
            message: blankInBatch
                ? `语义审阅 ${pairs.length} 条（含空/省略补译 ${blankInBatch}）…`
                : `语义审阅 ${pairs.length} 条…`,
            pct: 88,
        });

        const review = await host.runBilingualSemanticReviewBody({
            pairs,
            note: [
                input.semanticNote || smartCore.QC_SEMANTIC_NOTE || '',
                blankInBatch
                    ? '其中含空/省略号译文：请根据原文给出可直接替换的 suggestedTarget，勿留「…」。'
                    : '',
            ].filter(Boolean).join(''),
            suggestFixes: input.suggestSemanticFixes !== false,
            dryRun: input.dryRun,
            signal: input.signal,
            _keepManagedServer: input._keepManagedServer,
            maxPairs: input.maxSemanticPairs || 40,
        }, event);

        if (!review?.ok) {
            return {
                ok: false,
                skipped: false,
                error: review?.error || '语义审阅失败',
                code: review?.code,
                cues,
                changed: 0,
            };
        }

        const issueList = Array.isArray(review.issues) ? review.issues : [];
        const autoApply = input.autoApplySemantic !== false;
        let next = cues;
        let changed = 0;
        let changedIndexes = [];
        if (autoApply && issueList.some((it) => it.suggestedTarget)) {
            const applied = smartCore.applyQcSemanticSuggestions(cues, issueList);
            next = applied.cues;
            changed = applied.changed;
            changedIndexes = applied.changedIndexes;
        }

        return {
            ok: true,
            skipped: false,
            cues: next,
            changed,
            changedIndexes,
            issueCount: issueList.length,
            suggestions: issueList.filter((it) => it.suggestedTarget).length,
            blankPreferCount: blankPrefer.length,
            blankFilled: changedIndexes.filter((i) => blankPrefer.includes(i)).length,
            issues: issueList,
            summary: review.summary,
            via: review.via,
        };
    }

    /** 批次内复用同一原文轨，避免每个译文文件都重读盘 */
    const qcPairCueCache = new Map();
    const QC_PAIR_CACHE_MAX = 12;

    function loadQcPairCuesFromInput(input) {
        if (Array.isArray(input.pairCues) && input.pairCues.length) {
            return {
                pairCues: input.pairCues.map((c) => ({
                    startMs: c?.startMs,
                    endMs: c?.endMs,
                    text: c?.text ?? '',
                })),
                pairPath: asString(input.pairPath || input.sourcePath, 4096).trim() || null,
            };
        }
        const pairPath = asString(input.pairPath || input.sourcePath, 4096).trim();
        if (!pairPath) return { pairCues: [], pairPath: '' };
        const cached = qcPairCueCache.get(pairPath);
        if (cached) return { pairPath, pairCues: cached };
        try {
            const { readSubtitleDocument } = require('./extensions-bridge');
            const doc = readSubtitleDocument(pairPath);
            if (!doc?.ok || !Array.isArray(doc.cues)) return { pairCues: [], pairPath };
            const pairCues = doc.cues.map((c) => ({
                startMs: c?.startMs,
                endMs: c?.endMs,
                text: c?.text ?? '',
            }));
            if (qcPairCueCache.size >= QC_PAIR_CACHE_MAX) {
                const oldest = qcPairCueCache.keys().next().value;
                if (oldest != null) qcPairCueCache.delete(oldest);
            }
            qcPairCueCache.set(pairPath, pairCues);
            return { pairPath, pairCues };
        } catch (_) {
            return { pairCues: [], pairPath };
        }
    }

    async function prepareQcSmartFixState(input, event) {
        const filePath = asString(input.path || input.filePath, 4096).trim();
        if (!filePath) return { ok: false, error: '缺少字幕路径' };

        const smartCore = require('../src/js/subtitle-qc-smart-core');
        const qc = require('../src/js/subtitle-qc-core');
        const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
        const { profile, contentProfile } = resolveQcSmartProfile(input);
        const pairLoaded = loadQcPairCuesFromInput(input);
        if (pairLoaded.pairCues.length) {
            input.pairCues = pairLoaded.pairCues;
            if (pairLoaded.pairPath) input.pairPath = pairLoaded.pairPath;
            // 有对照轨时默认开启语义审阅（画像 unknown 的 false 会被这里抬起）
            if (input.semanticReview == null) input.semanticReview = true;
        }
        const merged = contentProfile?.mergeQcOptsWithProfile
            ? contentProfile.mergeQcOptsWithProfile(input, profile)
            : { ...input };
        // 回写画像填充后的字段，供后续润色 / 语义阶段使用
        Object.assign(input, {
            profile,
            maxCps: merged.maxCps,
            removeNoise: merged.removeNoise,
            removeDuplicates: merged.removeDuplicates,
            compressRepetition: merged.compressRepetition,
            llmSplit: merged.llmSplit,
            retranscribeConnected: merged.retranscribeConnected,
            intensity: merged.intensity,
            maxSmartCues: merged.maxSmartCues,
            maxLlmSplitTargets: merged.maxLlmSplitTargets,
            semanticReview: pairLoaded.pairCues.length
                ? (merged.semanticReview !== false)
                : !!merged.semanticReview,
        });

        let doc;
        try {
            doc = readSubtitleDocument(filePath);
        } catch (err) {
            return { ok: false, error: err.message || '读取字幕失败', path: filePath };
        }
        if (!doc?.ok) return { ok: false, error: doc?.error || '读取字幕失败', path: filePath };

        let cues = Array.isArray(doc.cues) ? doc.cues.map((c) => ({
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text ?? '',
        })) : [];
        if (!cues.length) {
            return {
                ok: true,
                done: true,
                result: { ok: true, skipped: true, path: filePath, summary: '无字幕条目' },
            };
        }

        const hasPair = Array.isArray(input.pairCues) && input.pairCues.length > 0;

        // Dead / QC-packed ZH must be laid onto JA times BEFORE fixOverlap, otherwise
        // minDur=500 + gapMs=1 permanently invents a fake early timeline (MFYD-185).
        if (hasPair) {
            try {
                const { rematerializeCuesIfNeeded } = require('./mt-pair-rematerialize');
                const preAligned = rematerializeCuesIfNeeded(cues, input.pairCues, { force: false });
                if (preAligned.rematerialized) {
                    cues = preAligned.cues;
                    if (preAligned.mode === 'positional-dead-timeline') {
                        sendQcSmartProgress(event, input, {
                            phase: 'rule',
                            message: '译文时间轴异常，已按原文重铺…',
                            pct: 2,
                        });
                    }
                }
            } catch { /* optional */ }
        }

        const ruleOpts = {
            fixOverlap: input.fixOverlap !== false,
            // Paired ZH must not CPS-split alone (count drift → 错位). Prefer extend.
            fixCpsBySplit: hasPair
                ? input.fixCpsBySplit === true && input.allowPairedCpsSplit === true
                : input.fixCpsBySplit !== false,
            fixCpsByExtend: input.fixCpsByExtend !== false,
            enforceMinDur: input.enforceMinDur !== false,
            enforceMaxDur: input.enforceMaxDur !== false,
            fixInvalid: input.fixInvalid !== false,
            compressRepetition: input.compressRepetition !== false,
            removeNoise: input.removeNoise !== false,
            removeDuplicates: input.removeDuplicates !== false,
            removeHallucinations: input.removeHallucinations !== false,
            // Default: delete noise. Opt-in blank mode only when explicitly requested;
            // batch postprocess pairs JA↔ZH deletions to keep cue counts aligned.
            blankInsteadOfRemove: input.blankInsteadOfRemove === true || hasPair,
            maxCps: Number(input.maxCps) || 18,
            maxSec: Number(input.maxSec) || 10,
            gapMs: Number(input.gapMs) >= 0 ? Number(input.gapMs) : 1,
            smartMaxChars: Number(input.smartMaxChars) || 20,
            smartLineChars: Number(input.smartLineChars) || 18,
            targetCps: Number(input.targetCps) || 3,
        };

        const structuralScanOpts = { ...ruleOpts, checkFluency: false };

        let ruleResult = null;
        /** @type {{ issues: any[], summary: any }|null} */
        let workingScan = null;
        let scanIsFull = false;

        if (input.skipRuleFix !== true) {
            sendQcSmartProgress(event, input, {
                phase: 'rule',
                message: '规则修复中…',
                pct: 3,
            });
            ruleResult = qc.applyQcFixes(cues, ruleOpts);
            cues = ruleResult.cues;
            if (ruleResult.scan) {
                workingScan = ruleResult.scan;
                scanIsFull = true;
            }
        }
        if (!workingScan) {
            workingScan = qc.scanCueIssues(cues, ruleOpts);
            scanIsFull = true;
        }

        let silenceSplit = { stats: { skipped: true } };
        if (input.silenceSplit !== false && !hasPair) {
            // Resolve threshold from input or saved options (default 15)
            if (input.qcSilenceSplitChars == null && input.maxChars == null) {
                try {
                    const { loadSettings } = require('./settings-data');
                    const saved = loadSettings()?.options || {};
                    if (saved.qcSilenceSplitChars != null) {
                        input.qcSilenceSplitChars = saved.qcSilenceSplitChars;
                    }
                } catch (_) { /* keep default via clamp */ }
            }
            silenceSplit = await runQcSilenceSplitPhase(cues, input, event);
            cues = silenceSplit.cues;
            if (silenceSplit?.stats && !silenceSplit.stats.skipped && silenceSplit.stats.splitCount > 0) {
                workingScan = qc.scanCueIssues(cues, structuralScanOpts);
                scanIsFull = false;
            }
        }

        let llmSplit = { stats: { skipped: true } };
        let retranscribe = { stats: { skipped: true } };
        // LLM split changes ZH cue count alone — skip when JA pair is present (DLDSS-533).
        if (input.llmSplit !== false && !hasPair) {
            llmSplit = await runQcLlmSplitOnCues(cues, workingScan.issues, input, event);
            cues = llmSplit.cues;
            if (llmSplit?.stats && !llmSplit.stats.skipped && llmSplit.stats.splitCount > 0) {
                // 断句改索引：重转写只需结构类问题，跳过通顺度
                workingScan = qc.scanCueIssues(cues, structuralScanOpts);
                scanIsFull = false;
            }
        }
        if (input.retranscribeConnected !== false && asString(input.mediaPath || input.videoPath, 4096).trim()) {
            retranscribe = await runQcRetranscribeOnCues(cues, workingScan.issues, input, event);
            cues = retranscribe.cues;
            if (retranscribe?.stats && !retranscribe.stats.skipped && retranscribe.stats.okCount > 0) {
                workingScan = qc.scanCueIssues(cues, ruleOpts);
                scanIsFull = true;
            }
        }
        // 润色目标需要 fluency / 怪句；若上一趟是结构扫则补一次完整扫
        if (!scanIsFull) {
            workingScan = qc.scanCueIssues(cues, ruleOpts);
            scanIsFull = true;
        }

        const alignCuesToPair = (list) => {
            if (!hasPair) return { cues: list, rematerialized: false };
            try {
                const { rematerializeCuesIfNeeded } = require('./mt-pair-rematerialize');
                return rematerializeCuesIfNeeded(list, input.pairCues, { force: false });
            } catch {
                return { cues: list, rematerialized: false };
            }
        };

        const beforeSmartScan = {
            ...workingScan,
            issues: smartCore.mergeWeirdTextIssues(cues, workingScan.issues),
        };
        const rawTargets = smartCore.selectQcSmartTargets(beforeSmartScan.issues, {
            maxSmartCues: input.maxSmartCues,
            types: input.smartTypes,
        });
        const targets = typeof smartCore.filterSoftwareCreditTargets === 'function'
            ? smartCore.filterSoftwareCreditTargets(cues, rawTargets)
            : rawTargets;

        const changedByRule = !!(ruleResult?.stats?.affected);
        const changedBySilenceSplit = !!(silenceSplit?.stats && !silenceSplit.stats.skipped && silenceSplit.stats.splitCount > 0);
        const changedByLlmSplit = !!(llmSplit?.stats && !llmSplit.stats.skipped && llmSplit.stats.splitCount > 0);
        const changedByRetranscribe = !!(retranscribe?.stats && !retranscribe.stats.skipped && retranscribe.stats.okCount > 0);

        const wantSemantic = !!(input.semanticReview && Array.isArray(input.pairCues) && input.pairCues.length);

        if (!targets.length && !wantSemantic) {
            const remainingText = typeof qc.summarizeRemaining === 'function'
                ? qc.summarizeRemaining(beforeSmartScan.summary)
                : '';
            const parts = [];
            if (ruleResult?.summary) parts.push(ruleResult.summary);
            {
                const ss = silenceSplit?.stats;
                if (ss?.summary && (!ss.skipped || ss.reason === 'no_media' || (ss.skipNoSilence > 0))) {
                    parts.push(ss.summary);
                } else if (ss?.splitCount) {
                    parts.push(`超长句静音分割 ${ss.splitCount} 条(+${ss.added || 0})`);
                }
            }
            if (llmSplit?.stats?.splitCount) {
                parts.push(`智能断句 ${llmSplit.stats.splitCount} 条(+${llmSplit.stats.added || 0})`);
            }
            if (retranscribe?.stats?.plan && !retranscribe.stats.skipped) {
                const failN = Number(retranscribe.stats.failCount) || 0;
                parts.push(
                    failN > 0
                        ? `局部重转写 ${retranscribe.stats.okCount}/${retranscribe.stats.rangeCount} 窗（失败 ${failN}）`
                        : `局部重转写 ${retranscribe.stats.okCount}/${retranscribe.stats.rangeCount} 窗`,
                );
            } else if (retranscribe?.stats?.skipped && retranscribe.stats.reason === 'disabled') {
                parts.push('已跳过局部重转写');
            }
            parts.push('无需智能润色');
            if (remainingText) parts.push(remainingText);

            if (changedByRule || changedBySilenceSplit || changedByLlmSplit || changedByRetranscribe || cues.length !== doc.cues.length) {
                const aligned = alignCuesToPair(cues);
                cues = aligned.cues;
                const healed = healSoftwareCreditCues(cues);
                cues = healed.cues;
                const written = writeSubtitleDocument(filePath, {
                    cues,
                    format: doc.format,
                    header: doc.header,
                    backupMode: input.backupMode || 'off',
                });
                if (!written.ok) return written;
                return {
                    ok: true,
                    done: true,
                    result: {
                        ok: true,
                        path: filePath,
                        written: true,
                        smartSkipped: true,
                        rematerialized: !!aligned.rematerialized,
                        profile,
                        rule: ruleResult,
                        silenceSplit: silenceSplit.stats,
                        llmSplit: llmSplit.stats,
                        retranscribe: retranscribe.stats,
                        remaining: beforeSmartScan.summary,
                        summary: parts.join('；'),
                    },
                };
            }
            return {
                ok: true,
                done: true,
                result: {
                    ok: true,
                    path: filePath,
                    written: false,
                    smartSkipped: true,
                    profile,
                    rule: ruleResult,
                    silenceSplit: silenceSplit.stats,
                    llmSplit: llmSplit.stats,
                    retranscribe: retranscribe.stats,
                    remaining: beforeSmartScan.summary,
                    summary: parts.join('；'),
                },
            };
        }

        const alignedForContinue = alignCuesToPair(cues);
        cues = alignedForContinue.cues;

        return {
            ok: true,
            done: false,
            filePath,
            doc,
            cues,
            ruleOpts,
            ruleResult,
            silenceSplit: silenceSplit.stats,
            llmSplit: llmSplit.stats,
            retranscribe: retranscribe.stats,
            beforeSmartScan,
            targets,
            profile,
            // Intl 成片: skip ZH-oriented QC LLM polish (rules / silence / split still run).
            // 推理 / 混合句级: 主译已是 GalTransl（混合另有 Instruct 剧情润色）；
            // QC「智能润色」再用 Instruct 易改写忠实 MT / 撑爆上下文 — 跳过润色，保留规则修。
            skipPolish: !targets.length || (() => {
                try {
                    const { resolveMtTargetFields } = require('./sanitize-target-opts');
                    if (resolveMtTargetFields(input).isZhTarget === false) return true;
                } catch { /* ignore */ }
                try {
                    const blankPolicy = require('../src/js/blank-mt-retry-policy-core');
                    if (blankPolicy.isInferenceBlankDirectFinalize?.(input)) return true;
                } catch { /* ignore */ }
                return false;
            })(),
            changedByRule,
            changedBySilenceSplit,
            changedByLlmSplit,
            changedByRetranscribe,
            rematerialized: !!alignedForContinue.rematerialized,
        };
    }

    async function finishQcSmartFixWithLlm(prepared, input, event) {
        const smartCore = require('../src/js/subtitle-qc-smart-core');
        const qc = require('../src/js/subtitle-qc-core');
        const { writeSubtitleDocument } = require('./extensions-bridge');

        let cues = prepared.cues;
        const { filePath, doc, ruleOpts, ruleResult, targets, beforeSmartScan } = prepared;
        const targetIndexes = (Array.isArray(targets) ? targets : []).map((t) => t.index);
        let applied = { changed: 0, changedIndexes: [] };
        let recon = { ok: true, via: 'skipped', llmSource: '' };

        if (!prepared.skipPolish && targetIndexes.length) {
            const payloadIndexes = smartCore.expandIndexesWithNeighbors(
                targetIndexes,
                cues.length,
                input.neighborRadius,
            );
            const reconstructOpts = smartCore.buildQcSmartReconstructOptions(input);
            const cuePayload = smartCore.buildQcSmartCuePayload(cues, payloadIndexes);

            sendQcSmartProgress(event, input, {
                phase: 'start',
                message: `QC 智能润色 ${targets.length} 条…`,
                pct: 35,
                targetCount: targets.length,
            });

            recon = await host.runContextReconstructBody({
                cues: cuePayload,
                preserveTiming: reconstructOpts.preserveTiming,
                intensity: reconstructOpts.intensity,
                windowCues: reconstructOpts.windowCues,
                note: reconstructOpts.note,
                userNote: reconstructOpts.userNote,
                dryRun: input.dryRun,
                signal: input.signal,
                _keepManagedServer: input._keepManagedServer,
                _llmLogFeature: 'QC智能润色',
                onProgress: (info) => {
                    sendQcSmartProgress(event, input, {
                        ...info,
                        targetCount: targets.length,
                    });
                },
            }, event);

            if (!recon?.ok) {
                if (prepared.changedByRule || prepared.changedBySilenceSplit
                    || prepared.changedByLlmSplit || prepared.changedByRetranscribe) {
                    const healed = healSoftwareCreditCues(cues);
                    cues = healed.cues;
                    const written = writeSubtitleDocument(filePath, {
                        cues,
                        format: doc.format,
                        header: doc.header,
                        backupMode: input.backupMode || 'off',
                    });
                    return {
                        ok: false,
                        error: recon?.error || 'QC 智能处理失败',
                        code: recon?.code,
                        path: filePath,
                        ruleWritten: !!written?.ok,
                        rule: ruleResult,
                        silenceSplit: prepared.silenceSplit,
                        llmSplit: prepared.llmSplit,
                        retranscribe: prepared.retranscribe,
                    };
                }
                return {
                    ok: false,
                    error: recon?.error || 'QC 智能处理失败',
                    code: recon?.code,
                    path: filePath,
                };
            }

            const updates = Array.isArray(recon.cues) ? recon.cues : [];
            applied = smartCore.applyQcSmartUpdates(cues, updates, {
                allowIndexes: targetIndexes,
            });
            cues = applied.cues;

            // Light domain-safe pin after LLM polish so weird cleanup cannot undo sanitize remaps.
            if (applied.changed > 0 && Array.isArray(applied.changedIndexes) && applied.changedIndexes.length) {
                try {
                    const mtSanitize = require('../src/js/mt-sanitize-core');
                    const pairCues = Array.isArray(input.pairCues) ? input.pairCues : [];
                    const dual = (() => {
                        try { return require('../src/js/dual-subtitle-core'); } catch { return null; }
                    })();
                    let pinChanged = 0;
                    for (const idx of applied.changedIndexes) {
                        const cue = cues[idx];
                        if (!cue) continue;
                        let sourceText = '';
                        if (pairCues.length && dual?.findBestOverlapCue) {
                            try {
                                const hit = dual.findBestOverlapCue(
                                    pairCues,
                                    Number(cue.startMs) || 0,
                                    cue.endMs != null
                                        ? Number(cue.endMs)
                                        : (Number(cue.startMs) || 0) + 2000,
                                );
                                sourceText = String(hit?.cue?.text || '');
                            } catch { /* ignore */ }
                        }
                        const before = String(cue.text ?? '');
                        const { pickSanitizeTargetOpts } = require('./sanitize-target-opts');
                        const sanitized = mtSanitize.sanitizeMtCueText(before, sourceText, {
                            ...pickSanitizeTargetOpts(input),
                            faithfulTone: input.faithfulTone,
                            adultLexicon: input.adultLexicon,
                        });
                        const after = String(sanitized?.text ?? before);
                        if (after !== before) {
                            cues[idx] = { ...cue, text: after };
                            pinChanged += 1;
                        }
                    }
                    if (pinChanged > 0) {
                        applied = {
                            ...applied,
                            changed: applied.changedIndexes.length,
                            pinSanitized: pinChanged,
                        };
                    }
                } catch (_) { /* optional pin */ }
            }
        }

        let workingScan = prepared.beforeSmartScan;
        let semantic = { skipped: true };
        let intlQcTarget = false;
        let skipSemanticSentenceMt = false;
        try {
            const { resolveMtTargetFields } = require('./sanitize-target-opts');
            intlQcTarget = resolveMtTargetFields(input).isZhTarget === false;
        } catch { /* zh */ }
        try {
            const blankPolicy = require('../src/js/blank-mt-retry-policy-core');
            skipSemanticSentenceMt = !!blankPolicy.isInferenceBlankDirectFinalize?.(input);
        } catch { /* optional */ }
        if (
            !intlQcTarget
            && !skipSemanticSentenceMt
            && input.semanticReview
            && Array.isArray(input.pairCues)
            && input.pairCues.length
        ) {
            if (applied.changed > 0) {
                workingScan = qc.scanCueIssues(cues, ruleOpts);
            }
            semantic = await runQcSemanticReviewOnCues(
                cues,
                workingScan.issues,
                input,
                event,
                { preferIndexes: applied.changedIndexes || targetIndexes },
            );
            if (semantic?.ok && !semantic.skipped) {
                cues = semantic.cues;
            }
        } else if (skipSemanticSentenceMt) {
            semantic = { skipped: true, reason: 'sentence_mt_direct_ellipsis' };
        } else if (intlQcTarget && input.semanticReview) {
            semantic = { skipped: true, reason: 'intl_target' };
        }

        const semanticChanged = !!(semantic?.ok && semantic.changed > 0);
        // 润色后已刷新 workingScan；仅语义写回时再扫
        const afterScan = semanticChanged
            ? qc.scanCueIssues(cues, ruleOpts)
            : workingScan;
        const remainingText = typeof qc.summarizeRemaining === 'function'
            ? qc.summarizeRemaining(afterScan.summary)
            : '';
        const creditHeal = healSoftwareCreditCues(cues);
        cues = creditHeal.cues;
        const creditHealed = (Number(creditHeal.changed) || 0) > 0;
        const shouldWrite = applied.changed > 0
            || prepared.changedByRule
            || prepared.changedBySilenceSplit
            || prepared.changedByLlmSplit
            || prepared.changedByRetranscribe
            || semanticChanged
            || creditHealed
            || cues.length !== doc.cues.length;

        const parts = [];
        if (ruleResult?.summary) parts.push(ruleResult.summary);
        {
            const ss = prepared.silenceSplit;
            if (ss?.summary && (!ss.skipped || ss.reason === 'no_media' || (ss.skipNoSilence > 0))) {
                parts.push(ss.summary);
            } else if (ss?.splitCount) {
                parts.push(`超长句静音分割 ${ss.splitCount} 条(+${ss.added || 0})`);
            }
        }
        if (prepared.llmSplit?.splitCount) {
            parts.push(`智能断句 ${prepared.llmSplit.splitCount} 条(+${prepared.llmSplit.added || 0})`);
        }
        if (prepared.retranscribe && !prepared.retranscribe.skipped) {
            const failN = Number(prepared.retranscribe.failCount) || 0;
            const okN = Number(prepared.retranscribe.okCount) || 0;
            const totalN = Number(prepared.retranscribe.rangeCount) || 0;
            if (okN > 0 || failN > 0) {
                parts.push(
                    failN > 0
                        ? `局部重转写 ${okN}/${totalN} 窗（失败 ${failN}）`
                        : `局部重转写 ${okN}/${totalN} 窗`,
                );
            }
        } else if (prepared.retranscribe?.skipped && prepared.retranscribe.reason === 'disabled') {
            parts.push('已跳过局部重转写');
        }
        if (!prepared.skipPolish && targetIndexes.length) {
            parts.push(`智能润色 ${applied.changed}/${targets.length} 条`);
        } else if (prepared.skipPolish) {
            try {
                const blankPolicy = require('../src/js/blank-mt-retry-policy-core');
                const { resolveMtTargetFields } = require('./sanitize-target-opts');
                if (resolveMtTargetFields(input).isZhTarget === false) {
                    parts.push('非中文成片已跳过智能润色');
                } else if (blankPolicy.isInferenceBlankDirectFinalize?.(input)) {
                    parts.push('句级专训已跳过 QC 智能润色/语义审阅');
                } else {
                    parts.push('无需智能润色');
                }
            } catch {
                parts.push('无需智能润色');
            }
        }
        if (semanticChanged) {
            parts.push(`语义采纳 ${semantic.changed}/${semantic.suggestions || semantic.changed} 条`);
            if (Number(semantic.blankFilled) > 0) {
                parts.push(`空/省略补译 ${semantic.blankFilled}`);
            }
        } else if (semantic?.ok && semantic.issueCount) {
            parts.push(`语义审阅 ${semantic.issueCount} 处`);
        } else if (semantic && !semantic.ok && !semantic.skipped) {
            parts.push(semantic.error || '语义审阅失败');
        }
        if (remainingText) parts.push(remainingText);

        if (!shouldWrite) {
            return {
                ok: true,
                path: filePath,
                written: false,
                smartChanged: 0,
                targets: targets.length,
                profile: prepared.profile,
                rule: ruleResult,
                silenceSplit: prepared.silenceSplit,
                llmSplit: prepared.llmSplit,
                retranscribe: prepared.retranscribe,
                semantic,
                remaining: afterScan.summary,
                summary: '智能处理无文本变更',
                via: recon.via,
                llmSource: recon.llmSource,
            };
        }

        // Keep JA↔ZH slot count after polish when a pair track was provided.
        try {
            const pairCues = Array.isArray(input.pairCues) ? input.pairCues : [];
            if (pairCues.length && cues.length !== pairCues.length) {
                const { rematerializeCuesIfNeeded } = require('./mt-pair-rematerialize');
                const aligned = rematerializeCuesIfNeeded(cues, pairCues, { force: false });
                if (aligned.rematerialized) cues = aligned.cues;
            }
        } catch { /* optional */ }

        const healedOut = healSoftwareCreditCues(cues);
        cues = healedOut.cues;

        const written = writeSubtitleDocument(filePath, {
            cues,
            format: doc.format,
            header: doc.header,
            backupMode: input.backupMode || 'off',
        });
        if (!written.ok) return written;

        sendQcSmartProgress(event, input, {
            phase: 'done',
            message: 'QC 智能处理完成',
            pct: 100,
            changed: applied.changed + (semantic.changed || 0),
        });

        return {
            ok: true,
            path: filePath,
            written: true,
            smartChanged: applied.changed,
            changedIndexes: applied.changedIndexes,
            targets: targets.length,
            targetIndexes,
            profile: prepared.profile,
            rule: ruleResult,
            silenceSplit: prepared.silenceSplit,
            llmSplit: prepared.llmSplit,
            retranscribe: prepared.retranscribe,
            semantic,
            beforeSmart: beforeSmartScan.summary,
            remaining: afterScan.summary,
            remainingText,
            summary: parts.join('；'),
            via: recon.via,
            llmSource: recon.llmSource,
            plan: smartCore.summarizeQcSmartPlan(targets, { maxSmartCues: input.maxSmartCues }),
        };
    }

    return {
        runQcSmartFix,
        sendQcSmartProgress,
        runQcLlmSplitRequest,
        prepareQcSmartFixState,
        finishQcSmartFixWithLlm,
        healSoftwareCreditCues,
    };
}

module.exports = {
    createAdvancedQcSmartFix,
};
