/**
 * Standalone Subtitle Library window UI.
 */
(function (global) {
    const electron = global.__ELECTRON__;

    const LAST_MEDIA_KEY = 'transub.library.selectedMediaId';
    const LIST_SORT_KEY = 'transub.library.listSort';
    const DETAIL_W_KEY = 'transub.library.detailWidthPx';
    const DETAIL_W_DEFAULT = 560;
    const DETAIL_W_MIN = 360;
    const DETAIL_W_MAX = 900;
    const SKIP_SET_ACTIVE_KEY = 'transub.library.skipSetActiveConfirm';
    const COL_WIDTH_KEY = 'transub.library.colWidths';
    const RESIZABLE_COLS = ['title', 'src', 'tgt', 'bi', 'time'];
    const COL_WIDTH_LIMITS = {
        title: { min: 120, max: 640 },
        src: { min: 48, max: 140 },
        tgt: { min: 48, max: 140 },
        bi: { min: 48, max: 140 },
        time: { min: 72, max: 200 },
    };

    let libraryPlayer = null;

    const state = {
        selectedMediaId: '',
        caps: null,
        allItems: [],
        items: [],
        compareA: '',
        compareTrackId: '',
        rerunVersionId: '',
        rerunRecipeSummary: '',
        facets: null,
        showArchived: false,
        detailTrackTab: '',
        filtersOpen: false,
        lastListTotal: 0,
        lastListFiltered: false,
        noteVersionId: '',
        exportVersionId: '',
        sortKey: 'lastVersionAt',
        sortDir: 'desc',
        detailOpen: false,
        quickFilter: '',
        ctxMediaId: '',
        checkedIds: new Set(),
        colWidths: {},
        lastCheckedId: '',
        pendingRerunMediaId: '',
        renameMediaId: '',
        previewVersionId: '',
        playingVersionId: '',
        lastDetail: null,
        confirmResolver: null,
        confirmSkipKey: '',
        focusVersionId: '',
        catalogRefreshTimer: 0,
    };

    function hasPanelFiltersActive() {
        const f = readLibraryFilters();
        return !!(f.presetId || f.mtModel || f.tag || state.quickFilter);
    }

    function syncFilterPanelUi() {
        const panel = document.getElementById('libraryFilterPanel');
        const btn = document.getElementById('libraryFilterToggleBtn');
        const clearBtn = document.getElementById('libraryClearFiltersBtn');
        const open = !!state.filtersOpen;
        if (panel) {
            panel.classList.toggle('is-open', open);
            if (open) panel.removeAttribute('hidden');
            else panel.setAttribute('hidden', '');
        }
        const panelActive = hasPanelFiltersActive();
        const anyActive = hasActiveLibraryFilters();
        if (btn) {
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.classList.toggle('is-on', open || panelActive);
            btn.textContent = panelActive ? '筛选 · 开' : '筛选';
        }
        clearBtn?.classList.toggle('is-needed', anyActive);
    }

    function setFiltersOpen(open) {
        state.filtersOpen = !!open;
        syncFilterPanelUi();
    }

    function shouldSkipSetActiveConfirm() {
        try { return localStorage.getItem(SKIP_SET_ACTIVE_KEY) === '1'; } catch { return false; }
    }

    function setSkipSetActiveConfirm(on) {
        try {
            if (on) localStorage.setItem(SKIP_SET_ACTIVE_KEY, '1');
            else localStorage.removeItem(SKIP_SET_ACTIVE_KEY);
        } catch { /* ignore */ }
    }

    function closeLibraryConfirmModal(result = false) {
        document.getElementById('libraryConfirmModal')?.classList.add('hidden');
        const resolve = state.confirmResolver;
        state.confirmResolver = null;
        state.confirmSkipKey = '';
        if (typeof resolve === 'function') resolve(!!result);
    }

    function libraryConfirm({
        title = '确认',
        message = '',
        okLabel = '继续',
        danger = false,
        skipKey = '',
    } = {}) {
        return new Promise((resolve) => {
            if (skipKey === 'setActive' && shouldSkipSetActiveConfirm()) {
                resolve(true);
                return;
            }
            if (typeof state.confirmResolver === 'function') {
                state.confirmResolver(false);
                state.confirmResolver = null;
            }
            state.confirmResolver = resolve;
            state.confirmSkipKey = String(skipKey || '');
            const modal = document.getElementById('libraryConfirmModal');
            const titleEl = document.getElementById('libraryConfirmTitle');
            const msgEl = document.getElementById('libraryConfirmMessage');
            const okBtn = document.getElementById('libraryConfirmOkBtn');
            const skipWrap = document.getElementById('libraryConfirmSkipWrap');
            const skipCheck = document.getElementById('libraryConfirmSkipCheck');
            if (titleEl) titleEl.textContent = title;
            if (msgEl) msgEl.textContent = message;
            if (okBtn) {
                okBtn.textContent = okLabel;
                okBtn.classList.toggle('lib-btn-danger', !!danger);
                okBtn.classList.toggle('lib-btn-primary', !danger);
            }
            if (skipWrap && skipCheck) {
                const showSkip = state.confirmSkipKey === 'setActive';
                skipWrap.classList.toggle('hidden', !showSkip);
                skipCheck.checked = false;
            }
            modal?.classList.remove('hidden');
            setTimeout(() => okBtn?.focus?.(), 0);
        });
    }

    function acceptLibraryConfirm() {
        const skipCheck = document.getElementById('libraryConfirmSkipCheck');
        if (state.confirmSkipKey === 'setActive' && skipCheck?.checked) {
            setSkipSetActiveConfirm(true);
        }
        closeLibraryConfirmModal(true);
    }

    function loadSavedListSort() {
        try {
            const raw = localStorage.getItem(LIST_SORT_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const key = parsed?.key ? String(parsed.key) : '';
            // Drop sort keys for removed columns (lang / recipe).
            const allowed = new Set([
                'title', 'source', 'target', 'bilingual',
                'sourceCues', 'targetCues', 'bilingualCues',
                'lastVersionAt', 'updatedAt',
            ]);
            if (key && allowed.has(key)) state.sortKey = key;
            else state.sortKey = 'lastVersionAt';
            if (parsed?.dir === 'asc' || parsed?.dir === 'desc') state.sortDir = parsed.dir;
            else if (state.sortKey === 'lastVersionAt') state.sortDir = 'desc';
        } catch { /* ignore */ }
    }

    function persistListSort() {
        try {
            localStorage.setItem(LIST_SORT_KEY, JSON.stringify({
                key: state.sortKey,
                dir: state.sortDir,
            }));
        } catch { /* ignore */ }
    }

    function loadSavedColWidths() {
        try {
            const raw = localStorage.getItem(COL_WIDTH_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            const next = {};
            for (const key of RESIZABLE_COLS) {
                const n = Number(parsed[key]);
                if (Number.isFinite(n) && n > 0) next[key] = n;
            }
            state.colWidths = next;
        } catch { /* ignore */ }
    }

    function persistColWidths() {
        try {
            localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(state.colWidths || {}));
        } catch { /* ignore */ }
    }

    function applyLibraryColWidths() {
        const group = document.getElementById('libraryTableColgroup');
        if (!group) return;
        group.querySelectorAll('col[data-col]').forEach((col) => {
            const key = col.getAttribute('data-col') || '';
            const px = state.colWidths[key];
            if (Number.isFinite(px) && px > 0) col.style.width = `${Math.round(px)}px`;
            else col.style.width = '';
        });
    }

    function clampColWidth(key, px) {
        const lim = COL_WIDTH_LIMITS[key] || { min: 48, max: 480 };
        return Math.min(lim.max, Math.max(lim.min, Math.round(px)));
    }

    function bindLibraryColResize() {
        const head = document.querySelector('#libraryMediaTable thead');
        if (!head) return;
        let drag = null;
        const onMove = (e) => {
            if (!drag) return;
            const dx = e.clientX - drag.startX;
            state.colWidths[drag.key] = clampColWidth(drag.key, drag.startW + dx);
            applyLibraryColWidths();
        };
        const onUp = () => {
            if (!drag) return;
            drag = null;
            document.body.classList.remove('is-resizing-col');
            persistColWidths();
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        head.addEventListener('pointerdown', (e) => {
            const handle = e.target.closest('[data-resize-col]');
            if (!handle) return;
            e.preventDefault();
            e.stopPropagation();
            const key = handle.getAttribute('data-resize-col') || '';
            if (!RESIZABLE_COLS.includes(key)) return;
            const col = document.querySelector(`#libraryTableColgroup col[data-col="${key}"]`);
            const th = handle.closest('th');
            const startW = Number(state.colWidths[key])
                || Math.round(col?.getBoundingClientRect?.().width || th?.getBoundingClientRect?.().width || 100);
            drag = { key, startX: e.clientX, startW };
            document.body.classList.add('is-resizing-col');
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }

    function pruneCheckedIds() {
        const alive = new Set(state.allItems.map((m) => m.id));
        const next = new Set();
        for (const id of state.checkedIds) {
            if (alive.has(id)) next.add(id);
        }
        state.checkedIds = next;
    }

    function syncBatchBar() {
        const bar = document.getElementById('libraryBatchBar');
        const countEl = document.getElementById('libraryBatchCount');
        const n = state.checkedIds.size;
        bar?.classList.toggle('is-on', n > 0);
        if (countEl) countEl.textContent = `已选 ${n}`;
        const checkedItems = getCheckedItems();
        const withPath = checkedItems.filter((m) => String(m.path || '').trim()).length;
        const exportBtn = document.getElementById('libraryBatchExportPackBtn');
        const autoLinkBtn = document.getElementById('libraryBatchAutoLinkBtn');
        const copyBtn = document.getElementById('libraryBatchCopyPathsBtn');
        const revealBtn = document.getElementById('libraryBatchRevealBtn');
        if (exportBtn) {
            const ok = n > 0 && !!state.caps?.publishPack;
            exportBtn.disabled = !ok;
            exportBtn.title = !n ? '请先勾选作品' : (!state.caps?.publishPack ? '需解锁 Pro' : '');
        }
        if (autoLinkBtn) {
            autoLinkBtn.disabled = n === 0;
            autoLinkBtn.title = n === 0 ? '请先勾选作品' : '';
        }
        if (copyBtn) {
            copyBtn.disabled = withPath === 0;
            copyBtn.title = withPath === 0 ? '所选作品均无音视频路径' : '';
        }
        if (revealBtn) {
            revealBtn.disabled = withPath === 0;
            revealBtn.title = withPath === 0 ? '所选作品均无音视频路径' : '';
        }
        const allCheck = document.getElementById('librarySelectAllCheck');
        if (allCheck) {
            const visible = state.items.map((m) => m.id);
            const checkedVisible = visible.filter((id) => state.checkedIds.has(id)).length;
            allCheck.checked = visible.length > 0 && checkedVisible === visible.length;
            allCheck.indeterminate = checkedVisible > 0 && checkedVisible < visible.length;
        }
    }

    function clearLibraryChecks() {
        state.checkedIds = new Set();
        state.lastCheckedId = '';
        syncBatchBar();
        renderLibraryMediaList(state.allItems);
    }

    function setRowChecked(mediaId, checked, { range = false } = {}) {
        const id = String(mediaId || '');
        if (!id) return;
        if (range && state.lastCheckedId) {
            const ids = state.items.map((m) => m.id);
            const a = ids.indexOf(state.lastCheckedId);
            const b = ids.indexOf(id);
            if (a >= 0 && b >= 0) {
                const [lo, hi] = a < b ? [a, b] : [b, a];
                for (let i = lo; i <= hi; i += 1) {
                    if (checked) state.checkedIds.add(ids[i]);
                    else state.checkedIds.delete(ids[i]);
                }
                state.lastCheckedId = id;
                syncBatchBar();
                renderLibraryMediaList(state.allItems);
                return;
            }
        }
        if (checked) state.checkedIds.add(id);
        else state.checkedIds.delete(id);
        state.lastCheckedId = id;
        syncBatchBar();
        renderLibraryMediaList(state.allItems);
    }

    function selectAllVisible(checked) {
        for (const m of state.items) {
            if (checked) state.checkedIds.add(m.id);
            else state.checkedIds.delete(m.id);
        }
        syncBatchBar();
        renderLibraryMediaList(state.allItems);
    }

    function getCheckedItems() {
        return state.allItems.filter((m) => state.checkedIds.has(m.id));
    }

    function rememberSelectedMedia(mediaId) {
        const id = String(mediaId || '').trim();
        if (!id) return;
        try { localStorage.setItem(LAST_MEDIA_KEY, id); } catch { /* ignore */ }
    }

    function recalledSelectedMedia() {
        try { return String(localStorage.getItem(LAST_MEDIA_KEY) || '').trim(); } catch { return ''; }
    }

    function applyLibraryTheme(theme) {
        const dark = theme === 'dark';
        document.documentElement.classList.toggle('main-theme-dark', dark);
        try {
            document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
            localStorage.setItem('transub.mainTheme', dark ? 'dark' : 'light');
        } catch { /* ignore */ }
    }

    async function hydrateLibraryTheme() {
        try {
            const res = await electron?.transubGetAppTheme?.();
            if (res?.theme === 'dark' || res?.theme === 'light') {
                applyLibraryTheme(res.theme);
                return;
            }
        } catch { /* ignore */ }
        try {
            const local = localStorage.getItem('transub.mainTheme')
                || localStorage.getItem('transub-editor-theme');
            if (local === 'dark' || local === 'light') applyLibraryTheme(local);
        } catch { /* ignore */ }
    }

    function escHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function basenamePath(p) {
        return String(p || '').split(/[/\\]/).pop() || '—';
    }

    function toast(message, tone = 'info') {
        const el = document.getElementById('libToast');
        if (!el) {
            window.alert(message);
            return;
        }
        el.textContent = message;
        el.classList.remove('err', 'warn', 'show');
        if (tone === 'err') el.classList.add('err');
        if (tone === 'warn') el.classList.add('warn');
        el.classList.add('show');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => el.classList.remove('show'), 4200);
    }

    function setStatus(text) {
        const el = document.getElementById('libraryStatusLine');
        if (el) el.textContent = text || '';
    }

    function formatLibraryTime(iso, { short = false } = {}) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        const pad = (n) => String(n).padStart(2, '0');
        const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        if (short) return md;
        return `${d.getFullYear()}-${md}`;
    }

    function updateLibraryListCount(items) {
        const el = document.getElementById('libraryListCount');
        if (!el) return;
        const n = Array.isArray(items) ? items.length : 0;
        el.textContent = n ? `${n} 部` : '';
    }

    function setDetailOpen(open) {
        state.detailOpen = !!open;
        document.body.classList.toggle('has-library-detail', state.detailOpen);
        const drawer = document.getElementById('libraryDetailDrawer');
        if (drawer) drawer.setAttribute('aria-hidden', state.detailOpen ? 'false' : 'true');
    }

    function closeLibraryDetail() {
        state.selectedMediaId = '';
        state.compareA = '';
        state.compareTrackId = '';
        state.playingVersionId = '';
        state.lastDetail = null;
        libraryPlayer?.clear?.({ hide: true });
        setDetailOpen(false);
        renderLibraryMediaList(state.allItems);
        const host = document.getElementById('libraryDetail');
        if (host) {
            host.innerHTML = `<div class="lib-empty">
                <p class="lib-empty-title">选择列表中的作品</p>
                <div>查看转录 / 译文版本与操作</div>
            </div>`;
        }
        const bar = document.getElementById('libraryDetailBarTitle');
        if (bar) bar.textContent = '版本详情';
    }

    function markPlayingVersion(versionId) {
        state.playingVersionId = String(versionId || '').trim();
        document.querySelectorAll('.lib-ver.is-playing').forEach((el) => {
            el.classList.remove('is-playing');
        });
        if (state.playingVersionId) {
            const safe = state.playingVersionId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const row = document.querySelector(`[data-library-version="${safe}"]`);
            if (row) row.classList.add('is-playing');
        }
        libraryPlayer?.renderVersionPanel?.();
    }

    function ensureLibraryPlayer() {
        if (libraryPlayer) return libraryPlayer;
        const ui = global.TransubLibraryPlayerUi;
        if (!ui?.createLibraryPlayer) return null;
        libraryPlayer = ui.createLibraryPlayer({
            electron,
            onToast: (msg, kind) => toast(msg, kind),
            onVersionChange: (versionId) => markPlayingVersion(versionId),
            onClose: () => {
                state.playingVersionId = '';
                document.querySelectorAll('.lib-ver.is-playing').forEach((el) => {
                    el.classList.remove('is-playing');
                });
            },
            onPickVersion: (versionId) => {
                void libraryPlayVersion(versionId, { auto: true });
            },
        });
        return libraryPlayer;
    }

    async function libraryPlayVersion(versionId, { auto = false } = {}) {
        const id = String(versionId || '').trim();
        if (!id) {
            if (!auto) toast('没有可试看的版本', 'warn');
            return;
        }
        const player = ensureLibraryPlayer();
        if (!player) {
            toast('播放器未就绪', 'err');
            return;
        }
        const mediaTitle = state.lastDetail?.media?.title
            || findLibraryItem(state.selectedMediaId)?.title
            || '';
        const res = await player.loadVersion(id, {
            mediaId: state.selectedMediaId || '',
            mediaTitle,
            detail: state.lastDetail,
            showArchived: true,
            preferKeepClock: true,
        });
        if (res?.ok) {
            markPlayingVersion(id);
        }
    }

    async function resumePlayingAfterMediaLink() {
        const vid = String(state.playingVersionId || libraryPlayer?.getVersionId?.() || '').trim();
        if (!vid) return;
        await libraryPlayVersion(vid, { auto: true });
    }

    function switchPlayingVersion(delta) {
        const coreApi = global.TransubLibraryPlayerCore;
        const current = state.playingVersionId || libraryPlayer?.getVersionId?.() || '';
        if (!state.lastDetail || !current || !coreApi?.neighborVersionId) {
            toast('没有可切换的版本', 'warn');
            return;
        }
        const next = coreApi.neighborVersionId(state.lastDetail, current, delta, {
            includeArchived: true,
        });
        if (!next) {
            toast('同轨没有其他可试看版本', 'info');
            return;
        }
        void libraryPlayVersion(next);
    }

    function isLibraryPlayerFocused() {
        const modal = document.getElementById('libraryPlayerModal');
        if (!modal || modal.classList.contains('hidden')) return false;
        const ae = document.activeElement;
        if (!ae) return true;
        return modal.contains(ae) || ae === document.body;
    }

    function closeLibraryPlayerModal() {
        ensureLibraryPlayer()?.close?.();
        state.playingVersionId = '';
        document.querySelectorAll('.lib-ver.is-playing').forEach((el) => {
            el.classList.remove('is-playing');
        });
    }

    async function autoPlayPreferredVersion(detail) {
        const playerCore = global.TransubLibraryPlayerCore;
        const preferred = playerCore?.pickDefaultVersionId?.(detail)
            || String(detail?.media?.preferredOpenVersionId || '').trim();
        if (!preferred) {
            toast('没有可试看的版本', 'warn');
            return;
        }
        await libraryPlayVersion(preferred, { auto: true });
    }

    function mediaSortValue(m, key) {
        switch (key) {
            case 'title':
                return String(m?.title || basenamePath(m?.path) || '').toLowerCase();
            case 'source':
                return Number(m?.sourceVersionCount) || 0;
            case 'target':
                return Number(m?.targetVersionCount) || 0;
            case 'bilingual':
                return Number(m?.bilingualVersionCount) || 0;
            case 'sourceCues':
                return Number(m?.sourceCueCount) || 0;
            case 'targetCues':
                return Number(m?.targetCueCount) || 0;
            case 'bilingualCues':
                return Number(m?.bilingualCueCount) || 0;
            case 'lastVersionAt':
                return Date.parse(m?.lastVersionAt || m?.updatedAt || 0) || 0;
            case 'updatedAt':
                return Date.parse(m?.updatedAt || 0) || 0;
            default:
                return 0;
        }
    }

    function sortLibraryItems(items) {
        const list = Array.isArray(items) ? items.slice() : [];
        const key = state.sortKey || 'lastVersionAt';
        const dir = state.sortDir === 'asc' ? 1 : -1;
        list.sort((a, b) => {
            const va = mediaSortValue(a, key);
            const vb = mediaSortValue(b, key);
            let cmp = 0;
            if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
            else cmp = String(va).localeCompare(String(vb), 'zh');
            if (cmp !== 0) return cmp * dir;
            const ta = Date.parse(a?.lastVersionAt || a?.updatedAt || 0) || 0;
            const tb = Date.parse(b?.lastVersionAt || b?.updatedAt || 0) || 0;
            return (tb - ta);
        });
        return list;
    }

    function filterLibraryItems(items) {
        let list = Array.isArray(items) ? items.slice() : [];
        if (state.quickFilter === 'source') {
            list = list.filter((m) => (Number(m.sourceVersionCount) || 0) > 0);
        } else if (state.quickFilter === 'target') {
            list = list.filter((m) => (Number(m.targetVersionCount) || 0) > 0);
        } else if (state.quickFilter === 'bilingual') {
            list = list.filter((m) => (Number(m.bilingualVersionCount) || 0) > 0);
        } else if (state.quickFilter === 'media-unlinked') {
            list = list.filter((m) => !(m.mediaLinked || String(m.path || '').trim()));
        } else if (state.quickFilter === 'media-missing') {
            list = list.filter((m) => {
                const linked = m.mediaLinked || !!String(m.path || '').trim();
                return linked && !m.mediaExists;
            });
        } else if (state.quickFilter === 'recent') {
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            list = list.filter((m) => {
                const ts = Date.parse(m.lastVersionAt || m.updatedAt || 0) || 0;
                return ts >= cutoff;
            });
        } else if (state.quickFilter === 'no-open') {
            list = list.filter((m) => !m.preferredOpenVersionId);
        } else if (state.quickFilter === 'source-empty') {
            list = list.filter((m) => {
                const hints = m.statusHints || {};
                return hints.sourceEmpty
                    || ((Number(m.sourceVersionCount) || 0) === 0 && (Number(m.targetVersionCount) || 0) > 0);
            });
        }
        return list;
    }

    function syncQuickFilterChips() {
        document.querySelectorAll('[data-library-quick]').forEach((btn) => {
            const key = btn.getAttribute('data-library-quick');
            btn.classList.toggle('is-on', key === state.quickFilter);
        });
        const advanced = new Set(['source', 'target', 'bilingual', 'media-missing']);
        if (advanced.has(state.quickFilter)) {
            const panel = document.getElementById('libraryMoreFilters');
            const moreBtnEl = document.getElementById('libraryMoreFiltersBtn');
            panel?.removeAttribute('hidden');
            panel?.classList.add('is-open');
            moreBtnEl?.classList.add('is-on');
            moreBtnEl?.setAttribute('aria-expanded', 'true');
        }
    }

    function setQuickFilter(key) {
        const next = String(key || '').trim();
        state.quickFilter = state.quickFilter === next ? '' : next;
        syncQuickFilterChips();
        syncFilterPanelUi();
        renderLibraryMediaList(state.allItems);
    }

    function statusChipsHtml(m) {
        const hints = m.statusHints || {};
        const chips = [];
        if (hints.mediaMissing) chips.push('<span class="lib-status-chip lib-status-chip-danger">影缺失</span>');
        if (hints.mediaUnlinked) chips.push('<span class="lib-status-chip lib-status-chip-warn">未关联</span>');
        if (hints.noOpenable) chips.push('<span class="lib-status-chip lib-status-chip-muted">无法打开</span>');
        if (hints.sourceEmpty) chips.push('<span class="lib-status-chip lib-status-chip-muted">无转录</span>');
        if (m.trackAtLimit) chips.push('<span class="lib-status-chip lib-status-chip-warn">将满</span>');
        if (!chips.length) return '';
        return `<div class="lib-status-chips">${chips.join('')}</div>`;
    }

    function countCellHtml(cues, versionCount) {
        const hasCue = cues != null && cues !== '' && Number.isFinite(Number(cues));
        const cueLabel = hasCue ? String(Number(cues)) : '—';
        const verN = Number(versionCount) || 0;
        return `<div class="lib-count-cell" title="${hasCue ? `${cueLabel} 条` : '无当前版'} · ${verN} 个版本">
            <span class="lib-num${hasCue && Number(cues) ? '' : ' is-zero'}">${escHtml(cueLabel)}</span>
            <span class="lib-count-sub">${verN} 版</span>
        </div>`;
    }

    function clampDetailWidth(px) {
        const maxByViewport = Math.max(DETAIL_W_MIN, Math.floor(window.innerWidth * 0.92));
        return Math.min(DETAIL_W_MAX, Math.min(maxByViewport, Math.max(DETAIL_W_MIN, Math.round(px))));
    }

    function applySavedDetailWidth() {
        try {
            const raw = localStorage.getItem(DETAIL_W_KEY);
            const n = raw != null ? Number(raw) : DETAIL_W_DEFAULT;
            const w = Number.isFinite(n) ? clampDetailWidth(n) : DETAIL_W_DEFAULT;
            document.documentElement.style.setProperty('--lib-detail-w', `${w}px`);
        } catch {
            document.documentElement.style.setProperty('--lib-detail-w', `${DETAIL_W_DEFAULT}px`);
        }
    }

    function bindDetailSplitter() {
        const splitter = document.getElementById('libraryDetailSplitter');
        if (!splitter) return;
        let dragging = false;
        const onMove = (e) => {
            if (!dragging) return;
            const workspace = document.querySelector('.lib-workspace');
            const rect = workspace?.getBoundingClientRect();
            const rightEdge = rect ? rect.right - 11 : window.innerWidth; // ~0.7rem inset
            const fromRight = rightEdge - e.clientX;
            const clamped = clampDetailWidth(fromRight);
            document.documentElement.style.setProperty('--lib-detail-w', `${clamped}px`);
            try { localStorage.setItem(DETAIL_W_KEY, String(clamped)); } catch { /* ignore */ }
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            document.body.classList.remove('is-resizing-detail');
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        splitter.addEventListener('pointerdown', (e) => {
            if (!state.detailOpen) return;
            e.preventDefault();
            dragging = true;
            document.body.classList.add('is-resizing-detail');
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }

    function syncLibrarySortHeaders() {
        document.querySelectorAll('#libraryMediaTable th.lib-col-sortable').forEach((th) => {
            const key = th.getAttribute('data-sort-key');
            th.classList.toggle('is-sort-asc', key === state.sortKey && state.sortDir === 'asc');
            th.classList.toggle('is-sort-desc', key === state.sortKey && state.sortDir === 'desc');
        });
    }

    function setLibrarySort(key) {
        const next = String(key || '').trim();
        if (!next) return;
        if (state.sortKey === next) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortKey = next;
            state.sortDir = (next === 'title') ? 'asc' : 'desc';
        }
        persistListSort();
        renderLibraryMediaList(state.allItems);
    }

    function proLockAttr(caps, enabledKey) {
        if (caps?.[enabledKey]) return '';
        return ' data-pro-lock="1" title="需解锁 Pro"';
    }

    function promptProLibrary() {
        toast('该功能需要解锁 Pro', 'warn');
    }

    function updateLibraryCapsUi(caps) {
        state.caps = caps || null;
        const badge = document.getElementById('libraryProBadge');
        badge?.classList.toggle('hidden', !caps?.libraryPro);
    }

    function readLibraryFilters() {
        return {
            query: document.getElementById('librarySearchInput')?.value || '',
            presetId: document.getElementById('libraryFilterPreset')?.value || '',
            mtModel: document.getElementById('libraryFilterMt')?.value || '',
            tag: document.getElementById('libraryFilterTag')?.value || '',
        };
    }

    function fillLibraryFilterSelect(sel, items, emptyLabel, current, valueKey = 'id', labelKey = 'name') {
        if (!sel) return;
        const cur = current || '';
        if (Array.isArray(items) && items.length && typeof items[0] === 'string') {
            sel.innerHTML = `<option value="">${escHtml(emptyLabel)}</option>`
                + items.map((v) => `<option value="${escHtml(v)}"${v === cur ? ' selected' : ''}>${escHtml(v)}</option>`).join('');
            return;
        }
        const list = Array.isArray(items) ? items : [];
        sel.innerHTML = `<option value="">${escHtml(emptyLabel)}</option>`
            + list.map((it) => {
                const val = String(it?.[valueKey] ?? '');
                const lab = String(it?.[labelKey] ?? val);
                return `<option value="${escHtml(val)}"${val === cur ? ' selected' : ''}>${escHtml(lab)}</option>`;
            }).join('');
    }

    function updateLibraryFilterControls(facets, caps) {
        state.facets = facets || null;
        const pro = !!caps?.recipeFilter || !!caps?.libraryPro;
        const presetSel = document.getElementById('libraryFilterPreset');
        const mtSel = document.getElementById('libraryFilterMt');
        const tagSel = document.getElementById('libraryFilterTag');
        const filtersHost = document.getElementById('libraryFilters');
        const filtersHint = document.getElementById('libraryFiltersHint');
        const filters = readLibraryFilters();
        fillLibraryFilterSelect(presetSel, facets?.presets, '预设 · 全部', filters.presetId);
        fillLibraryFilterSelect(mtSel, facets?.mtModels, '译模 · 全部', filters.mtModel);
        fillLibraryFilterSelect(tagSel, facets?.tags, '标签 · 全部', filters.tag);
        for (const el of [presetSel, mtSel, tagSel]) {
            if (!el) continue;
            el.disabled = !pro;
        }
        filtersHost?.classList.toggle('is-hidden', !pro);
        filtersHint?.classList.toggle('is-visible', !pro);
        syncFilterPanelUi();
    }

    function hasActiveLibraryFilters() {
        const f = readLibraryFilters();
        return !!(f.query || f.presetId || f.mtModel || f.tag || state.quickFilter);
    }

    function clearLibraryFilters() {
        const search = document.getElementById('librarySearchInput');
        if (search) search.value = '';
        for (const id of ['libraryFilterPreset', 'libraryFilterMt', 'libraryFilterTag']) {
            const el = document.getElementById(id);
            if (el) el.value = '';
        }
        state.quickFilter = '';
        syncQuickFilterChips();
        syncFilterPanelUi();
        void refreshLibraryList();
    }

    function renderLibraryMediaList(items) {
        const host = document.getElementById('libraryMediaList');
        const empty = document.getElementById('libraryListEmpty');
        const table = document.getElementById('libraryMediaTable');
        if (!host) return;
        if (Array.isArray(items)) state.allItems = items;
        pruneCheckedIds();
        state.items = sortLibraryItems(filterLibraryItems(state.allItems));
        updateLibraryListCount(state.items);
        syncLibrarySortHeaders();
        syncQuickFilterChips();
        syncBatchBar();
        applyLibraryColWidths();
        if (!state.items.length) {
            host.innerHTML = '';
            table?.classList.add('hidden');
            if (empty) {
                empty.classList.remove('hidden');
                if (hasActiveLibraryFilters()) {
                    const sourceEmptyNote = state.quickFilter === 'source-empty'
                        ? '<div class="lib-empty-note">仅译任务可能无转录</div>'
                        : '';
                    empty.innerHTML = `<p class="lib-empty-title">没有符合条件的作品</p>
                        ${sourceEmptyNote}
                        <div class="lib-empty-actions">
                            <button type="button" class="lib-btn" data-library-clear-filters>清除筛选</button>
                        </div>`;
                } else {
                    empty.innerHTML = `<p class="lib-empty-title">暂无入库字幕</p>
                        <div>跑完任务会自动入库。<br>点作品可试看 / 打开字幕。</div>`;
                }
            }
            return;
        }
        table?.classList.remove('hidden');
        empty?.classList.add('hidden');
        host.innerHTML = state.items.map((m) => {
            const active = m.id === state.selectedMediaId;
            const checked = state.checkedIds.has(m.id);
            const title = m.title || basenamePath(m.path);
            const hasSrc = (Number(m.sourceVersionCount) || 0) > 0;
            const hasTgt = (Number(m.targetVersionCount) || 0) > 0;
            const hasBi = (Number(m.bilingualVersionCount) || 0) > 0;
            const mediaLinked = !!m.mediaLinked || !!String(m.path || '').trim();
            const mediaExists = !!m.mediaExists;
            const playable = mediaExists && !!m.preferredOpenVersionId;
            const mediaPillCls = playable
                ? 'is-playable'
                : (!mediaLinked ? 'is-off' : (mediaExists ? 'is-media' : 'is-media-missing'));
            const mediaPillTitle = playable
                ? '可试看（已关联音视频且有当前字幕）'
                : (!mediaLinked
                    ? '未关联音视频'
                    : (mediaExists ? '已关联音视频' : '关联音视频缺失'));
            const mediaPillLabel = playable ? '播' : '影';
            const rowCls = [
                active ? 'is-active' : '',
                checked ? 'is-checked' : '',
            ].filter(Boolean).join(' ');
            return `<tr data-library-media="${escHtml(m.id)}" class="${rowCls}" title="${escHtml(m.path || title)}">
                <td class="col-check">
                    <input type="checkbox" data-library-check="${escHtml(m.id)}" ${checked ? 'checked' : ''} aria-label="选择 ${escHtml(title)}">
                </td>
                <td class="col-title">
                    <div class="lib-media-title-row">
                        <div class="lib-media-title">${escHtml(title)}</div>
                        <span class="lib-role-pills" aria-hidden="true">
                            <span class="lib-role-pill ${mediaPillCls}" title="${mediaPillTitle}">${mediaPillLabel}</span>
                            <span class="lib-role-pill ${hasSrc ? 'is-src' : 'is-off'}" title="${hasSrc ? '有转录（原文）' : '无转录'}">原</span>
                            <span class="lib-role-pill ${hasTgt ? 'is-tgt' : 'is-off'}" title="${hasTgt ? '有译文' : '无译文'}">译</span>
                            <span class="lib-role-pill ${hasBi ? 'is-bi' : 'is-off'}" title="${hasBi ? '有双语' : '无双语'}">双</span>
                        </span>
                    </div>
                    <div class="lib-media-path">${escHtml(m.path || (mediaLinked ? '' : '未关联音视频'))}</div>
                    ${statusChipsHtml(m)}
                </td>
                <td class="col-src">${countCellHtml(m.sourceCueCount, m.sourceVersionCount)}</td>
                <td class="col-tgt">${countCellHtml(m.targetCueCount, m.targetVersionCount)}</td>
                <td class="col-bi">${countCellHtml(m.bilingualCueCount, m.bilingualVersionCount)}</td>
                <td class="col-time">${escHtml(formatLibraryTime(m.lastVersionAt || m.updatedAt, { short: true }))}</td>
            </tr>`;
        }).join('');
    }

    function trackRoleKey(track) {
        return String(track?.role || '').toLowerCase();
    }

    function orderedDetailTracks(tracks) {
        const list = Array.isArray(tracks) ? tracks.slice() : [];
        const order = ['target', 'source', 'bilingual'];
        list.sort((a, b) => {
            const ia = order.indexOf(trackRoleKey(a));
            const ib = order.indexOf(trackRoleKey(b));
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        return list;
    }

    function findTrackByRole(tracks, role) {
        const want = String(role || '').toLowerCase();
        return (Array.isArray(tracks) ? tracks : []).find((t) => trackRoleKey(t) === want) || null;
    }

    function findTrackRoleForVersion(tracks, versionId) {
        const vid = String(versionId || '').trim();
        if (!vid) return '';
        for (const track of (Array.isArray(tracks) ? tracks : [])) {
            if ((track.versions || []).some((v) => v && v.id === vid)) {
                return trackRoleKey(track);
            }
        }
        return '';
    }

    function resolveDetailTrackTab(tracks, detail) {
        const ordered = orderedDetailTracks(tracks);
        if (!ordered.length) return '';
        const roles = new Set(ordered.map(trackRoleKey));
        const cur = String(state.detailTrackTab || '').toLowerCase();
        if (cur && roles.has(cur)) return cur;
        const focusRole = findTrackRoleForVersion(ordered, state.focusVersionId)
            || findTrackRoleForVersion(ordered, state.playingVersionId);
        if (focusRole && roles.has(focusRole)) return focusRole;
        const primary = global.TransubLibraryPlayerCore?.pickPrimaryTrack?.(detail) || ordered[0];
        return trackRoleKey(primary) || trackRoleKey(ordered[0]);
    }

    function renderTrackTabsHtml(tracks, activeRole) {
        const ordered = orderedDetailTracks(tracks);
        if (ordered.length < 2) return '';
        return `<div class="lib-track-tabs" role="tablist" aria-label="字幕轨道">
            ${ordered.map((track) => {
                const role = trackRoleKey(track);
                const on = role === activeRole;
                const n = (Array.isArray(track.versions) ? track.versions : []).length;
                const label = track.roleLabel || role || '字幕';
                return `<button type="button" class="lib-track-tab${on ? ' is-on' : ''}"
                    role="tab" aria-selected="${on ? 'true' : 'false'}"
                    data-library-track-tab="${escHtml(role)}">${escHtml(label)}<span class="lib-track-tab-count">${n}</span></button>`;
            }).join('')}
        </div>`;
    }

    function chipHtml(text, kind = '') {
        const cls = kind ? ` lib-chip-${kind}` : '';
        return `<span class="lib-chip${cls}">${escHtml(text)}</span>`;
    }

    function renderTrackVersionsHtml(track, caps, { showRecipe = true, mediaExists = false } = {}) {
        const versions = Array.isArray(track.versions) ? track.versions : [];
        if (!versions.length) {
            return `<div class="lib-empty" style="padding:0.85rem; text-align:left;">无版本</div>`;
        }
        let html = '';
        for (const v of versions) {
            const active = !!v.isActive;
            const isCompareA = state.compareA === v.id;
            const published = v.status === 'published';
            const fileMissing = !(v.blobExists || v.exportExists);
            const tags = Array.isArray(v.tags) ? v.tags : [];
            const isTagA = tags.includes('对照A');
            const isTagB = tags.includes('对照B');
            const compareLabel = isCompareA
                ? '取消'
                : (state.compareA && state.compareTrackId === track.id ? '作 B' : '对比');
            const statusChip = published ? chipHtml('已发布', 'accent') : '';
            const cueN = (v.cueCount != null && Number.isFinite(Number(v.cueCount)))
                ? Number(v.cueCount)
                : null;
            const chips = [
                active ? chipHtml('当前', 'ok') : '',
                isCompareA ? chipHtml('对比 A', 'accent') : '',
                statusChip,
                ...(Array.isArray(v.recipeLayers) ? v.recipeLayers.map((lab) => {
                    if (lab === 'Pro译') return chipHtml(lab, 'accent');
                    if (lab === '推理译') return chipHtml(lab, 'a');
                    if (lab === '机器译') return chipHtml(lab);
                    if (lab === '已润色' || lab === '人名已锁') return chipHtml(lab, 'ok');
                    return chipHtml(lab);
                }) : []),
                cueN != null ? chipHtml(`${cueN} 条`) : '',
                fileMissing ? chipHtml('缺失', 'danger') : '',
                ...tags.map((t) => chipHtml(t === '对照A' ? 'A' : (t === '对照B' ? 'B' : t), t === '对照B' ? 'b' : (t === '对照A' ? 'a' : ''))),
                `<span class="lib-chip lib-chip-time">${escHtml(formatLibraryTime(v.createdAt, { short: true }))}</span>`,
            ].filter(Boolean).join('');

            const isFocus = state.focusVersionId === v.id;
            const isPlaying = state.playingVersionId === v.id;
            const rowCls = [
                'lib-ver',
                active ? 'is-active' : '',
                isCompareA ? 'is-compare' : '',
                isFocus ? 'is-focus' : '',
                isPlaying ? 'is-playing' : '',
            ].filter(Boolean).join(' ');

            const setActiveBtn = (!active && !fileMissing)
                ? `<button type="button" class="lib-btn" data-library-active="${escHtml(v.id)}" title="将覆盖视频旁对应字幕文件；库内其他版本保留">设为当前</button>`
                : '';
            const showTextPreview = !fileMissing;

            html += `<div class="${rowCls}" data-library-version="${escHtml(v.id)}" title="单击试看 · 双击打开编辑器">
                <div class="min-w-0">
                    <div class="lib-ver-meta">${chips}</div>
                    ${showRecipe ? `<div class="lib-ver-recipe">${escHtml(v.recipeTechSummary || v.recipeSummary || '—')}</div>` : ''}
                    <div class="lib-ver-file">${escHtml(basenamePath(v.exportPath))}${v.note ? ` · ${escHtml(v.note)}` : ''}</div>
                </div>
                <div class="lib-ver-actions">
                    <button type="button" class="lib-btn lib-btn-soft" data-library-play="${escHtml(v.id)}" ${fileMissing ? 'disabled title="文件缺失"' : ''} title="试看（切换版本保留进度）">${isPlaying ? '播放中' : '试看'}</button>
                    <button type="button" class="lib-btn lib-btn-primary" data-library-open="${escHtml(v.id)}" ${fileMissing ? 'disabled title="文件缺失"' : ''}>打开</button>
                    <details class="lib-more">
                        <summary class="lib-btn lib-btn-icon" title="更多" aria-label="更多"><i class="fa fa-ellipsis-h"></i></summary>
                        <div class="lib-more-panel">
                            ${setActiveBtn}
                            ${showTextPreview ? `<button type="button" class="lib-btn" data-library-preview="${escHtml(v.id)}" title="只读查看字幕正文">看正文</button>` : ''}
                            <div class="lib-more-label">文件</div>
                            <button type="button" class="lib-btn" data-library-reveal-version="${escHtml(v.id)}" ${fileMissing ? 'disabled' : ''}>打开字幕位置</button>
                            <button type="button" class="lib-btn" data-library-copy-version="${escHtml(v.id)}" ${fileMissing ? 'disabled' : ''}>复制字幕路径</button>
                            <button type="button" class="lib-btn" data-library-export="${escHtml(v.id)}" ${fileMissing ? 'disabled' : ''}>导出字幕…</button>
                            <div class="lib-more-sep"></div>
                            <button type="button" class="lib-btn${caps?.versionDiff ? '' : ' opacity-50'}${isCompareA ? ' is-active' : ''}"
                                data-library-compare="${escHtml(v.id)}" data-library-track="${escHtml(track.id)}"${proLockAttr(caps, 'versionDiff')} title="先选 A，再选同轨另一版作 B">${compareLabel}</button>
                            <button type="button" class="lib-btn${caps?.recipeRerun ? '' : ' opacity-50'}"
                                data-library-rerun="${escHtml(v.id)}" data-recipe="${escHtml(v.recipeSummary || '')}"${proLockAttr(caps, 'recipeRerun')} ${fileMissing ? 'disabled' : ''}>配方再跑</button>
                            <button type="button" class="lib-btn" data-library-note="${escHtml(v.id)}" data-note="${escHtml(v.note || '')}">备注</button>
                            <div class="lib-more-sep"></div>
                            <div class="lib-more-label">对照标签</div>
                            <button type="button" class="lib-btn${caps?.multiAb ? '' : ' opacity-50'}${isTagA ? ' is-active' : ''}"
                                data-library-ab-tag="${escHtml(v.id)}" data-ab="对照A"${proLockAttr(caps, 'multiAb')}>标为 A</button>
                            <button type="button" class="lib-btn${caps?.multiAb ? '' : ' opacity-50'}${isTagB ? ' is-active' : ''}"
                                data-library-ab-tag="${escHtml(v.id)}" data-ab="对照B"${proLockAttr(caps, 'multiAb')}>标为 B</button>
                            ${(isTagA || isTagB) ? `<button type="button" class="lib-btn${caps?.multiAb ? '' : ' opacity-50'}"
                                data-library-ab-tag="${escHtml(v.id)}" data-ab=""${proLockAttr(caps, 'multiAb')}>清除标签</button>` : ''}
                            <div class="lib-more-sep"></div>
                            <button type="button" class="lib-btn${caps?.publishPack ? '' : ' opacity-50'}"
                                data-library-publish="${escHtml(v.id)}" data-published="${published ? '1' : '0'}"${proLockAttr(caps, 'publishPack')}>${published ? '取消发布' : '标记发布'}</button>
                            <button type="button" class="lib-btn lib-btn-danger" data-library-delete="${escHtml(v.id)}" ${active || published ? 'disabled title="请先取消当前/发布后再删"' : ''}>删除</button>
                        </div>
                    </details>
                </div>
            </div>`;
        }
        return html;
    }

    function renderLibraryDetail(detail) {
        const host = document.getElementById('libraryDetail');
        if (!host) return;
        if (!detail?.ok) {
            const msg = detail?.error || '选择列表中的作品查看版本';
            const clear = hasActiveLibraryFilters() && /筛选|符合条件/.test(msg)
                ? `<div class="lib-empty-actions"><button type="button" class="lib-btn" data-library-clear-filters>清除筛选</button></div>`
                : '';
            host.innerHTML = `<div class="lib-empty"><p class="lib-empty-title">${escHtml(msg)}</p>${clear}</div>`;
            const bar = document.getElementById('libraryDetailBarTitle');
            if (bar) bar.textContent = '版本详情';
            state.lastDetail = null;
            ensureLibraryPlayer()?.clear?.({ hide: true });
            markPlayingVersion('');
            if (detail) setDetailOpen(true);
            return;
        }
        state.lastDetail = detail;
        const media = detail.media;
        const tracks = Array.isArray(detail.tracks) ? detail.tracks : [];
        const caps = detail.caps || state.caps;
        updateLibraryCapsUi(caps);
        const path = media.path || '';
        const mediaLinked = !!media.mediaLinked || !!path;
        const mediaExists = !!media.mediaExists;
        const bar = document.getElementById('libraryDetailBarTitle');
        if (bar) bar.textContent = media.title || basenamePath(media.path) || '版本详情';
        setDetailOpen(true);

        const preferredOpenVersionId = String(media.preferredOpenVersionId || '').trim();
        const canOpenPreferred = !!preferredOpenVersionId;
        const activeRole = resolveDetailTrackTab(tracks, detail);
        state.detailTrackTab = activeRole;
        const activeTrack = findTrackByRole(tracks, activeRole) || orderedDetailTracks(tracks)[0] || null;

        let html = `<div class="lib-hero">
            <div class="lib-hero-top">
                <div class="min-w-0">
                    <div class="lib-hero-title-row">
                        <h2 class="lib-hero-title">${escHtml(media.title || basenamePath(media.path) || '未命名作品')}</h2>
                        <button type="button" class="lib-btn lib-btn-soft" data-library-rename-media="${escHtml(media.id)}">重命名</button>
                        <button type="button" class="lib-btn lib-btn-danger" data-library-delete-media="${escHtml(media.id)}" title="从字幕库删除整部作品">删除</button>
                    </div>
                    <p class="lib-hero-path">
                        <span class="lib-hero-path-text" title="${escHtml(path || '未关联音视频')}">${escHtml(path || '未关联音视频')}</span>
                        ${path ? `<button type="button" class="lib-btn lib-btn-ghost lib-btn-icon" data-library-open-media="${escHtml(media.id)}" title="打开音视频" aria-label="打开音视频" ${mediaExists ? '' : 'disabled'}><i class="fa fa-play-circle"></i></button>
                        <button type="button" class="lib-btn lib-btn-ghost lib-btn-icon" data-library-reveal-path="${escHtml(path)}" title="打开所在文件夹" aria-label="打开所在文件夹"><i class="fa fa-folder-open-o"></i></button>
                        <button type="button" class="lib-btn lib-btn-ghost lib-btn-icon" data-library-copy-path="${escHtml(path)}" title="复制路径" aria-label="复制路径"><i class="fa fa-clone"></i></button>` : ''}
                    </p>
                </div>
            </div>
            <div class="lib-hero-actions">
                <button type="button" class="lib-btn lib-btn-primary" data-library-open-preferred="${escHtml(preferredOpenVersionId)}" ${canOpenPreferred ? '' : 'disabled title="没有可打开的当前字幕"'}>打开</button>
                ${preferredOpenVersionId ? `<button type="button" class="lib-btn lib-btn-soft" data-library-play="${escHtml(preferredOpenVersionId)}">试看当前</button>` : ''}
                <details class="lib-more">
                    <summary class="lib-btn lib-btn-icon" title="更多" aria-label="更多"><i class="fa fa-ellipsis-h"></i></summary>
                    <div class="lib-more-panel">
                        <div class="lib-more-label">关联媒体</div>
                        <button type="button" class="lib-btn" data-library-auto-link-media="${escHtml(media.id)}">自动匹配</button>
                        <button type="button" class="lib-btn" data-library-link-media="${escHtml(media.id)}">手动选择…</button>
                        ${mediaLinked ? `<button type="button" class="lib-btn" data-library-clear-media="${escHtml(media.id)}">清除关联</button>` : ''}
                    </div>
                </details>
            </div>
            ${state.pendingRerunMediaId === media.id ? `<div class="lib-pending-banner is-on">
                <i class="fa fa-spinner" aria-hidden="true"></i>
                <span>配方再跑进行中 · 主窗口确认后入库会自动刷新</span>
                <button type="button" class="lib-btn lib-btn-ghost" data-library-clear-pending-rerun style="margin-left:auto;">清除提示</button>
            </div>` : ''}
            <div class="lib-compare-banner${state.compareA ? ' is-on' : ''}">已选对比 A · 再点同轨另一版本作为 B</div>
        </div>`;

        if (!tracks.length || !activeTrack) {
            html += '<div class="lib-empty"><p class="lib-empty-title">尚无轨道版本</p></div>';
            host.innerHTML = html;
            ensureLibraryPlayer()?.clear?.({ hide: true });
            markPlayingVersion('');
            return;
        }

        html += renderTrackTabsHtml(tracks, activeRole);

        const role = trackRoleKey(activeTrack);
        const trackMeta = [
            escHtml(activeTrack.lang || ''),
            `${(activeTrack.versions || []).length} 版`,
            activeTrack.limitHint ? escHtml(activeTrack.limitHint) : '',
        ].filter(Boolean).join(' · ');
        const singleTrack = orderedDetailTracks(tracks).length < 2;
        html += `<section class="lib-track${activeTrack.atVersionLimit ? ' is-limit' : ''}" data-role="${escHtml(role)}">
            <div class="lib-track-head">
                <span class="lib-track-name"><span class="lib-track-dot" aria-hidden="true"></span>${escHtml(
                    singleTrack ? (activeTrack.roleLabel || activeTrack.role || '字幕') : '版本'
                )}</span>
                <div class="lib-track-head-actions">
                    <span class="lib-track-meta">${trackMeta}</span>
                </div>
            </div>
            <div class="lib-track-body">${renderTrackVersionsHtml(activeTrack, caps, { showRecipe: true, mediaExists })}</div>
        </section>`;

        if (!caps?.libraryPro) {
            html += `<div class="lib-callout">免费版每轨有限版本。开通 Pro 可解锁对比、发布、再跑与高级筛选。</div>`;
        }
        host.innerHTML = html;
        scrollFocusVersionIntoView();
        markPlayingVersion(state.playingVersionId);
        if (libraryPlayer?.isOpen?.()) {
            libraryPlayer.setDetail?.(state.lastDetail, { showArchived: true });
            if (state.playingVersionId) {
                const playingStillThere = !!(host.querySelector(
                    `[data-library-version="${String(state.playingVersionId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`,
                ));
                if (!playingStillThere) {
                    closeLibraryPlayerModal();
                }
            }
        } else if (!state.playingVersionId) {
            // keep modal closed when browsing detail
        }
    }

    function scrollFocusVersionIntoView() {
        const vid = String(state.focusVersionId || '').trim();
        if (!vid) return;
        const safe = vid.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const row = document.querySelector(`[data-library-version="${safe}"]`);
        if (!row) return;
        try { row.scrollIntoView?.({ block: 'nearest' }); } catch { /* ignore */ }
        try { row.classList.add('is-focus-pulse'); } catch { /* ignore */ }
        setTimeout(() => {
            try { row.classList.remove('is-focus-pulse'); } catch { /* ignore */ }
        }, 1600);
    }

    async function loadLibraryMediaDetail(mediaId) {
        const id = String(mediaId || '').trim();
        if (!id) {
            closeLibraryDetail();
            return;
        }
        const mediaChanged = state.selectedMediaId !== id;
        state.selectedMediaId = id;
        rememberSelectedMedia(id);
        renderLibraryMediaList(state.allItems);
        const filters = readLibraryFilters();
        const res = await electron?.transubLibraryGetMedia?.({
            mediaId: id,
            presetId: filters.presetId,
            mtModel: filters.mtModel,
            tag: filters.tag,
        });
        if (mediaChanged) {
            state.playingVersionId = '';
            state.detailTrackTab = '';
            ensureLibraryPlayer()?.clear?.({ hide: true });
        }
        renderLibraryDetail(res);
        if (!res?.ok) toast(res?.error || '加载作品详情失败', 'err');
        scrollSelectedMediaIntoView();
    }

    function scrollSelectedMediaIntoView() {
        const id = String(state.selectedMediaId || '');
        if (!id) return;
        const row = document.querySelector(`tr[data-library-media="${id.replace(/"/g, '')}"]`);
        try { row?.scrollIntoView?.({ block: 'nearest' }); } catch { /* ignore */ }
    }

    async function refreshLibraryList(preferMediaId) {
        const filters = readLibraryFilters();
        if ((filters.presetId || filters.mtModel || filters.tag) && !(state.caps?.recipeFilter || state.caps?.libraryPro)) {
            promptProLibrary();
            for (const id of ['libraryFilterPreset', 'libraryFilterMt', 'libraryFilterTag']) {
                const el = document.getElementById(id);
                if (el) el.value = '';
            }
        }
        const next = readLibraryFilters();
        setStatus('加载中…');
        const res = await electron?.transubLibraryList?.({
            query: next.query,
            presetId: next.presetId,
            mtModel: next.mtModel,
            tag: next.tag,
        });
        updateLibraryCapsUi(res?.caps);
        updateLibraryFilterControls(res?.facets, res?.caps);
        const rawItems = res?.ok ? (res.items || []) : [];
        setStatus(res?.ok ? `${res.total || 0} 部` : '');
        state.lastListTotal = res?.total || 0;
        state.lastListFiltered = hasActiveLibraryFilters();
        if (!res?.ok) {
            toast(res?.error || '加载字幕库失败', 'err');
            state.allItems = [];
            state.items = [];
            renderLibraryMediaList([]);
            setDetailOpen(false);
            return;
        }
        renderLibraryMediaList(rawItems);
        if (!state.allItems.length) {
            state.selectedMediaId = '';
            setDetailOpen(false);
            return;
        }
        const targetId = String(preferMediaId || '').trim()
            || (state.detailOpen ? state.selectedMediaId : '');
        const still = targetId && state.items.find((m) => m.id === targetId);
        if (still) {
            await loadLibraryMediaDetail(still.id);
            return;
        }
        if (targetId && hasActiveLibraryFilters() && state.detailOpen) {
            state.selectedMediaId = targetId;
            renderLibraryMediaList(state.allItems);
            renderLibraryDetail({
                ok: false,
                error: '当前选中作品不在筛选结果中，可清除筛选或另选列表中的作品',
            });
            setDetailOpen(true);
            return;
        }
        if (targetId && !still && !hasActiveLibraryFilters()) {
            // Prefer-id came from a deep-link but catalog has no such media.
            const inAll = state.allItems.find((m) => m.id === targetId);
            if (!inAll) {
                toast('未在字幕库中找到该作品（可能尚未入库）', 'warn');
            }
        }
        // List-first: keep the table primary; only reopen detail if it was already open.
        if (!state.detailOpen) {
            state.selectedMediaId = '';
            renderLibraryMediaList(state.allItems);
        } else {
            closeLibraryDetail();
        }
    }

    async function copyText(text, okMessage = '已复制') {
        const value = String(text || '').trim();
        if (!value) {
            toast('没有可复制的路径', 'warn');
            return;
        }
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                const ta = document.createElement('textarea');
                ta.value = value;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            toast(okMessage, 'info');
        } catch (err) {
            toast(err?.message || '复制失败', 'err');
        }
    }

    async function libraryRevealPath(filePath) {
        const p = String(filePath || '').trim();
        if (!p) {
            toast('缺少路径', 'warn');
            return;
        }
        try {
            const res = await electron?.showInFolder?.(p);
            if (res?.ok === false) toast(res.error || '无法打开文件夹', 'err');
        } catch (err) {
            toast(err?.message || '无法打开文件夹', 'err');
        }
    }

    async function libraryOpenMedia(mediaId) {
        const item = findLibraryItem(mediaId);
        const p = String(item?.path || '').trim();
        if (!p) {
            toast('尚未关联音视频', 'warn');
            return;
        }
        if (item && item.mediaExists === false) {
            toast('关联的音视频文件不存在', 'err');
            return;
        }
        try {
            const res = await electron?.openPath?.(p);
            if (res?.ok === false) toast(res.error || '无法打开音视频', 'err');
        } catch (err) {
            toast(err?.message || '无法打开音视频', 'err');
        }
    }

    async function libraryLinkMedia(mediaId) {
        const id = String(mediaId || '').trim();
        if (!id) return;
        const res = await electron?.transubLibrarySetMediaPath?.({ mediaId: id, pick: true });
        if (res?.canceled) return;
        if (!res?.ok) {
            toast(res?.error || '关联失败', 'err');
            return;
        }
        toast(res.rematchHint || '已关联音视频', 'info');
        await refreshLibraryList(id);
        await resumePlayingAfterMediaLink();
    }

    async function libraryAutoLinkMedia(mediaId) {
        const id = String(mediaId || '').trim();
        if (!id) return;
        const res = await electron?.transubLibraryAutoLinkMedia?.({ mediaId: id });
        if (!res?.ok) {
            if (res?.canPick !== false) {
                const hint = res?.hint ? `\n\n${res.hint}` : '';
                const ok = await libraryConfirm({
                    title: '自动匹配失败',
                    message: `${res?.error || '未找到可关联的音视频'}${hint}\n\n是否手动选择音视频？`,
                    okLabel: '手动选择',
                });
                if (ok) await libraryLinkMedia(id);
                return;
            }
            toast(res?.error || '自动匹配失败', 'err');
            return;
        }
        if (res.unchanged) toast('已关联当前音视频', 'info');
        else toast(res.rematchHint || '已自动匹配音视频', 'info');
        await refreshLibraryList(id);
        await resumePlayingAfterMediaLink();
    }

    function openLibraryRenameModal(mediaId) {
        const id = String(mediaId || '').trim();
        if (!id) return;
        state.renameMediaId = id;
        const item = findLibraryItem(id);
        const current = item?.title || basenamePath(item?.path) || '';
        const modal = document.getElementById('libraryRenameModal');
        const input = document.getElementById('libraryRenameInput');
        if (!modal || !input) return;
        input.value = current;
        modal.classList.remove('hidden');
        setTimeout(() => {
            input.focus();
            input.select();
        }, 0);
    }

    function closeLibraryRenameModal() {
        document.getElementById('libraryRenameModal')?.classList.add('hidden');
        state.renameMediaId = '';
    }

    async function confirmLibraryRename() {
        const id = state.renameMediaId;
        if (!id) return;
        const title = String(document.getElementById('libraryRenameInput')?.value || '').trim();
        if (!title) {
            toast('标题不能为空', 'warn');
            return;
        }
        const btn = document.getElementById('libraryRenameConfirmBtn');
        if (btn) btn.disabled = true;
        try {
            const res = await electron?.transubLibraryRenameMedia?.({ mediaId: id, title });
            if (!res?.ok) {
                toast(res?.error || '重命名失败', 'err');
                return;
            }
            closeLibraryRenameModal();
            toast('已重命名', 'info');
            await refreshLibraryList(id);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function libraryRenameMedia(mediaId) {
        openLibraryRenameModal(mediaId);
    }

    async function libraryClearMedia(mediaId) {
        const id = String(mediaId || '').trim();
        if (!id) return;
        const res = await electron?.transubLibrarySetMediaPath?.({ mediaId: id, clear: true });
        if (!res?.ok) {
            toast(res?.error || '清除关联失败', 'err');
            return;
        }
        toast('已清除音视频关联', 'info');
        await refreshLibraryList(id);
    }

    async function libraryRevealVersion(versionId) {
        const res = await electron?.transubLibraryOpenVersion?.({ versionId });
        if (!res?.ok) {
            toast(res?.error || '版本文件不存在', 'err');
            return;
        }
        await libraryRevealPath(res.path);
    }

    async function libraryCopyVersionPath(versionId) {
        const res = await electron?.transubLibraryOpenVersion?.({ versionId });
        if (!res?.ok) {
            toast(res?.error || '版本文件不存在', 'err');
            return;
        }
        await copyText(res.path, '已复制字幕路径');
    }

    function syncLibraryNoteCount() {
        const input = document.getElementById('libraryNoteInput');
        const count = document.getElementById('libraryNoteCount');
        if (!count) return;
        const n = String(input?.value || '').length;
        count.textContent = `${n} / 200`;
    }

    function openLibraryNoteModal(versionId, currentNote) {
        state.noteVersionId = versionId || '';
        const modal = document.getElementById('libraryNoteModal');
        const input = document.getElementById('libraryNoteInput');
        if (!modal || !input) return;
        input.value = currentNote || '';
        syncLibraryNoteCount();
        modal.classList.remove('hidden');
        setTimeout(() => {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }, 0);
    }

    function closeLibraryNoteModal() {
        document.getElementById('libraryNoteModal')?.classList.add('hidden');
        state.noteVersionId = '';
    }

    async function confirmLibraryNote() {
        const versionId = state.noteVersionId;
        if (!versionId) return;
        const note = String(document.getElementById('libraryNoteInput')?.value || '');
        const btn = document.getElementById('libraryNoteConfirmBtn');
        if (btn) btn.disabled = true;
        try {
            const res = await electron?.transubLibrarySetNote?.({ versionId, note });
            if (!res?.ok) {
                toast(res?.error || '保存备注失败', 'err');
                return;
            }
            closeLibraryNoteModal();
            toast(res.version?.note ? '备注已保存' : '备注已清空', 'info');
            if (state.selectedMediaId) await loadLibraryMediaDetail(state.selectedMediaId);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function libraryEditNote(versionId, currentNote) {
        openLibraryNoteModal(versionId, currentNote);
    }

    function moveMediaSelection(delta) {
        if (!state.items.length) return;
        const idx = state.items.findIndex((m) => m.id === state.selectedMediaId);
        const base = idx < 0 ? (delta > 0 ? -1 : 0) : idx;
        const next = Math.max(0, Math.min(state.items.length - 1, base + delta));
        const item = state.items[next];
        if (!item) return;
        // Keep list-first: j/k only moves highlight unless detail is already open.
        if (state.detailOpen) {
            state.compareA = '';
            state.compareTrackId = '';
            void loadLibraryMediaDetail(item.id);
            return;
        }
        state.selectedMediaId = item.id;
        renderLibraryMediaList(state.allItems);
        scrollSelectedMediaIntoView();
    }

    async function librarySetAbTag(versionId, abTag) {
        if (!state.caps?.multiAb) {
            promptProLibrary();
            return;
        }
        const res = await electron?.transubLibrarySetAbTag?.({ versionId, abTag });
        if (!res?.ok) {
            if (res?.proRequired) promptProLibrary();
            else toast(res?.error || '设置对照标签失败', 'err');
            return;
        }
        toast(abTag ? `已标记${abTag}` : '已清除对照标签', 'info');
        if (state.selectedMediaId) await loadLibraryMediaDetail(state.selectedMediaId);
    }

    async function libraryStartMtTrain(mediaId) {
        if (!state.caps?.multiAb) {
            promptProLibrary();
            return;
        }
        const res = await electron?.transubLibraryStartMtTrain?.({ mediaId });
        if (!res?.ok) {
            if (res?.proRequired) promptProLibrary();
            else toast(res?.error || '无法打开学习向导', 'err');
            return;
        }
        const ab = res.prepared?.hasAbPair ? '（已带对照路径）' : '';
        toast(`已打开学习向导${ab}`, 'info');
    }

    function closeLibraryPreviewModal() {
        document.getElementById('libraryPreviewModal')?.classList.add('hidden');
        state.previewVersionId = '';
        const openBtn = document.getElementById('libraryPreviewOpenBtn');
        if (openBtn) openBtn.disabled = true;
    }

    async function libraryPreviewVersion(versionId) {
        const id = String(versionId || '').trim();
        if (!id) return;
        const res = await electron?.transubLibraryPreviewVersion?.({ versionId: id, maxLines: 80 });
        const modal = document.getElementById('libraryPreviewModal');
        const content = document.getElementById('libraryPreviewContent');
        const meta = document.getElementById('libraryPreviewMeta');
        const stats = document.getElementById('libraryPreviewStats');
        const openBtn = document.getElementById('libraryPreviewOpenBtn');
        if (!modal || !content) return;
        if (!res?.ok) {
            toast(res?.error || '预览失败', 'err');
            return;
        }
        state.previewVersionId = id;
        const titleBits = [
            res.mediaTitle || '',
            res.roleLabel || res.role || '',
            res.basename || '',
        ].filter(Boolean);
        if (meta) meta.textContent = titleBits.join(' · ') || '字幕内容';
        const cueLabel = Number.isFinite(Number(res.cueCount)) ? `${Number(res.cueCount)} 条` : '';
        const lineLabel = Number.isFinite(Number(res.lineCount)) ? `${Number(res.lineCount)} 行` : '';
        const truncLabel = res.truncated ? '已截断' : '';
        if (stats) {
            stats.textContent = [
                cueLabel,
                lineLabel,
                truncLabel,
                res.recipeSummary || '',
                res.note ? `备注：${res.note}` : '',
            ].filter(Boolean).join(' · ');
        }
        content.textContent = String(res.preview || '') + (res.truncated ? '\n\n…' : '');
        if (openBtn) openBtn.disabled = false;
        modal.classList.remove('hidden');
        try { content.scrollTop = 0; } catch { /* ignore */ }
    }

    async function libraryOpenVersion(versionId) {
        const res = await electron?.transubLibraryOpenVersion?.({ versionId });
        if (!res?.ok) {
            toast(res?.error || '打开版本失败', 'err');
            return;
        }
        if (res.mediaLinkedOnOpen) {
            toast('已自动关联音视频并打开', 'info');
            if (state.selectedMediaId) void refreshLibraryList(state.selectedMediaId);
        }
        const library = res.library || {
            mediaId: res.mediaId || '',
            trackId: res.trackId || '',
            versionId: res.versionId || '',
            role: res.role || '',
            roleLabel: res.roleLabel || '',
            recipeSummary: res.recipeSummary || '',
            contentRef: res.contentRef || '',
            exportPath: res.exportPath || '',
            isActive: !!res.isActive,
            mediaTitle: res.mediaTitle || '',
            openedFromBlob: !!res.openedFromBlob,
        };
        const opened = await electron?.transubOpenSubtitleEditor?.({
            subPath: res.path,
            videoPath: res.videoPath || '',
            library,
            ...library,
        });
        if (opened?.ok === false) toast(opened.error || '无法打开编辑器', 'err');
    }

    async function libraryAutoLinkMediaBatch(mediaIds, { allMissing = false } = {}) {
        const ids = Array.isArray(mediaIds)
            ? mediaIds.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
        if (!allMissing && !ids.length) {
            toast('请先勾选作品', 'warn');
            return;
        }
        const res = await electron?.transubLibraryAutoLinkMediaBatch?.(
            allMissing ? { onlyUnlinkedOrMissing: true } : { mediaIds: ids, onlyUnlinkedOrMissing: true },
        );
        if (!res?.ok) {
            toast(res?.error || '批量匹配失败', 'err');
            return;
        }
        const linked = Number(res.linked) || 0;
        const failed = Number(res.failed) || 0;
        if (!linked && !failed) {
            toast('没有需要修复的关联', 'info');
        } else {
            toast(`已匹配 ${linked} 部${failed ? ` · 失败 ${failed}` : ''}`, linked ? 'info' : 'warn');
        }
        await refreshLibraryList(state.detailOpen ? state.selectedMediaId : '');
    }

    function bindLibraryMediaDrop() {
        const list = document.getElementById('libraryMediaList');
        const detail = document.getElementById('libraryDetail');
        const onDragOver = (e) => {
            if (![...e.dataTransfer.types].includes('Files')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'link';
        };
        const takeMediaFile = (dt) => {
            const files = [...(dt?.files || [])];
            const hit = files.find((f) => /\.(mp4|mkv|avi|mov|webm|m4v|mp3|wav|flac|m4a|aac|ogg|wma|opus)$/i.test(f.name || ''));
            return hit?.path || '';
        };
        list?.addEventListener('dragover', onDragOver);
        detail?.addEventListener('dragover', onDragOver);
        list?.addEventListener('drop', (e) => {
            const row = e.target.closest('tr[data-library-media]');
            if (!row) return;
            const filePath = takeMediaFile(e.dataTransfer);
            if (!filePath) return;
            e.preventDefault();
            e.stopPropagation();
            const mediaId = row.getAttribute('data-library-media') || '';
            void (async () => {
                const res = await electron?.transubLibrarySetMediaPath?.({ mediaId, mediaPath: filePath });
                if (!res?.ok) {
                    toast(res?.error || '关联失败', 'err');
                    return;
                }
                toast('已关联拖入的音视频', 'info');
                await refreshLibraryList(mediaId);
                if (mediaId === state.selectedMediaId) await resumePlayingAfterMediaLink();
            })();
        });
        detail?.addEventListener('drop', (e) => {
            if (!state.selectedMediaId) return;
            const filePath = takeMediaFile(e.dataTransfer);
            if (!filePath) return;
            e.preventDefault();
            e.stopPropagation();
            const mediaId = state.selectedMediaId;
            void (async () => {
                const res = await electron?.transubLibrarySetMediaPath?.({ mediaId, mediaPath: filePath });
                if (!res?.ok) {
                    toast(res?.error || '关联失败', 'err');
                    return;
                }
                toast('已关联拖入的音视频', 'info');
                await refreshLibraryList(mediaId);
                await resumePlayingAfterMediaLink();
            })();
        });
    }

    async function librarySetActive(versionId) {
        const id = String(versionId || '').trim();
        if (!id) return;
        const ok = await libraryConfirm({
            title: '设为当前版',
            message: '设为当前后，将用该版本覆盖视频旁对应的字幕文件（sidecar）。\n库内其他版本不会删除。',
            okLabel: '设为当前',
            skipKey: 'setActive',
        });
        if (!ok) return;
        const res = await electron?.transubLibrarySetActive?.({ versionId: id });
        if (!res?.ok) {
            toast(res?.error || '设为当前失败', 'err');
            return;
        }
        toast(
            res.wroteExport ? '已设为当前并写回视频旁字幕' : '已设为当前（未写回旁路文件，可能缺少托管副本）',
            res.wroteExport ? 'info' : 'warn',
        );
        if (state.selectedMediaId) await refreshLibraryList(state.selectedMediaId);
    }

    function closeLibraryContextMenu() {
        document.getElementById('libraryRowContextMenu')?.classList.add('hidden');
        state.ctxMediaId = '';
    }

    function findLibraryItem(mediaId) {
        const id = String(mediaId || '');
        return state.items.find((m) => m.id === id)
            || state.allItems.find((m) => m.id === id)
            || null;
    }

    function openLibraryContextMenu(mediaId, clientX, clientY) {
        const menu = document.getElementById('libraryRowContextMenu');
        if (!menu) return;
        const item = findLibraryItem(mediaId);
        if (!item) return;
        state.ctxMediaId = item.id;
        const canOpen = !!item.preferredOpenVersionId;
        const hasPath = !!String(item.path || '').trim();
        const mediaExists = !!item.mediaExists;
        const setBtn = (action, enabled, title) => {
            const btn = menu.querySelector(`[data-lib-ctx="${action}"]`);
            if (!btn) return;
            btn.disabled = !enabled;
            if (title) btn.title = title;
            else btn.removeAttribute('title');
        };
        setBtn('open', canOpen, canOpen ? '' : '没有可打开的当前字幕');
        setBtn('export', canOpen, canOpen ? '' : '没有可导出的当前字幕');
        setBtn('detail', true);
        setBtn('open-media', hasPath && mediaExists, hasPath ? (mediaExists ? '' : '关联文件不存在') : '尚未关联音视频');
        setBtn('link-media', true);
        setBtn('auto-link-media', true);
        setBtn('clear-media', hasPath, hasPath ? '' : '尚未关联');
        setBtn('reveal', hasPath);
        setBtn('copy-path', hasPath);
        setBtn('delete', true);

        menu.classList.remove('hidden');
        const pad = 8;
        const mw = menu.offsetWidth || 180;
        const mh = menu.offsetHeight || 240;
        let left = clientX;
        let top = clientY;
        if (left + mw > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - mw - pad);
        if (top + mh > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - mh - pad);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    async function runLibraryContextAction(action) {
        const item = findLibraryItem(state.ctxMediaId);
        closeLibraryContextMenu();
        if (!item) return;
        switch (action) {
            case 'open':
                if (item.preferredOpenVersionId) void libraryOpenVersion(item.preferredOpenVersionId);
                else toast('没有可打开的当前字幕', 'warn');
                break;
            case 'export':
                if (item.preferredOpenVersionId) openLibraryExportModal(item.preferredOpenVersionId);
                else toast('没有可导出的当前字幕', 'warn');
                break;
            case 'detail':
                state.compareA = '';
                state.compareTrackId = '';
                void loadLibraryMediaDetail(item.id);
                break;
            case 'open-media':
                void libraryOpenMedia(item.id);
                break;
            case 'link-media':
                void libraryLinkMedia(item.id);
                break;
            case 'auto-link-media':
                void libraryAutoLinkMedia(item.id);
                break;
            case 'clear-media':
                void libraryClearMedia(item.id);
                break;
            case 'reveal':
                void libraryRevealPath(item.path || '');
                break;
            case 'copy-path':
                void copyText(item.path || '', '已复制音视频路径');
                break;
            case 'delete':
                void libraryDeleteMedia(item.id);
                break;
            default:
                break;
        }
    }

    function openSelectedMediaSubtitle() {
        const item = findLibraryItem(state.selectedMediaId);
        if (!item?.preferredOpenVersionId) {
            toast('没有可打开的当前字幕', 'warn');
            return;
        }
        void libraryOpenVersion(item.preferredOpenVersionId);
    }

    function renderLibraryDiff(res) {
        const modal = document.getElementById('libraryDiffModal');
        const meta = document.getElementById('libraryDiffMeta');
        const stats = document.getElementById('libraryDiffStats');
        const body = document.getElementById('libraryDiffBody');
        if (!modal || !body) return;
        if (!res?.ok) {
            if (res?.proRequired) promptProLibrary();
            else toast(res?.error || '对比失败', 'err');
            return;
        }
        if (meta) {
            const ab = res.abPair ? '对照A → 对照B · ' : '';
            meta.textContent = `${ab}A ${formatLibraryTime(res.versionA?.createdAt)}（${res.versionA?.recipeSummary || '—'}） → B ${formatLibraryTime(res.versionB?.createdAt)}（${res.versionB?.recipeSummary || '—'}）`;
        }
        if (stats) {
            const s = res.stats || {};
            stats.textContent = `相同 ${s.equal || 0} · 新增 ${s.added || 0} · 删除 ${s.deleted || 0}`;
        }
        body.innerHTML = (res.ops || []).map((op) => {
            const t = escHtml(op.text ?? '');
            if (op.op === 'add') return `<div class="lib-diff-add">+ ${t}</div>`;
            if (op.op === 'del') return `<div class="lib-diff-del">- ${t}</div>`;
            if (op.op === 'skip') return `<div class="lib-diff-skip">${t}</div>`;
            return `<div class="lib-diff-eq">  ${t}</div>`;
        }).join('') || '<div class="lib-diff-skip">（无差异）</div>';
        modal.classList.remove('hidden');
    }

    async function libraryCompareVersion(versionId, trackId) {
        if (!state.caps?.versionDiff) {
            promptProLibrary();
            return;
        }
        if (state.compareA === versionId) {
            state.compareA = '';
            state.compareTrackId = '';
            if (state.selectedMediaId) await loadLibraryMediaDetail(state.selectedMediaId);
            return;
        }
        if (!state.compareA || state.compareTrackId !== trackId) {
            state.compareA = versionId;
            state.compareTrackId = trackId;
            if (state.selectedMediaId) await loadLibraryMediaDetail(state.selectedMediaId);
            return;
        }
        const res = await electron?.transubLibraryDiff?.({
            versionIdA: state.compareA,
            versionIdB: versionId,
        });
        state.compareA = '';
        state.compareTrackId = '';
        if (state.selectedMediaId) await loadLibraryMediaDetail(state.selectedMediaId);
        renderLibraryDiff(res);
    }

    async function libraryDiffAbPair(trackId) {
        if (!state.caps?.versionDiff) {
            promptProLibrary();
            return;
        }
        renderLibraryDiff(await electron?.transubLibraryDiff?.({ abPair: true, trackId }));
    }

    async function libraryTogglePublish(versionId, isPublished) {
        if (!state.caps?.publishPack) {
            promptProLibrary();
            return;
        }
        const status = isPublished ? 'edited' : 'published';
        const res = await electron?.transubLibrarySetStatus?.({ versionId, status });
        if (!res?.ok) {
            if (res?.proRequired) promptProLibrary();
            else toast(res?.error || '更新状态失败', 'err');
            return;
        }
        toast(status === 'published' ? '已标记为发布版' : '已取消发布标记');
        if (state.selectedMediaId) await loadLibraryMediaDetail(state.selectedMediaId);
    }

    function closeLibraryExportModal() {
        document.getElementById('libraryExportModal')?.classList.add('hidden');
        state.exportVersionId = '';
    }

    function openLibraryExportModal(versionId) {
        const id = String(versionId || '').trim();
        if (!id) {
            toast('缺少版本', 'warn');
            return;
        }
        state.exportVersionId = id;
        const summary = document.getElementById('libraryExportSummary');
        const select = document.getElementById('libraryExportFormatSelect');
        const ctx = global.TransubLibraryPlayerCore?.findVersionContext?.(state.lastDetail, id);
        const title = state.lastDetail?.media?.title || findLibraryItem(state.selectedMediaId)?.title || '';
        const role = ctx?.track?.roleLabel || ctx?.track?.role || '';
        const recipe = ctx?.version?.recipeSummary || '';
        if (summary) {
            summary.textContent = [title, role, recipe].filter(Boolean).join(' · ') || `版本 ${id}`;
        }
        if (select && !select.value) select.value = 'srt';
        document.getElementById('libraryExportModal')?.classList.remove('hidden');
    }

    function libraryExportDefaultName(loaded, format) {
        const ext = String(format || 'srt').toLowerCase();
        const stem = String(loaded?.mediaTitle || loaded?.basename || 'subtitle')
            .replace(/\.[^.\\/]+$/i, '')
            .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120) || 'subtitle';
        return `${stem}.${ext}`;
    }

    async function confirmLibraryExport() {
        const versionId = String(state.exportVersionId || '').trim();
        if (!versionId) return;
        const format = String(document.getElementById('libraryExportFormatSelect')?.value || 'srt').toLowerCase();
        const btn = document.getElementById('libraryExportConfirmBtn');
        if (btn) btn.disabled = true;
        try {
            const loaded = await electron?.transubLibraryLoadVersionCues?.({ versionId });
            if (!loaded?.ok) {
                toast(loaded?.error || '读取字幕失败', 'err');
                return;
            }
            if (!Array.isArray(loaded.cues) || !loaded.cues.length) {
                toast('字幕内容为空', 'warn');
                return;
            }
            const res = await electron?.transubExportSubtitle?.({
                cues: loaded.cues,
                format,
                header: loaded.header,
                defaultName: libraryExportDefaultName(loaded, format),
                title: '导出字幕',
            });
            if (res?.canceled) return;
            if (!res?.ok) {
                toast(res?.error || '导出失败', 'err');
                return;
            }
            closeLibraryExportModal();
            toast(`已导出 ${String(res.format || format).toUpperCase()}（${res.cueCount || 0} 条）`);
            if (res.path) {
                try { await electron?.showInFolder?.(res.path); } catch { /* ignore */ }
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function libraryDeleteVersion(versionId) {
        const ok = await libraryConfirm({
            title: '删除版本',
            message: '确定彻底删除该版本？\n\n此操作不可恢复，托管副本也会被清理。\n当前版或已发布版需先取消标记后再删。',
            okLabel: '删除',
            danger: true,
        });
        if (!ok) return;
        const res = await electron?.transubLibraryDeleteVersion?.({ versionId });
        if (!res?.ok) {
            toast(res?.error || '删除失败', 'err');
            return;
        }
        toast('已删除版本', 'info');
        if (state.selectedMediaId) await loadLibraryMediaDetail(state.selectedMediaId);
        else await refreshLibraryList();
    }

    async function libraryDeleteMedia(mediaIdOrIds) {
        const ids = Array.isArray(mediaIdOrIds)
            ? mediaIdOrIds.map((id) => String(id || '').trim()).filter(Boolean)
            : [String(mediaIdOrIds || '').trim()].filter(Boolean);
        if (!ids.length) {
            toast('请先勾选作品', 'warn');
            return;
        }
        const titles = ids
            .map((id) => findLibraryItem(id))
            .map((m) => m?.title || basenamePath(m?.path) || '')
            .filter(Boolean);
        const titleHint = titles.length === 1
            ? `「${titles[0]}」`
            : (titles.length ? `「${titles[0]}」等 ${ids.length} 部` : `${ids.length} 部作品`);
        const ok = await libraryConfirm({
            title: ids.length > 1 ? '批量删除作品' : '删除作品',
            message: `确定从字幕库删除 ${titleHint}？\n\n将移除其全部轨道与版本，并清理库内托管副本。\n不会删除磁盘上的音视频或旁路字幕文件。\n此操作不可恢复。`,
            okLabel: ids.length > 1 ? `删除 ${ids.length} 部` : '删除作品',
            danger: true,
        });
        if (!ok) return;
        const res = await electron?.transubLibraryDeleteMedia?.(
            ids.length === 1 ? { mediaId: ids[0] } : { mediaIds: ids },
        );
        if (!res?.ok) {
            toast(res?.error || '删除失败', 'err');
            return;
        }
        const deletedIds = new Set(
            ids.length === 1
                ? [ids[0]]
                : (Array.isArray(res.results) ? res.results.filter((r) => r.ok).map((r) => r.mediaId) : ids),
        );
        for (const id of deletedIds) state.checkedIds.delete(id);
        if (state.selectedMediaId && deletedIds.has(state.selectedMediaId)) {
            closeLibraryDetail();
            state.selectedMediaId = '';
        }
        if (ids.length > 1) {
            const fail = Number(res.failed) || 0;
            toast(
                fail
                    ? `已删除 ${res.deleted || 0} 部，失败 ${fail} 部`
                    : `已删除 ${res.deleted || deletedIds.size} 部作品`,
                fail ? 'warn' : 'info',
            );
        } else {
            toast('已删除作品', 'info');
        }
        await refreshLibraryList(state.selectedMediaId || '');
    }

    async function libraryExportPack(mediaIdOrIds) {
        if (!state.caps?.publishPack) {
            promptProLibrary();
            return;
        }
        const ids = Array.isArray(mediaIdOrIds)
            ? mediaIdOrIds.map((id) => String(id || '').trim()).filter(Boolean)
            : [String(mediaIdOrIds || '').trim()].filter(Boolean);
        if (!ids.length) {
            toast('请先勾选作品', 'warn');
            return;
        }
        const res = await electron?.transubLibraryExportPack?.(
            ids.length === 1 ? { mediaId: ids[0] } : { mediaIds: ids },
        );
        if (res?.canceled) return;
        if (!res?.ok) {
            if (res?.proRequired) promptProLibrary();
            else toast(res?.error || '导出发布包失败', 'err');
            return;
        }
        if (ids.length > 1) {
            toast(`已导出 ${res.mediaCount || ids.length} 部作品（${res.count || 0} 个文件）`);
        } else {
            toast(`已导出发布包 ${res.count} 个文件`);
        }
        if (res.dir) electron?.openPath?.(res.dir);
    }

    async function libraryBatchCopyPaths() {
        const items = getCheckedItems();
        const paths = items.map((m) => m.path).filter(Boolean);
        if (!paths.length) {
            toast('没有可复制的路径', 'warn');
            return;
        }
        await copyText(paths.join('\n'), `已复制 ${paths.length} 条路径`);
    }

    async function libraryBatchRevealFolders() {
        const items = getCheckedItems();
        const paths = [...new Set(items.map((m) => String(m.path || '').trim()).filter(Boolean))];
        if (!paths.length) {
            toast('所选作品均无音视频路径', 'warn');
            return;
        }
        await libraryRevealPath(paths[0]);
        toast(`已打开文件夹 · ${paths.length} 部作品有路径`, 'info');
    }

    async function libraryExportAbGroup(mediaId) {
        if (!state.caps?.versionDiff && !state.caps?.publishPack) {
            promptProLibrary();
            return;
        }
        const res = await electron?.transubLibraryExportTags?.({
            mediaId,
            tags: ['对照A', '对照B'],
        });
        if (res?.canceled) return;
        if (!res?.ok) {
            if (res?.proRequired) promptProLibrary();
            else toast(res?.error || '导出对照组失败', 'err');
            return;
        }
        toast(`已导出对照组 ${res.count} 个文件`);
        if (res.dir) electron?.openPath?.(res.dir);
    }

    async function libraryExportCorpus() {
        if (!state.caps?.corpusExport) {
            promptProLibrary();
            return;
        }
        const res = await electron?.transubLibraryExportCorpus?.({});
        if (res?.canceled) return;
        if (!res?.ok) {
            if (res?.proRequired) promptProLibrary();
            else toast(res?.error || '导出语料失败', 'err');
            return;
        }
        toast(`已导出语料 ${res.count} 条`);
    }

    function syncLibraryRerunPresetEnabled() {
        const usePreset = !!document.getElementById('libraryRerunPreset')?.checked;
        const sel = document.getElementById('libraryRerunPresetSelect');
        if (sel) sel.disabled = !usePreset;
        syncLibraryRerunPresetDescription();
    }

    function syncLibraryRerunPresetDescription() {
        const descEl = document.getElementById('libraryRerunPresetDesc');
        if (!descEl) return;
        const usePreset = !!document.getElementById('libraryRerunPreset')?.checked;
        if (!usePreset) {
            descEl.textContent = '';
            return;
        }
        const sel = document.getElementById('libraryRerunPresetSelect');
        const opt = sel?.selectedOptions?.[0];
        const desc = String(opt?.dataset?.description || opt?.title || '').trim();
        descEl.textContent = (sel?.value && desc) ? desc : '';
    }

    async function fillLibraryRerunPresets() {
        const sel = document.getElementById('libraryRerunPresetSelect');
        if (!sel) return;
        try {
            const res = await electron?.transWithAiGetPresets?.();
            const presets = Array.isArray(res?.presets) ? res.presets : [];
            sel.innerHTML = '';
            if (!presets.length) {
                const empty = document.createElement('option');
                empty.value = '';
                empty.textContent = '（无可用预设）';
                sel.appendChild(empty);
                syncLibraryRerunPresetDescription();
                return;
            }
            const groupOrder = [];
            const buckets = new Map();
            for (const p of presets) {
                const group = String(p.group || '其他').trim() || '其他';
                if (!buckets.has(group)) {
                    buckets.set(group, []);
                    groupOrder.push(group);
                }
                buckets.get(group).push(p);
            }
            for (const group of groupOrder) {
                const rows = buckets.get(group) || [];
                const og = document.createElement('optgroup');
                og.label = group;
                for (const p of rows) {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = String(p.name || p.id) + (p.builtin ? '（内置）' : '');
                    const desc = String(p.sceneBlurb || p.description || '').trim();
                    if (desc) {
                        opt.title = desc;
                        opt.dataset.description = desc;
                    }
                    og.appendChild(opt);
                }
                sel.appendChild(og);
            }
            syncLibraryRerunPresetDescription();
        } catch {
            sel.innerHTML = '<option value="">（加载失败）</option>';
            syncLibraryRerunPresetDescription();
        }
    }

    async function openLibraryRerunModal(versionId, recipeSummary) {
        if (!state.caps?.recipeRerun) {
            promptProLibrary();
            return;
        }
        state.rerunVersionId = versionId || '';
        state.rerunRecipeSummary = recipeSummary || '';
        const summary = document.getElementById('libraryRerunSummary');
        if (summary) {
            summary.textContent = recipeSummary
                ? `将基于库中原文重新翻译。\n当前配方：${recipeSummary}`
                : '将基于库中原文重新翻译（跳过听写）。';
        }
        const same = document.getElementById('libraryRerunSame');
        if (same) same.checked = true;
        await fillLibraryRerunPresets();
        syncLibraryRerunPresetEnabled();
        document.getElementById('libraryRerunModal')?.classList.remove('hidden');
    }

    async function confirmLibraryRerun() {
        const versionId = state.rerunVersionId;
        if (!versionId) return;
        const usePreset = !!document.getElementById('libraryRerunPreset')?.checked;
        const presetId = usePreset
            ? String(document.getElementById('libraryRerunPresetSelect')?.value || '').trim()
            : '';
        if (usePreset && !presetId) {
            toast('请选择预设方案', 'warn');
            return;
        }
        const btn = document.getElementById('libraryRerunConfirmBtn');
        if (btn) btn.disabled = true;
        try {
            const prepared = await electron?.transubLibraryPrepareRerun?.({ versionId, presetId });
            if (!prepared?.ok) {
                if (prepared?.proRequired) promptProLibrary();
                else toast(prepared?.error || '准备再跑失败', 'err');
                return;
            }
            document.getElementById('libraryRerunModal')?.classList.add('hidden');
            const started = await electron?.transubLibraryStartRetranslate?.({
                mediaPath: prepared.mediaPath,
                sourcePath: prepared.sourcePath,
                keptPath: prepared.keptPath,
                destPath: prepared.destPath,
                hints: prepared.hints,
                recipe: prepared.recipe || null,
                recipeSummary: prepared.hints?.recipeSummary || state.rerunRecipeSummary,
                sourceVersionId: prepared.sourceVersionId,
                seedVersionId: prepared.seedVersionId,
            });
            if (!started?.ok) {
                toast(started?.error || '无法转到主窗口重新翻译', 'err');
                return;
            }
            state.pendingRerunMediaId = state.selectedMediaId;
            toast('已转到主窗口确认重新翻译 · 完成后库会自动刷新', 'info');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function closeLibraryMoreMenus(except = null) {
        document.querySelectorAll('details.lib-more[open]').forEach((el) => {
            if (except && el === except) return;
            el.open = false;
            el.classList.remove('is-up');
        });
    }

    function positionLibraryMoreMenu(details) {
        if (!details?.open) {
            details?.classList.remove('is-up');
            return;
        }
        const panel = details.querySelector('.lib-more-panel');
        if (!panel) return;
        details.classList.remove('is-up');
        const rect = panel.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 8) {
            details.classList.add('is-up');
        }
    }

    function closeLibraryModals() {
        document.getElementById('libraryDiffModal')?.classList.add('hidden');
        document.getElementById('libraryRerunModal')?.classList.add('hidden');
        closeLibraryPreviewModal();
        closeLibraryNoteModal();
        closeLibraryRenameModal();
        closeLibraryExportModal();
        closeLibraryConfirmModal(false);
        closeLibraryPlayerModal();
    }

    function isTypingTarget(el) {
        const tag = String(el?.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
    }

    function bindUi() {
        document.getElementById('libraryRefreshBtn')?.addEventListener('click', () => {
            void refreshLibraryList(state.detailOpen ? state.selectedMediaId : '');
        });
        document.getElementById('libraryFilterToggleBtn')?.addEventListener('click', () => {
            setFiltersOpen(!state.filtersOpen);
        });
        document.getElementById('libraryClearFiltersBtn')?.addEventListener('click', () => {
            clearLibraryFilters();
        });
        document.getElementById('libraryFiltersProBtn')?.addEventListener('click', () => {
            promptProLibrary();
        });
        document.getElementById('libraryCloseDetailBtn')?.addEventListener('click', () => {
            closeLibraryDetail();
        });
        document.querySelector('.lib-quick-filters')?.addEventListener('click', (e) => {
            const moreBtn = e.target.closest('#libraryMoreFiltersBtn');
            if (moreBtn) {
                e.preventDefault();
                const panel = document.getElementById('libraryMoreFilters');
                if (!panel) return;
                const open = panel.hasAttribute('hidden');
                if (open) {
                    panel.removeAttribute('hidden');
                    panel.classList.add('is-open');
                } else {
                    panel.setAttribute('hidden', '');
                    panel.classList.remove('is-open');
                }
                moreBtn.classList.toggle('is-on', open);
                moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
                return;
            }
            const btn = e.target.closest('[data-library-quick]');
            if (!btn) return;
            e.preventDefault();
            setQuickFilter(btn.getAttribute('data-library-quick'));
            // Keep more panel open if an advanced chip is active
            const key = btn.getAttribute('data-library-quick');
            const advanced = new Set(['source', 'target', 'bilingual', 'media-missing']);
            if (advanced.has(key) && state.quickFilter === key) {
                const panel = document.getElementById('libraryMoreFilters');
                const moreBtnEl = document.getElementById('libraryMoreFiltersBtn');
                panel?.removeAttribute('hidden');
                panel?.classList.add('is-open');
                moreBtnEl?.classList.add('is-on');
                moreBtnEl?.setAttribute('aria-expanded', 'true');
            }
        });
        document.getElementById('libraryMediaTable')?.querySelector('thead')?.addEventListener('click', (e) => {
            if (e.target.closest('[data-resize-col], #librarySelectAllCheck, .col-check')) return;
            const th = e.target.closest('th.lib-col-sortable');
            if (!th) return;
            e.preventDefault();
            setLibrarySort(th.getAttribute('data-sort-key'));
        });
        document.getElementById('librarySelectAllCheck')?.addEventListener('change', (e) => {
            selectAllVisible(!!e.target.checked);
        });
        document.getElementById('libraryBatchExportPackBtn')?.addEventListener('click', () => {
            void libraryExportPack([...state.checkedIds]);
        });
        document.getElementById('libraryBatchAutoLinkBtn')?.addEventListener('click', () => {
            void libraryAutoLinkMediaBatch([...state.checkedIds]);
        });
        document.getElementById('libraryBatchCopyPathsBtn')?.addEventListener('click', () => {
            void libraryBatchCopyPaths();
        });
        document.getElementById('libraryBatchRevealBtn')?.addEventListener('click', () => {
            void libraryBatchRevealFolders();
        });
        document.getElementById('libraryBatchDeleteBtn')?.addEventListener('click', () => {
            void libraryDeleteMedia([...state.checkedIds]);
        });
        document.getElementById('libraryBatchClearBtn')?.addEventListener('click', () => {
            clearLibraryChecks();
        });
        document.getElementById('libraryRepairMediaBtn')?.addEventListener('click', () => {
            void libraryAutoLinkMediaBatch(null, { allMissing: true });
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#libraryRowContextMenu')) closeLibraryContextMenu();
            if (e.target.closest('details.lib-more')) return;
            closeLibraryMoreMenus();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
                e.preventDefault();
                document.getElementById('librarySearchInput')?.focus();
                document.getElementById('librarySearchInput')?.select?.();
                return;
            }
            if ((e.key === 'j' || e.key === 'ArrowDown') && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
                e.preventDefault();
                closeLibraryContextMenu();
                if (isLibraryPlayerFocused()) switchPlayingVersion(1);
                else moveMediaSelection(1);
                return;
            }
            if ((e.key === 'k' || e.key === 'ArrowUp') && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
                e.preventDefault();
                closeLibraryContextMenu();
                if (isLibraryPlayerFocused()) switchPlayingVersion(-1);
                else moveMediaSelection(-1);
                return;
            }
            if ((e.key === '[' || e.key === ']') && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
                if (!state.detailOpen) return;
                e.preventDefault();
                closeLibraryContextMenu();
                switchPlayingVersion(e.key === ']' ? 1 : -1);
                return;
            }
            if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey) && !isTypingTarget(e.target)) {
                e.preventDefault();
                selectAllVisible(true);
                return;
            }
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
                if (!state.selectedMediaId) return;
                e.preventDefault();
                closeLibraryContextMenu();
                openSelectedMediaSubtitle();
                return;
            }
            if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
                if (ensureLibraryPlayer()?.isOpen?.()) {
                    e.preventDefault();
                    closeLibraryContextMenu();
                    ensureLibraryPlayer()?.togglePlay?.();
                    return;
                }
                if (!state.selectedMediaId) return;
                e.preventDefault();
                closeLibraryContextMenu();
                if (state.detailOpen) return;
                state.compareA = '';
                state.compareTrackId = '';
                void loadLibraryMediaDetail(state.selectedMediaId);
                return;
            }
            if (e.key !== 'Escape') return;
            const playerOpen = !!ensureLibraryPlayer()?.isOpen?.();
            const noteOpen = !document.getElementById('libraryNoteModal')?.classList.contains('hidden');
            const renameOpen = !document.getElementById('libraryRenameModal')?.classList.contains('hidden');
            const exportOpen = !document.getElementById('libraryExportModal')?.classList.contains('hidden');
            const confirmOpen = !document.getElementById('libraryConfirmModal')?.classList.contains('hidden');
            const diffOpen = !document.getElementById('libraryDiffModal')?.classList.contains('hidden');
            const previewOpen = !document.getElementById('libraryPreviewModal')?.classList.contains('hidden');
            const rerunOpen = !document.getElementById('libraryRerunModal')?.classList.contains('hidden');
            const ctxOpen = !document.getElementById('libraryRowContextMenu')?.classList.contains('hidden');
            if (playerOpen) {
                e.preventDefault();
                closeLibraryPlayerModal();
                return;
            }
            if (noteOpen || renameOpen || exportOpen || confirmOpen || diffOpen || previewOpen || rerunOpen) {
                e.preventDefault();
                closeLibraryModals();
                return;
            }
            if (ctxOpen) {
                e.preventDefault();
                closeLibraryContextMenu();
                return;
            }
            closeLibraryMoreMenus();
            if (state.checkedIds.size) {
                e.preventDefault();
                clearLibraryChecks();
                return;
            }
            if (state.detailOpen) {
                e.preventDefault();
                closeLibraryDetail();
            }
        });
        let searchTimer = null;
        document.getElementById('librarySearchInput')?.addEventListener('input', () => {
            syncFilterPanelUi();
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => { void refreshLibraryList(); }, 200);
        });
        for (const id of ['libraryFilterPreset', 'libraryFilterMt', 'libraryFilterTag']) {
            document.getElementById(id)?.addEventListener('change', () => {
                syncFilterPanelUi();
                void refreshLibraryList();
            });
        }
        document.getElementById('libraryListEmpty')?.addEventListener('click', (e) => {
            if (e.target.closest('[data-library-clear-filters]')) {
                e.preventDefault();
                clearLibraryFilters();
            }
        });
        document.getElementById('libraryMediaList')?.addEventListener('click', (e) => {
            const check = e.target.closest('[data-library-check]');
            if (check) {
                e.stopPropagation();
                const id = check.getAttribute('data-library-check') || '';
                setRowChecked(id, !!check.checked, { range: !!e.shiftKey });
                return;
            }
            if (e.target.closest('td.col-check')) {
                e.stopPropagation();
                return;
            }
            const openPref = e.target.closest('[data-library-open-preferred]');
            if (openPref) {
                e.preventDefault();
                e.stopPropagation();
                if (openPref.disabled) return;
                const vid = openPref.getAttribute('data-library-open-preferred') || '';
                if (vid) void libraryOpenVersion(vid);
                else toast('没有可打开的当前字幕', 'warn');
                return;
            }
            const reveal = e.target.closest('[data-library-reveal-path]');
            if (reveal) {
                e.preventDefault();
                e.stopPropagation();
                void libraryRevealPath(reveal.getAttribute('data-library-reveal-path') || '');
                return;
            }
            const row = e.target.closest('tr[data-library-media]');
            if (!row) return;
            const id = row.getAttribute('data-library-media');
            if (state.selectedMediaId === id && state.detailOpen) {
                closeLibraryDetail();
                return;
            }
            state.compareA = '';
            state.compareTrackId = '';
            void loadLibraryMediaDetail(id);
        });
        document.getElementById('libraryMediaList')?.addEventListener('change', (e) => {
            const check = e.target.closest('[data-library-check]');
            if (!check) return;
            const id = check.getAttribute('data-library-check') || '';
            // click handler already updated for mouse; keep change for keyboard toggle
            if (state.checkedIds.has(id) === !!check.checked) return;
            setRowChecked(id, !!check.checked, { range: false });
        });
        document.getElementById('libraryMediaList')?.addEventListener('dblclick', (e) => {
            if (e.target.closest('button, a, input, summary')) return;
            const row = e.target.closest('tr[data-library-media]');
            if (!row) return;
            e.preventDefault();
            const id = row.getAttribute('data-library-media');
            state.selectedMediaId = id;
            renderLibraryMediaList(state.allItems);
            const item = findLibraryItem(id);
            if (item?.preferredOpenVersionId) void libraryOpenVersion(item.preferredOpenVersionId);
            else toast('没有可打开的当前字幕', 'warn');
        });
        document.getElementById('libraryMediaList')?.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('tr[data-library-media]');
            if (!row) return;
            e.preventDefault();
            const id = row.getAttribute('data-library-media');
            state.selectedMediaId = id;
            renderLibraryMediaList(state.allItems);
            openLibraryContextMenu(id, e.clientX, e.clientY);
        });
        document.getElementById('libraryRowContextMenu')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-lib-ctx]');
            if (!btn || btn.disabled) return;
            e.preventDefault();
            void runLibraryContextAction(btn.getAttribute('data-lib-ctx'));
        });
        document.getElementById('libraryDetail')?.addEventListener('click', (e) => {
            const clearBtn = e.target.closest('[data-library-clear-filters]');
            if (clearBtn) {
                e.preventDefault();
                clearLibraryFilters();
                return;
            }
            const trackTab = e.target.closest('[data-library-track-tab]');
            if (trackTab) {
                e.preventDefault();
                const role = String(trackTab.getAttribute('data-library-track-tab') || '').trim();
                if (!role || role === state.detailTrackTab) return;
                state.detailTrackTab = role;
                if (state.lastDetail) renderLibraryDetail(state.lastDetail);
                return;
            }
            const more = e.target.closest('details.lib-more');
            if (more && e.target.closest('summary')) {
                setTimeout(() => {
                    closeLibraryMoreMenus(more.open ? more : null);
                    if (more.open) positionLibraryMoreMenu(more);
                }, 0);
            }
            if (e.target.closest('.lib-more-panel .lib-btn')) {
                const host = e.target.closest('details.lib-more');
                if (host) {
                    host.open = false;
                    host.classList.remove('is-up');
                }
            }
            const proLock = e.target.closest('[data-pro-lock]');
            if (proLock && !state.caps?.libraryPro) {
                e.preventDefault();
                promptProLibrary();
                return;
            }
            const previewBtn = e.target.closest('[data-library-preview]');
            if (previewBtn) {
                e.preventDefault();
                if (previewBtn.disabled) return;
                void libraryPreviewVersion(previewBtn.getAttribute('data-library-preview'));
                return;
            }
            const playBtn = e.target.closest('[data-library-play]');
            if (playBtn) {
                e.preventDefault();
                if (playBtn.disabled) return;
                void libraryPlayVersion(playBtn.getAttribute('data-library-play'));
                return;
            }
            const openBtn = e.target.closest('[data-library-open]');
            if (openBtn) {
                e.preventDefault();
                if (openBtn.disabled) return;
                void libraryOpenVersion(openBtn.getAttribute('data-library-open'));
                return;
            }
            const openPrefBtn = e.target.closest('[data-library-open-preferred]');
            if (openPrefBtn) {
                e.preventDefault();
                if (openPrefBtn.disabled) return;
                const vid = openPrefBtn.getAttribute('data-library-open-preferred') || '';
                if (vid) void libraryOpenVersion(vid);
                else toast('没有可打开的当前字幕', 'warn');
                return;
            }
            const clearPending = e.target.closest('[data-library-clear-pending-rerun]');
            if (clearPending) {
                e.preventDefault();
                state.pendingRerunMediaId = '';
                if (state.selectedMediaId) void loadLibraryMediaDetail(state.selectedMediaId);
                return;
            }
            const renameBtn = e.target.closest('[data-library-rename-media]');
            if (renameBtn) {
                e.preventDefault();
                void libraryRenameMedia(renameBtn.getAttribute('data-library-rename-media') || '');
                return;
            }
            const deleteMediaBtn = e.target.closest('[data-library-delete-media]');
            if (deleteMediaBtn) {
                e.preventDefault();
                void libraryDeleteMedia(deleteMediaBtn.getAttribute('data-library-delete-media') || '');
                return;
            }
            const activeBtn = e.target.closest('[data-library-active]');
            if (activeBtn && !activeBtn.disabled) {
                e.preventDefault();
                void librarySetActive(activeBtn.getAttribute('data-library-active'));
                return;
            }
            const noteBtn = e.target.closest('[data-library-note]');
            if (noteBtn) {
                e.preventDefault();
                void libraryEditNote(
                    noteBtn.getAttribute('data-library-note'),
                    noteBtn.getAttribute('data-note') || '',
                );
                return;
            }
            const abTagBtn = e.target.closest('[data-library-ab-tag]');
            if (abTagBtn) {
                e.preventDefault();
                void librarySetAbTag(
                    abTagBtn.getAttribute('data-library-ab-tag'),
                    abTagBtn.getAttribute('data-ab') || '',
                );
                return;
            }
            const trainBtn = e.target.closest('[data-library-mt-train]');
            if (trainBtn) {
                e.preventDefault();
                void libraryStartMtTrain(trainBtn.getAttribute('data-library-mt-train'));
                return;
            }
            const openMediaBtn = e.target.closest('[data-library-open-media]');
            if (openMediaBtn && !openMediaBtn.disabled) {
                e.preventDefault();
                void libraryOpenMedia(openMediaBtn.getAttribute('data-library-open-media') || '');
                return;
            }
            const linkMediaBtn = e.target.closest('[data-library-link-media]');
            if (linkMediaBtn) {
                e.preventDefault();
                void libraryLinkMedia(linkMediaBtn.getAttribute('data-library-link-media') || '');
                return;
            }
            const autoLinkBtn = e.target.closest('[data-library-auto-link-media]');
            if (autoLinkBtn) {
                e.preventDefault();
                void libraryAutoLinkMedia(autoLinkBtn.getAttribute('data-library-auto-link-media') || '');
                return;
            }
            const clearMediaBtn = e.target.closest('[data-library-clear-media]');
            if (clearMediaBtn) {
                e.preventDefault();
                void libraryClearMedia(clearMediaBtn.getAttribute('data-library-clear-media') || '');
                return;
            }
            const revealPathBtn = e.target.closest('[data-library-reveal-path]');
            if (revealPathBtn) {
                e.preventDefault();
                void libraryRevealPath(revealPathBtn.getAttribute('data-library-reveal-path') || '');
                return;
            }
            const copyPathBtn = e.target.closest('[data-library-copy-path]');
            if (copyPathBtn) {
                e.preventDefault();
                void copyText(copyPathBtn.getAttribute('data-library-copy-path') || '', '已复制音视频路径');
                return;
            }
            const revealVerBtn = e.target.closest('[data-library-reveal-version]');
            if (revealVerBtn && !revealVerBtn.disabled) {
                e.preventDefault();
                void libraryRevealVersion(revealVerBtn.getAttribute('data-library-reveal-version'));
                return;
            }
            const copyVerBtn = e.target.closest('[data-library-copy-version]');
            if (copyVerBtn && !copyVerBtn.disabled) {
                e.preventDefault();
                void libraryCopyVersionPath(copyVerBtn.getAttribute('data-library-copy-version'));
                return;
            }
            const cmpBtn = e.target.closest('[data-library-compare]');
            if (cmpBtn) {
                e.preventDefault();
                void libraryCompareVersion(
                    cmpBtn.getAttribute('data-library-compare'),
                    cmpBtn.getAttribute('data-library-track'),
                );
                return;
            }
            const pubBtn = e.target.closest('[data-library-publish]');
            if (pubBtn) {
                e.preventDefault();
                void libraryTogglePublish(
                    pubBtn.getAttribute('data-library-publish'),
                    pubBtn.getAttribute('data-published') === '1',
                );
                return;
            }
            const exportBtn = e.target.closest('[data-library-export]');
            if (exportBtn && !exportBtn.disabled) {
                e.preventDefault();
                openLibraryExportModal(exportBtn.getAttribute('data-library-export'));
                return;
            }
            const delBtn = e.target.closest('[data-library-delete]');
            if (delBtn && !delBtn.disabled) {
                e.preventDefault();
                void libraryDeleteVersion(delBtn.getAttribute('data-library-delete'));
                return;
            }
            const abDiffBtn = e.target.closest('[data-library-ab-diff]');
            if (abDiffBtn) {
                e.preventDefault();
                void libraryDiffAbPair(abDiffBtn.getAttribute('data-library-ab-diff'));
                return;
            }
            const rerunBtn = e.target.closest('[data-library-rerun]');
            if (rerunBtn) {
                e.preventDefault();
                void openLibraryRerunModal(
                    rerunBtn.getAttribute('data-library-rerun'),
                    rerunBtn.getAttribute('data-recipe') || '',
                );
                return;
            }
            // Click empty area of a version row → 试看
            if (e.target.closest('button, a, input, summary, details, .lib-more-panel')) return;
            const verRow = e.target.closest('[data-library-version]');
            if (verRow) {
                const vid = verRow.getAttribute('data-library-version') || '';
                const playBtn = verRow.querySelector('[data-library-play]');
                if (vid && playBtn && !playBtn.disabled) {
                    e.preventDefault();
                    void libraryPlayVersion(vid);
                }
            }
        });

        document.getElementById('libraryDetail')?.addEventListener('dblclick', (e) => {
            if (e.target.closest('button, a, input, summary, details, .lib-more-panel')) return;
            const verRow = e.target.closest('[data-library-version]');
            if (!verRow) return;
            const vid = verRow.getAttribute('data-library-version') || '';
            if (!vid) return;
            e.preventDefault();
            void libraryOpenVersion(vid);
        });

        document.getElementById('closeLibraryDiffBtn')?.addEventListener('click', () => {
            document.getElementById('libraryDiffModal')?.classList.add('hidden');
        });
        document.getElementById('libraryDiffModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'libraryDiffModal') e.currentTarget.classList.add('hidden');
        });
        document.getElementById('closeLibraryPreviewBtn')?.addEventListener('click', () => {
            closeLibraryPreviewModal();
        });
        document.getElementById('libraryPreviewCloseFootBtn')?.addEventListener('click', () => {
            closeLibraryPreviewModal();
        });
        document.getElementById('libraryPreviewOpenBtn')?.addEventListener('click', () => {
            const vid = state.previewVersionId;
            closeLibraryPreviewModal();
            if (vid) void libraryOpenVersion(vid);
        });
        document.getElementById('libraryPreviewModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'libraryPreviewModal') closeLibraryPreviewModal();
        });
        document.getElementById('closeLibraryRerunBtn')?.addEventListener('click', () => {
            document.getElementById('libraryRerunModal')?.classList.add('hidden');
        });
        document.getElementById('libraryRerunCancelBtn')?.addEventListener('click', () => {
            document.getElementById('libraryRerunModal')?.classList.add('hidden');
        });
        document.getElementById('libraryRerunModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'libraryRerunModal') e.currentTarget.classList.add('hidden');
        });
        document.getElementById('libraryRerunSame')?.addEventListener('change', syncLibraryRerunPresetEnabled);
        document.getElementById('libraryRerunPreset')?.addEventListener('change', syncLibraryRerunPresetEnabled);
        document.getElementById('libraryRerunPresetSelect')?.addEventListener('change', syncLibraryRerunPresetDescription);
        document.getElementById('libraryRerunConfirmBtn')?.addEventListener('click', () => {
            void confirmLibraryRerun();
        });

        document.getElementById('closeLibraryNoteBtn')?.addEventListener('click', () => {
            closeLibraryNoteModal();
        });
        document.getElementById('libraryNoteCancelBtn')?.addEventListener('click', () => {
            closeLibraryNoteModal();
        });
        document.getElementById('libraryNoteConfirmBtn')?.addEventListener('click', () => {
            void confirmLibraryNote();
        });
        document.getElementById('libraryNoteInput')?.addEventListener('input', syncLibraryNoteCount);
        document.getElementById('libraryNoteModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'libraryNoteModal') closeLibraryNoteModal();
        });
        document.getElementById('libraryNoteInput')?.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void confirmLibraryNote();
            }
        });

        document.getElementById('closeLibraryRenameBtn')?.addEventListener('click', () => {
            closeLibraryRenameModal();
        });
        document.getElementById('libraryRenameCancelBtn')?.addEventListener('click', () => {
            closeLibraryRenameModal();
        });
        document.getElementById('libraryRenameConfirmBtn')?.addEventListener('click', () => {
            void confirmLibraryRename();
        });
        document.getElementById('libraryRenameModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'libraryRenameModal') closeLibraryRenameModal();
        });
        document.getElementById('libraryRenameInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void confirmLibraryRename();
            }
        });

        document.getElementById('closeLibraryExportBtn')?.addEventListener('click', () => {
            closeLibraryExportModal();
        });
        document.getElementById('libraryExportCancelBtn')?.addEventListener('click', () => {
            closeLibraryExportModal();
        });
        document.getElementById('libraryExportConfirmBtn')?.addEventListener('click', () => {
            void confirmLibraryExport();
        });
        document.getElementById('libraryExportModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'libraryExportModal') closeLibraryExportModal();
        });

        document.getElementById('closeLibraryConfirmBtn')?.addEventListener('click', () => {
            closeLibraryConfirmModal(false);
        });
        document.getElementById('libraryConfirmCancelBtn')?.addEventListener('click', () => {
            closeLibraryConfirmModal(false);
        });
        document.getElementById('libraryConfirmOkBtn')?.addEventListener('click', () => {
            acceptLibraryConfirm();
        });
        document.getElementById('libraryConfirmModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'libraryConfirmModal') closeLibraryConfirmModal(false);
        });

        electron?.onTransubLibraryFocusMedia?.((payload) => {
            const id = String(payload?.mediaId || '').trim();
            const versionId = String(payload?.versionId || '').trim();
            if (versionId) state.focusVersionId = versionId;
            if (payload?.missing && !id) {
                toast('未在字幕库中找到该作品（可能尚未入库）', 'warn');
                void refreshLibraryList();
                return;
            }
            if (id) {
                void refreshLibraryList(id);
                return;
            }
            if (versionId && state.selectedMediaId) {
                void loadLibraryMediaDetail(state.selectedMediaId);
            }
        });
        electron?.onTransubLibraryCatalogChanged?.((payload) => {
            // Debounce: association + ingest can fire close together (double full refresh).
            if (state.catalogRefreshTimer) clearTimeout(state.catalogRefreshTimer);
            state.catalogRefreshTimer = setTimeout(() => {
                state.catalogRefreshTimer = 0;
                const prefer = state.pendingRerunMediaId
                    || (state.detailOpen ? state.selectedMediaId : '')
                    || String(payload?.mediaId || '').trim();
                void (async () => {
                    const pending = state.pendingRerunMediaId;
                    await refreshLibraryList(prefer);
                    if (pending && state.allItems.some((m) => m.id === pending)) {
                        toast('库已更新（再跑结果可能已入库）', 'info');
                        state.pendingRerunMediaId = '';
                        await loadLibraryMediaDetail(pending);
                    }
                })();
            }, 180);
        });
    }

    function initialMediaIdFromQuery() {
        try {
            return String(new URLSearchParams(location.search).get('mediaId') || '').trim();
        } catch {
            return '';
        }
    }

    function initialVersionIdFromQuery() {
        try {
            return String(new URLSearchParams(location.search).get('versionId') || '').trim();
        } catch {
            return '';
        }
    }

    function initialMissingFromQuery() {
        try {
            return new URLSearchParams(location.search).get('missing') === '1';
        } catch {
            return false;
        }
    }

    async function init() {
        if (!electron?.isDesktop) {
            document.body.innerHTML = '<p style="padding:2rem">字幕库仅在桌面版可用。</p>';
            return;
        }
        await hydrateLibraryTheme();
        try {
            electron?.onAppThemeChanged?.((payload) => {
                applyLibraryTheme(payload?.theme === 'dark' ? 'dark' : 'light');
            });
        } catch { /* ignore */ }
        loadSavedListSort();
        loadSavedColWidths();
        applySavedDetailWidth();
        applyLibraryColWidths();
        syncLibrarySortHeaders();
        syncFilterPanelUi();
        syncBatchBar();
        bindUi();
        bindDetailSplitter();
        bindLibraryColResize();
        bindLibraryMediaDrop();
        const focusVersionId = initialVersionIdFromQuery();
        if (focusVersionId) state.focusVersionId = focusVersionId;
        const focusMediaId = initialMediaIdFromQuery();
        if (initialMissingFromQuery() && !focusMediaId) {
            toast('未在字幕库中找到该作品（可能尚未入库）', 'warn');
        }
        await refreshLibraryList(focusMediaId);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void init(); });
    } else {
        void init();
    }

    global.TransubSubtitleLibraryUi = {
        refresh: refreshLibraryList,
        open: openLibraryRerunModal,
    };
}(window));
