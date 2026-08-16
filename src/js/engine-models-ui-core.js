/**
 * Engine models settings UI helpers (pure — no DOM).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineModelsUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineModelsUiFactory() {
    const PICK_GROUP_ORDER = Object.freeze({
        asr: 0,
        vad: 1,
        mt: 2,
        llm: 3,
        separate: 4,
    });

    const MODELS_FILTERS = Object.freeze(['all', 'asr', 'vad', 'mt', 'llm', 'separate']);

    function normalizeModelsFilter(next) {
        const v = String(next || 'all');
        return MODELS_FILTERS.includes(v) ? v : 'all';
    }

    function engineModelKindLabel(kind) {
        if (kind === 'asr') return 'ASR';
        if (kind === 'mt') return 'MT';
        if (kind === 'vad') return 'VAD';
        if (kind === 'demucs' || kind === 'separate') return '人声分离';
        return String(kind || '').toUpperCase() || '模型';
    }

    function formatEngineModelOptionLabel(model) {
        return String(model?.name || model?.id || '').trim() || 'unknown';
    }

    /**
     * @param {unknown} raw
     * @param {{ hfEndpoint?: string }} [opts]
     */
    function formatEngineDownloadError(raw, opts = {}) {
        const msg = String(raw || '').trim();
        if (!msg) return '模型下载失败';
        if (
            msg.includes('无法连接模型仓库')
            || msg.includes('浏览器能打开镜像站')
            || msg.includes('文件实际跳转到')
            || msg.includes('Hub 仓库不存在')
            || msg.includes('门禁模型')
            || msg.includes('authorized list')
            || /gated repo/i.test(msg)
        ) {
            return msg;
        }
        const lower = msg.toLowerCase();
        if (
            lower.includes('numba')
            && (lower.includes('failed to build') || lower.includes('getting requirements to build'))
        ) {
            return (
                '安装依赖失败：numba 无法源码编译。'
                + '请改用 numpy 2.4.x（不要装 2.5+），并优先安装预编译的 numba / llvmlite .whl。'
                + ` 原始错误：${msg.slice(0, 400)}`
            );
        }
        const isConnectivity = (
            lower.includes('connecttimeout')
            || lower.includes('connecterror')
            || msg.includes('10060')
            || msg.includes('10054')
            || lower.includes('timed out')
            || lower.includes('timeout')
            || lower.includes('connection attempt failed')
            || lower.includes('connection reset')
            || lower.includes('econnreset')
            || msg.includes('远程主机强迫关闭')
            || (lower.includes('hub') && lower.includes('internet connection'))
            || (lower.includes('snapshot folder') && lower.includes('internet'))
        );
        if (!isConnectivity) return msg;

        const ep = String(opts.hfEndpoint || '').trim();
        const onMirror = /hf-mirror\.com/i.test(ep) || /hf-mirror\.com/i.test(msg);
        if (onMirror || /已使用镜像|当前已使用镜像/.test(msg)) {
            return (
                `无法连接模型仓库（连接被重置/超时）。当前已使用镜像 ${ep || 'https://hf-mirror.com'}。`
                + '请尝试切换或关闭「设置→网络」代理后重试；浏览器能下不等于软件内下载链路可用。'
            );
        }
        return (
            `无法连接模型仓库（网络中断/超时）。请到「设置 → 网络」将 Hugging Face 镜像设为`
            + ` https://hf-mirror.com（当前：${ep || '官方 Hub'}），保存设置后重试下载。`
        );
    }

    function clampDownloadProgressPct(pct) {
        const n = Number(pct);
        const finite = Number.isFinite(n);
        const width = finite ? Math.max(0, Math.min(100, n)) : 0;
        return { width, finite, label: finite ? `${Math.round(width)}%` : '…' };
    }

    /**
     * Ring-buffer push for download log lines.
     * @returns {string[]} same array mutated
     */
    function pushDownloadLogLine(lines, text, maxLines = 80) {
        const arr = Array.isArray(lines) ? lines : [];
        const line = String(text || '').trim();
        if (!line) return arr;
        arr.push(line);
        while (arr.length > maxLines) arr.shift();
        return arr;
    }

    function compareEnginePickItems(a, b) {
        if (!!b.recommended !== !!a.recommended) return b.recommended ? 1 : -1;
        if (!!b.installed !== !!a.installed) return b.installed ? 1 : -1;
        const ga = String(a.group || '');
        const gb = String(b.group || '');
        if (ga !== gb) {
            return (PICK_GROUP_ORDER[ga] ?? 9) - (PICK_GROUP_ORDER[gb] ?? 9);
        }
        const ba = Number(a.paramBillion) || 0;
        const bb = Number(b.paramBillion) || 0;
        if (ga === 'llm' && ba !== bb) return ba - bb;
        return String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh');
    }

    /**
     * @param {object[]} catalog
     * @param {{ filter?: string, query?: string }} [opts]
     */
    function filterAndSortEnginePickItems(catalog, opts = {}) {
        const items = (Array.isArray(catalog) ? catalog.slice() : []).sort(compareEnginePickItems);
        const filter = normalizeModelsFilter(opts.filter);
        const q = String(opts.query || '').trim().toLowerCase();
        return items.filter((item) => {
            if (filter !== 'all' && String(item.group || '') !== filter) return false;
            if (!q) return true;
            const hayParts = [
                item.name, item.id, item.note, item.group, item.kind, item.sizeHint, item.familyLabel,
            ];
            if (item.group === 'separate') hayParts.push('人声分离', 'demucs');
            if (item.group === 'llm') hayParts.push('llm', '推理', 'gguf');
            const hay = hayParts.map((x) => String(x || '').toLowerCase()).join(' ');
            return hay.includes(q);
        });
    }

    function formatModelsSummary({ total, visible }) {
        const t = Number(total) || 0;
        const v = Number(visible) || 0;
        if (!t) return '检测引擎后显示';
        if (v === t) return `共 ${t} 个模型`;
        return `显示 ${v} / ${t}`;
    }

    /**
     * Build <option> HTML for installed-model selects.
     * @param {{
     *   models: object[],
     *   kind: string,
     *   selectedId?: string,
     *   allowEmpty?: boolean,
     *   emptyLabel?: string,
     *   esc: (s: string) => string,
     *   formatLabel?: (m: object) => string,
     *   modelFilter?: (m: object) => boolean,
     * }} args
     */
    function buildInstalledModelSelectOptionsHtml(args = {}) {
        const esc = typeof args.esc === 'function' ? args.esc : ((s) => String(s ?? ''));
        const formatLabel = typeof args.formatLabel === 'function'
            ? args.formatLabel
            : formatEngineModelOptionLabel;
        const kind = args.kind;
        const list = (Array.isArray(args.models) ? args.models : []).filter((m) => {
            if (m?.kind !== kind || !m?.installed || m?.incomplete) return false;
            if (typeof args.modelFilter === 'function' && !args.modelFilter(m)) return false;
            return true;
        });
        const want = String(args.selectedId || '');
        const opts = [];
        if (args.allowEmpty) {
            opts.push(`<option value="">${esc(args.emptyLabel || '自动（按源语言）')}</option>`);
        }
        for (const model of list) {
            const id = String(model.id || '');
            if (!id) continue;
            const sel = id === want ? ' selected' : '';
            opts.push(`<option value="${esc(id)}"${sel}>${esc(formatLabel(model))}</option>`);
        }
        if (want && !list.some((m) => String(m.id || '') === want)) {
            opts.push(`<option value="${esc(want)}" selected>${esc(want)}（未下载）</option>`);
        }
        if (!opts.length) {
            opts.push('<option value="">（暂无已下载模型）</option>');
        }
        return {
            html: opts.join(''),
            want,
            hasWant: !!(want && opts.some((o) => o.includes(`value="${esc(want)}"`))),
            allowEmpty: !!args.allowEmpty,
        };
    }

    /**
     * Throttle policy for in-place download progress log lines.
     * @returns {'skip'|'reuse'|'append'}
     */
    function decideEngineDlProgressLogAction({
        force = false,
        line = '',
        lastText = '',
        canReuse = false,
        now = Date.now(),
        lastAt = 0,
    } = {}) {
        const text = String(line || '').trim();
        if (!text) return 'skip';
        if (!force && text === lastText && canReuse) return 'skip';
        if (!force && !canReuse && now - lastAt < 1200) return 'skip';
        if (!force && canReuse && now - lastAt < 400) return 'reuse';
        if (canReuse && !force) return 'reuse';
        return 'append';
    }

    /**
     * @param {object} res engine validate result
     * @param {{
     *   installPath?: string,
     *   gpuStatus?: string,
     *   models?: object[],
     *   demucs?: object|null,
     * }} [ctx]
     */
    function formatEngineTestResultMessage(res, ctx = {}) {
        if (!res?.ok) {
            const lines = [
                '检测未通过。',
                '',
                String(res?.error || '引擎未就绪').trim(),
            ];
            if (res?.baseUrl) lines.push(`地址：${res.baseUrl}`);
            const path = String(ctx.installPath || '').trim();
            if (path) lines.push(`目录：${path}`);
            return lines.filter(Boolean).join('\n');
        }
        const ver = String(res.version || res.health?.engineVersion || '').trim();
        const stub = res.health?.stub ? '（stub）' : '';
        const lines = [
            '引擎已就绪。',
            '',
            ver ? `版本：${ver}${stub}` : null,
            res.baseUrl ? `地址：${res.baseUrl}` : null,
            res.spawned ? '服务：本次已自动启动' : '服务：已在运行',
        ];
        const gpu = String(ctx.gpuStatus || '').trim();
        if (gpu) lines.push(`GPU：${gpu}`);
        const models = Array.isArray(ctx.models) ? ctx.models : [];
        if (models.length) {
            const installed = models.filter((m) => m?.installed).length;
            lines.push(`模型目录：共 ${models.length} 个` + (installed ? `，已安装 ${installed} 个` : ''));
        }
        const demucs = ctx.demucs;
        if (demucs && (demucs.status || demucs.hint || demucs.ok != null)) {
            const status = String(demucs.status || '').trim();
            const demucsHint = String(demucs.hint || demucs.message || '').trim();
            const ready = status === 'ready';
            lines.push(
                demucsHint
                    ? `人声分离：${demucsHint}`
                    : (ready ? '人声分离：Demucs 可用' : '人声分离：Demucs 未安装'),
            );
        }
        const path = String(ctx.installPath || '').trim();
        if (path) lines.push(`目录：${path}`);
        return lines.filter((line) => line != null).join('\n');
    }

    function engineModelGroupLabel(group) {
        if (group === 'asr') return 'ASR语音识别';
        if (group === 'mt') return 'MT机器翻译';
        if (group === 'llm') return 'LLM推理翻译';
        if (group === 'vad') return 'VAD语音活动检测';
        if (group === 'separate') return '人声分离';
        return engineModelKindLabel(group);
    }

    /**
     * @param {object[]} models
     * @param {{
     *   demucsModelId?: string,
     *   isSakuraMtModelId?: (id: string) => boolean,
     *   findManagedLlmCatalogEntry?: (id: string) => object|null,
     *   isProScaleModel?: (entry: object) => boolean,
     * }} [deps]
     */
    function normalizeEnginePickCatalog(models, deps = {}) {
        const demucsModelId = String(deps.demucsModelId || 'demucs');
        const isSakura = deps.isSakuraMtModelId || (() => false);
        const findManaged = deps.findManagedLlmCatalogEntry || (() => null);
        const isProScale = deps.isProScaleModel || (() => false);
        const items = Array.isArray(models) ? models.slice() : [];
        return items.map((model) => {
            const id = String(model.id || '').trim();
            const rawKind = String(model.kind || '').toLowerCase();
            const managedEntry = findManaged(id);
            const group = (rawKind === 'mt' && (isSakura(id) || managedEntry))
                || model.group === 'llm'
                || model.source === 'managed'
                ? 'llm'
                : (rawKind === 'demucs' || rawKind === 'separate'
                    ? 'separate'
                    : (rawKind === 'asr' || rawKind === 'mt' || rawKind === 'vad' ? rawKind : rawKind || 'other'));
            const sizeHint = model.sizeHint
                || (Number(model.size_hint_mb) > 0 ? `约 ${model.size_hint_mb} MB` : '');
            return {
                id,
                name: String(model.name || id),
                kind: rawKind || (group === 'llm' ? 'mt' : ''),
                group,
                source: model.source
                    || (isSakura(id) ? 'sakura' : (managedEntry ? 'managed' : 'engine')),
                hubId: String(model.hubId || model.hub_id || managedEntry?.hubId || '').trim(),
                installed: !!model.installed,
                incomplete: !!model.incomplete,
                shipped: !!model.shipped || !!model.bundled,
                recommended: model.recommended === true,
                sizeHint: String(sizeHint || ''),
                note: String(model.note || ''),
                familyLabel: String(model.familyLabel || managedEntry?.familyLabel || ''),
                paramBillion: Number(model.paramBillion ?? managedEntry?.paramBillion) || 0,
                proScale: model.proScale === true
                    || !!(managedEntry && isProScale(managedEntry)),
                freePipelineTranslate: model.freePipelineTranslate === true
                    || !!managedEntry?.freePipelineTranslate,
                translateOnly: model.translateOnly === true
                    || !!managedEntry?.translateOnly
                    || isSakura(id),
            };
        }).filter((m) => m.id && m.id !== demucsModelId);
    }

    /**
     * @param {object[]|null} statusCatalog
     * @param {{
     *   entitled?: boolean,
     *   isSakuraMtModelId?: (id: string) => boolean,
     *   listCatalogVisible?: (opts: object) => object[],
     *   isProScaleModel?: (entry: object) => boolean,
     * }} [deps]
     */
    function buildManagedLlmPickItems(statusCatalog = null, deps = {}) {
        const isSakura = deps.isSakuraMtModelId || (() => false);
        const isProScale = deps.isProScaleModel || (() => false);
        let rows = Array.isArray(statusCatalog) ? statusCatalog.slice() : null;
        if (!rows?.length && typeof deps.listCatalogVisible === 'function') {
            rows = deps.listCatalogVisible({ entitled: !!deps.entitled });
        }
        if (!rows?.length) return [];
        return rows.map((entry) => {
            const id = String(entry.id || '').trim();
            if (!id) return null;
            return {
                id,
                name: String(entry.name || id),
                kind: 'mt',
                group: 'llm',
                source: isSakura(id) ? 'sakura' : 'managed',
                installed: !!entry.installed,
                incomplete: false,
                recommended: !!entry.recommended,
                sizeHint: String(entry.sizeHint || ''),
                note: String(entry.note || ''),
                familyLabel: String(entry.familyLabel || entry.family || ''),
                paramBillion: Number(entry.paramBillion) || 0,
                proScale: !!entry.proScale || !!isProScale(entry),
                freePipelineTranslate: !!entry.freePipelineTranslate,
                translateOnly: !!entry.translateOnly || isSakura(id),
            };
        }).filter(Boolean);
    }

    function mergeManagedLlmIntoPickCatalog(engineItems, managedItems) {
        const byId = new Map();
        for (const item of (Array.isArray(engineItems) ? engineItems : [])) {
            if (!item?.id) continue;
            byId.set(item.id, { ...item });
        }
        for (const item of (Array.isArray(managedItems) ? managedItems : [])) {
            if (!item?.id) continue;
            const existing = byId.get(item.id);
            if (existing) {
                byId.set(item.id, {
                    ...existing,
                    group: 'llm',
                    source: existing.source === 'engine' ? item.source : (existing.source || item.source),
                    installed: !!(existing.installed || item.installed),
                    name: existing.name || item.name,
                    note: existing.note || item.note,
                    sizeHint: existing.sizeHint || item.sizeHint,
                    familyLabel: item.familyLabel || existing.familyLabel || '',
                    paramBillion: item.paramBillion || existing.paramBillion || 0,
                    proScale: !!(item.proScale || existing.proScale),
                    freePipelineTranslate: !!(item.freePipelineTranslate || existing.freePipelineTranslate),
                    translateOnly: !!(item.translateOnly || existing.translateOnly),
                    recommended: !!(existing.recommended || item.recommended),
                });
            } else {
                byId.set(item.id, { ...item, group: 'llm' });
            }
        }
        return [...byId.values()];
    }

    function buildDemucsPickItem(probe = {}, demucsModelId = 'demucs') {
        const status = String(probe?.status || '').trim();
        const hint = String(probe?.hint || '').trim();
        const ver = probe?.version ? `v${probe.version}` : '';
        const fullyReady = status === 'ready';
        const cpuUsable = status === 'partial' || status === 'need_torch_cuda';
        const installed = fullyReady || cpuUsable;
        const incomplete = cpuUsable;
        let note = '开启「常规 → 影视音频增强」前请先下载。pip 安装 Demucs；有 GPU 时会补齐 CUDA PyTorch。';
        if (hint || ver) note = [hint || status, ver].filter(Boolean).join(' · ');
        else if (status === 'partial') note = 'Demucs 可用（CPU）；建议补齐 CUDA PyTorch';
        else if (status === 'need_torch_cuda') note = '已装 Demucs，建议补齐 CUDA PyTorch';
        else if (fullyReady && ver) note = ['已就绪', ver].filter(Boolean).join(' · ');
        return {
            id: demucsModelId,
            name: 'Demucs（人声分离）',
            kind: 'demucs',
            group: 'separate',
            installed,
            incomplete,
            selected: false,
            recommended: false,
            sizeHint: 'pip 包',
            note,
        };
    }

    /** True when Demucs can run (GPU ready or CPU fallback). */
    function isDemucsRuntimeUsable(probe = {}) {
        if (!probe || probe.ok === false) return false;
        const status = String(probe.status || '').trim();
        return status === 'ready' || status === 'partial' || status === 'need_torch_cuda';
    }

    /** True only when CUDA Demucs path is fully ready. */
    function isDemucsFullyReady(probe = {}) {
        if (!probe || probe.ok === false) return false;
        return String(probe.status || '').trim() === 'ready';
    }

    function mergeDemucsPickItem(items, probe = {}, demucsModelId = 'demucs') {
        const list = Array.isArray(items) ? items.slice() : [];
        list.push(buildDemucsPickItem(probe, demucsModelId));
        return list;
    }

    return {
        PICK_GROUP_ORDER,
        MODELS_FILTERS,
        normalizeModelsFilter,
        engineModelKindLabel,
        engineModelGroupLabel,
        formatEngineModelOptionLabel,
        formatEngineDownloadError,
        clampDownloadProgressPct,
        pushDownloadLogLine,
        compareEnginePickItems,
        filterAndSortEnginePickItems,
        formatModelsSummary,
        buildInstalledModelSelectOptionsHtml,
        decideEngineDlProgressLogAction,
        formatEngineTestResultMessage,
        normalizeEnginePickCatalog,
        buildManagedLlmPickItems,
        mergeManagedLlmIntoPickCatalog,
        buildDemucsPickItem,
        mergeDemucsPickItem,
        isDemucsRuntimeUsable,
        isDemucsFullyReady,
    };
}));
