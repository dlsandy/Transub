/**
 * Retranslate dest path / progress / smart-model filter helpers (pure).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubRetranslatePlan = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function retranslatePlanFactory() {
    function primarySubFormatFromList(subFormats) {
        const parts = String(subFormats || 'srt')
            .split(/[,;\s]+/)
            .map((s) => s.trim().toLowerCase())
            .filter((s) => ['srt', 'vtt', 'lrc', 'ass'].includes(s));
        return parts[0] || 'srt';
    }

    /**
     * @param {object} item
     * @param {string} sourcePath
     * @param {{
     *   resolveOutputDir?: () => string,
     *   pathDirname?: (p: string) => string,
     *   pathJoin?: (...parts: string[]) => string,
     *   stemNoExt?: (p: string) => string,
     *   normPath?: (p: string) => string,
     *   subFormats?: string,
     * }} deps
     */
    function resolveRetranslateDestPath(item, sourcePath, deps = {}) {
        const norm = deps.normPath || ((p) => String(p || '').replace(/\\/g, '/').toLowerCase());
        const dirname = deps.pathDirname || ((p) => {
            const s = String(p || '');
            const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
            return i >= 0 ? s.slice(0, i) : '';
        });
        const join = deps.pathJoin || ((...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/'));
        const stem = deps.stemNoExt || ((p) => {
            const base = String(p || '').split(/[/\\]/).pop() || '';
            return base.replace(/\.[^.]+$/, '');
        });

        const tgt = String(item?.targetSubtitlePath || '').trim();
        if (tgt) return tgt;
        const sub = String(item?.subtitlePath || item?.existingSubtitle || '').trim();
        const src = String(sourcePath || '').trim();
        if (sub && norm(sub) !== norm(src)) return sub;
        const video = String(item?.path || '').trim();
        const outDir = (typeof deps.resolveOutputDir === 'function' ? deps.resolveOutputDir() : '')
            || dirname(video)
            || dirname(src);
        let stemName = stem(video) || stem(src) || 'subtitle';
        // Strip prior role / lang tags so retranslate builds `{stem}.{langTag}.{fmt}`
        stemName = String(stemName)
            .replace(/\.(original|transcribe|source|src|bilingual|bi)$/i, '')
            .replace(/\.zh(-[a-z0-9]+)?$/i, '')
            .replace(/\.(en|ja|ko|zh)$/i, '');
        const fmt = primarySubFormatFromList(deps.subFormats);
        let langTag = String(deps.dualTargetSuffix || deps.targetLangSuffix || '').trim().toLowerCase();
        if (!langTag) {
            try {
                const fill = (typeof module !== 'undefined' && module.exports)
                    ? require('./mt-short-fill-core')
                    : (typeof globalThis !== 'undefined' ? globalThis.TransubMtShortFill : null);
                const lang = deps.subtitleTargetLang || deps.targetLang || item?.subtitleTargetLang || item?.targetLang;
                if (fill?.dualTargetSuffixFromLang) {
                    langTag = fill.dualTargetSuffixFromLang({
                        subtitleTargetLang: lang || 'zh-Hans',
                    });
                }
            } catch { /* optional */ }
        }
        if (!langTag) langTag = 'zh-cn';
        return join(outDir, `${stemName}.${langTag}.${fmt}`);
    }

    function computeRetranslateOverallPct({ index = 0, itemPct = 0, total = 1 } = {}) {
        const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
        const t = Math.max(1, Number(total) || 1);
        const idx = Math.max(0, Math.min(t - 1, Number(index) || 0));
        const within = Math.max(0, Math.min(1, (Number(itemPct) || 0) / 100));
        const overall = clampPct(((idx + within) / t) * 100);
        const displayOverall = overall >= 100 && idx < t - 1 ? 99 : Math.min(99, overall);
        return { overall, displayOverall, index: idx, total: t };
    }

    function isSmartTranslateCapableModel(item, catalogApi = null) {
        if (!item?.id) return false;
        // Dialog / polish picker: translate-only (Sakura, GalTransl, Hy-MT, …) cannot chat.
        if (isSmartTranslateLiteModel(item, catalogApi)) return false;
        if (catalogApi?.supportsAdvancedReconstruct) {
            return !!catalogApi.supportsAdvancedReconstruct(item.id);
        }
        return true;
    }

    function isSmartTranslateLiteModel(item, catalogApi = null) {
        if (!item) return false;
        if (item.translateOnly) return true;
        if (catalogApi?.isTranslateOnlyModel?.(item.id) || catalogApi?.isTranslateOnlyModel?.(item)) {
            return true;
        }
        if (catalogApi?.isSmartTranslateLiteModel?.(item.id) || catalogApi?.isSmartTranslateLiteModel?.(item)) {
            return true;
        }
        const fam = String(item.family || '').toLowerCase();
        return fam === 'sakura'
            || fam === 'galtransl'
            || fam === 'hymt'
            || fam === 'hy-mt'
            || fam === 'translategemma'
            || fam === 'hunyuan';
    }

    /**
     * @param {object} item
     * @param {object|null} [catalogApi]
     * @returns {string}
     */
    function formatSmartTranslateModelLabel(item, catalogApi = null) {
        const name = String(item?.name || item?.id || '').trim() || 'unknown';
        if (!isSmartTranslateLiteModel(item, catalogApi)) return name;
        return `${name}（不支持简要/润色）`;
    }

    function filterSmartTranslateCatalog(catalog, catalogApi = null) {
        return (Array.isArray(catalog) ? catalog : [])
            .filter((item) => item?.installed && isSmartTranslateCapableModel(item, catalogApi))
            .sort((a, b) => {
                const liteA = isSmartTranslateLiteModel(a, catalogApi) ? 1 : 0;
                const liteB = isSmartTranslateLiteModel(b, catalogApi) ? 1 : 0;
                if (liteA !== liteB) return liteA - liteB; // chat models first
                return String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh');
            });
    }

    /**
     * Retranslate modal · smart-translate hybrid UI (visibility / labels / validation).
     * Mirrors settings: 句级推理 + 剧情贴合润色.
     * @param {{ hybridOn?: boolean, polishOn?: boolean, smartLocked?: boolean }} input
     */
    function buildRetranslateSmartUiState(input = {}) {
        if (input.smartLocked) {
            return {
                showSmartOptions: false,
                showHybridMt: false,
                showDialogModel: false,
                dialogLabel: '润色模型',
                schemeHint: '',
                modelHint: '智能翻译为 Pro 专属，请先激活 Pro。',
                requireDialogModel: false,
                allowEmptyDialog: true,
            };
        }
        const hybrid = input.hybridOn !== false;
        const polish = input.polishOn !== false;
        const showHybridMt = hybrid;
        const showDialogModel = !hybrid || polish;
        let dialogLabel = '润色模型';
        if (hybrid && polish) dialogLabel = '润色模型（剧情贴合）';
        else if (!hybrid) dialogLabel = '润色模型（按行翻译）';

        let schemeHint = '日语默认：翻译模型做句级，润色模型做贴合润色（补欠译、锁人名、纠错译）。';
        if (hybrid && !polish) {
            schemeHint = '仅用翻译模型做句级，不做润色。';
        } else if (!hybrid && polish) {
            schemeHint = '润色模型按行翻译后再做贴合润色（未用句级推理）。';
        } else if (!hybrid && !polish) {
            schemeHint = '整段由润色模型按行翻译（句级推理与润色均已关）。';
        }

        let modelHint = '请选择已下载的通用对话模型（如 Qwen Instruct）；翻译专用模型不在此列表。';
        if (hybrid && polish) {
            modelHint = '翻译模型可留空自动匹配；润色模型用于贴合润色（可留空跳过）。翻译专用请到「翻译模型」，勿作润色模型。';
        } else if (hybrid && !polish) {
            modelHint = '翻译模型可留空自动匹配（按语言 / Pro / 硬件）。';
        } else if (!hybrid) {
            modelHint = '请选择已下载的润色模型按行翻译；翻译专用请改用推理翻译或混合翻译。';
        }

        return {
            showSmartOptions: true,
            showHybridMt,
            showDialogModel,
            dialogLabel,
            schemeHint,
            modelHint,
            requireDialogModel: !hybrid,
            allowEmptyDialog: hybrid,
        };
    }

    /**
     * Peel software-credit / exclusive-head watermark cues before 重新翻译 MT.
     * Sending them to Hy-MT invents dialogue on the head slot and mergeRetranslateCues
     * then looks like a whole-track off-by-one (clears user watermark).
     * @param {object[]} cues
     * @param {{ isPro?: boolean, lang?: string, dualLineOrder?: string }} [opts]
     * @returns {{ mtCues: object[], restoreByIndex: Map<number,string>, skipped: number }}
     */
    function partitionRetranslatePayload(cues, opts = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const restoreByIndex = new Map();
        const mtCues = [];
        let creditApi = null;
        try {
            creditApi = (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-software-credit-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleSoftwareCredit : null);
        } catch { /* optional */ }

        const isCredit = (text) => {
            if (creditApi?.isSoftwareCreditText?.(text)) return true;
            const t = String(text || '');
            return /transub\.cc/i.test(t)
                && /(?:字幕由|字幕は|자막은|Subtitles generated by|Transub)/i.test(t);
        };
        const isExclusiveHead = (c) => {
            const start = Number(c?.startMs);
            const end = Number(c?.endMs);
            return Number.isFinite(start) && start <= 50
                && Number.isFinite(end) && end <= 2100;
        };

        for (let i = 0; i < list.length; i += 1) {
            const c = list[i];
            const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : i;
            const text = String(c?.text ?? '');
            const peel = isCredit(text)
                || (isExclusiveHead(c) && isCredit(text));
            // Exclusive head watermark even when detect is soft (user-added Transub line)
            const peelHead = isExclusiveHead(c) && (
                isCredit(text)
                || /字幕由\s*Transub|字幕は\s*Transub|Subtitles generated by\s*Transub/i.test(text)
            );
            if (peel || peelHead) {
                let restore = text;
                if (creditApi?.buildSoftwareCreditText && isCredit(text)) {
                    restore = creditApi.buildSoftwareCreditText({
                        isPro: opts.isPro === true || /Transub\s*Pro/i.test(text),
                        lang: opts.lang || 'zh',
                        dualLineOrder: opts.dualLineOrder,
                    });
                }
                restoreByIndex.set(idx, restore);
                continue;
            }
            mtCues.push(c);
        }
        return { mtCues, restoreByIndex, skipped: restoreByIndex.size };
    }

    /**
     * Merge MT results onto source cues for main-window 重新翻译 write-back.
     * Prefer index match; fall back to same-length positional when indexes were mangled.
     * Never leave Japanese source text on a cue that was sent for translation.
     * Never positional-zip when the source head is a software-credit watermark
     * (0-based MT rows would steal the credit slot and shift the whole track).
     * @param {object[]} sourceCues
     * @param {object[]} translatedCues
     * @param {{
     *   translatedIndexes?: Set<number>|number[],
     *   restoreByIndex?: Map<number,string>|Record<string,string>,
     * }} [opts]
     */
    function mergeRetranslateCues(sourceCues, translatedCues, opts = {}) {
        const src = Array.isArray(sourceCues) ? sourceCues : [];
        const translated = Array.isArray(translatedCues) ? translatedCues : [];
        const map = new Map();
        for (const u of translated) {
            const idx = Number(u?.index);
            if (!Number.isInteger(idx)) continue;
            map.set(idx, String(u?.text ?? ''));
        }
        let translatedIndexSet = null;
        if (opts.translatedIndexes instanceof Set) {
            translatedIndexSet = opts.translatedIndexes;
        } else if (Array.isArray(opts.translatedIndexes)) {
            translatedIndexSet = new Set(
                opts.translatedIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n)),
            );
        }
        if (!translatedIndexSet) {
            translatedIndexSet = new Set(map.keys());
        }

        let restoreByIndex = null;
        if (opts.restoreByIndex instanceof Map) {
            restoreByIndex = opts.restoreByIndex;
        } else if (opts.restoreByIndex && typeof opts.restoreByIndex === 'object') {
            restoreByIndex = new Map(
                Object.entries(opts.restoreByIndex).map(([k, v]) => [Number(k), String(v ?? '')]),
            );
        }

        let creditApi = null;
        try {
            creditApi = (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-software-credit-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleSoftwareCredit : null);
        } catch { /* optional */ }
        const sourceHasCreditHead = src.some((c, i) => {
            const start = Number(c?.startMs);
            const text = String(c?.text ?? '');
            const head = (Number.isFinite(start) && start <= 50) || i === 0;
            if (!head) return false;
            return creditApi?.isSoftwareCreditText?.(text)
                || /transub\.cc/i.test(text);
        });

        const cueIndex = (c, idx) => (
            Number.isInteger(Number(c?.index)) ? Number(c.index) : idx
        );
        const dialogueSlots = [];
        for (let i = 0; i < src.length; i += 1) {
            const index = cueIndex(src[i], i);
            if (restoreByIndex?.has(index)) continue;
            dialogueSlots.push({ srcIdx: i, index });
        }

        let indexHits = 0;
        let dialogueIndexHits = 0;
        for (let i = 0; i < src.length; i += 1) {
            const index = cueIndex(src[i], i);
            if (!map.has(index)) continue;
            indexHits += 1;
            if (!restoreByIndex?.has(index)) dialogueIndexHits += 1;
        }
        const translatedDenseZero = translated.length > 0
            && translated.every((u, i) => Number(u?.index) === i);
        const translatedDenseOne = translated.length > 0
            && translated.every((u, i) => Number(u?.index) === i + 1);
        const sourceDenseZero = src.length > 0
            && src.every((c, i) => Number(c?.index) === i);
        // Same-length 0..n-1 MT payload vs 1-based source → positional ONLY when
        // there is no credit head (otherwise dialogue steals the watermark slot).
        const usePositional = translatedDenseZero
            && translated.length === src.length
            && !sourceDenseZero
            && indexHits < src.length
            && !sourceHasCreditHead
            && !(restoreByIndex && restoreByIndex.size);

        // After peeling watermark(s), Hy-MT / sanitize sometimes renumbers the
        // dialogue-only payload to dense 0..n-1 (or 1..n). Index merge then
        // collides with restore keys (head credit = 1) and shifts ZH by +1/+2.
        // Zip MT rows in order onto non-credit source slots instead.
        const restoreCollide = !!(restoreByIndex && restoreByIndex.size
            && [...map.keys()].some((k) => restoreByIndex.has(k)));
        const dialogueHitRatio = dialogueSlots.length
            ? dialogueIndexHits / dialogueSlots.length
            : 1;
        const useDialogueOrderZip = !usePositional
            && translated.length === dialogueSlots.length
            && translated.length > 0
            && (restoreByIndex?.size > 0 || sourceHasCreditHead)
            && (
                translatedDenseZero
                || (translatedDenseOne && restoreCollide)
                || (dialogueHitRatio < 0.55 && (translatedDenseZero || translatedDenseOne || restoreCollide))
            );

        let orderZipCursor = 0;
        const merged = src.map((c, idx) => {
            const index = cueIndex(c, idx);
            if (restoreByIndex?.has(index)) {
                return { ...c, text: restoreByIndex.get(index) };
            }
            if (useDialogueOrderZip) {
                const text = String(translated[orderZipCursor]?.text ?? '');
                orderZipCursor += 1;
                return { ...c, text };
            }
            if (usePositional) {
                return { ...c, text: String(translated[idx]?.text ?? '') };
            }
            if (map.has(index)) {
                return { ...c, text: map.get(index) };
            }
            // Cue was in the MT payload but missing from result — blank, never echo JA.
            if (translatedIndexSet.has(index)) {
                return { ...c, text: '…' };
            }
            return { ...c };
        });

        // Last-resort: detect residual off-by-one after a bad MT write and rotate back.
        const destCues = Array.isArray(opts.destCues) ? opts.destCues : [];
        if (creditApi?.repairOffByOneCreditShift && (sourceHasCreditHead || destCues.some((c) => (
            creditApi?.isSoftwareCreditText?.(String(c?.text ?? ''))
        )))) {
            const fixed = creditApi.repairOffByOneCreditShift(merged, src, {
                isPro: opts.isPro != null
                    ? !!opts.isPro
                    : /Transub\s*Pro/i.test([...src, ...destCues].map((c) => c.text).join('\n')),
                lang: opts.lang || 'zh',
                dualLineOrder: opts.dualLineOrder,
            });
            if (fixed.changed) return fixed.cues;
        }
        return merged;
    }

    function loadCreditApi() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./subtitle-software-credit-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSubtitleSoftwareCredit : null);
        } catch {
            return null;
        }
    }

    /**
     * Merge software-credit restore slots from an existing dest track when the
     * source transcript lost head/tail watermarks (common after range re-ASR).
     */
    function augmentCreditRestoreMap(sourceCues, destCues, restoreByIndex, opts = {}) {
        const creditApi = loadCreditApi();
        const out = restoreByIndex instanceof Map ? new Map(restoreByIndex) : new Map();
        const src = Array.isArray(sourceCues) ? sourceCues : [];
        const dest = Array.isArray(destCues) ? destCues : [];
        if (!creditApi?.isSoftwareCreditText) return out;

        const resolveSlotIndex = (destCue, destIdx) => {
            const startMs = Math.round(Number(destCue?.startMs) || 0);
            for (let si = 0; si < src.length; si += 1) {
                const sm = Math.round(Number(src[si]?.startMs) || 0);
                if (Math.abs(sm - startMs) <= 80) {
                    return Number.isInteger(Number(src[si]?.index)) ? Number(src[si].index) : si;
                }
            }
            return destIdx;
        };

        for (let i = 0; i < dest.length; i += 1) {
            const dc = dest[i];
            const text = String(dc?.text ?? '');
            if (!creditApi.isSoftwareCreditText(text)) continue;
            const destIdx = Number.isInteger(Number(dc?.index)) ? Number(dc.index) : i;
            const startMs = Math.round(Number(dc?.startMs) || 0);
            const srcHasHeadCredit = src.some((c) => {
                const sm = Math.round(Number(c?.startMs) || 0);
                return sm <= 50 && creditApi.isSoftwareCreditText(String(c?.text ?? ''));
            });
            if (startMs <= 50 && !srcHasHeadCredit) {
                continue;
            }
            const slotIdx = resolveSlotIndex(dc, destIdx);
            if (out.has(slotIdx)) continue;
            out.set(slotIdx, creditApi.buildSoftwareCreditText({
                isPro: opts.isPro === true || /Transub\s*Pro/i.test(text),
                lang: opts.lang || 'zh',
                dualLineOrder: opts.dualLineOrder,
            }));
        }
        return out;
    }

    /** Re-insert head watermark when dest had credit but merge/source no longer does. */
    function ensureRetranslateSoftwareCredit(cues, opts = {}) {
        const creditApi = loadCreditApi();
        const list = Array.isArray(cues) ? cues : [];
        if (!creditApi?.insertSoftwareCreditIntoCues) {
            return { cues: list.map((c) => ({ ...c })), changed: false };
        }
        const hasHeadCredit = list.some((c) => {
            const sm = Math.round(Number(c?.startMs) || 0);
            return sm <= 50 && creditApi.isSoftwareCreditText(String(c?.text ?? ''));
        });
        if (hasHeadCredit) {
            return { cues: list.map((c) => ({ ...c })), changed: false };
        }
        if (opts.insertSoftwareCredit === false) {
            return { cues: list.map((c) => ({ ...c })), changed: false };
        }
        const applied = creditApi.insertSoftwareCreditIntoCues(list, {
            isPro: !!opts.isPro,
            lang: opts.lang || 'zh',
            dualLineOrder: opts.dualLineOrder,
            mediaDurationMs: opts.mediaDurationMs,
        });
        return { cues: applied.cues, changed: !!applied.changed };
    }

    return {
        primarySubFormatFromList,
        resolveRetranslateDestPath,
        computeRetranslateOverallPct,
        isSmartTranslateCapableModel,
        isSmartTranslateLiteModel,
        formatSmartTranslateModelLabel,
        filterSmartTranslateCatalog,
        buildRetranslateSmartUiState,
        partitionRetranslatePayload,
        mergeRetranslateCues,
        augmentCreditRestoreMap,
        ensureRetranslateSoftwareCredit,
    };
}));
