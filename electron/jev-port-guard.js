/**
 * Laya / System One local port policy — avoid clashing with Engine / llama / Sakura.
 *
 * Reserved loopback ports (Transub):
 * - 8765  Engine HTTP
 * - 39281 llama-server (managed dialog / polish)
 * - 39282 Sakura / secondary llama
 * - 39283 Laya System One (this feature)
 */
'use strict';

const jevCore = require('../src/js/jev-decision-core');

const ENGINE_PORT = 8765;
const LLM_PORT = 39281;
const SAKURA_PORT = 39282;
const LAYA_PORT = Number(jevCore.DEFAULT_LOCAL_PORT) || 39283;

function parsePortFromEndpoint(endpoint) {
    const resolved = jevCore.resolveJevEndpoint(endpoint || 'local');
    try {
        const u = new URL(resolved);
        const p = Number(u.port) || (/^https:$/i.test(u.protocol) ? 443 : 80);
        return Number.isFinite(p) ? p : null;
    } catch {
        return null;
    }
}

/**
 * @param {number|null} port
 * @returns {{ ok: boolean, code?: string, error?: string, owner?: string }}
 */
function checkAgainstReservedPorts(port) {
    const p = Number(port);
    if (!Number.isFinite(p) || p <= 0) {
        return { ok: false, code: 'bad_port', error: '无法解析 Laya 端口' };
    }
    if (p === ENGINE_PORT) {
        return {
            ok: false,
            code: 'port_engine',
            owner: 'engine',
            error: `端口 ${p} 已预留给 Transub Engine，请改用 ${LAYA_PORT}`,
        };
    }
    if (p === LLM_PORT) {
        return {
            ok: false,
            code: 'port_llama',
            owner: 'llama',
            error: `端口 ${p} 已预留给软件内 llama-server，请改用 ${LAYA_PORT}`,
        };
    }
    if (p === SAKURA_PORT) {
        return {
            ok: false,
            code: 'port_sakura',
            owner: 'sakura',
            error: `端口 ${p} 已预留给 Sakura / 次要 llama，请改用 ${LAYA_PORT}`,
        };
    }
    return { ok: true, port: p };
}

function localStartHint(port = LAYA_PORT) {
    const p = Number(port) || LAYA_PORT;
    return `请将 Laya / System One 绑到 ${p}（勿用 8000/8765/39281/39282）。示例：opendecider serve --port ${p}，或自定义进程监听 http://127.0.0.1:${p}/v1/systemone`;
}

/**
 * Pre-flight before HTTP call: refuse endpoints that collide with Transub services.
 * @param {string} endpointPref
 */
function guardEndpoint(endpointPref) {
    const resolved = jevCore.resolveJevEndpoint(endpointPref || 'local');
    if (!jevCore.isLocalSystemOneEndpoint(resolved)) {
        return { ok: true, endpoint: resolved, local: false };
    }
    const port = parsePortFromEndpoint(resolved);
    const check = checkAgainstReservedPorts(port);
    if (!check.ok) {
        return {
            ok: false,
            endpoint: resolved,
            local: true,
            port,
            code: check.code,
            error: check.error,
            hint: localStartHint(LAYA_PORT),
        };
    }
    return { ok: true, endpoint: resolved, local: true, port: check.port };
}

module.exports = {
    ENGINE_PORT,
    LLM_PORT,
    SAKURA_PORT,
    LAYA_PORT,
    parsePortFromEndpoint,
    checkAgainstReservedPorts,
    localStartHint,
    guardEndpoint,
};
