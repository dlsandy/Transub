/**
 * Re-translate blank / ellipsis / failed-MT cues after post-batch sanitize.
 */
const path = require('path');

function readPairDocs(zhPath, jaPath) {
    const { readSubtitleDocument } = require('./extensions-bridge');
    const zhDoc = readSubtitleDocument(zhPath);
    if (!zhDoc?.ok) return { ok: false, error: zhDoc?.error || '无法读取译文字幕' };
    const jaDoc = readSubtitleDocument(jaPath);
    if (!jaDoc?.ok) return { ok: false, error: jaDoc?.error || '无法读取原文字幕' };
    return { ok: true, zhDoc, jaDoc };
}

/** Blank identity/refusal/invented-plot and restore trailing …… before disk write. */
function applyDeliveryFinalizeCues(zhCues, jaCues) {
    try {
        const tgCore = require('../src/js/translategemma-translate-core');
        if (typeof tgCore.finalizeTranslateGemmaCueList !== 'function') return zhCues;
        return tgCore.finalizeTranslateGemmaCueList(jaCues, zhCues);
    } catch {
        return zhCues;
    }
}

/**
 * Resolve JA source text for a ZH cue: overlap first, then index / positional.
 * Full jobs usually share indexes; rematerialize / timing drift can miss overlap.
 */
function resolveJaSourceForBlankCue(zhCue, jaCues, dualCore, overlapIndex, zhListIndex) {
    let sourceText = '';
    const startMs = Number(zhCue?.startMs) || 0;
    const endMs = zhCue?.endMs != null ? Number(zhCue.endMs) : startMs + 2000;
    if (dualCore?.findBestOverlapCue) {
        const hit = dualCore.findBestOverlapCue(jaCues, startMs, endMs, {
            index: overlapIndex,
            maxStartGapMs: 2500,
        });
        if (hit?.cue && hit.match !== 'none') {
            sourceText = String(hit.cue.text ?? '');
        }
    }
    if (sourceText.trim()) return sourceText;
    const idx = Number(zhCue?.index);
    const list = Array.isArray(jaCues) ? jaCues : [];
    if (Number.isInteger(idx)) {
        const byIndex = list.find((c) => Number(c?.index) === idx);
        if (byIndex && String(byIndex.text ?? '').trim()) {
            return String(byIndex.text ?? '');
        }
    }
    if (
        Number.isInteger(zhListIndex)
        && zhListIndex >= 0
        && zhListIndex < list.length
        && String(list[zhListIndex]?.text ?? '').trim()
    ) {
        return String(list[zhListIndex].text ?? '');
    }
    return '';
}

/**
 * Time-align JA source to each ZH cue; return pairs needing re-MT.
 * @param {object[]} zhCues
 * @param {object[]} jaCues
 */
function collectBlankRetranslatePairs(zhCues, jaCues, options = {}) {
    let mtSanitize;
    try {
        mtSanitize = require('../src/js/mt-sanitize-core');
    } catch (err) {
        return { pairs: [], error: err.message || 'mt-sanitize unavailable' };
    }
    let qualityGuard = null;
    if (options.includeHyMtQuality) {
        try {
            qualityGuard = require('../src/js/hymt-quality-guard-core');
        } catch { /* optional */ }
    }
    let dualCore = null;
    try {
        dualCore = require('../src/js/dual-subtitle-core');
    } catch { /* optional */ }
    const index = dualCore?.buildOverlapIndex?.(jaCues) || null;
    const pairs = [];
    const zhList = Array.isArray(zhCues) ? zhCues : [];
    for (let zi = 0; zi < zhList.length; zi += 1) {
        const zhCue = zhList[zi];
        const sourceText = resolveJaSourceForBlankCue(zhCue, jaCues, dualCore, index, zi);
        if (!sourceText.trim()) continue;
        const dst = String(zhCue?.text ?? '').trim();
        let need = !!mtSanitize.isBlankOrPunctTranslation?.(dst, sourceText, options);
        if (!need) {
            try {
                const tgCore = require('../src/js/translategemma-translate-core');
                if (
                    tgCore.looksLikeTranslateGemmaIdentityEcho?.(sourceText, dst)
                    || tgCore.looksLikeTranslateGemmaInventedPlot?.(sourceText, dst)
                    || tgCore.looksLikeTranslateGemmaEllipsisCollapse?.(sourceText, dst)
                    || tgCore.looksLikeTranslateGemmaSafetyRefusal?.(dst)
                ) {
                    need = true;
                } else if (
                    typeof tgCore.finalizeTranslateGemmaCue === 'function'
                    && tgCore.finalizeTranslateGemmaCue(sourceText, dst) === ''
                    && String(dst || '').trim()
                ) {
                    need = true;
                }
            } catch { /* optional */ }
        }
        if (
            !need
            && mtSanitize.looksLikeHanLeakForIntlTarget
            && options
        ) {
            try {
                const { resolveMtTargetFields } = require('./sanitize-target-opts');
                const fields = resolveMtTargetFields(options);
                if (
                    !fields.isZhTarget
                    && mtSanitize.looksLikeHanLeakForIntlTarget(dst, fields.subtitleTargetLang)
                ) {
                    need = true;
                }
            } catch { /* optional */ }
        }
        let qualityReasons = null;
        if (!need && qualityGuard?.assessHyMtCueQuality) {
            const q = qualityGuard.assessHyMtCueQuality(dst, sourceText, options);
            if (!q.ok) {
                // Slots scheduled for delete (pure moan) — do not queue recover.
                try {
                    const ellipsisPolicy = require('../src/js/hymt-ellipsis-policy-core');
                    if (ellipsisPolicy.shouldSkipRecoverForDelete?.(sourceText, dst, {})) {
                        need = false;
                    } else {
                        need = true;
                        qualityReasons = q.reasons;
                    }
                } catch {
                    need = true;
                    qualityReasons = q.reasons;
                }
            }
        }
        // Underfill forms (bare「哈」/欠译「舔」/JA leak) even when not classic blank.
        if (!need) {
            try {
                const underfill = require('../src/js/delivery-underfill-qc-core');
                const hit = underfill.classifyDeliveryUnderfill?.(dst, sourceText);
                if (
                    hit
                    && (
                        hit.kind === 'bare_ha'
                        || hit.kind === 'under_lick'
                        || hit.kind === 'ja_leak'
                        || hit.kind === 'vocative_stub'
                    )
                ) {
                    need = true;
                    qualityReasons = qualityReasons || [hit.kind];
                }
            } catch { /* optional */ }
        }
        // JA trails off with … but ZH dropped it — queue soft rewrite via blank-MT pass.
        if (!need && /(?:…|\.{2,}|･･･|……)\s*$/u.test(String(sourceText || '').trim())) {
            const z = String(dst || '').trim();
            if (z && !/(?:…|\.{2,}|……)\s*$/u.test(z) && !/^(?:\.\.\.|……|…)+$/u.test(z)) {
                // Don't force full re-MT only for punctuation — patch in place later if possible.
                try {
                    const tgCore = require('../src/js/translategemma-translate-core');
                    if (tgCore.preserveTrailingEllipsis) {
                        const patched = tgCore.preserveTrailingEllipsis(sourceText, z);
                        if (patched && patched !== z) {
                            zhCue.text = patched;
                        }
                    }
                } catch { /* optional */ }
            }
        }
        if (!need) continue;
        // Ellipsis policy: skip recover for delete-class moan even if blank
        try {
            const ellipsisPolicy = require('../src/js/hymt-ellipsis-policy-core');
            if (ellipsisPolicy.shouldSkipRecoverForDelete?.(sourceText, dst, {})) continue;
        } catch { /* optional */ }
        pairs.push({
            zhCue,
            sourceText,
            index: Number(zhCue.index),
            qualityReasons,
        });
    }

    // Quality pipeline closed loop: force-include planned indexes (even if not blank).
    const forceSet = new Set(
        (Array.isArray(options.forceRetranslateIndexes) ? options.forceRetranslateIndexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0),
    );
    if (forceSet.size && mtSanitize) {
        const have = new Set(pairs.map((p) => Number(p.index)));
        for (const zhCue of (zhCues || [])) {
            const idx = Number(zhCue?.index);
            if (!forceSet.has(idx) || have.has(idx)) continue;
            const zi = (zhCues || []).indexOf(zhCue);
            const sourceText = resolveJaSourceForBlankCue(
                zhCue,
                jaCues,
                dualCore,
                index,
                zi >= 0 ? zi : undefined,
            );
            if (!sourceText.trim()) continue;
            pairs.push({
                zhCue,
                sourceText,
                index: idx,
                qualityReasons: ['qc_loop_force'],
            });
            have.add(idx);
        }
    }

    // QC closed loop: only burn budget on planned indexes (not every leftover blank).
    if (options.forceRetranslateOnly && forceSet.size) {
        return {
            pairs: pairs.filter((p) => forceSet.has(Number(p.index))),
            mtSanitize,
        };
    }

    return { pairs, mtSanitize };
}

function resolveBlankRetryMtMode(options = {}) {
    try {
        const norm = require('../src/js/settings-options-normalize-core');
        if (norm.isDialogTranslateMode?.(options.translateMode)) return 'smart';
        if (norm.isHybridTranslateMode?.(options.translateMode)) return 'smart';
    } catch { /* optional */ }
    if (options.smartTranslate === true) return 'smart';
    const mode = String(options.translateMode || '').trim().toLowerCase();
    if (mode === 'smart' || mode === 'dialog' || mode === 'hybrid'
        || mode === 'smart_dialog' || mode === 'llm_line' || mode === 'chat') {
        return 'smart';
    }
    const modelId = String(
        options.engineMtModel || options.engineLlmMtModel || options.hybridMtModelId || '',
    ).trim();
    try {
        const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
        if (modelId && (
            sakuraCatalog.isLlmInferenceMtModel?.(modelId)
            || sakuraCatalog.isSakuraMtModel?.(modelId)
        )) {
            return 'sakura';
        }
    } catch { /* optional */ }
    // Opus retired — fall through to Sakura/LLM retry path.
    return 'sakura';
}

/**
 * 智能翻译（单对话模型）空白补译必须走同一对话 LLM；
 * 若仍优先 Sakura/Hy-MT，成人向等槽位会继续落成「…」，而编辑器批量重译（对话模型）能补全。
 */
function isDialogBlankRetry(options = {}) {
    try {
        const norm = require('../src/js/settings-options-normalize-core');
        if (norm.isDialogTranslateMode?.(options.translateMode)) return true;
    } catch { /* optional */ }
    const mode = String(options.translateMode || '').trim().toLowerCase();
    return mode === 'dialog' || mode === 'smart_dialog' || mode === 'llm_line' || mode === 'chat';
}

/**
 * Hybrid / 推理路径可优先专训翻译补空白。
 * 若智能翻译句级已选定 Sakura/GalTransl/Hy-MT（含 lite 强制混合），即使
 * translateMode 仍标成 dialog，空白补译也走句级专训——否则会用 Qwen 对话
 * 把 GalTransl 成片刷成「…」并触发省略号风暴。
 * 纯对话智能翻译（无句级专训 id）仍禁止抢 Sakura。
 */
function shouldPreferSakuraBlankRetry(options = {}, mode = '') {
    const sentencePick = String(
        options.hybridMtModelId || options.smartTranslateModelId || '',
    ).trim();
    if (isBlankRetrySentenceSpecialist(sentencePick)) return true;
    if (isDialogBlankRetry(options)) return false;
    const resolved = mode || resolveBlankRetryMtMode(options);
    if (resolved === 'sakura') return true;
    const llmModelId = resolveBlankRetryLlmModelId(options);
    return canBlankRetryViaSakura(llmModelId);
}

function buildRetrySourceCues(pairs) {
    return (pairs || []).map((p) => ({
        index: p.index,
        startMs: p.zhCue?.startMs,
        endMs: p.zhCue?.endMs,
        text: p.sourceText,
    }));
}

/**
 * GalTransl needs contiguous JA (editor window), not 8 scattered blank indexes
 * packed as one prompt (logs looked like「第 129–668 条」and collapsed to …).
 * Slice a source-track window around each cluster; caller merges only blank indexes.
 */
function clusterBlankPairsIntoJaWindows(pairs, jaCues, windowLines = 8) {
    const n = Math.max(1, Math.min(20, Math.round(Number(windowLines) || 8)));
    const list = Array.isArray(jaCues) ? jaCues : [];
    const targets = Array.isArray(pairs) ? pairs.filter(Boolean) : [];
    if (!targets.length) return [];
    const toCue = (c) => ({
        index: Number.isInteger(Number(c?.index)) ? Number(c.index) : c?.index,
        startMs: c?.startMs,
        endMs: c?.endMs,
        text: String(c?.text ?? ''),
    });
    if (!list.length) {
        return [{ pairs: targets, cues: buildRetrySourceCues(targets) }];
    }
    const posOf = (p) => {
        const idx = Number(p?.index);
        let at = list.findIndex((c) => Number(c?.index) === idx);
        if (at < 0 && Number.isInteger(idx) && idx >= 0 && idx < list.length) at = idx;
        return at;
    };
    const sorted = targets.slice().sort((a, b) => posOf(a) - posOf(b));
    const windows = [];
    let i = 0;
    while (i < sorted.length) {
        const firstAt = posOf(sorted[i]);
        if (firstAt < 0) {
            windows.push({ pairs: [sorted[i]], cues: buildRetrySourceCues([sorted[i]]) });
            i += 1;
            continue;
        }
        const pad = Math.min(2, Math.max(0, n - 1));
        const from = Math.max(0, firstAt - pad);
        const to = Math.min(list.length, from + n);
        const group = [];
        while (i < sorted.length) {
            const at = posOf(sorted[i]);
            if (at < 0 || at < from || at >= to) break;
            group.push(sorted[i]);
            i += 1;
        }
        if (!group.length) {
            i += 1;
            continue;
        }
        windows.push({
            pairs: group,
            cues: list.slice(from, to).map(toCue),
        });
    }
    return windows;
}

/** Sentence-MT specialists only (GalTransl/Sakura/Hy-MT) — not general chat Instruct. */
function isBlankRetrySentenceSpecialist(modelId) {
    const id = String(modelId || '').trim();
    if (!id) return false;
    try {
        const hymtCore = require('../src/js/hymt-translate-core');
        if (hymtCore.isHyMtModel?.(id)) return true;
    } catch { /* optional */ }
    try {
        const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
        if (managedCatalog.isTranslateOnlyModel?.(id)) return true;
    } catch { /* optional */ }
    try {
        const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
        if (sakuraCatalog.isSakuraMtModel?.(id)) return true;
    } catch { /* optional */ }
    return false;
}

function resolveBlankRetryLlmModelId(options = {}) {
    const candidates = [
        options.hybridMtModelId,
        options.engineLlmMtModel,
        options.engineMtModel,
        options.smartTranslateModelId,
    ];
    for (const raw of candidates) {
        const id = String(raw || '').trim();
        if (id && isBlankRetrySentenceSpecialist(id)) return id;
    }
    for (const raw of candidates) {
        const id = String(raw || '').trim();
        if (id && canBlankRetryViaSakura(id)) return id;
    }
    return String(
        options.hybridMtModelId
        || options.engineLlmMtModel
        || options.engineMtModel
        || '',
    ).trim();
}

/** Dialog blank-retry chat model — never GalTransl/Sakura sentence specialists. */
function resolveBlankRetryChatModelId(options = {}) {
    const candidates = [
        options.blankRetryChatModelId,
        options.smartTranslateModelId,
        options.managedSmartTranslateModelId,
        options.engineChatModelId,
    ];
    for (const raw of candidates) {
        const id = String(raw || '').trim();
        if (!id) continue;
        if (isBlankRetrySentenceSpecialist(id)) continue;
        try {
            const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
            if (managedCatalog.isTranslateOnlyModel?.(id)) continue;
        } catch { /* optional */ }
        return id;
    }
    try {
        const managed = readManagedLlmFromAdvanced();
        const smart = String(managed?.smartTranslateModelId || '').trim();
        if (smart && !isBlankRetrySentenceSpecialist(smart)) {
            const managedCatalog = require('../src/js/advanced-managed-llm-catalog-core');
            if (!managedCatalog.isTranslateOnlyModel?.(smart)) return smart;
        }
    } catch { /* optional */ }
    return '';
}

function readManagedLlmFromAdvanced() {
    try {
        const { readAdvancedDoc } = require('./advanced-license-data');
        // readAdvancedDoc() → { ok, path, doc: { managedLlm, … } }
        const wrapped = readAdvancedDoc();
        return wrapped?.doc?.managedLlm || wrapped?.managedLlm || null;
    } catch {
        return null;
    }
}

function seedBlankRetrySentenceModelFromManaged(options = {}) {
    if (isBlankRetrySentenceSpecialist(resolveBlankRetryLlmModelId(options))) {
        return options;
    }
    try {
        const managed = readManagedLlmFromAdvanced();
        const smart = String(managed?.smartTranslateModelId || '').trim();
        if (smart && isBlankRetrySentenceSpecialist(smart)) {
            return {
                ...options,
                hybridMtModelId: options.hybridMtModelId || smart,
                smartTranslateModelId: options.smartTranslateModelId || smart,
            };
        }
    } catch { /* optional */ }
    return options;
}

function canBlankRetryViaSakura(modelId) {
    const id = String(modelId || '').trim();
    if (!id) return false;
    try {
        const hymtCore = require('../src/js/hymt-translate-core');
        if (hymtCore.isHyMtModel?.(id)) return true;
    } catch { /* optional */ }
    try {
        const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
        if (
            sakuraCatalog.isLlmInferenceMtModel?.(id)
            || sakuraCatalog.isSakuraMtModel?.(id)
        ) {
            return true;
        }
    } catch { /* optional */ }
    return false;
}

async function translateBlankCues(retryCues, options = {}, deps = {}) {
    options = seedBlankRetrySentenceModelFromManaged(options);
    const mode = resolveBlankRetryMtMode(options);
    const onProgress = typeof deps.onProgress === 'function' ? deps.onProgress : null;
    const signal = deps.signal || options.signal || null;
    const shouldStop = deps.shouldStop || options.shouldStop || null;
    const { isPostTaskStopRequested, cancelledPostTaskResult } = require('./engine-batch-item');
    if (isPostTaskStopRequested({ shouldStop, signal })) {
        return cancelledPostTaskResult({ cues: [] });
    }
    let targetFields = {
        subtitleTargetLang: options.subtitleTargetLang || options.targetLang || '',
        targetLang: options.targetLang || options.subtitleTargetLang || '',
        targetLanguage: options.targetLanguage,
        chineseSubtitleVariant: options.chineseSubtitleVariant,
        isZhTarget: true,
    };
    try {
        const { resolveMtTargetFields } = require('./sanitize-target-opts');
        targetFields = resolveMtTargetFields(options);
    } catch { /* assume zh */ }
    const isZhBlankTarget = targetFields.isZhTarget !== false;
    const llmModelId = resolveBlankRetryLlmModelId(options);
    const modelId = llmModelId || options.engineMtModel || options.engineLlmMtModel;
    const parity = resolveEditorParitySakuraBlankOpts(modelId);
    const faithfulPreferred = !!(
        options.faithfulTone
        || options.smartTranslateFaithfulTone
        || String(options.contentProfile || options.senseProfile || '').toLowerCase() === 'av_soft'
    );
    const mtOpts = {
        contentProfile: options.contentProfile || options.senseProfile,
        senseProfile: options.senseProfile || options.contentProfile,
        smartTranslateFaithfulTone: options.smartTranslateFaithfulTone || options.faithfulTone || faithfulPreferred,
        faithfulTone: options.faithfulTone || options.smartTranslateFaithfulTone || faithfulPreferred,
        sakuraNsfwPrompt: isZhBlankTarget
            ? (options.sakuraNsfwPrompt !== false && (options.sakuraNsfwPrompt || faithfulPreferred))
            : false,
        nsfwPrompt: isZhBlankTarget
            ? (options.nsfwPrompt !== false && (options.nsfwPrompt || faithfulPreferred))
            : false,
        applyNsfwLexicon: isZhBlankTarget
            ? (options.applyNsfwLexicon !== false && (options.applyNsfwLexicon || faithfulPreferred))
            : false,
        glossary: options.glossary,
        skipFakeGreeting: true,
        smartTranslate: options.smartTranslate,
        translateMode: options.translateMode,
        chineseSubtitleVariant: targetFields.chineseSubtitleVariant,
        subtitleTargetLang: targetFields.subtitleTargetLang,
        targetLang: targetFields.targetLang,
        targetLanguage: targetFields.targetLanguage,
        windowLines: parity.windowLines,
        maxTokens: Math.max(128, Number(options.maxTokens) || 256),
        _blankRetry: parity._blankRetry,
        _skipBlankRetry: parity._skipBlankRetry === true,
        _skipAlignAudit: true,
        hyMtMinimalPrompt: parity.hyMtMinimalPrompt,
        perfProfile: options.perfProfile,
        hyMtBlankRetryBatch: options.hyMtBlankRetryBatch,
    };

    // Prefer direct Hy-MT/Sakura for hybrid / 推理 — but never for 智能翻译(dialog):
    // chat-only blanks must use the same dialog LLM as editor batch retranslate
    // (Sakura preference left adult lexical slots as 「…」 while editor filled them).

    // Intl 成片: never send blanks to Sakura/Hy-MT (JA→ZH only); use smart/LLM.
    if (isZhBlankTarget && shouldPreferSakuraBlankRetry(options, mode)) {
        const { runSakuraTranslate } = require('./sakura-translate');
        if (typeof deps.onLog === 'function') {
            try {
                const winLabel = parity.editorParity
                    ? `原文邻窗 ${Math.min(parity.windowLines, Math.max(1, (retryCues || []).length))}（补空白）`
                    : '单条窗';
                deps.onLog(`空白重译 · 句级专训 ${modelId || 'sakura'} · ${winLabel} · 对位审计已跳过`);
            } catch { /* ignore */ }
        }
        return runSakuraTranslate({
            cues: retryCues,
            modelId,
            glossary: options.glossary,
            ...mtOpts,
            windowLines: parity.windowLines,
            _blankRetry: parity._blankRetry,
            _skipBlankRetry: parity._skipBlankRetry === true,
            _skipAlignAudit: true,
            onProgress,
            signal,
            shouldStop,
            _batchMode: true,
            _skipComputeLock: true,
        });
    }

    if (mode === 'smart' || !isZhBlankTarget) {
        const { runSmartTranslate } = require('./advanced-bridge');
        const dialogMode = isDialogBlankRetry(options);
        const chatModelId = resolveBlankRetryChatModelId(options);
        return runSmartTranslate({
            cues: retryCues,
            skipFilmBrief: true,
            // Never hybrid on blank-retry for intl; ZH hybrid only when job was hybrid.
            smartTranslateHybridMt: false,
            hybridMtModelId: isZhBlankTarget
                ? (options.hybridMtModelId || options.engineLlmMtModel)
                : undefined,
            engineLlmMtModel: options.engineLlmMtModel,
            // Never pass GalTransl as dialog chat — remap to managed active Instruct.
            modelId: chatModelId || undefined,
            smartTranslateModelId: chatModelId || undefined,
            translateMode: dialogMode ? 'dialog' : (options.translateMode || 'smart'),
            ...mtOpts,
            // Smart blank path stays single-cue (chat windows differ from GalTransl).
            windowLines: 1,
            _blankRetry: true,
            // Avoid Pro polish/verify wiping recovered blanks again.
            smartTranslatePlotPolish: false,
            smartTranslateFaithfulVerify: false,
            smartTranslateAddressConsistency: false,
            _batchMode: true,
            allowDuringBatch: true,
            signal,
            shouldStop,
            isCancelled: () => isPostTaskStopRequested({ shouldStop, signal }),
            onProgress,
        }, deps.event || null);
    }

    // Last resort ZH only: Sakura/LLM path (Opus removed). Never for intl.
    if (!isZhBlankTarget) {
        return {
            ok: false,
            error: '非中文成片空白重译不可回退到推理翻译',
            code: 'intl_no_sakura_fallback',
            cues: [],
        };
    }
    const { runSakuraTranslate } = require('./sakura-translate');
    return runSakuraTranslate({
        cues: retryCues,
        modelId,
        glossary: options.glossary,
        ...mtOpts,
        windowLines: parity.windowLines,
        _blankRetry: parity._blankRetry,
        _skipBlankRetry: parity._skipBlankRetry === true,
        _skipAlignAudit: true,
        onProgress,
        signal,
        shouldStop,
        _batchMode: true,
        _skipComputeLock: true,
    });
}

/**
 * GalTransl/Sakura blank recovery should mirror editor「批量补译」:
 * multi-line official template (window≤8), not storm-hardened single-cue `_blankRetry`.
 * Hy-MT / TranslateGemma keep the single-cue minimal-prompt profile.
 */
function resolveEditorParitySakuraBlankOpts(modelId) {
    const id = String(modelId || '').trim();
    let family = 'sakura';
    try {
        const catalog = require('../src/js/sakura-mt-catalog-core');
        family = catalog.resolvePromptFamily?.(id) || 'sakura';
    } catch { /* optional */ }
    if (/galtransl/i.test(id)) family = 'galtransl';
    if (family === 'galtransl' || family === 'sakura') {
        return {
            editorParity: true,
            // Neighbor JA slice size — do not pack N sparse blanks into one prompt.
            windowLines: 8,
            _blankRetry: false,
            _skipBlankRetry: true,
            hyMtMinimalPrompt: false,
        };
    }
    return {
        editorParity: false,
        windowLines: 1,
        _blankRetry: true,
        hyMtMinimalPrompt: true,
    };
}

function blankRetryCollectOptions(options = {}) {
    const id = resolveBlankRetryLlmModelId(options);
    let includeHyMtQuality = false;
    try {
        const hymtCore = require('../src/js/hymt-translate-core');
        includeHyMtQuality = !!hymtCore.isHyMtModel?.(id);
    } catch { /* optional */ }
    let targetFields = {};
    try {
        const { resolveMtTargetFields } = require('./sanitize-target-opts');
        targetFields = resolveMtTargetFields(options);
    } catch { /* optional */ }
    return {
        includeHyMtQuality: includeHyMtQuality && targetFields.isZhTarget !== false,
        contentProfile: options.contentProfile || options.senseProfile,
        senseProfile: options.senseProfile || options.contentProfile,
        subtitleTargetLang: targetFields.subtitleTargetLang || options.subtitleTargetLang,
        targetLang: targetFields.targetLang || options.targetLang || options.subtitleTargetLang,
        targetLanguage: targetFields.targetLanguage || options.targetLanguage,
        chineseSubtitleVariant: targetFields.chineseSubtitleVariant || options.chineseSubtitleVariant,
        forceRetranslateIndexes: Array.isArray(options.forceRetranslateIndexes)
            ? options.forceRetranslateIndexes
            : undefined,
        forceRetranslateOnly: options.forceRetranslateOnly === true,
    };
}

function mergeRetranslatedCues(zhCues, translatedCues, sourcePairs, mtSanitize, options = {}) {
    const map = new Map();
    (translatedCues || []).forEach((c) => {
        const text = String(c?.text ?? '');
        const rawIdx = Number(c?.index);
        // Index-only merge — never zip by batch order (silent wrong-JA attach).
        if (Number.isInteger(rawIdx)) map.set(rawIdx, text);
    });
    const srcByIndex = new Map(
        (sourcePairs || []).map((p) => [Number(p.index), String(p.sourceText ?? '')]),
    );
    const qualityByIndex = new Map(
        (sourcePairs || [])
            .filter((p) => Array.isArray(p.qualityReasons) && p.qualityReasons.length)
            .map((p) => [Number(p.index), p.qualityReasons]),
    );
    let qualityGuard = null;
    if (qualityByIndex.size || options.includeHyMtQuality) {
        try {
            qualityGuard = require('../src/js/hymt-quality-guard-core');
        } catch { /* optional */ }
    }
    let targetFields = { isZhTarget: true, subtitleTargetLang: options.subtitleTargetLang };
    try {
        const { resolveMtTargetFields } = require('./sanitize-target-opts');
        targetFields = resolveMtTargetFields(options);
    } catch { /* optional */ }
    const mayZhFill = targetFields.isZhTarget !== false;
    let isLiteralBlank = (t) => {
        const s = String(t || '').trim();
        if (!s) return true;
        return /^(?:\.\.\.|……|…)+$/.test(s) || /^[。．.、，,\s…·•\-—_~～]+$/.test(s);
    };
    try {
        const sakuraCore = require('../src/js/sakura-translate-core');
        if (typeof sakuraCore.isLiteralBlankTranslation === 'function') {
            isLiteralBlank = (t) => sakuraCore.isLiteralBlankTranslation(t);
        }
    } catch { /* optional */ }
    let changed = 0;
    const cues = (zhCues || []).map((c) => {
        const idx = Number(c.index);
        if (!Number.isInteger(idx) || !map.has(idx)) return c;
        let text = map.get(idx);
        const src = srcByIndex.get(idx) || '';
        const prior = String(c.text ?? '');
        const priorWasLiteralBlank = isLiteralBlank(prior);
        if (mtSanitize?.sanitizeMtCueText && src) {
            const cleaned = mtSanitize.sanitizeMtCueText(text, src, {
                ...options,
                subtitleTargetLang: targetFields.subtitleTargetLang,
                targetLang: targetFields.targetLang,
                targetLanguage: targetFields.targetLanguage,
                skipFakeGreeting: true,
                // Prior … slots: keep light sanitize so we don't invent-wipe a good recovery.
                unstickInventWipe: priorWasLiteralBlank ? false : options.unstickInventWipe,
            });
            text = cleaned.text;
        }
        // Editor-parity recovery: if the slot was literal …/empty and MT returned real ZH,
        // accept it (don't reject via invent / quality heuristics that keep shipping …).
        if (mayZhFill && priorWasLiteralBlank && !isLiteralBlank(text)) {
            if (text !== prior) changed += 1;
            return { ...c, text };
        }
        // Intl: never accept Han (or ZH recover) into 成片.
        // If prior slot is already Han (e.g. stale 译后清洗), clear to … — do not keep ZH.
        if (!mayZhFill) {
            const prior = String(c.text ?? '');
            const priorIsHan = !!mtSanitize?.looksLikeHanLeakForIntlTarget?.(
                prior,
                targetFields.subtitleTargetLang,
            );
            if (mtSanitize?.finalizeIntlMtDeliveryText) {
                const fin = mtSanitize.finalizeIntlMtDeliveryText(
                    text,
                    targetFields.subtitleTargetLang,
                );
                if (fin.changed) text = fin.text;
            } else if (mtSanitize?.scrubHanLeakForIntlTarget) {
                const scrub = mtSanitize.scrubHanLeakForIntlTarget(
                    text,
                    targetFields.subtitleTargetLang,
                );
                if (scrub.changed) text = scrub.text;
            }
            if (
                mtSanitize?.looksLikeHanLeakForIntlTarget?.(text, targetFields.subtitleTargetLang)
                || mtSanitize?.isBlankOrPunctTranslation?.(text, src, {
                    ...options,
                    subtitleTargetLang: targetFields.subtitleTargetLang,
                    targetLang: targetFields.targetLang,
                })
            ) {
                if (priorIsHan) {
                    changed += 1;
                    return { ...c, text: '…' };
                }
                return c;
            }
        }
        // Reject adult-register invent onto mundane JA (keep prior slot for another round).
        if (mayZhFill && mtSanitize?.looksLikeAdultRegisterInvented?.(text, src)) {
            return c;
        }
        if (mtSanitize?.isBlankOrPunctTranslation?.(text, src, {
            ...options,
            subtitleTargetLang: targetFields.subtitleTargetLang,
            targetLang: targetFields.targetLang,
        })) {
            if (!mayZhFill) return c;
            const recovered = mtSanitize.recoverBlankedAdultZh?.(text, src, {
                ...options,
                subtitleTargetLang: targetFields.subtitleTargetLang,
                targetLang: targetFields.targetLang,
                skipFakeGreeting: true,
            });
            if (
                recovered?.changed
                && recovered.text
                && !mtSanitize.isBlankOrPunctTranslation(recovered.text, src, {
                    ...options,
                    subtitleTargetLang: targetFields.subtitleTargetLang,
                    targetLang: targetFields.targetLang,
                })
            ) {
                text = recovered.text;
            } else {
                return c;
            }
        }
        // Hy-MT quality re-MT: only keep if score improves (错翻→更好).
        if (mayZhFill && qualityGuard?.assessHyMtCueQuality
            && (qualityByIndex.has(idx) || options.includeHyMtQuality)) {
            const before = qualityGuard.assessHyMtCueQuality(String(c.text ?? ''), src, options);
            const after = qualityGuard.assessHyMtCueQuality(text, src, options);
            if (!after.ok) {
                if (before.ok) return c;
                const improved = (after.reasons?.length || 99) < (before.reasons?.length || 0)
                    || (
                        /blank|blankish|under|under_long|echo/.test((before.reasons || []).join(','))
                        && !/^(?:\.\.\.|……|…)+$/.test(String(text || '').trim())
                        && !mtSanitize?.isBlankOrPunctTranslation?.(text, src, options)
                    );
                if (!improved) return c;
            }
        }
        if (String(c.text ?? '') !== String(text ?? '')) {
            changed += 1;
            return { ...c, text };
        }
        return c;
    });
    return { cues, changed };
}

/**
 * @param {{
 *   zhPath: string,
 *   jaPath: string,
 *   options?: object,
 *   maxCues?: number,
 *   onProgress?: Function,
 *   onLog?: Function,
 *   event?: object,
 * }} ctx
 */
async function runBlankMtRetryForSubtitlePair(ctx = {}) {
    const zhPath = String(ctx.zhPath || '').trim();
    const jaPath = String(ctx.jaPath || '').trim();
    if (!zhPath || !jaPath) {
        return { ok: true, skipped: true, reason: 'missing_path' };
    }
    const options = ctx.options || {};
    if (options.postBatchBlankRetranslate === false) {
        return { ok: true, skipped: true, reason: 'disabled' };
    }

    let isZhTarget = true;
    try {
        const { resolveMtTargetFields } = require('./sanitize-target-opts');
        isZhTarget = resolveMtTargetFields(options).isZhTarget !== false;
    } catch { /* assume zh */ }

    const docs = readPairDocs(zhPath, jaPath);
    if (!docs.ok) return docs;

    let blankPolicy;
    try {
        blankPolicy = require('../src/js/blank-mt-retry-policy-core');
    } catch {
        blankPolicy = null;
    }
    const budget = blankPolicy?.resolveBlankMtRetryBudget?.({
        options,
        isZhTarget,
        maxRounds: ctx.maxRounds,
        maxCues: ctx.maxCues,
    }) || {
        maxRounds: isZhTarget ? 4 : 3,
        maxCuesPerRound: isZhTarget ? 128 : 64,
        allowPerCueFallback: isZhTarget,
        maxPerCueFallback: isZhTarget ? 8 : 0,
        perCueOnlyAfterPartialRecover: true,
        stallRoundsLimit: 2,
        weakYieldSoftLimit: 2,
        weakYieldMinBatch: 24,
        weakYieldMinRatio: 0.05,
        windowLines: 1,
        hyMtBlankRetryBatch: 4,
        speed: false,
    };
    const onLog = typeof ctx.onLog === 'function' ? ctx.onLog : null;
    const { isPostTaskStopRequested, cancelledPostTaskResult } = require('./engine-batch-item');
    const stopRequested = () => isPostTaskStopRequested({
        shouldStop: ctx.shouldStop,
        signal: ctx.signal,
    });
    if (stopRequested()) {
        return cancelledPostTaskResult({ recovered: 0, retried: 0 });
    }

    const forceIndexes = blankPolicy?.normalizeBlankIndexList?.(
        ctx.forceRetranslateIndexes || options.forceRetranslateIndexes,
    ) || [];
    const forceSet = new Set(forceIndexes);
    const skipLlmIndexes = blankPolicy?.resolveSkipLlmBlankIndexes?.(options, [
        ...(Array.isArray(ctx.skipLlmIndexes) ? ctx.skipLlmIndexes : []),
        ...(Array.isArray(ctx.attemptedBlankIndexes) ? ctx.attemptedBlankIndexes : []),
    ]) || [];
    const skipLlmSet = new Set(skipLlmIndexes.filter((n) => !forceSet.has(n)));
    if (skipLlmSet.size) {
        onLog?.(`空白重译 · ${path.basename(zhPath)} · 跳过 LLM 重试 ${skipLlmSet.size} 条（主译/前遍已穷尽，仍可确定性回填）`);
    }

    let currentCues = docs.zhDoc.cues;
    // Re-resolve budget with initial blank count so mass leftovers tighten rounds/fuse early.
    try {
        const { pairs: hintPairs } = collectBlankRetranslatePairs(
            currentCues,
            docs.jaDoc.cues,
            blankRetryCollectOptions(options),
        );
        const hinted = blankPolicy?.resolveBlankMtRetryBudget?.({
            options: { ...options, blankHintCount: hintPairs.length },
            isZhTarget,
            maxRounds: ctx.maxRounds,
            maxCues: ctx.maxCues,
            blankHintCount: hintPairs.length,
        });
        if (hinted) {
            if (Number(hinted.maxCuesPerRound) > 0) {
                budget.maxCuesPerRound = Number(hinted.maxCuesPerRound);
            }
            if (Number(hinted.maxRounds) > 0) {
                budget.maxRounds = Number(hinted.maxRounds);
            }
            // Always keep single-cue blank-retry packing (ignore higher hinted values).
            budget.windowLines = 1;
            if (Number.isFinite(Number(hinted.weakYieldSoftLimit))) {
                budget.weakYieldSoftLimit = Number(hinted.weakYieldSoftLimit);
            }
            if (Number.isFinite(Number(hinted.weakYieldMinBatch))) {
                budget.weakYieldMinBatch = Number(hinted.weakYieldMinBatch);
            }
            if (Number.isFinite(Number(hinted.weakYieldMinRatio))) {
                budget.weakYieldMinRatio = Number(hinted.weakYieldMinRatio);
            }
            if (Number.isFinite(Number(hinted.stallRoundsLimit))) {
                budget.stallRoundsLimit = Number(hinted.stallRoundsLimit);
            }
            if (Number.isFinite(Number(hinted.maxPerCueFallback))) {
                budget.maxPerCueFallback = Number(hinted.maxPerCueFallback);
            }
        }
    } catch { /* optional */ }
    const stallRoundsLimit = Math.max(1, Number(budget.stallRoundsLimit) || 2);
    const allowPerCueFallback = budget.allowPerCueFallback !== false && isZhTarget;
    const maxPerCueFallback = Math.max(0, Number(budget.maxPerCueFallback) || 0);
    const perCueOnlyAfterPartialRecover = budget.perCueOnlyAfterPartialRecover !== false;
    const blankWindowLines = Math.max(1, Math.min(8, Number(budget.windowLines) || 1));
    const blankMtCallOpts = {
        ...options,
        windowLines: blankWindowLines,
        hyMtBlankRetryBatch: budget.hyMtBlankRetryBatch || options.hyMtBlankRetryBatch,
        perfProfile: options.perfProfile,
        _skipAlignAudit: true,
    };
    const maxCuesPerRound = budget.maxCuesPerRound;
    const maxRounds = budget.maxRounds;
    if (budget.speed) {
        onLog?.(`空白重译 · ${path.basename(zhPath)} · 速度档（最多 ${maxRounds} 轮×${maxCuesPerRound}）`);
    }

    let totalRecovered = 0;
    let totalRetried = 0;
    let round = 0;
    let prevBlankKey = '';
    let stalledRounds = 0;
    let lowYieldRounds = 0;
    const attemptedThisPass = new Set();

    const collectOpts = blankRetryCollectOptions({
        ...options,
        forceRetranslateIndexes: forceIndexes.length
            ? forceIndexes
            : (ctx.forceRetranslateIndexes || options.forceRetranslateIndexes),
    });

    while (round < maxRounds) {
        if (stopRequested()) {
            return cancelledPostTaskResult({
                recovered: totalRecovered,
                retried: totalRetried,
                written: totalRecovered > 0,
            });
        }
        const { pairs: roundPairs, mtSanitize: roundSanitize, error: roundErr } = collectBlankRetranslatePairs(
            currentCues,
            docs.jaDoc.cues,
            collectOpts,
        );
        if (roundErr) return { ok: false, error: roundErr };
        if (!roundPairs.length) break;
        const blankKey = roundPairs.map((p) => Number(p.index)).sort((a, b) => a - b).join(',');
        if (blankKey && blankKey === prevBlankKey) {
            stalledRounds += 1;
            if (stalledRounds >= stallRoundsLimit) {
                onLog?.(`空白重译 · ${path.basename(zhPath)} · 连续无进展，停止`);
                break;
            }
        } else {
            stalledRounds = 0;
            prevBlankKey = blankKey;
        }

        const mtOpts = {
            ...collectOpts,
            contentProfile: options.contentProfile || options.senseProfile,
            senseProfile: options.senseProfile || options.contentProfile,
            smartTranslateFaithfulTone: options.smartTranslateFaithfulTone || options.faithfulTone,
            faithfulTone: options.faithfulTone || options.smartTranslateFaithfulTone,
            sakuraNsfwPrompt: options.sakuraNsfwPrompt,
            nsfwPrompt: options.nsfwPrompt,
            applyNsfwLexicon: options.applyNsfwLexicon,
            skipFakeGreeting: true,
            includeHyMtQuality: collectOpts.includeHyMtQuality,
        };
        try {
            const sakuraCore = require('../src/js/sakura-translate-core');
            Object.assign(mtOpts, sakuraCore.resolveLightMtFinalizeSanitizeOpts?.({
                modelId: resolveBlankRetryLlmModelId(options) || options.engineLlmMtModel,
            }) || {});
        } catch { /* optional */ }

        // Deterministic ZH fill (Hy-MT / short JA / ellipsis policy) — never for intl 成片.
        let workPairs = roundPairs;
        if (isZhTarget) {
            try {
                const ellipsisPolicy = require('../src/js/hymt-ellipsis-policy-core');
                const prefilled = [];
                const still = [];
                for (const p of roundPairs) {
                    const fill = ellipsisPolicy.deterministicEllipsisFill?.(p.sourceText, mtOpts);
                    if (fill && !roundSanitize?.isBlankOrPunctTranslation?.(fill, p.sourceText, mtOpts)) {
                        prefilled.push({ index: p.index, text: fill });
                    } else {
                        still.push(p);
                    }
                }
                if (prefilled.length) {
                    const prefMerged = mergeRetranslatedCues(
                        currentCues,
                        prefilled,
                        prefilled.map((u) => ({
                            index: u.index,
                            sourceText: roundPairs.find((p) => Number(p.index) === Number(u.index))?.sourceText || '',
                        })),
                        roundSanitize,
                        mtOpts,
                    );
                    if (prefMerged.changed) {
                        currentCues = prefMerged.cues;
                        totalRecovered += prefMerged.changed;
                        onLog?.(`空白重译 · ${path.basename(zhPath)} · 策略确定性回填 ${prefMerged.changed} 条`);
                    }
                }
                workPairs = still;
            } catch { /* optional */ }
            try {
                const hymtCore = require('../src/js/hymt-translate-core');
                const modelId = String(
                    options.engineMtModel || options.engineLlmMtModel || options.hybridMtModelId || '',
                ).trim();
                if (workPairs.length && (hymtCore.isHyMtModel?.(modelId) || resolveBlankRetryMtMode(options) === 'sakura')) {
                    const sourceCues = workPairs.map((p) => ({
                        index: p.index,
                        text: p.sourceText,
                        startMs: p.zhCue?.startMs,
                        endMs: p.zhCue?.endMs,
                    }));
                    const part = hymtCore.partitionBlankRetryCues?.(sourceCues, mtOpts);
                    if (part?.prefilled?.length) {
                        const prefPairs = part.prefilled.map((u) => ({
                            index: u.index,
                            sourceText: workPairs.find((p) => Number(p.index) === Number(u.index))?.sourceText || '',
                        }));
                        const prefMerged = mergeRetranslatedCues(
                            currentCues,
                            part.prefilled,
                            prefPairs,
                            roundSanitize,
                            mtOpts,
                        );
                        if (prefMerged.changed) {
                            currentCues = prefMerged.cues;
                            totalRecovered += part.prefilled.length;
                            onLog?.(`空白重译 · ${path.basename(zhPath)} · 确定性回填 ${part.prefilled.length} 条`);
                        }
                        const retryIdx = new Set((part.retryCues || []).map((c) => Number(c.index)));
                        workPairs = workPairs.filter((p) => retryIdx.has(Number(p.index)));
                    }
                }
            } catch { /* optional */ }
        }

        // Longer lexical JA first — clear real dialogue … before burning rounds on scraps.
        workPairs = workPairs.slice().sort((a, b) => {
            const la = String(a.sourceText || '').replace(/\s+/g, '').length;
            const lb = String(b.sourceText || '').replace(/\s+/g, '').length;
            return lb - la;
        });

        // Prior MT / prior blank pass already exhausted these — skip LLM (det fill done above).
        if (skipLlmSet.size && workPairs.length) {
            const before = workPairs.length;
            workPairs = workPairs.filter((p) => !skipLlmSet.has(Number(p.index)));
            const skipped = before - workPairs.length;
            if (skipped > 0) {
                onLog?.(`空白重译 · ${path.basename(zhPath)} · 本轮跳过已穷尽 ${skipped} 条 LLM`);
            }
        }

        // LLM only for recover / underfill — moan delete-class & det-only scraps stay out.
        if (blankPolicy?.filterBlankPairsForLlm && workPairs.length) {
            let recoverAllEllipsis = false;
            try {
                const modeApi = require('../src/js/settings-options-normalize-core');
                recoverAllEllipsis = !!modeApi.isInferenceTranslateMode?.(options.translateMode)
                    && shouldPreferSakuraBlankRetry(options);
            } catch { /* optional */ }
            const filtered = blankPolicy.filterBlankPairsForLlm(workPairs, {
                forceSet,
                forceRetranslateIndexes: forceIndexes,
                jaCues: docs?.jaDoc?.cues || options.jaCues || options.sourceCues,
                recoverAllEllipsis,
            });
            const dropped = (filtered.skippedPairs?.length || 0) + (filtered.detOnlyPairs?.length || 0);
            if (dropped > 0) {
                onLog?.(`空白重译 · ${path.basename(zhPath)} · 槽位过滤跳过 LLM ${dropped} 条（删类/仅确定性）`);
            }
            workPairs = filtered.llmPairs || [];
        }

        if (!workPairs.length) {
            // Only skipLlm / det leftovers remain — do not burn more rounds on the same set.
            break;
        }

        const batch = workPairs.slice(0, maxCuesPerRound);
        for (const p of batch) attemptedThisPass.add(Number(p.index));
        onLog?.(`空白重译 · ${path.basename(zhPath)} · 第 ${round + 1} 轮 ${batch.length} 条`);

        const sentenceId = resolveBlankRetryLlmModelId({ ...options, ...blankMtCallOpts });
        const parity = resolveEditorParitySakuraBlankOpts(sentenceId);
        const mtWindows = parity.editorParity
            ? clusterBlankPairsIntoJaWindows(batch, docs?.jaDoc?.cues, parity.windowLines)
            : [{ pairs: batch, cues: buildRetrySourceCues(batch) }];

        let mtResult = { ok: true, cues: [], stats: {} };
        let anyMtOk = mtWindows.length === 0;
        let merged = { changed: false, cues: currentCues };
        let roundRecovered = 0;
        totalRetried += batch.length;
        for (const win of mtWindows) {
            if (stopRequested()) {
                return cancelledPostTaskResult({
                    recovered: totalRecovered,
                    retried: totalRetried,
                    written: totalRecovered > 0,
                });
            }
            const oneMt = await translateBlankCues(win.cues, blankMtCallOpts, {
                onProgress: ctx.onProgress,
                onLog,
                event: ctx.event,
                shouldStop: ctx.shouldStop,
                signal: ctx.signal,
            });
            if (oneMt?.cancelled || oneMt?.code === 'cancelled' || stopRequested()) {
                return cancelledPostTaskResult({
                    recovered: totalRecovered,
                    retried: totalRetried,
                    written: totalRecovered > 0,
                });
            }
            mtResult = oneMt || mtResult;
            if (!oneMt?.ok) continue;
            anyMtOk = true;
            const allow = new Set((win.pairs || []).map((p) => Number(p.index)));
            const translatedWin = (Array.isArray(oneMt.cues) ? oneMt.cues : [])
                .filter((c) => allow.has(Number(c?.index)));
            const winMerged = mergeRetranslatedCues(
                currentCues,
                translatedWin,
                win.pairs,
                roundSanitize,
                mtOpts,
            );
            if (winMerged.changed) {
                currentCues = winMerged.cues;
                merged = { changed: true, cues: currentCues };
            }
            for (const idx of (oneMt.stats?.blankExhaustedIndexes || [])) {
                const n = Number(idx);
                if (Number.isInteger(n) && allow.has(n)) skipLlmSet.add(n);
            }
        }
        for (const p of batch) {
            const cue = currentCues.find((c) => Number(c.index) === Number(p.index));
            if (!roundSanitize?.isBlankOrPunctTranslation?.(String(cue?.text ?? ''), p.sourceText)) {
                roundRecovered += 1;
            }
        }
        if (!anyMtOk) {
            // Persist deterministic fills already applied this pass — don't discard them
            // when Pro/LLM is unavailable (headless / license / model errors).
            let flushed = false;
            if (totalRecovered > 0 || merged.changed) {
                try {
                    const { writeSubtitleDocument } = require('./extensions-bridge');
                    currentCues = applyDeliveryFinalizeCues(currentCues, docs.jaDoc.cues);
                    const w = writeSubtitleDocument(zhPath, {
                        cues: currentCues,
                        format: docs.zhDoc.format,
                        header: docs.zhDoc.header,
                        backupMode: 'off',
                    });
                    flushed = !!w?.ok;
                } catch { /* optional */ }
            }
            return {
                ok: false,
                error: mtResult?.error || '空白重译失败',
                code: mtResult?.code,
                blankCount: roundPairs.length,
                recovered: totalRecovered,
                retried: totalRetried,
                written: flushed,
            };
        }

        // Hy-MT / packed window: if neighbor clustering is off, fall back to window=1.
        if (
            roundRecovered === 0
            && !parity.editorParity
            && blankWindowLines > 1
            && batch.length > 1
            && !budget.speed
        ) {
            onLog?.(`空白重译 · ${path.basename(zhPath)} · 多条窗无进展，改单条窗重试`);
            const retryCues = buildRetrySourceCues(batch);
            const singleWin = await translateBlankCues(retryCues, {
                ...blankMtCallOpts,
                windowLines: 1,
            }, {
                onProgress: ctx.onProgress,
                event: ctx.event,
                shouldStop: ctx.shouldStop,
                signal: ctx.signal,
            });
            if (singleWin?.ok) {
                merged = mergeRetranslatedCues(
                    currentCues,
                    Array.isArray(singleWin.cues) ? singleWin.cues : [],
                    batch,
                    roundSanitize,
                    mtOpts,
                );
                totalRetried += batch.length;
                if (merged.changed) {
                    currentCues = merged.cues;
                    roundRecovered = 0;
                    for (const p of batch) {
                        const cue = currentCues.find((c) => Number(c.index) === Number(p.index));
                        if (!roundSanitize?.isBlankOrPunctTranslation?.(String(cue?.text ?? ''), p.sourceText)) {
                            roundRecovered += 1;
                        }
                    }
                }
            }
        }
        if (!merged.changed && roundRecovered === 0) break;

        totalRecovered += roundRecovered;
        if (roundRecovered === 0) {
            // Full batch 0 recover: do not thrash per-cue (P1). Optional escape hatch via options.
            if (
                allowPerCueFallback
                && maxPerCueFallback > 0
                && batch.length > 1
                && round < maxRounds - 1
                && !perCueOnlyAfterPartialRecover
            ) {
                onLog?.(`空白重译 · ${path.basename(zhPath)} · 本轮 0 恢复，改逐条重试`);
                const singles = batch
                    .filter((p) => !skipLlmSet.has(Number(p.index)))
                    .filter((p) => blankPolicy?.isSubstantialBlankSource?.(p.sourceText) !== false)
                    .slice(0, Math.min(maxPerCueFallback, batch.length));
                let singleOk = 0;
                for (const one of singles) {
                    if (stopRequested()) {
                        return cancelledPostTaskResult({
                            recovered: totalRecovered,
                            retried: totalRetried,
                            written: totalRecovered > 0,
                        });
                    }
                    attemptedThisPass.add(Number(one.index));
                    const oneWin = parity.editorParity
                        ? clusterBlankPairsIntoJaWindows([one], docs?.jaDoc?.cues, parity.windowLines)[0]
                        : { cues: buildRetrySourceCues([one]), pairs: [one] };
                    const oneRes = await translateBlankCues((oneWin && oneWin.cues) || buildRetrySourceCues([one]), {
                        ...blankMtCallOpts,
                        windowLines: parity.editorParity ? parity.windowLines : 1,
                    }, {
                        onProgress: ctx.onProgress,
                        event: ctx.event,
                        shouldStop: ctx.shouldStop,
                        signal: ctx.signal,
                    });
                    if (oneRes?.cancelled || oneRes?.code === 'cancelled') {
                        return cancelledPostTaskResult({
                            recovered: totalRecovered,
                            retried: totalRetried,
                            written: totalRecovered > 0,
                        });
                    }
                    if (!oneRes?.ok) continue;
                    const oneMerged = mergeRetranslatedCues(
                        currentCues,
                        (oneRes.cues || []).filter((c) => Number(c?.index) === Number(one.index)),
                        [one],
                        roundSanitize,
                        mtOpts,
                    );
                    if (!oneMerged.changed) continue;
                    currentCues = oneMerged.cues;
                    const cue = currentCues.find((c) => Number(c.index) === Number(one.index));
                    if (!roundSanitize?.isBlankOrPunctTranslation?.(String(cue?.text ?? ''), one.sourceText)) {
                        singleOk += 1;
                        totalRecovered += 1;
                    }
                }
                totalRetried += singles.length;
                if (singleOk === 0) break;
                lowYieldRounds = 0;
                round += 1;
                continue;
            }
            break;
        }
        // Partial recover: optionally single-cue the still-blank substantial leftovers in this batch.
        if (
            allowPerCueFallback
            && maxPerCueFallback > 0
            && perCueOnlyAfterPartialRecover
            && roundRecovered > 0
            && roundRecovered < batch.length
        ) {
            const stillBlank = batch.filter((p) => {
                if (skipLlmSet.has(Number(p.index))) return false;
                const cue = currentCues.find((c) => Number(c.index) === Number(p.index));
                if (!roundSanitize?.isBlankOrPunctTranslation?.(String(cue?.text ?? ''), p.sourceText)) {
                    return false;
                }
                return blankPolicy?.isSubstantialBlankSource?.(p.sourceText) !== false;
            }).slice(0, maxPerCueFallback);
            if (stillBlank.length) {
                onLog?.(`空白重译 · ${path.basename(zhPath)} · 部分恢复后逐条补 ${stillBlank.length} 条`);
                for (const one of stillBlank) {
                    if (stopRequested()) {
                        return cancelledPostTaskResult({
                            recovered: totalRecovered,
                            retried: totalRetried,
                            written: totalRecovered > 0,
                        });
                    }
                    attemptedThisPass.add(Number(one.index));
                    const oneWin = parity.editorParity
                        ? clusterBlankPairsIntoJaWindows([one], docs?.jaDoc?.cues, parity.windowLines)[0]
                        : { cues: buildRetrySourceCues([one]), pairs: [one] };
                    const oneRes = await translateBlankCues((oneWin && oneWin.cues) || buildRetrySourceCues([one]), {
                        ...blankMtCallOpts,
                        windowLines: parity.editorParity ? parity.windowLines : 1,
                    }, {
                        onProgress: ctx.onProgress,
                        event: ctx.event,
                        shouldStop: ctx.shouldStop,
                        signal: ctx.signal,
                    });
                    if (oneRes?.cancelled || oneRes?.code === 'cancelled') {
                        return cancelledPostTaskResult({
                            recovered: totalRecovered,
                            retried: totalRetried,
                            written: totalRecovered > 0,
                        });
                    }
                    if (!oneRes?.ok) continue;
                    const oneMerged = mergeRetranslatedCues(
                        currentCues,
                        (oneRes.cues || []).filter((c) => Number(c?.index) === Number(one.index)),
                        [one],
                        roundSanitize,
                        mtOpts,
                    );
                    if (!oneMerged.changed) continue;
                    currentCues = oneMerged.cues;
                    const cue = currentCues.find((c) => Number(c.index) === Number(one.index));
                    if (!roundSanitize?.isBlankOrPunctTranslation?.(String(cue?.text ?? ''), one.sourceText)) {
                        totalRecovered += 1;
                    }
                }
                totalRetried += stillBlank.length;
            }
        }
        // Low yield fuse: stop burning LLM when recover ratio stays tiny.
        {
            const evalY = blankPolicy?.evaluateBlankWeakYield?.({
                budget,
                batchSize: batch.length,
                roundRecovered,
                lowYieldRounds,
            }) || null;
            if (evalY) {
                lowYieldRounds = Number(evalY.lowYieldRounds) || 0;
                if (evalY.stop) {
                    onLog?.(`空白重译 · ${path.basename(zhPath)} · 本轮仅恢复 ${roundRecovered}/${batch.length}，弱收益熔断`);
                    break;
                }
                if (evalY.continueSoft) {
                    onLog?.(`空白重译 · ${path.basename(zhPath)} · 本轮仅恢复 ${roundRecovered}/${batch.length}，继续`);
                }
            } else if (batch.length >= 32 && roundRecovered / batch.length < 0.05) {
                lowYieldRounds += 1;
                if (lowYieldRounds >= 2) {
                    onLog?.(`空白重译 · ${path.basename(zhPath)} · 本轮仅恢复 ${roundRecovered}/${batch.length}，停止`);
                    break;
                }
                onLog?.(`空白重译 · ${path.basename(zhPath)} · 本轮仅恢复 ${roundRecovered}/${batch.length}，继续`);
            } else if (roundRecovered > 0) {
                lowYieldRounds = 0;
            }
        }
        round += 1;
        // Do NOT early-exit when remaining blanks fit in one batch — leftovers after
        // a partial recover still need another round (PRWF-016 mass …… stall).
    }

    // Last-chance deterministic fill for leftovers (short JA / adult gloss).
    // Avoid shipping permanent …… after LLM blank rounds stall.
    try {
        if (isZhTarget) {
            const mtSanitize = require('../src/js/mt-sanitize-core');
            if (typeof mtSanitize.fillBlankZhSlotsFromJa === 'function') {
                const filled = mtSanitize.fillBlankZhSlotsFromJa(currentCues, docs.jaDoc.cues, {
                    blankText: '……',
                });
                if (filled?.filled > 0) {
                    currentCues = filled.cues;
                    totalRecovered += filled.filled;
                    onLog?.(`空白补译 · ${path.basename(zhPath)} · 确定性补全 ${filled.filled} 条`);
                }
            }
        }
    } catch { /* optional */ }

    if (!totalRecovered) {
        const { pairs: finalPairs } = collectBlankRetranslatePairs(currentCues, docs.jaDoc.cues, collectOpts);
        const leftIndexes = (finalPairs || []).map((p) => Number(p.index)).filter((n) => Number.isInteger(n));
        const exhaustedIndexes = leftIndexes.filter((n) => attemptedThisPass.has(n) || skipLlmSet.has(n));
        if (!totalRetried && !finalPairs.length) {
            return {
                ok: true,
                skipped: true,
                reason: 'none',
                blankCount: 0,
                left: 0,
                leftIndexes: [],
                exhaustedIndexes: [],
            };
        }
        return {
            ok: true,
            written: false,
            blankCount: finalPairs.length,
            retried: totalRetried,
            recovered: 0,
            left: finalPairs.length,
            leftIndexes,
            exhaustedIndexes,
        };
    }

    const { writeSubtitleDocument } = require('./extensions-bridge');
    currentCues = applyDeliveryFinalizeCues(currentCues, docs.jaDoc.cues);
    const written = writeSubtitleDocument(zhPath, {
        cues: currentCues,
        format: docs.zhDoc.format,
        header: docs.zhDoc.header,
        backupMode: 'off',
    });
    if (!written.ok) return written;

    const { pairs: leftPairs } = collectBlankRetranslatePairs(currentCues, docs.jaDoc.cues, collectOpts);
    const leftIndexes = (leftPairs || []).map((p) => Number(p.index)).filter((n) => Number.isInteger(n));
    const exhaustedIndexes = leftIndexes.filter((n) => attemptedThisPass.has(n) || skipLlmSet.has(n));
    return {
        ok: true,
        written: true,
        path: zhPath,
        blankCount: leftPairs.length + totalRecovered,
        retried: totalRetried,
        recovered: totalRecovered,
        left: leftPairs.length,
        leftIndexes,
        exhaustedIndexes,
        rounds: round + 1,
        summary: totalRecovered
            ? `空白重译 ${totalRecovered} 条${leftPairs.length ? `（仍剩 ${leftPairs.length} 条空白）` : ''}`
            : `空白重译未恢复（${totalRetried} 条仍为空）`,
    };
}

module.exports = {
    resolveJaSourceForBlankCue,
    collectBlankRetranslatePairs,
    blankRetryCollectOptions,
    resolveBlankRetryMtMode,
    resolveBlankRetryLlmModelId,
    resolveBlankRetryChatModelId,
    resolveEditorParitySakuraBlankOpts,
    clusterBlankPairsIntoJaWindows,
    seedBlankRetrySentenceModelFromManaged,
    canBlankRetryViaSakura,
    isDialogBlankRetry,
    shouldPreferSakuraBlankRetry,
    mergeRetranslatedCues,
    runBlankMtRetryForSubtitlePair,
};

try {
    const blankPolicy = require('../src/js/blank-mt-retry-policy-core');
    module.exports.isInferenceBlankDirectFinalize = blankPolicy.isInferenceBlankDirectFinalize;
    module.exports.resolveBlankMtRetryBudget = blankPolicy.resolveBlankMtRetryBudget;
    module.exports.shouldRunEarlyBlankPass = blankPolicy.shouldRunEarlyBlankPass;
    module.exports.shouldRunPostBatchBlankPass = blankPolicy.shouldRunPostBatchBlankPass;
    module.exports.shouldSkipPostBatchBlankPass = blankPolicy.shouldSkipPostBatchBlankPass;
    module.exports.resolveSkipLlmBlankIndexes = blankPolicy.resolveSkipLlmBlankIndexes;
    module.exports.mergeBlankIndexLists = blankPolicy.mergeBlankIndexLists;
    module.exports.normalizeBlankIndexList = blankPolicy.normalizeBlankIndexList;
    module.exports.isSubstantialBlankSource = blankPolicy.isSubstantialBlankSource;
    module.exports.classifyBlankSlotForLlm = blankPolicy.classifyBlankSlotForLlm;
    module.exports.filterBlankPairsForLlm = blankPolicy.filterBlankPairsForLlm;
    module.exports.evaluateBlankWeakYield = blankPolicy.evaluateBlankWeakYield;
} catch { /* optional in stripped builds */ }
