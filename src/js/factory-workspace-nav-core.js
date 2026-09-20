/**
 * Factory workspace navigation: setFactoryWorkspace + burn handoff picks.
 * Shell injects state/globals via createFactoryWorkspaceNav(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubFactoryWorkspaceNav = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function factoryWorkspaceNavFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createFactoryWorkspaceNav(deps) {
        const d = deps || {};
        const state = d.state;
        const factoryChromeApi = d.factoryChromeApi || {};
        const getDocument = d.getDocument
            || (() => (typeof document !== 'undefined' ? document : (global && global.document)));
        const ensureFactoryWorkspaceScripts = d.ensureFactoryWorkspaceScripts || (async () => {});
        const onFactoryModelsWorkspaceShow = d.onFactoryModelsWorkspaceShow || (() => {});
        const onFactoryModelsWorkspaceHide = d.onFactoryModelsWorkspaceHide || (() => {});
        const pickFactoryHandoffItem = d.pickFactoryHandoffItem || (() => null);
        const getSubtitlePathForItem = d.getSubtitlePathForItem || (() => '');
        const getSelectedItems = d.getSelectedItems || (() => []);
        const openShelfTranslate = d.openShelfTranslate || (async () => {});
        const openAppSettings = d.openAppSettings || (() => {});

        function setFactoryWorkspace(id, opts = {}) {
            const next = factoryChromeApi.normalizeWorkspace
                ? factoryChromeApi.normalizeWorkspace(id)
                : (id === 'shelf' ? 'shelf'
                    : (id === 'scenes' ? 'scenes'
                        : (id === 'models' ? 'models' : (id === 'burn' ? 'burn' : 'queue'))));
            const prev = state.factoryWorkspace;
            const apply = () => {
                state.factoryWorkspace = next;
                const doc = getDocument();
                if (doc?.body) {
                    doc.body.classList.toggle('workspace-scenes', next === 'scenes');
                    doc.body.classList.toggle('workspace-shelf', next === 'shelf');
                    doc.body.classList.toggle('workspace-models', next === 'models');
                    doc.body.classList.toggle('workspace-burn', next === 'burn');
                }
                doc?.querySelectorAll?.('[data-factory-nav]')?.forEach?.((btn) => {
                    const nav = btn.getAttribute('data-factory-nav');
                    btn.classList.toggle('is-active', nav === next);
                });
                if (next === 'scenes') {
                    void global.TransubScenePresetsUi?.onWorkspaceShow?.(opts || {});
                } else if (prev === 'scenes') {
                    void global.TransubScenePresetsUi?.onWorkspaceHide?.();
                }
                if (next === 'shelf') {
                    void global.TransubSubtitleShelfUi?.onWorkspaceShow?.(opts || {});
                } else if (prev === 'shelf') {
                    void global.TransubSubtitleShelfUi?.onWorkspaceHide?.();
                }
                if (next === 'models') {
                    void onFactoryModelsWorkspaceShow(opts || {});
                } else if (prev === 'models') {
                    onFactoryModelsWorkspaceHide();
                }
                if (next === 'burn') {
                    void global.TransubSubtitleBurnUi?.onWorkspaceShow?.(opts || {});
                } else if (prev === 'burn') {
                    void global.TransubSubtitleBurnUi?.onWorkspaceHide?.();
                }
            };
            // Queue is always in index.html; other workspaces load HTML fragments on demand.
            if (next === 'shelf' || next === 'scenes' || next === 'models' || next === 'burn') {
                return ensureFactoryWorkspaceScripts(next).then(apply).catch((err) => {
                    const msg = err?.message || String(err || 'unknown');
                    console.warn('[factory] workspace fragment/scripts failed:', msg);
                    try {
                        const pending = getDocument()?.getElementById?.(
                            next === 'scenes' ? 'workspaceScenes'
                                : next === 'shelf' ? 'workspaceShelf'
                                    : next === 'models' ? 'workspaceModels'
                                        : 'workspaceBurn',
                        );
                        if (pending?.getAttribute?.('data-ui-fragment') === 'pending') {
                            const label = pending.querySelector('span:not(.boot-spinner)');
                            if (label) label.textContent = `加载失败：${msg}`;
                        }
                    } catch (_) { /* ignore */ }
                    apply();
                });
            }
            apply();
        }

        function openFactoryScenesWorkspace(payload = {}) {
            setFactoryWorkspace('scenes', payload || {});
        }

        function openFactoryShelfWorkspace(payload = {}) {
            setFactoryWorkspace('shelf', payload || {});
        }

        function openFactoryModelsWorkspace(payload = {}) {
            setFactoryWorkspace('models', payload || {});
        }

        function openFactoryBurnWorkspace(payload = {}) {
            setFactoryWorkspace('burn', payload || {});
        }

        function pickBurnHandoffFromQueue() {
            const item = pickFactoryHandoffItem();
            if (!item) return null;
            const videoPath = String(item.path || '').trim();
            const subtitlePath = String(getSubtitlePathForItem(item) || '').trim();
            const bilingualSubtitlePath = String(item.bilingualSubtitlePath || '').trim();
            if (!videoPath) return null;
            return {
                videoPath,
                subtitlePath,
                bilingualSubtitlePath,
                sourceSubtitlePath: String(item.sourceSubtitlePath || '').trim(),
                path: videoPath,
            };
        }

        function pickBurnHandoffBatchFromQueue() {
            const selected = getSelectedItems().filter((it) => String(it?.path || '').trim());
            const source = selected.length
                ? selected
                : state.items.filter((it) => it.status === 'done' && String(it?.path || '').trim());
            return source.map((item) => ({
                videoPath: String(item.path || '').trim(),
                subtitlePath: String(getSubtitlePathForItem(item) || '').trim(),
                bilingualSubtitlePath: String(item.bilingualSubtitlePath || '').trim(),
                sourceSubtitlePath: String(item.sourceSubtitlePath || '').trim(),
                path: String(item.path || '').trim(),
            })).filter((p) => p.videoPath);
        }

        function installBurnHandoffGlobals() {
            global.__transubPickBurnHandoff = pickBurnHandoffFromQueue;
            global.__transubPickBurnHandoffBatch = pickBurnHandoffBatchFromQueue;
            const doc = getDocument();
            doc?.addEventListener?.('transub-burn-request-queue-item', () => {
                const pick = pickBurnHandoffFromQueue();
                if (!pick) return;
                global.TransubSubtitleBurnUi?.applyPayload?.(pick);
            });
        }

        function installFactoryWorkspaceApi() {
            global.TransubFactoryWorkspace = {
                set: setFactoryWorkspace,
                openScenes: openFactoryScenesWorkspace,
                openShelf: openFactoryShelfWorkspace,
                openModels: openFactoryModelsWorkspace,
                openBurn: openFactoryBurnWorkspace,
                openShelfTranslate,
                openSettings: openAppSettings,
                get: () => state.factoryWorkspace,
                pickBurnHandoff: pickBurnHandoffFromQueue,
                pickBurnHandoffBatch: pickBurnHandoffBatchFromQueue,
            };
        }

        function install() {
            installBurnHandoffGlobals();
            installFactoryWorkspaceApi();
        }

        return {
            setFactoryWorkspace,
            openFactoryScenesWorkspace,
            openFactoryShelfWorkspace,
            openFactoryModelsWorkspace,
            openFactoryBurnWorkspace,
            pickBurnHandoffFromQueue,
            pickBurnHandoffBatchFromQueue,
            installBurnHandoffGlobals,
            installFactoryWorkspaceApi,
            install,
        };
    }

    return { createFactoryWorkspaceNav };
}));
