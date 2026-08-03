/**
 * Surface Advanced LLM source (BYOK 外接 / 软件内选) in the engine latest.log.
 */
const { asString, asPlainObject } = require('./ipc-validate');

/** Dedup identical lines across engine MT batch POSTs / multi-stage QC. */
const DEDUP_MS = 90_000;
let lastLogKey = '';
let lastLogAt = 0;

/**
 * @param {string} [source]
 * @returns {string}
 */
function llmSourceLabel(source) {
    const s = String(source || '').trim().toLowerCase();
    if (s === 'byok') return '外接模型';
    if (s === 'managed') return '软件内选模型';
    if (s === 'mock') return '模拟';
    return s || 'unknown';
}

/**
 * @param {string} [baseUrl]
 * @returns {string}
 */
function llmHostHint(baseUrl) {
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
 * @param {object} llm - resolved LLM config from resolveAdvancedLlmConfig
 * @param {{ feature?: string }} [options]
 * @returns {string}
 */
function formatAdvancedLlmEngineLogLine(llm, options = {}) {
    const opts = asPlainObject(options);
    const source = llmSourceLabel(llm?.source);
    const model = asString(llm?.modelId || llm?.model, 256).trim() || '(未指定)';
    const host = llmHostHint(llm?.baseUrl);
    const feature = asString(opts.feature, 64).trim();
    const parts = ['[engine] 大模型', source, model];
    if (host) parts.push(host);
    if (feature) parts.push(feature);
    return parts.join(' · ');
}

/**
 * Append a one-line summary to the engine log (deduped).
 * Never logs API keys.
 * @param {object} llm
 * @param {{ feature?: string, invokeSender?: object|null, logMock?: boolean, force?: boolean }} [options]
 * @returns {string} logged line (empty if skipped)
 */
function logAdvancedLlmToEngine(llm, options = {}) {
    const opts = asPlainObject(options);
    if (!llm || llm.ok === false) return '';
    if (llm.source === 'mock' && !opts.logMock) return '';

    const line = formatAdvancedLlmEngineLogLine(llm, opts);
    const now = Date.now();
    if (!opts.force && line === lastLogKey && (now - lastLogAt) < DEDUP_MS) {
        return '';
    }
    lastLogKey = line;
    lastLogAt = now;

    try {
        const { appendEngineLogLine } = require('./engine-bridge');
        if (typeof appendEngineLogLine === 'function') {
            appendEngineLogLine(line, opts.invokeSender || null);
        }
    } catch (_) { /* optional during tests */ }
    return line;
}

/** @internal test helper */
function _resetAdvancedLlmLogDedup() {
    lastLogKey = '';
    lastLogAt = 0;
}

module.exports = {
    llmSourceLabel,
    llmHostHint,
    formatAdvancedLlmEngineLogLine,
    logAdvancedLlmToEngine,
    _resetAdvancedLlmLogDedup,
};
