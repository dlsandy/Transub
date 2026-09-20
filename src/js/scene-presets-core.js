/**
 * Scene presets workspace — pure helpers (browser + Node).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubScenePresetsCore = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function scenePresetsCoreFactory() {
    /** Stable group keys (i18n via GROUP_LABELS). */
    const GROUP_ORDER = Object.freeze(['ja', 'ko', 'western', 'zh', 'talk', 'other']);

    /** Chinese source labels for uiTx / catalogs. */
    const GROUP_LABELS = Object.freeze({
        ja: '日剧/动漫',
        ko: '韩剧',
        western: '欧美剧',
        zh: '华语片',
        talk: '对白',
        other: '其他',
    });

    /** Legacy Chinese group names → stable keys. */
    const LEGACY_GROUP_MAP = Object.freeze({
        软声: 'ja',
        动漫: 'ja',
        日剧: 'ja',
        '日剧/动漫': 'ja',
        影视: 'western',
        电影: 'western',
        对话: 'talk',
        对白: 'talk',
        韩剧: 'ko',
        欧美剧: 'western',
        华语片: 'zh',
        自定义: 'other',
        其他: 'other',
    });

    const FILTER_ALL = 'all';
    const SECONDARY_BUILTIN = 'builtin';
    const SECONDARY_CUSTOM = 'custom';
    /** @deprecated Use SECONDARY_BUILTIN */
    const SECONDARY_PRIMARY = SECONDARY_BUILTIN;
    /** @deprecated Use SECONDARY_CUSTOM — old "all variants" maps to builtin on load */
    const SECONDARY_ALL = SECONDARY_BUILTIN;
    const DEFAULT_DETAIL_WIDTH = 420;
    const MIN_DETAIL_WIDTH = 280;
    const MIN_LIST_WIDTH = 240;
    const DETAIL_SPLITTER_WIDTH = 6;

    /** Keys owned by task / MT chips — never store on scene presets. */
    const PRESET_SKIP_KEYS = Object.freeze([
        'task',
        'translateMode',
        'engineMtModel',
        'engineLlmMtModel',
        'glossaryMtEnabled',
        'sakuraNsfwPrompt',
        'activePresetId',
    ]);

    /**
     * Editable option fields shown in the scenes detail panel.
     * type: select | number | checkbox | text | model-select
     */
    const EDITABLE_OPTION_FIELDS = Object.freeze([
        {
            key: 'language',
            label: '语种',
            type: 'select',
            options: [
                { value: 'auto', label: '自动检测' },
                { value: 'ja', label: '日语 (ja)' },
                { value: 'zh', label: '中文 (zh)' },
                { value: 'en', label: '英语 (en)' },
                { value: 'ko', label: '韩语 (ko)' },
                { value: 'yue', label: '粤语 (yue)' },
            ],
        },
        {
            key: 'device',
            label: '设备',
            type: 'select',
            options: [
                { value: 'cuda', label: 'CUDA' },
                { value: 'cpu', label: 'CPU' },
            ],
        },
        { key: 'engineAsrModel', label: 'ASR 模型', type: 'model-select', modelKind: 'asr' },
        { key: 'engineVadModel', label: 'VAD 模型', type: 'model-select', modelKind: 'vad' },
        {
            key: 'contentProfile',
            label: '内容画像',
            type: 'select',
            options: [
                { value: 'av_soft', label: '软声' },
                { value: 'film', label: '影视' },
                { value: 'talk', label: '对话' },
                { value: 'unknown', label: '未识别' },
            ],
        },
        { key: 'vadEnabled', label: '启用 VAD', type: 'checkbox' },
        { key: 'vadSensitive', label: '灵敏检出', type: 'checkbox' },
        { key: 'vadAggressive', label: '更激进切分', type: 'checkbox' },
        { key: 'vadThreshold', label: '检测阈值', type: 'number', min: 0.1, max: 0.9, step: 0.05 },
        { key: 'vadMinSpeechDurationMs', label: '最小语音 (ms)', type: 'number', min: 0, max: 5000, step: 50 },
        { key: 'vadMinSilenceDurationMs', label: '最小静音 (ms)', type: 'number', min: 0, max: 5000, step: 50 },
        { key: 'vadSpeechPadMs', label: '语音填充 (ms)', type: 'number', min: 0, max: 2000, step: 50 },
        { key: 'vadMaxSingleSegmentMs', label: '最大单段 (ms)', type: 'number', min: 5000, max: 60000, step: 1000 },
        { key: 'hallucinationSilenceThreshold', label: '幻觉静音 (秒)', type: 'number', min: 0, max: 30, step: 0.5, emptyOk: true },
        { key: 'beamSize', label: '集束宽度', type: 'number', min: 1, max: 20, step: 1 },
        { key: 'audioLightDenoise', label: '轻度降噪', type: 'checkbox' },
        { key: 'filmAudioEnhance', label: '影视音频增强', type: 'checkbox' },
        { key: 'filmVadPreset', label: '影视 VAD 预设', type: 'checkbox' },
        { key: 'timingAlign', label: '时间轴对齐', type: 'checkbox' },
        {
            key: 'timingAlignModel',
            label: '对齐模型',
            type: 'select',
            options: [
                { value: 'ten', label: 'TEN' },
                { value: 'firered', label: 'FireRed' },
            ],
        },
    ]);

    function normalizeGroupKey(raw, opts = {}) {
        const g = String(raw || '').trim();
        if (!g) return opts.builtin ? 'other' : 'talk';
        if (GROUP_ORDER.includes(g)) return g;
        if (LEGACY_GROUP_MAP[g]) return LEGACY_GROUP_MAP[g];
        return g;
    }

    function groupLabel(key) {
        const k = normalizeGroupKey(key);
        return GROUP_LABELS[k] || k;
    }

    function groupOf(preset) {
        return normalizeGroupKey(preset?.group, { builtin: !!preset?.builtin });
    }

    function normalizeSecondary(raw) {
        const s = String(raw || '').trim();
        if (s === SECONDARY_CUSTOM || s === 'custom') return SECONDARY_CUSTOM;
        // Legacy primary/all → builtin
        return SECONDARY_BUILTIN;
    }

    function normalizeFilter(raw) {
        const f = String(raw || '').trim() || FILTER_ALL;
        if (f === FILTER_ALL) return FILTER_ALL;
        return normalizeGroupKey(f);
    }

    function displayTitle(preset) {
        return String(preset?.name || preset?.id || '').trim() || '—';
    }

    function displayBlurb(preset) {
        return String(preset?.description || preset?.sceneBlurb || '').trim();
    }

    function isBuiltinPreset(preset) {
        return !!(preset && preset.builtin);
    }

    function canEditPreset(preset) {
        return !!(preset && preset.id && !preset.builtin);
    }

    function matchesQuery(preset, query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return true;
        const hay = [
            preset?.id,
            preset?.name,
            preset?.scene,
            preset?.sceneBlurb,
            preset?.description,
            groupOf(preset),
            groupLabel(groupOf(preset)),
        ].map((x) => String(x || '').toLowerCase()).join('\n');
        return hay.includes(q);
    }

    function filterPresets(presets, filter, secondary, query) {
        const list = Array.isArray(presets) ? presets : [];
        const f = normalizeFilter(filter);
        const sec = normalizeSecondary(secondary);
        return list.filter((p) => {
            if (!p?.id) return false;
            if (f !== FILTER_ALL && groupOf(p) !== f) return false;
            if (sec === SECONDARY_BUILTIN && !isBuiltinPreset(p)) return false;
            if (sec === SECONDARY_CUSTOM && isBuiltinPreset(p)) return false;
            return matchesQuery(p, query);
        });
    }

    function countByGroup(presets) {
        const list = Array.isArray(presets) ? presets : [];
        const counts = Object.create(null);
        counts[FILTER_ALL] = 0;
        for (const p of list) {
            if (!p?.id) continue;
            counts[FILTER_ALL] += 1;
            const g = groupOf(p);
            counts[g] = (counts[g] || 0) + 1;
        }
        return counts;
    }

    function countSecondary(presets, filter) {
        const list = Array.isArray(presets) ? presets : [];
        const f = normalizeFilter(filter);
        let builtin = 0;
        let custom = 0;
        for (const p of list) {
            if (!p?.id) continue;
            if (f !== FILTER_ALL && groupOf(p) !== f) continue;
            if (isBuiltinPreset(p)) builtin += 1;
            else custom += 1;
        }
        return {
            builtin,
            custom,
            // Back-compat aliases used by older UI bindings
            primary: builtin,
            all: builtin + custom,
        };
    }

    function orderedGroupKeys(presets) {
        const counts = countByGroup(presets);
        const known = GROUP_ORDER.filter((g) => (counts[g] || 0) > 0);
        const extras = Object.keys(counts)
            .filter((k) => k !== FILTER_ALL && !GROUP_ORDER.includes(k) && (counts[k] || 0) > 0)
            .sort();
        return [...known, ...extras];
    }

    function clampDetailWidth(width, hostWidth = 0) {
        const w = Number(width);
        const host = Number(hostWidth);
        let next = Number.isFinite(w) ? w : DEFAULT_DETAIL_WIDTH;
        next = Math.max(MIN_DETAIL_WIDTH, next);
        if (Number.isFinite(host) && host > 0) {
            const max = Math.max(
                MIN_DETAIL_WIDTH,
                host - MIN_LIST_WIDTH - DETAIL_SPLITTER_WIDTH,
            );
            next = Math.min(max, next);
        }
        return Math.round(next);
    }

    function sanitizePresetOptions(options) {
        const out = options && typeof options === 'object' ? { ...options } : {};
        for (const key of PRESET_SKIP_KEYS) delete out[key];
        return out;
    }

    function defaultCopyName(name) {
        const base = String(name || '自定义预设').trim() || '自定义预设';
        return `${base} 副本`;
    }

    /**
     * Build a custom-preset payload by cloning an existing preset (or raw options).
     */
    function buildCustomClone(source, overrides = {}) {
        const src = source && typeof source === 'object' ? source : {};
        const options = sanitizePresetOptions(
            overrides.options != null ? overrides.options : (src.options || {}),
        );
        const name = String(
            overrides.name != null ? overrides.name : defaultCopyName(src.name),
        ).trim() || '自定义预设';
        const description = String(
            overrides.description != null
                ? overrides.description
                : (src.description || src.sceneBlurb || ''),
        ).trim();
        const group = normalizeGroupKey(
            overrides.group != null ? overrides.group : (src.group || 'talk'),
            { builtin: false },
        ) || 'talk';
        const out = {
            id: overrides.id || undefined,
            name,
            description,
            group,
            builtin: false,
            options,
        };
        if (!out.description) delete out.description;
        if (!out.id) delete out.id;
        return out;
    }

    function parseFieldValue(field, raw) {
        if (!field) return undefined;
        if (field.type === 'checkbox') return !!raw;
        if (field.type === 'number') {
            const s = String(raw ?? '').trim();
            if (!s) return field.emptyOk ? undefined : null;
            const n = Number(s);
            if (!Number.isFinite(n)) return field.emptyOk ? undefined : null;
            return n;
        }
        const s = String(raw ?? '').trim();
        return s;
    }

    /**
     * Merge form field values into a base options object.
     * @param {object} baseOptions
     * @param {Record<string, unknown>} fieldValues key → raw form value
     */
    function mergeEditableOptions(baseOptions, fieldValues) {
        const out = sanitizePresetOptions(baseOptions);
        const values = fieldValues && typeof fieldValues === 'object' ? fieldValues : {};
        for (const field of EDITABLE_OPTION_FIELDS) {
            if (!Object.prototype.hasOwnProperty.call(values, field.key)) continue;
            const parsed = parseFieldValue(field, values[field.key]);
            if (parsed === undefined) {
                delete out[field.key];
            } else if (parsed === null) {
                /* keep previous on invalid number */
            } else {
                out[field.key] = parsed;
            }
        }
        return out;
    }

    function optionFieldValue(options, field) {
        const opt = options && typeof options === 'object' ? options : {};
        const v = opt[field.key];
        if (field.type === 'checkbox') return !!v;
        if (v == null || v === '') return '';
        return v;
    }

    return {
        GROUP_ORDER,
        GROUP_LABELS,
        LEGACY_GROUP_MAP,
        FILTER_ALL,
        SECONDARY_BUILTIN,
        SECONDARY_CUSTOM,
        SECONDARY_PRIMARY,
        SECONDARY_ALL,
        DEFAULT_DETAIL_WIDTH,
        MIN_DETAIL_WIDTH,
        MIN_LIST_WIDTH,
        DETAIL_SPLITTER_WIDTH,
        PRESET_SKIP_KEYS,
        EDITABLE_OPTION_FIELDS,
        normalizeGroupKey,
        groupLabel,
        groupOf,
        normalizeSecondary,
        normalizeFilter,
        displayTitle,
        displayBlurb,
        isBuiltinPreset,
        canEditPreset,
        matchesQuery,
        filterPresets,
        countByGroup,
        countSecondary,
        orderedGroupKeys,
        clampDetailWidth,
        sanitizePresetOptions,
        defaultCopyName,
        buildCustomClone,
        parseFieldValue,
        mergeEditableOptions,
        optionFieldValue,
    };
}));
