/**
 * 解析 Advanced 实际调用的 LLM 配置（外接 BYOK / 软件内选模型）
 */
const entitlement = require('../src/js/advanced-entitlement-core');
const catalog = require('../src/js/advanced-managed-llm-catalog-core');
const byok = require('./advanced-byok');
const managed = require('./advanced-managed-llm');
const { asString, asPlainObject } = require('./ipc-validate');

/**
 * @param {object} doc - normalized advanced doc
 * @param {object} [overrides]
 * @param {boolean} [overrides.requireReconstructCapable] - 语境/影片理解等需通用对话模型
 * @returns {Promise<{ ok: boolean, source?: string, apiKey?: string, baseUrl?: string, model?: string, modelId?: string, error?: string, code?: string }>}
 */
async function resolveAdvancedLlmConfig(doc, overrides = {}) {
    const patch = asPlainObject(overrides);
    const source = catalog.normalizeLlmSource(
        patch.llmSource != null ? patch.llmSource : doc?.llmSource,
    );

    let resolved;
    if (source === 'managed') {
        resolved = await managed.resolveManagedEndpoint(doc, {
            activeModelId: patch.activeModelId,
            onProgress: typeof patch.onProgress === 'function' ? patch.onProgress : undefined,
            signal: patch.signal,
        });
    } else {
        const byokCfg = entitlement.normalizeByok({
            ...doc?.byok,
            baseUrl: patch.baseUrl != null ? patch.baseUrl : doc?.byok?.baseUrl,
            model: patch.model != null ? patch.model : doc?.byok?.model,
            provider: patch.provider != null ? patch.provider : doc?.byok?.provider,
        });
        const keyFromPatch = Object.prototype.hasOwnProperty.call(patch, 'apiKey')
            ? asString(patch.apiKey, 8192).trim()
            : '';
        const keyRes = byok.getByokApiKey();
        const apiKey = keyFromPatch || keyRes.apiKey || '';

        if (!apiKey) {
            return {
                ok: false,
                source: 'byok',
                error: '请先在设置中配置大模型 API Key（BYOK）',
                code: 'byok_missing',
                baseUrl: byokCfg.baseUrl,
                model: byokCfg.model,
            };
        }

        resolved = {
            ok: true,
            source: 'byok',
            apiKey,
            baseUrl: byokCfg.baseUrl,
            model: byokCfg.model,
            provider: byokCfg.provider,
        };
    }

    if (!resolved?.ok) return resolved;

    if (patch.requireReconstructCapable) {
        const probe = resolved.modelId || resolved.model || '';
        const block = catalog.getReconstructModelBlock(probe);
        if (block) {
            return {
                ...block,
                source: resolved.source,
                baseUrl: resolved.baseUrl,
                model: resolved.model,
                modelId: resolved.modelId || block.modelId,
            };
        }
    }

    if (patch.requireSmartTranslateCapable) {
        const probe = resolved.modelId || resolved.model || '';
        const block = catalog.getSmartTranslateModelBlock(probe);
        if (block) {
            return {
                ...block,
                source: resolved.source,
                baseUrl: resolved.baseUrl,
                model: resolved.model,
                modelId: resolved.modelId || block.modelId,
            };
        }
    }

    return resolved;
}

module.exports = {
    resolveAdvancedLlmConfig,
};
