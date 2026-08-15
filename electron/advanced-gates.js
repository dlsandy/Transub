/**
 * Lightweight Advanced entitlement gates for Engine / TWAI batch paths.
 * Kept separate from advanced-bridge so first engine IPC does not load
 * reconstruct / managed-llm / llama-server stacks.
 */
const entitlement = require('../src/js/advanced-entitlement-core');
const { readAdvancedDoc } = require('./advanced-license-data');
const { getAdvancedDeviceId } = require('./advanced-device-id');

function isAppPackaged() {
    try {
        const { app } = require('electron');
        return !!(app && app.isPackaged);
    } catch (_) {
        return false;
    }
}

/**
 * Dev unlock: unpackaged `npm start` only.
 * Packaged builds never honor TRANSUB_ADVANCED_DEV_UNLOCK (release hardening).
 */
function isDevUnlockEnabled() {
    if (isAppPackaged()) return false;
    const v = String(process.env.TRANSUB_ADVANCED_DEV_UNLOCK || '').trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    // Unpackaged Electron always unlocks Pro for local development.
    try {
        const { app } = require('electron');
        if (app && typeof app.isPackaged === 'boolean' && !app.isPackaged) return true;
    } catch (_) { /* ignore */ }
    return false;
}

function evaluateFreeWithInstall(doc, options = {}) {
    const faithfulTone = !!options.faithfulTone;
    let llmFs = null;
    try {
        llmFs = require('./advanced-llm-fs');
    } catch (_) { /* ignore */ }
    const evalOpts = { faithfulTone };
    if (typeof options.isModelInstalled === 'function') {
        evalOpts.isModelInstalled = options.isModelInstalled;
    } else if (llmFs) {
        evalOpts.isModelInstalled = (modelId) => llmFs.isModelInstalled(modelId);
    }
    // If llmFs is unavailable, omit the install probe (do not fail-open as "installed").
    return entitlement.evaluateFreePipelineTranslate(doc, evalOpts);
}

/**
 * @param {string} featureId
 * @returns {{ ok: boolean, error?: string, code?: string, status?: object, devUnlock?: boolean }}
 */
function requireFeature(featureId) {
    const deviceId = getAdvancedDeviceId();
    const current = readAdvancedDoc();
    if (isDevUnlockEnabled()) {
        return {
            ok: true,
            devUnlock: true,
            status: { entitled: true, reason: 'dev_unlock', devUnlock: true },
        };
    }
    const check = entitlement.isFeatureEntitled(current.doc.license, deviceId, featureId);
    if (!check.entitled) {
        return {
            ok: false,
            error: check.message,
            code: check.reason,
            status: { entitled: false, reason: check.reason, message: check.message },
        };
    }
    return {
        ok: true,
        status: { entitled: true, reason: check.reason || 'ok' },
    };
}

/**
 * 智能翻译门控：Pro 专属（smartTranslate 或 contextReconstruct）。
 * @param {{ faithfulTone?: boolean }} [_options] 保留兼容；不再提供免费 ≤7B 旁路
 */
function requireSmartTranslate(_options = {}) {
    const gateSmart = requireFeature(entitlement.FEATURE_SMART_TRANSLATE);
    const gateBasic = requireFeature(entitlement.FEATURE_CONTEXT_RECONSTRUCT);
    if (gateSmart.ok || gateBasic.ok) {
        return {
            ok: true,
            advanced: true,
            freeTier: false,
            status: gateSmart.ok ? gateSmart.status : gateBasic.status,
            devUnlock: !!(gateSmart.devUnlock || gateBasic.devUnlock),
        };
    }
    return {
        ok: false,
        advanced: false,
        freeTier: false,
        error: gateSmart.error || '智能翻译需解锁 Pro',
        code: gateSmart.code || 'not_entitled',
        status: gateSmart.status || { entitled: false },
    };
}

function requireFilmAudioEnhance() {
    const gateFilm = requireFeature(entitlement.FEATURE_FILM_AUDIO_ENHANCE);
    const gateBasic = requireFeature(entitlement.FEATURE_CONTEXT_RECONSTRUCT);
    if (gateFilm.ok || gateBasic.ok) {
        return gateFilm.ok ? gateFilm : gateBasic;
    }
    return {
        ...gateFilm,
        error: gateFilm.error || '影视音频增强需解锁 Pro',
        code: gateFilm.code || 'not_entitled',
    };
}

/** 字幕库 Pro 深度能力（A/B、diff、发布等）；任意 Pro 买断亦视为解锁 */
function requireSubtitleLibraryPro() {
    const gateLib = requireFeature(entitlement.FEATURE_SUBTITLE_LIBRARY_PRO);
    if (gateLib.ok) return gateLib;
    const deviceId = getAdvancedDeviceId();
    const current = readAdvancedDoc();
    if (isDevUnlockEnabled()) {
        return { ok: true, devUnlock: true, status: { entitled: true, reason: 'dev_unlock' } };
    }
    const ev = entitlement.evaluateEntitlement(current.doc.license, deviceId);
    if (ev.entitled) {
        return { ok: true, status: { entitled: true, reason: ev.reason || 'ok' } };
    }
    return {
        ok: false,
        error: gateLib.error || '字幕库高级能力需解锁 Pro',
        code: gateLib.code || 'not_entitled',
        status: gateLib.status || { entitled: false },
    };
}

module.exports = {
    isDevUnlockEnabled,
    requireFeature,
    requireSmartTranslate,
    requireFilmAudioEnhance,
    requireSubtitleLibraryPro,
    evaluateFreeWithInstall,
};
