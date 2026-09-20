/**
 * 导出前规则检查清单（浏览器与 Node 共用）
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubExportChecklist = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function exportChecklistCoreFactory(global) {
    function uiTf(template, vars) {
        try {
            if (typeof global !== 'undefined' && typeof global.TransubUiTf === 'function') {
                return global.TransubUiTf(template, vars);
            }
            if (typeof global !== 'undefined' && global.TransubI18n && typeof global.TransubI18n.tf === 'function') {
                return global.TransubI18n.tf(template, vars);
            }
        } catch { /* ignore */ }
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => (
            vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
                ? String(vars[name])
                : `{${name}}`
        ));
    }
    function uiTx(text) {
        try {
            if (typeof global !== 'undefined' && global.TransubI18n && typeof global.TransubI18n.tx === 'function') {
                return global.TransubI18n.tx(text);
            }
        } catch { /* ignore */ }
        return String(text || '');
    }

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
            label: uiTx('空字幕'),
            detail: empty ? uiTf('{count} 条文本为空', { count: empty }) : uiTx('无空字幕'),
            count: empty,
        });

        const qcSummary = input.qcResult?.summary || input.qcResult?.stats || null;
        let overlaps = 0;
        if (qcSummary?.overlap != null) {
            overlaps = Number(qcSummary.overlap) || 0;
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
            label: uiTx('时间重叠'),
            detail: overlaps ? uiTf('{count} 处重叠', { count: overlaps }) : uiTx('无重叠'),
            count: overlaps,
        });

        let highCps = 0;
        if (qcSummary?.highCps != null) {
            highCps = Number(qcSummary.highCps) || 0;
        } else if (Array.isArray(input.qcResult?.issues)) {
            highCps = input.qcResult.issues.filter((x) => (
                x?.type === 'cps'
                || x?.flag === 'high_cps'
                || (Array.isArray(x?.types) && x.types.includes('high_cps'))
            )).length;
        }
        items.push({
            id: 'cps',
            severity: highCps ? 'warn' : 'ok',
            label: uiTx('读速过快'),
            detail: highCps ? uiTf('{count} 条超 CPS', { count: highCps }) : uiTx('CPS 正常'),
            count: highCps,
        });

        const lowConf = Number(input.lowConfCount) || 0;
        items.push({
            id: 'low_conf',
            severity: lowConf ? 'info' : 'ok',
            label: uiTx('低置信'),
            detail: lowConf
                ? uiTf('{count} 条低置信（启发式）', { count: lowConf })
                : uiTx('无低置信标记'),
            count: lowConf,
        });

        items.push({
            id: 'video',
            severity: input.hasVideo ? 'ok' : 'info',
            label: uiTx('关联视频'),
            detail: input.hasVideo ? uiTx('已关联视频') : uiTx('未关联视频（部分工具不可用）'),
            count: input.hasVideo ? 1 : 0,
        });

        if (input.hasDualPair) {
            items.push({
                id: 'dual',
                severity: input.dualMerged ? 'ok' : 'info',
                label: uiTx('双语'),
                detail: input.dualMerged ? uiTx('已合并导出就绪') : uiTx('已挂副轨，尚未合并导出'),
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
                    label: uiTx('书签'),
                    detail: uiTf('{count} 个时间点书签', { count: bookmarks.length }),
                    count: bookmarks.length,
                });
            }

            if (cues.length > 0) {
                let approved = 0;
                let edited = 0;
                let unseen = 0;
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
                }
                items.push({
                    id: 'review',
                    severity: (cues.length - approved) > 0
                        ? (input.proExtras ? 'warn' : 'info')
                        : 'ok',
                    label: uiTx('审校进度'),
                    detail: uiTf('通过 {approved} · 已改 {edited} · 未看 {unseen} / 共 {total}', {
                        approved,
                        edited,
                        unseen,
                        total: cues.length,
                    }),
                    count: cues.length - approved,
                });
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
                        label: uiTx('语义审阅（Pro）'),
                        detail: semIssues.length
                            ? uiTf('{count} 处语义问题待处理', { count: semIssues.length })
                            : (sem.summary || uiTx('语义审阅已通过')),
                        count: semIssues.length,
                    });
                } else {
                    items.push({
                        id: 'semantic_review',
                        severity: 'info',
                        label: uiTx('语义审阅（Pro）'),
                        detail: uiTx('导出前可运行 LLM 语义审阅'),
                        count: 0,
                    });
                }
            }

            if (input.assExportAvailable) {
                items.push({
                    id: 'ass_styles',
                    severity: 'ok',
                    label: uiTx('ASS 样式（Pro）'),
                    detail: uiTx('可导出当前文档样式 ASS'),
                    count: 0,
                });
                if (input.hasAssDualPair) {
                    items.push({
                        id: 'ass_dual',
                        severity: 'info',
                        label: uiTx('双语 ASS（Pro）'),
                        detail: uiTx('已挂副轨 · 可导出 Source+ZH 双 Dialogue'),
                        count: 1,
                    });
                }
                if (Array.isArray(input.assFontItems) && input.assFontItems.length) {
                    items.push(...input.assFontItems);
                }
            }
        }

        if (input.keptTranscript?.path) {
            const days = input.keptTranscript.daysLeft;
            const daysBit = Number.isFinite(days)
                ? (days < 0 ? uiTx('已过期') : uiTf('约 {days} 天后可清理', { days }))
                : uiTx('保留中');
            items.push({
                id: 'kept_transcript',
                severity: 'ok',
                label: uiTx('原文缓存'),
                detail: uiTf('可用 · {daysBit}', { daysBit }),
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
                ? uiTf('{count} 项需留意', { count: warnCount })
                : (infoCount ? uiTf('{count} 条提示', { count: infoCount }) : uiTx('可以导出')),
        };
    }

    return {
        buildExportChecklist,
        cueEndMs,
    };
}));
