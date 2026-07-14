/**
 * Transub 字幕编辑器（独立窗口）— 列表 + 详情分栏
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const splitCore = global.TransubSubtitleSplit;
    if (!splitCore) {
        throw new Error('subtitle-split-core.js must load before subtitle-editor.js');
    }

    const SPLIT_PREFS_KEY = 'transub-editor-split-prefs';
    const TARGET_CPS_KEY = 'transub-editor-target-cps';
    const DEFAULT_TARGET_CPS = 3;
    const SPLIT_MODES = new Set(['smart', 'lines', 'spaces', 'chars', 'count', 'cursor', 'playhead', 'silence']);
    const CONNECTED_TEXT_SPLIT_MSG = '文本为连续书写（无空格与换行），无法自动分割。请使用光标或播放头手动分割。';
    const UNDO_MAX = 50;
    const DETAIL_UNDO_GAP_MS = 600;

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
    };

    let els = {};
    let pendingEditorInit = null;
    let editorBootstrapped = false;
    let detailUndoTimer = null;
    let cachedFfmpegPath = '';

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

    function isElementFocusable(el) {
        if (!el || typeof el.focus !== 'function') return false;
        if (el.disabled) return false;
        if (el.closest('.editor-modal:not(.hidden)')) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return true;
    }

    function clearStaleFocus() {
        const active = document.activeElement;
        if (!active || active === document.body) return;
        if (active.closest?.('.editor-modal.hidden, .editor-modal:not(.hidden)')) {
            if (typeof active.blur === 'function') active.blur();
        }
    }

    function pickEditorFocusTarget() {
        if (state.selectedIndex >= 0 && isElementFocusable(els.detailText)) {
            return els.detailText;
        }
        if (isElementFocusable(els.detailStart)) return els.detailStart;
        if (isElementFocusable(els.detailPane)) return els.detailPane;
        if (isElementFocusable(els.listWrap)) return els.listWrap;
        return null;
    }

    function restoreEditorFocus() {
        clearStaleFocus();

        const apply = () => {
            if (typeof window.focus === 'function') window.focus();
            const target = pickEditorFocusTarget();
            if (!target) return;
            try {
                target.focus({ preventScroll: true });
            } catch (_) {
                target.focus();
            }
        };

        // 延迟到 click / 原生对话框完全结束后再 focus（Electron on Windows 常见失焦）
        setTimeout(() => {
            clearStaleFocus();
            requestAnimationFrame(apply);
        }, 0);
    }

    function releaseFocusFromModal(modalEl) {
        const active = document.activeElement;
        if (active && modalEl?.contains(active) && typeof active.blur === 'function') {
            active.blur();
        }
    }

    function editorConfirm(message) {
        const ok = confirm(message);
        restoreEditorFocus();
        return ok;
    }

    function showEditorModal(modalEl, focusEl) {
        if (!modalEl) return;
        modalEl.classList.remove('hidden');
        modalEl.removeAttribute('inert');
        const focusTarget = focusEl || modalEl.querySelector('input:not([disabled]), button, textarea');
        requestAnimationFrame(() => {
            if (isElementFocusable(focusTarget)) {
                try {
                    focusTarget.focus({ preventScroll: true });
                } catch (_) {
                    focusTarget.focus();
                }
            }
        });
    }

    function hideEditorModal(modalEl) {
        if (!modalEl) return;
        releaseFocusFromModal(modalEl);
        modalEl.classList.add('hidden');
        modalEl.setAttribute('inert', '');
        restoreEditorFocus();
    }

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function basename(p) {
        const s = String(p || '').replace(/\\/g, '/');
        const i = s.lastIndexOf('/');
        return i >= 0 ? s.slice(i + 1) : s;
    }

    function setStatus(msg, type) {
        if (!els.statusLine) return;
        els.statusLine.textContent = msg || '';
        els.statusLine.className = `text-xs px-3 py-1.5 border-t border-gray-100 shrink-0 truncate ${
            type === 'err' ? 'text-red-600' : type === 'ok' ? 'text-emerald-600' : 'text-gray-500'
        }`;
    }

    function formatDisplayTime(ms, format) {
        const n = Math.max(0, Math.round(Number(ms) || 0));
        const h = Math.floor(n / 3600000);
        const m = Math.floor((n % 3600000) / 60000);
        const s = Math.floor((n % 60000) / 1000);
        const f = n % 1000;
        if (format === 'lrc') {
            const cs = Math.floor(f / 10);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
        }
        const sep = format === 'vtt' ? '.' : ',';
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(f).padStart(3, '0')}`;
    }

    function parseInputTime(str, format) {
        const s = String(str || '').trim();
        if (!s) return null;
        if (format === 'lrc') {
            const m = s.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
            if (!m) return null;
            const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
            return Number(m[1]) * 60000 + Number(m[2]) * 1000 + frac;
        }
        const m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})([.,](\d{1,3}))?$/);
        if (m) {
            const frac = m[5] ? Number(m[5].padEnd(3, '0').slice(0, 3)) : 0;
            return Number(m[1]) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000 + frac;
        }
        const m2 = s.match(/^(\d{1,2}):(\d{2})([.,](\d{1,3}))?$/);
        if (m2) {
            const frac = m2[4] ? Number(m2[4].padEnd(3, '0').slice(0, 3)) : 0;
            return Number(m2[1]) * 60000 + Number(m2[2]) * 1000 + frac;
        }
        return null;
    }

    function cloneCues(cues) {
        return (cues || []).map((c) => ({
            index: c.index,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text ?? '',
        }));
    }

    function cuesEqual(a, b) {
        const left = a || [];
        const right = b || [];
        if (left.length !== right.length) return false;
        for (let i = 0; i < left.length; i += 1) {
            if (left[i].startMs !== right[i].startMs) return false;
            if (left[i].endMs !== right[i].endMs) return false;
            if ((left[i].text ?? '') !== (right[i].text ?? '')) return false;
        }
        return true;
    }

    function createEditorSnapshot() {
        return {
            header: Array.isArray(state.header) ? [...state.header] : [],
            cues: cloneCues(state.cues),
            selectedIndex: state.selectedIndex,
        };
    }

    function editorSnapshotsEqual(a, b) {
        if (!a || !b) return false;
        if (a.selectedIndex !== b.selectedIndex) return false;
        const leftHeader = a.header || [];
        const rightHeader = b.header || [];
        if (leftHeader.length !== rightHeader.length) return false;
        for (let i = 0; i < leftHeader.length; i += 1) {
            if (leftHeader[i] !== rightHeader[i]) return false;
        }
        return cuesEqual(a.cues, b.cues);
    }

    function updateUndoRedoUi() {
        if (els.undoBtn) els.undoBtn.disabled = !state.undoStack.length;
        if (els.redoBtn) els.redoBtn.disabled = !state.redoStack.length;
    }

    function resetDetailUndoGroup() {
        state.detailUndoGrouped = false;
        if (detailUndoTimer) {
            clearTimeout(detailUndoTimer);
            detailUndoTimer = null;
        }
    }

    function pushUndoSnapshot() {
        if (state.undoRecording) return;
        const snap = createEditorSnapshot();
        const top = state.undoStack[state.undoStack.length - 1];
        if (top && editorSnapshotsEqual(top, snap)) return;
        state.undoStack.push(snap);
        if (state.undoStack.length > UNDO_MAX) state.undoStack.shift();
        state.redoStack = [];
        updateUndoRedoUi();
    }

    function recordUndoBeforeChange() {
        if (state.undoRecording) return;
        resetDetailUndoGroup();
        pushUndoSnapshot();
    }

    function beginDetailUndoGroup() {
        if (state.undoRecording) return;
        if (!state.detailUndoGrouped) {
            pushUndoSnapshot();
            state.detailUndoGrouped = true;
        }
        if (detailUndoTimer) clearTimeout(detailUndoTimer);
        detailUndoTimer = setTimeout(() => {
            state.detailUndoGrouped = false;
            detailUndoTimer = null;
        }, DETAIL_UNDO_GAP_MS);
    }

    function clearUndoHistory() {
        state.undoStack = [];
        state.redoStack = [];
        resetDetailUndoGroup();
        updateUndoRedoUi();
    }

    function applyEditorSnapshot(snap) {
        state.undoRecording = true;
        state.header = [...snap.header];
        state.cues = cloneCues(snap.cues);
        if (snap.selectedIndex >= 0 && snap.selectedIndex < state.cues.length) {
            state.selectedIndex = snap.selectedIndex;
        } else if (state.cues.length) {
            state.selectedIndex = Math.min(Math.max(snap.selectedIndex, 0), state.cues.length - 1);
        } else {
            state.selectedIndex = -1;
        }
        setDirty(!cuesEqual(state.cues, state.savedSnapshot));
        renderCueList();
        state.undoRecording = false;
    }

    function undo() {
        if (!state.undoStack.length) return;
        syncDetailToCue();
        state.redoStack.push(createEditorSnapshot());
        const snap = state.undoStack.pop();
        applyEditorSnapshot(snap);
        updateUndoRedoUi();
        setStatus('已返回', 'ok');
    }

    function redo() {
        if (!state.redoStack.length) return;
        syncDetailToCue();
        state.undoStack.push(createEditorSnapshot());
        const snap = state.redoStack.pop();
        applyEditorSnapshot(snap);
        updateUndoRedoUi();
        setStatus('已重做', 'ok');
    }

    function saveInitialSnapshot() {
        const cues = cloneCues(state.cues);
        state.initialSnapshot = {
            header: Array.isArray(state.header) ? [...state.header] : [],
            cues,
        };
        state.savedSnapshot = cloneCues(cues);
        if (els.restoreBtn) els.restoreBtn.disabled = !state.initialSnapshot?.cues?.length;
    }

    function restoreInitialSnapshot() {
        if (!state.initialSnapshot?.cues?.length) {
            setStatus('没有可恢复的初始字幕', 'err');
            return;
        }
        if (!editorConfirm('确定恢复到打开文件时的初始字幕？当前未保存的修改将丢失。')) return;
        recordUndoBeforeChange();
        syncDetailToCue();
        state.header = [...state.initialSnapshot.header];
        state.cues = cloneCues(state.initialSnapshot.cues);
        state.selectedIndex = state.cues.length
            ? Math.min(Math.max(state.selectedIndex, 0), state.cues.length - 1)
            : -1;
        state.playbackIndex = -1;
        setDirty(!cuesEqual(state.cues, state.savedSnapshot));
        renderCueList();
        closeFindReplaceModal();
        setStatus(`已恢复到初始字幕（${state.cues.length} 条）`, 'ok');
    }

    function cueEndMs(cue) {
        return cue.endMs != null ? cue.endMs : cue.startMs + 2000;
    }

    function cueDurationMs(cue) {
        return Math.max(0, cueEndMs(cue) - cue.startMs);
    }

    function formatDurationSec(ms) {
        return (Math.max(0, ms) / 1000).toFixed(3);
    }

    function textCharCount(text) {
        return splitCore.textCharCount(text);
    }

    function lineCharCount(text) {
        return splitCore.lineCharCount(text);
    }

    function computeCps(text, durationMs) {
        const dur = durationMs / 1000;
        if (dur <= 0) return null;
        const chars = textCharCount(text);
        if (!chars) return null;
        return (chars / dur).toFixed(2);
    }

    function getCueWarnings(cue, prev, next) {
        const start = cue.startMs;
        const end = cueEndMs(cue);
        const dur = end - start;
        const warn = { start: false, end: false, dur: false, msg: [] };
        if (dur < 500) {
            warn.dur = true;
            warn.msg.push('时长过短');
        }
        if (dur > 10000) {
            warn.dur = true;
            warn.msg.push('时长过长');
        }
        if (end <= start) {
            warn.start = true;
            warn.end = true;
            warn.msg.push('结束早于起始');
        }
        if (prev && start < cueEndMs(prev)) {
            warn.start = true;
            warn.msg.push('与上条重叠');
        }
        if (next && end > next.startMs) {
            warn.end = true;
            warn.msg.push('与下条重叠');
        }
        return warn;
    }

    function findPlaybackIndex(tMs) {
        const cues = state.cues;
        const n = cues.length;
        if (!n) return -1;

        const hint = state.playbackIndex;
        if (hint >= 0 && hint < n) {
            const c = cues[hint];
            if (tMs >= c.startMs && tMs < cueEndMs(c)) return hint;
            if (hint + 1 < n) {
                const next = cues[hint + 1];
                if (tMs >= next.startMs && tMs < cueEndMs(next)) return hint + 1;
            }
            if (hint > 0) {
                const prev = cues[hint - 1];
                if (tMs >= prev.startMs && tMs < cueEndMs(prev)) return hint - 1;
            }
        }

        let lo = 0;
        let hi = n - 1;
        let best = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (cues[mid].startMs <= tMs) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        if (best >= 0 && tMs < cueEndMs(cues[best])) return best;
        return -1;
    }

    function setDirty(v) {
        state.dirty = !!v;
        if (els.dirtyBadge) els.dirtyBadge.classList.toggle('hidden', !state.dirty);
        document.title = state.path
            ? `${state.dirty ? '* ' : ''}${basename(state.path)} — Transub 字幕编辑`
            : 'Transub — 字幕编辑';
    }

    function clampTargetCps(value) {
        return Math.max(0.1, Math.min(100, Number(value) || DEFAULT_TARGET_CPS));
    }

    function loadTargetCpsPrefs() {
        try {
            const raw = localStorage.getItem(TARGET_CPS_KEY);
            if (raw == null) return DEFAULT_TARGET_CPS;
            return clampTargetCps(JSON.parse(raw));
        } catch (_) {
            return DEFAULT_TARGET_CPS;
        }
    }

    function saveTargetCpsPrefs() {
        const value = clampTargetCps(els.targetCps?.value);
        if (els.targetCps) els.targetCps.value = String(value);
        try {
            localStorage.setItem(TARGET_CPS_KEY, JSON.stringify(value));
        } catch (_) { /* ignore quota errors */ }
    }

    function getTargetCps() {
        return clampTargetCps(els.targetCps?.value ?? loadTargetCpsPrefs());
    }

    function applyTargetCpsPrefs() {
        if (els.targetCps) els.targetCps.value = String(loadTargetCpsPrefs());
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
        if (state.playbackIndex !== prevPlayback) {
            updatePlayingRowHighlight(prevPlayback, state.playbackIndex);
        } else {
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
                els.detailCps.className = 'text-[10px] text-violet-600 font-medium';
            } else {
                const cpsNum = Number(cps);
                els.detailCps.textContent = `当前 CPS ${cps}（目标 ${targetCps}）`;
                if (cpsNum > targetCps * 1.05) {
                    els.detailCps.className = 'text-[10px] text-amber-600 font-medium';
                } else {
                    els.detailCps.className = 'text-[10px] text-violet-600 font-medium';
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
            if (w.msg.length) {
                els.detailWarn.textContent = w.msg.join(' · ');
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
            if (els.prevCueBtn) els.prevCueBtn.disabled = true;
            if (els.nextCueBtn) els.nextCueBtn.disabled = true;
            if (els.deleteCueBtn) els.deleteCueBtn.disabled = true;
            if (els.splitCueBtn) els.splitCueBtn.disabled = true;
            if (els.smartSplitCueBtn) els.smartSplitCueBtn.disabled = true;
            if (els.silenceSplitCueBtn) els.silenceSplitCueBtn.disabled = true;
            if (els.splitLinesBtn) els.splitLinesBtn.disabled = true;
            if (els.splitSpacesBtn) els.splitSpacesBtn.disabled = true;
            if (els.charDurBtn) els.charDurBtn.disabled = true;
            if (els.smartDurBtn) els.smartDurBtn.disabled = true;
            state.detailRenderedDurSec = null;
            state.detailSyncing = false;
            return;
        }

        const cue = state.cues[idx];
        if (els.detailStart) els.detailStart.value = formatDisplayTime(cue.startMs, state.format);
        if (els.detailDuration) els.detailDuration.value = formatDurationSec(cueDurationMs(cue));
        if (els.detailEnd) els.detailEnd.value = formatDisplayTime(cueEndMs(cue), state.format);
        if (els.detailText) els.detailText.value = cue.text || '';
        if (els.prevCueBtn) els.prevCueBtn.disabled = idx <= 0;
        if (els.nextCueBtn) els.nextCueBtn.disabled = idx >= state.cues.length - 1;
        if (els.deleteCueBtn) els.deleteCueBtn.disabled = false;
        if (els.splitCueBtn) els.splitCueBtn.disabled = false;
        const text = String(cue.text || '').trim();
        const canSplit = !!text;
        const canSplitLines = canSplit && String(cue.text || '').includes('\n');
        const canSplitSpaces = canSplit && /\s/.test(String(cue.text || ''));
        if (els.smartSplitCueBtn) els.smartSplitCueBtn.disabled = !canSplit;
        if (els.silenceSplitCueBtn) {
            els.silenceSplitCueBtn.disabled = state.silenceSplitBusy || !canSilenceSplitCue(cue)
                || !state.videoPath || !electron?.ffmpegDetectSilence;
        }
        if (els.splitLinesBtn) els.splitLinesBtn.disabled = !canSplitLines;
        if (els.splitSpacesBtn) els.splitSpacesBtn.disabled = !canSplitSpaces;
        if (els.charDurBtn) {
            els.charDurBtn.disabled = !textCharCount(cue.text);
        }
        if (els.smartDurBtn) {
            els.smartDurBtn.disabled = state.silenceSplitBusy || !canSilenceAdjustDurationCue(cue)
                || !state.videoPath || !electron?.ffmpegDetectSilence;
        }
        updateDetailMeta();
        state.detailRenderedDurSec = cueDurationMs(cue) / 1000;
        state.detailSyncing = false;
    }

    function updateListRowClasses() {
        if (!els.cueBody) return;
        const currentCueIdx = state.find.active && state.find.currentIndex >= 0
            ? state.find.matches[state.find.currentIndex]?.cueIdx
            : -1;
        const hitCueSet = new Set(
            state.find.active ? state.find.matches.map((m) => m.cueIdx) : []
        );
        els.cueBody.querySelectorAll('tr[data-cue-idx]').forEach((row) => {
            const idx = Number(row.dataset.cueIdx);
            row.classList.toggle('cue-row-selected', idx === state.selectedIndex);
            row.classList.toggle('cue-row-playing', idx === state.playbackIndex);
            row.classList.toggle('cue-row-find-hit', hitCueSet.has(idx));
            row.classList.toggle('cue-row-find-current', idx === currentCueIdx);
        });
    }

    function renderCueList() {
        if (!els.cueBody) return;
        if (!state.cues.length) {
            els.cueBody.innerHTML = '<tr><td colspan="5" class="px-3 py-6 text-center text-gray-400 text-xs">无字幕条目</td></tr>';
            state.selectedIndex = -1;
            renderDetailPane();
            resyncPlaybackAfterCueTimingChange();
            return;
        }

        els.cueBody.innerHTML = state.cues.map((cue, idx) => {
            const prev = idx > 0 ? state.cues[idx - 1] : null;
            const next = idx < state.cues.length - 1 ? state.cues[idx + 1] : null;
            const w = getCueWarnings(cue, prev, next);
            const preview = String(cue.text || '').replace(/\s+/g, ' ').trim();
            return `
            <tr class="cursor-pointer hover:bg-gray-50/80 border-b border-gray-50" data-cue-idx="${idx}">
                <td class="text-xs text-gray-500 tabular-nums align-middle">${idx + 1}</td>
                <td class="font-mono text-[11px] tabular-nums align-middle ${w.start ? 'cell-warn' : ''}">${esc(formatDisplayTime(cue.startMs, state.format))}</td>
                <td class="font-mono text-[11px] tabular-nums align-middle ${w.end ? 'cell-warn' : ''}">${esc(formatDisplayTime(cueEndMs(cue), state.format))}</td>
                <td class="text-[11px] tabular-nums align-middle ${w.dur ? 'cell-warn' : ''}">${esc(formatDurationSec(cueDurationMs(cue)))}</td>
                <td class="cell-text align-middle">${esc(preview || '—')}</td>
            </tr>`;
        }).join('');

        if (state.selectedIndex >= state.cues.length) state.selectedIndex = state.cues.length - 1;
        if (state.selectedIndex < 0 && state.cues.length) state.selectedIndex = 0;
        updateListRowClasses();
        renderDetailPane();
        scheduleVideoTextTrackRefresh();
        resyncPlaybackAfterCueTimingChange();
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
            cells[4].textContent = String(cue.text || '').replace(/\s+/g, ' ').trim() || '—';
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
        if (idx !== state.selectedIndex) {
            syncDetailToCue();
            state.selectedIndex = idx;
            renderDetailPane();
            updateListRowClasses();
        }
        if (opts.seek && els.video) {
            const sec = Math.max(0, state.cues[idx].startMs / 1000);
            els.video.currentTime = sec;
            if (opts.play) els.video.play().catch(() => {});
        }
        if (opts.scroll) {
            const row = els.cueBody?.querySelector(`tr[data-cue-idx="${idx}"]`);
            row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    function onDetailChanged(opts = {}) {
        if (state.detailSyncing || state.selectedIndex < 0) return;
        if (!opts.skipUndo) beginDetailUndoGroup();
        syncDetailToCue();
        setDirty(true);
        refreshListRow(state.selectedIndex);
        updateDetailMeta();
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
    }

    function isListFocused() {
        const active = document.activeElement;
        if (!active || !els.listWrap) return false;
        return active === els.listWrap || els.listWrap.contains(active);
    }

    function focusCueList() {
        if (!els.listWrap) return;
        try {
            els.listWrap.focus({ preventScroll: true });
        } catch (_) {
            els.listWrap.focus();
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

    function syncFromExternalTime(timeSec, updatePlayhead = true) {
        if (!state.ready) return;
        const t = Math.round((Number(timeSec) || 0) * 1000);
        const active = findPlaybackIndex(t);
        if (active !== state.playbackIndex) {
            const prev = state.playbackIndex;
            state.playbackIndex = active;
            updatePlayingRowHighlight(prev, active);
        }
        if (updatePlayhead) {
            state.lastPlayheadLabel = '';
            if (els.playheadTime) {
                els.playheadTime.textContent = formatDisplayTime(t, state.format);
                state.lastPlayheadLabel = els.playheadTime.textContent;
            }
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
    }

    function onVideoPause() {
        document.body.classList.remove('editor-video-playing');
        stopPlaybackTimers();
        syncPlaybackFromVideo(true);
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
                if (row) {
                    row.classList.add('cue-row-playing');
                    if (!isRowVisibleInList(row)) {
                        row.scrollIntoView({ block: 'nearest' });
                    }
                }
            }
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 120 });
        } else {
            requestAnimationFrame(run);
        }
    }

    function describeVideoCodec(codec, width, height) {
        const name = String(codec || '').toLowerCase();
        const res = width && height ? `${width}×${height}` : '';
        const labels = {
            h264: 'H.264',
            hevc: 'HEVC',
            h265: 'HEVC',
            av1: 'AV1',
            vp9: 'VP9',
            vp8: 'VP8',
            mpeg4: 'MPEG-4',
        };
        const label = labels[name] || (name ? name.toUpperCase() : '');
        if (!label && !res) return '';
        const softDecode = new Set(['hevc', 'h265', 'av1', 'vp9']).has(name);
        const parts = [res, label].filter(Boolean).join(' · ');
        return softDecode ? `${parts}（浏览器可能软解）` : parts;
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
            els.videoHint.textContent = `${basename(state.videoPath)}${suffix} · 列表选中编辑 · Ctrl+S 保存`;
        } else {
            els.videoHint.textContent = '未关联视频，可点击「关联视频」；亦可仅编辑文本与时间轴';
        }
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
        if (!videoPath) {
            updateVideoHint();
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
        stopPlaybackTimers();
        document.body.classList.remove('editor-video-playing');
        if (state.textTrackRefreshTimer) {
            clearTimeout(state.textTrackRefreshTimer);
            state.textTrackRefreshTimer = null;
        }
        const res = await electron?.transubReadSubtitle?.({ path: subPath });
        if (!res?.ok) {
            setStatus(res?.error || '加载字幕失败', 'err');
            return false;
        }
        syncDetailToCue();
        state.path = res.path;
        state.videoPath = videoPath || '';
        state.format = res.format;
        state.header = res.header || [];
        state.cues = res.cues || [];
        state.selectedIndex = state.cues.length ? 0 : -1;
        state.playbackIndex = -1;
        state.previewTextTrack = null;
        state.overlayText = '';
        state.overlayVisible = false;
        state.detailRenderedDurSec = null;
        state.lastPlayheadLabel = '';
        setDirty(false);
        clearUndoHistory();

        if (els.title) els.title.textContent = basename(res.path);
        if (els.formatBadge) els.formatBadge.textContent = res.format.toUpperCase();
        if (els.cueCount) els.cueCount.textContent = `${state.cues.length} 条`;

        saveInitialSnapshot();
        renderCueList();
        await loadVideo(state.videoPath);
        refreshVideoTextTrack();
        updateVideoSubtitleOverlay();
        await populateSidecarSelect(state.videoPath, res.path);
        setStatus(`已加载 ${state.cues.length} 条字幕`, 'ok');
        return true;
    }

    async function openDocument(subPath, videoPath) {
        if (state.ready && state.dirty) {
            const yes = editorConfirm('当前字幕未保存，打开新文件将丢失修改，继续？');
            if (!yes) return;
        }
        let linkedVideo = videoPath || '';
        if (!linkedVideo && subPath) {
            const guess = await electron?.transubGuessVideoForSubtitle?.({ path: subPath });
            if (guess?.ok && guess.videoPath) linkedVideo = guess.videoPath;
        }
        try {
            const ok = await loadDocument(subPath, linkedVideo);
            if (!ok) return;
            state.ready = true;
        } catch (err) {
            setStatus(err?.message || '打开字幕失败', 'err');
        }
    }

    async function pickAndOpenInWindow() {
        const res = await electron?.transubSelectSubtitle?.({ title: '选择要编辑的字幕文件' });
        restoreEditorFocus();
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
        restoreEditorFocus();
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
            createBackup: false,
        });
        if (!res?.ok) {
            setStatus(res?.error || '保存失败', 'err');
            return;
        }
        setDirty(false);
        state.savedSnapshot = cloneCues(state.cues);
        setStatus('已保存', 'ok');
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

    function deleteSelectedCue() {
        if (state.selectedIndex < 0) return;
        const idx = state.selectedIndex;
        if (!editorConfirm(`删除第 ${idx + 1} 条字幕？`)) return;
        syncDetailToCue();
        recordUndoBeforeChange();
        state.cues.splice(idx, 1);
        state.selectedIndex = Math.min(idx, state.cues.length - 1);
        setDirty(true);
        renderCueList();
        setStatus(`已删除第 ${idx + 1} 条`, 'ok');
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

    async function computeSilenceAdjustedEndMs(cue, opts = {}) {
        if (!state.videoPath) {
            return { error: '请先关联视频后再使用智能调节时长' };
        }
        const end = cueEndMs(cue);
        const analysis = await electron?.ffmpegDetectSilence?.(buildFfmpegRequest({
            path: state.videoPath,
            startMs: cue.startMs,
            endMs: end,
            noiseDb: opts.silenceDb ?? -35,
            minSilenceSec: opts.silenceDur ?? 0.25,
            minSegmentMs: 400,
        }));
        if (!analysis?.ok) {
            return { error: analysis?.error || '静音分析失败' };
        }
        const newEnd = splitCore.inferSpeechEndFromSilence(
            cue.startMs,
            end,
            analysis.intervals,
            {
                minDurMs: 500,
                minTrailingSilenceMs: Math.max(250, Math.round((opts.silenceDur ?? 0.25) * 1000)),
            },
        );
        if (newEnd == null) {
            return { error: '未检测到尾部静音，当前时长可能已接近实际语音长度' };
        }
        return {
            newEndMs: newEnd,
            meta: {
                oldEndMs: end,
                silenceCount: analysis.intervals?.length || 0,
            },
        };
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
            const analysis = await computeSilenceAdjustedEndMs(cue, opts);
            if (analysis.error) {
                setStatus(analysis.error, 'err');
                return;
            }
            const newEnd = clampSilenceAdjustedEnd(cue, idx, analysis.newEndMs, true);
            const oldEnd = cueEndMs(cue);
            if (newEnd >= oldEnd) {
                setStatus(`第 ${idx + 1} 条时长已接近实际语音，无需缩短`, 'ok');
                return;
            }

            recordUndoBeforeChange();
            cue.endMs = newEnd;
            setDirty(true);
            refreshListRow(idx);
            if (state.selectedIndex === idx) renderDetailPane();
            resyncPlaybackAfterCueTimingChange();
            const savedSec = ((oldEnd - newEnd) / 1000).toFixed(3);
            setStatus(
                `已智能调节第 ${idx + 1} 条时长：${formatDurationSec(cueDurationMs(cue))} 秒（缩短 ${savedSec} 秒）`,
                'ok',
            );
        } finally {
            hideSilenceSplitProgress();
        }
    }

    function canSilenceSplitCue(cue) {
        const text = String(cue?.text || '').trim();
        if (!text) return false;
        if (splitCore.isConnectedText(text)) return false;
        if (cueDurationMs(cue) < 600) return false;
        return true;
    }

    function setSilenceSplitBusy(busy) {
        state.silenceSplitBusy = !!busy;
        if (els.silenceSplitBtn) els.silenceSplitBtn.disabled = state.silenceSplitBusy;
        if (els.silenceSplitConfirm) els.silenceSplitConfirm.disabled = state.silenceSplitBusy;
        if (els.batchDurConfirm) els.batchDurConfirm.disabled = state.silenceSplitBusy;
        if (els.splitConfirm && getSelectedSplitMode() === 'silence') {
            els.splitConfirm.disabled = state.silenceSplitBusy;
        }
        if (state.selectedIndex >= 0) renderDetailPane();
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
        setSilenceSplitBusy(true);
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

    function getSilenceSplitOpts(extra = {}) {
        const prefs = loadSplitPrefs();
        return {
            silenceDb: extra.silenceDb ?? prefs.silenceDb,
            silenceDur: extra.silenceDur ?? prefs.silenceDur,
            fixOverlap: extra.fixOverlap ?? prefs.fixOverlap,
        };
    }

    async function quickSilenceSplitSelectedCue(extraOpts = {}) {
        if (state.silenceSplitBusy) return { ok: false, error: '静音分析正在进行中' };
        if (state.selectedIndex < 0) return { ok: false, error: '未选中字幕' };
        syncDetailToCue();
        const idx = state.selectedIndex;
        const cue = state.cues[idx];
        const opts = getSilenceSplitOpts(extraOpts);

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
        return mode === 'smart' || mode === 'chars' || mode === 'count' || mode === 'silence';
    }

    function connectedTextSplitError(mode, text) {
        if (!blocksConnectedTextSplit(mode) || !splitCore.isConnectedText(text)) return null;
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
            });
            if (texts.length < 2) return { error: '当前文本无需智能分割（已足够短）' };
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
        const end = cueEndMs(cue);
        const text = String(cue.text || '').trim();
        if (!text) return { error: '当前字幕文本为空，无法分割' };

        const connectedErr = connectedTextSplitError('silence', text);
        if (connectedErr) return { error: connectedErr };

        const analysis = await electron?.ffmpegDetectSilence?.(buildFfmpegRequest({
            path: state.videoPath,
            startMs: cue.startMs,
            endMs: end,
            noiseDb: opts.silenceDb ?? -35,
            minSilenceSec: opts.silenceDur ?? 0.25,
            minSegmentMs: 400,
        }));

        if (!analysis?.ok) {
            return { error: analysis?.error || '静音分析失败' };
        }
        if (!analysis.splitPointsMs?.length) {
            return { error: '该时间段内未检测到足够长的静音，请调低阈值或改用智能断句' };
        }

        const cues = splitCore.buildCuesFromSilenceSplits(
            text,
            cue.startMs,
            end,
            analysis.splitPointsMs,
            16,
            analysis.intervals,
            {
                minDurMs: 500,
                minTrailingSilenceMs: Math.max(250, Math.round((opts.silenceDur ?? 0.25) * 1000)),
                minLeadingSilenceMs: Math.max(250, Math.round((opts.silenceDur ?? 0.25) * 1000)),
                gapMs: 1,
            },
        );
        if (!cues || cues.length < 2) {
            return { error: '静音切分后文本不足两条，请调整阈值或手动分割' };
        }

        return {
            cues,
            meta: {
                silenceCount: analysis.intervals?.length || 0,
                splitCount: analysis.splitPointsMs.length,
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

    function loadSplitPrefs() {
        try {
            const raw = localStorage.getItem(SPLIT_PREFS_KEY);
            if (!raw) {
                return {
                    remember: false,
                    mode: 'smart',
                    charCount: 20,
                    count: 2,
                    smartMaxChars: 20,
                    smartLineChars: 18,
                    silenceDb: -35,
                    silenceDur: 0.25,
                    useCps: true,
                    fixOverlap: true,
                };
            }
            const prefs = JSON.parse(raw);
            const mode = SPLIT_MODES.has(prefs.mode) ? prefs.mode : 'smart';
            return {
                remember: !!prefs.remember,
                mode,
                charCount: Math.max(2, Math.min(120, Number(prefs.charCount) || 20)),
                count: Math.max(2, Math.min(30, Number(prefs.count) || 2)),
                smartMaxChars: Math.max(4, Math.min(120, Number(prefs.smartMaxChars) || 20)),
                smartLineChars: Math.max(4, Math.min(80, Number(prefs.smartLineChars) || 18)),
                silenceDb: Math.max(-60, Math.min(-10, Number(prefs.silenceDb) || -35)),
                silenceDur: Math.max(0.1, Math.min(3, Number(prefs.silenceDur) || 0.25)),
                useCps: prefs.useCps !== false,
                fixOverlap: prefs.fixOverlap !== false,
            };
        } catch (_) {
            return {
                remember: false,
                mode: 'smart',
                charCount: 20,
                count: 2,
                smartMaxChars: 20,
                smartLineChars: 18,
                silenceDb: -35,
                silenceDur: 0.25,
                useCps: true,
                fixOverlap: true,
            };
        }
    }

    function saveSplitPrefs() {
        const remember = !!els.splitRemember?.checked;
        const payload = remember
            ? {
                remember: true,
                mode: getSelectedSplitMode(),
                charCount: Number(els.splitCharCount?.value) || 20,
                count: Number(els.splitCount?.value) || 2,
                smartMaxChars: Number(els.splitSmartMaxChars?.value) || 20,
                smartLineChars: Number(els.splitSmartLineChars?.value) || 18,
                silenceDb: Number(els.splitSilenceDb?.value) || -35,
                silenceDur: Number(els.splitSilenceDur?.value) || 0.25,
                useCps: els.splitUseCps?.checked !== false,
                fixOverlap: els.splitFixOverlap?.checked !== false,
            }
            : { remember: false };
        try {
            localStorage.setItem(SPLIT_PREFS_KEY, JSON.stringify(payload));
        } catch (_) { /* ignore quota errors */ }
    }

    function applySplitPrefsToModal() {
        const prefs = loadSplitPrefs();
        if (els.splitRemember) els.splitRemember.checked = prefs.remember;
        if (els.splitCharCount) els.splitCharCount.value = String(prefs.charCount);
        if (els.splitCount) els.splitCount.value = String(prefs.count);
        if (els.splitSmartMaxChars) els.splitSmartMaxChars.value = String(prefs.smartMaxChars);
        if (els.splitSmartLineChars) els.splitSmartLineChars.value = String(prefs.smartLineChars);
        if (els.splitSilenceDb) els.splitSilenceDb.value = String(prefs.silenceDb);
        if (els.splitSilenceDur) els.splitSilenceDur.value = String(prefs.silenceDur);
        if (els.splitUseCps) els.splitUseCps.checked = prefs.useCps;
        if (els.splitFixOverlap) els.splitFixOverlap.checked = prefs.fixOverlap;
        const mode = prefs.remember ? prefs.mode : 'smart';
        const radio = document.querySelector(`input[name="editorSplitMode"][value="${mode}"]`);
        if (radio) radio.checked = true;
        else {
            const fallback = document.querySelector('input[name="editorSplitMode"][value="smart"]');
            if (fallback) fallback.checked = true;
        }
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
                } else if (splitCore.isConnectedText(cue.text || '')) {
                    hint = CONNECTED_TEXT_SPLIT_MSG;
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
                } else if (splitCore.isConnectedText(cue.text || '')) {
                    els.splitPreview.textContent = CONNECTED_TEXT_SPLIT_MSG;
                    els.splitPreview.classList.add('err');
                } else {
                    els.splitPreview.textContent = '执行时将分析该时间段内的静音点并分配文本';
                    els.splitPreview.classList.remove('err');
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

    function escapeRegex(str) {
        return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function buildFindRegex(query, caseSensitive) {
        const flags = caseSensitive ? 'g' : 'gi';
        return new RegExp(escapeRegex(query), flags);
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
            updateListRowClasses();
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
            updateListRowClasses();
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
            updateFindStatus('已全部替换');
        }
        setStatus('已替换 1 处', 'ok');
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
        runFindSearch({ navigate: false });
        setStatus(`已全部替换 ${count} 处`, 'ok');
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
                return idx === state.selectedIndex;
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
        const result = await computeSilenceAdjustedEndMs(cue, opts);
        if (result.error) {
            return { status: 'skipped', reason: result.error };
        }
        const newEnd = clampSilenceAdjustedEnd(cue, idx, result.newEndMs, opts.avoidOverlap);
        const oldEnd = cueEndMs(cue);
        if (newEnd >= oldEnd) {
            return { status: 'unchanged' };
        }
        cue.endMs = newEnd;
        return { status: 'adjusted', savedMs: oldEnd - newEnd };
    }

    function collectBatchDurMatches(opts) {
        syncDetailToCue();
        const indices = [];
        state.cues.forEach((cue, idx) => {
            if (!matchesBatchDurCondition(cue, idx, opts)) return;
            if (opts.mode === 'silence' && !canSilenceAdjustDurationCue(cue)) return;
            indices.push(idx);
        });
        return indices;
    }

    function updateBatchDurModalState() {
        const cond = getSelectedBatchDurCondition();
        const mode = getSelectedBatchDurMode();
        const isSilence = mode === 'silence';

        if (els.batchDurFixedWrap) {
            els.batchDurFixedWrap.classList.toggle('hidden', isSilence);
        }
        if (els.batchDurSilenceWrap) {
            els.batchDurSilenceWrap.classList.toggle('hidden', !isSilence);
        }
        if (els.batchDurTarget) els.batchDurTarget.disabled = isSilence;
        if (els.batchDurSilenceDb) els.batchDurSilenceDb.disabled = !isSilence;
        if (els.batchDurSilenceDur) els.batchDurSilenceDur.disabled = !isSilence;

        if (els.batchDurShorter) els.batchDurShorter.disabled = cond !== 'shorter';
        if (els.batchDurLonger) els.batchDurLonger.disabled = cond !== 'longer';
        if (els.batchDurMin) els.batchDurMin.disabled = cond !== 'between';
        if (els.batchDurMax) els.batchDurMax.disabled = cond !== 'between';
        if (els.batchDurCpsAbove) els.batchDurCpsAbove.disabled = cond !== 'cps_above';
        if (els.batchDurCpsBelow) els.batchDurCpsBelow.disabled = cond !== 'cps_below';
        if (els.batchDurText) els.batchDurText.disabled = cond !== 'text_contains';

        if (!els.batchDurPreview) return;
        const opts = readBatchDurOptions();

        if (opts.mode === 'silence') {
            if (!state.videoPath || !electron?.ffmpegDetectSilence) {
                els.batchDurPreview.textContent = '请先关联视频后再使用按静音缩短';
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
            els.batchDurPreview.textContent = `将对 ${matches.length} 条字幕逐条分析静音并缩短过长时长（执行时将显示进度）`;
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

    function closeBatchDurModal() {
        hideEditorModal(els.batchDurModal);
    }

    function confirmBatchDurAdjust() {
        const opts = readBatchDurOptions();
        if (opts.mode === 'silence') {
            confirmBatchSilenceDurAdjust(opts);
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

        showSilenceSplitProgress({
            title: '正在批量调节时长',
            detail: `准备分析 ${total} 条字幕的实际语音时长…`,
            current: 0,
            total,
            statusMessage: `正在批量分析静音（0/${total}）…`,
        });
        await flushSilenceProgressPaint();

        try {
            for (let i = 0; i < indices.length; i += 1) {
                const idx = indices[i];
                updateSilenceSplitProgress({
                    current: i,
                    total,
                    detail: `正在分析第 ${i + 1}/${total} 条（原序号 ${idx + 1}）…`,
                    statusMessage: `正在分析静音 ${i + 1}/${total}…`,
                });
                await flushSilenceProgressPaint();

                const result = await silenceAdjustCueAtIndex(idx, silenceOpts);
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
                        ? `第 ${i + 1}/${total} 条已缩短 ${(result.savedMs / 1000).toFixed(2)} 秒`
                        : `第 ${i + 1}/${total} 条${result.status === 'unchanged' ? '无需调整' : '已跳过'}`,
                    statusMessage: `正在分析静音 ${i + 1}/${total}…`,
                });
            }
        } finally {
            hideSilenceSplitProgress();
        }

        if (!adjusted) {
            updateBatchDurModalState();
            const skipHint = skipped ? `，跳过 ${skipped} 条` : '';
            const unchangedHint = unchanged ? `，${unchanged} 条已接近实际语音` : '';
            setStatus(`已分析 ${total} 条，均未缩短时长${unchangedHint}${skipHint}`, 'err');
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

        try {
            for (let i = 0; i < indices.length; i += 1) {
                const idx = indices[i];
                updateSilenceSplitProgress({
                    current: i,
                    total,
                    detail: `正在分析第 ${i + 1}/${total} 条（原序号 ${idx + 1}）…`,
                    statusMessage: `正在分析静音 ${i + 1}/${total}…`,
                });
                await flushSilenceProgressPaint();

                const result = await computeSilenceSplitParts(state.cues[idx], splitOpts);
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
        const minDurMs = Math.max(100, Math.round((options.minSec || 0.5) * 1000));
        const maxDurMs = Math.max(minDurMs, Math.round((options.maxSec || 10) * 1000));
        const maxCps = Math.max(1, Number(options.maxCps) || 18);
        const gapMs = Math.max(0, Math.round(Number(options.gapMs) || 0));
        const stats = { affected: 0, overlapFixed: 0, cpsFixed: 0, minDurFixed: 0, maxDurFixed: 0 };
        const touched = new Set();

        function setEnd(cue, idx, newEnd) {
            const end = Math.max(cue.startMs + 100, Math.round(newEnd));
            if (end === cueEndMs(cue)) return;
            cue.endMs = end;
            touched.add(idx);
        }

        function fixOverlapsPass() {
            if (!options.fixOverlap) return;
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

        if (options.fixCps) {
            for (let i = 0; i < cues.length; i += 1) {
                const cue = cues[i];
                const chars = textCharCount(cue.text);
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

        if (options.enforceMinDur) {
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

        if (options.enforceMaxDur) {
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

    function updatePlayheadTimeLabel(exact) {
        if (!els.playheadTime) return;
        const t = els.video ? (els.video.currentTime || 0) * 1000 : 0;
        const displayMs = exact ? Math.round(t) : Math.floor(t / 1000) * 1000;
        const label = formatDisplayTime(displayMs, state.format);
        if (label === state.lastPlayheadLabel) return;
        state.lastPlayheadLabel = label;
        els.playheadTime.textContent = label;
    }

    function shiftAllCues(deltaMs) {
        syncDetailToCue();
        recordUndoBeforeChange();
        for (const c of state.cues) {
            c.startMs = Math.max(0, c.startMs + deltaMs);
            if (c.endMs != null) c.endMs = Math.max(c.startMs + 100, c.endMs + deltaMs);
        }
        setDirty(true);
        renderCueList();
    }

    /** 供主进程关闭窗口前调用 */
    global.__transubEditorConfirmClose = async () => {
        if (!state.dirty) return { allow: true };
        return new Promise((resolve) => {
            const ok = editorConfirm('字幕已修改但未保存，确定要关闭窗口吗？');
            resolve({ allow: ok });
        });
    };

    global.__transubEditorGetDirty = () => state.dirty;

    global.__transubEditorSaveBeforeClose = async () => {
        await saveDocument();
        return !state.dirty;
    };

    function openShortcutsModal() {
        if (!els.shortcutsModal) return;
        showEditorModal(els.shortcutsModal, els.shortcutsClose);
    }

    function closeShortcutsModal() {
        hideEditorModal(els.shortcutsModal);
    }

    function bindEvents() {
        els.saveBtn?.addEventListener('click', saveDocument);
        els.addCueBtn?.addEventListener('click', insertCueAtPlayhead);
        els.insertCueBtn?.addEventListener('click', insertCueAtPlayhead);
        els.detailInsertCueBtn?.addEventListener('click', insertCueAtPlayhead);
        els.openFileBtn?.addEventListener('click', pickAndOpenInWindow);
        els.shiftBackBtn?.addEventListener('click', () => shiftAllCues(-500));
        els.shiftFwdBtn?.addEventListener('click', () => shiftAllCues(500));
        els.linkVideoBtn?.addEventListener('click', linkVideo);
        els.findReplaceBtn?.addEventListener('click', () => openFindReplaceModal(false));
        els.findReplaceClose?.addEventListener('click', closeFindReplaceModal);
        els.findReplaceModal?.querySelectorAll('[data-find-dismiss]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                closeFindReplaceModal();
            });
        });
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
        els.splitLinesBtn?.addEventListener('click', () => quickSplitSelectedCue('lines'));
        els.splitSpacesBtn?.addEventListener('click', () => quickSplitSelectedCue('spaces'));
        els.charDurBtn?.addEventListener('click', () => charCountAdjustSelectedCueDuration());
        els.smartDurBtn?.addEventListener('click', () => silenceAdjustSelectedCueDuration());
        els.silenceSplitConfirm?.addEventListener('click', confirmBatchSilenceSplit);
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

        els.detailStart?.addEventListener('change', onDetailChanged);
        els.detailDuration?.addEventListener('change', onDetailChanged);
        els.detailDuration?.addEventListener('input', () => {
            if (els.detailEnd && state.selectedIndex >= 0) {
                const cue = state.cues[state.selectedIndex];
                const durSec = Number(els.detailDuration.value);
                if (Number.isFinite(durSec)) {
                    els.detailEnd.value = formatDisplayTime(cue.startMs + Math.round(durSec * 1000), state.format);
                }
            }
            updateDetailMeta();
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
            if (!state.dirty || editorConfirm('切换字幕后当前修改将丢失，继续？')) {
                await loadDocument(e.target.value, state.videoPath);
            } else {
                e.target.value = state.path;
            }
        });

        els.cueBody?.addEventListener('click', (e) => {
            const row = e.target.closest('tr[data-cue-idx]');
            if (!row) return;
            const idx = Number(row.dataset.cueIdx);
            selectCue(idx, { scroll: true });
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
            const idx = Number(row.dataset.cueIdx);
            selectCue(idx, { scroll: false });
            showCueContextMenu(e.clientX, e.clientY);
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

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (state.silenceSplitBusy) {
                    e.preventDefault();
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
                    els.batchDurModal,
                    els.smartSplitModal,
                    els.silenceSplitModal,
                    els.smartAdjustModal,
                    els.shortcutsModal,
                ].some((m) => m && !m.classList.contains('hidden'));
                if (modalOpen) return;
                if (state.selectedIndex < 0) return;
                e.preventDefault();
                deleteSelectedCue();
                return;
            }
            if (isListFocused()) {
                if (e.key === ' ' || e.code === 'Space') {
                    e.preventDefault();
                    toggleVideoPlayback();
                    return;
                }
                if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                    e.preventDefault();
                    insertCueAtPlayhead();
                    return;
                }
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
    }

    function cacheElements() {
        els = {
            title: document.getElementById('editorTitle'),
            formatBadge: document.getElementById('editorFormatBadge'),
            cueCount: document.getElementById('editorCueCount'),
            dirtyBadge: document.getElementById('editorDirtyBadge'),
            saveStatus: document.getElementById('editorSaveStatus'),
            saveBtn: document.getElementById('editorSaveBtn'),
            addCueBtn: document.getElementById('editorAddCueBtn'),
            insertCueBtn: document.getElementById('editorInsertCueBtn'),
            detailInsertCueBtn: document.getElementById('editorDetailInsertCueBtn'),
            playheadTime: document.getElementById('editorPlayheadTime'),
            openFileBtn: document.getElementById('editorOpenFileBtn'),
            undoBtn: document.getElementById('editorUndoBtn'),
            redoBtn: document.getElementById('editorRedoBtn'),
            shortcutsBtn: document.getElementById('editorShortcutsBtn'),
            shortcutsModal: document.getElementById('editorShortcutsModal'),
            shortcutsClose: document.getElementById('editorShortcutsClose'),
            shiftBackBtn: document.getElementById('editorShiftBackBtn'),
            shiftFwdBtn: document.getElementById('editorShiftFwdBtn'),
            linkVideoBtn: document.getElementById('editorLinkVideoBtn'),
            findReplaceBtn: document.getElementById('editorFindReplaceBtn'),
            findReplaceModal: document.getElementById('editorFindReplaceModal'),
            findReplaceClose: document.getElementById('editorFindReplaceClose'),
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
            batchDurSilenceDb: document.getElementById('editorBatchDurSilenceDb'),
            batchDurSilenceDur: document.getElementById('editorBatchDurSilenceDur'),
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
            smartSplitBtn: document.getElementById('editorSmartSplitBtn'),
            silenceSplitBtn: document.getElementById('editorSilenceSplitBtn'),
            smartSplitCueBtn: document.getElementById('editorSmartSplitCueBtn'),
            silenceSplitCueBtn: document.getElementById('editorSilenceSplitCueBtn'),
            splitLinesBtn: document.getElementById('editorSplitLinesBtn'),
            splitSpacesBtn: document.getElementById('editorSplitSpacesBtn'),
            charDurBtn: document.getElementById('editorCharDurBtn'),
            smartDurBtn: document.getElementById('editorSmartDurBtn'),
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
            silenceProgress: document.getElementById('editorSilenceProgress'),
            silenceProgressTitle: document.getElementById('editorSilenceProgressTitle'),
            silenceProgressCount: document.getElementById('editorSilenceProgressCount'),
            silenceProgressDetail: document.getElementById('editorSilenceProgressDetail'),
            silenceProgressTrack: document.getElementById('editorSilenceProgressTrack'),
            silenceProgressBar: document.getElementById('editorSilenceProgressBar'),
            silenceProgressHint: document.getElementById('editorSilenceProgressHint'),
        };
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
            els.shortcutsModal,
        ].forEach((modal) => {
            if (modal?.classList.contains('hidden')) modal.setAttribute('inert', '');
        });
        bindEvents();

        electron?.onSubtitleEditorRefocus?.(() => restoreEditorFocus());
        window.addEventListener('focus', () => {
            const active = document.activeElement;
            const stale = !active
                || active === document.body
                || Boolean(active.closest?.('.editor-modal.hidden'));
            if (stale) restoreEditorFocus();
        });

        void loadAppFfmpegPath().finally(() => {
            editorBootstrapped = true;
            if (pendingEditorInit) {
                const payload = pendingEditorInit;
                pendingEditorInit = null;
                bootstrapEditorDocument(payload);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
    } else {
        setTimeout(init, 0);
    }
}(window));
