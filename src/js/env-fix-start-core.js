/**
 * Env repair start chooser: manual-first UI with .whl drop zone.
 * Also exports a reusable drop controller for system-check host chrome.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (global) global.TransubEnvFixStart = api;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function envFixStartFactory(global) {
    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function pathFromDroppedFile(file, electron) {
        if (!file) return '';
        const legacy = file.path || '';
        if (legacy) return legacy;
        try {
            return electron?.getPathForFile?.(file) || '';
        } catch (_) {
            return '';
        }
    }

    function isWhlPath(p) {
        return /\.whl$/i.test(String(p || '').trim());
    }

    /**
     * Collect absolute .whl paths from a DataTransfer (Electron File.path / webUtils).
     * @param {DataTransfer|null|undefined} dt
     * @param {object} [electron]
     * @returns {string[]}
     */
    function pathsFromWhlDataTransfer(dt, electron) {
        const out = [];
        const seen = new Set();
        const push = (p) => {
            const path = String(p || '').trim();
            if (!path || !isWhlPath(path)) return;
            const key = path.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push(path);
        };
        if (!dt) return out;
        if (dt.items?.length) {
            for (const item of dt.items) {
                if (item.kind !== 'file') continue;
                push(pathFromDroppedFile(item.getAsFile(), electron));
            }
            if (out.length) return out;
        }
        for (const file of dt.files || []) {
            push(pathFromDroppedFile(file, electron));
        }
        return out;
    }

    /**
     * Short summary for the start modal (manual-first wording).
     */
    function buildFixStartSummary(plan, { uiTx, uiTf } = {}) {
        const tx = typeof uiTx === 'function' ? uiTx : ((t) => String(t || ''));
        const tf = typeof uiTf === 'function'
            ? uiTf
            : ((t, v) => String(t || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (
                v && Object.prototype.hasOwnProperty.call(v, k) ? String(v[k]) : `{${k}}`
            )));
        const Progress = global.TransubEnvFixProgress || {};
        let items = [];
        if (typeof Progress.collectFixProgressItems === 'function') {
            items = Progress.collectFixProgressItems(plan);
        } else {
            const steps = Array.isArray(plan?.steps) ? plan.steps : [];
            for (const step of steps) {
                if (!step || step.manual) continue;
                items.push({
                    id: String(step.id || ''),
                    label: String(step.label || step.id || '').trim(),
                    kind: 'auto',
                });
            }
            const hints = Array.isArray(plan?.manualHints) ? plan.manualHints : [];
            for (const hint of hints) {
                if (!hint) continue;
                items.push({
                    id: String(hint.id || hint.label || ''),
                    label: String(hint.label || hint.detail || '').trim(),
                    kind: 'manual',
                });
            }
        }
        const auto = items.filter((it) => it.kind === 'auto').map((it) => `· ${it.label}`);
        const manual = items.filter((it) => it.kind === 'manual').map((it) => `· ${it.label}`);
        const parts = [];
        if (auto.length) {
            parts.push(tf('可自动/手动处理：\n{steps}', { steps: auto.join('\n') }));
        }
        if (manual.length) {
            parts.push(tf('仍需本机处理：\n{items}', { items: manual.join('\n') }));
        }
        parts.push(tx('建议：用下载软件拉取直链后，将 .whl 拖入下方区域安装（成功率更高）。'));
        return parts.filter(Boolean).join('\n\n');
    }

    const START_MODAL_WHL_IDS = Object.freeze({
        zone: 'envFixStartDropZone',
        list: 'envFixStartPathList',
        empty: 'envFixStartPathEmpty',
        clear: 'envFixStartClearPathsBtn',
        install: 'envFixStartInstallBtn',
        status: 'envFixStartStatus',
    });

    const ENV_CHECK_WHL_IDS = Object.freeze({
        zone: 'envCheckWhlDropZone',
        list: 'envCheckWhlPathList',
        empty: 'envCheckWhlPathEmpty',
        clear: 'envCheckWhlClearPathsBtn',
        install: 'envCheckWhlInstallBtn',
        status: 'envCheckWhlStatus',
        exportBtn: 'envCheckWhlExportBtn',
        panel: 'envCheckWhlPanel',
    });

    /**
     * Reusable .whl drop / pick / validate panel (start modal + system check).
     * @param {{
     *   $?: (id: string) => HTMLElement|null,
     *   electron?: object,
     *   uiTx?: (t: string) => string,
     *   uiTf?: (t: string, v?: object) => string,
     *   esc?: (s: string) => string,
     *   ids?: Partial<typeof START_MODAL_WHL_IDS & { exportBtn?: string, panel?: string }>,
     *   validatePaths?: (paths: string[], opts?: object) => Promise<object>,
     *   pickWhl?: (opts?: object) => Promise<object>,
     *   onInstall?: (paths: string[]) => void,
     *   onExport?: (paths: string[]) => void,
     * }} [deps]
     */
    function createWhlDropController(deps = {}) {
        const $ = deps.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const electron = deps.electron || global.__ELECTRON__;
        const uiTx = deps.uiTx || ((t) => String(t || ''));
        const uiTf = deps.uiTf || ((t, v) => String(t || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (
            v && Object.prototype.hasOwnProperty.call(v, k) ? String(v[k]) : `{${k}}`
        )));
        const escapeHtml = deps.esc || esc;
        const ids = { ...START_MODAL_WHL_IDS, ...(deps.ids || {}) };
        const validatePaths = typeof deps.validatePaths === 'function'
            ? deps.validatePaths
            : async (paths, opts) => {
                if (!electron?.transubEngineValidateWhl) {
                    return { ok: true, paths: paths.slice() };
                }
                return electron.transubEngineValidateWhl({ paths, ...(opts || {}) });
            };
        const pickWhl = typeof deps.pickWhl === 'function'
            ? deps.pickWhl
            : async (opts) => {
                if (!electron?.transubEnginePickWhl) {
                    return { ok: false, error: 'unsupported' };
                }
                return electron.transubEnginePickWhl(opts || {});
            };

        let bound = false;
        /** @type {string[]} */
        let paths = [];
        let formPayload = {};
        let dragDepth = 0;
        let busy = false;

        function setStatus(text, kind = 'info') {
            const el = $(ids.status);
            if (!el) return;
            el.textContent = String(text || '');
            el.classList.remove('text-gray-500', 'text-red-600', 'text-emerald-700', 'text-amber-700');
            if (kind === 'err') el.classList.add('text-red-600');
            else if (kind === 'ok') el.classList.add('text-emerald-700');
            else if (kind === 'warn') el.classList.add('text-amber-700');
            else el.classList.add('text-gray-500');
        }

        function renderPaths() {
            const list = $(ids.list);
            const empty = $(ids.empty);
            const clearBtn = $(ids.clear);
            const installBtn = $(ids.install);
            if (empty) empty.classList.toggle('hidden', paths.length > 0);
            if (clearBtn) clearBtn.classList.toggle('hidden', !paths.length);
            if (installBtn) installBtn.disabled = !paths.length || busy;
            if (!list) return;
            list.innerHTML = paths.map((p) => (
                `<li class="truncate font-mono text-[11px] px-2 py-1 rounded bg-gray-50 border border-gray-100" title="${escapeHtml(p)}">${escapeHtml(String(p).split(/[/\\]/).pop() || p)}</li>`
            )).join('');
        }

        function clearPaths(message) {
            paths = [];
            renderPaths();
            if (message !== false) {
                setStatus(message == null ? uiTx('已清空待安装列表') : String(message || ''), 'info');
            }
        }

        function setFormPayload(next) {
            formPayload = next && typeof next === 'object' ? next : {};
        }

        function setBusy(on) {
            busy = !!on;
            const zone = $(ids.zone);
            if (zone) zone.classList.toggle('opacity-60', busy);
            renderPaths();
        }

        async function ingestPaths(rawPaths) {
            const incoming = (Array.isArray(rawPaths) ? rawPaths : [])
                .map((p) => String(p || '').trim())
                .filter(isWhlPath);
            if (!incoming.length) {
                setStatus(uiTx('未识别到 .whl 文件'), 'warn');
                return;
            }
            const merged = paths.slice();
            const seen = new Set(merged.map((p) => p.toLowerCase()));
            for (const p of incoming) {
                const key = p.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(p);
            }
            setStatus(uiTx('正在校验所选文件…'), 'info');
            const checked = await validatePaths(merged, formPayload);
            if (!checked?.ok) {
                setStatus(checked?.error || uiTx('所选 .whl 存在冲突'), 'err');
                return;
            }
            paths = Array.isArray(checked.paths) ? checked.paths : merged;
            renderPaths();
            const note = String(checked.note || '').trim();
            setStatus(
                note
                    ? `${note}。${uiTf('已就绪 {n} 个文件，可点「安装所选 .whl」或「导出链接」补齐其余组件。', { n: paths.length })}`
                    : uiTf('已就绪 {n} 个文件，可点「安装所选 .whl」或「导出链接」补齐其余组件。', { n: paths.length }),
                note ? 'warn' : 'ok',
            );
        }

        function setDropActive(on) {
            const zone = $(ids.zone);
            if (!zone) return;
            zone.classList.toggle('border-violet-500', !!on);
            zone.classList.toggle('bg-violet-100', !!on);
        }

        function bindOnce() {
            if (bound) return;
            const zone = $(ids.zone);
            if (!zone && !$(ids.install)) return;
            bound = true;

            $(ids.clear)?.addEventListener('click', () => clearPaths());
            $(ids.install)?.addEventListener('click', () => {
                if (!paths.length || busy) return;
                if (typeof deps.onInstall === 'function') deps.onInstall(paths.slice());
            });
            if (ids.exportBtn) {
                $(ids.exportBtn)?.addEventListener('click', () => {
                    if (typeof deps.onExport === 'function') deps.onExport(paths.slice());
                });
            }

            if (!zone) return;
            zone.addEventListener('click', () => {
                if (busy) return;
                void (async () => {
                    const res = await pickWhl({
                        title: uiTx('选择已下载的 .whl 文件（可多选）'),
                        ...(formPayload || {}),
                    });
                    if (!res?.ok) {
                        if (!res?.canceled) setStatus(res?.error || uiTx('选择文件失败'), 'err');
                        return;
                    }
                    if (res.canceled) return;
                    await ingestPaths(res.paths || []);
                })();
            });
            zone.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    zone.click();
                }
            });
            zone.addEventListener('dragenter', (ev) => {
                ev.preventDefault();
                dragDepth += 1;
                setDropActive(true);
            });
            zone.addEventListener('dragover', (ev) => {
                ev.preventDefault();
                if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
            });
            zone.addEventListener('dragleave', (ev) => {
                ev.preventDefault();
                dragDepth = Math.max(0, dragDepth - 1);
                if (!dragDepth) setDropActive(false);
            });
            zone.addEventListener('drop', (ev) => {
                ev.preventDefault();
                dragDepth = 0;
                setDropActive(false);
                if (busy) return;
                const dropped = pathsFromWhlDataTransfer(ev.dataTransfer, electron);
                void ingestPaths(dropped);
            });
        }

        function setPanelVisible(show) {
            if (!ids.panel) return;
            const panel = $(ids.panel);
            if (panel) panel.classList.toggle('hidden', !show);
        }

        return {
            bindOnce,
            ingestPaths,
            getPaths: () => paths.slice(),
            clearPaths,
            setFormPayload,
            setStatus,
            renderPaths,
            setBusy,
            setPanelVisible,
            setDropActive,
            resetForOpen() {
                paths = [];
                dragDepth = 0;
                setDropActive(false);
                renderPaths();
            },
        };
    }

    /**
     * @param {{
     *   $?: (id: string) => HTMLElement|null,
     *   electron?: object,
     *   uiTx?: (t: string) => string,
     *   uiTf?: (t: string, v?: object) => string,
     *   esc?: (s: string) => string,
     *   validatePaths?: (paths: string[], opts?: object) => Promise<object>,
     *   pickWhl?: (opts?: object) => Promise<object>,
     * }} [deps]
     */
    function createEnvFixStartModal(deps = {}) {
        const $ = deps.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const uiTx = deps.uiTx || ((t) => String(t || ''));
        const uiTf = deps.uiTf || ((t, v) => String(t || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (
            v && Object.prototype.hasOwnProperty.call(v, k) ? String(v[k]) : `{${k}}`
        )));

        let resolveChoice = null;
        let actionsBound = false;
        const drop = createWhlDropController({
            ...deps,
            ids: START_MODAL_WHL_IDS,
            onInstall: (paths) => finish({ action: 'install', paths }),
        });

        function modalEl() {
            return $('envFixStartModal');
        }

        function finish(result) {
            const modal = modalEl();
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                modal.setAttribute('aria-hidden', 'true');
            }
            const resolve = resolveChoice;
            resolveChoice = null;
            drop.resetForOpen();
            drop.setStatus('');
            if (resolve) resolve(result || { action: 'cancel' });
        }

        function bindActionsOnce() {
            const modal = modalEl();
            if (!modal || actionsBound) return;
            actionsBound = true;
            drop.bindOnce();
            $('envFixStartCancelBtn')?.addEventListener('click', () => finish({ action: 'cancel' }));
            $('envFixStartAutoBtn')?.addEventListener('click', () => finish({ action: 'auto' }));
            $('envFixStartManualBtn')?.addEventListener('click', () => finish({
                action: 'manual',
                paths: drop.getPaths(),
            }));
        }

        /**
         * @param {object} plan
         * @param {{ formPayload?: object, title?: string, subtitle?: string }} [opts]
         * @returns {Promise<{ action: 'manual'|'auto'|'cancel'|'install', paths?: string[] }>}
         */
        function open(plan, opts = {}) {
            bindActionsOnce();
            drop.setFormPayload(opts.formPayload && typeof opts.formPayload === 'object' ? opts.formPayload : {});
            drop.resetForOpen();
            const modal = modalEl();
            if (!modal) {
                return Promise.resolve({ action: 'cancel', error: 'no_modal' });
            }
            const title = $('envFixStartTitle');
            const subtitle = $('envFixStartSubtitle');
            const summary = $('envFixStartSummary');
            if (title) title.textContent = opts.title || uiTx('环境修复');
            if (subtitle) {
                subtitle.textContent = opts.subtitle
                    || uiTx('可「手动修复」下载安装，或「自动修复」联网补齐。');
            }
            if (summary) summary.textContent = buildFixStartSummary(plan, { uiTx, uiTf });
            drop.setStatus(uiTx('可将已下载的 .whl 拖入上方；或点「手动修复」打开下载与安装窗口。'), 'info');
            try {
                document.body.appendChild(modal);
            } catch (_) { /* ignore */ }
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            modal.setAttribute('aria-hidden', 'false');
            return new Promise((resolve) => {
                resolveChoice = resolve;
            });
        }

        function close() {
            if (resolveChoice) finish({ action: 'cancel' });
            else {
                const modal = modalEl();
                if (modal) {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                    modal.setAttribute('aria-hidden', 'true');
                }
            }
        }

        return {
            open,
            close,
            ingestPaths: (...args) => drop.ingestPaths(...args),
            getPaths: () => drop.getPaths(),
        };
    }

    return {
        buildFixStartSummary,
        pathsFromWhlDataTransfer,
        pathFromDroppedFile,
        isWhlPath,
        createWhlDropController,
        createEnvFixStartModal,
        START_MODAL_WHL_IDS,
        ENV_CHECK_WHL_IDS,
    };
}));
