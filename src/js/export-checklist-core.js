/**
 * 导出前规则检查清单（浏览器与 Node 共用）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubExportChecklist = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function exportChecklistCoreFactory() {
    function cueEndMs(cue) {
        if (!cue) return 0;
        if (cue.endMs != null && Number.isFinite(Number(cue.endMs))) return Number(cue.endMs);
        return (Number(cue.startMs) || 0) + 2000;
    }

    /**
     * @param {object} input
     * @param {object[]} input.cues
     * @param {object} [input.qcResult] - from subtitle-qc-core scan
     * @param {object} [input.markersDoc]
     * @param {boolean} [input.hasVideo]
     * @param {boolean} [input.hasDualPair]
     * @param {boolean} [input.dualMerged]
     * @param {number} [input.lowConfCount]
     * @param {object} [input.keptTranscript] - { path, daysLeft }
     * @param {boolean} [input.proExtras] - include Advanced / Pro checklist rows
     * @param {object} [input.lastSemanticReview] - { ok, issues, summary }
     * @param {boolean} [input.assExportAvailable]
     */
    function buildExportChecklist(input = {}) {
        const cues = Array.isArray(input.cues) ? input.cues : [];
        const items = [];

        const empty = cues.filter((c) => !String(c?.text || '').trim()).length;
        items.push({
            id: 'empty',
            severity: empty ? 'warn' : 'ok',
            label: '空字幕',
            detail: empty ? `${empty} 条文本为空` : '无空字幕',
            count: empty,
        });

        let overlaps = 0;
        if (input.qcResult?.stats?.overlap != null) {
            overlaps = Number(input.qcResult.stats.overlap) || 0;
        } else {
            for (let i = 1; i < cues.length; i += 1) {
                const prevEnd = cueEndMs(cues[i - 1]);
                const start = Number(cues[i]?.startMs) || 0;
                if (start < prevEnd) overlaps += 1;
            }
        }
        items.push({
            id: 'overlap',
            severity: overlaps ? 'warn' : 'ok',
            label: '时间重叠',
            detail: overlaps ? `${overlaps} 处重叠` : '无重叠',
            count: overlaps,
        });

        let highCps = 0;
        if (input.qcResult?.stats?.highCps != null) {
            highCps = Number(input.qcResult.stats.highCps) || 0;
        } else if (Array.isArray(input.qcResult?.issues)) {
            highCps = input.qcResult.issues.filter((x) => x?.type === 'cps' || x?.flag === 'high_cps').length;
        }
        items.push({
            id: 'cps',
            severity: highCps ? 'warn' : 'ok',
            label: '读速过快',
            detail: highCps ? `${highCps} 条超 CPS` : 'CPS 正常',
            count: highCps,
        });

        const lowConf = Number(input.lowConfCount) || 0;
        items.push({
            id: 'low_conf',
            severity: lowConf ? 'info' : 'ok',
            label: '低置信',
            detail: lowConf ? `${lowConf} 条低置信（启发式）` : '无低置信标记',
            count: lowConf,
        });

        items.push({
            id: 'video',
            severity: input.hasVideo ? 'ok' : 'info',
            label: '关联视频',
            detail: input.hasVideo ? '已关联视频' : '未关联视频（部分工具不可用）',
            count: input.hasVideo ? 1 : 0,
        });

        if (input.hasDualPair) {
            items.push({
                id: 'dual',
                severity: input.dualMerged ? 'ok' : 'info',
                label: '双语',
                detail: input.dualMerged ? '已合并导出就绪' : '已挂副轨，尚未合并导出',
                count: 1,
            });
        }

        const markers = input.markersDoc && typeof input.markersDoc === 'object'
            ? input.markersDoc
            : null;
        if (markers) {
            const bookmarks = Array.isArray(markers.bookmarks) ? markers.bookmarks : [];
            if (bookmarks.length > 0) {
                items.push({
                    id: 'bookmarks',
                    severity: 'ok',
                    label: '书签',
                    detail: `${bookmarks.length} 个时间点书签`,
                    count: bookmarks.length,
                });
            }

            if (cues.length > 0) {
                let approved = 0;
                let edited = 0;
                let unseen = 0;
                let withSpeaker = 0;
                const cueMarkers = markers.cueMarkers && typeof markers.cueMarkers === 'object'
                    ? markers.cueMarkers
                    : {};
                for (let i = 0; i < cues.length; i += 1) {
                    const start = Math.round(Number(cues[i]?.startMs) || 0);
                    const key = `${i}:${start}`;
                    const m = cueMarkers[key];
                    const s = String(m?.reviewStatus || '').trim().toLowerCase();
                    if (s === 'approved' || s === 'done' || s === 'ok' || s === 'pass') approved += 1;
                    else if (s === 'edited' || s === 'changed' || s === 'dirty') edited += 1;
                    else unseen += 1;
                    if (m?.speakerId) withSpeaker += 1;
                }
                items.push({
                    id: 'review',
                    severity: (cues.length - approved) > 0
                        ? (input.proExtras ? 'warn' : 'info')
                        : 'ok',
                    label: '审校进度',
                    detail: `通过 ${approved} · 已改 ${edited} · 未看 ${unseen} / 共 ${cues.length}`,
                    count: cues.length - approved,
                });

                const speakers = Array.isArray(markers.speakers) ? markers.speakers : [];
                if (speakers.length > 0 || withSpeaker > 0) {
                    const unlabeled = cues.length - withSpeaker;
                    items.push({
                        id: 'speakers',
                        severity: unlabeled > 0 ? 'info' : 'ok',
                        label: '说话人',
                        detail: speakers.length
                            ? `${speakers.length} 人 · 已标注 ${withSpeaker}/${cues.length} 条`
                            : `已标注 ${withSpeaker}/${cues.length} 条`,
                        count: unlabeled,
                    });
                }
            }
        }

        if (input.proExtras) {
            const canSemantic = !!(input.hasDualPair || input.keptTranscript?.path);
            if (canSemantic) {
                const sem = input.lastSemanticReview && typeof input.lastSemanticReview === 'object'
                    ? input.lastSemanticReview
                    : null;
                const semIssues = Array.isArray(sem?.issues) ? sem.issues : [];
                if (sem && Array.isArray(sem.issues)) {
                    items.push({
                        id: 'semantic_review',
                        severity: semIssues.length ? 'warn' : 'ok',
                        label: '语义审阅（Pro）',
                        detail: semIssues.length
                            ? `${semIssues.length} 处语义问题待处理`
                            : (sem.summary || '语义审阅已通过'),
                        count: semIssues.length,
                    });
                } else {
                    items.push({
                        id: 'semantic_review',
                        severity: 'info',
                        label: '语义审阅（Pro）',
                        detail: '导出前可运行 LLM 语义审阅',
                        count: 0,
                    });
                }
            }

            const speakers = Array.isArray(input.markersDoc?.speakers)
                ? input.markersDoc.speakers
                : [];
            if (speakers.length > 0 || input.assExportAvailable) {
                items.push({
                    id: 'ass_styles',
                    severity: speakers.length ? 'info' : 'ok',
                    label: 'ASS 说话人样式（Pro）',
                    detail: speakers.length
                        ? `${speakers.length} 位说话人 · 可导出着色 ASS`
                        : '可导出 ASS（无说话人时用默认样式）',
                    count: speakers.length,
                });
            }
        }

        if (input.keptTranscript?.path) {
            const days = input.keptTranscript.daysLeft;
            const daysBit = Number.isFinite(days)
                ? (days < 0 ? '已过期' : `约 ${days} 天后可清理`)
                : '保留中';
            items.push({
                id: 'kept_transcript',
                severity: 'ok',
                label: '原文缓存',
                detail: `可用 · ${daysBit}`,
                count: 1,
            });
        }

        const warnCount = items.filter((i) => i.severity === 'warn').length;
        const infoCount = items.filter((i) => i.severity === 'info').length;
        return {
            items,
            warnCount,
            infoCount,
            ok: warnCount === 0,
            summary: warnCount
                ? `${warnCount} 项需留意`
                : (infoCount ? `${infoCount} 条提示` : '可以导出'),
        };
    }

    return {
        buildExportChecklist,
        cueEndMs,
    };
}));
