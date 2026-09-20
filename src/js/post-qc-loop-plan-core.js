/**
 * Post-QC closed-loop plan: retranscribe ranges + retranslate indexes from issues + bands.
 */
(function (global, factory) {
    const smartQc = (typeof module !== 'undefined' && module.exports)
        ? require('./subtitle-qc-smart-core')
        : (global && global.TransubSubtitleQcSmart);
    const policy = (typeof module !== 'undefined' && module.exports)
        ? require('./quality-pipeline-policy-core')
        : (global && global.TransubQualityPipelinePolicy);
    const api = factory(smartQc, policy);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPostQcLoopPlan = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function postQcLoopPlanFactory(smartQc, policy) {
    const SOURCE_ISSUE_TYPES = new Set([
        'connected',
        'high_cps',
        'splittable',
        'low_confidence',
        'asr_low',
        'invalid',
        'overlap',
        'short',
        'long',
    ]);
    /** Only these (plus red/hold meta) justify ASR retranscribe after MT delivery. */
    const RETRANSCRIBE_ISSUE_TYPES = new Set([
        'low_confidence',
        'asr_low',
    ]);
    const TARGET_ISSUE_TYPES = new Set([
        'blank',
        'weird',
        'fluency',
        'repetition',
        'duplicate',
        // ZH timing/shape issues → split/retranslate, not media re-ASR
        'connected',
        'high_cps',
        'splittable',
        'invalid',
        'overlap',
        'short',
        'long',
    ]);

    function isBlankOrEllipsis(text) {
        if (smartQc?.isBlankOrEllipsisZh) return smartQc.isBlankOrEllipsisZh(text);
        const t = String(text || '').trim();
        if (!t) return true;
        if (t === '…' || t === '...' || t === '⋯') return true;
        return /^[….\s]+$/.test(t);
    }

    /**
     * @returns {{
     *   retranscribeRanges: object[],
     *   retranscribeIndexes: number[],
     *   retranslateIndexes: number[],
     *   plan: string,
     *   pass: number,
     *   skip: boolean,
     *   reason?: string,
     * }}
     */
    function planPostQcLoop(cues, issues, options = {}) {
        const maxPasses = policy?.resolveEffectivePostQcLoopMaxPasses
            ? policy.resolveEffectivePostQcLoopMaxPasses(options)
            : (policy?.clampPostQcLoopMaxPasses
                ? policy.clampPostQcLoopMaxPasses(options.postQcLoopMaxPasses)
                : Math.max(0, Math.min(2, Number(options.postQcLoopMaxPasses) || 1)));
        const pass = Math.max(0, Number(options.pass) || 0);
        if (maxPasses <= 0 || pass >= maxPasses) {
            return {
                retranscribeRanges: [],
                retranscribeIndexes: [],
                retranslateIndexes: [],
                plan: '',
                pass,
                skip: true,
                reason: maxPasses <= 0 ? 'loop_disabled' : 'pass_budget',
            };
        }

        const list = Array.isArray(cues) ? cues : [];
        const issueList = Array.isArray(issues) ? issues : [];
        const bandByIndex = options.bandByIndex || {};
        const holdIndexes = [...new Set((Array.isArray(options.holdIndexes) ? options.holdIndexes : [])
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0))];

        const blankCount = issueList.filter((iss) => {
            const types = Array.isArray(iss?.types) ? iss.types : [];
            if (types.some((t) => /blank/i.test(String(t)))) return true;
            return isBlankOrEllipsis(iss?.textPreview || iss?.text);
        }).length + (Array.isArray(options.blankIndexes) ? options.blankIndexes.length : 0);

        const exhaustedSet = new Set(
            (Array.isArray(options.blankExhaustedIndexes) ? options.blankExhaustedIndexes : [])
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n) && n >= 0),
        );

        if (policy?.shouldRunPostQcLoopForSignal) {
            const gate = policy.shouldRunPostQcLoopForSignal({
                options,
                bandByIndex,
                holdIndexes,
                blankCount,
                blankExhaustedCount: exhaustedSet.size,
                issueCount: issueList.length,
                issues: issueList,
                cueCount: list.length,
            });
            if (!gate.run) {
                return {
                    retranscribeRanges: [],
                    retranscribeIndexes: [],
                    retranslateIndexes: [],
                    plan: '',
                    pass,
                    skip: true,
                    reason: gate.reason || 'low_signal',
                    signal: gate,
                };
            }
        }

        const sourceIndexes = new Set();
        const targetIndexes = new Set(holdIndexes);

        for (const issue of issueList) {
            const idx = Number(issue?.index);
            if (!Number.isInteger(idx) || idx < 0) continue;
            const types = Array.isArray(issue.types) ? issue.types : [];
            const preview = String(issue.textPreview || issue.text || '').trim();
            let sourceHit = false;
            let targetHit = false;
            for (const t of types) {
                const key = String(t);
                // ZH scan often marks long/connected dialogue — that is not ASR failure.
                // Only low_confidence / asr_low trigger re-ASR (red/hold → 补译 below).
                if (RETRANSCRIBE_ISSUE_TYPES.has(key)) sourceHit = true;
                if (TARGET_ISSUE_TYPES.has(key) || SOURCE_ISSUE_TYPES.has(key)) targetHit = true;
            }
            if (isBlankOrEllipsis(preview)) targetHit = true;
            const band = bandByIndex[idx] ?? bandByIndex[String(idx)];
            // Red / hold means “defer or retranslate” (译前门闸暂缓), not “JA is wrong —
            // re-ASR”. Re-ASR only for low_confidence / asr_low (or explicit lowConf list).
            if (band === 'red') targetHit = true;
            if (band === 'yellow' && types.some((t) => /fluency|weird|blank/i.test(String(t)))) {
                targetHit = true;
            }
            if (sourceHit) sourceIndexes.add(idx);
            if (targetHit) targetIndexes.add(idx);
        }

        for (const idx of Array.isArray(options.lowConfidenceIndexes) ? options.lowConfidenceIndexes : []) {
            const n = Number(idx);
            if (Number.isInteger(n) && n >= 0) sourceIndexes.add(n);
        }
        for (const idx of Array.isArray(options.blankIndexes) ? options.blankIndexes : []) {
            const n = Number(idx);
            if (Number.isInteger(n) && n >= 0) targetIndexes.add(n);
        }

        const retranslateCap = policy?.clampPostQcRetranslateIndexCap
            ? policy.clampPostQcRetranslateIndexCap(options.maxRetranslateIndexes)
            : Math.max(0, Math.min(200, Number(options.maxRetranslateIndexes) || 40));

        const maxRanges = Math.max(
            1,
            Math.min(40, Number(options.maxRetranscribeRanges) || 8),
        );
        let retranscribeRanges = [];
        let retranscribeIndexes = [];
        if (smartQc?.planMergedQcRetranscribeRanges && list.length && sourceIndexes.size) {
            const merged = smartQc.planMergedQcRetranscribeRanges(
                list,
                issueList,
                [...sourceIndexes],
                {
                    maxRanges,
                    maxTargets: options.maxTargets,
                    // Do not re-ASR ZH「连续文本」— only low-conf / asr_low windows.
                    types: options.retranscribeTypes || ['low_confidence', 'asr_low'],
                },
            );
            retranscribeRanges = merged.ranges || [];
            retranscribeIndexes = merged.indexes || [];
        } else if (smartQc?.buildQcRetranscribeRanges && list.length && sourceIndexes.size) {
            retranscribeRanges = smartQc.buildQcRetranscribeRanges(list, [...sourceIndexes], {
                maxRanges,
            });
            retranscribeIndexes = [...new Set(retranscribeRanges.flatMap((r) => r.indexes || []))]
                .sort((a, b) => a - b);
        } else if (sourceIndexes.size) {
            retranscribeIndexes = [...sourceIndexes].sort((a, b) => a - b).slice(0, maxRanges * 4);
            if (smartQc?.buildQcRetranscribeRanges && list.length) {
                retranscribeRanges = smartQc.buildQcRetranscribeRanges(
                    list,
                    retranscribeIndexes,
                    { maxRanges },
                );
            }
        }

        // Indexes that were re-transcribed must also be retranslated.
        // Drop blanks already exhausted by main/post blank-MT unless ASR just changed the JA.
        for (const idx of retranscribeIndexes) targetIndexes.add(idx);
        let retranslateIndexes = [...targetIndexes]
            .filter((idx) => !exhaustedSet.has(idx) || retranscribeIndexes.includes(idx))
            .sort((a, b) => a - b);
        retranslateIndexes = [...new Set([...retranslateIndexes, ...retranscribeIndexes])]
            .sort((a, b) => a - b);
        if (retranslateCap > 0 && retranslateIndexes.length > retranslateCap) {
            const red = [];
            const yellow = [];
            const other = [];
            for (const idx of retranslateIndexes) {
                const b = bandByIndex[idx] ?? bandByIndex[String(idx)];
                if (b === 'red') red.push(idx);
                else if (b === 'yellow') yellow.push(idx);
                else other.push(idx);
            }
            retranslateIndexes = [...red, ...yellow, ...other].slice(0, retranslateCap);
        }

        const parts = [];
        if (retranscribeRanges.length) parts.push(`重转 ${retranscribeRanges.length} 窗`);
        if (retranslateIndexes.length) parts.push(`重译 ${retranslateIndexes.length} 条`);
        const skip = !retranscribeRanges.length && !retranslateIndexes.length;
        return {
            retranscribeRanges,
            retranscribeIndexes,
            retranslateIndexes,
            plan: parts.join(' · ') || '无闭环动作',
            pass,
            skip,
            reason: skip ? 'nothing_to_do' : 'ok',
        };
    }

    return {
        SOURCE_ISSUE_TYPES,
        RETRANSCRIBE_ISSUE_TYPES,
        TARGET_ISSUE_TYPES,
        isBlankOrEllipsis,
        planPostQcLoop,
    };
}));
