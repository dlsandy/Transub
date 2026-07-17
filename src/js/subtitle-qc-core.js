/**
 * 字幕质量检查与一键修复（浏览器与 Node 测试共用）
 */
(function (global, factory) {
    const splitCore = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-split-core')
        : (global && global.TransubSubtitleSplit);
    if (!splitCore) {
        throw new Error('subtitle-split-core.js must load before subtitle-qc-core.js');
    }
    const fluencyCore = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-fluency-core')
        : (global && global.TransubSubtitleFluency);
    const api = factory(splitCore, fluencyCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleQc = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleQcCoreFactory(splitCore, fluencyCore) {
    function cueEndMs(cue) {
        return cue.endMs != null ? cue.endMs : cue.startMs + 2000;
    }

    function cueDurationMs(cue) {
        return Math.max(0, cueEndMs(cue) - cue.startMs);
    }

    function cloneCues(cues) {
        return (cues || []).map((c) => ({
            index: c.index,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text ?? '',
        }));
    }

    function getCueCps(cue) {
        const durSec = cueDurationMs(cue) / 1000;
        if (durSec <= 0) return null;
        const chars = splitCore.textCharCount(cue.text);
        if (!chars) return null;
        return chars / durSec;
    }

    function normalizeQcOptions(options = {}) {
        const minSec = Math.max(0.1, Number(options.minSec) || 0.5);
        const maxSec = Math.max(minSec, Number(options.maxSec) || 10);
        return {
            fixOverlap: options.fixOverlap !== false,
            fixCpsBySplit: options.fixCpsBySplit === true,
            fixCpsByExtend: options.fixCpsByExtend !== false && options.fixCps !== false,
            enforceMinDur: options.enforceMinDur !== false,
            enforceMaxDur: options.enforceMaxDur !== false,
            maxCps: Math.max(1, Number(options.maxCps) || 18),
            minSec,
            maxSec,
            minDurMs: Math.max(100, Math.round(minSec * 1000)),
            maxDurMs: Math.max(100, Math.round(maxSec * 1000)),
            gapMs: Math.max(0, Math.round(Number(options.gapMs) || 0)),
            smartMaxChars: Math.max(4, Number(options.smartMaxChars) || 20),
            smartLineChars: Math.max(4, Number(options.smartLineChars) || 18),
            targetCps: Math.max(0.1, Number(options.targetCps) || 3),
            useCpsTime: options.useCpsTime !== false,
            checkFluency: options.checkFluency !== false,
        };
    }

    /**
     * 扫描时间轴 / 读速 / 通顺度问题（不做修改）
     */
    function scanCueIssues(cues, options = {}) {
        const opts = normalizeQcOptions(options);
        const list = cues || [];
        const issues = [];
        const summary = {
            total: 0,
            overlap: 0,
            highCps: 0,
            short: 0,
            long: 0,
            invalid: 0,
            connected: 0,
            splittable: 0,
            fluency: 0,
        };

        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            const prev = i > 0 ? list[i - 1] : null;
            const next = i < list.length - 1 ? list[i + 1] : null;
            const start = cue.startMs;
            const end = cueEndMs(cue);
            const dur = end - start;
            const types = [];
            const messages = [];
            const cps = getCueCps(cue);
            const text = String(cue.text || '').trim();
            const connected = text ? splitCore.isConnectedText(text) : false;

            if (end <= start) {
                types.push('invalid');
                messages.push('结束早于起始');
                summary.invalid += 1;
            }
            if (prev && start < cueEndMs(prev) + opts.gapMs) {
                types.push('overlap');
                messages.push('与上条重叠');
            }
            if (next && end > next.startMs - opts.gapMs) {
                if (!types.includes('overlap')) types.push('overlap');
                messages.push('与下条重叠');
            }
            if (types.includes('overlap')) summary.overlap += 1;

            if (dur < opts.minDurMs) {
                types.push('short');
                messages.push('时长过短');
                summary.short += 1;
            }
            if (dur > opts.maxDurMs) {
                types.push('long');
                messages.push('时长过长');
                summary.long += 1;
            }
            if (cps != null && cps > opts.maxCps) {
                types.push('high_cps');
                messages.push(`读速过快 (${cps.toFixed(1)} CPS)`);
                summary.highCps += 1;
                if (connected) {
                    types.push('connected');
                    messages.push('连续文本，无法自动分割');
                    summary.connected += 1;
                } else {
                    const parts = splitCore.splitTextSmart(text, {
                        maxChars: opts.smartMaxChars,
                        maxLineChars: opts.smartLineChars,
                    });
                    if (parts.length >= 2) {
                        types.push('splittable');
                        summary.splittable += 1;
                    }
                }
            }

            if (opts.checkFluency && fluencyCore?.analyzeTextFluency) {
                const fluency = fluencyCore.analyzeTextFluency(text);
                const fluencyFlags = (fluency.flags || []).filter((f) => f !== 'empty');
                if (fluencyFlags.length) {
                    types.push('fluency');
                    for (const msg of fluency.messages || []) messages.push(msg);
                    summary.fluency += 1;
                }
                const prevText = prev ? String(prev.text || '').trim() : '';
                if (prevText && text && prevText === text && text.length >= 2) {
                    if (!types.includes('fluency')) {
                        types.push('fluency');
                        summary.fluency += 1;
                    }
                    messages.push('与上条文本完全相同');
                }
            }

            if (!types.length) continue;
            summary.total += 1;
            issues.push({
                index: i,
                types,
                messages,
                cps,
                durationMs: dur,
                textPreview: text.slice(0, 36),
            });
        }

        return { issues, summary };
    }

    function summarizeScan(summary) {
        if (!summary?.total) return '未发现问题';
        const parts = [];
        if (summary.overlap) parts.push(`重叠 ${summary.overlap}`);
        if (summary.highCps) parts.push(`读速过快 ${summary.highCps}`);
        if (summary.short) parts.push(`过短 ${summary.short}`);
        if (summary.long) parts.push(`过长 ${summary.long}`);
        if (summary.invalid) parts.push(`无效 ${summary.invalid}`);
        if (summary.connected) parts.push(`连续文本 ${summary.connected}`);
        if (summary.fluency) parts.push(`通顺度 ${summary.fluency}`);
        return `${summary.total} 条有问题：${parts.join(' · ')}`;
    }

    /**
     * 修复重叠 / CPS 延长 / 最小最大时长（与编辑器原「智能调整」一致）
     */
    function applySmartAdjustToCues(cues, options = {}) {
        const opts = normalizeQcOptions(options);
        const minDurMs = opts.minDurMs;
        const maxDurMs = opts.maxDurMs;
        const maxCps = opts.maxCps;
        const gapMs = opts.gapMs;
        const stats = { affected: 0, overlapFixed: 0, cpsFixed: 0, minDurFixed: 0, maxDurFixed: 0 };
        const touched = new Set();

        function setEnd(cue, idx, newEnd) {
            const end = Math.max(cue.startMs + 100, Math.round(newEnd));
            if (end === cueEndMs(cue)) return;
            cue.endMs = end;
            touched.add(idx);
        }

        function fixOverlapsPass() {
            if (!opts.fixOverlap) return;
            for (let i = 0; i < cues.length; i += 1) {
                const cue = cues[i];
                const prev = i > 0 ? cues[i - 1] : null;
                if (prev) {
                    const prevEnd = cueEndMs(prev);
                    if (cue.startMs < prevEnd + gapMs) {
                        const dur = cueDurationMs(cue);
                        const newStart = prevEnd + gapMs;
                        cue.startMs = newStart;
                        cue.endMs = newStart + dur;
                        touched.add(i);
                        stats.overlapFixed += 1;
                    }
                }
                const next = i < cues.length - 1 ? cues[i + 1] : null;
                if (next) {
                    const oldEnd = cueEndMs(cue);
                    const limit = next.startMs - gapMs;
                    if (oldEnd > limit) {
                        setEnd(cue, i, Math.max(cue.startMs + minDurMs, limit));
                        stats.overlapFixed += 1;
                    }
                }
            }
        }

        fixOverlapsPass();

        if (opts.fixCpsByExtend) {
            for (let i = 0; i < cues.length; i += 1) {
                const cue = cues[i];
                const chars = splitCore.textCharCount(cue.text);
                if (!chars) continue;
                const cps = chars / (cueDurationMs(cue) / 1000);
                if (cps <= maxCps) continue;
                const needMs = Math.ceil((chars / maxCps) * 1000);
                let newEnd = cue.startMs + Math.max(minDurMs, needMs);
                const next = cues[i + 1];
                if (next) newEnd = Math.min(newEnd, next.startMs - gapMs);
                newEnd = Math.max(cue.startMs + minDurMs, newEnd);
                if (newEnd > cueEndMs(cue)) {
                    setEnd(cue, i, newEnd);
                    stats.cpsFixed += 1;
                }
            }
        }

        if (opts.enforceMinDur) {
            for (let i = 0; i < cues.length; i += 1) {
                const cue = cues[i];
                if (cueDurationMs(cue) >= minDurMs) continue;
                let newEnd = cue.startMs + minDurMs;
                const next = cues[i + 1];
                if (next) newEnd = Math.min(newEnd, next.startMs - gapMs);
                if (newEnd > cueEndMs(cue)) {
                    setEnd(cue, i, newEnd);
                    stats.minDurFixed += 1;
                }
            }
        }

        if (opts.enforceMaxDur) {
            for (let i = 0; i < cues.length; i += 1) {
                const cue = cues[i];
                if (cueDurationMs(cue) <= maxDurMs) continue;
                setEnd(cue, i, cue.startMs + maxDurMs);
                stats.maxDurFixed += 1;
            }
        }

        fixOverlapsPass();
        stats.affected = touched.size;
        return stats;
    }

    function trySmartSplitCue(cue, opts) {
        const text = String(cue.text || '').trim();
        if (!text || splitCore.isConnectedText(text)) return null;
        const cps = getCueCps(cue);
        if (cps == null || cps <= opts.maxCps) return null;
        const texts = splitCore.splitTextSmart(text, {
            maxChars: opts.smartMaxChars,
            maxLineChars: opts.smartLineChars,
        });
        if (!texts || texts.length < 2) return null;
        const timeMode = opts.useCpsTime ? 'cps' : 'proportional';
        const built = splitCore.buildCuesFromTexts(
            cue.startMs,
            cueEndMs(cue),
            texts,
            timeMode,
            { targetCps: opts.targetCps, minDurMs: opts.minDurMs },
        );
        if (!built || built.length < 2) return null;
        return built.map((c) => ({
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text ?? '',
        }));
    }

    function summarizeFixStats(stats, beforeCount, afterCount) {
        if (!stats) return '无改动';
        const parts = [];
        if (stats.splitCount) parts.push(`分割 ${stats.splitCount} 条(+${stats.added})`);
        if (stats.overlapFixed) parts.push(`重叠 ${stats.overlapFixed} 处`);
        if (stats.cpsFixed) parts.push(`延长读速 ${stats.cpsFixed} 条`);
        if (stats.minDurFixed) parts.push(`过短 ${stats.minDurFixed} 条`);
        if (stats.maxDurFixed) parts.push(`过长 ${stats.maxDurFixed} 条`);
        if (stats.skipConnected) parts.push(`跳过连续文本 ${stats.skipConnected}`);
        if (!parts.length) return '当前字幕无需修复';
        const countHint = afterCount !== beforeCount
            ? `（${beforeCount} → ${afterCount} 条）`
            : '';
        return `预计影响 ${stats.affected} 条${countHint}：${parts.join(' · ')}`;
    }

    /**
     * 一键修复：可选智能分割高 CPS，再跑时间轴调整
     * 返回新 cues（不修改入参）与统计
     */
    function applyQcFixes(cues, options = {}) {
        const opts = normalizeQcOptions(options);
        const working = cloneCues(cues);
        const beforeCount = working.length;
        const stats = {
            affected: 0,
            splitCount: 0,
            added: 0,
            overlapFixed: 0,
            cpsFixed: 0,
            minDurFixed: 0,
            maxDurFixed: 0,
            skipConnected: 0,
        };

        if (opts.fixCpsBySplit) {
            for (let i = working.length - 1; i >= 0; i -= 1) {
                const cue = working[i];
                const cps = getCueCps(cue);
                if (cps == null || cps <= opts.maxCps) continue;
                const text = String(cue.text || '').trim();
                if (text && splitCore.isConnectedText(text)) {
                    stats.skipConnected += 1;
                    continue;
                }
                const parts = trySmartSplitCue(cue, opts);
                if (!parts) continue;
                working.splice(i, 1, ...parts);
                stats.splitCount += 1;
                stats.added += parts.length - 1;
            }
        }

        const hasAdjust = opts.fixOverlap || opts.fixCpsByExtend || opts.enforceMinDur || opts.enforceMaxDur;
        if (hasAdjust) {
            const adj = applySmartAdjustToCues(working, {
                fixOverlap: opts.fixOverlap,
                fixCps: opts.fixCpsByExtend,
                enforceMinDur: opts.enforceMinDur,
                enforceMaxDur: opts.enforceMaxDur,
                maxCps: opts.maxCps,
                minSec: opts.minSec,
                maxSec: opts.maxSec,
                gapMs: opts.gapMs,
            });
            stats.overlapFixed = adj.overlapFixed;
            stats.cpsFixed = adj.cpsFixed;
            stats.minDurFixed = adj.minDurFixed;
            stats.maxDurFixed = adj.maxDurFixed;
            stats.affected = adj.affected + stats.splitCount;
        } else {
            stats.affected = stats.splitCount;
        }

        const afterScan = scanCueIssues(working, opts);
        return {
            cues: working,
            stats,
            beforeCount,
            afterCount: working.length,
            remaining: afterScan.summary,
            summary: summarizeFixStats(stats, beforeCount, working.length),
        };
    }

    /**
     * 按问题类型收窄一键修复选项；不可自动修复的类型返回 null
     */
    function buildQcOptionsForIssueType(baseOptions = {}, issueType) {
        const base = normalizeQcOptions(baseOptions);
        const off = {
            ...base,
            fixOverlap: false,
            fixCpsBySplit: false,
            fixCpsByExtend: false,
            enforceMinDur: false,
            enforceMaxDur: false,
        };
        switch (issueType) {
            case 'overlap':
                return { ...off, fixOverlap: true };
            case 'high_cps': {
                // 尊重弹窗勾选；若读速相关都未勾选，则默认同时启用分割与延长
                const anyCps = !!(baseOptions.fixCpsBySplit || baseOptions.fixCpsByExtend);
                return {
                    ...off,
                    fixCpsBySplit: anyCps ? !!baseOptions.fixCpsBySplit : true,
                    fixCpsByExtend: anyCps ? !!baseOptions.fixCpsByExtend : true,
                };
            }
            case 'splittable':
                return { ...off, fixCpsBySplit: true };
            case 'short':
                return { ...off, enforceMinDur: true };
            case 'long':
                return { ...off, enforceMaxDur: true };
            default:
                return null;
        }
    }

    function buildQcFixPlan(cues, options = {}) {
        const opts = normalizeQcOptions(options);
        const before = scanCueIssues(cues, opts);
        const selected = opts.fixOverlap || opts.fixCpsBySplit || opts.fixCpsByExtend
            || opts.enforceMinDur || opts.enforceMaxDur;
        if (!selected) {
            return {
                ok: false,
                before,
                affected: 0,
                summary: '请至少选择一项修复规则',
                remaining: before.summary,
            };
        }
        const result = applyQcFixes(cues, opts);
        let summary = result.summary;
        const fluencyLeft = before.summary?.fluency || 0;
        if (fluencyLeft && !options.issueTypeFilter) {
            summary += `；通顺度嫌疑 ${fluencyLeft} 条需手工改或重转写`;
        }
        return {
            ok: result.stats.affected > 0 || result.stats.splitCount > 0,
            before,
            affected: result.stats.affected,
            stats: result.stats,
            summary,
            remaining: result.remaining,
            afterCount: result.afterCount,
        };
    }

    return {
        cueEndMs,
        cueDurationMs,
        cloneCues,
        getCueCps,
        normalizeQcOptions,
        scanCueIssues,
        summarizeScan,
        applySmartAdjustToCues,
        applyQcFixes,
        buildQcOptionsForIssueType,
        buildQcFixPlan,
        trySmartSplitCue,
    };
}));
