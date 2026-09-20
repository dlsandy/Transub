/**
 * Resource usage monitor UI: legacy progress label + factory status bar chips.
 * Shell injects DOM/state/IPC via createResourceUsageUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubResourceUsageUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function resourceUsageUiFactory(global) {
    const RESOURCE_USAGE_INTERVAL_MS = 5000;
    /** Idle status-bar chips: CPU/RAM only, slower tick (skip nvidia-smi). */
    const RESOURCE_USAGE_IDLE_INTERVAL_MS = 15000;
    const RESOURCE_CHIPS_EMPTY_HTML = '<span class="text-gray-400">资源采样中…</span>';

    function factoryEscHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * @param {Array<{ label: string, value: string, pct?: number|null }>} chips
     * @returns {string}
     */
    function buildFactoryResourceChipsHtml(chips) {
        const list = Array.isArray(chips) ? chips : [];
        if (!list.length) return RESOURCE_CHIPS_EMPTY_HTML;
        return list.map((c) => {
            const pct = Number.isFinite(c.pct) ? Math.max(0, Math.min(100, c.pct)) : 0;
            const meter = Number.isFinite(c.pct)
                ? `<span class="factory-resource-meter" aria-hidden="true"><i style="width:${pct}%"></i></span>`
                : '';
            return `<span class="factory-resource-chip"><span class="lbl">${factoryEscHtml(c.label)}</span><span class="val">${factoryEscHtml(c.value)}</span>${meter}</span>`;
        }).join('');
    }

    /**
     * @param {object} deps shell adapters
     */
    function createResourceUsageUi(deps) {
        const d = deps || {};
        const state = d.state;
        const els = d.els || {};
        const electron = d.electron;
        const factoryStatusBarApi = d.factoryStatusBarApi || {};
        const getSavedOptionsSnapshot = d.getSavedOptionsSnapshot || (() => null);
        const syncFactoryEngineStatus = d.syncFactoryEngineStatus || (() => {});
        const markSettingsDirty = d.markSettingsDirty || (() => {});
        const uiTf = d.uiTf || ((s) => s);

        function isShowTaskResourceUsageEnabled() {
            if (els.showTaskResourceUsageCheck) {
                return !!els.showTaskResourceUsageCheck.checked;
            }
            return getSavedOptionsSnapshot()?.showTaskResourceUsage !== false;
        }

        function clearResourceUsageLabel() {
            if (!els.resourceUsageLabel) return;
            els.resourceUsageLabel.textContent = '';
            els.resourceUsageLabel.classList.add('hidden');
            els.resourceUsageLabel.removeAttribute('title');
        }

        function renderFactoryResourceChips(sample) {
            if (!els.factoryResourceChips) return;
            const statusBar = (factoryStatusBarApi && factoryStatusBarApi.buildResourceChips)
                ? factoryStatusBarApi
                : ((global && global.TransubFactoryStatusBar) || {});
            const chips = statusBar.buildResourceChips
                ? statusBar.buildResourceChips(sample)
                : [];
            els.factoryResourceChips.innerHTML = buildFactoryResourceChipsHtml(chips);
        }

        /**
         * Keep last-known GPU when a poll skips nvidia-smi or returns a transient miss,
         * so status chips do not flap back to placeholders while CPU/RAM still update.
         * @param {object|null|undefined} sample
         * @param {boolean} includeGpu
         */
        function mergeResourceSample(sample, includeGpu) {
            if (!sample || typeof sample !== 'object') return sample;
            const next = sample;
            const prevGpu = state.factoryResourceSample?.gpu;
            const hasGpu = next.gpu
                && Number.isFinite(Number(next.gpu.utilPct));
            if (!hasGpu && prevGpu && Number.isFinite(Number(prevGpu.utilPct))) {
                next.gpu = prevGpu;
                // IPC text was built without GPU when includeGpu=false or query missed.
                if (!includeGpu || !String(next.text || '').includes('GPU')) {
                    const parts = [];
                    if (next.cpuPct != null && Number.isFinite(Number(next.cpuPct))) {
                        parts.push(`CPU ${Math.round(Number(next.cpuPct))}%`);
                    }
                    const mem = next.memory;
                    if (mem && Number(mem.totalBytes) > 0) {
                        const used = Number(mem.usedBytes) / (1024 ** 3);
                        const total = Number(mem.totalBytes) / (1024 ** 3);
                        const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—');
                        parts.push(`内存 ${fmt(used)}/${fmt(total)} GB`);
                    }
                    const util = Number(prevGpu.utilPct);
                    parts.push(`GPU ${Math.round(util)}%`);
                    const memTotal = Number(prevGpu.memTotalMiB);
                    if (Number.isFinite(memTotal) && memTotal > 0) {
                        const usedG = Number(prevGpu.memUsedMiB) / 1024;
                        const totalG = memTotal / 1024;
                        parts.push(`显存 ${usedG.toFixed(1)}/${totalG.toFixed(1)} GB`);
                    }
                    next.text = parts.join(' · ');
                }
            }
            return next;
        }

        function setResourceUsageLabel(text) {
            if (!els.resourceUsageLabel) return;
            const t = String(text || '').trim();
            const showLegacy = !!state.running && isShowTaskResourceUsageEnabled();
            if (!t || !showLegacy) {
                clearResourceUsageLabel();
                return;
            }
            els.resourceUsageLabel.textContent = t;
            els.resourceUsageLabel.title = uiTf('整机资源占用（约 5 秒刷新）\n{t}', { t });
            els.resourceUsageLabel.classList.remove('hidden');
        }

        function isDocumentVisible() {
            try {
                if (typeof document === 'undefined') return true;
                return document.visibilityState !== 'hidden';
            } catch {
                return true;
            }
        }

        function isResourceUsageMonitorActive() {
            if (!isDocumentVisible()) return false;
            if (els.factoryStatusBar && isShowTaskResourceUsageEnabled()) return true;
            return !!state.running && isShowTaskResourceUsageEnabled();
        }

        function resolveMonitorIntervalMs() {
            // Idle: slower tick. Running: 5s for CPU/RAM; GPU sampled every other tick.
            return state.running ? RESOURCE_USAGE_INTERVAL_MS : RESOURCE_USAGE_IDLE_INTERVAL_MS;
        }

        function shouldIncludeGpu() {
            if (!state.running) return true;
            // While a job runs, nvidia-smi can stall under GPU load — sample every other poll.
            state._resourceGpuTick = (Number(state._resourceGpuTick) || 0) + 1;
            return state._resourceGpuTick % 2 === 1;
        }

        async function refreshResourceUsageLabel() {
            if (!isResourceUsageMonitorActive()) {
                clearResourceUsageLabel();
                return;
            }
            if (!electron?.transubGetSystemResources) return;
            if (state.resourceUsageInFlight) return;
            state.resourceUsageInFlight = true;
            try {
                const includeGpu = shouldIncludeGpu();
                let sample = await electron.transubGetSystemResources({ includeGpu });
                if (!isResourceUsageMonitorActive()) {
                    clearResourceUsageLabel();
                    return;
                }
                sample = mergeResourceSample(sample, includeGpu);
                state.factoryResourceSample = sample;
                renderFactoryResourceChips(sample);
                syncFactoryEngineStatus();
                const text = String(sample?.text || '').trim();
                if (text) setResourceUsageLabel(text);
                else if (!els.resourceUsageLabel?.textContent && !!state.running && isShowTaskResourceUsageEnabled()) {
                    setResourceUsageLabel('采样中…');
                }
            } catch {
                /* ignore transient IPC errors */
            } finally {
                state.resourceUsageInFlight = false;
            }
        }

        function stopResourceUsageMonitor() {
            if (state.resourceUsageTicker) {
                clearInterval(state.resourceUsageTicker);
                state.resourceUsageTicker = null;
            }
            state.resourceUsageIntervalMs = 0;
            state.resourceUsageInFlight = false;
            // Keep factory chips; only clear legacy progress-line label.
            clearResourceUsageLabel();
        }

        function startResourceUsageTicker() {
            const intervalMs = resolveMonitorIntervalMs();
            if (state.resourceUsageTicker && state.resourceUsageIntervalMs === intervalMs) return;
            if (state.resourceUsageTicker) {
                clearInterval(state.resourceUsageTicker);
                state.resourceUsageTicker = null;
            }
            state.resourceUsageIntervalMs = intervalMs;
            state.resourceUsageTicker = setInterval(() => {
                if (!isResourceUsageMonitorActive()) {
                    stopResourceUsageMonitor();
                    return;
                }
                const nextMs = resolveMonitorIntervalMs();
                if (nextMs !== state.resourceUsageIntervalMs) {
                    startResourceUsageTicker();
                    void refreshResourceUsageLabel();
                    return;
                }
                void refreshResourceUsageLabel();
            }, intervalMs);
        }

        function syncResourceUsageMonitor() {
            if (!isResourceUsageMonitorActive()) {
                stopResourceUsageMonitor();
                return;
            }
            void refreshResourceUsageLabel();
            startResourceUsageTicker();
        }

        function bindResourceUsageSetting() {
            els.showTaskResourceUsageCheck?.addEventListener('change', () => {
                syncResourceUsageMonitor();
                markSettingsDirty(true);
            });
            els.rememberLastOpenDirCheck?.addEventListener('change', () => {
                markSettingsDirty(true);
            });
            try {
                if (typeof document !== 'undefined' && !state._resourceUsageVisibilityBound) {
                    state._resourceUsageVisibilityBound = true;
                    document.addEventListener('visibilitychange', () => {
                        syncResourceUsageMonitor();
                    });
                }
            } catch { /* ignore */ }
        }

        return {
            isShowTaskResourceUsageEnabled,
            clearResourceUsageLabel,
            renderFactoryResourceChips,
            setResourceUsageLabel,
            isResourceUsageMonitorActive,
            refreshResourceUsageLabel,
            stopResourceUsageMonitor,
            syncResourceUsageMonitor,
            bindResourceUsageSetting,
            RESOURCE_USAGE_INTERVAL_MS,
            RESOURCE_USAGE_IDLE_INTERVAL_MS,
        };
    }

    return {
        createResourceUsageUi,
        factoryEscHtml,
        buildFactoryResourceChipsHtml,
        RESOURCE_USAGE_INTERVAL_MS,
        RESOURCE_USAGE_IDLE_INTERVAL_MS,
    };
}));
