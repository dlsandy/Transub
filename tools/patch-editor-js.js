/**
 * Patch subtitle-editor.js for UI overhaul.
 * Run: node tools/patch-editor-js.js
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'js', 'subtitle-editor.js');
let src = fs.readFileSync(file, 'utf8');

function mustReplace(label, from, to) {
    if (!src.includes(from)) {
        throw new Error(`Patch failed (${label}): pattern not found`);
    }
    src = src.replace(from, to);
}

mustReplace(
    'prefs keys',
    `    const SPLIT_PREFS_KEY = 'transub-editor-split-prefs';
    const TARGET_CPS_KEY = 'transub-editor-target-cps';
    const RETRANSCRIBE_DUR_KEY = 'transub-editor-retranscribe-dur';`,
    `    const SPLIT_PREFS_KEY = 'transub-editor-split-prefs';
    const TARGET_CPS_KEY = 'transub-editor-target-cps';
    const RETRANSCRIBE_DUR_KEY = 'transub-editor-retranscribe-dur';
    const THEME_KEY = 'transub-editor-theme';
    const PANEL_WIDTH_KEY = 'transub-editor-cues-width';
    const DETAIL_TOOLS_KEY = 'transub-editor-detail-tools-open';`,
);

mustReplace(
    'state fields',
    `        glossary: { version: 1, entries: [] },
        glossaryEditingId: '',
        glossaryIssues: [],
    };`,
    `        glossary: { version: 1, entries: [] },
        glossaryEditingId: '',
        glossaryIssues: [],
        listFilter: 'all',
        qcIssueIndexSet: new Set(),
        timeline: {
            dragging: null,
            durationMs: 0,
            viewStartMs: 0,
            viewEndMs: 0,
        },
    };`,
);

mustReplace(
    'setStatus',
    `    function setStatus(msg, type) {
        if (!els.statusLine) return;
        els.statusLine.textContent = msg || '';
        els.statusLine.className = \`text-xs px-3 py-1.5 border-t border-gray-100 shrink-0 truncate \${
            type === 'err' ? 'text-red-600' : type === 'ok' ? 'text-emerald-600' : 'text-gray-500'
        }\`;
    }`,
    `    function setStatus(msg, type) {
        if (!els.statusLine) return;
        els.statusLine.textContent = msg || '';
        els.statusLine.className = \`status-msg\${
            type === 'err' ? ' err' : type === 'ok' ? ' ok' : type === 'warn' ? ' warn' : ''
        }\`;
    }`,
);

mustReplace(
    'updateDetailMeta cps classes',
    `                els.detailCps.className = 'text-[10px] text-violet-600 font-medium';
            } else {
                const cpsNum = Number(cps);
                els.detailCps.textContent = \`当前 CPS \${cps}（目标 \${targetCps}）\`;
                if (cpsNum > targetCps * 1.05) {
                    els.detailCps.className = 'text-[10px] text-amber-600 font-medium';
                } else {
                    els.detailCps.className = 'text-[10px] text-violet-600 font-medium';
                }
            }`,
    `                els.detailCps.style.color = 'var(--ed-accent)';
                els.detailCps.style.fontWeight = '500';
            } else {
                const cpsNum = Number(cps);
                els.detailCps.textContent = \`当前 CPS \${cps}（目标 \${targetCps}）\`;
                if (cpsNum > targetCps * 1.05) {
                    els.detailCps.style.color = 'var(--ed-warn-text)';
                    els.detailCps.style.fontWeight = '600';
                } else {
                    els.detailCps.style.color = 'var(--ed-accent)';
                    els.detailCps.style.fontWeight = '500';
                }
            }`,
);

mustReplace(
    'renderCueList empty',
    `            els.cueBody.innerHTML = '<tr><td colspan="5" class="px-3 py-6 text-center text-gray-400 text-xs">无字幕条目</td></tr>';`,
    `            els.cueBody.innerHTML = '<tr><td colspan="6" class="px-3 py-6 text-center text-xs" style="color:var(--ed-faint)">无字幕条目</td></tr>';
            if (els.filterCount) els.filterCount.textContent = '';
            renderTimeline();`,
);

mustReplace(
    'renderCueList body',
    `        refreshCueMeta();
        els.cueBody.innerHTML = state.cues.map((cue, idx) => {
            const prev = idx > 0 ? state.cues[idx - 1] : null;
            const next = idx < state.cues.length - 1 ? state.cues[idx + 1] : null;
            const w = getCueWarnings(cue, prev, next);
            const preview = String(cue.text || '').replace(/\\s+/g, ' ').trim();
            const low = !!state.cueMeta[idx]?.low;
            return \`
            <tr class="cursor-pointer hover:bg-gray-50/80 border-b border-gray-50\${low ? ' cue-row-low-conf' : ''}" data-cue-idx="\${idx}" title="\${low ? '低置信：建议检查或重转写' : ''}">
                <td class="text-xs text-gray-500 tabular-nums align-middle col-idx">\${idx + 1}\${low ? '<span class="low-conf-dot" aria-label="低置信">!</span>' : ''}</td>
                <td class="font-mono text-[11px] tabular-nums align-middle \${w.start ? 'cell-warn' : ''}">\${esc(formatDisplayTime(cue.startMs, state.format))}</td>
                <td class="font-mono text-[11px] tabular-nums align-middle \${w.end ? 'cell-warn' : ''}">\${esc(formatDisplayTime(cueEndMs(cue), state.format))}</td>
                <td class="text-[11px] tabular-nums align-middle \${w.dur ? 'cell-warn' : ''}">\${esc(formatDurationSec(cueDurationMs(cue)))}</td>
                <td class="cell-text align-middle">\${esc(preview || '—')}</td>
            </tr>\`;
        }).join('');

        if (state.selectedIndex >= state.cues.length) state.selectedIndex = state.cues.length - 1;
        if (state.selectedIndex < 0 && state.cues.length) state.selectedIndex = 0;
        updateListRowClasses();
        renderDetailPane();
        scheduleVideoTextTrackRefresh();
        resyncPlaybackAfterCueTimingChange();
        refreshQcBadge();
        refreshGlossaryBadge();
    }`,
    `        refreshCueMeta();
        refreshQcIssueIndexSet();
        const visibleIdxs = getVisibleCueIndexes();
        if (els.filterCount) {
            els.filterCount.textContent = state.listFilter === 'all'
                ? ''
                : \`显示 \${visibleIdxs.length} / \${state.cues.length}\`;
        }
        if (!visibleIdxs.length) {
            const emptyMsg = state.listFilter === 'all' ? '无字幕条目' : '当前筛选无匹配条目';
            els.cueBody.innerHTML = \`<tr><td colspan="6" class="px-3 py-6 text-center text-xs" style="color:var(--ed-faint)">\${emptyMsg}</td></tr>\`;
        } else {
            els.cueBody.innerHTML = visibleIdxs.map((idx) => {
                const cue = state.cues[idx];
                const prev = idx > 0 ? state.cues[idx - 1] : null;
                const next = idx < state.cues.length - 1 ? state.cues[idx + 1] : null;
                const w = getCueWarnings(cue, prev, next);
                const preview = String(cue.text || '').replace(/\\s+/g, ' ').trim();
                const low = !!state.cueMeta[idx]?.low;
                const cps = computeCps(cue.text, cueDurationMs(cue));
                const cpsNum = cps != null ? Number(cps) : null;
                const cpsHot = cpsNum != null && cpsNum > 18;
                const titleAttr = low ? '低置信：建议检查或重转写' : esc(preview || '');
                return \`
            <tr class="\${low ? 'cue-row-low-conf' : ''}" data-cue-idx="\${idx}" title="\${titleAttr}">
                <td class="text-xs tabular-nums align-middle col-idx" style="color:var(--ed-muted)">\${idx + 1}\${low ? '<span class="low-conf-dot" aria-label="低置信">!</span>' : ''}</td>
                <td class="font-mono text-[11px] tabular-nums align-middle \${w.start ? 'cell-warn' : ''}">\${esc(formatDisplayTime(cue.startMs, state.format))}</td>
                <td class="font-mono text-[11px] tabular-nums align-middle \${w.end ? 'cell-warn' : ''}">\${esc(formatDisplayTime(cueEndMs(cue), state.format))}</td>
                <td class="text-[11px] tabular-nums align-middle \${w.dur ? 'cell-warn' : ''}">\${esc(formatDurationSec(cueDurationMs(cue)))}</td>
                <td class="cue-cps-cell align-middle \${cpsHot ? 'hot' : ''}">\${cps != null ? esc(cps) : '—'}</td>
                <td class="cell-text align-middle">\${esc(preview || '—')}</td>
            </tr>\`;
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
    }`,
);

mustReplace(
    'refreshListRow cells',
    `        if (cells[4]) {
            cells[4].textContent = String(cue.text || '').replace(/\\s+/g, ' ').trim() || '—';
        }`,
    `        if (cells[4]) {
            const cps = computeCps(cue.text, cueDurationMs(cue));
            const cpsNum = cps != null ? Number(cps) : null;
            cells[4].textContent = cps != null ? cps : '—';
            cells[4].className = \`cue-cps-cell align-middle\${cpsNum != null && cpsNum > 18 ? ' hot' : ''}\`;
        }
        if (cells[5]) {
            cells[5].textContent = String(cue.text || '').replace(/\\s+/g, ' ').trim() || '—';
        }`,
);

mustReplace(
    'syncFromExternalTime playhead',
    `        if (updatePlayhead) {
            state.lastPlayheadLabel = '';
            if (els.playheadTime) {
                els.playheadTime.textContent = formatDisplayTime(t, state.format);
                state.lastPlayheadLabel = els.playheadTime.textContent;
            }
        }
        updateVideoSubtitleOverlay();
    }`,
    `        if (updatePlayhead) {
            state.lastPlayheadLabel = '';
            if (els.playheadTime) {
                els.playheadTime.textContent = formatDisplayTime(t, state.format);
                state.lastPlayheadLabel = els.playheadTime.textContent;
            }
            updateTimelinePlayhead(t);
        }
        updateVideoSubtitleOverlay();
    }`,
);

mustReplace(
    'updateVideoHint',
    `    function updateVideoHint() {
        if (!els.videoHint) return;
        if (state.videoPath) {
            const codecInfo = describeVideoCodec(state.videoCodec, state.videoWidth, state.videoHeight);
            const suffix = codecInfo ? \` · \${codecInfo}\` : '';
            els.videoHint.textContent = \`\${basename(state.videoPath)}\${suffix} · 列表选中编辑 · Ctrl+S 保存\`;
        } else {
            els.videoHint.textContent = '未关联视频，可点击「关联视频」；亦可仅编辑文本与时间轴';
        }
    }`,
    `    function updateVideoHint() {
        if (!els.videoHint) return;
        if (state.videoPath) {
            const codecInfo = describeVideoCodec(state.videoCodec, state.videoWidth, state.videoHeight);
            const suffix = codecInfo ? \` · \${codecInfo}\` : '';
            els.videoHint.textContent = \`\${basename(state.videoPath)}\${suffix} · Space 播放 · Ctrl+S 保存\`;
        } else {
            els.videoHint.textContent = '未关联视频，可点击「关联视频」；亦可仅编辑文本与时间轴';
        }
        if (els.videoEmpty) {
            els.videoEmpty.classList.toggle('visible', !state.videoPath);
        }
        updateNeedsVideoUi();
        updateTimelineDuration();
        renderTimeline();
    }`,
);

mustReplace(
    'onVideoPlay',
    `    function onVideoPlay() {
        document.body.classList.add('editor-video-playing');
        syncPlaybackFromVideo(true);
        scheduleCueBoundarySync();
        startPlayheadTimer();
    }

    function onVideoPause() {
        document.body.classList.remove('editor-video-playing');
        stopPlaybackTimers();
        syncPlaybackFromVideo(true);
    }`,
    `    function onVideoPlay() {
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
    }`,
);

mustReplace(
    'updatePlayheadTimeLabel',
    `    function updatePlayheadTimeLabel(exact) {
        if (!els.playheadTime) return;
        const t = els.video ? (els.video.currentTime || 0) * 1000 : 0;
        const displayMs = exact ? Math.round(t) : Math.floor(t / 1000) * 1000;
        const label = formatDisplayTime(displayMs, state.format);
        if (label === state.lastPlayheadLabel) return;
        state.lastPlayheadLabel = label;
        els.playheadTime.textContent = label;
    }`,
    `    function updatePlayheadTimeLabel(exact) {
        if (!els.playheadTime) return;
        const t = els.video ? (els.video.currentTime || 0) * 1000 : 0;
        const displayMs = exact ? Math.round(t) : Math.floor(t / 1000) * 1000;
        const label = formatDisplayTime(displayMs, state.format);
        if (label !== state.lastPlayheadLabel) {
            state.lastPlayheadLabel = label;
            els.playheadTime.textContent = label;
        }
        updateTimelinePlayhead(Math.round(t));
    }`,
);

const uiHelpers = `
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
        setStatus(\`问题条目 \${issues.indexOf(next) + 1}/\${issues.length}\`, 'warn');
    }

    function updateNeedsVideoUi() {
        const hasVideo = !!state.videoPath;
        document.querySelectorAll('.needs-video').forEach((btn) => {
            btn.classList.toggle('is-no-video', !hasVideo);
            if (!hasVideo) {
                if (!btn.dataset.titleFull) btn.dataset.titleFull = btn.title || '';
                btn.title = (btn.dataset.titleFull || btn.title || '') + '（需先关联视频）';
            } else if (btn.dataset.titleFull) {
                btn.title = btn.dataset.titleFull;
            }
        });
    }

    function applyTheme(theme) {
        const dark = theme === 'dark';
        document.body.classList.toggle('editor-theme-dark', dark);
        document.body.classList.toggle('editor-theme-light', !dark);
        try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (_) { /* ignore */ }
        if (els.themeToggle) {
            els.themeToggle.innerHTML = dark ? '<i class="fa fa-sun-o"></i>' : '<i class="fa fa-moon-o"></i>';
            els.themeToggle.title = dark ? '切换到浅色主题' : '切换到深色主题';
        }
    }

    function loadTheme() {
        let theme = 'light';
        try { theme = localStorage.getItem(THEME_KEY) || 'light'; } catch (_) { /* ignore */ }
        applyTheme(theme === 'dark' ? 'dark' : 'light');
    }

    function toggleTheme() {
        const dark = document.body.classList.contains('editor-theme-dark');
        applyTheme(dark ? 'light' : 'dark');
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

    function applyPanelWidth(pct) {
        const clamped = Math.min(62, Math.max(28, Number(pct) || 42));
        document.documentElement.style.setProperty('--ed-cues-width', \`\${clamped}%\`);
        try { localStorage.setItem(PANEL_WIDTH_KEY, String(clamped)); } catch (_) { /* ignore */ }
    }

    function loadPanelWidth() {
        let pct = 42;
        try {
            const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
            if (Number.isFinite(saved)) pct = saved;
        } catch (_) { /* ignore */ }
        applyPanelWidth(pct);
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

    function updateTimelineDuration() {
        let durMs = 0;
        if (els.video && Number.isFinite(els.video.duration) && els.video.duration > 0) {
            durMs = Math.round(els.video.duration * 1000);
        } else if (state.cues.length) {
            durMs = Math.max(...state.cues.map((c) => cueEndMs(c)), 1000);
        }
        state.timeline.durationMs = Math.max(durMs, 1000);
        state.timeline.viewStartMs = 0;
        state.timeline.viewEndMs = state.timeline.durationMs;
    }

    function timelineMsToX(ms) {
        const track = els.timelineTrack;
        if (!track) return 0;
        const w = track.clientWidth || 1;
        const span = Math.max(1, state.timeline.viewEndMs - state.timeline.viewStartMs);
        return ((ms - state.timeline.viewStartMs) / span) * w;
    }

    function timelineXToMs(x) {
        const track = els.timelineTrack;
        if (!track) return 0;
        const w = track.clientWidth || 1;
        const span = Math.max(1, state.timeline.viewEndMs - state.timeline.viewStartMs);
        return state.timeline.viewStartMs + (x / w) * span;
    }

    function updateTimelinePlayhead(ms) {
        if (!els.timelinePlayhead) return;
        const x = timelineMsToX(ms);
        els.timelinePlayhead.style.left = \`\${x}px\`;
    }

    function renderTimeline() {
        if (!els.timelineCues) return;
        updateTimelineDuration();
        const selected = state.selectedIndex;
        els.timelineCues.innerHTML = state.cues.map((cue, idx) => {
            const start = cue.startMs;
            const end = cueEndMs(cue);
            const left = timelineMsToX(start);
            const right = timelineMsToX(end);
            const width = Math.max(3, right - left);
            const label = String(cue.text || '').replace(/\\s+/g, ' ').trim();
            return \`<div class="editor-timeline-cue\${idx === selected ? ' selected' : ''}" data-tl-idx="\${idx}" style="left:\${left}px;width:\${width}px" title="\${esc(label)}">
                <div class="tl-handle tl-handle-l" data-tl-handle="l"></div>
                <div class="tl-label">\${esc(label.slice(0, 24))}</div>
                <div class="tl-handle tl-handle-r" data-tl-handle="r"></div>
            </div>\`;
        }).join('');
        const t = els.video ? Math.round((els.video.currentTime || 0) * 1000) : 0;
        updateTimelinePlayhead(t);
    }

    function bindTimelineInteractions() {
        const track = els.timelineTrack;
        if (!track || track.dataset.bound === '1') return;
        track.dataset.bound = '1';

        track.addEventListener('mousedown', (e) => {
            const cueEl = e.target.closest?.('.editor-timeline-cue');
            const handle = e.target.closest?.('[data-tl-handle]')?.getAttribute('data-tl-handle');
            const rect = track.getBoundingClientRect();
            const x = e.clientX - rect.left;

            if (!cueEl) {
                if (!els.video || !state.videoPath) return;
                const ms = Math.max(0, timelineXToMs(x));
                els.video.currentTime = ms / 1000;
                syncPlaybackFromVideo(true);
                return;
            }

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
                const span = Math.max(1, state.timeline.viewEndMs - state.timeline.viewStartMs);
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
                renderTimeline();
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
                renderTimeline();
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });

        window.addEventListener('resize', () => {
            if (state.ready) renderTimeline();
        });
    }

    function loadDetailToolsPref() {
        if (!els.detailTools) return;
        try {
            const open = localStorage.getItem(DETAIL_TOOLS_KEY);
            if (open === '1') els.detailTools.open = true;
            else if (open === '0') els.detailTools.open = false;
        } catch (_) { /* ignore */ }
        els.detailTools.addEventListener('toggle', () => {
            try {
                localStorage.setItem(DETAIL_TOOLS_KEY, els.detailTools.open ? '1' : '0');
            } catch (_) { /* ignore */ }
        });
    }

`;

mustReplace(
    'insert ui helpers',
    `    function openShortcutsModal() {`,
    `${uiHelpers}
    function openShortcutsModal() {`,
);

mustReplace(
    'bindEvents start',
    `    function bindEvents() {
        els.saveBtn?.addEventListener('click', saveDocument);`,
    `    function bindEvents() {
        loadTheme();
        loadPanelWidth();
        loadDetailToolsPref();
        bindPanelSplitter();
        bindTimelineInteractions();

        els.themeToggle?.addEventListener('click', toggleTheme);
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

        els.saveBtn?.addEventListener('click', saveDocument);`,
);

mustReplace(
    'video listeners end',
    `        els.video?.addEventListener('ratechange', () => {
            if (els.video && !els.video.paused) scheduleCueBoundarySync();
        });
    }`,
    `        els.video?.addEventListener('ratechange', () => {
            if (els.video && !els.video.paused) scheduleCueBoundarySync();
        });
        els.video?.addEventListener('loadedmetadata', () => {
            updateTimelineDuration();
            renderTimeline();
            updatePlayPauseButton();
        });
        els.video?.addEventListener('timeupdate', () => {
            if (els.video && !els.video.paused) updateTimelinePlayhead(Math.round((els.video.currentTime || 0) * 1000));
        });
    }`,
);

mustReplace(
    'cacheElements begin',
    `    function cacheElements() {
        els = {
            title: document.getElementById('editorTitle'),
            formatBadge: document.getElementById('editorFormatBadge'),
            cueCount: document.getElementById('editorCueCount'),
            lowConfBadge: document.getElementById('editorLowConfBadge'),
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
            shortcutsBtn: document.getElementById('editorShortcutsBtn'),`,
    `    function cacheElements() {
        els = {
            title: document.getElementById('editorTitle'),
            formatBadge: document.getElementById('editorFormatBadge'),
            cueCount: document.getElementById('editorCueCount'),
            lowConfBadge: document.getElementById('editorLowConfBadge'),
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
            toolsMenuBtn: document.getElementById('editorToolsMenuBtn'),
            toolsMenu: document.getElementById('editorToolsMenu'),
            themeToggle: document.getElementById('editorThemeToggle'),
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
            timeline: document.getElementById('editorTimeline'),
            timelineTrack: document.getElementById('editorTimelineTrack'),
            timelineCues: document.getElementById('editorTimelineCues'),
            timelinePlayhead: document.getElementById('editorTimelinePlayhead'),
            shortcutsBtn: document.getElementById('editorShortcutsBtn'),`,
);

mustReplace(
    'restore confirm',
    `        els.restoreBtn?.addEventListener('click', restoreInitialSnapshot);`,
    `        els.restoreBtn?.addEventListener('click', restoreInitialSnapshot);`
);

mustReplace(
    'cueCount updates keep',
    `        if (els.cueCount) els.cueCount.textContent = \`\${state.cues.length} 条\`;`,
    `        if (els.cueCount) els.cueCount.textContent = \`\${state.cues.length} 条\`;
        updateNeedsVideoUi();`,
);

mustReplace(
    'restore wording',
    `        if (!editorConfirm('确定恢复到打开文件时的初始字幕？当前未保存的修改将丢失。')) return;`,
    `        if (!editorConfirm('将丢弃当前全部修改并恢复到打开文件时的初始字幕，确定继续？')) return;`,
);

fs.writeFileSync(file, src, 'utf8');
console.log('Patched', file, 'bytes', src.length);
