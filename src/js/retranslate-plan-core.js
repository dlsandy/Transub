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
        const stemName = stem(video) || stem(src) || 'subtitle';
        const fmt = primarySubFormatFromList(deps.subFormats);
        return join(outDir, `${stemName}.${fmt}`);
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
        if (item.translateOnly) return false;
        if (catalogApi?.isTranslateOnlyModel?.(item.id) || catalogApi?.isTranslateOnlyModel?.(item)) {
            return false;
        }
        if (catalogApi?.supportsAdvancedReconstruct) {
            return !!catalogApi.supportsAdvancedReconstruct(item.id);
        }
        return String(item.family || '').toLowerCase() !== 'sakura';
    }

    function filterSmartTranslateCatalog(catalog, catalogApi = null) {
        return (Array.isArray(catalog) ? catalog : [])
            .filter((item) => item?.installed && isSmartTranslateCapableModel(item, catalogApi))
            .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh'));
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
                dialogLabel: '智能翻译模型',
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
        let dialogLabel = '智能翻译模型';
        if (hybrid && polish) dialogLabel = '对话模型（剧情贴合润色）';
        else if (!hybrid) dialogLabel = '智能翻译模型（按行翻译）';

        let schemeHint = '日语默认：专训模型做句级翻译，对话模型只做语意不变的贴合润色。';
        if (hybrid && !polish) {
            schemeHint = '仅句级专训翻译，不做对话润色。';
        } else if (!hybrid && polish) {
            schemeHint = '对话模型按行翻译后再做贴合润色（未用句级推理）。';
        } else if (!hybrid && !polish) {
            schemeHint = '整段由对话模型按行翻译（句级推理与润色均已关）。';
        }

        let modelHint = '仅列出已下载且可用于智能翻译的通用对话模型（不含 Sakura 等仅译中模型）。';
        if (hybrid && polish) {
            modelHint = '句级可留空自动匹配；对话模型用于贴合润色，可留空则跳过润色仍保留句级译文。';
        } else if (hybrid && !polish) {
            modelHint = '句级可留空自动匹配（按语言 / Pro / 硬件）。';
        } else if (!hybrid) {
            modelHint = '请选择已下载的通用对话模型做按行翻译（不含 Sakura 等仅译中模型）。';
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

    return {
        primarySubFormatFromList,
        resolveRetranslateDestPath,
        computeRetranslateOverallPct,
        isSmartTranslateCapableModel,
        filterSmartTranslateCatalog,
        buildRetranslateSmartUiState,
    };
}));
