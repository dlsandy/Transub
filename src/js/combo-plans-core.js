/**
 * Combo plans (组合方案): normalize, filter, labels, apply patch.
 * Server/CDN JSON + local samples; separate from scene presets (may include translate keys).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubComboPlans = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function comboPlansFactory() {
    const PRO_TRANSLATE_MODES = Object.freeze(['dialog', 'smart']);
    const TRANSLATE_MODE_LABELS = Object.freeze({
        llm: '推理',
        external: '外部',
        dialog: '智能',
        smart: '混合',
    });
    const HARDWARE_TIER_LABELS = Object.freeze({
        cpu: 'CPU',
        low: '性能',
        balanced: '均衡',
        quality: '质量',
    });
    const LANGUAGE_LABELS = Object.freeze({
        auto: '自动',
        ja: '日语',
        en: '英语',
        ko: '韩语',
        zh: '中文',
        yue: '粤语',
    });
    const TARGET_LANG_LABELS = Object.freeze({
        'zh-Hans': '简中',
        'zh-Hant': '繁中',
        'zh-Hant-TW': '繁中',
        en: '英语',
        ja: '日语',
        ko: '韩语',
    });
    const GROUP_LABELS = Object.freeze({
        ja: '日语',
        ko: '韩语',
        western: '欧美',
        zh: '中文',
        talk: '访谈',
        other: '其他',
    });

    function isBlankFilter(v) {
        const s = String(v == null ? '' : v).trim().toLowerCase();
        return !s || s === 'all' || s === '*';
    }

    function normalizeTranslateMode(raw) {
        const m = String(raw || '').trim().toLowerCase();
        if (m === 'llm' || m === 'external' || m === 'dialog' || m === 'smart') return m;
        if (m === 'normal' || m === 'opus') return 'llm';
        return 'llm';
    }

    function normalizeHardware(raw) {
        const h = raw && typeof raw === 'object' ? raw : {};
        let tier = String(h.tier || '').trim().toLowerCase();
        if (!['cpu', 'low', 'balanced', 'quality'].includes(tier)) {
            tier = h.preferCuda === false ? 'cpu' : 'balanced';
        }
        const minVramGb = Number(h.minVramGb);
        const minSystemRamGb = Number(h.minSystemRamGb);
        const label = String(h.label || '').trim()
            || (HARDWARE_TIER_LABELS[tier] || tier);
        return {
            tier,
            preferCuda: h.preferCuda !== false && tier !== 'cpu',
            minVramGb: Number.isFinite(minVramGb) && minVramGb >= 0 ? minVramGb : (tier === 'cpu' ? 0 : 6),
            minSystemRamGb: Number.isFinite(minSystemRamGb) && minSystemRamGb > 0 ? minSystemRamGb : 16,
            label,
        };
    }

    function requiresProForMode(mode) {
        return PRO_TRANSLATE_MODES.includes(normalizeTranslateMode(mode));
    }

    function translateModeLabel(mode, { withProMark = true } = {}) {
        const m = normalizeTranslateMode(mode);
        const base = TRANSLATE_MODE_LABELS[m] || m;
        if (withProMark && requiresProForMode(m)) return `${base}◆`;
        return base;
    }

    function languageLabel(code) {
        const c = String(code || '').trim();
        return LANGUAGE_LABELS[c] || c || '—';
    }

    function targetLangLabel(code) {
        const c = String(code || '').trim();
        return TARGET_LANG_LABELS[c] || c || '—';
    }

    function hardwareTierLabel(tier) {
        const t = String(tier || '').trim().toLowerCase();
        return HARDWARE_TIER_LABELS[t] || t || '—';
    }

    function groupLabel(group) {
        const g = String(group || '').trim().toLowerCase();
        return GROUP_LABELS[g] || g || '其他';
    }

    function formatComboPlanLangPair(plan) {
        const p = plan && typeof plan === 'object' ? plan : {};
        return `${languageLabel(p.language)} → ${targetLangLabel(p.subtitleTargetLang)}`;
    }

    function uniqIds(list) {
        const out = [];
        const seen = new Set();
        for (const raw of Array.isArray(list) ? list : []) {
            const id = String(raw || '').trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out;
    }

    /**
     * @param {object} raw
     * @returns {object|null}
     */
    function normalizeComboPlan(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const id = String(raw.id || '').trim();
        if (!id) return null;
        const optsIn = raw.options && typeof raw.options === 'object' ? { ...raw.options } : {};
        const language = String(raw.language || optsIn.language || 'ja').trim() || 'ja';
        const subtitleTargetLang = String(
            raw.subtitleTargetLang || optsIn.subtitleTargetLang || 'zh-Hans',
        ).trim() || 'zh-Hans';
        const translateMode = normalizeTranslateMode(
            raw.translateMode != null ? raw.translateMode : optsIn.translateMode,
        );
        const requiresPro = raw.requiresPro === true || raw.requiresPro === false
            ? !!raw.requiresPro
            : requiresProForMode(translateMode);
        const hardware = normalizeHardware(raw.hardware);
        const models = uniqIds(raw.models);
        const options = {
            ...optsIn,
            language,
            subtitleTargetLang,
            translateMode,
        };
        if (!models.length) {
            for (const key of ['engineAsrModel', 'engineVadModel', 'engineLlmMtModel', 'engineMtModel']) {
                const mid = String(options[key] || '').trim();
                if (mid) models.push(mid);
            }
        }
        return {
            id,
            version: Math.max(1, Number(raw.version) || 1),
            group: String(raw.group || 'other').trim().toLowerCase() || 'other',
            name: String(raw.name || id).trim(),
            summary: String(raw.summary || '').trim(),
            description: String(raw.description || raw.summary || '').trim(),
            file: String(raw.file || '').trim(),
            language,
            subtitleTargetLang,
            translateMode,
            requiresPro,
            hardware,
            models: uniqIds(models),
            options,
        };
    }

    function normalizeManifest(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const plans = (Array.isArray(src.plans) ? src.plans : [])
            .map((p) => normalizeComboPlan(p))
            .filter(Boolean);
        return {
            schemaVersion: Math.max(1, Number(src.schemaVersion) || 1),
            updatedAt: String(src.updatedAt || '').trim(),
            plans,
        };
    }

    /**
     * @param {object[]} plans
     * @param {object} filters
     */
    function filterComboPlans(plans, filters = {}) {
        const list = Array.isArray(plans) ? plans : [];
        const f = filters && typeof filters === 'object' ? filters : {};
        return list.filter((plan) => {
            const p = plan || {};
            if (!isBlankFilter(f.language) && String(p.language || '') !== String(f.language).trim()) {
                return false;
            }
            if (!isBlankFilter(f.subtitleTargetLang)
                && String(p.subtitleTargetLang || '') !== String(f.subtitleTargetLang).trim()) {
                return false;
            }
            if (!isBlankFilter(f.hardwareTier)
                && String(p.hardware?.tier || '') !== String(f.hardwareTier).trim().toLowerCase()) {
                return false;
            }
            if (!isBlankFilter(f.translateMode)
                && normalizeTranslateMode(p.translateMode) !== normalizeTranslateMode(f.translateMode)) {
                return false;
            }
            const proFilter = String(f.pro || 'all').trim().toLowerCase();
            if (proFilter === 'free' && p.requiresPro) return false;
            if (proFilter === 'pro' && !p.requiresPro) return false;
            if (!isBlankFilter(f.group)
                && String(p.group || '') !== String(f.group).trim().toLowerCase()) {
                return false;
            }
            return true;
        });
    }

    function polishModelId(plan) {
        const p = plan && typeof plan === 'object' ? plan : {};
        const opts = p.options && typeof p.options === 'object' ? p.options : {};
        return String(opts.smartTranslateModelId || p.smartTranslateModelId || '').trim();
    }

    function collectRequiredModelIds(plan) {
        const p = normalizeComboPlan(plan) || plan || {};
        const polish = polishModelId(p);
        const ids = uniqIds(p.models).filter((id) => id !== polish);
        const opts = p.options || {};
        for (const key of ['engineAsrModel', 'engineVadModel', 'engineLlmMtModel']) {
            const mid = String(opts[key] || '').trim();
            if (mid && mid !== polish) ids.push(mid);
        }
        return uniqIds(ids);
    }

    /**
     * Build options patch for applyOptionsToForm (includes translate + language keys).
     * @param {object} plan
     * @returns {object}
     */
    function buildApplyOptionsPatch(plan) {
        const p = normalizeComboPlan(plan);
        if (!p) return {};
        const options = { ...p.options };
        delete options.smartTranslateModelId;
        return {
            ...options,
            language: p.language,
            subtitleTargetLang: p.subtitleTargetLang,
            translateMode: p.translateMode,
            activeComboPlanId: p.id,
        };
    }

    function buildConfirmSummaryLines(plan) {
        const p = normalizeComboPlan(plan);
        if (!p) return [];
        const lines = [
            `方案：${p.name}`,
            `语对：${formatComboPlanLangPair(p)}`,
            `译法：${translateModeLabel(p.translateMode)}${p.requiresPro ? '（需 Pro）' : ''}`,
            `硬件：${p.hardware.label || hardwareTierLabel(p.hardware.tier)}`,
        ];
        if (p.options?.engineLlmMtModel) {
            lines.push(`翻译模型：${p.options.engineLlmMtModel}`);
        }
        const polish = polishModelId(p);
        if (polish) lines.push(`润色模型：${polish}`);
        if (p.models.length) {
            lines.push(`所需模型：${p.models.join('、')}`);
        }
        return lines;
    }

    function emptyFilters() {
        return {
            language: '',
            subtitleTargetLang: '',
            hardwareTier: '',
            translateMode: '',
            pro: 'all',
            group: '',
        };
    }

    return {
        PRO_TRANSLATE_MODES,
        TRANSLATE_MODE_LABELS,
        HARDWARE_TIER_LABELS,
        LANGUAGE_LABELS,
        TARGET_LANG_LABELS,
        GROUP_LABELS,
        isBlankFilter,
        normalizeTranslateMode,
        normalizeHardware,
        requiresProForMode,
        translateModeLabel,
        languageLabel,
        targetLangLabel,
        hardwareTierLabel,
        groupLabel,
        formatComboPlanLangPair,
        normalizeComboPlan,
        normalizeManifest,
        filterComboPlans,
        polishModelId,
        collectRequiredModelIds,
        buildApplyOptionsPatch,
        buildConfirmSummaryLines,
        emptyFilters,
    };
}));
