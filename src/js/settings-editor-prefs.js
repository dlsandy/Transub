'use strict';
/**
 * Minimal load/save bridge for subtitle-editor prefs shown in settings → 字幕编辑器.
 * Uses the same localStorage keys as subtitle-editor/prefs.js.
 */
(function (global) {
    const KEYS = {
        theme: 'transub-editor-theme',
        autoFocus: 'transub-editor-auto-focus',
        waveform: 'transub-editor-waveform',
        timelineZoom: 'transub-editor-timeline-zoom',
        cuesWidth: 'transub-editor-cues-width',
        detailTools: 'transub-editor-detail-tools-open',
        dualDisplay: 'transub-editor-dual-display',
        dualOrder: 'transub-editor-dual-line-order',
        targetCps: 'transub-editor-target-cps',
        breakWords: 'transub-editor-break-words',
        splitPrefs: 'transub-editor-split-prefs',
        retranscribeDur: 'transub-editor-retranscribe-dur',
        reconOnlyChanged: 'transub-editor-recon-review-only-changed',
        filmHints: 'transub-editor-film-hints',
    };

    function lsGet(key, fallback = '') {
        try {
            const v = localStorage.getItem(key);
            return v == null ? fallback : v;
        } catch (_) {
            return fallback;
        }
    }

    function lsSet(key, value) {
        try { localStorage.setItem(key, value); } catch (_) { /* ignore */ }
    }

    function lsGetJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (raw == null || raw === '') return fallback;
            return JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    }

    function loadIntoForm() {
        const theme = lsGet(KEYS.theme, 'light');
        const themeSel = document.getElementById('editorThemeSelect');
        if (themeSel) themeSel.value = theme === 'dark' ? 'dark' : 'light';

        const autoFocus = document.getElementById('editorAutoFocusCheck');
        if (autoFocus) autoFocus.checked = lsGet(KEYS.autoFocus, '0') === '1';

        const waveform = document.getElementById('editorWaveformCheck');
        if (waveform) {
            const raw = lsGet(KEYS.waveform, '1');
            waveform.checked = raw !== '0';
        }

        const zoom = document.getElementById('editorTimelineZoomInput');
        if (zoom) {
            const n = Number(lsGetJson(KEYS.timelineZoom, 5));
            zoom.value = String(Number.isFinite(n) ? Math.max(1, Math.min(1000, n)) : 5);
        }

        const width = document.getElementById('editorCuesWidthInput');
        if (width) {
            const n = Number(lsGet(KEYS.cuesWidth, '42'));
            width.value = String(Number.isFinite(n) ? Math.max(28, Math.min(62, n)) : 42);
        }

        const detail = document.getElementById('editorDetailToolsOpenCheck');
        if (detail) detail.checked = lsGet(KEYS.detailTools, '1') !== '0';

        const dual = document.getElementById('editorDualDisplaySelectSettings')
            || document.getElementById('editorDualDisplaySelect');
        if (dual) {
            let v = lsGet(KEYS.dualDisplay, 'both');
            if (v === 'translation') v = 'target';
            dual.value = ['both', 'target', 'source', 'translation'].includes(v)
                ? (v === 'translation' ? 'target' : v)
                : 'both';
            // Prefer editor-native values when the settings <select> has them
            if (dual.querySelector(`option[value="${dual.value}"]`) == null && v === 'target') {
                if (dual.querySelector('option[value="translation"]')) dual.value = 'translation';
            }
        }
        const order = document.getElementById('editorDualLineOrderSelectSettings')
            || document.getElementById('editorDualLineOrderSelect');
        if (order) {
            let v = lsGet(KEYS.dualOrder, 'source-first');
            if (v === 'translation-first' || v === 'target') v = 'target-first';
            const hasTarget = !!order.querySelector('option[value="target-first"]');
            const hasTranslation = !!order.querySelector('option[value="translation-first"]');
            if (v === 'target-first') {
                order.value = hasTarget ? 'target-first' : (hasTranslation ? 'translation-first' : 'source-first');
            } else {
                order.value = 'source-first';
            }
        }

        const cps = document.getElementById('editorTargetCpsInput');
        if (cps) {
            const n = Number(lsGetJson(KEYS.targetCps, 3));
            cps.value = String(Number.isFinite(n) ? n : 3);
        }

        const words = document.getElementById('editorBreakWordsInput');
        if (words) {
            const list = lsGetJson(KEYS.breakWords, null);
            words.value = Array.isArray(list) ? list.join('\n') : '';
        }

        const split = lsGetJson(KEYS.splitPrefs, {}) || {};
        const rem = document.getElementById('editorSplitRememberCheck');
        if (rem) rem.checked = !!split.remember;
        const mode = document.getElementById('editorSplitModeSelect');
        if (mode && split.mode) mode.value = split.mode;
        const setNum = (id, v, d) => {
            const el = document.getElementById(id);
            if (el) el.value = String(v != null ? v : d);
        };
        setNum('editorSplitSmartMaxCharsInput', split.smartMaxChars, 20);
        setNum('editorSplitSmartLineCharsInput', split.smartLineChars, 18);
        setNum('editorSplitSilenceDbInput', split.silenceDb, -35);
        setNum('editorSplitSilenceDurInput', split.silenceDur, 0.25);
        const useCps = document.getElementById('editorSplitUseCpsCheck');
        if (useCps) useCps.checked = split.useCps !== false;
        const fix = document.getElementById('editorSplitFixOverlapCheck');
        if (fix) fix.checked = split.fixOverlap !== false;

        const rt = lsGetJson(KEYS.retranscribeDur, {}) || {};
        setNum('editorRetranscribeDurInput', rt.durationSec, 10);
        setNum('editorRetranscribePadInput', rt.padMs, 350);
        const start = document.getElementById('editorRetranscribeStartSelect');
        if (start) start.value = rt.startMode === 'playhead' ? 'playhead' : 'selected';
        const snap = document.getElementById('editorRetranscribeSnapCheck');
        if (snap) snap.checked = rt.snapAfter !== false;

        const only = document.getElementById('editorReconOnlyChangedCheck');
        if (only) only.checked = lsGet(KEYS.reconOnlyChanged, 'true') !== 'false';
    }

    function saveFromForm() {
        const themeSel = document.getElementById('editorThemeSelect');
        if (themeSel) lsSet(KEYS.theme, themeSel.value === 'dark' ? 'dark' : 'light');

        const autoFocus = document.getElementById('editorAutoFocusCheck');
        if (autoFocus) lsSet(KEYS.autoFocus, autoFocus.checked ? '1' : '0');

        const waveform = document.getElementById('editorWaveformCheck');
        if (waveform) lsSet(KEYS.waveform, waveform.checked ? '1' : '0');

        const zoom = document.getElementById('editorTimelineZoomInput');
        if (zoom) lsSet(KEYS.timelineZoom, JSON.stringify(Number(zoom.value) || 5));

        const width = document.getElementById('editorCuesWidthInput');
        if (width) lsSet(KEYS.cuesWidth, String(Math.max(28, Math.min(62, Number(width.value) || 42))));

        const detail = document.getElementById('editorDetailToolsOpenCheck');
        if (detail) lsSet(KEYS.detailTools, detail.checked ? '1' : '0');

        const dual = document.getElementById('editorDualDisplaySelectSettings')
            || document.getElementById('editorDualDisplaySelect');
        if (dual) {
            let v = dual.value || 'both';
            if (v === 'translation') v = 'target';
            lsSet(KEYS.dualDisplay, v);
        }
        const order = document.getElementById('editorDualLineOrderSelectSettings')
            || document.getElementById('editorDualLineOrderSelect');
        if (order) {
            let v = order.value || 'source-first';
            if (v === 'translation-first' || v === 'translation') v = 'target-first';
            lsSet(KEYS.dualOrder, v);
        }
        const cps = document.getElementById('editorTargetCpsInput');
        if (cps) lsSet(KEYS.targetCps, JSON.stringify(Number(cps.value) || 3));

        const words = document.getElementById('editorBreakWordsInput');
        if (words) {
            const list = String(words.value || '')
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean);
            lsSet(KEYS.breakWords, JSON.stringify(list));
        }

        const split = {
            remember: !!document.getElementById('editorSplitRememberCheck')?.checked,
            mode: document.getElementById('editorSplitModeSelect')?.value || 'smart',
            smartMaxChars: Number(document.getElementById('editorSplitSmartMaxCharsInput')?.value) || 20,
            smartLineChars: Number(document.getElementById('editorSplitSmartLineCharsInput')?.value) || 18,
            silenceDb: Number(document.getElementById('editorSplitSilenceDbInput')?.value) || -35,
            silenceDur: Number(document.getElementById('editorSplitSilenceDurInput')?.value) || 0.25,
            useCps: document.getElementById('editorSplitUseCpsCheck')?.checked !== false,
            fixOverlap: document.getElementById('editorSplitFixOverlapCheck')?.checked !== false,
        };
        lsSet(KEYS.splitPrefs, JSON.stringify(split));

        const rt = {
            durationSec: Number(document.getElementById('editorRetranscribeDurInput')?.value) || 10,
            padMs: Number(document.getElementById('editorRetranscribePadInput')?.value) || 350,
            startMode: document.getElementById('editorRetranscribeStartSelect')?.value === 'playhead' ? 'playhead' : 'selected',
            snapAfter: document.getElementById('editorRetranscribeSnapCheck')?.checked !== false,
        };
        lsSet(KEYS.retranscribeDur, JSON.stringify(rt));

        const only = document.getElementById('editorReconOnlyChangedCheck');
        if (only) lsSet(KEYS.reconOnlyChanged, only.checked ? 'true' : 'false');
    }

    function clearFilmHints() {
        try { localStorage.removeItem(KEYS.filmHints); } catch (_) { /* ignore */ }
        const status = document.getElementById('editorSettingsStatus');
        if (status) status.textContent = '已清除影片提示缓存';
    }

    function bind() {
        const clearBtn = document.getElementById('editorClearFilmHintsBtn');
        if (clearBtn && clearBtn.dataset.bound !== '1') {
            clearBtn.dataset.bound = '1';
            clearBtn.addEventListener('click', clearFilmHints);
        }
    }

    global.TransubEditorSettingsPrefs = { loadIntoForm, saveFromForm, bind };
}(window));
