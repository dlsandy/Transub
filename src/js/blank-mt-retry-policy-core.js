/**
 * Blank MT retranslate budget + pass scheduling (perfProfile-aware).
 * Both profiles: skip early (pre-postbatch) pass — post-batch + posttask only.
 * Speed: fewer rounds, no per-cue thrash.
 * Quality: skip LLM re-try for indexes already exhausted by main MT / prior pass
 * (deterministic fill still runs). LLM only for recover / underfill slots —
 * pure moan delete-class never burns model budget.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubBlankMtRetryPolicy = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function blankMtRetryPolicyFactory() {
    function loadEllipsisPolicy() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./hymt-ellipsis-policy-core')
                : (global && global.TransubHyMtEllipsisPolicy);
        } catch (_) {
            return null;
        }
    }

    function loadUnderfillQc() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./delivery-underfill-qc-core')
                : (global && global.TransubDeliveryUnderfillQc);
        } catch (_) {
            return null;
        }
    }

    function isSpeedPerfProfile(raw) {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            return isSpeedPerfProfile(raw.perfProfile);
        }
        const v = String(raw || '').trim().toLowerCase();
        return v === 'speed' || v === 'fast';
    }

    function isBlankRetranslateEnabled(options = {}) {
        return options.postBatchBlankRetranslate !== false;
    }

    function normalizeBlankIndexList(raw) {
        const out = [];
        const seen = new Set();
        const list = Array.isArray(raw) ? raw : [];
        for (const item of list) {
            const n = Number(item);
            if (!Number.isInteger(n) || n < 0 || seen.has(n)) continue;
            seen.add(n);
            out.push(n);
        }
        return out;
    }

    function mergeBlankIndexLists(...lists) {
        const seen = new Set();
        const out = [];
        for (const raw of lists) {
            for (const n of normalizeBlankIndexList(raw)) {
                if (seen.has(n)) continue;
                seen.add(n);
                out.push(n);
            }
        }
        return out;
    }

    /** JA source long enough / has script — skip moan-only thrash in per-cue fallback. */
    function isSubstantialBlankSource(text) {
        const s = String(text || '').replace(/[\s\u3000]+/g, '').trim();
        if (s.length < 4) return false;
        if (/^(?:[…\.．。・ー～〜!?！？]+)+$/.test(s)) return false;
        return /[\u3040-\u30ff\u3400-\u9fff]/.test(s);
    }

    /**
     * Classify whether a blank/underfill cue should hit the LLM.
     * @returns {'llm'|'det_only'|'skip'}
     */
    function classifyBlankSlotForLlm(jaText, zhText, options = {}) {
        const ja = String(jaText || '').trim();
        const zh = String(zhText || '').trim();
        if (!ja) return 'skip';
        if (options.force === true) return 'llm';

        // Whisper debris — never burn LLM budget inventing ZH
        try {
            const lex = (typeof require === 'function') ? require('./mt-sanitize-lexicon') : null;
            if (lex?.isAsrGarbageJa?.(ja)) return 'skip';
        } catch (_) { /* optional */ }

        // Inference / editor 补译: any leftover … with real JA goes to the sentence model
        // (pipeline used to skip moan/discourse "delete" slots; editor still translated them).
        if (options.recoverAllEllipsis === true && (!zh || /^(?:\.\.\.|……|…)+$/.test(zh))) {
            return 'llm';
        }

        // Underfill (bare 哈 / vocative stub / …) before ellipsis-delete so lexical
        // JA + stub ZH still LLM-retries (e.g. 「はぁ やめやめ」→「哈」).
        const underfill = loadUnderfillQc();
        if (underfill?.classifyDeliveryUnderfill) {
            const hit = underfill.classifyDeliveryUnderfill(zh, ja);
            if (
                hit
                && (
                    hit.kind === 'bare_ha'
                    || hit.kind === 'under_lick'
                    || hit.kind === 'ja_leak'
                    || hit.kind === 'vocative_stub'
                )
            ) {
                return 'llm';
            }
            if (hit?.kind === 'ellipsis_recover') return 'llm';
        }

        const ellipsis = loadEllipsisPolicy();
        if (ellipsis?.planEllipsisSlotAction) {
            const plan = ellipsis.planEllipsisSlotAction(ja, zh, {
                prevJa: options.prevJa,
                nextJa: options.nextJa,
            });
            if (plan?.action === 'delete') return 'skip';
            if (plan?.action === 'recover') return 'llm';
        } else if (ellipsis?.shouldSkipRecoverForDelete?.(ja, zh, {})) {
            return 'skip';
        }

        if (!zh || /^(?:\.\.\.|……|…)+$/.test(zh)) {
            if (isSubstantialBlankSource(ja)) return 'llm';
            return 'det_only';
        }
        return 'det_only';
    }

    function resolveBlankPairNeighbors(pair, jaCues, options = {}) {
        if (options.prevJa != null || options.nextJa != null) {
            return { prevJa: options.prevJa, nextJa: options.nextJa };
        }
        const list = Array.isArray(jaCues) ? jaCues : [];
        if (!list.length) return { prevJa: '', nextJa: '' };
        const idx = Number(pair?.index);
        let at = -1;
        if (Number.isInteger(idx)) {
            at = list.findIndex((c) => Number(c?.index) === idx);
        }
        if (at < 0 && Number.isInteger(idx) && idx >= 0 && idx < list.length) {
            at = idx;
        }
        if (at < 0) return { prevJa: '', nextJa: '' };
        return {
            prevJa: at > 0 ? String(list[at - 1]?.text ?? '') : '',
            nextJa: at + 1 < list.length ? String(list[at + 1]?.text ?? '') : '',
        };
    }

    function filterBlankPairsForLlm(pairs, options = {}) {
        const list = Array.isArray(pairs) ? pairs : [];
        const forceSet = options.forceSet instanceof Set
            ? options.forceSet
            : new Set(normalizeBlankIndexList(options.forceRetranslateIndexes));
        const jaCues = options.jaCues || options.sourceCues || null;
        const llm = [];
        const detOnly = [];
        const skipped = [];
        for (const p of list) {
            const neighbors = resolveBlankPairNeighbors(p, jaCues, options);
            const kind = classifyBlankSlotForLlm(
                p?.sourceText,
                p?.zhCue?.text ?? p?.zhText,
                {
                    ...options,
                    ...neighbors,
                    force: forceSet.has(Number(p?.index)),
                },
            );
            if (kind === 'llm') llm.push(p);
            else if (kind === 'det_only') detOnly.push(p);
            else skipped.push(p);
        }
        return { llmPairs: llm, detOnlyPairs: detOnly, skippedPairs: skipped };
    }

    /**
     * 句级专训路径（推理翻译 / 混合翻译 · GalTransl 等）：译后清洗后只做一次
     * 单条省略号直译，不再跑邻窗空白重试 / QC 闭环补译。
     * 注意：不得对「空 translateMode」返回 true——速度/质量默认仍依赖译后空白补译。
     */
    function isInferenceBlankDirectFinalize(options = {}) {
        const raw = String(options.translateMode || '').trim();
        if (!raw) return false;
        try {
            const norm = (typeof module !== 'undefined' && module.exports)
                ? require('./settings-options-normalize-core')
                : (global && global.TransubSettingsOptionsNormalize);
            if (norm?.isInferenceTranslateMode?.(raw)) return true;
            // 混合：主译已是 GalTransl 句级 + Instruct 剧情润色；后处理邻窗空白
            // 重试会再次引入大量「…」，与推理翻译同病。
            if (norm?.isHybridTranslateMode?.(raw)) return true;
        } catch (_) { /* optional */ }
        const mode = raw.toLowerCase();
        return mode === 'llm'
            || mode === 'sakura'
            || mode === 'engine'
            || mode === 'smart'
            || mode === 'hybrid'
            || mode === 'mixed';
    }

    /** @deprecated alias — 同 isInferenceBlankDirectFinalize（含混合） */
    function isSentenceMtBlankDirectFinalize(options = {}) {
        return isInferenceBlankDirectFinalize(options);
    }

    function isDialogTranslateMode(options = {}) {
        try {
            const norm = (typeof module !== 'undefined' && module.exports)
                ? require('./settings-options-normalize-core')
                : (global && global.TransubSettingsOptionsNormalize);
            if (norm?.isDialogTranslateMode) {
                return !!norm.isDialogTranslateMode(options.translateMode);
            }
            if (norm?.normalizeTranslateMode) {
                return norm.normalizeTranslateMode(options.translateMode) === 'dialog';
            }
        } catch (_) { /* optional */ }
        const mode = String(options.translateMode || '').trim().toLowerCase();
        return mode === 'dialog' || mode === 'smart_dialog' || mode === 'llm_line' || mode === 'chat';
    }

    /**
     * @param {{
     *   perfProfile?: string|object,
     *   isZhTarget?: boolean,
     *   options?: object,
     *   maxRounds?: number,
     *   maxCues?: number,
     * }} [input]
     */
    function resolveBlankMtRetryBudget(input = {}) {
        const options = input.options && typeof input.options === 'object' ? input.options : input;
        const speed = isSpeedPerfProfile(
            input.perfProfile != null ? input.perfProfile : options.perfProfile,
        );
        const isZhTarget = input.isZhTarget !== false
            && options.isZhTarget !== false;
        const enabled = isBlankRetranslateEnabled(options);
        const dialogMode = isDialogTranslateMode(options);

        let maxRounds = isZhTarget ? (speed ? 2 : 3) : (speed ? 1 : 2);
        let maxCuesPerRound = isZhTarget ? (speed ? 64 : 128) : (speed ? 32 : 64);
        // Explicit caller/options caps — apply after dialog/final floors so QC loop
        // maxRounds:1 is not inflated back to 4 by dialogMode.
        let roundsCap = null;
        if (Number.isFinite(Number(input.maxRounds)) && Number(input.maxRounds) > 0) {
            roundsCap = Math.max(1, Math.round(Number(input.maxRounds)));
            maxRounds = roundsCap;
        } else if (Number.isFinite(Number(options.blankMtRetryMaxRounds)) && Number(options.blankMtRetryMaxRounds) > 0) {
            roundsCap = Math.max(1, Math.round(Number(options.blankMtRetryMaxRounds)));
            maxRounds = roundsCap;
        }
        if (Number.isFinite(Number(input.maxCues)) && Number(input.maxCues) > 0) {
            maxCuesPerRound = Math.max(1, Math.round(Number(input.maxCues)));
        } else if (Number.isFinite(Number(options.blankMtRetryMaxCues)) && Number(options.blankMtRetryMaxCues) > 0) {
            maxCuesPerRound = Math.max(1, Math.round(Number(options.blankMtRetryMaxCues)));
        } else if (!speed && isZhTarget) {
            const hint = Math.max(
                0,
                Number(input.blankHintCount) || Number(options.blankHintCount) || 0,
            );
            if (hint >= 400) maxCuesPerRound = 192;
            else if (hint >= 200) maxCuesPerRound = 160;
        }

        // 智能翻译单模型：空白补译对齐编辑器批量重译（对话 LLM），略加轮次/逐条兜底。
        if (dialogMode && isZhTarget && !speed) {
            maxRounds = Math.max(maxRounds, 4);
        }

        const finalPass = options.blankMtFinalPass === true;
        const ellipsisRecover = options.hyMtEllipsisRecover === true;
        const blankHint = Math.max(
            0,
            Number(input.blankHintCount) || Number(options.blankHintCount) || 0,
        );
        // Delivery blank pass: clear leftover lexical …… — but never open a 100-cue
        // dialog storm after postprocess minting mass 「…」 (GalTransl wipe signature).
        if (finalPass && isZhTarget && !speed) {
            if (blankHint >= 40 || ellipsisRecover) {
                maxRounds = Math.min(maxRounds, roundsCap != null ? roundsCap : 2);
                maxCuesPerRound = Math.min(maxCuesPerRound, 24);
            } else {
                maxRounds = Math.max(maxRounds, 4);
                maxCuesPerRound = Math.max(maxCuesPerRound, 64);
            }
        }
        if (roundsCap != null) {
            maxRounds = Math.min(maxRounds, roundsCap);
        }

        const defaultPerCue = speed ? 0 : (dialogMode ? 24 : 8);
        const allowPerCueFallback = !speed && isZhTarget && options.blankMtRetryPerCueFallback !== false;
        let maxPerCueFallback = allowPerCueFallback
            ? Math.max(0, Math.min(48, Number(options.blankMtRetryMaxPerCue) || defaultPerCue))
            : 0;
        const perCueOnlyAfterPartialRecover = allowPerCueFallback
            && options.blankMtRetryPerCueOnZeroRecover !== true;
        let stallRoundsLimit = speed ? 1 : (dialogMode ? 3 : (finalPass ? 4 : 2));
        let weakYieldSoftLimit = speed ? 1 : (dialogMode ? 3 : (finalPass ? 5 : 2));
        let weakYieldMinBatch = finalPass ? 48 : 24;
        let weakYieldMinRatio = finalPass ? 0.02 : 0.05;

        // Always 1-line windows for blank-retry. Sparse post-batch blanks are non-adjacent;
        // packing into one GalTransl chat caused empty zip + 对位审计 storms (MFYD-182).
        // Ignore blankMtRetryWindowLines — user override re-opened the storm.
        const windowLines = 1;
        let hyMtBlankRetryBatch = speed ? 1 : 4;
        if (Number.isFinite(Number(options.hyMtBlankRetryBatch)) && Number(options.hyMtBlankRetryBatch) > 0) {
            hyMtBlankRetryBatch = Math.max(1, Math.min(8, Math.round(Number(options.hyMtBlankRetryBatch))));
        }

        // Mass blank leftover (post ASR prune / main-path align soft-scrub): stop thrashing early.
        // Threshold 24 covers post-rematerialize leftover (~40–60) and mid-storm rounds.
        if (blankHint >= 24 && isZhTarget && !speed) {
            maxRounds = Math.min(maxRounds, roundsCap != null ? roundsCap : 2);
            stallRoundsLimit = 1;
            weakYieldSoftLimit = 1;
            weakYieldMinBatch = Math.min(weakYieldMinBatch, 16);
            weakYieldMinRatio = Math.max(weakYieldMinRatio, 0.08);
            maxPerCueFallback = Math.min(maxPerCueFallback, 8);
        }

        const ignoreExhaustedIndexes = !speed && (
            options.blankMtFinalPass === true
            || options.blankMtIgnoreExhausted === true
        );

        return {
            enabled,
            speed,
            isZhTarget,
            dialogMode,
            maxRounds,
            maxCuesPerRound,
            allowPerCueFallback,
            maxPerCueFallback,
            perCueOnlyAfterPartialRecover,
            stallRoundsLimit,
            weakYieldSoftLimit,
            weakYieldMinBatch,
            weakYieldMinRatio,
            windowLines,
            hyMtBlankRetryBatch,
            ignoreExhaustedIndexes,
            runEarlyBlankPass: false,
            runPostBatchBlankPass: enabled && !isInferenceBlankDirectFinalize(options),
            runPostTaskBlankPass: enabled && !isInferenceBlankDirectFinalize(options),
        };
    }

    /**
     * @returns {{ stop: boolean, continueSoft?: boolean, reason?: string, lowYieldRounds: number }}
     */
    function evaluateBlankWeakYield(input = {}) {
        const budget = input.budget || resolveBlankMtRetryBudget({ options: input.options || {} });
        const batchSize = Math.max(0, Number(input.batchSize) || 0);
        const recovered = Math.max(0, Number(input.roundRecovered) || 0);
        let lowYieldRounds = Math.max(0, Number(input.lowYieldRounds) || 0);
        const minBatch = Math.max(8, Number(budget.weakYieldMinBatch) || 24);
        const minRatio = Math.max(0.01, Number(budget.weakYieldMinRatio) || 0.05);
        if (batchSize < minBatch || recovered / batchSize >= minRatio) {
            return {
                stop: false,
                lowYieldRounds: recovered > 0 ? 0 : lowYieldRounds,
                reason: recovered > 0 ? 'ok_yield' : 'below_batch',
            };
        }
        lowYieldRounds += 1;
        const limit = budget.weakYieldSoftLimit != null
            ? Math.max(1, Number(budget.weakYieldSoftLimit) || 1)
            : 2;
        if (lowYieldRounds >= limit) {
            return { stop: true, lowYieldRounds, reason: 'weak_yield_fuse' };
        }
        return {
            stop: false,
            continueSoft: true,
            lowYieldRounds,
            reason: 'weak_yield_soft',
        };
    }

    function shouldRunEarlyBlankPass(options = {}) {
        return !!resolveBlankMtRetryBudget({ options }).runEarlyBlankPass;
    }

    function shouldRunPostBatchBlankPass(options = {}) {
        return !!resolveBlankMtRetryBudget({ options }).runPostBatchBlankPass;
    }

    function shouldSkipPostBatchBlankPass(input = {}) {
        const options = input.options && typeof input.options === 'object' ? input.options : {};
        if (!shouldRunPostBatchBlankPass(options)) return true;
        const raw = input.earlyLeft != null
            ? input.earlyLeft
            : input.earlyResult?.left;
        if (raw == null || raw === '') return false;
        const left = Number(raw);
        if (Number.isFinite(left) && left <= 0) return true;
        return false;
    }

    function resolveSkipLlmBlankIndexes(options = {}, extra = []) {
        const budget = resolveBlankMtRetryBudget({ options });
        if (budget.ignoreExhaustedIndexes && options.blankMtFinalPassKeepSkip !== true) {
            return mergeBlankIndexLists(extra);
        }
        return mergeBlankIndexLists(
            options.blankMtSkipLlmIndexes,
            options.blankExhaustedIndexes,
            options.attemptedBlankIndexes,
            extra,
        );
    }

    return {
        isSpeedPerfProfile,
        isBlankRetranslateEnabled,
        normalizeBlankIndexList,
        mergeBlankIndexLists,
        classifyBlankSlotForLlm,
        filterBlankPairsForLlm,
        resolveBlankMtRetryBudget,
        evaluateBlankWeakYield,
        isInferenceBlankDirectFinalize,
        isSentenceMtBlankDirectFinalize,
        shouldRunEarlyBlankPass,
        shouldRunPostBatchBlankPass,
        shouldSkipPostBatchBlankPass,
        resolveSkipLlmBlankIndexes,
        isSubstantialBlankSource,
        isDialogTranslateMode,
        resolveBlankPairNeighbors,
    };
}));
