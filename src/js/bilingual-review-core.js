/**
 * 双语规则审阅：漏译 / 空译 / 时长偏离 / 术语不一致（免费）
 * 语义级 LLM 审阅可作为 Pro 扩展入口（payload 预留）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubBilingualReview = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function bilingualReviewCoreFactory() {
    function cueEndMs(cue) {
        if (!cue) return 0;
        if (cue.endMs != null && Number.isFinite(Number(cue.endMs))) return Number(cue.endMs);
        return (Number(cue.startMs) || 0) + 2000;
    }

    function norm(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function charLen(text) {
        return [...norm(text)].length;
    }

    function findBestOverlap(cues, startMs, endMs, dualApi) {
        if (dualApi?.findBestOverlapCue) {
            return dualApi.findBestOverlapCue(cues, startMs, endMs);
        }
        const list = Array.isArray(cues) ? cues : [];
        let best = null;
        let bestOv = 0;
        for (let i = 0; i < list.length; i += 1) {
            const c = list[i];
            const a = Number(c.startMs) || 0;
            const b = cueEndMs(c);
            const ov = Math.max(0, Math.min(endMs, b) - Math.max(startMs, a));
            if (ov > bestOv) {
                bestOv = ov;
                best = { cue: c, index: i, overlapMs: ov, match: 'overlap' };
            }
        }
        return best || { cue: null, index: -1, overlapMs: 0, match: 'none' };
    }

    /**
     * @param {object[]} primaryCues - usually translation track
     * @param {object[]} sourceCues - original / ASR
     * @param {object} [options]
     * @param {object} [options.glossary] - { entries: [{canonical, aliases}] }
     * @param {number} [options.minOverlapRatio]
     * @param {number} [options.durRatioLow]
     * @param {number} [options.durRatioHigh]
     * @param {number} [options.lenRatioLow] - target/source char ratio
     * @param {object} [options.dualApi]
     */
    function reviewBilingualPair(primaryCues, sourceCues, options = {}) {
        const primary = Array.isArray(primaryCues) ? primaryCues : [];
        const source = Array.isArray(sourceCues) ? sourceCues : [];
        const minOv = Math.max(0.05, Number(options.minOverlapRatio) || 0.2);
        const durLow = Math.max(0.1, Number(options.durRatioLow) || 0.35);
        const durHigh = Math.max(durLow, Number(options.durRatioHigh) || 2.8);
        const lenLow = Math.max(0.05, Number(options.lenRatioLow) || 0.15);
        const dualApi = options.dualApi || (typeof globalThis !== 'undefined' ? globalThis.TransubDualSubtitle : null);
        const glossaryEntries = Array.isArray(options.glossary?.entries)
            ? options.glossary.entries.filter((e) => e && e.enabled !== false)
            : [];

        const issues = [];
        const matchedSource = new Set();

        for (let i = 0; i < primary.length; i += 1) {
            const cue = primary[i];
            const start = Number(cue?.startMs) || 0;
            const end = cueEndMs(cue);
            const dur = Math.max(1, end - start);
            const text = norm(cue?.text);
            const hit = findBestOverlap(source, start, end, dualApi);

            if (!hit.cue || hit.match === 'none' || (hit.overlapMs || 0) / dur < minOv) {
                if (text) {
                    issues.push({
                        type: 'no_source',
                        severity: 'warn',
                        primaryIndex: i,
                        message: '译文缺少时间对齐的原文',
                    });
                }
                continue;
            }
            matchedSource.add(hit.index);
            const srcText = norm(hit.cue.text);
            const srcDur = Math.max(1, cueEndMs(hit.cue) - (Number(hit.cue.startMs) || 0));

            if (!text && srcText) {
                issues.push({
                    type: 'empty_translation',
                    severity: 'warn',
                    primaryIndex: i,
                    sourceIndex: hit.index,
                    message: '原文有内容但译文为空',
                });
                continue;
            }

            const lenP = charLen(text);
            const lenS = charLen(srcText);
            if (lenS >= 8 && lenP > 0 && lenP / lenS < lenLow) {
                issues.push({
                    type: 'possible_omission',
                    severity: 'info',
                    primaryIndex: i,
                    sourceIndex: hit.index,
                    message: '译文明显短于原文，可能漏译',
                    ratio: Number((lenP / lenS).toFixed(2)),
                });
            }

            const durRatio = dur / srcDur;
            if (durRatio < durLow || durRatio > durHigh) {
                issues.push({
                    type: 'duration_mismatch',
                    severity: 'info',
                    primaryIndex: i,
                    sourceIndex: hit.index,
                    message: '译文与原文时长偏离较大',
                    ratio: Number(durRatio.toFixed(2)),
                });
            }

            for (const entry of glossaryEntries) {
                const canon = norm(entry.canonical);
                if (!canon) continue;
                const aliases = [canon, ...(entry.aliases || []).map(norm)].filter(Boolean);
                const inSource = aliases.some((a) => a && srcText.includes(a));
                if (!inSource) continue;
                const inTarget = aliases.some((a) => a && text.includes(a)) || text.includes(canon);
                if (!inTarget) {
                    issues.push({
                        type: 'glossary_miss',
                        severity: 'warn',
                        primaryIndex: i,
                        sourceIndex: hit.index,
                        message: `术语「${canon}」出现在原文但译文未使用`,
                        term: canon,
                    });
                }
            }
        }

        for (let j = 0; j < source.length; j += 1) {
            if (matchedSource.has(j)) continue;
            const srcText = norm(source[j]?.text);
            if (!srcText) continue;
            issues.push({
                type: 'missing_translation',
                severity: 'warn',
                sourceIndex: j,
                message: '原文条目没有对应译文',
            });
        }

        const byType = {};
        for (const issue of issues) {
            byType[issue.type] = (byType[issue.type] || 0) + 1;
        }

        return {
            issues,
            stats: {
                primaryCount: primary.length,
                sourceCount: source.length,
                issueCount: issues.length,
                byType,
            },
            summary: issues.length
                ? `双语审阅：${issues.length} 处需留意`
                : '双语审阅：未发现规则性问题',
            /**
             * Pro 扩展：把同一 payload 交给 LLM 做语义漏译/错译检测
             */
            semanticPayload: {
                primaryCount: primary.length,
                sourceCount: source.length,
                sample: primary.slice(0, 40).map((c, i) => {
                    const hit = findBestOverlap(source, c.startMs, cueEndMs(c), dualApi);
                    return {
                        index: i,
                        target: norm(c.text),
                        source: norm(hit?.cue?.text),
                    };
                }),
            },
        };
    }

    function issueTypeLabel(type) {
        const map = {
            no_source: '无原文对齐',
            empty_translation: '空译',
            possible_omission: '疑似漏译',
            duration_mismatch: '时长偏离',
            glossary_miss: '术语缺失',
            missing_translation: '缺译文',
        };
        return map[type] || type;
    }

    return {
        reviewBilingualPair,
        issueTypeLabel,
        cueEndMs,
        norm,
        charLen,
    };
}));
