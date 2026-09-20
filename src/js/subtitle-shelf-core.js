/**
 * Subtitle shelf (字幕库) — pure helpers (browser + Node).
 * Slots per media: 转录 / 原文 / 译文(0..N). No versions / A/B / recipes.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleShelfCore = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleShelfCoreFactory() {
    const INDEX_VERSION = 1;
    const SHELF_DIR_NAME = 'subtitle-shelf';

    const LANG_LABELS = Object.freeze({
        'zh-Hans': '简体中文',
        'zh-Hant': '繁体中文',
        zh: '中文',
        en: '英语',
        ja: '日语',
        ko: '韩语',
        source: '原文',
        original: '原文',
        dual: '双语',
    });

    function fnv1a32Hex(str) {
        let h = 0x811c9dc5;
        const s = String(str || '');
        for (let i = 0; i < s.length; i += 1) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0).toString(16).padStart(8, '0');
    }

    function normPathKey(p) {
        let s = String(p || '').trim().replace(/\\/g, '/');
        if (!s) return '';
        // Drop trailing slashes except drive root like C:/
        if (s.length > 3) s = s.replace(/\/+$/, '');
        return s.toLowerCase();
    }

    function mediaIdFromPath(resolvedPath) {
        const key = normPathKey(resolvedPath);
        if (!key) return '';
        return `media_${fnv1a32Hex(key)}`;
    }

    function basenameStem(filePath) {
        const base = String(filePath || '').replace(/\\/g, '/').split('/').pop() || '';
        const dot = base.lastIndexOf('.');
        if (dot <= 0) return base;
        return base.slice(0, dot);
    }

    function pathExt(filePath) {
        const base = String(filePath || '').replace(/\\/g, '/').split('/').pop() || '';
        const dot = base.lastIndexOf('.');
        if (dot < 0) return '';
        return base.slice(dot).toLowerCase();
    }

    function pathDir(filePath) {
        const s = String(filePath || '').replace(/\\/g, '/');
        const i = s.lastIndexOf('/');
        if (i < 0) return '.';
        return s.slice(0, i) || '/';
    }

    function joinPath(dir, name) {
        const d = String(dir || '').replace(/\\/g, '/').replace(/\/+$/, '');
        const n = String(name || '').replace(/^\/+/, '');
        if (!d) return n;
        return `${d}/${n}`;
    }

    function langLabel(code) {
        const c = String(code || '').trim();
        if (!c) return '';
        if (LANG_LABELS[c]) return LANG_LABELS[c];
        const lower = c.toLowerCase();
        if (LANG_LABELS[lower]) return LANG_LABELS[lower];
        return c;
    }

    function normalizeVariantToCode(variant) {
        const v = String(variant || '').trim().toLowerCase();
        if (!v) return '';
        if (v === 'simplified' || v === 'zh-hans' || v === 'zh_hans' || v === 'zh-cn' || v === 'cn') {
            return 'zh-Hans';
        }
        if (
            v === 'traditional'
            || v === 'traditional-tw'
            || v === 'traditional-hk'
            || v === 'traditional-twp'
            || v === 'tw'
            || v === 'hk'
            || v === 'twp'
            || v === 'zh-hant'
            || v === 'zh_hant'
            || v === 'zh-tw'
            || v === 'zh-hk'
            || v === 'hant'
        ) {
            return 'zh-Hant';
        }
        return '';
    }

    function normalizeTargetCode(raw) {
        const t = String(raw || '').trim().toLowerCase();
        if (!t) return '';
        if (t === 'zh-hans' || t === 'zh_hans' || t === 'zh-cn' || t === 'cn' || t === 'simplified') {
            return 'zh-Hans';
        }
        if (
            t === 'zh-hant' || t === 'zh_hant' || t === 'zh-tw' || t === 'zh-hk'
            || t === 'traditional' || t === 'hant'
        ) {
            return 'zh-Hant';
        }
        if (t === 'zh' || t === 'chinese') return 'zh-Hans';
        if (t === 'en' || t === 'eng' || t === 'english') return 'en';
        if (t === 'ja' || t === 'jp' || t === 'jpn' || t === 'japanese') return 'ja';
        if (t === 'ko' || t === 'kr' || t === 'kor' || t === 'korean') return 'ko';
        return '';
    }

    /**
     * Translation language code from batch/options.
     * @returns {string} e.g. zh-Hans / zh-Hant / en / ja / ko
     */
    function langCodeFromOptions(options = {}) {
        const o = options && typeof options === 'object' ? options : {};
        try {
            const tgt = (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-target-lang-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleTargetLang : null);
            if (tgt?.resolveSubtitleTargetLang) {
                const code = tgt.resolveSubtitleTargetLang(o);
                // Collapse script variants to zh-Hant for shelf slots
                if (code === 'zh-Hant-TW' || code === 'zh-Hant-HK') return 'zh-Hant';
                return code;
            }
        } catch { /* fall through */ }
        const fromTarget = normalizeTargetCode(o.translateTarget || o.targetLanguage || o.targetLang || o.subtitleTargetLang);
        if (fromTarget) return fromTarget;
        const fromNonZh = normalizeTargetCode(o.nonChineseTarget);
        if (fromNonZh) return fromNonZh;
        const fromVariant = normalizeVariantToCode(o.chineseSubtitleVariant);
        if (fromVariant) return fromVariant;
        const fromLang = normalizeTargetCode(o.language);
        if (fromLang && fromLang !== 'source') return fromLang;
        return 'zh-Hans';
    }

    /**
     * Source / ASR language tag for transcript & original slots.
     */
    function sourceLangFromOptions(options = {}) {
        const o = options && typeof options === 'object' ? options : {};
        const lang = String(o.language || o.sourceLanguage || '').trim().toLowerCase();
        if (lang === 'ja' || lang === 'jp' || lang === 'jpn' || lang === 'japanese') return 'ja';
        if (lang === 'en' || lang === 'eng' || lang === 'english') return 'en';
        if (lang === 'ko' || lang === 'kr' || lang === 'kor' || lang === 'korean') return 'ko';
        if (
            lang === 'zh' || lang === 'zh-cn' || lang === 'zh-hans' || lang === 'cn'
            || lang === 'yue' || lang === 'zh-tw' || lang === 'zh-hant'
        ) {
            return 'zh';
        }
        if (lang && lang !== 'auto') return lang;
        return 'source';
    }

    /**
     * Infer lang from filename suffixes before the subtitle extension.
     */
    function inferLangFromFilename(filePath) {
        const stem = basenameStem(filePath).toLowerCase();
        if (!stem) return '';
        const markers = [
            ['.zh-hans', 'zh-Hans'],
            ['.zh_hans', 'zh-Hans'],
            ['.zh-hant', 'zh-Hant'],
            ['.zh_hant', 'zh-Hant'],
            ['.zh-cn', 'zh-Hans'],
            ['.zh-tw', 'zh-Hant'],
            ['.zh-hk', 'zh-Hant'],
            ['.original', 'original'],
            ['.transcribe', 'source'],
            ['.source', 'source'],
            ['.src', 'source'],
            ['.dual', 'dual'],
            ['.zh', 'zh'],
            ['.en', 'en'],
            ['.ja', 'ja'],
            ['.jp', 'ja'],
            ['.ko', 'ko'],
            ['.kr', 'ko'],
        ];
        for (const [suffix, code] of markers) {
            if (stem.endsWith(suffix) || stem.includes(`${suffix}.`)) return code;
        }
        return '';
    }

    function looksLikeSourceSubtitle(filePath) {
        const inferred = inferLangFromFilename(filePath);
        if (!inferred) return true;
        if (inferred === 'original' || inferred === 'source') return true;
        return false;
    }

    /**
     * Normalize subtitle extension to `.srt`-style.
     * @param {string} [fromExt]
     */
    function normalizeSubtitleExt(fromExt) {
        let ext = fromExt != null && String(fromExt).trim() !== ''
            ? String(fromExt).trim()
            : '.srt';
        if (!ext.startsWith('.')) ext = `.${ext}`;
        return ext.toLowerCase();
    }

    /**
     * `{subtitlesDir}/{stem}.{role}{ext}` under the software subtitles folder
     * (falls back to media directory when subtitlesDir is empty).
     * @param {string} mediaPath
     * @param {'original'|'transcribe'} role
     * @param {string} [fromExt]
     * @param {string} [subtitlesDir]
     */
    function buildRoleSubtitlePath(mediaPath, role, fromExt, subtitlesDir) {
        const media = String(mediaPath || '').trim();
        if (!media) return '';
        const tag = String(role || '').trim().toLowerCase() === 'transcribe' ? 'transcribe' : 'original';
        const stem = basenameStem(media);
        const ext = normalizeSubtitleExt(fromExt);
        const customDir = String(subtitlesDir || '').trim();
        if (typeof require !== 'undefined') {
            try {
                const nodePath = require('path');
                const dir = customDir || nodePath.dirname(media);
                return nodePath.join(dir, `${stem}.${tag}${ext}`);
            } catch { /* browser */ }
        }
        const dir = customDir || pathDir(media);
        return joinPath(dir, `${stem}.${tag}${ext}`);
    }

    /**
     * `{subtitlesDir}/{stem}.original{ext}` — default home is software `subtitles/`.
     * @param {string} mediaPath
     * @param {string} [fromExt] e.g. '.srt' or 'srt' — default .srt
     * @param {string} [subtitlesDir]
     */
    function buildOriginalSidecarPath(mediaPath, fromExt, subtitlesDir) {
        return buildRoleSubtitlePath(mediaPath, 'original', fromExt, subtitlesDir);
    }

    /**
     * `{subtitlesDir}/{stem}.transcribe{ext}` — ASR keep copy under software `subtitles/`.
     * @param {string} mediaPath
     * @param {string} [fromExt]
     * @param {string} [subtitlesDir]
     */
    function buildTranscribeKeepPath(mediaPath, fromExt, subtitlesDir) {
        return buildRoleSubtitlePath(mediaPath, 'transcribe', fromExt, subtitlesDir);
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function normalizeSlot(slot) {
        if (!slot || typeof slot !== 'object') return null;
        const p = String(slot.path || '').trim();
        if (!p) return null;
        return {
            path: p,
            lang: String(slot.lang || '').trim() || undefined,
            updatedAt: String(slot.updatedAt || '').trim() || undefined,
        };
    }

    function normalizeTranslation(t) {
        if (!t || typeof t !== 'object') return null;
        const p = String(t.path || '').trim();
        const lang = String(t.lang || '').trim();
        if (!p || !lang) return null;
        return {
            lang,
            label: String(t.label || '').trim() || langLabel(lang),
            path: p,
            updatedAt: String(t.updatedAt || '').trim() || undefined,
        };
    }

    function normalizeMedia(m) {
        if (!m || typeof m !== 'object') return null;
        const mediaPath = String(m.mediaPath || m.path || '').trim();
        const id = String(m.id || '').trim() || (mediaPath ? mediaIdFromPath(mediaPath) : '');
        if (!id) return null;
        const original = normalizeSlot(m.original);
        const transcript = normalizeSlot(m.transcript);
        const translations = (Array.isArray(m.translations) ? m.translations : [])
            .map(normalizeTranslation)
            .filter(Boolean);
        // Dedupe by lang (keep last)
        const byLang = new Map();
        for (const tr of translations) byLang.set(tr.lang, tr);
        const title = String(m.title || '').trim()
            || (mediaPath ? basenameStem(mediaPath) : id);
        const updatedAt = String(m.updatedAt || '').trim() || nowIso();
        const out = {
            id,
            mediaPath,
            title,
            transcript: transcript || null,
            original: original || null,
            translations: [...byLang.values()],
            updatedAt,
        };
        if (!out.original || !out.original.path) {
            out.broken = true;
            out.original = null;
        }
        return out;
    }

    function emptyIndex() {
        return {
            version: INDEX_VERSION,
            media: {},
            updatedAt: nowIso(),
        };
    }

    function normalizeIndex(raw) {
        const base = emptyIndex();
        if (!raw || typeof raw !== 'object') return base;
        const mediaIn = raw.media;
        const media = {};
        if (mediaIn && typeof mediaIn === 'object' && !Array.isArray(mediaIn)) {
            for (const [key, val] of Object.entries(mediaIn)) {
                const n = normalizeMedia({ ...val, id: val?.id || key });
                if (n) media[n.id] = n;
            }
        } else if (Array.isArray(mediaIn)) {
            for (const val of mediaIn) {
                const n = normalizeMedia(val);
                if (n) media[n.id] = n;
            }
        }
        return {
            version: INDEX_VERSION,
            media,
            updatedAt: String(raw.updatedAt || '').trim() || nowIso(),
        };
    }

    function mediaSummary(m) {
        const media = normalizeMedia(m) || m || {};
        const translations = Array.isArray(media.translations) ? media.translations : [];
        const translationLangs = [...new Set(
            translations
                .map((t) => {
                    const raw = String(t.lang || '').trim();
                    if (!raw) return '';
                    const n = normalizeTargetCode(raw) || raw;
                    if (n === 'zh-Hant-TW' || n === 'zh-Hant-HK') return 'zh-Hant';
                    if (n === 'zh') return 'zh-Hans';
                    return n;
                })
                .filter(Boolean),
        )];
        return {
            id: media.id || '',
            title: media.title || '',
            mediaPath: media.mediaPath || '',
            hasTranscript: !!(media.transcript && media.transcript.path),
            hasOriginal: !!(media.original && media.original.path),
            translationLabels: translations.map((t) => t.label || langLabel(t.lang) || t.lang).filter(Boolean),
            translationLangs,
            translationCount: translations.length,
            updatedAt: media.updatedAt || '',
            broken: !!media.broken,
        };
    }

    const SHELF_FILTERS = Object.freeze(['all', 'translated', 'missing']);
    const SHELF_SECONDARY_FILTERS = Object.freeze([
        'all',
        'transcript',
        'original',
        'zh-Hans',
        'zh-Hant',
        'en',
        'ko',
        'ja',
    ]);
    const PREVIEW_CUE_LIMIT = 300;
    const DEFAULT_DETAIL_WIDTH = 420;
    const MIN_DETAIL_WIDTH = 280;
    const MIN_LIST_WIDTH = 240;
    const DETAIL_SPLITTER_WIDTH = 6;

    /**
     * Clamp detail pane width given host width.
     * @param {number} width
     * @param {number} [hostWidth]
     */
    function clampShelfDetailWidth(width, hostWidth = 0) {
        const w = Number(width);
        const host = Number(hostWidth);
        let next = Number.isFinite(w) ? w : DEFAULT_DETAIL_WIDTH;
        next = Math.max(MIN_DETAIL_WIDTH, next);
        if (Number.isFinite(host) && host > 0) {
            const max = Math.max(
                MIN_DETAIL_WIDTH,
                host - MIN_LIST_WIDTH - DETAIL_SPLITTER_WIDTH,
            );
            next = Math.min(max, next);
        }
        return Math.round(next);
    }

    function itemHasTranslation(it) {
        return Number(it?.translationCount) > 0
            || (Array.isArray(it?.translationLabels) && it.translationLabels.length > 0)
            || (Array.isArray(it?.translationLangs) && it.translationLangs.length > 0);
    }

    function itemHasTranslationLang(it, want) {
        const code = String(want || '').trim();
        if (!code) return false;
        const langs = Array.isArray(it?.translationLangs) ? it.translationLangs : [];
        if (langs.some((l) => String(l) === code)) return true;
        // Fallback for older summaries without translationLangs
        const labels = Array.isArray(it?.translationLabels) ? it.translationLabels : [];
        const labelHints = {
            'zh-Hans': ['简体中文', '简中'],
            'zh-Hant': ['繁体中文', '繁中', '港繁'],
            en: ['英语', 'English', 'EN'],
            ko: ['韩语', '한국어', 'KO'],
            ja: ['日语', '日本語', 'JA'],
        };
        const hints = labelHints[code] || [];
        return labels.some((lb) => hints.includes(String(lb)));
    }

    function normalizeShelfSecondary(secondary) {
        const raw = String(secondary || 'all').trim();
        if (!raw) return 'all';
        const lower = raw.toLowerCase();
        if (lower === 'all' || lower === 'transcript' || lower === 'original') return lower;
        // Legacy chip
        if (lower === 'no_translation') return 'all';
        const langMap = {
            'zh-hans': 'zh-Hans',
            'zh-hant': 'zh-Hant',
            en: 'en',
            ja: 'ja',
            ko: 'ko',
            simplified: 'zh-Hans',
            traditional: 'zh-Hant',
        };
        if (langMap[lower]) return langMap[lower];
        return SHELF_SECONDARY_FILTERS.includes(raw) ? raw : 'all';
    }

    /**
     * @param {object[]} items
     * @param {'all'|'translated'|'missing'} filter
     * @param {string} [secondary]
     */
    function filterShelfItems(items, filter, secondary = 'all') {
        const list = Array.isArray(items) ? items : [];
        const f = String(filter || 'all').trim().toLowerCase();
        let out = list;
        if (f === 'translated') {
            out = list.filter((it) => itemHasTranslation(it));
        } else if (f === 'missing') {
            out = list.filter((it) => it?.mediaExists === false);
        } else {
            out = list.slice();
        }
        const s = normalizeShelfSecondary(secondary);
        if (s === 'transcript') {
            return out.filter((it) => !!it?.hasTranscript);
        }
        if (s === 'original') {
            return out.filter((it) => !!it?.hasOriginal);
        }
        if (s === 'zh-Hans' || s === 'zh-Hant' || s === 'en' || s === 'ko' || s === 'ja') {
            return out.filter((it) => itemHasTranslationLang(it, s));
        }
        return out;
    }

    function countShelfFilters(items) {
        const list = Array.isArray(items) ? items : [];
        let translated = 0;
        let missing = 0;
        for (const it of list) {
            if (itemHasTranslation(it)) translated += 1;
            if (it?.mediaExists === false) missing += 1;
        }
        return { all: list.length, translated, missing };
    }

    /** Counts for secondary chips within the current primary filter. */
    function countShelfSecondaryFilters(items, primaryFilter) {
        const base = filterShelfItems(items, primaryFilter, 'all');
        const out = {
            all: base.length,
            transcript: 0,
            original: 0,
            'zh-Hans': 0,
            'zh-Hant': 0,
            en: 0,
            ko: 0,
            ja: 0,
        };
        for (const it of base) {
            if (it?.hasTranscript) out.transcript += 1;
            if (it?.hasOriginal) out.original += 1;
            for (const code of ['zh-Hans', 'zh-Hant', 'en', 'ko', 'ja']) {
                if (itemHasTranslationLang(it, code)) out[code] += 1;
            }
        }
        return out;
    }

    /**
     * Slot tabs for detail panel: transcript / original / each translation.
     * @param {object|null} media detail from getMediaDetail
     * @returns {{ id: string, slot: string, lang: string, label: string, path: string, exists: boolean|null }[]}
     */
    function buildShelfSlotTabs(media) {
        const m = media && typeof media === 'object' ? media : {};
        const tabs = [];
        const transcript = m.transcript || null;
        tabs.push({
            id: 'transcript',
            slot: 'transcript',
            lang: '',
            label: '转录',
            path: transcript?.path || '',
            exists: transcript ? transcript.exists !== false : null,
        });
        const original = m.original || null;
        tabs.push({
            id: 'original',
            slot: 'original',
            lang: '',
            label: '原文',
            path: original?.path || '',
            exists: original ? original.exists !== false : null,
        });
        const translations = Array.isArray(m.translations) ? m.translations : [];
        for (const t of translations) {
            const lang = String(t?.lang || '').trim();
            if (!lang) continue;
            tabs.push({
                id: `tr:${lang}`,
                slot: 'translation',
                lang,
                label: `译文 · ${t.label || langLabel(lang) || lang}`,
                path: t.path || '',
                exists: t.exists !== false,
            });
        }
        if (!translations.length) {
            tabs.push({
                id: 'tr:empty',
                slot: 'translation',
                lang: '',
                label: '译文',
                path: '',
                exists: null,
            });
        }
        return tabs;
    }

    /** Format cue start/end ms as HH:MM:SS or MM:SS.mmm-ish short. */
    function formatCueTime(ms) {
        const n = Number(ms);
        if (!Number.isFinite(n) || n < 0) return '—';
        const totalSec = Math.floor(n / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        const pad = (x) => String(x).padStart(2, '0');
        if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
        return `${pad(m)}:${pad(s)}`;
    }

    function previewKey(mediaId, slot, lang) {
        return `${String(mediaId || '').trim()}|${String(slot || '').trim()}|${String(lang || '').trim()}`;
    }

    function truncatePreviewCues(cues, limit = PREVIEW_CUE_LIMIT) {
        const list = Array.isArray(cues) ? cues : [];
        const max = Math.max(1, Number(limit) || PREVIEW_CUE_LIMIT);
        if (list.length <= max) {
            return { cues: list, cueCount: list.length, truncated: false };
        }
        return { cues: list.slice(0, max), cueCount: list.length, truncated: true };
    }

    return {
        INDEX_VERSION,
        SHELF_DIR_NAME,
        SHELF_FILTERS,
        SHELF_SECONDARY_FILTERS,
        PREVIEW_CUE_LIMIT,
        DEFAULT_DETAIL_WIDTH,
        MIN_DETAIL_WIDTH,
        MIN_LIST_WIDTH,
        DETAIL_SPLITTER_WIDTH,
        clampShelfDetailWidth,
        normalizeShelfSecondary,
        mediaIdFromPath,
        normPathKey,
        langCodeFromOptions,
        sourceLangFromOptions,
        langLabel,
        inferLangFromFilename,
        looksLikeSourceSubtitle,
        buildRoleSubtitlePath,
        buildOriginalSidecarPath,
        buildTranscribeKeepPath,
        emptyIndex,
        normalizeSlot,
        normalizeTranslation,
        normalizeMedia,
        normalizeIndex,
        mediaSummary,
        basenameStem,
        pathExt,
        filterShelfItems,
        countShelfFilters,
        countShelfSecondaryFilters,
        buildShelfSlotTabs,
        formatCueTime,
        previewKey,
        truncatePreviewCues,
    };
}));
