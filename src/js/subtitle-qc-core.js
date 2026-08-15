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
    /** 可自动修复的问题类型 */
    const AUTO_FIXABLE_TYPES = new Set([
        'overlap', 'high_cps', 'splittable', 'short', 'long', 'repetition',
        'invalid', 'connected', 'duplicate',
    ]);

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
            fixInvalid: options.fixInvalid !== false,
            compressRepetition: options.compressRepetition === true,
            removeNoise: options.removeNoise === true,
            removeDuplicates: options.removeDuplicates === true,
            removeFragments: options.removeFragments !== false,
            removeHallucinations: options.removeHallucinations === true,
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
            noPunctMinChars: Math.max(8, Number(options.noPunctMinChars) || 28),
        };
    }

    function issueSeverity(types) {
        const list = Array.isArray(types) ? types : [];
        if (list.includes('invalid') || list.includes('overlap')) return 'error';
        if (list.some((t) => AUTO_FIXABLE_TYPES.has(t))) return 'warn';
        return 'info';
    }

    function issueAutoFixable(types) {
        const list = Array.isArray(types) ? types : [];
        // fluency 单独出现多为句末残缺等，需人工；与叠词/重复/时间轴并存时可自动修
        return list.some((t) => AUTO_FIXABLE_TYPES.has(t));
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
            repetition: 0,
            duplicate: 0,
            autoFixable: 0,
            advisory: 0,
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
            // 仅标记真实重叠；贴齐（gap=0）不算问题
            if (prev && start < cueEndMs(prev) + opts.gapMs) {
                types.push('overlap');
                messages.push('与上条重叠');
            }
            if (next && end > next.startMs - opts.gapMs) {
                if (!types.includes('overlap')) types.push('overlap');
                messages.push('与下条重叠');
            }
            if (types.includes('overlap')) summary.overlap += 1;

            if (dur > 0 && dur < opts.minDurMs) {
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
                // 先尝试智能分割：带标点的连续中文也可拆，勿一律标「无法分割」
                const parts = text
                    ? splitCore.splitTextSmart(text, {
                        maxChars: opts.smartMaxChars,
                        maxLineChars: opts.smartLineChars,
                    })
                    : [];
                if (parts.length >= 2) {
                    types.push('splittable');
                    summary.splittable += 1;
                } else if (connected) {
                    types.push('connected');
                    messages.push('连续文本，无法自动分割');
                    summary.connected += 1;
                }
            }

            let compressible = false;
            if (fluencyCore?.compressRepetitionInText && text) {
                const compressed = fluencyCore.compressRepetitionInText(text);
                if (compressed?.changed) {
                    compressible = true;
                    types.push('repetition');
                    messages.push('可压缩叠词');
                    summary.repetition += 1;
                }
            }

            const prevText = prev ? String(prev.text || '').trim() : '';
            const isDuplicate = !!(prevText && text && prevText === text && text.length >= 2);

            if (opts.checkFluency && fluencyCore?.analyzeTextFluency) {
                const fluency = fluencyCore.analyzeTextFluency(text, {
                    noPunctMinChars: opts.noPunctMinChars,
                });
                let fluencyFlags = (fluency.flags || []).filter((f) => f !== 'empty');
                // 叠词已有独立类型时，不再用通顺度重复计数口吃/重复
                if (compressible) {
                    fluencyFlags = fluencyFlags.filter((f) => f !== 'repetition' && f !== 'stutter');
                }
                // ASR 中文常无标点：单独缺标点不计入通顺度，避免误报刷屏
                if (fluencyFlags.length === 1 && fluencyFlags[0] === 'no_punct') {
                    fluencyFlags = [];
                }

                if (fluencyFlags.length) {
                    types.push('fluency');
                    if (fluencyFlags.includes('weird')) types.push('weird');
                    const keep = new Set(fluencyFlags);
                    const srcFlags = fluency.flags || [];
                    const srcMsgs = fluency.messages || [];
                    for (let mi = 0; mi < srcFlags.length; mi += 1) {
                        if (!keep.has(srcFlags[mi])) continue;
                        if (srcMsgs[mi]) messages.push(srcMsgs[mi]);
                    }
                    summary.fluency += 1;
                }
            }

            if (isDuplicate) {
                types.push('duplicate');
                messages.push('与上条文本完全相同');
                summary.duplicate += 1;
                // 连续重复可一键删除；若尚未标通顺度则补一条便于筛选
                if (!types.includes('fluency') && opts.checkFluency) {
                    types.push('fluency');
                    summary.fluency += 1;
                }
            }

            if (!types.length) continue;
            summary.total += 1;
            const severity = issueSeverity(types);
            const autoFixable = issueAutoFixable(types);
            if (autoFixable) summary.autoFixable += 1;
            else summary.advisory += 1;
            issues.push({
                index: i,
                types,
                messages,
                cps,
                durationMs: dur,
                textPreview: text.slice(0, 36),
                severity,
                autoFixable,
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
        if (summary.repetition) parts.push(`叠词 ${summary.repetition}`);
        if (summary.duplicate) parts.push(`连续重复 ${summary.duplicate}`);
        if (summary.fluency) parts.push(`通顺度 ${summary.fluency}`);
        let text = `${summary.total} 条有问题：${parts.join(' · ')}`;
        if (summary.autoFixable && summary.advisory) {
            text += `（可自动修 ${summary.autoFixable} · 建议人工 ${summary.advisory}）`;
        }
        return text;
    }

    /**
     * 修复无效时间轴（end <= start）
     */
    function fixInvalidCueTimings(cues, options = {}) {
        const opts = normalizeQcOptions(options);
        let fixed = 0;
        for (let i = 0; i < cues.length; i += 1) {
            const cue = cues[i];
            const start = Number(cue.startMs) || 0;
            const end = cue.endMs != null ? Number(cue.endMs) : start + 2000;
            if (Number.isFinite(end) && end > start) continue;

            let newEnd = start + opts.minDurMs;
            const next = cues[i + 1];
            if (next) {
                const nextStart = Number(next.startMs);
                if (Number.isFinite(nextStart)) {
                    const room = nextStart - opts.gapMs;
                    if (room > start + 100) {
                        newEnd = Math.min(newEnd, room);
                    } else {
                        // 下条贴太紧：先给本条最短时长，再把后续整体后移
                        newEnd = start + Math.max(100, Math.min(opts.minDurMs, 300));
                        const shift = (newEnd + opts.gapMs) - nextStart;
                        if (shift > 0) {
                            for (let j = i + 1; j < cues.length; j += 1) {
                                cues[j].startMs = (Number(cues[j].startMs) || 0) + shift;
                                if (cues[j].endMs != null) {
                                    cues[j].endMs = Number(cues[j].endMs) + shift;
                                }
                            }
                        }
                    }
                }
            }
            cue.startMs = start;
            cue.endMs = Math.max(start + 100, Math.round(newEnd));
            fixed += 1;
        }
        return fixed;
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
        const stats = {
            affected: 0,
            overlapFixed: 0,
            cpsFixed: 0,
            minDurFixed: 0,
            maxDurFixed: 0,
            invalidFixed: 0,
        };
        const touched = new Set();

        function setEnd(cue, idx, newEnd) {
            const end = Math.max(cue.startMs + 100, Math.round(newEnd));
            if (end === cueEndMs(cue)) return;
            cue.endMs = end;
            touched.add(idx);
        }

        if (opts.fixInvalid) {
            const n = fixInvalidCueTimings(cues, opts);
            stats.invalidFixed = n;
            if (n) {
                for (let i = 0; i < cues.length; i += 1) touched.add(i);
            }
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
                        cue.endMs = newStart + Math.max(dur, minDurMs);
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
        if (!text) return null;
        const cps = getCueCps(cue);
        if (cps == null || cps <= opts.maxCps) return null;
        // 允许对「连续中文」尝试智能分割（有标点/断句词时可拆）
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
        if (stats.invalidFixed) parts.push(`无效轴 ${stats.invalidFixed} 条`);
        if (stats.compressRepFixed) parts.push(`叠词 ${stats.compressRepFixed} 条`);
        if (stats.noiseRemoved) parts.push(`清杂音 ${stats.noiseRemoved} 条`);
        if (stats.duplicatesRemoved) parts.push(`去重 ${stats.duplicatesRemoved} 条`);
        if (stats.skipConnected) parts.push(`跳过连续文本 ${stats.skipConnected}`);
        if (!parts.length) return '当前字幕无需修复';
        const countHint = afterCount !== beforeCount
            ? `（${beforeCount} → ${afterCount} 条）`
            : '';
        return `预计影响 ${stats.affected} 条${countHint}：${parts.join(' · ')}`;
    }

    function summarizeRemaining(remaining) {
        if (!remaining?.total) return '';
        const parts = [];
        if (remaining.overlap) parts.push(`重叠 ${remaining.overlap}`);
        if (remaining.highCps) parts.push(`读速 ${remaining.highCps}`);
        if (remaining.connected) parts.push(`连续文本 ${remaining.connected}`);
        if (remaining.repetition) parts.push(`叠词 ${remaining.repetition}`);
        if (remaining.fluency) parts.push(`通顺度 ${remaining.fluency}`);
        if (remaining.duplicate) parts.push(`连续重复 ${remaining.duplicate}`);
        if (remaining.invalid) parts.push(`无效 ${remaining.invalid}`);
        if (remaining.short) parts.push(`过短 ${remaining.short}`);
        if (remaining.long) parts.push(`过长 ${remaining.long}`);
        return parts.length
            ? `仍有 ${remaining.total} 条：${parts.join(' · ')}`
            : `仍有 ${remaining.total} 条问题`;
    }

    /**
     * 一键修复：可选杂音/叠词/智能分割高 CPS，再跑时间轴调整
     * 返回新 cues（不修改入参）与统计
     */
    function applyQcFixes(cues, options = {}) {
        const opts = normalizeQcOptions(options);
        let working = cloneCues(cues);
        const beforeCount = working.length;
        const stats = {
            affected: 0,
            splitCount: 0,
            added: 0,
            overlapFixed: 0,
            cpsFixed: 0,
            minDurFixed: 0,
            maxDurFixed: 0,
            invalidFixed: 0,
            compressRepFixed: 0,
            noiseRemoved: 0,
            duplicatesRemoved: 0,
            skipConnected: 0,
        };

        if ((opts.removeNoise || opts.removeDuplicates) && fluencyCore?.removeNoiseFromCues) {
            const noise = fluencyCore.removeNoiseFromCues(working, {
                removeEmpty: opts.removeNoise,
                removeFragments: opts.removeNoise && opts.removeFragments,
                removeSoundEffects: opts.removeNoise,
                removeSymbolOnly: opts.removeNoise,
                removeDuplicates: opts.removeDuplicates,
                removeHallucinations: opts.removeNoise && opts.removeHallucinations,
                blankInsteadOfRemove: options.blankInsteadOfRemove === true,
            });
            working = noise.cues.map((c) => ({
                startMs: c.startMs,
                endMs: c.endMs,
                text: c.text ?? '',
            }));
            stats.noiseRemoved = Number(noise.stats?.removed) || 0;
            stats.noiseBlanked = Number(noise.stats?.blanked) || 0;
            stats.duplicatesRemoved = Number(noise.stats?.duplicate) || 0;
        }

        if (opts.compressRepetition && fluencyCore?.compressRepetitionInCues) {
            const compressed = fluencyCore.compressRepetitionInCues(working, {
                compressSingleChar: true,
                addExclaim: true,
                minRepeats: 3,
            });
            for (let i = 0; i < working.length; i += 1) {
                if (compressed.cues[i]) working[i].text = compressed.cues[i].text;
            }
            stats.compressRepFixed = Number(compressed.stats?.cueTouched) || 0;
        }

        if (opts.fixCpsBySplit) {
            for (let i = working.length - 1; i >= 0; i -= 1) {
                const cue = working[i];
                const cps = getCueCps(cue);
                if (cps == null || cps <= opts.maxCps) continue;
                const text = String(cue.text || '').trim();
                const parts = trySmartSplitCue(cue, opts);
                if (!parts) {
                    if (text && splitCore.isConnectedText(text)) stats.skipConnected += 1;
                    continue;
                }
                working.splice(i, 1, ...parts);
                stats.splitCount += 1;
                stats.added += parts.length - 1;
            }
        }

        const hasAdjust = opts.fixOverlap || opts.fixCpsByExtend || opts.enforceMinDur
            || opts.enforceMaxDur || opts.fixInvalid;
        if (hasAdjust) {
            const adj = applySmartAdjustToCues(working, {
                fixOverlap: opts.fixOverlap,
                fixCps: opts.fixCpsByExtend,
                enforceMinDur: opts.enforceMinDur,
                enforceMaxDur: opts.enforceMaxDur,
                fixInvalid: opts.fixInvalid,
                maxCps: opts.maxCps,
                minSec: opts.minSec,
                maxSec: opts.maxSec,
                gapMs: opts.gapMs,
            });
            stats.overlapFixed = adj.overlapFixed;
            stats.cpsFixed = adj.cpsFixed;
            stats.minDurFixed = adj.minDurFixed;
            stats.maxDurFixed = adj.maxDurFixed;
            stats.invalidFixed = adj.invalidFixed || 0;
            stats.affected = adj.affected + stats.splitCount + stats.compressRepFixed
                + stats.noiseRemoved;
        } else {
            stats.affected = stats.splitCount + stats.compressRepFixed + stats.noiseRemoved;
        }

        const afterScan = options.skipAfterScan
            ? null
            : scanCueIssues(working, opts);
        return {
            cues: working,
            stats,
            beforeCount,
            afterCount: working.length,
            scan: afterScan,
            remaining: afterScan?.summary || null,
            remainingText: afterScan ? summarizeRemaining(afterScan.summary) : '',
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
            fixInvalid: false,
            compressRepetition: false,
            removeNoise: false,
            removeDuplicates: false,
            removeHallucinations: false,
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
            case 'connected':
                // 无法分割时优先延长时长
                return { ...off, fixCpsByExtend: true };
            case 'short':
                return { ...off, enforceMinDur: true };
            case 'long':
                return { ...off, enforceMaxDur: true };
            case 'invalid':
                return { ...off, fixInvalid: true, enforceMinDur: true, fixOverlap: true };
            case 'repetition':
                return { ...off, compressRepetition: true };
            case 'duplicate':
                return { ...off, removeDuplicates: true };
            case 'fluency':
                // 通顺度里可安全自动处理的子集：叠词 / 碎片 / 连续重复
                return {
                    ...off,
                    compressRepetition: true,
                    removeNoise: true,
                    removeDuplicates: true,
                    removeFragments: true,
                    removeHallucinations: false,
                };
            default:
                return null;
        }
    }

    /**
     * 预览用：只扫不修，避免弹窗勾选时反复 dry-apply。
     */
    function buildQcFixEstimate(cues, options = {}) {
        const opts = normalizeQcOptions(options);
        const before = options.beforeScan && typeof options.beforeScan === 'object'
            ? options.beforeScan
            : scanCueIssues(cues, opts);
        const selected = opts.fixOverlap || opts.fixCpsBySplit || opts.fixCpsByExtend
            || opts.enforceMinDur || opts.enforceMaxDur || opts.compressRepetition
            || opts.fixInvalid || opts.removeNoise || opts.removeDuplicates;
        if (!selected) {
            return {
                ok: false,
                estimateOnly: true,
                before,
                affected: 0,
                summary: '请至少选择一项修复规则',
                remaining: before.summary,
            };
        }
        const total = Number(before.summary?.total) || 0;
        const auto = Number(before.summary?.autoFixable) || 0;
        const parts = [];
        if (!total) parts.push('无需修复');
        else if (auto) parts.push(`预计可自动处理约 ${auto} 条（共 ${total} 条问题）`);
        else parts.push(`共 ${total} 条问题，多需智能处理或人工`);
        const rem = summarizeRemaining(before.summary);
        if (rem && auto) parts.push(rem.replace(/^仍有\s*/, '其中 '));
        return {
            ok: auto > 0,
            estimateOnly: true,
            before,
            affected: auto,
            summary: parts.join('；'),
            remaining: before.summary,
            remainingText: rem,
        };
    }

    function buildQcFixPlan(cues, options = {}) {
        if (options.estimateOnly) return buildQcFixEstimate(cues, options);
        const opts = normalizeQcOptions(options);
        const before = scanCueIssues(cues, opts);
        const selected = opts.fixOverlap || opts.fixCpsBySplit || opts.fixCpsByExtend
            || opts.enforceMinDur || opts.enforceMaxDur || opts.compressRepetition
            || opts.fixInvalid || opts.removeNoise || opts.removeDuplicates;
        if (!selected) {
            return {
                ok: false,
                before,
                affected: 0,
                summary: '请至少选择一项修复规则',
                remaining: before.summary,
            };
        }
        // 已扫过 before；apply 内再扫一次 after（供写回 remaining / 复用 scan）
        const result = applyQcFixes(cues, opts);
        let summary = result.summary;
        if (!options.issueTypeFilter && result.remaining?.total) {
            const rem = summarizeRemaining(result.remaining);
            if (rem) summary += `；${rem}`;
            const fluencyLeft = result.remaining.fluency || 0;
            const advisoryOnly = (result.remaining.advisory || 0) > 0
                && (result.remaining.autoFixable || 0) === 0;
            if (fluencyLeft && !opts.compressRepetition && !opts.removeNoise) {
                summary += `；通顺度嫌疑 ${fluencyLeft} 条需手工改或重转写`;
            } else if (advisoryOnly) {
                summary += '；剩余多为建议人工处理项';
            }
        } else if (!options.issueTypeFilter) {
            const repetitionLeft = before.summary?.repetition || 0;
            if (repetitionLeft && !opts.compressRepetition) {
                summary += `；叠词 ${repetitionLeft} 条可勾选压缩或筛选后一键修复`;
            }
        }
        return {
            ok: result.stats.affected > 0 || result.stats.splitCount > 0
                || result.stats.compressRepFixed > 0 || result.stats.noiseRemoved > 0,
            before,
            affected: result.stats.affected,
            stats: result.stats,
            summary,
            remaining: result.remaining,
            remainingText: result.remainingText,
            afterCount: result.afterCount,
            cues: result.cues,
            scan: result.scan,
        };
    }

    function formatQcTimeRange(cue) {
        const start = (Number(cue?.startMs) || 0) / 1000;
        const end = cueEndMs(cue) / 1000;
        return `${start.toFixed(2)}s→${end.toFixed(2)}s`;
    }

    function cueTimingOrTextChanged(beforeCue, afterCue) {
        if (!beforeCue || !afterCue) return true;
        if (String(beforeCue.text ?? '') !== String(afterCue.text ?? '')) return true;
        if (Number(beforeCue.startMs) !== Number(afterCue.startMs)) return true;
        if (cueEndMs(beforeCue) !== cueEndMs(afterCue)) return true;
        return false;
    }

    function hasQcFixEffect(stats) {
        return !!(stats?.affected || stats?.splitCount || stats?.compressRepFixed
            || stats?.noiseRemoved || stats?.duplicatesRemoved);
    }

    /**
     * 生成 QC 修复对照行（供编辑器确认弹窗）。
     * 条数变化时为结构变更：确认后宜整体应用 after。
     */
    function buildQcReviewRows(beforeCues, afterCues) {
        const before = Array.isArray(beforeCues) ? beforeCues : [];
        const after = Array.isArray(afterCues) ? afterCues : [];
        const structural = before.length !== after.length;
        const rows = [];

        if (!structural) {
            for (let i = 0; i < before.length; i += 1) {
                const b = before[i];
                const a = after[i];
                const bText = String(b?.text ?? '');
                const aText = String(a?.text ?? '');
                const timeChanged = Number(b?.startMs) !== Number(a?.startMs)
                    || cueEndMs(b) !== cueEndMs(a);
                const textChanged = bText !== aText;
                const changed = textChanged || timeChanged;
                let beforeDisp = bText;
                if (timeChanged) {
                    beforeDisp = `${bText || '（空）'}\n⏱ ${formatQcTimeRange(b)} → ${formatQcTimeRange(a)}`;
                }
                rows.push({
                    index: i,
                    before: beforeDisp,
                    after: aText,
                    changed,
                    structural: false,
                    afterStartMs: a?.startMs,
                    afterEndMs: a?.endMs,
                });
            }
            return { rows, structural: false };
        }

        for (let i = 0; i < after.length; i += 1) {
            const a = after[i];
            const b = before[i];
            const aText = String(a?.text ?? '');
            const bText = b ? String(b.text ?? '') : '（分割/新增）';
            let beforeDisp = bText;
            if (!b) {
                beforeDisp = `（分割/新增）\n⏱ ${formatQcTimeRange(a)}`;
            } else if (Number(b.startMs) !== Number(a.startMs) || cueEndMs(b) !== cueEndMs(a)) {
                beforeDisp = `${bText || '（空）'}\n⏱ ${formatQcTimeRange(b)} → ${formatQcTimeRange(a)}`;
            }
            rows.push({
                index: i,
                before: beforeDisp,
                after: aText,
                changed: cueTimingOrTextChanged(b, a),
                structural: true,
                afterStartMs: a?.startMs,
                afterEndMs: a?.endMs,
            });
        }
        for (let i = after.length; i < before.length; i += 1) {
            rows.push({
                index: i,
                before: String(before[i]?.text ?? ''),
                after: '（删除）',
                changed: true,
                structural: true,
                removed: true,
            });
        }
        return { rows, structural: true };
    }

    /**
     * 按确认结果写回。条数不变时按勾选合并；结构变更时整体采用 after。
     * @returns {Array|null}
     */
    function applyQcAcceptedFixes(beforeCues, afterCues, accepted) {
        const before = Array.isArray(beforeCues) ? beforeCues : [];
        const after = Array.isArray(afterCues) ? afterCues : [];
        if (!Array.isArray(accepted) || !accepted.length) return null;

        if (before.length !== after.length) {
            return cloneCues(after);
        }

        const byIndex = new Map();
        for (const item of accepted) {
            const idx = Number(item?.index);
            if (!Number.isInteger(idx) || idx < 0 || idx >= before.length) continue;
            byIndex.set(idx, String(item.text ?? ''));
        }
        if (!byIndex.size) return null;

        return before.map((c, i) => {
            if (!byIndex.has(i)) {
                return {
                    startMs: c.startMs,
                    endMs: c.endMs,
                    text: c.text ?? '',
                };
            }
            const ac = after[i] || c;
            return {
                startMs: ac.startMs,
                endMs: ac.endMs,
                text: byIndex.get(i),
            };
        });
    }

    return {
        cueEndMs,
        cueDurationMs,
        cloneCues,
        getCueCps,
        normalizeQcOptions,
        scanCueIssues,
        summarizeScan,
        summarizeRemaining,
        applySmartAdjustToCues,
        fixInvalidCueTimings,
        applyQcFixes,
        buildQcOptionsForIssueType,
        buildQcFixEstimate,
        buildQcFixPlan,
        buildQcReviewRows,
        applyQcAcceptedFixes,
        hasQcFixEffect,
        trySmartSplitCue,
        AUTO_FIXABLE_TYPES,
    };
}));
