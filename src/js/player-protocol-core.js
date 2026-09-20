/**
 * Pure parse / merge helpers for transub:// Player handoff (no Electron).
 */
const path = require('path');

const PROTOCOL = 'transub';

const SOURCE_LANGS = Object.freeze(['auto', 'ja', 'zh', 'yue', 'ko', 'en']);
const CONTENT_PROFILES = Object.freeze(['av_soft', 'film', 'talk', 'unknown', 'general']);

function isPlayerProtocolUrl(raw) {
    const s = String(raw || '').trim();
    return /^transub:\/\//i.test(s);
}

/**
 * @returns {null | {
 *   mode: 'edit' | 'queue' | 'open' | 'shelf',
 *   media: string,
 *   sub: string,
 *   sourceLanguage: string,
 *   translateTarget: string,
 *   contentProfile: string,
 *   manifest: string,
 * }}
 */
function parsePlayerProtocolUrl(raw) {
    const s = String(raw || '').trim();
    if (!isPlayerProtocolUrl(s)) return null;

    let url;
    try {
        url = new URL(s);
    } catch {
        return null;
    }

    if (String(url.protocol || '').toLowerCase() !== `${PROTOCOL}:`) return null;

    const host = String(url.hostname || '').toLowerCase();
    const q = url.searchParams;
    const media = decodePath(q.get('media') || q.get('video') || '');
    const sub = decodePath(q.get('sub') || q.get('editSub') || q.get('edit-sub') || '');
    const sourceLanguage = String(q.get('src') || q.get('sourceLanguage') || '').trim();
    const translateTarget = String(q.get('tgt') || q.get('translateTarget') || '').trim();
    const contentProfile = String(q.get('profile') || q.get('contentProfile') || '').trim();
    const manifest = decodePath(q.get('manifest') || q.get('draft') || '');

    let mode = String(q.get('mode') || '').trim().toLowerCase();
    if (!mode) {
        if (host === 'edit' || host === 'editor') mode = 'edit';
        else if (host === 'queue' || host === 'files') mode = 'queue';
        else if (host === 'shelf' || host === 'subtitle-shelf'
            || host === 'library' || host === 'subtitle-library') mode = 'shelf';
        else if (host === 'open' || host === 'handoff' || host === '') mode = sub ? 'edit' : (media ? 'queue' : 'open');
        else mode = 'open';
    }

    if (mode === 'edit' || mode === 'editor') mode = 'edit';
    else if (mode === 'queue' || mode === 'files' || mode === 'add') mode = 'queue';
    else if (mode === 'shelf' || mode === 'subtitle-shelf'
        || mode === 'library' || mode === 'subtitle-library' || mode === 'lib') mode = 'shelf';
    else mode = 'open';

    if (mode === 'edit' && !sub) {
        mode = media ? 'queue' : 'open';
    }
    if (mode === 'queue' && !media) {
        mode = 'open';
    }

    return {
        mode,
        media,
        sub,
        sourceLanguage,
        translateTarget,
        contentProfile,
        manifest,
    };
}

function parsePlayerProtocolArgv(argv = []) {
    for (const arg of argv || []) {
        const parsed = parsePlayerProtocolUrl(arg);
        if (parsed) return parsed;
    }
    return null;
}

function decodePath(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        return path.normalize(decodeURIComponent(raw));
    } catch {
        return path.normalize(raw);
    }
}

function pickNonEmpty(...values) {
    for (const v of values) {
        const s = String(v == null ? '' : v).trim();
        if (s) return s;
    }
    return '';
}

function normalizeSourceLanguage(raw) {
    const lang = String(raw || '').trim().toLowerCase();
    if (!lang) return '';
    if (SOURCE_LANGS.includes(lang)) return lang;
    if (lang === 'jp' || lang === 'jpn' || lang === 'japanese') return 'ja';
    if (lang === 'eng' || lang === 'english') return 'en';
    if (lang === 'kor' || lang === 'kr' || lang === 'korean') return 'ko';
    if (lang === 'cn' || lang === 'zh-cn' || lang === 'zh-hans') return 'zh';
    if (lang === 'yue' || lang === 'cantonese') return 'yue';
    return '';
}

function normalizeContentProfile(raw) {
    const p = String(raw || '').trim().toLowerCase();
    if (!p) return '';
    if (CONTENT_PROFILES.includes(p)) return p === 'general' ? '' : p;
    return '';
}

/**
 * Map Player translateTarget → Transub chineseSubtitleVariant / task hints.
 * @returns {{
 *   chineseSubtitleVariant?: string,
 *   preferTranslate?: boolean,
 *   nonChineseTarget?: string,
 * }}
 */
function mapTranslateTarget(raw) {
    const t = String(raw || '').trim().toLowerCase();
    if (!t) return {};
    if (t === 'zh-hant' || t === 'zh_hant' || t === 'zh-tw' || t === 'zh-hk'
        || t === 'traditional' || t === 'hant') {
        return {
            chineseSubtitleVariant: 'traditional',
            subtitleTargetLang: 'zh-Hant',
            preferTranslate: true,
        };
    }
    if (t === 'zh' || t === 'zh-hans' || t === 'zh_hans' || t === 'zh-cn'
        || t === 'cn' || t === 'chinese' || t === 'simplified') {
        return {
            chineseSubtitleVariant: 'simplified',
            subtitleTargetLang: 'zh-Hans',
            preferTranslate: true,
        };
    }
    if (t === 'en' || t === 'eng' || t === 'english') {
        return {
            preferTranslate: true,
            nonChineseTarget: 'en',
            subtitleTargetLang: 'en',
        };
    }
    if (t === 'ja' || t === 'jp' || t === 'japanese') {
        return {
            preferTranslate: true,
            nonChineseTarget: 'ja',
            subtitleTargetLang: 'ja',
        };
    }
    if (t === 'ko' || t === 'kr' || t === 'korean') {
        return {
            preferTranslate: true,
            nonChineseTarget: 'ko',
            subtitleTargetLang: 'ko',
        };
    }
    return {};
}

function translateTargetLabel(raw) {
    const t = String(raw || '').trim().toLowerCase();
    if (!t) return '';
    const mapped = mapTranslateTarget(t);
    if (mapped.chineseSubtitleVariant === 'traditional') return '繁体中文';
    if (mapped.chineseSubtitleVariant === 'simplified') return '简体中文';
    if (mapped.nonChineseTarget === 'en') return '英语';
    if (mapped.nonChineseTarget === 'ja') return '日语';
    if (mapped.nonChineseTarget === 'ko') return '韩语';
    return t;
}

/**
 * Merge URL handoff fields with optional player-handoff.json body.
 * URL non-empty fields win over manifest.
 *
 * @param {object|null} parsed from parsePlayerProtocolUrl
 * @param {object|null} manifest parsed JSON (or null)
 */
function mergePlayerHandoffMeta(parsed = null, manifest = null) {
    const url = parsed && typeof parsed === 'object' ? parsed : {};
    const man = manifest && typeof manifest === 'object' ? manifest : {};

    const sourceLanguage = normalizeSourceLanguage(pickNonEmpty(
        url.sourceLanguage,
        man.sourceLanguage,
        man.language,
    ));
    const translateTarget = pickNonEmpty(url.translateTarget, man.translateTarget);
    const contentProfile = normalizeContentProfile(pickNonEmpty(
        url.contentProfile,
        man.contentProfile,
        man.senseProfile,
        man.profile,
    ));
    const mediaPath = pickNonEmpty(url.media, man.mediaPath, man.media);
    const draftSub = pickNonEmpty(url.sub, man.draftSub, man.sub);
    const mapped = mapTranslateTarget(translateTarget);

    return {
        mode: url.mode || '',
        mediaPath,
        draftSub,
        sourceLanguage,
        translateTarget,
        contentProfile,
        chineseSubtitleVariant: mapped.chineseSubtitleVariant || '',
        subtitleTargetLang: mapped.subtitleTargetLang || '',
        preferTranslate: !!mapped.preferTranslate,
        nonChineseTarget: mapped.nonChineseTarget || '',
        manifestVersion: Number(man.version) || 0,
        source: String(man.source || '').trim() || 'transub-player',
    };
}

/**
 * Form / job option patch for queue handoff (session apply, not persisted alone).
 * @param {ReturnType<typeof mergePlayerHandoffMeta>} meta
 * @param {{ advancedEntitled?: boolean, optionPatchForProfile?: Function }} [helpers]
 */
function buildPlayerHandoffFormPatch(meta = {}, helpers = {}) {
    const patch = {};
    const lang = normalizeSourceLanguage(meta.sourceLanguage);
    if (lang) patch.language = lang;

    const profile = normalizeContentProfile(meta.contentProfile);
    if (profile && profile !== 'unknown') {
        patch.contentProfile = profile;
        if (typeof helpers.optionPatchForProfile === 'function') {
            try {
                const sense = helpers.optionPatchForProfile(profile, {
                    task: 'translate',
                    advancedEntitled: helpers.advancedEntitled !== false,
                }) || {};
                Object.assign(patch, sense);
            } catch (_) { /* ignore */ }
        }
    }

    const variant = String(meta.chineseSubtitleVariant || '').trim();
    if (variant) patch.chineseSubtitleVariant = variant;

    const subtitleTargetLang = String(meta.subtitleTargetLang || meta.nonChineseTarget || '').trim();
    if (subtitleTargetLang) {
        patch.subtitleTargetLang = subtitleTargetLang;
        if (subtitleTargetLang === 'en' || subtitleTargetLang === 'ja' || subtitleTargetLang === 'ko') {
            // Form select uses intl codes directly
            patch.chineseSubtitleVariant = subtitleTargetLang;
        }
    }

    if (meta.preferTranslate) {
        patch.task = 'translate';
    }

    if (meta.nonChineseTarget) {
        patch._playerHandoffNote = `Player 译文目标为${translateTargetLabel(meta.nonChineseTarget)}；已写入成片目标语言，请确认任务参数。`;
    }

    return patch;
}

/**
 * Session payload for subtitle editor init (toast + option overrides).
 * @param {ReturnType<typeof mergePlayerHandoffMeta>} meta
 */
function buildPlayerHandoffEditorSession(meta = {}) {
    const language = normalizeSourceLanguage(meta.sourceLanguage);
    const contentProfile = normalizeContentProfile(meta.contentProfile);
    const variant = String(meta.chineseSubtitleVariant || '').trim();
    const translateTarget = String(meta.translateTarget || '').trim();
    const noteParts = ['已从 Transub Player 打开边看草稿'];
    if (language) noteParts.push(`片源语=${language}`);
    if (contentProfile) noteParts.push(`画像=${contentProfile}`);
    if (translateTarget) noteParts.push(`译文=${translateTargetLabel(translateTarget)}`);
    const hasMeta = !!(language || contentProfile || variant || translateTarget);
    if (!hasMeta) {
        return {
            language: '',
            contentProfile: '',
            chineseSubtitleVariant: '',
            translateTarget: '',
            nonChineseTarget: '',
            note: noteParts[0],
        };
    }
    return {
        language,
        contentProfile: contentProfile || '',
        chineseSubtitleVariant: variant,
        translateTarget,
        nonChineseTarget: String(meta.nonChineseTarget || '').trim(),
        note: noteParts.join(' · '),
    };
}

/**
 * Merge saved options with editor-session handoff overrides.
 */
function mergeOptionsWithPlayerHandoff(options = {}, session = null) {
    if (!session || typeof session !== 'object') return { ...options };
    const out = { ...options };
    if (session.language) out.language = session.language;
    if (session.chineseSubtitleVariant) {
        out.chineseSubtitleVariant = session.chineseSubtitleVariant;
    }
    if (session.contentProfile) {
        out.contentProfile = session.contentProfile;
        out.senseProfile = session.contentProfile;
    }
    return out;
}

function summarizePlayerHandoffMeta(meta = {}) {
    const parts = [];
    if (meta.sourceLanguage) parts.push(`语种=${meta.sourceLanguage}`);
    if (meta.contentProfile) parts.push(`画像=${meta.contentProfile}`);
    if (meta.translateTarget) parts.push(`译文=${translateTargetLabel(meta.translateTarget) || meta.translateTarget}`);
    if (meta.nonChineseTarget) parts.push('非中文目标');
    return parts.join(' · ');
}

module.exports = {
    PROTOCOL,
    SOURCE_LANGS,
    CONTENT_PROFILES,
    isPlayerProtocolUrl,
    parsePlayerProtocolUrl,
    parsePlayerProtocolArgv,
    normalizeSourceLanguage,
    normalizeContentProfile,
    mapTranslateTarget,
    translateTargetLabel,
    mergePlayerHandoffMeta,
    buildPlayerHandoffFormPatch,
    buildPlayerHandoffEditorSession,
    mergeOptionsWithPlayerHandoff,
    summarizePlayerHandoffMeta,
};
