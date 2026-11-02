/**
 * Apply acoustic sentence splits after band re-listen and before second opinion.
 * Tier 1 reads the timing PCM (or a short ffmpeg window). Tier 2 re-decodes
 * only soft, still-glued cues on the CT2 Whisper already selected for the file.
 */
const fs = require('fs');
const path = require('path');
const splitCore = require('../src/js/acoustic-sentence-split-core');
const { asString, asPlainObject } = require('./ipc-validate');

function findCueIndex(cues, needle) {
    const text = String(needle?.text || '').trim();
    const start = Number(needle?.startMs);
    const end = Number(needle?.endMs);
    return (Array.isArray(cues) ? cues : []).findIndex((cue) => (
        Number(cue?.startMs) === start
        && Number(cue?.endMs) === end
        && String(cue?.text || '').trim() === text
    ));
}

function spliceSplit(cues, index, cutIndex, midMs) {
    const cue = cues[index];
    const text = String(cue?.text || '');
    const left = text.slice(0, cutIndex).trim();
    const right = text.slice(cutIndex).trim();
    if (!left || !right) return false;
    cues.splice(index, 1, {
        ...cue,
        text: left,
        endMs: midMs,
    }, {
        ...cue,
        text: right,
        startMs: midMs,
    });
    return true;
}

function writeSubtitleCues(subPath, cues) {
    const filePath = asString(subPath, 4096).trim();
    if (!filePath) return { ok: false, error: 'no_path' };
    try {
        const { writeSubtitleDocument } = require('./extensions-bridge');
        const { parseSubtitle } = require('./subtitle-format');
        const raw = fs.readFileSync(filePath, 'utf8');
        const ext = path.extname(filePath).replace(/^\./, '').toLowerCase() || 'srt';
        const doc = parseSubtitle(raw, ext);
        const written = writeSubtitleDocument(filePath, {
            cues: (cues || []).map((cue) => ({
                startMs: cue.startMs,
                endMs: cue.endMs,
                text: cue.text,
            })),
            format: doc.format || ext,
            header: doc.header,
            backupMode: 'off',
        });
        return { ok: !!written?.ok, error: written?.error, path: filePath };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

function sampleDepths(cue, pcmPack) {
    const wave = require('../src/js/waveform-timing-suspect-core');
    const pcm = pcmPack.pcm;
    const sampleRate = pcmPack.sampleRate;
    const preMs = pcmPack.preMs;
    const postMs = pcmPack.postMs;
    const opts = { sampleRate, preMs, postMs };
    const analysis = wave.analyzeCuePcm(cue, pcm, opts);
    const start = Number(cue.startMs) || 0;
    const end = Number(cue.endMs) || start;
    const dur = Math.max(1, end - start);
    const from = start + dur * 0.12;
    const to = end - dur * 0.12;
    const samples = [];
    for (let ms = from; ms <= to; ms += 40) {
        samples.push({
            ms: Math.round(ms),
            depth: wave.valleyDepthAtMs(pcm, ms, cue, { ...opts, analysis }),
        });
    }
    return samples;
}

function boundaryMsFromCues(cues, host) {
    const start = Number(host?.startMs) || 0;
    const end = Number(host?.endMs) || start;
    const out = [];
    for (const cue of Array.isArray(cues) ? cues : []) {
        const boundary = Number(cue?.startMs);
        if (!Number.isFinite(boundary)) continue;
        if (boundary <= start + 250 || boundary >= end - 250) continue;
        out.push(boundary);
    }
    return out;
}

async function runAcousticSentenceSplitPass(input = {}) {
    const options = asPlainObject(input.options);
    const mode = splitCore.resolveSentenceSplitMode(options);
    const onLog = typeof input.onLog === 'function' ? input.onLog : null;
    const onProgress = typeof input.onProgress === 'function' ? input.onProgress : null;
    if (mode === 'off') {
        return { ok: true, skipped: true, reason: 'disabled', mode };
    }

    const mediaPath = asString(input.mediaPath, 4096).trim();
    const subtitlePath = asString(input.subtitlePath || input.sourceSubtitlePath, 4096).trim();
    if (!mediaPath || !fs.existsSync(mediaPath) || !subtitlePath || !fs.existsSync(subtitlePath)) {
        return { ok: true, skipped: true, reason: 'no_media_or_subtitle', mode };
    }

    const { loadSubtitleCues } = require('./engine-asr-second-opinion');
    let working = loadSubtitleCues(subtitlePath);
    if (!working.length) {
        return { ok: true, skipped: true, reason: 'empty_subtitle', mode };
    }

    const planOpts = {
        ...options,
        bands: Array.isArray(input.bands) ? input.bands : (options.acousticBands || []),
        contentProfile: options.contentProfile || options.senseProfile || input.contentProfile,
        primaryAsr: input.primaryAsr || options.primaryAsr || options.engineAsrModel || options.asrModel,
    };
    const pcmCandidates = splitCore.selectPcmCandidates(working, planOpts);
    if (!pcmCandidates.length) {
        return { ok: true, skipped: true, reason: 'no_candidates', mode, pcmSplits: 0, metronomeSplits: 0 };
    }

    onProgress?.({ stage: 'transcribe', detail: '声学断句…' });
    const { extractPcmWindow, prepareWaveformExtractSession } = require('./qc-waveform-timing');
    const session = await prepareWaveformExtractSession(mediaPath, options);
    let pcmSplits = 0;
    let metronomeSplits = 0;
    let attemptedPcm = 0;
    const metronomeMisses = [];

    try {
        for (const candidate of pcmCandidates) {
            const index = findCueIndex(working, candidate);
            if (index < 0) continue;
            const cue = working[index];
            attemptedPcm += 1;
            let pack = null;
            try {
                pack = await extractPcmWindow(mediaPath, cue.startMs, cue.endMs, {
                    ...options,
                    waveformSession: session,
                });
            } catch (err) {
                onLog?.(`声学断句跳过 ${Math.round(cue.startMs / 1000)}s: ${err?.message || err}`);
                continue;
            }
            if (!pack?.ok || !pack.pcm?.length) continue;
            const plan = splitCore.choosePcmSplit(cue, sampleDepths(cue, pack));
            if (plan && spliceSplit(working, index, plan.cutIndex, plan.midMs)) {
                pcmSplits += 1;
                continue;
            }
            metronomeMisses.push(candidate);
        }

        const metronomeQueue = mode === 'full'
            ? splitCore.selectMetronomeCandidates(metronomeMisses, planOpts)
            : [];
        let attemptedMetronome = 0;
        if (metronomeQueue.length) {
            const { transcribeRangeWithEngine } = require('./engine-bridge');
            const primary = String(planOpts.primaryAsr || '').trim();
            for (let i = 0; i < metronomeQueue.length; i += 1) {
                const candidate = metronomeQueue[i];
                const index = findCueIndex(working, candidate);
                if (index < 0) continue;
                const cue = working[index];
                attemptedMetronome += 1;
                onProgress?.({
                    stage: 'transcribe',
                    detail: `声学断句切点 ${i + 1}/${metronomeQueue.length}`,
                });
                try {
                    const res = await transcribeRangeWithEngine({
                        mediaPath,
                        startMs: cue.startMs,
                        endMs: cue.endMs,
                        padMs: 200,
                        asrModel: primary,
                        asrCandidates: [primary],
                        timingBoundariesOnly: true,
                        allowDuringBatch: true,
                        _skipComputeLock: true,
                        options: {
                            ...options,
                            engineAsrModel: primary,
                            beamSize: 1,
                            task: 'transcribe',
                            smartTranslate: false,
                            releaseGpuAfter: false,
                            filmAudioEnhance: false,
                            timingBoundariesOnly: true,
                        },
                    }, {
                        allowDuringBatch: true,
                        _skipComputeLock: true,
                        onProgress: (info) => onProgress?.({
                            stage: 'transcribe',
                            detail: info?.detail || `声学断句切点 ${i + 1}/${metronomeQueue.length}`,
                        }),
                    });
                    if (!res?.ok || !Array.isArray(res.cues)) continue;
                    const fresh = findCueIndex(working, cue);
                    if (fresh < 0) continue;
                    const boundaries = boundaryMsFromCues(res.cues, working[fresh]);
                    const plan = splitCore.chooseMetronomeSplit(working[fresh], boundaries);
                    if (plan && spliceSplit(working, fresh, plan.cutIndex, plan.midMs)) {
                        metronomeSplits += 1;
                    }
                } catch (err) {
                    onLog?.(`声学断句切点 ${i + 1} 跳过: ${err?.message || err}`);
                }
            }
            if (attemptedMetronome > 0) {
                try {
                    const { releaseGpuAfterQcRetranscribeBurst } = require('./engine-qc-retranscribe-options');
                    await releaseGpuAfterQcRetranscribeBurst(options);
                } catch (_) { /* ignore */ }
            }
        }

        if (!pcmSplits && !metronomeSplits) {
            return {
                ok: true,
                skipped: false,
                mode,
                pcmSplits: 0,
                metronomeSplits: 0,
                attemptedPcm,
                attemptedMetronome,
            };
        }
        const written = writeSubtitleCues(subtitlePath, working);
        if (written?.ok) {
            if (pcmSplits) onLog?.(`声学断句：能量谷切开 ${pcmSplits} 条`);
            if (metronomeSplits) onLog?.(`声学断句：同模型切点切开 ${metronomeSplits} 条`);
        }
        return {
            ok: !!written?.ok,
            error: written?.error,
            skipped: false,
            mode,
            pcmSplits,
            metronomeSplits,
            attemptedPcm,
            attemptedMetronome,
        };
    } finally {
        try { session?.cleanup?.(); } catch (_) { /* ignore */ }
    }
}

module.exports = {
    runAcousticSentenceSplitPass,
};
