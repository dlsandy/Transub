/**
 * Transub 字幕编辑器（独立窗口）— 列表 + 详情分栏
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const splitCore = global.TransubSubtitleSplit;
    const qcCore = global.TransubSubtitleQc;
    const metaCore = global.TransubSubtitleMeta;
    const glossaryCore = global.TransubSubtitleGlossary;
    const fluencyCore = global.TransubSubtitleFluency;
    const chineseCore = global.TransubSubtitleChinese;
    if (!splitCore) {
        throw new Error('subtitle-split-core.js must load before subtitle-editor.js');
    }
    if (!qcCore) {
        throw new Error('subtitle-qc-core.js must load before subtitle-editor.js');
    }
    if (!metaCore) {
        throw new Error('subtitle-meta-core.js must load before subtitle-editor.js');
    }
    if (!glossaryCore) {
        throw new Error('subtitle-glossary-core.js must load before subtitle-editor.js');
    }
    if (!fluencyCore) {
        throw new Error('subtitle-fluency-core.js must load before subtitle-editor.js');
    }
    if (!chineseCore) {
        throw new Error('subtitle-chinese-core.js must load before subtitle-editor.js');
    }
    const editorParts = global.TransubEditorParts;
    if (!editorParts?.utils) {
        throw new Error('subtitle-editor/utils.js must load before subtitle-editor.js');
    }
    if (!editorParts?.installUndo) {
        throw new Error('subtitle-editor/undo.js must load before subtitle-editor.js');
    }
    if (!editorParts?.installModals) {
        throw new Error('subtitle-editor/modals.js must load before subtitle-editor.js');
    }
    if (!editorParts?.installBootProgress) {
        throw new Error('subtitle-editor/boot.js must load before subtitle-editor.js');
    }
    if (!editorParts?.installPrefs) {
        throw new Error('subtitle-editor/prefs.js must load before subtitle-editor.js');
    }
    const {
        esc,
        basename,
        formatDisplayTime,
        parseInputTime,
        cloneCues,
        cuesEqual,
        cueEndMs,
        cueDurationMs,
        formatDurationSec,
        textCharCount,
        lineCharCount,
        computeCps,
        getCueWarnings,
        findPlaybackIndex: findPlaybackIndexInCues,
        clampTargetCps,
        describeVideoCodec,
        buildFindRegex,
    } = editorParts.utils;

    const CONNECTED_TEXT_SPLIT_MSG = '文本为连续书写（无空格与换行），无法自动分割。请使用光标或播放头手动分割。';

    const state = {
        ready: false,
        dirty: false,
        path: '',
        videoPath: '',
        videoCodec: '',
        videoWidth: 0,
        videoHeight: 0,
        format: 'srt',
        header: [],
        cues: [],
        selectedIndex: -1,
        playbackIndex: -1,
        previewTextTrack: null,
        textTrackRefreshTimer: null,
        overlayText: '',
        overlayVisible: false,
        cueBoundaryTimer: null,
        playheadTimer: null,
        lastPlayheadLabel: '',
        detailSyncing: false,
        detailRenderedDurSec: null,
        detailUndoGrouped: false,
        undoRecording: false,
        undoStack: [],
        redoStack: [],
        find: {
            active: false,
            matches: [],
            currentIndex: -1,
        },
        initialSnapshot: null,
        savedSnapshot: null,
        silenceSplitBusy: false,
        retranscribeBusy: false,
        jobAbortRequested: false,
        selectedIndices: new Set(),
        selectionAnchor: -1,
        sidecarMeta: null,
        cueMeta: [],
        glossary: { version: 1, entries: [] },
        globalGlossary: { version: 1, entries: [] },
        projectGlossary: { version: 1, entries: [] },
        glossaryScope: 'global',
        glossaryEditingId: '',
        glossaryIssues: [],
        breakWords: null,
        listFilter: 'all',
        qcIssueIndexSet: new Set(),
        qcTypeFilter: null,
        autoFocus: false,
        waveformEnabled: true,
        waveform: {
            peaks: null,
            durationSec: 0,
            videoPath: '',
            loading: false,
            cacheKey: '',
        },
        timeline: {
            dragging: null,
            panning: null,
            durationMs: 0,
            viewStartMs: 0,
            viewEndMs: 0,
            /** Minimum visible window when zoomed in (ms). */
            minViewMs: 2000,
            /** Zoom ratio: duration / visibleSpan. Default 5×. */
            zoom: 5,
            /** True when the view currently covers the full duration (zoom ≈ 1). */
            fitted: false,
        },
    };

    let els = {};
    let pendingEditorInit = null;
    let editorBootstrapped = false;
    let documentLoadInFlight = false;
    let cachedFfmpegPath = '';
    let draftAutosaveTimer = null;
    const DRAFT_AUTOSAVE_MS = 45000;

    function stopDraftAutosave() {
        if (draftAutosaveTimer) {
            clearInterval(draftAutosaveTimer);
            draftAutosaveTimer = null;
        }
    }

    function startDraftAutosave() {
        stopDraftAutosave();
        draftAutosaveTimer = setInterval(() => {
            flushDraftAutosave().catch(() => {});
        }, DRAFT_AUTOSAVE_MS);
    }

    async function flushDraftAutosave() {
        if (!state.dirty || !state.path || !electron?.transubWriteSubtitleDraft) return;
        try {
            syncDetailToCue();
            await electron.transubWriteSubtitleDraft({
                path: state.path,
                format: state.format,
                header: state.header,
                cues: state.cues,
            });
        } catch (_) { /* ignore */ }
    }

    async function clearDocumentDraft() {
        if (!state.path || !electron?.transubClearSubtitleDraft) return;
        try {
            await electron.transubClearSubtitleDraft({ path: state.path });
        } catch (_) { /* ignore */ }
    }

    async function maybeRestoreDraft(subPath) {
        if (!subPath || !electron?.transubCheckSubtitleDraft) return null;
        const check = await electron.transubCheckSubtitleDraft({ path: subPath });
        if (!check?.ok || !check.offer || !check.draft) return null;
        const when = check.savedAt
            ? new Date(check.savedAt).toLocaleString()
            : '未知时间';
        const yes = await editorConfirm(
            `发现未保存草稿（${when}，约 ${check.cueCount || 0} 条）。是否恢复？\n选「取消」则丢弃草稿并打开文件内容。`,
        );
        if (!yes) {
            try { await electron.transubClearSubtitleDraft({ path: subPath }); } catch (_) { /* ignore */ }
            return null;
        }
        return check.draft;
    }

    async function loadAppFfmpegPath() {
        try {
            const res = await electron?.transWithAiGetOptions?.({});
            cachedFfmpegPath = String(res?.options?.ffmpegPath || '').trim();
        } catch (_) {
            cachedFfmpegPath = '';
        }
    }

    function buildFfmpegRequest(payload = {}) {
        const req = { ...payload };
        if (cachedFfmpegPath) req.ffmpegPath = cachedFfmpegPath;
        return req;
    }

    function bootstrapEditorDocument(payload) {
        if (!payload?.subPath) return;
        if (!editorBootstrapped) {
            pendingEditorInit = payload;
            return;
        }
        openDocument(payload.subPath, payload.videoPath || '');
    }

    electron?.onSubtitleEditorInit?.(bootstrapEditorDocument);

    function setStatus(msg, type) {
        if (!els.statusLine) return;
        els.statusLine.textContent = msg || '';
        els.statusLine.className = `status-msg${
            type === 'err' ? ' err' : type === 'ok' ? ' ok' : type === 'warn' ? ' warn' : ''
        }`;
    }

    function updateWindowTitle() {
        document.title = state.path
            ? `${state.dirty ? '* ' : ''}字幕编辑 — ${basename(state.path)}`
            : 'Transub — 字幕编辑';
    }

    function setDirty(v) {
        state.dirty = !!v;
        if (els.dirtyBadge) els.dirtyBadge.classList.toggle('hidden', !state.dirty);
        updateWindowTitle();
    }

    function findPlaybackIndex(tMs) {
        return findPlaybackIndexInCues(state.cues, tMs, state.playbackIndex);
    }

    function syncDetailToCue() {
        if (state.detailSyncing || state.selectedIndex < 0 || state.selectedIndex >= state.cues.length) return;
        const cue = state.cues[state.selectedIndex];
        const startMs = parseInputTime(els.detailStart?.value, state.format);
        if (startMs != null) cue.startMs = startMs;
        const durSec = Number(els.detailDuration?.value);
        const cueDurSec = cueDurationMs(cue) / 1000;
        if (Number.isFinite(durSec) && durSec > 0) {
            const uiStale = Math.abs(durSec - cueDurSec) > 0.05
                && state.detailRenderedDurSec != null
                && Math.abs(durSec - state.detailRenderedDurSec) < 0.001;
            if (!uiStale) {
                cue.endMs = cue.startMs + Math.round(durSec * 1000);
            }
        }
        if (els.detailText) cue.text = els.detailText.value;
    }

    function resyncPlaybackAfterCueTimingChange() {
        state.overlayText = '';
        state.overlayVisible = false;
        scheduleVideoTextTrackRefresh();
        if (!state.ready || !els.video) return;

        const wasPlaying = !els.video.paused && !els.video.ended;
        if (state.cueBoundaryTimer) {
            clearTimeout(state.cueBoundaryTimer);
            state.cueBoundaryTimer = null;
        }

        const prevPlayback = state.playbackIndex;
        syncFromExternalTime(els.video.currentTime || 0, true);
        if (state.playbackIndex === prevPlayback) {
            updateListRowClasses();
        }

        if (wasPlaying) scheduleCueBoundarySync();
    }

    function updateDetailMeta() {
        if (state.selectedIndex < 0) return;
        const cue = state.cues[state.selectedIndex];
        const text = els.detailText?.value ?? cue.text ?? '';
        const durMs = cueDurationMs(cue);
        const cps = computeCps(text, durMs);
        const targetCps = getTargetCps();
        if (els.detailCps) {
            if (!cps) {
                els.detailCps.textContent = 'CPS —';
                els.detailCps.style.color = 'var(--ed-accent)';
                els.detailCps.style.fontWeight = '500';
            } else {
                const cpsNum = Number(cps);
                els.detailCps.textContent = `当前 CPS ${cps}（目标 ${targetCps}）`;
                if (cpsNum > targetCps * 1.05) {
                    els.detailCps.style.color = 'var(--ed-warn-text)';
                    els.detailCps.style.fontWeight = '600';
                } else {
                    els.detailCps.style.color = 'var(--ed-accent)';
                    els.detailCps.style.fontWeight = '500';
                }
            }
        }
        if (els.lineLen) els.lineLen.textContent = String(lineCharCount(text));
        if (els.textLen) els.textLen.textContent = String(textCharCount(text));
        if (els.detailEnd) els.detailEnd.value = formatDisplayTime(cueEndMs(cue), state.format);

        const prev = state.selectedIndex > 0 ? state.cues[state.selectedIndex - 1] : null;
        const next = state.selectedIndex < state.cues.length - 1 ? state.cues[state.selectedIndex + 1] : null;
        const w = getCueWarnings(cue, prev, next);
        if (els.detailWarn) {
            const meta = state.cueMeta[state.selectedIndex];
            const metaHint = meta?.low
                ? `低置信 ${(meta.confidence * 100).toFixed(0)}%（${(meta.flags || []).map((f) => metaCore.flagLabel(f)).join(' · ') || '启发式'}）`
                : '';
            if (w.msg.length) {
                els.detailWarn.textContent = [w.msg.join(' · '), metaHint].filter(Boolean).join(' · ');
                els.detailWarn.classList.remove('hidden');
            } else if (metaHint) {
                els.detailWarn.textContent = `${metaHint}，可右键重转写或标记为可信`;
                els.detailWarn.classList.remove('hidden');
            } else {
                const cpsNum = cps ? Number(cps) : null;
                if (cpsNum != null && cpsNum > targetCps * 1.2 && textCharCount(text) >= 8
                    && !splitCore.isConnectedText(text)) {
                    els.detailWarn.textContent = '读速过快，建议使用智能分割';
                    els.detailWarn.classList.remove('hidden');
                } else {
                    els.detailWarn.textContent = '';
                    els.detailWarn.classList.add('hidden');
                }
            }
        }
    }

    function getLiveSelectedCue() {
        const idx = state.selectedIndex;
        if (idx < 0 || idx >= state.cues.length) return null;
        const cue = state.cues[idx];
        const live = { startMs: cue.startMs, endMs: cue.endMs, text: cue.text };
        if (els.detailText != null) live.text = els.detailText.value;
        const startMs = parseInputTime(els.detailStart?.value, state.format);
        if (startMs != null) live.startMs = startMs;
        const durSec = Number(els.detailDuration?.value);
        if (Number.isFinite(durSec) && durSec > 0) {
            live.endMs = live.startMs + Math.round(durSec * 1000);
        }
        return live;
    }

    function updateDetailActionButtons() {
        const idx = state.selectedIndex;
        const hasCue = idx >= 0 && idx < state.cues.length;
        if (!hasCue) {
            if (els.prevCueBtn) els.prevCueBtn.disabled = true;
            if (els.nextCueBtn) els.nextCueBtn.disabled = true;
            if (els.deleteCueBtn) els.deleteCueBtn.disabled = true;
            if (els.splitCueBtn) els.splitCueBtn.disabled = true;
            if (els.smartSplitCueBtn) els.smartSplitCueBtn.disabled = true;
            if (els.silenceSplitCueBtn) els.silenceSplitCueBtn.disabled = true;
            if (els.compressRepCueBtn) els.compressRepCueBtn.disabled = true;
            if (els.splitLinesBtn) els.splitLinesBtn.disabled = true;
            if (els.splitSpacesBtn) els.splitSpacesBtn.disabled = true;
            if (els.charDurBtn) els.charDurBtn.disabled = true;
            if (els.smartDurBtn) els.smartDurBtn.disabled = true;
            if (els.audioSnapBtn) els.audioSnapBtn.disabled = true;
            updateRetranscribeTransportBtn();
            return;
        }

        const cue = getLiveSelectedCue() || state.cues[idx];
        const rawText = String(cue.text || '');
        const text = rawText.trim();
        const canSplit = !!text;
        const canSplitLines = canSplit && rawText.includes('\n');
        const canSplitSpaces = canSplit && /\s/.test(rawText);

        if (els.prevCueBtn) els.prevCueBtn.disabled = idx <= 0;
        if (els.nextCueBtn) els.nextCueBtn.disabled = idx >= state.cues.length - 1;
        if (els.deleteCueBtn) els.deleteCueBtn.disabled = false;
        if (els.splitCueBtn) els.splitCueBtn.disabled = false;
        if (els.smartSplitCueBtn) els.smartSplitCueBtn.disabled = !canSplit;
        if (els.silenceSplitCueBtn) {
            els.silenceSplitCueBtn.disabled = state.silenceSplitBusy || !canSilenceSplitCue(cue)
                || !state.videoPath || !electron?.ffmpegDetectSilence;
        }
        if (els.compressRepCueBtn) {
            const canCompress = !!text && !!fluencyCore.compressRepetitionInText(text)?.changed;
            els.compressRepCueBtn.disabled = !canCompress;
        }
        if (els.splitLinesBtn) els.splitLinesBtn.disabled = !canSplitLines;
        if (els.splitSpacesBtn) els.splitSpacesBtn.disabled = !canSplitSpaces;
        if (els.charDurBtn) {
            els.charDurBtn.disabled = !textCharCount(rawText);
        }
        if (els.smartDurBtn) {
            els.smartDurBtn.disabled = state.silenceSplitBusy || !canSilenceAdjustDurationCue(cue)
                || !state.videoPath || !electron?.ffmpegDetectSilence;
        }
        if (els.audioSnapBtn) {
            els.audioSnapBtn.disabled = state.silenceSplitBusy || state.retranscribeBusy
                || !canAudioSnapCue(cue)
                || !state.videoPath || !electron?.ffmpegDetectSilence;
        }
        updateRetranscribeTransportBtn();
    }

    function renderDetailPane() {
        state.detailSyncing = true;
        const idx = state.selectedIndex;
        const hasCue = idx >= 0 && idx < state.cues.length;
        if (els.detailPane) els.detailPane.style.opacity = hasCue ? '1' : '0.5';

        if (!hasCue) {
            if (els.detailStart) els.detailStart.value = '';
            if (els.detailDuration) els.detailDuration.value = '';
            if (els.detailEnd) els.detailEnd.value = '';
            if (els.detailText) els.detailText.value = '';
            if (els.detailCps) els.detailCps.textContent = 'CPS —';
            if (els.lineLen) els.lineLen.textContent = '0';
            if (els.textLen) els.textLen.textContent = '0';
            if (els.detailWarn) els.detailWarn.classList.add('hidden');
            updateDetailActionButtons();
            state.detailRenderedDurSec = null;
            state.detailSyncing = false;
            return;
        }

        const cue = state.cues[idx];
        if (els.detailStart) els.detailStart.value = formatDisplayTime(cue.startMs, state.format);
        if (els.detailDuration) els.detailDuration.value = formatDurationSec(cueDurationMs(cue));
        if (els.detailEnd) els.detailEnd.value = formatDisplayTime(cueEndMs(cue), state.format);
        if (els.detailText) els.detailText.value = cue.text || '';
        updateDetailActionButtons();
        updateDetailMeta();
        state.detailRenderedDurSec = cueDurationMs(cue) / 1000;
        state.detailSyncing = false;
    }

    function updateRetranscribeTransportBtn() {
        if (!els.retranscribeCueBtn) return;
        els.retranscribeCueBtn.disabled = state.retranscribeBusy || state.silenceSplitBusy
            || !state.videoPath || !electron?.transubTranscribeRange;
    }

    function syncSelectionSetToFocus() {
        if (!(state.selectedIndices instanceof Set)) {
            state.selectedIndices = new Set();
        }
        if (state.selectedIndex >= 0 && state.selectedIndex < state.cues.length) {
            if (!state.selectedIndices.size) state.selectedIndices.add(state.selectedIndex);
        } else if (!state.selectedIndices.size) {
            /* empty */
        } else if (![...state.selectedIndices].some((i) => i >= 0 && i < state.cues.length)) {
            state.selectedIndices.clear();
        }
    }

    function getSelectedCueIndexes() {
        syncSelectionSetToFocus();
        return [...state.selectedIndices]
            .filter((i) => Number.isInteger(i) && i >= 0 && i < state.cues.length)
            .sort((a, b) => a - b);
    }

    function setSelectionIndexes(indexes, focusIdx) {
        const next = new Set();
        for (const raw of indexes || []) {
            const i = Number(raw);
            if (Number.isInteger(i) && i >= 0 && i < state.cues.length) next.add(i);
        }
        state.selectedIndices = next;
        let focus = Number(focusIdx);
        if (!Number.isInteger(focus) || focus < 0 || focus >= state.cues.length) {
            focus = next.size ? Math.max(...next) : -1;
        }
        if (focus !== state.selectedIndex) {
            syncDetailToCue();
            state.selectedIndex = focus;
            if (focus >= 0) renderDetailPane();
        }
        state.selectionAnchor = focus;
        updateListRowClasses();
        if (els.timelineCues) {
            els.timelineCues.querySelectorAll('.editor-timeline-cue').forEach((el) => {
                const i = Number(el.getAttribute('data-tl-idx'));
                el.classList.toggle('selected', next.has(i) || i === state.selectedIndex);
            });
        }
    }

    function updateListRowClasses() {
        if (!els.cueBody) return;
        syncSelectionSetToFocus();
        const currentCueIdx = state.find.active && state.find.currentIndex >= 0
            ? state.find.matches[state.find.currentIndex]?.cueIdx
            : -1;
        const hitCueSet = new Set(
            state.find.active ? state.find.matches.map((m) => m.cueIdx) : []
        );
        els.cueBody.querySelectorAll('tr[data-cue-idx]').forEach((row) => {
            const idx = Number(row.dataset.cueIdx);
            const selected = state.selectedIndices.has(idx) || idx === state.selectedIndex;
            row.classList.toggle('cue-row-selected', selected);
            row.classList.toggle('cue-row-playing', idx === state.playbackIndex);
            row.classList.toggle('cue-row-find-hit', hitCueSet.has(idx));
            row.classList.toggle('cue-row-find-current', idx === currentCueIdx);
            row.classList.toggle('cue-row-low-conf', !!state.cueMeta[idx]?.low);
        });
    }

    function getMetaScanOptions() {
        return {
            maxCps: Number(els.qcMaxCps?.value) || Number(els.smartMaxCps?.value) || 18,
            minSec: Number(els.qcMinSec?.value) || 0.5,
            maxSec: Number(els.qcMaxSec?.value) || 10,
            lowThreshold: metaCore.DEFAULT_LOW_THRESHOLD,
        };
    }

    function refreshCueMeta() {
        state.cueMeta = metaCore.mergeConfidenceAnnotations(
            state.cues,
            state.sidecarMeta,
            getMetaScanOptions(),
        );
        const summary = metaCore.summarizeLowConfidence(state.cueMeta);
        if (els.lowConfBadge) {
            if (summary.low > 0) {
                els.lowConfBadge.textContent = `低置信 ${summary.low > 99 ? '99+' : summary.low}`;
                els.lowConfBadge.classList.remove('hidden');
                els.lowConfBadge.title = summary.summary;
            } else {
                els.lowConfBadge.textContent = '0';
                els.lowConfBadge.classList.add('hidden');
                els.lowConfBadge.title = '无可疑条目';
            }
        }
    }

    async function loadSidecarMeta(subPath) {
        state.sidecarMeta = null;
        if (!subPath || !electron?.transubReadSubtitleMeta) {
            refreshCueMeta();
            return;
        }
        try {
            const res = await electron.transubReadSubtitleMeta({ path: subPath });
            if (res?.ok && res.meta) state.sidecarMeta = res.meta;
        } catch (_) {
            state.sidecarMeta = null;
        }
        refreshCueMeta();
    }

    async function persistCueMeta() {
        if (!state.path || !electron?.transubWriteSubtitleMeta) return;
        const doc = metaCore.buildSidecarDocument(state.cues, state.cueMeta, {
            sourceSub: basename(state.path),
        });
        state.sidecarMeta = doc;
        try {
            await electron.transubWriteSubtitleMeta({ path: state.path, meta: doc });
        } catch (_) { /* ignore meta write errors */ }
    }

    function renderCueList() {
        if (!els.cueBody) return;
        if (!state.cues.length) {
            els.cueBody.innerHTML = '<tr><td colspan="6" class="px-3 py-6 text-center text-xs" style="color:var(--ed-faint)">无字幕条目</td></tr>';
            if (els.filterCount) els.filterCount.textContent = '';
            renderTimeline();
            state.selectedIndex = -1;
            state.cueMeta = [];
            renderDetailPane();
            resyncPlaybackAfterCueTimingChange();
            refreshQcBadge();
            refreshGlossaryBadge();
            refreshCueMeta();
            return;
        }

        refreshCueMeta();
        refreshQcIssueIndexSet();
        const visibleIdxs = getVisibleCueIndexes();
        if (els.filterCount) {
            els.filterCount.textContent = state.listFilter === 'all'
                ? ''
                : `显示 ${visibleIdxs.length} / ${state.cues.length}`;
        }
        if (!visibleIdxs.length) {
            const emptyMsg = state.listFilter === 'all' ? '无字幕条目' : '当前筛选无匹配条目';
            els.cueBody.innerHTML = `<tr><td colspan="6" class="px-3 py-6 text-center text-xs" style="color:var(--ed-faint)">${emptyMsg}</td></tr>`;
        } else {
            els.cueBody.innerHTML = visibleIdxs.map((idx) => {
                const cue = state.cues[idx];
                const prev = idx > 0 ? state.cues[idx - 1] : null;
                const next = idx < state.cues.length - 1 ? state.cues[idx + 1] : null;
                const w = getCueWarnings(cue, prev, next);
                const preview = String(cue.text || '').replace(/\s+/g, ' ').trim();
                const low = !!state.cueMeta[idx]?.low;
                const cps = computeCps(cue.text, cueDurationMs(cue));
                const cpsNum = cps != null ? Number(cps) : null;
                const cpsHot = cpsNum != null && cpsNum > 18;
                const titleAttr = low ? '低置信：建议检查或重转写' : esc(preview || '');
                return `
            <tr class="${low ? 'cue-row-low-conf' : ''}" data-cue-idx="${idx}" title="${titleAttr}">
                <td class="text-xs tabular-nums align-middle col-idx" style="color:var(--ed-muted)">${idx + 1}${low ? '<span class="low-conf-dot" aria-label="低置信">!</span>' : ''}</td>
                <td class="font-mono text-[11px] tabular-nums align-middle ${w.start ? 'cell-warn' : ''}">${esc(formatDisplayTime(cue.startMs, state.format))}</td>
                <td class="font-mono text-[11px] tabular-nums align-middle ${w.end ? 'cell-warn' : ''}">${esc(formatDisplayTime(cueEndMs(cue), state.format))}</td>
                <td class="text-[11px] tabular-nums align-middle ${w.dur ? 'cell-warn' : ''}">${esc(formatDurationSec(cueDurationMs(cue)))}</td>
                <td class="cue-cps-cell align-middle ${cpsHot ? 'hot' : ''}">${cps != null ? esc(cps) : '—'}</td>
                <td class="cell-text align-middle">${esc(preview || '—')}</td>
            </tr>`;
            }).join('');
        }

        if (state.selectedIndex >= state.cues.length) state.selectedIndex = state.cues.length - 1;
        if (state.selectedIndex < 0 && state.cues.length) state.selectedIndex = 0;
        updateListRowClasses();
        renderDetailPane();
        scheduleVideoTextTrackRefresh();
        resyncPlaybackAfterCueTimingChange();
        refreshQcBadge();
        refreshGlossaryBadge();
        renderTimeline();
        updateNeedsVideoUi();
    }

    function refreshListRow(idx) {
        if (!els.cueBody || idx < 0 || idx >= state.cues.length) return;
        const row = els.cueBody.querySelector(`tr[data-cue-idx="${idx}"]`);
        if (!row) {
            renderCueList();
            return;
        }
        const cue = state.cues[idx];
        const prev = idx > 0 ? state.cues[idx - 1] : null;
        const next = idx < state.cues.length - 1 ? state.cues[idx + 1] : null;
        const w = getCueWarnings(cue, prev, next);
        const cells = row.querySelectorAll('td');
        if (cells[1]) {
            cells[1].textContent = formatDisplayTime(cue.startMs, state.format);
            cells[1].classList.toggle('cell-warn', w.start);
        }
        if (cells[2]) {
            cells[2].textContent = formatDisplayTime(cueEndMs(cue), state.format);
            cells[2].classList.toggle('cell-warn', w.end);
        }
        if (cells[3]) {
            cells[3].textContent = formatDurationSec(cueDurationMs(cue));
            cells[3].classList.toggle('cell-warn', w.dur);
        }
        if (cells[4]) {
            const cps = computeCps(cue.text, cueDurationMs(cue));
            const cpsNum = cps != null ? Number(cps) : null;
            cells[4].textContent = cps != null ? cps : '—';
            cells[4].className = `cue-cps-cell align-middle${cpsNum != null && cpsNum > 18 ? ' hot' : ''}`;
        }
        if (cells[5]) {
            cells[5].textContent = String(cue.text || '').replace(/\s+/g, ' ').trim() || '—';
        }
        if (idx > 0) refreshListRowWarningsOnly(idx - 1);
        if (idx < state.cues.length - 1) refreshListRowWarningsOnly(idx + 1);
    }

    function refreshListRowWarningsOnly(idx) {
        const row = els.cueBody?.querySelector(`tr[data-cue-idx="${idx}"]`);
        if (!row || idx < 0 || idx >= state.cues.length) return;
        const cue = state.cues[idx];
        const prev = idx > 0 ? state.cues[idx - 1] : null;
        const next = idx < state.cues.length - 1 ? state.cues[idx + 1] : null;
        const w = getCueWarnings(cue, prev, next);
        const cells = row.querySelectorAll('td');
        cells[1]?.classList.toggle('cell-warn', w.start);
        cells[2]?.classList.toggle('cell-warn', w.end);
        cells[3]?.classList.toggle('cell-warn', w.dur);
    }

    function selectCue(idx, opts = {}) {
        if (idx < 0 || idx >= state.cues.length) return;
        // 播放路径的选中必须经过自动焦点开关；避免误调仍改焦点
        if (opts.fromPlayback && !isAutoFocusEnabled()) return;

        const additive = !!opts.additive;
        const range = !!opts.range;
        if (range && state.selectionAnchor >= 0) {
            const a = Math.min(state.selectionAnchor, idx);
            const b = Math.max(state.selectionAnchor, idx);
            const indexes = [];
            for (let i = a; i <= b; i += 1) indexes.push(i);
            if (additive) {
                const merged = new Set(getSelectedCueIndexes());
                indexes.forEach((i) => merged.add(i));
                setSelectionIndexes(merged, idx);
            } else {
                setSelectionIndexes(indexes, idx);
            }
            state.selectionAnchor = state.selectionAnchor;
        } else if (additive) {
            syncSelectionSetToFocus();
            if (state.selectedIndices.has(idx) && state.selectedIndices.size > 1) {
                state.selectedIndices.delete(idx);
                const nextFocus = state.selectedIndices.has(state.selectedIndex)
                    ? state.selectedIndex
                    : Math.max(...state.selectedIndices);
                setSelectionIndexes(state.selectedIndices, nextFocus);
            } else {
                state.selectedIndices.add(idx);
                setSelectionIndexes(state.selectedIndices, idx);
            }
            state.selectionAnchor = idx;
        } else {
            setSelectionIndexes([idx], idx);
        }

        if (opts.seek && els.video) {
            const sec = Math.max(0, state.cues[idx].startMs / 1000);
            els.video.currentTime = sec;
            if (opts.play) els.video.play().catch(() => {});
        }
        if (opts.scroll) {
            const row = els.cueBody?.querySelector(`tr[data-cue-idx="${idx}"]`);
            row?.scrollIntoView({
                block: 'nearest',
                behavior: opts.fromPlayback ? 'auto' : 'smooth',
            });
            if (!opts.fromPlayback) {
                const cue = state.cues[idx];
                if (cue && isTimelineZoomed()) {
                    const mid = Math.round((cue.startMs + cueEndMs(cue)) / 2);
                    if (ensurePlayheadInView(mid, { marginRatio: 0.08 })) {
                        refreshTimelineView();
                    }
                }
            }
        }
    }

    function selectAllVisibleCues() {
        const indexes = [];
        els.cueBody?.querySelectorAll('tr[data-cue-idx]').forEach((row) => {
            if (row.classList.contains('hidden')) return;
            const idx = Number(row.dataset.cueIdx);
            if (Number.isInteger(idx) && idx >= 0 && idx < state.cues.length) indexes.push(idx);
        });
        if (!indexes.length) {
            for (let i = 0; i < state.cues.length; i += 1) indexes.push(i);
        }
        if (!indexes.length) return;
        setSelectionIndexes(indexes, indexes[indexes.length - 1]);
        setStatus(`已选中 ${indexes.length} 条`, 'ok');
    }

    async function mergeSelectedCues() {
        const indexes = getSelectedCueIndexes();
        if (indexes.length < 2) {
            setStatus('请至少选中两条相邻字幕以合并', 'err');
            return;
        }
        for (let i = 1; i < indexes.length; i += 1) {
            if (indexes[i] !== indexes[i - 1] + 1) {
                setStatus('只能合并连续相邻的选中条目', 'err');
                return;
            }
        }
        if (!(await editorConfirm(`合并选中的 ${indexes.length} 条字幕？`))) return;
        syncDetailToCue();
        recordUndoBeforeChange();
        const first = indexes[0];
        const last = indexes[indexes.length - 1];
        const startMs = state.cues[first].startMs;
        const endMs = cueEndMs(state.cues[last]);
        const text = indexes.map((i) => String(state.cues[i].text || '').trim()).filter(Boolean).join('\n');
        state.cues.splice(first, last - first + 1, { startMs, endMs, text });
        setSelectionIndexes([first], first);
        setDirty(true);
        renderCueList();
        setStatus(`已合并为第 ${first + 1} 条`, 'ok');
    }

    function onDetailChanged(opts = {}) {
        if (state.detailSyncing || state.selectedIndex < 0) return;
        if (!opts.skipUndo) beginDetailUndoGroup();
        syncDetailToCue();
        setDirty(true);
        refreshListRow(state.selectedIndex);
        updateDetailMeta();
        updateDetailActionButtons();
        state.detailRenderedDurSec = cueDurationMs(state.cues[state.selectedIndex]) / 1000;
        if (state.selectedIndex === state.playbackIndex) {
            state.overlayText = '';
            updateVideoSubtitleOverlay();
        }
        resyncPlaybackAfterCueTimingChange();
    }

    function applyDurationDelta(deltaSec) {
        if (state.selectedIndex < 0) return;
        recordUndoBeforeChange();
        const cur = Number(els.detailDuration?.value);
        const base = Number.isFinite(cur) ? cur : cueDurationMs(state.cues[state.selectedIndex]) / 1000;
        const next = Math.max(0.1, Math.round((base + deltaSec) * 100) / 100);
        if (els.detailDuration) els.detailDuration.value = next.toFixed(3);
        onDetailChanged({ skipUndo: true });
        renderTimeline();
    }

    function applyStartDelta(deltaMs) {
        if (state.selectedIndex < 0) return;
        recordUndoBeforeChange();
        const cue = state.cues[state.selectedIndex];
        const dur = cueDurationMs(cue);
        cue.startMs = Math.max(0, cue.startMs + deltaMs);
        cue.endMs = cue.startMs + dur;
        renderDetailPane();
        onDetailChanged({ skipUndo: true });
        renderTimeline();
    }

    function setStartToPlayhead() {
        if (state.selectedIndex < 0 || !els.video) return;
        recordUndoBeforeChange();
        const cue = state.cues[state.selectedIndex];
        const dur = cueDurationMs(cue);
        cue.startMs = getPlaybackTimeMs();
        cue.endMs = cue.startMs + dur;
        renderDetailPane();
        onDetailChanged({ skipUndo: true });
        renderTimeline();
    }

    function setEndToPlayhead() {
        if (state.selectedIndex < 0 || !els.video) return;
        const cue = state.cues[state.selectedIndex];
        const endMs = getPlaybackTimeMs();
        if (endMs <= cue.startMs) {
            setStatus('结束时间必须晚于起始时间', 'err');
            return;
        }
        recordUndoBeforeChange();
        cue.endMs = endMs;
        renderDetailPane();
        onDetailChanged({ skipUndo: true });
        renderTimeline();
    }

    function isListFocused() {
        const active = document.activeElement;
        if (!active || !els.listWrap) return false;
        return active === els.listWrap || els.listWrap.contains(active);
    }

    function isPlayerFocused() {
        const active = document.activeElement;
        if (!active || !els.videoWrap) return false;
        return active === els.videoWrap || els.videoWrap.contains(active);
    }

    function isTypingTarget(el) {
        if (!el || !el.matches) return false;
        if (el.matches('textarea, [contenteditable="true"]')) return true;
        if (!el.matches('input')) return false;
        const type = String(el.type || 'text').toLowerCase();
        return !['button', 'checkbox', 'radio', 'range', 'file', 'reset', 'submit', 'color', 'image'].includes(type);
    }

    function focusCueList() {
        if (!els.listWrap) return;
        try {
            els.listWrap.focus({ preventScroll: true });
        } catch (_) {
            els.listWrap.focus();
        }
    }

    function focusPlayerArea() {
        if (!els.videoWrap) return;
        try {
            els.videoWrap.focus({ preventScroll: true });
        } catch (_) {
            els.videoWrap.focus();
        }
    }

    function toggleVideoPlayback() {
        if (!els.video) return;
        if (els.video.paused || els.video.ended) {
            els.video.play().catch(() => {});
        } else {
            els.video.pause();
        }
    }

    function getPlaybackTimeMs() {
        return Math.round((els.video?.currentTime || 0) * 1000);
    }

    function isAutoFocusEnabled() {
        return state.autoFocus === true;
    }

    function syncFromExternalTime(timeSec, updatePlayhead = true) {
        if (!state.ready) return;
        const t = Math.round((Number(timeSec) || 0) * 1000);
        const active = findPlaybackIndex(t);
        if (active !== state.playbackIndex) {
            const prev = state.playbackIndex;
            state.playbackIndex = active;
            updatePlayingRowHighlight(prev, active);
            // 仅自动焦点开启时才选中/滚动；关闭时绝不能改 selectedIndex
            if (isAutoFocusEnabled()) followPlaybackFocus(active);
        }
        if (updatePlayhead) {
            state.lastPlayheadLabel = '';
            if (els.playheadTime) {
                els.playheadTime.textContent = formatDisplayTime(t, state.format);
                state.lastPlayheadLabel = els.playheadTime.textContent;
            }
            updateTimelinePlayhead(t);
        }
        updateVideoSubtitleOverlay();
    }

    function hidePlaybackSubtitleOverlay() {
        state.overlayText = '';
        state.overlayVisible = false;
        if (els.videoSubtitle) els.videoSubtitle.classList.add('hidden');
        if (els.videoSubtitleText) els.videoSubtitleText.textContent = '';
        if (state.previewTextTrack) {
            try { state.previewTextTrack.mode = 'hidden'; } catch (_) { /* noop */ }
        }
    }

    function updateVideoSubtitleOverlay() {
        if (!els.videoSubtitle || !els.videoSubtitleText) return;
        const idx = state.playbackIndex;
        let text = '';
        let visible = false;
        if (idx >= 0 && idx < state.cues.length) {
            text = String(state.cues[idx].text || '').trim();
            visible = !!text;
        }
        if (text === state.overlayText && visible === state.overlayVisible) return;
        state.overlayText = text;
        state.overlayVisible = visible;
        if (!visible) {
            els.videoSubtitle.classList.add('hidden');
            els.videoSubtitleText.textContent = '';
            return;
        }
        els.videoSubtitleText.textContent = text;
        els.videoSubtitle.classList.remove('hidden');
    }

    function isRowVisibleInList(row) {
        const wrap = els.listWrap;
        if (!wrap || !row) return false;
        const wrapRect = wrap.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        return rowRect.top >= wrapRect.top - 2 && rowRect.bottom <= wrapRect.bottom + 2;
    }

    function scheduleVideoTextTrackRefresh() {
        if (state.textTrackRefreshTimer) clearTimeout(state.textTrackRefreshTimer);
        state.textTrackRefreshTimer = setTimeout(() => {
            state.textTrackRefreshTimer = null;
            refreshVideoTextTrack();
        }, 300);
    }

    function refreshVideoTextTrack() {
        if (state.previewTextTrack) {
            try { state.previewTextTrack.mode = 'hidden'; } catch (_) { /* noop */ }
        }
    }

    function findNextBoundaryMs(tMs, currentIdx) {
        const candidates = [];
        if (currentIdx >= 0 && currentIdx < state.cues.length) {
            const end = cueEndMs(state.cues[currentIdx]);
            if (end > tMs + 5) candidates.push(end);
        }
        if (currentIdx >= 0 && currentIdx + 1 < state.cues.length) {
            const start = state.cues[currentIdx + 1].startMs;
            if (start > tMs + 5) candidates.push(start);
        }
        if (currentIdx < 0 && state.cues.length) {
            let lo = 0;
            let hi = state.cues.length - 1;
            let found = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (state.cues[mid].startMs > tMs + 5) {
                    found = mid;
                    hi = mid - 1;
                } else {
                    lo = mid + 1;
                }
            }
            if (found >= 0) candidates.push(state.cues[found].startMs);
        }
        return candidates.length ? Math.min(...candidates) : null;
    }

    function stopPlaybackTimers() {
        if (state.cueBoundaryTimer) {
            clearTimeout(state.cueBoundaryTimer);
            state.cueBoundaryTimer = null;
        }
        if (state.playheadTimer) {
            clearInterval(state.playheadTimer);
            state.playheadTimer = null;
        }
    }

    function scheduleCueBoundarySync() {
        if (state.cueBoundaryTimer) {
            clearTimeout(state.cueBoundaryTimer);
            state.cueBoundaryTimer = null;
        }
        if (!els.video || els.video.paused || els.video.ended) return;

        const tMs = (els.video.currentTime || 0) * 1000;
        const rate = els.video.playbackRate || 1;
        let nextMs = findNextBoundaryMs(tMs, state.playbackIndex);
        if (nextMs == null) {
            const durMs = (els.video.duration || 0) * 1000;
            if (durMs > tMs + 50) nextMs = durMs;
            else return;
        }

        const delay = Math.max(20, (nextMs - tMs) / rate);
        state.cueBoundaryTimer = setTimeout(() => {
            state.cueBoundaryTimer = null;
            if (!els.video || els.video.paused) return;
            syncPlaybackFromVideo(false);
            scheduleCueBoundarySync();
        }, delay);
    }

    function startPlayheadTimer() {
        if (state.playheadTimer) clearInterval(state.playheadTimer);
        state.playheadTimer = setInterval(() => {
            if (els.video && !els.video.paused) updatePlayheadTimeLabel(false);
        }, 1000);
    }

    function onVideoPlay() {
        document.body.classList.add('editor-video-playing');
        syncPlaybackFromVideo(true);
        scheduleCueBoundarySync();
        startPlayheadTimer();
        updatePlayPauseButton();
    }

    function onVideoPause() {
        document.body.classList.remove('editor-video-playing');
        stopPlaybackTimers();
        syncPlaybackFromVideo(true);
        updatePlayPauseButton();
    }

    function updatePlayingRowHighlight(prevIdx, nextIdx) {
        if (prevIdx === nextIdx) return;
        const run = () => {
            if (prevIdx >= 0) {
                els.cueBody?.querySelector(`tr[data-cue-idx="${prevIdx}"]`)
                    ?.classList.remove('cue-row-playing');
            }
            if (nextIdx >= 0) {
                const row = els.cueBody?.querySelector(`tr[data-cue-idx="${nextIdx}"]`);
                if (row) row.classList.add('cue-row-playing');
            }
            // 播放指示绝不主动滚动列表；列表跟随只由 followPlaybackFocus / selectCue 负责
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 120 });
        } else {
            requestAnimationFrame(run);
        }
    }

    function syncPlaybackFromVideo(updatePlayhead = true) {
        if (!state.ready || !els.video) return;
        syncFromExternalTime(els.video.currentTime || 0, updatePlayhead);
    }

    function updateVideoHint() {
        if (!els.videoHint) return;
        if (state.videoPath) {
            const codecInfo = describeVideoCodec(state.videoCodec, state.videoWidth, state.videoHeight);
            const suffix = codecInfo ? ` · ${codecInfo}` : '';
            els.videoHint.textContent = `${basename(state.videoPath)}${suffix} · Space 播放 · Ctrl+S 保存`;
        } else {
            els.videoHint.textContent = '未关联视频，可点击「关联视频」；亦可仅编辑文本与时间轴';
        }
        if (els.videoEmpty) {
            els.videoEmpty.classList.toggle('visible', !state.videoPath);
        }
        updateNeedsVideoUi();
        updateTimelineDuration();
        renderTimeline();
    }

    async function probeVideoCodec(videoPath) {
        state.videoCodec = '';
        state.videoWidth = 0;
        state.videoHeight = 0;
        if (!videoPath) return;
        try {
            const probe = await electron?.ffmpegProbe?.(buildFfmpegRequest({ path: videoPath }));
            if (probe?.ok) {
                state.videoCodec = probe.codec || '';
                state.videoWidth = probe.width || 0;
                state.videoHeight = probe.height || 0;
            }
        } catch (_) { /* ffprobe optional */ }
    }

    async function loadVideo(videoPath) {
        if (!els.video) return;
        els.video.pause();
        els.video.removeAttribute('src');
        els.video.load();
        state.videoPath = videoPath || '';
        state.waveform.peaks = null;
        state.waveform.cacheKey = '';
        state.waveform.videoPath = '';
        if (!videoPath) {
            updateVideoHint();
            drawTimelineWaveform();
            return;
        }

        const res = await electron?.transubResolveMediaUrl?.({ path: videoPath });
        if (!res?.ok) {
            setStatus(res?.error || `视频加载失败：${basename(videoPath)}`, 'err');
            updateVideoHint();
            return;
        }

        state.videoPath = res.path || videoPath;
        const candidates = [res.fileUrl, res.url].filter(Boolean);
        let loaded = false;

        for (const url of candidates) {
            loaded = await new Promise((resolve) => {
                const onMeta = () => { cleanup(); resolve(true); };
                const onErr = () => { cleanup(); resolve(false); };
                const cleanup = () => {
                    els.video.removeEventListener('loadedmetadata', onMeta);
                    els.video.removeEventListener('error', onErr);
                };
                els.video.addEventListener('loadedmetadata', onMeta, { once: true });
                els.video.addEventListener('error', onErr, { once: true });
                els.video.src = url;
                els.video.load();
            });
            if (loaded) break;
        }

        if (!loaded) {
            setStatus(`视频无法播放：${basename(state.videoPath)}（格式或编码可能不受支持）`, 'err');
        } else {
            els.video.classList.remove('hidden');
            await probeVideoCodec(state.videoPath);
            updateVideoHint();
            resyncPlaybackAfterCueTimingChange();
            if (state.waveformEnabled) ensureWaveformLoaded();
            const softDecode = new Set(['hevc', 'h265', 'av1']).has(String(state.videoCodec || '').toLowerCase());
            if (softDecode) {
                setStatus(
                    `已加载视频（${describeVideoCodec(state.videoCodec, state.videoWidth, state.videoHeight)}）。`
                    + ' 若播放卡顿，可尝试用 H.264 编码版本，或在 Microsoft Store 安装「HEVC 视频扩展」。',
                    'ok',
                );
            }
        }
    }

    async function populateSidecarSelect(videoPath, currentPath) {
        if (!els.sidecarSelect || !videoPath) {
            els.sidecarSelect?.classList.add('hidden');
            return;
        }
        const res = await electron?.transubListSubtitleSidecars?.({ videoPath });
        const editable = (res?.sidecars || []).filter((s) => s.editable);
        if (editable.length <= 1) {
            els.sidecarSelect.classList.add('hidden');
            return;
        }
        els.sidecarSelect.classList.remove('hidden');
        els.sidecarSelect.innerHTML = editable.map((s) =>
            `<option value="${esc(s.path)}" ${s.path === currentPath ? 'selected' : ''}>${esc(s.basename)} (${s.format.toUpperCase()})</option>`
        ).join('');
    }

    async function loadDocument(subPath, videoPath) {
        const fileLabel = basename(subPath);
        documentLoadInFlight = true;
        showBootProgress({
            title: '正在加载字幕',
            detail: fileLabel ? `正在读取 ${fileLabel}…` : '正在读取字幕…',
            statusMessage: fileLabel ? `正在加载 ${fileLabel}…` : '正在加载字幕…',
        });
        try {
            stopPlaybackTimers();
            document.body.classList.remove('editor-video-playing');
            if (state.textTrackRefreshTimer) {
                clearTimeout(state.textTrackRefreshTimer);
                state.textTrackRefreshTimer = null;
            }
            await flushBootProgressPaint();
            const res = await electron?.transubReadSubtitle?.({ path: subPath });
            if (!res?.ok) {
                setStatus(res?.error || '加载字幕失败', 'err');
                return false;
            }
            const draft = await maybeRestoreDraft(res.path);
            syncDetailToCue();
            state.path = res.path;
            state.videoPath = videoPath || '';
            state.format = draft?.format || res.format;
            state.header = Array.isArray(draft?.header) ? draft.header : (res.header || []);
            state.cues = Array.isArray(draft?.cues) ? draft.cues : (res.cues || []);
            state.selectedIndex = state.cues.length ? 0 : -1;
            state.selectedIndices = state.selectedIndex >= 0 ? new Set([state.selectedIndex]) : new Set();
            state.selectionAnchor = state.selectedIndex;
            state.playbackIndex = -1;
            state.previewTextTrack = null;
            state.overlayText = '';
            state.overlayVisible = false;
            state.detailRenderedDurSec = null;
            state.lastPlayheadLabel = '';
            state.sidecarMeta = null;
            state.cueMeta = [];
            setDirty(!!draft);
            clearUndoHistory();
            startDraftAutosave();

            updateWindowTitle();
            if (els.formatBadge) els.formatBadge.textContent = String(state.format || res.format).toUpperCase();
            if (els.cueCount) els.cueCount.textContent = `${state.cues.length} 条`;
            updateNeedsVideoUi();

            saveInitialSnapshot();
            updateBootProgress({
                detail: `已读取 ${state.cues.length} 条，正在准备编辑区…`,
                statusMessage: `正在渲染 ${state.cues.length} 条字幕…`,
            });
            await loadSidecarMeta(res.path);
            await loadGlossaries(res.path);
            await flushBootProgressPaint();
            renderCueList();
            updateBootProgress({
                detail: state.videoPath ? `正在关联视频 ${basename(state.videoPath)}…` : '字幕已就绪，正在完成收尾…',
                statusMessage: state.videoPath ? '正在加载关联视频…' : '正在完成加载…',
            });
            await flushBootProgressPaint();
            await loadVideo(state.videoPath);
            refreshVideoTextTrack();
            updateVideoSubtitleOverlay();
            await populateSidecarSelect(state.videoPath, res.path);
            const low = metaCore.summarizeLowConfidence(state.cueMeta).low;
            const draftHint = draft ? '（已恢复草稿）' : '';
            setStatus(
                low
                    ? `已加载 ${state.cues.length} 条字幕，其中 ${low} 条低置信${draftHint}`
                    : `已加载 ${state.cues.length} 条字幕${draftHint}`,
                'ok',
            );
            return true;
        } finally {
            documentLoadInFlight = false;
            hideBootProgress();
        }
    }

    async function openDocument(subPath, videoPath) {
        if (state.ready && state.dirty) {
            const yes = await editorConfirm('当前字幕未保存，打开新文件将丢失修改，继续？');
            if (!yes) return;
        }
        let linkedVideo = videoPath || '';
        try {
            if (!linkedVideo && subPath) {
                showBootProgress({
                    title: '正在打开字幕',
                    detail: '正在查找关联视频…',
                    statusMessage: `正在加载 ${basename(subPath)}…`,
                });
                const guess = await electron?.transubGuessVideoForSubtitle?.({ path: subPath });
                if (guess?.ok && guess.videoPath) linkedVideo = guess.videoPath;
            }
            const ok = await loadDocument(subPath, linkedVideo);
            if (!ok) return;
            state.ready = true;
        } catch (err) {
            hideBootProgress();
            setStatus(err?.message || '打开字幕失败', 'err');
        }
    }

    async function pickAndOpenInWindow() {
        const res = await electron?.transubSelectSubtitle?.({ title: '选择要编辑的字幕文件' });
        if (typeof requestOsRefocus === 'function') requestOsRefocus();
        else restoreEditorFocus();
        if (!res?.ok) {
            setStatus(res?.error || '打开字幕失败', 'err');
            return;
        }
        if (res.canceled || !res.path) return;
        await openDocument(res.path, res.videoPath || '');
    }

    async function linkVideo() {
        const res = await electron?.transubSelectEditorVideo?.({
            defaultPath: state.videoPath || state.path,
            title: '选择关联视频',
        });
        if (typeof requestOsRefocus === 'function') requestOsRefocus();
        else restoreEditorFocus();
        if (!res?.ok) {
            setStatus(res?.error || '选择视频失败', 'err');
            return;
        }
        if (res.canceled || !res.path) return;
        await loadVideo(res.path);
        await populateSidecarSelect(res.path, state.path);
        if (els.splitModal && !els.splitModal.classList.contains('hidden')) {
            updateSplitModalState();
        }
        if (els.silenceSplitModal && !els.silenceSplitModal.classList.contains('hidden')) {
            updateSilenceSplitModalState();
        }
        setStatus(`已关联视频：${basename(res.path)}`, 'ok');
    }

    async function saveDocument() {
        syncDetailToCue();
        if (!state.cues.length) {
            setStatus('无法保存：字幕为空', 'err');
            return;
        }
        const res = await electron?.transubWriteSubtitle?.({
            path: state.path,
            format: state.format,
            cues: state.cues,
            header: state.header,
        });
        if (!res?.ok) {
            setStatus(res?.error || '保存失败', 'err');
            return;
        }
        setDirty(false);
        state.savedSnapshot = cloneCues(state.cues);
        refreshCueMeta();
        await persistCueMeta();
        await clearDocumentDraft();
        setStatus(res.backupPath ? '已保存（并写入 .bak）' : '已保存', 'ok');
        if (els.saveStatus) {
            els.saveStatus.textContent = '已保存';
            setTimeout(() => { if (els.saveStatus) els.saveStatus.textContent = ''; }, 2000);
        }
    }

    function insertCueAtPlayhead() {
        syncDetailToCue();
        recordUndoBeforeChange();
        const startMs = getPlaybackTimeMs();
        let endMs = startMs + 2000;

        for (const c of state.cues) {
            if (c.startMs > startMs) {
                endMs = Math.min(endMs, c.startMs - 1);
                break;
            }
        }
        if (endMs <= startMs) endMs = startMs + 500;

        const newCue = { index: state.cues.length + 1, startMs, endMs, text: '' };
        state.cues.push(newCue);
        state.cues.sort((a, b) => a.startMs - b.startMs);
        const newIdx = state.cues.indexOf(newCue);

        setDirty(true);
        state.selectedIndex = newIdx >= 0 ? newIdx : 0;
        renderCueList();
        selectCue(state.selectedIndex, { scroll: true, seek: true });
        els.detailText?.focus();
        setStatus(`已在 ${formatDisplayTime(startMs, state.format)} 插入新字幕`, 'ok');
    }

    async function deleteSelectedCue() {
        const indexes = getSelectedCueIndexes();
        if (!indexes.length && state.selectedIndex < 0) return;
        const targets = indexes.length ? indexes : [state.selectedIndex];
        const label = targets.length === 1
            ? `删除第 ${targets[0] + 1} 条字幕？`
            : `删除选中的 ${targets.length} 条字幕？`;
        if (!(await editorConfirm(label))) return;
        syncDetailToCue();
        recordUndoBeforeChange();
        const removeSet = new Set(targets);
        const nextCues = state.cues.filter((_, i) => !removeSet.has(i));
        const focusBefore = Math.min(...targets);
        let keptBefore = 0;
        for (let i = 0; i < focusBefore; i += 1) {
            if (!removeSet.has(i)) keptBefore += 1;
        }
        state.cues.splice(0, state.cues.length, ...nextCues);
        const nextFocus = nextCues.length
            ? Math.min(keptBefore, nextCues.length - 1)
            : -1;
        setSelectionIndexes(nextFocus >= 0 ? [nextFocus] : [], nextFocus);
        setDirty(true);
        renderCueList();
        setStatus(targets.length === 1
            ? `已删除第 ${targets[0] + 1} 条`
            : `已删除 ${targets.length} 条字幕`, 'ok');
    }

    function quickSplitSelectedCue(mode, extraOpts = {}) {
        if (state.selectedIndex < 0) return;
        syncDetailToCue();
        const idx = state.selectedIndex;
        const cue = state.cues[idx];
        const result = computeSplitParts(mode, cue, extraOpts);
        if (result.error) {
            setStatus(result.error, 'err');
            return;
        }
        applySplitResult(idx, result.cues, extraOpts);
    }

    function charCountAdjustSelectedCueDuration() {
        if (state.selectedIndex < 0) return;
        syncDetailToCue();
        const idx = state.selectedIndex;
        const cue = state.cues[idx];
        const chars = textCharCount(cue.text);
        if (!chars) {
            setStatus('当前字幕无文本，无法按字数调节时长', 'err');
            return;
        }

        const targetCps = getTargetCps();
        const minDurMs = 500;
        const maxDurMs = 10000;
        const gapMs = 1;
        let needMs = Math.ceil((chars / targetCps) * 1000);
        needMs = Math.max(minDurMs, Math.min(maxDurMs, needMs));

        let newEnd = cue.startMs + needMs;
        const next = idx < state.cues.length - 1 ? state.cues[idx + 1] : null;
        if (next) newEnd = Math.min(newEnd, next.startMs - gapMs);
        newEnd = Math.max(cue.startMs + minDurMs, newEnd);

        const oldEnd = cueEndMs(cue);
        if (newEnd === oldEnd) {
            setStatus(`第 ${idx + 1} 条时长已合适（CPS ${computeCps(cue.text, cueDurationMs(cue))}）`, 'ok');
            return;
        }

        recordUndoBeforeChange();
        cue.endMs = newEnd;
        setDirty(true);
        refreshListRow(idx);
        if (state.selectedIndex === idx) renderDetailPane();
        resyncPlaybackAfterCueTimingChange();
        const newCps = computeCps(cue.text, cueDurationMs(cue));
        setStatus(
            `已按字数调节第 ${idx + 1} 条时长为 ${formatDurationSec(cueDurationMs(cue))} 秒`
            + (newCps ? `（CPS ${newCps}）` : ''),
            'ok',
        );
    }

    function canSilenceAdjustDurationCue(cue) {
        if (!cue) return false;
        if (cueDurationMs(cue) < 600) return false;
        return true;
    }

    function canAudioSnapCue(cue) {
        if (!cue) return false;
        if (cueDurationMs(cue) < 300) return false;
        return true;
    }

    async function computeSilenceAdjustedEndMs(cue, opts = {}) {
        if (!state.videoPath) {
            return { error: '请先关联视频后再使用智能调节时长' };
        }
        const start = Math.round(Number(cue.startMs) || 0);
        const end = cueEndMs(cue);
        const minDurMs = 500;
        const tailPadMs = Math.max(0, Math.round(Number(opts.tailPadMs ?? 80)));
        const minShiftMs = Math.max(40, Math.round(Number(opts.minShiftMs ?? 80)));
        const padMs = Math.max(400, Math.min(4000, Math.round(Number(opts.padMs ?? 1500))));
        const gapMs = 1;

        let cueIndex = Number(opts.cueIndex);
        if (!Number.isInteger(cueIndex) || cueIndex < 0) {
            cueIndex = state.cues.indexOf(cue);
        }
        const next = cueIndex >= 0 && cueIndex < state.cues.length - 1
            ? state.cues[cueIndex + 1]
            : null;
        const nextLimit = next ? next.startMs - gapMs : Number.POSITIVE_INFINITY;
        const analysisEnd = Math.max(
            end,
            Math.min(
                Number.isFinite(nextLimit) ? nextLimit : Number.POSITIVE_INFINITY,
                end + padMs,
            ),
        );
        if (analysisEnd - start < 250) {
            return { error: '可分析时间窗过短（可能与下一条字幕过紧）' };
        }

        const analysis = await electron?.ffmpegDetectSilence?.(buildFfmpegRequest({
            path: state.videoPath,
            startMs: start,
            endMs: analysisEnd,
            noiseDb: opts.silenceDb ?? -35,
            minSilenceSec: opts.silenceDur ?? 0.25,
            minSegmentMs: 400,
        }));
        if (analysis?.cancelled || isJobAbortRequested()) {
            return { cancelled: true, error: '已取消' };
        }
        if (!analysis?.ok) {
            return { error: analysis?.error || '静音分析失败' };
        }

        // Prefer speech-region end (supports shorten + extend); fall back to trailing-silence shrink.
        let newEnd = null;
        if (typeof splitCore.snapCueTimingFromSilenceIntervals === 'function') {
            const snapped = splitCore.snapCueTimingFromSilenceIntervals(
                start,
                end,
                analysis.intervals,
                {
                    windowStartMs: start,
                    windowEndMs: analysisEnd,
                    prevLimitMs: start,
                    nextLimitMs: Number.isFinite(nextLimit) ? nextLimit : analysisEnd,
                    allowExtend: true,
                    minDurMs,
                    headPadMs: 0,
                    tailPadMs,
                    minSpeechMs: 200,
                    minShiftMs,
                },
            );
            if (snapped?.region) {
                newEnd = Math.round(snapped.region.endMs + tailPadMs);
            } else if (snapped?.changed) {
                newEnd = Math.round(snapped.endMs);
            }
        }
        if (newEnd == null) {
            newEnd = splitCore.inferSpeechEndFromSilence(
                start,
                end,
                analysis.intervals,
                {
                    minDurMs,
                    minTrailingSilenceMs: Math.max(250, Math.round((opts.silenceDur ?? 0.25) * 1000)),
                    tailPadMs,
                },
            );
        }
        if (newEnd == null) {
            return { error: '未检测到可用语音边界，当前时长可能已接近实际语音长度', unchanged: true };
        }

        newEnd = Math.max(start + minDurMs, Math.round(newEnd));
        if (Number.isFinite(nextLimit)) {
            newEnd = Math.min(newEnd, nextLimit);
        }
        newEnd = Math.max(start + minDurMs, newEnd);
        const deltaMs = newEnd - end;
        if (Math.abs(deltaMs) < minShiftMs) {
            return { error: '当前时长已接近实际语音，无需调整', unchanged: true };
        }
        return {
            newEndMs: newEnd,
            meta: {
                oldEndMs: end,
                deltaMs,
                silenceCount: analysis.intervals?.length || 0,
            },
        };
    }

    async function computeAudioSnappedCueTiming(cue, idx, opts = {}) {
        if (!state.videoPath) {
            return { error: '请先关联视频后再使用按音频贴边' };
        }
        const end = cueEndMs(cue);
        const padMs = Math.max(0, Math.min(2000, Math.round(Number(opts.padMs ?? 400))));
        const gapMs = 1;
        const prev = idx > 0 ? state.cues[idx - 1] : null;
        const next = idx < state.cues.length - 1 ? state.cues[idx + 1] : null;
        const prevLimit = prev ? cueEndMs(prev) + gapMs : 0;
        const nextLimit = next ? next.startMs - gapMs : Number.POSITIVE_INFINITY;
        const windowStart = Math.max(0, Math.max(prevLimit, cue.startMs - padMs));
        const windowEnd = Math.min(
            Number.isFinite(nextLimit) ? nextLimit : Number.POSITIVE_INFINITY,
            end + padMs,
        );
        const analysisEnd = Number.isFinite(windowEnd) ? windowEnd : end + padMs;
        if (analysisEnd - windowStart < 250) {
            return { error: '可分析时间窗过短（可能与相邻字幕过紧）' };
        }

        const analysis = await electron?.ffmpegDetectSilence?.(buildFfmpegRequest({
            path: state.videoPath,
            startMs: windowStart,
            endMs: analysisEnd,
            noiseDb: opts.silenceDb ?? -35,
            minSilenceSec: opts.silenceDur ?? 0.25,
            minSegmentMs: 400,
        }));
        if (analysis?.cancelled || isJobAbortRequested()) {
            return { cancelled: true, error: '已取消' };
        }
        if (!analysis?.ok) {
            return { error: analysis?.error || '静音分析失败' };
        }

        const snapped = splitCore.snapCueTimingFromSilenceIntervals(
            cue.startMs,
            end,
            analysis.intervals,
            {
                windowStartMs: windowStart,
                windowEndMs: analysisEnd,
                prevLimitMs: prevLimit,
                nextLimitMs: Number.isFinite(nextLimit) ? nextLimit : analysisEnd,
                minDurMs: 500,
                headPadMs: Math.max(0, Math.round(Number(opts.headPadMs ?? 80))),
                tailPadMs: Math.max(0, Math.round(Number(opts.tailPadMs ?? 80))),
                minSpeechMs: 200,
                minShiftMs: 80,
                allowExtend: opts.allowExtend !== false,
            },
        );

        if (!snapped.changed) {
            const reasonMap = {
                no_speech: '未检测到可用语音段',
                no_region: '未匹配到语音段',
                too_short: '贴边后时长过短，已保持原时间',
                unchanged: '时间轴已贴近语音，无需调整',
            };
            return {
                error: reasonMap[snapped.reason] || '无需调整',
                unchanged: true,
                snapped,
            };
        }

        return {
            startMs: snapped.startMs,
            endMs: snapped.endMs,
            startDelta: snapped.startDelta,
            endDelta: snapped.endDelta,
            silenceCount: analysis.intervals?.length || 0,
            windowStartMs: windowStart,
            windowEndMs: analysisEnd,
        };
    }

    async function silenceSnapSelectedCueTiming(extraOpts = {}) {
        if (state.silenceSplitBusy || state.retranscribeBusy) {
            setStatus('已有分析任务进行中，请稍候', 'err');
            return;
        }
        if (state.selectedIndex < 0) return;
        syncDetailToCue();
        const idx = state.selectedIndex;
        const cue = state.cues[idx];
        if (!canAudioSnapCue(cue)) {
            setStatus('当前字幕时长过短，无法贴边', 'err');
            return;
        }
        if (!state.videoPath || !electron?.ffmpegDetectSilence) {
            setStatus('请先关联视频后再使用按音频贴边', 'err');
            return;
        }

        const opts = {
            ...getSilenceSplitOpts(extraOpts),
            padMs: extraOpts.padMs ?? 400,
            allowExtend: extraOpts.allowExtend !== false,
        };
        setSilenceSplitBusy(true);
        showSilenceSplitProgress({
            title: '正在按音频贴边',
            detail: `正在分析第 ${idx + 1} 条字幕的语音边界…`,
            indeterminate: true,
            statusMessage: '正在分析视频静音…',
        });
        if (els.silenceProgressHint) {
            els.silenceProgressHint.textContent = '根据静音检测将字幕起止贴到语音边界，文本保持不变';
        }
        await flushSilenceProgressPaint();

        try {
            const result = await computeAudioSnappedCueTiming(cue, idx, opts);
            if (result.error) {
                setStatus(result.error, result.unchanged ? 'ok' : 'err');
                return;
            }

            recordUndoBeforeChange();
            cue.startMs = result.startMs;
            cue.endMs = result.endMs;
            setDirty(true);
            refreshListRow(idx);
            if (state.selectedIndex === idx) renderDetailPane();
            resyncPlaybackAfterCueTimingChange();
            const startPart = result.startDelta
                ? `起始 ${result.startDelta > 0 ? '+' : ''}${(result.startDelta / 1000).toFixed(2)}s`
                : '起始不变';
            const endPart = result.endDelta
                ? `结束 ${result.endDelta > 0 ? '+' : ''}${(result.endDelta / 1000).toFixed(2)}s`
                : '结束不变';
            setStatus(`已按音频贴边第 ${idx + 1} 条：${startPart} · ${endPart}`, 'ok');
        } finally {
            setSilenceSplitBusy(false);
            hideSilenceSplitProgress();
            if (els.silenceProgressHint) {
                els.silenceProgressHint.textContent = 'FFmpeg 正在分析关联视频的音频静音点，请勿关闭窗口';
            }
        }
    }

    async function silenceAdjustSelectedCueDuration(extraOpts = {}) {
        if (state.silenceSplitBusy) return;
        if (state.selectedIndex < 0) return;
        syncDetailToCue();
        const idx = state.selectedIndex;
        const cue = state.cues[idx];
        if (!canSilenceAdjustDurationCue(cue)) {
            setStatus('当前字幕时长过短，无法智能调节', 'err');
            return;
        }
        if (!state.videoPath || !electron?.ffmpegDetectSilence) {
            setStatus('请先关联视频后再使用智能调节时长', 'err');
            return;
        }

        const opts = getSilenceSplitOpts(extraOpts);
        showSilenceSplitProgress({
            title: '正在分析静音',
            detail: `正在分析第 ${idx + 1} 条字幕的实际语音时长…`,
            indeterminate: true,
            statusMessage: '正在分析视频静音…',
        });
        await flushSilenceProgressPaint();

        try {
            const analysis = await computeSilenceAdjustedEndMs(cue, { ...opts, cueIndex: idx });
            if (analysis.error) {
                setStatus(analysis.error, analysis.unchanged ? 'ok' : 'err');
                return;
            }
            const newEnd = clampSilenceAdjustedEnd(cue, idx, analysis.newEndMs, true);
            const oldEnd = cueEndMs(cue);
            const deltaMs = newEnd - oldEnd;
            if (Math.abs(deltaMs) < 80) {
                setStatus(`第 ${idx + 1} 条时长已接近实际语音，无需调整`, 'ok');
                return;
            }

            recordUndoBeforeChange();
            cue.endMs = newEnd;
            setDirty(true);
            refreshListRow(idx);
            if (state.selectedIndex === idx) renderDetailPane();
            resyncPlaybackAfterCueTimingChange();
            const deltaSec = (Math.abs(deltaMs) / 1000).toFixed(3);
            const verb = deltaMs < 0 ? '缩短' : '延长';
            setStatus(
                `已智能调节第 ${idx + 1} 条时长：${formatDurationSec(cueDurationMs(cue))} 秒（${verb} ${deltaSec} 秒）`,
                'ok',
            );
        } finally {
            hideSilenceSplitProgress();
        }
    }

    function canSilenceSplitCue(cue) {
        const text = String(cue?.text || '').trim();
        if (!text) return false;
        if (cueDurationMs(cue) < 600) return false;
        if (!splitCore.isConnectedText(text)) return true;
        if (typeof splitCore.getSilenceTextBreakIndices !== 'function') return false;
        const breaks = splitCore.getSilenceTextBreakIndices(text, {
            breakWords: getSmartSplitBreakWords(),
            includePunctuation: true,
        });
        return breaks.length > 0;
    }

    function setSilenceSplitBusy(busy) {
        state.silenceSplitBusy = !!busy;
        if (!busy) state.jobAbortRequested = false;
        if (els.silenceSplitBtn) els.silenceSplitBtn.disabled = state.silenceSplitBusy;
        if (els.silenceSplitConfirm) els.silenceSplitConfirm.disabled = state.silenceSplitBusy;
        if (els.batchDurConfirm) els.batchDurConfirm.disabled = state.silenceSplitBusy;
        if (els.splitConfirm && getSelectedSplitMode() === 'silence') {
            els.splitConfirm.disabled = state.silenceSplitBusy;
        }
        if (els.silenceProgressCancel) {
            els.silenceProgressCancel.disabled = !(state.silenceSplitBusy || state.retranscribeBusy);
        }
        if (state.selectedIndex >= 0) renderDetailPane();
    }

    function isJobAbortRequested() {
        return !!state.jobAbortRequested;
    }

    async function requestEditorJobAbort() {
        if (!state.silenceSplitBusy && !state.retranscribeBusy) return;
        if (state.jobAbortRequested) return;
        state.jobAbortRequested = true;
        if (els.silenceProgressDetail) {
            els.silenceProgressDetail.textContent = '正在取消…';
        }
        if (els.silenceProgressCancel) els.silenceProgressCancel.disabled = true;
        try {
            if (state.retranscribeBusy) {
                await electron?.transWithAiCancel?.();
            }
            await electron?.ffmpegCancel?.();
        } catch (_) { /* ignore */ }
        setStatus('正在取消…', 'warn');
    }

    async function flushSilenceProgressPaint() {
        await new Promise((resolve) => {
            requestAnimationFrame(() => setTimeout(resolve, 0));
        });
    }

    function showSilenceSplitProgress(opts = {}) {
        if (!els.silenceProgress) return;
        const total = Math.max(0, Math.floor(Number(opts.total) || 0));
        const current = Math.max(0, Math.floor(Number(opts.current) || 0));
        const indeterminate = opts.indeterminate != null ? !!opts.indeterminate : total <= 1;

        els.silenceProgress.classList.remove('hidden');
        els.silenceProgress.setAttribute('aria-busy', 'true');
        els.silenceProgress.classList.toggle('indeterminate', indeterminate);

        if (els.silenceProgressTitle) {
            els.silenceProgressTitle.textContent = opts.title || '正在分析静音';
        }
        if (els.silenceProgressDetail) {
            els.silenceProgressDetail.textContent = opts.detail || '请稍候，FFmpeg 正在分析音频…';
        }
        if (els.silenceProgressHint) {
            els.silenceProgressHint.textContent = opts.hint
                || 'FFmpeg 正在分析关联视频的音频静音点，处理时间较长时请耐心等待';
        }

        if (els.silenceProgressCount) {
            if (total > 1) {
                els.silenceProgressCount.textContent = `${Math.min(current, total)} / ${total}`;
                els.silenceProgressCount.classList.remove('hidden');
            } else {
                els.silenceProgressCount.classList.add('hidden');
            }
        }

        if (els.silenceProgressTrack) {
            els.silenceProgressTrack.classList.remove('hidden');
        }

        updateSilenceSplitProgress({ current, total, indeterminate });
        if (opts.statusMessage) setStatus(opts.statusMessage, '');
        state.jobAbortRequested = false;
        setSilenceSplitBusy(true);
        if (els.silenceProgressCancel) els.silenceProgressCancel.disabled = false;
    }

    function updateSilenceSplitProgress(opts = {}) {
        if (!els.silenceProgress || els.silenceProgress.classList.contains('hidden')) return;

        const total = Math.max(0, Math.floor(Number(opts.total) || 0));
        const current = Math.max(0, Math.floor(Number(opts.current) || 0));
        const indeterminate = opts.indeterminate != null
            ? !!opts.indeterminate
            : els.silenceProgress.classList.contains('indeterminate');

        if (opts.detail && els.silenceProgressDetail) {
            els.silenceProgressDetail.textContent = opts.detail;
        }
        if (opts.title && els.silenceProgressTitle) {
            els.silenceProgressTitle.textContent = opts.title;
        }

        if (total > 1) {
            els.silenceProgress.classList.remove('indeterminate');
            if (els.silenceProgressTrack) els.silenceProgressTrack.classList.remove('hidden');
            if (els.silenceProgressCount) {
                els.silenceProgressCount.textContent = `${Math.min(current, total)} / ${total}`;
                els.silenceProgressCount.classList.remove('hidden');
            }
            if (els.silenceProgressBar) {
                const pct = total > 0 ? Math.round((current / total) * 100) : 0;
                els.silenceProgressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
            }
        } else if (indeterminate && els.silenceProgressBar) {
            els.silenceProgressBar.style.width = '';
        }

        if (opts.statusMessage) {
            setStatus(opts.statusMessage, '');
        }
    }

    function hideSilenceSplitProgress() {
        if (!els.silenceProgress) return;
        els.silenceProgress.classList.add('hidden');
        els.silenceProgress.classList.remove('indeterminate');
        els.silenceProgress.setAttribute('aria-busy', 'false');
        if (els.silenceProgressBar) els.silenceProgressBar.style.width = '0%';
        if (els.silenceProgressCount) els.silenceProgressCount.classList.add('hidden');
        setSilenceSplitBusy(false);
        if (state.selectedIndex >= 0) renderDetailPane();
    }

    function getSilenceSplitOpts(extra = {}, mode = 'batch') {
        const prefs = loadSplitPrefs();
        let silenceDb = extra.silenceDb ?? prefs.silenceDb;
        let silenceDur = extra.silenceDur ?? prefs.silenceDur;
        // Single-cue splits default to more sensitive floors than batch prefs
        if (mode === 'cue') {
            silenceDb = Math.max(Number(silenceDb) || -30, -30);
            silenceDur = Math.min(Math.max(0.05, Number(silenceDur) || 0.12), 0.12);
        }
        return {
            silenceDb,
            silenceDur,
            fixOverlap: extra.fixOverlap ?? prefs.fixOverlap,
        };
    }

    async function quickSilenceSplitSelectedCue(extraOpts = {}) {
        if (state.silenceSplitBusy) return { ok: false, error: '静音分析正在进行中' };
        if (state.selectedIndex < 0) return { ok: false, error: '未选中字幕' };
        syncDetailToCue();
        const idx = state.selectedIndex;
        const cue = getLiveSelectedCue() || state.cues[idx];
        const opts = getSilenceSplitOpts(extraOpts, 'cue');

        showSilenceSplitProgress({
            title: '正在分析静音',
            detail: `正在分析第 ${idx + 1} 条字幕的音频静音点…`,
            indeterminate: true,
            statusMessage: '正在分析视频静音…',
        });
        await flushSilenceProgressPaint();

        try {
            const result = await computeSilenceSplitParts(cue, opts);
            if (result.error) {
                setStatus(result.error, 'err');
                return { ok: false, error: result.error };
            }
            applySplitResult(idx, result.cues, opts);
            if (result.meta?.silenceCount) {
                setStatus(`已按 ${result.meta.silenceCount} 处静音分割为 ${result.cues.length} 条`, 'ok');
            }
            return { ok: true, cues: result.cues, meta: result.meta };
        } finally {
            hideSilenceSplitProgress();
        }
    }

    function updateContextMenuState() {
        if (!els.cueContextMenu) return;
        const hasCue = state.selectedIndex >= 0 && state.selectedIndex < state.cues.length;
        const text = hasCue ? String(state.cues[state.selectedIndex].text || '').trim() : '';
        const canSplit = hasCue && !!text;
        const canSplitLines = canSplit && String(state.cues[state.selectedIndex].text || '').includes('\n');
        const canSplitSpaces = canSplit && /\s/.test(String(state.cues[state.selectedIndex].text || ''));
        const canSilenceSplit = hasCue && canSilenceSplitCue(state.cues[state.selectedIndex])
            && !!state.videoPath && !!electron?.ffmpegDetectSilence && !state.silenceSplitBusy;

        const canAlignStart = hasCue && !!els.video;
        const canAlignEnd = hasCue && !!els.video;
        const canCharDur = hasCue && textCharCount(state.cues[state.selectedIndex].text) > 0;
        const canSmartDur = hasCue && canSilenceAdjustDurationCue(state.cues[state.selectedIndex])
            && !!state.videoPath && !!electron?.ffmpegDetectSilence && !state.silenceSplitBusy;
        const canAudioSnap = hasCue && canAudioSnapCue(state.cues[state.selectedIndex])
            && !!state.videoPath && !!electron?.ffmpegDetectSilence
            && !state.silenceSplitBusy && !state.retranscribeBusy;

        els.cueContextMenu.querySelectorAll('[data-ctx-action]').forEach((btn) => {
            const action = btn.dataset.ctxAction;
            if (action === 'split-modal' || action === 'split-smart' || action === 'split-silence'
                || action === 'split-lines' || action === 'split-spaces') {
                if (action === 'split-lines') btn.disabled = !canSplitLines;
                else if (action === 'split-spaces') btn.disabled = !canSplitSpaces;
                else if (action === 'split-silence') btn.disabled = !canSilenceSplit;
                else btn.disabled = !canSplit;
            } else if (action === 'split-silence-all') {
                btn.disabled = state.silenceSplitBusy || !state.videoPath || !electron?.ffmpegDetectSilence
                    || !state.cues.some((cue) => canSilenceSplitCue(cue));
            } else if (action === 'align-start') {
                btn.disabled = !canAlignStart;
            } else if (action === 'align-end') {
                btn.disabled = !canAlignEnd;
            } else if (action === 'char-dur') {
                btn.disabled = !canCharDur;
            } else if (action === 'smart-dur') {
                btn.disabled = !canSmartDur;
            } else if (action === 'audio-snap') {
                btn.disabled = !canAudioSnap;
            } else if (action === 'audio-snap-batch') {
                btn.disabled = !state.videoPath || !electron?.ffmpegDetectSilence
                    || state.silenceSplitBusy || state.retranscribeBusy || !state.cues.length;
            } else if (action === 'retranscribe') {
                btn.disabled = !hasCue || state.retranscribeBusy || state.silenceSplitBusy
                    || !state.videoPath || !electron?.transubTranscribeRange;
            } else if (action === 'retranscribe-dur') {
                btn.disabled = state.retranscribeBusy || state.silenceSplitBusy
                    || !state.videoPath || !electron?.transubTranscribeRange;
            } else if (action === 'confirm-meta') {
                btn.disabled = !hasCue;
            } else if (action === 'delete') {
                btn.disabled = !hasCue;
            } else if (action === 'insert') {
                btn.disabled = false;
            }
        });
    }

    function hideCueContextMenu() {
        if (!els.cueContextMenu) return;
        els.cueContextMenu.classList.add('hidden');
    }

    function showCueContextMenu(clientX, clientY) {
        if (!els.cueContextMenu) return;
        updateContextMenuState();
        const menu = els.cueContextMenu;
        menu.classList.remove('hidden');
        menu.style.visibility = 'hidden';
        menu.style.left = '0';
        menu.style.top = '0';
        const rect = menu.getBoundingClientRect();
        menu.style.visibility = '';
        const pad = 8;
        let x = clientX;
        let y = clientY;
        if (x + rect.width > window.innerWidth - pad) x = window.innerWidth - rect.width - pad;
        if (y + rect.height > window.innerHeight - pad) y = window.innerHeight - rect.height - pad;
        menu.style.left = `${Math.max(pad, x)}px`;
        menu.style.top = `${Math.max(pad, y)}px`;
    }

    function openCueContextMenuAt(idx, clientX, clientY, { scroll = false } = {}) {
        if (!Number.isFinite(idx) || idx < 0 || idx >= state.cues.length) return;
        if (!getSelectedCueIndexes().includes(idx)) {
            selectCue(idx, { scroll });
        } else {
            state.selectedIndex = idx;
            renderDetailPane();
        }
        showCueContextMenu(clientX, clientY);
    }

    function handleContextMenuAction(action) {
        hideCueContextMenu();
        switch (action) {
            case 'split-modal':
                openSplitModal();
                break;
            case 'split-smart': {
                const prefs = loadSplitPrefs();
                quickSplitSelectedCue('smart', {
                    smartMaxChars: prefs.smartMaxChars,
                    smartLineChars: prefs.smartLineChars,
                    useCps: prefs.useCps,
                    fixOverlap: prefs.fixOverlap,
                });
                break;
            }
            case 'split-silence':
                quickSilenceSplitSelectedCue();
                break;
            case 'split-silence-all':
                openSilenceSplitModal('all');
                break;
            case 'split-lines':
                quickSplitSelectedCue('lines');
                break;
            case 'split-spaces':
                quickSplitSelectedCue('spaces');
                break;
            case 'align-start':
                setStartToPlayhead();
                break;
            case 'align-end':
                setEndToPlayhead();
                break;
            case 'char-dur':
                charCountAdjustSelectedCueDuration();
                break;
            case 'smart-dur':
                silenceAdjustSelectedCueDuration();
                break;
            case 'audio-snap':
                silenceSnapSelectedCueTiming();
                break;
            case 'audio-snap-batch':
                openBatchAudioSnapModal();
                break;
            case 'retranscribe':
                retranscribeSelectedCue();
                break;
            case 'retranscribe-dur':
                openRetranscribeDurModal();
                break;
            case 'confirm-meta':
                markSelectedCueTrusted();
                break;
            case 'insert':
                insertCueAtPlayhead();
                break;
            case 'delete':
                deleteSelectedCue();
                break;
            default:
                break;
        }
    }

    function readSingleSplitOptions() {
        return {
            charCount: Number(els.splitCharCount?.value) || 20,
            count: Number(els.splitCount?.value) || 2,
            smartMaxChars: Number(els.splitSmartMaxChars?.value) || 20,
            smartLineChars: Number(els.splitSmartLineChars?.value) || 18,
            silenceDb: Number(els.splitSilenceDb?.value) || -35,
            silenceDur: Number(els.splitSilenceDur?.value) || 0.25,
            useCps: els.splitUseCps?.checked !== false,
            fixOverlap: els.splitFixOverlap?.checked !== false,
        };
    }

    function getSplitTimeMode(useCps) {
        return useCps ? 'cps' : 'proportional';
    }

    function getSplitTimeOpts(useCps) {
        return {
            targetCps: getTargetCps(),
            minDurMs: 500,
        };
    }

    function splitTextByLines(text) {
        return splitCore.splitTextByLines(text);
    }

    function splitTextBySpaces(text) {
        return splitCore.splitTextBySpaces(text);
    }

    function splitTextByCharCount(text, maxChars) {
        return splitCore.splitTextByCharCount(text, maxChars);
    }

    function splitTextIntoNParts(text, n) {
        return splitCore.splitTextIntoNParts(text, n);
    }

    function splitTextAtIndex(text, index) {
        return splitCore.splitTextAtIndex(text, index);
    }

    function buildCuesFromTexts(startMs, endMs, texts, timeMode = 'proportional', timeOpts = {}) {
        return splitCore.buildCuesFromTexts(startMs, endMs, texts, timeMode, timeOpts);
    }

    function buildTwoPartSplitByTime(cue, splitMs, textBefore, textAfter) {
        const end = cueEndMs(cue);
        if (splitMs <= cue.startMs || splitMs >= end) return null;
        return [
            { startMs: cue.startMs, endMs: splitMs, text: textBefore },
            { startMs: splitMs, endMs: end, text: textAfter },
        ];
    }

    function blocksConnectedTextSplit(mode) {
        return mode === 'chars' || mode === 'count' || mode === 'silence';
    }

    function parseBreakWordsInput(raw) {
        return splitCore.normalizeBreakWords(
            String(raw || '')
                .split(/[,，;；|／/\n\r\t]+/)
                .map((s) => s.trim()),
        );
    }

    function getSmartSplitBreakWords() {
        return loadBreakWords();
    }

    function connectedTextSplitError(mode, text) {
        if (!blocksConnectedTextSplit(mode) || !splitCore.isConnectedText(text)) return null;
        if (mode === 'silence' && typeof splitCore.getSilenceTextBreakIndices === 'function') {
            const breaks = splitCore.getSilenceTextBreakIndices(text, {
                breakWords: getSmartSplitBreakWords(),
                includePunctuation: true,
            });
            if (breaks.length) return null;
            return '文本为连续书写且未匹配断句词/标点，无法静音分割。请在「断句词」中添加，或使用光标/播放头手动分割。';
        }
        return CONNECTED_TEXT_SPLIT_MSG;
    }

    function computeSplitParts(mode, cue, opts = {}) {
        const text = String(cue.text || '').trim();
        const end = cueEndMs(cue);
        if (!text) return { error: '当前字幕文本为空，无法分割' };

        const connectedErr = connectedTextSplitError(mode, text);
        if (connectedErr) return { error: connectedErr };

        const useCps = opts.useCps !== false;
        const timeMode = getSplitTimeMode(useCps);
        const timeOpts = getSplitTimeOpts(useCps);

        if (mode === 'smart') {
            const texts = splitCore.splitTextSmart(text, {
                maxChars: opts.smartMaxChars ?? opts.charCount ?? 20,
                maxLineChars: opts.smartLineChars ?? 18,
                breakWords: opts.breakWords || getSmartSplitBreakWords(),
            });
            if (texts.length < 2) return { error: '当前文本无需智能分割（已足够短或缺少标点/断句词）' };
            return { cues: buildCuesFromTexts(cue.startMs, end, texts, timeMode, timeOpts) };
        }

        if (mode === 'lines') {
            const texts = splitTextByLines(text);
            if (texts.length < 2) return { error: '文本中没有多个换行，无法按行分割' };
            return { cues: buildCuesFromTexts(cue.startMs, end, texts, timeMode, timeOpts) };
        }

        if (mode === 'spaces') {
            const texts = splitTextBySpaces(text);
            if (texts.length < 2) return { error: '文本中没有空格，无法按空格分割' };
            return { cues: buildCuesFromTexts(cue.startMs, end, texts, timeMode, timeOpts) };
        }

        if (mode === 'chars') {
            const texts = splitTextByCharCount(text, opts.charCount);
            if (texts.length < 2) return { error: '按该字符数无法拆成多条' };
            return { cues: buildCuesFromTexts(cue.startMs, end, texts, timeMode, timeOpts) };
        }

        if (mode === 'count') {
            const texts = splitTextIntoNParts(text, opts.count);
            if (texts === null) return { error: `文本过短，无法均分为 ${opts.count} 段` };
            if (texts.length < 2) return { error: '均分后不足两条，请减少段数' };
            return { cues: buildCuesFromTexts(cue.startMs, end, texts, 'equal', timeOpts) };
        }

        if (mode === 'cursor') {
            const ta = els.detailText;
            const pos = ta ? ta.selectionStart : text.length;
            const parts = splitTextAtIndex(text, pos);
            if (!parts) return { error: '请将光标置于文本中间再分割' };
            return { cues: buildCuesFromTexts(cue.startMs, end, parts, timeMode, timeOpts) };
        }

        if (mode === 'playhead') {
            if (!els.video) return { error: '未加载视频，无法在播放头处分割' };
            const splitMs = getPlaybackTimeMs();
            if (splitMs <= cue.startMs || splitMs >= end) {
                return { error: '播放头不在当前字幕时间范围内' };
            }
            const ratio = (splitMs - cue.startMs) / (end - cue.startMs);
            const roughIdx = Math.min(text.length - 1, Math.max(1, Math.round(text.length * ratio)));
            const splitIdx = splitCore.snapSplitIndexNearPunctuation(text, roughIdx, 12);
            let parts = splitTextAtIndex(text, splitIdx);
            if (!parts) {
                parts = splitTextAtIndex(text, Math.floor(text.length / 2));
            }
            if (!parts) return { error: '文本过短，无法在播放头处分割' };
            const cues = buildTwoPartSplitByTime(cue, splitMs, parts[0], parts[1]);
            return cues ? { cues } : { error: '播放头位置无效' };
        }

        return { error: '未知的分割方式' };
    }

    async function computeSilenceSplitParts(cue, opts = {}) {
        if (!state.videoPath) {
            return { error: '请先关联视频后再使用静音切分' };
        }
        const cueStart = Math.round(Number(cue.startMs) || 0);
        let end = Math.round(Number(cueEndMs(cue)) || 0);
        if (!(end > cueStart)) {
            const durSec = Number(els.detailDuration?.value);
            if (Number.isFinite(durSec) && durSec > 0) {
                end = cueStart + Math.round(durSec * 1000);
            }
        }
        const text = String(cue.text || '').trim();
        if (!text) return { error: '当前字幕文本为空，无法分割' };

        const connectedErr = connectedTextSplitError('silence', text);
        if (connectedErr) return { error: connectedErr };

        const cueDur = end - cueStart;
        if (!Number.isFinite(cueDur) || cueDur < 250) {
            return { error: `当前字幕时长过短（${Number.isFinite(cueDur) ? (cueDur / 1000).toFixed(3) : '?'}s），无法分析静音` };
        }

        const padMs = Math.max(0, Math.min(1200, Math.round(Number(opts.padMs ?? 600))));
        const analysisStart = Math.max(0, cueStart - padMs);
        const analysisEnd = end + padMs;
        if (!(analysisEnd > analysisStart + 200) || !Number.isFinite(analysisStart) || !Number.isFinite(analysisEnd)) {
            return {
                error: `静音分析时间窗无效（${cueStart}–${end} ms），请检查字幕起止时间`,
            };
        }
        // Prefer slightly more sensitive defaults than batch prefs for single-cue splits
        const noiseDb = opts.silenceDb != null ? opts.silenceDb : -30;
        const silenceDur = opts.silenceDur != null ? opts.silenceDur : 0.12;
        const minSegmentMs = Math.max(120, Math.min(280, Math.round(cueDur * 0.1)));
        const breakWords = opts.breakWords || getSmartSplitBreakWords();

        const textBreaks = typeof splitCore.getSilenceTextBreakIndices === 'function'
            ? splitCore.getSilenceTextBreakIndices(text, {
                breakWords,
                includePunctuation: true,
            })
            : (typeof splitCore.getWhitespaceBreakIndices === 'function'
                ? splitCore.getWhitespaceBreakIndices(text)
                : []);
        const idealBreakMs = textBreaks.map((idx) => {
            const ratio = Math.max(0, Math.min(1, idx / Math.max(1, text.length)));
            return Math.round(cueStart + ratio * cueDur);
        });

        const runDetect = (noise, minSilence, minSeg) => electron?.ffmpegDetectSilence?.({
            path: state.videoPath,
            startMs: analysisStart,
            endMs: analysisEnd,
            durationMs: analysisEnd - analysisStart,
            noiseDb: noise,
            minSilenceSec: minSilence,
            minSegmentMs: minSeg,
            ...(cachedFfmpegPath ? { ffmpegPath: cachedFfmpegPath } : {}),
        });

        const pickSplitPoints = (analysis, minSeg, minSilenceMs) => {
            if (!analysis?.ok) return [];
            const edge = Math.max(100, Math.min(minSeg, Math.floor(cueDur * 0.12)));
            if (typeof splitCore.pickScoredSilenceSplitPoints === 'function') {
                return splitCore.pickScoredSilenceSplitPoints(
                    analysis.intervals,
                    cueStart,
                    end,
                    {
                        edgeMs: edge,
                        minSilenceMs,
                        minSpeechMs: 120,
                        idealBreakMs,
                        minGapMs: edge,
                    },
                );
            }

            // Fallback for older split-core builds
            const interiorLo = cueStart + edge;
            const interiorHi = end - edge;
            if (interiorHi <= interiorLo) return [];
            const points = [];
            const pushIfInterior = (ms) => {
                const v = Math.round(Number(ms) || 0);
                if (v > interiorLo && v < interiorHi) points.push(v);
            };
            for (const ms of analysis.splitPointsMs || []) pushIfInterior(ms);
            for (const iv of analysis.intervals || []) {
                const s = Math.max(cueStart, Math.round(Number(iv.startMs) || 0));
                const e = Math.min(end, Math.round(Number(iv.endMs) || 0));
                if (e - s >= minSilenceMs) pushIfInterior(Math.round((s + e) / 2));
            }
            const sorted = [...points].sort((a, b) => a - b);
            const out = [];
            for (const ms of sorted) {
                if (!out.length || ms - out[out.length - 1] >= edge) out.push(ms);
            }
            return out;
        };

        // Escalate sensitivity only when the previous pass finds no usable split;
        // keep the first successful pass to avoid treating breath noise as pauses.
        const passes = [
            { noise: noiseDb, minSilence: silenceDur, minSeg: minSegmentMs },
            { noise: Math.min(-26, noiseDb + 5), minSilence: Math.min(0.1, silenceDur), minSeg: Math.max(100, minSegmentMs - 40) },
            { noise: -24, minSilence: 0.08, minSeg: Math.max(100, minSegmentMs - 60) },
            { noise: -22, minSilence: 0.06, minSeg: 100 },
        ];

        let analysis = null;
        let splitPoints = [];
        let lastError = '';

        for (const pass of passes) {
            if (isJobAbortRequested()) {
                return { cancelled: true, error: '已取消' };
            }
            const result = await runDetect(pass.noise, pass.minSilence, pass.minSeg);
            if (result?.cancelled || isJobAbortRequested()) {
                return { cancelled: true, error: '已取消' };
            }
            if (!result?.ok) {
                lastError = result?.error || lastError;
                continue;
            }
            analysis = result;
            const minSilenceMs = Math.max(50, Math.round(pass.minSilence * 850));
            splitPoints = pickSplitPoints(result, pass.minSeg, minSilenceMs);
            if (splitPoints.length) break;
        }

        if (!analysis?.ok && lastError) {
            return { error: lastError };
        }
        if (!splitPoints.length) {
            return { error: '该时间段内未检测到足够长的静音，请调低阈值或改用智能断句' };
        }

        const cues = splitCore.buildCuesFromSilenceSplits(
            text,
            cueStart,
            end,
            splitPoints,
            20,
            analysis.intervals,
            {
                minDurMs: 400,
                minTrailingSilenceMs: Math.max(100, Math.round((opts.silenceDur ?? silenceDur) * 700)),
                minLeadingSilenceMs: Math.max(100, Math.round((opts.silenceDur ?? silenceDur) * 700)),
                headPadMs: 60,
                tailPadMs: 60,
                gapMs: 1,
                breakWords,
                includePunctuation: true,
            },
        );
        if (!cues || cues.length < 2) {
            return { error: '静音切分后文本不足两条，请调整阈值或手动分割' };
        }

        return {
            cues,
            meta: {
                silenceCount: analysis.intervals?.length || 0,
                splitCount: splitPoints.length,
            },
        };
    }

    function maybeFixOverlapAfterSplit() {
        applySmartAdjustToCues(state.cues, {
            fixOverlap: true,
            fixCps: false,
            enforceMinDur: false,
            enforceMaxDur: false,
            gapMs: 1,
        });
    }

    async function markSelectedCueTrusted() {
        if (state.selectedIndex < 0 || state.selectedIndex >= state.cues.length) return;
        syncDetailToCue();
        refreshCueMeta();
        const idx = state.selectedIndex;
        state.cueMeta[idx] = {
            confidence: 1,
            flags: ['confirmed'],
            low: false,
            source: 'confirmed',
            fingerprint: metaCore.cueFingerprint(state.cues[idx]),
            confirmed: true,
        };
        await persistCueMeta();
        renderCueList();
        setStatus(`已将第 ${idx + 1} 条标记为可信`, 'ok');
    }

    function canRetranscribeNow() {
        if (state.retranscribeBusy || state.silenceSplitBusy) {
            setStatus('已有分析任务进行中，请稍候', 'err');
            return false;
        }
        if (!state.videoPath) {
            setStatus('请先关联视频后再重转写', 'err');
            return false;
        }
        if (!electron?.transubTranscribeRange) {
            setStatus('当前环境不支持区间重转写', 'err');
            return false;
        }
        return true;
    }

    function markRetranscribedMeta(startIndex, count) {
        state.cueMeta = metaCore.annotateCuesConfidence(state.cues, getMetaScanOptions());
        for (let i = 0; i < count; i += 1) {
            const at = startIndex + i;
            if (!state.cues[at]) continue;
            state.cueMeta[at] = {
                confidence: 0.88,
                flags: ['retranscribe'],
                low: false,
                source: 'retranscribe',
                fingerprint: metaCore.cueFingerprint(state.cues[at]),
            };
        }
    }

    /**
     * @param {{ startMs: number, endMs: number, padMs?: number, mode?: 'cue'|'range', detail?: string, snapAfter?: boolean }} opts
     */
    async function runRetranscribeRange(opts) {
        if (!canRetranscribeNow()) return { ok: false };
        const startMs = Math.max(0, Math.round(Number(opts.startMs) || 0));
        const endMs = Math.max(startMs + 200, Math.round(Number(opts.endMs) || 0));
        const padMs = Math.max(0, Math.min(2000, Math.round(Number(opts.padMs ?? 350))));
        const mode = opts.mode === 'cue' ? 'cue' : 'range';
        const snapAfter = opts.snapAfter === true;

        if (endMs - startMs < 200) {
            setStatus('重转写时间范围过短', 'err');
            return { ok: false };
        }

        state.retranscribeBusy = true;
        state.jobAbortRequested = false;
        updateRetranscribeTransportBtn();
        showSilenceSplitProgress({
            title: '正在重转写',
            detail: opts.detail || `正在截取并转写 ${((endMs - startMs) / 1000).toFixed(1)}s…`,
            indeterminate: true,
            statusMessage: '区间重转写进行中…',
        });
        if (els.silenceProgressHint) {
            els.silenceProgressHint.textContent = '将调用 TransWithAI 对选定时间段重新转写；加载模型时请耐心等待。可点取消或按 Esc 中止。';
        }
        await flushSilenceProgressPaint();

        let unsubProgress = null;
        try {
            unsubProgress = electron.onTransubRetranscribeProgress?.((progress) => {
                if (isJobAbortRequested()) return;
                const message = String(progress?.message || progress?.detail || '').trim();
                if (!message) return;
                const stage = String(progress?.stage || '');
                const isModel = stage === 'model' || /模型/.test(message);
                updateSilenceSplitProgress({
                    detail: message,
                    statusMessage: message,
                });
                if (els.silenceProgressTitle) {
                    if (isModel) els.silenceProgressTitle.textContent = '正在加载模型';
                    else if (stage === 'vad') els.silenceProgressTitle.textContent = '正在初始化语音检测';
                    else if (stage === 'extract' || stage === 'warmup') els.silenceProgressTitle.textContent = '正在准备音频';
                    else if (stage === 'transcribe') els.silenceProgressTitle.textContent = '正在识别语音';
                    else if (stage === 'save' || stage === 'done') els.silenceProgressTitle.textContent = '正在整理结果';
                    else els.silenceProgressTitle.textContent = progress?.warmLight ? '正在重转写（轻量）' : '正在重转写';
                }
                if (els.silenceProgressHint) {
                    if (isModel) {
                        els.silenceProgressHint.textContent = progress?.warmLight
                            ? '轻量模式：正在加载 Whisper 模型到显存/内存，首次或切换模型时较慢'
                            : '正在加载 Whisper 模型到显存/内存，首次或切换模型时可能需要数十秒';
                    } else if (stage === 'vad') {
                        els.silenceProgressHint.textContent = '正在初始化 VAD 语音活动检测…';
                    } else if (stage === 'starting') {
                        els.silenceProgressHint.textContent = '正在启动 TransWithAI 转写引擎…';
                    } else if (progress?.warmLight) {
                        els.silenceProgressHint.textContent = '轻量加速已开启（Beam=1）；如需更高精度请在设置中关闭「重转写加速」';
                    }
                }
            }) || null;

            const res = await electron.transubTranscribeRange({
                mediaPath: state.videoPath,
                startMs,
                endMs,
                padMs,
                ffmpegPath: cachedFfmpegPath,
                options: {
                    task: 'transcribe',
                    mergeSegments: false,
                    subFormats: 'srt',
                },
            });
            if (isJobAbortRequested() || res?.cancelled) {
                setStatus('重转写已取消', 'warn');
                return { ok: false, cancelled: true };
            }
            if (!res?.ok || !Array.isArray(res.cues) || !res.cues.length) {
                setStatus(res?.error || '重转写失败', 'err');
                return { ok: false };
            }

            const newCues = res.cues.map((c) => ({
                startMs: c.startMs,
                endMs: c.endMs,
                text: String(c.text || '').trim(),
            })).filter((c) => c.text);
            if (!newCues.length) {
                setStatus('重转写结果为空', 'err');
                return { ok: false };
            }

            recordUndoBeforeChange();
            let selectAt = 0;
            let replacedCount = 0;
            if (mode === 'cue' && state.selectedIndex >= 0) {
                const idx = state.selectedIndex;
                state.cues.splice(idx, 1, ...newCues);
                selectAt = idx;
                replacedCount = 1;
            } else {
                const result = metaCore.replaceCuesInTimeRange(state.cues, startMs, endMs, newCues);
                state.cues.splice(0, state.cues.length, ...result.cues);
                selectAt = result.insertAt;
                replacedCount = result.replaced;
            }
            maybeFixOverlapAfterSplit();

            let snappedCount = 0;
            if (snapAfter && electron?.ffmpegDetectSilence) {
                const indices = [];
                for (let i = 0; i < newCues.length; i += 1) {
                    const at = selectAt + i;
                    if (at >= 0 && at < state.cues.length) indices.push(at);
                }
                const silencePrefs = getSilenceSplitOpts({});
                showSilenceSplitProgress({
                    title: '正在按音频贴边',
                    detail: `重转写完成，正在贴边 ${indices.length} 条…`,
                    current: 0,
                    total: indices.length,
                    statusMessage: `贴边 0/${indices.length}…`,
                });
                if (els.silenceProgressHint) {
                    els.silenceProgressHint.textContent = '重转写后根据静音微调起止时间，文本保持不变';
                }
                await flushSilenceProgressPaint();
                for (let i = 0; i < indices.length; i += 1) {
                    updateSilenceSplitProgress({
                        current: i,
                        total: indices.length,
                        detail: `正在贴边第 ${i + 1}/${indices.length} 条…`,
                        statusMessage: `贴边 ${i + 1}/${indices.length}…`,
                    });
                    await flushSilenceProgressPaint();
                    const snapResult = await audioSnapCueAtIndex(indices[i], {
                        ...silencePrefs,
                        padMs: 400,
                        allowExtend: true,
                    });
                    if (snapResult.status === 'adjusted') snappedCount += 1;
                }
            }

            markRetranscribedMeta(selectAt, newCues.length);
            await persistCueMeta();

            state.selectedIndex = Math.min(Math.max(selectAt, 0), state.cues.length - 1);
            setDirty(true);
            renderCueList();
            const durSec = ((endMs - startMs) / 1000).toFixed(1);
            const snapHint = snapAfter
                ? `，贴边 ${snappedCount}/${newCues.length}`
                : '';
            setStatus(
                `已重转写 ${durSec}s：替换 ${replacedCount} 条 → ${newCues.length} 条${snapHint}`,
                'ok',
            );
            return { ok: true, newCount: newCues.length, replacedCount, snappedCount };
        } catch (err) {
            setStatus(err?.message || '重转写失败', 'err');
            return { ok: false };
        } finally {
            if (typeof unsubProgress === 'function') {
                try { unsubProgress(); } catch (_) { /* ignore */ }
            }
            state.retranscribeBusy = false;
            hideSilenceSplitProgress();
            if (els.silenceProgressHint) {
                els.silenceProgressHint.textContent = 'FFmpeg 正在分析关联视频的音频静音点，请勿关闭窗口';
            }
            updateRetranscribeTransportBtn();
        }
    }

    async function retranscribeSelectedCue() {
        if (state.selectedIndex < 0 || state.selectedIndex >= state.cues.length) {
            setStatus('请先选中一条字幕', 'err');
            return;
        }
        syncDetailToCue();
        const idx = state.selectedIndex;
        const cue = state.cues[idx];
        const prefs = loadRetranscribeDurPrefs();
        await runRetranscribeRange({
            startMs: cue.startMs,
            endMs: cueEndMs(cue),
            padMs: prefs.padMs ?? 350,
            mode: 'cue',
            snapAfter: prefs.snapAfter !== false,
            detail: `正在截取并转写第 ${idx + 1} 条字幕…`,
        });
    }

    function getSelectedRetranscribeDurStartMode() {
        return document.querySelector('input[name="editorRetranscribeDurStart"]:checked')?.value || 'selected';
    }

    function resolveRetranscribeDurWindow() {
        const durationSec = clampRetranscribeDurSec(els.retranscribeDurSec?.value);
        const padMs = Math.max(0, Math.min(2000, Math.round(Number(els.retranscribeDurPadMs?.value) || 350)));
        const startMode = getSelectedRetranscribeDurStartMode();
        let startMs = 0;
        if (startMode === 'playhead') {
            startMs = getPlaybackTimeMs();
        } else if (state.selectedIndex >= 0 && state.selectedIndex < state.cues.length) {
            startMs = state.cues[state.selectedIndex].startMs;
        } else {
            startMs = getPlaybackTimeMs();
        }
        const endMs = startMs + Math.round(durationSec * 1000);
        return { startMs, endMs, durationSec, padMs, startMode };
    }

    function updateRetranscribeDurModalState() {
        if (!els.retranscribeDurPreview) return;
        syncDetailToCue();
        if (!state.videoPath) {
            els.retranscribeDurPreview.textContent = '请先关联视频';
            els.retranscribeDurPreview.classList.add('err');
            return;
        }
        const startMode = getSelectedRetranscribeDurStartMode();
        if (startMode === 'selected'
            && (state.selectedIndex < 0 || state.selectedIndex >= state.cues.length)) {
            els.retranscribeDurPreview.textContent = '未选中字幕，将改用播放头作为起始';
            els.retranscribeDurPreview.classList.remove('err');
        }

        const win = resolveRetranscribeDurWindow();
        const overlap = metaCore.collectOverlappingCueIndices(state.cues, win.startMs, win.endMs);
        const startLabel = formatDisplayTime(win.startMs, state.format);
        const endLabel = formatDisplayTime(win.endMs, state.format);
        els.retranscribeDurPreview.textContent = overlap.length
            ? `${startLabel} → ${endLabel}（${win.durationSec}s），将替换重叠的 ${overlap.length} 条`
            : `${startLabel} → ${endLabel}（${win.durationSec}s），该区间暂无字幕，将插入新结果`;
        els.retranscribeDurPreview.classList.remove('err');

        document.querySelectorAll('[data-retranscribe-dur-preset]').forEach((btn) => {
            const v = Number(btn.getAttribute('data-retranscribe-dur-preset'));
            btn.classList.toggle('active', Math.abs(v - win.durationSec) < 0.01);
        });
    }

    function openRetranscribeDurModal() {
        if (!els.retranscribeDurModal) return;
        if (!state.videoPath) {
            setStatus('请先关联视频后再重转写', 'err');
            return;
        }
        syncDetailToCue();
        const prefs = loadRetranscribeDurPrefs();
        if (els.retranscribeDurSec) els.retranscribeDurSec.value = String(prefs.durationSec);
        if (els.retranscribeDurPadMs) els.retranscribeDurPadMs.value = String(prefs.padMs);
        if (els.retranscribeDurSnapAfter) els.retranscribeDurSnapAfter.checked = prefs.snapAfter !== false;
        const radio = document.querySelector(
            `input[name="editorRetranscribeDurStart"][value="${prefs.startMode}"]`,
        );
        if (radio) radio.checked = true;
        else {
            const fallback = document.querySelector('input[name="editorRetranscribeDurStart"][value="selected"]');
            if (fallback) fallback.checked = true;
        }
        showEditorModal(els.retranscribeDurModal, els.retranscribeDurConfirm);
        updateRetranscribeDurModalState();
    }

    function closeRetranscribeDurModal() {
        hideEditorModal(els.retranscribeDurModal);
    }

    async function confirmRetranscribeDur() {
        syncDetailToCue();
        const win = resolveRetranscribeDurWindow();
        if (!state.videoPath) {
            updateRetranscribeDurModalState();
            return;
        }
        const snapAfter = els.retranscribeDurSnapAfter?.checked !== false;
        saveRetranscribeDurPrefs({
            durationSec: win.durationSec,
            padMs: win.padMs,
            startMode: win.startMode,
            snapAfter,
        });
        closeRetranscribeDurModal();
        await runRetranscribeRange({
            startMs: win.startMs,
            endMs: win.endMs,
            padMs: win.padMs,
            mode: 'range',
            snapAfter,
            detail: `正在重转写 ${win.durationSec}s（${formatDisplayTime(win.startMs, state.format)} → ${formatDisplayTime(win.endMs, state.format)}）…`,
        });
    }

    function resolveRetranscribeAllWindow() {
        updateTimelineDuration();
        const padMs = Math.max(0, Math.min(2000, Math.round(Number(els.retranscribeDurPadMs?.value) || 350)));
        const startMs = 0;
        let endMs = state.timeline.durationMs;
        if (els.video && Number.isFinite(els.video.duration) && els.video.duration > 0) {
            endMs = Math.round(els.video.duration * 1000);
        } else if (state.cues.length) {
            endMs = Math.max(...state.cues.map((c) => cueEndMs(c)), startMs + 1000);
        }
        endMs = Math.max(endMs, startMs + 200);
        const durationSec = Math.round(((endMs - startMs) / 1000) * 10) / 10;
        return { startMs, endMs, durationSec, padMs };
    }

    async function confirmRetranscribeAll() {
        syncDetailToCue();
        if (!state.videoPath) {
            updateRetranscribeDurModalState();
            return;
        }
        const win = resolveRetranscribeAllWindow();
        if (win.endMs - win.startMs < 200) {
            setStatus('无法确定整段时长，请先加载视频', 'err');
            return;
        }
        const overlap = metaCore.collectOverlappingCueIndices(state.cues, win.startMs, win.endMs);
        const durLabel = win.durationSec >= 60
            ? `${Math.floor(win.durationSec / 60)}分${Math.round(win.durationSec % 60)}秒`
            : `${win.durationSec}s`;
        const ok = await editorConfirm(
            `确定全部重转写（约 ${durLabel}）？将替换时间窗内 ${overlap.length} 条重叠字幕，此操作可撤销。`,
        );
        if (!ok) return;

        const snapAfter = els.retranscribeDurSnapAfter?.checked !== false;
        const prefs = loadRetranscribeDurPrefs();
        saveRetranscribeDurPrefs({
            durationSec: prefs.durationSec,
            padMs: win.padMs,
            startMode: prefs.startMode,
            snapAfter,
        });
        closeRetranscribeDurModal();
        await runRetranscribeRange({
            startMs: win.startMs,
            endMs: win.endMs,
            padMs: win.padMs,
            mode: 'range',
            snapAfter,
            detail: `正在全部重转写 ${win.durationSec}s（${formatDisplayTime(win.startMs, state.format)} → ${formatDisplayTime(win.endMs, state.format)}）…`,
        });
    }

    function applySplitResult(idx, newCues, opts = {}) {
        if (!newCues?.length) return;
        recordUndoBeforeChange();
        state.cues.splice(idx, 1, ...newCues);
        const fixOverlap = typeof opts.fixOverlap === 'boolean'
            ? opts.fixOverlap
            : (els.splitFixOverlap?.checked !== false);
        if (fixOverlap) {
            maybeFixOverlapAfterSplit();
        }
        state.selectedIndex = idx;
        setDirty(true);
        renderCueList();
        selectCue(idx, { scroll: true });
        const stats = splitCore.summarizeSplitCues(newCues);
        const cpsHint = stats.cpsMin != null
            ? ` · CPS ${stats.cpsMin.toFixed(1)}–${stats.cpsMax.toFixed(1)}`
            : '';
        setStatus(`已分割为 ${newCues.length} 条字幕${cpsHint}`, 'ok');
    }

    function getSelectedSplitMode() {
        return document.querySelector('input[name="editorSplitMode"]:checked')?.value || 'smart';
    }

    function formatSplitPreview(result) {
        if (result.error) return { text: result.error, isErr: true };
        const stats = splitCore.summarizeSplitCues(result.cues);
        if (stats.count < 2) return { text: '无法拆成多条', isErr: true };
        const cpsPart = stats.cpsMin != null
            ? ` · 预估 CPS ${stats.cpsMin.toFixed(1)}–${stats.cpsMax.toFixed(1)}`
            : '';
        return {
            text: `将拆成 ${stats.count} 条${cpsPart}`,
            isErr: false,
        };
    }

    function updateSplitModalState() {
        const mode = getSelectedSplitMode();
        if (els.splitCharCount) els.splitCharCount.disabled = mode !== 'chars';
        if (els.splitCount) els.splitCount.disabled = mode !== 'count';
        document.querySelectorAll('.split-smart-extra input').forEach((el) => {
            el.disabled = mode !== 'smart';
        });
        document.querySelectorAll('.split-silence-extra input').forEach((el) => {
            el.disabled = mode !== 'silence';
        });
        if (els.splitUseCps) {
            els.splitUseCps.disabled = mode === 'silence' || mode === 'playhead' || mode === 'count';
        }

        if (state.selectedIndex < 0) {
            if (els.splitPreview) {
                els.splitPreview.textContent = '—';
                els.splitPreview.classList.remove('err');
            }
            return;
        }

        syncDetailToCue();
        const cue = state.cues[state.selectedIndex];
        const end = cueEndMs(cue);
        let hint = '';

        if (els.splitHint) {
            if (mode === 'cursor' && els.detailText) {
                const pos = els.detailText.selectionStart;
                const text = cue.text || '';
                if (pos <= 0 || pos >= text.length) hint = '提示：在文本框中将光标置于要分割的位置';
            } else if (mode === 'playhead' && els.video) {
                const t = getPlaybackTimeMs();
                if (t <= cue.startMs || t >= end) hint = '提示：播放头需位于当前字幕的起止时间之间';
            } else if (mode === 'lines' && !String(cue.text || '').includes('\n')) {
                hint = '提示：当前文本无换行，建议选择其他方式';
            } else if (mode === 'spaces' && !/\s/.test(String(cue.text || ''))) {
                hint = '提示：当前文本无空格，建议选择其他方式';
            } else if (mode === 'smart') {
                const preview = computeSplitParts('smart', cue, {
                    ...readSingleSplitOptions(),
                    fixOverlap: false,
                });
                if (preview.error) hint = preview.error;
            } else if (mode === 'silence') {
                if (!state.videoPath) {
                    hint = '提示：请先点击顶栏「关联视频」';
                } else if (!electron?.ffmpegDetectSilence) {
                    hint = '提示：当前环境不支持静音分析';
                } else {
                    const silenceConnectedErr = connectedTextSplitError('silence', cue.text || '');
                    if (silenceConnectedErr) hint = silenceConnectedErr;
                }
            }

            if (hint) {
                els.splitHint.textContent = hint;
                els.splitHint.classList.remove('hidden');
            } else {
                els.splitHint.textContent = '';
                els.splitHint.classList.add('hidden');
            }
        }

        if (els.splitPreview && state.selectedIndex >= 0) {
            if (mode === 'silence') {
                if (!state.videoPath) {
                    els.splitPreview.textContent = '需关联视频后才能按静音切分';
                    els.splitPreview.classList.add('err');
                } else {
                    const silenceConnectedErr = connectedTextSplitError('silence', cue.text || '');
                    if (silenceConnectedErr) {
                        els.splitPreview.textContent = silenceConnectedErr;
                        els.splitPreview.classList.add('err');
                    } else {
                        els.splitPreview.textContent = '执行时将分析该时间段内的静音点，并结合空格/断句词/标点分配文本';
                        els.splitPreview.classList.remove('err');
                    }
                }
            } else {
                const preview = computeSplitParts(mode, cue, readSingleSplitOptions());
                const formatted = formatSplitPreview(preview);
                els.splitPreview.textContent = formatted.text;
                els.splitPreview.classList.toggle('err', formatted.isErr);
            }
        }
    }

    function openSplitModal() {
        if (state.selectedIndex < 0) return;
        syncDetailToCue();
        const cue = state.cues[state.selectedIndex];
        if (!String(cue.text || '').trim()) {
            setStatus('当前字幕无文本，无法分割', 'err');
            return;
        }
        if (els.splitModal) {
            applySplitPrefsToModal();
            showEditorModal(els.splitModal, els.splitConfirm);
            updateSplitModalState();
        }
    }

    function closeSplitModal() {
        hideEditorModal(els.splitModal);
    }

    async function confirmSplit() {
        if (state.selectedIndex < 0) return;
        syncDetailToCue();
        const idx = state.selectedIndex;
        const cue = state.cues[idx];
        const mode = getSelectedSplitMode();
        const splitOpts = {
            ...readSingleSplitOptions(),
            charCount: Number(els.splitCharCount?.value) || 20,
            count: Number(els.splitCount?.value) || 2,
        };

        if (mode === 'silence') {
            try {
                const outcome = await quickSilenceSplitSelectedCue(splitOpts);
                if (!outcome?.ok) {
                    if (els.splitHint && outcome?.error) {
                        els.splitHint.textContent = outcome.error;
                        els.splitHint.classList.remove('hidden');
                    }
                    return;
                }
                saveSplitPrefs();
                closeSplitModal();
            } finally {
                if (els.splitConfirm) els.splitConfirm.disabled = false;
            }
            return;
        }

        const result = computeSplitParts(mode, cue, splitOpts);
        if (result.error) {
            if (els.splitHint) {
                els.splitHint.textContent = result.error;
                els.splitHint.classList.remove('hidden');
            } else {
                setStatus(result.error, 'err');
            }
            return;
        }
        saveSplitPrefs();
        closeSplitModal();
        applySplitResult(idx, result.cues, splitOpts);
    }

    function collectFindMatches() {
        syncDetailToCue();
        const query = String(els.findInput?.value ?? '');
        if (!query) {
            state.find.active = false;
            state.find.matches = [];
            state.find.currentIndex = -1;
            return;
        }
        state.find.active = true;
        const caseSensitive = !!els.findCase?.checked;
        const re = buildFindRegex(query, caseSensitive);
        const matches = [];
        state.cues.forEach((cue, cueIdx) => {
            const text = cue.text ?? '';
            let m;
            while ((m = re.exec(text)) !== null) {
                matches.push({ cueIdx, start: m.index, end: m.index + m[0].length });
                if (m[0].length === 0) re.lastIndex += 1;
            }
        });
        state.find.matches = matches;
        if (!matches.length) state.find.currentIndex = -1;
        else if (state.find.currentIndex < 0 || state.find.currentIndex >= matches.length) {
            state.find.currentIndex = 0;
        }
    }

    function updateFindStatus(message) {
        if (!els.findStatus) return;
        if (message) {
            els.findStatus.textContent = message;
            els.findStatus.classList.toggle('err', message.includes('未找到') || message.includes('请输入'));
            return;
        }
        const total = state.find.matches.length;
        if (!String(els.findInput?.value ?? '').trim()) {
            els.findStatus.textContent = '—';
            els.findStatus.classList.remove('err');
            return;
        }
        if (!total) {
            els.findStatus.textContent = '未找到匹配项';
            els.findStatus.classList.add('err');
            return;
        }
        els.findStatus.textContent = `第 ${state.find.currentIndex + 1} / ${total} 处 · 涉及 ${new Set(state.find.matches.map((m) => m.cueIdx)).size} 条字幕`;
        els.findStatus.classList.remove('err');
    }

    function goToFindMatch(index) {
        if (!state.find.matches.length) return;
        const total = state.find.matches.length;
        const idx = ((index % total) + total) % total;
        state.find.currentIndex = idx;
        const m = state.find.matches[idx];
        selectCue(m.cueIdx, { scroll: true });
        requestAnimationFrame(() => {
            if (!els.detailText) return;
            els.detailText.focus();
            els.detailText.setSelectionRange(m.start, m.end);
        });
        updateListRowClasses();
        updateFindStatus();
    }

    function runFindSearch(options = {}) {
        const query = String(els.findInput?.value ?? '').trim();
        if (!query) {
            state.find.active = false;
            state.find.matches = [];
            state.find.currentIndex = -1;
            if (state.listFilter === 'find') renderCueList();
            else updateListRowClasses();
            updateFindStatus('请输入要查找的内容');
            return false;
        }
        const prevQuery = state.find._lastQuery;
        const prevCase = state.find._lastCase;
        const caseSensitive = !!els.findCase?.checked;
        collectFindMatches();
        state.find._lastQuery = query;
        state.find._lastCase = caseSensitive;

        if (!state.find.matches.length) {
            if (state.listFilter === 'find') renderCueList();
            else updateListRowClasses();
            updateFindStatus('未找到匹配项');
            return false;
        }

        if (options.keepIndex && prevQuery === query && prevCase === caseSensitive && state.find.currentIndex >= 0) {
            // keep current index
        } else if (options.startIndex != null) {
            state.find.currentIndex = Math.max(0, Math.min(options.startIndex, state.find.matches.length - 1));
        } else {
            state.find.currentIndex = 0;
        }

        if (state.listFilter === 'find') renderCueList();
        if (options.navigate !== false) goToFindMatch(state.find.currentIndex);
        else {
            updateListRowClasses();
            updateFindStatus();
        }
        return true;
    }

    function findNextMatch() {
        if (!String(els.findInput?.value ?? '').trim()) {
            updateFindStatus('请输入要查找的内容');
            return;
        }
        if (!state.find.matches.length) {
            if (!runFindSearch({ navigate: false })) return;
        }
        goToFindMatch(state.find.currentIndex + 1);
    }

    function findPrevMatch() {
        if (!String(els.findInput?.value ?? '').trim()) {
            updateFindStatus('请输入要查找的内容');
            return;
        }
        if (!state.find.matches.length) {
            if (!runFindSearch({ navigate: false })) return;
        }
        goToFindMatch(state.find.currentIndex - 1);
    }

    function replaceCurrentMatch() {
        if (!state.find.matches.length) {
            if (!runFindSearch()) return;
            if (!state.find.matches.length) return;
        }
        const m = state.find.matches[state.find.currentIndex];
        if (!m) return;
        syncDetailToCue();
        recordUndoBeforeChange();
        const cue = state.cues[m.cueIdx];
        const text = cue.text ?? '';
        const replacement = els.replaceInput?.value ?? '';
        cue.text = text.slice(0, m.start) + replacement + text.slice(m.end);
        setDirty(true);
        refreshListRow(m.cueIdx);
        if (state.selectedIndex === m.cueIdx && els.detailText) {
            els.detailText.value = cue.text;
        }
        const nextIndex = state.find.currentIndex;
        collectFindMatches();
        if (state.find.matches.length) {
            goToFindMatch(Math.min(nextIndex, state.find.matches.length - 1));
        } else {
            updateListRowClasses();
            updateFindStatus('已成功替换 1 处');
        }
        setStatus('已成功替换 1 处', 'ok');
    }

    function replaceAllMatches() {
        const query = String(els.findInput?.value ?? '').trim();
        if (!query) {
            updateFindStatus('请输入要查找的内容');
            return;
        }
        syncDetailToCue();
        recordUndoBeforeChange();
        const caseSensitive = !!els.findCase?.checked;
        const re = buildFindRegex(query, caseSensitive);
        const replacement = els.replaceInput?.value ?? '';
        let count = 0;
        for (const cue of state.cues) {
            const text = cue.text ?? '';
            const newText = text.replace(re, () => {
                count += 1;
                return replacement;
            });
            if (newText !== text) cue.text = newText;
        }
        if (!count) {
            updateFindStatus('未找到匹配项');
            return;
        }
        setDirty(true);
        renderCueList();
        // Refresh match list after replace, but don't treat "0 remaining" as a failed search
        collectFindMatches();
        state.find.currentIndex = state.find.matches.length ? 0 : -1;
        if (state.listFilter === 'find') renderCueList();
        else updateListRowClasses();
        const msg = `已成功替换 ${count} 处`;
        updateFindStatus(msg);
        setStatus(msg, 'ok');
    }

    function openFindReplaceModal(focusReplace = false) {
        if (els.findReplaceModal) {
            showEditorModal(
                els.findReplaceModal,
                focusReplace ? els.replaceInput : els.findInput
            );
            const sel = els.detailText
                && document.activeElement === els.detailText
                && els.detailText.selectionStart !== els.detailText.selectionEnd
                ? els.detailText.value.slice(els.detailText.selectionStart, els.detailText.selectionEnd)
                : '';
            if (sel && els.findInput && !els.findInput.value) els.findInput.value = sel;
            requestAnimationFrame(() => {
                const input = focusReplace ? els.replaceInput : els.findInput;
                input?.focus();
                input?.select?.();
            });
            if (String(els.findInput?.value ?? '').trim()) runFindSearch({ navigate: false });
            else updateFindStatus();
        }
    }

    function closeFindReplaceModal() {
        hideEditorModal(els.findReplaceModal);
        state.find.active = false;
        state.find.matches = [];
        state.find.currentIndex = -1;
        updateListRowClasses();
    }

    function getSelectedBatchDurMode() {
        return document.querySelector('input[name="editorBatchDurMode"]:checked')?.value || 'fixed';
    }

    function getSelectedBatchDurCondition() {
        return document.querySelector('input[name="editorBatchDurCond"]:checked')?.value || 'all';
    }

    function readBatchDurOptions() {
        const condition = getSelectedBatchDurCondition();
        const mode = getSelectedBatchDurMode();
        return {
            mode,
            condition,
            targetSec: Number(els.batchDurTarget?.value) || 2,
            silenceDb: Number(els.batchDurSilenceDb?.value) || -35,
            silenceDur: Number(els.batchDurSilenceDur?.value) || 0.25,
            snapPadMs: Math.max(0, Math.min(2000, Math.round(Number(els.batchDurSnapPadMs?.value) || 400))),
            shorterSec: Number(els.batchDurShorter?.value) || 1,
            longerSec: Number(els.batchDurLonger?.value) || 5,
            minSec: Number(els.batchDurMin?.value) || 0.5,
            maxSec: Number(els.batchDurMax?.value) || 10,
            cpsAbove: Number(els.batchDurCpsAbove?.value) || 20,
            cpsBelow: Number(els.batchDurCpsBelow?.value) || 8,
            textKeyword: String(els.batchDurText?.value ?? '').trim(),
            avoidOverlap: !!els.batchDurAvoidOverlap?.checked,
        };
    }

    function getCueCpsValue(cue) {
        const durSec = cueDurationMs(cue) / 1000;
        if (durSec <= 0) return null;
        const chars = textCharCount(cue.text);
        if (!chars) return null;
        return chars / durSec;
    }

    function cueHasTimingOverlap(idx) {
        const cue = state.cues[idx];
        if (!cue) return false;
        const prev = idx > 0 ? state.cues[idx - 1] : null;
        const next = idx < state.cues.length - 1 ? state.cues[idx + 1] : null;
        const end = cueEndMs(cue);
        if (prev && cue.startMs < cueEndMs(prev)) return true;
        if (next && end > next.startMs) return true;
        return false;
    }

    function matchesBatchDurCondition(cue, idx, opts) {
        const durSec = cueDurationMs(cue) / 1000;
        switch (opts.condition) {
            case 'all':
                return true;
            case 'shorter':
                return durSec < opts.shorterSec;
            case 'longer':
                return durSec > opts.longerSec;
            case 'between':
                return durSec >= Math.min(opts.minSec, opts.maxSec)
                    && durSec <= Math.max(opts.minSec, opts.maxSec);
            case 'cps_above': {
                const cps = getCueCpsValue(cue);
                return cps != null && cps > opts.cpsAbove;
            }
            case 'cps_below': {
                const cps = getCueCpsValue(cue);
                return cps != null && cps < opts.cpsBelow;
            }
            case 'text_contains':
                return opts.textKeyword
                    ? String(cue.text ?? '').includes(opts.textKeyword)
                    : false;
            case 'overlap':
                return cueHasTimingOverlap(idx);
            case 'selected':
                return getSelectedCueIndexes().includes(idx)
                    || idx === state.selectedIndex;
            default:
                return false;
        }
    }

    function clampSilenceAdjustedEnd(cue, idx, newEndMs, avoidOverlap = true) {
        const gapMs = 1;
        const minDurMs = 500;
        let newEnd = Math.round(Number(newEndMs) || 0);
        if (avoidOverlap && idx < state.cues.length - 1) {
            newEnd = Math.min(newEnd, state.cues[idx + 1].startMs - gapMs);
        }
        return Math.max(cue.startMs + minDurMs, newEnd);
    }

    async function silenceAdjustCueAtIndex(idx, opts = {}) {
        const cue = state.cues[idx];
        if (!cue || !canSilenceAdjustDurationCue(cue)) {
            return { status: 'skipped', reason: '时长过短' };
        }
        const result = await computeSilenceAdjustedEndMs(cue, { ...opts, cueIndex: idx });
        if (result.cancelled || isJobAbortRequested()) {
            return { status: 'skipped', cancelled: true, reason: '已取消' };
        }
        if (result.error) {
            return {
                status: result.unchanged ? 'unchanged' : 'skipped',
                reason: result.error,
            };
        }
        const newEnd = clampSilenceAdjustedEnd(cue, idx, result.newEndMs, opts.avoidOverlap);
        const oldEnd = cueEndMs(cue);
        const deltaMs = newEnd - oldEnd;
        if (Math.abs(deltaMs) < 80) {
            return { status: 'unchanged' };
        }
        cue.endMs = newEnd;
        return {
            status: 'adjusted',
            deltaMs,
            savedMs: oldEnd - newEnd,
            extendedMs: deltaMs > 0 ? deltaMs : 0,
        };
    }

    async function audioSnapCueAtIndex(idx, opts = {}) {
        const cue = state.cues[idx];
        if (!cue || !canAudioSnapCue(cue)) {
            return { status: 'skipped', reason: '时长过短' };
        }
        const result = await computeAudioSnappedCueTiming(cue, idx, opts);
        if (result.cancelled || isJobAbortRequested()) {
            return { status: 'skipped', cancelled: true, reason: '已取消' };
        }
        if (result.error) {
            return {
                status: result.unchanged ? 'unchanged' : 'skipped',
                reason: result.error,
            };
        }
        cue.startMs = result.startMs;
        cue.endMs = result.endMs;
        return {
            status: 'adjusted',
            startDelta: result.startDelta || 0,
            endDelta: result.endDelta || 0,
        };
    }

    function collectBatchDurMatches(opts) {
        syncDetailToCue();
        const indices = [];
        state.cues.forEach((cue, idx) => {
            if (!matchesBatchDurCondition(cue, idx, opts)) return;
            if (opts.mode === 'silence' && !canSilenceAdjustDurationCue(cue)) return;
            if (opts.mode === 'audio_snap' && !canAudioSnapCue(cue)) return;
            indices.push(idx);
        });
        return indices;
    }

    function updateBatchDurModalState() {
        const cond = getSelectedBatchDurCondition();
        const mode = getSelectedBatchDurMode();
        const isSilence = mode === 'silence';
        const isAudioSnap = mode === 'audio_snap';
        const usesSilenceUi = isSilence || isAudioSnap;

        if (els.batchDurHint) {
            if (isAudioSnap) {
                els.batchDurHint.textContent = '按条件筛选后，将起止时间贴到语音边界（保留原文）。';
            } else if (isSilence) {
                els.batchDurHint.textContent = '按条件筛选后，按实际语音边界缩短或延长结束时间（保持起始不变）。';
            } else {
                els.batchDurHint.textContent = '按条件筛选字幕后批量调整结束时间（保持起始时间不变）。';
            }
        }
        if (els.batchDurFixedWrap) {
            els.batchDurFixedWrap.classList.toggle('hidden', usesSilenceUi);
        }
        if (els.batchDurSilenceWrap) {
            els.batchDurSilenceWrap.classList.toggle('hidden', !usesSilenceUi);
        }
        if (els.batchDurSnapPadWrap) {
            els.batchDurSnapPadWrap.classList.toggle('hidden', !isAudioSnap);
        }
        if (els.batchDurAvoidOverlapRow) {
            els.batchDurAvoidOverlapRow.classList.toggle('hidden', isAudioSnap);
        }
        if (els.batchDurTarget) els.batchDurTarget.disabled = usesSilenceUi;
        if (els.batchDurSilenceDb) els.batchDurSilenceDb.disabled = !usesSilenceUi;
        if (els.batchDurSilenceDur) els.batchDurSilenceDur.disabled = !usesSilenceUi;
        if (els.batchDurSnapPadMs) els.batchDurSnapPadMs.disabled = !isAudioSnap;

        if (els.batchDurShorter) els.batchDurShorter.disabled = cond !== 'shorter';
        if (els.batchDurLonger) els.batchDurLonger.disabled = cond !== 'longer';
        if (els.batchDurMin) els.batchDurMin.disabled = cond !== 'between';
        if (els.batchDurMax) els.batchDurMax.disabled = cond !== 'between';
        if (els.batchDurCpsAbove) els.batchDurCpsAbove.disabled = cond !== 'cps_above';
        if (els.batchDurCpsBelow) els.batchDurCpsBelow.disabled = cond !== 'cps_below';
        if (els.batchDurText) els.batchDurText.disabled = cond !== 'text_contains';

        if (!els.batchDurPreview) return;
        const opts = readBatchDurOptions();

        if (opts.mode === 'silence' || opts.mode === 'audio_snap') {
            if (!state.videoPath || !electron?.ffmpegDetectSilence) {
                els.batchDurPreview.textContent = opts.mode === 'audio_snap'
                    ? '请先关联视频后再使用按音频贴边'
                    : '请先关联视频后再使用按静音智能时长';
                els.batchDurPreview.classList.add('err');
                return;
            }
            if (opts.condition === 'text_contains' && !opts.textKeyword) {
                els.batchDurPreview.textContent = '请输入文本关键词';
                els.batchDurPreview.classList.add('err');
                return;
            }
            if (opts.condition === 'selected' && state.selectedIndex < 0) {
                els.batchDurPreview.textContent = '当前没有选中的字幕条目';
                els.batchDurPreview.classList.add('err');
                return;
            }
            const matches = collectBatchDurMatches(opts);
            if (!matches.length) {
                els.batchDurPreview.textContent = '没有符合条件的字幕';
                els.batchDurPreview.classList.add('err');
                return;
            }
            els.batchDurPreview.textContent = opts.mode === 'audio_snap'
                ? `将对 ${matches.length} 条字幕逐条分析静音并贴边起止（执行时将显示进度）`
                : `将对 ${matches.length} 条字幕逐条分析静音并缩短/延长时长（执行时将显示进度）`;
            els.batchDurPreview.classList.remove('err');
            return;
        }

        if (opts.targetSec <= 0 || !Number.isFinite(opts.targetSec)) {
            els.batchDurPreview.textContent = '请输入有效的目标时长';
            els.batchDurPreview.classList.add('err');
            return;
        }
        if (opts.condition === 'text_contains' && !opts.textKeyword) {
            els.batchDurPreview.textContent = '请输入文本关键词';
            els.batchDurPreview.classList.add('err');
            return;
        }
        if (opts.condition === 'selected' && state.selectedIndex < 0) {
            els.batchDurPreview.textContent = '当前没有选中的字幕条目';
            els.batchDurPreview.classList.add('err');
            return;
        }
        const matches = collectBatchDurMatches(opts);
        if (!matches.length) {
            els.batchDurPreview.textContent = '没有符合条件的字幕';
            els.batchDurPreview.classList.add('err');
            return;
        }
        els.batchDurPreview.textContent = `将调整 ${matches.length} 条字幕为 ${opts.targetSec.toFixed(2)} 秒`;
        els.batchDurPreview.classList.remove('err');
    }

    function applyBatchDurSplitPrefs() {
        const prefs = loadSplitPrefs();
        if (els.batchDurSilenceDb) els.batchDurSilenceDb.value = String(prefs.silenceDb);
        if (els.batchDurSilenceDur) els.batchDurSilenceDur.value = String(prefs.silenceDur);
    }

    function openBatchDurModal() {
        if (!els.batchDurModal) return;
        syncDetailToCue();
        applyBatchDurSplitPrefs();
        showEditorModal(els.batchDurModal, els.batchDurTarget);
        updateBatchDurModalState();
    }

    function openBatchAudioSnapModal() {
        if (!state.videoPath || !electron?.ffmpegDetectSilence) {
            setStatus('请先关联视频后再使用按音频贴边', 'err');
            return;
        }
        const radio = document.querySelector('input[name="editorBatchDurMode"][value="audio_snap"]');
        if (radio) radio.checked = true;
        openBatchDurModal();
    }

    function closeBatchDurModal() {
        hideEditorModal(els.batchDurModal);
    }

    function confirmBatchDurAdjust() {
        const opts = readBatchDurOptions();
        if (opts.mode === 'silence') {
            confirmBatchSilenceDurAdjust(opts);
            return;
        }
        if (opts.mode === 'audio_snap') {
            void confirmBatchAudioSnapAdjust(opts);
            return;
        }
        if (opts.targetSec <= 0 || !Number.isFinite(opts.targetSec)) {
            updateBatchDurModalState();
            return;
        }
        if (opts.condition === 'text_contains' && !opts.textKeyword) {
            updateBatchDurModalState();
            return;
        }
        const indices = collectBatchDurMatches(opts);
        if (!indices.length) {
            updateBatchDurModalState();
            return;
        }
        recordUndoBeforeChange();
        const targetMs = Math.round(opts.targetSec * 1000);
        let adjusted = 0;
        for (const idx of indices) {
            const cue = state.cues[idx];
            let endMs = cue.startMs + targetMs;
            if (opts.avoidOverlap && idx < state.cues.length - 1) {
                endMs = Math.min(endMs, state.cues[idx + 1].startMs - 1);
            }
            endMs = Math.max(cue.startMs + 100, endMs);
            if (endMs !== cueEndMs(cue)) adjusted += 1;
            cue.endMs = endMs;
        }
        setDirty(true);
        renderCueList();
        if (state.selectedIndex >= 0) renderDetailPane();
        closeBatchDurModal();
        setStatus(`已批量调整 ${adjusted || indices.length} 条字幕时长为 ${opts.targetSec.toFixed(2)} 秒`, 'ok');
    }

    async function confirmBatchSilenceDurAdjust(opts) {
        if (state.silenceSplitBusy) return;
        if (!state.videoPath || !electron?.ffmpegDetectSilence) {
            updateBatchDurModalState();
            return;
        }
        if (opts.condition === 'text_contains' && !opts.textKeyword) {
            updateBatchDurModalState();
            return;
        }
        const indices = collectBatchDurMatches(opts);
        if (!indices.length) {
            updateBatchDurModalState();
            return;
        }

        const silenceOpts = {
            silenceDb: opts.silenceDb,
            silenceDur: opts.silenceDur,
            avoidOverlap: opts.avoidOverlap,
        };
        const total = indices.length;

        recordUndoBeforeChange();
        let adjusted = 0;
        let skipped = 0;
        let unchanged = 0;

        setSilenceSplitBusy(true);
        showSilenceSplitProgress({
            title: '正在批量调节时长',
            detail: `准备分析 ${total} 条字幕的实际语音时长…`,
            current: 0,
            total,
            statusMessage: `正在批量分析静音（0/${total}）…`,
        });
        await flushSilenceProgressPaint();

        let aborted = false;
        try {
            for (let i = 0; i < indices.length; i += 1) {
                if (isJobAbortRequested()) {
                    aborted = true;
                    break;
                }
                const idx = indices[i];
                updateSilenceSplitProgress({
                    current: i,
                    total,
                    detail: `正在分析第 ${i + 1}/${total} 条（原序号 ${idx + 1}）…`,
                    statusMessage: `正在分析静音 ${i + 1}/${total}…`,
                });
                await flushSilenceProgressPaint();

                const result = await silenceAdjustCueAtIndex(idx, silenceOpts);
                if (isJobAbortRequested() || result?.cancelled) {
                    aborted = true;
                    break;
                }
                if (result.status === 'adjusted') {
                    adjusted += 1;
                    refreshListRow(idx);
                } else if (result.status === 'unchanged') {
                    unchanged += 1;
                } else {
                    skipped += 1;
                }

                let detailLine = `第 ${i + 1}/${total} 条${result.status === 'unchanged' ? '无需调整' : '已跳过'}`;
                if (result.status === 'adjusted') {
                    const delta = Number(result.deltaMs) || -Number(result.savedMs) || 0;
                    const verb = delta < 0 ? '缩短' : '延长';
                    detailLine = `第 ${i + 1}/${total} 条已${verb} ${(Math.abs(delta) / 1000).toFixed(2)} 秒`;
                }
                updateSilenceSplitProgress({
                    current: i + 1,
                    total,
                    detail: detailLine,
                    statusMessage: `正在分析静音 ${i + 1}/${total}…`,
                });
            }
        } finally {
            setSilenceSplitBusy(false);
            hideSilenceSplitProgress();
        }

        if (aborted) {
            if (adjusted) {
                setDirty(true);
                renderCueList();
                if (state.selectedIndex >= 0) renderDetailPane();
            }
            closeBatchDurModal();
            setStatus(`已取消批量调节（已处理 ${adjusted} 条）`, 'warn');
            return;
        }

        if (!adjusted) {
            updateBatchDurModalState();
            const skipHint = skipped ? `，跳过 ${skipped} 条` : '';
            const unchangedHint = unchanged ? `，${unchanged} 条已接近实际语音` : '';
            setStatus(`已分析 ${total} 条，均无需调整时长${unchangedHint}${skipHint}`, 'err');
            resyncPlaybackAfterCueTimingChange();
            return;
        }

        setDirty(true);
        renderCueList();
        if (state.selectedIndex >= 0) renderDetailPane();
        closeBatchDurModal();
        const skipHint = skipped ? `，跳过 ${skipped} 条` : '';
        const unchangedHint = unchanged ? `，${unchanged} 条无需调整` : '';
        setStatus(`已按静音批量调节 ${adjusted} 条字幕时长${unchangedHint}${skipHint}`, 'ok');
    }

    async function confirmBatchAudioSnapAdjust(opts) {
        if (state.silenceSplitBusy || state.retranscribeBusy) return;
        if (!state.videoPath || !electron?.ffmpegDetectSilence) {
            updateBatchDurModalState();
            return;
        }
        if (opts.condition === 'text_contains' && !opts.textKeyword) {
            updateBatchDurModalState();
            return;
        }
        const indices = collectBatchDurMatches(opts);
        if (!indices.length) {
            updateBatchDurModalState();
            return;
        }

        const snapOpts = {
            silenceDb: opts.silenceDb,
            silenceDur: opts.silenceDur,
            padMs: opts.snapPadMs ?? 400,
            allowExtend: true,
        };
        const total = indices.length;

        recordUndoBeforeChange();
        let adjusted = 0;
        let skipped = 0;
        let unchanged = 0;

        setSilenceSplitBusy(true);
        showSilenceSplitProgress({
            title: '正在批量按音频贴边',
            detail: `准备分析 ${total} 条字幕的语音边界…`,
            current: 0,
            total,
            statusMessage: `正在批量贴边（0/${total}）…`,
        });
        if (els.silenceProgressHint) {
            els.silenceProgressHint.textContent = '根据静音检测将字幕起止贴到语音边界，文本保持不变';
        }
        await flushSilenceProgressPaint();

        let aborted = false;
        try {
            for (let i = 0; i < indices.length; i += 1) {
                if (isJobAbortRequested()) {
                    aborted = true;
                    break;
                }
                const idx = indices[i];
                updateSilenceSplitProgress({
                    current: i,
                    total,
                    detail: `正在贴边第 ${i + 1}/${total} 条（原序号 ${idx + 1}）…`,
                    statusMessage: `正在贴边 ${i + 1}/${total}…`,
                });
                await flushSilenceProgressPaint();

                const result = await audioSnapCueAtIndex(idx, snapOpts);
                if (isJobAbortRequested() || result?.cancelled) {
                    aborted = true;
                    break;
                }
                if (result.status === 'adjusted') {
                    adjusted += 1;
                    refreshListRow(idx);
                } else if (result.status === 'unchanged') {
                    unchanged += 1;
                } else {
                    skipped += 1;
                }

                updateSilenceSplitProgress({
                    current: i + 1,
                    total,
                    detail: result.status === 'adjusted'
                        ? `第 ${i + 1}/${total} 条已贴边`
                        : `第 ${i + 1}/${total} 条${result.status === 'unchanged' ? '无需调整' : '已跳过'}`,
                    statusMessage: `正在贴边 ${i + 1}/${total}…`,
                });
            }
        } finally {
            setSilenceSplitBusy(false);
            hideSilenceSplitProgress();
            if (els.silenceProgressHint) {
                els.silenceProgressHint.textContent = 'FFmpeg 正在分析关联视频的音频静音点，请勿关闭窗口';
            }
        }

        if (aborted) {
            if (adjusted) {
                setDirty(true);
                renderCueList();
                if (state.selectedIndex >= 0) renderDetailPane();
            }
            closeBatchDurModal();
            setStatus(`已取消批量贴边（已处理 ${adjusted} 条）`, 'warn');
            return;
        }

        if (!adjusted) {
            updateBatchDurModalState();
            const skipHint = skipped ? `，跳过 ${skipped} 条` : '';
            const unchangedHint = unchanged ? `，${unchanged} 条已贴近语音` : '';
            setStatus(`已分析 ${total} 条，均未调整时间轴${unchangedHint}${skipHint}`, 'err');
            resyncPlaybackAfterCueTimingChange();
            return;
        }

        setDirty(true);
        renderCueList();
        if (state.selectedIndex >= 0) renderDetailPane();
        closeBatchDurModal();
        const skipHint = skipped ? `，跳过 ${skipped} 条` : '';
        const unchangedHint = unchanged ? `，${unchanged} 条无需调整` : '';
        setStatus(`已按音频贴边 ${adjusted} 条字幕${unchangedHint}${skipHint}`, 'ok');
        resyncPlaybackAfterCueTimingChange();
    }

    function getSelectedSmartSplitCondition() {
        return document.querySelector('input[name="editorSmartSplitCond"]:checked')?.value || 'cps_above';
    }

    function readSmartSplitOptions() {
        return {
            condition: getSelectedSmartSplitCondition(),
            smartMaxChars: Number(els.smartSplitMaxChars?.value) || 20,
            smartLineChars: Number(els.smartSplitLineChars?.value) || 18,
            cpsAbove: Number(els.smartSplitCpsAbove?.value) || 18,
            lineLen: Number(els.smartSplitLineLen?.value) || 18,
            durLongSec: Number(els.smartSplitDurLong?.value) || 6,
            charsLong: Number(els.smartSplitCharsLong?.value) || 24,
            useCps: els.smartSplitUseCps?.checked !== false,
            fixOverlap: els.smartSplitFixOverlap?.checked !== false,
        };
    }

    function matchesSmartSplitCondition(cue, idx, opts) {
        const text = String(cue.text || '').trim();
        if (!text) return false;
        switch (opts.condition) {
            case 'selected':
                return idx === state.selectedIndex;
            case 'cps_above': {
                const cps = getCueCpsValue(cue);
                return cps != null && cps > opts.cpsAbove;
            }
            case 'line_long':
                return lineCharCount(text) > opts.lineLen;
            case 'dur_long':
                return cueDurationMs(cue) > Math.round(opts.durLongSec * 1000);
            case 'chars_long':
                return textCharCount(text) > opts.charsLong;
            default:
                return false;
        }
    }

    function collectSmartSplitMatches(opts) {
        syncDetailToCue();
        const indices = [];
        state.cues.forEach((cue, idx) => {
            if (matchesSmartSplitCondition(cue, idx, opts)) indices.push(idx);
        });
        return indices;
    }

    function previewBatchSmartSplit(opts) {
        const indices = collectSmartSplitMatches(opts);
        if (!indices.length) {
            return { matched: 0, splitCount: 0, added: 0, summary: '没有符合条件的字幕' };
        }

        let splitCount = 0;
        let added = 0;
        const splitOpts = {
            smartMaxChars: opts.smartMaxChars,
            smartLineChars: opts.smartLineChars,
            useCps: opts.useCps,
        };
        for (const idx of indices) {
            const result = computeSplitParts('smart', state.cues[idx], splitOpts);
            if (result.cues && result.cues.length >= 2) {
                splitCount += 1;
                added += result.cues.length - 1;
            }
        }

        if (!splitCount) {
            return { matched: indices.length, splitCount: 0, added: 0, summary: `${indices.length} 条符合筛选，但均无需再分割` };
        }

        const afterTotal = state.cues.length + added;
        return {
            matched: indices.length,
            splitCount,
            added,
            summary: `将分割 ${splitCount} 条（共匹配 ${indices.length} 条）→ ${state.cues.length} 条变为 ${afterTotal} 条`,
        };
    }

    function updateSmartSplitModalState() {
        const cond = getSelectedSmartSplitCondition();
        if (els.smartSplitCpsAbove) els.smartSplitCpsAbove.disabled = cond !== 'cps_above';
        if (els.smartSplitLineLen) els.smartSplitLineLen.disabled = cond !== 'line_long';
        if (els.smartSplitDurLong) els.smartSplitDurLong.disabled = cond !== 'dur_long';
        if (els.smartSplitCharsLong) els.smartSplitCharsLong.disabled = cond !== 'chars_long';

        if (!els.smartSplitPreview) return;
        syncDetailToCue();
        if (!state.cues.length) {
            els.smartSplitPreview.textContent = '没有字幕条目';
            els.smartSplitPreview.classList.add('err');
            return;
        }
        if (cond === 'selected' && state.selectedIndex < 0) {
            els.smartSplitPreview.textContent = '当前没有选中的字幕条目';
            els.smartSplitPreview.classList.add('err');
            return;
        }
        const opts = readSmartSplitOptions();
        const preview = previewBatchSmartSplit(opts);
        els.smartSplitPreview.textContent = preview.summary;
        els.smartSplitPreview.classList.toggle('err', preview.splitCount === 0);
    }

    function openSmartSplitModal() {
        if (!els.smartSplitModal) return;
        syncDetailToCue();
        showEditorModal(els.smartSplitModal, els.smartSplitConfirm);
        updateSmartSplitModalState();
    }

    function closeSmartSplitModal() {
        hideEditorModal(els.smartSplitModal);
    }

    function confirmBatchSmartSplit() {
        const opts = readSmartSplitOptions();
        if (opts.condition === 'selected' && state.selectedIndex < 0) {
            updateSmartSplitModalState();
            return;
        }
        const indices = collectSmartSplitMatches(opts).sort((a, b) => b - a);
        if (!indices.length) {
            updateSmartSplitModalState();
            return;
        }

        const splitOpts = {
            smartMaxChars: opts.smartMaxChars,
            smartLineChars: opts.smartLineChars,
            useCps: opts.useCps,
            fixOverlap: false,
        };

        recordUndoBeforeChange();
        let splitCount = 0;
        let added = 0;
        for (const idx of indices) {
            const result = computeSplitParts('smart', state.cues[idx], splitOpts);
            if (!result.cues || result.cues.length < 2) continue;
            state.cues.splice(idx, 1, ...result.cues);
            splitCount += 1;
            added += result.cues.length - 1;
        }

        if (!splitCount) {
            updateSmartSplitModalState();
            return;
        }

        if (opts.fixOverlap) {
            maybeFixOverlapAfterSplit();
        }

        setDirty(true);
        renderCueList();
        if (state.selectedIndex >= 0) renderDetailPane();
        closeSmartSplitModal();
        setStatus(`已智能分割 ${splitCount} 条字幕，新增 ${added} 条`, 'ok');
    }

    function getSelectedSilenceSplitCondition() {
        return document.querySelector('input[name="editorSilenceSplitCond"]:checked')?.value || 'all';
    }

    function readSilenceSplitBatchOptions() {
        return {
            condition: getSelectedSilenceSplitCondition(),
            silenceDb: Number(els.silenceSplitDb?.value) || -35,
            silenceDur: Number(els.silenceSplitDur?.value) || 0.25,
            durLongSec: Number(els.silenceSplitDurLong?.value) || 3,
            cpsAbove: Number(els.silenceSplitCpsAbove?.value) || 18,
            charsLong: Number(els.silenceSplitCharsLong?.value) || 16,
            fixOverlap: els.silenceSplitFixOverlap?.checked !== false,
        };
    }

    function matchesSilenceSplitCondition(cue, idx, opts) {
        if (!canSilenceSplitCue(cue)) return false;
        const text = String(cue.text || '').trim();
        switch (opts.condition) {
            case 'all':
                return true;
            case 'selected':
                return idx === state.selectedIndex;
            case 'dur_long':
                return cueDurationMs(cue) > Math.round(opts.durLongSec * 1000);
            case 'cps_above': {
                const cps = getCueCpsValue(cue);
                return cps != null && cps > opts.cpsAbove;
            }
            case 'chars_long':
                return textCharCount(text) > opts.charsLong;
            default:
                return false;
        }
    }

    function collectSilenceSplitMatches(opts) {
        syncDetailToCue();
        const indices = [];
        state.cues.forEach((cue, idx) => {
            if (matchesSilenceSplitCondition(cue, idx, opts)) indices.push(idx);
        });
        return indices;
    }

    function previewBatchSilenceSplit(opts) {
        if (!state.videoPath) {
            return { matched: 0, summary: '请先关联视频', isErr: true };
        }
        if (!electron?.ffmpegDetectSilence) {
            return { matched: 0, summary: '当前环境不支持静音分析', isErr: true };
        }
        const indices = collectSilenceSplitMatches(opts);
        if (!indices.length) {
            return { matched: 0, summary: '没有可分析的字幕（需有文本、含空格/换行且时长足够）', isErr: true };
        }
        if (opts.condition === 'selected' && state.selectedIndex < 0) {
            return { matched: 0, summary: '当前没有选中的字幕条目', isErr: true };
        }
        return {
            matched: indices.length,
            summary: `将对 ${indices.length} 条字幕逐条分析静音（需 FFmpeg，执行时将显示进度）`,
            isErr: false,
        };
    }

    function applySilenceSplitPrefsToBatchModal() {
        const prefs = loadSplitPrefs();
        if (els.silenceSplitDb) els.silenceSplitDb.value = String(prefs.silenceDb);
        if (els.silenceSplitDur) els.silenceSplitDur.value = String(prefs.silenceDur);
        if (els.silenceSplitFixOverlap) els.silenceSplitFixOverlap.checked = prefs.fixOverlap;
    }

    function updateSilenceSplitModalState() {
        const cond = getSelectedSilenceSplitCondition();
        if (els.silenceSplitDurLong) els.silenceSplitDurLong.disabled = cond !== 'dur_long';
        if (els.silenceSplitCpsAbove) els.silenceSplitCpsAbove.disabled = cond !== 'cps_above';
        if (els.silenceSplitCharsLong) els.silenceSplitCharsLong.disabled = cond !== 'chars_long';

        if (!els.silenceSplitPreview) return;
        syncDetailToCue();
        if (!state.cues.length) {
            els.silenceSplitPreview.textContent = '没有字幕条目';
            els.silenceSplitPreview.classList.add('err');
            return;
        }
        const opts = readSilenceSplitBatchOptions();
        const preview = previewBatchSilenceSplit(opts);
        els.silenceSplitPreview.textContent = preview.summary;
        els.silenceSplitPreview.classList.toggle('err', !!preview.isErr);
    }

    function openSilenceSplitModal(defaultCondition) {
        if (!els.silenceSplitModal) return;
        syncDetailToCue();
        applySilenceSplitPrefsToBatchModal();
        if (defaultCondition) {
            const radio = document.querySelector(`input[name="editorSilenceSplitCond"][value="${defaultCondition}"]`);
            if (radio) radio.checked = true;
        }
        showEditorModal(els.silenceSplitModal, els.silenceSplitConfirm);
        updateSilenceSplitModalState();
    }

    function closeSilenceSplitModal() {
        hideEditorModal(els.silenceSplitModal);
    }

    async function confirmBatchSilenceSplit() {
        if (state.silenceSplitBusy) return;
        const opts = readSilenceSplitBatchOptions();
        const preview = previewBatchSilenceSplit(opts);
        if (preview.isErr || !preview.matched) {
            updateSilenceSplitModalState();
            return;
        }

        const indices = collectSilenceSplitMatches(opts).sort((a, b) => b - a);
        const splitOpts = {
            silenceDb: opts.silenceDb,
            silenceDur: opts.silenceDur,
            fixOverlap: false,
        };

        recordUndoBeforeChange();
        let splitCount = 0;
        let added = 0;
        let skipped = 0;
        const total = indices.length;

        showSilenceSplitProgress({
            title: '正在批量分析静音',
            detail: `准备处理 ${total} 条字幕…`,
            current: 0,
            total,
            statusMessage: `正在批量分析静音（0/${total}）…`,
        });
        await flushSilenceProgressPaint();

        let aborted = false;
        try {
            for (let i = 0; i < indices.length; i += 1) {
                if (isJobAbortRequested()) {
                    aborted = true;
                    break;
                }
                const idx = indices[i];
                updateSilenceSplitProgress({
                    current: i,
                    total,
                    detail: `正在分析第 ${i + 1}/${total} 条（原序号 ${idx + 1}）…`,
                    statusMessage: `正在分析静音 ${i + 1}/${total}…`,
                });
                await flushSilenceProgressPaint();

                const result = await computeSilenceSplitParts(state.cues[idx], splitOpts);
                if (isJobAbortRequested() || result?.cancelled) {
                    aborted = true;
                    break;
                }
                if (!result.cues || result.cues.length < 2) {
                    skipped += 1;
                    updateSilenceSplitProgress({
                        current: i + 1,
                        total,
                        detail: `第 ${i + 1}/${total} 条未检测到可分割静音，已跳过`,
                    });
                    continue;
                }
                state.cues.splice(idx, 1, ...result.cues);
                splitCount += 1;
                added += result.cues.length - 1;
                updateSilenceSplitProgress({
                    current: i + 1,
                    total,
                    detail: `第 ${i + 1}/${total} 条已分割为 ${result.cues.length} 条`,
                    statusMessage: `正在分析静音 ${i + 1}/${total}…`,
                });
            }
        } finally {
            hideSilenceSplitProgress();
        }

        if (aborted) {
            if (splitCount) {
                setDirty(true);
                renderCueList();
                if (state.selectedIndex >= 0) renderDetailPane();
            }
            closeSilenceSplitModal();
            setStatus(`已取消批量静音分割（已分割 ${splitCount} 条）`, 'warn');
            return;
        }

        if (!splitCount) {
            updateSilenceSplitModalState();
            setStatus(`已分析 ${indices.length} 条，均未检测到可分割的静音`, 'err');
            return;
        }

        if (opts.fixOverlap) {
            showSilenceSplitProgress({
                title: '正在整理时间轴',
                detail: '分割完成，正在修复重叠…',
                indeterminate: true,
                statusMessage: '正在修复分割后的时间重叠…',
            });
            await flushSilenceProgressPaint();
            maybeFixOverlapAfterSplit();
            hideSilenceSplitProgress();
        }

        setDirty(true);
        renderCueList();
        if (state.selectedIndex >= 0) renderDetailPane();
        closeSilenceSplitModal();
        const skipHint = skipped ? `，跳过 ${skipped} 条` : '';
        setStatus(`已按静音分割 ${splitCount} 条字幕，新增 ${added} 条${skipHint}`, 'ok');
    }

    function readSmartAdjustOptions() {
        return {
            fixOverlap: !!els.smartFixOverlap?.checked,
            fixCps: !!els.smartFixCps?.checked,
            enforceMinDur: !!els.smartEnforceMin?.checked,
            enforceMaxDur: !!els.smartEnforceMax?.checked,
            maxCps: Number(els.smartMaxCps?.value) || 18,
            minSec: Number(els.smartMinSec?.value) || 0.5,
            maxSec: Number(els.smartMaxSec?.value) || 10,
            gapMs: Math.max(0, Math.round(Number(els.smartGapMs?.value) || 1)),
        };
    }

    function updateSmartAdjustModalState() {
        const opts = readSmartAdjustOptions();
        if (els.smartMaxCps) els.smartMaxCps.disabled = !opts.fixCps;
        if (els.smartMinSec) els.smartMinSec.disabled = !opts.enforceMinDur;
        if (els.smartMaxSec) els.smartMaxSec.disabled = !opts.enforceMaxDur;

        if (!els.smartPreview) return;
        syncDetailToCue();
        if (!state.cues.length) {
            els.smartPreview.textContent = '没有字幕条目';
            els.smartPreview.classList.add('err');
            return;
        }
        if (!opts.fixOverlap && !opts.fixCps && !opts.enforceMinDur && !opts.enforceMaxDur) {
            els.smartPreview.textContent = '请至少选择一项调整规则';
            els.smartPreview.classList.add('err');
            return;
        }
        const preview = previewSmartAdjust(opts);
        els.smartPreview.textContent = preview.summary;
        els.smartPreview.classList.toggle('err', preview.affected === 0);
    }

    function previewSmartAdjust(options) {
        const working = cloneCues(state.cues);
        const result = applySmartAdjustToCues(working, options);
        if (!result.affected) {
            return { affected: 0, summary: '当前字幕无需调整' };
        }
        const parts = [];
        if (result.overlapFixed) parts.push(`重叠 ${result.overlapFixed} 处`);
        if (result.cpsFixed) parts.push(`CPS ${result.cpsFixed} 条`);
        if (result.minDurFixed) parts.push(`过短 ${result.minDurFixed} 条`);
        if (result.maxDurFixed) parts.push(`过长 ${result.maxDurFixed} 条`);
        return {
            affected: result.affected,
            summary: `预计影响 ${result.affected} 条：${parts.join(' · ') || '将更新时长'}`,
        };
    }

    function applySmartAdjustToCues(cues, options) {
        return qcCore.applySmartAdjustToCues(cues, options);
    }

    function getDefaultQcScanOptions() {
        const prefs = loadSplitPrefs();
        return {
            maxCps: Number(els.qcMaxCps?.value) || Number(els.smartMaxCps?.value) || 18,
            minSec: Number(els.qcMinSec?.value) || 0.5,
            maxSec: Number(els.qcMaxSec?.value) || 10,
            gapMs: Math.max(0, Math.round(Number(els.qcGapMs?.value) || 1)),
            smartMaxChars: prefs.smartMaxChars,
            smartLineChars: prefs.smartLineChars,
            targetCps: getTargetCps(),
        };
    }

    function refreshQcBadge() {
        if (!els.qcBtn || !els.qcBadge) return;
        if (!state.cues.length) {
            els.qcBtn.classList.remove('has-issues');
            els.qcBadge.textContent = '0';
            return;
        }
        const { summary } = qcCore.scanCueIssues(state.cues, getDefaultQcScanOptions());
        const n = summary.total || 0;
        els.qcBadge.textContent = String(n > 99 ? '99+' : n);
        els.qcBtn.classList.toggle('has-issues', n > 0);
        els.qcBtn.title = n > 0
            ? `${qcCore.summarizeScan(summary)}（点击打开质量检查）`
            : '扫描时间轴 / 通顺度问题并一键修复';
    }

    function getEffectiveGlossary() {
        return glossaryCore.mergeGlossaries(state.globalGlossary, state.projectGlossary);
    }

    function syncGlossaryFromScope() {
        const source = state.glossaryScope === 'project'
            ? state.projectGlossary
            : state.globalGlossary;
        state.glossary = glossaryCore.normalizeGlossary(source);
    }

    function syncScopeFromGlossary() {
        const normalized = glossaryCore.normalizeGlossary(state.glossary);
        state.glossary = normalized;
        if (state.glossaryScope === 'project') {
            state.projectGlossary = normalized;
        } else {
            state.globalGlossary = normalized;
        }
    }

    function readGlossaryScopeFromUi() {
        if (els.glossaryScopeProject?.checked) return 'project';
        return 'global';
    }

    function renderGlossaryScopeUi() {
        if (els.glossaryScopeGlobal) {
            els.glossaryScopeGlobal.checked = state.glossaryScope !== 'project';
        }
        if (els.glossaryScopeProject) {
            els.glossaryScopeProject.checked = state.glossaryScope === 'project';
            const disabled = !state.path;
            els.glossaryScopeProject.disabled = disabled;
            if (els.glossaryScopeProjectLabel) {
                els.glossaryScopeProjectLabel.classList.toggle('opacity-50', disabled);
                els.glossaryScopeProjectLabel.title = disabled
                    ? '请先保存字幕文件后再编辑项目术语表'
                    : '仅作用于当前字幕文件旁的项目术语表';
            }
        }
    }

    async function loadGlossaries(subtitlePath = state.path) {
        if (!electron?.transubGetGlossary) {
            state.globalGlossary = { version: 1, entries: [] };
            state.projectGlossary = { version: 1, entries: [] };
            syncGlossaryFromScope();
            refreshGlossaryBadge();
            return;
        }
        try {
            const globalRes = await electron.transubGetGlossary({ scope: 'global' });
            state.globalGlossary = globalRes?.ok && globalRes.glossary
                ? glossaryCore.normalizeGlossary(globalRes.glossary)
                : { version: 1, entries: [] };
        } catch (_) {
            state.globalGlossary = { version: 1, entries: [] };
        }
        state.projectGlossary = { version: 1, entries: [] };
        if (subtitlePath) {
            try {
                const projectRes = await electron.transubGetGlossary({
                    scope: 'project',
                    subtitlePath,
                });
                if (projectRes?.ok && projectRes.glossary) {
                    state.projectGlossary = glossaryCore.normalizeGlossary(projectRes.glossary);
                }
            } catch (_) {
                state.projectGlossary = { version: 1, entries: [] };
            }
        }
        syncGlossaryFromScope();
        refreshGlossaryBadge();
    }

    async function loadGlossary() {
        await loadGlossaries(state.path);
    }

    async function persistGlossary() {
        syncScopeFromGlossary();
        if (!electron?.transubSaveGlossary) return false;
        try {
            const payload = {
                glossary: state.glossary,
                scope: state.glossaryScope,
            };
            if (state.glossaryScope === 'project') {
                if (!state.path) {
                    setStatus('请先保存字幕文件后再写入项目术语表', 'err');
                    return false;
                }
                payload.subtitlePath = state.path;
            }
            const res = await electron.transubSaveGlossary(payload);
            if (res?.ok && res.glossary) {
                const normalized = glossaryCore.normalizeGlossary(res.glossary);
                state.glossary = normalized;
                if (state.glossaryScope === 'project') {
                    state.projectGlossary = normalized;
                } else {
                    state.globalGlossary = normalized;
                }
            }
            return !!res?.ok;
        } catch (_) {
            return false;
        }
    }

    async function switchGlossaryScope(nextScope) {
        const scope = nextScope === 'project' ? 'project' : 'global';
        if (scope === state.glossaryScope) {
            renderGlossaryScopeUi();
            return;
        }
        if (scope === 'project' && !state.path) {
            setStatus('请先保存字幕文件后再编辑项目术语表', 'err');
            renderGlossaryScopeUi();
            return;
        }
        syncScopeFromGlossary();
        state.glossaryScope = scope;
        syncGlossaryFromScope();
        clearGlossaryForm();
        renderGlossaryScopeUi();
        updateGlossaryModalState();
    }

    function refreshGlossaryBadge() {
        if (!els.glossaryBtn || !els.glossaryBadge) return;
        const effective = getEffectiveGlossary();
        if (!state.cues.length || !effective?.entries?.length) {
            els.glossaryBtn.classList.remove('has-issues');
            els.glossaryBadge.textContent = '0';
            state.glossaryIssues = [];
            return;
        }
        const scan = glossaryCore.scanGlossaryIssues(state.cues, effective);
        state.glossaryIssues = scan.issues;
        const n = scan.summary.total || 0;
        els.glossaryBadge.textContent = String(n > 99 ? '99+' : n);
        els.glossaryBtn.classList.toggle('has-issues', n > 0);
        els.glossaryBtn.title = n > 0
            ? `${glossaryCore.summarizeGlossaryScan(scan.summary)}（点击打开术语表）`
            : '术语表与专名一致性';
    }

    function clearGlossaryForm() {
        state.glossaryEditingId = '';
        if (els.glossaryCanonical) els.glossaryCanonical.value = '';
        if (els.glossaryAliases) els.glossaryAliases.value = '';
        if (els.glossaryCaseSensitive) els.glossaryCaseSensitive.checked = false;
        if (els.glossaryEnabled) els.glossaryEnabled.checked = true;
        renderGlossaryEntryList();
    }

    function fillGlossaryForm(entry) {
        if (!entry) {
            clearGlossaryForm();
            return;
        }
        state.glossaryEditingId = entry.id;
        if (els.glossaryCanonical) els.glossaryCanonical.value = entry.canonical || '';
        if (els.glossaryAliases) els.glossaryAliases.value = (entry.aliases || []).join(', ');
        if (els.glossaryCaseSensitive) els.glossaryCaseSensitive.checked = !!entry.caseSensitive;
        if (els.glossaryEnabled) els.glossaryEnabled.checked = entry.enabled !== false;
        renderGlossaryEntryList();
    }

    function renderGlossaryEntryList() {
        if (!els.glossaryEntryList) return;
        const entries = state.glossary?.entries || [];
        if (!entries.length) {
            els.glossaryEntryList.innerHTML = '<div class="glossary-entry-item" style="cursor:default;color:rgb(156 163 175);">暂无术语，请新建或导入</div>';
            return;
        }
        els.glossaryEntryList.innerHTML = entries.map((entry) => {
            const active = entry.id === state.glossaryEditingId ? ' active' : '';
            const aliases = (entry.aliases || []).join(' · ') || '（无别名）';
            const off = entry.enabled === false ? '（已停用）' : '';
            return `<button type="button" class="glossary-entry-item${active}" data-glossary-id="${esc(entry.id)}" role="listitem">`
                + `<span class="g-can">${esc(entry.canonical)}${esc(off)}</span>`
                + `<span class="g-alias">${esc(aliases)}</span>`
                + `</button>`;
        }).join('');
    }

    function renderGlossaryIssueList(issues) {
        if (!els.glossaryIssueList) return;
        if (!issues?.length) {
            els.glossaryIssueList.innerHTML = '<div class="glossary-issue-item" style="cursor:default;color:rgb(156 163 175);">暂无一致性问题</div>';
            return;
        }
        els.glossaryIssueList.innerHTML = issues.slice(0, 40).map((issue) => {
            const idxHint = issue.cueIndices?.length
                ? ` · 字幕 #${issue.cueIndices.slice(0, 5).map((i) => i + 1).join(',')}${issue.cueIndices.length > 5 ? '…' : ''}`
                : '';
            const jumpIdx = issue.cueIndices?.[0];
            return `<button type="button" class="glossary-issue-item" data-glossary-issue-idx="${jumpIdx != null ? jumpIdx : ''}" data-glossary-entry-id="${esc(issue.entryId)}" role="listitem" title="点击定位并选中术语">`
                + `${esc(issue.message)}${esc(idxHint)}`
                + `</button>`;
        }).join('');
    }

    function selectGlossaryEntry(entryId) {
        const entry = (state.glossary?.entries || []).find((e) => e.id === String(entryId));
        fillGlossaryForm(entry || null);
    }

    function beginNewGlossaryEntry() {
        clearGlossaryForm();
        els.glossaryCanonical?.focus();
    }

    function renderBreakWordsChips() {
        if (!els.breakWordsChips) return;
        const words = loadBreakWords();
        if (!words.length) {
            els.breakWordsChips.innerHTML = '<span style="font-size:0.72rem;color:var(--ed-faint)">暂无断句词。添加后，智能断句与静音分割会优先在这些词之后切开。</span>';
        } else {
            els.breakWordsChips.innerHTML = words.map((word) => (
                `<span class="break-words-chip" data-break-word="${esc(word)}">`
                + `<span>${esc(word)}</span>`
                + `<button type="button" data-break-word-remove="${esc(word)}" title="移除「${esc(word)}」" aria-label="移除 ${esc(word)}">&times;</button>`
                + '</span>'
            )).join('');
        }
        if (els.breakWordsStatus) {
            els.breakWordsStatus.textContent = words.length
                ? `当前 ${words.length} 个断句词，已用于智能断句与静音分割`
                : '未设置断句词时，智能断句/静音分割只按标点与空白对齐';
            els.breakWordsStatus.classList.remove('err');
        }
    }

    function openBreakWordsModal() {
        if (!els.breakWordsModal) return;
        loadBreakWords();
        renderBreakWordsChips();
        showEditorModal(els.breakWordsModal, els.breakWordsInput);
    }

    function closeBreakWordsModal() {
        hideEditorModal(els.breakWordsModal);
    }

    function addBreakWordsFromInput() {
        const incoming = parseBreakWordsInput(els.breakWordsInput?.value);
        if (!incoming.length) {
            setStatus('请输入要添加的断句词', 'err');
            els.breakWordsInput?.focus();
            return;
        }
        const merged = splitCore.normalizeBreakWords([...(loadBreakWords()), ...incoming]);
        saveBreakWords(merged);
        if (els.breakWordsInput) els.breakWordsInput.value = '';
        renderBreakWordsChips();
        setStatus(`已更新断句词（共 ${merged.length} 个）`, 'ok');
        els.breakWordsInput?.focus();
    }

    function removeBreakWord(word) {
        const next = loadBreakWords().filter((w) => w.toLowerCase() !== String(word || '').toLowerCase());
        saveBreakWords(next);
        renderBreakWordsChips();
        setStatus(`已移除断句词「${word}」`, 'ok');
    }

    function resetBreakWordsToDefault() {
        const defaults = getDefaultBreakWords();
        saveBreakWords(defaults);
        renderBreakWordsChips();
        setStatus(`已恢复默认断句词（${defaults.length} 个）`, 'ok');
    }

    function clearBreakWords() {
        saveBreakWords([]);
        renderBreakWordsChips();
        setStatus('已清空断句词', 'ok');
    }

    async function importGlossaryFile() {
        if (!electron?.transubImportGlossary) {
            setStatus('当前环境不支持导入术语表', 'err');
            return;
        }
        const res = await electron.transubImportGlossary();
        restoreEditorFocus();
        if (!res || res.canceled) return;
        if (!res.ok) {
            setStatus(res.error || '导入术语表失败', 'err');
            return;
        }
        state.glossary = glossaryCore.normalizeGlossary(res.glossary);
        if (state.glossaryScope === 'project') {
            state.projectGlossary = state.glossary;
        } else {
            state.globalGlossary = state.glossary;
        }
        clearGlossaryForm();
        updateGlossaryModalState();
        setStatus(`已导入 ${state.glossary.entries.length} 条术语`, 'ok');
    }

    async function exportGlossaryFile() {
        if (!electron?.transubExportGlossary) {
            setStatus('当前环境不支持导出术语表', 'err');
            return;
        }
        await persistGlossary();
        const res = await electron.transubExportGlossary();
        restoreEditorFocus();
        if (!res || res.canceled) return;
        if (!res.ok) {
            setStatus(res.error || '导出术语表失败', 'err');
            return;
        }
        setStatus(`术语表已导出：${basename(res.path || '')}`, 'ok');
    }

    function updateGlossaryModalState() {
        syncDetailToCue();
        renderGlossaryEntryList();
        renderGlossaryScopeUi();
        const effective = getEffectiveGlossary();
        const scan = glossaryCore.scanGlossaryIssues(state.cues, effective);
        state.glossaryIssues = scan.issues;
        renderGlossaryIssueList(scan.issues);
        if (els.glossaryPreview) {
            const scopeLabel = state.glossaryScope === 'project' ? '项目' : '全局';
            if (!state.glossary.entries.length) {
                els.glossaryPreview.textContent = `当前为${scopeLabel}术语表，请先添加术语条目`;
                els.glossaryPreview.classList.add('err');
            } else if (!state.cues.length) {
                els.glossaryPreview.textContent = '没有字幕条目';
                els.glossaryPreview.classList.add('err');
            } else {
                const mergedHint = state.glossaryScope === 'project' && state.globalGlossary?.entries?.length
                    ? `（扫描/统一使用合并后的 ${effective.entries.length} 条有效术语）`
                    : '';
                els.glossaryPreview.textContent = `${glossaryCore.summarizeGlossaryScan(scan.summary)}${mergedHint}`;
                els.glossaryPreview.classList.toggle('err', scan.summary.total > 0);
            }
        }
        refreshGlossaryBadge();
    }

    async function openGlossaryModal() {
        if (!els.glossaryModal) return;
        await loadGlossaries(state.path);
        renderGlossaryScopeUi();
        clearGlossaryForm();
        showEditorModal(els.glossaryModal, els.glossaryCanonical);
        updateGlossaryModalState();
    }

    function closeGlossaryModal() {
        hideEditorModal(els.glossaryModal);
    }

    async function saveGlossaryEntryFromForm() {
        const canonical = String(els.glossaryCanonical?.value || '').trim();
        if (!canonical) {
            setStatus('标准写法不能为空', 'err');
            return;
        }
        const result = glossaryCore.upsertEntry(state.glossary, {
            id: state.glossaryEditingId || undefined,
            canonical,
            aliases: els.glossaryAliases?.value || '',
            caseSensitive: !!els.glossaryCaseSensitive?.checked,
            enabled: els.glossaryEnabled?.checked !== false,
        });
        if (!result.ok) {
            setStatus(result.error || '保存条目失败', 'err');
            return;
        }
        state.glossary = result.glossary;
        const ok = await persistGlossary();
        if (!ok) {
            setStatus('术语表保存失败', 'err');
            return;
        }
        fillGlossaryForm(result.entry);
        updateGlossaryModalState();
        setStatus(`已保存术语「${canonical}」`, 'ok');
    }

    async function deleteGlossaryEntryFromForm() {
        if (!state.glossaryEditingId) {
            clearGlossaryForm();
            return;
        }
        if (!(await editorConfirm('确定删除当前术语条目？'))) return;
        state.glossary = glossaryCore.removeEntry(state.glossary, state.glossaryEditingId);
        await persistGlossary();
        clearGlossaryForm();
        updateGlossaryModalState();
        setStatus('已删除术语条目', 'ok');
    }

    async function applyGlossaryUnification(entryIds = null) {
        syncDetailToCue();
        if (!state.cues.length) {
            updateGlossaryModalState();
            return;
        }
        const result = glossaryCore.applyGlossaryToCues(state.cues, getEffectiveGlossary(), {
            entryIds: entryIds || undefined,
        });
        if (!result.stats.replaceCount) {
            updateGlossaryModalState();
            setStatus(result.summary, 'ok');
            return;
        }
        recordUndoBeforeChange();
        state.cues.splice(0, state.cues.length, ...result.cues);
        setDirty(true);
        renderCueList();
        if (state.selectedIndex >= 0) renderDetailPane();
        updateGlossaryModalState();
        setStatus(result.summary, 'ok');
    }

    function readQcOptions() {
        const prefs = loadSplitPrefs();
        return {
            fixOverlap: !!els.qcFixOverlap?.checked,
            fixCpsBySplit: !!els.qcFixCpsSplit?.checked,
            fixCpsByExtend: !!els.qcFixCpsExtend?.checked,
            enforceMinDur: !!els.qcEnforceMin?.checked,
            enforceMaxDur: !!els.qcEnforceMax?.checked,
            compressRepetition: !!els.qcCompressRep?.checked,
            maxCps: Number(els.qcMaxCps?.value) || 18,
            minSec: Number(els.qcMinSec?.value) || 0.5,
            maxSec: Number(els.qcMaxSec?.value) || 10,
            gapMs: Math.max(0, Math.round(Number(els.qcGapMs?.value) || 1)),
            smartMaxChars: prefs.smartMaxChars,
            smartLineChars: prefs.smartLineChars,
            targetCps: getTargetCps(),
            useCpsTime: prefs.useCps !== false,
        };
    }

    const QC_TYPE_CHIPS = [
        { type: 'overlap', countKey: 'overlap', label: '重叠' },
        { type: 'high_cps', countKey: 'highCps', label: '读速' },
        { type: 'splittable', countKey: 'splittable', label: '可分割' },
        { type: 'connected', countKey: 'connected', label: '连续文本' },
        { type: 'repetition', countKey: 'repetition', label: '叠词' },
        { type: 'fluency', countKey: 'fluency', label: '通顺度', warn: true },
        { type: 'short', countKey: 'short', label: '过短' },
        { type: 'long', countKey: 'long', label: '过长' },
        { type: 'invalid', countKey: 'invalid', label: '无效' },
    ];

    function filterQcIssuesByType(issues, typeFilter) {
        if (!typeFilter) return issues || [];
        return (issues || []).filter((issue) => (issue.types || []).includes(typeFilter));
    }

    function setQcTypeFilter(type) {
        const next = type || null;
        if (next == null) {
            state.qcTypeFilter = null;
        } else {
            state.qcTypeFilter = state.qcTypeFilter === next ? null : next;
        }
        updateQcModalState();
    }

    function renderQcIssueList(issues, { emptyHint } = {}) {
        if (!els.qcIssueList) return;
        if (!issues?.length) {
            els.qcIssueList.innerHTML = emptyHint
                ? `<div class="qc-issue-item" style="cursor:default;color:rgb(156 163 175);">${esc(emptyHint)}</div>`
                : '';
            return;
        }
        const maxShow = 40;
        const rows = issues.slice(0, maxShow).map((issue) => {
            const msg = esc(issue.messages.join(' · '));
            const text = esc(issue.textPreview || '—');
            return `<button type="button" class="qc-issue-item" data-qc-idx="${issue.index}" role="listitem">`
                + `<span class="qc-issue-idx">#${issue.index + 1}</span>`
                + `<span class="qc-issue-msg">${msg}</span>`
                + `<span class="qc-issue-text">${text}</span>`
                + `</button>`;
        });
        if (issues.length > maxShow) {
            rows.push(`<div class="qc-issue-item" style="cursor:default;color:rgb(156 163 175);">还有 ${issues.length - maxShow} 条未列出</div>`);
        }
        els.qcIssueList.innerHTML = rows.join('');
    }

    function qcChipClass(base, active) {
        return `qc-chip${base ? ` ${base}` : ''}${active ? ' active' : ''}`;
    }

    function renderQcSummaryBar(summary) {
        if (!els.qcSummaryBar) return;
        if (!summary?.total) {
            state.qcTypeFilter = null;
            els.qcSummaryBar.innerHTML = '<span class="qc-chip ok">未发现问题</span>';
            return;
        }
        const activeType = state.qcTypeFilter;
        if (activeType && !QC_TYPE_CHIPS.some((c) => c.type === activeType && summary[c.countKey] > 0)) {
            state.qcTypeFilter = null;
        }
        const selected = state.qcTypeFilter;
        const chips = [
            `<button type="button" class="${qcChipClass('warn', selected == null)}" data-qc-type="" title="显示全部问题">问题 ${summary.total}</button>`,
        ];
        for (const chip of QC_TYPE_CHIPS) {
            const count = summary[chip.countKey] || 0;
            if (!count) continue;
            const active = selected === chip.type;
            chips.push(
                `<button type="button" class="${qcChipClass(chip.warn ? 'warn' : '', active)}" data-qc-type="${chip.type}" title="只看${chip.label}">${chip.label} ${count}</button>`,
            );
        }
        els.qcSummaryBar.innerHTML = chips.join('');
    }

    function resolveQcFixOptions({ filtered = false } = {}) {
        const base = readQcOptions();
        if (!filtered) return { ok: true, opts: base, label: null };
        const type = state.qcTypeFilter;
        if (!type) {
            return { ok: false, opts: null, label: null, reason: '请先点击上方标签筛选问题类型' };
        }
        const chip = QC_TYPE_CHIPS.find((c) => c.type === type);
        const label = chip?.label || type;
        const opts = qcCore.buildQcOptionsForIssueType(base, type);
        if (!opts) {
            return {
                ok: false,
                opts: null,
                label,
                reason: `「${label}」无法自动修复，请手工修改或重转写`,
            };
        }
        return { ok: true, opts: { ...opts, issueTypeFilter: type }, label };
    }

    function updateQcModalState() {
        const opts = readQcOptions();
        const needCps = opts.fixCpsBySplit || opts.fixCpsByExtend;
        if (els.qcMaxCps) els.qcMaxCps.disabled = !needCps;
        if (els.qcMinSec) els.qcMinSec.disabled = !opts.enforceMinDur;
        if (els.qcMaxSec) els.qcMaxSec.disabled = !opts.enforceMaxDur;

        syncDetailToCue();
        if (!els.qcPreview) return;
        if (!state.cues.length) {
            state.qcTypeFilter = null;
            renderQcSummaryBar({ total: 0 });
            renderQcIssueList([]);
            els.qcPreview.textContent = '没有字幕条目';
            els.qcPreview.classList.add('err');
            if (els.qcFixFiltered) els.qcFixFiltered.disabled = true;
            return;
        }

        const scan = qcCore.scanCueIssues(state.cues, opts);
        renderQcSummaryBar(scan.summary);
        const filtered = filterQcIssuesByType(scan.issues, state.qcTypeFilter);
        const chip = QC_TYPE_CHIPS.find((c) => c.type === state.qcTypeFilter);
        renderQcIssueList(filtered, {
            emptyHint: state.qcTypeFilter && scan.issues.length
                ? `当前类型「${chip?.label || state.qcTypeFilter}」无匹配问题`
                : '',
        });

        const filteredResolve = resolveQcFixOptions({ filtered: true });
        if (els.qcFixFiltered) {
            els.qcFixFiltered.disabled = !filteredResolve.ok;
            els.qcFixFiltered.title = filteredResolve.ok
                ? `仅修复「${filteredResolve.label}」相关问题`
                : (filteredResolve.reason || '请先筛选可自动修复的问题类型');
        }

        if (state.qcTypeFilter) {
            if (!filteredResolve.ok) {
                els.qcPreview.textContent = filteredResolve.reason;
                els.qcPreview.classList.add('err');
            } else {
                const plan = qcCore.buildQcFixPlan(state.cues, filteredResolve.opts);
                els.qcPreview.textContent = `筛选修复（${filteredResolve.label}）：${plan.summary}`;
                els.qcPreview.classList.toggle('err', !plan.ok);
            }
            return;
        }

        const plan = qcCore.buildQcFixPlan(state.cues, opts);
        els.qcPreview.textContent = plan.summary;
        els.qcPreview.classList.toggle('err', !plan.ok);
    }

    function openQcModal() {
        if (!els.qcModal) return;
        state.qcTypeFilter = null;
        syncDetailToCue();
        if (els.qcMaxCps && els.smartMaxCps) els.qcMaxCps.value = els.smartMaxCps.value;
        showEditorModal(els.qcModal, els.qcConfirm);
        updateQcModalState();
    }

    function closeQcModal() {
        hideEditorModal(els.qcModal);
    }

    function confirmQcFix({ filtered = false } = {}) {
        const resolved = resolveQcFixOptions({ filtered });
        if (!resolved.ok) {
            if (els.qcPreview && resolved.reason) {
                els.qcPreview.textContent = resolved.reason;
                els.qcPreview.classList.add('err');
            }
            updateQcModalState();
            return;
        }
        const opts = resolved.opts;
        syncDetailToCue();
        const plan = qcCore.buildQcFixPlan(state.cues, opts);
        if (!plan.ok) {
            updateQcModalState();
            return;
        }
        recordUndoBeforeChange();
        const result = qcCore.applyQcFixes(state.cues, opts);
        state.cues.splice(0, state.cues.length, ...result.cues);
        setDirty(true);
        renderCueList();
        if (state.selectedIndex >= 0) renderDetailPane();
        closeQcModal();
        const remain = result.remaining?.total
            ? `，仍有 ${result.remaining.total} 条待处理`
            : '';
        const scope = filtered && resolved.label ? `（${resolved.label}）` : '';
        setStatus(`质量修复完成${scope}${remain}`, 'ok');
    }

    function openSmartAdjustModal() {
        if (!els.smartAdjustModal) return;
        syncDetailToCue();
        showEditorModal(els.smartAdjustModal, els.smartAdjustConfirm);
        updateSmartAdjustModalState();
    }

    function closeSmartAdjustModal() {
        hideEditorModal(els.smartAdjustModal);
    }

    function confirmSmartAdjust() {
        const opts = readSmartAdjustOptions();
        if (!opts.fixOverlap && !opts.fixCps && !opts.enforceMinDur && !opts.enforceMaxDur) {
            updateSmartAdjustModalState();
            return;
        }
        syncDetailToCue();
        const preview = previewSmartAdjust(opts);
        if (!preview.affected) {
            updateSmartAdjustModalState();
            return;
        }
        recordUndoBeforeChange();
        const stats = applySmartAdjustToCues(state.cues, opts);
        setDirty(true);
        renderCueList();
        closeSmartAdjustModal();
        setStatus(`智能调整完成，已更新 ${stats.affected} 条字幕`, 'ok');
    }

    function readRemoveNoiseOptions() {
        return {
            removeEmpty: !!els.noiseRemoveEmpty?.checked,
            removeFragments: !!els.noiseRemoveFragments?.checked,
            removeSoundEffects: !!els.noiseRemoveSoundEffects?.checked,
            removeSymbolOnly: !!els.noiseRemoveSymbolOnly?.checked,
            removeDuplicates: !!els.noiseRemoveDuplicates?.checked,
            removeHallucinations: !!els.noiseRemoveHallucinations?.checked,
        };
    }

    function updateRemoveNoiseModalState() {
        if (!els.removeNoisePreview) return;
        const opts = readRemoveNoiseOptions();
        if (!opts.removeEmpty && !opts.removeFragments && !opts.removeSoundEffects
            && !opts.removeSymbolOnly && !opts.removeDuplicates && !opts.removeHallucinations) {
            els.removeNoisePreview.textContent = '请至少勾选一项清理规则';
            els.removeNoisePreview.classList.add('err');
            if (els.removeNoiseConfirm) els.removeNoiseConfirm.disabled = true;
            return;
        }
        const { stats } = fluencyCore.removeNoiseFromCues(state.cues, opts);
        els.removeNoisePreview.classList.remove('err');
        els.removeNoisePreview.textContent = fluencyCore.summarizeNoiseRemoval(stats);
        if (els.removeNoiseConfirm) els.removeNoiseConfirm.disabled = stats.removed <= 0;
    }

    function openRemoveNoiseModal() {
        if (!els.removeNoiseModal) return;
        syncDetailToCue();
        showEditorModal(els.removeNoiseModal, els.removeNoiseConfirm);
        updateRemoveNoiseModalState();
    }

    function closeRemoveNoiseModal() {
        hideEditorModal(els.removeNoiseModal);
    }

    function readChineseConvertOptions() {
        const direction = els.chineseDirT2S?.checked ? 't2s' : 's2t';
        const scope = els.chineseScopeSelected?.checked ? 'selected' : 'all';
        let indexes = null;
        if (scope === 'selected') {
            indexes = getSelectedCueIndexes();
            if (!indexes.length && state.selectedIndex >= 0) indexes = [state.selectedIndex];
        }
        const protectTerms = els.chineseProtectGlossary?.checked !== false
            ? glossaryCore.collectProtectTerms(getEffectiveGlossary())
            : [];
        return { direction, scope, indexes, protectTerms };
    }

    function previewChineseConvert() {
        const opts = readChineseConvertOptions();
        if (opts.scope === 'selected' && (!opts.indexes || !opts.indexes.length)) {
            return {
                cues: state.cues.slice(),
                stats: {
                    direction: opts.direction,
                    cueTotal: state.cues.length,
                    cueTouched: 0,
                    charChanged: 0,
                    cueSkipped: 0,
                },
                summary: '请先选中一条或多条字幕',
            };
        }
        return chineseCore.convertCues(state.cues, {
            direction: opts.direction,
            indexes: opts.indexes,
            protectTerms: opts.protectTerms,
        });
    }

    function updateChineseConvertModalState() {
        if (!els.chineseConvertPreview) return;
        if (!state.cues.length) {
            els.chineseConvertPreview.textContent = '没有字幕条目';
            els.chineseConvertPreview.classList.add('err');
            if (els.chineseConvertConfirm) els.chineseConvertConfirm.disabled = true;
            return;
        }
        const preview = previewChineseConvert();
        const noSelection = els.chineseScopeSelected?.checked
            && !getSelectedCueIndexes().length
            && state.selectedIndex < 0;
        const noop = !preview.stats.cueTouched;
        els.chineseConvertPreview.textContent = preview.summary;
        els.chineseConvertPreview.classList.toggle('err', noSelection || noop);
        if (els.chineseConvertConfirm) els.chineseConvertConfirm.disabled = noSelection || noop;
    }

    function openChineseConvertModal() {
        if (!els.chineseConvertModal) return;
        syncDetailToCue();
        showEditorModal(els.chineseConvertModal, els.chineseConvertConfirm);
        updateChineseConvertModalState();
    }

    function closeChineseConvertModal() {
        hideEditorModal(els.chineseConvertModal);
    }

    function confirmChineseConvert() {
        syncDetailToCue();
        const preview = previewChineseConvert();
        if (!preview.stats.cueTouched) {
            updateChineseConvertModalState();
            setStatus(preview.summary || '无需转换', 'ok');
            return;
        }
        recordUndoBeforeChange();
        state.cues.splice(0, state.cues.length, ...preview.cues);
        setDirty(true);
        renderCueList();
        if (state.selectedIndex >= 0) renderDetailPane();
        closeChineseConvertModal();
        setStatus(preview.summary, 'ok');
    }

    function readCompressRepOptions() {
        const scope = els.compressRepScopeSelected?.checked ? 'selected' : 'all';
        let indexes = null;
        if (scope === 'selected') {
            indexes = getSelectedCueIndexes();
            if (!indexes.length && state.selectedIndex >= 0) indexes = [state.selectedIndex];
        }
        return {
            scope,
            indexes,
            compressSingleChar: els.compressRepSingleChar?.checked !== false,
            addExclaim: els.compressRepExclaim?.checked !== false,
            minRepeats: 3,
        };
    }

    function previewCompressRep() {
        const opts = readCompressRepOptions();
        if (opts.scope === 'selected' && (!opts.indexes || !opts.indexes.length)) {
            return {
                cues: state.cues.slice(),
                stats: { cueTotal: state.cues.length, cueTouched: 0, runs: 0, charSaved: 0 },
                summary: '请先选中一条或多条字幕',
            };
        }
        return fluencyCore.compressRepetitionInCues(state.cues, {
            indexes: opts.indexes,
            compressSingleChar: opts.compressSingleChar,
            addExclaim: opts.addExclaim,
            minRepeats: opts.minRepeats,
        });
    }

    function updateCompressRepModalState() {
        if (!els.compressRepPreview) return;
        if (!state.cues.length) {
            els.compressRepPreview.textContent = '没有字幕条目';
            els.compressRepPreview.classList.add('err');
            if (els.compressRepConfirm) els.compressRepConfirm.disabled = true;
            return;
        }
        const preview = previewCompressRep();
        const noSelection = els.compressRepScopeSelected?.checked
            && !getSelectedCueIndexes().length
            && state.selectedIndex < 0;
        const noop = !preview.stats.cueTouched;
        els.compressRepPreview.textContent = preview.summary;
        els.compressRepPreview.classList.toggle('err', noSelection || noop);
        if (els.compressRepConfirm) els.compressRepConfirm.disabled = noSelection || noop;
    }

    function openCompressRepModal() {
        if (!els.compressRepModal) return;
        syncDetailToCue();
        showEditorModal(els.compressRepModal, els.compressRepConfirm);
        updateCompressRepModalState();
    }

    function closeCompressRepModal() {
        hideEditorModal(els.compressRepModal);
    }

    function confirmCompressRep() {
        syncDetailToCue();
        const preview = previewCompressRep();
        if (!preview.stats.cueTouched) {
            updateCompressRepModalState();
            setStatus(preview.summary || '无需压缩', 'ok');
            return;
        }
        recordUndoBeforeChange();
        state.cues.splice(0, state.cues.length, ...preview.cues);
        setDirty(true);
        renderCueList();
        if (state.selectedIndex >= 0) renderDetailPane();
        closeCompressRepModal();
        setStatus(preview.summary.replace(/^将/, '已'), 'ok');
    }

    function quickCompressRepSelectedCue() {
        syncDetailToCue();
        let indexes = getSelectedCueIndexes();
        if (!indexes.length && state.selectedIndex >= 0) indexes = [state.selectedIndex];
        if (!indexes.length) {
            setStatus('请先选择一条字幕', 'err');
            return;
        }
        const preview = fluencyCore.compressRepetitionInCues(state.cues, {
            indexes,
            compressSingleChar: true,
            addExclaim: true,
            minRepeats: 3,
        });
        if (!preview.stats.cueTouched) {
            setStatus('当前条目无需压缩叠词', 'ok');
            updateDetailActionButtons();
            return;
        }
        recordUndoBeforeChange();
        state.cues.splice(0, state.cues.length, ...preview.cues);
        setDirty(true);
        renderCueList();
        if (state.selectedIndex >= 0) renderDetailPane();
        setStatus(preview.summary.replace(/^将/, '已'), 'ok');
    }

    async function confirmRemoveNoise() {
        const opts = readRemoveNoiseOptions();
        if (!opts.removeEmpty && !opts.removeFragments && !opts.removeSoundEffects
            && !opts.removeSymbolOnly && !opts.removeDuplicates) {
            updateRemoveNoiseModalState();
            return;
        }
        syncDetailToCue();
        const preview = fluencyCore.removeNoiseFromCues(state.cues, opts);
        if (!preview.stats.removed) {
            updateRemoveNoiseModalState();
            setStatus('没有可删除的杂音条目', 'ok');
            return;
        }
        if (!(await editorConfirm(`确定删除 ${preview.stats.removed} 条杂音字幕？此操作可撤销。`))) return;

        recordUndoBeforeChange();
        const removedSet = new Set(preview.removedIndexes || []);
        let newSelected = -1;
        if (state.selectedIndex >= 0 && !removedSet.has(state.selectedIndex)) {
            let keptBefore = 0;
            for (let i = 0; i < state.selectedIndex; i += 1) {
                if (!removedSet.has(i)) keptBefore += 1;
            }
            newSelected = keptBefore;
        } else if (preview.cues.length) {
            newSelected = Math.min(Math.max(state.selectedIndex, 0), preview.cues.length - 1);
        }

        state.cues.splice(0, state.cues.length, ...preview.cues.map((c) => ({
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text,
        })));
        state.selectedIndex = newSelected;

        setDirty(true);
        renderCueList();
        closeRemoveNoiseModal();
        setStatus(`已删除 ${preview.stats.removed} 条杂音字幕，剩余 ${preview.stats.kept} 条`, 'ok');
    }

    function updatePlayheadTimeLabel(exact) {
        if (!els.playheadTime) return;
        const t = els.video ? (els.video.currentTime || 0) * 1000 : 0;
        const displayMs = exact ? Math.round(t) : Math.floor(t / 1000) * 1000;
        const label = formatDisplayTime(displayMs, state.format);
        if (label !== state.lastPlayheadLabel) {
            state.lastPlayheadLabel = label;
            els.playheadTime.textContent = label;
        }
        updateTimelinePlayhead(Math.round(t));
    }

    function shiftAllCues(deltaMs) {
        syncDetailToCue();
        recordUndoBeforeChange();
        const selected = getSelectedCueIndexes();
        const targets = selected.length >= 1 ? selected : state.cues.map((_, i) => i);
        for (const idx of targets) {
            const c = state.cues[idx];
            if (!c) continue;
            c.startMs = Math.max(0, c.startMs + deltaMs);
            if (c.endMs != null) c.endMs = Math.max(c.startMs + 100, c.endMs + deltaMs);
        }
        setDirty(true);
        renderCueList();
        setStatus(
            selected.length >= 1
                ? `已偏移选中 ${selected.length} 条 ${deltaMs > 0 ? '+' : ''}${deltaMs}ms`
                : `已全体偏移 ${deltaMs > 0 ? '+' : ''}${deltaMs}ms`,
            'ok',
        );
    }

    /** 供主进程关闭窗口前调用 */
    global.__transubEditorConfirmClose = async () => {
        if (!state.dirty) return { allow: true };
        const ok = await editorConfirm('字幕已修改但未保存，确定要关闭窗口吗？');
        return { allow: ok };
    };

    global.__transubEditorGetDirty = () => state.dirty;

    global.__transubEditorSaveBeforeClose = async () => {
        await saveDocument();
        return !state.dirty;
    };


    function isEditingDetailField() {
        const ae = document.activeElement;
        if (!ae) return false;
        if (ae === els.detailText || ae === els.detailStart || ae === els.detailDuration) return true;
        if (ae.closest?.('.editor-modal:not(.hidden)')) return true;
        return false;
    }

    /**
     * 自动焦点：播放时把「选中焦点」切到当前字幕并滚动列表。
     * 关闭时不得改 selectedIndex，也不得 scrollIntoView。
     */
    function followPlaybackFocus(idx) {
        if (!isAutoFocusEnabled()) return;
        if (!Number.isFinite(idx) || idx < 0 || idx >= state.cues.length) return;
        if (!els.video || els.video.paused || els.video.ended) return;
        if (isEditingDetailField()) return;
        if (idx === state.selectedIndex) {
            const row = els.cueBody?.querySelector(`tr[data-cue-idx="${idx}"]`);
            if (row && !isRowVisibleInList(row)) {
                row.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            }
            return;
        }
        selectCue(idx, { scroll: true, fromPlayback: true });
    }

    function refreshQcIssueIndexSet() {
        try {
            const { issues } = qcCore.scanCueIssues(state.cues, getDefaultQcScanOptions());
            state.qcIssueIndexSet = new Set((issues || []).map((i) => i.index));
        } catch (_) {
            state.qcIssueIndexSet = new Set();
        }
    }

    function getVisibleCueIndexes() {
        const n = state.cues.length;
        const all = Array.from({ length: n }, (_, i) => i);
        if (state.listFilter === 'low') {
            return all.filter((i) => !!state.cueMeta[i]?.low);
        }
        if (state.listFilter === 'qc') {
            return all.filter((i) => state.qcIssueIndexSet.has(i));
        }
        if (state.listFilter === 'find') {
            if (!state.find.active || !state.find.matches.length) return [];
            return [...new Set(state.find.matches.map((m) => m.cueIdx))].sort((a, b) => a - b);
        }
        return all;
    }

    function setListFilter(filter) {
        state.listFilter = filter || 'all';
        document.querySelectorAll('[data-list-filter]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-list-filter') === state.listFilter);
        });
        renderCueList();
    }

    function jumpToNextIssue() {
        refreshCueMeta();
        refreshQcIssueIndexSet();
        const issues = [];
        for (let i = 0; i < state.cues.length; i += 1) {
            if (state.cueMeta[i]?.low || state.qcIssueIndexSet.has(i)) issues.push(i);
        }
        if (!issues.length) {
            setStatus('没有更多问题条目', 'ok');
            return;
        }
        const cur = state.selectedIndex;
        const next = issues.find((i) => i > cur) ?? issues[0];
        selectCue(next, { scroll: true, seek: true });
        setStatus(`问题条目 ${issues.indexOf(next) + 1}/${issues.length}`, 'warn');
    }

    function updateNeedsVideoUi() {
        const hasVideo = !!state.videoPath;
        document.querySelectorAll('.needs-video').forEach((btn) => {
            btn.classList.toggle('is-no-video', !hasVideo);
            if (!hasVideo) {
                if (!btn.dataset.titleFull) btn.dataset.titleFull = btn.title || '';
                btn.title = `${btn.dataset.titleFull || btn.title || ''}（需先关联视频）`;
            } else if (btn.dataset.titleFull) {
                btn.title = btn.dataset.titleFull;
            }
        });
        [els.playPauseBtn, els.seekBackBtn, els.seekFwdBtn, els.rateSelect, els.volumeSlider].forEach((el) => {
            if (!el) return;
            el.disabled = !hasVideo;
        });
        updateRetranscribeTransportBtn();
    }

    async function openEditorSettings() {
        try {
            const res = await electron?.transubOpenSettings?.({ tab: 'editor' });
            if (res?.ok === false) {
                setStatus(res?.error || '无法打开设置', 'err');
            }
        } catch (err) {
            setStatus(err?.message || '无法打开设置', 'err');
        }
    }

    function closeToolsMenu() {
        if (!els.toolsMenu) return;
        els.toolsMenu.classList.add('hidden');
        if (els.toolsMenuBtn) els.toolsMenuBtn.setAttribute('aria-expanded', 'false');
    }

    function toggleToolsMenu() {
        if (!els.toolsMenu) return;
        const open = els.toolsMenu.classList.toggle('hidden') === false;
        // classList.toggle returns false if class was removed... actually returns boolean whether class is now present
        const isHidden = els.toolsMenu.classList.contains('hidden');
        if (els.toolsMenuBtn) els.toolsMenuBtn.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
    }

    function bindPanelSplitter() {
        const splitter = els.splitter;
        const panel = els.cuesPanel;
        if (!splitter || !panel || !els.main) return;
        let dragging = false;
        splitter.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dragging = true;
            splitter.classList.add('is-dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const rect = els.main.getBoundingClientRect();
            if (!rect.width) return;
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            applyPanelWidth(pct);
        });
        window.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            splitter.classList.remove('is-dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

    function updatePlayPauseButton() {
        if (!els.playPauseBtn || !els.video) return;
        const playing = !els.video.paused && !els.video.ended;
        els.playPauseBtn.innerHTML = playing ? '<i class="fa fa-pause"></i>' : '<i class="fa fa-play"></i>';
        els.playPauseBtn.title = playing ? '暂停 (Space)' : '播放 (Space)';
    }

    function seekVideoBy(deltaSec) {
        if (!els.video || !state.videoPath) return;
        const dur = Number.isFinite(els.video.duration) ? els.video.duration : Infinity;
        els.video.currentTime = Math.max(0, Math.min(dur, (els.video.currentTime || 0) + deltaSec));
        syncPlaybackFromVideo(true);
    }

    function getTimelineMinViewMs() {
        return Math.max(500, Number(state.timeline.minViewMs) || 2000);
    }

    function getTimelineViewSpan() {
        return Math.max(1, state.timeline.viewEndMs - state.timeline.viewStartMs);
    }

    function isTimelineZoomed() {
        const dur = Math.max(1, state.timeline.durationMs);
        return getTimelineViewSpan() < dur - 1;
    }

    function getTimelineMaxZoom(durMs) {
        const dur = Math.max(1, durMs || state.timeline.durationMs || 1);
        const minView = Math.min(getTimelineMinViewMs(), dur);
        return Math.max(1, dur / minView);
    }

    function clampTimelineZoom(zoom, durMs) {
        const z = Number(zoom);
        const fallback = Number(state.timeline.zoom) || 5;
        const maxZoom = getTimelineMaxZoom(durMs);
        if (!Number.isFinite(z) || z < 1) return Math.min(fallback, maxZoom);
        return Math.max(1, Math.min(maxZoom, z));
    }

    function syncTimelineZoomFromView() {
        const dur = Math.max(1, state.timeline.durationMs);
        const span = getTimelineViewSpan();
        state.timeline.zoom = clampTimelineZoom(dur / span, dur);
        state.timeline.fitted = span >= dur - 1;
    }

    function clampTimelineView() {
        const dur = Math.max(1, state.timeline.durationMs);
        const minView = Math.min(getTimelineMinViewMs(), dur);
        let span = Math.max(minView, state.timeline.viewEndMs - state.timeline.viewStartMs);
        span = Math.min(span, dur);
        let start = Number(state.timeline.viewStartMs) || 0;
        if (!Number.isFinite(start)) start = 0;
        start = Math.max(0, Math.min(start, dur - span));
        state.timeline.viewStartMs = start;
        state.timeline.viewEndMs = start + span;
        syncTimelineZoomFromView();
        updateTimelineZoomUi();
    }

    function applyTimelineZoom(zoom, anchorMs, { save = true, preserveStart = false } = {}) {
        const dur = Math.max(1, state.timeline.durationMs);
        const z = clampTimelineZoom(zoom, dur);
        const span = dur / z;
        const oldStart = state.timeline.viewStartMs;
        const oldSpan = getTimelineViewSpan();
        let start;
        if (preserveStart && oldSpan > 0 && state.timeline.viewEndMs > state.timeline.viewStartMs) {
            start = oldStart;
        } else {
            const anchor = Number.isFinite(anchorMs)
                ? Math.max(0, Math.min(dur, anchorMs))
                : (oldSpan > 0 ? oldStart + oldSpan / 2 : 0);
            const ratio = oldSpan > 0
                ? Math.max(0, Math.min(1, (anchor - oldStart) / oldSpan))
                : 0.35;
            start = anchor - ratio * span;
        }
        state.timeline.viewStartMs = start;
        state.timeline.viewEndMs = start + span;
        clampTimelineView();
        if (save) {
            state.timeline.zoom = saveTimelineZoomPref(state.timeline.zoom);
        }
    }

    function fitTimelineView() {
        applyTimelineZoom(1, 0, { save: true, preserveStart: false });
    }

    function setTimelineView(startMs, endMs) {
        state.timeline.viewStartMs = startMs;
        state.timeline.viewEndMs = endMs;
        clampTimelineView();
    }

    function zoomTimelineAt(factor, anchorMs) {
        const nextZoom = (Number(state.timeline.zoom) || 1) / Math.max(0.01, factor);
        applyTimelineZoom(nextZoom, anchorMs, { save: true });
    }

    function panTimelineByMs(deltaMs) {
        if (!deltaMs || !isTimelineZoomed()) return false;
        setTimelineView(state.timeline.viewStartMs + deltaMs, state.timeline.viewEndMs + deltaMs);
        return true;
    }

    function ensurePlayheadInView(ms, { marginRatio = 0.12, forceCenter = false } = {}) {
        if (!isTimelineZoomed()) return false;
        const span = getTimelineViewSpan();
        const margin = span * Math.max(0, Math.min(0.4, marginRatio));
        const start = state.timeline.viewStartMs;
        const end = state.timeline.viewEndMs;
        if (!forceCenter && ms >= start + margin && ms <= end - margin) return false;
        const targetStart = ms - span * 0.35;
        setTimelineView(targetStart, targetStart + span);
        return true;
    }

    function updateTimelineZoomUi() {
        const zoomed = isTimelineZoomed();
        const dur = Math.max(1, state.timeline.durationMs);
        const span = getTimelineViewSpan();
        const zoom = Number(state.timeline.zoom) || (dur / span);
        if (els.timelineZoomFit) {
            els.timelineZoomFit.disabled = !zoomed;
        }
        if (els.timelineHScrollWrap) {
            els.timelineHScrollWrap.classList.toggle('hidden', !zoomed);
            els.timelineHScrollWrap.setAttribute('aria-hidden', zoomed ? 'false' : 'true');
        }
        if (els.timelineHScroll && zoomed) {
            const maxScroll = Math.max(1, dur - span);
            const pos = Math.max(0, Math.min(1, state.timeline.viewStartMs / maxScroll));
            const sliderMax = Number(els.timelineHScroll.max) || 1000;
            const nextVal = Math.round(pos * sliderMax);
            if (Number(els.timelineHScroll.value) !== nextVal) {
                els.timelineHScroll.value = String(nextVal);
            }
        }
        if (els.timelineStack) {
            const zoomLabel = zoomed
                ? ` · 已放大 ${zoom.toFixed(1)}×`
                : '';
            els.timelineStack.title = `点击定位 · 拖拽字幕块调整时间 · 滚轮平移 · Ctrl+滚轮缩放${zoomLabel}`;
        }
    }

    function updateTimelineDuration() {
        let durMs = 0;
        if (els.video && Number.isFinite(els.video.duration) && els.video.duration > 0) {
            durMs = Math.round(els.video.duration * 1000);
        } else if (state.cues.length) {
            durMs = Math.max(...state.cues.map((c) => cueEndMs(c)), 1000);
        }
        const nextDur = Math.max(durMs, 1000);
        const prevDur = state.timeline.durationMs;
        const hadView = prevDur > 0
            && state.timeline.viewEndMs > state.timeline.viewStartMs;
        state.timeline.durationMs = nextDur;

        const zoom = clampTimelineZoom(
            state.timeline.zoom || loadTimelineZoomPref(),
            nextDur,
        );
        state.timeline.zoom = zoom;

        if (!hadView) {
            const anchor = els.video
                ? Math.round((els.video.currentTime || 0) * 1000)
                : 0;
            applyTimelineZoom(zoom, anchor, { save: false, preserveStart: false });
        } else {
            applyTimelineZoom(zoom, null, { save: false, preserveStart: true });
        }
    }

    function timelineMsToX(ms) {
        const track = els.timelineTrack;
        if (!track) return 0;
        const w = track.clientWidth || 1;
        const span = getTimelineViewSpan();
        return ((ms - state.timeline.viewStartMs) / span) * w;
    }

    function timelineXToMs(x, trackEl) {
        const track = trackEl || els.timelineTrack;
        if (!track) return 0;
        const w = track.clientWidth || 1;
        const span = getTimelineViewSpan();
        return state.timeline.viewStartMs + (x / w) * span;
    }

    function updateTimelinePlayhead(ms, { follow = false } = {}) {
        if (follow && els.video && !els.video.paused) {
            if (ensurePlayheadInView(ms)) {
                renderTimeline({ skipDuration: true });
                return;
            }
        }
        const x = timelineMsToX(ms);
        if (els.timelinePlayhead) els.timelinePlayhead.style.left = `${x}px`;
        if (els.waveformPlayhead && state.waveformEnabled) {
            els.waveformPlayhead.style.left = `${x}px`;
        }
    }

    function setWaveformLoadingUi(loading, message) {
        const on = !!loading && state.waveformEnabled;
        const text = message || '正在加载波形…';
        if (els.waveformLoading) {
            els.waveformLoading.classList.toggle('hidden', !on);
            els.waveformLoading.setAttribute('aria-hidden', on ? 'false' : 'true');
        }
        if (els.waveformLoadingText) {
            els.waveformLoadingText.textContent = text;
        }
        if (els.waveformToggle) {
            els.waveformToggle.classList.toggle('is-loading', on);
            if (on) {
                els.waveformToggle.title = text;
            } else if (state.waveformEnabled) {
                els.waveformToggle.title = '波形时间轴：开启（默认）';
            }
        }
        if (els.waveformRow) {
            els.waveformRow.classList.toggle('is-loading', on);
        }
    }

    function drawTimelineWaveform() {
        const canvas = els.timelineWaveform;
        if (!canvas || !state.waveformEnabled) return;
        const peaks = state.waveform.peaks;
        const track = els.waveformTrack || els.timelineTrack;
        if (!track || !Array.isArray(peaks) || !peaks.length) {
            const ctxEmpty = canvas.getContext?.('2d');
            if (ctxEmpty) {
                ctxEmpty.clearRect(0, 0, canvas.width || 1, canvas.height || 1);
            }
            return;
        }
        const rect = track.getBoundingClientRect();
        const cssW = Math.max(1, Math.floor(rect.width));
        const cssH = Math.max(1, Math.floor(rect.height));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);
        const mid = cssH / 2;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';

        const peakDurMs = Math.max(
            1,
            (Number(state.waveform.durationSec) > 0
                ? state.waveform.durationSec * 1000
                : state.timeline.durationMs) || 1,
        );
        const i0 = Math.max(0, Math.floor((state.timeline.viewStartMs / peakDurMs) * peaks.length));
        const i1 = Math.min(
            peaks.length,
            Math.ceil((state.timeline.viewEndMs / peakDurMs) * peaks.length),
        );
        const viewPeaks = Math.max(1, i1 - i0);
        const step = Math.max(1, Math.floor(viewPeaks / cssW));
        for (let x = 0; x < cssW; x += 1) {
            const i = Math.min(peaks.length - 1, i0 + Math.floor((x / cssW) * viewPeaks));
            let peak = peaks[i] || 0;
            for (let j = 1; j < step && i + j < peaks.length; j += 1) {
                peak = Math.max(peak, peaks[i + j] || 0);
            }
            const h = Math.max(1, peak * (cssH * 0.45));
            ctx.fillRect(x, mid - h, 1, h * 2);
        }
    }

    async function ensureWaveformLoaded(opts = {}) {
        const announce = opts.announce === true;
        if (!state.waveformEnabled) {
            setWaveformLoadingUi(false);
            return;
        }
        if (!state.videoPath) {
            setWaveformLoadingUi(false);
            if (announce) setStatus('请先关联视频后再显示波形', 'warn');
            return;
        }
        if (!electron?.ffmpegExtractWaveform) {
            setWaveformLoadingUi(false);
            if (announce) setStatus('当前环境不支持波形提取', 'err');
            return;
        }
        const key = `${state.videoPath}|${state.timeline.durationMs || 0}`;
        if (state.waveform.cacheKey === key && Array.isArray(state.waveform.peaks)) {
            setWaveformLoadingUi(false);
            drawTimelineWaveform();
            if (announce) setStatus('波形已就绪', 'ok');
            return;
        }
        if (state.waveform.loading) {
            setWaveformLoadingUi(true, '正在加载波形…');
            return;
        }
        state.waveform.loading = true;
        setWaveformLoadingUi(true, '正在加载波形…');
        setStatus('正在从视频提取波形，请稍候…', '');
        try {
            const res = await electron.ffmpegExtractWaveform(buildFfmpegRequest({
                path: state.videoPath,
                peaksPerSec: 40,
                maxPeaks: 24000,
            }));
            if (!state.waveformEnabled) {
                setWaveformLoadingUi(false);
                return;
            }
            if (res?.cancelled || isJobAbortRequested()) {
                setWaveformLoadingUi(false);
                setStatus('波形加载已取消', 'warn');
                return;
            }
            if (!res?.ok || !Array.isArray(res.peaks)) {
                setWaveformLoadingUi(false);
                if (res?.error) setStatus(res.error, 'err');
                else setStatus('波形加载失败', 'err');
                return;
            }
            state.waveform.peaks = res.peaks;
            state.waveform.durationSec = Number(res.durationSec) || 0;
            state.waveform.videoPath = state.videoPath;
            state.waveform.cacheKey = key;
            drawTimelineWaveform();
            setWaveformLoadingUi(false);
            setStatus('波形已就绪', 'ok');
        } catch (err) {
            setWaveformLoadingUi(false);
            setStatus(err?.message || '波形加载失败', 'err');
        } finally {
            state.waveform.loading = false;
            if (!state.waveformEnabled || Array.isArray(state.waveform.peaks)) {
                setWaveformLoadingUi(false);
            }
        }
    }

    function onWaveformPrefChanged(enabled) {
        if (!enabled) {
            setWaveformLoadingUi(false);
            drawTimelineWaveform();
            return;
        }
        ensureWaveformLoaded({ announce: true });
        drawTimelineWaveform();
    }

    function renderTimeline(opts = {}) {
        if (!els.timelineCues) return;
        if (!opts.skipDuration) updateTimelineDuration();
        else updateTimelineZoomUi();
        const selectedSet = state.selectedIndices instanceof Set
            ? state.selectedIndices
            : new Set(state.selectedIndex >= 0 ? [state.selectedIndex] : []);
        const trackW = els.timelineTrack?.clientWidth || 0;
        els.timelineCues.innerHTML = state.cues.map((cue, idx) => {
            const start = cue.startMs;
            const end = cueEndMs(cue);
            const left = timelineMsToX(start);
            const right = timelineMsToX(end);
            if (trackW > 0 && (right < -4 || left > trackW + 4)) return '';
            const width = Math.max(3, right - left);
            const label = String(cue.text || '').replace(/\s+/g, ' ').trim();
            const selected = selectedSet.has(idx) || idx === state.selectedIndex;
            return `<div class="editor-timeline-cue${selected ? ' selected' : ''}" data-tl-idx="${idx}" style="left:${left}px;width:${width}px" title="${esc(label)}">
                <div class="tl-handle tl-handle-l" data-tl-handle="l"></div>
                <div class="tl-label">${esc(label.slice(0, 24))}</div>
                <div class="tl-handle tl-handle-r" data-tl-handle="r"></div>
            </div>`;
        }).join('');
        const t = els.video ? Math.round((els.video.currentTime || 0) * 1000) : 0;
        updateTimelinePlayhead(t);
        if (state.waveformEnabled) {
            drawTimelineWaveform();
            ensureWaveformLoaded();
        }
    }

    function refreshTimelineView() {
        renderTimeline({ skipDuration: true });
    }

    function bindTimelineInteractions() {
        const track = els.timelineTrack;
        if (!track || track.dataset.bound === '1') return;
        track.dataset.bound = '1';

        const startPan = (e, trackEl) => {
            hideCueContextMenu();
            const originX = e.clientX;
            const originStart = state.timeline.viewStartMs;
            const originEnd = state.timeline.viewEndMs;
            const span = Math.max(1, originEnd - originStart);
            const trackW = trackEl.clientWidth || 1;
            state.timeline.panning = true;
            e.preventDefault();
            const onMove = (ev) => {
                if (!state.timeline.panning) return;
                const dx = ev.clientX - originX;
                const dMs = -Math.round((dx / trackW) * span);
                setTimelineView(originStart + dMs, originEnd + dMs);
                refreshTimelineView();
            };
            const onUp = () => {
                state.timeline.panning = null;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                refreshTimelineView();
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        };

        const suppressMiddleClick = (el) => {
            el?.addEventListener('auxclick', (e) => {
                if (e.button === 1) e.preventDefault();
            });
            el?.addEventListener('mousedown', (e) => {
                if (e.button === 1) e.preventDefault();
            });
        };
        suppressMiddleClick(track);
        suppressMiddleClick(els.waveformTrack);

        track.addEventListener('mousedown', (e) => {
            const cueEl = e.target.closest?.('.editor-timeline-cue');
            const handle = e.target.closest?.('[data-tl-handle]')?.getAttribute('data-tl-handle');
            const rect = track.getBoundingClientRect();
            const x = e.clientX - rect.left;

            if (e.button === 1 || (e.button === 0 && (e.altKey || e.shiftKey) && !cueEl)) {
                if (!isTimelineZoomed()) return;
                startPan(e, track);
                return;
            }

            if (!cueEl) {
                if (!els.video || !state.videoPath) return;
                if (e.button !== 0) return;
                const ms = Math.max(0, timelineXToMs(x));
                els.video.currentTime = ms / 1000;
                syncPlaybackFromVideo(true);
                return;
            }

            if (e.button !== 0) return;
            const idx = Number(cueEl.getAttribute('data-tl-idx'));
            if (!Number.isFinite(idx) || idx < 0) return;
            selectCue(idx, { scroll: true, seek: false });
            const cue = state.cues[idx];
            if (!cue) return;

            const mode = handle === 'l' ? 'start' : handle === 'r' ? 'end' : 'move';
            const originX = e.clientX;
            const originStart = cue.startMs;
            const originEnd = cueEndMs(cue);
            state.timeline.dragging = { idx, mode, originX, originStart, originEnd };
            e.preventDefault();
            recordUndoBeforeChange();

            const onMove = (ev) => {
                const drag = state.timeline.dragging;
                if (!drag) return;
                const dx = ev.clientX - drag.originX;
                const trackW = track.clientWidth || 1;
                const span = getTimelineViewSpan();
                const dMs = Math.round((dx / trackW) * span);
                const c = state.cues[drag.idx];
                if (!c) return;
                if (drag.mode === 'move') {
                    let start = Math.max(0, drag.originStart + dMs);
                    let end = Math.max(start + 100, drag.originEnd + dMs);
                    c.startMs = start;
                    c.endMs = end;
                } else if (drag.mode === 'start') {
                    c.startMs = Math.max(0, Math.min(drag.originEnd - 100, drag.originStart + dMs));
                    c.endMs = drag.originEnd;
                } else {
                    c.endMs = Math.max(c.startMs + 100, drag.originEnd + dMs);
                }
                setDirty(true);
                refreshListRow(drag.idx);
                renderDetailPane();
                refreshTimelineView();
                if (els.video && state.videoPath) {
                    const seekMs = drag.mode === 'end' ? cueEndMs(c) - 1 : c.startMs;
                    els.video.currentTime = Math.max(0, seekMs) / 1000;
                }
            };
            const onUp = () => {
                state.timeline.dragging = null;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                scheduleVideoTextTrackRefresh();
                resyncPlaybackAfterCueTimingChange();
                refreshTimelineView();
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });

        track.addEventListener('contextmenu', (e) => {
            const cueEl = e.target.closest?.('.editor-timeline-cue');
            if (!cueEl) return;
            e.preventDefault();
            const idx = Number(cueEl.getAttribute('data-tl-idx'));
            openCueContextMenuAt(idx, e.clientX, e.clientY, { scroll: true });
        });

        const waveTrack = els.waveformTrack;
        if (waveTrack && waveTrack.dataset.bound !== '1') {
            waveTrack.dataset.bound = '1';
            waveTrack.addEventListener('mousedown', (e) => {
                if (!state.waveformEnabled) return;
                if (e.button === 1 || (e.button === 0 && (e.altKey || e.shiftKey))) {
                    if (!isTimelineZoomed()) return;
                    startPan(e, waveTrack);
                    return;
                }
                if (e.button !== 0) return;
                if (!els.video || !state.videoPath) return;
                const rect = waveTrack.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const ms = Math.max(0, timelineXToMs(x, waveTrack));
                els.video.currentTime = ms / 1000;
                syncPlaybackFromVideo(true);
            });
            waveTrack.addEventListener('contextmenu', (e) => {
                if (!state.waveformEnabled) return;
                const rect = waveTrack.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const ms = Math.max(0, timelineXToMs(x, waveTrack));
                const idx = findPlaybackIndex(ms);
                if (idx < 0) return;
                e.preventDefault();
                openCueContextMenuAt(idx, e.clientX, e.clientY, { scroll: true });
            });
        }

        const stack = els.timelineStack;
        if (stack && stack.dataset.zoomBound !== '1') {
            stack.dataset.zoomBound = '1';
            stack.addEventListener('wheel', (e) => {
                if (!state.timeline.durationMs) return;
                const rect = (els.timelineTrack || stack).getBoundingClientRect();
                const x = e.clientX - rect.left;
                const anchorMs = timelineXToMs(x);
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
                    zoomTimelineAt(factor, anchorMs);
                    refreshTimelineView();
                    return;
                }
                if (!isTimelineZoomed()) return;
                e.preventDefault();
                const span = getTimelineViewSpan();
                const trackW = Math.max(1, rect.width || 1);
                const deltaPx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
                const dMs = Math.round((deltaPx / trackW) * span);
                if (panTimelineByMs(dMs)) refreshTimelineView();
            }, { passive: false });
        }

        els.timelineZoomIn?.addEventListener('click', () => {
            const t = els.video ? Math.round((els.video.currentTime || 0) * 1000) : null;
            zoomTimelineAt(1 / 1.5, t);
            refreshTimelineView();
        });
        els.timelineZoomOut?.addEventListener('click', () => {
            const t = els.video ? Math.round((els.video.currentTime || 0) * 1000) : null;
            zoomTimelineAt(1.5, t);
            refreshTimelineView();
        });
        els.timelineZoomFit?.addEventListener('click', () => {
            fitTimelineView();
            refreshTimelineView();
        });
        els.timelineHScroll?.addEventListener('input', () => {
            if (!isTimelineZoomed()) return;
            const sliderMax = Number(els.timelineHScroll.max) || 1000;
            const pos = Math.max(0, Math.min(1, Number(els.timelineHScroll.value) / sliderMax));
            const span = getTimelineViewSpan();
            const maxStart = Math.max(0, state.timeline.durationMs - span);
            const start = pos * maxStart;
            setTimelineView(start, start + span);
            refreshTimelineView();
        });

        window.addEventListener('resize', () => {
            if (state.ready) refreshTimelineView();
        });
    }

    function openShortcutsModal() {
        if (!els.shortcutsModal) return;
        showEditorModal(els.shortcutsModal, els.shortcutsClose);
    }

    function closeShortcutsModal() {
        hideEditorModal(els.shortcutsModal);
    }

    const modalCtx = { state, els };
    editorParts.installModals(modalCtx);
    const {
        isElementFocusable,
        clearStaleFocus,
        pickEditorFocusTarget,
        restoreEditorFocus,
        requestOsRefocus,
        releaseFocusFromModal,
        editorConfirm,
        showEditorModal,
        hideEditorModal,
    } = modalCtx;

    const bootCtx = { els, setStatus };
    editorParts.installBootProgress(bootCtx);
    const {
        flushBootProgressPaint,
        showBootProgress,
        updateBootProgress,
        hideBootProgress,
    } = bootCtx;

    const prefsCtx = {
        state,
        els,
        splitCore,
        clampTargetCps,
        setStatus,
        isAutoFocusEnabled,
        followPlaybackFocus,
        getSelectedSplitMode,
        onWaveformPrefChanged,
    };
    editorParts.installPrefs(prefsCtx);
    const {
        loadTargetCpsPrefs,
        saveTargetCpsPrefs,
        getTargetCps,
        applyTargetCpsPrefs,
        getDefaultBreakWords,
        loadBreakWords,
        saveBreakWords,
        clampRetranscribeDurSec,
        loadRetranscribeDurPrefs,
        saveRetranscribeDurPrefs,
        loadSplitPrefs,
        saveSplitPrefs,
        applySplitPrefsToModal,
        applyAutoFocusUi,
        loadAutoFocusPref,
        toggleAutoFocus,
        applyTheme,
        loadTheme,
        toggleTheme,
        applyPanelWidth,
        loadPanelWidth,
        loadDetailToolsPref,
        loadWaveformPref,
        toggleWaveform,
        loadTimelineZoomPref,
        saveTimelineZoomPref,
    } = prefsCtx;

    const undoCtx = {
        state,
        els,
        utils: editorParts.utils,
        setDirty,
        renderCueList,
        setStatus,
        syncDetailToCue,
        editorConfirm,
        closeFindReplaceModal,
    };
    editorParts.installUndo(undoCtx);
    const {
        recordUndoBeforeChange,
        beginDetailUndoGroup,
        clearUndoHistory,
        undo,
        redo,
        saveInitialSnapshot,
        restoreInitialSnapshot,
    } = undoCtx;

    function bindEvents() {
        loadTheme();
        loadPanelWidth();
        loadDetailToolsPref();
        loadAutoFocusPref();
        loadWaveformPref();
        state.timeline.zoom = loadTimelineZoomPref();
        bindPanelSplitter();
        bindTimelineInteractions();

        els.themeToggle?.addEventListener('click', toggleTheme);
        els.settingsBtn?.addEventListener('click', () => {
            void openEditorSettings();
        });
        els.autoFocusBtn?.addEventListener('click', toggleAutoFocus);
        els.waveformToggle?.addEventListener('click', toggleWaveform);
        els.toolsMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasHidden = els.toolsMenu?.classList.contains('hidden');
            closeToolsMenu();
            if (wasHidden) {
                els.toolsMenu?.classList.remove('hidden');
                els.toolsMenuBtn?.setAttribute('aria-expanded', 'true');
            }
        });
        document.addEventListener('click', (e) => {
            if (els.toolsMenu && !els.toolsMenu.classList.contains('hidden')
                && !els.toolsMenu.contains(e.target)
                && e.target !== els.toolsMenuBtn
                && !els.toolsMenuBtn?.contains(e.target)) {
                closeToolsMenu();
            }
        });
        els.toolsMenu?.addEventListener('click', () => {
            // keep menu open for non-modal actions? close after any click
            setTimeout(closeToolsMenu, 0);
        });

        document.querySelectorAll('[data-list-filter]').forEach((btn) => {
            btn.addEventListener('click', () => setListFilter(btn.getAttribute('data-list-filter')));
        });
        els.nextIssueBtn?.addEventListener('click', jumpToNextIssue);

        els.playPauseBtn?.addEventListener('click', toggleVideoPlayback);
        els.seekBackBtn?.addEventListener('click', () => seekVideoBy(-1));
        els.seekFwdBtn?.addEventListener('click', () => seekVideoBy(1));
        els.rateSelect?.addEventListener('change', () => {
            if (els.video) els.video.playbackRate = Number(els.rateSelect.value) || 1;
        });
        els.volumeSlider?.addEventListener('input', () => {
            if (els.video) els.video.volume = Number(els.volumeSlider.value) || 0;
        });

        els.saveBtn?.addEventListener('click', saveDocument);
        els.addCueBtn?.addEventListener('click', insertCueAtPlayhead);
        els.insertCueBtn?.addEventListener('click', insertCueAtPlayhead);
        els.detailInsertCueBtn?.addEventListener('click', insertCueAtPlayhead);
        els.retranscribeCueBtn?.addEventListener('click', openRetranscribeDurModal);
        els.openFileBtn?.addEventListener('click', pickAndOpenInWindow);
        els.shiftBackBtn?.addEventListener('click', () => shiftAllCues(-500));
        els.shiftFwdBtn?.addEventListener('click', () => shiftAllCues(500));
        els.linkVideoBtn?.addEventListener('click', linkVideo);
        els.findReplaceBtn?.addEventListener('click', () => openFindReplaceModal(false));
        els.glossaryBtn?.addEventListener('click', () => { void openGlossaryModal(); });
        els.breakWordsBtn?.addEventListener('click', openBreakWordsModal);
        els.splitOpenBreakWordsBtn?.addEventListener('click', openBreakWordsModal);
        els.smartSplitOpenBreakWordsBtn?.addEventListener('click', openBreakWordsModal);
        els.breakWordsClose?.addEventListener('click', closeBreakWordsModal);
        els.breakWordsModal?.querySelectorAll('[data-break-words-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeBreakWordsModal();
            });
        });
        els.breakWordsAddBtn?.addEventListener('click', addBreakWordsFromInput);
        els.breakWordsResetBtn?.addEventListener('click', resetBreakWordsToDefault);
        els.breakWordsClearBtn?.addEventListener('click', clearBreakWords);
        els.breakWordsInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addBreakWordsFromInput();
            }
        });
        els.breakWordsChips?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-break-word-remove]');
            if (!btn) return;
            removeBreakWord(btn.getAttribute('data-break-word-remove') || '');
        });
        els.findReplaceClose?.addEventListener('click', closeFindReplaceModal);
        els.findReplaceModal?.querySelectorAll('[data-find-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeFindReplaceModal();
            });
        });
        els.glossaryCancel?.addEventListener('click', closeGlossaryModal);
        els.glossaryModal?.querySelectorAll('[data-glossary-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeGlossaryModal();
            });
        });
        els.glossaryEntryList?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-glossary-id]');
            if (!btn) return;
            selectGlossaryEntry(btn.getAttribute('data-glossary-id'));
        });
        els.glossaryIssueList?.addEventListener('click', (e) => {
            const item = e.target.closest('[data-glossary-entry-id]');
            if (!item) return;
            const entryId = item.getAttribute('data-glossary-entry-id');
            if (entryId) selectGlossaryEntry(entryId);
            const idx = Number(item.getAttribute('data-glossary-issue-idx'));
            if (Number.isFinite(idx) && idx >= 0) selectCue(idx);
        });
        els.glossaryAddBtn?.addEventListener('click', beginNewGlossaryEntry);
        els.glossarySaveEntryBtn?.addEventListener('click', () => { void saveGlossaryEntryFromForm(); });
        els.glossaryDeleteEntryBtn?.addEventListener('click', () => { void deleteGlossaryEntryFromForm(); });
        els.glossaryImportBtn?.addEventListener('click', () => { void importGlossaryFile(); });
        els.glossaryExportBtn?.addEventListener('click', () => { void exportGlossaryFile(); });
        els.glossaryModal?.querySelectorAll('input[name="editorGlossaryScope"]').forEach((el) => {
            el.addEventListener('change', () => {
                void switchGlossaryScope(readGlossaryScopeFromUi());
            });
        });
        els.glossaryScanBtn?.addEventListener('click', () => {
            updateGlossaryModalState();
            setStatus(
                state.glossaryIssues.length
                    ? `发现 ${state.glossaryIssues.length} 处术语不一致`
                    : '未发现术语不一致',
                state.glossaryIssues.length ? 'warn' : 'ok',
            );
        });
        els.glossaryConfirm?.addEventListener('click', () => { void applyGlossaryUnification(); });
        els.findInput?.addEventListener('input', () => runFindSearch({ navigate: false }));
        els.findCase?.addEventListener('change', () => runFindSearch({ navigate: false }));
        els.findNextBtn?.addEventListener('click', findNextMatch);
        els.findPrevBtn?.addEventListener('click', findPrevMatch);
        els.replaceOneBtn?.addEventListener('click', replaceCurrentMatch);
        els.replaceAllBtn?.addEventListener('click', replaceAllMatches);
        els.batchDurBtn?.addEventListener('click', openBatchDurModal);
        els.batchDurConfirm?.addEventListener('click', confirmBatchDurAdjust);
        els.batchDurCancel?.addEventListener('click', closeBatchDurModal);
        els.batchDurModal?.querySelectorAll('[data-batch-dur-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeBatchDurModal();
            });
        });
        document.querySelectorAll('input[name="editorBatchDurCond"]').forEach((el) => {
            el.addEventListener('change', updateBatchDurModalState);
        });
        document.querySelectorAll('input[name="editorBatchDurMode"]').forEach((el) => {
            el.addEventListener('change', updateBatchDurModalState);
        });
        [
            els.batchDurTarget,
            els.batchDurSilenceDb,
            els.batchDurSilenceDur,
            els.batchDurSnapPadMs,
            els.batchDurShorter,
            els.batchDurLonger,
            els.batchDurMin,
            els.batchDurMax,
            els.batchDurCpsAbove,
            els.batchDurCpsBelow,
            els.batchDurText,
            els.batchDurAvoidOverlap,
        ].forEach((el) => {
            el?.addEventListener('input', updateBatchDurModalState);
            el?.addEventListener('change', updateBatchDurModalState);
        });
        els.smartAdjustBtn?.addEventListener('click', openSmartAdjustModal);
        els.removeNoiseBtn?.addEventListener('click', openRemoveNoiseModal);
        els.chineseConvertBtn?.addEventListener('click', openChineseConvertModal);
        els.chineseConvertConfirm?.addEventListener('click', confirmChineseConvert);
        els.chineseConvertCancel?.addEventListener('click', closeChineseConvertModal);
        els.chineseConvertModal?.querySelectorAll('[data-chinese-dismiss]').forEach((el) => {
            el.addEventListener('click', closeChineseConvertModal);
        });
        els.chineseConvertModal?.querySelectorAll('input[type="radio"]').forEach((el) => {
            el.addEventListener('change', updateChineseConvertModalState);
        });
        els.chineseProtectGlossary?.addEventListener('change', updateChineseConvertModalState);
        els.compressRepBtn?.addEventListener('click', openCompressRepModal);
        els.compressRepConfirm?.addEventListener('click', confirmCompressRep);
        els.compressRepCancel?.addEventListener('click', closeCompressRepModal);
        els.compressRepModal?.querySelectorAll('[data-compress-rep-dismiss]').forEach((el) => {
            el.addEventListener('click', closeCompressRepModal);
        });
        els.compressRepModal?.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((el) => {
            el.addEventListener('change', updateCompressRepModalState);
        });
        els.qcBtn?.addEventListener('click', openQcModal);
        els.retranscribeDurBtn?.addEventListener('click', openRetranscribeDurModal);
        els.smartSplitBtn?.addEventListener('click', openSmartSplitModal);
        els.silenceSplitBtn?.addEventListener('click', () => openSilenceSplitModal());
        els.smartSplitCueBtn?.addEventListener('click', () => {
            const prefs = loadSplitPrefs();
            quickSplitSelectedCue('smart', {
                smartMaxChars: prefs.smartMaxChars,
                smartLineChars: prefs.smartLineChars,
                useCps: prefs.useCps,
                fixOverlap: prefs.fixOverlap,
            });
        });
        els.silenceSplitCueBtn?.addEventListener('click', () => quickSilenceSplitSelectedCue());
        els.compressRepCueBtn?.addEventListener('click', () => quickCompressRepSelectedCue());
        els.splitLinesBtn?.addEventListener('click', () => quickSplitSelectedCue('lines'));
        els.splitSpacesBtn?.addEventListener('click', () => quickSplitSelectedCue('spaces'));
        els.charDurBtn?.addEventListener('click', () => charCountAdjustSelectedCueDuration());
        els.smartDurBtn?.addEventListener('click', () => silenceAdjustSelectedCueDuration());
        els.audioSnapBtn?.addEventListener('click', () => { void silenceSnapSelectedCueTiming(); });
        els.silenceSplitConfirm?.addEventListener('click', confirmBatchSilenceSplit);
        els.silenceProgressCancel?.addEventListener('click', () => {
            requestEditorJobAbort();
        });
        els.silenceSplitCancel?.addEventListener('click', closeSilenceSplitModal);
        els.silenceSplitModal?.querySelectorAll('[data-silence-split-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeSilenceSplitModal();
            });
        });
        document.querySelectorAll('input[name="editorSilenceSplitCond"]').forEach((el) => {
            el.addEventListener('change', updateSilenceSplitModalState);
        });
        [
            els.silenceSplitDb,
            els.silenceSplitDur,
            els.silenceSplitDurLong,
            els.silenceSplitCpsAbove,
            els.silenceSplitCharsLong,
            els.silenceSplitFixOverlap,
        ].forEach((el) => {
            el?.addEventListener('input', updateSilenceSplitModalState);
            el?.addEventListener('change', updateSilenceSplitModalState);
        });
        els.smartSplitConfirm?.addEventListener('click', confirmBatchSmartSplit);
        els.smartSplitCancel?.addEventListener('click', closeSmartSplitModal);
        els.smartSplitModal?.querySelectorAll('[data-smart-split-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeSmartSplitModal();
            });
        });
        document.querySelectorAll('input[name="editorSmartSplitCond"]').forEach((el) => {
            el.addEventListener('change', updateSmartSplitModalState);
        });
        [
            els.smartSplitMaxChars,
            els.smartSplitLineChars,
            els.smartSplitCpsAbove,
            els.smartSplitLineLen,
            els.smartSplitDurLong,
            els.smartSplitCharsLong,
            els.smartSplitUseCps,
            els.smartSplitFixOverlap,
        ].forEach((el) => {
            el?.addEventListener('input', updateSmartSplitModalState);
            el?.addEventListener('change', updateSmartSplitModalState);
        });
        els.smartAdjustConfirm?.addEventListener('click', confirmSmartAdjust);
        els.smartAdjustCancel?.addEventListener('click', closeSmartAdjustModal);
        els.smartAdjustModal?.querySelectorAll('[data-smart-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeSmartAdjustModal();
            });
        });
        els.removeNoiseConfirm?.addEventListener('click', confirmRemoveNoise);
        els.removeNoiseCancel?.addEventListener('click', closeRemoveNoiseModal);
        els.removeNoiseModal?.querySelectorAll('[data-remove-noise-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeRemoveNoiseModal();
            });
        });
        [
            els.noiseRemoveEmpty,
            els.noiseRemoveFragments,
            els.noiseRemoveSoundEffects,
            els.noiseRemoveSymbolOnly,
            els.noiseRemoveDuplicates,
            els.noiseRemoveHallucinations,
        ].forEach((el) => {
            el?.addEventListener('change', updateRemoveNoiseModalState);
        });
        els.qcConfirm?.addEventListener('click', () => confirmQcFix());
        els.qcFixFiltered?.addEventListener('click', () => confirmQcFix({ filtered: true }));
        els.qcCancel?.addEventListener('click', closeQcModal);
        els.qcModal?.querySelectorAll('[data-qc-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeQcModal();
            });
        });
        els.qcSummaryBar?.addEventListener('click', (e) => {
            const chip = e.target.closest?.('[data-qc-type]');
            if (!chip || !els.qcSummaryBar.contains(chip)) return;
            const raw = chip.getAttribute('data-qc-type');
            setQcTypeFilter(raw || null);
        });
        els.qcIssueList?.addEventListener('click', (e) => {
            const btn = e.target.closest?.('[data-qc-idx]');
            if (!btn) return;
            const idx = Number(btn.getAttribute('data-qc-idx'));
            if (!Number.isFinite(idx) || idx < 0) return;
            selectCue(idx, { scroll: true, seek: true });
        });
        [
            els.qcFixOverlap,
            els.qcFixCpsSplit,
            els.qcFixCpsExtend,
            els.qcEnforceMin,
            els.qcEnforceMax,
            els.qcCompressRep,
            els.qcMaxCps,
            els.qcMinSec,
            els.qcMaxSec,
            els.qcGapMs,
        ].forEach((el) => {
            el?.addEventListener('input', updateQcModalState);
            el?.addEventListener('change', updateQcModalState);
        });
        els.retranscribeDurConfirm?.addEventListener('click', () => { void confirmRetranscribeDur(); });
        els.retranscribeDurAll?.addEventListener('click', () => { void confirmRetranscribeAll(); });
        els.retranscribeDurCancel?.addEventListener('click', closeRetranscribeDurModal);
        els.retranscribeDurModal?.querySelectorAll('[data-retranscribe-dur-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeRetranscribeDurModal();
            });
        });
        document.querySelectorAll('input[name="editorRetranscribeDurStart"]').forEach((el) => {
            el.addEventListener('change', updateRetranscribeDurModalState);
        });
        [els.retranscribeDurSec, els.retranscribeDurPadMs].forEach((el) => {
            el?.addEventListener('input', updateRetranscribeDurModalState);
            el?.addEventListener('change', updateRetranscribeDurModalState);
        });
        document.querySelectorAll('[data-retranscribe-dur-preset]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const sec = Number(btn.getAttribute('data-retranscribe-dur-preset'));
                if (!Number.isFinite(sec) || !els.retranscribeDurSec) return;
                els.retranscribeDurSec.value = String(sec);
                updateRetranscribeDurModalState();
            });
        });
        [
            els.smartFixOverlap,
            els.smartFixCps,
            els.smartEnforceMin,
            els.smartEnforceMax,
            els.smartMaxCps,
            els.smartMinSec,
            els.smartMaxSec,
            els.smartGapMs,
        ].forEach((el) => {
            el?.addEventListener('input', updateSmartAdjustModalState);
            el?.addEventListener('change', updateSmartAdjustModalState);
        });
        els.restoreBtn?.addEventListener('click', restoreInitialSnapshot);
        els.findInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                findNextMatch();
            } else if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                findPrevMatch();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeFindReplaceModal();
            }
        });
        els.replaceInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                replaceCurrentMatch();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeFindReplaceModal();
            }
        });

        els.prevCueBtn?.addEventListener('click', () => selectCue(state.selectedIndex - 1, { scroll: true }));
        els.nextCueBtn?.addEventListener('click', () => selectCue(state.selectedIndex + 1, { scroll: true }));
        els.deleteCueBtn?.addEventListener('click', deleteSelectedCue);
        els.splitCueBtn?.addEventListener('click', openSplitModal);
        els.splitConfirm?.addEventListener('click', confirmSplit);
        els.splitCancel?.addEventListener('click', closeSplitModal);
        els.splitModal?.querySelectorAll('[data-split-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeSplitModal();
            });
        });
        document.querySelectorAll('input[name="editorSplitMode"]').forEach((el) => {
            el.addEventListener('change', updateSplitModalState);
        });
        [
            els.splitCharCount,
            els.splitCount,
            els.splitSmartMaxChars,
            els.splitSmartLineChars,
            els.splitSilenceDb,
            els.splitSilenceDur,
            els.splitUseCps,
            els.splitFixOverlap,
        ].forEach((el) => {
            el?.addEventListener('input', updateSplitModalState);
            el?.addEventListener('change', updateSplitModalState);
        });
        els.splitRemember?.addEventListener('change', saveSplitPrefs);
        els.detailText?.addEventListener('click', () => {
            if (!els.splitModal?.classList.contains('hidden')) updateSplitModalState();
        });
        els.detailText?.addEventListener('keyup', () => {
            if (!els.splitModal?.classList.contains('hidden')) updateSplitModalState();
        });
        els.detailText?.addEventListener('keydown', (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            const delta = e.key === 'ArrowUp' ? -1 : 1;
            const next = state.selectedIndex + delta;
            if (next < 0 || next >= state.cues.length) return;
            e.preventDefault();
            e.stopPropagation();
            selectCue(next, { scroll: true });
            requestAnimationFrame(() => {
                if (!els.detailText) return;
                els.detailText.focus();
                const len = els.detailText.value.length;
                els.detailText.setSelectionRange(len, len);
            });
        });

        els.startNudgeBack?.addEventListener('click', () => applyStartDelta(-100));
        els.startNudgeFwd?.addEventListener('click', () => applyStartDelta(100));
        els.durNudgeDown?.addEventListener('click', () => applyDurationDelta(-0.1));
        els.durNudgeUp?.addEventListener('click', () => applyDurationDelta(0.1));
        els.setStartToPlayhead?.addEventListener('click', setStartToPlayhead);
        els.setEndToPlayhead?.addEventListener('click', setEndToPlayhead);
        els.undoBtn?.addEventListener('click', undo);
        els.redoBtn?.addEventListener('click', redo);
        els.shortcutsBtn?.addEventListener('click', openShortcutsModal);
        els.shortcutsClose?.addEventListener('click', closeShortcutsModal);
        els.shortcutsModal?.querySelectorAll('[data-shortcuts-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeShortcutsModal();
            });
        });

        els.detailStart?.addEventListener('change', () => {
            onDetailChanged();
            renderTimeline();
        });
        els.detailDuration?.addEventListener('change', () => {
            onDetailChanged();
            renderTimeline();
        });
        els.detailDuration?.addEventListener('input', () => {
            if (els.detailEnd && state.selectedIndex >= 0) {
                const cue = state.cues[state.selectedIndex];
                const durSec = Number(els.detailDuration.value);
                if (Number.isFinite(durSec)) {
                    els.detailEnd.value = formatDisplayTime(cue.startMs + Math.round(durSec * 1000), state.format);
                }
            }
            updateDetailMeta();
            updateDetailActionButtons();
        });
        els.detailText?.addEventListener('input', onDetailChanged);
        els.targetCps?.addEventListener('input', () => {
            saveTargetCpsPrefs();
            updateDetailMeta();
            if (els.splitModal && !els.splitModal.classList.contains('hidden')) updateSplitModalState();
            if (els.smartSplitModal && !els.smartSplitModal.classList.contains('hidden')) updateSmartSplitModalState();
        });
        els.targetCps?.addEventListener('change', () => {
            saveTargetCpsPrefs();
            updateDetailMeta();
            if (els.splitModal && !els.splitModal.classList.contains('hidden')) updateSplitModalState();
            if (els.smartSplitModal && !els.smartSplitModal.classList.contains('hidden')) updateSmartSplitModalState();
        });

        els.sidecarSelect?.addEventListener('change', async (e) => {
            if (!state.dirty || await editorConfirm('切换字幕后当前修改将丢失，继续？')) {
                await loadDocument(e.target.value, state.videoPath);
            } else {
                e.target.value = state.path;
            }
        });

        els.cueBody?.addEventListener('click', (e) => {
            const row = e.target.closest('tr[data-cue-idx]');
            if (!row) return;
            const idx = Number(row.dataset.cueIdx);
            selectCue(idx, {
                scroll: true,
                additive: e.ctrlKey || e.metaKey,
                range: e.shiftKey,
            });
            focusCueList();
        });

        els.cueBody?.addEventListener('dblclick', (e) => {
            const row = e.target.closest('tr[data-cue-idx]');
            if (!row) return;
            const idx = Number(row.dataset.cueIdx);
            selectCue(idx, { seek: true, scroll: true });
            focusCueList();
        });

        els.cueBody?.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('tr[data-cue-idx]');
            if (!row) return;
            e.preventDefault();
            openCueContextMenuAt(Number(row.dataset.cueIdx), e.clientX, e.clientY, { scroll: false });
        });

        els.cueContextMenu?.querySelectorAll('[data-ctx-action]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (btn.disabled) return;
                handleContextMenuAction(btn.dataset.ctxAction);
            });
        });

        document.addEventListener('click', (e) => {
            if (!els.cueContextMenu?.classList.contains('hidden')
                && !els.cueContextMenu?.contains(e.target)) {
                hideCueContextMenu();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && els.cueContextMenu && !els.cueContextMenu.classList.contains('hidden')) {
                hideCueContextMenu();
            }
        });
        els.cueBody?.closest('.editor-list-wrap')?.addEventListener('scroll', hideCueContextMenu);
        window.addEventListener('resize', hideCueContextMenu);

        els.listWrap?.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('tr[data-cue-idx]')) return;
            focusCueList();
        });

        els.videoWrap?.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('button, select, input, textarea, a, [contenteditable="true"]')) return;
            focusPlayerArea();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (state.silenceSplitBusy || state.retranscribeBusy) {
                    e.preventDefault();
                    requestEditorJobAbort();
                    return;
                }
                if (els.shortcutsModal && !els.shortcutsModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeShortcutsModal();
                    return;
                }
                if (els.silenceSplitModal && !els.silenceSplitModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeSilenceSplitModal();
                    return;
                }
                if (els.smartSplitModal && !els.smartSplitModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeSmartSplitModal();
                    return;
                }
                if (els.smartAdjustModal && !els.smartAdjustModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeSmartAdjustModal();
                    return;
                }
                if (els.removeNoiseModal && !els.removeNoiseModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeRemoveNoiseModal();
                    return;
                }
                if (els.chineseConvertModal && !els.chineseConvertModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeChineseConvertModal();
                    return;
                }
                if (els.compressRepModal && !els.compressRepModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeCompressRepModal();
                    return;
                }
                if (els.qcModal && !els.qcModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeQcModal();
                    return;
                }
                if (els.retranscribeDurModal && !els.retranscribeDurModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeRetranscribeDurModal();
                    return;
                }
                if (els.batchDurModal && !els.batchDurModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeBatchDurModal();
                    return;
                }
                if (els.findReplaceModal && !els.findReplaceModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeFindReplaceModal();
                    return;
                }
                if (els.glossaryModal && !els.glossaryModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeGlossaryModal();
                    return;
                }
                if (els.breakWordsModal && !els.breakWordsModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeBreakWordsModal();
                    return;
                }
                if (els.splitModal && !els.splitModal.classList.contains('hidden')) {
                    e.preventDefault();
                    closeSplitModal();
                    return;
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
                return;
            }
            if (e.key === 'F11') {
                e.preventDefault();
                setStartToPlayhead();
                return;
            }
            if (e.key === 'F12') {
                e.preventDefault();
                setEndToPlayhead();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                openFindReplaceModal(false);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) {
                e.preventDefault();
                openFindReplaceModal(true);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveDocument();
                return;
            }
            if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (e.target.matches('input, textarea')) return;
                const modalOpen = [
                    els.splitModal,
                    els.findReplaceModal,
                    els.glossaryModal,
                    els.breakWordsModal,
                    els.batchDurModal,
                    els.smartSplitModal,
                    els.silenceSplitModal,
                    els.smartAdjustModal,
                    els.removeNoiseModal,
                    els.chineseConvertModal,
                    els.compressRepModal,
                    els.qcModal,
                    els.retranscribeDurModal,
                    els.shortcutsModal,
                ].some((m) => m && !m.classList.contains('hidden'));
                if (modalOpen) return;
                if (state.selectedIndex < 0 && !getSelectedCueIndexes().length) return;
                e.preventDefault();
                deleteSelectedCue();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 'a') {
                if (isTypingTarget(e.target)) return;
                if (isListFocused() || e.target === document.body || e.target === document.documentElement) {
                    e.preventDefault();
                    selectAllVisibleCues();
                    return;
                }
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 'm') {
                if (isTypingTarget(e.target)) return;
                if (isListFocused()) {
                    e.preventDefault();
                    mergeSelectedCues();
                    return;
                }
            }
            if (e.key === ' ' || e.code === 'Space') {
                if (isTypingTarget(e.target)) return;
                if (isListFocused() || isPlayerFocused()) {
                    e.preventDefault();
                    toggleVideoPlayback();
                    return;
                }
            }
            if (isListFocused()) {
                if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                    e.preventDefault();
                    insertCueAtPlayhead();
                    return;
                }
            }
            // 文字编辑框内的 Ctrl+↑/↓ 由 detailText 自身处理；此处跳过以免重复
            if (e.target === els.detailText && (e.ctrlKey || e.metaKey)
                && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                return;
            }
            if (e.target.matches('input, textarea') && !e.ctrlKey && !e.metaKey) return;
            if (e.key === 'ArrowUp' && state.selectedIndex > 0) {
                e.preventDefault();
                selectCue(state.selectedIndex - 1, { scroll: true });
            } else if (e.key === 'ArrowDown' && state.selectedIndex < state.cues.length - 1) {
                e.preventDefault();
                selectCue(state.selectedIndex + 1, { scroll: true });
            }
        });

        els.video?.addEventListener('play', onVideoPlay);
        els.video?.addEventListener('pause', onVideoPause);
        els.video?.addEventListener('ended', onVideoPause);
        els.video?.addEventListener('playing', () => {
            requestAnimationFrame(() => {
                const v = els.video;
                if (!v || v.paused) return;
                if (v.videoWidth > 0 && v.videoHeight > 0) return;
                const codec = String(state.videoCodec || '').toLowerCase();
                const soft = ['hevc', 'h265', 'av1', 'vp9'].includes(codec);
                setStatus(
                    soft
                        ? '内置播放器无法解码该视频编码（黑屏仅有声音），可尝试 H.264 版本或安装 HEVC 视频扩展'
                        : '视频正在播放但无画面，请检查视频文件',
                    'err',
                );
            });
        });
        els.video?.addEventListener('seeked', () => {
            syncPlaybackFromVideo(true);
            if (els.video && !els.video.paused) scheduleCueBoundarySync();
        });
        els.video?.addEventListener('ratechange', () => {
            if (els.video && !els.video.paused) scheduleCueBoundarySync();
        });
        els.video?.addEventListener('loadedmetadata', () => {
            updateTimelineDuration();
            renderTimeline();
            updatePlayPauseButton();
        });
        els.video?.addEventListener('timeupdate', () => {
            if (els.video && !els.video.paused) {
                updateTimelinePlayhead(Math.round((els.video.currentTime || 0) * 1000), { follow: true });
            }
        });
    }

    function cacheElements() {
        Object.assign(els, {
            formatBadge: document.getElementById('editorFormatBadge'),
            autoFocusBtn: document.getElementById('editorAutoFocusBtn'),
            waveformToggle: document.getElementById('editorWaveformToggle'),
            cueCount: document.getElementById('editorCueCount'),
            lowConfBadge: document.getElementById('editorLowConfBadge'),
            dirtyBadge: document.getElementById('editorDirtyBadge'),
            saveStatus: document.getElementById('editorSaveStatus'),
            saveBtn: document.getElementById('editorSaveBtn'),
            addCueBtn: document.getElementById('editorAddCueBtn'),
            insertCueBtn: document.getElementById('editorInsertCueBtn'),
            detailInsertCueBtn: document.getElementById('editorDetailInsertCueBtn'),
            retranscribeCueBtn: document.getElementById('editorRetranscribeCueBtn'),
            playheadTime: document.getElementById('editorPlayheadTime'),
            openFileBtn: document.getElementById('editorOpenFileBtn'),
            undoBtn: document.getElementById('editorUndoBtn'),
            redoBtn: document.getElementById('editorRedoBtn'),
            toolsMenuBtn: document.getElementById('editorToolsMenuBtn'),
            toolsMenu: document.getElementById('editorToolsMenu'),
            themeToggle: document.getElementById('editorThemeToggle'),
            settingsBtn: document.getElementById('editorSettingsBtn'),
            splitter: document.getElementById('editorSplitter'),
            cuesPanel: document.getElementById('editorCuesPanel'),
            main: document.querySelector('.editor-main'),
            filterCount: document.getElementById('editorFilterCount'),
            nextIssueBtn: document.getElementById('editorNextIssueBtn'),
            detailTools: document.getElementById('editorDetailTools'),
            playPauseBtn: document.getElementById('editorPlayPauseBtn'),
            seekBackBtn: document.getElementById('editorSeekBackBtn'),
            seekFwdBtn: document.getElementById('editorSeekFwdBtn'),
            rateSelect: document.getElementById('editorRateSelect'),
            volumeSlider: document.getElementById('editorVolumeSlider'),
            videoEmpty: document.getElementById('editorVideoEmpty'),
            timelineStack: document.getElementById('editorTimelineStack'),
            timeline: document.getElementById('editorTimeline'),
            timelineTrack: document.getElementById('editorTimelineTrack'),
            waveformRow: document.getElementById('editorWaveformRow'),
            waveformTrack: document.getElementById('editorWaveformTrack'),
            timelineWaveform: document.getElementById('editorTimelineWaveform'),
            waveformPlayhead: document.getElementById('editorWaveformPlayhead'),
            waveformLoading: document.getElementById('editorWaveformLoading'),
            waveformLoadingText: document.getElementById('editorWaveformLoadingText'),
            timelineCues: document.getElementById('editorTimelineCues'),
            timelinePlayhead: document.getElementById('editorTimelinePlayhead'),
            timelineHScrollWrap: document.getElementById('editorTimelineHScrollWrap'),
            timelineHScroll: document.getElementById('editorTimelineHScroll'),
            timelineZoomIn: document.getElementById('editorTimelineZoomIn'),
            timelineZoomOut: document.getElementById('editorTimelineZoomOut'),
            timelineZoomFit: document.getElementById('editorTimelineZoomFit'),
            shortcutsBtn: document.getElementById('editorShortcutsBtn'),
            shortcutsModal: document.getElementById('editorShortcutsModal'),
            shortcutsClose: document.getElementById('editorShortcutsClose'),
            shiftBackBtn: document.getElementById('editorShiftBackBtn'),
            shiftFwdBtn: document.getElementById('editorShiftFwdBtn'),
            linkVideoBtn: document.getElementById('editorLinkVideoBtn'),
            findReplaceBtn: document.getElementById('editorFindReplaceBtn'),
            findReplaceModal: document.getElementById('editorFindReplaceModal'),
            findReplaceClose: document.getElementById('editorFindReplaceClose'),
            glossaryBtn: document.getElementById('editorGlossaryBtn'),
            glossaryBadge: document.getElementById('editorGlossaryBadge'),
            glossaryModal: document.getElementById('editorGlossaryModal'),
            glossaryScopeGlobal: document.getElementById('editorGlossaryScopeGlobal'),
            glossaryScopeProject: document.getElementById('editorGlossaryScopeProject'),
            glossaryScopeProjectLabel: document.getElementById('editorGlossaryScopeProjectLabel'),
            glossaryEntryList: document.getElementById('editorGlossaryEntryList'),
            glossaryIssueList: document.getElementById('editorGlossaryIssueList'),
            glossaryCanonical: document.getElementById('editorGlossaryCanonical'),
            glossaryAliases: document.getElementById('editorGlossaryAliases'),
            glossaryCaseSensitive: document.getElementById('editorGlossaryCaseSensitive'),
            glossaryEnabled: document.getElementById('editorGlossaryEnabled'),
            glossaryAddBtn: document.getElementById('editorGlossaryAddBtn'),
            glossarySaveEntryBtn: document.getElementById('editorGlossarySaveEntryBtn'),
            glossaryDeleteEntryBtn: document.getElementById('editorGlossaryDeleteEntryBtn'),
            glossaryImportBtn: document.getElementById('editorGlossaryImportBtn'),
            glossaryExportBtn: document.getElementById('editorGlossaryExportBtn'),
            glossaryScanBtn: document.getElementById('editorGlossaryScanBtn'),
            breakWordsBtn: document.getElementById('editorBreakWordsBtn'),
            splitOpenBreakWordsBtn: document.getElementById('editorSplitOpenBreakWordsBtn'),
            smartSplitOpenBreakWordsBtn: document.getElementById('editorSmartSplitOpenBreakWordsBtn'),
            breakWordsModal: document.getElementById('editorBreakWordsModal'),
            breakWordsChips: document.getElementById('editorBreakWordsChips'),
            breakWordsInput: document.getElementById('editorBreakWordsInput'),
            breakWordsAddBtn: document.getElementById('editorBreakWordsAddBtn'),
            breakWordsResetBtn: document.getElementById('editorBreakWordsResetBtn'),
            breakWordsClearBtn: document.getElementById('editorBreakWordsClearBtn'),
            breakWordsClose: document.getElementById('editorBreakWordsClose'),
            breakWordsStatus: document.getElementById('editorBreakWordsStatus'),
            glossaryPreview: document.getElementById('editorGlossaryPreview'),
            glossaryConfirm: document.getElementById('editorGlossaryConfirm'),
            glossaryCancel: document.getElementById('editorGlossaryCancel'),
            findInput: document.getElementById('editorFindInput'),
            replaceInput: document.getElementById('editorReplaceInput'),
            findCase: document.getElementById('editorFindCase'),
            findStatus: document.getElementById('editorFindStatus'),
            findPrevBtn: document.getElementById('editorFindPrevBtn'),
            findNextBtn: document.getElementById('editorFindNextBtn'),
            replaceOneBtn: document.getElementById('editorReplaceOneBtn'),
            replaceAllBtn: document.getElementById('editorReplaceAllBtn'),
            batchDurBtn: document.getElementById('editorBatchDurBtn'),
            batchDurModal: document.getElementById('editorBatchDurModal'),
            batchDurFixedWrap: document.getElementById('editorBatchDurFixedWrap'),
            batchDurSilenceWrap: document.getElementById('editorBatchDurSilenceWrap'),
            batchDurTarget: document.getElementById('editorBatchDurTarget'),
            batchDurHint: document.getElementById('editorBatchDurHint'),
            batchDurSilenceDb: document.getElementById('editorBatchDurSilenceDb'),
            batchDurSilenceDur: document.getElementById('editorBatchDurSilenceDur'),
            batchDurSnapPadWrap: document.getElementById('editorBatchDurSnapPadWrap'),
            batchDurSnapPadMs: document.getElementById('editorBatchDurSnapPadMs'),
            batchDurAvoidOverlapRow: document.getElementById('editorBatchDurAvoidOverlapRow'),
            batchDurShorter: document.getElementById('editorBatchDurShorter'),
            batchDurLonger: document.getElementById('editorBatchDurLonger'),
            batchDurMin: document.getElementById('editorBatchDurMin'),
            batchDurMax: document.getElementById('editorBatchDurMax'),
            batchDurCpsAbove: document.getElementById('editorBatchDurCpsAbove'),
            batchDurCpsBelow: document.getElementById('editorBatchDurCpsBelow'),
            batchDurText: document.getElementById('editorBatchDurText'),
            batchDurAvoidOverlap: document.getElementById('editorBatchDurAvoidOverlap'),
            batchDurPreview: document.getElementById('editorBatchDurPreview'),
            batchDurConfirm: document.getElementById('editorBatchDurConfirm'),
            batchDurCancel: document.getElementById('editorBatchDurCancel'),
            smartAdjustBtn: document.getElementById('editorSmartAdjustBtn'),
            qcBtn: document.getElementById('editorQcBtn'),
            qcBadge: document.getElementById('editorQcBadge'),
            retranscribeDurBtn: document.getElementById('editorRetranscribeDurBtn'),
            retranscribeDurModal: document.getElementById('editorRetranscribeDurModal'),
            retranscribeDurSec: document.getElementById('editorRetranscribeDurSec'),
            retranscribeDurPadMs: document.getElementById('editorRetranscribeDurPadMs'),
            retranscribeDurSnapAfter: document.getElementById('editorRetranscribeDurSnapAfter'),
            retranscribeDurPreview: document.getElementById('editorRetranscribeDurPreview'),
            retranscribeDurConfirm: document.getElementById('editorRetranscribeDurConfirm'),
            retranscribeDurAll: document.getElementById('editorRetranscribeDurAll'),
            retranscribeDurCancel: document.getElementById('editorRetranscribeDurCancel'),
            qcModal: document.getElementById('editorQcModal'),
            qcSummaryBar: document.getElementById('editorQcSummaryBar'),
            qcIssueList: document.getElementById('editorQcIssueList'),
            qcFixOverlap: document.getElementById('editorQcFixOverlap'),
            qcFixCpsSplit: document.getElementById('editorQcFixCpsSplit'),
            qcFixCpsExtend: document.getElementById('editorQcFixCpsExtend'),
            qcEnforceMin: document.getElementById('editorQcEnforceMin'),
            qcEnforceMax: document.getElementById('editorQcEnforceMax'),
            qcCompressRep: document.getElementById('editorQcCompressRep'),
            qcMaxCps: document.getElementById('editorQcMaxCps'),
            qcMinSec: document.getElementById('editorQcMinSec'),
            qcMaxSec: document.getElementById('editorQcMaxSec'),
            qcGapMs: document.getElementById('editorQcGapMs'),
            qcPreview: document.getElementById('editorQcPreview'),
            qcConfirm: document.getElementById('editorQcConfirm'),
            qcFixFiltered: document.getElementById('editorQcFixFiltered'),
            qcCancel: document.getElementById('editorQcCancel'),
            smartSplitBtn: document.getElementById('editorSmartSplitBtn'),
            silenceSplitBtn: document.getElementById('editorSilenceSplitBtn'),
            smartSplitCueBtn: document.getElementById('editorSmartSplitCueBtn'),
            silenceSplitCueBtn: document.getElementById('editorSilenceSplitCueBtn'),
            compressRepCueBtn: document.getElementById('editorCompressRepCueBtn'),
            splitLinesBtn: document.getElementById('editorSplitLinesBtn'),
            splitSpacesBtn: document.getElementById('editorSplitSpacesBtn'),
            charDurBtn: document.getElementById('editorCharDurBtn'),
            smartDurBtn: document.getElementById('editorSmartDurBtn'),
            audioSnapBtn: document.getElementById('editorAudioSnapBtn'),
            silenceSplitModal: document.getElementById('editorSilenceSplitModal'),
            silenceSplitDb: document.getElementById('editorSilenceSplitDb'),
            silenceSplitDur: document.getElementById('editorSilenceSplitDur'),
            silenceSplitDurLong: document.getElementById('editorSilenceSplitDurLong'),
            silenceSplitCpsAbove: document.getElementById('editorSilenceSplitCpsAbove'),
            silenceSplitCharsLong: document.getElementById('editorSilenceSplitCharsLong'),
            silenceSplitFixOverlap: document.getElementById('editorSilenceSplitFixOverlap'),
            silenceSplitPreview: document.getElementById('editorSilenceSplitPreview'),
            silenceSplitConfirm: document.getElementById('editorSilenceSplitConfirm'),
            silenceSplitCancel: document.getElementById('editorSilenceSplitCancel'),
            smartSplitModal: document.getElementById('editorSmartSplitModal'),
            smartSplitMaxChars: document.getElementById('editorSmartSplitMaxChars'),
            smartSplitLineChars: document.getElementById('editorSmartSplitLineChars'),
            smartSplitCpsAbove: document.getElementById('editorSmartSplitCpsAbove'),
            smartSplitLineLen: document.getElementById('editorSmartSplitLineLen'),
            smartSplitDurLong: document.getElementById('editorSmartSplitDurLong'),
            smartSplitCharsLong: document.getElementById('editorSmartSplitCharsLong'),
            smartSplitUseCps: document.getElementById('editorSmartSplitUseCps'),
            smartSplitFixOverlap: document.getElementById('editorSmartSplitFixOverlap'),
            smartSplitPreview: document.getElementById('editorSmartSplitPreview'),
            smartSplitConfirm: document.getElementById('editorSmartSplitConfirm'),
            smartSplitCancel: document.getElementById('editorSmartSplitCancel'),
            smartAdjustModal: document.getElementById('editorSmartAdjustModal'),
            smartFixOverlap: document.getElementById('editorSmartFixOverlap'),
            smartFixCps: document.getElementById('editorSmartFixCps'),
            smartEnforceMin: document.getElementById('editorSmartEnforceMin'),
            smartEnforceMax: document.getElementById('editorSmartEnforceMax'),
            smartMaxCps: document.getElementById('editorSmartMaxCps'),
            smartMinSec: document.getElementById('editorSmartMinSec'),
            smartMaxSec: document.getElementById('editorSmartMaxSec'),
            smartGapMs: document.getElementById('editorSmartGapMs'),
            smartPreview: document.getElementById('editorSmartPreview'),
            smartAdjustConfirm: document.getElementById('editorSmartAdjustConfirm'),
            smartAdjustCancel: document.getElementById('editorSmartAdjustCancel'),
            removeNoiseBtn: document.getElementById('editorRemoveNoiseBtn'),
            removeNoiseModal: document.getElementById('editorRemoveNoiseModal'),
            removeNoisePreview: document.getElementById('editorRemoveNoisePreview'),
            removeNoiseConfirm: document.getElementById('editorRemoveNoiseConfirm'),
            removeNoiseCancel: document.getElementById('editorRemoveNoiseCancel'),
            noiseRemoveEmpty: document.getElementById('editorNoiseRemoveEmpty'),
            noiseRemoveFragments: document.getElementById('editorNoiseRemoveFragments'),
            noiseRemoveSoundEffects: document.getElementById('editorNoiseRemoveSoundEffects'),
            noiseRemoveSymbolOnly: document.getElementById('editorNoiseRemoveSymbolOnly'),
            noiseRemoveDuplicates: document.getElementById('editorNoiseRemoveDuplicates'),
            noiseRemoveHallucinations: document.getElementById('editorNoiseRemoveHallucinations'),
            chineseConvertBtn: document.getElementById('editorChineseConvertBtn'),
            chineseConvertModal: document.getElementById('editorChineseConvertModal'),
            chineseConvertPreview: document.getElementById('editorChineseConvertPreview'),
            chineseConvertConfirm: document.getElementById('editorChineseConvertConfirm'),
            chineseConvertCancel: document.getElementById('editorChineseConvertCancel'),
            chineseDirS2T: document.getElementById('editorChineseDirS2T'),
            chineseDirT2S: document.getElementById('editorChineseDirT2S'),
            chineseScopeAll: document.getElementById('editorChineseScopeAll'),
            chineseScopeSelected: document.getElementById('editorChineseScopeSelected'),
            chineseProtectGlossary: document.getElementById('editorChineseProtectGlossary'),
            compressRepBtn: document.getElementById('editorCompressRepBtn'),
            compressRepModal: document.getElementById('editorCompressRepModal'),
            compressRepPreview: document.getElementById('editorCompressRepPreview'),
            compressRepConfirm: document.getElementById('editorCompressRepConfirm'),
            compressRepCancel: document.getElementById('editorCompressRepCancel'),
            compressRepScopeAll: document.getElementById('editorCompressRepScopeAll'),
            compressRepScopeSelected: document.getElementById('editorCompressRepScopeSelected'),
            compressRepSingleChar: document.getElementById('editorCompressRepSingleChar'),
            compressRepExclaim: document.getElementById('editorCompressRepExclaim'),
            restoreBtn: document.getElementById('editorRestoreBtn'),
            sidecarSelect: document.getElementById('editorSidecarSelect'),
            cueBody: document.getElementById('editorCueBody'),
            listWrap: document.getElementById('editorListWrap'),
            cueContextMenu: document.getElementById('editorCueContextMenu'),
            detailPane: document.getElementById('editorDetailPane'),
            detailStart: document.getElementById('editorDetailStart'),
            detailDuration: document.getElementById('editorDetailDuration'),
            detailEnd: document.getElementById('editorDetailEnd'),
            detailText: document.getElementById('editorDetailText'),
            detailCps: document.getElementById('editorDetailCps'),
            targetCps: document.getElementById('editorTargetCps'),
            lineLen: document.getElementById('editorLineLen'),
            textLen: document.getElementById('editorTextLen'),
            detailWarn: document.getElementById('editorDetailWarn'),
            prevCueBtn: document.getElementById('editorPrevCueBtn'),
            nextCueBtn: document.getElementById('editorNextCueBtn'),
            deleteCueBtn: document.getElementById('editorDeleteCueBtn'),
            splitCueBtn: document.getElementById('editorSplitCueBtn'),
            splitModal: document.getElementById('editorSplitModal'),
            splitConfirm: document.getElementById('editorSplitConfirm'),
            splitCancel: document.getElementById('editorSplitCancel'),
            splitCharCount: document.getElementById('editorSplitCharCount'),
            splitCount: document.getElementById('editorSplitCount'),
            splitSmartMaxChars: document.getElementById('editorSplitSmartMaxChars'),
            splitSmartLineChars: document.getElementById('editorSplitSmartLineChars'),
            splitSilenceDb: document.getElementById('editorSplitSilenceDb'),
            splitSilenceDur: document.getElementById('editorSplitSilenceDur'),
            splitUseCps: document.getElementById('editorSplitUseCps'),
            splitFixOverlap: document.getElementById('editorSplitFixOverlap'),
            splitPreview: document.getElementById('editorSplitPreview'),
            splitRemember: document.getElementById('editorSplitRemember'),
            splitHint: document.getElementById('editorSplitHint'),
            startNudgeBack: document.getElementById('editorStartNudgeBack'),
            startNudgeFwd: document.getElementById('editorStartNudgeFwd'),
            durNudgeDown: document.getElementById('editorDurNudgeDown'),
            durNudgeUp: document.getElementById('editorDurNudgeUp'),
            setStartToPlayhead: document.getElementById('editorSetStartToPlayhead'),
            setEndToPlayhead: document.getElementById('editorSetEndToPlayhead'),
            video: document.getElementById('editorVideo'),
            videoFrame: document.getElementById('editorVideoFrame'),
            videoWrap: document.getElementById('editorVideoWrap'),
            videoHint: document.getElementById('editorVideoHint'),
            videoSubtitle: document.getElementById('editorVideoSubtitle'),
            videoSubtitleText: document.getElementById('editorVideoSubtitleText'),
            statusLine: document.getElementById('editorStatusLine'),
            bootProgress: document.getElementById('editorBootProgress'),
            bootProgressTitle: document.getElementById('editorBootProgressTitle'),
            bootProgressDetail: document.getElementById('editorBootProgressDetail'),
            silenceProgress: document.getElementById('editorSilenceProgress'),
            silenceProgressTitle: document.getElementById('editorSilenceProgressTitle'),
            silenceProgressCount: document.getElementById('editorSilenceProgressCount'),
            silenceProgressDetail: document.getElementById('editorSilenceProgressDetail'),
            silenceProgressTrack: document.getElementById('editorSilenceProgressTrack'),
            silenceProgressBar: document.getElementById('editorSilenceProgressBar'),
            silenceProgressHint: document.getElementById('editorSilenceProgressHint'),
            silenceProgressCancel: document.getElementById('editorSilenceProgressCancel'),
        });
    }

    function init() {
        if (!electron?.isDesktop || !document.getElementById('editorCueBody')) return;
        cacheElements();
        applyTargetCpsPrefs();
        [
            els.splitModal,
            els.findReplaceModal,
            els.batchDurModal,
            els.smartSplitModal,
            els.silenceSplitModal,
            els.smartAdjustModal,
            els.removeNoiseModal,
            els.chineseConvertModal,
            els.compressRepModal,
            els.qcModal,
            els.glossaryModal,
            els.breakWordsModal,
            els.retranscribeDurModal,
            els.shortcutsModal,
        ].forEach((modal) => {
            if (modal?.classList.contains('hidden')) modal.setAttribute('inert', '');
        });
        bindEvents();
        loadBreakWords();
        void loadGlossary();
        // ffmpeg 路径仅供静音/探测等工具使用，不阻塞字幕文档打开
        void loadAppFfmpegPath();

        electron?.onSubtitleEditorRefocus?.(() => restoreEditorFocus());
        window.addEventListener('focus', () => {
            const active = document.activeElement;
            const stale = !active
                || active === document.body
                || Boolean(active.closest?.('.editor-modal.hidden'));
            if (stale) restoreEditorFocus();
        });

        editorBootstrapped = true;
        if (pendingEditorInit) {
            const payload = pendingEditorInit;
            pendingEditorInit = null;
            bootstrapEditorDocument(payload);
        } else {
            updateBootProgress({
                title: '字幕编辑器已就绪',
                detail: '等待打开字幕文件…',
                statusMessage: '正在等待字幕文件…',
            });
            // 若短时间内仍无文档可开，收起启动遮罩，避免空窗一直挡操作
            setTimeout(() => {
                if (!state.ready && !pendingEditorInit && !documentLoadInFlight) {
                    hideBootProgress();
                    if (els.statusLine?.textContent === '正在等待字幕文件…'
                        || els.statusLine?.textContent === '正在启动…') {
                        setStatus('就绪', '');
                    }
                }
            }, 1200);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
    } else {
        setTimeout(init, 0);
    }
}(window));
