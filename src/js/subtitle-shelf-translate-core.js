/**
 * Subtitle shelf → translate-from-slot helpers (pure).
 * Source = 原文 / 转录; dest reuses factory retranslate path rules.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleShelfTranslate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleShelfTranslateFactory() {
    const SOURCE_SLOTS = Object.freeze(['original', 'transcript']);

    function normalizeSourceSlot(raw) {
        const s = String(raw || '').trim().toLowerCase();
        if (s === 'transcript' || s === 'kept' || s === 'transcribe' || s === 'asr') return 'transcript';
        if (s === 'original' || s === 'source' || s === '原文') return 'original';
        return '';
    }

    function sourceSlotLabel(slot) {
        return normalizeSourceSlot(slot) === 'transcript' ? '转录' : '原文';
    }

    /**
     * Map shelf source slot → subtitle-task entry stage (skip ASR).
     * 转录 → 校正(repair)；原文 → 翻译(translate)。
     * @param {string} sourceSlot
     * @returns {{
     *   ok: boolean,
     *   slot?: string,
     *   entryStage?: 'repair'|'translate',
     *   pipelineFloor?: number,
     *   skipAsr?: boolean,
     *   runSemanticRepair?: boolean,
     *   runSecondOpinion?: boolean,
     *   error?: string,
     * }}
     */
    function resolveShelfTranslateEntry(sourceSlot) {
        const slot = normalizeSourceSlot(sourceSlot);
        if (slot === 'transcript') {
            return {
                ok: true,
                slot,
                entryStage: 'repair',
                pipelineFloor: 2,
                skipAsr: true,
                runSemanticRepair: true,
                // Second opinion needs audio re-decode — not available for shelf-only entry.
                runSecondOpinion: false,
            };
        }
        if (slot === 'original') {
            return {
                ok: true,
                slot,
                entryStage: 'translate',
                pipelineFloor: 3,
                skipAsr: true,
                runSemanticRepair: false,
                runSecondOpinion: false,
            };
        }
        return { ok: false, error: '未知源槽位' };
    }

    /**
     * @param {object|null} media shelf media detail
     * @param {string} sourceSlot
     * @returns {{ ok: boolean, slot?: string, path?: string, exists?: boolean, error?: string }}
     */
    function resolveShelfSourceSlot(media, sourceSlot) {
        const slot = normalizeSourceSlot(sourceSlot);
        if (!slot) return { ok: false, error: '未知源槽位' };
        const entry = slot === 'transcript' ? media?.transcript : media?.original;
        const path = String(entry?.path || '').trim();
        if (!path) {
            return {
                ok: false,
                slot,
                error: slot === 'transcript' ? '尚无转录字幕' : '尚无原文字幕',
            };
        }
        if (entry?.exists === false) {
            return { ok: false, slot, path, exists: false, error: '源字幕文件不存在' };
        }
        return { ok: true, slot, path, exists: entry?.exists !== false };
    }

    /**
     * Prefer existing translation path for the target lang; else factory dest helper.
     * Never returns the same path as source (would overwrite 原文/转录).
     */
    function resolveShelfTranslateDestPath(media, sourcePath, opts = {}) {
        const lang = String(opts.langCode || '').trim() || 'zh-Hans';
        const norm = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();
        const src = String(sourcePath || '').trim();
        let dest = '';
        if (lang && Array.isArray(media?.translations)) {
            const hit = media.translations.find((t) => String(t?.lang || '') === lang && String(t?.path || '').trim());
            if (hit?.path) dest = String(hit.path).trim();
        }
        if (!dest) {
            const item = opts.item || buildSyntheticQueueItem(media, { sourcePath: src });
            if (typeof opts.resolveRetranslateDestPath === 'function') {
                dest = String(opts.resolveRetranslateDestPath(item, src, opts.destDeps || {}) || '').trim();
            } else {
                dest = String(item.targetSubtitlePath || item.subtitlePath || '').trim();
            }
        }
        if (dest && src && norm(dest) === norm(src)) {
            dest = appendLangSuffix(src, lang);
        }
        if (!dest && src) {
            dest = appendLangSuffix(src, lang);
        }
        return dest;
    }

    function appendLangSuffix(filePath, langCode) {
        const p = String(filePath || '').replace(/\\/g, '/');
        const i = p.lastIndexOf('/');
        const dir = i >= 0 ? p.slice(0, i) : '.';
        const base = i >= 0 ? p.slice(i + 1) : p;
        const dot = base.lastIndexOf('.');
        const stem = dot > 0 ? base.slice(0, dot) : base;
        const ext = dot > 0 ? base.slice(dot) : '.srt';
        const clean = stem
            .replace(/\.original$/i, '')
            .replace(/\.transcribe$/i, '')
            .replace(/\.source$/i, '')
            .replace(/\.src$/i, '')
            .replace(/\.zh(-[a-z0-9]+)?$/i, '')
            .replace(/\.(en|ja|ko|zh)$/i, '');
        let tag = String(langCode || '').trim() || 'zh-cn';
        try {
            const fill = (typeof module !== 'undefined' && module.exports)
                ? require('./mt-short-fill-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubMtShortFill : null);
            if (fill?.dualTargetSuffixFromLang) {
                tag = fill.dualTargetSuffixFromLang({
                    subtitleTargetLang: langCode || 'zh-Hans',
                }) || tag;
            }
        } catch { /* optional */ }
        // Canonical shelf codes → file tags when short-fill helper unavailable
        const lower = tag.toLowerCase();
        if (lower === 'zh-hans' || lower === 'zh') tag = 'zh-cn';
        else if (lower === 'zh-hant' || lower === 'zh-hant-tw') tag = 'zh-tw';
        else if (lower === 'zh-hant-hk') tag = 'zh-hk';
        return `${dir}/${clean}.${tag}${ext}`;
    }

    /**
     * Resolve MT source language for shelf slots (never leave as auto).
     * @param {object|null} media
     * @param {string} sourceSlot
     * @param {string} [formLang]
     */
    function resolveShelfSourceLanguage(media, sourceSlot, formLang = '') {
        const slot = normalizeSourceSlot(sourceSlot);
        const entry = slot === 'transcript' ? media?.transcript : media?.original;
        const fromSlot = String(entry?.lang || '').trim().toLowerCase();
        const map = (raw) => {
            const s = String(raw || '').trim().toLowerCase();
            if (!s || s === 'auto' || s === 'source' || s === 'original') return '';
            if (s === 'jp' || s === 'jpn' || s === 'japanese') return 'ja';
            if (s === 'eng' || s === 'english') return 'en';
            if (s === 'kr' || s === 'kor' || s === 'korean') return 'ko';
            if (s === 'zh-cn' || s === 'zh-hans' || s === 'cn' || s === 'chinese') return 'zh';
            if (s === 'zh-tw' || s === 'zh-hk' || s === 'zh-hant' || s === 'yue') return 'zh';
            if (s === 'ja' || s === 'en' || s === 'ko' || s === 'zh') return s;
            return '';
        };
        return map(fromSlot) || map(formLang) || 'ja';
    }

    /**
     * Heuristic: source already looks like Chinese (would 乱翻 if treated as JA).
     * @param {Array<{ text?: string }>} cues
     */
    function cuesLookPrimarilyChinese(cues) {
        const sample = (Array.isArray(cues) ? cues : [])
            .slice(0, 48)
            .map((c) => String(c?.text || ''))
            .join('');
        if (!sample) return false;
        const cjk = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
        const hiraKata = (sample.match(/[\u3040-\u30ff]/g) || []).length;
        return cjk >= 24 && hiraKata < Math.max(4, cjk * 0.12);
    }

    /**
     * Minimal factory queue item shaped for retranslate / post-batch / QC.
     * @param {object} media
     * @param {{ sourcePath?: string, destPath?: string }} [paths]
     */
    function buildSyntheticQueueItem(media, paths = {}) {
        const mediaPath = String(media?.mediaPath || '').trim();
        const title = String(media?.title || '').trim();
        const path = mediaPath || title || String(media?.id || 'shelf-item');
        const sourcePath = String(paths.sourcePath || media?.original?.path || media?.transcript?.path || '').trim();
        const destPath = String(paths.destPath || '').trim();
        const entry = resolveShelfTranslateEntry(paths.sourceSlot || paths.entrySlot || '');
        const pipelineFloor = Number.isFinite(Number(entry.pipelineFloor))
            ? Number(entry.pipelineFloor)
            : 3;
        return {
            path,
            selected: false,
            status: 'pending',
            duration: Number(media?.durationSec) || Number(media?.duration) || 0,
            progress: 0,
            detail: '',
            fromShelf: true,
            shelfMediaId: String(media?.id || '').trim(),
            sourceSubtitlePath: sourcePath || undefined,
            targetSubtitlePath: destPath || undefined,
            subtitlePath: destPath || undefined,
            existingSubtitle: destPath || undefined,
            skipAsr: true,
            shelfEntryStage: entry.entryStage || 'translate',
            shelfSourceSlot: entry.slot || '',
            pipelineFloor,
            stage: entry.entryStage === 'repair' ? 'source_cleanup' : 'translate',
            sense: {
                status: 'off',
                adopted: false,
                // Form params; start is not gated on per-file classification.
                userRejected: true,
                classification: null,
                overrides: {},
                message: '字幕库翻译：走表单参数（跳过感知）',
            },
        };
    }

    /**
     * @param {object} media
     * @param {string} sourceSlot
     * @param {{
     *   langCode?: string,
     *   cues?: Array,
     *   format?: string,
     *   resolveRetranslateDestPath?: Function,
     *   destDeps?: object,
     * }} [opts]
     */
    function buildShelfTranslatePlanRow(media, sourceSlot, opts = {}) {
        const src = resolveShelfSourceSlot(media, sourceSlot);
        if (!src.ok) {
            return { ok: false, error: src.error || '无可用源字幕', sourceSlot: src.slot || sourceSlot };
        }
        const entry = resolveShelfTranslateEntry(src.slot);
        if (!entry.ok) {
            return { ok: false, error: entry.error || '未知源槽位', sourceSlot: src.slot };
        }
        const item = buildSyntheticQueueItem(media, {
            sourcePath: src.path,
            sourceSlot: src.slot,
        });
        const destPath = resolveShelfTranslateDestPath(media, src.path, {
            langCode: opts.langCode,
            item,
            resolveRetranslateDestPath: opts.resolveRetranslateDestPath,
            destDeps: opts.destDeps,
        });
        if (!destPath) {
            return { ok: false, error: '无法解析译文输出路径', sourceSlot: src.slot };
        }
        item.sourceSubtitlePath = src.path;
        item.targetSubtitlePath = destPath;
        item.subtitlePath = destPath;
        item.existingSubtitle = destPath;
        item.skipAsr = true;
        item.shelfEntryStage = entry.entryStage;
        item.shelfSourceSlot = src.slot;
        item.pipelineFloor = entry.pipelineFloor;
        item.stage = entry.entryStage === 'repair' ? 'source_cleanup' : 'translate';
        const sourceLanguage = resolveShelfSourceLanguage(media, src.slot, opts.formLanguage);
        return {
            ok: true,
            item,
            sourcePath: src.path,
            destPath,
            sourceKind: src.slot === 'transcript' ? 'shelf-transcript' : 'shelf-original',
            sourceSlot: src.slot,
            sourceLanguage,
            entryStage: entry.entryStage,
            pipelineFloor: entry.pipelineFloor,
            skipAsr: true,
            mediaId: String(media?.id || '').trim(),
            fromShelf: true,
            cues: Array.isArray(opts.cues) ? opts.cues : undefined,
            format: opts.format || undefined,
        };
    }

    /**
     * Per-item optionOverrides so engine batch skips ASR and loads shelf source.
     * @param {{
     *   sourcePath?: string,
     *   sourceSlot?: string,
     *   sourceLanguage?: string,
     *   entryStage?: string,
     *   destPath?: string,
     * }} plan
     */
    function buildShelfTranslateOptionOverrides(plan = {}) {
        const entry = resolveShelfTranslateEntry(plan.sourceSlot);
        const sourcePath = String(plan.sourcePath || '').trim();
        const language = String(plan.sourceLanguage || '').trim();
        const entryStage = entry.ok
            ? entry.entryStage
            : (String(plan.entryStage || '').trim() === 'repair' ? 'repair' : 'translate');
        const out = {
            skipAsr: true,
            overwrite: true,
            task: 'translate',
            shelfSourceSubtitlePath: sourcePath,
            shelfEntryStage: entryStage,
            shelfSourceSlot: entry.slot || normalizeSourceSlot(plan.sourceSlot) || '',
            runSemanticRepair: entryStage === 'repair',
        };
        if (language && language !== 'auto') out.language = language;
        return out;
    }

    /** Keys that must survive sense/style-only merges into fileMerged. */
    const SHELF_BATCH_OVERRIDE_KEYS = Object.freeze([
        'skipAsr',
        'overwrite',
        'task',
        'shelfSourceSubtitlePath',
        'shelfEntryStage',
        'shelfSourceSlot',
        'runSemanticRepair',
        'language',
    ]);

    /**
     * Re-apply shelf / skip-ASR runtime keys after mergeSenseOverrides
     * (which only copies SENSE_OWNED_KEYS and would drop skipAsr).
     * @param {object} base
     * @param {object} overrides
     */
    function mergeShelfBatchOverrides(base = {}, overrides = {}) {
        if (!overrides || typeof overrides !== 'object') return { ...base };
        const hasShelf = overrides.skipAsr === true
            || overrides.skipAsr === 1
            || overrides.skipAsr === '1'
            || !!String(overrides.shelfEntryStage || '').trim()
            || !!String(overrides.shelfSourceSlot || '').trim()
            || !!String(overrides.shelfSourceSubtitlePath || '').trim();
        if (!hasShelf) return { ...base };
        const out = { ...base };
        for (const key of SHELF_BATCH_OVERRIDE_KEYS) {
            if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
            out[key] = overrides[key];
        }
        return out;
    }

    return {
        SOURCE_SLOTS,
        SHELF_BATCH_OVERRIDE_KEYS,
        normalizeSourceSlot,
        sourceSlotLabel,
        resolveShelfTranslateEntry,
        resolveShelfSourceSlot,
        resolveShelfTranslateDestPath,
        resolveShelfSourceLanguage,
        cuesLookPrimarilyChinese,
        appendLangSuffix,
        buildSyntheticQueueItem,
        buildShelfTranslatePlanRow,
        buildShelfTranslateOptionOverrides,
        mergeShelfBatchOverrides,
    };
}));