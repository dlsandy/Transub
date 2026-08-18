/**
 * QC repair — silence-split when cue text exceeds a char threshold (pure + async apply).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleQcSilence = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleQcSilenceFactory() {
    const DEFAULT_QC_SILENCE_SPLIT_CHARS = 15;
    /** Cap ffmpeg silence-detect passes per QC run (each cue may try several). */
    const DEFAULT_MAX_QC_SILENCE_SPLIT_TARGETS = 48;

    function clampQcSilenceSplitChars(raw, fallback = DEFAULT_QC_SILENCE_SPLIT_CHARS) {
        if (raw == null || String(raw).trim() === '') {
            return Math.max(0, Math.round(Number(fallback)) || DEFAULT_QC_SILENCE_SPLIT_CHARS);
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) {
            return Math.max(0, Math.round(Number(fallback)) || DEFAULT_QC_SILENCE_SPLIT_CHARS);
        }
        // 0 = disabled; upper bound keeps accidental huge values from matching everything
        return Math.max(0, Math.min(500, Math.round(n)));
    }

    function clampMaxQcSilenceSplitTargets(raw, fallback = DEFAULT_MAX_QC_SILENCE_SPLIT_TARGETS) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
            return Math.max(1, Math.round(Number(fallback)) || DEFAULT_MAX_QC_SILENCE_SPLIT_TARGETS);
        }
        return Math.max(1, Math.min(200, Math.round(n)));
    }

    function defaultTextCharCount(text) {
        return String(text || '').replace(/\s/g, '').length;
    }

    function defaultCueDurationMs(cue) {
        const start = Math.round(Number(cue?.startMs) || 0);
        const end = Math.round(Number(cue?.endMs) || 0);
        return Math.max(0, end - start);
    }

    /**
     * Editor-style eligibility (manual 静音分割): connected text needs break hints.
     */
    function canSilenceSplitCue(cue, deps = {}) {
        const text = String(cue?.text || '').trim();
        const durMs = typeof deps.getCueDurationMs === 'function'
            ? deps.getCueDurationMs(cue)
            : defaultCueDurationMs(cue);
        if (!text || durMs < 600) return false;
        const splitApi = deps.splitApi || null;
        if (splitApi?.isConnectedText?.(text)) {
            if (typeof splitApi.getSilenceTextBreakIndices !== 'function') return false;
            const breaks = splitApi.getSilenceTextBreakIndices(text, {
                breakWords: typeof deps.getBreakWords === 'function'
                    ? deps.getBreakWords()
                    : (deps.breakWords || undefined),
                includePunctuation: true,
            });
            return Array.isArray(breaks) && breaks.length > 0;
        }
        return true;
    }

    /**
     * QC auto path: only require text + enough duration. Audio silence can split
     * continuous CJK without punctuation/break-words (unlike the editor tool gate).
     */
    function canQcSilenceSplitCue(cue, deps = {}) {
        const text = String(cue?.text || '').trim();
        if (!text) return false;
        const durMs = typeof deps.getCueDurationMs === 'function'
            ? deps.getCueDurationMs(cue)
            : defaultCueDurationMs(cue);
        return durMs >= 600;
    }

    function selectQcSilenceSplitIndexes(cues, options = {}, deps = {}) {
        const maxChars = clampQcSilenceSplitChars(options.maxChars ?? options.qcSilenceSplitChars);
        if (!(maxChars > 0)) return [];
        const list = Array.isArray(cues) ? cues : [];
        const charCount = deps.textCharCount || defaultTextCharCount;
        // QC default: audio-first. Pass requireTextBreaks:true to use editor-style gate.
        const canSplit = typeof deps.canSilenceSplitCue === 'function'
            ? deps.canSilenceSplitCue
            : (options.requireTextBreaks
                ? ((cue) => canSilenceSplitCue(cue, deps))
                : ((cue) => canQcSilenceSplitCue(cue, deps)));
        const out = [];
        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            const text = String(cue?.text || '').trim();
            if (!text) continue;
            if (charCount(text) <= maxChars) continue;
            if (!canSplit(cue, i, deps)) continue;
            out.push(i);
        }
        const maxTargets = clampMaxQcSilenceSplitTargets(
            options.maxTargets ?? options.qcSilenceSplitMaxTargets,
        );
        if (out.length <= maxTargets) return out;
        out.sort((a, b) => {
            const db = charCount(list[b]?.text) - charCount(list[a]?.text);
            if (db) return db;
            const durB = defaultCueDurationMs(list[b]);
            const durA = defaultCueDurationMs(list[a]);
            if (durB !== durA) return durB - durA;
            return a - b;
        });
        return out.slice(0, maxTargets);
    }

    function summarizeQcSilenceSplit(stats = {}) {
        if (stats.skipped) {
            if (stats.reason === 'disabled') return '已跳过超长句静音分割';
            if (stats.reason === 'no_media') return '未关联视频，跳过超长句静音分割';
            if (stats.reason === 'no_targets') return '无需超长句静音分割';
            return '已跳过超长句静音分割';
        }
        const split = Number(stats.splitCount) || 0;
        const added = Number(stats.added) || 0;
        const skipped = Number(stats.skipNoSilence) || 0;
        if (!split) {
            return skipped
                ? `超长句静音分割：分析 ${Number(stats.matched) || skipped} 条，均未切出静音`
                : '超长句静音分割：无改动';
        }
        const skipHint = skipped ? `，跳过 ${skipped} 条` : '';
        return `超长句静音分割 ${split} 条(+${added})${skipHint}`;
    }

    /**
     * Apply silence splits for cues over the char threshold (mutates via splice on a working copy).
     * @param {object[]} cues
     * @param {object} options maxChars / silenceDb / silenceDur / …
     * @param {object} deps planSilenceCueSplit(cue, opts) → { cues?, cancelled?, error? }
     *   optional: onProgress({ current, total, index }), isCancelled()
     */
    async function applyQcSilenceSplits(cues, options = {}, deps = {}) {
        const maxChars = clampQcSilenceSplitChars(options.maxChars ?? options.qcSilenceSplitChars);
        if (!(maxChars > 0)) {
            return {
                cues: Array.isArray(cues) ? cues.slice() : [],
                stats: { skipped: true, reason: 'disabled', splitCount: 0, added: 0 },
            };
        }
        if (typeof deps.planSilenceCueSplit !== 'function') {
            return {
                cues: Array.isArray(cues) ? cues.slice() : [],
                stats: { skipped: true, reason: 'no_planner', splitCount: 0, added: 0 },
            };
        }

        let working = (Array.isArray(cues) ? cues : []).map((c) => ({
            startMs: c?.startMs,
            endMs: c?.endMs,
            text: c?.text ?? '',
        }));
        const matched = selectQcSilenceSplitIndexes(working, { maxChars }, deps);
        if (!matched.length) {
            return {
                cues: working,
                stats: {
                    skipped: true,
                    reason: 'no_targets',
                    matched: 0,
                    splitCount: 0,
                    added: 0,
                },
            };
        }

        const indexes = matched.slice().sort((a, b) => b - a);
        const total = indexes.length;
        let splitCount = 0;
        let added = 0;
        let skipNoSilence = 0;
        const silenceOpts = {
            silenceDb: options.silenceDb != null ? options.silenceDb : -35,
            silenceDur: options.silenceDur != null ? options.silenceDur : 0.25,
            padMs: options.padMs,
            breakWords: options.breakWords,
            maxChars,
        };

        for (let i = 0; i < indexes.length; i += 1) {
            if (typeof deps.isCancelled === 'function' && deps.isCancelled()) {
                return {
                    cues: working,
                    stats: {
                        skipped: false,
                        cancelled: true,
                        matched: total,
                        splitCount,
                        added,
                        skipNoSilence,
                        processed: i,
                    },
                };
            }
            const idx = indexes[i];
            if (typeof deps.onProgress === 'function') {
                deps.onProgress({
                    current: i + 1,
                    total,
                    index: idx,
                });
            }
            const cue = working[idx];
            if (!cue) continue;
            // Re-check after prior splices may have changed neighbors only; index still valid (desc order)
            const chars = (deps.textCharCount || defaultTextCharCount)(cue.text);
            if (chars <= maxChars) continue;

            let planned;
            try {
                planned = await deps.planSilenceCueSplit(cue, silenceOpts);
            } catch (err) {
                skipNoSilence += 1;
                continue;
            }
            if (planned?.cancelled) {
                return {
                    cues: working,
                    stats: {
                        skipped: false,
                        cancelled: true,
                        matched: total,
                        splitCount,
                        added,
                        skipNoSilence,
                        processed: i,
                    },
                };
            }
            if (!planned?.cues || planned.cues.length < 2) {
                skipNoSilence += 1;
                continue;
            }
            const nextParts = planned.cues.map((c) => ({
                startMs: c.startMs,
                endMs: c.endMs,
                text: c.text ?? '',
            }));
            working.splice(idx, 1, ...nextParts);
            splitCount += 1;
            added += nextParts.length - 1;
        }

        return {
            cues: working,
            stats: {
                skipped: false,
                matched: total,
                splitCount,
                added,
                skipNoSilence,
                maxChars,
            },
        };
    }

    return {
        DEFAULT_QC_SILENCE_SPLIT_CHARS,
        DEFAULT_MAX_QC_SILENCE_SPLIT_TARGETS,
        clampQcSilenceSplitChars,
        clampMaxQcSilenceSplitTargets,
        canSilenceSplitCue,
        canQcSilenceSplitCue,
        selectQcSilenceSplitIndexes,
        summarizeQcSilenceSplit,
        applyQcSilenceSplits,
    };
}));
