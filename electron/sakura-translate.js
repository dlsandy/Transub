/**
 * Free Sakura JA→ZH translation runner (llama-server, no Advanced gate).
 */
const core = require('../src/js/sakura-translate-core');
const hymtCore = require('../src/js/hymt-translate-core');
const tgCore = require('../src/js/translategemma-translate-core');
const murasakiCore = require('../src/js/murasaki-translate-core');
const orionCore = require('../src/js/orion-translate-core');
const indexCore = require('../src/js/index-translate-core');
const sakuraCatalog = require('../src/js/sakura-mt-catalog-core');
const sakuraMt = require('./sakura-mt');
const {
    resolveSentenceMtEndpoint,
    resolveSentenceMtPromptFamily,
    byokHostHint,
} = require('./sakura-mt-endpoint-resolve');
const { chatCompletions, isMockMode } = require('./advanced-llm-client');
const llamaServer = require('./advanced-llama-server');
const { asPlainObject, asString, asNumber } = require('./ipc-validate');
const mtSanitize = require('../src/js/mt-sanitize-core');
const longTrackPolicy = require('../src/js/mt-long-track-policy-core');
const softViewing = require('../src/js/av-soft-viewing-policy-core');
const { recoverSakuraChunkAfterFailure } = require('./sakura-chunk-resilient');

/** Default llama.cpp / OpenAI-compat anti-loop for Sakura batches. */
const SAKURA_REPETITION_PENALTY = 1.18;
const SAKURA_FREQUENCY_PENALTY = 0.25;

function resolveChineseSubtitleVariant(p = {}) {
    const fromPayload = String(p.chineseSubtitleVariant || '').trim();
    if (fromPayload) return fromPayload;
    try {
        const { loadSettings } = require('./settings-data');
        const v = String(loadSettings()?.options?.chineseSubtitleVariant || '').trim();
        if (v) return v;
    } catch { /* ignore */ }
    return 'simplified';
}

function applyMtChineseVariantNormalization(cues, p = {}) {
    let chinese;
    try {
        chinese = require('../src/js/subtitle-chinese-core');
    } catch {
        return { cues: Array.isArray(cues) ? cues : [], changed: false };
    }
    let protectTerms = [];
    try {
        const glossCore = require('../src/js/subtitle-glossary-core');
        if (p.glossary && typeof glossCore.collectProtectTerms === 'function') {
            protectTerms = glossCore.collectProtectTerms(p.glossary);
        }
    } catch { /* optional */ }
    const variant = resolveChineseSubtitleVariant(p);
    const normalized = chinese.normalizeMtChineseCues(cues, variant, { protectTerms });
    return {
        cues: normalized.cues,
        changed: !!normalized.changed,
        summary: normalized.summary,
        stats: normalized.stats,
    };
}

function extractGlossaryTerms(glossary) {
    try {
        const adv = require('../src/js/advanced-context-reconstruct-core');
        if (typeof adv.extractGlossaryTerms === 'function') {
            return adv.extractGlossaryTerms(glossary) || [];
        }
    } catch (_) { /* ignore */ }
    if (!glossary || typeof glossary !== 'object') return [];
    const entries = Array.isArray(glossary.entries) ? glossary.entries : [];
    return entries.map((e) => ({
        term: e.term || e.src,
        translation: e.translation || e.dst,
        info: e.info || e.note,
    })).filter((t) => t.term);
}

/**
 * Fill NSFW prompt flags from settings / filename when not explicit on payload.
 * @param {object} p
 * @returns {object}
 */
function enrichSakuraNsfwOptions(p = {}) {
    const out = { ...p };
    if (out.sakuraNsfwPrompt == null && out.nsfwPrompt == null) {
        try {
            const { loadSettings } = require('./settings-data');
            const opts = loadSettings()?.options || {};
            if (opts.sakuraNsfwPrompt === true || opts.sakuraNsfwPrompt === false) {
                out.sakuraNsfwPrompt = opts.sakuraNsfwPrompt;
            }
            if (opts.smartTranslateFaithfulTone && out.smartTranslateFaithfulTone == null) {
                out.smartTranslateFaithfulTone = true;
            }
            if (opts.smartTranslateFaithfulTone && out.faithfulTone == null) {
                out.faithfulTone = true;
            }
            const preset = String(opts.activePresetId || opts.presetId || '').trim();
            if (preset && !out.presetId && !out.activePresetId) {
                out.presetId = preset;
            }
            if (!out.chineseSubtitleVariant) {
                const cv = String(opts.chineseSubtitleVariant || '').trim();
                if (cv) out.chineseSubtitleVariant = cv;
            }
        } catch (_) { /* ignore */ }
    }
    if (!out.contentProfile && !out.senseProfile) {
        const name = String(out.fileName || out.sourcePath || out.path || '').trim();
        if (name) {
            try {
                const { classifyContentProfile } = require('../src/js/content-profile-core');
                const hit = classifyContentProfile({ fileName: name, language: 'ja' });
                if (hit?.profile) out.contentProfile = hit.profile;
            } catch (_) { /* ignore */ }
        }
    }
    // Align with smart-translate: NSFW / faithful / av_soft ⇒ apply lexicon on sanitize.
    if (out.applyNsfwLexicon == null) {
        const nsfw = core.shouldUseNsfwPrompt(out);
        out.applyNsfwLexicon = !!(
            nsfw
            || out.faithfulTone
            || out.smartTranslateFaithfulTone
            || out.sakuraNsfwPrompt
            || out.nsfwPrompt
        );
    }
    return out;
}

async function translateCueBatch(cues, ctx) {
        const messages = core.buildChatMessages(cues, {
        glossaryTerms: ctx.glossaryTerms,
        sakuraNsfwPrompt: ctx.sakuraNsfwPrompt,
        nsfwPrompt: ctx.nsfwPrompt,
        contentProfile: ctx.contentProfile,
        senseProfile: ctx.senseProfile,
        faithfulTone: ctx.faithfulTone,
        smartTranslateFaithfulTone: ctx.smartTranslateFaithfulTone,
        translateStylePreset: ctx.translateStylePreset,
        translateStyleCustomNote: ctx.translateStyleCustomNote,
        presetId: ctx.presetId,
        modelId: ctx.modelId,
        promptFamily: ctx.promptFamily,
        castNames: ctx.castNames,
        language: ctx.language,
        sourceLanguage: ctx.sourceLanguage || ctx.language,
        subtitleTargetLang: ctx.subtitleTargetLang,
        targetLang: ctx.targetLang || ctx.subtitleTargetLang,
        targetLanguage: ctx.targetLanguage,
        translateGemmaPromptMode: ctx.translateGemmaPromptMode,
        previousSourceText: ctx.previousSourceText,
        previousTranslationText: ctx.previousTranslationText,
        prevSourceText: ctx.prevSourceText,
        prevTranslationText: ctx.prevTranslationText,
        translateGemmaSubStyle: ctx.translateGemmaSubStyle,
        avGlossary: ctx.avGlossary,
        avActorGlossary: ctx.avActorGlossary,
        avDomainGlossary: ctx.avDomainGlossary,
        nsfwLexicon: ctx.nsfwLexicon,
        _blankRetry: !!ctx._blankRetry,
        _qualityRetry: !!ctx._qualityRetry,
        _glossaryRetry: !!ctx._glossaryRetry,
        _ellipsisHardFail: !!ctx._ellipsisHardFail,
        _ellipsisHardFailLong: !!ctx._ellipsisHardFailLong,
        _ellipsisQuickDirect: !!ctx._ellipsisQuickDirect,
        murasakiPreset: ctx.murasakiPreset,
        enableThinking: ctx.enableThinking,
        hyMtMinimalPrompt: !!ctx.hyMtMinimalPrompt,
        hyMtQualityRetry: !!ctx.hyMtQualityRetry,
        qualityReasons: ctx.qualityReasons,
    });
    if (isMockMode() || ctx.dryRun) {
        return {
            ok: true,
            cues: cues.map((c) => ({
                index: c.index,
                text: `[sakura] ${c.text || ''}`,
            })),
        };
    }
    const family = ctx.promptFamily || sakuraMt.resolvePromptFamily?.(ctx.modelId) || 'sakura';
    const isHyMt = family === 'hymt' || hymtCore.isHyMtModel(ctx.modelId);
    const isHunyuan = family === 'hunyuan' || hymtCore.isHunyuanMtModel?.(ctx.modelId);
    const isTgSub = family === 'translategemmasub' || tgCore.isTranslateGemmaSubModel?.(ctx.modelId);
    const isTg = isTgSub
        || family === 'translategemma'
        || tgCore.isTranslateGemmaOfficialModel?.(ctx.modelId)
        || (!isTgSub && tgCore.isTranslateGemmaModel(ctx.modelId));
    const isMurasaki = family === 'murasaki' || murasakiCore.isMurasakiModel?.(ctx.modelId);
    const isOrion = family === 'orion' || orionCore.isOrionModel?.(ctx.modelId);
    const isIndex = family === 'index' || indexCore.isIndexTranslateModel?.(ctx.modelId);
    const hyInf = isHyMt ? hymtCore.resolveHyMtInferenceOptions(ctx) : null;
    const hunyuanInf = isHunyuan ? hymtCore.resolveHunyuanMtInferenceOptions?.(ctx) : null;
    const tgInf = isTg ? tgCore.resolveTranslateGemmaInferenceOptions({
        ...ctx,
        promptFamily: isTgSub ? 'translategemmasub' : ctx.promptFamily,
        modelId: ctx.modelId,
    }) : null;
    const murasakiInf = isMurasaki ? murasakiCore.resolveMurasakiInferenceOptions(ctx) : null;
    const orionInf = isOrion ? orionCore.resolveOrionInferenceOptions(ctx) : null;
    const indexInf = isIndex ? indexCore.resolveIndexInferenceOptions(ctx) : null;
    const tokenCap = isMurasaki
        ? (murasakiInf?.maxTokensCap || 2048)
        : (isOrion ? (orionInf?.maxTokensCap || 1024) : 1024);
    const maxTokens = Number.isFinite(Number(ctx.maxTokens))
        ? Math.max(32, Math.min(tokenCap, Math.round(Number(ctx.maxTokens))))
        : (isMurasaki
            ? murasakiCore.estimateMaxTokens(cues, ctx)
            : (isOrion ? orionCore.estimateMaxTokens(cues) : core.estimateMaxTokens(cues)));
    const llm = await chatCompletions({
        apiKey: ctx.apiKey,
        baseUrl: ctx.baseUrl,
        model: ctx.model,
        temperature: isHyMt
            ? hyInf.temperature
            : (isHunyuan
                ? (hunyuanInf?.temperature ?? 0.5)
                : (isIndex
                    ? indexInf.temperature
                    : (isTg ? tgInf.temperature : (orionInf
                        ? orionInf.temperature
                        : (murasakiInf ? murasakiInf.temperature : 0.2))))),
        top_p: isHyMt
            ? hyInf.top_p
            : (isHunyuan
                ? hunyuanInf?.top_p
                : (isIndex
                    ? indexInf.top_p
                    : (isTg ? tgInf.top_p : (orionInf
                        ? orionInf.top_p
                        : (murasakiInf ? murasakiInf.top_p : undefined))))),
        timeoutMs: ctx.timeoutMs,
        signal: ctx.signal,
        messages,
        max_tokens: maxTokens,
        enableThinking: murasakiInf
            ? murasakiInf.enableThinking === true
            : ((orionInf || indexInf) ? false : undefined),
        repetition_penalty: isHyMt
            ? hyInf.repetition_penalty
            : (isHunyuan
                ? (hunyuanInf?.repetition_penalty ?? 1.05)
                : (isIndex
                    ? indexInf.repetition_penalty
                    : (isTg ? tgInf.repetition_penalty : (orionInf
                        ? orionInf.repetition_penalty
                        : (murasakiInf ? murasakiInf.repetition_penalty : SAKURA_REPETITION_PENALTY))))),
        frequency_penalty: (isHyMt || isHunyuan || isIndex || isTg || murasakiInf || orionInf)
            ? undefined
            : SAKURA_FREQUENCY_PENALTY,
        stop: isHyMt
            ? hyInf.stop
            : (isHunyuan
                ? hunyuanInf?.stop
                : (isIndex
                    ? indexInf.stop
                    : (isTg
                        ? tgInf.stop
                        : (murasakiInf?.stop || undefined)))),
        // Hy-MT / Index prefixes are stable across batches — allow llama.cpp prompt cache.
        cachePrompt: isHyMt
            ? hyInf.cachePrompt !== false
            : (isHunyuan
                ? hunyuanInf?.cachePrompt !== false
                : (isIndex
                    ? indexInf.cachePrompt !== false
                    : (isTg ? tgInf.cachePrompt !== false : ((murasakiInf || orionInf)
                        ? (murasakiInf || orionInf).cachePrompt !== false
                        : false)))),
    });
    if (!llm.ok) {
        return { ok: false, error: llm.error || '本地推理失败', cues: [], code: llm.code };
    }
    // TranslateGemma soft refusals: one faithful/NSFW escalate before blank-retry settles.
    if (
        isTg
        && !ctx._tgRefusalRetry
        && !ctx._lineAlignFallback
        && typeof tgCore.looksLikeTranslateGemmaSafetyRefusal === 'function'
        && tgCore.looksLikeTranslateGemmaSafetyRefusal(llm.content)
    ) {
        return translateCueBatch(cues, {
            ...ctx,
            _tgRefusalRetry: true,
            faithfulTone: true,
            smartTranslateFaithfulTone: true,
            sakuraNsfwPrompt: true,
            nsfwPrompt: true,
            applyNsfwLexicon: true,
        });
    }
    let parsed = null;
    if (isOrion && typeof orionCore.parseOrionJsonlineOutput === 'function') {
        parsed = orionCore.parseOrionJsonlineOutput(llm.content, cues);
    }
    // Hy-MT multi-cue: prefer numbered parse (1. 2. …) before bare newline zip.
    if (
        !parsed
        && isHyMt
        && cues.length > 1
        && typeof hymtCore.parseHyMtNumberedOutput === 'function'
    ) {
        const numbered = hymtCore.parseHyMtNumberedOutput(llm.content, cues);
        if (numbered?.ok) parsed = numbered;
    }
    if (!parsed) parsed = core.parseLineAlignedOutput(llm.content, cues);
    if (!parsed.ok) return parsed;

    const sanitizeOpts = {
        glossaryTerms: ctx.glossaryTerms,
        glossary: ctx.glossary,
        nameMap: ctx.nameMap,
        unifyNames: true,
        sakuraNsfwPrompt: ctx.sakuraNsfwPrompt,
        nsfwPrompt: ctx.nsfwPrompt,
        contentProfile: ctx.contentProfile,
        senseProfile: ctx.senseProfile,
        faithfulTone: ctx.faithfulTone,
        smartTranslateFaithfulTone: ctx.smartTranslateFaithfulTone,
        applyNsfwLexicon: ctx.applyNsfwLexicon,
        skipFakeGreeting: ctx.skipFakeGreeting,
        chineseSubtitleVariant: ctx.chineseSubtitleVariant,
        subtitleTargetLang: ctx.subtitleTargetLang,
        targetLang: ctx.targetLang || ctx.subtitleTargetLang || ctx.targetLanguage,
        targetLanguage: ctx.targetLanguage,
        // Keep every input slot + original index for write-back / blank-retry.
        dropUselessEllipsis: false,
        renumberIndexes: false,
    };

    async function runPerCueFallback(reason) {
        const singles = [];
        for (const cue of cues) {
            if (ctx.signal?.aborted) {
                return { ok: false, error: '已取消', cues: [], code: 'cancelled' };
            }
            const one = await translateCueBatch([cue], {
                ...ctx,
                _lineAlignFallback: true,
                _blankRetry: true,
                hyMtMinimalPrompt: true,
                maxTokens: core.estimateMaxTokens([cue]),
            });
            if (!one.ok) {
                singles.push({ index: cue.index, text: '' });
            } else {
                const hit = (one.cues || []).find((u) => Number(u.index) === Number(cue.index));
                singles.push({
                    index: cue.index,
                    text: hit ? String(hit.text ?? '') : '',
                });
            }
        }
        const cleanedSingles = (ctx._skipMtSanitize || family === 'galtransl')
            ? { cues: singles }
            : mtSanitize.sanitizeMtCues(singles, cues, sanitizeOpts);
        let fallbackCues = cleanedSingles.cues;
        if (typeof tgCore.finalizeTranslateGemmaCue === 'function') {
            fallbackCues = cues.map((c) => {
                const hit = (fallbackCues || []).find((u) => Number(u.index) === Number(c.index));
                return {
                    index: c.index,
                    text: tgCore.finalizeTranslateGemmaCue(c.text, hit?.text ?? ''),
                };
            });
        }
        return {
            ok: true,
            cues: fallbackCues,
            lineAlignFallback: true,
            perCueFallbackReason: reason,
        };
    }

    // Mid-window skip / truncate: positional pad would shift later ZH onto wrong JA.
    if (parsed.lineCountMismatch && cues.length > 1 && !ctx._lineAlignFallback) {
        return runPerCueFallback('line_count_mismatch');
    }

    // Exact line count but silent mis-attach (Hy-MT skips a JA line, still emits N lines).
    if (
        cues.length > 1
        && !ctx._lineAlignFallback
        && !parsed.lineCountMismatch
        && typeof core.assessPositionalAlignQuality === 'function'
    ) {
        const alignQ = core.assessPositionalAlignQuality(cues, parsed.cues);
        if (alignQ?.suspicious) {
            return runPerCueFallback(alignQ.reason || 'positional_misalign');
        }
    }
    // GalTransl: consecutive paraphrase bleed (same ZH prefix on divergent JA) → per-cue.
    if (
        family === 'galtransl'
        && cues.length > 1
        && !ctx._lineAlignFallback
        && !parsed.lineCountMismatch
        && typeof core.assessNeighborParaphraseBleed === 'function'
    ) {
        const bleed = core.assessNeighborParaphraseBleed(cues, parsed.cues);
        if (bleed?.suspicious) {
            return runPerCueFallback(bleed.reason || 'neighbor_paraphrase_bleed');
        }
    }

    // GalTransl / Murasaki: skip mid-chunk deep sanitize (final whole-track pass still runs).
    // Invent-as-blank heuristics here used to wipe good paraphrases → blank-retry storms.
    const skipMidSanitize = !!(ctx._skipMtSanitize || family === 'galtransl' || isMurasaki);
    const cleaned = skipMidSanitize
        ? { cues: parsed.cues }
        : mtSanitize.sanitizeMtCues(parsed.cues, cues, sanitizeOpts);
    let outCues = cleaned.cues;
    // After sanitize (may strip …… / miss identity): always re-finalize when TG helpers load.
    if (typeof tgCore.finalizeTranslateGemmaCue === 'function') {
        outCues = cues.map((c) => {
            const hit = (outCues || []).find((u) => Number(u.index) === Number(c.index));
            return {
                index: c.index,
                text: tgCore.finalizeTranslateGemmaCue(c.text, hit?.text ?? ''),
            };
        });
    }
    if (isMurasaki && typeof murasakiCore.finalizeMurasakiCue === 'function') {
        outCues = cues.map((c) => {
            const hit = (outCues || []).find((u) => Number(u.index) === Number(c.index));
            return {
                index: c.index,
                text: murasakiCore.finalizeMurasakiCue(c.text, hit?.text ?? ''),
            };
        });
    }
    // Exact line count but many blanks/leaks wiped by sanitize — still collapse the window.
    // Prefer blank-only retry over full-window per-cue fallback (GalTransl window=8 storm).
    // GalTransl / Murasaki mid-pass: only literal empty/ellipsis counts as blank.
    if (cues.length > 1 && !ctx._lineAlignFallback && !ctx._skipBlankRetry) {
        const blankIndexes = ((family === 'galtransl' || isMurasaki)
            && typeof core.collectLiteralBlankTranslationIndexes === 'function')
            ? core.collectLiteralBlankTranslationIndexes(cues, outCues)
            : core.collectBlankTranslationIndexes(cues, outCues);
        const blankRatio = blankIndexes.length / cues.length;
        if (blankIndexes.length >= 3 || blankRatio >= 0.4) {
            if (blankRatio < 1 && blankIndexes.length < cues.length) {
                const blankSet = new Set(blankIndexes.map((n) => Number(n)));
                const keep = new Map(
                    (outCues || []).map((u) => [Number(u.index), String(u.text ?? '')]),
                );
                const retrySrc = cues.filter((c) => blankSet.has(Number(c.index)));
                const singles = [];
                for (const cue of retrySrc) {
                    if (ctx.signal?.aborted) break;
                    const one = await translateCueBatch([cue], {
                        ...ctx,
                        _lineAlignFallback: true,
                        _blankRetry: true,
                        hyMtMinimalPrompt: true,
                        maxTokens: core.estimateMaxTokens([cue]),
                    });
                    if (!one.ok) {
                        singles.push({ index: cue.index, text: '' });
                    } else {
                        const hit = (one.cues || []).find((u) => Number(u.index) === Number(cue.index));
                        singles.push({
                            index: cue.index,
                            text: hit ? String(hit.text ?? '') : '',
                        });
                    }
                }
                for (const u of singles) keep.set(Number(u.index), String(u.text ?? ''));
                outCues = cues.map((c) => ({
                    index: c.index,
                    text: keep.has(Number(c.index)) ? keep.get(Number(c.index)) : '',
                }));
            } else {
                return runPerCueFallback(
                    blankRatio >= 0.4 ? 'high_blank_ratio' : 'blank_cluster',
                );
            }
        }
    }
    return { ok: true, cues: outCues };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {number} total
 * @param {number} concurrency
 * @param {(index: number) => Promise<*>} fn
 * @param {AbortSignal} [signal]
 */
async function mapChunkIndicesWithConcurrency(total, concurrency, fn, signal) {
    const count = Math.max(0, Math.round(Number(total) || 0));
    if (!count) return [];
    const limit = Math.max(1, Math.min(4, Math.round(Number(concurrency) || 1)));
    if (limit <= 1) {
        const out = [];
        for (let i = 0; i < count; i += 1) {
            if (signal?.aborted) {
                throw Object.assign(new Error('已取消'), { code: 'cancelled' });
            }
            out.push(await fn(i));
        }
        return out;
    }
    const results = new Array(count);
    let next = 0;
    async function worker() {
        while (next < count) {
            if (signal?.aborted) {
                throw Object.assign(new Error('已取消'), { code: 'cancelled' });
            }
            const i = next;
            next += 1;
            results[i] = await fn(i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, count) }, () => worker()));
    return results;
}

function resolveSakuraClientConcurrency(endpoint) {
    const fromEndpoint = Number(endpoint?.parallelSlots);
    if (Number.isFinite(fromEndpoint) && fromEndpoint > 1) {
        return Math.max(1, Math.min(4, Math.round(fromEndpoint)));
    }
    try {
        const state = llamaServer.getServerState?.();
        if (state?.parallelSlots > 1) {
            return Math.max(1, Math.min(4, Math.round(state.parallelSlots)));
        }
    } catch (_) { /* ignore */ }
    return 1;
}

/** Best-effort free stuck llama-server slots after client abort/timeout. */
async function tryReleaseLlamaSlots(baseUrl) {
    const root = String(baseUrl || '').replace(/\/+$/, '').replace(/\/v1$/i, '');
    if (!root) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
        const slotsUrl = `${root}/slots`;
        const res = await fetch(slotsUrl, { signal: controller.signal });
        if (!res.ok) return;
        let slots;
        try {
            slots = await res.json();
        } catch (_) {
            return;
        }
        const list = Array.isArray(slots) ? slots : [];
        await Promise.all(list.map(async (slot, i) => {
            const id = Number.isInteger(Number(slot?.id)) ? Number(slot.id) : i;
            try {
                await fetch(`${slotsUrl}/${id}?action=erase`, {
                    method: 'POST',
                    signal: controller.signal,
                });
            } catch (_) { /* ignore */ }
        }));
    } catch (_) { /* ignore */ } finally {
        clearTimeout(timer);
    }
}

/**
 * Final leftover empty/ellipsis → one-cue direct MT with the current model.
 * Runs after blank-retry budget / sanitize so GalTransl light path still recovers
 * remaining「…」without reopening invent-wipe storms.
 * @returns {Promise<{ cues: object[], filled: number }>}
 */
async function fillLiteralEllipsisQuickDirect({
    sourceCues,
    translatedCues,
    batchCtx,
    promptFamily,
    send,
    signal,
} = {}) {
    const src = Array.isArray(sourceCues) ? sourceCues : [];
    let out = Array.isArray(translatedCues) ? translatedCues.slice() : [];
    if (!src.length || !out.length) return { cues: out, filled: 0, attemptedIndexes: [], failedIndexes: [] };
    if (signal?.aborted || batchCtx?.signal?.aborted) {
        return { cues: out, filled: 0, attemptedIndexes: [], failedIndexes: [] };
    }

    const maxCountRaw = Number(batchCtx?.quickDirectMaxCount);
    const isMurasakiQuick = promptFamily === 'murasaki'
        || murasakiCore.isMurasakiModel?.(batchCtx?.modelId);
    // Final pass: do not leave leftover「…」capped below what the editor can
    // batch-retranslate. Explicit quickDirectMaxCount still wins when set.
    const maxCount = Number.isFinite(maxCountRaw) && maxCountRaw > 0
        ? Math.round(maxCountRaw)
        : (isMurasakiQuick
            ? Math.max(1, src.length)
            : Math.max(24, Math.min(120, Math.ceil(src.length * 0.12))));
    let shouldSkip = null;
    if (promptFamily === 'hymt' || hymtCore.isHyMtModel?.(batchCtx?.modelId)) {
        try {
            const ellipsisPolicy = require('../src/js/hymt-ellipsis-policy-core');
            const byZh = new Map(
                out.map((u) => [Number(u.index), String(u?.text ?? '')]),
            );
            shouldSkip = (cue) => {
                const plan = ellipsisPolicy.planEllipsisSlotAction?.(
                    cue.text,
                    byZh.get(Number(cue.index)) ?? '',
                    {},
                );
                return plan?.action === 'delete';
            };
        } catch (_) { /* optional */ }
    }

    const todo = typeof core.collectCuesForEllipsisQuickDirect === 'function'
        ? core.collectCuesForEllipsisQuickDirect(src, out, { maxCount, shouldSkip })
        : [];
    if (!todo.length) return { cues: out, filled: 0, attemptedIndexes: [], failedIndexes: [] };

    send?.({
        phase: 'chunk-retry',
        detail: `省略号直译扫尾 ${todo.length} 条…`,
        percent: 99,
        pct: 99,
    });

    const byOut = new Map(out.map((u) => [Number(u.index), String(u?.text ?? '')]));
    let filled = 0;
    const attemptedIndexes = [];
    const failedIndexes = [];
    // Serial 1-cue: batching neighboring blanks still collapsed to「…」on Murasaki.
    // Carry previous JA/ZH like the main Script path / editor retranslate.
    const windowSize = 1;
    const batches = [];
    for (let i = 0; i < todo.length; i += windowSize) {
        batches.push(todo.slice(i, i + windowSize));
    }
    const resolvePrevForBatch = (batch) => {
        if (!isMurasakiQuick || typeof murasakiCore.buildMurasakiPreviousContext !== 'function') {
            return {};
        }
        return murasakiCore.buildMurasakiPreviousContext({
            sourceCues: src,
            translatedByIndex: byOut,
            currentChunkCues: batch,
            maxLines: 2,
        });
    };
    const acceptQuickText = (cue, raw) => {
        let text = String(raw ?? '');
        if (typeof tgCore.finalizeTranslateGemmaCue === 'function') {
            text = tgCore.finalizeTranslateGemmaCue(cue.text, text);
        }
        if (isMurasakiQuick && typeof murasakiCore.finalizeMurasakiCue === 'function') {
            text = murasakiCore.finalizeMurasakiCue(cue.text, text);
        }
        const unusable = isMurasakiQuick && murasakiCore.isMurasakiUnusableZh?.(text);
        if (unusable || (typeof core.isLiteralBlankTranslation === 'function'
            ? core.isLiteralBlankTranslation(text)
            : !String(text || '').trim())) {
            return '';
        }
        return text;
    };
    for (const batch of batches) {
        if (signal?.aborted || batchCtx?.signal?.aborted) break;
        for (const cue of batch) {
            const idx = Number(cue.index);
            if (Number.isInteger(idx)) attemptedIndexes.push(idx);
        }
        const prevCtx = resolvePrevForBatch(batch);
        const one = await translateCueBatch(batch, {
            ...batchCtx,
            ...prevCtx,
            // HyMT still uses blank-retry short; Murasaki uses Script (via
            // _ellipsisQuickDirect) — same shape as editor batch retranslate.
            _blankRetry: promptFamily === 'hymt',
            _lineAlignFallback: promptFamily === 'hymt',
            _skipBlankRetry: true,
            _skipMtSanitize: true,
            _ellipsisQuickDirect: true,
            _ellipsisHardFail: isMurasakiQuick || promptFamily === 'hymt',
            murasakiPreset: isMurasakiQuick ? 'script' : batchCtx?.murasakiPreset,
            hyMtMinimalPrompt: promptFamily === 'hymt',
            maxTokens: Math.max(
                96,
                isMurasakiQuick
                    ? (murasakiCore.estimateMaxTokens?.(batch, {
                        ...batchCtx,
                        _ellipsisQuickDirect: true,
                        murasakiPreset: 'script',
                    }) || 160)
                    : (core.estimateMaxTokens?.(batch) || (64 * Math.max(1, batch.length))),
            ),
        });
        if (!one?.ok) {
            for (const cue of batch) {
                const idx = Number(cue.index);
                if (Number.isInteger(idx)) failedIndexes.push(idx);
            }
            continue;
        }
        for (const cue of batch) {
            const idx = Number(cue.index);
            const hit = (one.cues || []).find((u) => Number(u.index) === Number(cue.index));
            let text = acceptQuickText(cue, hit ? hit.text : '');
            // One salvage like editor: short collapse → Script with prev again
            // (explicit preset; slightly cooler) if first return was blank.
            if (!text && isMurasakiQuick && !signal?.aborted && !batchCtx?.signal?.aborted) {
                const salvage = await translateCueBatch([cue], {
                    ...batchCtx,
                    ...resolvePrevForBatch([cue]),
                    _ellipsisQuickDirect: true,
                    _skipBlankRetry: true,
                    _skipMtSanitize: true,
                    _ellipsisHardFail: true,
                    murasakiPreset: 'script',
                    enableThinking: false,
                    maxTokens: Math.max(
                        96,
                        murasakiCore.estimateMaxTokens?.([cue], {
                            ...batchCtx,
                            _ellipsisQuickDirect: true,
                            murasakiPreset: 'script',
                        }) || 160,
                    ),
                });
                const hit2 = (salvage?.cues || []).find((u) => Number(u.index) === Number(cue.index));
                text = acceptQuickText(cue, hit2 ? hit2.text : '');
            }
            if (!text) {
                if (Number.isInteger(idx)) failedIndexes.push(idx);
                continue;
            }
            byOut.set(Number(cue.index), text);
            filled += 1;
        }
    }
    send?.({
        phase: 'chunk-retry',
        detail: filled
            ? `省略号直译扫尾完成 ${filled}/${todo.length}`
            : `省略号直译扫尾无进展（${todo.length} 条仍为省略号）`,
        percent: 99,
        pct: 99,
        quickDirectFilled: filled,
        quickDirectAttempted: todo.length,
    });
    if (!filled) return { cues: out, filled: 0, attemptedIndexes, failedIndexes };

    out = src.map((c) => {
        const idx = Number(c.index);
        return {
            index: Number.isInteger(idx) ? idx : c.index,
            startMs: c.startMs,
            endMs: c.endMs,
            text: byOut.has(idx) ? byOut.get(idx) : '',
        };
    });
    return { cues: out, filled, attemptedIndexes, failedIndexes };
}

/**
 * @param {object} payload
 * @param {Array} payload.cues
 * @param {string} [payload.modelId]
 * @param {object} [payload.glossary]
 * @param {function} [payload.onProgress]
 * @param {AbortSignal} [payload.signal]
 */
async function runSakuraTranslate(payload = {}) {
    const computeLock = require('./compute-task-lock');
    return computeLock.runWithComputeLockUnlessNested({
        kind: 'sakura_translate',
        owner: '推理翻译',
        source: 'runSakuraTranslate',
    }, payload, () => runSakuraTranslateBody(payload));
}

/**
 * Share Pro TDP D01 (+ ASR name-loop strip) with Sakura before inference.
 * Engine external-MT already preprocesses; standalone/editor Sakura needs this too.
 */
function preprocessCuesForSakura(cues) {
    let list = Array.isArray(cues) ? cues : [];
    try {
        const jaNames = require('../src/js/ja-person-names-core');
        if (typeof jaNames.stripAsrHallucinationLoopsInCues === 'function') {
            list = jaNames.stripAsrHallucinationLoopsInCues(list).cues;
        }
    } catch { /* optional */ }
    try {
        const mtSanitize = require('../src/js/mt-sanitize-core');
        if (typeof mtSanitize.correctJaAsrDomainMishearsInCues === 'function') {
            list = mtSanitize.correctJaAsrDomainMishearsInCues(list).cues;
        }
    } catch { /* optional */ }
    return list;
}

async function runSakuraTranslateBody(payload = {}) {
    const p = enrichSakuraNsfwOptions(asPlainObject(payload));
    try {
        const mtRoute = require('../src/js/mt-target-route-core');
        const route = mtRoute.resolveMtTargetRoute(p);
        if (!route.isZhTarget) {
            const modelId = String(p.modelId || p.engineMtModel || '').trim();
            // Sakura / Gal are JA→ZH; Hy-MT2 is multilingual→ZH only — not for intl 成片.
            if (!modelId || mtRoute.isSakuraOrGalMtId(modelId)) {
                return {
                    ok: false,
                    error: route.reason
                        || '非中文成片请改用智能翻译或通用推理模型（Hy-MT2 / Sakura 等仅支持译入中文）',
                    code: 'intl_target_unsupported',
                    cues: [],
                };
            }
        }
    } catch { /* optional */ }
    const allCues = p._skipJaPreprocess
        ? core.normalizeCueList(p.cues)
        : preprocessCuesForSakura(core.normalizeCueList(p.cues));
    if (!allCues.length) {
        return { ok: true, cues: [], skipped: true, summary: '无字幕条目' };
    }

    // Never send software-credit lines to the LLM — prefill localized credit instead.
    // Otherwise Hy-MT invents dialogue on EN credit and any positional merge shifts ZH.
    let creditPrefill = [];
    let creditPrefixes = [];
    let cues = allCues;
    try {
        const creditCore = require('../src/js/subtitle-software-credit-core');
        if (typeof creditCore.partitionMtCuesSkippingSoftwareCredit === 'function') {
            let creditLang = 'zh';
            try {
                const tgt = require('../src/js/subtitle-target-lang-core');
                const lang = tgt.resolveSubtitleTargetLang(p);
                creditLang = creditCore.normalizeCreditLang(lang) || 'zh';
            } catch { /* default zh */ }
            const parted = creditCore.partitionMtCuesSkippingSoftwareCredit(allCues, {
                isPro: /Transub\s*Pro/i.test(allCues.map((c) => c.text).join('\n')),
                lang: creditLang,
            });
            creditPrefill = parted.prefilled || [];
            creditPrefixes = Array.isArray(parted.creditPrefixes) ? parted.creditPrefixes : [];
            cues = parted.mtCues || allCues;
        }
    } catch { /* optional */ }

    if (!cues.length && creditPrefill.length) {
        return {
            ok: true,
            cues: allCues.map((c) => {
                const idx = Number(c.index);
                const hit = creditPrefill.find((u) => Number(u.index) === idx);
                return {
                    index: Number.isInteger(idx) ? idx : c.index,
                    startMs: c.startMs,
                    endMs: c.endMs,
                    text: hit ? String(hit.text ?? '') : '',
                };
            }),
            summary: `软件信息 ${creditPrefill.length} 条（跳过模型）`,
            stats: { softwareCreditPrefill: creditPrefill.length },
        };
    }

    let modelId = asString(p.modelId || sakuraMt.DEFAULT_MODEL_ID, 128).trim();
    // Soft-AV Hy-MT: prefer a larger installed sibling when VRAM allows (escape: preferLargerHyMt=false).
    if (hymtCore.isHyMtModel?.(modelId) && typeof hymtCore.maybeUpgradeHyMtModelId === 'function') {
        try {
            const llmFs = require('./advanced-llm-fs');
            const installed = [];
            for (const entry of sakuraCatalog.listCatalog?.() || []) {
                if (llmFs.isModelInstalled?.(entry)) installed.push(entry.id);
            }
            const upgraded = hymtCore.maybeUpgradeHyMtModelId(modelId, installed, {
                contentProfile: p.contentProfile || p.senseProfile,
                senseProfile: p.senseProfile || p.contentProfile,
                vramGb: p.vramGb ?? p.vramGB,
                preferLargerHyMt: p.preferLargerHyMt,
            });
            if (upgraded && upgraded !== modelId) modelId = upgraded;
        } catch { /* keep original */ }
    }
    const engineExternalMt = !!p._engineExternalMt;
    const send = (info) => {
        if (typeof p.onProgress === 'function') {
            try { p.onProgress(info); } catch (_) { /* ignore */ }
        }
    };

    let endpoint = { ok: true, apiKey: 'local', baseUrl: '', model: modelId, source: 'mock' };
    let promptFamily = sakuraCatalog.resolvePromptFamily(modelId);
    let chunkProgressLabel = sakuraCatalog.mtChunkProgressLabel(modelId, { engineExternalMt });
    let doneSummaryLabel = sakuraCatalog.mtDoneSummaryLabel(modelId, { engineExternalMt });
    const dryRun = !!p.dryRun || isMockMode();

    // Per-chunk timeout: keep batch responsive; full-job 180s was masking runaway generation.
    // Engine external MT / Murasaki / long tracks get more headroom before half-window recovery.
    const trackSpanMsEarly = longTrackPolicy.resolveTrackSpanMs(
        Array.isArray(p.cues) ? p.cues : [],
    );
    const trackCueCountEarly = Array.isArray(p.cues) ? p.cues.length : 0;
    const chunkTimeoutFallback = longTrackPolicy.resolveLongTrackChunkTimeoutMs({
        engineExternalMt: !!p._engineExternalMt,
        murasaki: sakuraCatalog.resolvePromptFamily(modelId) === 'murasaki',
        cueCount: trackCueCountEarly,
        spanMs: trackSpanMsEarly,
        timeoutMs: p.timeoutMs,
    });
    const chunkTimeoutMs = asNumber(p.timeoutMs, {
        min: 15000,
        max: 300000,
        fallback: chunkTimeoutFallback,
    });

    let engineUrl = '';
    if (p._engineExternalMt) {
        try {
            const { loadSettings } = require('./settings-data');
            engineUrl = String(loadSettings()?.options?.engineUrl || '').trim();
            if (!engineUrl) {
                engineUrl = String(require('./engine-options').DEFAULT_ENGINE_URL || '').trim();
            }
        } catch { /* ignore */ }
    }

    try {
        if (!dryRun) {
            const fam = sakuraCatalog.resolvePromptFamily?.(modelId);
            const hyOpts = fam === 'hymt' || hymtCore.isHyMtModel(modelId)
                ? hymtCore.resolveHyMtInferenceOptions(p)
                : null;
            const hunyuanOpts = fam === 'hunyuan' || hymtCore.isHunyuanMtModel?.(modelId)
                ? hymtCore.resolveHunyuanMtInferenceOptions?.(p)
                : null;
            const tgOpts = fam === 'translategemma' || fam === 'translategemmasub'
                || tgCore.isTranslateGemmaModel(modelId)
                ? tgCore.resolveTranslateGemmaInferenceOptions({ ...p, modelId, promptFamily: fam })
                : null;
            const murasakiOpts = fam === 'murasaki' || murasakiCore.isMurasakiModel?.(modelId)
                ? murasakiCore.resolveMurasakiInferenceOptions({ ...p, modelId })
                : null;
            const orionOpts = fam === 'orion' || orionCore.isOrionModel?.(modelId)
                ? orionCore.resolveOrionInferenceOptions(p)
                : null;
            const indexOpts = fam === 'index' || indexCore.isIndexTranslateModel?.(modelId)
                ? indexCore.resolveIndexInferenceOptions(p)
                : null;
            endpoint = await resolveSentenceMtEndpoint({
                modelId,
                translateMode: p.translateMode || p.options?.translateMode,
                onProgress: send,
                signal: p.signal,
                // Engine external MT already calls release_gpu (pre_mt) before POSTing batches.
                afterAsr: !!p.afterAsr,
                engineUrl,
                contextSize: hyOpts?.contextSize
                    || hunyuanOpts?.contextSize
                    || indexOpts?.contextSize
                    || tgOpts?.contextSize
                    || murasakiOpts?.contextSize
                    || orionOpts?.contextSize,
            });
            if (!endpoint.ok) return endpoint;
            promptFamily = resolveSentenceMtPromptFamily(modelId, endpoint);
            chunkProgressLabel = sakuraCatalog.mtChunkProgressLabel(modelId, { engineExternalMt });
            doneSummaryLabel = sakuraCatalog.mtDoneSummaryLabel(modelId, { engineExternalMt });
            if (endpoint.source === 'byok' || endpoint.source === 'station') {
                const host = endpoint.hostHint || byokHostHint(endpoint.baseUrl);
                const label = endpoint.source === 'station' ? 'Station' : 'BYOK';
                send({
                    phase: 'translate',
                    detail: host
                        ? `外部翻译：${label} · ${endpoint.model || ''} @ ${host}`
                        : `外部翻译：${label} · ${endpoint.model || ''}`,
                    percent: 0,
                    pct: 0,
                    llmSource: endpoint.source,
                    byokModel: endpoint.model || '',
                    byokHost: host,
                });
            } else {
                const serverNgl = llamaServer.getServerState?.()?.nGpuLayers;
                const nglRaw = endpoint.nGpuLayers ?? serverNgl;
                const ngl = Number(nglRaw);
                if (Number.isFinite(ngl) && ngl <= 0) {
                    send({
                        phase: 'translate',
                        detail: '推理翻译在 CPU 上运行（显存占用低、内存会升高）；若本机有 NVIDIA GPU，请检查 llama-server CUDA 运行时与环境检测',
                        percent: 0,
                        pct: 0,
                        computeBackend: 'cpu',
                    });
                } else if (Number.isFinite(ngl) && ngl > 0) {
                    send({
                        phase: 'translate',
                        detail: `本地推理已启用 GPU（ngl=${ngl}）`,
                        percent: 0,
                        pct: 0,
                        computeBackend: 'cuda',
                        nGpuLayers: ngl,
                    });
                }
            }
        }
        const glossaryTerms = extractGlossaryTerms(p.glossary);
        try {
            const richApi = require('../src/js/sensevoice-rich-tags-core');
            const subPath = String(p.sourceSubtitlePath || p.subtitlePath || '').trim();
            if (subPath && richApi.richTagsEnabled(p.sensevoiceRichTags)) {
                const { readSubtitleMeta } = require('./subtitle-meta');
                const doc = readSubtitleMeta(subPath);
                if (Array.isArray(doc?.meta?.entries) && doc.meta.entries.length) {
                    cues = richApi.attachRichFromSidecarEntries(cues, doc.meta.entries, p);
                }
            }
        } catch { /* optional */ }
        const nsfwOn = core.shouldUseNsfwPrompt(p);
        const isHyMtRun = sakuraCatalog.resolvePromptFamily?.(modelId) === 'hymt'
            || hymtCore.isHyMtModel(modelId);
        const isIndexRun = sakuraCatalog.resolvePromptFamily?.(modelId) === 'index'
            || indexCore.isIndexTranslateModel?.(modelId);
        const isTgSubRun = sakuraCatalog.resolvePromptFamily?.(modelId) === 'translategemmasub'
            || tgCore.isTranslateGemmaSubModel?.(modelId);
        const isTgRun = isTgSubRun
            || sakuraCatalog.resolvePromptFamily?.(modelId) === 'translategemma'
            || tgCore.isTranslateGemmaOfficialModel?.(modelId)
            || tgCore.isTranslateGemmaModel?.(modelId);
        // Blank-retry inputs are sparse/non-adjacent — packing them into one GalTransl
        // chat caused empty zip + whole-track 对位审计 mass-clear storms. Force 1 there.
        // Main pass: GalTransl/Sakura default to multi-line windows (core DEFAULT=8);
        // Hy-MT uses numbered multi-cue windows (resolveHyMtWindowLines); Index/TG stay 1.
        const isGalOrSakuraFamily = promptFamily === 'galtransl'
            || promptFamily === 'sakura'
            || promptFamily === 'murasaki';
        let windowLines = 1;
        if (p._blankRetry) {
            windowLines = 1;
        } else if (Number.isFinite(Number(p.windowLines)) && Number(p.windowLines) > 0) {
            windowLines = Math.max(1, Math.min(20, Math.round(Number(p.windowLines))));
        } else if (isHyMtRun) {
            windowLines = hymtCore.resolveHyMtWindowLines?.({
                ...p,
                modelId,
                promptFamily,
            }) || hymtCore.HYMT_WINDOW_LINES_DEFAULT || 3;
        } else if (promptFamily === 'murasaki') {
            windowLines = murasakiCore.resolveMurasakiInferenceOptions({ ...p, modelId }).windowLines || 6;
        } else if (promptFamily === 'orion') {
            windowLines = orionCore.resolveOrionInferenceOptions(p).windowLines || 6;
        } else if (isGalOrSakuraFamily && !isIndexRun && !isTgRun) {
            windowLines = core.DEFAULT_WINDOW_LINES || 8;
        }
        // Soft-AV: tighten multi-cue reasoning windows (watchability / less scramble).
        windowLines = softViewing.resolveAvSoftMtWindowLines({
            promptFamily,
            windowLines,
            options: p,
        });
        const chunks = core.chunkCues(cues, { windowLines });
        // Engine external MT uses 0-based cue ids; shift for human "第 N 条".
        const cueRangeOpts = p._engineExternalMt ? { oneBasedDisplay: true } : {};
        const cueRangeOf = (chunkCues) => core.formatCueOrdinalRange(chunkCues, cueRangeOpts);
        const batchCtx = {
            apiKey: endpoint.apiKey,
            baseUrl: endpoint.baseUrl,
            model: endpoint.model,
            modelId,
            promptFamily,
            glossaryTerms,
            glossary: p.glossary,
            glossaryPromptInjectMode: p.glossaryPromptInjectMode,
            glossaryAlwaysCharacterMax: p.glossaryAlwaysCharacterMax,
            sensevoiceRichTags: p.sensevoiceRichTags,
            sensevoiceEmotionMtStyle: p.sensevoiceEmotionMtStyle,
            nameMap: p.nameMap,
            sakuraNsfwPrompt: p.sakuraNsfwPrompt,
            nsfwPrompt: p.nsfwPrompt,
            contentProfile: p.contentProfile || p.senseProfile,
            senseProfile: p.senseProfile || p.contentProfile,
            faithfulTone: p.faithfulTone || p.smartTranslateFaithfulTone,
            smartTranslateFaithfulTone: p.smartTranslateFaithfulTone || p.faithfulTone,
            translateStylePreset: p.translateStylePreset,
            translateStyleCustomNote: p.translateStyleCustomNote,
            applyNsfwLexicon: p.applyNsfwLexicon,
            avGlossary: p.avGlossary,
            avActorGlossary: p.avActorGlossary,
            avDomainGlossary: p.avDomainGlossary,
            nsfwLexicon: p.nsfwLexicon,
            presetId: p.presetId || p.activePresetId,
            castNames: Array.isArray(p.castNames) ? p.castNames : [],
            timeoutMs: chunkTimeoutMs,
            signal: p.signal,
            dryRun,
            skipFakeGreeting: p.skipFakeGreeting === true,
            chineseSubtitleVariant: p.chineseSubtitleVariant,
            subtitleTargetLang: p.subtitleTargetLang,
            targetLang: p.targetLang || p.subtitleTargetLang,
            targetLanguage: p.targetLanguage,
            language: p.language || p.sourceLanguage,
            sourceLanguage: p.sourceLanguage || p.language,
            translateGemmaPromptMode: p.translateGemmaPromptMode,
            translateGemmaSubStyle: p.translateGemmaSubStyle,
            perfProfile: p.perfProfile,
            hyMtBlankRetryBatch: p.hyMtBlankRetryBatch,
            blankRetryBatchSize: p.blankRetryBatchSize,
            _skipMtSanitize: !!p._skipMtSanitize,
            _skipBlankRetry: !!p._skipBlankRetry,
            _ellipsisQuickDirect: !!p._ellipsisQuickDirect,
            murasakiPreset: p.murasakiPreset,
            enableThinking: p.enableThinking,
        };
        if (nsfwOn) {
            const promptHint = promptFamily === 'galtransl'
                ? 'GalTransl 提示词已启用'
                : promptFamily === 'murasaki'
                    ? 'Murasaki 剧本模式提示词已启用'
                    : promptFamily === 'orion'
                    ? 'Orion JSONLINE 提示词已启用'
                    : promptFamily === 'hymt'
                    ? 'Hy-MT2 提示词已启用'
                    : promptFamily === 'hunyuan'
                        ? 'Hunyuan MT 提示词已启用'
                        : promptFamily === 'translategemmasub'
                            ? 'Translate Gemma Sub 提示词已启用'
                            : promptFamily === 'translategemma'
                                ? 'TranslateGemma 提示词已启用'
                                : '推理翻译提示词已启用';
            send({
                phase: 'translate',
                detail: promptHint,
                percent: 0,
                pct: 0,
            });
        }
        const updates = [];
        let blankRetried = 0;
        let blankLeft = 0;
        let qualityRetried = 0;
        let murasakiGlossaryRetried = 0;
        let murasakiRepetitionRetried = 0;
        /** Indexes that already received in-chunk blank / quality / align LLM retry. */
        const blankAttemptedIndexes = new Set();
        const isMurasakiRun = promptFamily === 'murasaki'
            || murasakiCore.isMurasakiModel?.(modelId);
        /** GalTransl blank-retry budget; Murasaki shares one budget across blank+glossary+rep. */
        const galBlankRetryBudget = promptFamily === 'galtransl'
            ? Math.max(16, Math.min(48, Math.ceil(allCues.length * 0.05)))
            : (isMurasakiRun && typeof murasakiCore.resolveMurasakiRetryBudget === 'function'
                ? murasakiCore.resolveMurasakiRetryBudget(allCues.length)
                : (promptFamily === 'murasaki'
                    ? Math.max(48, Math.min(160, Math.ceil(allCues.length * 0.14)))
                    : 0));
        let galBlankRetryUsed = 0;
        const startedAt = Date.now();
        // Soft Hy-MT + parallel slots on 12GB often truncates / blanks whole windows.
        // Murasaki Script Mode shows the same pattern: parallel×2 → missing lines →
        // 「有 N 条空白」storm (XVSR-898). Prefer serial; wall-clock still wins via window=6.
        // Translate Gemma Sub needs serial chunks so PREVIOUS_TRANSLATION is available.
        const softHyMt = isHyMtRun && !!hymtCore.shouldUseSoftHyMtPrompt?.(p);
        const preferTgSubSerial = isTgSubRun
            || !!tgCore.resolveTranslateGemmaInferenceOptions?.({ modelId })?.preferSerialChunks;
        const preferMurasakiSerial = isMurasakiRun && p.preferParallelChunks !== true;
        const clientConcurrency = (softHyMt || preferTgSubSerial || preferMurasakiSerial)
            ? 1
            : resolveSakuraClientConcurrency(endpoint);
        let completedChunks = 0;
        /** Running cue translations for TG Sub / Murasaki / Hy-MT previous-context prompts. */
        const translatedByIndex = new Map();
        let hyMtRollingState = isHyMtRun && typeof hymtCore.emptyHyMtRollingState === 'function'
            ? hymtCore.emptyHyMtRollingState()
            : { addresses: [], names: [] };
        // Ellipsis / subset retranslate: prev lines must come from the full track,
        // not only the blank todo list (otherwise Script has no real neighbors).
        const murasakiContextSourceCues = (
            Array.isArray(p.contextSourceCues) && p.contextSourceCues.length
                ? p.contextSourceCues
                : allCues
        );
        const hyMtContextSourceCues = murasakiContextSourceCues;
        if (Array.isArray(p.contextTranslatedCues) && p.contextTranslatedCues.length) {
            for (const u of p.contextTranslatedCues) {
                const idx = Number(u?.index);
                if (!Number.isInteger(idx)) continue;
                const t = String(u?.text ?? '');
                if (!t.trim()) continue;
                if (isMurasakiRun && murasakiCore.isMurasakiUnusableZh?.(t)) continue;
                translatedByIndex.set(idx, t);
            }
        }

        const resolveTgSubPrevCtx = (chunkCuesList) => {
            if (!isTgSubRun || !tgCore.buildPreviousContextFromCues) return {};
            return tgCore.buildPreviousContextFromCues({
                sourceCues: Array.isArray(p.contextSourceCues) && p.contextSourceCues.length
                    ? p.contextSourceCues
                    : cues,
                translatedByIndex,
                currentChunkCues: chunkCuesList,
            });
        };

        const resolveMurasakiPrevCtx = (chunkCuesList) => {
            if (!isMurasakiRun || !murasakiCore.buildMurasakiPreviousContext) return {};
            return murasakiCore.buildMurasakiPreviousContext({
                sourceCues: murasakiContextSourceCues,
                translatedByIndex,
                currentChunkCues: chunkCuesList,
                maxLines: 2,
            });
        };

        const resolveHyMtPrevCtx = (chunkCuesList) => {
            if (!isHyMtRun || typeof hymtCore.buildHyMtPreviousContext !== 'function') return {};
            const prev = hymtCore.buildHyMtPreviousContext({
                sourceCues: hyMtContextSourceCues,
                translatedByIndex,
                currentChunkCues: chunkCuesList,
                // Multi-cue windows: keep 2 prior lines for continuity (fragile-short still strips ZH).
                maxLines: windowLines > 1 ? 2 : 1,
            });
            const joined = (chunkCuesList || []).map((c) => String(c?.text || '')).join('\n');
            const stateHint = typeof hymtCore.formatHyMtStateHint === 'function'
                ? hymtCore.formatHyMtStateHint(hyMtRollingState, joined)
                : '';
            return {
                ...prev,
                hyMtRollingState,
                hyMtStateHint: stateHint || undefined,
            };
        };

        const processChunkIndex = async (i) => {
            if (p.signal?.aborted || (typeof p.shouldStop === 'function' && p.shouldStop())) {
                return { ok: false, error: '已取消', code: 'cancelled', modelId };
            }
            const chunkCues = chunks[i];
            const rangeLabel = cueRangeOf(chunkCues);
            const rangeSuffix = rangeLabel ? ` · ${rangeLabel}` : '';
            const rangeParen = rangeLabel ? `（${rangeLabel}）` : '';
            const pctStart = Math.round((completedChunks / Math.max(1, chunks.length)) * 100);
            send({
                phase: 'translate',
                detail: `${chunkProgressLabel} ${i + 1}/${chunks.length}${rangeSuffix}（推理中…）`,
                percent: pctStart,
                pct: pctStart,
                chunk: i + 1,
                total: chunks.length,
                cueFrom: chunkCues[0]?.index,
                cueTo: chunkCues[chunkCues.length - 1]?.index,
                cueCount: chunkCues.length,
                elapsedMs: Date.now() - startedAt,
            });

            const tgPrevCtx = resolveTgSubPrevCtx(chunkCues);
            const muraPrevCtx = resolveMurasakiPrevCtx(chunkCues);
            const hyPrevCtx = resolveHyMtPrevCtx(chunkCues);
            let batch = await translateCueBatch(chunkCues, {
                ...batchCtx,
                ...tgPrevCtx,
                ...muraPrevCtx,
                ...hyPrevCtx,
                glossaryPromptInjectMode: isMurasakiRun
                    ? 'hitOnly'
                    : batchCtx.glossaryPromptInjectMode,
            });
            const batchErr = String(batch?.error || '');
            const isUserCancel = !!(
                p.signal?.aborted
                || (typeof p.shouldStop === 'function' && p.shouldStop())
                || batch?.code === 'cancelled'
                || (batch?.code === 'aborted' && /已取消/.test(batchErr) && !/超时/.test(batchErr))
            );
            if (isUserCancel) {
                return { ok: false, error: '已取消', code: 'cancelled', modelId };
            }
            const isTimeout = !!(
                batch?.code === 'timeout'
                || /超时/.test(batchErr)
                || batch?.code === 'aborted'
            );
            const isLoadTransient = !!(
                /Loading model/i.test(batchErr)
                || /连接被重置|ECONNRESET|socket hang up|ECONNREFUSED/i.test(batchErr)
                || batch?.code === 'connection_reset'
                || batch?.code === 'server_unavailable'
            );
            if (!batch.ok && (isTimeout || isLoadTransient)) {
                await tryReleaseLlamaSlots(endpoint.baseUrl);
                send({
                    phase: 'chunk-retry',
                    detail: isTimeout
                        ? `第 ${i + 1} 块${rangeParen}超时，释放槽位后重试…`
                        : `第 ${i + 1} 块${rangeParen}失败（${batch.error || '服务未就绪'}），等待本地模型就绪后重试…`,
                    percent: pctStart,
                    pct: pctStart,
                    chunk: i + 1,
                    total: chunks.length,
                });
                if (p.signal?.aborted) {
                    return { ok: false, error: '已取消', code: 'cancelled', modelId };
                }
                // Cold-load / OOM restart: re-ensure endpoint before retrying the chunk.
                // BYOK remotes have no local ensure — just brief backoff then retry.
                if (isLoadTransient && !dryRun) {
                    if (endpoint.source === 'byok' || endpoint.source === 'station') {
                        await sleep(800);
                    } else {
                        const hyOpts = isHyMtRun ? hymtCore.resolveHyMtInferenceOptions(p) : null;
                        const restarted = await resolveSentenceMtEndpoint({
                            modelId,
                            translateMode: p.translateMode || p.options?.translateMode,
                            onProgress: send,
                            signal: p.signal,
                            afterAsr: !!p.afterAsr,
                            engineUrl,
                            contextSize: hyOpts?.contextSize,
                        });
                        if (restarted?.ok) {
                            endpoint = restarted;
                            batchCtx.apiKey = restarted.apiKey;
                            batchCtx.baseUrl = restarted.baseUrl;
                            batchCtx.model = restarted.model;
                        } else {
                            await sleep(800);
                        }
                    }
                } else {
                    await sleep(200);
                }
                batch = await translateCueBatch(chunkCues, {
                    ...batchCtx,
                    ...tgPrevCtx,
                    ...muraPrevCtx,
                    ...hyPrevCtx,
                });
                if (p.signal?.aborted || batch?.code === 'cancelled') {
                    return { ok: false, error: '已取消', code: 'cancelled', modelId };
                }
            } else if (!batch.ok) {
                send({
                    phase: 'chunk-retry',
                    detail: `第 ${i + 1} 块${rangeParen}失败（${batch.error || '空结果'}），自动重试…`,
                    percent: pctStart,
                    pct: pctStart,
                    chunk: i + 1,
                    total: chunks.length,
                });
                if (p.signal?.aborted) {
                    return { ok: false, error: '已取消', code: 'cancelled', modelId };
                }
                batch = await translateCueBatch(chunkCues, {
                    ...batchCtx,
                    ...tgPrevCtx,
                    ...muraPrevCtx,
                    ...hyPrevCtx,
                });
                if (p.signal?.aborted || batch?.code === 'cancelled') {
                    return { ok: false, error: '已取消', code: 'cancelled', modelId };
                }
            }

            // Multi-cue window still failing → half-window then per-cue (avoid blank bands).
            if (
                !batch.ok
                && longTrackPolicy.shouldAttemptChunkSplitRecovery(chunkCues, {
                    aborted: !!(p.signal?.aborted),
                })
            ) {
                const recovered = await recoverSakuraChunkAfterFailure({
                    chunkCues,
                    batchCtx: { ...batchCtx, ...tgPrevCtx, ...muraPrevCtx, ...hyPrevCtx },
                    translateCueBatch,
                    priorBatch: batch,
                    send,
                    signal: p.signal,
                    rangeParen,
                    chunkIndex1Based: i + 1,
                    totalChunks: chunks.length,
                    pctStart,
                });
                if (recovered?.code === 'cancelled' || p.signal?.aborted) {
                    return { ok: false, error: '已取消', code: 'cancelled', modelId };
                }
                if (recovered?.ok) batch = recovered;
            }

            if (!batch.ok) {
                return {
                    ok: false,
                    error: batch.error || `第 ${i + 1} 块${rangeParen}翻译失败`,
                    code: batch.code,
                    modelId,
                    cueCount: chunkCues.length,
                    cueFrom: chunkCues[0]?.index,
                    cueTo: chunkCues[chunkCues.length - 1]?.index,
                };
            }

            let chunkUpdates = Array.isArray(batch.cues) ? batch.cues : [];
            let localBlankRetried = 0;
            let localBlankLeft = 0;
            if (typeof tgCore.finalizeTranslateGemmaCue === 'function') {
                chunkUpdates = chunkCues.map((c) => {
                    const hit = (chunkUpdates || []).find((u) => Number(u.index) === Number(c.index));
                    return {
                        index: c.index,
                        text: tgCore.finalizeTranslateGemmaCue(c.text, hit?.text ?? ''),
                    };
                });
            }
            // GalTransl / Murasaki: only literal empty/ellipsis — invent heuristics as
            // "blank" burned dozens of 1-cue retries per film (XVSR-898 ~9min).
            const blankIndexesRaw = ((promptFamily === 'galtransl' || isMurasakiRun)
                && typeof core.collectLiteralBlankTranslationIndexes === 'function')
                ? core.collectLiteralBlankTranslationIndexes(chunkCues, chunkUpdates)
                : core.collectBlankTranslationIndexes(chunkCues, chunkUpdates);
            let blankIndexes = (blankIndexesRaw || []).filter(
                (idx) => !blankAttemptedIndexes.has(Number(idx)),
            );
            if ((promptFamily === 'galtransl' || isMurasakiRun) && galBlankRetryBudget > 0) {
                const remain = Math.max(0, galBlankRetryBudget - galBlankRetryUsed);
                if (remain <= 0) blankIndexes = [];
                else if (blankIndexes.length > remain) blankIndexes = blankIndexes.slice(0, remain);
            }
            if (blankIndexes.length && !p.signal?.aborted && !p._skipBlankRetry) {
                for (const idx of blankIndexes) blankAttemptedIndexes.add(Number(idx));
                if (promptFamily === 'galtransl' || isMurasakiRun) {
                    galBlankRetryUsed += blankIndexes.length;
                }
                const blankSet = new Set(blankIndexes);
                let blankSourceCues = chunkCues.filter((c) => blankSet.has(c.index));
                if (isHyMtRun) {
                    try {
                        const ellipsisPolicy = require('../src/js/hymt-ellipsis-policy-core');
                        blankSourceCues = blankSourceCues.filter((c) => {
                            const zh = (chunkUpdates || []).find((u) => Number(u.index) === Number(c.index));
                            const plan = ellipsisPolicy.planEllipsisSlotAction?.(
                                c.text,
                                zh?.text ?? '',
                                {},
                            );
                            return plan?.action !== 'delete';
                        });
                    } catch { /* optional */ }
                }
                const map = new Map(
                    chunkUpdates.map((u) => [Number(u.index), String(u.text ?? '')]),
                );
                // Clear blank slots so failed retries cannot keep first-pass … / identity.
                for (const idx of blankIndexes) map.set(Number(idx), '');

                const partitioned = isHyMtRun && hymtCore.partitionBlankRetryCues
                    ? hymtCore.partitionBlankRetryCues(blankSourceCues, batchCtx)
                    : { prefilled: [], retryCues: blankSourceCues, skipped: 0 };
                for (const pref of partitioned.prefilled || []) {
                    map.set(Number(pref.index), String(pref.text ?? ''));
                    localBlankRetried += 1;
                }
                const retryCues = partitioned.retryCues || blankSourceCues;
                // Hy-MT: quality uses small micro-batches (default 4); speed / override → 1.
                // Murasaki: pack literal blanks (≤ window) — serial 1-cue was a major slowdown.
                // Batch that yields 0 accepts falls back to per-cue once.
                const blankBatchSize = isHyMtRun
                    ? (hymtCore.resolveHyMtBlankRetryBatchSize?.(batchCtx) || hymtCore.HYMT_BLANK_RETRY_BATCH || 4)
                    : (isMurasakiRun
                        ? Math.max(1, Math.min(
                            6,
                            Number(batchCtx.blankRetryBatchSize) || windowLines || 3,
                        ))
                        : 1);
                const retryBatches = blankBatchSize > 1
                    ? (hymtCore.chunkBlankRetryCues
                        ? hymtCore.chunkBlankRetryCues(retryCues, blankBatchSize)
                        : (() => {
                            const outBatches = [];
                            for (let bi = 0; bi < retryCues.length; bi += blankBatchSize) {
                                outBatches.push(retryCues.slice(bi, bi + blankBatchSize));
                            }
                            return outBatches;
                        })())
                    : retryCues.map((c) => [c]);

                if (retryCues.length || partitioned.skipped) {
                    send({
                        phase: 'chunk-retry',
                        detail: `第 ${i + 1} 块${rangeParen}有 ${blankSourceCues.length} 条空白`
                            + (partitioned.skipped ? `（确定性回填 ${partitioned.skipped}）` : '')
                            + (retryCues.length ? `，分 ${retryBatches.length} 批重译…` : ''),
                        percent: pctStart,
                        pct: pctStart,
                        chunk: i + 1,
                        total: chunks.length,
                    });
                }

                for (const batchCues of retryBatches) {
                    if (p.signal?.aborted) break;
                    if (!batchCues.length) continue;
                    const rangeLabel = cueRangeOf(batchCues);
                    if (rangeLabel) {
                        send({
                            phase: 'chunk-retry',
                            detail: `空白重译 · ${rangeLabel}（推理中…）`,
                            percent: pctStart,
                            pct: pctStart,
                            chunk: i + 1,
                            total: chunks.length,
                        });
                    }
                    const acceptText = (text, src) => {
                        const t = String(text || '').trim();
                        if (!t) return '';
                        if (typeof tgCore.finalizeTranslateGemmaCue === 'function') {
                            const fin = tgCore.finalizeTranslateGemmaCue(src, t);
                            if (!fin) return '';
                            if (isHyMtRun) {
                                try {
                                    const ep = require('../src/js/hymt-ellipsis-policy-core');
                                    if (ep.isBlankZh?.(fin)) {
                                        const det = ep.deterministicEllipsisFill?.(src, batchCtx);
                                        return det || '';
                                    }
                                } catch { /* optional */ }
                                if (/^(?:\.\.\.|……|…)+$/.test(fin)) return '';
                            }
                            return fin;
                        }
                        if (isMurasakiRun) {
                            const fin = typeof murasakiCore.finalizeMurasakiCue === 'function'
                                ? murasakiCore.finalizeMurasakiCue(src, t)
                                : t;
                            if (!fin || murasakiCore.isMurasakiUnusableZh?.(fin)) return '';
                            return fin;
                        }
                        if (isHyMtRun) {
                            try {
                                const ep = require('../src/js/hymt-ellipsis-policy-core');
                                if (ep.isBlankZh?.(t)) {
                                    const det = ep.deterministicEllipsisFill?.(src, batchCtx);
                                    return det || '';
                                }
                            } catch { /* optional */ }
                            if (/^(?:\.\.\.|……|…)+$/.test(t)) return '';
                        }
                        return t;
                    };
                    const applyBatchResult = (retry, sourceBatch) => {
                        let accepted = 0;
                        if (!retry?.ok) return 0;
                        for (const u of retry.cues || []) {
                            const srcCue = sourceBatch.find((c) => Number(c.index) === Number(u.index));
                            const text = acceptText(u?.text, srcCue?.text);
                            if (!text) continue;
                            map.set(Number(u.index), text);
                            localBlankRetried += 1;
                            accepted += 1;
                        }
                        return accepted;
                    };
                    let retry = await translateCueBatch(batchCues, {
                        ...batchCtx,
                        ...resolveTgSubPrevCtx(batchCues),
                        ...resolveMurasakiPrevCtx(batchCues),
                        _blankRetry: true,
                        _ellipsisHardFail: isHyMtRun || isMurasakiRun,
                        hyMtMinimalPrompt: isHyMtRun,
                        ...(isTgRun ? {
                            faithfulTone: true,
                            smartTranslateFaithfulTone: true,
                            sakuraNsfwPrompt: true,
                            nsfwPrompt: true,
                            applyNsfwLexicon: true,
                        } : {}),
                        maxTokens: isMurasakiRun
                            ? murasakiCore.estimateMaxTokens(batchCues, batchCtx)
                            : core.estimateMaxTokens(batchCues),
                    });
                    let accepted = applyBatchResult(retry, batchCues);
                    // Micro-batch collapsed → fall back to single-cue once per remaining blank.
                    if (
                        (isHyMtRun || isMurasakiRun)
                        && batchCues.length > 1
                        && accepted === 0
                        && !p.signal?.aborted
                    ) {
                        send({
                            phase: 'chunk-retry',
                            detail: `空白重译 · 批次无进展，改逐条（${batchCues.length}）…`,
                            percent: pctStart,
                            pct: pctStart,
                            chunk: i + 1,
                            total: chunks.length,
                        });
                        for (const one of batchCues) {
                            if (p.signal?.aborted) break;
                            const oneRetry = await translateCueBatch([one], {
                                ...batchCtx,
                                ...resolveTgSubPrevCtx([one]),
                                ...resolveMurasakiPrevCtx([one]),
                                _blankRetry: true,
                                _ellipsisHardFail: true,
                                hyMtMinimalPrompt: true,
                                maxTokens: Math.max(64, core.estimateMaxTokens([one])),
                            });
                            applyBatchResult(oneRetry, [one]);
                        }
                    }
                    // Murasaki Short still blank → Script + prev (editor parity).
                    if (isMurasakiRun && !p.signal?.aborted) {
                        for (const [k, v] of map.entries()) {
                            if (v && !murasakiCore.isMurasakiUnusableZh?.(v)) {
                                translatedByIndex.set(Number(k), v);
                            }
                        }
                        for (const cue0 of batchCues) {
                            const cur = map.has(Number(cue0.index)) ? map.get(Number(cue0.index)) : '';
                            const stillBlank = !cur
                                || (typeof murasakiCore.isMurasakiUnusableZh === 'function'
                                    && murasakiCore.isMurasakiUnusableZh(cur))
                                || (typeof core.isLiteralBlankTranslation === 'function'
                                    && core.isLiteralBlankTranslation(cur));
                            if (!stillBlank) continue;
                            const scriptRetry = await translateCueBatch([cue0], {
                                ...batchCtx,
                                ...resolveMurasakiPrevCtx([cue0]),
                                _ellipsisQuickDirect: true,
                                _ellipsisHardFail: true,
                                murasakiPreset: 'script',
                                enableThinking: false,
                                maxTokens: Math.max(
                                    96,
                                    murasakiCore.estimateMaxTokens([cue0], {
                                        ...batchCtx,
                                        _ellipsisQuickDirect: true,
                                        murasakiPreset: 'script',
                                    }) || 160,
                                ),
                            });
                            applyBatchResult(scriptRetry, [cue0]);
                        }
                    }
                    // Long lexical JA still blank → second hard fail pass (single cue).
                    for (const cue0 of batchCues) {
                        if (!isHyMtRun || p.signal?.aborted) break;
                        const jl = [...String(cue0?.text || '').replace(/\s/g, '')].length;
                        if (jl < 12) continue;
                        const cur = map.has(Number(cue0.index)) ? map.get(Number(cue0.index)) : '';
                        let stillBlank = !cur;
                        try {
                            const ep = require('../src/js/hymt-ellipsis-policy-core');
                            stillBlank = ep.isBlankZh?.(cur);
                        } catch {
                            stillBlank = !cur || /^(?:\.\.\.|……|…)+$/.test(String(cur).trim());
                        }
                        if (!stillBlank) continue;
                        retry = await translateCueBatch([cue0], {
                            ...batchCtx,
                            ...resolveTgSubPrevCtx([cue0]),
                            _blankRetry: true,
                            _ellipsisHardFail: true,
                            _ellipsisHardFailLong: true,
                            hyMtMinimalPrompt: true,
                            maxTokens: Math.max(64, core.estimateMaxTokens([cue0])),
                        });
                        applyBatchResult(retry, [cue0]);
                    }
                }
                chunkUpdates = chunkCues.map((c) => ({
                    index: c.index,
                    text: map.has(c.index) ? map.get(c.index) : '',
                }));
                if (typeof tgCore.finalizeTranslateGemmaCue === 'function') {
                    chunkUpdates = chunkUpdates.map((u) => {
                        const src = chunkCues.find((c) => Number(c.index) === Number(u.index));
                        return {
                            index: u.index,
                            text: tgCore.finalizeTranslateGemmaCue(src?.text, u.text),
                        };
                    });
                }
                localBlankLeft = core.collectBlankTranslationIndexes(chunkCues, chunkUpdates).length;
            }

            // Final pass: identity / ellipsis / trailing …… (all Sakura MT families).
            if (typeof tgCore.finalizeTranslateGemmaCue === 'function') {
                chunkUpdates = chunkCues.map((c) => {
                    const hit = (chunkUpdates || []).find((u) => Number(u.index) === Number(c.index));
                    return {
                        index: c.index,
                        text: tgCore.finalizeTranslateGemmaCue(c.text, hit?.text ?? ''),
                    };
                });
            }

            // Hy-MT2: 漏翻/错翻 quality gate → single-cue re-MT (once per cue).
            let localQualityRetried = 0;
            if (
                isHyMtRun
                && !p._skipQualityRetry
                && !batchCtx._qualityRetry
                && !p.signal?.aborted
                && typeof hymtCore.collectHyMtQualityRetryIndexes === 'function'
            ) {
                const qCollect = hymtCore.collectHyMtQualityRetryIndexes(chunkCues, chunkUpdates, {
                    maxRetry: Math.max(8, chunkCues.length),
                    hyMtRollingState,
                });
                if (qCollect.indexes?.length) {
                    for (const idx of qCollect.indexes) blankAttemptedIndexes.add(Number(idx));
                    const map = new Map(
                        (chunkUpdates || []).map((u) => [Number(u.index), String(u.text ?? '')]),
                    );
                    send({
                        phase: 'chunk-retry',
                        detail: `第 ${i + 1} 块${rangeParen}质量重译 ${qCollect.indexes.length} 条（漏翻/错翻）…`,
                        percent: pctStart,
                        pct: pctStart,
                        chunk: i + 1,
                        total: chunks.length,
                    });
                    for (const idx of qCollect.indexes) {
                        if (p.signal?.aborted) break;
                        const cue = chunkCues.find((c) => Number(c.index) === Number(idx));
                        if (!cue) continue;
                        const prev = map.has(Number(idx)) ? map.get(Number(idx)) : '';
                        const qOpts = { ...batchCtx, hyMtRollingState };
                        const before = hymtCore.assessHyMtCueQuality?.(prev, cue.text, qOpts)
                            || { ok: false, reasons: [] };
                        const retry = await translateCueBatch([cue], {
                            ...batchCtx,
                            ...resolveHyMtPrevCtx([cue]),
                            _blankRetry: true,
                            _qualityRetry: true,
                            hyMtMinimalPrompt: true,
                            qualityReasons: before.reasons || [],
                            maxTokens: core.estimateMaxTokens([cue]),
                        });
                        if (!retry.ok) continue;
                        const hit = (retry.cues || []).find((u) => Number(u.index) === Number(idx));
                        const next = hit ? String(hit.text ?? '').trim() : '';
                        if (!next || /^(?:\.\.\.|……|…)+$/.test(next)) continue;
                        const after = hymtCore.assessHyMtCueQuality?.(next, cue.text, batchCtx)
                            || { ok: true, reasons: [] };
                        const improved = after.ok
                            || (after.reasons?.length || 0) < (before.reasons?.length || 99)
                            || (
                                /blank|blankish|under|under_long|echo/.test((before.reasons || []).join(','))
                                && !/^(?:\.\.\.|……|…)+$/.test(next)
                            );
                        if (improved) {
                            map.set(Number(idx), next);
                            localQualityRetried += 1;
                        }
                    }
                    if (localQualityRetried) {
                        chunkUpdates = chunkCues.map((c) => ({
                            index: c.index,
                            text: map.has(c.index) ? map.get(c.index) : '',
                        }));
                    }
                }
            }

            // Murasaki v0.3: glossary coverage + repetition → shared retry budget with blanks.
            let localGlossaryRetried = 0;
            let localRepetitionRetried = 0;
            if (
                isMurasakiRun
                && !p._skipQualityRetry
                && !batchCtx._qualityRetry
                && !batchCtx._glossaryRetry
                && !p.signal?.aborted
                && typeof murasakiCore.collectMurasakiQualityRetryIndexes === 'function'
            ) {
                const remainBudget = galBlankRetryBudget > 0
                    ? Math.max(0, galBlankRetryBudget - galBlankRetryUsed)
                    : Math.max(6, Math.min(12, chunkCues.length));
                const qCollect = murasakiCore.collectMurasakiQualityRetryIndexes(
                    chunkCues,
                    chunkUpdates,
                    {
                        ...batchCtx,
                        maxRetry: Math.min(
                            remainBudget,
                            Math.max(6, Math.min(12, chunkCues.length)),
                        ),
                    },
                );
                let qIndexes = (qCollect.indexes || []).filter(
                    (idx) => !blankAttemptedIndexes.has(Number(idx)),
                );
                if (remainBudget <= 0) qIndexes = [];
                else if (qIndexes.length > remainBudget) qIndexes = qIndexes.slice(0, remainBudget);
                if (qIndexes.length) {
                    for (const idx of qIndexes) blankAttemptedIndexes.add(Number(idx));
                    galBlankRetryUsed += qIndexes.length;
                    const map = new Map(
                        (chunkUpdates || []).map((u) => [Number(u.index), String(u.text ?? '')]),
                    );
                    send({
                        phase: 'chunk-retry',
                        detail: `第 ${i + 1} 块${rangeParen}术语/复读重译 ${qIndexes.length} 条…`,
                        percent: pctStart,
                        pct: pctStart,
                        chunk: i + 1,
                        total: chunks.length,
                    });
                    for (const idx of qIndexes) {
                        if (p.signal?.aborted) break;
                        const cue = chunkCues.find((c) => Number(c.index) === Number(idx));
                        if (!cue) continue;
                        const prev = map.has(Number(idx)) ? map.get(Number(idx)) : '';
                        const reasonList = qCollect.reasons?.get?.(Number(idx)) || [];
                        const isGloss = reasonList.includes('glossary_miss');
                        const retry = await translateCueBatch([cue], {
                            ...batchCtx,
                            _blankRetry: true,
                            _qualityRetry: true,
                            _glossaryRetry: isGloss,
                            qualityReasons: reasonList,
                            glossaryPromptInjectMode: 'hitOnly',
                            maxTokens: murasakiCore.estimateMaxTokens?.([cue], {
                                ...batchCtx,
                                _blankRetry: true,
                                _qualityRetry: true,
                            }) || core.estimateMaxTokens([cue]),
                        });
                        if (!retry.ok) continue;
                        const hit = (retry.cues || []).find((u) => Number(u.index) === Number(idx));
                        let next = hit ? String(hit.text ?? '').trim() : '';
                        if (typeof murasakiCore.finalizeMurasakiCue === 'function') {
                            next = murasakiCore.finalizeMurasakiCue(cue.text, next);
                        }
                        if (!next || murasakiCore.isMurasakiUnusableZh?.(next)) continue;
                        let improved = next !== String(prev || '').trim();
                        if (isGloss) {
                            const stillMiss = murasakiCore.collectMurasakiGlossaryMissIndexes?.(
                                [cue],
                                [{ index: cue.index, text: next }],
                                batchCtx,
                            );
                            improved = !(stillMiss?.indexes?.length);
                        } else if (reasonList.includes('repetition')) {
                            improved = !murasakiCore.looksLikeMurasakiRepetition?.(next);
                        }
                        if (improved) {
                            map.set(Number(idx), next);
                            localQualityRetried += 1;
                            if (isGloss) localGlossaryRetried += 1;
                            else if (reasonList.includes('repetition')) localRepetitionRetried += 1;
                        }
                    }
                    if (localQualityRetried) {
                        chunkUpdates = chunkCues.map((c) => ({
                            index: c.index,
                            text: map.has(c.index) ? map.get(c.index) : '',
                        }));
                    }
                }
            }

            completedChunks += 1;
            const pctDone = Math.round((completedChunks / Math.max(1, chunks.length)) * 100);
            send({
                phase: 'chunk-done',
                detail: `${chunkProgressLabel} ${i + 1}/${chunks.length}${rangeSuffix} 完成`,
                percent: pctDone,
                pct: pctDone,
                chunk: i + 1,
                total: chunks.length,
                cueFrom: chunkCues[0]?.index,
                cueTo: chunkCues[chunkCues.length - 1]?.index,
                cueCount: chunkCues.length,
                elapsedMs: Date.now() - startedAt,
            });

            if (isTgSubRun || isMurasakiRun || isHyMtRun) {
                for (const u of chunkUpdates || []) {
                    const t = String(u.text ?? '');
                    if (isTgSubRun && tgCore.looksLikeIdentityStubZh?.(t)) continue;
                    if (isMurasakiRun && murasakiCore.isMurasakiUnusableZh?.(t)) continue;
                    translatedByIndex.set(Number(u.index), t);
                    if (isHyMtRun && typeof hymtCore.updateHyMtRollingState === 'function') {
                        const srcCue = chunkCues.find((c) => Number(c.index) === Number(u.index));
                        hyMtRollingState = hymtCore.updateHyMtRollingState(
                            hyMtRollingState,
                            srcCue?.text || '',
                            t,
                            batchCtx,
                        );
                    }
                }
            }

            return {
                ok: true,
                chunkUpdates,
                blankRetried: localBlankRetried,
                blankLeft: localBlankLeft,
                qualityRetried: localQualityRetried,
                murasakiGlossaryRetried: localGlossaryRetried || 0,
                murasakiRepetitionRetried: localRepetitionRetried || 0,
            };
        };

        let chunkResults;
        try {
            chunkResults = await mapChunkIndicesWithConcurrency(
                chunks.length,
                clientConcurrency,
                processChunkIndex,
                p.signal,
            );
        } catch (err) {
            if (p.signal?.aborted || err?.code === 'cancelled') {
                return { ok: false, error: '已取消', code: 'cancelled', modelId };
            }
            return { ok: false, error: err?.message || `${chunkProgressLabel}失败`, modelId };
        }

        const failedChunks = [];
        for (const res of chunkResults) {
            if (!res?.ok) {
                failedChunks.push(res);
                continue;
            }
            updates.push(...(res.chunkUpdates || []));
            blankRetried += Number(res.blankRetried) || 0;
            blankLeft += Number(res.blankLeft) || 0;
            qualityRetried += Number(res.qualityRetried) || 0;
            murasakiGlossaryRetried += Number(res.murasakiGlossaryRetried) || 0;
            murasakiRepetitionRetried += Number(res.murasakiRepetitionRetried) || 0;
        }

        if (failedChunks.length) {
            const firstFail = failedChunks.find((r) => r?.code === 'cancelled') || failedChunks[0];
            if (
                p.signal?.aborted
                || firstFail?.code === 'cancelled'
                || firstFail?.cancelled
            ) {
                return {
                    ok: false,
                    error: '已取消',
                    code: 'cancelled',
                    modelId,
                };
            }
            const successChunks = chunkResults.length - failedChunks.length;
            // Keep every successful chunk whenever any chunk succeeded.
            // Murasaki (window≈3, serial) on large editor batch retranslate easily
            // exceeds the old 5% fail budget from transient timeouts; hard-abort
            // discarded all good cues and looked like「自动退出」. Only fail the
            // whole job when nothing succeeded (or user cancelled above).
            if (successChunks < 1) {
                return {
                    ok: false,
                    error: firstFail?.error || `${chunkProgressLabel}失败`,
                    code: firstFail?.code || 'chunk_failed',
                    modelId,
                    stats: {
                        failedChunks: failedChunks.length,
                        successChunks: 0,
                    },
                };
            }
            send({
                phase: 'chunk-retry',
                detail: `${failedChunks.length} 个分块失败，已保留 ${successChunks} 块成功译文（失败条留空）`,
                percent: Math.min(99, Math.round((successChunks / Math.max(1, chunkResults.length)) * 100)),
                pct: Math.min(99, Math.round((successChunks / Math.max(1, chunkResults.length)) * 100)),
            });
            blankLeft += failedChunks.reduce((n, r) => {
                const count = Number(r?.cueCount) || 0;
                return n + (count > 0 ? count : 1);
            }, 0);
            for (const fail of failedChunks) {
                const from = Number(fail?.cueFrom);
                const to = Number(fail?.cueTo);
                if (Number.isInteger(from) && Number.isInteger(to) && to >= from) {
                    for (let i = from; i <= to; i += 1) blankAttemptedIndexes.add(i);
                }
            }
        }

        const map = new Map(updates.map((u) => [Number(u.index), String(u.text ?? '')]));
        for (const u of creditPrefill) {
            map.set(Number(u.index), String(u.text ?? ''));
        }
        // Dual-line credit+dialogue: reattach localized credit above translated residue.
        for (const pref of creditPrefixes) {
            const idx = Number(pref?.index);
            if (!Number.isInteger(idx)) continue;
            const prefix = String(pref?.prefix || '').trim();
            if (!prefix) continue;
            const body = String(map.has(idx) ? map.get(idx) : '').trim();
            map.set(idx, body ? `${prefix}\n${body}` : prefix);
        }
        const outRaw = allCues.map((c) => {
            const idx = Number(c.index);
            return {
                index: Number.isInteger(idx) ? idx : c.index,
                startMs: c.startMs,
                endMs: c.endMs,
                // Missing → blank (never echo Japanese source into ZH track)
                text: map.has(idx) ? map.get(idx) : '',
            };
        });
        const { pickSanitizeTargetOpts } = require('./sanitize-target-opts');
        const cleaned = p._skipMtSanitize
            ? { cues: outRaw }
            : mtSanitize.sanitizeMtCues(outRaw, allCues, {
                glossaryTerms,
                glossary: p.glossary,
                nameMap: p.nameMap,
                unifyNames: true,
                sakuraNsfwPrompt: p.sakuraNsfwPrompt,
                nsfwPrompt: p.nsfwPrompt,
                contentProfile: p.contentProfile || p.senseProfile,
                senseProfile: p.senseProfile || p.contentProfile,
                faithfulTone: p.faithfulTone || p.smartTranslateFaithfulTone,
                smartTranslateFaithfulTone: p.smartTranslateFaithfulTone || p.faithfulTone,
                applyNsfwLexicon: p.applyNsfwLexicon,
                // GalTransl light finalize via resolveLightMtFinalizeSanitizeOpts.
                // Never drop/renumber here — callers merge by index (重新翻译 / engine MT adapter).
                unstickCrossCueZh: true,
                dropUselessEllipsis: false,
                renumberIndexes: false,
                ...pickSanitizeTargetOpts(p),
                ...(typeof core.resolveLightMtFinalizeSanitizeOpts === 'function'
                    ? core.resolveLightMtFinalizeSanitizeOpts({
                        promptFamily,
                        modelId,
                    })
                    : (promptFamily === 'galtransl'
                        ? { unstickInventWipe: false }
                        : {})),
            });
        const cleanedByIndex = new Map(
            (cleaned.cues || []).map((u) => [Number(u.index), String(u.text ?? '')]),
        );
        // Rematerialize 1:1 with input indexes so write-back never echoes JA or shifts rows.
        const rematerialized = outRaw.map((c) => {
            const idx = Number(c.index);
            const text = cleanedByIndex.has(idx)
                ? cleanedByIndex.get(idx)
                : String(c.text ?? '');
            return { ...c, index: Number.isInteger(idx) ? idx : c.index, text };
        });
        const chineseNorm = applyMtChineseVariantNormalization(rematerialized, p);
        let out = chineseNorm.cues;
        // Dialogue +N shift repair runs only in sanitizeMtSubtitlePair (stricter gates).
        // Running it here after Hy-MT caused false +N rotations (SAME-250).

        // Final whole-track alignment audit → blank + single-cue re-MT (FNS-256 silent shift).
        // Skip on blank-retry: input is a sparse subset of already-blank cues, not a contiguous
        // dialogue track — sliding-window audit false-positives and clears nearly everything
        // (then outer blank-retry loops for minutes with ~1/48 recovery).
        // Long tracks (2.5h+ / high cue count): still audit, but cap per-cue LLM retries.
        let alignRetried = 0;
        const alignBudget = longTrackPolicy.resolveAlignAuditBudget({
            cues: allCues,
            skipAlignAudit: p._skipAlignAudit,
            blankRetry: p._blankRetry,
        });
        if (
            typeof core.collectMisalignedCueIndexes === 'function'
            && alignBudget.run
            && !p.signal?.aborted
        ) {
            const misRaw = core.collectMisalignedCueIndexes(allCues, out, { windowSize: 8 });
            // Skip blank-only hits — in-chunk blank retry already covered them; final
            // audit should only burn LLM on confirmed invent / misattach / bleed.
            const byOutPre = new Map(
                (out || []).map((u) => [Number(u.index), String(u.text ?? '')]),
            );
            const misFiltered = (misRaw || []).filter((idx) => {
                const n = Number(idx);
                const cue = allCues.find((c) => Number(c.index) === n);
                if (!cue) return false;
                const prior = String(byOutPre.get(n) ?? '').trim();
                if (!prior || core.isBlankOrPunctTranslation?.(prior, cue.text)) return false;
                return !!(
                    mtSanitize.looksLikeFilmingZhInvent?.(prior, cue.text)
                    || mtSanitize.looksLikeMissingFilmingZh?.(prior, cue.text)
                    || mtSanitize.looksLikeCrossCuePlotBleed?.(prior, cue.text)
                    || mtSanitize.looksLikeSemanticMisattach?.(prior, cue.text)
                );
            });
            const capped = longTrackPolicy.capAlignAuditIndexes(misFiltered, alignBudget);
            const mis = capped.indexes;
            if (mis.length) {
                const misSet = new Set(mis.map((n) => Number(n)));
                for (const idx of misSet) blankAttemptedIndexes.add(Number(idx));
                send({
                    phase: 'chunk-retry',
                    detail: capped.truncated
                        ? `对位审计：长轨限流，重译前 ${mis.length} 条（另有 ${capped.dropped} 条跳过）…`
                        : `对位审计：发现 ${mis.length} 条疑似错位，逐条重译…`,
                    percent: 96,
                    pct: 96,
                });
                const byOut = new Map(byOutPre);
                // Do NOT mass-clear before retry: window false-positives used to wipe
                // usable ZH and seed the post blank-retry / QC 闭环 storm.
                // Only blank a cue when invent/misattach is confirmed on the prior text
                // and single-cue retry did not produce a usable replacement.
                const retryCues = allCues.filter((c) => misSet.has(Number(c.index)));
                for (const cue of retryCues) {
                    if (p.signal?.aborted) break;
                    const idx = Number(cue.index);
                    const prior = String(byOut.get(idx) ?? '').trim();
                    const confirmedBad = !!(
                        mtSanitize.looksLikeFilmingZhInvent?.(prior, cue.text)
                        || mtSanitize.looksLikeMissingFilmingZh?.(prior, cue.text)
                        || mtSanitize.looksLikeCrossCuePlotBleed?.(prior, cue.text)
                        || mtSanitize.looksLikeSemanticMisattach?.(prior, cue.text)
                    );
                    const one = await translateCueBatch([cue], {
                        ...batchCtx,
                        _lineAlignFallback: true,
                        _blankRetry: true,
                        maxTokens: core.estimateMaxTokens([cue]),
                    });
                    if (one?.ok) {
                        const hit = (one.cues || []).find((u) => Number(u.index) === idx);
                        const text = hit ? String(hit.text ?? '').trim() : '';
                        if (
                            text
                            && !mtSanitize.looksLikeFilmingZhInvent?.(text, cue.text)
                            && !mtSanitize.looksLikeCrossCuePlotBleed?.(text, cue.text)
                            && !core.isBlankOrPunctTranslation?.(text, cue.text)
                        ) {
                            byOut.set(idx, text);
                            alignRetried += 1;
                            continue;
                        }
                    }
                    if (confirmedBad) byOut.set(idx, '');
                }
                out = allCues.map((c) => ({
                    index: c.index,
                    startMs: c.startMs,
                    endMs: c.endMs,
                    text: byOut.has(Number(c.index)) ? byOut.get(Number(c.index)) : '',
                }));
                const { pickSanitizeTargetOpts: pickAlignSanitizeTargetOpts } = require('./sanitize-target-opts');
                const cleanedAlign = p._skipMtSanitize
                    ? { cues: out }
                    : mtSanitize.sanitizeMtCues(out, allCues, {
                        glossaryTerms,
                        glossary: p.glossary,
                        nameMap: p.nameMap,
                        unifyNames: true,
                        sakuraNsfwPrompt: p.sakuraNsfwPrompt,
                        nsfwPrompt: p.nsfwPrompt,
                        contentProfile: p.contentProfile || p.senseProfile,
                        senseProfile: p.senseProfile || p.contentProfile,
                        faithfulTone: p.faithfulTone || p.smartTranslateFaithfulTone,
                        smartTranslateFaithfulTone: p.smartTranslateFaithfulTone || p.faithfulTone,
                        applyNsfwLexicon: p.applyNsfwLexicon,
                        unstickCrossCueZh: true,
                        dropUselessEllipsis: false,
                        renumberIndexes: false,
                        ...pickAlignSanitizeTargetOpts(p),
                        ...(typeof core.resolveLightMtFinalizeSanitizeOpts === 'function'
                            ? core.resolveLightMtFinalizeSanitizeOpts({
                                promptFamily,
                                modelId,
                            })
                            : (promptFamily === 'galtransl'
                                ? { unstickInventWipe: false }
                                : {})),
                    });
                out = cleanedAlign.cues || out;
                blankLeft = core.collectBlankTranslationIndexes(allCues, out).length;
            }
        }

        // Dialogue +N shift repair (credit already correct; FNS peel/merge regressions).
        let dialogueShiftNote = '';
        try {
            const creditCore = require('../src/js/subtitle-software-credit-core');
            if (typeof creditCore.repairDetectedDialogueContentShift === 'function') {
                const repaired = creditCore.repairDetectedDialogueContentShift(out, allCues, {
                    isPro: /Transub\s*Pro/i.test(allCues.map((c) => c.text).join('\n')),
                    lang: 'zh',
                    maxOffset: 5,
                });
                if (repaired?.changed && Array.isArray(repaired.cues)) {
                    out = repaired.cues;
                    dialogueShiftNote = `对位回移 +${repaired.offset}（${repaired.repaired}）`;
                }
            }
        } catch (_) { /* optional */ }

        let quickDirectFilled = 0;
        if (
            !p.signal?.aborted
            && !p._skipFinalEllipsisDirect
            && typeof core.collectCuesForEllipsisQuickDirect === 'function'
        ) {
            const quick = await fillLiteralEllipsisQuickDirect({
                sourceCues: allCues,
                translatedCues: out,
                batchCtx,
                promptFamily,
                send,
                signal: p.signal,
            });
            for (const idx of quick.attemptedIndexes || []) {
                blankAttemptedIndexes.add(Number(idx));
            }
            if (quick.filled > 0) {
                out = quick.cues;
                quickDirectFilled = quick.filled;
                blankRetried += quick.filled;
            }
        }

        const stillBlankIndexes = (
            promptFamily === 'galtransl'
            && typeof core.collectLiteralBlankTranslationIndexes === 'function'
        )
            ? core.collectLiteralBlankTranslationIndexes(allCues, out)
            : core.collectBlankTranslationIndexes(allCues, out);
        blankLeft = stillBlankIndexes.length;
        const blankExhaustedIndexes = stillBlankIndexes
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && blankAttemptedIndexes.has(n));

        const summaryParts = [`${doneSummaryLabel} ${out.length} 条`];
        if (failedChunks.length) summaryParts.push(`分块失败 ${failedChunks.length}`);
        if (blankRetried) summaryParts.push(`空白重译成功 ${blankRetried}`);
        if (quickDirectFilled) summaryParts.push(`省略号直译 ${quickDirectFilled}`);
        if (alignRetried) summaryParts.push(`对位重译 ${alignRetried}`);
        if (dialogueShiftNote) summaryParts.push(dialogueShiftNote);
        if (blankLeft) summaryParts.push(`仍空白 ${blankLeft}`);
        if (qualityRetried) summaryParts.push(`质量重译 ${qualityRetried}`);
        if (murasakiGlossaryRetried) summaryParts.push(`术语补译 ${murasakiGlossaryRetried}`);
        if (murasakiRepetitionRetried) summaryParts.push(`复读重译 ${murasakiRepetitionRetried}`);
        if (isMurasakiRun && galBlankRetryBudget > 0) {
            summaryParts.push(`重试预算 ${galBlankRetryUsed}/${galBlankRetryBudget}`);
        }
        if (cleaned.changed) summaryParts.push(`已清理 ${cleaned.changed} 条异常译文`);
        if (cleaned.flags?.name_unify) summaryParts.push(`人名统一 ${cleaned.flags.name_unify}`);
        if (creditPrefill.length || creditPrefixes.length) {
            summaryParts.push(`软件信息 ${(creditPrefill.length || 0) + (creditPrefixes.length || 0)}`);
        }
        if (chineseNorm.changed) summaryParts.push('已转为简体');
        // All MT families: strip trailing 。／． before return (post-batch also runs this).
        let trailingPeriodTouched = 0;
        try {
            const fluency = require('../src/js/subtitle-fluency-core');
            if (typeof fluency.stripTrailingZhSentencePeriodInCues === 'function' && !p._skipTrailingPeriodStrip) {
                const stripped = fluency.stripTrailingZhSentencePeriodInCues(out, {});
                out = stripped.cues || out;
                trailingPeriodTouched = Number(stripped.stats?.cueTouched) || 0;
                if (trailingPeriodTouched) {
                    summaryParts.push(`去句末句号 ${trailingPeriodTouched}`);
                }
            }
        } catch (_) { /* optional */ }
        return {
            ok: true,
            cues: out,
            modelId,
            summary: summaryParts.join(' · '),
            stats: {
                blankRetried,
                blankLeft,
                blankAttemptedIndexes: [...blankAttemptedIndexes].filter((n) => Number.isInteger(n)),
                blankExhaustedIndexes,
                quickDirectFilled,
                qualityRetried,
                murasakiGlossaryRetried,
                murasakiRepetitionRetried,
                murasakiRetryBudget: isMurasakiRun ? galBlankRetryBudget : 0,
                murasakiRetryUsed: isMurasakiRun ? galBlankRetryUsed : 0,
                alignRetried,
                chunks: chunks.length,
                failedChunks: failedChunks.length,
                sanitized: cleaned.changed,
                sanitizeFlags: cleaned.flags,
                nameRules: (cleaned.nameRules || []).length,
                softwareCreditPrefill: creditPrefill.length,
                softwareCreditPrefixes: creditPrefixes.length,
                trailingPeriodTouched,
            },
        };
    } finally {
        // Engine/TWAI batch owns llama lifecycle; single jobs arm idle stop for local endpoints.
        if (!(p._batchMode || p._engineExternalMt)
            && (endpoint.source === 'sakura' || endpoint.source === 'managed')) {
            if (p.signal?.aborted) {
                try {
                    if (typeof llamaServer.stopLlamaServerAsync === 'function') {
                        await llamaServer.stopLlamaServerAsync();
                    } else {
                        llamaServer.stopLlamaServer();
                    }
                } catch (_) { /* ignore */ }
            } else {
                llamaServer.scheduleIdleStop();
            }
        }
    }
}

/**
 * Read subtitle → Sakura translate → write dest.
 */
async function sakuraTranslateSubtitleFile(options = {}) {
    const opts = asPlainObject(options);
    const nested = asPlainObject(opts.options);
    const sourcePath = asString(opts.sourcePath || opts.path, 4096).trim();
    const destPath = asString(opts.destPath || sourcePath, 4096).trim();
    const modelId = asString(
        opts.modelId || nested.engineMtModel || nested.modelId || sakuraMt.DEFAULT_MODEL_ID,
        128,
    ).trim();
    if (!sourcePath) return { ok: false, error: '缺少字幕路径' };
    if (!sakuraMt.isSakuraMtModel(modelId) && !sakuraMt.isLlmInferenceMtModel?.(modelId)
        && !sakuraMt.findLlmInferenceEntry?.(modelId)) {
        return { ok: false, error: `不是可用的推理翻译模型：${modelId}` };
    }
    const chunkProgressLabel = sakuraCatalog.mtChunkProgressLabel(modelId, {
        engineExternalMt: nested.engineExternalMt,
    });

    const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-bridge');
    let doc;
    try {
        doc = readSubtitleDocument(sourcePath);
    } catch (err) {
        return { ok: false, error: err.message || '读取字幕失败', path: sourcePath };
    }
    if (!doc?.ok) return { ok: false, error: doc?.error || '读取字幕失败', path: sourcePath };
    if (!doc.cues?.length) {
        return { ok: true, skipped: true, path: destPath, summary: '无字幕条目' };
    }

    let glossary = opts.glossary || nested.glossary || null;
    if (!glossary) {
        try {
            const { readGlossary } = require('./glossary-data');
            const g = readGlossary();
            if (g?.ok && g.glossary) glossary = g.glossary;
        } catch (_) { /* ignore */ }
    }

    const result = await runSakuraTranslate({
        cues: doc.cues.map((c, i) => ({
            index: Number.isInteger(Number(c.index)) ? Number(c.index) : i,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text || '',
        })),
        modelId,
        glossary,
        windowLines: opts.windowLines ?? nested.windowLines,
        dryRun: opts.dryRun ?? nested.dryRun,
        sakuraNsfwPrompt: opts.sakuraNsfwPrompt ?? nested.sakuraNsfwPrompt,
        nsfwPrompt: opts.nsfwPrompt ?? nested.nsfwPrompt,
        contentProfile: opts.contentProfile ?? nested.contentProfile,
        senseProfile: opts.senseProfile ?? nested.senseProfile,
        faithfulTone: opts.faithfulTone ?? nested.faithfulTone,
        smartTranslateFaithfulTone: opts.smartTranslateFaithfulTone ?? nested.smartTranslateFaithfulTone,
        presetId: opts.presetId ?? nested.presetId,
        chineseSubtitleVariant: opts.chineseSubtitleVariant ?? nested.chineseSubtitleVariant,
        subtitleTargetLang: opts.subtitleTargetLang ?? nested.subtitleTargetLang
            ?? opts.targetLang ?? nested.targetLang,
        targetLang: opts.targetLang ?? nested.targetLang
            ?? opts.subtitleTargetLang ?? nested.subtitleTargetLang,
        targetLanguage: opts.targetLanguage ?? nested.targetLanguage,
        sourcePath,
        fileName: sourcePath,
        signal: opts.signal,
        onProgress: opts.onProgress,
        _batchMode: !!opts._batchMode,
        _skipComputeLock: !!opts._skipComputeLock,
    });

    if (!result?.ok) {
        return { ok: false, error: result?.error || `${chunkProgressLabel}失败`, code: result?.code, path: sourcePath };
    }

    const map = new Map((result.cues || []).map((u) => [Number(u.index), String(u.text ?? '')]));
    let nextCues = (doc.cues || []).map((c, i) => {
        const idx = Number.isInteger(Number(c.index)) ? Number(c.index) : i;
        if (!map.has(idx)) return { ...c };
        return { ...c, text: map.get(idx) };
    });
    // Last-chance gate: never ship identity bleed / refusal / bare-… / dropped trail …….
    if (typeof tgCore.finalizeTranslateGemmaCueList === 'function') {
        const srcCues = (doc.cues || []).map((c, i) => ({
            index: Number.isInteger(Number(c.index)) ? Number(c.index) : i,
            text: c.text || '',
        }));
        nextCues = tgCore.finalizeTranslateGemmaCueList(srcCues, nextCues);
    }
    let changed = 0;
    for (let i = 0; i < (doc.cues || []).length; i += 1) {
        if (String(nextCues[i]?.text ?? '') !== String(doc.cues[i]?.text ?? '')) changed += 1;
    }

    const written = writeSubtitleDocument(destPath, {
        format: doc.format,
        cues: nextCues,
    });
    if (!written?.ok) {
        return { ok: false, error: written?.error || '写入字幕失败', path: destPath };
    }
    return {
        ok: true,
        path: destPath,
        changed,
        modelId,
        summary: result.summary || `${sakuraCatalog.mtDoneSummaryLabel(modelId).replace(/ 已译$/, '')} 更新 ${changed} 条`,
    };
}

/** @type {AbortController | null} */
let sakuraTranslateAbort = null;

function cancelSakuraTranslate() {
    let cancelled = false;
    if (sakuraTranslateAbort) {
        try { sakuraTranslateAbort.abort(); } catch (_) { /* ignore */ }
        sakuraTranslateAbort = null;
        cancelled = true;
    }
    // Abort alone may not reach finally quickly; reclaim llama on cancel (async — do not
    // spawnSync-block the main process when cancel is invoked from UI paths).
    try {
        if (typeof llamaServer.stopLlamaServerAsync === 'function') {
            void llamaServer.stopLlamaServerAsync().catch(() => {});
        } else {
            llamaServer.stopLlamaServer();
        }
    } catch (_) { /* ignore */ }
    return { ok: true, cancelled };
}

/**
 * Register IPC for subtitle-editor / renderer Sakura translate.
 * @param {{ register: Function }} api
 */
function setupSakuraTranslateBridge(api) {
    const register = api.register;

    register('transub-sakura-status', async (_event, payload = {}) => {
        const modelId = asString(payload?.modelId, 128).trim();
        if (modelId) return sakuraMt.getSakuraInstallStatus(modelId);
        const list = sakuraMt.listSakuraModelsForEngine();
        return {
            ok: true,
            defaultModelId: sakuraMt.DEFAULT_MODEL_ID,
            models: list,
        };
    });

    register('transub-sakura-translate', async (event, payload = {}) => {
        cancelSakuraTranslate();
        try {
            const computeLock = require('./compute-task-lock');
            const deadline = Date.now() + 4000;
            while (computeLock.isBusy() && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 40));
            }
        } catch { /* ignore */ }
        sakuraTranslateAbort = new AbortController();
        const signal = sakuraTranslateAbort.signal;
        const p = asPlainObject(payload);
        try {
            let modelId = asString(p.modelId, 128).trim();
            if (!modelId || !sakuraMt.isLlmInferenceMtModel?.(modelId)) {
                try {
                    const { loadSettings } = require('./settings-data');
                    const settings = loadSettings()?.options || {};
                    const candidates = [
                        settings.engineLlmMtModel,
                        settings.engineMtModel,
                    ].map((x) => String(x || '').trim()).filter(Boolean);
                    for (const candidate of candidates) {
                        if (sakuraMt.isLlmInferenceMtModel?.(candidate)) {
                            modelId = candidate;
                            break;
                        }
                    }
                } catch (_) { /* ignore */ }
            }
            if (!modelId) modelId = sakuraMt.DEFAULT_MODEL_ID;

            const result = await runSakuraTranslate({
                ...p,
                modelId,
                signal,
                onProgress: (info) => {
                    const out = {
                        feature: 'sakuraTranslate',
                        modelId,
                        ...info,
                    };
                    if (typeof p.onProgress === 'function') {
                        try { p.onProgress(out); } catch (_) { /* ignore */ }
                    }
                    try {
                        event?.sender?.send?.('transub-sakura-translate-progress', out);
                    } catch (_) { /* ignore */ }
                },
            });
            return result;
        } finally {
            sakuraTranslateAbort = null;
        }
    });

    register('transub-sakura-cancel-translate', async () => cancelSakuraTranslate());
}

module.exports = {
    runSakuraTranslate,
    sakuraTranslateSubtitleFile,
    cancelSakuraTranslate,
    setupSakuraTranslateBridge,
    preprocessCuesForSakura,
    fillLiteralEllipsisQuickDirect,
};
