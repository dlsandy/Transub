/**
 * Subtitle burn-in workspace UI — task-list association + param chips.
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const core = global.TransubSubtitleBurnCore || {};
    const previewApi = global.TransubSubtitleBurnPreview || {};
    const presetsApi = global.TransubSubtitleBurnStylePresets || {};

    function defaultFreeStyle() {
        const pack = presetsApi.defaultFreePreset?.() || presetsApi.getBuiltin?.('watch-white');
        if (pack?.style && presetsApi.toBasicStyle) {
            return {
                basicStyle: presetsApi.toBasicStyle(pack.style),
                activePresetId: pack.id,
                activePresetName: pack.name,
            };
        }
        return {
            basicStyle: { ...(core.DEFAULT_BASIC_STYLE || {}) },
            activePresetId: 'watch-white',
            activePresetName: '观影白字',
        };
    }

    const initialStyle = defaultFreeStyle();
    const savedWorkspace = (typeof core.loadWorkspaceOptions === 'function'
        ? core.loadWorkspaceOptions()
        : null) || null;

    const state = {
        container: 'mp4',
        styleMode: savedWorkspace?.styleMode === 'document' ? 'document' : 'basic',
        outputMode: savedWorkspace?.outputMode === 'softsub' ? 'softsub' : 'hardsub',
        audioMode: 'copy',
        basicStyle: savedWorkspace?.basicStyle
            ? (core.normalizeBasicStyle
                ? core.normalizeBasicStyle(savedWorkspace.basicStyle)
                : savedWorkspace.basicStyle)
            : initialStyle.basicStyle,
        activePresetId: savedWorkspace?.activePresetId || initialStyle.activePresetId,
        activePresetName: savedWorkspace?.activePresetName || initialStyle.activePresetName,
        crf: 18,
        resolutionId: 'source',
        fpsId: 'source',
        encodeSpeedId: 'medium',
        outputSuffix: savedWorkspace?.outputMode === 'softsub' ? 'softsub' : 'burned',
        outputDir: '',
        encoderId: 'libx264',
        encoders: Array.isArray(core.ENCODER_PRESETS) ? core.ENCODER_PRESETS.map((p) => ({ ...p })) : [],
        proEntitled: false,
        batch: [],
        activeBatchId: '',
        selectedIds: new Set(),
        filterTab: 'all',
        running: false,
        cancelRequested: false,
        bound: false,
        unsubProgress: null,
        lastOutputPath: '',
        preview: null,
        previewOpen: false,
        previewItemId: '',
        persistTimer: null,
    };

    function $(id) {
        return document.getElementById(id);
    }

    function fileLabel(p) {
        if (!p) return '未关联';
        if (core.baseName) return core.baseName(p);
        const s = String(p).replace(/\\/g, '/');
        return s.split('/').pop() || p;
    }

    function isAssociated(it) {
        if (core.isItemAssociated) return core.isItemAssociated(it);
        return !!(it?.videoPath && (it?.subtitlePath || it?.bilingualSubtitlePath || it?.sourceSubtitlePath));
    }

    function effectiveSubPath(it) {
        return core.preferBurnSubtitlePath
            ? core.preferBurnSubtitlePath(it)
            : (it?.subtitlePath || it?.bilingualSubtitlePath || it?.sourceSubtitlePath || '');
    }

    function setStatus(text, kind = 'info') {
        const msg = String(text || '').trim();
        if (!msg) return;
        const ux = global.TransubMainUiUx || global.TransubUx;
        const tone = kind === 'error' ? 'err' : kind === 'ok' ? 'ok' : 'info';
        try {
            ux?.showToast?.(msg, tone);
        } catch (_) { /* ignore */ }
    }

    async function alertBurn(message, title = '无法开始烧录') {
        const msg = String(message || '').trim();
        if (!msg) return;
        const ux = global.TransubMainUiUx || global.TransubUx;
        if (ux?.confirmDialog) {
            await ux.confirmDialog({
                title,
                message: msg,
                primaryLabel: '知道了',
                hideSecondary: true,
            });
            return;
        }
        try {
            window.alert(msg);
        } catch (_) { /* ignore */ }
    }

    function setProgress(percent, detail) {
        const wrap = $('burnProgressWrap');
        const bar = $('burnProgressBar');
        const pct = $('burnProgressPct');
        const text = $('burnProgressText');
        if (wrap) wrap.classList.toggle('hidden', percent == null && !state.running);
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
        if (pct) pct.textContent = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
        if (text && detail != null) text.textContent = detail;
    }

    function statusLabel(status, associated) {
        if (associated === false && (status === 'pending' || !status)) return '未关联';
        const map = {
            pending: '等待',
            running: '烧录中',
            done: '完成',
            failed: '失败',
            cancelled: '已取消',
        };
        return map[status] || status || '等待';
    }

    function statusBadgeClass(status, associated) {
        if (!associated && status === 'pending') return 'is-warn';
        if (status === 'done') return 'is-ok';
        if (status === 'failed' || status === 'cancelled') return 'is-err';
        if (status === 'running') return 'is-run';
        return 'is-idle';
    }

    function formatElapsed(ms) {
        const n = Number(ms);
        if (!Number.isFinite(n) || n < 0) return '—';
        const sec = Math.floor(n / 1000);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function itemElapsedMs(it) {
        if (Number.isFinite(it?.elapsedMs) && it.elapsedMs >= 0 && it.status !== 'running') {
            return it.elapsedMs;
        }
        if (it?.status === 'running' && it.startedAt) {
            return Math.max(0, Date.now() - Number(it.startedAt));
        }
        return null;
    }

    function itemElapsedText(it) {
        const ms = itemElapsedMs(it);
        if (ms == null) return '—';
        return formatElapsed(ms);
    }

    function sharedOpts() {
        return {
            container: state.container,
            styleMode: state.styleMode,
            outputMode: state.outputMode,
            audioMode: state.audioMode,
            basicStyle: state.basicStyle,
            crf: state.crf,
            resolutionId: state.resolutionId,
            fpsId: state.fpsId,
            encodeSpeedId: state.encodeSpeedId,
            outputSuffix: state.outputSuffix,
            outputDir: state.outputDir,
            encoderId: state.encoderId,
            preferDual: state.styleMode === 'document' || state.basicStyle?.enableSource === true,
        };
    }

    function persistWorkspaceOptionsSoon() {
        if (state.persistTimer) {
            try { clearTimeout(state.persistTimer); } catch (_) { /* ignore */ }
        }
        state.persistTimer = setTimeout(() => {
            state.persistTimer = null;
            try {
                core.saveWorkspaceOptions?.({
                    styleMode: state.styleMode,
                    outputMode: state.outputMode,
                    basicStyle: state.basicStyle,
                    activePresetId: state.activePresetId,
                    activePresetName: state.activePresetName,
                });
            } catch (_) { /* ignore */ }
        }, 200);
    }

    function applyBurnEncodeFromSaved(opts = {}) {
        const n = core.normalizeBurnSettingsOptions
            ? core.normalizeBurnSettingsOptions(opts)
            : {
                burnContainer: opts.burnContainer === 'mkv' ? 'mkv' : 'mp4',
                burnEncoderId: String(opts.burnEncoderId || 'libx264').trim() || 'libx264',
                burnAudioMode: opts.burnAudioMode === 'aac' ? 'aac' : 'copy',
                burnCrf: 18,
                burnResolutionId: String(opts.burnResolutionId || 'source'),
                burnFpsId: String(opts.burnFpsId || 'source'),
                burnEncodeSpeedId: String(opts.burnEncodeSpeedId || 'medium'),
                burnOutputSuffix: String(opts.burnOutputSuffix || 'burned').trim() || 'burned',
                burnOutputDir: String(opts.burnOutputDir || '').trim(),
            };
        state.container = n.burnContainer;
        state.audioMode = n.burnAudioMode;
        state.crf = n.burnCrf;
        state.resolutionId = n.burnResolutionId;
        state.fpsId = n.burnFpsId;
        state.encodeSpeedId = n.burnEncodeSpeedId;
        state.outputSuffix = n.burnOutputSuffix;
        state.outputDir = n.burnOutputDir;
        state.encoderId = core.normalizeEncoderId
            ? core.normalizeEncoderId(n.burnEncoderId, { allowPro: state.proEntitled })
            : n.burnEncoderId;
    }

    async function loadBurnEncodeSettings() {
        try {
            const res = await electron?.transWithAiGetOptions?.();
            const opts = (res && typeof res === 'object' && res.options) ? res.options : res;
            if (opts && typeof opts === 'object') {
                applyBurnEncodeFromSaved(opts);
                return true;
            }
        } catch (_) { /* ignore */ }
        return false;
    }

    async function reloadEncodeSettings() {
        await loadBurnEncodeSettings();
        applySharedOptsToPending();
        syncFormFromState();
    }

    function applyEncodeSettings(opts = {}) {
        applyBurnEncodeFromSaved(opts);
        applySharedOptsToPending();
        syncFormFromState();
    }

    function syncHardsubOnlyChips() {
        const hard = state.outputMode !== 'softsub';
        [
            'burnStyleModeSelect',
            'burnStylePresetsBtn',
        ].forEach((id) => {
            const el = $(id);
            if (!el) return;
            const wrap = el.closest('.param-chip') || el;
            wrap.classList.toggle('is-disabled', !hard);
            if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'BUTTON') {
                if (id === 'burnStylePresetsBtn') el.disabled = !hard;
                else if (el.tagName !== 'BUTTON') el.disabled = !hard;
            }
        });
    }

    function pendingItems() {
        return state.batch.filter((i) => i.status === 'pending');
    }

    function readyPendingItems() {
        return pendingItems().filter(isAssociated);
    }

    function incompletePendingCount() {
        return pendingItems().filter((i) => !isAssociated(i)).length;
    }

    function canStartBurn() {
        if (state.running) return false;
        const pending = pendingItems();
        if (!pending.length) return false;
        return incompletePendingCount() === 0 && readyPendingItems().length > 0;
    }

    function tabCounts() {
        const counts = { all: state.batch.length, active: 0, done: 0, failed: 0 };
        state.batch.forEach((it) => {
            if (it.status === 'running' || it.status === 'pending') counts.active += 1;
            else if (it.status === 'done') counts.done += 1;
            else if (it.status === 'failed' || it.status === 'cancelled') counts.failed += 1;
        });
        return counts;
    }

    function matchesFilter(it) {
        const tab = state.filterTab || 'all';
        if (tab === 'all') return true;
        if (tab === 'active') return it.status === 'running' || it.status === 'pending';
        if (tab === 'done') return it.status === 'done';
        if (tab === 'failed') return it.status === 'failed' || it.status === 'cancelled';
        return true;
    }

    function syncEmptyAndListVisibility() {
        const empty = $('burnEmptyState');
        const list = $('burnBatchList');
        const hasItems = state.batch.length > 0;
        if (empty) empty.classList.toggle('hidden', hasItems);
        if (list) list.classList.toggle('hidden', !hasItems);
    }

    function syncFilterTabs() {
        const counts = tabCounts();
        const map = {
            all: 'burnTabAllCount',
            active: 'burnTabActiveCount',
            done: 'burnTabDoneCount',
            failed: 'burnTabFailedCount',
        };
        Object.keys(map).forEach((key) => {
            const el = $(map[key]);
            if (el) el.textContent = String(counts[key] || 0);
        });
        document.querySelectorAll('#burnFilterTabs [data-burn-tab]').forEach((btn) => {
            const on = btn.getAttribute('data-burn-tab') === state.filterTab;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    }

    function syncPresetChip() {
        const chipLabel = $('burnStylePresetChipLabel');
        if (!chipLabel) return;
        if (state.styleMode === 'document') {
            chipLabel.textContent = '文档(ass)';
            return;
        }
        chipLabel.textContent = state.activePresetName
            ? String(state.activePresetName).slice(0, 10)
            : '预设';
    }

    function applyBurnStyleFromPreset(basicStyle, meta = {}) {
        state.basicStyle = core.normalizeBasicStyle
            ? core.normalizeBasicStyle(basicStyle)
            : { ...state.basicStyle, ...basicStyle };
        state.activePresetId = String(meta.presetId || '').trim();
        state.activePresetName = String(meta.presetName || '').trim().slice(0, 40);
        if (state.styleMode === 'document') {
            state.styleMode = 'basic';
        }
        applySharedOptsToPending();
        syncFormFromState();
        persistWorkspaceOptionsSoon();
        setStatus(
            state.activePresetName
                ? `已应用样式预设「${state.activePresetName}」`
                : '已应用烧录样式',
            'ok',
        );
    }

    function trackButtonsHtml(it) {
        const track = core.normalizeSubtitleTrack
            ? core.normalizeSubtitleTrack(it.subtitleTrack)
            : (it.subtitleTrack || 'auto');
        const hasTarget = !!String(it.subtitlePath || '').trim();
        const hasSource = !!String(it.sourceSubtitlePath || '').trim();
        const disabled = state.running ? ' disabled' : '';
        const mk = (role, label, linked) => {
            const isSelected = track === role
                || (track === 'auto' && role === 'target' && linked && !hasSource)
                || (track === 'auto' && role === 'source' && linked && !hasTarget);
            const classes = [
                'burn-track-btn',
                linked ? 'is-linked' : 'is-unlinked',
                isSelected ? 'is-selected' : '',
            ].filter(Boolean).join(' ');
            const title = linked
                ? (isSelected
                    ? `烧录使用${label}（再次点击可重新关联）`
                    : `已关联${label}，点击切换为烧录轨`)
                : `未关联${label}，点击选择文件`;
            return `<button type="button" class="${classes}" data-burn-track-btn="${escapeHtml(it.id)}" data-burn-track-role="${role}" title="${escapeHtml(title)}"${disabled}>${escapeHtml(label)}</button>`;
        };
        return `<div class="burn-track-btns" role="group" aria-label="字幕轨">${mk('target', '译文', hasTarget)}${mk('source', '原文', hasSource)}</div>`;
    }

    function subMetaLine(it) {
        const effective = effectiveSubPath(it);
        const name = effective ? fileLabel(effective) : '未关联字幕';
        const bits = [];
        if (it.bilingualSubtitlePath) bits.push('双语');
        if (it.subtitlePath) bits.push('译文');
        if (it.sourceSubtitlePath) bits.push('原文');
        const tag = bits.length ? `（${bits.join('/')}）` : '';
        return { name, tag, effective };
    }

    function renderBatchList() {
        const host = $('burnBatchList');
        if (!host) return;
        const summary = core.batchSummary ? core.batchSummary(state.batch) : { total: state.batch.length };
        const incomplete = incompletePendingCount();
        const summaryEl = $('burnBatchSummary');
        if (summaryEl) {
            if (!summary.total) {
                summaryEl.textContent = '队列为空';
            } else if (incomplete) {
                summaryEl.textContent = `${summary.total} 项 · ${incomplete} 项未关联完整`;
            } else {
                summaryEl.textContent = `${summary.total} 项 · 完成 ${summary.done || 0} · 失败 ${summary.failed || 0} · 等待 ${summary.pending || 0}`;
            }
        }
        syncFilterTabs();
        syncEmptyAndListVisibility();

        const visible = state.batch.filter(matchesFilter);
        if (!state.batch.length) {
            host.innerHTML = '';
            return;
        }
        if (!visible.length) {
            host.innerHTML = '<p class="factory-burn-batch-empty">当前筛选下没有任务</p>';
            return;
        }

        host.innerHTML = visible.map((it) => {
            const associated = isAssociated(it);
            const active = it.id === state.activeBatchId ? ' is-active' : '';
            const focused = state.selectedIds.has(it.id) ? ' is-focused' : '';
            const incompleteCls = (!associated && it.status === 'pending') ? ' is-incomplete' : '';
            const isRunning = it.status === 'running';
            const pct = Math.max(0, Math.min(100, Number(it.percent) || 0));
            const checked = state.selectedIds.has(it.id) ? ' checked' : '';
            const videoName = it.videoPath ? fileLabel(it.videoPath) : '未关联视频';
            const meta = subMetaLine(it);
            const statusText = statusLabel(it.status, associated);
            const badgeCls = statusBadgeClass(it.status, associated);
            const elapsedText = itemElapsedText(it);
            const errLine = it.error
                ? `<span class="burn-card-status-err" title="${escapeHtml(it.error)}">${escapeHtml(it.error)}</span>`
                : '';
            const canBurnItem = associated && !state.running && it.status !== 'running';
            return `<div class="task-card burn-task-card${active}${focused}${incompleteCls}" data-burn-id="${escapeHtml(it.id)}" data-status="${escapeHtml(it.status)}" data-associated="${associated ? '1' : '0'}">
                <label class="task-card-check">
                    <input type="checkbox" data-burn-check="${escapeHtml(it.id)}"${checked}${state.running ? ' disabled' : ''}>
                </label>
                <span class="task-card-stripe" aria-hidden="true"></span>
                <div class="task-card-fileico" aria-hidden="true"><i class="fa fa-file-video-o"></i></div>
                <div class="task-card-main">
                    <span class="task-card-name${it.videoPath ? '' : ' is-missing'}" title="${escapeHtml(it.videoPath || '')}">${escapeHtml(videoName)}</span>
                    <div class="task-card-meta burn-card-submeta">
                        <span class="${meta.effective ? '' : 'burn-assoc-missing'}" title="${escapeHtml(meta.effective || '')}">字幕 · ${escapeHtml(meta.name)}${escapeHtml(meta.tag)}</span>
                        ${trackButtonsHtml(it)}
                    </div>
                </div>
                <div class="task-card-status burn-card-status">
                    <span class="burn-status-badge ${badgeCls}">${escapeHtml(statusText)}</span>
                    <span class="task-card-elapsed tabular-nums" title="耗时">耗时 ${escapeHtml(elapsedText)}</span>
                    ${errLine}
                </div>
                <div class="task-card-progress-col burn-card-progress">
                    ${isRunning || it.status === 'done'
                        ? `<div class="task-card-prog" title="${pct}%"><i style="width:${it.status === 'done' ? 100 : pct}%"></i></div>
                            <span class="task-card-progress tabular-nums">${it.status === 'done' ? '100%' : `${pct}%`}</span>`
                        : `<span class="task-card-progress tabular-nums">—</span>`}
                </div>
                <div class="task-card-actions burn-card-actions">
                    <button type="button" class="row-action-btn" data-burn-act="burn" data-burn-id="${escapeHtml(it.id)}" title="烧录" aria-label="烧录" ${canBurnItem ? '' : 'disabled'}>
                        <i class="fa fa-fire" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="row-action-btn" data-burn-act="preview" data-burn-id="${escapeHtml(it.id)}" title="预览" aria-label="预览" ${associated ? '' : 'disabled'}>
                        <i class="fa fa-eye" aria-hidden="true"></i>
                    </button>
                    ${it.status === 'done' && it.outputPath
                        ? `<button type="button" class="row-action-btn" data-burn-act="reveal" data-burn-id="${escapeHtml(it.id)}" title="打开输出" aria-label="打开输出"><i class="fa fa-folder-open-o" aria-hidden="true"></i></button>`
                        : ''}
                    <button type="button" class="row-action-btn is-remove" data-burn-act="remove" data-burn-id="${escapeHtml(it.id)}" title="移除" aria-label="移除" ${state.running ? 'disabled' : ''}>
                        <i class="fa fa-trash-o" aria-hidden="true"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function syncFormFromState() {
        const styleEl = $('burnStyleModeSelect');
        const outModeEl = $('burnOutputModeSelect');

        if (styleEl) styleEl.value = state.styleMode === 'document' ? 'document' : 'basic';
        if (outModeEl) outModeEl.value = state.outputMode === 'softsub' ? 'softsub' : 'hardsub';

        syncPresetChip();
        syncHardsubOnlyChips();
        persistWorkspaceOptionsSoon();

        const batchStartBtn = $('burnBatchStartBtn');
        const cancelBtn = $('burnCancelBtn');
        const removeBtn = $('burnRemoveSelectedBtn');
        const clearBtn = $('burnClearListBtn');
        if (batchStartBtn) batchStartBtn.disabled = !canStartBurn();
        if (cancelBtn) cancelBtn.disabled = !state.running;
        if (removeBtn) removeBtn.disabled = state.running || !state.selectedIds.size;
        if (clearBtn) clearBtn.disabled = state.running || !state.batch.length;

        renderBatchList();
    }

    function readStyleFromForm() {
        const style = $('burnStyleModeSelect')?.value;
        state.styleMode = style === 'document' ? 'document' : 'basic';
        const outMode = $('burnOutputModeSelect')?.value;
        const prevOutMode = state.outputMode;
        state.outputMode = core.normalizeOutputMode
            ? core.normalizeOutputMode(outMode)
            : (outMode === 'softsub' ? 'softsub' : 'hardsub');
        // Softsub default suffix hint for this session only (settings.json is source of truth).
        if (prevOutMode !== state.outputMode) {
            if (state.outputMode === 'softsub' && (state.outputSuffix === 'burned' || !state.outputSuffix)) {
                state.outputSuffix = 'softsub';
            } else if (state.outputMode === 'hardsub' && state.outputSuffix === 'softsub') {
                state.outputSuffix = 'burned';
            }
        }
    }

    function applySharedOptsToPending() {
        state.batch = state.batch.map((it) => {
            if (it.status !== 'pending') return it;
            const next = {
                ...it,
                styleMode: state.styleMode,
                outputMode: state.outputMode,
                audioMode: state.audioMode,
                basicStyle: { ...state.basicStyle },
                crf: state.crf,
                resolutionId: state.resolutionId,
                fpsId: state.fpsId,
                encodeSpeedId: state.encodeSpeedId,
                outputSuffix: state.outputSuffix,
                outputDir: state.outputDir,
                encoderId: state.encoderId,
                container: state.container,
            };
            if (next.videoPath && core.defaultOutputPath) {
                next.outputPath = core.defaultOutputPath(next.videoPath, state.container, {
                    suffix: state.outputSuffix,
                    outputDir: state.outputDir,
                });
            }
            return next;
        });
    }

    async function refreshProAndEncoders() {
        try {
            const st = await electron?.transubAdvancedGetStatus?.();
            state.proEntitled = !!(st?.entitled || st?.status?.entitled || st?.devUnlock);
        } catch (_) {
            state.proEntitled = false;
        }
        try {
            global.TransubSubtitleBurnStylePresetsUi?.setProEntitled?.(state.proEntitled);
        } catch (_) { /* ignore */ }
        try {
            const res = await electron?.ffmpegBurnListEncoders?.({});
            if (res?.ok && Array.isArray(res.encoders) && res.encoders.length) {
                state.encoders = res.encoders;
            }
        } catch (_) { /* keep defaults */ }
        await loadBurnEncodeSettings();
        state.encoderId = core.normalizeEncoderId
            ? core.normalizeEncoderId(state.encoderId, { allowPro: state.proEntitled })
            : 'libx264';
        applySharedOptsToPending();
        syncFormFromState();
    }

    async function ensureDocumentStyleAllowed() {
        if (state.outputMode === 'softsub') return { ok: true };
        if (state.styleMode !== 'document') return { ok: true };
        if (!electron?.transubAdvancedRequireFeature) {
            return { ok: false, error: '文档样式烧录需要 Pro（ASS 样式导出）', needPro: true };
        }
        const res = await electron.transubAdvancedRequireFeature({ featureId: 'assStyleExport' });
        if (res?.ok) return { ok: true };
        return {
            ok: false,
            error: res?.error || res?.message || '文档样式烧录需要 Pro（ASS 样式导出）',
            needPro: true,
        };
    }

    async function ensureEncoderAllowed() {
        const preset = core.getEncoderPreset
            ? core.getEncoderPreset(state.encoderId)
            : { id: state.encoderId, pro: state.encoderId !== 'libx264' };
        if (!preset?.pro) return { ok: true };
        if (state.proEntitled) return { ok: true };
        return { ok: false, error: '硬件编码需要 Pro', needPro: true };
    }

    function promptPro(label) {
        if (typeof global.promptProUnlockRequired === 'function') {
            try { void global.promptProUnlockRequired({ featureLabel: label }); } catch (_) { /* ignore */ }
        }
    }

    function setAddMenuOpen(open) {
        const menu = $('burnAddMenu');
        const btn = $('burnAddMenuBtn');
        if (menu) menu.classList.toggle('hidden', !open);
        if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function findItem(id) {
        return state.batch.find((i) => i.id === id);
    }

    function patchItem(id, patch) {
        const idx = state.batch.findIndex((i) => i.id === id);
        if (idx < 0) return null;
        const cur = state.batch[idx];
        const next = { ...cur, ...patch };
        if (next.videoPath && core.defaultOutputPath) {
            next.outputPath = core.defaultOutputPath(next.videoPath, next.container || state.container, {
                suffix: next.outputSuffix || state.outputSuffix,
                outputDir: next.outputDir != null ? next.outputDir : state.outputDir,
            });
        }
        if (next.status === 'failed' || next.status === 'cancelled') {
            /* keep */
        } else if (next.status !== 'running' && next.status !== 'done') {
            next.status = 'pending';
            next.error = '';
            next.percent = 0;
        }
        state.batch[idx] = next;
        return next;
    }

    async function scanSidecarBundle(videoPath) {
        const empty = { subtitlePath: '', bilingualSubtitlePath: '', sourceSubtitlePath: '' };
        if (!videoPath) return empty;
        let sidecars = [];
        try {
            if (electron?.transubListSubtitleSidecars) {
                const listed = await electron.transubListSubtitleSidecars({ videoPath });
                sidecars = Array.isArray(listed?.sidecars) ? listed.sidecars : [];
            }
        } catch (_) { /* ignore */ }

        if (core.pickBurnTracksFromSidecars && sidecars.length) {
            const picked = core.pickBurnTracksFromSidecars(videoPath, sidecars);
            if (picked.subtitlePath || picked.bilingualSubtitlePath || picked.sourceSubtitlePath) {
                return picked;
            }
        }

        // Fallback: legacy check-subtitles single pick as target.
        try {
            if (electron?.transWithAiCheckSubtitles) {
                const res = await electron.transWithAiCheckSubtitles({ paths: [videoPath] });
                const one = res?.ok && res.subtitles ? String(res.subtitles[videoPath] || '').trim() : '';
                if (one) return { ...empty, subtitlePath: one };
            }
        } catch (_) { /* ignore */ }
        return empty;
    }

    async function scanSidecarsForVideos(videoPaths) {
        const paths = (Array.isArray(videoPaths) ? videoPaths : [])
            .map((p) => String(p || '').trim())
            .filter(Boolean);
        const map = {};
        await Promise.all(paths.map(async (videoPath) => {
            map[videoPath] = await scanSidecarBundle(videoPath);
        }));
        return map;
    }

    async function addVideos(videoPaths) {
        if (state.running) return;
        const paths = [...new Set(
            (Array.isArray(videoPaths) ? videoPaths : [])
                .map((p) => String(p || '').trim())
                .filter(Boolean),
        )];
        if (!paths.length) return;

        readStyleFromForm();
        setStatus('正在扫描旁路字幕…');
        const sidecarMap = await scanSidecarsForVideos(paths);

        let added = 0;
        let linked = 0;
        for (const videoPath of paths) {
            const already = state.batch.some((it) => String(it.videoPath || '').toLowerCase() === videoPath.toLowerCase()
                && it.status === 'pending');
            if (already) continue;
            const bundle = sidecarMap[videoPath] || {};
            const made = core.createDraftBatchItem
                ? core.createDraftBatchItem({
                    videoPath,
                    subtitlePath: bundle.subtitlePath || '',
                    bilingualSubtitlePath: bundle.bilingualSubtitlePath || '',
                    sourceSubtitlePath: bundle.sourceSubtitlePath || '',
                }, sharedOpts())
                : { ok: false, error: '烧录模块未加载' };
            if (!made.ok) continue;
            state.batch.push(made.item);
            state.selectedIds.add(made.item.id);
            added += 1;
            if (isAssociated(made.item)) linked += 1;
        }

        if (!added) {
            setStatus('未添加新视频（可能已在队列中）', 'error');
            syncFormFromState();
            return;
        }
        const unlinked = added - linked;
        setStatus(
            unlinked
                ? `已添加 ${added} 项，自动关联字幕 ${linked} 项，${unlinked} 项需手动关联`
                : `已添加 ${added} 项，并自动关联旁路字幕`,
            'ok',
        );
        syncFormFromState();
    }

    async function addVideoOnly() {
        if (state.running) return;
        try {
            const res = await electron?.transubSelectEditorVideo?.({
                title: '选择要烧录的视频（可多选）',
                multiple: true,
            });
            if (!res?.ok || res.canceled) return;
            const paths = Array.isArray(res.paths) && res.paths.length
                ? res.paths
                : (res.path ? [res.path] : []);
            await addVideos(paths);
        } catch (err) {
            setStatus(err?.message || '选择视频失败', 'error');
        }
    }

    async function associateVideo(id) {
        const item = findItem(id);
        if (!item || state.running) return;
        try {
            const res = await electron?.transubSelectEditorVideo?.({
                title: '关联视频',
                defaultPath: item.videoPath || item.subtitlePath || '',
                multiple: false,
            });
            if (!res?.ok || res.canceled || !res.path) return;
            const videoPath = res.path;
            const bundle = await scanSidecarBundle(videoPath);
            patchItem(id, {
                videoPath,
                subtitlePath: bundle.subtitlePath || item.subtitlePath || '',
                bilingualSubtitlePath: bundle.bilingualSubtitlePath || item.bilingualSubtitlePath || '',
                sourceSubtitlePath: bundle.sourceSubtitlePath || item.sourceSubtitlePath || '',
            });
            const next = findItem(id);
            setStatus(
                isAssociated(next)
                    ? `已关联视频并扫描到字幕：${fileLabel(effectiveSubPath(next))}`
                    : `已关联视频：${fileLabel(videoPath)} — 未找到旁路字幕`,
                'ok',
            );
            syncFormFromState();
        } catch (err) {
            setStatus(err?.message || '关联视频失败', 'error');
        }
    }

    async function askSubtitleRole(filePath, hintedRole) {
        if (hintedRole && hintedRole !== 'unknown') return hintedRole;
        const ux = global.TransubMainUiUx || global.TransubUx;
        if (ux?.confirmDialog) {
            const result = await ux.confirmDialog({
                title: '字幕轨类型',
                message: `未能从文件名判断「${fileLabel(filePath)}」的轨类型，请选择：`,
                primaryLabel: '译文',
                tertiaryLabel: '原文',
                secondaryLabel: '双语文档',
            });
            // Dialog has no true cancel when all three are roles; Esc → secondary.
            if (result === 'tertiary') return 'source';
            if (result === 'secondary') return 'dual';
            return 'target';
        }
        return 'target';
    }

    async function associateSubtitle(id, forcedRole) {
        const item = findItem(id);
        if (!item || state.running) return;
        try {
            const roleHint = forcedRole === 'source' || forcedRole === 'target' || forcedRole === 'dual'
                ? forcedRole
                : '';
            const res = await electron?.transubSelectSubtitle?.({
                title: roleHint === 'source'
                    ? '关联原文字幕'
                    : (roleHint === 'target' ? '关联译文字幕' : '关联字幕'),
                defaultPath: item.subtitlePath || item.bilingualSubtitlePath || item.sourceSubtitlePath || item.videoPath || '',
            });
            if (!res?.ok || res.canceled || !res.path) return;
            const picked = res.path;
            let role = roleHint;
            if (!role) {
                role = core.classifyBurnSidecarRole
                    ? core.classifyBurnSidecarRole(picked, core.stemOf?.(item.videoPath || picked))
                    : 'unknown';
                role = await askSubtitleRole(picked, role);
            }
            const patch = { subtitleTrack: role === 'source' ? 'source' : (role === 'dual' ? 'dual' : 'target') };
            if (!item.videoPath && res.videoPath) patch.videoPath = res.videoPath;
            if (role === 'dual') {
                patch.bilingualSubtitlePath = picked;
            } else if (role === 'source') {
                patch.sourceSubtitlePath = picked;
            } else {
                patch.subtitlePath = picked;
            }
            patchItem(id, patch);
            const roleLabel = role === 'dual' ? '双语' : role === 'source' ? '原文' : '译文';
            setStatus(`已关联字幕：${fileLabel(picked)}（${roleLabel}）`, 'ok');
            syncFormFromState();
        } catch (err) {
            setStatus(err?.message || '关联字幕失败', 'error');
        }
    }

    async function onTrackButtonClick(id, role) {
        if (state.running) return;
        const item = findItem(id);
        if (!item) return;
        const want = role === 'source' ? 'source' : 'target';
        const linked = want === 'source'
            ? !!String(item.sourceSubtitlePath || '').trim()
            : !!String(item.subtitlePath || '').trim();
        if (!linked) {
            await associateSubtitle(id, want);
            return;
        }
        const track = core.normalizeSubtitleTrack
            ? core.normalizeSubtitleTrack(item.subtitleTrack)
            : (item.subtitleTrack || 'auto');
        // Already the active burn track → re-associate that role.
        if (track === want) {
            await associateSubtitle(id, want);
            return;
        }
        patchItem(id, { subtitleTrack: want });
        syncFormFromState();
        setStatus(`烧录轨已切换为${want === 'source' ? '原文' : '译文'}`, 'ok');
    }

    function openBurnEncodeSettings() {
        if (typeof global.TransubCore?.openAppSettings === 'function') {
            global.TransubCore.openAppSettings('burn');
            return;
        }
        if (typeof global.TransubCore?.openParamsModal === 'function') {
            void global.TransubCore.openParamsModal('burn');
            return;
        }
        setStatus('请打开设置 → 字幕烧录，调整参数', 'error');
    }

    function addPairsToBatch(pairs) {
        readStyleFromForm();
        void (async () => {
            const list = Array.isArray(pairs) ? pairs : [];
            const needScan = list
                .map((p) => ({
                    videoPath: String(p?.videoPath || p?.path || '').trim(),
                    subtitlePath: String(p?.subtitlePath || '').trim(),
                    bilingualSubtitlePath: String(p?.bilingualSubtitlePath || '').trim(),
                    sourceSubtitlePath: String(p?.sourceSubtitlePath || '').trim(),
                    outputPath: String(p?.outputPath || '').trim(),
                }))
                .filter((p) => p.videoPath);
            const missing = needScan.filter((p) => !p.subtitlePath && !p.bilingualSubtitlePath && !p.sourceSubtitlePath)
                .map((p) => p.videoPath);
            let sidecarMap = {};
            if (missing.length) {
                setStatus('正在扫描旁路字幕…');
                sidecarMap = await scanSidecarsForVideos(missing);
            }
            const enriched = needScan.map((p) => {
                const bundle = sidecarMap[p.videoPath] || {};
                return {
                    ...p,
                    subtitlePath: p.subtitlePath || bundle.subtitlePath || '',
                    bilingualSubtitlePath: p.bilingualSubtitlePath || bundle.bilingualSubtitlePath || '',
                    sourceSubtitlePath: p.sourceSubtitlePath || bundle.sourceSubtitlePath || '',
                };
            });
            const res = core.createBatchFromPairs
                ? core.createBatchFromPairs(enriched, sharedOpts())
                : { ok: false, items: [], errors: ['烧录模块未加载'] };
            if (!res.ok || !res.items.length) {
                setStatus((res.errors && res.errors[0]) || '没有可加入的项', 'error');
                return;
            }
            state.batch.push(...res.items);
            res.items.forEach((it) => state.selectedIds.add(it.id));
            const incomplete = res.items.filter((i) => !isAssociated(i)).length;
            const linked = res.items.length - incomplete;
            setStatus(
                incomplete
                    ? `已加入 ${res.items.length} 项（自动关联 ${linked}，${incomplete} 项需手动关联）`
                    : `已加入 ${res.items.length} 项到烧录队列`,
                'ok',
            );
            syncFormFromState();
        })();
    }

    function applyPayload(payload = {}) {
        const p = payload && typeof payload === 'object' ? payload : {};
        if (Array.isArray(p.items) && p.items.length) {
            addPairsToBatch(p.items);
            return;
        }
        const videoPath = String(p.videoPath || p.path || '').trim();
        if (!videoPath && !p.subtitlePath && !p.bilingualSubtitlePath) {
            setStatus('没有可加入的素材', 'error');
            return;
        }
        void (async () => {
            readStyleFromForm();
            let subtitlePath = String(p.subtitlePath || '').trim();
            let bilingualSubtitlePath = String(p.bilingualSubtitlePath || '').trim();
            let sourceSubtitlePath = String(p.sourceSubtitlePath || '').trim();
            if (videoPath && !subtitlePath && !bilingualSubtitlePath && !sourceSubtitlePath) {
                setStatus('正在扫描旁路字幕…');
                const bundle = await scanSidecarBundle(videoPath);
                subtitlePath = bundle.subtitlePath || '';
                bilingualSubtitlePath = bundle.bilingualSubtitlePath || '';
                sourceSubtitlePath = bundle.sourceSubtitlePath || '';
            }
            const made = core.createDraftBatchItem
                ? core.createDraftBatchItem({
                    videoPath,
                    subtitlePath,
                    bilingualSubtitlePath,
                    sourceSubtitlePath,
                    outputPath: p.outputPath || '',
                }, sharedOpts())
                : { ok: false, error: '烧录模块未加载' };
            if (!made.ok) {
                setStatus(made.error || '无法加入队列', 'error');
                return;
            }
            state.batch.push(made.item);
            state.selectedIds.add(made.item.id);
            setStatus(
                isAssociated(made.item)
                    ? `已载入：${fileLabel(made.item.videoPath)} · ${fileLabel(effectiveSubPath(made.item))}`
                    : `已载入：${fileLabel(made.item.videoPath || made.item.subtitlePath)} — 未找到旁路字幕，请手动关联`,
                'ok',
            );
            syncFormFromState();
        })();
    }

    function removeSelected() {
        if (state.running || !state.selectedIds.size) return;
        state.batch = state.batch.filter((i) => !state.selectedIds.has(i.id));
        state.selectedIds.clear();
        syncFormFromState();
        setStatus('已移除选中项', 'ok');
    }

    function clearBatch() {
        if (state.running || !state.batch.length) return;
        state.batch = [];
        state.selectedIds.clear();
        state.activeBatchId = '';
        syncFormFromState();
        setStatus('已清空烧录队列', 'ok');
    }

    async function runOneJob(job) {
        return electron?.ffmpegBurnHardsub?.({
            videoPath: job.videoPath,
            subtitlePath: job.subtitlePath,
            bilingualSubtitlePath: job.bilingualSubtitlePath,
            sourceSubtitlePath: job.sourceSubtitlePath,
            subtitleTrack: job.subtitleTrack,
            outputPath: job.outputPath,
            container: job.container,
            styleMode: job.styleMode,
            outputMode: job.outputMode,
            audioMode: job.audioMode,
            basicStyle: job.basicStyle,
            crf: job.crf,
            resolutionId: job.resolutionId,
            fpsId: job.fpsId,
            encodeSpeedId: job.encodeSpeedId,
            outputSuffix: job.outputSuffix,
            outputDir: job.outputDir,
            encoderId: job.encoderId,
        });
    }

    async function startBatchBurn({ retryFailed = false } = {}) {
        if (state.running) return;
        // Settings window persists burn*; reload before reading chips / encoding.
        await loadBurnEncodeSettings();
        readStyleFromForm();

        if (retryFailed && core.resetFailedToPending) {
            state.batch = core.resetFailedToPending(state.batch);
        }

        applySharedOptsToPending();

        const incomplete = incompletePendingCount();
        if (incomplete > 0) {
            await alertBurn(`还有 ${incomplete} 项未关联完整视频与字幕，无法开始`);
            syncFormFromState();
            return;
        }
        if (!readyPendingItems().length) {
            await alertBurn('队列中没有待烧录项');
            syncFormFromState();
            return;
        }

        const proGate = await ensureDocumentStyleAllowed();
        if (!proGate.ok) {
            if (proGate.needPro) promptPro('ASS 样式烧录');
            else await alertBurn(proGate.error || '当前样式不可用');
            return;
        }
        if (state.outputMode === 'hardsub') {
            const encGate = await ensureEncoderAllowed();
            if (!encGate.ok) {
                if (encGate.needPro) promptPro('硬件编码');
                else await alertBurn(encGate.error || '当前编码器不可用');
                state.encoderId = 'libx264';
                syncFormFromState();
                return;
            }
        }

        for (let i = 0; i < state.batch.length; i += 1) {
            const it = state.batch[i];
            if (it.status !== 'pending') continue;
            const effective = effectiveSubPath({ ...it, ...sharedOpts() });
            const validated = core.validateBurnPair
                ? core.validateBurnPair({
                    ...it,
                    ...sharedOpts(),
                    subtitlePath: effective,
                })
                : { ok: false, error: '烧录模块未加载' };
            if (!validated.ok) {
                await alertBurn(
                    `${fileLabel(it.videoPath)}：${validated.error || '参数无效'}`,
                );
                syncFormFromState();
                return;
            }
            state.batch[i] = {
                ...it,
                ...validated.job,
                id: it.id,
                status: 'pending',
                error: '',
                percent: 0,
                bilingualSubtitlePath: it.bilingualSubtitlePath || '',
                sourceSubtitlePath: it.sourceSubtitlePath || '',
                subtitleTrack: it.subtitleTrack || 'auto',
                subtitlePath: it.subtitlePath || validated.job.subtitlePath,
            };
        }

        state.running = true;
        state.cancelRequested = false;
        syncFormFromState();

        let doneCount = 0;
        let failCount = 0;
        while (!state.cancelRequested) {
            const idx = core.nextPendingIndex
                ? core.nextPendingIndex(state.batch)
                : state.batch.findIndex((i) => i.status === 'pending');
            if (idx < 0) break;
            const item = state.batch[idx];
            state.activeBatchId = item.id;
            const startedAt = Date.now();
            state.batch[idx] = {
                ...item,
                status: 'running',
                percent: 0,
                error: '',
                startedAt,
                elapsedMs: 0,
            };
            syncFormFromState();
            setProgress(0, `批量 ${idx + 1}/${state.batch.length}：${fileLabel(item.videoPath)}`);

            let res;
            try {
                const burnPayload = {
                    ...state.batch[idx],
                    subtitlePath: effectiveSubPath(state.batch[idx]) || state.batch[idx].subtitlePath,
                };
                res = await runOneJob(burnPayload);
            } catch (err) {
                res = { ok: false, error: err?.message || String(err) };
            }

            const elapsedMs = Math.max(0, Date.now() - startedAt);
            if (state.cancelRequested || res?.cancelled) {
                state.batch[idx] = {
                    ...state.batch[idx],
                    status: 'cancelled',
                    error: '已取消',
                    percent: 0,
                    elapsedMs,
                    startedAt,
                };
                failCount += 1;
                break;
            }
            if (!res?.ok) {
                state.batch[idx] = {
                    ...state.batch[idx],
                    status: 'failed',
                    error: res?.error || '失败',
                    percent: 0,
                    elapsedMs,
                    startedAt,
                };
                failCount += 1;
            } else {
                state.batch[idx] = {
                    ...state.batch[idx],
                    status: 'done',
                    percent: 100,
                    outputPath: res.outputPath || item.outputPath,
                    error: '',
                    elapsedMs,
                    startedAt,
                };
                state.lastOutputPath = res.outputPath || item.outputPath;
                doneCount += 1;
            }
            syncFormFromState();
        }

        state.running = false;
        state.activeBatchId = '';
        syncFormFromState();
        if (state.cancelRequested) {
            setStatus('批量已取消', 'error');
            setProgress(0, '已取消');
        } else {
            setProgress(100, '批量完成');
            setStatus(`批量结束：完成 ${doneCount}，失败 ${failCount}`, failCount ? 'error' : 'ok');
        }
    }

    async function startSingleBurn(id) {
        if (state.running) return;
        const idx0 = state.batch.findIndex((i) => i.id === id);
        if (idx0 < 0) return;
        const item0 = state.batch[idx0];
        if (!isAssociated(item0)) {
            await alertBurn('请先关联视频与字幕再烧录');
            return;
        }

        await loadBurnEncodeSettings();
        readStyleFromForm();
        applySharedOptsToPending();

        const proGate = await ensureDocumentStyleAllowed();
        if (!proGate.ok) {
            if (proGate.needPro) promptPro('ASS 样式烧录');
            else await alertBurn(proGate.error || '当前样式不可用');
            return;
        }
        if (state.outputMode === 'hardsub') {
            const encGate = await ensureEncoderAllowed();
            if (!encGate.ok) {
                if (encGate.needPro) promptPro('硬件编码');
                else await alertBurn(encGate.error || '当前编码器不可用');
                state.encoderId = 'libx264';
                syncFormFromState();
                return;
            }
        }

        const liveIdx = state.batch.findIndex((i) => i.id === id);
        if (liveIdx < 0) return;
        const live = state.batch[liveIdx];
        const effective = effectiveSubPath({ ...live, ...sharedOpts() });
        const validated = core.validateBurnPair
            ? core.validateBurnPair({
                ...live,
                ...sharedOpts(),
                subtitlePath: effective,
            })
            : { ok: false, error: '烧录模块未加载' };
        if (!validated.ok) {
            await alertBurn(validated.error || '参数无效');
            syncFormFromState();
            return;
        }

        state.batch[liveIdx] = {
            ...live,
            ...validated.job,
            id: live.id,
            status: 'pending',
            error: '',
            percent: 0,
            bilingualSubtitlePath: live.bilingualSubtitlePath || '',
            sourceSubtitlePath: live.sourceSubtitlePath || '',
            subtitleTrack: live.subtitleTrack || 'auto',
            subtitlePath: live.subtitlePath || validated.job.subtitlePath,
        };

        state.running = true;
        state.cancelRequested = false;
        const idx = liveIdx;
        const item = state.batch[idx];
        state.activeBatchId = item.id;
        const startedAt = Date.now();
        state.batch[idx] = {
            ...item,
            status: 'running',
            percent: 0,
            error: '',
            startedAt,
            elapsedMs: 0,
        };
        syncFormFromState();
        setProgress(0, `烧录：${fileLabel(item.videoPath)}`);

        let res;
        try {
            const burnPayload = {
                ...state.batch[idx],
                subtitlePath: effectiveSubPath(state.batch[idx]) || state.batch[idx].subtitlePath,
            };
            res = await runOneJob(burnPayload);
        } catch (err) {
            res = { ok: false, error: err?.message || String(err) };
        }

        const elapsedMs = Math.max(0, Date.now() - startedAt);
        if (state.cancelRequested || res?.cancelled) {
            state.batch[idx] = {
                ...state.batch[idx],
                status: 'cancelled',
                error: '已取消',
                percent: 0,
                elapsedMs,
                startedAt,
            };
            setStatus('已取消', 'error');
            setProgress(0, '已取消');
        } else if (!res?.ok) {
            state.batch[idx] = {
                ...state.batch[idx],
                status: 'failed',
                error: res?.error || '失败',
                percent: 0,
                elapsedMs,
                startedAt,
            };
            setStatus(res?.error || '烧录失败', 'error');
            setProgress(0, '失败');
        } else {
            state.batch[idx] = {
                ...state.batch[idx],
                status: 'done',
                percent: 100,
                outputPath: res.outputPath || item.outputPath,
                error: '',
                elapsedMs,
                startedAt,
            };
            state.lastOutputPath = res.outputPath || item.outputPath;
            setProgress(100, '完成');
            setStatus(`已完成：${fileLabel(item.videoPath)}`, 'ok');
        }

        state.running = false;
        state.activeBatchId = '';
        syncFormFromState();
    }

    async function cancelBurn() {
        state.cancelRequested = true;
        try {
            await electron?.ffmpegCancel?.();
        } catch (_) { /* ignore */ }
        setStatus('正在取消…', 'info');
    }

    function onFromQueue() {
        const batchPick = typeof global.__transubPickBurnHandoffBatch === 'function'
            ? global.__transubPickBurnHandoffBatch()
            : null;
        if (Array.isArray(batchPick) && batchPick.length) {
            addPairsToBatch(batchPick);
            return;
        }
        const pick = typeof global.__transubPickBurnHandoff === 'function'
            ? global.__transubPickBurnHandoff()
            : null;
        if (pick?.videoPath || pick?.path) {
            applyPayload(pick);
            return;
        }
        document.dispatchEvent(new CustomEvent('transub-burn-request-queue-item'));
        if (!state.batch.length) {
            setStatus('任务队列中没有可用的视频项', 'error');
        }
    }

    function closePreview() {
        const modal = $('burnPreviewModal');
        state.previewOpen = false;
        state.previewItemId = '';
        if (modal) {
            modal.classList.add('hidden');
            modal.setAttribute('hidden', '');
            try {
                // Restore to workspace host if we reparented to body while open.
                const host = document.querySelector('#workspaceBurn .factory-burn-workspace')
                    || $('workspaceBurn');
                if (host && modal.parentElement === document.body) {
                    host.appendChild(modal);
                }
            } catch (_) { /* ignore */ }
        }
        state.preview?.destroy?.();
        state.preview = null;
        const videoEl = $('burnPreviewVideo');
        if (videoEl) {
            try { videoEl.pause(); } catch (_) { /* ignore */ }
            videoEl.removeAttribute('src');
            videoEl.load?.();
        }
    }

    async function openPreviewForItem(id) {
        const item = findItem(id);
        if (!item || !isAssociated(item)) {
            setStatus('请先关联视频与字幕再预览', 'error');
            return;
        }
        readStyleFromForm();
        if (state.styleMode === 'document') {
            const gate = await ensureDocumentStyleAllowed();
            if (!gate.ok) {
                setStatus(gate.error, 'error');
                if (gate.needPro) promptPro('ASS 样式预览');
                return;
            }
        }
        const modal = $('burnPreviewModal');
        const title = $('burnPreviewTitle');
        if (title) title.textContent = `预览 · ${fileLabel(item.videoPath)}`;
        if (modal) {
            try {
                if (modal.parentElement !== document.body) {
                    document.body.appendChild(modal);
                }
            } catch (_) { /* ignore */ }
            modal.classList.remove('hidden');
            modal.removeAttribute('hidden');
        }
        state.previewOpen = true;
        state.previewItemId = id;
        const videoEl = $('burnPreviewVideo');
        if (videoEl) {
            videoEl.controls = true;
            videoEl.setAttribute('playsinline', '');
            videoEl.setAttribute('controlslist', 'nodownload');
        }
        state.preview?.destroy?.();
        state.preview = previewApi.create?.({
            videoEl,
            canvasEl: $('burnPreviewCanvas'),
            overlayEl: $('burnPreviewOverlay'),
        });
        setStatus('正在生成烧录像素预览（与成片同一滤镜，约数十秒）…');
        const res = await state.preview?.loadFromPaths?.({
            videoPath: item.videoPath,
            subtitlePath: effectiveSubPath(item) || item.subtitlePath,
            bilingualSubtitlePath: item.bilingualSubtitlePath || '',
            sourceSubtitlePath: item.sourceSubtitlePath || '',
            subtitleTrack: item.subtitleTrack || state.subtitleTrack,
            basicStyle: state.basicStyle,
            styleMode: state.styleMode,
            durationSec: 45,
            onProgress: (p) => {
                if (!state.previewOpen) return;
                const pct = Math.max(0, Math.min(99, Number(p?.percent) || 0));
                setStatus(`正在生成烧录像素预览… ${pct}%`);
            },
        });
        if (!res?.ok) {
            setStatus(res?.error || '预览失败', 'error');
            return;
        }
        if (res.playing) {
            setStatus('预览播放中（ffmpeg 硬烧像素预览，样式与成片一致）', 'ok');
        } else {
            setStatus(res.playError || '预览已就绪，请点击播放', 'ok');
            try { await state.preview?.tryPlayVideo?.(); } catch (_) { /* ignore */ }
        }
    }

    function ensureStylePresetsUi() {
        if (!global.TransubSubtitleBurnStylePresetsUi?.init) return;
        global.TransubSubtitleBurnStylePresetsUi.init({
            getBurnStyle: () => ({ ...state.basicStyle }),
            getActivePresetId: () => state.activePresetId,
            applyBurnStyle: applyBurnStyleFromPreset,
            setStatus,
            isProEntitled: () => state.proEntitled,
        });
    }

    function bind() {
        if (state.bound) return;
        // Defer until workspace fragment is injected.
        if (!$('burnCommandBar') || !$('burnBatchList')) return;
        state.bound = true;
        // Preset chip lives in the same fragment — bind after inject (init alone may run too early).
        ensureStylePresetsUi();

        $('burnAddMenuBtn')?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const menu = $('burnAddMenu');
            const open = menu && menu.classList.contains('hidden');
            setAddMenuOpen(!!open);
        });
        $('burnAddMenu')?.addEventListener('click', (ev) => {
            const item = ev.target?.closest?.('[data-burn-add]');
            if (!item) return;
            const act = item.getAttribute('data-burn-add');
            setAddMenuOpen(false);
            if (act === 'video') void addVideoOnly();
            else if (act === 'queue') onFromQueue();
        });
        document.addEventListener('click', (ev) => {
            if (!ev.target?.closest?.('#burnAddMenuWrap')) setAddMenuOpen(false);
        });

        $('burnRemoveSelectedBtn')?.addEventListener('click', () => removeSelected());
        $('burnClearListBtn')?.addEventListener('click', () => clearBatch());
        $('burnEmptyAddBtn')?.addEventListener('click', () => { void addVideoOnly(); });
        $('burnEmptyFromQueueBtn')?.addEventListener('click', () => onFromQueue());

        $('burnFilterTabs')?.addEventListener('click', (ev) => {
            const tab = ev.target?.closest?.('[data-burn-tab]');
            if (!tab) return;
            state.filterTab = tab.getAttribute('data-burn-tab') || 'all';
            renderBatchList();
        });

        $('burnBatchStartBtn')?.addEventListener('click', () => { void startBatchBurn(); });
        $('burnBatchRetryBtn')?.addEventListener('click', () => { void startBatchBurn({ retryFailed: true }); });
        $('burnCancelBtn')?.addEventListener('click', () => { void cancelBurn(); });
        $('burnPreviewCloseBtn')?.addEventListener('click', () => closePreview());
        $('burnPreviewModal')?.addEventListener('click', (ev) => {
            if (ev.target === $('burnPreviewModal')) closePreview();
        });

        const onChipChange = () => {
            readStyleFromForm();
            applySharedOptsToPending();
            syncFormFromState();
        };
        $('burnOutputModeSelect')?.addEventListener('change', onChipChange);
        $('burnOpenSettingsBtn')?.addEventListener('click', () => openBurnEncodeSettings());

        $('burnStyleModeSelect')?.addEventListener('change', () => {
            void (async () => {
                readStyleFromForm();
                if (state.styleMode === 'document') {
                    const gate = await ensureDocumentStyleAllowed();
                    if (!gate.ok) {
                        setStatus(gate.error, 'error');
                        state.styleMode = 'basic';
                        if (gate.needPro) promptPro('ASS 样式烧录');
                    }
                }
                applySharedOptsToPending();
                syncFormFromState();
            })();
        });

        $('burnBatchList')?.addEventListener('click', (ev) => {
            const trackBtn = ev.target?.closest?.('[data-burn-track-btn]');
            if (trackBtn) {
                const id = trackBtn.getAttribute('data-burn-track-btn');
                const role = trackBtn.getAttribute('data-burn-track-role');
                void onTrackButtonClick(id, role);
                return;
            }
            const check = ev.target?.closest?.('[data-burn-check]');
            if (check) {
                const id = check.getAttribute('data-burn-check');
                if (check.checked) state.selectedIds.add(id);
                else state.selectedIds.delete(id);
                syncFormFromState();
                return;
            }
            const btn = ev.target?.closest?.('[data-burn-act]');
            if (!btn) return;
            const id = btn.getAttribute('data-burn-id');
            const act = btn.getAttribute('data-burn-act');
            const item = findItem(id);
            if (!item) return;
            if (act === 'remove') {
                if (state.running) return;
                state.batch = state.batch.filter((i) => i.id !== id);
                state.selectedIds.delete(id);
                syncFormFromState();
                return;
            }
            if (act === 'burn') {
                void startSingleBurn(id);
                return;
            }
            if (act === 'preview') {
                void openPreviewForItem(id);
                return;
            }
            if (act === 'reveal' && item.outputPath) {
                void electron?.showInFolder?.(item.outputPath);
            }
        });

        if (electron?.onFfmpegBurnProgress) {
            state.unsubProgress = electron.onFfmpegBurnProgress((payload) => {
                if (!state.running) return;
                const pct = Number(payload?.percent) || 0;
                if (state.activeBatchId) {
                    const idx = state.batch.findIndex((i) => i.id === state.activeBatchId);
                    if (idx >= 0) {
                        const cur = state.batch[idx];
                        const elapsedMs = cur.startedAt
                            ? Math.max(0, Date.now() - Number(cur.startedAt))
                            : cur.elapsedMs;
                        state.batch[idx] = { ...cur, percent: pct, elapsedMs };
                        renderBatchList();
                    }
                }
                setProgress(pct, pct >= 100 ? '完成' : '正在烧录…');
            });
        }
    }

    function onWorkspaceShow(opts = {}) {
        bind();
        void refreshProAndEncoders();
        if (opts && (opts.videoPath || opts.subtitlePath || opts.outputPath || opts.items)) {
            if (Array.isArray(opts.items) && opts.items.length) {
                addPairsToBatch(opts.items);
            } else {
                applyPayload(opts);
            }
        }
        syncFormFromState();
    }

    function onWorkspaceHide() {
        setAddMenuOpen(false);
        if (state.previewOpen) closePreview();
        if (global.TransubSubtitleBurnStylePresetsUi?.isOpen?.()) {
            global.TransubSubtitleBurnStylePresetsUi.close();
        }
    }

    function init() {
        if (!$('workspaceBurn')) return;
        bind();
        // Safe to call before fragment inject: StylePresetsUi defers bind until chip/modal exist.
        ensureStylePresetsUi();
        void refreshProAndEncoders();
        syncFormFromState();
        setProgress(null);
    }

    global.TransubSubtitleBurnUi = {
        init,
        onWorkspaceShow,
        onWorkspaceHide,
        applyPayload,
        addPairsToBatch,
        reloadEncodeSettings,
        applyEncodeSettings,
        getState: () => ({
            ...state,
            basicStyle: { ...state.basicStyle },
            batch: state.batch.map((i) => ({ ...i })),
            selectedIds: [...state.selectedIds],
        }),
        openStylePresets: () => global.TransubSubtitleBurnStylePresetsUi?.open?.(),
        openEncodeSettings: openBurnEncodeSettings,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}(window));
