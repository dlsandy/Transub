/**
 * Editor / second-opinion range retranscribe via Engine ASR.
 * Bound from engine-bridge via createEngineRangeTranscribe(host).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * @param {object} host bridge bindings (mutable: batchCancelled, batchRunning, currentJobId)
 */
function createEngineRangeTranscribe(host) {
    if (!host || typeof host !== 'object') {
        throw new Error('createEngineRangeTranscribe: host required');
    }

    async function transcribeRangeWithEngine(payload = {}, deps = {}) {
        const {
            appendEngineLogLine,
            buildAudioJobOptions,
            buildVadJobOptions,
            createJob,
            ensureEngineRunning,
            friendlyEngineError,
            mapDeviceForEngine,
            mapTaskToEngineTask,
            mergeEngineOptions,
            rangeAsrPolicy,
            releaseGpuMemory,
            resolveQwenAsrBatchModeForJob,
            resolveRangeAsrFailoverCandidates,
            sampleJobGpuVramHint,
            waitJob,
        } = host;

        const mediaPath = path.resolve(String(payload.mediaPath || payload.videoPath || ''));
        const rangeWin = rangeAsrPolicy.clampRangeWindow({
            startMs: payload.startMs,
            endMs: payload.endMs,
            padMs: payload.padMs,
        });
        const startMs = rangeWin.startMs;
        const endMs = rangeWin.endMs;
        const padMs = rangeWin.padMs;
        const onProgress = typeof deps.onProgress === 'function' ? deps.onProgress : null;
        const options = mergeEngineOptions(deps.options || payload.options || {});
        const allowDuringBatch = !!(
            payload.allowDuringBatch
            || deps.allowDuringBatch
            || payload._skipComputeLock
            || deps._skipComputeLock
            || payload._batchMode
        );

        if (!mediaPath || !fs.existsSync(mediaPath)) {
            return { ok: false, error: '媒体文件不存在' };
        }
        if (endMs - startMs < 200) {
            return { ok: false, error: '字幕时间范围过短，无法重转写' };
        }
        if (host.batchRunning && !allowDuringBatch) {
            return { ok: false, error: '已有字幕任务正在运行，请稍后再试', code: 'compute_busy' };
        }

        const { isHostStopRequested } = require('./engine-batch-item');
        const rangeStopRequested = () => {
            if (typeof deps.shouldStop === 'function' && deps.shouldStop()) return true;
            if (typeof payload.shouldStop === 'function' && payload.shouldStop()) return true;
            if (deps.signal?.aborted || payload.signal?.aborted) return true;
            return isHostStopRequested(host);
        };
        // Nested QC/batch range jobs must not wipe the user's stop flags.
        // Standalone editor clips may clear a stale leftover from a prior batch.
        if (!allowDuringBatch && !host.batchRunning) {
            host.batchCancelled = false;
            host.itemCancelled = false;
        }
        if (rangeStopRequested()) {
            return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
        }

        const computeLock = require('./compute-task-lock');
        const lockPayload = {
            _skipComputeLock: allowDuringBatch || payload._skipComputeLock || deps._skipComputeLock,
            _batchMode: payload._batchMode || deps._batchMode,
        };

        return computeLock.runWithComputeLockUnlessNested({
            kind: 'engine_range',
            owner: allowDuringBatch ? '引擎低置信二意见' : '字幕编辑器',
            source: 'transcribeRangeWithEngine',
        }, lockPayload, async () => {
            if (!payload.skipLlmReclaim && !deps.skipLlmReclaim) {
                try {
                    require('./local-llm-reclaim').reclaimLocalLlmBeforeEngineJob(appendEngineLogLine);
                } catch (_) { /* ignore */ }
            }
            const ensure = await ensureEngineRunning({
                ...options,
                shouldStop: rangeStopRequested,
            });
            if (!ensure.ok) return ensure;
            if (rangeStopRequested()) {
                return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
            }

            const clipStartMs = rangeWin.clipStartMs;
            const clipEndMs = rangeWin.clipEndMs;
            const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-engine-re-'));
            const clipPath = path.join(tempRoot, 'clip.wav');
            const outputDir = path.join(tempRoot, 'out');
            fs.mkdirSync(outputDir, { recursive: true });

            try {
                if (rangeStopRequested()) {
                    return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                }
                onProgress?.({ stage: 'extract', detail: '截取音频片段' });
                const { extractMediaRange } = require('./ffmpeg-bridge');
                const clip = await extractMediaRange(mediaPath, clipStartMs, clipEndMs, clipPath, {
                    ffmpegPath: options.ffmpegPath || payload.ffmpegPath,
                });
                if (!clip.ok) {
                    return {
                        ok: false,
                        cancelled: !!clip.cancelled || rangeStopRequested(),
                        error: friendlyEngineError(clip.error || '截取音频失败'),
                    };
                }
                if (rangeStopRequested()) {
                    return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                }

                const task = mapTaskToEngineTask(
                    payload.options?.task === 'translate' ? 'translate' : 'transcribe',
                    { smartTranslate: false },
                );
                // Never pass Sakura/smart ids as native Engine Opus mtModel.
                const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
                const mtModel = rangeAsrPolicy.resolveRangeAsrMtModel(options, {
                    isSakuraMtModel: (id) => sakuraCatalog.isSakuraMtModel(id),
                    isLlmInferenceMtModel: (id) => !!sakuraCatalog.isLlmInferenceMtModel?.(id),
                });

                const primaryAsr = String(
                    payload.asrModel || options.engineAsrModel || 'sensevoice-small',
                ).trim() || 'sensevoice-small';
                // SenseVoice 对短窗/AV 常空：有必要时再换已安装的兄弟 ASR 试一次
                // Callers (e.g. second opinion) may pass an explicit short list to avoid tiny/turbo churn.
                const asrCandidates = (() => {
                    const forced = payload.asrCandidates || deps.asrCandidates;
                    if (Array.isArray(forced) && forced.length) {
                        return [...new Set(forced.map((id) => String(id || '').trim()).filter(Boolean))];
                    }
                    return resolveRangeAsrFailoverCandidates(
                        primaryAsr,
                        options.engineInstallPath,
                    );
                })();
                const isRetryableAsrFail = rangeAsrPolicy.isRetryableAsrFail;

                const runAsrOnce = async (asrModel) => {
                    onProgress?.({
                        stage: 'transcribe',
                        detail: asrModel === primaryAsr
                            ? '引擎推理中'
                            : `${primaryAsr} 无结果，改用 ${asrModel}…`,
                    });
                    const vramHint = await sampleJobGpuVramHint({
                        device: mapDeviceForEngine(options.device),
                    });
                    const created = await createJob(ensure.baseUrl, {
                        task,
                        mediaPath: clipPath,
                        outputDir,
                        language: options.language || 'auto',
                        asrModel,
                        mtModel,
                        subFormats: ['srt'],
                        device: mapDeviceForEngine(options.device),
                        beamSize: Math.max(1, Math.min(20, Number(options.beamSize) || 5)),
                        vad: buildVadJobOptions(options),
                        // Short editor clips: keep VAD/denoise, skip Demucs (too heavy for range retranscribe)
                        audio: buildAudioJobOptions({
                            audioLightDenoise: options.audioLightDenoise,
                            filmAudioEnhance: false,
                            filmVadPreset: false,
                        }, { entitled: false }),
                        contentProfile: options.contentProfile || options.senseProfile || undefined,
                        senseProfile: options.senseProfile || options.contentProfile || undefined,
                        ...(options.timingAlign != null
                            ? { timingAlign: options.timingAlign }
                            : {}),
                        ...(options.timingAlignModel != null
                            && String(options.timingAlignModel).trim() !== ''
                            ? { timingAlignModel: String(options.timingAlignModel).trim() }
                            : {}),
                        perfProfile: (() => {
                            const v = String(options.perfProfile || 'quality').trim().toLowerCase();
                            return v === 'speed' ? 'speed' : 'quality';
                        })(),
                        qwenAsrBatchMode: resolveQwenAsrBatchModeForJob(options),
                        ...(vramHint.gpuTotalMiB ? vramHint : {}),
                        castNames: options.castNames || options.cast_names || undefined,
                        // Keep weights loaded across failover attempts on the same clip.
                        releaseGpuAfter: false,
                        sync: false,
                    }, { timeoutMs: 600000 });
                    if (!created.ok || !created.data?.id) {
                        return {
                            ok: false,
                            cancelled: !!created.cancelled,
                            error: friendlyEngineError(
                                created.error || created.data?.message || created.data?.error || '创建引擎任务失败',
                            ),
                            code: created.code,
                        };
                    }
                    // Track job so Esc → transub-engine-cancel can cancelJob(currentJobId).
                    host.currentJobId = created.data.id;
                    const waited = await waitJob(ensure.baseUrl, created.data.id, {
                        shouldStop: rangeStopRequested,
                        signal: deps.signal || payload.signal,
                    });
                    host.currentJobId = '';
                    if (!waited.ok) {
                        const errMsg = waited.error || waited.data?.error?.message || '引擎任务失败';
                        const errCode = waited.data?.error?.code
                            || ((waited.cancelled || rangeStopRequested()) ? 'cancelled' : undefined);
                        return {
                            ok: false,
                            cancelled: !!waited.cancelled || rangeStopRequested(),
                            error: friendlyEngineError(errMsg),
                            code: errCode,
                        };
                    }
                    const outputs = waited.data?.result?.outputs || [];
                    const outPath = outputs[0]?.path || '';
                    if (!outPath || !fs.existsSync(outPath)) {
                        return { ok: false, error: '重转写未生成字幕文件', code: 'ASR_EMPTY' };
                    }
                    const raw = fs.readFileSync(outPath, 'utf8');
                    const { parseSubtitle } = require('./subtitle-format');
                    const parsed = parseSubtitle(raw, 'srt');
                    let cues = rangeAsrPolicy.remapClipCuesToTimeline(parsed.cues || [], clipStartMs);
                    if (!cues.length) {
                        return { ok: false, error: '重转写结果为空', code: 'ASR_EMPTY' };
                    }
                    // Same source-prep as batch sanitizeMtSubtitlePair: name-loop + JA domain.
                    let cleanupMeta = null;
                    try {
                        const { cleanupAsrCues } = require('./asr-cue-cleanup');
                        const cleaned = cleanupAsrCues(cues, {
                            nameLoop: options.asrNameLoopClean !== false,
                            jaAsrDomainFix: options.jaAsrDomainFix !== false,
                        });
                        cues = cleaned.cues;
                        cleanupMeta = cleaned;
                        if (cleaned.changed) {
                            try {
                                const { formatDomainFixLogLine, summarizeDomainFixChanges } = require('./asr-domain-fix-trace');
                                if (cleaned.domainChanged) {
                                    const trace = summarizeDomainFixChanges([{
                                        from: 'ja-asr-domain',
                                        to: 'applied',
                                        count: cleaned.domainChanged,
                                    }], 'range_asr');
                                    const line = formatDomainFixLogLine(trace);
                                    if (line) appendEngineLogLine(line, deps.invokeSender || null);
                                }
                                appendEngineLogLine(`[engine] 局部重转写 ${cleaned.summary}`, deps.invokeSender || null);
                            } catch { /* log optional */ }
                        }
                    } catch (err) {
                        appendEngineLogLine(
                            `[engine] 局部重转写 ASR 清理跳过：${err.message || err}`,
                            deps.invokeSender || null,
                        );
                    }
                    if (!cues.length) {
                        return { ok: false, error: '重转写结果为空', code: 'ASR_EMPTY' };
                    }
                    // Prefer engine result cue scores when SRT parse has none.
                    try {
                        const { pickEngineCuesForConfidence, cueHasAsrScoreMeta } = require('./asr-confidence-seed');
                        const scored = pickEngineCuesForConfidence(waited.data?.result || {});
                        if (scored.length && cues.some((c) => !cueHasAsrScoreMeta(c))) {
                            const byText = new Map();
                            for (const s of scored) {
                                const key = String(s?.text || '').trim();
                                if (key && cueHasAsrScoreMeta(s) && !byText.has(key)) byText.set(key, s);
                            }
                            if (byText.size) {
                                cues = cues.map((c) => {
                                    if (cueHasAsrScoreMeta(c)) return c;
                                    const hit = byText.get(String(c?.text || '').trim());
                                    if (!hit) return c;
                                    return {
                                        ...c,
                                        avgLogprob: hit.avgLogprob ?? hit.avg_logprob,
                                        noSpeechProb: hit.noSpeechProb ?? hit.no_speech_prob,
                                        confidence: hit.confidence,
                                        score: hit.score,
                                        probability: hit.probability ?? hit.prob,
                                        meta: hit.meta && typeof hit.meta === 'object' ? hit.meta : c.meta,
                                    };
                                });
                            }
                        }
                    } catch { /* optional score enrich */ }
                    const subtitlePath = String(
                        payload.subtitlePath || payload.sourceSubtitlePath || options.subtitlePath || '',
                    ).trim();
                    let confidenceSeed = null;
                    if (subtitlePath) {
                        try {
                            const { mergeRangeAsrConfidenceMeta } = require('./asr-confidence-seed');
                            confidenceSeed = mergeRangeAsrConfidenceMeta(subtitlePath, cues, {
                                startMs,
                                endMs,
                            });
                            if (confidenceSeed?.ok && confidenceSeed.entryCount) {
                                appendEngineLogLine(
                                    `[engine] 局部重转写已合并 ASR 置信度 ${confidenceSeed.entryCount} 条${confidenceSeed.heuristic ? '（启发式）' : ''} → ${path.basename(subtitlePath)}`,
                                    deps.invokeSender || null,
                                );
                            }
                        } catch (err) {
                            appendEngineLogLine(
                                `[engine] 局部重转写置信度合并跳过：${err.message || err}`,
                                deps.invokeSender || null,
                            );
                        }
                        try {
                            const { clearFreezeOnSource } = require('./engine-post-qc-loop-handoff');
                            clearFreezeOnSource(subtitlePath, (line) => {
                                appendEngineLogLine(`[engine] ${line}`, deps.invokeSender || null);
                            });
                        } catch { /* optional freeze clear */ }
                    }
                    onProgress?.({ stage: 'done', detail: '重转写完成' });
                    return {
                        ok: true,
                        cues,
                        clipStartMs,
                        clipEndMs,
                        padMs,
                        sourceStartMs: startMs,
                        sourceEndMs: endMs,
                        result: waited.data?.result,
                        task,
                        asrModel,
                        confidenceSeed,
                        asrCleanup: cleanupMeta
                            ? {
                                nameLoopsChanged: cleanupMeta.nameLoopsChanged,
                                domainChanged: cleanupMeta.domainChanged,
                                summary: cleanupMeta.summary,
                            }
                            : null,
                    };
                };

                let lastFail = null;
                let emptyFailStreak = 0;
                for (let i = 0; i < asrCandidates.length; i += 1) {
                    const asrModel = asrCandidates[i];
                    if (rangeStopRequested()) {
                        return { ok: false, cancelled: true, code: 'cancelled', error: '已取消' };
                    }
                    // Avoid reusing stale SRT from a previous empty attempt
                    try {
                        for (const name of fs.readdirSync(outputDir)) {
                            fs.rmSync(path.join(outputDir, name), { force: true });
                        }
                    } catch { /* ignore */ }
                    const outcome = await runAsrOnce(asrModel);
                    if (outcome.ok) return outcome;
                    lastFail = outcome;
                    if (outcome.cancelled) return outcome;
                    // Empty SenseVoice / missing Whisper → try next ASR candidate
                    if (!isRetryableAsrFail(outcome)) return outcome;
                    if (rangeAsrPolicy.isEmptyAsrFail(outcome)) {
                        emptyFailStreak += 1;
                    } else {
                        emptyFailStreak = 0;
                    }
                    if (emptyFailStreak >= 2 && i < asrCandidates.length - 1) {
                        appendEngineLogLine(
                            `[engine] 局部重转写 ${asrCandidates.slice(0, i + 1).join(' → ')} 均为空，跳过后续 ${asrCandidates.length - i - 1} 个模型`,
                            deps.invokeSender || null,
                        );
                        break;
                    }
                    if (i < asrCandidates.length - 1) {
                        appendEngineLogLine(
                            `[engine] 局部重转写 ${asrModel} 未成功（${outcome.error || 'unknown'}），尝试 ${asrCandidates[i + 1]}`,
                            deps.invokeSender || null,
                        );
                    }
                }
                return lastFail || { ok: false, error: '重转写结果为空', code: 'ASR_EMPTY' };
            } catch (err) {
                return {
                    ok: false,
                    cancelled: err?.name === 'AbortError' || err?.code === 'cancelled' || rangeStopRequested(),
                    error: friendlyEngineError(err?.message || String(err)),
                    code: (err?.name === 'AbortError' || rangeStopRequested()) ? 'cancelled' : err?.code,
                };
            } finally {
                host.currentJobId = '';
                if (options.releaseGpuAfter !== false) {
                    try {
                        await releaseGpuMemory(ensure.baseUrl, { timeoutMs: 12000 });
                    } catch { /* ignore */ }
                }
                try {
                    fs.rmSync(tempRoot, { recursive: true, force: true });
                } catch { /* ignore */ }
                try {
                    require('./temp-cleanup').cleanupAfterJob();
                } catch { /* ignore */ }
            }
        });
    }

    return { transcribeRangeWithEngine };
}

module.exports = {
    createEngineRangeTranscribe,
};
