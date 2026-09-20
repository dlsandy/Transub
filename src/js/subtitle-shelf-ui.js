/**
 * Subtitle shelf UI — embedded factory workspace or standalone window.
 * Queue-like chrome: command bar + filter tabs + cards/table + right detail tabs with cue preview.
 */
(function (global) {
    const electron = global.__ELECTRON__;
    const core = global.TransubSubtitleShelfCore || {};

    const VIEW_KEY = 'transub.shelf.view';
    const FILTER_KEY = 'transub.shelf.filter';
    const SECONDARY_KEY = 'transub.shelf.secondaryFilter';
    const DETAIL_WIDTH_KEY = 'transub.shelf.detailWidth';

    const state = {
        items: [],
        selectedId: '',
        query: '',
        detail: null,
        status: null,
        filter: 'all',
        secondary: 'all',
        view: 'cards',
        detailWidth: core.DEFAULT_DETAIL_WIDTH || 420,
        activeTabId: 'transcript',
        previewByKey: Object.create(null),
        previewLoadingKey: '',
        bound: false,
        loadedOnce: false,
        splitterBound: false,
    };

    function $(id) {
        return document.getElementById(id);
    }

    function isEmbedded() {
        return !!$('workspaceShelf') && !!document.body?.classList;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatTime(iso) {
        const s = String(iso || '').trim();
        if (!s) return '';
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) return s;
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function formatCueTime(ms) {
        if (typeof core.formatCueTime === 'function') return core.formatCueTime(ms);
        return '—';
    }

    function setStatusLine(text) {
        const el = $('shelfStatusLine');
        if (el) el.textContent = text || '';
    }

    function filteredItems() {
        if (typeof core.filterShelfItems === 'function') {
            return core.filterShelfItems(state.items, state.filter, state.secondary);
        }
        return state.items.slice();
    }

    function syncFilterCounts() {
        const counts = typeof core.countShelfFilters === 'function'
            ? core.countShelfFilters(state.items)
            : { all: state.items.length, translated: 0, missing: 0 };
        const set = (id, n) => {
            const el = $(id);
            if (el) el.textContent = String(n || 0);
        };
        set('shelfTabAllCount', counts.all);
        set('shelfTabTranslatedCount', counts.translated);
        set('shelfTabMissingCount', counts.missing);

        const sec = typeof core.countShelfSecondaryFilters === 'function'
            ? core.countShelfSecondaryFilters(state.items, state.filter)
            : { all: counts.all, transcript: 0, original: 0, 'zh-Hans': 0, 'zh-Hant': 0, en: 0, ko: 0, ja: 0 };
        set('shelfSecAllCount', sec.all);
        set('shelfSecTranscriptCount', sec.transcript);
        set('shelfSecOriginalCount', sec.original);
        set('shelfSecZhHansCount', sec['zh-Hans']);
        set('shelfSecZhHantCount', sec['zh-Hant']);
        set('shelfSecEnCount', sec.en);
        set('shelfSecKoCount', sec.ko);
        set('shelfSecJaCount', sec.ja);
    }

    function syncFilterTabsUi() {
        document.querySelectorAll('[data-shelf-filter]').forEach((btn) => {
            const on = btn.getAttribute('data-shelf-filter') === state.filter;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.querySelectorAll('[data-shelf-secondary]').forEach((btn) => {
            const on = btn.getAttribute('data-shelf-secondary') === state.secondary;
            btn.classList.toggle('is-on', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function syncViewToggleUi() {
        const cards = state.view === 'cards';
        $('shelfViewCardsBtn')?.classList.toggle('is-active', cards);
        $('shelfViewTableBtn')?.classList.toggle('is-active', !cards);
        $('shelfViewCardsBtn')?.setAttribute('aria-pressed', cards ? 'true' : 'false');
        $('shelfViewTableBtn')?.setAttribute('aria-pressed', cards ? 'false' : 'true');
        $('shelfCardList')?.classList.toggle('hidden', !cards);
        $('shelfTableScroll')?.classList.toggle('hidden', cards);
    }

    function clampDetailWidth(width, hostWidth) {
        if (typeof core.clampShelfDetailWidth === 'function') {
            return core.clampShelfDetailWidth(width, hostWidth);
        }
        const min = core.MIN_DETAIL_WIDTH || 280;
        const w = Number(width);
        return Math.max(min, Number.isFinite(w) ? Math.round(w) : (core.DEFAULT_DETAIL_WIDTH || 420));
    }

    function shelfBodyEl() {
        return document.querySelector('#workspaceShelf .shelf-body');
    }

    function applyDetailWidth(width) {
        const body = shelfBodyEl();
        const hostW = body?.getBoundingClientRect().width || 0;
        const next = clampDetailWidth(width, hostW);
        state.detailWidth = next;
        const detail = $('shelfDetail');
        if (detail) detail.style.setProperty('--shelf-detail-width', `${next}px`);
        const splitter = $('shelfDetailSplitter');
        if (splitter) {
            splitter.setAttribute('aria-valuenow', String(next));
            splitter.setAttribute('aria-valuemin', String(core.MIN_DETAIL_WIDTH || 280));
            if (hostW > 0) {
                const max = Math.max(
                    core.MIN_DETAIL_WIDTH || 280,
                    hostW - (core.MIN_LIST_WIDTH || 240) - (core.DETAIL_SPLITTER_WIDTH || 6),
                );
                splitter.setAttribute('aria-valuemax', String(Math.round(max)));
            }
        }
        return next;
    }

    function persistDetailWidth(width) {
        const next = applyDetailWidth(width);
        try {
            localStorage.setItem(DETAIL_WIDTH_KEY, String(next));
        } catch { /* ignore */ }
        return next;
    }

    function syncDetailOpen() {
        const body = shelfBodyEl();
        const open = !!state.selectedId;
        body?.classList.toggle('is-detail-open', open);
        const splitter = $('shelfDetailSplitter');
        if (splitter) {
            if (open) splitter.removeAttribute('hidden');
            else splitter.setAttribute('hidden', '');
        }
        if (open) applyDetailWidth(state.detailWidth);
    }

    function bindDetailSplitter() {
        const splitter = $('shelfDetailSplitter');
        const body = shelfBodyEl();
        const detail = $('shelfDetail');
        if (!splitter || !body || !detail || state.splitterBound) return;
        state.splitterBound = true;

        const beginDrag = (clientX) => {
            if (!state.selectedId) return;
            const startX = clientX;
            const startW = detail.getBoundingClientRect().width || state.detailWidth;
            const hostW = body.getBoundingClientRect().width;
            splitter.classList.add('is-dragging');
            body.classList.add('is-splitting');

            const onMove = (ev) => {
                const x = ev.touches?.[0]?.clientX ?? ev.clientX;
                if (!Number.isFinite(x)) return;
                // Dragging splitter left enlarges the detail pane.
                const next = clampDetailWidth(startW + (startX - x), hostW);
                applyDetailWidth(next);
            };
            const onUp = (ev) => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                window.removeEventListener('touchmove', onMove);
                window.removeEventListener('touchend', onUp);
                window.removeEventListener('touchcancel', onUp);
                splitter.classList.remove('is-dragging');
                body.classList.remove('is-splitting');
                const x = ev?.changedTouches?.[0]?.clientX ?? ev?.clientX;
                const hostNow = body.getBoundingClientRect().width;
                if (Number.isFinite(x)) {
                    persistDetailWidth(clampDetailWidth(startW + (startX - x), hostNow));
                } else {
                    persistDetailWidth(clampDetailWidth(
                        detail.getBoundingClientRect().width || startW,
                        hostNow,
                    ));
                }
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onUp);
            window.addEventListener('touchcancel', onUp);
        };

        splitter.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            beginDrag(e.clientX);
        });
        splitter.addEventListener('touchstart', (e) => {
            const t = e.touches?.[0];
            if (!t) return;
            e.preventDefault();
            beginDrag(t.clientX);
        }, { passive: false });
        splitter.addEventListener('dblclick', () => {
            persistDetailWidth(core.DEFAULT_DETAIL_WIDTH || 420);
        });
        splitter.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const hostW = body.getBoundingClientRect().width;
            const step = e.shiftKey ? 48 : 16;
            const delta = e.key === 'ArrowLeft' ? step : -step;
            persistDetailWidth(clampDetailWidth(state.detailWidth + delta, hostW));
        });
        window.addEventListener('resize', () => {
            if (state.selectedId) applyDetailWidth(state.detailWidth);
        });
    }

    function syncEmptyState() {
        const empty = $('shelfEmptyState');
        const has = state.items.length > 0;
        empty?.classList.toggle('hidden', has);
        if (!has) {
            $('shelfCardList') && ($('shelfCardList').innerHTML = '');
            const list = $('shelfList');
            if (list) list.innerHTML = '';
        }
    }

    async function refreshStatus() {
        try {
            const res = await electron?.transubShelfStatus?.();
            state.status = res;
            if (res?.ok) {
                setStatusLine(`${res.mediaCount || 0} 部 · ${res.translationCount || 0} 条译文`);
            } else {
                setStatusLine(res?.error || '状态不可用');
            }
        } catch (err) {
            setStatusLine(err?.message || '状态失败');
        }
    }

    async function refreshList({ keepSelection = true } = {}) {
        try {
            const res = await electron?.transubShelfList?.({ query: state.query });
            state.items = Array.isArray(res?.items) ? res.items : [];
            if (!keepSelection || !state.items.some((it) => it.id === state.selectedId)) {
                state.selectedId = state.items[0]?.id || '';
            }
            syncFilterCounts();
            renderList();
            if (state.selectedId) await loadDetail(state.selectedId);
            else {
                state.detail = null;
                renderDetail();
            }
            await refreshStatus();
            state.loadedOnce = true;
        } catch (err) {
            state.items = [];
            syncFilterCounts();
            renderList();
            setStatusLine(err?.message || '加载失败');
        }
    }

    async function loadDetail(mediaId) {
        const id = String(mediaId || '').trim();
        if (!id) {
            state.detail = null;
            renderDetail();
            return;
        }
        try {
            const res = await electron?.transubShelfGetMedia?.({ mediaId: id });
            state.detail = res?.ok ? res.media : null;
            if (!res?.ok) setStatusLine(res?.error || '详情加载失败');
            const tabs = core.buildShelfSlotTabs?.(state.detail) || [];
            if (!tabs.some((t) => t.id === state.activeTabId)) {
                state.activeTabId = tabs[0]?.id || 'transcript';
            }
            renderDetail();
            void loadPreviewForActiveTab();
        } catch (err) {
            state.detail = null;
            renderDetail();
            setStatusLine(err?.message || '详情失败');
        }
    }

    function selectMedia(id) {
        state.selectedId = String(id || '');
        renderList();
        void loadDetail(state.selectedId);
    }

    function chipsHtml(it) {
        const chips = (it.translationLabels || [])
            .map((l) => `<span class="shelf-chip">${escapeHtml(l)}</span>`)
            .join('');
        return chips || '<span class="shelf-meta">无译文</span>';
    }

    function renderCards(items) {
        const host = $('shelfCardList');
        if (!host) return;
        if (!items.length) {
            host.innerHTML = state.items.length
                ? '<div class="shelf-detail-empty">当前筛选无条目</div>'
                : '';
            return;
        }
        host.innerHTML = items.map((it) => {
            const missing = it.mediaExists === false;
            const active = it.id === state.selectedId;
            const hasTr = Number(it.translationCount) > 0 || (it.translationLabels || []).length > 0;
            const cls = [
                'shelf-card',
                active ? 'is-active' : '',
                missing ? 'is-missing' : '',
                hasTr ? 'has-translation' : '',
            ].filter(Boolean).join(' ');
            return `
                <button type="button" class="${cls}" data-id="${escapeHtml(it.id)}" aria-selected="${active ? 'true' : 'false'}">
                    <span class="shelf-card-stripe" aria-hidden="true"></span>
                    <span class="shelf-card-main">
                        <div class="shelf-card-title">${escapeHtml(it.title || it.id)}</div>
                        <div class="shelf-card-meta">
                            ${chipsHtml(it)}
                            ${missing ? '<span class="shelf-flag is-warn">视频缺失</span>' : ''}
                        </div>
                    </span>
                    <span class="shelf-card-side">${escapeHtml(formatTime(it.updatedAt))}</span>
                </button>`;
        }).join('');
        host.querySelectorAll('.shelf-card').forEach((btn) => {
            btn.addEventListener('click', () => selectMedia(btn.getAttribute('data-id') || ''));
        });
    }

    function renderTable(items) {
        const host = $('shelfList');
        if (!host) return;
        if (!items.length) {
            host.innerHTML = state.items.length
                ? '<div class="shelf-detail-empty">当前筛选无条目</div>'
                : '';
            return;
        }
        const rows = items.map((it) => {
            const missing = it.mediaExists === false
                ? '<span class="shelf-flag is-warn">视频缺失</span>'
                : '';
            const active = it.id === state.selectedId ? ' is-active' : '';
            return `
                <tr class="shelf-row${active}" data-id="${escapeHtml(it.id)}" tabindex="0" role="row" aria-selected="${it.id === state.selectedId ? 'true' : 'false'}">
                    <td class="shelf-col-title">
                        <div class="shelf-row-title">${escapeHtml(it.title || it.id)}</div>
                        ${missing}
                    </td>
                    <td class="shelf-col-langs"><div class="shelf-chips">${chipsHtml(it)}</div></td>
                    <td class="shelf-col-time"><span class="shelf-meta">${escapeHtml(formatTime(it.updatedAt))}</span></td>
                    <td class="shelf-col-actions">
                        <button type="button" class="shelf-btn" data-row-act="focus" data-id="${escapeHtml(it.id)}">详情</button>
                    </td>
                </tr>`;
        }).join('');
        host.innerHTML = `
            <table class="shelf-table factory-task-table" role="grid" aria-label="字幕库列表">
                <thead>
                    <tr>
                        <th class="shelf-col-title">媒体</th>
                        <th class="shelf-col-langs">译文</th>
                        <th class="shelf-col-time">更新</th>
                        <th class="shelf-col-actions"></th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
        host.querySelectorAll('.shelf-row').forEach((row) => {
            const activate = () => selectMedia(row.getAttribute('data-id') || '');
            row.addEventListener('click', (e) => {
                if (e.target?.closest?.('[data-row-act]')) return;
                activate();
            });
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activate();
                }
            });
        });
        host.querySelectorAll('[data-row-act="focus"]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectMedia(btn.getAttribute('data-id') || '');
            });
        });
    }

    function renderList() {
        syncFilterTabsUi();
        syncViewToggleUi();
        syncEmptyState();
        const items = filteredItems();
        if (state.view === 'cards') renderCards(items);
        else renderTable(items);
        syncDetailOpen();
    }

    function activeTabMeta() {
        const tabs = core.buildShelfSlotTabs?.(state.detail) || [];
        return tabs.find((t) => t.id === state.activeTabId) || tabs[0] || null;
    }

    function slotActionsHtml(tab) {
        if (!tab || !tab.path) return '';
        const slot = tab.slot;
        const lang = tab.lang || '';
        const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
        const translateBtn = (slot === 'transcript' || slot === 'original')
            ? `<button type="button" class="shelf-btn shelf-btn-primary" data-act="translate" data-slot="${escapeHtml(slot)}" title="跳过语音识别，按当前设置翻译并执行清除与 QC">从${slot === 'transcript' ? '转录' : '原文'}翻译</button>`
            : '';
        const delBtn = slot === 'translation' && lang
            ? `<button type="button" class="shelf-btn shelf-btn-danger" data-act="del-tr" data-lang="${escapeHtml(lang)}">删除译文</button>`
            : '';
        return `
            ${translateBtn}
            <button type="button" class="shelf-btn" data-act="edit" data-slot="${escapeHtml(slot)}"${langAttr}>打开编辑器</button>
            <button type="button" class="shelf-btn" data-act="reveal" data-slot="${escapeHtml(slot)}"${langAttr}>在文件夹中显示</button>
            ${delBtn}`;
    }

    function renderCuePreview(preview, loading) {
        if (loading) {
            return '<div class="shelf-detail-empty">加载预览…</div>';
        }
        if (!preview) {
            return '<div class="shelf-detail-empty">暂无预览</div>';
        }
        if (preview.ok === false) {
            return `<div class="shelf-detail-empty">${escapeHtml(preview.error || '预览失败')}</div>`;
        }
        const cues = Array.isArray(preview.cues) ? preview.cues : [];
        if (!cues.length) {
            return '<div class="shelf-detail-empty">该槽位无字幕条目</div>';
        }
        const rows = cues.map((c) => `
            <div class="shelf-cue-row">
                <span class="shelf-cue-time">${escapeHtml(formatCueTime(c.startMs))}</span>
                <span class="shelf-cue-text">${escapeHtml(c.text || '')}</span>
            </div>`).join('');
        const meta = `${preview.cueCount || cues.length} 条`
            + (preview.format ? ` · ${String(preview.format).toUpperCase()}` : '')
            + (preview.truncated ? ` · 仅显示前 ${cues.length} 条` : '');
        return `
            <div class="shelf-cue-preview">${rows}</div>
            <div class="shelf-cue-meta">${escapeHtml(meta)}</div>`;
    }

    function renderDetail() {
        const host = $('shelfDetail');
        if (!host) return;
        const m = state.detail;
        syncDetailOpen();
        if (!m || !state.selectedId) {
            host.setAttribute('data-empty', 'true');
            host.innerHTML = '<div class="shelf-detail-empty">选择左侧条目查看转录 / 原文 / 译文预览。</div>';
            return;
        }
        host.setAttribute('data-empty', 'false');
        const mediaMissing = m.mediaExists === false;
        const tabs = core.buildShelfSlotTabs?.(m) || [];
        const tab = tabs.find((t) => t.id === state.activeTabId) || tabs[0];
        const tabId = tab?.id || 'transcript';
        state.activeTabId = tabId;
        const key = core.previewKey?.(state.selectedId, tab?.slot, tab?.lang) || '';
        const loading = state.previewLoadingKey === key;
        const preview = key ? state.previewByKey[key] : null;

        let pathHtml = '<div class="shelf-slot-path missing">未收录</div>';
        if (tab?.path) {
            const gone = tab.exists === false;
            pathHtml = `<div class="shelf-slot-path ${gone ? 'gone' : ''}" title="${escapeHtml(tab.path)}">${escapeHtml(tab.path)}${gone ? ' （文件不存在）' : ''}</div>`;
        }

        const tabsHtml = tabs.map((t) => {
            const empty = !t.path;
            const on = t.id === tabId;
            return `<button type="button" class="shelf-slot-tab${on ? ' is-active' : ''}${empty ? ' is-empty' : ''}" data-tab-id="${escapeHtml(t.id)}" role="tab" aria-selected="${on ? 'true' : 'false'}">${escapeHtml(t.label)}</button>`;
        }).join('');

        host.innerHTML = `
            <div class="shelf-detail-head">
                <div class="min-w-0 flex-1">
                    <p class="shelf-detail-title" title="${escapeHtml(m.title || m.id)}">${escapeHtml(m.title || m.id)}${mediaMissing ? ' <span class="shelf-flag is-warn">视频缺失</span>' : ''}</p>
                </div>
                <div class="detail-actions" role="toolbar" aria-label="媒体操作">
                    <button type="button" class="shelf-icon-btn" data-act="play" title="播放" aria-label="播放"${(!m.mediaPath || mediaMissing) ? ' disabled' : ''}>
                        <i class="fa fa-play" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="shelf-icon-btn" data-act="burn" title="字幕烧录" aria-label="字幕烧录"${(!m.mediaPath || mediaMissing) ? ' disabled' : ''}>
                        <i class="fa fa-fire" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="shelf-icon-btn" data-act="associate" title="关联视频" aria-label="关联视频">
                        <i class="fa fa-link" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="shelf-icon-btn" data-act="scan" title="扫描旁路字幕" aria-label="扫描旁路字幕"${!m.mediaPath ? ' disabled' : ''}>
                        <i class="fa fa-search" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="shelf-icon-btn shelf-icon-btn-danger" data-act="delete" title="删除条目" aria-label="删除条目">
                        <i class="fa fa-trash-o" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="shelf-icon-btn" data-act="reveal-media" title="打开视频所在文件夹" aria-label="打开视频所在文件夹"${!m.mediaPath ? ' disabled' : ''}>
                        <i class="fa fa-folder-open" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
            <div class="shelf-slot-tabs" role="tablist" aria-label="字幕槽位">${tabsHtml}</div>
            <div class="shelf-slot-panel">
                <div class="shelf-slot-toolbar">
                    ${pathHtml}
                    ${slotActionsHtml(tab)}
                </div>
                ${tab?.path ? renderCuePreview(preview, loading) : '<div class="shelf-detail-empty">该槽位尚未收录字幕。</div>'}
            </div>
        `;

        host.querySelectorAll('[data-tab-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.activeTabId = btn.getAttribute('data-tab-id') || 'transcript';
                renderDetail();
                void loadPreviewForActiveTab();
            });
        });
        host.querySelectorAll('[data-act]').forEach((btn) => {
            btn.addEventListener('click', () => {
                void handleAction(btn.getAttribute('data-act'), {
                    slot: btn.getAttribute('data-slot') || '',
                    lang: btn.getAttribute('data-lang') || '',
                });
            });
        });
    }

    async function loadPreviewForActiveTab() {
        const tab = activeTabMeta();
        if (!tab?.path || !state.selectedId) return;
        const key = core.previewKey?.(state.selectedId, tab.slot, tab.lang) || '';
        if (!key) return;
        if (state.previewByKey[key]) {
            renderDetail();
            return;
        }
        state.previewLoadingKey = key;
        renderDetail();
        try {
            const res = await electron?.transubShelfPreviewSlot?.({
                mediaId: state.selectedId,
                slot: tab.slot,
                lang: tab.lang || '',
            });
            state.previewByKey[key] = res || { ok: false, error: '预览失败' };
        } catch (err) {
            state.previewByKey[key] = { ok: false, error: err?.message || '预览失败' };
        } finally {
            if (state.previewLoadingKey === key) state.previewLoadingKey = '';
            renderDetail();
        }
    }

    async function resolveSlotPath(slot, lang) {
        return electron?.transubShelfOpenSlot?.({
            mediaId: state.selectedId,
            slot,
            lang,
        });
    }

    async function revealShelfRoot() {
        try {
            const res = await electron?.transubShelfStatus?.();
            if (!res?.ok || !res.root) {
                setStatusLine(res?.error || '无法定位字幕库目录');
                return;
            }
            await electron?.showInFolder?.(res.root);
            setStatusLine(`已打开：${res.root}`);
        } catch (err) {
            setStatusLine(err?.message || '打开失败');
        }
    }

    function isDualLangTag(lang, label) {
        const a = String(lang || '').trim().toLowerCase();
        const b = String(label || '').trim().toLowerCase();
        return a === 'dual' || a === 'bilingual' || a.includes('dual')
            || b.includes('dual') || b.includes('双语');
    }

    function buildBurnPayloadFromDetail(detail, tab) {
        const videoPath = String(detail?.mediaPath || '').trim();
        if (!videoPath || detail?.mediaExists === false) return null;
        const originalPath = (detail.original?.path && detail.original.exists !== false)
            ? String(detail.original.path).trim()
            : '';
        const transcriptPath = (detail.transcript?.path && detail.transcript.exists !== false)
            ? String(detail.transcript.path).trim()
            : '';
        const translations = (Array.isArray(detail.translations) ? detail.translations : [])
            .filter((t) => t?.path && t.exists !== false);
        let subtitlePath = '';
        let bilingualSubtitlePath = '';
        const dualHit = translations.find((t) => isDualLangTag(t.lang, t.label));
        if (dualHit) bilingualSubtitlePath = String(dualHit.path).trim();
        if (tab?.path && tab.exists !== false) {
            const tabPath = String(tab.path).trim();
            if (tab.slot === 'translation') {
                if (isDualLangTag(tab.lang, tab.label)) bilingualSubtitlePath = tabPath;
                else subtitlePath = tabPath;
            } else {
                subtitlePath = tabPath;
            }
        }
        if (!subtitlePath) {
            const nonDual = translations.find((t) => !isDualLangTag(t.lang, t.label));
            if (nonDual) subtitlePath = String(nonDual.path).trim();
        }
        if (!subtitlePath && !bilingualSubtitlePath) {
            subtitlePath = originalPath || transcriptPath;
        }
        return {
            videoPath,
            subtitlePath,
            bilingualSubtitlePath,
            sourceSubtitlePath: originalPath,
            path: videoPath,
        };
    }

    async function handleAction(act, { slot = '', lang = '' } = {}) {
        const mediaId = state.selectedId;
        if (!mediaId && act !== 'associate') return;

        try {
            if (act === 'play') {
                const detail = state.detail;
                const mediaPath = String(detail?.mediaPath || '').trim();
                if (!mediaPath || detail?.mediaExists === false) {
                    setStatusLine('视频不可用');
                    return;
                }
                const tab = activeTabMeta();
                let sub = '';
                if (tab?.path && tab.exists !== false) sub = tab.path;
                else if (detail.original?.path && detail.original.exists !== false) sub = detail.original.path;
                else if (detail.transcript?.path && detail.transcript.exists !== false) sub = detail.transcript.path;
                else {
                    const tr = (detail.translations || []).find((t) => t?.path && t.exists !== false);
                    if (tr) sub = tr.path;
                }
                const q = new URLSearchParams();
                q.set('media', mediaPath);
                if (sub) q.set('sub', sub);
                const url = `transub://open?${q.toString()}`;
                if (electron?.openExternal) {
                    await electron.openExternal(url);
                } else if (electron?.openPath) {
                    await electron.openPath(mediaPath);
                } else {
                    setStatusLine('无法打开播放器');
                }
                return;
            }
            if (act === 'burn') {
                const payload = buildBurnPayloadFromDetail(state.detail, activeTabMeta());
                if (!payload) {
                    setStatusLine('视频不可用');
                    return;
                }
                const open = global.TransubFactoryWorkspace?.openBurn;
                if (typeof open !== 'function') {
                    setStatusLine('烧录入口不可用');
                    return;
                }
                setStatusLine('已提交至字幕烧录…');
                open(payload);
                return;
            }
            if (act === 'reveal-media') {
                const mediaPath = String(state.detail?.mediaPath || '').trim();
                if (!mediaPath) {
                    setStatusLine('未关联视频');
                    return;
                }
                await electron?.showInFolder?.(mediaPath);
                return;
            }
            if (act === 'translate') {
                const detail = state.detail;
                if (!detail) {
                    setStatusLine('请先选择媒体');
                    return;
                }
                const slotKey = slot === 'transcript' ? 'transcript' : 'original';
                const entry = slotKey === 'transcript' ? detail.transcript : detail.original;
                if (!entry?.path || entry.exists === false) {
                    setStatusLine(slotKey === 'transcript' ? '转录字幕不可用' : '原文字幕不可用');
                    return;
                }
                const open = global.TransubFactoryWorkspace?.openShelfTranslate;
                if (typeof open !== 'function') {
                    setStatusLine('主窗口翻译入口不可用');
                    return;
                }
                setStatusLine(slotKey === 'transcript' ? '准备从转录翻译…' : '准备从原文翻译…');
                const res = await open({ mediaDetail: detail, sourceSlot: slotKey });
                if (res?.ok === false) {
                    setStatusLine(res.error || '无法开始翻译');
                }
                return;
            }
            if (act === 'edit') {
                const res = await resolveSlotPath(slot, lang);
                if (!res?.ok) {
                    setStatusLine(res?.error || '无法打开');
                    return;
                }
                await electron?.transubOpenSubtitleEditor?.({
                    subPath: res.path,
                    videoPath: res.videoPath || '',
                    mediaPath: res.videoPath || '',
                });
                return;
            }
            if (act === 'reveal') {
                const res = await resolveSlotPath(slot, lang);
                if (!res?.ok) {
                    setStatusLine(res?.error || '无法定位');
                    return;
                }
                await electron?.showInFolder?.(res.path);
                return;
            }
            if (act === 'del-tr') {
                if (!window.confirm(`删除译文条目「${lang}」？仅移除库内记录，不删文件。`)) return;
                const res = await electron?.transubShelfDeleteTranslation?.({ mediaId, lang });
                if (!res?.ok) setStatusLine(res?.error || '删除失败');
                else {
                    state.previewByKey = Object.create(null);
                    await refreshList();
                }
                return;
            }
            if (act === 'delete') {
                if (!window.confirm('删除该媒体条目？仅移除库内记录，不删旁路字幕文件。')) return;
                const res = await electron?.transubShelfDeleteMedia?.({ mediaId });
                if (!res?.ok) setStatusLine(res?.error || '删除失败');
                else {
                    state.selectedId = '';
                    state.previewByKey = Object.create(null);
                    await refreshList({ keepSelection: false });
                }
                return;
            }
            if (act === 'associate') {
                const pick = await electron?.transubSelectEditorVideo?.({});
                if (pick?.canceled) return;
                const mediaPath = pick?.path || pick?.filePaths?.[0] || '';
                if (!mediaPath) {
                    setStatusLine(pick?.error || '未选择视频');
                    return;
                }
                if (mediaId) {
                    const res = await electron?.transubShelfSetMediaPath?.({ mediaId, mediaPath });
                    if (!res?.ok) setStatusLine(res?.error || '关联失败');
                    else {
                        state.previewByKey = Object.create(null);
                        await refreshList();
                    }
                } else {
                    const scan = await electron?.transubShelfScanMedia?.({ mediaPath });
                    if (!scan?.ok) setStatusLine(scan?.error || '扫描失败');
                    else {
                        state.selectedId = scan.mediaId || '';
                        state.previewByKey = Object.create(null);
                        await refreshList();
                    }
                }
                return;
            }
            if (act === 'scan') {
                const mediaPath = state.detail?.mediaPath || '';
                if (!mediaPath) {
                    setStatusLine('请先关联视频');
                    return;
                }
                const res = await electron?.transubShelfScanMedia?.({ mediaPath });
                if (!res?.ok) setStatusLine(res?.error || '扫描失败');
                else {
                    state.previewByKey = Object.create(null);
                    await refreshList();
                }
            }
        } catch (err) {
            setStatusLine(err?.message || '操作失败');
        }
    }

    async function focusMedia({ mediaId = '', mediaPath = '' } = {}) {
        if (mediaId) {
            state.selectedId = mediaId;
            await refreshList();
            return;
        }
        const want = String(mediaPath || '').trim().toLowerCase().replace(/\\/g, '/');
        if (!want) return;
        await refreshList();
        const hit = state.items.find((it) => {
            const p = String(it.mediaPath || '').toLowerCase().replace(/\\/g, '/');
            return p === want || p.endsWith(want) || want.endsWith(p);
        });
        if (hit) {
            state.selectedId = hit.id;
            renderList();
            await loadDetail(hit.id);
        }
    }

    async function applyTheme() {
        if ($('workspaceShelf') && document.getElementById('filePanel')) return;
        try {
            const res = await electron?.transubGetAppTheme?.();
            const theme = String(res?.theme || res || '').toLowerCase();
            document.body.classList.toggle('theme-dark', theme === 'dark');
        } catch { /* optional */ }
    }

    function loadPrefs() {
        try {
            const v = localStorage.getItem(VIEW_KEY);
            if (v === 'table' || v === 'cards') state.view = v;
            const f = localStorage.getItem(FILTER_KEY);
            if (f === 'all' || f === 'translated' || f === 'missing') state.filter = f;
            const sec = localStorage.getItem(SECONDARY_KEY);
            if (typeof core.normalizeShelfSecondary === 'function') {
                state.secondary = core.normalizeShelfSecondary(sec);
            } else if (sec) {
                state.secondary = sec;
            }
            const w = Number(localStorage.getItem(DETAIL_WIDTH_KEY));
            if (Number.isFinite(w) && w > 0) {
                state.detailWidth = clampDetailWidth(w);
            }
        } catch { /* ignore */ }
    }

    function savePrefs() {
        try {
            localStorage.setItem(VIEW_KEY, state.view);
            localStorage.setItem(FILTER_KEY, state.filter);
            localStorage.setItem(SECONDARY_KEY, state.secondary);
            localStorage.setItem(DETAIL_WIDTH_KEY, String(state.detailWidth));
        } catch { /* ignore */ }
    }

    function setFilter(next) {
        state.filter = String(next || 'all');
        savePrefs();
        syncFilterCounts();
        renderList();
    }

    function setSecondary(next) {
        state.secondary = typeof core.normalizeShelfSecondary === 'function'
            ? core.normalizeShelfSecondary(next)
            : String(next || 'all');
        savePrefs();
        renderList();
    }

    function setView(next) {
        state.view = next === 'table' ? 'table' : 'cards';
        savePrefs();
        renderList();
    }

    function bind() {
        if (state.bound) return;
        if (!$('shelfList') || !$('shelfDetail')) return;
        state.bound = true;
        loadPrefs();
        applyDetailWidth(state.detailWidth);
        bindDetailSplitter();

        $('shelfRefreshBtn')?.addEventListener('click', () => { void refreshList(); });
        $('shelfEmptyAssociateBtn')?.addEventListener('click', () => { void handleAction('associate'); });
        $('shelfEmptyRevealBtn')?.addEventListener('click', () => { void revealShelfRoot(); });

        let searchTimer = null;
        $('shelfSearch')?.addEventListener('input', (e) => {
            state.query = String(e.target?.value || '');
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => { void refreshList(); }, 200);
        });

        document.querySelectorAll('[data-shelf-filter]').forEach((btn) => {
            btn.addEventListener('click', () => setFilter(btn.getAttribute('data-shelf-filter') || 'all'));
        });
        document.querySelectorAll('[data-shelf-secondary]').forEach((btn) => {
            btn.addEventListener('click', () => setSecondary(btn.getAttribute('data-shelf-secondary') || 'all'));
        });
        $('shelfViewCardsBtn')?.addEventListener('click', () => setView('cards'));
        $('shelfViewTableBtn')?.addEventListener('click', () => setView('table'));

        electron?.onTransubShelfFocusMedia?.((payload) => {
            void focusMedia(payload || {});
        });
        electron?.onTransubShelfCatalogChanged?.(() => {
            state.previewByKey = Object.create(null);
            void refreshList();
        });
    }

    async function onWorkspaceShow(opts = {}) {
        bind();
        await applyTheme();
        syncViewToggleUi();
        syncFilterTabsUi();
        const mediaId = String(opts?.mediaId || '').trim();
        const mediaPath = String(opts?.mediaPath || '').trim();
        if (mediaId || mediaPath) {
            await focusMedia(opts);
            return;
        }
        await refreshList({ keepSelection: state.loadedOnce });
    }

    function onWorkspaceHide() {
        /* keep list in memory; refresh on next show */
    }

    function init() {
        if (!$('shelfList')) return;
        bind();
        if ($('filePanel')) {
            // Lazy-load when factory switches to shelf workspace.
            return;
        }
        void applyTheme();
        void refreshList({ keepSelection: false });
    }

    global.TransubSubtitleShelfUi = {
        init,
        refreshList,
        focusMedia,
        onWorkspaceShow,
        onWorkspaceHide,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}(window));
