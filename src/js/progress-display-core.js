/**
 * Main-window progress label / display percent helpers (pure).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubProgressDisplay = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function progressDisplayFactory(global) {
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

    const DEFAULT_STAGE_LABELS = Object.freeze({
        starting: '启动',
        denoise: '轻度降噪',
        separate: '人声分离',
        scene: '场景切分',
        vad: '语音检测',
        vad_failover: 'VAD 回退',
        cleanup: '译文校正',
        source_cleanup: '原文校正',
        semantic_repair: '原文校正',
        pre_mt_qc: '译前质量门闸',
        model: '加载识别模型',
        transcribe: '原文提取',
        translate: '翻译中',
        qc_fix: '译文校正 · QC修复',
        qc_loop: 'QC 闭环',
        save: '保存字幕',
        postprocess: '字幕后期处理',
        done: '完成',
        failed: '失败',
    });

    function stageLabel(stage, ctx = {}) {
        const labels = ctx.stageLabels || DEFAULT_STAGE_LABELS;
        const base = uiTx(labels[stage] || '处理中');
        const dual = ctx.itemDualPhase;
        if (dual === 'transcribe') {
            if (stage === 'starting') return uiTx('双语 · 准备原文');
            if (stage === 'transcribe') return uiTx('双语 · 生成原文');
            if (stage === 'save') return uiTx('保存原文字幕');
            // Named stages (原文校正 / 加载识别模型 / …) — no redundant dual prefix.
            return base;
        }
        if (dual === 'translate') {
            if (stage === 'starting') return uiTx('双语 · 准备译文');
            if (stage === 'transcribe') return uiTx('双语 · 生成译文');
            if (stage === 'translate') return uiTx('字幕翻译中');
            if (stage === 'save') return uiTx('保存译文字幕');
            // 译文校正 / QC / 后期处理 等已自带语义，不再套「双语 · 译文 ·」
            return base;
        }
        const task = ctx.task;
        if (stage === 'save') {
            if (task === 'translate' || dual === 'translate' || dual === 'target') {
                return uiTx('保存译文字幕');
            }
            if (task === 'transcribe' || dual === 'transcribe' || dual === 'source') {
                return uiTx('保存原文字幕');
            }
            // After ASR, dualPhase may still be source; mid dual job save uses source/translate.
            if (dual === 'source') return uiTx('保存原文字幕');
            return base;
        }
        if (task === 'translate' && stage === 'transcribe') return uiTx('翻译中');
        if (task === 'transcribe' && stage === 'transcribe') return uiTx('原文提取');
        return base;
    }

    function formatListRunningDetail(rawDetail, ctx = {}) {
        const scrub = typeof ctx.scrubProgressDetail === 'function'
            ? ctx.scrubProgressDetail
            : (d) => String(d || '').trim();
        let scrubbed = scrub(rawDetail);
        if (ctx.itemDualPhase) {
            scrubbed = scrubbed
                .replace(/^(生成原文|生成译文|双语准备中|双语生成中|已合并.*)[….]*\s*/u, '')
                .trim();
        }
        return scrubbed;
    }

    function formatRunningProgressLabel(stage, detail, ctx = {}) {
        const head = stageLabel(stage, ctx);
        const scrub = typeof ctx.scrubProgressDetail === 'function'
            ? ctx.scrubProgressDetail
            : (d) => String(d || '').trim();
        let scrubbed = scrub(detail);
        if (ctx.itemDualPhase) {
            scrubbed = scrubbed
                .replace(/^(生成原文|生成译文|双语准备中|双语生成中)[….]*\s*/u, '')
                .trim();
        }
        const winApi = (typeof globalThis !== 'undefined' && globalThis.TransubComputeBusyUi)
            || null;
        if (winApi?.annotateProgressWithWindow) {
            scrubbed = winApi.annotateProgressWithWindow(scrubbed, detail);
        } else {
            const m = String(detail || '').match(/分窗\s*(\d+)\s*[/／]\s*(\d+)/);
            if (m && scrubbed) {
                const winLabel = uiTf('分窗 {current}/{total}', { current: m[1], total: m[2] });
                if (!scrubbed.includes(winLabel)) {
                    scrubbed = `${scrubbed} · ${winLabel}`;
                }
            }
        }
        if (!scrubbed) return `${head}…`;
        if (scrubbed === head || scrubbed.startsWith(`${head} ·`)) return scrubbed;
        return `${head} · ${scrubbed}`;
    }

    function effectiveItemProgress(stage, progress, ctx = {}) {
        const raw = Math.max(0, Number(progress) || 0);
        const running = !!ctx.running;
        const cap = (!running || stage === 'done' || stage === 'skipped') ? 100 : 99;
        const pct = Math.min(cap, raw);
        const isPre = typeof ctx.isPreTranscribeStage === 'function'
            ? ctx.isPreTranscribeStage(stage)
            : false;
        if (isPre) {
            if (running && ctx.itemDualPhase === 'translate') return Math.min(99, pct);
            if (running && pct > 0) return Math.min(99, pct);
            if (!running) return pct;
            return 0;
        }
        return pct;
    }

    const IDLE_PROGRESS_LABEL_WAIT_NEW = '等待新任务...';
    const IDLE_PROGRESS_LABEL_WAIT_RUN = '等待执行任务...';

    function hasPendingExecutionItems(items) {
        return (Array.isArray(items) ? items : []).some(
            (item) => item && (item.status === 'pending' || item.status === 'ready'),
        );
    }

    function resolveIdleProgressLabel(items) {
        return uiTx(hasPendingExecutionItems(items)
            ? IDLE_PROGRESS_LABEL_WAIT_RUN
            : IDLE_PROGRESS_LABEL_WAIT_NEW);
    }

    function computeDisplayProgress(ctx = {}) {
        const formatDuration = typeof ctx.formatDuration === 'function'
            ? ctx.formatDuration
            : (s) => String(s ?? '');
        if (!ctx.running && ctx.itemStage === 'done' && ctx.total > 0) {
            return { pct: 100, label: '100%' };
        }
        const cap = ctx.running ? 99 : 100;
        const itemPct = effectiveItemProgress(ctx.itemStage, ctx.videoProgress, ctx);
        const displayPct = Math.max(0, Math.min(cap, itemPct));
        const hasMediaTimeline = ctx.running
            && ctx.videoTotalSec >= 60
            && ctx.itemStage === 'transcribe'
            && ctx.itemDualPhase !== 'translate';
        if (hasMediaTimeline && displayPct > 0) {
            const timeline = `${formatDuration(ctx.videoCurrentSec)} / ${formatDuration(ctx.videoTotalSec)}`;
            return {
                pct: displayPct,
                label: `${timeline} · ${displayPct}%`,
            };
        }
        if (ctx.total > 0 && ctx.index > 0) {
            const batchPct = Math.round(((ctx.index - 1) + displayPct / 100) / ctx.total * 100);
            const pct = Math.min(cap, batchPct);
            return {
                pct,
                label: uiTf('第 {index} / {total} 个 · {pct}%', {
                    index: ctx.index,
                    total: ctx.total,
                    pct,
                }),
            };
        }
        return { pct: displayPct, label: displayPct > 0 ? `${displayPct}%` : '…' };
    }

    function formatElapsedCell(item, { formatDuration, itemElapsedSec } = {}) {
        if (!item || item.status === 'pending' || item.status === 'ready') return '—';
        if (!item.startedAt) return '—';
        const sec = typeof itemElapsedSec === 'function'
            ? itemElapsedSec(item)
            : 0;
        return typeof formatDuration === 'function' ? formatDuration(sec) : String(sec);
    }

    function formatProcessedCell(item, { formatDuration } = {}) {
        const total = Number(item?.duration) || Number(item?.processedTotalSec) || 0;
        const processed = Number(item?.processedSec) || 0;
        const fmt = typeof formatDuration === 'function' ? formatDuration : (s) => String(s);
        if (item?.status === 'done') {
            const sec = total > 0 ? total : processed;
            return sec > 0 ? fmt(sec) : '—';
        }
        if (item?.status === 'skipped') return '—';
        if (processed > 0) {
            return total > 0
                ? `${fmt(processed)} / ${fmt(total)}`
                : fmt(processed);
        }
        return '—';
    }

    return {
        DEFAULT_STAGE_LABELS,
        IDLE_PROGRESS_LABEL_WAIT_NEW,
        IDLE_PROGRESS_LABEL_WAIT_RUN,
        stageLabel,
        formatListRunningDetail,
        formatRunningProgressLabel,
        effectiveItemProgress,
        hasPendingExecutionItems,
        resolveIdleProgressLabel,
        computeDisplayProgress,
        formatElapsedCell,
        formatProcessedCell,
    };
}));
