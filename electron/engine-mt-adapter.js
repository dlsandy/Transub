/**
 * Local HTTP adapter for Transub Engine `mtBackend: "external"`.
 * Engine POSTs cues (LLM path: clean text, no glossary placeholders);
 * we run Sakura / Advanced smart translate with an optional prompt glossary.
 */
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const { asPlainObject, asString, asNumber } = require('./ipc-validate');
const { resolveMtTargetFields } = require('./sanitize-target-opts');

const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_SMART_BATCH_SIZE = 40;
/** Keep windows modest: Qwen3-1.7B struggles with long line-aligned batches. */
const DEFAULT_SMART_WINDOW_CUES = 8;
const DEFAULT_SMART_OVERLAP_CUES = 2;
const DEFAULT_TIMEOUT_SEC = 600;
/** Smart translate (Brief + line windows + shrink retries) needs a longer HTTP budget. */
const DEFAULT_SMART_TIMEOUT_SEC = 1800;
const PATH_TRANSLATE = '/translate';
/** Safety cap: extreme retry storms still get 429 instead of unbounded queue growth. */
const MAX_QUEUED_TRANSLATE = 16;

/**
 * @typedef {'smart'|'sakura'} MtAdapterMode
 */

/**
 * Resolve glossary for LLM prompt (same source as subtitle editor).
 * Engine protect is skipped for Sakura/smart; terms belong in the chat prompt.
 * @param {object} options
 * @returns {object|null}
 */
function resolvePromptGlossary(options = {}) {
    const opts = asPlainObject(options);
    if (opts.glossaryMtEnabled === false) return null;
    if (opts.glossary && typeof opts.glossary === 'object') {
        return opts.glossary;
    }
    try {
        const { readGlossary } = require('./glossary-data');
        const g = readGlossary();
        if (g?.ok && g.glossary) return g.glossary;
        if (g?.glossary) return g.glossary;
    } catch { /* optional */ }
    return null;
}

/**
 * @param {object} item
 * @param {number} i
 */
function mapEngineCue(item, i) {
    const c = asPlainObject(item);
    const idRaw = c.id != null ? Number(c.id) : i;
    const id = Number.isInteger(idRaw) ? idRaw : i;
    const startSec = Number(c.start);
    const endSec = Number(c.end);
    const startMs = Number.isFinite(startSec) ? Math.round(startSec * 1000) : undefined;
    const endMs = Number.isFinite(endSec) ? Math.round(endSec * 1000) : undefined;
    return {
        id,
        index: id,
        startMs,
        endMs,
        text: String(c.text ?? ''),
    };
}

/**
 * @param {object} body
 * @returns {{ ok: boolean, error?: string, phase?: string, cues?: object[], translatedCues?: object[], briefCues?: object[], language?: string, targetLanguage?: string, jobId?: string }}
 */
function parseEngineMtRequest(body) {
    const raw = asPlainObject(body);
    const cuesIn = Array.isArray(raw.cues) ? raw.cues : null;
    if (!cuesIn) {
        return { ok: false, error: 'cues must be an array' };
    }
    const cues = cuesIn.map((item, i) => mapEngineCue(item, i));
    const briefIn = Array.isArray(raw.briefCues) ? raw.briefCues : [];
    const briefCues = briefIn.map((item, i) => mapEngineCue(item, i));
    const phaseRaw = asString(raw.phase || raw.action || '', 32).trim().toLowerCase();
    const phase = phaseRaw === 'polish' || phaseRaw === 'finalize' || phaseRaw === 'plot_polish'
        ? 'polish'
        : 'translate';
    const translatedIn = Array.isArray(raw.translatedCues)
        ? raw.translatedCues
        : (Array.isArray(raw.translated) ? raw.translated : []);
    const translatedCues = translatedIn.map((item, i) => {
        const c = asPlainObject(item);
        const idRaw = c.id != null ? Number(c.id) : (c.index != null ? Number(c.index) : i);
        const id = Number.isInteger(idRaw) ? idRaw : i;
        return { id, index: id, text: String(c.text ?? '') };
    });
    return {
        ok: true,
        phase,
        cues,
        translatedCues,
        briefCues,
        briefCueTotal: asNumber(raw.briefCueTotal, { min: 0, max: 100000, fallback: briefCues.length }),
        language: asString(raw.language, 32).trim(),
        targetLanguage: asString(raw.targetLanguage || raw.target_language || '', 32).trim()
            || (() => {
                try {
                    const mtRoute = require('../src/js/mt-target-route-core');
                    return mtRoute.resolveMtTargetRoute(raw).engineTargetLanguage;
                } catch {
                    return 'zh';
                }
            })(),
        jobId: asString(raw.jobId || raw.job_id, 128).trim(),
    };
}

/**
 * Map LLM cue updates back to engine response shape (preserve request ids).
 * @param {object[]} requestCues
 * @param {object[]} translatedCues
 */
function buildEngineMtResponse(requestCues, translatedCues, options = {}) {
    const mtSanitize = require('../src/js/mt-sanitize-core');
    const { loadClosedSmartTranslateCore } = require('./advanced-closed-api');
    const smartCore = loadClosedSmartTranslateCore();
    const optsIn = asPlainObject(options);
    const targetFields = resolveMtTargetFields(optsIn);
    const opts = {
        ...optsIn,
        subtitleTargetLang: targetFields.subtitleTargetLang,
        targetLang: targetFields.targetLang,
        targetLanguage: targetFields.targetLanguage,
        chineseSubtitleVariant: targetFields.chineseSubtitleVariant,
    };
    const cleaned = mtSanitize.sanitizeMtCues(
        (translatedCues || []).map((u) => ({
            index: Number(u.index),
            text: String(u.text ?? ''),
        })),
        (requestCues || []).map((c) => ({
            index: Number(c.index),
            text: String(c.text ?? ''),
        })),
        {
            glossary: opts.glossary,
            glossaryTerms: opts.glossaryTerms,
            nameMap: opts.nameMap,
            unifyNames: opts.unifyNames !== false,
            sakuraNsfwPrompt: opts.sakuraNsfwPrompt,
            nsfwPrompt: opts.nsfwPrompt,
            contentProfile: opts.contentProfile || opts.senseProfile,
            senseProfile: opts.senseProfile || opts.contentProfile,
            faithfulTone: opts.faithfulTone || opts.smartTranslateFaithfulTone,
            smartTranslateFaithfulTone: opts.smartTranslateFaithfulTone || opts.faithfulTone,
            applyNsfwLexicon: opts.applyNsfwLexicon != null
                ? !!opts.applyNsfwLexicon
                : !!(
                    opts.faithfulTone
                    || opts.smartTranslateFaithfulTone
                    || opts.sakuraNsfwPrompt
                    || opts.nsfwPrompt
                    || String(opts.contentProfile || opts.senseProfile || '').toLowerCase() === 'av_soft'
                ),
            chineseSubtitleVariant: opts.chineseSubtitleVariant,
            subtitleTargetLang: opts.subtitleTargetLang,
            targetLang: opts.targetLang,
            targetLanguage: opts.targetLanguage,
            dropUselessEllipsis: false,
            renumberIndexes: false,
        },
    );
    const map = new Map(
        cleaned.cues.map((u) => [Number(u.index), String(u.text ?? '')]),
    );
    // Final fill: sanitize may still leave «…» when LLM missed short JA;
    // recover again from request source so engine never ships empty dialogue.
    // Non-Chinese 成片: never inject ZH short tables / adult recover.
    const fillOpts = {
        contentProfile: opts.contentProfile || opts.senseProfile,
        senseProfile: opts.senseProfile || opts.contentProfile,
        smartTranslateFaithfulTone: opts.smartTranslateFaithfulTone || opts.faithfulTone,
        faithfulTone: opts.faithfulTone || opts.smartTranslateFaithfulTone,
        sakuraNsfwPrompt: opts.sakuraNsfwPrompt,
        nsfwPrompt: opts.nsfwPrompt,
        chineseSubtitleVariant: opts.chineseSubtitleVariant,
        subtitleTargetLang: opts.subtitleTargetLang,
        targetLang: opts.targetLang,
        targetLanguage: opts.targetLanguage,
    };
    const mayZhFill = targetFields.isZhTarget === true;
    return {
        cues: (requestCues || []).map((c, i) => {
            const idx = Number.isInteger(Number(c.index)) ? Number(c.index) : i;
            let text = map.has(idx) ? map.get(idx) : '';
            const src = String(c.text ?? '');
            if (
                mayZhFill
                && src.trim()
                && mtSanitize.isEllipsisOrEmptyZh?.(text)
            ) {
                const policyFill = (() => {
                    try {
                        return require('../src/js/mt-delivery-policy-core')
                            .fillBlankForTarget(text, src, fillOpts, { mtSanitize, smartCore });
                    } catch {
                        return null;
                    }
                })();
                if (policyFill?.changed && String(policyFill.text || '').trim()) {
                    text = policyFill.text;
                } else {
                    const recovered = mtSanitize.recoverBlankedAdultZh?.(text, src, fillOpts);
                    if (recovered?.changed && String(recovered.text || '').trim()) {
                        text = recovered.text;
                    } else {
                        const fb = smartCore?.fallbackShortJaCue?.(src, fillOpts);
                        if (fb && String(fb).trim() && !mtSanitize.isEllipsisOrEmptyZh?.(fb)) {
                            text = fb;
                        }
                    }
                }
            }
            // Hard EN delivery gate: list indexes / meta / Han must not ship.
            if (!mayZhFill && mtSanitize.finalizeIntlMtDeliveryText) {
                const fin = mtSanitize.finalizeIntlMtDeliveryText(
                    text,
                    targetFields.subtitleTargetLang || targetFields.targetLang || 'en',
                    src,
                );
                if (fin.changed) text = fin.text;
            } else if (!mayZhFill && mtSanitize.scrubHanLeakForIntlTarget) {
                const scrub = mtSanitize.scrubHanLeakForIntlTarget(text, targetFields.subtitleTargetLang);
                if (scrub.changed) text = scrub.text;
            }
            return {
                id: c.id,
                text: text == null ? '' : String(text),
            };
        }),
    };
}

/**
 * Translate one engine batch via smart / Sakura.
 * @param {object} parsed - from parseEngineMtRequest
 * @param {object} session
 */
function preprocessSourceCuesForMt(cues) {
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

function resolveMtHoldIndexSet(options = {}) {
    const raw = options.mtHoldIndexes || options.holdIndexes;
    if (!Array.isArray(raw) || !raw.length) return null;
    const set = new Set(
        raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0),
    );
    return set.size ? set : null;
}

/**
 * Peel hold (red-gate) cues out of the LLM batch; merge empty placeholders after.
 */
function partitionMtHoldCues(cues, options = {}) {
    const list = Array.isArray(cues) ? cues : [];
    const hold = resolveMtHoldIndexSet(options);
    if (!hold) {
        return { mtCues: list, holdPrefill: [], held: 0 };
    }
    const mtCues = [];
    const holdPrefill = [];
    for (let i = 0; i < list.length; i += 1) {
        const c = list[i];
        const idx = Number.isInteger(Number(c?.index)) ? Number(c.index) : i;
        if (hold.has(idx) || hold.has(i)) {
            holdPrefill.push({ index: idx, text: '' });
        } else {
            mtCues.push(c);
        }
    }
    return { mtCues, holdPrefill, held: holdPrefill.length };
}

/**
 * Peel software-credit lines before LLM MT so Hy-MT cannot invent dialogue on
 * the watermark slot (whole-track off-by-one on re-translate).
 */
function partitionSoftwareCreditForMt(cues, options = {}) {
    try {
        const creditCore = require('../src/js/subtitle-software-credit-core');
        if (typeof creditCore.partitionMtCuesSkippingSoftwareCredit !== 'function') {
            return { mtCues: Array.isArray(cues) ? cues : [], prefilled: [], skipped: 0 };
        }
        return creditCore.partitionMtCuesSkippingSoftwareCredit(cues, {
            isPro: options.isPro === true
                || /Transub\s*Pro/i.test((cues || []).map((c) => c.text).join('\n')),
            lang: (() => {
                try {
                    const fields = resolveMtTargetFields(options);
                    if (!fields.isZhTarget) {
                        return fields.engineTargetLanguage || 'en';
                    }
                } catch { /* zh */ }
                return 'zh';
            })(),
            dualLineOrder: options.dualLineOrder,
        });
    } catch {
        return { mtCues: Array.isArray(cues) ? cues : [], prefilled: [], skipped: 0 };
    }
}

/**
 * Peel moans / discourse / wet-SFX off the LLM batch; merge after translate.
 * Works for both closed `_advanced` and builtin smart-translate.
 */
function partitionMtCuesForLlm(cues) {
    try {
        const { loadClosedSmartTranslateCore } = require('./advanced-closed-api');
        const smartCore = loadClosedSmartTranslateCore();
        if (typeof smartCore?.partitionDeterministicCues === 'function') {
            return smartCore.partitionDeterministicCues(cues);
        }
    } catch { /* optional */ }
    return { llmCues: Array.isArray(cues) ? cues : [], prefilled: [], skipped: 0 };
}

function rememberBriefSample(session, parsed) {
    if (parsed?.briefCues?.length && !session.briefSourceCues) {
        session.briefSourceCues = preprocessSourceCuesForMt(parsed.briefCues);
    }
    const total = Number(parsed?.briefCueTotal);
    if (Number.isFinite(total) && total > 0 && !session.briefCueTotal) {
        session.briefCueTotal = total;
    }
}

function noteSessionFilmBrief(session, onProgress, result = {}) {
    const { emitFilmBriefToProgress } = require('./film-brief-engine-log');
    if (result.filmBrief && !session.filmBrief) session.filmBrief = result.filmBrief;
    const skipped = !!(result.briefMode === 'skipped' || result.hybridSkipLlmBrief);
    if (skipped && !session.filmBrief) {
        session.skipFilmBrief = true;
        emitFilmBriefToProgress(onProgress, session, null, {
            skipped: true,
            skipReason: '智能翻译',
        });
        return;
    }
    if (session.filmBrief) {
        emitFilmBriefToProgress(onProgress, session, session.filmBrief);
    }
}

/**
 * Merge credit/deterministic prefills with LLM rows onto the full source batch.
 * Delegates to mergeRetranslateCues so dense 0-based Hy-MT payloads cannot
 * overwrite restore slots (head credit) and shift the whole ZH track.
 * @param {object[]} allSourceCues
 * @param {object[]} prefilled
 * @param {object[]} translatedCues
 */
function mergePrefillWithTranslated(allSourceCues, prefilled, translatedCues, creditPrefixes = []) {
    const src = Array.isArray(allSourceCues) ? allSourceCues : [];
    const pref = Array.isArray(prefilled) ? prefilled : [];
    const trans = Array.isArray(translatedCues) ? translatedCues : [];
    const prefixes = Array.isArray(creditPrefixes) ? creditPrefixes : [];
    const restoreByIndex = new Map();
    for (const u of pref) {
        const idx = Number(u?.index);
        if (Number.isInteger(idx)) restoreByIndex.set(idx, String(u.text ?? ''));
    }
    const cueIndex = (c, i) => (
        Number.isInteger(Number(c?.index)) ? Number(c.index) : i
    );
    const dialogueIndexes = [];
    for (let i = 0; i < src.length; i += 1) {
        const index = cueIndex(src[i], i);
        if (!restoreByIndex.has(index)) dialogueIndexes.push(index);
    }
    let merged;
    try {
        const plan = require('../src/js/retranslate-plan-core');
        merged = plan.mergeRetranslateCues(src, trans, {
            restoreByIndex,
            translatedIndexes: dialogueIndexes,
        });
    } catch {
        const map = new Map(restoreByIndex);
        for (const u of trans) {
            const idx = Number(u?.index);
            if (Number.isInteger(idx)) map.set(idx, String(u.text ?? ''));
        }
        merged = src.map((c, i) => {
            const idx = cueIndex(c, i);
            return { ...c, index: idx, text: map.has(idx) ? map.get(idx) : '' };
        });
    }
    if (prefixes.length) {
        const byIndex = new Map(
            merged.map((c, i) => [cueIndex(c, i), String(c.text ?? '')]),
        );
        for (const prefRow of prefixes) {
            const idx = Number(prefRow?.index);
            if (!Number.isInteger(idx)) continue;
            const prefix = String(prefRow?.prefix || '').trim();
            if (!prefix) continue;
            const body = String(byIndex.get(idx) || '').trim();
            byIndex.set(idx, body ? `${prefix}\n${body}` : prefix);
        }
        merged = src.map((c, i) => {
            const idx = cueIndex(c, i);
            return {
                ...c,
                index: idx,
                text: byIndex.has(idx) ? byIndex.get(idx) : '',
            };
        });
    }
    return merged.map((c, i) => ({
        index: cueIndex(c, i),
        text: String(c.text ?? ''),
    }));
}

function normalizeMtOutputCues(cues, options = {}) {
    const fields = resolveMtTargetFields(options);
    if (!fields.isZhTarget) {
        // Do not run OpenCC / ZH cue normalize on English/JA/KO output
        return Array.isArray(cues) ? cues.map((c, i) => ({
            index: Number.isInteger(Number(c?.index)) ? Number(c.index) : i,
            text: String(c?.text ?? ''),
        })) : [];
    }
    let chinese;
    try {
        chinese = require('../src/js/subtitle-chinese-core');
    } catch {
        return Array.isArray(cues) ? cues : [];
    }
    let protectTerms = [];
    try {
        const glossCore = require('../src/js/subtitle-glossary-core');
        const glossary = options.glossary || resolvePromptGlossary(options);
        if (glossary && typeof glossCore.collectProtectTerms === 'function') {
            protectTerms = glossCore.collectProtectTerms(glossary);
        }
    } catch { /* optional */ }
    const variant = String(
        fields.chineseSubtitleVariant || options.chineseSubtitleVariant || 'simplified',
    ).trim() || 'simplified';
    const normalized = chinese.normalizeMtChineseCues(cues, variant, { protectTerms });
    return normalized.cues;
}

/**
 * Whole-film plot polish after engine finishes all sentence batches.
 * Sakura mode / polish-off: echo translated texts (no model swap).
 */
async function polishExternalFilm(parsed, session, { onProgress, signal } = {}) {
    const mode = String(session.mode || '').trim();
    const options = asPlainObject(session.options);
    const sourceCues = preprocessSourceCuesForMt(parsed.cues);
    const zhIn = Array.isArray(parsed.translatedCues) ? parsed.translatedCues : [];
    const translatedCues = sourceCues.map((c, i) => {
        const idx = Number.isInteger(Number(c.index)) ? Number(c.index) : i;
        const hit = zhIn.find((u) => Number(u.index) === idx || Number(u.id) === idx);
        return {
            index: idx,
            text: hit ? String(hit.text ?? '') : '',
        };
    });

    const targetFields = resolveMtTargetFields(options, parsed);
    // polish is for Pro hybrid (smart) and single-model dialog; llm/sakura skip.
    // en/ko/ja hybrid-capable targets keep polish (chat model + targetLanguage label).
    const polishEnabled = (mode === 'smart' || mode === 'dialog')
        && options.smartTranslatePlotPolish !== false;
    if (!polishEnabled || !sourceCues.length) {
        onProgress?.({
            phase: 'polish-skip',
            message: (mode === 'smart' || mode === 'dialog')
                ? '已跳过剧情贴合润色'
                : '推理翻译无需整片润色',
            plotPolish: false,
        });
        return { ok: true, cues: normalizeMtOutputCues(translatedCues, options), plotPolish: false, polishSkipped: true };
    }
    const { runSmartTranslate } = require('./advanced-bridge');
    const result = await runSmartTranslate({
        cues: sourceCues,
        translatedCues,
        polishOnly: true,
        filmBrief: session.filmBrief || options.filmBrief || null,
        skipFilmBrief: true,
        chineseSubtitleVariant: targetFields.chineseSubtitleVariant,
        subtitleTargetLang: targetFields.subtitleTargetLang,
        targetLang: targetFields.targetLang,
        targetLanguage: targetFields.targetLanguage,
        note: options.note,
        smartTranslateFaithfulTone: !!(
            options.smartTranslateFaithfulTone || options.faithfulTone
        ),
        translateStylePreset: options.translateStylePreset,
        translateStyleCustomNote: options.translateStyleCustomNote,
        smartTranslatePlotPolish: true,
        smartTranslateHybridMt: false,
        smartTranslateFaithfulVerify: options.smartTranslateFaithfulVerify !== false,
        smartTranslateAddressConsistency: options.smartTranslateAddressConsistency !== false,
        smartTranslatePolishSampleLimit: options.smartTranslatePolishSampleLimit,
        language: parsed.language || options.language,
        glossary: resolvePromptGlossary(options),
        bandByIndex: options.bandByIndex || options.cueRiskBands || session.bandByIndex,
        dryRun: options.dryRun,
        signal,
        onProgress,
        _batchMode: true,
        _engineExternalMt: true,
    });
    if (!result?.ok) {
        // Keep sentence MT; polish is best-effort.
        onProgress?.({
            phase: 'polish-skip',
            message: `剧情贴合润色未应用：${result?.error || '失败'}`,
            plotPolish: false,
        });
        return {
            ok: true,
            cues: normalizeMtOutputCues(translatedCues, options),
            plotPolish: false,
            polishSkipped: true,
            polishError: result?.error || 'polish_failed',
        };
    }
    session.polishFixed = (session.polishFixed || 0) + (Number(result.polishFixed) || 0);
    return {
        ok: true,
        cues: normalizeMtOutputCues(
            mergePrefillWithTranslated(sourceCues, [], result.cues || translatedCues),
            options,
        ),
        filmBrief: result.filmBrief || session.filmBrief,
        plotPolish: true,
        polishFixed: result.polishFixed || 0,
    };
}

async function translateExternalBatch(parsed, session) {
    const mode = String(session.mode || '').trim();
    const options = asPlainObject(session.options);
    const rawOnProgress = typeof session.onProgress === 'function' ? session.onProgress : null;
    const signal = session.signal || null;
    const sourceCues = preprocessSourceCuesForMt(parsed.cues);

    if (signal?.aborted) {
        return { ok: false, error: '已取消', code: 'cancelled' };
    }

    // Engine POSTs many small batches; suppress repeated one-shot notices across requests.
    const onProgress = rawOnProgress
        ? (info) => {
            const detail = String(info?.message || info?.detail || '').trim();
            if (/提示词已启用/.test(detail)) {
                if (session.nsfwPromptLogged) return;
                session.nsfwPromptLogged = true;
            }
            try {
                rawOnProgress(info);
            } catch (_) { /* ignore */ }
        }
        : null;

    if (parsed.phase === 'polish') {
        return polishExternalFilm(parsed, session, { onProgress, signal });
    }

    if (mode === 'smart') {
        const { runSmartTranslate } = require('./advanced-bridge');
        const targetFields = resolveMtTargetFields(options, parsed);
        const windowCues = targetFields.isZhTarget
            ? asNumber(options.windowCues, { min: 1, max: 1, fallback: 1 })
            : asNumber(options.windowCues, {
                min: 5,
                max: 80,
                fallback: 16,
            });
        const overlapCues = targetFields.isZhTarget
            ? asNumber(options.overlapCues, { min: 0, max: 0, fallback: 0 })
            : asNumber(options.overlapCues, {
                min: 0,
                max: 10,
                fallback: DEFAULT_SMART_OVERLAP_CUES,
            });
        // Peel software-credit first (re-translate with watermark already in src.srt).
        const creditPart = partitionSoftwareCreditForMt(sourceCues, options);
        const afterCredit = creditPart.mtCues.length ? creditPart.mtCues : sourceCues;
        const creditPrefill = creditPart.prefilled || [];
        const creditPrefixes = creditPart.creditPrefixes || [];
        if (creditPart.skipped > 0) {
            onProgress?.({
                phase: 'prefill',
                message: `软件信息 ${creditPart.skipped} 条（跳过模型）`,
            });
        }
        // Quality pipeline: skip red-hold indexes this round (blank target for later loop).
        const holdPart = partitionMtHoldCues(afterCredit, options);
        const afterHold = holdPart.mtCues.length || holdPart.held
            ? holdPart.mtCues
            : afterCredit;
        const holdPrefill = holdPart.holdPrefill || [];
        if (holdPart.held > 0) {
            onProgress?.({
                phase: 'prefill',
                message: `质量门闸暂缓 ${holdPart.held} 条（本轮不送译）`,
            });
        }
        // Peel moans / discourse / wet-SFX off the LLM batch; merge after translate.
        // Works for both closed `_advanced` and builtin smart-translate.
        // Skip ZH deterministic prefills when 成片 is non-Chinese.
        const { llmCues, prefilled, skipped } = targetFields.isZhTarget
            ? partitionMtCuesForLlm(afterHold)
            : { llmCues: afterHold, prefilled: [], skipped: 0 };
        const allPrefill = [...creditPrefill, ...holdPrefill, ...(prefilled || [])];
        rememberBriefSample(session, parsed);
        const briefSourceCues = session.briefSourceCues || [];
        if (skipped > 0) {
            onProgress?.({
                phase: 'prefill',
                message: `确定性回填 ${skipped}/${afterCredit.length} 条语气词/拟声（跳过模型）`,
            });
            session.deterministicPrefill = (session.deterministicPrefill || 0) + skipped;
        }

        const smartCommon = {
            chineseSubtitleVariant: targetFields.chineseSubtitleVariant,
            subtitleTargetLang: targetFields.subtitleTargetLang,
            targetLang: targetFields.targetLang,
            targetLanguage: targetFields.targetLanguage,
            note: options.note,
            windowCues,
            overlapCues,
            filmBrief: session.filmBrief || options.filmBrief || null,
            skipFilmBrief: !!(options.skipFilmBrief || session.filmBrief || session.skipFilmBrief),
            skipConsistency: options.consistencyLlm ? false : options.skipConsistency !== false,
            briefSourceCues: briefSourceCues.length ? briefSourceCues : undefined,
            smartTranslateFaithfulTone: !!(
                options.smartTranslateFaithfulTone || options.faithfulTone
            ),
            translateStylePreset: options.translateStylePreset,
            translateStyleCustomNote: options.translateStyleCustomNote,
            // Sakura/Gal hybrid is JA→ZH only; en/ko/ja still use TG/Chimera hybrid.
            smartTranslateHybridMt: !targetFields.disableHybridMt
                && options.smartTranslateHybridMt !== false,
            // Per-batch polish causes Sakura↔chat VRAM thrash; engine POSTs phase=polish once after all batches.
            smartTranslatePlotPolish: false,
            engineLlmMtModel: options.engineLlmMtModel,
            hybridMtModelId: options.hybridMtModelId || options.engineLlmMtModel,
            language: parsed.language || options.language,
            glossary: resolvePromptGlossary(options),
            dryRun: options.dryRun,
            signal,
            onProgress,
            _batchMode: true,
            _engineExternalMt: true,
            _deferPlotPolish: true,
        };

        if (!llmCues.length) {
            if (!session.filmBrief && !options.skipFilmBrief && briefSourceCues.length) {
                const briefResult = await runSmartTranslate({
                    ...smartCommon,
                    cues: sourceCues.length ? sourceCues : briefSourceCues.slice(0, 1),
                    briefOnly: true,
                    skipFilmBrief: false,
                });
                noteSessionFilmBrief(session, onProgress, briefResult || {});
            }
            return {
                ok: true,
                cues: normalizeMtOutputCues(
                    mergePrefillWithTranslated(sourceCues, allPrefill, [], creditPrefixes),
                    options,
                ),
                filmBrief: session.filmBrief || null,
                deterministicPrefill: skipped,
            };
        }
        const result = await runSmartTranslate({
            ...smartCommon,
            cues: llmCues,
        });
        if (!result?.ok) {
            return {
                ok: false,
                error: result?.error || '智能翻译失败',
                code: result?.code || 'smart_translate_failed',
            };
        }
        // Cache Brief across engine POSTs so later batches share the same film understanding.
        noteSessionFilmBrief(session, onProgress, result);
        if (options.skipFilmBrief) session.skipFilmBrief = true;
        return {
            ok: true,
            cues: normalizeMtOutputCues(
                mergePrefillWithTranslated(sourceCues, allPrefill, result.cues || [], creditPrefixes),
                options,
            ),
            filmBrief: result.filmBrief || session.filmBrief,
            deterministicPrefill: skipped,
        };
    }

    if (mode === 'sakura') {
        const { runSakuraTranslate } = require('./sakura-translate');
        const modelId = asString(
            session.modelId || options.engineMtModel || options.modelId,
            128,
        ).trim();
        const targetFields = resolveMtTargetFields(options, parsed);
        const holdPart = partitionMtHoldCues(sourceCues, options);
        const sakuraCues = holdPart.held ? holdPart.mtCues : sourceCues;
        if (holdPart.held > 0) {
            onProgress?.({
                phase: 'prefill',
                message: `质量门闸暂缓 ${holdPart.held} 条（本轮不送译）`,
            });
        }
        if (!sakuraCues.length) {
            return {
                ok: true,
                cues: normalizeMtOutputCues(
                    mergePrefillWithTranslated(sourceCues, holdPart.holdPrefill || [], []),
                    { ...options, ...targetFields },
                ),
            };
        }
        const result = await runSakuraTranslate({
            cues: sakuraCues,
            modelId,
            glossary: resolvePromptGlossary(options),
            windowLines: options.windowLines,
            dryRun: options.dryRun,
            sakuraNsfwPrompt: options.sakuraNsfwPrompt,
            nsfwPrompt: options.nsfwPrompt,
            contentProfile: options.contentProfile || options.senseProfile,
            senseProfile: options.senseProfile || options.contentProfile,
            faithfulTone: options.faithfulTone || options.smartTranslateFaithfulTone,
            smartTranslateFaithfulTone: options.smartTranslateFaithfulTone,
            translateStylePreset: options.translateStylePreset,
            translateStyleCustomNote: options.translateStyleCustomNote,
            presetId: options.presetId || options.activePresetId,
            chineseSubtitleVariant: targetFields.chineseSubtitleVariant,
            subtitleTargetLang: targetFields.subtitleTargetLang,
            targetLang: targetFields.targetLang,
            targetLanguage: targetFields.targetLanguage,
            // Prefer options.timeoutMs; else sakura uses 180s for engine external MT.
            timeoutMs: asNumber(options.timeoutMs, { min: 15000, max: 300000, fallback: 180000 }),
            signal,
            onProgress,
            _batchMode: true,
            _engineExternalMt: true,
            perfProfile: options.perfProfile,
            hyMtBlankRetryBatch: options.hyMtBlankRetryBatch,
        });
        if (!result?.ok) {
            return {
                ok: false,
                error: result?.error || '推理翻译失败',
                code: result?.code || 'sakura_failed',
            };
        }
        return {
            ok: true,
            cues: normalizeMtOutputCues(
                holdPart.held
                    ? mergePrefillWithTranslated(sourceCues, holdPart.holdPrefill || [], result.cues || [])
                    : (result.cues || []),
                { ...options, ...targetFields },
            ),
            blankExhaustedIndexes: Array.isArray(result?.stats?.blankExhaustedIndexes)
                ? result.stats.blankExhaustedIndexes
                : [],
            blankAttemptedIndexes: Array.isArray(result?.stats?.blankAttemptedIndexes)
                ? result.stats.blankAttemptedIndexes
                : [],
        };
    }

    return { ok: false, error: `未知外部 MT 模式：${mode || '(empty)'}`, code: 'bad_mode' };
}

function readJsonBody(req, { maxBytes = 8 * 1024 * 1024 } = {}) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                reject(Object.assign(new Error('request body too large'), { code: 'body_too_large' }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw.trim()) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (err) {
                reject(Object.assign(new Error('invalid JSON body'), { cause: err }));
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

function authorizeRequest(req, token) {
    if (!token) return true;
    const auth = String(req.headers.authorization || '').trim();
    if (auth.toLowerCase().startsWith('bearer ') && auth.slice(7).trim() === token) {
        return true;
    }
    const headerToken = String(req.headers['x-transub-mt-token'] || '').trim();
    return headerToken === token;
}

/**
 * Start a localhost adapter for one batch / job session.
 * @param {object} session
 * @param {MtAdapterMode} session.mode
 * @param {object} [session.options]
 * @param {string} [session.modelId]
 * @param {AbortSignal} [session.signal]
 * @param {function} [session.onProgress]
 * @param {number} [session.port] - 0 = ephemeral
 */
function startEngineMtAdapter(session = {}) {
    const mode = String(session.mode || '').trim();
    if (mode !== 'smart' && mode !== 'sakura') {
        return Promise.resolve({ ok: false, error: `无效外部 MT 模式：${mode || '(empty)'}` });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const state = {
        mode,
        options: asPlainObject(session.options),
        modelId: asString(session.modelId, 128).trim(),
        signal: session.signal || null,
        onProgress: session.onProgress,
        busy: false,
        queued: 0,
        closed: false,
        nsfwPromptLogged: false,
        filmBrief: session.filmBrief || null,
        blankExhaustedIndexes: [],
    };

    function noteBlankExhaustedIndexes(result = {}) {
        let blankPolicy = null;
        try {
            blankPolicy = require('../src/js/blank-mt-retry-policy-core');
        } catch { /* optional */ }
        // Only indexes that were retried and STILL blank — not all attempted (recovered may be wiped later).
        const next = blankPolicy?.mergeBlankIndexLists?.(
            state.blankExhaustedIndexes,
            result.blankExhaustedIndexes,
            result.stats?.blankExhaustedIndexes,
        ) || [];
        state.blankExhaustedIndexes = next;
        return next;
    }

    /** Serialize /translate so engine timeout-retries wait instead of getting hard 429. */
    let translateChain = Promise.resolve();
    function enqueueTranslate(work) {
        const run = translateChain.then(() => work(), () => work());
        translateChain = run.catch(() => {});
        return run;
    }

    const server = http.createServer(async (req, res) => {
        if (state.closed) {
            sendJson(res, 503, { error: 'adapter closed' });
            return;
        }
        const method = String(req.method || 'GET').toUpperCase();
        let pathname = '/';
        try {
            pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
        } catch {
            pathname = String(req.url || '/').split('?')[0] || '/';
        }

        if (method === 'GET' && (pathname === '/health' || pathname === '/')) {
            sendJson(res, 200, {
                ok: true,
                mode: state.mode,
                busy: state.busy,
                queued: state.queued,
            });
            return;
        }

        if (method !== 'POST' || pathname !== PATH_TRANSLATE) {
            sendJson(res, 404, { error: 'not found' });
            return;
        }

        if (!authorizeRequest(req, token)) {
            sendJson(res, 401, { error: 'unauthorized' });
            return;
        }

        if (state.signal?.aborted) {
            sendJson(res, 499, { error: 'cancelled', code: 'cancelled' });
            return;
        }

        // Cap only extreme storms; normal timeout-retries queue behind the in-flight batch.
        if (state.busy && state.queued >= MAX_QUEUED_TRANSLATE) {
            sendJson(res, 429, { error: 'adapter busy', code: 'busy' });
            return;
        }

        let body;
        try {
            body = await readJsonBody(req);
        } catch (err) {
            const msg = String(err?.message || err || '');
            sendJson(res, err?.code === 'body_too_large' ? 413 : 400, {
                error: msg || 'bad request',
            });
            return;
        }

        state.queued += 1;
        try {
            await enqueueTranslate(async () => {
                if (state.closed) {
                    sendJson(res, 503, { error: 'adapter closed' });
                    return;
                }
                if (state.signal?.aborted) {
                    sendJson(res, 499, { error: 'cancelled', code: 'cancelled' });
                    return;
                }

                state.busy = true;
                try {
                    const parsed = parseEngineMtRequest(body);
                    if (!parsed.ok) {
                        sendJson(res, 400, { error: parsed.error || 'bad request' });
                        return;
                    }
                    const translated = await translateExternalBatch(parsed, state);
                    if (!translated.ok) {
                        const code = String(translated.code || 'translate_failed');
                        const errText = String(translated.error || '');
                        // 499 = client/job cancelled; 504 = chunk/LLM timeout; 502 = other adapter failure.
                        // Legacy `aborted` mixed cancel+timeout — prefer retryable 504 when 超时 is present.
                        let status = 502;
                        if (code === 'cancelled') {
                            status = 499;
                        } else if (code === 'timeout') {
                            status = 504;
                        } else if (code === 'aborted') {
                            const cancelOnly = /已取消/.test(errText) && !/超时/.test(errText);
                            status = cancelOnly ? 499 : 504;
                        } else if (code === 'busy') {
                            status = 429;
                        }
                        sendJson(res, status, {
                            error: translated.error || 'translate failed',
                            code: status === 504 && code === 'aborted' ? 'timeout' : code,
                        });
                        return;
                    }
                    noteBlankExhaustedIndexes(translated);
                    sendJson(res, 200, buildEngineMtResponse(parsed.cues, translated.cues, {
                        ...asPlainObject(state.options),
                        glossary: resolvePromptGlossary(state.options),
                    }));
                } catch (err) {
                    const name = String(err?.name || '');
                    const msg = String(err?.message || err || '');
                    const lower = msg.toLowerCase();
                    const aborted = name === 'AbortError'
                        || err?.code === 'cancelled'
                        || err?.code === 'aborted'
                        || lower.includes('operation was aborted')
                        || lower.includes('user aborted');
                    if (aborted) {
                        sendJson(res, 499, { error: '已取消', code: 'cancelled' });
                    } else {
                        sendJson(res, 500, { error: msg || 'translate failed' });
                    }
                } finally {
                    state.busy = false;
                }
            });
        } finally {
            state.queued = Math.max(0, state.queued - 1);
        }
    });

    const listenPort = asNumber(session.port, { min: 0, max: 65535, fallback: 0 });

    return new Promise((resolve) => {
        const onError = (err) => {
            resolve({ ok: false, error: err.message || String(err) });
        };
        server.once('error', onError);
        server.listen(listenPort, '127.0.0.1', () => {
            server.removeListener('error', onError);
            const addr = server.address();
            const port = addr && typeof addr === 'object' ? addr.port : 0;
            const url = `http://127.0.0.1:${port}${PATH_TRANSLATE}`;
            resolve({
                ok: true,
                url,
                port,
                token,
                mode,
                /**
                 * Job fields for Engine `mtExternal`.
                 * @param {{ timeoutSec?: number, batchSize?: number }} [extra]
                 */
                mtExternal(extra = {}) {
                    let sakuraDefault = DEFAULT_BATCH_SIZE;
                    try {
                        const catalog = require('../src/js/sakura-mt-catalog-core');
                        sakuraDefault = catalog.resolveLlmMtEngineBatchSize({
                            smartTranslate: mode === 'smart',
                            modelId: state.modelId,
                        });
                    } catch (_) { /* keep 8 */ }
                    const smartDefault = mode === 'smart'
                        ? DEFAULT_SMART_BATCH_SIZE
                        : sakuraDefault;
                    const timeoutFallback = mode === 'smart'
                        ? DEFAULT_SMART_TIMEOUT_SEC
                        : DEFAULT_TIMEOUT_SEC;
                    return {
                        url,
                        timeoutSec: asNumber(extra.timeoutSec, {
                            min: 30,
                            max: 3600,
                            fallback: timeoutFallback,
                        }),
                        batchSize: asNumber(extra.batchSize, {
                            min: 1,
                            max: 128,
                            fallback: smartDefault,
                        }),
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    };
                },
                stop() {
                    if (state.closed) return;
                    state.closed = true;
                    try {
                        server.close();
                    } catch { /* ignore */ }
                },
                getBlankExhaustedIndexes() {
                    try {
                        const blankPolicy = require('../src/js/blank-mt-retry-policy-core');
                        return blankPolicy.normalizeBlankIndexList(state.blankExhaustedIndexes);
                    } catch {
                        return Array.isArray(state.blankExhaustedIndexes)
                            ? state.blankExhaustedIndexes.slice()
                            : [];
                    }
                },
                setHoldIndexes(indexes, meta = {}) {
                    const list = Array.isArray(indexes)
                        ? indexes.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0)
                        : [];
                    state.options = {
                        ...state.options,
                        mtHoldIndexes: list,
                        holdIndexes: list,
                    };
                    if (meta.bandByIndex && typeof meta.bandByIndex === 'object') {
                        state.options.bandByIndex = meta.bandByIndex;
                        state.options.cueRiskBands = meta.bandByIndex;
                        state.bandByIndex = meta.bandByIndex;
                    }
                    if (meta.bandSummary) {
                        state.options.bandSummary = meta.bandSummary;
                    }
                },
            });
        });
    });
}

module.exports = {
    PATH_TRANSLATE,
    DEFAULT_BATCH_SIZE,
    DEFAULT_SMART_BATCH_SIZE,
    DEFAULT_SMART_WINDOW_CUES,
    DEFAULT_SMART_OVERLAP_CUES,
    DEFAULT_TIMEOUT_SEC,
    DEFAULT_SMART_TIMEOUT_SEC,
    MAX_QUEUED_TRANSLATE,
    parseEngineMtRequest,
    buildEngineMtResponse,
    mergePrefillWithTranslated,
    resolvePromptGlossary,
    partitionMtHoldCues,
    resolveMtHoldIndexSet,
    translateExternalBatch,
    polishExternalFilm,
    startEngineMtAdapter,
};
