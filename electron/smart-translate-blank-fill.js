/**
 * Smart-translate final blank sweep: det fill → LLM → re-sanitize → second LLM
 * for leftovers wiped by sanitize (so shippable「…」get the same chance as batch re-MT).
 * Kept out of advanced-smart-translate.js (soft LOC ceiling).
 */
async function fillOneBlankCueWithLlm(cue, deps = {}) {
    const {
        translateCueBatch,
        baseCtx,
        note = '',
        intlRetryNote,
        isBlankMt,
        mtSanitize,
        pickSanitizeTargetOpts,
        faithfulPreferred = false,
        sakuraNsfwPrompt = false,
    } = deps;
    if (typeof translateCueBatch !== 'function' || !cue) {
        return { ok: false, text: '' };
    }
    const baseNote = typeof intlRetryNote === 'function'
        ? intlRetryNote(baseCtx, '空条补译：必须输出非空中文译文；禁止日文原文、禁止空字符串、禁止只输出标点。')
        : '空条补译：必须输出非空中文译文；禁止日文原文、禁止空字符串、禁止只输出标点。';
    const echoNote = typeof intlRetryNote === 'function'
        ? intlRetryNote(baseCtx, '上次输出了日文原文或空译文。必须改写成中文对白，禁止复述假名/汉字日文，禁止空输出。')
        : '上次输出了日文原文或空译文。必须改写成中文对白，禁止复述假名/汉字日文，禁止空输出。';

    const tryOnce = async (extraNote) => {
        const retry = await translateCueBatch([cue], {
            ...baseCtx,
            faithfulTone: true,
            note: [note, extraNote].filter(Boolean).join('\n'),
        });
        if (!retry?.ok) return '';
        return String(retry.cues?.[0]?.text ?? '').trim();
    };

    let text = await tryOnce(baseNote);
    const looksEcho = () => !!(
        text
        && (
            mtSanitize?.isMostlyUntranslatedJa?.(text)
            || mtSanitize?.looksLikeSourceEcho?.(text, cue.text)
            || isBlankMt?.(text, cue.text, baseCtx)
        )
    );
    if (looksEcho()) {
        const second = await tryOnce(echoNote);
        if (second) text = second;
    }
    if (!text || isBlankMt?.(text, cue.text, baseCtx)) {
        return { ok: false, text: '' };
    }
    const one = mtSanitize.sanitizeMtCueText(text, cue.text, {
        ...pickSanitizeTargetOpts(baseCtx),
        smartTranslateFaithfulTone: true,
        faithfulTone: true,
        applyNsfwLexicon: !!(faithfulPreferred || sakuraNsfwPrompt),
    });
    if (isBlankMt?.(one.text, cue.text, baseCtx)) {
        return { ok: false, text: '' };
    }
    return { ok: true, text: one.text };
}

function buildJaNeighborMaps(sourceCues) {
    const list = Array.isArray(sourceCues) ? sourceCues : [];
    const byIndex = new Map();
    for (let i = 0; i < list.length; i += 1) {
        const idx = Number.isInteger(Number(list[i]?.index)) ? Number(list[i].index) : i;
        byIndex.set(idx, i);
    }
    return { list, byIndex };
}

function neighborsForCue(cue, maps) {
    const idx = Number(cue?.index);
    const at = maps.byIndex.has(idx) ? maps.byIndex.get(idx) : -1;
    if (at < 0) return { prevJa: '', nextJa: '' };
    return {
        prevJa: at > 0 ? String(maps.list[at - 1]?.text ?? '') : '',
        nextJa: at + 1 < maps.list.length ? String(maps.list[at + 1]?.text ?? '') : '',
    };
}

/**
 * One det+LLM pass over blank cues. Mutates byOut map.
 * @returns {{ blankFilled: number, shortFallback: number, incompleteRetried: number }}
 */
async function fillBlankCuesOnce(blanks, byOut, deps = {}) {
    const {
        core,
        mtSanitize,
        baseCtx,
        p = {},
        sanitizeBlankOpts,
        note,
        intlRetryNote,
        isBlankMt,
        pickSanitizeTargetOpts,
        faithfulPreferred = false,
        translateCueBatch,
        onProgress,
        signal,
        maps,
        phaseLabel = '空条扫尾',
    } = deps;
    let blankFilled = 0;
    let shortFallback = 0;
    let incompleteRetried = 0;
    const needLlm = [];
    let blankPolicy = null;
    try {
        blankPolicy = require('../src/js/blank-mt-retry-policy-core');
    } catch (_) { /* optional */ }

    for (const cue of blanks) {
        if (signal?.aborted) break;
        const neighbors = neighborsForCue(cue, maps);
        let slotKind = 'llm';
        try {
            slotKind = blankPolicy?.classifyBlankSlotForLlm?.(
                cue.text,
                byOut.get(Number(cue.index)) || '',
                neighbors,
            ) || 'llm';
        } catch (_) { slotKind = 'llm'; }
        if (
            slotKind === 'skip'
            || (typeof mtSanitize.isDeterministicAsrDebrisJaForSanitize === 'function'
                && mtSanitize.isDeterministicAsrDebrisJaForSanitize(
                    cue.text,
                    byOut.get(Number(cue.index)) || '',
                ))
        ) {
            continue;
        }
        const filled = typeof core.tryPrefillJaCue === 'function'
            ? core.tryPrefillJaCue(cue.text, baseCtx)
            : core.fallbackShortJaCue?.(cue.text, baseCtx);
        // Prefill「…」is a skip marker (wet SFX / hard garbage) — do not count as fill.
        if (filled && filled !== '…' && !mtSanitize.isEllipsisOrEmptyZh?.(filled)) {
            byOut.set(Number(cue.index), filled);
            shortFallback += 1;
            blankFilled += 1;
            continue;
        }
        const recovered = mtSanitize.recoverBlankedAdultZh?.('', cue.text, {
            ...sanitizeBlankOpts(baseCtx),
            contentProfile: p.contentProfile || p.senseProfile,
            senseProfile: p.senseProfile || p.contentProfile,
            smartTranslateFaithfulTone: true,
            faithfulTone: true,
            skipFakeGreeting: true,
        });
        if (recovered?.changed && String(recovered.text || '').trim()
            && !mtSanitize.isEllipsisOrEmptyZh?.(recovered.text)
            && recovered.text !== '…') {
            byOut.set(Number(cue.index), recovered.text);
            shortFallback += 1;
            blankFilled += 1;
            continue;
        }
        if (slotKind !== 'llm') continue;
        needLlm.push(cue);
    }

    if (needLlm.length) {
        onProgress?.({
            phase: 'chunk-retry',
            message: `${phaseLabel}：补翻 ${needLlm.length} 条…`,
            pct: phaseLabel.includes('再') ? 97 : 96,
        });
    }
    for (const cue of needLlm) {
        if (signal?.aborted) break;
        const filledOne = await fillOneBlankCueWithLlm(cue, {
            translateCueBatch,
            baseCtx,
            note,
            intlRetryNote,
            isBlankMt,
            mtSanitize,
            pickSanitizeTargetOpts,
            faithfulPreferred,
            sakuraNsfwPrompt: p.sakuraNsfwPrompt,
        });
        if (filledOne.ok && filledOne.text) {
            byOut.set(Number(cue.index), filledOne.text);
            blankFilled += 1;
            incompleteRetried += 1;
        }
    }
    return { blankFilled, shortFallback, incompleteRetried };
}

/**
 * Full final blank sweep used by runBuiltinSmartTranslate.
 */
async function runFinalBlankSweep(input = {}) {
    const {
        cues,
        outCues: initialOut,
        stillBlank,
        core,
        mtSanitize,
        baseCtx,
        p = {},
        sanitizeBlankOpts,
        note,
        intlRetryNote,
        isBlankMt,
        pickSanitizeTargetOpts,
        faithfulPreferred = false,
        translateCueBatch,
        onProgress,
        glossaryTerms,
        glossary,
        nameMap,
    } = input;

    let outCues = Array.isArray(initialOut) ? initialOut : [];
    let blankFilled = 0;
    let shortFallback = 0;
    let incompleteRetried = 0;
    let cleaned = null;

    const blanks = typeof stillBlank === 'function' ? stillBlank() : [];
    if (!blanks.length || p.signal?.aborted) {
        return {
            outCues,
            cleaned,
            blankFilled,
            shortFallback,
            incompleteRetried,
        };
    }

    const byOut = new Map((outCues || []).map((u) => [Number(u.index), String(u.text ?? '')]));
    const maps = buildJaNeighborMaps(cues);
    const deps = {
        core,
        mtSanitize,
        baseCtx,
        p,
        sanitizeBlankOpts,
        note,
        intlRetryNote,
        isBlankMt,
        pickSanitizeTargetOpts,
        faithfulPreferred,
        translateCueBatch,
        onProgress,
        signal: p.signal,
        maps,
    };

    const first = await fillBlankCuesOnce(blanks, byOut, {
        ...deps,
        phaseLabel: '空条扫尾',
    });
    blankFilled += first.blankFilled;
    shortFallback += first.shortFallback;
    incompleteRetried += first.incompleteRetried;

    outCues = cues.map((c) => ({
        index: c.index,
        startMs: c.startMs,
        endMs: c.endMs,
        text: byOut.has(c.index) ? byOut.get(c.index) : '',
    }));

    cleaned = mtSanitize.sanitizeMtCues(outCues, cues, {
        ...pickSanitizeTargetOpts(baseCtx),
        glossaryTerms: glossaryTerms || baseCtx.glossaryTerms,
        glossary,
        nameMap,
        unifyNames: true,
        smartTranslateFaithfulTone: faithfulPreferred,
        faithfulTone: faithfulPreferred,
        sakuraNsfwPrompt: p.sakuraNsfwPrompt,
        contentProfile: p.contentProfile || p.senseProfile,
        senseProfile: p.senseProfile || p.contentProfile,
        applyNsfwLexicon: !!(faithfulPreferred || p.sakuraNsfwPrompt),
        skipFakeGreeting: true,
        dropUselessEllipsis: false,
    });
    outCues = cleaned.cues || outCues;

    // Sanitize often wipes invent/recycle fills back to「…」— one more LLM pass
    // (same chance as user batch re-MT of leftover ellipsis).
    const byOut2 = new Map((outCues || []).map((u) => [Number(u.index), String(u.text ?? '')]));
    const stillAfter = typeof stillBlank === 'function'
        ? stillBlank()
        : [];
    // stillBlank closes over outCues in caller — refresh via local check if needed
    const leftovers = (Array.isArray(cues) ? cues : []).filter((c) => {
        const src = String(c.text || '').trim();
        if (!src) return false;
        const hit = byOut2.get(Number(c.index));
        return isBlankMt?.(hit, src, baseCtx);
    });
    if (leftovers.length && !p.signal?.aborted) {
        const second = await fillBlankCuesOnce(leftovers, byOut2, {
            ...deps,
            phaseLabel: '空条再补',
        });
        blankFilled += second.blankFilled;
        shortFallback += second.shortFallback;
        incompleteRetried += second.incompleteRetried;
        outCues = cues.map((c) => ({
            index: c.index,
            startMs: c.startMs,
            endMs: c.endMs,
            text: byOut2.has(c.index) ? byOut2.get(c.index) : '',
        }));
        // Light sanitize only (skip dropUseless) so we don't wipe the second pass again
        cleaned = mtSanitize.sanitizeMtCues(outCues, cues, {
            ...pickSanitizeTargetOpts(baseCtx),
            glossaryTerms: glossaryTerms || baseCtx.glossaryTerms,
            glossary,
            nameMap,
            unifyNames: true,
            smartTranslateFaithfulTone: faithfulPreferred,
            faithfulTone: faithfulPreferred,
            sakuraNsfwPrompt: p.sakuraNsfwPrompt,
            contentProfile: p.contentProfile || p.senseProfile,
            senseProfile: p.senseProfile || p.contentProfile,
            applyNsfwLexicon: !!(faithfulPreferred || p.sakuraNsfwPrompt),
            skipFakeGreeting: true,
            dropUselessEllipsis: false,
            unstickCrossCueZh: false,
        });
        outCues = cleaned.cues || outCues;
    }

    if (typeof mtSanitize.fillBlankZhSlotsFromJa === 'function') {
        const filled = mtSanitize.fillBlankZhSlotsFromJa(outCues, cues, { blankText: '…' });
        if (filled?.filled > 0) {
            outCues = filled.cues;
            shortFallback += filled.filled;
            blankFilled += filled.filled;
        }
    }

    return {
        outCues,
        cleaned,
        blankFilled,
        shortFallback,
        incompleteRetried,
        stillAfter: stillAfter.length,
    };
}

module.exports = {
    fillOneBlankCueWithLlm,
    fillBlankCuesOnce,
    runFinalBlankSweep,
};
