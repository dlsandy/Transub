/**
 * Manual .whl download / local pip install dialog (GPU / Demucs / SenseVoice fallback).
 */
(function (global) {
    const electron = global.__ELECTRON__;

    const state = {
        open: false,
        loading: false,
        loadToken: 0,
        kind: 'gpu',
        kinds: ['gpu'],
        paths: [],
        info: null,
        installing: false,
        errorText: '',
        formPayload: null,
        resolve: null,
    };

    function $(id) {
        return document.getElementById(id);
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

    function normalizeKind(kind) {
        const k = String(kind || 'gpu').trim().toLowerCase();
        if (k === 'demucs') return 'demucs';
        if (k === 'sensevoice' || k === 'sensevoice-runtime' || k === 'runtime') return 'sensevoice';
        if (k === 'whisper' || k === 'whisper-runtime') return 'whisper';
        return 'gpu';
    }

    function kindTitle(kind, kinds) {
        const list = Array.isArray(kinds) && kinds.length
            ? kinds.map(normalizeKind)
            : [normalizeKind(kind)];
        if (list.length > 1) return '手动下载运行库 / GPU 组件';
        const k = list[0];
        if (k === 'demucs') return '手动安装 Demucs / PyTorch';
        if (k === 'sensevoice') return '手动安装 SenseVoice 运行库';
        if (k === 'whisper') return '手动安装 Whisper 运行库';
        return '手动安装 GPU 组件';
    }

    function kindLabel(kind) {
        if (kind === 'demucs') return 'Demucs';
        if (kind === 'sensevoice') return 'SenseVoice 运行库';
        if (kind === 'whisper') return 'Whisper 运行库';
        return 'GPU 支持';
    }

    function pickTitle(kind, kinds) {
        const list = Array.isArray(kinds) && kinds.length ? kinds : [kind];
        if (list.length > 1) return '选择已下载的 .whl（可多选）';
        const k = normalizeKind(kind);
        if (k === 'demucs') return '选择 Demucs / torch 的 .whl（可多选）';
        if (k === 'sensevoice') return '选择 torch / funasr 等 .whl（可多选）';
        if (k === 'whisper') return '选择 numpy / ctranslate2 / onnxruntime / faster-whisper 的 .whl（可多选）';
        return '选择 GPU 组件 .whl（可多选）';
    }

    function confirmFn() {
        return global.TransubAppConfirm || ((msg) => Promise.resolve(window.confirm(String(msg?.message || msg || ''))));
    }

    function renderPackages() {
        const host = $('manualWhlPackageList');
        if (!host) return;
        const items = Array.isArray(state.info?.items) ? state.info.items : [];
        if (!items.length) {
            host.innerHTML = '<p class="text-xs text-gray-500">暂无镜像清单，请自行在浏览器搜索对应包的 win_amd64 .whl。</p>';
            return;
        }
        host.innerHTML = items.map((item) => {
            const url = item.defaultUrl || item.mirrorUrl || item.officialUrl || '';
            const fileName = item.fileName
                || (/\.whl(?:#|$)/i.test(url) ? String(url).split('/').pop().split('#')[0] : '');
            const isDirectWhl = /\.whl(?:#|$)/i.test(url);
            const btnLabel = isDirectWhl ? '下载文件' : '打开镜像';
            const sub = fileName || item.id || '';
            const group = item.group || kindLabel(item.kind || state.kind);
            return `
                <div class="flex items-start justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
                    <div class="min-w-0">
                        <p class="text-[10px] text-violet-700 font-medium">${esc(group)}</p>
                        <p class="text-sm font-medium text-gray-800 truncate">${esc(item.name || item.id)}</p>
                        <p class="text-[11px] text-gray-500 font-mono truncate" title="${esc(sub)}">${esc(sub)}</p>
                    </div>
                    <button type="button" class="manual-whl-open shrink-0 px-2.5 py-1 border rounded-md text-xs hover:bg-gray-50"
                        data-url="${esc(url)}" ${url ? '' : 'disabled'}>${esc(btnLabel)}</button>
                </div>`;
        }).join('');
    }

    function renderPaths() {
        const host = $('manualWhlPathList');
        const empty = $('manualWhlPathEmpty');
        if (!host) return;
        if (!state.paths.length) {
            host.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (empty) empty.classList.add('hidden');
        host.innerHTML = state.paths.map((p, idx) => `
            <div class="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
                <span class="text-xs font-mono text-gray-700 truncate" title="${esc(p)}">${esc(basename(p))}</span>
                <button type="button" class="manual-whl-remove shrink-0 text-xs text-gray-500 hover:text-red-600" data-idx="${idx}">移除</button>
            </div>`).join('');
    }

    function setStatus(message, tone = 'info') {
        const el = $('manualWhlStatus');
        if (!el) return;
        el.textContent = String(message || '');
        el.classList.remove('text-gray-500', 'text-red-600', 'text-emerald-700', 'text-amber-700');
        if (tone === 'err') el.classList.add('text-red-600');
        else if (tone === 'ok') el.classList.add('text-emerald-700');
        else if (tone === 'warn') el.classList.add('text-amber-700');
        else el.classList.add('text-gray-500');
    }

    function setBusy(busy) {
        state.installing = !!busy;
        const installBtn = $('manualWhlInstallBtn');
        const pickBtn = $('manualWhlPickBtn');
        const cancelBtn = $('manualWhlCancelBtn');
        if (installBtn) {
            installBtn.disabled = busy || state.loading || !state.paths.length;
            installBtn.textContent = busy ? '安装中…' : '安装所选文件';
        }
        if (pickBtn) pickBtn.disabled = busy || state.loading;
        if (cancelBtn) cancelBtn.disabled = busy; // keep Cancel available while loading catalog
    }

    function closeModal(result) {
        const modal = $('manualWhlModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        state.open = false;
        state.loading = false;
        state.loadToken += 1; // invalidate in-flight openModal fetches
        state.installing = false;
        const resolve = state.resolve;
        state.resolve = null;
        if (resolve) resolve(result || { ok: false, cancelled: true });
    }

    async function openModal({
        kind = 'gpu',
        kinds = null,
        errorText = '',
        formPayload = null,
        info = null,
    } = {}) {
        const modal = $('manualWhlModal');
        if (!modal) return { ok: false, error: 'no_modal' };

        // Replace any existing session instead of leaving a dangling opener.
        if (state.open || state.resolve) {
            closeModal({ ok: false, cancelled: true, replaced: true });
        }

        const kindList = Array.isArray(kinds) && kinds.length
            ? [...new Set(kinds.map(normalizeKind))]
            : [normalizeKind(kind)];
        const loadToken = state.loadToken + 1;
        state.loadToken = loadToken;

        state.open = true;
        state.loading = true;
        state.kinds = kindList;
        state.kind = kindList[0];
        state.paths = [];
        state.errorText = String(errorText || '').trim();
        state.formPayload = formPayload || {};
        state.info = info;

        const title = $('manualWhlTitle');
        const errEl = $('manualWhlError');
        const hintEl = $('manualWhlHint');
        if (title) title.textContent = kindTitle(state.kind, kindList);
        if (errEl) {
            if (state.errorText) {
                errEl.textContent = state.errorText;
                errEl.classList.remove('hidden');
            } else {
                errEl.classList.add('hidden');
            }
        }
        if (hintEl) hintEl.textContent = '正在加载下载清单…';

        // Show the dialog immediately so Cancel works during catalog fetch.
        renderPackages();
        renderPaths();
        setStatus('正在加载下载清单…', 'info');
        setBusy(false);
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        const resultPromise = new Promise((resolve) => {
            state.resolve = resolve;
        });

        if (!state.info && electron?.transubEngineDownloadInfo) {
            try {
                const mergedItems = [];
                let folder = '';
                let wheelHint = '';
                for (const k of kindList) {
                    if (state.loadToken !== loadToken || !state.open) {
                        return resultPromise;
                    }
                    const res = await electron.transubEngineDownloadInfo({
                        ...(state.formPayload || {}),
                        kind: k,
                    });
                    if (state.loadToken !== loadToken || !state.open) {
                        return resultPromise;
                    }
                    if (!res?.ok || !res.info) continue;
                    folder = folder || res.info.folder || '';
                    wheelHint = wheelHint || res.info.wheelHint || res.info.hint || '';
                    const items = Array.isArray(res.info.items) ? res.info.items : [];
                    for (const it of items) {
                        const key = `${it.id || ''}::${it.fileName || it.defaultUrl || ''}`;
                        if (mergedItems.some((x) => `${x.id || ''}::${x.fileName || x.defaultUrl || ''}` === key)) {
                            continue;
                        }
                        mergedItems.push({
                            ...it,
                            group: it.group || kindLabel(k),
                            kind: it.kind || k,
                        });
                    }
                }
                if (state.loadToken !== loadToken || !state.open) {
                    return resultPromise;
                }
                state.info = {
                    kind: kindList.length === 1 ? kindList[0] : 'bundle',
                    folder,
                    wheelHint: kindList.length > 1
                        ? '按分组下载所需 .whl（可多选后一次安装）。重复的包只需下一份。'
                        : (wheelHint || '请下载对应 .whl，再选择本地文件安装。'),
                    hint: wheelHint,
                    items: mergedItems,
                };
            } catch (_) { /* ignore */ }
        }

        if (state.loadToken !== loadToken || !state.open) {
            return resultPromise;
        }

        state.loading = false;
        if (hintEl) {
            hintEl.textContent = state.info?.wheelHint
                || state.info?.hint
                || '请在浏览器下载对应 .whl，再选择本地文件安装。';
        }
        renderPackages();
        renderPaths();
        setStatus('');
        setBusy(false);

        return resultPromise;
    }

    async function pickFiles() {
        if (!electron?.transubEnginePickWhl) {
            setStatus('当前环境不支持选择本地文件', 'err');
            return;
        }
        const res = await electron.transubEnginePickWhl({
            title: pickTitle(state.kind, state.kinds),
        });
        if (!res?.ok) {
            setStatus(res?.error || '选择文件失败', 'err');
            return;
        }
        if (res.canceled) return;
        const next = Array.isArray(res.paths) ? res.paths : [];
        const merged = [...state.paths];
        const seen = new Set(merged.map((p) => p.toLowerCase()));
        for (const p of next) {
            const key = String(p).toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(p);
        }
        state.paths = merged;
        renderPaths();
        setBusy(false);
        setStatus(state.paths.length ? `已选择 ${state.paths.length} 个文件` : '', 'info');
    }

    async function installSelected() {
        if (!state.paths.length) {
            setStatus('请先选择 .whl 文件', 'warn');
            return;
        }
        if (!electron?.transubEngineInstallLocalWheels) {
            setStatus('当前环境不支持本地安装', 'err');
            return;
        }
        setBusy(true);
        setStatus('正在本地安装，请稍候…', 'info');
        try {
            const res = await electron.transubEngineInstallLocalWheels({
                ...(state.formPayload || {}),
                kind: state.kind,
                paths: state.paths,
            });
            if (res?.cancelled) {
                setStatus('已取消安装', 'warn');
                setBusy(false);
                return;
            }
            if (!res?.ok) {
                setStatus(res?.error || '安装失败', 'err');
                setBusy(false);
                return;
            }
            setStatus(res.message || '安装完成', 'ok');
            setBusy(false);
            closeModal({
                ok: true,
                message: res.message,
                installed: res.installed,
                kind: state.kind,
                probe: res.probe,
            });
        } catch (err) {
            setStatus(err?.message || String(err), 'err');
            setBusy(false);
        }
    }

    /**
     * Ask whether to open the manual install dialog after an auto pip failure.
     * @returns {Promise<{ ok: boolean, cancelled?: boolean, skipped?: boolean, message?: string }>}
     */
    async function offerAfterFailure({
        kind = 'gpu',
        errorText = '',
        formPayload = null,
        silent = false,
    } = {}) {
        if (silent) return { ok: false, skipped: true };
        if (!electron?.transubEngineInstallLocalWheels) {
            return { ok: false, skipped: true };
        }
        const normalized = normalizeKind(kind);
        const proceed = await confirmFn()({
            title: `${kindLabel(normalized)}自动安装失败`,
            message: `${String(errorText || '网络下载失败').slice(0, 500)}\n\n是否改为手动下载 .whl，并选择本地文件安装？`,
            primaryLabel: '手动安装',
            secondaryLabel: '取消',
        });
        if (!proceed) return { ok: false, cancelled: true };
        return openModal({ kind: normalized, errorText, formPayload });
    }

    function bindOnce() {
        const modal = $('manualWhlModal');
        if (!modal || modal.dataset.bound === '1') return;
        modal.dataset.bound = '1';

        $('manualWhlCancelBtn')?.addEventListener('click', () => {
            if (state.installing) return;
            closeModal({ ok: false, cancelled: true });
        });
        $('manualWhlPickBtn')?.addEventListener('click', () => {
            if (state.loading) return;
            void pickFiles();
        });
        $('manualWhlInstallBtn')?.addEventListener('click', () => {
            if (state.loading) return;
            void installSelected();
        });
        $('manualWhlClearBtn')?.addEventListener('click', () => {
            if (state.installing || state.loading) return;
            state.paths = [];
            renderPaths();
            setBusy(false);
            setStatus('');
        });

        modal.addEventListener('click', (event) => {
            if (event.target === modal && !state.installing) {
                closeModal({ ok: false, cancelled: true });
            }
            const openBtn = event.target?.closest?.('.manual-whl-open');
            if (openBtn) {
                if (state.loading) return;
                const url = openBtn.getAttribute('data-url') || '';
                if (url && electron?.transubEngineOpenManualUrl) {
                    void electron.transubEngineOpenManualUrl({ url });
                }
                return;
            }
            const removeBtn = event.target?.closest?.('.manual-whl-remove');
            if (removeBtn && !state.installing && !state.loading) {
                const idx = Number(removeBtn.getAttribute('data-idx'));
                if (Number.isInteger(idx) && idx >= 0 && idx < state.paths.length) {
                    state.paths.splice(idx, 1);
                    renderPaths();
                    setBusy(false);
                }
            }
        });

        document.addEventListener('keydown', (event) => {
            if (!state.open || state.installing) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                closeModal({ ok: false, cancelled: true });
            }
        });
    }

    function init() {
        bindOnce();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.TransubManualWhlInstall = {
        offerAfterFailure,
        openModal,
        closeModal,
        normalizeKind,
        kindLabel,
    };
})(typeof window !== 'undefined' ? window : globalThis);
