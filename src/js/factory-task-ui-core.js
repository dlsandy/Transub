/**
 * Subtitle-task page UI: recipe summary, stage pipeline, station + card HTML (pure).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubFactoryTaskUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function factoryTaskUiFactory(global) {
    /** Quality pipeline v2: prep → ASR → pre-MT repair → MT → QC → done */
    const PIPELINE = Object.freeze([
        { id: 'feed', label: '准备' },
        { id: 'asr', label: '识别' },
        { id: 'repair', label: '校正' },
        { id: 'mt', label: '翻译' },
        { id: 'qc', label: 'QC' },
        { id: 'out', label: '完成' },
    ]);

    const PIPE_LAST = PIPELINE.length - 1;

    /** Map engine / bridge stage → pipeline index (monotonic display uses high-water). */
    const STAGE_TO_PIPE = Object.freeze({
        starting: 0,
        queued: 0,
        denoise: 1,
        separate: 1,
        scene: 1,
        vad: 1,
        vad_failover: 1,
        model: 1,
        transcribe: 1,
        asr: 1,
        running: 1,
        source_cleanup: 2,
        semantic_repair: 2,
        asr_semantic_repair: 2,
        pre_mt_qc: 2,
        translate: 3,
        mt: 3,
        cleanup: 3,
        polish: 3,
        plot_polish: 3,
        qc_fix: 4,
        qc: 4,
        qc_loop: 4,
        loop: 4,
        postprocess: 4,
        finalize: 4,
        save: 5,
        write: 5,
        done: 5,
    });

    const TASK_LABELS = Object.freeze({
        translate: '翻译',
        transcribe: '原语言',
        dual: '双语',
    });

    const LANG_LABELS = Object.freeze({
        auto: '自动',
        ja: '日语',
        zh: '中文',
        en: '英语',
        ko: '韩语',
        yue: '粤语',
    });

    const TARGET_LABELS = Object.freeze({
        simplified: '简中',
        traditional: '繁中',
        'traditional-tw': '繁中',
        'traditional-hk': '繁中',
        en: 'EN',
        ja: '日',
        ko: '韩',
    });

    function uiTx(text) {
        try {
            if (global?.TransubI18n?.tx) return global.TransubI18n.tx(text);
        } catch { /* ignore */ }
        return String(text || '');
    }

    function normalizeView(raw) {
        return String(raw || '').trim() === 'table' ? 'table' : 'cards';
    }

    function pipelineStages() {
        return PIPELINE.slice();
    }

    function pipelineIndexForStage(stage, status) {
        const st = String(status || '');
        if (st === 'done' || st === 'skipped') return PIPE_LAST;
        if (st === 'pending' || st === 'ready' || st === 'probing') return 0;
        if (st === 'failed' || st === 'error' || st === 'cancelled') {
            const mapped = STAGE_TO_PIPE[String(stage || '').toLowerCase()];
            return Number.isFinite(mapped) ? mapped : 1;
        }
        const mapped = STAGE_TO_PIPE[String(stage || '').toLowerCase()];
        if (Number.isFinite(mapped)) return mapped;
        // Unknown stage while running: stay on 识别 (not 准备) without inventing progress.
        if (st === 'running') return 1;
        return 0;
    }

    /**
     * Floor pipeline index from overall % so a late re-ASR / unknown stage cannot
     * visually jump behind work already reflected in the progress bar.
     * Bands align with engine remap_job_progress / infer mapStageProgress.
     */
    function pipelineIndexForProgress(progress, status) {
        const st = String(status || '');
        if (st === 'done' || st === 'skipped') return PIPE_LAST;
        if (st === 'pending' || st === 'ready' || st === 'probing') return 0;
        const p = Number(progress);
        if (!Number.isFinite(p) || p <= 0) return 0;
        if (p >= 99) return PIPE_LAST;
        if (p >= 98) return 4; // QC
        if (p >= 70) return 3; // 翻译
        if (p >= 62) return 2; // 校正 / 译前
        if (p >= 5) return 1; // 识别
        return 0;
    }

    /**
     * Display index: never roll back while a task is in flight.
     * Mutates item.pipeHighWater when item is a live queue row (running).
     */
    function resolvePipelineIndex(item = {}) {
        const status = String(item.status || '');
        if (status === 'done' || status === 'skipped') return PIPE_LAST;
        if (status === 'pending' || status === 'ready' || status === 'probing') {
            const floorReady = Number(item.pipelineFloor);
            return Number.isFinite(floorReady) && floorReady > 0
                ? Math.max(0, Math.min(PIPE_LAST, floorReady))
                : 0;
        }

        const fromStage = pipelineIndexForStage(item.stage, status);
        const fromProgress = pipelineIndexForProgress(item.progress, status);
        const prev = Number(item.pipeHighWater);
        const floor = Number(item.pipelineFloor);
        const idx = Math.max(
            fromStage,
            fromProgress,
            Number.isFinite(prev) ? prev : 0,
            Number.isFinite(floor) ? floor : 0,
        );
        const clamped = Math.max(0, Math.min(PIPE_LAST, idx));
        if (status === 'running' && item && typeof item === 'object') {
            const cur = Number(item.pipeHighWater);
            if (!Number.isFinite(cur) || cur < clamped) item.pipeHighWater = clamped;
        }
        return clamped;
    }

    function taskLabel(task) {
        return uiTx(TASK_LABELS[task] || TASK_LABELS.translate);
    }

    function languageLabel(lang) {
        return uiTx(LANG_LABELS[lang] || lang || LANG_LABELS.auto);
    }

    function targetLabel(target) {
        return uiTx(TARGET_LABELS[target] || target || TARGET_LABELS.simplified);
    }

    /**
     * @param {{
     *   task?: string,
     *   language?: string,
     *   targetLang?: string,
     *   translateLabel?: string,
     *   senseLabel?: string,
     *   qcLabel?: string,
     * }} input
     */
    function buildRecipeSummary(input = {}) {
        const task = String(input.task || 'translate');
        const parts = [taskLabel(task)];
        const lang = languageLabel(input.language || 'auto');
        if (task === 'transcribe') {
            parts.push(lang);
        } else {
            parts.push(`${lang}→${targetLabel(input.targetLang || 'simplified')}`);
            const translate = String(input.translateLabel || '').trim();
            if (translate && translate !== '—') parts.push(translate);
        }
        const bilingual = String(input.bilingualLabel || '').trim();
        if (bilingual) parts.push(bilingual);
        const sense = String(input.senseLabel || '').trim();
        if (sense) parts.push(sense);
        const qc = String(input.qcLabel || '').trim();
        if (qc && qc !== '关闭') parts.push(`QC ${qc}`);
        return parts.join(' · ');
    }

    /**
     * Prefer the running item; else activePath match; else null.
     * @param {Array<{ status?: string, path?: string }>} items
     * @param {string} [activePath]
     * @param {(p: string) => string} [normPath]
     */
    function findStationItem(items, activePath, normPath) {
        const list = Array.isArray(items) ? items : [];
        const running = list.find((it) => it && it.status === 'running');
        if (running) return running;
        const want = String(activePath || '').trim();
        if (!want) return null;
        const norm = typeof normPath === 'function'
            ? normPath
            : ((p) => String(p || '').replace(/\//g, '\\').toLowerCase());
        const key = norm(want);
        return list.find((it) => it && norm(it.path) === key) || null;
    }

    /**
     * Indices for queue list: tab filter minus station item when shown.
     */
    function filterQueueIndices(items, tabIndices, stationItem) {
        const list = Array.isArray(items) ? items : [];
        const indices = Array.isArray(tabIndices) ? tabIndices : list.map((_, i) => i);
        if (!stationItem) return indices.slice();
        return indices.filter((i) => list[i] !== stationItem);
    }

    function escAttr(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    function buildPipelineRailHtml(activeIndex, { compact = false, esc = escAttr } = {}) {
        const idx = Math.max(0, Math.min(PIPELINE.length - 1, Number(activeIndex) || 0));
        if (compact) {
            return `<span class="task-pipe-dots" aria-hidden="true">${PIPELINE.map((s, i) => (
                `<span class="task-pipe-dot${i <= idx ? ' is-on' : ''}" title="${esc(uiTx(s.label))}"></span>`
            )).join('')}</span>`;
        }
        return `<div class="task-pipe-rail" role="list">${PIPELINE.map((s, i) => {
            const done = i < idx;
            const cur = i === idx;
            const cls = [
                'task-pipe-step',
                done ? 'is-done' : '',
                cur ? 'is-current' : '',
            ].filter(Boolean).join(' ');
            // Segment after step i connects i → i+1. Animate the inbound edge of the
            // current stage (or the first outbound while still on 准备).
            let segCls = 'task-pipe-seg';
            if (i < PIPELINE.length - 1) {
                const isFlow = idx > 0 ? i === idx - 1 : i === 0;
                if (isFlow) segCls += ' is-flow';
                else if (i < idx) segCls += ' is-done';
            }
            return `<div class="${cls}" role="listitem"><span class="task-pipe-node"></span><span class="task-pipe-label">${esc(uiTx(s.label))}</span></div>${
                i < PIPELINE.length - 1
                    ? `<div class="${segCls}" aria-hidden="true"></div>`
                    : ''
            }`;
        }).join('')}</div>`;
    }

    /**
     * Hero station HTML for the current running (or focused active) item.
     */
    function buildStationHtml(item, ctx = {}) {
        if (!item) return '';
        const {
            esc = escAttr,
            basename = (p) => String(p || '').split(/[/\\]/).pop() || '—',
            elapsed = '—',
            eta = '',
            recipeLine = '',
            idx = -1,
            subPath = '',
        } = ctx;

        const pct = Math.max(0, Math.min(100, Number(item.progress) || 0));
        const pipeIdx = resolvePipelineIndex(item);
        const name = basename(item.path);
        const detail = String(item.detail || item.error || '').trim();
        const status = String(item.status || '');
        const isRunning = status === 'running';

        const rail = buildPipelineRailHtml(pipeIdx, { esc });
        const editBtn = subPath
            ? `<button type="button" class="task-station-link" data-open-editor="${idx}">${esc(uiTx('打开编辑器'))}</button>`
            : '';

        return `
            <div class="task-station-card" data-station-idx="${idx}" data-idx="${idx}" data-status="${esc(status)}" data-path="${esc(String(item.path || ''))}">
                <div class="task-station-head">
                    <div class="task-station-titles">
                        <span class="task-station-kicker">${esc(uiTx(isRunning ? '正在处理 · 同时一条' : '当前任务'))}</span>
                        <h2 class="task-station-name" title="${esc(item.path || '')}">${esc(name)}</h2>
                    </div>
                    <div class="task-station-metrics">
                        <span class="task-station-pct tabular-nums">${isRunning || pct > 0 ? `${Math.round(pct)}%` : '—'}</span>
                        <span class="task-station-eta">${esc([
                            eta ? `${uiTx('剩余时间')}${eta}` : '',
                            elapsed && elapsed !== '—' ? `${uiTx('已用')} ${elapsed}` : '',
                        ].filter(Boolean).join(' · ') || '—')}</span>
                    </div>
                </div>
                ${rail}
                <div class="task-station-foot">
                    <span class="task-station-status">${esc(isRunning ? (detail || uiTx('进行中')) : (detail || status))}</span>
                    ${recipeLine ? `<span class="task-station-recipe">${esc(recipeLine)}</span>` : ''}
                    <span class="task-station-actions">${editBtn}</span>
                </div>
            </div>`;
    }

    /**
     * Compact queue card HTML (same data-* hooks as table rows where useful).
     * Running / focused items embed station-style pipeline + metrics (no separate station panel).
     */
    function buildCardHtml(item, idx, ctx = {}) {
        const {
            esc = escAttr,
            basename = (p) => String(p || '').split(/[/\\]/).pop() || '—',
            formatDuration = () => '—',
            running = false,
            queuePos = '',
            profileBadge = '',
            senseMtLabel = '',
            subPath = '',
            elapsed = '—',
            processed = '—',
            eta = '',
            recipeLine = '',
            canRemove = true,
            canStop = false,
            statusMetaFn = null,
            styleBadgeHtml = '',
        } = ctx;

        const meta = typeof statusMetaFn === 'function'
            ? statusMetaFn(item.status)
            : { label: item.status || '—', cls: '' };
        const name = basename(item.path);
        const senseBits = [profileBadge, senseMtLabel].filter(Boolean).join(' · ');
        const mediaDur = item.duration ? formatDuration(item.duration) : '';
        const hasExistingSub = !!(item.existingSubtitle && item.status === 'ready');
        const canOpen = !!subPath && (item.status === 'done' || item.status === 'skipped');
        const nameHtml = canOpen
            ? `<button type="button" class="task-card-name-link" data-open-editor="${idx}" title="${esc(name)}">${esc(name)}</button>`
            : `<span class="task-card-name">${esc(name)}</span>`;
        const status = String(item.status || '');
        const isRunning = status === 'running';
        const pct = Math.max(0, Math.min(100, Number(item.progress) || 0));
        const detail = String(item.detail || item.error || '').trim();
        const hasElapsed = !!(elapsed && elapsed !== '—');
        const elapsedHtml = hasElapsed
            ? `<span class="task-card-elapsed tabular-nums" title="${esc(uiTx('耗时'))}">${esc(uiTx('耗时'))} ${esc(elapsed)}</span>`
            : '';

        let progressBit = '';
        if (isRunning) {
            progressBit = `<span class="task-card-progress tabular-nums">${Math.round(pct)}%</span>`;
        } else if (status === 'done' || status === 'skipped') {
            progressBit = `<span class="task-card-progress tabular-nums">${esc(processed)}</span>`;
        }

        const styleBtn = String(styleBadgeHtml || '').trim();
        const metaParts = [senseBits, mediaDur, hasExistingSub ? uiTx('已有字幕') : '']
            .filter(Boolean)
            .map((t) => `<span>${esc(t)}</span>`)
            .join('');
        const metaHtml = `${styleBtn}${metaParts}` || `<span>${esc(meta.label)}</span>`;

        let richExtra = '';
        if (isRunning) {
            const pipeIdx = resolvePipelineIndex(item);
            const rail = buildPipelineRailHtml(pipeIdx, { esc });
            const etaLine = eta ? `${uiTx('剩余时间')}${eta}` : '';
            richExtra = `
                <div class="task-card-run">
                    ${rail}
                    <div class="task-card-run-foot">
                        <span class="task-card-run-detail">${esc(detail || uiTx('进行中'))}</span>
                        ${etaLine ? `<span class="task-card-run-eta tabular-nums">${esc(etaLine)}</span>` : ''}
                    </div>
                    ${recipeLine ? `<div class="task-card-run-recipe">${esc(recipeLine)}</div>` : ''}
                </div>`;
        }

        const playPath = String(item.path || '').trim();
        const executeBtn = playPath
            ? `<button type="button" class="row-action-btn is-play" data-execute-idx="${idx}" title="${esc(uiTx('执行'))}" aria-label="${esc(uiTx('执行'))}"><i class="fa fa-play"></i></button>`
            : '';
        const canBurn = !!playPath && (status === 'done' || status === 'skipped');
        const burnBtn = canBurn
            ? `<button type="button" class="row-action-btn is-burn" data-burn-idx="${idx}" title="${esc(uiTx('字幕烧录'))}" aria-label="${esc(uiTx('字幕烧录'))}"><i class="fa fa-fire"></i></button>`
            : '';
        const moreBtn = `<button type="button" class="row-action-btn is-more" data-more-idx="${idx}" title="${esc(uiTx('更多'))}" aria-label="${esc(uiTx('更多'))}"><i class="fa fa-ellipsis-h"></i></button>`;
        const stopBtn = canStop
            ? `<button type="button" class="row-action-btn is-stop" data-stop-idx="${idx}" title="${esc(uiTx('停止本条任务'))}" aria-label="${esc(uiTx('停止本条任务'))}"><i class="fa fa-stop"></i></button>`
            : '';
        const removeBtn = canRemove
            ? `<button type="button" class="row-action-btn is-remove" data-remove-idx="${idx}" title="${esc(uiTx('从列表移除'))}" aria-label="${esc(uiTx('从列表移除'))}"><i class="fa fa-trash-o"></i></button>`
            : '';

        return `
            <div class="task-card${isRunning ? ' is-running-rich' : ''}" data-idx="${idx}" data-status="${esc(status)}" data-path="${esc(String(item.path || ''))}" draggable="false">
                <button type="button" class="task-card-drag" draggable="true" title="${esc(uiTx('拖拽排序'))}" aria-label="${esc(uiTx('拖拽排序'))}" ${running ? 'disabled' : ''}>
                    <i class="fa fa-ellipsis-v" aria-hidden="true"></i><i class="fa fa-ellipsis-v" aria-hidden="true"></i>
                </button>
                <span class="task-card-stripe" aria-hidden="true"></span>
                <label class="task-card-check">
                    <input type="checkbox" data-row-check ${item.selected ? 'checked' : ''} ${running ? 'disabled' : ''}>
                </label>
                <div class="task-card-fileico" aria-hidden="true"><i class="fa fa-file-video-o"></i></div>
                <div class="task-card-main">
                    ${nameHtml}
                    <div class="task-card-meta">${metaHtml}</div>
                </div>
                <div class="task-card-status">
                    <span class="row-status-badge ${esc(meta.cls)}">${esc(meta.label)}</span>
                    ${elapsedHtml}
                </div>
                <div class="task-card-progress-col">
                    ${isRunning
                        ? `<div class="task-card-prog" title="${Math.round(pct)}%"><i class="task-card-prog-bar" style="width:${Math.round(pct)}%"></i></div>
                            <span class="task-card-progress tabular-nums">${Math.round(pct)}%</span>`
                        : (progressBit || '<span class="task-card-progress tabular-nums">—</span>')}
                </div>
                <div class="task-card-actions">
                    ${executeBtn}
                    ${burnBtn}
                    ${stopBtn}
                    ${removeBtn}
                    ${subPath
                        ? `<button type="button" class="row-action-btn" data-edit-sub="${esc(subPath)}" data-edit-video="${esc(item.path)}" title="${esc(uiTx('编辑字幕'))}"><i class="fa fa-pencil"></i></button>`
                        : ''}
                    <button type="button" class="row-action-btn" data-show-folder="${esc(ctx.revealPath || item.path || '')}" data-idx="${idx}" title="${esc(uiTx('在文件夹中显示'))}" ${(ctx.revealPath || item.path) ? '' : 'disabled'}><i class="fa fa-folder-open"></i></button>
                    ${moreBtn}
                </div>
                ${richExtra}
            </div>`;
    }

    return {
        PIPELINE,
        STAGE_TO_PIPE,
        normalizeView,
        pipelineStages,
        pipelineIndexForStage,
        pipelineIndexForProgress,
        resolvePipelineIndex,
        taskLabel,
        languageLabel,
        targetLabel,
        buildRecipeSummary,
        findStationItem,
        filterQueueIndices,
        buildPipelineRailHtml,
        buildStationHtml,
        buildCardHtml,
    };
}));
