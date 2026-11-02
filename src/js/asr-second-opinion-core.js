/**
 * Batch ASR second-opinion planner (pure):
 * low-confidence + hallucination + timeline-gap windows + sibling model.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAsrSecondOpinion = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function asrSecondOpinionFactory() {
    const DEFAULT_MAX_RANGES = 6;
    /** Quality / soft-AV: more windows for Pro perceived source fix. */
    const QUALITY_MAX_RANGES = 10;
    const DEFAULT_MIN_LOW_CUES = 2;
    /** Skip micro clips that rarely yield usable SenseVoice/Whisper output. */
    const DEFAULT_MIN_RANGE_MS = 1200;
    /** Stricter than sidecar default (0.55): second opinion only for clearly weak ASR. */
    const DEFAULT_STRICT_LOW_THRESHOLD = 0.42;
    /** Inter-cue hole that may hide missed dialogue (soft / JA specialist). */
    const DEFAULT_MIN_GAP_MS = 8000;
    /** After a lexical JA turn, shorter holes still hide self-intro / answers. */
    const DEFAULT_DIALOGUE_GAP_MS = 2800;
    const DEFAULT_MAX_GAP_WINDOW_MS = 45000;
    const TARGET_BLANK_PLACEHOLDER = '…';

    let fluency = null;
    try {
        fluency = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-fluency-core')
            : null;
    } catch (_) {
        fluency = null;
    }

    /**
     * Default: auto (quality-oriented). Explicit off disables.
     * @returns {'off'|'auto'|'on'}
     */
    function normalizeAsrSecondOpinionOption(value) {
        if (value === false || value === 0) return 'off';
        const s = String(value == null ? 'auto' : value).trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'off' || s === 'no') return 'off';
        if (s === 'true' || s === '1' || s === 'on' || s === 'always') return 'on';
        if (s === 'auto') return 'auto';
        return 'auto';
    }

    function isSpeedPerfProfile(options = {}) {
        const v = String(options.perfProfile || '').trim().toLowerCase();
        return v === 'speed' || v === 'fast';
    }

    function isQualityPerfProfile(options = {}) {
        const v = String(options.perfProfile || '').trim().toLowerCase();
        return !v || v === 'quality' || v === 'balanced' || v === 'high';
    }

    function resolveAsrSecondOpinionMaxRanges(options = {}) {
        if (Number.isFinite(Number(options.maxRanges))) {
            return Math.max(1, Math.min(12, Number(options.maxRanges)));
        }
        const profile = String(options.contentProfile || options.senseProfile || '').toLowerCase();
        if (profile === 'av_soft' || isQualityPerfProfile(options)) {
            return QUALITY_MAX_RANGES;
        }
        try {
            const policy = require('./quality-pipeline-policy-core');
            if (policy?.isQualityPipelineActive?.(options)) return QUALITY_MAX_RANGES;
        } catch { /* optional */ }
        return DEFAULT_MAX_RANGES;
    }

    function shouldRunAsrSecondOpinion(options = {}) {
        const mode = normalizeAsrSecondOpinionOption(
            options.asrSecondOpinion ?? options.enabled,
        );
        if (mode === 'off') return false;
        // Speed profile skips auto extras; explicit "on" still runs.
        if (isSpeedPerfProfile(options) && mode !== 'on') return false;
        if (mode === 'on') return true;
        // auto: soft-AV / JA specialist / quality pipeline / quality perf
        const profile = String(options.contentProfile || options.senseProfile || '').toLowerCase();
        if (profile === 'av_soft') return true;
        const asr = String(options.primaryAsr || options.engineAsrModel || '').toLowerCase();
        if (/anime-whisper|whisper-ja|kotoba|reazon|qwen3-asr|ja-anime|galgame/.test(asr)) {
            return true;
        }
        if (isQualityPerfProfile(options)) return true;
        try {
            const policy = require('./quality-pipeline-policy-core');
            if (policy?.isQualityPipelineActive?.(options)) return true;
        } catch { /* optional */ }
        return false;
    }

    /**
     * Timeline gaps are soft/JA-only by default (film BGM holes false-positive easily).
     */
    function shouldIncludeTimelineGaps(options = {}) {
        if (options.includeTimelineGaps === false || options.includeTimelineGaps === 0) {
            return false;
        }
        if (options.includeTimelineGaps === true || options.includeTimelineGaps === 1) {
            return true;
        }
        const profile = String(options.contentProfile || options.senseProfile || '').toLowerCase();
        if (profile === 'av_soft') return true;
        const asr = String(options.primaryAsr || options.engineAsrModel || '').toLowerCase();
        if (/anime-whisper|whisper-ja|kotoba|reazon|qwen3-asr|ja-anime|galgame/.test(asr)) {
            return true;
        }
        return false;
    }

    function rankSecondOpinionAsrSafety(modelId) {
        const low = String(modelId || '').trim().toLowerCase();
        if (!low) return 999;
        // CT2 anime/kotoba: known ACCESS_VIOLATION after long jobs / VRAM churn — last resort.
        if (low.includes('anime-whisper') || low.includes('kotoba-whisper')) return 90;
        if (low.includes('reazon')) return 45;
        if (low.includes('whisper-ja')) return 40;
        if (low.includes('qwen3-asr')) return 25;
        if (low.includes('sensevoice') || low.includes('whisper-tiny')
            || low.includes('whisper-large') || low.includes('parakeet')
            || low.includes('cohere') || low.includes('firered-asr2')) {
            return 10;
        }
        return 50;
    }

    /**
     * anime/kotoba CT2: re-running the same weights on short windows often ACCESS_VIOLATION.
     * Prefer a safer sibling. Other backends can re-decode with the primary still loaded.
     */
    function isFragileCt2AsrForSecondOpinion(modelId) {
        const low = String(modelId || '').trim().toLowerCase();
        return low.includes('anime-whisper') || low.includes('kotoba-whisper');
    }

    function shouldReusePrimaryAsrForSecondOpinion(modelId, options = {}) {
        if (options.reusePrimary === false) return false;
        const id = String(modelId || '').trim();
        if (!id) return false;
        return !isFragileCt2AsrForSecondOpinion(id);
    }

    function isQwenAsrId(modelId) {
        return /qwen3-asr/i.test(String(modelId || ''));
    }

    /**
     * Qwen Galgame already decoded the file; empty dialogue holes need a
     * different family (Whisper large-v2 / JA), not another Qwen pass.
     */
    function shouldRunAsrDialogueGapFill(options = {}) {
        if (isSpeedPerfProfile(options)) return false;
        const asr = String(options.primaryAsr || options.engineAsrModel || '').toLowerCase();
        if (!isQwenAsrId(asr)) return false;
        const profile = String(options.contentProfile || options.senseProfile || '').toLowerCase();
        return profile === 'av_soft' || /galgame|ja-anime/.test(asr);
    }

    function rankJaDialogueGapFillAsr(modelId) {
        const low = String(modelId || '').trim().toLowerCase();
        if (!low) return 999;
        if (low.includes('anime-whisper') || low.includes('kotoba-whisper')) return 90;
        if (low.includes('qwen3-asr')) return 50;
        if (low === 'whisper-large-v2' || low.includes('whisper-large-v2')) return 1;
        if (low.includes('whisper-ja')) return 2;
        if (low.includes('whisper-large-v3') && !low.includes('turbo')) return 6;
        if (low.includes('turbo')) return 12;
        if (low.includes('sensevoice')) return 18;
        if (low.includes('whisper-tiny')) return 25;
        return rankSecondOpinionAsrSafety(low);
    }

    function listSecondOpinionAsrModels(primaryAsr, options = {}) {
        const primary = String(primaryAsr || '').trim();
        if (!primary) return [];
        let chain = Array.isArray(options.candidates) ? options.candidates.slice() : [];
        if (!chain.length && typeof options.buildCandidates === 'function') {
            try { chain = options.buildCandidates(primary) || []; } catch (_) { chain = []; }
        }
        const hasInstallFilter = Array.isArray(options.installedIds);
        const installed = hasInstallFilter
            ? new Set(options.installedIds.map((id) => String(id || '').trim().toLowerCase()).filter(Boolean))
            : null;
        const out = [];
        const seen = new Set();
        for (const raw of chain) {
            const id = String(raw || '').trim();
            if (!id) continue;
            const low = id.toLowerCase();
            if (low === primary.toLowerCase() || seen.has(low)) continue;
            if (installed && !installed.has(low)) continue;
            seen.add(low);
            out.push(id);
        }
        if (!out.length && !hasInstallFilter) {
            for (const raw of chain) {
                const id = String(raw || '').trim();
                if (!id) continue;
                const low = id.toLowerCase();
                if (low === primary.toLowerCase() || seen.has(low)) continue;
                seen.add(low);
                out.push(id);
            }
        }
        out.sort((a, b) => rankSecondOpinionAsrSafety(a) - rankSecondOpinionAsrSafety(b)
            || String(a).localeCompare(String(b)));
        const max = Number(options.maxModels);
        const cap = Number.isFinite(max) && max >= 1 ? Math.min(6, Math.round(max)) : 0;
        const siblings = cap > 0 ? out.slice(0, cap) : out;
        const reusePrimary = shouldReusePrimaryAsrForSecondOpinion(primary, options);
        if (options.gapFill === true) {
            const ranked = [...siblings].sort((a, b) => rankJaDialogueGapFillAsr(a) - rankJaDialogueGapFillAsr(b)
                || String(a).localeCompare(String(b)));
            return cap > 0 ? ranked.slice(0, cap) : ranked;
        }
        if (reusePrimary) {
            const plow = primary.toLowerCase();
            if (!installed || installed.has(plow)) {
                const rest = siblings.filter((id) => id.toLowerCase() !== plow);
                const combined = [primary, ...rest];
                return cap > 0 ? combined.slice(0, cap) : combined;
            }
        }
        return siblings;
    }

    function pickSecondOpinionAsrModel(primaryAsr, options = {}) {
        const list = listSecondOpinionAsrModels(primaryAsr, options);
        return list[0] || '';
    }

    function pickSecondOpinionAsrModelForRange(range, primaryAsr, opinionModels, options = {}) {
        const models = Array.isArray(opinionModels) ? opinionModels : [];
        if (!models.length) return '';
        const src = String(range?.source || range?.kind || '');
        const isGap = src === 'gap' || src === 'dialogue_gap' || range?.allowEmpty === true;
        if (!isGap) return models[0] || '';
        const primary = String(primaryAsr || '').trim().toLowerCase();
        const gapList = listSecondOpinionAsrModels(primaryAsr, {
            ...options,
            gapFill: true,
            candidates: models,
            reusePrimary: false,
        });
        const hit = gapList.find((id) => String(id || '').toLowerCase() !== primary);
        return hit || models.find((id) => String(id || '').toLowerCase() !== primary) || models[0] || '';
    }

    /**
     * Prefer second-opinion cues when primary window is empty/garbage or much shorter.
     */
    function chooseSecondOpinionWinner(primaryCues, opinionCues, options = {}) {
        const primary = (Array.isArray(primaryCues) ? primaryCues : [])
            .map((c) => ({ ...c, text: String(c?.text || '').trim() }))
            .filter((c) => c.text);
        const opinion = (Array.isArray(opinionCues) ? opinionCues : [])
            .map((c) => ({ ...c, text: String(c?.text || '').trim() }))
            .filter((c) => c.text);
        if (!opinion.length) {
            return { useOpinion: false, reason: 'opinion_empty', cues: primary };
        }
        if (!primary.length) {
            return { useOpinion: true, reason: 'primary_empty', cues: opinion };
        }
        const pChars = primary.reduce((n, c) => n + Array.from(c.text.replace(/\s+/g, '')).length, 0);
        const oChars = opinion.reduce((n, c) => n + Array.from(c.text.replace(/\s+/g, '')).length, 0);
        const pJoined = primary.map((c) => c.text).join('');
        const oJoined = opinion.map((c) => c.text).join('');
        if (pChars <= 2 && oChars >= 4) {
            return { useOpinion: true, reason: 'primary_scrap', cues: opinion };
        }
        if (isScrapOrLoopText(pJoined) && oChars >= 4 && !isScrapOrLoopText(oJoined)) {
            return { useOpinion: true, reason: 'primary_scrap_clean_opinion', cues: opinion };
        }
        if (pChars >= 2 && oChars >= Math.max(6, Math.ceil(pChars * 1.6))) {
            return { useOpinion: true, reason: 'opinion_richer', cues: opinion };
        }
        if (/(.)\1{5,}/.test(pJoined) && oChars >= 4) {
            return { useOpinion: true, reason: 'primary_loop', cues: opinion };
        }
        if (options.preferOpinion === true && oChars >= pChars) {
            return { useOpinion: true, reason: 'prefer_opinion', cues: opinion };
        }
        return { useOpinion: false, reason: 'keep_primary', cues: primary };
    }

    /**
     * Heuristic kept primary but texts differ — worth a Laya Choice.
     */
    function isAmbiguousSecondOpinionKeep(winner, primaryCues, opinionCues) {
        if (!winner || winner.useOpinion) return false;
        if (String(winner.reason || '') !== 'keep_primary') return false;
        const primary = (Array.isArray(primaryCues) ? primaryCues : [])
            .map((c) => String(c?.text || '').trim())
            .filter(Boolean);
        const opinion = (Array.isArray(opinionCues) ? opinionCues : [])
            .map((c) => String(c?.text || '').trim())
            .filter(Boolean);
        if (!primary.length || !opinion.length) return false;
        const pJoined = primary.join('\n');
        const oJoined = opinion.join('\n');
        if (pJoined === oJoined) return false;
        // Near-identical after whitespace collapse → not ambiguous
        if (pJoined.replace(/\s+/g, '') === oJoined.replace(/\s+/g, '')) return false;
        return true;
    }

    function getJevDecisionApi() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./jev-decision-core')
                : (typeof globalThis !== 'undefined' && globalThis.TransubJevDecision);
        } catch {
            return null;
        }
    }

    /**
     * Build System One Choice questions for ambiguous ASR windows.
     * @param {Array<{ id?: string, primaryText: string, opinionText: string, startMs?: number, endMs?: number }>} windows
     */
    function buildSecondOpinionJevRequest(windows) {
        const jev = getJevDecisionApi();
        const list = Array.isArray(windows) ? windows : [];
        const items = [];
        const questions = {};
        const stateWindows = [];
        list.forEach((w, i) => {
            const id = String(w?.id || `w${i}`);
            const primaryText = String(w?.primaryText || '').trim();
            const opinionText = String(w?.opinionText || '').trim();
            if (!primaryText || !opinionText || primaryText === opinionText) return;
            const clip = jev?.clipForDecision
                ? (t) => jev.clipForDecision(t, 240)
                : (t) => String(t).slice(0, 240);
            const pClip = clip(primaryText);
            const oClip = clip(opinionText);
            items.push({
                id,
                primaryText,
                opinionText,
                startMs: w.startMs,
                endMs: w.endMs,
            });
            stateWindows.push({
                id,
                primary: pClip,
                opinion: oClip,
                startMs: w.startMs,
                endMs: w.endMs,
            });
            const q = jev?.buildChoiceQuestion
                ? jev.buildChoiceQuestion({
                    instructions: [
                        'Two ASR transcripts cover the same audio window.',
                        'Pick which is more accurate and complete for spoken dialogue',
                        '(prefer real speech over scrap, loops, or hallucinated filler).',
                        `Primary:\n${pClip}`,
                        `Second opinion:\n${oClip}`,
                    ].join('\n'),
                    criteria: {
                        primary: 'Keep the primary ASR transcript',
                        opinion: 'Use the second-opinion ASR transcript',
                    },
                })
                : {
                    type: 'choice',
                    instructions: `Pick better ASR. Primary:\n${pClip}\nOpinion:\n${oClip}`,
                    criteria: {
                        primary: 'Keep primary',
                        opinion: 'Use second opinion',
                    },
                };
            questions[id] = q;
        });
        return {
            state: {
                task: 'asr_second_opinion_winner',
                windows: stateWindows,
            },
            questions,
            items,
        };
    }

    function partitionSecondOpinionJevAnswers(answers, windows, minConfidence) {
        const jev = getJevDecisionApi();
        const list = Array.isArray(windows) ? windows : [];
        if (jev?.partitionBinaryChoices) {
            const part = jev.partitionBinaryChoices(answers, list, {
                minConfidence,
                acceptChoices: ['opinion'],
                rejectChoices: ['primary'],
                idOf: (item, i) => String(item?.id || `w${i}`),
            });
            return {
                useOpinion: part.accept,
                keepPrimary: part.reject,
                undecided: part.undecided,
                decided: part.decided,
            };
        }
        return {
            useOpinion: [],
            keepPrimary: [],
            undecided: list,
            decided: 0,
        };
    }

    function isScrapOrLoopText(text) {
        const t = String(text || '').trim();
        if (!t) return true;
        const compact = t.replace(/\s+/g, '');
        if (Array.from(compact).length <= 2) return true;
        if (/(.)\1{4,}/u.test(compact)) return true;
        if (/^[….·・\-—\s]+$/u.test(t)) return true;
        return false;
    }

    function looksHallucinationOrWeird(text) {
        if (isScrapOrLoopText(text)) return true;
        try {
            // Hot path: avoid full analyzeTextFluency per cue — looksLikeWeird + scrap checks suffice.
            if (fluency?.looksLikeWeirdCueText?.(text)) return true;
        } catch (_) { /* optional */ }
        return false;
    }

    /**
     * Gate second opinion to low-confidence cues that also look product-risky.
     */
    function isSecondOpinionRiskCue(text, annotation = {}, options = {}) {
        const strict = Math.max(
            0.05,
            Math.min(0.9, Number(options.strictThreshold) || DEFAULT_STRICT_LOW_THRESHOLD),
        );
        const conf = Number(annotation?.confidence);
        const flags = Array.isArray(annotation?.flags) ? annotation.flags.map(String) : [];
        if (Number.isFinite(conf) && conf < strict) return true;
        if (!annotation?.low && !(Number.isFinite(conf) && conf < 0.55)) return false;
        if (flags.some((f) => /weird|repetition|stutter|fragment|low_logprob|low_score|hallucin|duplicate/i.test(f))) {
            return true;
        }
        return looksHallucinationOrWeird(text);
    }

    /**
     * Hallucination / loop indexes — do not require sidecar low confidence.
     */
    function findHallucinationRiskIndexes(cues, annotations, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const anns = Array.isArray(annotations) ? annotations : [];
        const out = [];
        for (let i = 0; i < list.length; i += 1) {
            const text = list[i]?.text;
            const ann = anns[i] || {};
            const flags = Array.isArray(ann.flags) ? ann.flags.map(String) : [];
            if (flags.some((f) => /hallucin|repetition|duplicate|stutter/i.test(f))) {
                out.push(i);
                continue;
            }
            if (looksHallucinationOrWeird(text)) out.push(i);
        }
        if (options.maxHallucIndexes != null) {
            const max = Math.max(0, Math.min(40, Number(options.maxHallucIndexes) || 0));
            return out.slice(0, max);
        }
        return out;
    }

    function selectSecondOpinionIndexes(cues, lowConfidenceIndexes, annotations, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const anns = Array.isArray(annotations) ? annotations : [];
        const lowIndexes = [...new Set((Array.isArray(lowConfidenceIndexes) ? lowConfidenceIndexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0 && n < list.length))]
            .sort((a, b) => a - b);
        return lowIndexes.filter((idx) => isSecondOpinionRiskCue(
            list[idx]?.text,
            anns[idx] || {},
            options,
        ));
    }

    function jaCueLooksLexicalDialogue(text) {
        const t = String(text || '').replace(/\s+/g, '');
        if (!t) return false;
        if (/(です|ます|ですか|ですね|出身|自己|紹介|じゃない|センチ|けど)/.test(t)) return true;
        let kanji = 0;
        for (const ch of t) {
            const c = ch.codePointAt(0);
            if (c >= 0x4e00 && c <= 0x9fff) kanji += 1;
        }
        return kanji >= 2;
    }

    function jaCueLooksMoanSfx(text) {
        const t = String(text || '').replace(/[。．.!！?？、,\s…·・♪[\]\-—]+/g, '');
        if (!t) return true;
        const moan = 'んンぁァあアっッはぁハふフぅゥうウー〜～';
        let n = 0;
        for (const ch of t) {
            if (moan.includes(ch)) n += 1;
        }
        return n / t.length >= 0.55;
    }

    function clampGapWindow(startMs, endMs, options = {}) {
        const minMs = Math.max(
            400,
            Math.min(5000, Number(options.minRangeMs) || DEFAULT_MIN_RANGE_MS),
        );
        const maxMs = Math.max(
            minMs,
            Math.min(120000, Number(options.maxGapWindowMs) || DEFAULT_MAX_GAP_WINDOW_MS),
        );
        let start = Math.max(0, Number(startMs) || 0);
        let end = Math.max(start + 1, Number(endMs) || start + 1);
        let dur = end - start;
        if (dur < minMs) return null;
        if (dur > maxMs) {
            // Keep the middle of the hole — dialogue often sits away from edges.
            const mid = start + dur / 2;
            start = Math.max(0, Math.round(mid - maxMs / 2));
            end = start + maxMs;
            dur = maxMs;
        }
        return {
            startMs: start,
            endMs: end,
            durationMs: dur,
            indexes: [],
            kind: 'gap',
            allowEmpty: true,
            source: 'gap',
        };
    }

    /**
     * Large inter-cue (and optional lead/trail) holes — miss-dialogue suspects.
     */
    function findTimelineGapWindows(cues, mediaDurationMs, options = {}) {
        const list = (Array.isArray(cues) ? cues : [])
            .map((c, i) => ({
                i,
                startMs: Number(c?.startMs) || 0,
                endMs: Math.max(Number(c?.startMs) || 0, Number(c?.endMs) || 0),
                text: String(c?.text || ''),
            }))
            .filter((c) => c.endMs > c.startMs)
            .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
        if (!list.length) return [];

        const minGap = Math.max(
            3000,
            Math.min(60000, Number(options.minGapMs) || DEFAULT_MIN_GAP_MS),
        );
        const dialogueGap = Math.max(
            1200,
            Math.min(minGap, Number(options.dialogueGapMs) || DEFAULT_DIALOGUE_GAP_MS),
        );
        const mediaMs = Math.max(
            0,
            Number(mediaDurationMs) || list[list.length - 1].endMs,
        );
        const out = [];

        const lead = clampGapWindow(0, list[0].startMs, options);
        if (lead && list[0].startMs >= minGap) out.push(lead);

        for (let i = 0; i < list.length - 1; i += 1) {
            const gapStart = list[i].endMs;
            const gapEnd = list[i + 1].startMs;
            const gapDur = gapEnd - gapStart;
            const prevLexical = jaCueLooksLexicalDialogue(list[i].text)
                && !jaCueLooksMoanSfx(list[i].text);
            const nextLexical = jaCueLooksLexicalDialogue(list[i + 1].text)
                && !jaCueLooksMoanSfx(list[i + 1].text);
            const need = (prevLexical || nextLexical) ? dialogueGap : minGap;
            if (gapDur < need) continue;
            const win = clampGapWindow(gapStart, gapEnd, options);
            if (win) {
                win.source = (prevLexical || nextLexical) ? 'dialogue_gap' : 'gap';
                out.push(win);
            }
        }

        const trailStart = list[list.length - 1].endMs;
        if (mediaMs - trailStart >= minGap) {
            const trail = clampGapWindow(trailStart, mediaMs, options);
            if (trail) out.push(trail);
        }

        const maxGaps = Math.max(0, Math.min(12, Number(options.maxGapWindows) || 6));
        return out.slice(0, maxGaps);
    }

    function shouldSkipSecondOpinionRange(range, cues, options = {}) {
        const minMs = Math.max(
            400,
            Math.min(5000, Number(options.minRangeMs) || DEFAULT_MIN_RANGE_MS),
        );
        const startMs = Number(range?.startMs) || 0;
        const endMs = Number(range?.endMs) || startMs;
        const durationMs = Number(range?.durationMs);
        const dur = Number.isFinite(durationMs) && durationMs > 0
            ? durationMs
            : Math.max(0, endMs - startMs);
        if (dur > 0 && dur < minMs) {
            return { skip: true, reason: 'too_short', durationMs: dur, minRangeMs: minMs };
        }
        const allowEmpty = range?.allowEmpty === true
            || range?.kind === 'gap'
            || range?.source === 'gap';
        const indexes = Array.isArray(range?.indexes) ? range.indexes : [];
        const list = Array.isArray(cues) ? cues : [];
        const slice = indexes.length
            ? indexes.map((i) => list[i]).filter(Boolean)
            : list.filter((c) => {
                const s = Number(c?.startMs) || 0;
                const e = Number(c?.endMs) || s;
                return s < endMs && e > startMs;
            });
        const texts = slice.map((c) => String(c?.text || '').trim()).filter(Boolean);
        if (!texts.length) {
            if (allowEmpty) {
                return { skip: false, durationMs: dur, minRangeMs: minMs, emptyGap: true };
            }
            return { skip: true, reason: 'empty_window', durationMs: dur, minRangeMs: minMs };
        }
        if (texts.every((t) => isScrapOrLoopText(t)) && dur < minMs * 1.5) {
            return { skip: true, reason: 'scrap_short', durationMs: dur, minRangeMs: minMs };
        }
        return { skip: false, durationMs: dur, minRangeMs: minMs };
    }

    function filterSecondOpinionRanges(ranges, cues, options = {}) {
        const kept = [];
        const skipped = [];
        for (const range of Array.isArray(ranges) ? ranges : []) {
            const decision = shouldSkipSecondOpinionRange(range, cues, options);
            if (decision.skip) skipped.push({ ...range, skipReason: decision.reason });
            else kept.push(range);
        }
        return { ranges: kept, skipped };
    }

    function listOverlappingCueIndexes(cues, startMs, endMs) {
        const start = Number(startMs) || 0;
        const end = Math.max(start + 1, Number(endMs) || start + 1);
        const out = [];
        (Array.isArray(cues) ? cues : []).forEach((c, i) => {
            const s = Number(c?.startMs) || 0;
            const e = Number(c?.endMs) || s;
            if (s < end && e > start) out.push(i);
        });
        return out;
    }

    function blankTargetCuesForRanges(targetCues, ranges, options = {}) {
        const placeholder = String(options.placeholder || TARGET_BLANK_PLACEHOLDER);
        const list = (Array.isArray(targetCues) ? targetCues : []).map((c) => ({ ...c }));
        const blanked = new Set();
        for (const range of Array.isArray(ranges) ? ranges : []) {
            for (const idx of listOverlappingCueIndexes(list, range.startMs, range.endMs)) {
                const cur = String(list[idx]?.text || '').trim();
                if (!cur || cur === placeholder || cur === '...' || cur === '…') continue;
                list[idx] = { ...list[idx], text: placeholder };
                blanked.add(idx);
            }
        }
        return {
            cues: list,
            blankedCount: blanked.size,
            blankedIndexes: [...blanked].sort((a, b) => a - b),
            placeholder,
        };
    }

    function rangesFromIndexes(list, indexes, options = {}) {
        const maxRanges = resolveAsrSecondOpinionMaxRanges(options);
        if (typeof options.buildRanges === 'function') {
            return options.buildRanges(list, indexes, {
                maxRanges,
                maxDurationSec: options.maxDurationSec || 45,
                mergeAdjacentGapMs: options.mergeAdjacentGapMs || 800,
            }) || [];
        }
        return indexes.slice(0, maxRanges).map((idx) => {
            const c = list[idx];
            const startMs = Number(c?.startMs) || 0;
            const endMs = Number(c?.endMs) || startMs + 1000;
            return {
                startMs,
                endMs,
                indexes: [idx],
                durationMs: Math.max(200, endMs - startMs),
                kind: 'cue',
                source: 'cue',
            };
        });
    }

    function tagRanges(ranges, source, priority) {
        return (Array.isArray(ranges) ? ranges : []).map((r) => ({
            ...r,
            source,
            kind: source,
            priority: r.priority != null ? r.priority : priority,
        }));
    }

    function mergeRangesByPriority(groups, maxRanges) {
        const capped = Math.max(1, Math.min(12, maxRanges));
        const out = [];
        const covered = [];
        const overlaps = (a, b) => a.startMs < b.endMs && b.startMs < a.endMs;
        for (const group of groups) {
            for (const range of group) {
                if (out.length >= capped) break;
                if (covered.some((c) => overlaps(c, range))) continue;
                out.push(range);
                covered.push(range);
            }
            if (out.length >= capped) break;
        }
        return out.slice(0, capped);
    }

    /**
     * @returns {{ ok: boolean, ranges: object[], lowIndexes: number[], reason?: string, maxRanges: number }}
     */
    function planAsrSecondOpinion(cues, lowConfidenceIndexes, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const maxRanges = resolveAsrSecondOpinionMaxRanges(options);
        const minLow = Math.max(1, Math.min(20, Number(options.minLowCues) || DEFAULT_MIN_LOW_CUES));
        const annotations = Array.isArray(options.annotations) ? options.annotations : null;
        const rawLow = [...new Set((Array.isArray(lowConfidenceIndexes) ? lowConfidenceIndexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0 && n < list.length))]
            .sort((a, b) => a - b);

        const hallucIndexesRaw = findHallucinationRiskIndexes(list, annotations || [], options);
        const lowIndexes = annotations
            ? selectSecondOpinionIndexes(list, rawLow, annotations, options)
            : rawLow;

        const bandByIndex = options.bandByIndex || options.cueRiskBands || null;
        const riskOnly = options.secondOpinionRiskOnly !== false && !!bandByIndex
            && typeof bandByIndex === 'object';
        const orderByBand = (indexes) => {
            if (!bandByIndex || typeof bandByIndex !== 'object') {
                return [...indexes].sort((a, b) => a - b);
            }
            const red = [];
            const yellow = [];
            const other = [];
            for (const idx of indexes) {
                const b = bandByIndex[idx] ?? bandByIndex[String(idx)];
                if (b === 'red') red.push(idx);
                else if (b === 'yellow') yellow.push(idx);
                else other.push(idx);
            }
            // Prefer risk bands; only fall back to green/other when risk set is empty.
            if (riskOnly && (red.length || yellow.length)) {
                return [
                    ...red.sort((a, b) => a - b),
                    ...yellow.sort((a, b) => a - b),
                ];
            }
            return [
                ...red.sort((a, b) => a - b),
                ...yellow.sort((a, b) => a - b),
                ...other.sort((a, b) => a - b),
            ];
        };

        const hallucIndexes = orderByBand(hallucIndexesRaw);
        const hallucSet = new Set(hallucIndexes);
        const lowOnly = orderByBand(lowIndexes.filter((i) => !hallucSet.has(i)));

        const gapWindows = (shouldIncludeTimelineGaps(options) || options.gapOnly === true)
            ? findTimelineGapWindows(list, options.mediaDurationMs, options)
            : [];
        const dialogueGaps = gapWindows.filter((g) => g.source === 'dialogue_gap');

        if (options.gapOnly === true) {
            if (!dialogueGaps.length) {
                return {
                    ok: false,
                    ranges: [],
                    lowIndexes,
                    hallucIndexes: [],
                    gapWindowCount: gapWindows.length,
                    rawLowIndexes: rawLow,
                    reason: 'no_dialogue_gaps',
                    maxRanges,
                };
            }
            const gapRanges = tagRanges(dialogueGaps, 'dialogue_gap', 1);
            const filteredOnly = filterSecondOpinionRanges(gapRanges, list, options);
            const rangesOnly = filteredOnly.ranges;
            if (!rangesOnly.length) {
                return {
                    ok: false,
                    ranges: [],
                    lowIndexes,
                    hallucIndexes: [],
                    gapWindowCount: dialogueGaps.length,
                    rawLowIndexes: rawLow,
                    skippedRanges: filteredOnly.skipped,
                    reason: filteredOnly.skipped.length ? 'ranges_too_short' : 'no_ranges',
                    maxRanges,
                };
            }
            return {
                ok: true,
                ranges: rangesOnly,
                lowIndexes,
                hallucIndexes: [],
                gapWindowCount: dialogueGaps.length,
                rawLowIndexes: rawLow,
                skippedRanges: filteredOnly.skipped,
                maxRanges,
                planStats: {
                    hallucCueCount: 0,
                    riskyLowCueCount: 0,
                    gapWindowCount: dialogueGaps.length,
                    scheduledRanges: rangesOnly.length,
                    gapOnly: true,
                },
            };
        }

        const enoughLow = lowIndexes.length >= minLow;
        const hasHalluc = hallucIndexes.length > 0;
        const hasGaps = gapWindows.length > 0;

        if (!enoughLow && !hasHalluc && !hasGaps) {
            return {
                ok: false,
                ranges: [],
                lowIndexes,
                hallucIndexes,
                gapWindowCount: 0,
                rawLowIndexes: rawLow,
                reason: annotations && rawLow.length >= minLow
                    ? 'few_risky_low_cues'
                    : 'few_sources',
                maxRanges,
            };
        }

        // Cap windows by risk signal when bands are available (save GPU).
        let effectiveMax = maxRanges;
        if (riskOnly) {
            let redN = 0;
            let yellowN = 0;
            for (const key of Object.keys(bandByIndex)) {
                const b = bandByIndex[key];
                if (b === 'red') redN += 1;
                else if (b === 'yellow') yellowN += 1;
            }
            const riskCap = Math.max(2, Math.min(maxRanges, redN + Math.ceil(yellowN / 2) + (hasHalluc ? 1 : 0) + (hasGaps ? 1 : 0)));
            effectiveMax = Math.min(maxRanges, riskCap);
        }

        // Priority: hallucination → dialogue holes → risky low → long gaps.
        const hallucRanges = tagRanges(
            rangesFromIndexes(list, hallucIndexes, { ...options, maxRanges: effectiveMax }),
            'hallucination',
            1,
        );
        const lowRanges = tagRanges(
            rangesFromIndexes(list, lowOnly, { ...options, maxRanges: effectiveMax }),
            'low_confidence',
            2,
        );
        const dialogueGapRanges = tagRanges(dialogueGaps, 'dialogue_gap', 1);
        const otherGapRanges = tagRanges(
            gapWindows.filter((g) => g.source !== 'dialogue_gap'),
            'gap',
            3,
        );

        let ranges = mergeRangesByPriority(
            [hallucRanges, dialogueGapRanges, lowRanges, otherGapRanges],
            effectiveMax,
        );
        const filtered = filterSecondOpinionRanges(ranges, list, options);
        ranges = filtered.ranges;

        if (!ranges.length) {
            return {
                ok: false,
                ranges: [],
                lowIndexes,
                hallucIndexes,
                gapWindowCount: gapWindows.length,
                rawLowIndexes: rawLow,
                skippedRanges: filtered.skipped,
                reason: filtered.skipped.length ? 'ranges_too_short' : 'no_ranges',
                maxRanges,
            };
        }

        return {
            ok: true,
            ranges,
            lowIndexes,
            hallucIndexes,
            gapWindowCount: gapWindows.length,
            rawLowIndexes: rawLow,
            skippedRanges: filtered.skipped,
            maxRanges,
            planStats: {
                hallucCueCount: hallucIndexes.length,
                riskyLowCueCount: lowIndexes.length,
                gapWindowCount: gapWindows.length,
                scheduledRanges: ranges.length,
            },
        };
    }

    return {
        DEFAULT_MAX_RANGES,
        QUALITY_MAX_RANGES,
        DEFAULT_MIN_LOW_CUES,
        DEFAULT_MIN_RANGE_MS,
        DEFAULT_STRICT_LOW_THRESHOLD,
        DEFAULT_MIN_GAP_MS,
        DEFAULT_DIALOGUE_GAP_MS,
        DEFAULT_MAX_GAP_WINDOW_MS,
        TARGET_BLANK_PLACEHOLDER,
        normalizeAsrSecondOpinionOption,
        isSpeedPerfProfile,
        isQualityPerfProfile,
        resolveAsrSecondOpinionMaxRanges,
        shouldRunAsrSecondOpinion,
        shouldRunAsrDialogueGapFill,
        shouldIncludeTimelineGaps,
        pickSecondOpinionAsrModel,
        pickSecondOpinionAsrModelForRange,
        listSecondOpinionAsrModels,
        rankSecondOpinionAsrSafety,
        rankJaDialogueGapFillAsr,
        isFragileCt2AsrForSecondOpinion,
        shouldReusePrimaryAsrForSecondOpinion,
        chooseSecondOpinionWinner,
        isAmbiguousSecondOpinionKeep,
        buildSecondOpinionJevRequest,
        partitionSecondOpinionJevAnswers,
        isScrapOrLoopText,
        isSecondOpinionRiskCue,
        findHallucinationRiskIndexes,
        jaCueLooksLexicalDialogue,
        jaCueLooksMoanSfx,
        findTimelineGapWindows,
        selectSecondOpinionIndexes,
        shouldSkipSecondOpinionRange,
        filterSecondOpinionRanges,
        listOverlappingCueIndexes,
        blankTargetCuesForRanges,
        planAsrSecondOpinion,
    };
}));
