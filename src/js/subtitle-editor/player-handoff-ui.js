/**
 * Player → Editor handoff session (toast + option overrides).
 * Pure helpers live in player-protocol-core; this part wires editor state.
 */
(function (global) {
    function getProtocolApi() {
        try {
            if (typeof require === 'function') {
                return require('../player-protocol-core');
            }
        } catch (_) { /* browser / packaged without node require */ }
        return global.TransubPlayerProtocol || null;
    }

    function normalizeSession(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const language = String(raw.language || '').trim();
        const contentProfile = String(raw.contentProfile || '').trim();
        const chineseSubtitleVariant = String(raw.chineseSubtitleVariant || '').trim();
        const translateTarget = String(raw.translateTarget || '').trim();
        const nonChineseTarget = String(raw.nonChineseTarget || '').trim();
        const subtitleTargetLang = String(raw.subtitleTargetLang || '').trim();
        const note = String(raw.note || '').trim();
        if (!language && !contentProfile && !chineseSubtitleVariant && !translateTarget
            && !nonChineseTarget && !subtitleTargetLang && !note) {
            return null;
        }
        return {
            language,
            contentProfile,
            chineseSubtitleVariant,
            translateTarget,
            nonChineseTarget,
            subtitleTargetLang,
            note,
        };
    }

    function applyPlayerHandoffFromInit(state, payload, { notify } = {}) {
        const session = normalizeSession(payload?.playerHandoff);
        if (!state || typeof state !== 'object') return null;
        state.playerHandoff = session;
        if (session?.note && typeof notify === 'function') {
            notify(session.note, 'ok');
        }
        return session;
    }

    function mergeOptionsWithPlayerHandoff(options, state) {
        const api = getProtocolApi();
        const session = state?.playerHandoff || null;
        if (api?.mergeOptionsWithPlayerHandoff) {
            return api.mergeOptionsWithPlayerHandoff(options || {}, session);
        }
        if (!session) return { ...(options || {}) };
        const out = { ...(options || {}) };
        if (session.language) out.language = session.language;
        if (session.chineseSubtitleVariant) {
            out.chineseSubtitleVariant = session.chineseSubtitleVariant;
        }
        if (session.subtitleTargetLang) {
            out.subtitleTargetLang = session.subtitleTargetLang;
            out.targetLang = session.subtitleTargetLang;
        } else if (session.nonChineseTarget) {
            out.subtitleTargetLang = session.nonChineseTarget;
            out.targetLang = session.nonChineseTarget;
            out.nonChineseTarget = session.nonChineseTarget;
            out.chineseSubtitleVariant = session.nonChineseTarget;
        } else if (session.translateTarget) {
            out.translateTarget = session.translateTarget;
        }
        if (session.contentProfile) {
            out.contentProfile = session.contentProfile;
            out.senseProfile = session.contentProfile;
        }
        return out;
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.playerHandoffUi = {
        normalizeSession,
        applyPlayerHandoffFromInit,
        mergeOptionsWithPlayerHandoff,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.TransubEditorParts.playerHandoffUi;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
