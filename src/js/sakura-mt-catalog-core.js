/**
 * Free Sakura MT catalog (GGUF + llama-server).
 * Sakura is CC-BY-NC-SA — non-commercial model license.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSakuraMtCatalog = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function sakuraMtCatalogFactory() {
    const DEFAULT_MODEL_ID = 'sakura-1.5b';

    /** @type {ReadonlyArray<object>} */
    const CATALOG = Object.freeze([
        {
            id: 'sakura-1.5b',
            name: 'Sakura 1.5B（默认）',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'sakura-1.5b-qwen2.5-v1.0-Q5KS.gguf',
            // Official Hub only ships FP16 (~3.5GB); community Q5_K_S is the practical “light” default.
            ggufUrl: 'https://huggingface.co/shing3232/Sakura-1.5B-Qwen2.5-v1.0-GGUF-IMX/resolve/main/sakura-1.5b-qwen2.5-v1.0-Q5KS.gguf',
            sizeHint: '约 1.2 GB',
            sizeBytes: 1259173504,
            size_hint_mb: 1200,
            ramHint: '建议 ≥4 GB 内存',
            languages: ['ja', 'zh'],
            note: '日→简中 · 免费轻量；社区 Q5 量化；CC-BY-NC-SA',
            recommended: true,
        },
        {
            id: 'sakura-7b',
            name: 'Sakura 7B',
            kind: 'mt',
            backend: 'sakura-gguf',
            family: 'sakura',
            familyLabel: 'Sakura',
            fileName: 'sakura-7b-qwen2.5-v1.0-iq4xs.gguf',
            ggufUrl: 'https://huggingface.co/SakuraLLM/Sakura-7B-Qwen2.5-v1.0-GGUF/resolve/main/sakura-7b-qwen2.5-v1.0-iq4xs.gguf',
            sizeHint: '约 4.3 GB',
            sizeBytes: 4250298208,
            size_hint_mb: 4250,
            ramHint: '建议 ≥8 GB 内存 / 显存',
            languages: ['ja', 'zh'],
            note: '日→简中 · 质量更好；CC-BY-NC-SA',
            recommended: false,
        },
    ]);

    function listCatalog() {
        return CATALOG.map((m) => ({ ...m }));
    }

    function findCatalogEntry(modelIdOrFile) {
        const want = String(modelIdOrFile || '').trim().toLowerCase();
        if (!want) return null;
        return CATALOG.find((m) => (
            m.id.toLowerCase() === want
            || String(m.fileName || '').toLowerCase() === want
        )) || null;
    }

    function isSakuraMtModel(modelId) {
        return !!findCatalogEntry(modelId);
    }

    /**
     * Engine Opus / classical MT model ids (not LLM inference).
     * @param {string} modelId
     * @returns {boolean}
     */
    function isEngineOpusMtModel(modelId) {
        const id = String(modelId || '').trim().toLowerCase();
        if (!id) return false;
        return /^opus[-_]?mt[-_]/i.test(id) || id.includes('opus-mt-');
    }

    /**
     * LLM inference MT (Sakura today; other local LLM MT ids later).
     * Anything that is not Opus classical MT counts as inference MT when selected.
     * @param {string} modelId
     * @returns {boolean}
     */
    function isLlmInferenceMtModel(modelId) {
        const id = String(modelId || '').trim();
        if (!id) return false;
        if (isEngineOpusMtModel(id)) return false;
        if (isSakuraMtModel(id)) return true;
        // Managed GGUF catalog ids (qwen25-7b, llama32-3b, …) + future backends
        if (/^(sakura|qwen|llama|mistral|gemma|chatglm|yi-|deepseek|phi)/i.test(id)) return true;
        if (/gguf|llm|instruct/i.test(id)) return true;
        return false;
    }

    /**
     * Normalize translate-mode tokens. Legacy UI used `sakura` for 推理翻译.
     * @param {string} mode
     * @returns {'smart'|'llm'|'engine'}
     */
    function normalizeTranslateMode(mode) {
        const m = String(mode || '').trim().toLowerCase();
        if (m === 'smart' || m === 'advanced') return 'smart';
        if (m === 'llm' || m === 'sakura' || m === 'inference') return 'llm';
        return 'engine';
    }

    /**
     * User-facing label for 设置 → 翻译方式.
     * @param {string} mode
     * @returns {string}
     */
    function translateModeLabel(mode, { short = false } = {}) {
        const m = normalizeTranslateMode(mode);
        if (m === 'smart') return short ? '智能' : '智能翻译';
        if (m === 'llm') return short ? '推理' : '推理翻译';
        return short ? '机器' : '机器翻译';
    }

    /**
     * Same mode mapping as 设置 → 翻译方式.
     * Prefer explicit `translateMode` when present (persisted by settings save).
     * Legacy: Empty engineMtModel = Opus auto-pick → machine translation (not LLM).
     * Non-Opus model ids (Sakura today, other LLMs later) → 推理翻译 (`llm`).
     * @param {object} [options]
     * @returns {'smart'|'llm'|'engine'}
     */
    function resolveTranslateModeFromOptions(options = {}) {
        const explicit = options?.translateMode != null && String(options.translateMode).trim() !== ''
            ? normalizeTranslateMode(options.translateMode)
            : null;
        if (explicit) return explicit;
        if (options?.smartTranslate) return 'smart';
        const mt = String(options?.engineMtModel || '').trim();
        if (!mt) return 'engine';
        if (isEngineOpusMtModel(mt)) return 'engine';
        if (isLlmInferenceMtModel(mt) || isSakuraMtModel(mt)) return 'llm';
        // Unknown non-empty id: prefer 推理翻译 over mis-routing LLM models to Opus
        return 'llm';
    }

    function toEngineListItem(entry, { installed = false } = {}) {
        if (!entry) return null;
        return {
            id: entry.id,
            kind: 'mt',
            name: entry.name,
            description: entry.note || '',
            hub_id: '',
            local_dirname: entry.id,
            size_hint_mb: entry.size_hint_mb || 0,
            languages: entry.languages || ['ja', 'zh'],
            backend: 'sakura-gguf',
            installed: !!installed,
            incomplete: false,
            bundled: false,
            path: '',
        };
    }

    return {
        DEFAULT_MODEL_ID,
        CATALOG,
        listCatalog,
        findCatalogEntry,
        isSakuraMtModel,
        isEngineOpusMtModel,
        isLlmInferenceMtModel,
        normalizeTranslateMode,
        translateModeLabel,
        resolveTranslateModeFromOptions,
        toEngineListItem,
    };
}));
