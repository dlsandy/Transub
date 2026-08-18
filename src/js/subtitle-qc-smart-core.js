/**
 * QC 智能处理（Pro）：挑选规则修不掉的条目，供智能断句 / 局部重转写 / 语境重构润色。
 * 纯逻辑，无网络；浏览器与 Node 测试共用。
 */
(function (global, factory) {
    const splitCore = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-split-core')
        : (global && global.TransubSubtitleSplit);
    const api = factory(splitCore || {});
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleQcSmart = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleQcSmartCoreFactory(splitCore) {
    const fluencyCore = (typeof module !== 'undefined' && module.exports)
        ? (() => { try { return require('./subtitle-fluency-core'); } catch { return null; } })()
        : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleFluency : null);

    const DEFAULT_MAX_SMART_CUES = 40;
    const DEFAULT_NEIGHBOR_RADIUS = 1;
    const DEFAULT_SMART_TYPES = Object.freeze(['fluency', 'connected', 'weird']);
    const DEFAULT_RETRANSCRIBE_TYPES = Object.freeze(['connected']);
    const DEFAULT_LLM_SPLIT_TYPES = Object.freeze(['connected', 'high_cps', 'long', 'splittable']);
    const DEFAULT_MAX_LLM_SPLIT = 24;
    const DEFAULT_MAX_RETRANSCRIBE_RANGES = 8;
    const DEFAULT_MAX_RANGE_SEC = 45;
    const DEFAULT_MERGE_GAP_MS = 800;
    const DEFAULT_PAD_MS = 350;

    const QC_SMART_NOTE = [
        '本批为 QC 智能修复：整理不通顺语句，并清除莫名其妙/乱码碎片、模型泄漏残留、占位符与明显误译。',
        '只做通顺与清怪，勿整句创作式改写，勿改剧情语气与专名语义。',
        '保持每条 index 不变，不要合并或拆分，不要改时间轴，不要编造剧情。',
        '保留句末语气词；勿把有语义对白压成单字语气词；勿擅自删除纯拟声条目。',
        '改动宜小；若原文语义已清楚且通顺无怪字，可原样返回。',
    ].join('');

    /**
     * Heuristic: cue text looks pathologically weird (MT junk / placeholders / symbol soup).
     * Used to feed LLM polish beyond rule fluency flags — not a film-specific remap.
     */
    function looksLikeWeirdCueText(text) {
        if (typeof fluencyCore?.looksLikeWeirdCueText === 'function') {
            return fluencyCore.looksLikeWeirdCueText(text);
        }
        const t = String(text || '').trim();
        if (!t) return false;
        if (/__GLOSS\d*__|__GLOS\d*__|Gloss#{0,4}\d+_*/i.test(t)) return true;
        if (/GLOS?S?\d{2,8}/i.test(t)) return true;
        if (/__[^_\n]{1,64}__/.test(t)) return true;
        if (/改成[：:]/.test(t)) return true;
        if (/(?:系统|提示|指令)\s*[:：]/.test(t) && /翻译|字幕|角色/.test(t)) return true;
        const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
        const latin = (t.match(/[A-Za-z]/g) || []).length;
        if (cjk >= 2 && latin >= 8 && latin > cjk) return true;
        const symbols = (t.match(/[^\w\u4e00-\u9fff\u3040-\u30ff\s]/g) || []).length;
        if (t.length >= 6 && symbols / t.length >= 0.45) return true;
        if (/([。！？!?…])\1{3,}/.test(t)) return true;
        if (/^[，、,]{2,}/.test(t) || /[，、,]{3,}/.test(t)) return true;
        if (cjk >= 1 && /[A-Za-z]{4,}\d{2,}/.test(t) && t.length <= 40) return true;
        return false;
    }

    /**
     * Append synthetic weird issues for cues that look broken but were not QC-flagged.
     * @returns {object[]}
     */
    function mergeWeirdTextIssues(cues, issues) {
        const list = Array.isArray(cues) ? cues : [];
        const out = Array.isArray(issues) ? issues.map((it) => ({
            ...it,
            types: Array.isArray(it?.types) ? it.types.slice() : [],
            messages: Array.isArray(it?.messages) ? it.messages.slice() : [],
        })) : [];
        const byIndex = new Map();
        for (const issue of out) {
            const idx = Number(issue?.index);
            if (Number.isInteger(idx) && idx >= 0) byIndex.set(idx, issue);
        }
        for (let i = 0; i < list.length; i += 1) {
            const text = String(list[i]?.text ?? '');
            if (!looksLikeWeirdCueText(text)) continue;
            const existing = byIndex.get(i);
            if (existing) {
                if (!existing.types.includes('weird')) existing.types.push('weird');
                if (!existing.types.includes('fluency')) existing.types.push('fluency');
                if (!existing.messages.some((m) => /怪|乱码|泄漏|占位/.test(String(m || '')))) {
                    existing.messages.push('疑似怪句/乱码/泄漏残留');
                }
            } else {
                const issue = {
                    index: i,
                    types: ['weird', 'fluency'],
                    messages: ['疑似怪句/乱码/泄漏残留'],
                    textPreview: text.slice(0, 80),
                };
                out.push(issue);
                byIndex.set(i, issue);
            }
        }
        return out;
    }

    function clampInt(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, Math.round(n)));
    }

    function cueEndMs(cue) {
        if (!cue) return 0;
        if (cue.endMs != null && Number.isFinite(Number(cue.endMs))) return Number(cue.endMs);
        return (Number(cue.startMs) || 0) + 2000;
    }

    /**
     * 从 QC issues 中挑选适合 LLM 润色的条目（按优先级截断）。
     * @returns {{ index: number, types: string[], score: number, messages: string[] }[]}
     */
    function selectQcSmartTargets(issues, options = {}) {
        const max = clampInt(options.maxSmartCues, 1, 200, DEFAULT_MAX_SMART_CUES);
        const typeSet = new Set(
            Array.isArray(options.types) && options.types.length
                ? options.types.map((t) => String(t || '').trim()).filter(Boolean)
                : DEFAULT_SMART_TYPES,
        );
        const scored = [];
        for (const issue of Array.isArray(issues) ? issues : []) {
            const idx = Number(issue?.index);
            if (!Number.isInteger(idx) || idx < 0) continue;
            const types = Array.isArray(issue.types) ? issue.types : [];
            const hit = types.filter((t) => typeSet.has(t));
            if (!hit.length) continue;
            let score = 0;
            if (types.includes('weird')) score += 4;
            if (types.includes('fluency')) score += 3;
            if (types.includes('connected')) score += 2;
            if (types.includes('high_cps')) score += 1;
            if (types.includes('duplicate')) score += 1;
            scored.push({
                index: idx,
                types: hit,
                score,
                messages: Array.isArray(issue.messages) ? issue.messages.slice() : [],
            });
        }
        scored.sort((a, b) => b.score - a.score || a.index - b.index);
        return scored.slice(0, max);
    }

    /**
     * 挑选适合局部重转写的条目：默认 connected（高 CPS 且无法智能分割）。
     * @returns {{ index: number, types: string[], score: number, messages: string[] }[]}
     */
    function selectQcRetranscribeTargets(issues, options = {}) {
        const max = clampInt(options.maxTargets, 1, 200, 24);
        const typeSet = new Set(
            Array.isArray(options.types) && options.types.length
                ? options.types.map((t) => String(t || '').trim()).filter(Boolean)
                : DEFAULT_RETRANSCRIBE_TYPES,
        );
        const scored = [];
        for (const issue of Array.isArray(issues) ? issues : []) {
            const idx = Number(issue?.index);
            if (!Number.isInteger(idx) || idx < 0) continue;
            const types = Array.isArray(issue.types) ? issue.types : [];
            const hit = types.filter((t) => typeSet.has(t));
            if (!hit.length) continue;
            let score = 0;
            if (types.includes('connected')) score += 4;
            if (types.includes('high_cps')) score += 2;
            if (types.includes('overlap')) score += 1;
            if (types.includes('fluency')) score += 1;
            scored.push({
                index: idx,
                types: hit,
                score,
                messages: Array.isArray(issue.messages) ? issue.messages.slice() : [],
            });
        }
        scored.sort((a, b) => a.index - b.index || b.score - a.score);
        return scored.slice(0, max);
    }

    /**
     * 将目标 index 合并为可重转写的时间窗（邻接/近邻合并，过长则切开）。
     * @returns {{ startMs: number, endMs: number, indexes: number[], durationMs: number }[]}
     */
    function buildQcRetranscribeRanges(cues, indexes, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const idxList = [...new Set((Array.isArray(indexes) ? indexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0 && n < list.length))]
            .sort((a, b) => a - b);
        if (!idxList.length) return [];

        const mergeGapMs = clampInt(options.mergeAdjacentGapMs, 0, 5000, DEFAULT_MERGE_GAP_MS);
        const maxDurMs = Math.max(1000, Math.round((Number(options.maxDurationSec) || DEFAULT_MAX_RANGE_SEC) * 1000));
        const maxRanges = clampInt(options.maxRanges, 1, 40, DEFAULT_MAX_RETRANSCRIBE_RANGES);

        // 先按 index 邻接聚类，再按时间间隙合并
        const clusters = [];
        let cur = { indexes: [idxList[0]] };
        for (let i = 1; i < idxList.length; i += 1) {
            const prev = idxList[i - 1];
            const next = idxList[i];
            const prevEnd = cueEndMs(list[prev]);
            const nextStart = Number(list[next]?.startMs) || 0;
            const adjacent = next === prev + 1 || (nextStart - prevEnd) <= mergeGapMs;
            if (adjacent) cur.indexes.push(next);
            else {
                clusters.push(cur);
                cur = { indexes: [next] };
            }
        }
        clusters.push(cur);

        const ranges = [];
        for (const cluster of clusters) {
            let startMs = Number(list[cluster.indexes[0]]?.startMs) || 0;
            let endMs = cueEndMs(list[cluster.indexes[0]]);
            const bucket = [cluster.indexes[0]];
            for (let k = 1; k < cluster.indexes.length; k += 1) {
                const idx = cluster.indexes[k];
                const cStart = Number(list[idx]?.startMs) || 0;
                const cEnd = cueEndMs(list[idx]);
                const nextEnd = Math.max(endMs, cEnd);
                if (nextEnd - startMs > maxDurMs && bucket.length) {
                    ranges.push({
                        startMs,
                        endMs: Math.max(startMs + 200, endMs),
                        indexes: bucket.slice(),
                        durationMs: Math.max(200, endMs - startMs),
                    });
                    startMs = cStart;
                    endMs = cEnd;
                    bucket.length = 0;
                    bucket.push(idx);
                } else {
                    endMs = nextEnd;
                    bucket.push(idx);
                }
            }
            if (bucket.length) {
                ranges.push({
                    startMs,
                    endMs: Math.max(startMs + 200, endMs),
                    indexes: bucket.slice(),
                    durationMs: Math.max(200, endMs - startMs),
                });
            }
        }

        // 按时长优先（更难读的长窗优先），再截断
        ranges.sort((a, b) => b.durationMs - a.durationMs || a.startMs - b.startMs);
        const limited = ranges.slice(0, maxRanges);
        limited.sort((a, b) => a.startMs - b.startMs);
        return limited;
    }

    /**
     * Plan merged time windows for low-confidence cue retranscription.
     * @param {object[]} cues
     * @param {number[]|object[]} indexesOrMeta cue indexes, or cueMeta/annotation rows with `.low`
     * @returns {{ indexes: number[], ranges: object[], cueCount: number, rangeCount: number }}
     */
    function planLowConfidenceRetranscribeRanges(cues, indexesOrMeta, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const maxCues = clampInt(options.maxCues, 1, 200, 50);
        const raw = Array.isArray(indexesOrMeta) ? indexesOrMeta : [];
        let indexes = [];
        if (raw.length && (typeof raw[0] === 'number' || Number.isInteger(Number(raw[0])))) {
            indexes = raw
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n) && n >= 0 && n < list.length);
        } else {
            for (let i = 0; i < raw.length; i += 1) {
                const row = raw[i];
                if (!row?.low) continue;
                const idx = Number.isInteger(Number(row.index)) ? Number(row.index) : i;
                if (idx >= 0 && idx < list.length) indexes.push(idx);
            }
            if (!indexes.length && list.length) {
                // cueMeta sparse array aligned by cue index
                for (let i = 0; i < list.length; i += 1) {
                    if (raw[i]?.low) indexes.push(i);
                }
            }
        }
        indexes = [...new Set(indexes)].sort((a, b) => a - b).slice(0, maxCues);
        const ranges = buildQcRetranscribeRanges(list, indexes, options);
        return {
            indexes,
            ranges,
            cueCount: indexes.length,
            rangeCount: ranges.length,
        };
    }

    function summarizeQcRetranscribePlan(ranges, options = {}) {
        const n = Array.isArray(ranges) ? ranges.length : 0;
        if (!n) return '无需局部重转写';
        const cueCount = ranges.reduce((sum, r) => sum + (r.indexes?.length || 0), 0);
        const max = clampInt(options.maxRanges, 1, 40, DEFAULT_MAX_RETRANSCRIBE_RANGES);
        const lowN = Number(options.lowConfidenceCueCount) || 0;
        const connN = Number(options.connectedCueCount) || 0;
        const parts = [`将对 ${n} 个时间窗重转写（覆盖约 ${cueCount} 条）`];
        if (connN) parts.push(`连续 ${connN}`);
        if (lowN) parts.push(`低置信 ${lowN}`);
        if (ranges.length >= max) parts.push(`已截断至 ${max} 窗`);
        return parts.join(' · ');
    }

    /**
     * Batch QC: merge connected-issue ranges with low-confidence ASR windows under one budget.
     * Connected windows fill first; leftover slots go to low-confidence only.
     * @returns {{
     *   ranges: object[],
     *   indexes: number[],
     *   connectedIndexes: number[],
     *   lowConfidenceIndexes: number[],
     *   plan: string,
     * }}
     */
    function planMergedQcRetranscribeRanges(cues, issues, lowConfidenceIndexes, options = {}) {
        const maxRanges = clampInt(
            options.maxRanges,
            1,
            40,
            DEFAULT_MAX_RETRANSCRIBE_RANGES,
        );
        const rangeOpts = {
            maxRanges,
            maxDurationSec: options.maxDurationSec,
            mergeAdjacentGapMs: options.mergeAdjacentGapMs,
        };
        const connectedTargets = selectQcRetranscribeTargets(issues, {
            maxTargets: options.maxTargets,
            types: options.types,
        });
        const connectedIndexes = connectedTargets.map((t) => Number(t.index))
            .filter((n) => Number.isInteger(n) && n >= 0);
        const lowIndexes = [...new Set((Array.isArray(lowConfidenceIndexes) ? lowConfidenceIndexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0))]
            .sort((a, b) => a - b);

        const connectedRanges = buildQcRetranscribeRanges(cues, connectedIndexes, rangeOpts);
        const covered = new Set();
        for (const r of connectedRanges) {
            for (const idx of r.indexes || []) covered.add(Number(idx));
        }

        let lowRanges = [];
        const leftoverSlots = Math.max(0, maxRanges - connectedRanges.length);
        if (leftoverSlots > 0 && lowIndexes.length) {
            const leftoverLow = lowIndexes.filter((idx) => !covered.has(idx));
            if (leftoverLow.length) {
                lowRanges = buildQcRetranscribeRanges(cues, leftoverLow, {
                    ...rangeOpts,
                    maxRanges: leftoverSlots,
                });
            }
        }

        const ranges = [...connectedRanges, ...lowRanges]
            .sort((a, b) => a.startMs - b.startMs);
        const indexes = [...new Set(ranges.flatMap((r) => r.indexes || []))]
            .sort((a, b) => a - b);
        const lowUsed = lowIndexes.filter((idx) => indexes.includes(idx)).length;
        return {
            ranges,
            indexes,
            connectedIndexes,
            lowConfidenceIndexes: lowIndexes,
            plan: summarizeQcRetranscribePlan(ranges, {
                maxRanges,
                connectedCueCount: connectedIndexes.length,
                lowConfidenceCueCount: lowUsed,
            }),
        };
    }

    /**
     * After autofix rescan: residual cues worth harvest / train feed (not auto LLM rewrite).
     * @returns {{
     *   blank: number[],
     *   fluency: number[],
     *   weird: number[],
     *   lowConfidence: number[],
     *   total: number,
     *   summary: string,
     * }}
     */
    function planPostBatchResidualHarvest(issues, options = {}) {
        const blank = [];
        const fluency = [];
        const weird = [];
        const lowConfidence = [];
        const seen = {
            blank: new Set(),
            fluency: new Set(),
            weird: new Set(),
            lowConfidence: new Set(),
        };
        const push = (key, bucket, idx) => {
            const n = Number(idx);
            if (!Number.isInteger(n) || n < 0 || seen[key].has(n)) return;
            seen[key].add(n);
            bucket.push(n);
        };
        for (const issue of Array.isArray(issues) ? issues : []) {
            const idx = Number(issue?.index);
            if (!Number.isInteger(idx) || idx < 0) continue;
            const types = Array.isArray(issue.types) ? issue.types : [];
            const preview = String(issue.textPreview || issue.text || '').trim();
            if (types.includes('weird')) push('weird', weird, idx);
            if (types.includes('fluency')) push('fluency', fluency, idx);
            if (types.includes('low_confidence') || types.includes('asr_low')) {
                push('lowConfidence', lowConfidence, idx);
            }
            if (types.includes('blank') || isBlankOrEllipsisZh(preview)) {
                push('blank', blank, idx);
            }
        }
        for (const idx of Array.isArray(options.lowConfidenceIndexes) ? options.lowConfidenceIndexes : []) {
            push('lowConfidence', lowConfidence, idx);
        }
        for (const idx of Array.isArray(options.blankIndexes) ? options.blankIndexes : []) {
            push('blank', blank, idx);
        }
        const total = new Set([...blank, ...fluency, ...weird, ...lowConfidence]).size;
        const parts = [];
        if (blank.length) parts.push(`空/省略 ${blank.length}（可补译）`);
        if (fluency.length) parts.push(`通顺度 ${fluency.length}`);
        if (weird.length) parts.push(`怪句 ${weird.length}`);
        if (lowConfidence.length) parts.push(`低置信 ${lowConfidence.length}`);
        return {
            blank,
            fluency,
            weird,
            lowConfidence,
            total,
            summary: total
                ? `仍有 ${total} 条建议对照训练（${parts.join(' · ')}）`
                : '无残留训练候选',
        };
    }

    function isBlankOrEllipsisZh(text) {
        const t = String(text || '').trim();
        if (!t) return true;
        if (t === '…' || t === '...' || t === '⋯') return true;
        return /^[….\s]+$/.test(t);
    }

    /**
     * ZH blank/ellipsis with JA substance — prefer semantic 补译 (e.g. after ASR second-opinion blanks).
     * @returns {number[]}
     */
    function collectBlankEllipsisIndexes(targetCues, pairCues, options = {}) {
        const targets = Array.isArray(targetCues) ? targetCues : [];
        const pairsSrc = Array.isArray(pairCues) ? pairCues : [];
        const findOverlap = typeof options.findBestOverlapCue === 'function'
            ? options.findBestOverlapCue
            : null;
        const minSrcChars = Math.max(1, Math.min(20, Number(options.minSourceChars) || 2));
        const max = Math.max(1, Math.min(80, Number(options.maxIndexes) || 40));
        const out = [];
        for (let index = 0; index < targets.length; index += 1) {
            const cue = targets[index];
            if (!isBlankOrEllipsisZh(cue?.text)) continue;
            const startMs = Number(cue?.startMs) || 0;
            const endMs = cueEndMs(cue);
            let source = '';
            if (findOverlap && pairsSrc.length) {
                try {
                    const hit = findOverlap(pairsSrc, startMs, endMs);
                    source = String(hit?.cue?.text || hit?.text || '').trim();
                } catch (_) {
                    source = '';
                }
            }
            if (!source) source = String(pairsSrc[index]?.text || '').trim();
            const srcChars = Array.from(source.replace(/\s+/g, '')).length;
            if (srcChars < minSrcChars) continue;
            out.push(index);
            if (out.length >= max) break;
        }
        return out;
    }

    /**
     * Inject synthetic blank issues so semantic review / harvest see ellipsis cues.
     */
    function mergeBlankEllipsisIssues(cues, issues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const blankIndexes = Array.isArray(options.blankIndexes)
            ? options.blankIndexes
            : collectBlankEllipsisIndexes(list, options.pairCues, options);
        if (!blankIndexes.length) return Array.isArray(issues) ? issues.slice() : [];
        const byIndex = new Map();
        for (const issue of Array.isArray(issues) ? issues : []) {
            const idx = Number(issue?.index);
            if (!Number.isInteger(idx) || idx < 0) continue;
            const prev = byIndex.get(idx);
            if (!prev) {
                byIndex.set(idx, {
                    ...issue,
                    index: idx,
                    types: Array.isArray(issue.types) ? issue.types.slice() : [],
                    messages: Array.isArray(issue.messages) ? issue.messages.slice() : [],
                    textPreview: issue.textPreview || issue.text || String(list[idx]?.text || ''),
                });
            } else {
                for (const t of (issue.types || [])) {
                    if (!prev.types.includes(t)) prev.types.push(t);
                }
            }
        }
        for (const idx of blankIndexes) {
            const n = Number(idx);
            if (!Number.isInteger(n) || n < 0 || n >= list.length) continue;
            const row = byIndex.get(n) || {
                index: n,
                types: [],
                messages: [],
                textPreview: String(list[n]?.text || '…'),
            };
            if (!row.types.includes('blank')) row.types.push('blank');
            if (!row.messages.includes('空/省略译')) row.messages.push('空/省略译');
            row.textPreview = row.textPreview || String(list[n]?.text || '…');
            byIndex.set(n, row);
        }
        return [...byIndex.values()].sort((a, b) => a.index - b.index);
    }

    /**
     * 为目标 index 扩邻域，给 LLM 一点上下文；写回时仍可只应用 targetIndexes。
     */
    function expandIndexesWithNeighbors(indexes, cueCount, radius = DEFAULT_NEIGHBOR_RADIUS) {
        const r = clampInt(radius, 0, 3, DEFAULT_NEIGHBOR_RADIUS);
        const total = Math.max(0, Number(cueCount) || 0);
        const set = new Set();
        for (const raw of Array.isArray(indexes) ? indexes : []) {
            const i = Number(raw);
            if (!Number.isInteger(i) || i < 0 || i >= total) continue;
            for (let d = -r; d <= r; d += 1) {
                const j = i + d;
                if (j >= 0 && j < total) set.add(j);
            }
        }
        return [...set].sort((a, b) => a - b);
    }

    function buildQcSmartCuePayload(cues, indexes, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const pairCues = Array.isArray(options.pairCues) ? options.pairCues : null;
        const findOverlap = typeof options.findBestOverlapCue === 'function'
            ? options.findBestOverlapCue
            : null;
        return (Array.isArray(indexes) ? indexes : []).map((idx) => {
            const cue = list[idx];
            let sourceText = '';
            if (pairCues && findOverlap && cue) {
                try {
                    const hit = findOverlap(pairCues, cue.startMs, cue.endMs);
                    sourceText = String(hit?.cue?.text || hit?.text || '');
                } catch {
                    sourceText = '';
                }
            }
            return {
                index: idx,
                startMs: cue?.startMs,
                endMs: cue?.endMs,
                text: String(cue?.text ?? ''),
                sourceText,
            };
        }).filter((c) => Number.isInteger(c.index));
    }

    /**
     * 将 LLM 返回的 cues/updates 写回；仅改 text，且默认只改 allowIndexes。
     */
    function applyQcSmartUpdates(cues, updates, options = {}) {
        const next = (Array.isArray(cues) ? cues : []).map((c) => ({
            startMs: c?.startMs,
            endMs: c?.endMs,
            text: c?.text ?? '',
        }));
        const allow = options.allowIndexes == null
            ? null
            : new Set((Array.isArray(options.allowIndexes) ? options.allowIndexes : [])
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n)));
        let changed = 0;
        const changedIndexes = [];
        for (const u of Array.isArray(updates) ? updates : []) {
            const idx = Number(u?.index);
            if (!Number.isInteger(idx) || !next[idx]) continue;
            if (allow && !allow.has(idx)) continue;
            const after = String(u?.text ?? '');
            const before = String(next[idx].text ?? '');
            if (after === before) continue;
            next[idx] = { ...next[idx], text: after };
            changed += 1;
            changedIndexes.push(idx);
        }
        return { cues: next, changed, changedIndexes };
    }

    function buildQcSmartReconstructOptions(options = {}) {
        return {
            preserveTiming: options.preserveTiming !== false,
            intensity: options.intensity || 'light',
            windowCues: clampInt(options.windowCues, 5, 40, 16),
            note: String(options.note || QC_SMART_NOTE).trim(),
            userNote: String(options.userNote || options.note || QC_SMART_NOTE).trim(),
        };
    }

    function summarizeQcSmartPlan(targets, options = {}) {
        const n = Array.isArray(targets) ? targets.length : 0;
        if (!n) return '规则修复后无需智能润色';
        const max = clampInt(options.maxSmartCues, 1, 200, DEFAULT_MAX_SMART_CUES);
        const weird = targets.filter((t) => t.types?.includes('weird')).length;
        const fluency = targets.filter((t) => t.types?.includes('fluency')).length;
        const connected = targets.filter((t) => t.types?.includes('connected')).length;
        const parts = [`将对 ${n} 条做智能润色`];
        if (weird) parts.push(`怪句 ${weird}`);
        if (fluency) parts.push(`通顺度 ${fluency}`);
        if (connected) parts.push(`连续文本 ${connected}`);
        if (n >= max) parts.push(`已截断至 ${max} 条`);
        return parts.join(' · ');
    }

    /**
     * 挑选适合 LLM 智能断句的条目（规则分割失败或仍过长/过快）。
     */
    function selectQcLlmSplitTargets(issues, options = {}) {
        const max = clampInt(options.maxTargets, 1, 200, DEFAULT_MAX_LLM_SPLIT);
        const minChars = clampInt(options.minChars, 4, 200, 18);
        const typeSet = new Set(
            Array.isArray(options.types) && options.types.length
                ? options.types.map((t) => String(t || '').trim()).filter(Boolean)
                : DEFAULT_LLM_SPLIT_TYPES,
        );
        const scored = [];
        for (const issue of Array.isArray(issues) ? issues : []) {
            const idx = Number(issue?.index);
            if (!Number.isInteger(idx) || idx < 0) continue;
            const types = Array.isArray(issue.types) ? issue.types : [];
            const hit = types.filter((t) => typeSet.has(t));
            if (!hit.length) continue;
            const preview = String(issue.textPreview || '');
            if (preview && preview.replace(/\s/g, '').length < minChars
                && !types.includes('connected') && !types.includes('high_cps')) {
                continue;
            }
            let score = 0;
            if (types.includes('connected')) score += 4;
            if (types.includes('high_cps')) score += 3;
            if (types.includes('splittable')) score += 2;
            if (types.includes('long')) score += 1;
            scored.push({
                index: idx,
                types: hit,
                score,
                messages: Array.isArray(issue.messages) ? issue.messages.slice() : [],
                cps: issue.cps,
            });
        }
        scored.sort((a, b) => b.score - a.score || a.index - b.index);
        return scored.slice(0, max);
    }

    function buildQcLlmSplitPayload(cues, targets, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const maxChars = clampInt(options.smartMaxChars, 4, 80, 20);
        return (Array.isArray(targets) ? targets : []).map((t) => {
            const idx = Number(t?.index);
            const cue = list[idx];
            const text = String(cue?.text ?? '');
            const chars = text.replace(/\s/g, '').length;
            const targetParts = Math.max(2, Math.min(6, Math.ceil(chars / maxChars) || 2));
            return {
                index: idx,
                startMs: cue?.startMs,
                endMs: cue?.endMs,
                text,
                cps: t?.cps != null ? t.cps : null,
                types: Array.isArray(t?.types) ? t.types : [],
                maxChars,
                targetParts,
            };
        }).filter((row) => Number.isInteger(row.index) && row.text);
    }

    function buildLlmSplitChatMessages(items) {
        const system = [
            '你是字幕断句助手。根据语义把过长/过快的字幕切成多条短字幕。',
            '不要改写措辞，不要增删字词，只决定切分位置。',
            'breakIndices 为 JavaScript 字符串下标（String.slice），严格递增，且落在 (0, text.length) 内。',
            '每段至少 2 个字符；优先在标点、语气停顿、连词后切开。',
            '只输出 JSON：{"splits":[{"index":0,"breakIndices":[12,28]}]}',
            '不必覆盖全部输入；无法安全切分的条目可省略。',
        ].join('\n');
        const payload = (Array.isArray(items) ? items : []).map((it) => ({
            index: it.index,
            text: it.text,
            maxChars: it.maxChars,
            targetParts: it.targetParts,
            types: it.types,
        }));
        return [
            { role: 'system', content: system },
            { role: 'user', content: `待断句字幕：\n${JSON.stringify(payload, null, 2)}` },
        ];
    }

    function textsFromBreakIndices(text, breakIndices) {
        const raw = String(text ?? '');
        if (!raw) return null;
        const breaks = [...new Set((Array.isArray(breakIndices) ? breakIndices : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n > 0 && n < raw.length))]
            .sort((a, b) => a - b);
        if (!breaks.length) return null;
        const parts = [];
        let prev = 0;
        for (const at of breaks) {
            const chunk = raw.slice(prev, at).trim();
            if (chunk.length < 2) return null;
            parts.push(chunk);
            prev = at;
        }
        const last = raw.slice(prev).trim();
        if (last.length < 2) return null;
        parts.push(last);
        return parts.length >= 2 ? parts : null;
    }

    function parseLlmSplitResponse(content, expectedIndexes) {
        const expect = new Set((Array.isArray(expectedIndexes) ? expectedIndexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n)));
        let raw = String(content || '').trim();
        raw = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
        const start = raw.search(/\{/);
        if (start >= 0) raw = raw.slice(start);
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            const m = raw.match(/\{[\s\S]*"splits"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
            if (!m) return { ok: false, error: '无法解析断句 JSON', snippet: raw.slice(0, 180) };
            try {
                parsed = JSON.parse(m[0]);
            } catch {
                return { ok: false, error: '无法解析断句 JSON', snippet: raw.slice(0, 180) };
            }
        }
        const list = Array.isArray(parsed?.splits) ? parsed.splits : [];
        const splits = [];
        for (const row of list) {
            const index = Number(row?.index);
            if (!Number.isInteger(index)) continue;
            if (expect.size && !expect.has(index)) continue;
            const breakIndices = Array.isArray(row?.breakIndices)
                ? row.breakIndices
                : (Array.isArray(row?.breaks) ? row.breaks : []);
            if (!breakIndices.length && Array.isArray(row?.texts) && row.texts.length >= 2) {
                // 允许模型直接返回 texts：回推 breakIndices（尽力）
                splits.push({ index, texts: row.texts.map((t) => String(t || '').trim()).filter(Boolean) });
                continue;
            }
            splits.push({ index, breakIndices });
        }
        if (!splits.length) return { ok: false, error: '模型未返回有效断句' };
        return { ok: true, splits };
    }

    /**
     * 无 LLM 的本地模拟：按 maxChars 在中段附近切开（便于 mock / 测试）。
     */
    function mockLlmSplitCues(items) {
        const splits = [];
        for (const it of Array.isArray(items) ? items : []) {
            const text = String(it?.text || '');
            const maxChars = clampInt(it?.maxChars, 4, 80, 20);
            if (text.replace(/\s/g, '').length <= maxChars) continue;
            const targetParts = clampInt(it?.targetParts, 2, 6, 2);
            const breakIndices = [];
            for (let p = 1; p < targetParts; p += 1) {
                const ideal = Math.round((text.length * p) / targetParts);
                let at = Math.max(2, Math.min(text.length - 2, ideal));
                // 向左右找标点/空白
                let best = at;
                for (let d = 0; d < 8; d += 1) {
                    for (const pos of [at + d, at - d]) {
                        if (pos <= 1 || pos >= text.length - 1) continue;
                        const ch = text[pos - 1];
                        if (/[。！？!?…，、；;:\s]/.test(ch)) {
                            best = pos;
                            d = 99;
                            break;
                        }
                    }
                }
                if (!breakIndices.includes(best)) breakIndices.push(best);
            }
            breakIndices.sort((a, b) => a - b);
            if (breakIndices.length) splits.push({ index: it.index, breakIndices });
        }
        return { ok: true, splits, mock: true };
    }

    function applyQcLlmSplitResults(cues, splits, options = {}) {
        const list = (Array.isArray(cues) ? cues : []).map((c) => ({
            startMs: c?.startMs,
            endMs: c?.endMs,
            text: c?.text ?? '',
        }));
        const byIndex = new Map();
        for (const s of Array.isArray(splits) ? splits : []) {
            const idx = Number(s?.index);
            if (!Number.isInteger(idx) || !list[idx]) continue;
            byIndex.set(idx, s);
        }
        if (!byIndex.size) {
            return { cues: list, splitCount: 0, added: 0, changedIndexes: [] };
        }

        const targetCps = Math.max(0.1, Number(options.targetCps) || 3);
        const minDurMs = Math.max(100, Math.round((Number(options.minSec) || 0.5) * 1000));
        const useCps = options.useCpsTime !== false;
        const indexes = [...byIndex.keys()].sort((a, b) => b - a);
        let splitCount = 0;
        let added = 0;
        const changedIndexes = [];

        for (const idx of indexes) {
            const spec = byIndex.get(idx);
            const cue = list[idx];
            const text = String(cue?.text ?? '');
            let texts = Array.isArray(spec?.texts) && spec.texts.length >= 2
                ? spec.texts.map((t) => String(t || '').trim()).filter(Boolean)
                : textsFromBreakIndices(text, spec?.breakIndices);
            if (!texts || texts.length < 2) continue;
            if (!splitCore?.buildCuesFromTexts) continue;
            const built = splitCore.buildCuesFromTexts(
                Number(cue.startMs) || 0,
                cue.endMs != null ? Number(cue.endMs) : (Number(cue.startMs) || 0) + 2000,
                texts,
                useCps ? 'cps' : 'proportional',
                { targetCps, minDurMs },
            );
            if (!built || built.length < 2) continue;
            list.splice(idx, 1, ...built.map((c) => ({
                startMs: c.startMs,
                endMs: c.endMs,
                text: c.text ?? '',
            })));
            splitCount += 1;
            added += built.length - 1;
            changedIndexes.push(idx);
        }

        return { cues: list, splitCount, added, changedIndexes };
    }

    function summarizeQcLlmSplitPlan(targets, options = {}) {
        const n = Array.isArray(targets) ? targets.length : 0;
        if (!n) return '无需智能断句';
        const max = clampInt(options.maxTargets, 1, 200, DEFAULT_MAX_LLM_SPLIT);
        const parts = [`将对 ${n} 条做智能断句`];
        if (n >= max) parts.push(`已截断至 ${max} 条`);
        return parts.join(' · ');
    }

    const QC_SEMANTIC_NOTE = [
        '本批为 QC 联动语义审阅：优先检查问题字幕的漏译、错译与专名。',
        '若给出 suggestedTarget，请可直接替换该条译文，勿改时间轴。',
    ].join('');

    /**
     * 从 QC issues 中取待语义审阅的 index（preferIndexes 优先，空/省略次之，去重截断）。
     * @returns {number[]}
     */
    function selectQcSemanticIndexes(issues, options = {}) {
        const max = clampInt(options.maxPairs, 1, 80, 40);
        const prefer = Array.isArray(options.preferIndexes)
            ? options.preferIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0)
            : [];
        const blankPrefer = Array.isArray(options.blankPreferIndexes)
            ? options.blankPreferIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0)
            : [];
        const fromBlankIssues = [];
        const fromIssues = [];
        const seen = new Set();
        for (const issue of Array.isArray(issues) ? issues : []) {
            const idx = Number(issue?.index);
            if (!Number.isInteger(idx) || idx < 0 || seen.has(idx)) continue;
            seen.add(idx);
            const types = Array.isArray(issue.types) ? issue.types : [];
            const preview = String(issue.textPreview || issue.text || '').trim();
            if (types.includes('blank') || isBlankOrEllipsisZh(preview)) {
                fromBlankIssues.push(idx);
            } else {
                fromIssues.push(idx);
            }
        }
        const out = [];
        const used = new Set();
        const pushAll = (arr) => {
            for (const idx of arr) {
                if (used.has(idx)) continue;
                used.add(idx);
                out.push(idx);
                if (out.length >= max) return true;
            }
            return false;
        };
        if (pushAll(prefer)) return out;
        if (pushAll(blankPrefer)) return out;
        if (pushAll(fromBlankIssues)) return out;
        pushAll(fromIssues);
        return out;
    }

    /**
     * 按 index 构建双语审阅 pairs。
     * @param {object[]} targetCues
     * @param {object[]} pairCues
     * @param {number[]} indexes
     * @param {{ findBestOverlapCue?: Function }} [dualApi]
     */
    function buildQcSemanticPairs(targetCues, pairCues, indexes, dualApi = null) {
        const targets = Array.isArray(targetCues) ? targetCues : [];
        const pairsSrc = Array.isArray(pairCues) ? pairCues : [];
        const out = [];
        for (const raw of Array.isArray(indexes) ? indexes : []) {
            const index = Number(raw);
            if (!Number.isInteger(index) || !targets[index]) continue;
            const cue = targets[index];
            const startMs = Number(cue?.startMs) || 0;
            const endMs = cueEndMs(cue);
            const target = String(cue?.text || '').trim();
            let source = '';
            if (dualApi?.findBestOverlapCue) {
                const hit = dualApi.findBestOverlapCue(pairsSrc, startMs, endMs);
                source = String(hit?.cue?.text || '').trim();
            } else {
                source = String(pairsSrc[index]?.text || '').trim();
            }
            if (!source && !target) continue;
            out.push({ index, source, target });
        }
        return out;
    }

    /**
     * 采纳语义审阅建议译文（suggestedTarget）。
     */
    function applyQcSemanticSuggestions(cues, issues, options = {}) {
        const updates = [];
        for (const issue of Array.isArray(issues) ? issues : []) {
            const idx = Number(issue?.index);
            const text = String(issue?.suggestedTarget || '').trim();
            if (!Number.isInteger(idx) || !text) continue;
            updates.push({ index: idx, text });
        }
        return applyQcSmartUpdates(cues, updates, options);
    }

    function summarizeQcSemanticPlan(pairCount, options = {}) {
        const n = Number(pairCount) || 0;
        if (!n) return '无需双语语义审阅';
        const max = clampInt(options.maxPairs, 1, 80, 40);
        const parts = [`将对 ${n} 条做语义审阅`];
        if (options.autoApply !== false) parts.push('可自动采纳建议');
        if (n >= max) parts.push(`已截断至 ${max} 条`);
        return parts.join(' · ');
    }

    function normPathKey(p) {
        return String(p || '').trim().replace(/\\/g, '/').toLowerCase();
    }

    /**
     * 主窗口批处理：为正在修复的译文轨解析对照原文路径。
     * 正在修原文轨时返回空（语义审阅的 target 应为译文）。
     * @param {{ sourceSubtitlePath?: string, targetSubtitlePath?: string, subtitlePath?: string }} item
     * @param {string} fixingPath
     * @returns {string}
     */
    function resolveQcSemanticPairPath(item = {}, fixingPath = '') {
        const fixing = String(fixingPath || '').trim();
        const src = String(item?.sourceSubtitlePath || '').trim();
        if (!fixing || !src) return '';
        // 正在修原文轨时不做「译文语义审阅」
        if (normPathKey(fixing) === normPathKey(src)) return '';
        const tgt = String(item?.targetSubtitlePath || item?.subtitlePath || '').trim();
        // 有明确译文轨时，仅对译文轨附带对照
        if (tgt && normPathKey(fixing) !== normPathKey(tgt)) return '';
        return src;
    }

    return {
        DEFAULT_MAX_SMART_CUES,
        DEFAULT_NEIGHBOR_RADIUS,
        DEFAULT_SMART_TYPES,
        DEFAULT_RETRANSCRIBE_TYPES,
        DEFAULT_LLM_SPLIT_TYPES,
        DEFAULT_MAX_LLM_SPLIT,
        DEFAULT_MAX_RETRANSCRIBE_RANGES,
        DEFAULT_MAX_RANGE_SEC,
        DEFAULT_MERGE_GAP_MS,
        DEFAULT_PAD_MS,
        QC_SMART_NOTE,
        QC_SEMANTIC_NOTE,
        looksLikeWeirdCueText,
        mergeWeirdTextIssues,
        isBlankOrEllipsisZh,
        collectBlankEllipsisIndexes,
        mergeBlankEllipsisIssues,
        selectQcSmartTargets,
        selectQcRetranscribeTargets,
        selectQcLlmSplitTargets,
        selectQcSemanticIndexes,
        buildQcSemanticPairs,
        applyQcSemanticSuggestions,
        summarizeQcSemanticPlan,
        resolveQcSemanticPairPath,
        buildQcRetranscribeRanges,
        planLowConfidenceRetranscribeRanges,
        planMergedQcRetranscribeRanges,
        planPostBatchResidualHarvest,
        summarizeQcRetranscribePlan,
        expandIndexesWithNeighbors,
        buildQcSmartCuePayload,
        buildQcLlmSplitPayload,
        buildLlmSplitChatMessages,
        textsFromBreakIndices,
        parseLlmSplitResponse,
        mockLlmSplitCues,
        applyQcLlmSplitResults,
        summarizeQcLlmSplitPlan,
        applyQcSmartUpdates,
        buildQcSmartReconstructOptions,
        summarizeQcSmartPlan,
        cueEndMs,
    };
}));

