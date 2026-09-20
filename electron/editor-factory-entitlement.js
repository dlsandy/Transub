/**
 * Build Factory health / entitlement snapshot for Transub Editor (P4).
 * Pure-ish helpers; Electron I/O stays in editor-factory-server.js.
 */
const path = require('path');

const RPC_FEATURES_IMPLEMENTED = [
    'health',
    'entitlement',
    'abort',
    'options',
    'batch',
    'batch/status',
    'models',
    'models/download',
    'models/download/status',
    'transcribe-range',
    'translate-cues',
    'convert-chinese',
    'compact-repetition',
    'qc-report',
    'qc-fix',
    'pro/context-reconstruct',
    'pro/film-context-reconstruct',
    'pro/qc-smart-fix',
    'events',
];

const PRO_FEATURE_IDS = [
    'smartTranslate',
    'contextReconstruct',
    'filmContextReconstruct',
    'qcSmartFix',
    'filmAudioEnhance',
    'bilingualSemanticReview',
    'asrSemanticRepair',
    'assStyleExport',
];

/**
 * @param {object} [ev] evaluateEntitlement result
 * @param {{ devUnlock?: boolean }} [opts]
 */
function buildEntitlementPayload(ev, opts = {}) {
    const entitled = !!(opts.devUnlock || ev?.entitled);
    const features = entitled
        ? normalizeFeatureList(ev?.features, opts.devUnlock)
        : [];
    let kind = 'none';
    if (opts.devUnlock) kind = 'dev';
    else if (entitled && ev?.expiresAt) kind = 'trial';
    else if (entitled) kind = 'purchase';

    return {
        pro: entitled,
        kind,
        expiresAt: ev?.expiresAt || null,
        majorVersion: resolveMajorVersion(),
        features,
        reason: opts.devUnlock ? 'dev_unlock' : (ev?.reason || (entitled ? 'ok' : 'inactive')),
        message: opts.devUnlock
            ? '开发解锁（unpackaged）'
            : (ev?.message || (entitled ? 'Pro 已解锁' : '未激活 Pro')),
    };
}

function normalizeFeatureList(raw, unlockAll) {
    if (unlockAll) return [...PRO_FEATURE_IDS];
    const list = Array.isArray(raw) ? raw.map((x) => String(x || '').trim()).filter(Boolean) : [];
    if (list.includes('*')) return [...PRO_FEATURE_IDS];
    const out = [];
    const seen = new Set();
    for (const id of list) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

function resolveMajorVersion() {
    try {
        const pkg = require(path.join(__dirname, '..', 'package.json'));
        const m = String(pkg.version || '').match(/^(\d+)/);
        return m ? Number(m[1]) : null;
    } catch (_) {
        return null;
    }
}

function resolveTransubVersion() {
    try {
        const pkg = require(path.join(__dirname, '..', 'package.json'));
        return String(pkg.version || '');
    } catch (_) {
        return '';
    }
}

/**
 * Snapshot used by GET /editor/v1/health and /entitlement.
 * @param {{ getEntitlementEval?: () => object, isDevUnlock?: () => boolean }} [deps]
 */
function buildHealthSnapshot(deps = {}) {
    const isDevUnlock = typeof deps.isDevUnlock === 'function' ? !!deps.isDevUnlock() : false;
    let ev = { entitled: false, reason: 'inactive', message: '未激活 Pro 许可', features: [] };
    if (typeof deps.getEntitlementEval === 'function') {
        try {
            ev = deps.getEntitlementEval() || ev;
        } catch (_) { /* ignore */ }
    }
    const entitlement = buildEntitlementPayload(ev, { devUnlock: isDevUnlock });
    return {
        apiVersion: '1',
        transubVersion: resolveTransubVersion(),
        features: [...RPC_FEATURES_IMPLEMENTED],
        entitlement,
        busy: false,
    };
}

module.exports = {
    RPC_FEATURES_IMPLEMENTED,
    PRO_FEATURE_IDS,
    buildEntitlementPayload,
    buildHealthSnapshot,
    resolveTransubVersion,
    resolveMajorVersion,
};
