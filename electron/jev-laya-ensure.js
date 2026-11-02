/**
 * Pro task helper: when Laya decision mode is auto + local, ensure OpenDecider
 * is installed and listening before wedges run.
 */
'use strict';

const jevCore = require('../src/js/jev-decision-core');

/** @type {Promise<object>|null} */
let inFlight = null;
/** @type {{ ok: boolean, at: number, reachable?: boolean }|null} */
let lastResult = null;
const SUCCESS_TTL_MS = 60_000;
/** Soft cap so batch start never sits on "引擎启动中…" forever. */
const ENSURE_TIMEOUT_MS = 90_000;

/**
 * @param {object} [options]
 * @returns {boolean}
 */
function shouldAutoEnsureLocalLaya(options = {}) {
    if (!jevCore.isJevDecisionEnabled(options)) return false;
    if (jevCore.shouldSkipJevForPerfProfile(options)) return false;
    const endpoint = options.jevEndpoint || options.jevDecisionEndpoint || 'local';
    const resolved = jevCore.resolveJevEndpoint(endpoint);
    return jevCore.isLocalSystemOneEndpoint(resolved);
}

/**
 * Soft-fail friendly: never throws. On failure returns ok:false but callers
 * should continue the task (wedges already soft-skip when Laya is down).
 *
 * @param {object} [options] runtime / settings options
 * @param {{
 *   onLog?: (line: string) => void,
 *   force?: boolean,
 *   gates?: { requireJevDecision: Function },
 *   local?: object,
 * }} [deps]
 */
async function ensureLocalLayaForProTask(options = {}, deps = {}) {
    const onLog = typeof deps.onLog === 'function' ? deps.onLog : null;
    const log = (msg) => {
        if (onLog) onLog(String(msg || ''));
    };

    if (!shouldAutoEnsureLocalLaya(options)) {
        return { ok: true, skipped: true, reason: 'not_local_auto' };
    }

    let gate;
    try {
        const gates = deps.gates || require('./advanced-gates');
        gate = gates.requireJevDecision();
    } catch (err) {
        return { ok: true, skipped: true, reason: 'unavailable', error: err?.message };
    }
    if (!gate?.ok) {
        return { ok: true, skipped: true, reason: 'not_entitled', error: gate?.error };
    }

    const now = Date.now();
    if (!deps.force && lastResult?.ok && lastResult.reachable
        && (now - lastResult.at) < SUCCESS_TTL_MS) {
        return { ok: true, already: true, cached: true };
    }
    if (inFlight) return inFlight;

    const endpoint = options.jevEndpoint || options.jevDecisionEndpoint || 'local';
    const timeoutMs = Number.isFinite(Number(deps.timeoutMs)) && Number(deps.timeoutMs) > 0
        ? Number(deps.timeoutMs)
        : ENSURE_TIMEOUT_MS;
    const local = deps.local || require('./jev-local-service');
    const work = (async () => {
        try {
            // skipTorch: importing torch can take tens of seconds and looks like a hung batch.
            const status = await local.getLocalLayaStatus({ endpoint, skipTorch: true });
            if (status?.reachable) {
                lastResult = { ok: true, at: Date.now(), reachable: true };
                return { ok: true, already: true, reachable: true };
            }

            if (!status?.installed) {
                log('本机未安装 Laya，正在自动安装并启动…');
                const installed = await local.installLocalLaya({
                    endpoint,
                    start: true,
                    onLog,
                    hfEndpoint: options.engineHfEndpoint || options.hfEndpoint,
                    preferredPipMirror: options.preferredPipMirror,
                });
                if (installed?.ok && (installed.started || installed.already)) {
                    lastResult = { ok: true, at: Date.now(), reachable: true };
                    log(installed.message || 'Laya 已安装并启动');
                    return {
                        ok: true,
                        installed: true,
                        started: true,
                        message: installed.message,
                    };
                }
                if (installed?.ok && installed.installed) {
                    log('OpenDecider 已安装，正在启动…');
                    const started = await local.startLocalLaya({
                        endpoint,
                        onLog,
                        hfEndpoint: options.engineHfEndpoint || options.hfEndpoint,
                    });
                    if (started?.ok) {
                        lastResult = { ok: true, at: Date.now(), reachable: true };
                        return { ok: true, installed: true, started: true };
                    }
                    lastResult = { ok: false, at: Date.now(), reachable: false };
                    return {
                        ok: false,
                        installed: true,
                        error: started?.error || installed?.error || 'Laya 启动失败',
                        hint: started?.hint || installed?.hint,
                    };
                }
                lastResult = { ok: false, at: Date.now(), reachable: false };
                return {
                    ok: false,
                    error: installed?.error || 'Laya 自动安装失败',
                    hint: installed?.hint,
                };
            }

            log('本机已安装 OpenDecider，正在启动 Laya…');
            const started = await local.startLocalLaya({
                endpoint,
                onLog,
                hfEndpoint: options.engineHfEndpoint || options.hfEndpoint,
            });
            if (started?.ok) {
                lastResult = { ok: true, at: Date.now(), reachable: true };
                return { ok: true, started: true, already: !!started.already };
            }
            lastResult = { ok: false, at: Date.now(), reachable: false };
            return {
                ok: false,
                error: started?.error || 'Laya 启动失败',
                hint: started?.hint,
            };
        } catch (err) {
            lastResult = { ok: false, at: Date.now(), reachable: false };
            return { ok: false, error: err?.message || String(err) };
        } finally {
            inFlight = null;
        }
    })();
    inFlight = work;

    let timer = null;
    try {
        const raced = await Promise.race([
            work,
            new Promise((resolve) => {
                timer = setTimeout(() => {
                    resolve({
                        ok: false,
                        timedOut: true,
                        error: `Laya 自动准备超时（>${Math.round(timeoutMs / 1000)}s），任务继续；可稍后在设置中手动启动`,
                    });
                }, timeoutMs);
            }),
        ]);
        if (raced?.timedOut) {
            lastResult = { ok: false, at: Date.now(), reachable: false };
            log(raced.error);
            // Keep inFlight=work so concurrent callers share the same install.
        }
        return raced;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** Test helper — clear memo between cases. */
function resetLocalLayaEnsureMemo() {
    inFlight = null;
    lastResult = null;
}

module.exports = {
    shouldAutoEnsureLocalLaya,
    ensureLocalLayaForProTask,
    resetLocalLayaEnsureMemo,
};
