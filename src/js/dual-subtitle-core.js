/**
 * 双语字幕：命名、配对、时间重叠对齐（浏览器与 Node 测试共用）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubDualSubtitle = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function dualSubtitleCoreFactory() {
    const SOURCE_SUFFIXES = new Set(['source', 'ja', 'zh', 'en']);
    const TARGET_SUFFIX_DEFAULT = 'zh';
    const DISPLAY_MODES = new Set(['both', 'source', 'target']);
    const PRIMARY_TRACKS = new Set(['source', 'target']);
    const LINE_ORDERS = new Set(['source-first', 'target-first']);

    function resolveDualSourceSuffix(language, targetSuffix = TARGET_SUFFIX_DEFAULT) {
        const lang = String(language || 'auto').trim().toLowerCase();
        const tgt = normalizeDualTargetSuffix(targetSuffix);
        let src = 'source';
        if (lang === 'ja' || lang === 'zh' || lang === 'en') src = lang;
        // 避免原文/译文同后缀互相覆盖（如源语言选中文时）
        if (src === tgt) return 'source';
        return src;
    }

    function normalizeDualTargetSuffix(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return TARGET_SUFFIX_DEFAULT;
        if (/^[a-z]{2,8}$/.test(raw)) return raw;
        return TARGET_SUFFIX_DEFAULT;
    }

    function normalizeDualDisplayMode(value) {
        const mode = String(value || '').trim().toLowerCase();
        return DISPLAY_MODES.has(mode) ? mode : 'both';
    }

    function normalizeDualPrimaryTrack(value) {
        const track = String(value || '').trim().toLowerCase();
        return PRIMARY_TRACKS.has(track) ? track : 'target';
    }

    function normalizeDualLineOrder(value) {
        const order = String(value || '').trim().toLowerCase();
        if (order === 'target-first' || order === 'target') return 'target-first';
        if (order === 'source-first' || order === 'source') return 'source-first';
        return LINE_ORDERS.has(order) ? order : 'source-first';
    }

    /**
     * Parse `{videoStem}.{suffix}` from a subtitle basename (without ext).
     * @returns {{ videoStem: string, suffix: string|null }}
     */
    function parseSubtitleStemParts(subtitleBasenameNoExt, videoStem) {
        const name = String(subtitleBasenameNoExt || '');
        const stem = String(videoStem || '');
        if (!name) return { videoStem: '', suffix: null };
        if (stem && name === stem) {
            return { videoStem: stem, suffix: null };
        }
        if (stem && name.startsWith(`${stem}.`)) {
            const rest = name.slice(stem.length + 1);
            const first = rest.split('.')[0] || '';
            if (SOURCE_SUFFIXES.has(first) || first === TARGET_SUFFIX_DEFAULT) {
                return { videoStem: stem, suffix: first };
            }
            // e.g. demo.zh.srt → suffix zh
            if (/^[a-z]{2,8}$/i.test(first)) {
                return { videoStem: stem, suffix: first.toLowerCase() };
            }
            return { videoStem: stem, suffix: null };
        }
        // No video stem: try last dotted tag
        const parts = name.split('.');
        if (parts.length >= 2) {
            const maybe = parts[parts.length - 1].toLowerCase();
            if (SOURCE_SUFFIXES.has(maybe) || /^[a-z]{2,8}$/.test(maybe)) {
                return {
                    videoStem: parts.slice(0, -1).join('.'),
                    suffix: maybe,
                };
            }
        }
        return { videoStem: name, suffix: null };
    }

    function buildSuffixedSubtitlePath(dir, videoStem, suffix, ext) {
        const cleanExt = String(ext || 'srt').replace(/^\./, '').toLowerCase();
        const tag = String(suffix || '').trim().toLowerCase();
        if (!tag) return `${dir}/${videoStem}.${cleanExt}`.replace(/\\/g, '/');
        return `${dir}/${videoStem}.${tag}.${cleanExt}`.replace(/\\/g, '/');
    }

    /**
     * Build expected dual paths for one format (posix-ish join; callers may re-join with path).
     */
    function buildDualPathPair(dir, videoStem, {
        sourceSuffix = 'source',
        targetSuffix = TARGET_SUFFIX_DEFAULT,
        format = 'srt',
    } = {}) {
        const ext = String(format || 'srt').replace(/^\./, '').toLowerCase();
        const src = String(sourceSuffix || 'source').toLowerCase();
        const tgt = normalizeDualTargetSuffix(targetSuffix);
        return {
            sourcePath: `${dir}/${videoStem}.${src}.${ext}`.replace(/\\/g, '/'),
            targetPath: `${dir}/${videoStem}.${tgt}.${ext}`.replace(/\\/g, '/'),
            sourceSuffix: src,
            targetSuffix: tgt,
            format: ext,
        };
    }

    /**
     * Infer role of an open subtitle file and its sibling pair basename.
     * @returns {{ role: 'source'|'target'|null, pairSuffix: string|null, suffix: string|null, videoStem: string }}
     */
    function inferDualRole(subtitleBasenameNoExt, videoStem, {
        sourceSuffix = 'source',
        targetSuffix = TARGET_SUFFIX_DEFAULT,
    } = {}) {
        const { videoStem: stem, suffix } = parseSubtitleStemParts(subtitleBasenameNoExt, videoStem);
        const src = String(sourceSuffix || 'source').toLowerCase();
        const tgt = normalizeDualTargetSuffix(targetSuffix);
        if (!suffix) {
            return { role: null, pairSuffix: null, suffix: null, videoStem: stem };
        }
        if (suffix === tgt) {
            return { role: 'target', pairSuffix: src, suffix, videoStem: stem };
        }
        // zh 在 SOURCE_SUFFIXES 中，但作为译文后缀时已在上方处理
        if (suffix === src || suffix === 'source' || suffix === 'ja' || suffix === 'en'
            || (SOURCE_SUFFIXES.has(suffix) && suffix !== tgt)) {
            return { role: 'source', pairSuffix: tgt, suffix, videoStem: stem };
        }
        // Unknown lang tag: assume source, pair with zh
        return { role: 'source', pairSuffix: tgt, suffix, videoStem: stem };
    }

    /**
     * Candidate suffixes to try when locating the complementary dual file.
     * Opening `.zh.srt` should also find `.ja.srt` / `.en.srt`, not only `.source.srt`.
     */
    function listPairSuffixCandidates(role, preferredSuffix, targetSuffix = TARGET_SUFFIX_DEFAULT) {
        const tgt = normalizeDualTargetSuffix(targetSuffix);
        const preferred = String(preferredSuffix || '').trim().toLowerCase();
        if (role === 'target') {
            const list = [preferred, 'source', 'ja', 'en'].filter((s) => s && s !== tgt);
            return [...new Set(list)];
        }
        const list = [preferred || tgt, tgt, 'zh'].filter(Boolean);
        return [...new Set(list)];
    }

    /**
     * Find cue in `cues` with maximum time overlap against [startMs, endMs].
     * If no overlap, fall back to nearest start within maxStartGapMs.
     * @returns {{ index: number, cue: object|null, overlapMs: number, match: 'overlap'|'nearest'|'none' }}
     */
    function findBestOverlapCue(cues, startMs, endMs, { maxStartGapMs = 2500 } = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const a0 = Number(startMs) || 0;
        const a1 = Math.max(a0, Number(endMs) || a0);
        let bestIdx = -1;
        let bestOverlap = 0;
        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            const b0 = Number(cue?.startMs) || 0;
            const b1 = Math.max(b0, Number(cue?.endMs) || b0);
            const overlap = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
            if (overlap > bestOverlap) {
                bestOverlap = overlap;
                bestIdx = i;
            }
        }
        if (bestIdx >= 0 && bestOverlap > 0) {
            return { index: bestIdx, cue: list[bestIdx], overlapMs: bestOverlap, match: 'overlap' };
        }

        const gapLimit = Math.max(0, Number(maxStartGapMs) || 0);
        if (gapLimit > 0 && list.length) {
            let nearIdx = -1;
            let nearGap = Infinity;
            for (let i = 0; i < list.length; i += 1) {
                const b0 = Number(list[i]?.startMs) || 0;
                const gap = Math.abs(b0 - a0);
                if (gap < nearGap) {
                    nearGap = gap;
                    nearIdx = i;
                }
            }
            if (nearIdx >= 0 && nearGap <= gapLimit) {
                return {
                    index: nearIdx,
                    cue: list[nearIdx],
                    overlapMs: 0,
                    match: 'nearest',
                };
            }
        }

        return { index: -1, cue: null, overlapMs: 0, match: 'none' };
    }

    /**
     * Pick complementary dual sidecar path from a list of editable sidecars.
     * @returns {string|null}
     */
    function findComplementarySidecarPath(primaryPath, videoStem, sidecars, {
        primaryRole = null,
        preferredPairSuffix = '',
        targetSuffix = TARGET_SUFFIX_DEFAULT,
    } = {}) {
        const list = Array.isArray(sidecars) ? sidecars : [];
        const primary = String(primaryPath || '');
        const stem = String(videoStem || '');
        const inferred = primaryRole
            ? { role: primaryRole, pairSuffix: preferredPairSuffix, videoStem: stem }
            : inferDualRole(
                primary.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, ''),
                stem,
                { targetSuffix },
            );
        if (!inferred.role) return null;

        const candidates = listPairSuffixCandidates(
            inferred.role,
            inferred.pairSuffix || preferredPairSuffix,
            targetSuffix,
        );
        const stemLower = (inferred.videoStem || stem).toLowerCase();

        for (const suffix of candidates) {
            const expected = `${stemLower}.${suffix}`.toLowerCase();
            const hit = list.find((s) => {
                const p = String(s?.path || s || '');
                if (!p || p === primary) return false;
                const base = p.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '');
                return base.toLowerCase() === expected;
            });
            if (hit) return String(hit.path || hit);
        }

        // Fallback: any sidecar whose dual role complements primary
        for (const s of list) {
            const p = String(s?.path || s || '');
            if (!p || p === primary) continue;
            const base = p.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '');
            const other = inferDualRole(base, inferred.videoStem || stem, { targetSuffix });
            if (!other.role || other.role === inferred.role) continue;
            if ((inferred.videoStem || stem) && other.videoStem
                && other.videoStem.toLowerCase() !== (inferred.videoStem || stem).toLowerCase()) {
                continue;
            }
            return p;
        }
        return null;
    }

    /**
     * Compose overlay lines for bilingual display.
     * @returns {{ sourceText: string, targetText: string, topText: string, bottomText: string, lineOrder: string, visible: boolean }}
     */
    function composeDualOverlayText({
        primaryText = '',
        pairedText = '',
        primaryRole = 'target',
        displayMode = 'both',
        lineOrder = 'source-first',
    } = {}) {
        const mode = normalizeDualDisplayMode(displayMode);
        const order = normalizeDualLineOrder(lineOrder);
        const role = primaryRole === 'source' ? 'source' : 'target';
        const primary = String(primaryText || '').trim();
        const paired = String(pairedText || '').trim();
        let sourceText = '';
        let targetText = '';
        if (role === 'source') {
            sourceText = primary;
            targetText = paired;
        } else {
            targetText = primary;
            sourceText = paired;
        }
        if (mode === 'source') {
            return {
                sourceText,
                targetText: '',
                topText: sourceText,
                bottomText: '',
                lineOrder: order,
                visible: !!sourceText,
            };
        }
        if (mode === 'target') {
            return {
                sourceText: '',
                targetText,
                topText: targetText,
                bottomText: '',
                lineOrder: order,
                visible: !!targetText,
            };
        }
        const sourceFirst = order !== 'target-first';
        return {
            sourceText,
            targetText,
            topText: sourceFirst ? sourceText : targetText,
            bottomText: sourceFirst ? targetText : sourceText,
            lineOrder: order,
            visible: !!(sourceText || targetText),
        };
    }

    /**
     * Map a single-pass pipeline percent into dual overall progress.
     * passIndex 0 → 0–48, passIndex 1 → 50–98
     */
    function mapDualPassProgress(passIndex, pipelinePct) {
        const pct = Math.max(0, Math.min(100, Number(pipelinePct) || 0));
        if (passIndex <= 0) {
            return Math.min(48, Math.round((pct / 100) * 48));
        }
        return Math.min(98, 50 + Math.round((pct / 100) * 48));
    }

    /**
     * Merge primary + pair cues into bilingual lines (source\\n target by default).
     * Timing follows the primary track.
     */
    function buildMergedDualCues(primaryCues, pairCues, {
        primaryRole = 'target',
        order = 'source-first',
    } = {}) {
        const list = Array.isArray(primaryCues) ? primaryCues : [];
        const pair = Array.isArray(pairCues) ? pairCues : [];
        const role = primaryRole === 'source' ? 'source' : 'target';
        const sourceFirst = normalizeDualLineOrder(order) !== 'target-first';
        return list.map((cue) => {
            const startMs = Number(cue?.startMs) || 0;
            const endMs = Math.max(startMs, Number(cue?.endMs) || startMs);
            const primary = String(cue?.text || '').trim();
            const hit = findBestOverlapCue(pair, startMs, endMs);
            const secondary = String(hit.cue?.text || '').trim();
            let sourceText = '';
            let targetText = '';
            if (role === 'source') {
                sourceText = primary;
                targetText = secondary;
            } else {
                targetText = primary;
                sourceText = secondary;
            }
            const lines = sourceFirst
                ? [sourceText, targetText]
                : [targetText, sourceText];
            const text = lines.filter(Boolean).join('\n');
            return {
                index: cue?.index,
                startMs,
                endMs,
                text,
            };
        }).filter((c) => c.text);
    }

    /**
     * Suggest merged export basename next to a dual track path.
     * Default: `{stem}.bilingual.{ext}`；asVideoName 时为 `{stem}.{ext}`（与影片同名）。
     */
    function suggestMergedExportName(subtitlePath, { asVideoName = false } = {}) {
        const raw = String(subtitlePath || '').replace(/\\/g, '/');
        const base = raw.split('/').pop() || 'subtitle.srt';
        const m = base.match(/^(.*?)(\.[^.]+)$/);
        const stemFull = m ? m[1] : base;
        const ext = m ? m[2] : '.srt';
        const parts = stemFull.split('.');
        let videoStem = stemFull;
        if (parts.length >= 2) {
            const last = parts[parts.length - 1].toLowerCase();
            if (SOURCE_SUFFIXES.has(last) || /^[a-z]{2,8}$/.test(last)) {
                videoStem = parts.slice(0, -1).join('.');
            }
        }
        if (asVideoName) return `${videoStem}${ext}`;
        return `${videoStem}.bilingual${ext}`;
    }

    return {
        SOURCE_SUFFIXES,
        TARGET_SUFFIX_DEFAULT,
        DISPLAY_MODES,
        PRIMARY_TRACKS,
        LINE_ORDERS,
        resolveDualSourceSuffix,
        normalizeDualTargetSuffix,
        normalizeDualDisplayMode,
        normalizeDualPrimaryTrack,
        normalizeDualLineOrder,
        parseSubtitleStemParts,
        buildSuffixedSubtitlePath,
        buildDualPathPair,
        inferDualRole,
        listPairSuffixCandidates,
        findComplementarySidecarPath,
        findBestOverlapCue,
        composeDualOverlayText,
        mapDualPassProgress,
        buildMergedDualCues,
        suggestMergedExportName,
    };
}));
