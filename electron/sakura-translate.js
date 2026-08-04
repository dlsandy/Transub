/**
 * Free Sakura JA→ZH translation runner (llama-server, no Advanced gate).
 */
const core = require('../src/js/sakura-translate-core');
const sakuraMt = require('./sakura-mt');
const { chatCompletions, isMockMode } = require('./advanced-llm-client');
const llamaServer = require('./advanced-llama-server');
const { asPlainObject, asString, asNumber } = require('./ipc-validate');
const mtSanitize = require('../src/js/mt-sanitize-core');

/** Default llama.cpp / OpenAI-compat anti-loop for Sakura batches. */
const SAKURA_REPETITION_PENALTY = 1.18;
const SAKURA_FREQUENCY_PENALTY = 0.25;

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
            const preset = String(opts.activePresetId || opts.presetId || '').trim();
            if (preset && !out.presetId && !out.activePresetId) {
                out.presetId = preset;
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
        presetId: ctx.presetId,
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
    const maxTokens = Number.isFinite(Number(ctx.maxTokens))
        ? Math.max(32, Math.min(768, Math.round(Number(ctx.maxTokens))))
        : core.estimateMaxTokens(cues);
    const llm = await chatCompletions({
        apiKey: ctx.apiKey,
        baseUrl: ctx.baseUrl,
        model: ctx.model,
        temperature: 0.2,
        timeoutMs: ctx.timeoutMs,
        signal: ctx.signal,
        messages,
        max_tokens: maxTokens,
        repetition_penalty: SAKURA_REPETITION_PENALTY,
        frequency_penalty: SAKURA_FREQUENCY_PENALTY,
        cachePrompt: false,
    });
    if (!llm.ok) {
        return { ok: false, error: llm.error || 'Sakura 推理失败', cues: [], code: llm.code };
    }
    const parsed = core.parseLineAlignedOutput(llm.content, cues);
    if (!parsed.ok) return parsed;
    const cleaned = mtSanitize.sanitizeMtCues(parsed.cues, cues, {
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
    });
    return { ok: true, cues: cleaned.cues };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        owner: 'Sakura',
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
    const cues = preprocessCuesForSakura(core.normalizeCueList(p.cues));
    if (!cues.length) {
        return { ok: true, cues: [], skipped: true, summary: '无字幕条目' };
    }

    const modelId = asString(p.modelId || sakuraMt.DEFAULT_MODEL_ID, 128).trim();
    const send = (info) => {
        if (typeof p.onProgress === 'function') {
            try { p.onProgress(info); } catch (_) { /* ignore */ }
        }
    };

    let endpoint = { ok: true, apiKey: 'local', baseUrl: '', model: modelId, source: 'mock' };
    const dryRun = !!p.dryRun || isMockMode();

    // Per-chunk timeout: keep batch responsive; full-job 180s was masking runaway generation.
    // Engine external MT already sends small batches (≈8 cues) and may cold-start llama —
    // allow a longer default so first-chunk load+infer is not a hard fail.
    const chunkTimeoutFallback = p._engineExternalMt ? 180000 : 60000;
    const chunkTimeoutMs = asNumber(p.timeoutMs, {
        min: 15000,
        max: 300000,
        fallback: chunkTimeoutFallback,
    });

    try {
        if (!dryRun) {
            endpoint = await sakuraMt.resolveSakuraEndpoint({
                modelId,
                onProgress: send,
                signal: p.signal,
            });
            if (!endpoint.ok) return endpoint;
        }
        const glossaryTerms = extractGlossaryTerms(p.glossary);
        const nsfwOn = core.shouldUseNsfwPrompt(p);
        const chunks = core.chunkCues(cues, {
            windowLines: asNumber(p.windowLines, { min: 1, max: 20, fallback: core.DEFAULT_WINDOW_LINES }),
        });
        // Engine external MT uses 0-based cue ids; shift for human "第 N 条".
        const cueRangeOpts = p._engineExternalMt ? { oneBasedDisplay: true } : {};
        const cueRangeOf = (chunkCues) => core.formatCueOrdinalRange(chunkCues, cueRangeOpts);
        const batchCtx = {
            apiKey: endpoint.apiKey,
            baseUrl: endpoint.baseUrl,
            model: endpoint.model,
            glossaryTerms,
            glossary: p.glossary,
            nameMap: p.nameMap,
            sakuraNsfwPrompt: p.sakuraNsfwPrompt,
            nsfwPrompt: p.nsfwPrompt,
            contentProfile: p.contentProfile || p.senseProfile,
            senseProfile: p.senseProfile || p.contentProfile,
            faithfulTone: p.faithfulTone || p.smartTranslateFaithfulTone,
            smartTranslateFaithfulTone: p.smartTranslateFaithfulTone || p.faithfulTone,
            presetId: p.presetId || p.activePresetId,
            timeoutMs: chunkTimeoutMs,
            signal: p.signal,
            dryRun,
        };
        if (nsfwOn) {
            send({
                phase: 'translate',
                detail: 'Sakura 提示词已启用',
                percent: 0,
                pct: 0,
            });
        }
        const updates = [];
        let blankRetried = 0;
        let blankLeft = 0;
        let consecutiveTimeouts = 0;
        const startedAt = Date.now();

        for (let i = 0; i < chunks.length; i += 1) {
            if (p.signal?.aborted) {
                return { ok: false, error: '已取消', code: 'cancelled' };
            }
            const chunkCues = chunks[i];
            const rangeLabel = cueRangeOf(chunkCues);
            const rangeSuffix = rangeLabel ? ` · ${rangeLabel}` : '';
            const rangeParen = rangeLabel ? `（${rangeLabel}）` : '';
            const pctStart = Math.round((i / Math.max(1, chunks.length)) * 100);
            send({
                phase: 'translate',
                detail: `Sakura 翻译 ${i + 1}/${chunks.length}${rangeSuffix}（推理中…）`,
                percent: pctStart,
                pct: pctStart,
                chunk: i + 1,
                total: chunks.length,
                cueFrom: chunkCues[0]?.index,
                cueTo: chunkCues[chunkCues.length - 1]?.index,
                cueCount: chunkCues.length,
                elapsedMs: Date.now() - startedAt,
            });

            let batch = await translateCueBatch(chunkCues, batchCtx);
            const batchErr = String(batch?.error || '');
            const isUserCancel = !!(
                p.signal?.aborted
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
            if (!batch.ok && isTimeout) {
                consecutiveTimeouts += 1;
                await tryReleaseLlamaSlots(endpoint.baseUrl);
                await sleep(200);
                send({
                    phase: 'chunk-retry',
                    detail: `第 ${i + 1} 块${rangeParen}超时，释放槽位后重试…`,
                    percent: pctStart,
                    pct: pctStart,
                    chunk: i + 1,
                    total: chunks.length,
                });
                if (p.signal?.aborted) {
                    return { ok: false, error: '已取消', code: 'cancelled', modelId };
                }
                batch = await translateCueBatch(chunkCues, batchCtx);
                if (p.signal?.aborted || batch?.code === 'cancelled') {
                    return { ok: false, error: '已取消', code: 'cancelled', modelId };
                }
            } else if (!batch.ok) {
                consecutiveTimeouts = 0;
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
                batch = await translateCueBatch(chunkCues, batchCtx);
                if (p.signal?.aborted || batch?.code === 'cancelled') {
                    return { ok: false, error: '已取消', code: 'cancelled', modelId };
                }
            } else {
                consecutiveTimeouts = 0;
            }

            // If still timing out and slot may be wedged, bounce local server once.
            if (
                !batch.ok
                && consecutiveTimeouts >= 2
                && endpoint.source === 'sakura'
                && !p.signal?.aborted
                && batch?.code !== 'cancelled'
            ) {
                send({
                    phase: 'chunk-retry',
                    detail: `本地推理槽位可能卡住，正在重启 Sakura 服务…`,
                    percent: pctStart,
                    pct: pctStart,
                });
                try {
                    llamaServer.stopLlamaServer();
                    await sleep(400);
                    const restarted = await sakuraMt.resolveSakuraEndpoint({
                        modelId,
                        onProgress: send,
                        signal: p.signal,
                    });
                    if (restarted.ok) {
                        endpoint = restarted;
                        batchCtx.apiKey = restarted.apiKey;
                        batchCtx.baseUrl = restarted.baseUrl;
                        batchCtx.model = restarted.model;
                        batch = await translateCueBatch(chunkCues, batchCtx);
                        consecutiveTimeouts = 0;
                    }
                } catch (_) { /* ignore */ }
            }

            if (!batch.ok) {
                return {
                    ok: false,
                    error: batch.error || `第 ${i + 1} 块${rangeParen}翻译失败`,
                    code: batch.code,
                    modelId,
                };
            }

            let chunkUpdates = Array.isArray(batch.cues) ? batch.cues : [];
            const blankIndexes = core.collectBlankTranslationIndexes(chunkCues, chunkUpdates);
            if (blankIndexes.length && !p.signal?.aborted) {
                const blankSet = new Set(blankIndexes);
                const retryCues = chunkCues.filter((c) => blankSet.has(c.index));
                send({
                    phase: 'chunk-retry',
                    detail: `第 ${i + 1} 块${rangeParen}有 ${retryCues.length} 条空白，逐条重译…`,
                    percent: pctStart,
                    pct: pctStart,
                    chunk: i + 1,
                    total: chunks.length,
                });
                // One-by-one blank retry: avoids another large runaway generation.
                const map = new Map(
                    chunkUpdates.map((u) => [Number(u.index), String(u.text ?? '')]),
                );
                for (const cue of retryCues) {
                    if (p.signal?.aborted) break;
                    const oneLabel = cueRangeOf([cue]);
                    if (oneLabel) {
                        send({
                            phase: 'chunk-retry',
                            detail: `空白重译 · ${oneLabel}（推理中…）`,
                            percent: pctStart,
                            pct: pctStart,
                            chunk: i + 1,
                            total: chunks.length,
                        });
                    }
                    const retry = await translateCueBatch([cue], {
                        ...batchCtx,
                        maxTokens: core.estimateMaxTokens([cue]),
                    });
                    if (!retry.ok) continue;
                    const text = String(retry.cues?.[0]?.text ?? '').trim();
                    if (!text) continue;
                    map.set(cue.index, text);
                    blankRetried += 1;
                }
                chunkUpdates = chunkCues.map((c) => ({
                    index: c.index,
                    text: map.has(c.index) ? map.get(c.index) : '',
                }));
                const stillBlank = core.collectBlankTranslationIndexes(chunkCues, chunkUpdates);
                blankLeft += stillBlank.length;
            }
            updates.push(...chunkUpdates);

            const pctDone = Math.round(((i + 1) / Math.max(1, chunks.length)) * 100);
            send({
                phase: 'chunk-done',
                detail: `Sakura 翻译 ${i + 1}/${chunks.length}${rangeSuffix} 完成`,
                percent: pctDone,
                pct: pctDone,
                chunk: i + 1,
                total: chunks.length,
                cueFrom: chunkCues[0]?.index,
                cueTo: chunkCues[chunkCues.length - 1]?.index,
                cueCount: chunkCues.length,
                elapsedMs: Date.now() - startedAt,
            });
            // Yield so UI progress / cancel can run between chunks.
            await sleep(0);
        }

        const map = new Map(updates.map((u) => [Number(u.index), String(u.text ?? '')]));
        const outRaw = cues.map((c) => ({
            index: c.index,
            // Missing → blank (never echo Japanese source into ZH track)
            text: map.has(c.index) ? map.get(c.index) : '',
        }));
        const cleaned = mtSanitize.sanitizeMtCues(outRaw, cues, {
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
        });
        const out = cleaned.cues;
        const summaryParts = [`Sakura 已译 ${out.length} 条`];
        if (blankRetried) summaryParts.push(`空白重译成功 ${blankRetried}`);
        if (blankLeft) summaryParts.push(`仍空白 ${blankLeft}`);
        if (cleaned.changed) summaryParts.push(`已清理 ${cleaned.changed} 条异常译文`);
        if (cleaned.flags?.name_unify) summaryParts.push(`人名统一 ${cleaned.flags.name_unify}`);
        return {
            ok: true,
            cues: out,
            modelId,
            summary: summaryParts.join(' · '),
            stats: {
                blankRetried,
                blankLeft,
                chunks: chunks.length,
                sanitized: cleaned.changed,
                sanitizeFlags: cleaned.flags,
                nameRules: (cleaned.nameRules || []).length,
            },
        };
    } finally {
        // Engine/TWAI batch owns llama lifecycle; single jobs arm idle stop for local endpoints.
        if (!(p._batchMode || p._engineExternalMt)
            && (endpoint.source === 'sakura' || endpoint.source === 'managed')) {
            if (p.signal?.aborted) {
                try { llamaServer.stopLlamaServer(); } catch (_) { /* ignore */ }
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
        sourcePath,
        fileName: sourcePath,
        signal: opts.signal,
        onProgress: opts.onProgress,
        _batchMode: !!opts._batchMode,
        _skipComputeLock: !!opts._skipComputeLock,
    });

    if (!result?.ok) {
        return { ok: false, error: result?.error || 'Sakura 翻译失败', code: result?.code, path: sourcePath };
    }

    const map = new Map((result.cues || []).map((u) => [Number(u.index), String(u.text ?? '')]));
    let changed = 0;
    const nextCues = (doc.cues || []).map((c, i) => {
        const idx = Number.isInteger(Number(c.index)) ? Number(c.index) : i;
        if (!map.has(idx)) return { ...c };
        const text = map.get(idx);
        if (text !== c.text) changed += 1;
        return { ...c, text };
    });

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
        summary: result.summary || `Sakura 更新 ${changed} 条`,
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
    // Abort alone may not reach finally quickly; reclaim llama on cancel.
    try { llamaServer.stopLlamaServer(); } catch (_) { /* ignore */ }
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
};
