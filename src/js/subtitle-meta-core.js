/**
 * 字幕置信度启发式与 sidecar 合并（浏览器与 Node 测试共用）
 * 真模型概率暂不可用时，用本地规则估可疑条目。
 */
(function (global, factory) {
    const splitCore = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-split-core')
        : (global && global.TransubSubtitleSplit);
    if (!splitCore) {
        throw new Error('subtitle-split-core.js must load before subtitle-meta-core.js');
    }
    const fluencyCore = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-fluency-core')
        : (global && global.TransubSubtitleFluency);
    const api = factory(splitCore, fluencyCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleMeta = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleMetaCoreFactory(splitCore, fluencyCore) {
    const DEFAULT_LOW_THRESHOLD = 0.55;
    const META_VERSION = 1;

    function cueEndMs(cue) {
        return cue.endMs != null ? cue.endMs : cue.startMs + 2000;
    }

    function cueDurationMs(cue) {
        return Math.max(0, cueEndMs(cue) - cue.startMs);
    }

    function getCueCps(cue) {
        const durSec = cueDurationMs(cue) / 1000;
        if (durSec <= 0) return null;
        const chars = splitCore.textCharCount(cue.text);
        if (!chars) return null;
        return chars / durSec;
    }

    function hashText(text) {
        const s = String(text || '');
        let h = 5381;
        for (let i = 0; i < s.length; i += 1) {
            h = ((h << 5) + h) + s.charCodeAt(i);
            h |= 0;
        }
        return (h >>> 0).toString(16);
    }

    function cueFingerprint(cue) {
        return `${Math.round(Number(cue.startMs) || 0)}:${Math.round(cueEndMs(cue))}:${hashText(cue.text)}`;
    }

    function hasHeavyRepetition(text) {
        if (fluencyCore?.hasHeavyRepetition) return fluencyCore.hasHeavyRepetition(text);
        const raw = String(text || '').trim();
        if (raw.length < 6) return false;
        if (/(.)\1{5,}/.test(raw)) return true;
        if (/(.{2,6})\1{3,}/.test(raw)) return true;
        return false;
    }

    /**
     * @returns {{ confidence: number, flags: string[], low: boolean, source: string }}
     */
    function scoreCueConfidence(cue, index, cues, options = {}) {
        const maxCps = Math.max(1, Number(options.maxCps) || 18);
        const minDurMs = Math.max(100, Math.round((Number(options.minSec) || 0.5) * 1000));
        const maxDurMs = Math.max(minDurMs, Math.round((Number(options.maxSec) || 10) * 1000));
        const threshold = Math.max(0.05, Math.min(0.95, Number(options.lowThreshold) || DEFAULT_LOW_THRESHOLD));
        const flags = [];
        let score = 1;

        const text = String(cue?.text || '').trim();
        const start = Number(cue?.startMs) || 0;
        const end = cueEndMs(cue);
        const dur = end - start;
        const prev = index > 0 ? cues[index - 1] : null;
        const next = index < cues.length - 1 ? cues[index + 1] : null;

        if (!text) {
            score -= 0.7;
            flags.push('empty');
        }
        if (end <= start) {
            score -= 0.55;
            flags.push('invalid');
        }
        if (prev && start < cueEndMs(prev)) {
            score -= 0.22;
            flags.push('overlap');
        }
        if (next && end > next.startMs) {
            if (!flags.includes('overlap')) {
                score -= 0.22;
                flags.push('overlap');
            }
        }
        if (dur > 0 && dur < minDurMs) {
            score -= 0.18;
            flags.push('short');
        }
        if (dur > maxDurMs) {
            score -= 0.12;
            flags.push('long');
        }

        const cps = getCueCps(cue);
        if (cps != null && cps > maxCps) {
            score -= Math.min(0.4, 0.15 + (cps - maxCps) / maxCps * 0.25);
            flags.push('high_cps');
        }
        if (cps != null && cps < 0.8 && text.length >= 8 && dur >= 4000) {
            score -= 0.1;
            flags.push('low_cps');
        }

        if (hasHeavyRepetition(text)) {
            score -= 0.35;
            flags.push('repetition');
        }

        if (text && splitCore.isConnectedText(text) && splitCore.textCharCount(text) >= 24
            && !/[。！？!?…，、；：,.;:]/.test(text)) {
            score -= 0.12;
            flags.push('connected');
        }

        if (options.checkFluency !== false && fluencyCore?.analyzeTextFluency && text) {
            const fluency = fluencyCore.analyzeTextFluency(text);
            for (const flag of fluency.flags || []) {
                if (flag === 'empty' || flags.includes(flag)) continue;
                if (flag === 'repetition' || flag === 'no_punct') continue;
                flags.push(flag);
                if (flag === 'stutter') score -= 0.22;
                else if (flag === 'dangling') score -= 0.12;
                else if (flag === 'fragment') score -= 0.16;
                else score -= 0.08;
            }
            const prevText = prev ? String(prev.text || '').trim() : '';
            if (prevText && text && prevText === text && text.length >= 2 && !flags.includes('duplicate')) {
                flags.push('duplicate');
                score -= 0.1;
            }
        }

        const confidence = Math.max(0, Math.min(1, Number(score.toFixed(3))));
        return {
            confidence,
            flags,
            low: confidence < threshold,
            source: 'heuristic',
        };
    }

    function annotateCuesConfidence(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        return list.map((cue, index) => scoreCueConfidence(cue, index, list, options));
    }

    function findSidecarEntry(entries, cue, index) {
        const list = Array.isArray(entries) ? entries : [];
        const fp = cueFingerprint(cue);
        const byFp = list.find((e) => e && e.fingerprint === fp);
        if (byFp) return byFp;
        const start = Math.round(Number(cue.startMs) || 0);
        const text = String(cue.text || '').trim();
        const byTimeText = list.find((e) => {
            if (!e) return false;
            if (Math.abs(Math.round(Number(e.startMs) || 0) - start) > 80) return false;
            return String(e.text || '').trim() === text;
        });
        if (byTimeText) return byTimeText;
        const byIndex = list.find((e) => Number(e.index) === index);
        if (byIndex && Math.abs(Math.round(Number(byIndex.startMs) || 0) - start) <= 400) {
            return byIndex;
        }
        return null;
    }

    /**
     * 合并启发式与 sidecar 覆盖（sidecar 中 confirmed / retranscribe 优先）
     */
    function mergeConfidenceAnnotations(cues, sidecar = null, options = {}) {
        const heuristic = annotateCuesConfidence(cues, options);
        const entries = sidecar?.entries || [];
        const threshold = Math.max(0.05, Math.min(0.95, Number(options.lowThreshold) || DEFAULT_LOW_THRESHOLD));

        return heuristic.map((base, index) => {
            const cue = cues[index];
            const entry = findSidecarEntry(entries, cue, index);
            if (!entry) return { ...base, fingerprint: cueFingerprint(cue) };

            if (entry.confirmed === true) {
                return {
                    confidence: 1,
                    flags: ['confirmed'],
                    low: false,
                    source: 'confirmed',
                    fingerprint: cueFingerprint(cue),
                };
            }

            if (entry.confidence != null && Number.isFinite(Number(entry.confidence))) {
                const confidence = Math.max(0, Math.min(1, Number(entry.confidence)));
                const flags = Array.isArray(entry.flags) && entry.flags.length
                    ? entry.flags.slice()
                    : (entry.source ? [String(entry.source)] : []);
                return {
                    confidence,
                    flags,
                    low: confidence < threshold,
                    source: String(entry.source || 'sidecar'),
                    fingerprint: cueFingerprint(cue),
                };
            }

            return { ...base, fingerprint: cueFingerprint(cue) };
        });
    }

    function buildSidecarDocument(cues, annotations, extras = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const meta = Array.isArray(annotations) ? annotations : [];
        return {
            version: META_VERSION,
            updatedAt: extras.updatedAt || new Date().toISOString(),
            sourceSub: extras.sourceSub || '',
            entries: list.map((cue, index) => {
                const ann = meta[index] || {};
                return {
                    index,
                    startMs: cue.startMs,
                    endMs: cueEndMs(cue),
                    text: String(cue.text || ''),
                    fingerprint: ann.fingerprint || cueFingerprint(cue),
                    confidence: ann.confidence,
                    flags: Array.isArray(ann.flags) ? ann.flags : [],
                    source: ann.source || 'heuristic',
                    confirmed: ann.source === 'confirmed' || ann.confirmed === true,
                };
            }),
        };
    }

    function summarizeLowConfidence(annotations) {
        const list = Array.isArray(annotations) ? annotations : [];
        const low = list.filter((a) => a?.low).length;
        return {
            total: list.length,
            low,
            summary: low ? `${low} 条低置信` : '无可疑条目',
        };
    }

    function flagLabel(flag) {
        const map = {
            empty: '空文本',
            invalid: '时间无效',
            overlap: '重叠',
            short: '过短',
            long: '过长',
            high_cps: '读速过快',
            low_cps: '读速过慢',
            repetition: '重复文本',
            stutter: '口吃重复',
            dangling: '句末残缺',
            fragment: '碎片句',
            no_punct: '缺标点',
            duplicate: '连续重复条',
            connected: '连续长句',
            confirmed: '已确认',
            retranscribe: '已重转写',
            heuristic: '启发式',
            sidecar: '元数据',
        };
        if (fluencyCore?.fluencyFlagLabel && map[flag] == null) {
            return fluencyCore.fluencyFlagLabel(flag);
        }
        return map[flag] || flag;
    }

    function cueOverlapsRange(cue, startMs, endMs) {
        const rangeStart = Math.min(Number(startMs) || 0, Number(endMs) || 0);
        const rangeEnd = Math.max(Number(startMs) || 0, Number(endMs) || 0);
        const cStart = Number(cue?.startMs) || 0;
        const cEnd = cueEndMs(cue);
        return cStart < rangeEnd && cEnd > rangeStart;
    }

    function collectOverlappingCueIndices(cues, startMs, endMs) {
        const list = Array.isArray(cues) ? cues : [];
        const indices = [];
        for (let i = 0; i < list.length; i += 1) {
            if (cueOverlapsRange(list[i], startMs, endMs)) indices.push(i);
        }
        return indices;
    }

    /**
     * 用 newCues 替换与 [startMs, endMs) 重叠的旧条目；无重叠时按时间插入
     */
    function replaceCuesInTimeRange(cues, startMs, endMs, newCues) {
        const list = Array.isArray(cues) ? cues : [];
        const incoming = (Array.isArray(newCues) ? newCues : [])
            .map((c) => ({
                startMs: Number(c.startMs) || 0,
                endMs: c.endMs != null ? Number(c.endMs) : undefined,
                text: String(c.text || ''),
            }))
            .filter((c) => String(c.text || '').trim());

        const next = [];
        let inserted = false;
        for (let i = 0; i < list.length; i += 1) {
            if (cueOverlapsRange(list[i], startMs, endMs)) {
                if (!inserted) {
                    next.push(...incoming);
                    inserted = true;
                }
                continue;
            }
            next.push({
                startMs: list[i].startMs,
                endMs: list[i].endMs,
                text: list[i].text ?? '',
                index: list[i].index,
            });
        }
        if (!inserted) {
            next.push(...incoming);
        }
        next.sort((a, b) => (a.startMs - b.startMs) || ((a.endMs || 0) - (b.endMs || 0)));
        const firstNew = incoming[0];
        let insertAt = 0;
        if (firstNew) {
            insertAt = next.findIndex((c) => c === firstNew || (
                c.startMs === firstNew.startMs
                && c.endMs === firstNew.endMs
                && c.text === firstNew.text
            ));
            if (insertAt < 0) insertAt = 0;
        }
        return { cues: next, insertAt, replaced: collectOverlappingCueIndices(list, startMs, endMs).length };
    }

    return {
        META_VERSION,
        DEFAULT_LOW_THRESHOLD,
        cueEndMs,
        cueDurationMs,
        getCueCps,
        hashText,
        cueFingerprint,
        scoreCueConfidence,
        annotateCuesConfidence,
        mergeConfidenceAnnotations,
        buildSidecarDocument,
        summarizeLowConfidence,
        flagLabel,
        findSidecarEntry,
        cueOverlapsRange,
        collectOverlappingCueIndices,
        replaceCuesInTimeRange,
    };
}));
