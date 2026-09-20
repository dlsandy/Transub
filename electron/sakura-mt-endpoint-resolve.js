/**
 * Sentence-MT endpoint: BYOK only when translateMode=external;
 * otherwise local GGUF + llama-server (resolveSakuraEndpoint).
 */
const entitlement = require('../src/js/advanced-entitlement-core');
const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
const byokPolicy = require('../src/js/translate-mode-byok-policy-core');
const { asPlainObject, asString } = require('./ipc-validate');

function readDoc(docOverride) {
    if (docOverride && typeof docOverride === 'object') return docOverride;
    try {
        const { readAdvancedDoc } = require('./advanced-license-data');
        return readAdvancedDoc().doc || {};
    } catch {
        return {};
    }
}

function resolveTranslateMode(options = {}, doc = {}) {
    if (options.translateMode != null && String(options.translateMode).trim() !== '') {
        return byokPolicy.normalizeTranslateMode(options.translateMode);
    }
    try {
        return sakuraCatalog.resolveTranslateModeFromOptions?.(options)
            || byokPolicy.normalizeTranslateMode(options.translateMode);
    } catch {
        return byokPolicy.normalizeTranslateMode(options.translateMode || doc?.translateMode);
    }
}

/**
 * Sync preference: external mode + baseUrl + model (key checked asynchronously).
 * @param {object} [doc]
 * @param {string|object} [translateModeOrOptions]
 * @returns {boolean}
 */
function isByokSentenceMtPreferred(doc, translateModeOrOptions) {
    const d = readDoc(doc);
    const byok = entitlement.normalizeByok(d?.byok);
    let translateMode = translateModeOrOptions;
    if (translateModeOrOptions && typeof translateModeOrOptions === 'object') {
        translateMode = resolveTranslateMode(translateModeOrOptions, d);
    }
    if (translateMode == null || translateMode === '') {
        // Legacy call sites without mode: never prefer BYOK (modes other than external).
        return false;
    }
    return byokPolicy.shouldPreferByokSentenceMt({ translateMode, byok });
}

/**
 * Prompt family: form/catalog modelId first; BYOK model name as supplement
 * when form resolves to generic sakura but BYOK name is specialized.
 * @param {string} formModelId
 * @param {{ source?: string, model?: string }|null} endpoint
 * @returns {string}
 */
function resolveSentenceMtPromptFamily(formModelId, endpoint = null) {
    const formFam = sakuraCatalog.resolvePromptFamily(formModelId) || 'sakura';
    if (!endpoint || (endpoint.source !== 'byok' && endpoint.source !== 'station')) return formFam;
    const byokFam = sakuraCatalog.resolvePromptFamily(endpoint.model || '') || 'sakura';
    if (formFam === 'sakura' && byokFam !== 'sakura') return byokFam;
    return formFam;
}

/**
 * Host hint for progress / logs (no secrets).
 * @param {string} [baseUrl]
 * @returns {string}
 */
function byokHostHint(baseUrl) {
    const raw = asString(baseUrl, 2048).trim();
    if (!raw) return '';
    try {
        const u = new URL(raw.includes('://') ? raw : `http://${raw}`);
        return u.host || '';
    } catch {
        return raw.replace(/^https?:\/\//i, '').split('/')[0] || '';
    }
}

/**
 * @param {object} [options] - same shape as resolveSakuraEndpoint plus optional `doc` / `translateMode`
 * @returns {Promise<object>}
 */
async function resolveSentenceMtEndpoint(options = {}) {
    const opts = asPlainObject(options);
    const doc = readDoc(opts.doc);
    const translateMode = resolveTranslateMode(opts, doc);
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const warn = (message) => {
        if (!onProgress) return;
        try {
            onProgress({
                phase: 'translate',
                detail: message,
                message,
                percent: 0,
                pct: 0,
                byokFallback: true,
            });
        } catch { /* ignore */ }
    };

    const external = byokPolicy.isExternalTranslateMode(translateMode);
    if (external) {
        let stationOpts = null;
        try {
            const stationClient = require('./transub-station-client');
            if (opts.transubStationEnabled != null || opts.transubStationUrl != null) {
                stationOpts = stationClient.normalizeStationOptions(opts);
            } else {
                const { loadSettings } = require('./settings-data');
                const saved = loadSettings()?.options || {};
                stationOpts = stationClient.normalizeStationOptions(saved);
            }
            if (stationOpts.transubStationEnabled) {
                const station = await stationClient.resolveStationSentenceMtEndpoint({
                    stationUrl: stationOpts.transubStationUrl,
                    preferredModel: stationOpts.transubStationModel,
                    signal: opts.signal,
                });
                if (station?.ok) return station;
                return {
                    ok: false,
                    source: 'station',
                    error: station?.error
                        || 'Transub Station 未就绪。请在「设置 → 外部翻译」检查 Station 地址并启动模型。',
                    code: station?.code || 'station_unavailable',
                };
            }
        } catch (err) {
            if (stationOpts?.transubStationEnabled) {
                return {
                    ok: false,
                    source: 'station',
                    error: `Transub Station 解析失败（${err?.message || err}）`,
                    code: 'station_resolve_failed',
                };
            }
        }

        try {
            const { resolveAdvancedLlmConfig } = require('./advanced-llm-resolve');
            const llm = await resolveAdvancedLlmConfig(doc, {
                allowByok: true,
                llmSource: 'byok',
                signal: opts.signal,
            });
            if (llm?.ok && llm.baseUrl && llm.model) {
                const host = byokHostHint(llm.baseUrl);
                return {
                    ok: true,
                    source: 'byok',
                    apiKey: llm.apiKey || '',
                    baseUrl: llm.baseUrl,
                    model: llm.model,
                    modelId: llm.model,
                    modelName: llm.model,
                    skipLocalEnsure: true,
                    parallelSlots: 1,
                    hostHint: host,
                };
            }
            const reason = llm?.error || llm?.code || 'byok_unavailable';
            return {
                ok: false,
                source: 'byok',
                error: `外部翻译未就绪（${reason}）。请在「设置 → 外部翻译」配置 Transub Station 或外接 API（BYOK）。`,
                code: typeof reason === 'string' ? reason : 'byok_unavailable',
            };
        } catch (err) {
            return {
                ok: false,
                source: 'byok',
                error: `外部翻译解析失败（${err?.message || err}）`,
                code: 'byok_resolve_failed',
            };
        }
    }

    if (isByokSentenceMtPreferred(doc, translateMode)) {
        // Defensive: policy already gated; unreachable unless mode+byok both ready.
        warn('外部翻译策略异常，已回退本机推理翻译模型');
    }

    const sakuraMt = require('./sakura-mt');
    const local = await sakuraMt.resolveSakuraEndpoint(opts);
    return local;
}

module.exports = {
    isByokSentenceMtPreferred,
    resolveSentenceMtEndpoint,
    resolveSentenceMtPromptFamily,
    byokHostHint,
};
