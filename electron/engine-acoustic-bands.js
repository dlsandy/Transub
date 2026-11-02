/**
 * Acoustic scene bands: whole-file sniff + sliding probes + range re-listen.
 * Nested inside engine batch (allowDuringBatch + skip compute lock).
 */
const path = require('path');
const fs = require('fs');
const { asString, asPlainObject } = require('./ipc-validate');
const { probeAcousticWindow } = require('./ffmpeg-bridge');
const bandCore = require('../src/js/acoustic-band-core');

function loadContentProfile() {
    try {
        return require('../src/js/content-profile-core');
    } catch (_) {
        return null;
    }
}

function loadSubtitleCues(subPath) {
    const filePath = asString(subPath, 4096).trim();
    if (!filePath || !fs.existsSync(filePath)) return [];
    try {
        const { parseSubtitle } = require('./subtitle-format');
        const raw = fs.readFileSync(filePath, 'utf8');
        const ext = path.extname(filePath).replace(/^\./, '').toLowerCase() || 'srt';
        const parsed = parseSubtitle(raw, ext);
        return (parsed.cues || []).map((c, i) => ({
            index: i,
            startMs: Number(c.startMs) || 0,
            endMs: Number(c.endMs) || 0,
            text: String(c.text || '').trim(),
        })).filter((c) => c.text);
    } catch (_) {
        return [];
    }
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
            cues: (cues || []).map((c) => ({
                startMs: c.startMs,
                endMs: c.endMs,
                text: c.text,
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

function cuesInRange(cues, startMs, endMs) {
    return (cues || []).filter((c) => {
        const s = Number(c.startMs) || 0;
        const e = Number(c.endMs) || 0;
        return e > startMs && s < endMs;
    });
}

/**
 * Single sniff window → applyAcousticHints for whole-file VAD nudge.
 * Optionally also builds a sliding band plan (probes) for later re-listen.
 */
async function prepareAcousticForItem(input = {}) {
    const options = { ...asPlainObject(input.options) };
    const mediaPath = asString(input.mediaPath, 4096).trim();
    const durationSec = Math.max(0, Number(input.durationSec) || Number(options.durationSec) || 0);
    const onLog = typeof input.onLog === 'function' ? input.onLog : null;
    const ffmpegPath = options.ffmpegPath || options.ffmpegPathSetting || input.ffmpegPath;

    if (!bandCore.shouldRunAcousticBandAdapt(options)) {
        return {
            ok: true,
            skipped: true,
            reason: 'disabled',
            options,
            senseAcoustic: null,
            bands: [],
            windows: [],
        };
    }
    if (!mediaPath || !fs.existsSync(mediaPath)) {
        return {
            ok: true,
            skipped: true,
            reason: 'no_media',
            options,
            senseAcoustic: null,
            bands: [],
            windows: [],
        };
    }

    const cp = loadContentProfile();
    const profile = String(options.contentProfile || options.senseProfile || 'unknown').toLowerCase();
    const shouldProbe = cp?.shouldProbeAcoustic
        ? cp.shouldProbeAcoustic({
            profile,
            confidence: options.senseConfidence,
            strongAv: options.strongAv,
            force: options.forceAcousticProbe === true,
        })
        : true;

    let senseAcoustic = null;
    let notes = [];

    if (shouldProbe) {
        const sniff = cp?.resolveSenseSniffWindow
            ? cp.resolveSenseSniffWindow({ durationSec, windowSec: 12 })
            : { startSec: durationSec > 60 ? 90 : 0, durationSec: 12, reason: 'default' };
        try {
            const probe = await probeAcousticWindow(mediaPath, {
                startSec: sniff.startSec,
                durationSec: sniff.durationSec,
                ffmpegPath,
            });
            if (probe?.ok !== false && (probe.hint || probe.meanVolumeDb != null)) {
                senseAcoustic = {
                    hint: bandCore.hintFromProbe(probe),
                    musicLikely: !!probe.musicLikely,
                    softSparse: !!probe.softSparse,
                    noisyFloor: !!probe.noisyFloor,
                    meanVolumeDb: probe.meanVolumeDb,
                    maxVolumeDb: probe.maxVolumeDb,
                    silenceRatio: probe.silenceRatio,
                    startSec: probe.startSec ?? sniff.startSec,
                    durationSec: sniff.durationSec,
                    reason: sniff.reason,
                };
                if (cp?.applyAcousticHints) {
                    const applied = cp.applyAcousticHints(options, senseAcoustic, { profile });
                    Object.assign(options, applied.overrides || {});
                    notes = applied.notes || [];
                } else {
                    const patch = bandCore.resolveBandPatch(senseAcoustic.hint, options);
                    Object.assign(options, patch.overrides || {});
                    notes = patch.notes || [];
                }
                if (notes.length) onLog?.(`声学嗅探（${senseAcoustic.hint}）: ${notes.join('；')}`);
                else onLog?.(`声学嗅探: ${senseAcoustic.hint} @${Math.round(senseAcoustic.startSec || 0)}s`);
            }
        } catch (err) {
            onLog?.(`声学嗅探跳过: ${err?.message || err}`);
        }
    }

    // Sliding bands for post-ASR re-listen (capped).
    let windows = [];
    let bands = [];
    try {
        const plan = bandCore.planProbeWindows({ durationSec });
        const probed = [];
        for (const win of plan) {
            // Skip the sniff window we already ran if close.
            if (senseAcoustic
                && Math.abs((senseAcoustic.startSec || 0) - win.startSec) < 4) {
                probed.push({
                    ...win,
                    hint: senseAcoustic.hint,
                    musicLikely: senseAcoustic.musicLikely,
                    softSparse: senseAcoustic.softSparse,
                    noisyFloor: senseAcoustic.noisyFloor,
                });
                continue;
            }
            const hit = await probeAcousticWindow(mediaPath, {
                startSec: win.startSec,
                durationSec: win.durationSec,
                ffmpegPath,
            });
            if (hit?.ok === false && hit.error) continue;
            probed.push({
                ...win,
                hint: bandCore.hintFromProbe(hit),
                musicLikely: !!hit.musicLikely,
                softSparse: !!hit.softSparse,
                noisyFloor: !!hit.noisyFloor,
                meanVolumeDb: hit.meanVolumeDb,
                silenceRatio: hit.silenceRatio,
            });
        }
        windows = probed;
        bands = bandCore.mergeWindowsToBands(probed);
        if (bands.length) {
            const summary = bandCore.summarizeBands(bands);
            onLog?.(
                `声学分带 ${bands.length} 段`
                + `（软${summary.soft}·噪${summary.noisy}·乐${summary.music}）`,
            );
        }
    } catch (err) {
        onLog?.(`声学分带跳过: ${err?.message || err}`);
    }

    return {
        ok: true,
        skipped: false,
        options,
        senseAcoustic,
        bands,
        windows,
        notes,
        primaryHint: senseAcoustic?.hint || 'neutral',
    };
}

/**
 * After primary ASR: re-listen divergent acoustic bands with patched VAD.
 */
async function runAcousticBandRelistenPass(input = {}) {
    const options = asPlainObject(input.options);
    const mediaPath = asString(input.mediaPath, 4096).trim();
    const subtitlePath = asString(input.subtitlePath || input.sourceSubtitlePath, 4096).trim();
    const onLog = typeof input.onLog === 'function' ? input.onLog : null;
    const onProgress = typeof input.onProgress === 'function' ? input.onProgress : null;

    if (!bandCore.shouldRunAcousticBandAdapt(options)) {
        return { ok: true, skipped: true, reason: 'disabled' };
    }
    if (!mediaPath || !fs.existsSync(mediaPath) || !subtitlePath || !fs.existsSync(subtitlePath)) {
        return { ok: true, skipped: true, reason: 'no_media_or_subtitle' };
    }

    let bands = Array.isArray(input.bands) ? input.bands.slice() : [];
    let primaryHint = String(input.primaryHint || options.senseAcoustic?.hint || 'neutral');

    if (!bands.length) {
        const prep = await prepareAcousticForItem({
            mediaPath,
            durationSec: input.durationSec || options.durationSec,
            options,
            onLog,
            ffmpegPath: options.ffmpegPath,
        });
        bands = prep.bands || [];
        primaryHint = prep.primaryHint || primaryHint;
    }

    const selected = bandCore.selectRelistenBands(bands, { primaryHint });
    if (!selected.length) {
        return {
            ok: true,
            skipped: true,
            reason: 'no_divergent_bands',
            bandCount: bands.length,
            primaryHint,
        };
    }

    const metaCore = require('../src/js/subtitle-meta-core');
    const { transcribeRangeWithEngine } = require('./engine-bridge');
    let working = loadSubtitleCues(subtitlePath);
    if (!working.length) {
        return { ok: true, skipped: true, reason: 'empty_subtitle' };
    }

    let replacedWindows = 0;
    let attempted = 0;
    const accepted = [];

    for (let i = 0; i < selected.length; i += 1) {
        const band = selected[i];
        const startMs = Math.max(0, Math.round((Number(band.startSec) || 0) * 1000));
        const endMs = Math.max(startMs + 1000, Math.round((Number(band.endSec) || 0) * 1000));
        const patch = bandCore.resolveBandPatch(band.hint, options);
        const rangeOpts = {
            ...options,
            ...patch.overrides,
            // Range path keeps Demucs off; light denoise still honored.
            filmAudioEnhance: false,
            task: 'transcribe',
            smartTranslate: false,
            releaseGpuAfter: false,
        };
        attempted += 1;
        onProgress?.({
            stage: 'acoustic-band',
            detail: `声学分带补听 ${i + 1}/${selected.length}（${band.hint}）`,
        });
        try {
            const primarySlice = cuesInRange(working, startMs, endMs);
            const res = await transcribeRangeWithEngine({
                mediaPath,
                startMs,
                endMs,
                padMs: 400,
                subtitlePath,
                asrModel: options.engineAsrModel || options.primaryAsr,
                asrCandidates: [options.engineAsrModel || options.primaryAsr].filter(Boolean),
                allowDuringBatch: true,
                _skipComputeLock: true,
                options: rangeOpts,
            }, {
                allowDuringBatch: true,
                _skipComputeLock: true,
                options: rangeOpts,
                onProgress: (info) => onProgress?.({
                    stage: 'acoustic-band',
                    detail: info?.detail || info?.message
                        || `声学分带 ${i + 1}/${selected.length}`,
                }),
            });
            if (!res?.ok || !Array.isArray(res.cues) || !res.cues.length) continue;
            if (!bandCore.shouldAcceptBandRelisten(primarySlice, res.cues, band.hint)) {
                onLog?.(`声学分带 ${band.hint} @${Math.round(band.startSec)}s 未优于主票，保留`);
                continue;
            }
            const replacedDoc = metaCore.replaceCuesInTimeRange(
                working,
                startMs,
                endMs,
                res.cues,
            );
            working = replacedDoc.cues.map((c, idx) => ({
                index: idx,
                startMs: c.startMs,
                endMs: c.endMs,
                text: c.text,
            }));
            replacedWindows += 1;
            accepted.push({
                hint: band.hint,
                startSec: band.startSec,
                endSec: band.endSec,
            });
            onLog?.(
                `声学分带已采纳 ${band.hint} `
                + `${Math.round(band.startSec)}–${Math.round(band.endSec)}s`,
            );
            try {
                const { mergeRangeAsrConfidenceMeta } = require('./asr-confidence-seed');
                mergeRangeAsrConfidenceMeta(subtitlePath, res.cues, {
                    startMs,
                    endMs,
                    allowHeuristic: true,
                });
            } catch (_) { /* ignore */ }
        } catch (err) {
            onLog?.(`声学分带窗 ${i + 1} 跳过: ${err?.message || err}`);
        }
    }

    if (attempted > 0) {
        try {
            const { releaseGpuAfterQcRetranscribeBurst } = require('./engine-qc-retranscribe-options');
            await releaseGpuAfterQcRetranscribeBurst(options);
        } catch (_) { /* ignore */ }
    }

    if (!replacedWindows) {
        return {
            ok: true,
            skipped: false,
            replacedWindows: 0,
            attempted,
            selected: selected.length,
            primaryHint,
            bandCount: bands.length,
        };
    }

    const written = writeSubtitleCues(subtitlePath, working);
    return {
        ok: !!written?.ok,
        error: written?.error,
        skipped: false,
        replacedWindows,
        attempted,
        accepted,
        primaryHint,
        bandCount: bands.length,
    };
}

module.exports = {
    prepareAcousticForItem,
    runAcousticBandRelistenPass,
};
