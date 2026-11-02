/**
 * Post-ASR cheap energy start/edge snap (no extra neural aligner).
 * Runs after acoustic sentence split, before second opinion.
 */
const fs = require('fs');
const path = require('path');
const snapCore = require('../src/js/asr-start-snap-core');
const waveCore = require('../src/js/waveform-timing-suspect-core');
const { asString, asPlainObject } = require('./ipc-validate');

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

async function runAsrStartSnapPass(input = {}) {
    const options = asPlainObject(input.options);
    const onLog = typeof input.onLog === 'function' ? input.onLog : null;
    const onProgress = typeof input.onProgress === 'function' ? input.onProgress : null;

    if (!snapCore.shouldRunAsrStartSnap(options)) {
        return { ok: true, skipped: true, reason: 'disabled', changed: 0 };
    }

    const mediaPath = asString(input.mediaPath, 4096).trim();
    const subtitlePath = asString(input.subtitlePath || input.sourceSubtitlePath, 4096).trim();
    if (!mediaPath || !fs.existsSync(mediaPath) || !subtitlePath || !fs.existsSync(subtitlePath)) {
        return { ok: true, skipped: true, reason: 'no_media_or_subtitle', changed: 0 };
    }

    const { loadSubtitleCues } = require('./engine-asr-second-opinion');
    let working = loadSubtitleCues(subtitlePath).map((c, i) => ({ ...c, index: i }));
    if (!working.length) {
        return { ok: true, skipped: true, reason: 'empty_subtitle', changed: 0 };
    }

    const planOpts = {
        ...options,
        contentProfile: options.contentProfile || options.senseProfile || input.contentProfile,
        senseProfile: options.senseProfile || options.contentProfile || input.contentProfile,
    };
    const candidates = snapCore.selectStartSnapCandidates(working, planOpts);
    if (!candidates.length) {
        return { ok: true, skipped: true, reason: 'no_candidates', changed: 0, attempted: 0 };
    }

    onProgress?.({ stage: 'transcribe', detail: 'ASR 起点吸附…' });
    const { extractPcmWindow, prepareWaveformExtractSession, snapsLookCatastrophic } = require('./qc-waveform-timing');
    const clamp = snapCore.resolveSnapClampOptions(planOpts);
    const session = await prepareWaveformExtractSession(mediaPath, {
        ...options,
        // Prefer engine timing PCM when present.
        timingAudioPath: options.timingAudioPath || input.timingAudioPath || '',
        waveformAudioPath: options.waveformAudioPath || options.timingAudioPath || '',
    });

    const proposed = [];
    let attempted = 0;
    try {
        for (const cand of candidates) {
            const idx = Number(cand.index);
            const cue = working[idx];
            if (!cue) continue;
            attempted += 1;
            let pack = null;
            try {
                pack = await extractPcmWindow(mediaPath, cue.startMs, cue.endMs, {
                    ...options,
                    waveformSession: session,
                    preMs: clamp.preMs,
                    postMs: clamp.postMs,
                });
            } catch (_) {
                continue;
            }
            if (!pack?.ok || !pack.pcm?.length) continue;

            const analysis = waveCore.analyzeCuePcm(cue, pack.pcm, {
                sampleRate: pack.sampleRate,
                preMs: pack.preMs,
                postMs: pack.postMs,
            });
            const prev = idx > 0 ? working[idx - 1] : null;
            const next = idx < working.length - 1 ? working[idx + 1] : null;
            const rawSnap = waveCore.proposeEdgeSnap(cue, pack.pcm, {
                ...clamp,
                analysis,
                sampleRate: pack.sampleRate,
                preMs: pack.preMs,
                postMs: pack.postMs,
                prevLimitMs: prev ? waveCore.cueEndMs(prev) + 1 : undefined,
                nextLimitMs: next ? Number(next.startMs) - 1 : undefined,
            });
            // Soft sparse: always allow start+end tighten; moan-heavy keep startOnly
            // so we do not chew a trailing breath that is the cue.
            const startOnly = snapCore.isPunctOrMoanHeavy(cue.text)
                && !/[\u4e00-\u9fff]/.test(String(cue.text || ''));
            const snap = snapCore.filterSnapForAsr(rawSnap, cue, {
                ...clamp,
                startOnly,
            });
            if (snap?.changed) {
                proposed.push({ ...snap, index: idx });
            }
        }

        if (!proposed.length) {
            return {
                ok: true,
                skipped: false,
                changed: 0,
                attempted,
                candidates: candidates.length,
                reason: 'no_effective_snaps',
            };
        }

        const before = working.map((c) => ({ ...c }));
        const applied = waveCore.applyEdgeSnapsToCues(working, proposed, { gapMs: 1 });
        if (typeof snapsLookCatastrophic === 'function'
            && snapsLookCatastrophic(before, applied.cues, applied.changed)) {
            onLog?.('ASR 起点吸附已撤销（时间轴异常）');
            return {
                ok: true,
                skipped: false,
                changed: 0,
                attempted,
                candidates: candidates.length,
                rejected: true,
                reason: 'catastrophic_timeline',
            };
        }

        working = applied.cues;
        const written = writeSubtitleCues(subtitlePath, working);
        if (written?.ok && applied.changed > 0) {
            const meanStart = proposed.reduce((s, p) => s + Math.abs(Number(p.startDelta) || 0), 0)
                / Math.max(1, proposed.length);
            onLog?.(
                `ASR 起点吸附 ${applied.changed} 条`
                + `（候选 ${candidates.length} · 平均起点位移 ${Math.round(meanStart)}ms）`,
            );
        }
        return {
            ok: !!written?.ok,
            error: written?.error,
            skipped: false,
            changed: applied.changed || 0,
            attempted,
            candidates: candidates.length,
            proposed: proposed.length,
            sample: proposed.slice(0, 8).map((p) => ({
                index: p.index,
                startDelta: p.startDelta,
                endDelta: p.endDelta,
            })),
        };
    } finally {
        try { session?.cleanup?.(); } catch (_) { /* ignore */ }
    }
}

module.exports = {
    runAsrStartSnapPass,
};
