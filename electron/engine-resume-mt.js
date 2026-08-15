/**
 * Rebuild external-MT overrides for checkpoint resume.
 * Old checkpoints omitted mtBackend/mtExternal; even when present, adapter URLs go stale.
 */

const { resolveFileMtPlan } = require('./engine-batch-item');
const { buildExternalMtJobFields, buildEngineJobFlags } = require('./engine-job-options');

/**
 * @param {object} merged - readMergedOptions / runtime options
 * @param {{
 *   isLlmMtId?: (id: string) => boolean,
 *   usesExternalMt?: (hints: object) => boolean,
 *   mapTaskToEngineTask?: (task: string, hints?: object) => string,
 *   mergeSenseOverrides?: (base: object, ov: object) => object,
 *   sanitizeSakuraMtForLanguage?: (opts: object, lang: string) => { options: object },
 *   mediaPath?: string,
 *   optionOverrides?: object,
 * }} [deps]
 */
function planResumeMt(merged = {}, deps = {}) {
    const merge = deps.mergeSenseOverrides || ((base, ov) => ({ ...base, ...(ov || {}) }));
    const sanitize = deps.sanitizeSakuraMtForLanguage
        || ((opts) => ({ options: opts }));
    const raw = merge(merged, deps.optionOverrides || {});
    const fileMerged = sanitize(raw, raw.language).options;
    const plan = resolveFileMtPlan(fileMerged, {
        isLlmMtId: deps.isLlmMtId || (() => false),
        usesExternalMt: deps.usesExternalMt || (() => false),
        mapTaskToEngineTask: deps.mapTaskToEngineTask || ((task) => task),
    });
    return { fileMerged, ...plan };
}

/**
 * @param {{
 *   useExternalMt: boolean,
 *   useSmartTranslate: boolean,
 *   mtAdapter?: { ok?: boolean, url?: string, token?: string, mtExternal?: Function, error?: string },
 * }} input
 * @returns {{ ok: boolean, overrides?: object, error?: string, code?: string }}
 */
function buildResumeMtOverrides(input = {}) {
    if (!input.useExternalMt) {
        return { ok: true, overrides: {} };
    }
    const adapter = input.mtAdapter;
    if (!adapter?.ok) {
        return {
            ok: false,
            error: adapter?.error || '外部翻译适配器未启动',
            code: 'mt_adapter_missing',
        };
    }
    const fields = typeof adapter.mtExternal === 'function'
        ? {
            mtBackend: 'external',
            mtExternal: adapter.mtExternal(
                input.useSmartTranslate
                    ? { batchSize: 40, timeoutSec: 1800 }
                    : { batchSize: 8, timeoutSec: 600 },
            ),
        }
        : buildExternalMtJobFields({
            url: adapter.url,
            token: adapter.token,
            batchSize: input.useSmartTranslate ? 40 : 8,
            timeoutSec: input.useSmartTranslate ? 1800 : 600,
        });
    if (!fields?.mtExternal) {
        return { ok: false, error: '外部翻译适配器缺少 URL', code: 'mt_adapter_url' };
    }
    const flags = buildEngineJobFlags(input.fileMerged || {}, { sakuraOrSmart: true });
    return {
        ok: true,
        overrides: {
            ...fields,
            mtModel: null,
            mtGlossaryMode: flags.mtGlossaryMode,
            releaseGpuAfter: flags.releaseGpuAfter,
        },
    };
}

module.exports = {
    planResumeMt,
    buildResumeMtOverrides,
};
