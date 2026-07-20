/**
 * 字幕编辑器 — localStorage 偏好（主题、面板、CPS、分割、断句词等）
 */
(function (global) {
    const SPLIT_PREFS_KEY = 'transub-editor-split-prefs';
    const BREAK_WORDS_KEY = 'transub-editor-break-words';
    const TARGET_CPS_KEY = 'transub-editor-target-cps';
    const RETRANSCRIBE_DUR_KEY = 'transub-editor-retranscribe-dur';
    const THEME_KEY = 'transub-editor-theme';
    const PANEL_WIDTH_KEY = 'transub-editor-cues-width';
    const DETAIL_TOOLS_KEY = 'transub-editor-detail-tools-open';
    const AUTO_FOCUS_KEY = 'transub-editor-auto-focus';
    const WAVEFORM_KEY = 'transub-editor-waveform';
    const TIMELINE_ZOOM_KEY = 'transub-editor-timeline-zoom';
    const DEFAULT_TARGET_CPS = 3;
    const DEFAULT_RETRANSCRIBE_DUR_SEC = 10;
    const DEFAULT_TIMELINE_ZOOM = 5;
    const SPLIT_MODES = new Set(['smart', 'lines', 'spaces', 'chars', 'count', 'cursor', 'playhead', 'silence']);

    function installPrefs(ctx) {
        if (!ctx?.state || !ctx?.els) {
            throw new Error('installPrefs(ctx): ctx.state, ctx.els required');
        }
        const splitCore = ctx.splitCore || global.TransubSubtitleSplit;
        if (!splitCore) {
            throw new Error('installPrefs(ctx): splitCore / TransubSubtitleSplit required');
        }
        const clampTargetCps = ctx.clampTargetCps
            || global.TransubEditorParts?.utils?.clampTargetCps;
        if (typeof clampTargetCps !== 'function') {
            throw new Error('installPrefs(ctx): clampTargetCps required');
        }

        function loadTargetCpsPrefs() {
            try {
                const raw = localStorage.getItem(TARGET_CPS_KEY);
                if (raw == null) return DEFAULT_TARGET_CPS;
                return clampTargetCps(JSON.parse(raw), DEFAULT_TARGET_CPS);
            } catch (_) {
                return DEFAULT_TARGET_CPS;
            }
        }

        function saveTargetCpsPrefs() {
            const { els } = ctx;
            const value = clampTargetCps(els.targetCps?.value, DEFAULT_TARGET_CPS);
            if (els.targetCps) els.targetCps.value = String(value);
            try {
                localStorage.setItem(TARGET_CPS_KEY, JSON.stringify(value));
            } catch (_) { /* ignore quota errors */ }
        }

        function getTargetCps() {
            const { els } = ctx;
            return clampTargetCps(els.targetCps?.value ?? loadTargetCpsPrefs(), DEFAULT_TARGET_CPS);
        }

        function applyTargetCpsPrefs() {
            const { els } = ctx;
            if (els.targetCps) els.targetCps.value = String(loadTargetCpsPrefs());
        }

        function getDefaultBreakWords() {
            return splitCore.normalizeBreakWords(splitCore.DEFAULT_BREAK_WORDS || []);
        }

        function loadBreakWords() {
            const { state } = ctx;
            if (Array.isArray(state.breakWords)) {
                return splitCore.normalizeBreakWords(state.breakWords);
            }
            try {
                const raw = localStorage.getItem(BREAK_WORDS_KEY);
                if (raw == null) {
                    state.breakWords = getDefaultBreakWords();
                    return state.breakWords.slice();
                }
                const parsed = JSON.parse(raw);
                state.breakWords = splitCore.normalizeBreakWords(
                    Array.isArray(parsed) ? parsed : parsed?.words,
                );
                return state.breakWords.slice();
            } catch (_) {
                state.breakWords = getDefaultBreakWords();
                return state.breakWords.slice();
            }
        }

        function saveBreakWords(words) {
            const { state } = ctx;
            state.breakWords = splitCore.normalizeBreakWords(words);
            try {
                localStorage.setItem(BREAK_WORDS_KEY, JSON.stringify(state.breakWords));
            } catch (_) { /* ignore */ }
            return state.breakWords.slice();
        }

        function clampRetranscribeDurSec(value) {
            return Math.max(0.5, Math.min(180, Number(value) || DEFAULT_RETRANSCRIBE_DUR_SEC));
        }

        function loadRetranscribeDurPrefs() {
            try {
                const raw = localStorage.getItem(RETRANSCRIBE_DUR_KEY);
                if (!raw) {
                    return {
                        durationSec: DEFAULT_RETRANSCRIBE_DUR_SEC,
                        padMs: 350,
                        startMode: 'selected',
                        snapAfter: true,
                    };
                }
                const prefs = JSON.parse(raw);
                return {
                    durationSec: clampRetranscribeDurSec(prefs.durationSec),
                    padMs: Math.max(0, Math.min(2000, Math.round(Number(prefs.padMs) || 350))),
                    startMode: prefs.startMode === 'playhead' ? 'playhead' : 'selected',
                    snapAfter: prefs.snapAfter !== false,
                };
            } catch (_) {
                return {
                    durationSec: DEFAULT_RETRANSCRIBE_DUR_SEC,
                    padMs: 350,
                    startMode: 'selected',
                    snapAfter: true,
                };
            }
        }

        function saveRetranscribeDurPrefs(prefs) {
            try {
                localStorage.setItem(RETRANSCRIBE_DUR_KEY, JSON.stringify(prefs));
            } catch (_) { /* ignore */ }
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
            const { els } = ctx;
            const getSelectedSplitMode = ctx.getSelectedSplitMode;
            const remember = !!els.splitRemember?.checked;
            const payload = remember
                ? {
                    remember: true,
                    mode: typeof getSelectedSplitMode === 'function' ? getSelectedSplitMode() : 'smart',
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
            const { els } = ctx;
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

        function applyAutoFocusUi() {
            const { state, els } = ctx;
            if (!els.autoFocusBtn) return;
            const on = state.autoFocus === true;
            els.autoFocusBtn.classList.toggle('is-active', on);
            els.autoFocusBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            els.autoFocusBtn.title = on
                ? '自动焦点：开启（播放时字幕选中跟随进度）'
                : '自动焦点：关闭（播放时不自动选中字幕）';
            document.body.classList.toggle('editor-auto-focus', on);
        }

        function loadAutoFocusPref() {
            const { state } = ctx;
            let on = false;
            try { on = localStorage.getItem(AUTO_FOCUS_KEY) === '1'; } catch (_) { /* ignore */ }
            state.autoFocus = on === true;
            applyAutoFocusUi();
        }

        function toggleAutoFocus() {
            const { state, setStatus, isAutoFocusEnabled, followPlaybackFocus } = ctx;
            state.autoFocus = !(typeof isAutoFocusEnabled === 'function'
                ? isAutoFocusEnabled()
                : state.autoFocus === true);
            try { localStorage.setItem(AUTO_FOCUS_KEY, state.autoFocus ? '1' : '0'); } catch (_) { /* ignore */ }
            applyAutoFocusUi();
            if (typeof setStatus === 'function') {
                setStatus(state.autoFocus ? '已开启自动焦点' : '已关闭自动焦点', 'ok');
            }
            if (state.autoFocus && state.playbackIndex >= 0 && typeof followPlaybackFocus === 'function') {
                followPlaybackFocus(state.playbackIndex);
            }
        }

        function applyTheme(theme) {
            const { els } = ctx;
            const dark = theme === 'dark';
            document.body.classList.toggle('editor-theme-dark', dark);
            document.body.classList.toggle('editor-theme-light', !dark);
            try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (_) { /* ignore */ }
            if (els.themeToggle) {
                els.themeToggle.innerHTML = dark ? '<i class="fa fa-sun-o" aria-hidden="true"></i>' : '<i class="fa fa-moon-o" aria-hidden="true"></i>';
                els.themeToggle.title = dark ? '切换到浅色主题' : '切换到深色主题';
                els.themeToggle.setAttribute('aria-label', els.themeToggle.title);
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

        function applyPanelWidth(pct) {
            const clamped = Math.min(62, Math.max(28, Number(pct) || 42));
            document.documentElement.style.setProperty('--ed-cues-width', `${clamped}%`);
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

        function loadDetailToolsPref() {
            const { els } = ctx;
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

        function applyWaveformUi() {
            const { state, els } = ctx;
            const on = state.waveformEnabled === true;
            document.body.classList.toggle('editor-waveform-on', on);
            if (els.waveformToggle) {
                els.waveformToggle.classList.toggle('is-active', on);
                els.waveformToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
                if (!els.waveformToggle.classList.contains('is-loading')) {
                    els.waveformToggle.title = on ? '波形时间轴：开启（默认）' : '波形时间轴：关闭';
                }
            }
            if (els.waveformRow) {
                els.waveformRow.classList.toggle('hidden', !on);
            }
            if (els.timelineWaveform) {
                els.timelineWaveform.classList.toggle('hidden', !on);
            }
        }

        function loadWaveformPref() {
            const { state } = ctx;
            let on = true;
            try {
                const raw = localStorage.getItem(WAVEFORM_KEY);
                if (raw === '0') on = false;
                else if (raw === '1') on = true;
            } catch (_) { /* ignore */ }
            state.waveformEnabled = on === true;
            applyWaveformUi();
        }

        function toggleWaveform() {
            const { state, setStatus } = ctx;
            state.waveformEnabled = !state.waveformEnabled;
            try { localStorage.setItem(WAVEFORM_KEY, state.waveformEnabled ? '1' : '0'); } catch (_) { /* ignore */ }
            applyWaveformUi();
            if (!state.waveformEnabled && typeof setStatus === 'function') {
                setStatus('已关闭波形时间轴', 'ok');
            }
            if (typeof ctx.onWaveformPrefChanged === 'function') {
                ctx.onWaveformPrefChanged(state.waveformEnabled);
            }
        }

        function clampTimelineZoomPref(value, fallback = DEFAULT_TIMELINE_ZOOM) {
            const z = Number(value);
            if (!Number.isFinite(z) || z < 1) return fallback;
            return Math.min(1000, z);
        }

        function loadTimelineZoomPref() {
            try {
                const raw = localStorage.getItem(TIMELINE_ZOOM_KEY);
                if (raw == null) return DEFAULT_TIMELINE_ZOOM;
                return clampTimelineZoomPref(JSON.parse(raw), DEFAULT_TIMELINE_ZOOM);
            } catch (_) {
                return DEFAULT_TIMELINE_ZOOM;
            }
        }

        function saveTimelineZoomPref(zoom) {
            const value = clampTimelineZoomPref(zoom, DEFAULT_TIMELINE_ZOOM);
            try {
                localStorage.setItem(TIMELINE_ZOOM_KEY, JSON.stringify(value));
            } catch (_) { /* ignore quota errors */ }
            return value;
        }

        ctx.loadTargetCpsPrefs = loadTargetCpsPrefs;
        ctx.saveTargetCpsPrefs = saveTargetCpsPrefs;
        ctx.getTargetCps = getTargetCps;
        ctx.applyTargetCpsPrefs = applyTargetCpsPrefs;
        ctx.getDefaultBreakWords = getDefaultBreakWords;
        ctx.loadBreakWords = loadBreakWords;
        ctx.saveBreakWords = saveBreakWords;
        ctx.clampRetranscribeDurSec = clampRetranscribeDurSec;
        ctx.loadRetranscribeDurPrefs = loadRetranscribeDurPrefs;
        ctx.saveRetranscribeDurPrefs = saveRetranscribeDurPrefs;
        ctx.loadSplitPrefs = loadSplitPrefs;
        ctx.saveSplitPrefs = saveSplitPrefs;
        ctx.applySplitPrefsToModal = applySplitPrefsToModal;
        ctx.applyAutoFocusUi = applyAutoFocusUi;
        ctx.loadAutoFocusPref = loadAutoFocusPref;
        ctx.toggleAutoFocus = toggleAutoFocus;
        ctx.applyTheme = applyTheme;
        ctx.loadTheme = loadTheme;
        ctx.toggleTheme = toggleTheme;
        ctx.applyPanelWidth = applyPanelWidth;
        ctx.loadPanelWidth = loadPanelWidth;
        ctx.loadDetailToolsPref = loadDetailToolsPref;
        ctx.applyWaveformUi = applyWaveformUi;
        ctx.loadWaveformPref = loadWaveformPref;
        ctx.toggleWaveform = toggleWaveform;
        ctx.loadTimelineZoomPref = loadTimelineZoomPref;
        ctx.saveTimelineZoomPref = saveTimelineZoomPref;
        ctx.clampTimelineZoomPref = clampTimelineZoomPref;

        return ctx;
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installPrefs = installPrefs;
    global.TransubEditorParts.prefsKeys = {
        SPLIT_PREFS_KEY,
        BREAK_WORDS_KEY,
        TARGET_CPS_KEY,
        RETRANSCRIBE_DUR_KEY,
        THEME_KEY,
        PANEL_WIDTH_KEY,
        DETAIL_TOOLS_KEY,
        AUTO_FOCUS_KEY,
        WAVEFORM_KEY,
        TIMELINE_ZOOM_KEY,
    };
    global.TransubEditorParts.DEFAULT_TARGET_CPS = DEFAULT_TARGET_CPS;
    global.TransubEditorParts.DEFAULT_RETRANSCRIBE_DUR_SEC = DEFAULT_RETRANSCRIBE_DUR_SEC;
    global.TransubEditorParts.DEFAULT_TIMELINE_ZOOM = DEFAULT_TIMELINE_ZOOM;
    global.TransubEditorParts.SPLIT_MODES = SPLIT_MODES;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
