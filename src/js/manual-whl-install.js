/**
 * Manual .whl download / local pip install dialog (GPU / Demucs / SenseVoice fallback).
 */
(function (global) {
    const electron = global.__ELECTRON__;

    function uiTf(template, vars) {
        const api = global.TransubI18n;
        if (api?.tf) return api.tf(template, vars);
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => (
            vars && Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
                ? String(vars[name])
                : `{${name}}`
        ));
    }

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
        keysBound: false,
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
        if (k === 'torch-cuda' || k === 'torchcuda' || k === 'cuda-torch' || k === 'pytorch-cuda') {
            return 'torch-cuda';
        }
        if (k === 'torch-rocm' || k === 'torchrocm' || k === 'rocm-torch' || k === 'pytorch-rocm') {
            return 'torch-rocm';
        }
        if (k === 'sensevoice' || k === 'sensevoice-runtime' || k === 'runtime') return 'sensevoice';
        if (k === 'whisper' || k === 'whisper-runtime') return 'whisper';
        if (k === 'llamaruntime' || k === 'llama-runtime' || k === 'llama' || k === 'llama-server') {
            return 'llamaRuntime';
        }
        return 'gpu';
    }

    function kindTitle(kind, kinds) {
        const list = Array.isArray(kinds) && kinds.length
            ? kinds.map(normalizeKind)
            : [normalizeKind(kind)];
        if (list.length > 1) {
            return list.includes('llamaRuntime')
                ? '手动修复 · 运行库 / llama-server'
                : '手动修复 · 运行库 / GPU';
        }
        const k = list[0];
        if (k === 'demucs') return '手动修复 · Demucs / PyTorch';
        if (k === 'torch-cuda') return '手动修复 · CUDA PyTorch';
        if (k === 'torch-rocm') return '手动修复 · ROCm PyTorch';
        if (k === 'sensevoice') return '手动修复 · SenseVoice 运行库';
        if (k === 'whisper') return '手动修复 · Whisper 运行库';
        if (k === 'llamaRuntime') return '手动修复 · llama-server 运行时';
        return '手动修复 · GPU 组件';
    }

    function kindLabel(kind) {
        if (kind === 'demucs') return 'Demucs';
        if (kind === 'torch-cuda') return 'CUDA PyTorch';
        if (kind === 'torch-rocm') return 'ROCm PyTorch';
        if (kind === 'sensevoice') return 'SenseVoice 运行库';
        if (kind === 'whisper') return 'Whisper 运行库';
        if (kind === 'llamaRuntime') return 'llama-server';
        return 'GPU 支持';
    }

    function llamaRuntimeCatalogItems(info) {
        const src = info && typeof info === 'object' ? info : {};
        const items = [];
        const mainUrl = String(src.runtimeMirrorUrl || src.mirrorUrl || src.runtimeUrl || '').trim();
        if (mainUrl) {
            items.push({
                id: 'llama-server-runtime',
                name: src.runtimeLabel || 'llama-server',
                fileName: src.runtimeArchiveName || '',
                group: 'llama-server',
                kind: 'llamaRuntime',
                defaultUrl: mainUrl,
                mirrorUrl: String(src.runtimeMirrorUrl || src.mirrorUrl || mainUrl).trim(),
                officialUrl: String(src.runtimeUrl || '').trim(),
            });
        }
        const companion = String(src.runtimeCompanionMirrorUrl || src.runtimeCompanionUrl || '').trim();
        if (companion) {
            items.push({
                id: 'llama-server-companion',
                name: 'llama-server CUDA / 配套组件',
                fileName: src.runtimeCompanionArchiveName || '',
                group: 'llama-server',
                kind: 'llamaRuntime',
                defaultUrl: companion,
                mirrorUrl: String(src.runtimeCompanionMirrorUrl || companion).trim(),
                officialUrl: String(src.runtimeCompanionUrl || '').trim(),
            });
        }
        return items;
    }

    function pickTitle(kind, kinds) {
        const list = Array.isArray(kinds) && kinds.length ? kinds : [kind];
        if (list.length > 1) return '选择已下载的 .whl（可多选）';
        const k = normalizeKind(kind);
        if (k === 'demucs') return '选择 Demucs / torch 的 .whl（可多选）';
        if (k === 'torch-cuda') return '选择 CUDA 版 torch / torchaudio 的 .whl（可多选）';
        if (k === 'torch-rocm') return 'ROCm 请复制 pip 命令安装（无独立 .whl 清单）';
        if (k === 'sensevoice') return '选择 torch / funasr 等 .whl（可多选）';
        if (k === 'whisper') return '选择 numpy / ctranslate2 / onnxruntime / faster-whisper 的 .whl（可多选）';
        return '选择 GPU 组件 .whl（可多选）';
    }

    function confirmFn() {
        return global.TransubAppConfirm || ((msg) => Promise.resolve(window.confirm(String(msg?.message || msg || ''))));
    }

    function linkExportApi() {
        return global.TransubManualWhlLinkExport || null;
    }

    function syncLinksExportPanel({ autoCopy = false } = {}) {
        const api = linkExportApi();
        const ta = $('manualWhlLinksText');
        const copyBtn = $('manualWhlCopyLinksBtn');
        const exportBtn = $('manualWhlExportLinksBtn');
        const toolBtn = $('manualWhlToolBtn');
        const items = Array.isArray(state.info?.items) ? state.info.items : [];
        const text = api?.buildManualWhlLinkExportText?.(items, {
            title: `Transub 手动下载 · ${kindTitle(state.kind, state.kinds)}`,
        }) || '';
        if (ta) ta.value = text;
        const urls = api?.collectManualWhlUrls?.(items) || [];
        const has = urls.length > 0;
        if (copyBtn) copyBtn.disabled = !has || state.loading || state.installing;
        if (exportBtn) exportBtn.disabled = !has || state.loading || state.installing;
        if (toolBtn) toolBtn.disabled = !has || state.loading || state.installing;
        if (autoCopy && has) {
            void copyAllLinks({ quiet: true });
        }
        return { text, urls, has };
    }

    async function copyAllLinks({ quiet = false } = {}) {
        const api = linkExportApi();
        const items = Array.isArray(state.info?.items) ? state.info.items : [];
        const text = api?.buildManualWhlLinkExportText?.(items, {
            title: `Transub 手动下载 · ${kindTitle(state.kind, state.kinds)}`,
        }) || '';
        const urls = api?.collectManualWhlUrls?.(items) || [];
        if (!urls.length) {
            if (!quiet) setStatus('当前没有可复制的直链', 'warn');
            return { ok: false, error: 'empty' };
        }
        try {
            if (global.navigator?.clipboard?.writeText) {
                await global.navigator.clipboard.writeText(text);
            } else {
                const ta = $('manualWhlLinksText');
                if (!ta) throw new Error('no_clipboard');
                ta.focus();
                ta.select();
                const ok = document.execCommand?.('copy');
                if (!ok) throw new Error('copy_failed');
            }
            if (!quiet) {
                setStatus(uiTf('已复制 {count} 条链接到剪贴板（可粘贴到下载软件批量导入）', {
                    count: urls.length,
                }), 'ok');
            } else {
                setStatus(uiTf('已自动复制 {count} 条链接，可直接粘贴到下载软件', {
                    count: urls.length,
                }), 'ok');
            }
            return { ok: true, count: urls.length };
        } catch (err) {
            if (!quiet) {
                setStatus('复制失败：请在下方文本框中全选后手动复制（Ctrl+A / Ctrl+C）', 'warn');
            }
            return { ok: false, error: err?.message || String(err) };
        }
    }

    function exportLinksFile() {
        const api = linkExportApi();
        const items = Array.isArray(state.info?.items) ? state.info.items : [];
        const text = api?.buildManualWhlLinkExportText?.(items, {
            title: `Transub 手动下载 · ${kindTitle(state.kind, state.kinds)}`,
        }) || '';
        const urls = api?.collectManualWhlUrls?.(items) || [];
        if (!urls.length) {
            setStatus('当前没有可导出的直链', 'warn');
            return { ok: false, error: 'empty' };
        }
        try {
            const name = api?.defaultExportFileName?.(state.kind) || 'transub-manual-urls.txt';
            const blob = new Blob([text.endsWith('\n') ? text : `${text}\n`], {
                type: 'text/plain;charset=utf-8',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.click();
            URL.revokeObjectURL(url);
            setStatus(uiTf('已导出 {file}（{count} 条链接）', {
                file: name,
                count: urls.length,
            }), 'ok');
            return { ok: true, fileName: name, count: urls.length };
        } catch (err) {
            setStatus(err?.message || '导出失败', 'err');
            return { ok: false, error: err?.message || String(err) };
        }
    }

    function setToolMenuOpen(open) {
        const btn = $('manualWhlToolBtn');
        const menu = $('manualWhlToolMenu');
        if (menu) menu.classList.toggle('hidden', !open);
        if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    async function openWithDownloadTool(toolId) {
        setToolMenuOpen(false);
        const items = Array.isArray(state.info?.items) ? state.info.items : [];
        const urls = linkExportApi()?.collectManualWhlUrls?.(items) || [];
        if (!urls.length) {
            setStatus('当前没有可下载的直链', 'warn');
            return { ok: false, error: 'empty' };
        }
        await copyAllLinks({ quiet: true });
        const tool = String(toolId || 'thunder').trim().toLowerCase();
        const labels = {
            thunder: '迅雷',
            idm: 'IDM',
            motrix: 'Motrix',
        };
        const label = labels[tool] || tool;

        const invoke = electron?.transubEngineOpenDownloadTool
            || (tool === 'thunder' ? electron?.transubEngineOpenThunderUrls : null);

        if (!invoke) {
            setStatus(uiTf('已复制全部 {count} 条链接。请打开 {tool} → 新建任务 → 粘贴', {
                count: urls.length,
                tool: label,
            }), 'ok');
            return { ok: true, copiedOnly: true, count: urls.length, tool };
        }
        try {
            const res = tool === 'thunder' && !electron?.transubEngineOpenDownloadTool
                ? await electron.transubEngineOpenThunderUrls({ urls })
                : await electron.transubEngineOpenDownloadTool({ tool, urls });
            if (!res?.ok) {
                const hint = res?.missingApp || res?.clipboardExpected
                    ? uiTf('已复制 {count} 条链接。{err}；请在 {tool} 中粘贴导入', {
                        count: urls.length,
                        err: res?.error || '未能唤起工具',
                        tool: label,
                    })
                    : (res?.error || uiTf('唤起 {tool} 失败；链接已复制，可在工具中粘贴', { tool: label }));
                setStatus(hint, 'warn');
                return {
                    ok: false,
                    error: res?.error || 'tool_failed',
                    count: urls.length,
                    opened: res?.opened || 0,
                    total: res?.total || urls.length,
                    tool,
                };
            }
            const opened = Number(res.opened) || 0;
            const total = Number(res.total) || urls.length;
            if (tool === 'motrix' || res.clipboardExpected) {
                setStatus(uiTf('已复制全部 {count} 条链接，并尝试打开 {tool}（请在工具中粘贴批量导入）', {
                    count: total,
                    tool: label,
                }), 'ok');
            } else if (opened < total) {
                setStatus(uiTf('已复制 {total} 条链接，并向 {tool} 添加了 {opened} 条（其余请在工具中粘贴）', {
                    total,
                    opened,
                    tool: label,
                }), 'warn');
            } else {
                setStatus(uiTf('已复制并尝试用 {tool} 下载全部 {count} 条（若未全部弹出，请在工具中粘贴）', {
                    tool: label,
                    count: total,
                }), 'ok');
            }
            return {
                ok: true,
                opened,
                total,
                count: urls.length,
                tool,
            };
        } catch (err) {
            setStatus(uiTf('唤起 {tool} 失败；已复制 {count} 条链接，可在工具中粘贴', {
                tool: label,
                count: urls.length,
            }), 'warn');
            return {
                ok: false,
                error: err?.message || String(err),
                count: urls.length,
                tool,
            };
        }
    }

    /** @deprecated use openWithDownloadTool('thunder') */
    async function openWithThunder() {
        return openWithDownloadTool('thunder');
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
            const isDirectFile = /\.(whl|zip|7z)(?:#|$)/i.test(url);
            const btnLabel = isDirectFile ? '下载文件' : '打开镜像';
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

    function setProgressVisible(visible) {
        const wrap = $('manualWhlProgressWrap');
        if (!wrap) return;
        wrap.classList.toggle('hidden', !visible);
        if (!visible) {
            const bar = $('manualWhlProgressBar');
            const pctEl = $('manualWhlProgressPct');
            const detail = $('manualWhlProgressDetail');
            if (bar) bar.style.width = '0%';
            if (pctEl) pctEl.textContent = '0%';
            if (detail) detail.textContent = '准备安装…';
        }
    }

    function updateInstallProgress(p = {}) {
        const pctRaw = Number(p?.pct ?? p?.percent);
        const pct = Number.isFinite(pctRaw)
            ? Math.max(0, Math.min(100, Math.round(pctRaw)))
            : null;
        const msg = String(p?.message || p?.detail || '').trim();
        const bar = $('manualWhlProgressBar');
        const pctEl = $('manualWhlProgressPct');
        const detail = $('manualWhlProgressDetail');
        if (pct != null) {
            if (bar) bar.style.width = `${pct}%`;
            if (pctEl) pctEl.textContent = `${pct}%`;
        }
        if (msg && detail) detail.textContent = msg;
        const installBtn = $('manualWhlInstallBtn');
        if (installBtn && state.installing) {
            installBtn.textContent = pct != null ? `安装中 ${pct}%` : '安装中…';
        }
        if (msg) {
            setStatus(
                pct != null
                    ? uiTf('安装中（{pct}%）：{msg} · 请耐心等待', { pct, msg })
                    : uiTf('安装中：{msg} · 请耐心等待', { msg }),
                'info',
            );
        }
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
        const copyBtn = $('manualWhlCopyLinksBtn');
        const exportBtn = $('manualWhlExportLinksBtn');
        const toolBtn = $('manualWhlToolBtn');
        const hasLinks = (linkExportApi()?.collectManualWhlUrls?.(state.info?.items) || []).length > 0;
        if (copyBtn) copyBtn.disabled = busy || state.loading || !hasLinks;
        if (exportBtn) exportBtn.disabled = busy || state.loading || !hasLinks;
        if (toolBtn) toolBtn.disabled = busy || state.loading || !hasLinks;
        if (busy) setToolMenuOpen(false);
        if (!busy) setProgressVisible(false);
    }

    function closeModal(result) {
        setToolMenuOpen(false);
        const modal = $('manualWhlModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        state.open = false;
        state.loading = false;
        state.loadToken += 1; // invalidate in-flight openModal fetches
        state.installing = false;
        setProgressVisible(false);
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
        initialPaths = null,
        preferInstall = false,
    } = {}) {
        bindOnce();
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
        syncLinksExportPanel();
        setStatus('正在加载下载清单…', 'info');
        setBusy(false);
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        const resultPromise = new Promise((resolve) => {
            state.resolve = resolve;
        });

        const seedPaths = Array.isArray(initialPaths)
            ? initialPaths.map((p) => String(p || '').trim()).filter((p) => /\.whl$/i.test(p))
            : [];
        if (seedPaths.length) {
            await mergeAndValidatePaths(seedPaths, { fromSeed: true });
        }
        if (!state.info && electron?.transubEngineDownloadInfo) {
            try {
                const mergedItems = [];
                let folder = '';
                let wheelHint = '';
                for (const k of kindList) {
                    if (state.loadToken !== loadToken || !state.open) {
                        return resultPromise;
                    }
                    if (k === 'llamaRuntime') {
                        if (!electron?.transubAdvancedManagedLlmDownloadInfo) continue;
                        const res = await electron.transubAdvancedManagedLlmDownloadInfo({ kind: 'runtime' });
                        if (state.loadToken !== loadToken || !state.open) {
                            return resultPromise;
                        }
                        if (!res?.ok || !res.info) continue;
                        folder = folder || res.info.folder || '';
                        wheelHint = wheelHint
                            || 'llama-server 为 zip 运行时（非 .whl）。请用下方链接下载后，到设置 → 运行环境选择 zip 安装。';
                        for (const it of llamaRuntimeCatalogItems(res.info)) {
                            const key = `${it.id || ''}::${it.fileName || it.defaultUrl || ''}`;
                            if (mergedItems.some((x) => `${x.id || ''}::${x.fileName || x.defaultUrl || ''}` === key)) {
                                continue;
                            }
                            mergedItems.push(it);
                        }
                        continue;
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
                || '请在浏览器下载对应 .whl，再选择本地文件安装。也可复制/导出下方全部链接，用下载软件批量拉取。';
        }
        renderPackages();
        renderPaths();
        // Prepare links for copy/export; do not overwrite clipboard without an explicit click.
        syncLinksExportPanel({ autoCopy: false });
        setBusy(false);

        if (preferInstall && state.paths.length && state.open && state.loadToken === loadToken) {
            void installSelected();
        }

        return resultPromise;
    }

    async function mergeAndValidatePaths(incoming, { fromSeed = false } = {}) {
        const next = Array.isArray(incoming) ? incoming : [];
        const merged = [...state.paths];
        const seen = new Set(merged.map((p) => p.toLowerCase()));
        for (const p of next) {
            const key = String(p).toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            merged.push(p);
        }
        if (!merged.length) {
            if (!fromSeed) setStatus('未识别到 .whl 文件', 'warn');
            if (!state.installing) setBusy(false);
            return false;
        }
        if (electron.transubEngineValidateWhl) {
            const checked = await electron.transubEngineValidateWhl({
                paths: merged,
                ...(state.formPayload || {}),
            });
            if (!checked?.ok) {
                setStatus(checked?.error || '所选 .whl 存在冲突', 'err');
                if (!state.installing) setBusy(false);
                return false;
            }
            state.paths = Array.isArray(checked.paths) ? checked.paths : merged;
            renderPaths();
            const note = String(checked.note || '').trim();
            setStatus(
                note
                    ? `${note}。已选择 ${state.paths.length} 个文件`
                    : (state.paths.length ? `已选择 ${state.paths.length} 个文件` : ''),
                note ? 'warn' : 'info',
            );
            if (!state.installing) setBusy(false);
            return true;
        }
        state.paths = merged;
        renderPaths();
        setStatus(state.paths.length ? `已选择 ${state.paths.length} 个文件` : '', 'info');
        if (!state.installing) setBusy(false);
        return true;
    }

    async function pickFiles() {
        if (!electron?.transubEnginePickWhl) {
            setStatus('当前环境不支持选择本地文件', 'err');
            return;
        }
        const res = await electron.transubEnginePickWhl({
            title: pickTitle(state.kind, state.kinds),
            ...(state.formPayload || {}),
        });
        if (!res?.ok) {
            setStatus(res?.error || '选择文件失败', 'err');
            return;
        }
        if (res.canceled) return;
        await mergeAndValidatePaths(res.paths || []);
        setBusy(false);
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
        setProgressVisible(true);
        updateInstallProgress({
            pct: 2,
            message: `准备安装 ${state.paths.length} 个文件…`,
        });
        setStatus('正在本地安装，可能需要几分钟，请耐心等待…', 'info');

        let unsubProgress = null;
        try {
            if (typeof electron.onEngineDownloadProgress === 'function') {
                unsubProgress = electron.onEngineDownloadProgress((p) => {
                    if (!state.installing || !p) return;
                    // Prefer local-whl events; also accept untagged progress while this modal owns the install.
                    if (p.source && p.source !== 'local-whl') return;
                    updateInstallProgress(p);
                });
            }

            if (electron.transubEngineValidateWhl) {
                updateInstallProgress({ pct: 4, message: '正在校验所选 .whl…' });
                const checked = await electron.transubEngineValidateWhl({
                    paths: state.paths,
                    ...(state.formPayload || {}),
                });
                if (!checked?.ok) {
                    setStatus(checked?.error || '所选 .whl 存在冲突', 'err');
                    setBusy(false);
                    return;
                }
                state.paths = Array.isArray(checked.paths) ? checked.paths : state.paths;
                renderPaths();
                if (checked.note) {
                    updateInstallProgress({
                        pct: 6,
                        message: `${checked.note}。开始安装…`,
                    });
                }
            }
            updateInstallProgress({
                pct: 8,
                message: `正在安装 ${state.paths.length} 个组件，请耐心等待…`,
            });
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
            updateInstallProgress({ pct: 100, message: res.message || '安装完成' });
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
        } finally {
            try { unsubProgress?.(); } catch (_) { /* ignore */ }
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
            title: uiTf('{kind}自动安装失败', { kind: kindLabel(normalized) }),
            message: uiTf('{err}\n\n是否改为手动下载 .whl，并选择本地文件安装？', {
                err: String(errorText || '网络下载失败').slice(0, 500),
            }),
            primaryLabel: '手动安装',
            secondaryLabel: '取消',
        });
        if (!proceed) return { ok: false, cancelled: true };
        return openModal({ kind: normalized, errorText, formPayload });
    }

    function bindOnce() {
        const modal = $('manualWhlModal');
        if (!modal || modal.getAttribute('data-ui-fragment') === 'pending') return;
        if (modal.dataset.bound === '1') return;
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

        const dropZone = $('manualWhlDropZone');
        let dragDepth = 0;
        const setDropActive = (on) => {
            if (!dropZone) return;
            dropZone.classList.toggle('border-violet-500', !!on);
            dropZone.classList.toggle('bg-violet-100', !!on);
        };
        if (dropZone) {
            dropZone.addEventListener('click', () => {
                if (state.loading || state.installing) return;
                void pickFiles();
            });
            dropZone.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    dropZone.click();
                }
            });
            dropZone.addEventListener('dragenter', (ev) => {
                ev.preventDefault();
                dragDepth += 1;
                setDropActive(true);
            });
            dropZone.addEventListener('dragover', (ev) => {
                ev.preventDefault();
                if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
            });
            dropZone.addEventListener('dragleave', (ev) => {
                ev.preventDefault();
                dragDepth = Math.max(0, dragDepth - 1);
                if (!dragDepth) setDropActive(false);
            });
            dropZone.addEventListener('drop', (ev) => {
                ev.preventDefault();
                dragDepth = 0;
                setDropActive(false);
                if (state.loading || state.installing) return;
                const FixStart = global.TransubEnvFixStart || {};
                const dropped = typeof FixStart.pathsFromWhlDataTransfer === 'function'
                    ? FixStart.pathsFromWhlDataTransfer(ev.dataTransfer, electron)
                    : [];
                void (async () => {
                    await mergeAndValidatePaths(dropped);
                    if (!state.installing) setBusy(false);
                })();
            });
        }
        $('manualWhlClearBtn')?.addEventListener('click', () => {
            if (state.installing || state.loading) return;
            state.paths = [];
            renderPaths();
            setBusy(false);
            setStatus('');
        });
        $('manualWhlCopyLinksBtn')?.addEventListener('click', () => {
            if (state.loading) return;
            void copyAllLinks();
        });
        $('manualWhlExportLinksBtn')?.addEventListener('click', () => {
            if (state.loading) return;
            exportLinksFile();
        });
        $('manualWhlToolBtn')?.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (state.loading || state.installing) return;
            const btn = $('manualWhlToolBtn');
            if (btn?.disabled) return;
            const menu = $('manualWhlToolMenu');
            const open = menu ? menu.classList.contains('hidden') : false;
            setToolMenuOpen(open);
        });
        $('manualWhlToolMenu')?.addEventListener('click', (ev) => {
            const item = ev.target?.closest?.('[data-download-tool]');
            if (!item) return;
            ev.preventDefault();
            if (state.loading || state.installing) return;
            void openWithDownloadTool(item.getAttribute('data-download-tool'));
        });

        modal.addEventListener('click', (event) => {
            if (event.target === modal && !state.installing) {
                closeModal({ ok: false, cancelled: true });
            }
            if (!event.target?.closest?.('.manual-whl-tool-dd')) {
                setToolMenuOpen(false);
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

        if (!state.keysBound) {
            state.keysBound = true;
            document.addEventListener('keydown', (event) => {
                if (!state.open || state.installing) return;
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeModal({ ok: false, cancelled: true });
                }
            });
        }
    }

    function init() {
        bindOnce();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    global.addEventListener?.('transub-ui-fragment-ready', (ev) => {
        if (ev?.detail?.key === 'factory-modals') bindOnce();
    });

    global.TransubManualWhlInstall = {
        offerAfterFailure,
        openModal,
        closeModal,
        normalizeKind,
        kindLabel,
        copyAllLinks,
        exportLinksFile,
        openWithThunder,
        syncLinksExportPanel,
    };
})(typeof window !== 'undefined' ? window : globalThis);
