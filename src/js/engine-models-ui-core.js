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

    const MODELS_GROUP_FILTERS = Object.freeze(['all', 'asr', 'vad', 'llm', 'separate']);
    const MODELS_STATUS_FILTERS = Object.freeze([
        'all', 'installed', 'available', 'recommended', 'incomplete', 'experimental',
    ]);
    /** @deprecated use MODELS_GROUP_FILTERS + MODELS_STATUS_FILTERS */
    const MODELS_FILTERS = Object.freeze([...MODELS_GROUP_FILTERS, ...MODELS_STATUS_FILTERS.filter((x) => x !== 'all')]);
    const RETIRED_ENGINE_ASR_IDS = new Set(['qwen3-asr-1.7b-ja']);

    function isRetiredMtModelId(id) {
        return /^transub-ja/i.test(String(id || '').trim());
    }

    function normalizeModelsGroupFilter(next) {
        const v = String(next || 'all');
        // GGUF/mt tab removed — fold into LLM 翻译.
        if (v === 'mt') return 'llm';
        return MODELS_GROUP_FILTERS.includes(v) ? v : 'all';
    }

    function normalizeModelsStatusFilter(next) {
        const v = String(next || 'all');
        return MODELS_STATUS_FILTERS.includes(v) ? v : 'all';
    }

    /** @deprecated prefer normalizeModelsGroupFilter / normalizeModelsStatusFilter */
    function normalizeModelsFilter(next) {
        const v = String(next || 'all');
        if (v === 'mt') return 'llm';
        if (MODELS_GROUP_FILTERS.includes(v)) return v;
        if (MODELS_STATUS_FILTERS.includes(v)) return v;
        return 'all';
    }

    /**
     * @param {object} item
     * @param {string} status
     */
    function itemMatchesModelsStatusFilter(item, status) {
        const s = normalizeModelsStatusFilter(status);
        if (s === 'all') return true;
        if (s === 'installed') return !!(item?.installed && !item?.incomplete);
        if (s === 'available') return !item?.installed && !item?.incomplete;
        if (s === 'recommended') return !!item?.recommended;
        if (s === 'incomplete') return !!item?.incomplete;
        if (s === 'experimental') {
            return !!(item?.experimental || item?.lab || item?.source === 'lab');
        }
        return true;
    }

    /**
     * @param {object} item
     * @param {string} group
     */
    function itemMatchesModelsGroupFilter(item, group) {
        const g = normalizeModelsGroupFilter(group);
        if (g === 'all') return true;
        const itemGroup = String(item?.group || '');
        if (g === 'llm') return itemGroup === 'llm' || itemGroup === 'mt';
        return itemGroup === g;
    }

    /**
     * @param {object} item
     * @param {string} filter legacy single filter (group or status)
     */
    function itemMatchesModelsFilter(item, filter) {
        const f = normalizeModelsFilter(filter);
        if (f === 'all') return true;
        if (MODELS_STATUS_FILTERS.includes(f)) return itemMatchesModelsStatusFilter(item, f);
        return itemMatchesModelsGroupFilter(item, f);
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
     * @param {{ filter?: string, group?: string, status?: string, query?: string }} [opts]
     */
    function filterAndSortEnginePickItems(catalog, opts = {}) {
        const items = (Array.isArray(catalog) ? catalog.slice() : []).sort(compareEnginePickItems);
        const legacy = normalizeModelsFilter(opts.filter);
        let group = normalizeModelsGroupFilter(opts.group);
        let status = normalizeModelsStatusFilter(opts.status);
        // Backward compat: single `filter` may be either group or status.
        if (opts.group == null && opts.status == null && legacy !== 'all') {
            if (MODELS_STATUS_FILTERS.includes(legacy)) status = legacy;
            else group = normalizeModelsGroupFilter(legacy);
        }
        const q = String(opts.query || '').trim().toLowerCase();
        return items.filter((item) => {
            if (!itemMatchesModelsGroupFilter(item, group)) return false;
            if (!itemMatchesModelsStatusFilter(item, status)) return false;
            if (!q) return true;
            const hayParts = [
                item.name, item.id, item.note, item.group, item.kind, item.sizeHint, item.ramHint, item.familyLabel,
            ];
            if (item.group === 'separate') hayParts.push('人声分离', 'demucs');
            if (item.group === 'llm') hayParts.push('llm', '推理', 'gguf');
            if (item.experimental || item.lab || item.source === 'lab') {
                hayParts.push('实验', '实验室', 'lab', 'experimental');
            }
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
     * Counts for filter tabs.
     * - Group counts: scoped by current status (and ignore search).
     * - Status counts: scoped by current group.
     * @param {object[]} catalog
     * @param {{ group?: string, status?: string }} [opts]
     */
    function countModelsByFilter(catalog, opts = {}) {
        const group = normalizeModelsGroupFilter(opts.group);
        const status = normalizeModelsStatusFilter(opts.status);
        const list = Array.isArray(catalog) ? catalog : [];
        const counts = {
            all: 0,
            installed: 0,
            available: 0,
            recommended: 0,
            incomplete: 0,
            experimental: 0,
            asr: 0,
            vad: 0,
            llm: 0,
            separate: 0,
        };
        for (const item of list) {
            if (itemMatchesModelsStatusFilter(item, status)) {
                counts.all += 1;
                const g = String(item?.group || '');
                if (g === 'asr' || g === 'vad' || g === 'separate') {
                    counts[g] += 1;
                } else if (g === 'llm' || g === 'mt') {
                    counts.llm += 1;
                }
            }
            if (itemMatchesModelsGroupFilter(item, group)) {
                if (item?.installed && !item?.incomplete) counts.installed += 1;
                if (!item?.installed && !item?.incomplete) counts.available += 1;
                if (item?.recommended) counts.recommended += 1;
                if (item?.incomplete) counts.incomplete += 1;
                if (item?.experimental || item?.lab || item?.source === 'lab') {
                    counts.experimental += 1;
                }
            }
        }
        return counts;
    }

    /**
     * Select filters use kind `mt` for LLM 推理翻译; engine may report `llm`.
     * @param {string} modelKind
     * @param {string} wantKind
     */
    function matchesEngineSelectKind(modelKind, wantKind) {
        const have = String(modelKind || '').trim().toLowerCase();
        const want = String(wantKind || '').trim().toLowerCase();
        if (!want) return true;
        if (have === want) return true;
        if (want === 'mt' && have === 'llm') return true;
        return false;
    }

    /**
     * OR installed flags from managed LLM status into engine `/v1/models` rows.
     * Without this, model library shows「已下载」while translate/retranslate selects
     * still filter out the same ids (engine listed them as not installed / wrong kind).
     * @param {object[]} engineModels
     * @param {object[]} managedInstalledRows rows already filtered to installed
     * @returns {object[]}
     */
    function mergeManagedInstalledIntoEngineModels(engineModels, managedInstalledRows) {
        const list = (Array.isArray(engineModels) ? engineModels : []).map((m) => (
            m && typeof m === 'object' ? { ...m } : m
        )).filter(Boolean);
        const byId = new Map();
        for (const row of list) {
            const id = String(row.id || '').trim();
            if (id) byId.set(id, row);
        }
        for (const src of (Array.isArray(managedInstalledRows) ? managedInstalledRows : [])) {
            const id = String(src?.id || '').trim();
            if (!id) continue;
            const existing = byId.get(id);
            if (existing) {
                existing.installed = true;
                existing.incomplete = false;
                const kind = String(existing.kind || '').trim().toLowerCase();
                if (!kind || kind === 'llm') existing.kind = 'mt';
                if (!existing.name && src.name) existing.name = src.name;
                continue;
            }
            const next = {
                id,
                name: src.name || id,
                kind: 'mt',
                installed: true,
                incomplete: false,
                size_hint_mb: Number(src.size_hint_mb) || 0,
            };
            list.push(next);
            byId.set(id, next);
        }
        return list;
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
     *   modelDisableReason?: (m: object) => string,
     * }} args
     */
    function buildInstalledModelSelectOptionsHtml(args = {}) {
        const esc = typeof args.esc === 'function' ? args.esc : ((s) => String(s ?? ''));
        const formatLabel = typeof args.formatLabel === 'function'
            ? args.formatLabel
            : formatEngineModelOptionLabel;
        const kind = args.kind;
        const disableReasonOf = typeof args.modelDisableReason === 'function'
            ? args.modelDisableReason
            : () => '';
        const list = (Array.isArray(args.models) ? args.models : []).filter((m) => {
            if (!matchesEngineSelectKind(m?.kind, kind) || !m?.installed || m?.incomplete) return false;
            if (typeof args.modelFilter === 'function' && !args.modelFilter(m)) return false;
            return true;
        });
        let want = String(args.selectedId || '');
        const wantBlocked = !!(want && list.some((m) => {
            if (String(m.id || '') !== want) return false;
            return !!String(disableReasonOf(m) || '').trim();
        }));
        if (wantBlocked) want = '';
        const opts = [];
        if (args.allowEmpty) {
            opts.push(`<option value="">${esc(args.emptyLabel || '自动（按源语言）')}</option>`);
        }
        for (const model of list) {
            const id = String(model.id || '');
            if (!id) continue;
            const reason = String(disableReasonOf(model) || '').trim();
            const sel = id === want ? ' selected' : '';
            const disabledAttr = reason ? ' disabled' : '';
            const titleAttr = reason ? ` title="${esc(reason)}"` : '';
            const label = reason
                ? `${formatLabel(model)}（不可用）`
                : formatLabel(model);
            opts.push(`<option value="${esc(id)}"${sel}${disabledAttr}${titleAttr}>${esc(label)}</option>`);
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
            hasWant: !!(want && opts.some((o) => o.includes(`value="${esc(want)}"`) && !o.includes(' disabled'))),
            allowEmpty: !!args.allowEmpty,
            clearedDisabledSelection: wantBlocked,
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

    /** Parse min GB from hints like「建议 ≥16 GB 内存」. */
    function parseMinRamGbFromHint(ramHint) {
        const s = String(ramHint || '');
        const m = s.match(/(?:≥|>=)\s*(\d+(?:\.\d+)?)\s*GB/i);
        if (m) return Number(m[1]) || 0;
        const m2 = s.match(/(\d+(?:\.\d+)?)\s*GB/i);
        return m2 ? (Number(m2[1]) || 0) : 0;
    }

    function parseSizeHintMb(sizeHint, sizeHintMb) {
        const direct = Number(sizeHintMb);
        if (Number.isFinite(direct) && direct > 0) return direct;
        const s = String(sizeHint || '');
        const gb = s.match(/([\d.]+)\s*GB/i);
        if (gb) {
            const n = Number(gb[1]);
            return Number.isFinite(n) && n > 0 ? n * 1024 : 0;
        }
        const mb = s.match(/([\d.]+)\s*MB/i);
        if (mb) {
            const n = Number(mb[1]);
            return Number.isFinite(n) && n > 0 ? n : 0;
        }
        return 0;
    }

    /**
     * Derive a rough runtime budget when catalog has no authored ramHint.
     * Uses ~2× weight size for ASR/MT headroom; tiny VAD stays at 1 GB.
     */
    function deriveRamHintFromSizeMb(sizeHintMb, group) {
        const mb = Number(sizeHintMb) || 0;
        if (!(mb > 0)) return '';
        const weightGb = mb / 1024;
        const g = String(group || '');
        let recommendGb;
        if (g === 'vad') {
            recommendGb = 1;
        } else if (g === 'separate') {
            recommendGb = Math.max(4, Math.ceil(weightGb + 2));
        } else {
            recommendGb = Math.max(2, Math.ceil(weightGb * 2));
        }
        if (g === 'asr' || g === 'llm' || g === 'mt') {
            return `建议 ≥${recommendGb} GB 显存 / 内存`;
        }
        return `建议 ≥${recommendGb} GB 内存`;
    }

    function resolvePickItemRamHint(item = {}) {
        const authored = String(item.ramHint || '').trim();
        if (authored) return authored;
        const mb = parseSizeHintMb(item.sizeHint, item.size_hint_mb ?? item.sizeHintMb);
        return deriveRamHintFromSizeMb(mb, item.group);
    }

    const HARDWARE_FIT_LABELS = Object.freeze({
        over: '负载',
        tight: '高负荷',
        ok: '流畅',
        unknown: '',
    });

    /**
     * Pick the memory pool to compare against a model budget.
     * ASR / LLM / MT / separate prefer VRAM when known; otherwise system RAM.
     * @param {string} group
     * @param {{ systemMemoryGb?: number, vramGb?: number }} hw
     */
    function resolveHardwarePoolGb(group, hw = {}) {
        const sys = Number(hw.systemMemoryGb) || 0;
        const vram = Number(hw.vramGb) || 0;
        const g = String(group || '');
        const prefersGpu = g === 'asr' || g === 'llm' || g === 'mt' || g === 'separate';
        if (prefersGpu && vram > 0) return vram;
        if (sys > 0) return sys;
        if (vram > 0) return vram;
        return 0;
    }

    /**
     * Three-tier hardware fit for model cards.
     * @returns {{
     *   level: 'over'|'tight'|'ok'|'unknown',
     *   label: string,
     *   badgeClass: string,
     *   cardClass: string,
     *   needGb: number,
     *   poolGb: number,
     * }}
     */
    function classifyHardwareFit(item, hw = {}) {
        const ramHint = String(item?.ramHint || '').trim() || resolvePickItemRamHint(item);
        const needGb = parseMinRamGbFromHint(ramHint);
        const poolGb = resolveHardwarePoolGb(item?.group, hw);
        const empty = {
            level: 'unknown',
            label: '',
            badgeClass: '',
            cardClass: '',
            needGb: needGb || 0,
            poolGb: poolGb || 0,
        };
        if (!(needGb > 0) || !(poolGb > 0)) return empty;

        if (needGb > poolGb) {
            return {
                level: 'over',
                label: HARDWARE_FIT_LABELS.over,
                badgeClass: 'is-fit-over',
                cardClass: 'is-fit-over',
                needGb,
                poolGb,
            };
        }
        const headroom = Math.max(0, poolGb - 2);
        if (needGb > headroom || needGb > poolGb * 0.7) {
            return {
                level: 'tight',
                label: HARDWARE_FIT_LABELS.tight,
                badgeClass: 'is-fit-tight',
                cardClass: 'is-fit-tight',
                needGb,
                poolGb,
            };
        }
        return {
            level: 'ok',
            label: HARDWARE_FIT_LABELS.ok,
            badgeClass: 'is-fit-ok',
            cardClass: 'is-fit-ok',
            needGb,
            poolGb,
        };
    }

    function isRamTightForModel(item, systemMemoryGb, hwExtra = {}) {
        const hw = {
            systemMemoryGb: Number(systemMemoryGb) || Number(hwExtra.systemMemoryGb) || 0,
            vramGb: Number(hwExtra.vramGb) || 0,
        };
        const fit = classifyHardwareFit(item, hw);
        return fit.level === 'over' || fit.level === 'tight';
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
                || model.source === 'lab'
                || model.experimental === true
                || model.lab === true
                ? 'llm'
                : (rawKind === 'demucs' || rawKind === 'separate'
                    ? 'separate'
                    : (rawKind === 'asr' || rawKind === 'mt' || rawKind === 'vad' ? rawKind : rawKind || 'other'));
            const sizeHint = model.sizeHint
                || (Number(model.size_hint_mb) > 0 ? `约 ${model.size_hint_mb} MB` : '');
            const ramHint = resolvePickItemRamHint({
                ramHint: model.ramHint || managedEntry?.ramHint || '',
                sizeHint,
                size_hint_mb: model.size_hint_mb,
                group,
            });
            const experimental = model.experimental === true
                || model.lab === true
                || model.source === 'lab'
                || managedEntry?.experimental === true
                || managedEntry?.lab === true;
            return {
                id,
                name: String(model.name || id),
                kind: rawKind || (group === 'llm' ? 'mt' : ''),
                group,
                source: model.source
                    || (experimental
                        ? 'lab'
                        : (isSakura(id) ? 'sakura' : (managedEntry ? 'managed' : 'engine'))),
                hubId: String(model.hubId || model.hub_id || managedEntry?.hubId || '').trim(),
                installed: !!model.installed,
                incomplete: !!model.incomplete,
                shipped: !!model.shipped || !!model.bundled,
                recommended: model.recommended === true,
                experimental,
                lab: experimental,
                sizeHint: String(sizeHint || ''),
                ramHint: String(ramHint || ''),
                note: String(model.note || ''),
                familyLabel: String(model.familyLabel || managedEntry?.familyLabel || ''),
                paramBillion: Number(model.paramBillion ?? managedEntry?.paramBillion) || 0,
                proScale: experimental
                    ? false
                    : (model.proScale === true
                        || !!(managedEntry && isProScale(managedEntry))),
                freePipelineTranslate: model.freePipelineTranslate === true
                    || !!managedEntry?.freePipelineTranslate,
                translateOnly: model.translateOnly === true
                    || !!managedEntry?.translateOnly
                    || isSakura(id),
            };
        }).filter((m) => m.id && m.id !== demucsModelId
            && !RETIRED_ENGINE_ASR_IDS.has(m.id)
            && !isRetiredMtModelId(m.id));
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
            const sizeHint = String(entry.sizeHint || '');
            const ramHint = resolvePickItemRamHint({
                ramHint: entry.ramHint,
                sizeHint,
                size_hint_mb: entry.size_hint_mb,
                group: 'llm',
            });
            const experimental = entry.experimental === true
                || entry.lab === true
                || String(entry.family || '') === 'lab';
            return {
                id,
                name: String(entry.name || id),
                kind: 'mt',
                group: 'llm',
                source: experimental ? 'lab' : (isSakura(id) ? 'sakura' : 'managed'),
                installed: !!entry.installed,
                incomplete: false,
                recommended: !!entry.recommended,
                experimental,
                lab: experimental,
                sizeHint,
                ramHint,
                note: String(entry.note || ''),
                familyLabel: String(entry.familyLabel || entry.family || ''),
                paramBillion: Number(entry.paramBillion) || 0,
                proScale: experimental ? false : (!!entry.proScale || !!isProScale(entry)),
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
                const sizeHint = existing.sizeHint || item.sizeHint || '';
                const ramHint = item.ramHint || existing.ramHint
                    || resolvePickItemRamHint({
                        ramHint: '',
                        sizeHint,
                        group: 'llm',
                    });
                byId.set(item.id, {
                    ...existing,
                    group: 'llm',
                    source: existing.source === 'engine' ? item.source : (existing.source || item.source),
                    installed: !!(existing.installed || item.installed),
                    name: existing.name || item.name,
                    note: existing.note || item.note,
                    sizeHint,
                    ramHint,
                    familyLabel: item.familyLabel || existing.familyLabel || '',
                    paramBillion: item.paramBillion || existing.paramBillion || 0,
                    proScale: !!(item.proScale || existing.proScale),
                    freePipelineTranslate: !!(item.freePipelineTranslate || existing.freePipelineTranslate),
                    translateOnly: !!(item.translateOnly || existing.translateOnly),
                    recommended: !!(existing.recommended || item.recommended),
                    experimental: !!(existing.experimental || item.experimental || existing.lab || item.lab),
                    lab: !!(existing.lab || item.lab || existing.experimental || item.experimental),
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
            ramHint: '建议 ≥4 GB 显存 / 内存',
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

    /**
     * Whether the model library card should show a delete button.
     * @param {object} item pick-catalog row
     * @param {{ demucsModelId?: string }} [deps]
     */
    function canShowDeleteButtonForPickItem(item = {}, deps = {}) {
        const id = String(item.id || '').trim();
        const demucsId = String(deps.demucsModelId || 'demucs');
        if (!id || id === demucsId) return false;
        if (item.shipped) return false;
        if (!item.installed && !item.incomplete) return false;
        return true;
    }

    /**
     * @param {object} item
     * @param {{ demucsModelId?: string }} [deps]
     */
    function explainDeleteBlockedForPickItem(item = {}, deps = {}) {
        const id = String(item.id || '').trim();
        const demucsId = String(deps.demucsModelId || 'demucs');
        if (!id) return '未知模型';
        if (id === demucsId) return 'Demucs 为 pip 组件，不能在此删除';
        if (item.shipped) return '内置模型不可删除';
        if (!item.installed && !item.incomplete) return '模型未下载';
        return '';
    }

    /** @param {object} item */
    function buildDeleteModelConfirmCopy(item = {}) {
        const name = String(item.name || item.id || '模型').trim();
        const shippedNote = item.shipped ? '\n\n此为发行内置模型，不可删除。' : '';
        return {
            title: '删除模型',
            message: (
                `确定删除「${name}」？\n\n`
                + '将移除本机已下载的文件以释放磁盘空间。'
                + '若该模型正被任务或设置选用，删除后需重新下载或改选其它模型。'
                + shippedNote
            ),
            primaryLabel: '删除',
            secondaryLabel: '取消',
            danger: true,
        };
    }

    return {
        PICK_GROUP_ORDER,
        MODELS_FILTERS,
        MODELS_GROUP_FILTERS,
        MODELS_STATUS_FILTERS,
        normalizeModelsFilter,
        normalizeModelsGroupFilter,
        normalizeModelsStatusFilter,
        itemMatchesModelsFilter,
        itemMatchesModelsGroupFilter,
        itemMatchesModelsStatusFilter,
        engineModelKindLabel,
        engineModelGroupLabel,
        formatEngineModelOptionLabel,
        formatEngineDownloadError,
        clampDownloadProgressPct,
        pushDownloadLogLine,
        compareEnginePickItems,
        filterAndSortEnginePickItems,
        formatModelsSummary,
        countModelsByFilter,
        matchesEngineSelectKind,
        mergeManagedInstalledIntoEngineModels,
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
        canShowDeleteButtonForPickItem,
        explainDeleteBlockedForPickItem,
        buildDeleteModelConfirmCopy,
        parseMinRamGbFromHint,
        parseSizeHintMb,
        deriveRamHintFromSizeMb,
        resolvePickItemRamHint,
        HARDWARE_FIT_LABELS,
        resolveHardwarePoolGb,
        classifyHardwareFit,
        isRamTightForModel,
    };
}));
