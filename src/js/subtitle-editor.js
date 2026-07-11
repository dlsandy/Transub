/**
 * Transub 字幕编辑器（独立窗口）— 列表 + 详情分栏
 */
(function (global) {
    const electron = global.__ELECTRON__;

    const SPLIT_PREFS_KEY = 'transub-editor-split-prefs';
    const TARGET_CPS_KEY = 'transub-editor-target-cps';
    const DEFAULT_TARGET_CPS = 3;
    const SPLIT_MODES = new Set(['lines', 'spaces', 'chars', 'count', 'cursor', 'playhead']);

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
        find: {
            active: false,
            matches: [],
            currentIndex: -1,
        },
        initialSnapshot: null,
        savedSnapshot: null,
    };

    let els = {};
    let pendingEditorInit = null;
    let editorBootstrapped = false;

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
        return String(text || '').replace(/\s/g, '').length;
    }

    function lineCharCount(text) {
        const lines = String(text || '').split(/\r?\n/);
        return lines.reduce((max, line) => Math.max(max, line.replace(/\s/g, '').length), 0);
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
        if (Number.isFinite(durSec) && durSec > 0) {
            cue.endMs = cue.startMs + Math.round(durSec * 1000);
        }
        if (els.detailText) cue.text = els.detailText.value;
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
                els.detailWarn.textContent = '';
                els.detailWarn.classList.add('hidden');
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
        updateDetailMeta();
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

    function onDetailChanged() {
        if (state.detailSyncing || state.selectedIndex < 0) return;
        syncDetailToCue();
        setDirty(true);
        refreshListRow(state.selectedIndex);
        updateDetailMeta();
        if (state.selectedIndex === state.playbackIndex) {
            state.overlayText = '';
            updateVideoSubtitleOverlay();
        }
        scheduleVideoTextTrackRefresh();
    }

    function applyDurationDelta(deltaSec) {
        if (state.selectedIndex < 0) return;
        const cur = Number(els.detailDuration?.value);
        const base = Number.isFinite(cur) ? cur : cueDurationMs(state.cues[state.selectedIndex]) / 1000;
        const next = Math.max(0.1, Math.round((base + deltaSec) * 100) / 100);
        if (els.detailDuration) els.detailDuration.value = next.toFixed(3);
        onDetailChanged();
    }

    function applyStartDelta(deltaMs) {
        if (state.selectedIndex < 0) return;
        const cue = state.cues[state.selectedIndex];
        const dur = cueDurationMs(cue);
        cue.startMs = Math.max(0, cue.startMs + deltaMs);
        cue.endMs = cue.startMs + dur;
        renderDetailPane();
        onDetailChanged();
    }

    function setStartToPlayhead() {
        if (state.selectedIndex < 0 || !els.video) return;
        const cue = state.cues[state.selectedIndex];
        const dur = cueDurationMs(cue);
        cue.startMs = getPlaybackTimeMs();
        cue.endMs = cue.startMs + dur;
        renderDetailPane();
        onDetailChanged();
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
            const probe = await electron?.ffmpegProbe?.({ path: videoPath });
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
        state.lastPlayheadLabel = '';
        setDirty(false);

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
        state.cues.splice(idx, 1);
        state.selectedIndex = Math.min(idx, state.cues.length - 1);
        setDirty(true);
        renderCueList();
        setStatus(`已删除第 ${idx + 1} 条`, 'ok');
    }

    function quickSplitSelectedCue(mode) {
        if (state.selectedIndex < 0) return;
        syncDetailToCue();
        const idx = state.selectedIndex;
        const cue = state.cues[idx];
        const result = computeSplitParts(mode, cue);
        if (result.error) {
            setStatus(result.error, 'err');
            return;
        }
        applySplitResult(idx, result.cues);
    }

    function smartAdjustSelectedCueDuration() {
        if (state.selectedIndex < 0) return;
        syncDetailToCue();
        const idx = state.selectedIndex;
        const cue = state.cues[idx];
        const chars = textCharCount(cue.text);
        if (!chars) {
            setStatus('当前字幕无文本，无法调节时长', 'err');
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

        cue.endMs = newEnd;
        setDirty(true);
        refreshListRow(idx);
        if (state.selectedIndex === idx) renderDetailPane();
        const newCps = computeCps(cue.text, cueDurationMs(cue));
        setStatus(
            `已调节第 ${idx + 1} 条时长为 ${formatDurationSec(cueDurationMs(cue))} 秒`
            + (newCps ? `（CPS ${newCps}）` : ''),
            'ok',
        );
    }

    function updateContextMenuState() {
        if (!els.cueContextMenu) return;
        const hasCue = state.selectedIndex >= 0 && state.selectedIndex < state.cues.length;
        const text = hasCue ? String(state.cues[state.selectedIndex].text || '').trim() : '';
        const canSplit = hasCue && !!text;
        const canSplitLines = canSplit && String(state.cues[state.selectedIndex].text || '').includes('\n');
        const canSplitSpaces = canSplit && /\s/.test(String(state.cues[state.selectedIndex].text || ''));

        const canAlignStart = hasCue && !!els.video;
        const canSmartDur = hasCue && textCharCount(state.cues[state.selectedIndex].text) > 0;

        els.cueContextMenu.querySelectorAll('[data-ctx-action]').forEach((btn) => {
            const action = btn.dataset.ctxAction;
            if (action === 'split-modal' || action === 'split-lines' || action === 'split-spaces') {
                if (action === 'split-lines') btn.disabled = !canSplitLines;
                else if (action === 'split-spaces') btn.disabled = !canSplitSpaces;
                else btn.disabled = !canSplit;
            } else if (action === 'align-start') {
                btn.disabled = !canAlignStart;
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
            case 'split-lines':
                quickSplitSelectedCue('lines');
                break;
            case 'split-spaces':
                quickSplitSelectedCue('spaces');
                break;
            case 'align-start':
                setStartToPlayhead();
                break;
            case 'smart-dur':
                smartAdjustSelectedCueDuration();
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

    function splitTextByLines(text) {
        return String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }

    function splitTextBySpaces(text) {
        return String(text || '').trim().split(/\s+/).filter(Boolean);
    }

    function splitTextByCharCount(text, maxChars) {
        const max = Math.max(2, Math.floor(Number(maxChars) || 20));
        let remaining = String(text || '').trim();
        const parts = [];
        while (remaining.length > max) {
            let breakAt = max;
            const slice = remaining.slice(0, max);
            const punct = Math.max(
                slice.lastIndexOf(' '),
                slice.lastIndexOf('，'),
                slice.lastIndexOf('。'),
                slice.lastIndexOf('、'),
                slice.lastIndexOf('；'),
                slice.lastIndexOf(','),
                slice.lastIndexOf('.'),
            );
            if (punct > max * 0.4) breakAt = punct + 1;
            const chunk = remaining.slice(0, breakAt).trim();
            if (!chunk) break;
            parts.push(chunk);
            remaining = remaining.slice(breakAt).trim();
        }
        if (remaining) parts.push(remaining);
        return parts;
    }

    function splitTextIntoNParts(text, n) {
        const count = Math.max(2, Math.floor(Number(n) || 2));
        const raw = String(text || '').trim();
        if (!raw) return [];
        const chars = [...raw];
        if (chars.length < count) return null;
        const parts = [];
        const base = Math.floor(chars.length / count);
        let extra = chars.length % count;
        let idx = 0;
        for (let i = 0; i < count; i += 1) {
            const size = base + (extra > 0 ? 1 : 0);
            if (extra > 0) extra -= 1;
            parts.push(chars.slice(idx, idx + size).join('').trim());
            idx += size;
        }
        return parts.filter(Boolean);
    }

    function splitTextAtIndex(text, index) {
        const before = String(text || '').slice(0, index).trim();
        const after = String(text || '').slice(index).trim();
        if (!before || !after) return null;
        return [before, after];
    }

    function buildCuesFromTexts(startMs, endMs, texts, timeMode = 'proportional') {
        const list = (texts || []).map((t) => String(t || '').trim()).filter(Boolean);
        if (!list.length) return [];
        const end = endMs != null ? endMs : startMs + 2000;
        const totalDur = Math.max(100, end - startMs);
        if (list.length === 1) {
            return [{ startMs, endMs: end, text: list[0] }];
        }
        if (timeMode === 'equal') {
            const step = Math.floor(totalDur / list.length);
            let cur = startMs;
            return list.map((text, i) => {
                const isLast = i === list.length - 1;
                const cueEnd = isLast ? end : cur + step;
                const cue = { startMs: cur, endMs: cueEnd, text };
                cur = cueEnd;
                return cue;
            });
        }
        const totalWeight = list.reduce((s, t) => s + Math.max(1, textCharCount(t)), 0);
        let cur = startMs;
        return list.map((text, i) => {
            const isLast = i === list.length - 1;
            const weight = Math.max(1, textCharCount(text));
            const dur = isLast ? end - cur : Math.max(100, Math.round(totalDur * (weight / totalWeight)));
            const cue = { startMs: cur, endMs: cur + dur, text };
            cur += dur;
            return cue;
        });
    }

    function buildTwoPartSplitByTime(cue, splitMs, textBefore, textAfter) {
        const end = cueEndMs(cue);
        if (splitMs <= cue.startMs || splitMs >= end) return null;
        return [
            { startMs: cue.startMs, endMs: splitMs, text: textBefore },
            { startMs: splitMs, endMs: end, text: textAfter },
        ];
    }

    function computeSplitParts(mode, cue, opts = {}) {
        const text = String(cue.text || '').trim();
        const end = cueEndMs(cue);
        if (!text) return { error: '当前字幕文本为空，无法分割' };

        if (mode === 'lines') {
            const texts = splitTextByLines(text);
            if (texts.length < 2) return { error: '文本中没有多个换行，无法按行分割' };
            return { cues: buildCuesFromTexts(cue.startMs, end, texts, 'proportional') };
        }

        if (mode === 'spaces') {
            const texts = splitTextBySpaces(text);
            if (texts.length < 2) return { error: '文本中没有空格，无法按空格分割' };
            return { cues: buildCuesFromTexts(cue.startMs, end, texts, 'proportional') };
        }

        if (mode === 'chars') {
            const texts = splitTextByCharCount(text, opts.charCount);
            if (texts.length < 2) return { error: '按该字符数无法拆成多条' };
            return { cues: buildCuesFromTexts(cue.startMs, end, texts, 'proportional') };
        }

        if (mode === 'count') {
            const texts = splitTextIntoNParts(text, opts.count);
            if (texts === null) return { error: `文本过短，无法均分为 ${opts.count} 段` };
            if (texts.length < 2) return { error: '均分后不足两条，请减少段数' };
            return { cues: buildCuesFromTexts(cue.startMs, end, texts, 'equal') };
        }

        if (mode === 'cursor') {
            const ta = els.detailText;
            const pos = ta ? ta.selectionStart : text.length;
            const parts = splitTextAtIndex(text, pos);
            if (!parts) return { error: '请将光标置于文本中间再分割' };
            return { cues: buildCuesFromTexts(cue.startMs, end, parts, 'proportional') };
        }

        if (mode === 'playhead') {
            if (!els.video) return { error: '未加载视频，无法在播放头处分割' };
            const splitMs = getPlaybackTimeMs();
            if (splitMs <= cue.startMs || splitMs >= end) {
                return { error: '播放头不在当前字幕时间范围内' };
            }
            const ratio = (splitMs - cue.startMs) / (end - cue.startMs);
            const splitIdx = Math.min(text.length - 1, Math.max(1, Math.round(text.length * ratio)));
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

    function applySplitResult(idx, newCues) {
        if (!newCues?.length) return;
        state.cues.splice(idx, 1, ...newCues);
        state.selectedIndex = idx;
        setDirty(true);
        renderCueList();
        selectCue(idx, { scroll: true });
        setStatus(`已分割为 ${newCues.length} 条字幕`, 'ok');
    }

    function getSelectedSplitMode() {
        return document.querySelector('input[name="editorSplitMode"]:checked')?.value || 'lines';
    }

    function loadSplitPrefs() {
        try {
            const raw = localStorage.getItem(SPLIT_PREFS_KEY);
            if (!raw) return { remember: false, mode: 'lines', charCount: 20, count: 2 };
            const prefs = JSON.parse(raw);
            const mode = SPLIT_MODES.has(prefs.mode) ? prefs.mode : 'lines';
            return {
                remember: !!prefs.remember,
                mode,
                charCount: Math.max(2, Math.min(120, Number(prefs.charCount) || 20)),
                count: Math.max(2, Math.min(30, Number(prefs.count) || 2)),
            };
        } catch (_) {
            return { remember: false, mode: 'lines', charCount: 20, count: 2 };
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
        const mode = prefs.remember ? prefs.mode : 'lines';
        const radio = document.querySelector(`input[name="editorSplitMode"][value="${mode}"]`);
        if (radio) radio.checked = true;
        else {
            const fallback = document.querySelector('input[name="editorSplitMode"][value="lines"]');
            if (fallback) fallback.checked = true;
        }
    }

    function updateSplitModalState() {
        const mode = getSelectedSplitMode();
        if (els.splitCharCount) els.splitCharCount.disabled = mode !== 'chars';
        if (els.splitCount) els.splitCount.disabled = mode !== 'count';

        if (!els.splitHint || state.selectedIndex < 0) return;
        syncDetailToCue();
        const cue = state.cues[state.selectedIndex];
        const end = cueEndMs(cue);
        let hint = '';

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
        }

        if (hint) {
            els.splitHint.textContent = hint;
            els.splitHint.classList.remove('hidden');
        } else {
            els.splitHint.textContent = '';
            els.splitHint.classList.add('hidden');
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

    function confirmSplit() {
        if (state.selectedIndex < 0) return;
        syncDetailToCue();
        const idx = state.selectedIndex;
        const cue = state.cues[idx];
        const mode = getSelectedSplitMode();
        const result = computeSplitParts(mode, cue, {
            charCount: Number(els.splitCharCount?.value) || 20,
            count: Number(els.splitCount?.value) || 2,
        });
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
        applySplitResult(idx, result.cues);
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

    function getSelectedBatchDurCondition() {
        return document.querySelector('input[name="editorBatchDurCond"]:checked')?.value || 'all';
    }

    function readBatchDurOptions() {
        const condition = getSelectedBatchDurCondition();
        return {
            condition,
            targetSec: Number(els.batchDurTarget?.value) || 2,
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

    function collectBatchDurMatches(opts) {
        syncDetailToCue();
        const indices = [];
        state.cues.forEach((cue, idx) => {
            if (matchesBatchDurCondition(cue, idx, opts)) indices.push(idx);
        });
        return indices;
    }

    function updateBatchDurModalState() {
        const cond = getSelectedBatchDurCondition();
        if (els.batchDurShorter) els.batchDurShorter.disabled = cond !== 'shorter';
        if (els.batchDurLonger) els.batchDurLonger.disabled = cond !== 'longer';
        if (els.batchDurMin) els.batchDurMin.disabled = cond !== 'between';
        if (els.batchDurMax) els.batchDurMax.disabled = cond !== 'between';
        if (els.batchDurCpsAbove) els.batchDurCpsAbove.disabled = cond !== 'cps_above';
        if (els.batchDurCpsBelow) els.batchDurCpsBelow.disabled = cond !== 'cps_below';
        if (els.batchDurText) els.batchDurText.disabled = cond !== 'text_contains';

        if (!els.batchDurPreview) return;
        const opts = readBatchDurOptions();
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

    function openBatchDurModal() {
        if (!els.batchDurModal) return;
        syncDetailToCue();
        showEditorModal(els.batchDurModal, els.batchDurTarget);
        updateBatchDurModalState();
    }

    function closeBatchDurModal() {
        hideEditorModal(els.batchDurModal);
    }

    function confirmBatchDurAdjust() {
        const opts = readBatchDurOptions();
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
        [
            els.batchDurTarget,
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
        els.splitCharCount?.addEventListener('input', updateSplitModalState);
        els.splitCount?.addEventListener('input', updateSplitModalState);
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
        });
        els.targetCps?.addEventListener('change', () => {
            saveTargetCpsPrefs();
            updateDetailMeta();
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
            selectCue(idx, { seek: true, scroll: true });
            focusCueList();
        });

        els.cueBody?.addEventListener('dblclick', (e) => {
            const row = e.target.closest('tr[data-cue-idx]');
            if (!row) return;
            els.detailText?.focus();
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
                    els.smartAdjustModal,
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
            batchDurTarget: document.getElementById('editorBatchDurTarget'),
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
            splitRemember: document.getElementById('editorSplitRemember'),
            splitHint: document.getElementById('editorSplitHint'),
            startNudgeBack: document.getElementById('editorStartNudgeBack'),
            startNudgeFwd: document.getElementById('editorStartNudgeFwd'),
            durNudgeDown: document.getElementById('editorDurNudgeDown'),
            durNudgeUp: document.getElementById('editorDurNudgeUp'),
            setStartToPlayhead: document.getElementById('editorSetStartToPlayhead'),
            video: document.getElementById('editorVideo'),
            videoFrame: document.getElementById('editorVideoFrame'),
            videoWrap: document.getElementById('editorVideoWrap'),
            videoHint: document.getElementById('editorVideoHint'),
            videoSubtitle: document.getElementById('editorVideoSubtitle'),
            videoSubtitleText: document.getElementById('editorVideoSubtitleText'),
            statusLine: document.getElementById('editorStatusLine'),
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
            els.smartAdjustModal,
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

        editorBootstrapped = true;
        if (pendingEditorInit) {
            const payload = pendingEditorInit;
            pendingEditorInit = null;
            bootstrapEditorDocument(payload);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
    } else {
        setTimeout(init, 0);
    }
}(window));
