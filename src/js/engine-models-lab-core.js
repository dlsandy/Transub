/**
 * Laboratory (experimental) LLM models — pure helpers for the models workspace.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineModelsLab = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineModelsLabFactory() {
    function getCatalogApi() {
        try {
            if (typeof require === 'function') {
                return require('./advanced-managed-llm-catalog-core');
            }
        } catch (_) { /* ignore */ }
        try {
            const g = typeof globalThis !== 'undefined' ? globalThis : null;
            return g?.TransubAdvancedManagedLlmCatalog || null;
        } catch (_) {
            return null;
        }
    }

    function readLabFormFields(form = {}) {
        return {
            name: String(form.name || '').trim(),
            ggufUrl: String(form.ggufUrl || form.url || '').trim(),
            fileName: String(form.fileName || form.filename || '').trim(),
            paramBillion: String(form.paramBillion || form.params || '').trim(),
            note: String(form.note || '').trim(),
        };
    }

    /**
     * @returns {{ ok: true, payload: object }|{ ok: false, error: string }}
     */
    function buildLabAddPayloadFromForm(form = {}) {
        const fields = readLabFormFields(form);
        if (!fields.ggufUrl && !fields.fileName) {
            return { ok: false, error: '请填写 GGUF 直链 URL，或本机文件名（需以 .gguf 结尾）' };
        }
        if (fields.fileName && !/\.gguf$/i.test(fields.fileName)) {
            return { ok: false, error: '文件名须以 .gguf 结尾' };
        }
        if (fields.ggufUrl) {
            const lower = fields.ggufUrl.toLowerCase();
            if (!(lower.startsWith('http://') || lower.startsWith('https://'))) {
                return { ok: false, error: '下载地址须为 http(s) 直链' };
            }
        }
        const paramN = Number(fields.paramBillion);
        const payload = {
            name: fields.name,
            ggufUrl: fields.ggufUrl,
            fileName: fields.fileName,
            note: fields.note,
        };
        if (Number.isFinite(paramN) && paramN > 0) {
            payload.paramBillion = paramN;
        }
        const catalog = getCatalogApi();
        if (catalog?.normalizeLabModelEntry) {
            const preview = catalog.normalizeLabModelEntry(payload, { existingIds: [] });
            if (!preview) {
                return { ok: false, error: '无法解析为有效的 llama GGUF 模型（检查文件名或 URL）' };
            }
        }
        return { ok: true, payload };
    }

    function listLabModelsFromManaged(managedOrStatus) {
        const managed = managedOrStatus?.managedLlm || managedOrStatus;
        if (Array.isArray(managed?.labModels)) return managed.labModels.slice();
        const catalog = Array.isArray(managedOrStatus?.catalog) ? managedOrStatus.catalog : [];
        return catalog.filter((m) => m?.experimental || m?.lab || m?.source === 'lab'
            || String(m?.family || '') === 'lab');
    }

    function formatLabModelListLine(entry) {
        const name = String(entry?.name || entry?.id || '').trim() || '未命名';
        const file = String(entry?.fileName || '').trim();
        const installed = entry?.installed ? '已安装' : '未安装';
        return file ? `${name} · ${file} · ${installed}` : `${name} · ${installed}`;
    }

    return {
        readLabFormFields,
        buildLabAddPayloadFromForm,
        listLabModelsFromManaged,
        formatLabModelListLine,
    };
}));
