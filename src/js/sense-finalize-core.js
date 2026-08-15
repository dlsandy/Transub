/**
 * Sense language-prior planning + finalize / instant-AV pure helpers.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSenseFinalize = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function senseFinalizeFactory() {
    function pathPriorSource(pathPrior, nameGuess, metaGuess) {
        if (!pathPrior) return 'name';
        if (pathPrior === nameGuess) return 'name';
        if (pathPrior === metaGuess) return 'meta';
        return 'name';
    }

    /**
     * Sync language prior — before / without sniff IPC.
     * @returns {{ done: true, prior: object } | { done: false, needSniff: true, pathPrior, metaGuess, nameGuess, sniffGate, formLang }}
     */
    function planSenseLanguagePrior({
        formLang: formLangIn,
        metaRaw: metaRawIn,
        itemPath,
        senseHints = {},
        backend = 'transub',
        hasDetectApi = true,
        senseBase = null,
        profileApi = null,
    } = {}) {
        const formLang = String(formLangIn || senseBase?.language || '').trim().toLowerCase();
        if (formLang && formLang !== 'auto') {
            return { done: true, prior: { language: formLang, source: 'form', confidence: 1 } };
        }

        const metaRaw = String(metaRawIn || '').trim().toLowerCase();
        let metaGuess = profileApi?.priorFromMetaLanguage?.(metaRaw) || null;
        // Legacy fallback only when profileApi has no priorFromMetaLanguage —
        // never promote exotic ISO tags (nn/de/…) that priorFromMetaLanguage rejects.
        if (!metaGuess && metaRaw && !profileApi?.priorFromMetaLanguage) {
            metaGuess = { language: metaRaw, confidence: 0.85, reason: '音轨标记' };
        }
        if (metaGuess?.language
            && profileApi?.isSupportedSenseLanguage
            && !profileApi.isSupportedSenseLanguage(metaGuess.language)) {
            metaGuess = null;
        }
        const nameGuess = profileApi?.guessLanguageFromName?.(itemPath) || null;

        const pathPrior = (() => {
            const candidates = [nameGuess, metaGuess].filter((g) => g?.language);
            if (!candidates.length) return null;
            return candidates.reduce((best, cur) => (
                Number(cur.confidence) > Number(best.confidence) ? cur : best
            ));
        })();

        const sniffGate = {
            metaLanguage: metaGuess?.language || '',
            metaConfidence: metaGuess?.confidence || 0,
            nameLanguage: nameGuess?.language || '',
            nameConfidence: nameGuess?.confidence || 0,
            profile: senseHints.profile,
            profileConfidence: senseHints.profileConfidence,
            profileConfident: senseHints.profileConfident,
            strongAv: senseHints.strongAv,
            forceDeep: !!senseHints.forceDeep,
        };

        const baseForGate = senseBase || { language: formLang || 'auto' };

        if (pathPrior?.language && Number(pathPrior.confidence || 0) >= 0.55) {
            if (!profileApi?.shouldSniffSpokenLanguage?.(sniffGate, baseForGate)) {
                return {
                    done: true,
                    prior: {
                        language: pathPrior.language,
                        source: pathPriorSource(pathPrior, nameGuess, metaGuess),
                        confidence: pathPrior.confidence,
                        reason: pathPrior.reason,
                    },
                };
            }
        }

        if (backend === 'twai' || !hasDetectApi) {
            if (pathPrior?.language) {
                return {
                    done: true,
                    prior: {
                        language: pathPrior.language,
                        source: pathPriorSource(pathPrior, nameGuess, metaGuess),
                        confidence: pathPrior.confidence,
                        reason: pathPrior.reason,
                    },
                };
            }
            return {
                done: true,
                prior: { language: formLang || 'auto', source: 'form', confidence: 0 },
            };
        }

        const needSniff = profileApi?.shouldSniffSpokenLanguage?.(sniffGate, baseForGate) !== false;
        if (!needSniff) {
            if (pathPrior?.language) {
                return {
                    done: true,
                    prior: {
                        language: pathPrior.language,
                        source: pathPriorSource(pathPrior, nameGuess, metaGuess),
                        confidence: pathPrior.confidence,
                        reason: pathPrior.reason,
                    },
                };
            }
            return { done: true, prior: { language: 'auto', source: 'form', confidence: 0 } };
        }

        return {
            done: false,
            needSniff: true,
            pathPrior,
            metaGuess,
            nameGuess,
            sniffGate,
            formLang: formLang || 'auto',
        };
    }

    /**
     * After sniff IPC — compete sniff vs path prior, else fall back.
     */
    function resolveSenseLanguagePriorAfterSniff({
        sniffRes = null,
        sniffWin = null,
        pathPrior = null,
        metaGuess = null,
        nameGuess = null,
        senseHints = {},
        profileApi = null,
        sniffError = '',
    } = {}) {
        const logLines = [];
        if (sniffError) {
            logLines.push({ text: sniffError, level: 'warn' });
        }

        if (sniffRes?.ok && sniffRes.language && sniffRes.language !== 'auto') {
            const conf = Number(sniffRes.confidence) || 0;
            const usedStart = Number(sniffRes.startSec);
            const skippedIntro = Number.isFinite(usedStart)
                ? usedStart >= 30
                : !!sniffWin?.skippedIntro;
            const sniff = {
                language: String(sniffRes.language).toLowerCase(),
                confidence: conf,
            };
            const avLikely = !!senseHints.strongAv
                || /软声/.test(String(pathPrior?.reason || ''));
            if (profileApi?.shouldPreferSniffLanguage?.(sniff, pathPrior, {
                skippedIntro,
                avLikely,
            })) {
                let sniffLang = sniff.language;
                if (profileApi?.coerceLanguageForSoftAv) {
                    sniffLang = profileApi.coerceLanguageForSoftAv(sniffLang, {
                        strongAv: !!senseHints.strongAv,
                        profile: senseHints.profile || '',
                    }) || sniffLang;
                }
                const winNote = sniffWin?.reason && sniffWin.startSec > 0
                    ? `，${sniffWin.reason}`
                    : '';
                return {
                    prior: {
                        language: sniffLang,
                        source: 'sniff',
                        confidence: conf,
                        reason: `短窗探测 ${(conf * 100).toFixed(0)}%${winNote}`,
                    },
                    logLines,
                };
            }
        } else if (sniffRes?.error) {
            logLines.push({ text: `语种探测跳过：${sniffRes.error}`, level: 'warn' });
        }

        if (pathPrior?.language) {
            let pathLang = pathPrior.language;
            if (profileApi?.coerceLanguageForSoftAv) {
                pathLang = profileApi.coerceLanguageForSoftAv(pathLang, {
                    strongAv: !!senseHints.strongAv,
                    profile: senseHints.profile || '',
                }) || pathLang;
            }
            return {
                prior: {
                    language: pathLang,
                    source: pathPriorSource(pathPrior, nameGuess, metaGuess),
                    confidence: pathPrior.confidence,
                    reason: pathPrior.reason,
                },
                logLines,
            };
        }
        // Soft-AV with no usable prior → Japanese dialogue default
        if (profileApi?.coerceLanguageForSoftAv
            && (senseHints.strongAv || senseHints.profile === 'av_soft')) {
            return {
                prior: {
                    language: 'ja',
                    source: 'name',
                    confidence: 0.7,
                    reason: '软声语境先验',
                },
                logLines,
            };
        }
        return {
            prior: { language: 'auto', source: 'form', confidence: 0 },
            logLines,
        };
    }

    /**
     * Pure finalize — returns sense patch + log lines (caller mutates item / appends logs).
     */
    function buildFinalizedSenseState({
        itemName = '',
        resolved: resolvedIn = {},
        langPrior = null,
        senseBase = {},
        depth = 'quick',
        refineModels = true,
        quietSkip = false,
        installedModels = [],
        advancedEntitled = false,
        demucsReady = true,
        profileApi = null,
    } = {}) {
        const logLines = [];
        const resolved = {
            ...resolvedIn,
            overrides: { ...(resolvedIn.overrides || {}) },
        };
        let overrides = { ...resolved.overrides };
        let adopted = !!resolved.adopted;
        let action = resolved.action || 'skip';
        let message = resolved.message || '';

        if (adopted
            && langPrior?.language
            && langPrior.language !== 'auto'
            && !overrides.language) {
            overrides.language = langPrior.language;
        }
        if (langPrior?.source === 'sniff'
            && langPrior.confidence >= 0.55
            && langPrior.language
            && langPrior.language !== 'auto') {
            overrides.language = langPrior.language;
            if (action === 'skip' || action === 'suggest') {
                if (!adopted && Object.keys(overrides).length) {
                    action = 'suggest';
                    adopted = false;
                }
            }
        }

        // Soft-AV: never keep exotic/wrong tags (nn/en…) into refine / adopt.
        if (profileApi?.coerceLanguageForSoftAv) {
            const coerced = profileApi.coerceLanguageForSoftAv(
                overrides.language || langPrior?.language || senseBase.language || '',
                {
                    strongAv: !!resolved.classification?.strongAv,
                    profile: resolved.classification?.profile || '',
                },
            );
            if (coerced && coerced !== 'auto') {
                overrides.language = coerced;
                if (langPrior && langPrior.language !== coerced) {
                    langPrior = { ...langPrior, language: coerced };
                }
            }
        }

        if (refineModels && profileApi?.refineSenseModels) {
            const refined = profileApi.refineSenseModels(overrides, {
                profile: resolved.classification?.profile,
                language: overrides.language || senseBase.language,
                task: senseBase.task,
                installedModels,
                device: senseBase.device,
                vramGb: senseBase.vramGb,
                hwProfile: senseBase.hwProfile || senseBase.hardwareRecommendProfile,
            });
            overrides = refined.overrides || overrides;
            if (refined.notes?.length) {
                logLines.push({
                    text: `模型匹配：${itemName} · ${refined.notes.join('；')}`,
                    level: 'info',
                });
            }
        }
        // Optional hardware recommend (VRAM profile) — never stomps JA/AV specialists.
        if (refineModels && senseBase.hardwareRecommendAsr) {
            const applyHw = typeof senseBase.applyHardwareAsrRecommend === 'function'
                ? senseBase.applyHardwareAsrRecommend
                : (typeof globalThis !== 'undefined'
                    && globalThis.TransubAsrSettings
                    && typeof globalThis.TransubAsrSettings.applyHardwareAsrRecommend === 'function'
                    ? globalThis.TransubAsrSettings.applyHardwareAsrRecommend
                    : null);
            if (typeof applyHw === 'function') {
                const hw = applyHw(overrides, {
                    recommendedAsr: senseBase.hardwareRecommendAsr,
                    profile: senseBase.hardwareRecommendProfile,
                    installedModels,
                });
                overrides = hw.overrides || overrides;
                if (hw.notes?.length) {
                    logLines.push({
                        text: `硬件推荐：${itemName} · ${hw.notes.join('；')}`,
                        level: 'info',
                    });
                }
            }
        }
        if (profileApi?.sanitizeSakuraMtForLanguage) {
            const safe = profileApi.sanitizeSakuraMtForLanguage(
                overrides,
                overrides.language || senseBase.language,
                { installedModels },
            );
            if (safe?.changed) {
                overrides = safe.options || overrides;
                if (safe.note) {
                    logLines.push({
                        text: `模型匹配：${itemName} · ${safe.note}`,
                        level: 'warn',
                    });
                }
            }
        }

        let supportGaps = [];
        if (profileApi?.collectSenseSupportGaps) {
            const gaps = profileApi.collectSenseSupportGaps(overrides, {
                profile: resolved.classification?.profile,
                language: overrides.language || senseBase.language,
                task: senseBase.task,
                installedModels,
                demucsReady,
                advancedEntitled,
            });
            supportGaps = gaps.missing || [];
        }

        const langNote = langPrior?.source === 'sniff'
            || langPrior?.source === 'meta'
            || langPrior?.source === 'name'
            ? ` · 语种 ${langPrior.language}${langPrior.reason ? `（${langPrior.reason}）` : ''}`
            : '';

        const sense = {
            status: 'done',
            adopted,
            classification: resolved.classification || null,
            overrides,
            supportGaps,
            message: message + langNote,
            action,
            languagePrior: langPrior || null,
            depth,
        };

        if (!sense.adopted
            && langPrior?.source === 'sniff'
            && langPrior.confidence >= 0.7
            && overrides.language) {
            const keys = Object.keys(overrides);
            const onlyLangOrModels = keys.every((k) => (
                k === 'language' || k === 'engineAsrModel' || k === 'engineMtModel'
            ));
            if (onlyLangOrModels) {
                sense.adopted = true;
                sense.action = 'apply';
                sense.message = `短窗语种 ${overrides.language}（${Math.round(langPrior.confidence * 100)}%）→ 已采纳`
                    + (overrides.engineAsrModel ? ` · ASR ${overrides.engineAsrModel}` : '')
                    + (overrides.engineMtModel ? ` · MT ${overrides.engineMtModel}` : '')
                    + (message ? `；${message}` : '');
            }
        }

        if (sense.message) {
            logLines.push({ text: sense.message, level: sense.adopted ? 'info' : 'warn' });
        } else if (action === 'skip' && !quietSkip) {
            logLines.push({
                text: `感知完成：${itemName} · 未识别明确类型`,
                level: 'info',
            });
        }

        return {
            sense,
            logLines,
            recordMemory: !!(sense.adopted && sense.classification?.profile),
        };
    }

    /**
     * Instant AV candidate plan (no IPC). Returns null when not applicable.
     */
    function planInstantAvSense({
        path,
        durationSec = 0,
        advancedEntitled = false,
        senseBaseOptions = {},
        profileApi = null,
    } = {}) {
        if (!profileApi?.resolveItemSense || !profileApi.isInstantAvSenseCandidate) return null;

        const nameLangGuess = profileApi.guessLanguageFromName?.(path) || null;
        const quickLang = (nameLangGuess?.language
            && Number(nameLangGuess.confidence || 0) >= 0.55)
            ? nameLangGuess.language
            : 'ja';
        const nameClassification = profileApi.classifyContentProfile?.({
            path,
            durationSec,
            language: quickLang,
        }) || null;
        if (!profileApi.isInstantAvSenseCandidate(nameClassification)) return null;

        const senseBase = {
            ...senseBaseOptions,
            language: quickLang || 'ja',
        };
        const langPrior = {
            language: senseBase.language,
            source: 'name',
            confidence: nameLangGuess?.confidence || 0.7,
            reason: nameLangGuess?.reason || '软声编号先验',
        };
        const resolved = profileApi.resolveItemSense(
            { path, durationSec },
            senseBase,
            { autoSense: true, advancedEntitled, memoryHits: [] },
        );
        return {
            senseBase,
            langPrior,
            resolved,
            classification: nameClassification,
        };
    }

    function isExplicitSenseReject(item) {
        const s = item?.sense;
        if (!s) return false;
        if (s.userRejected) return true;
        return s.action === 'suggest' && !s.adopted;
    }

    function buildRejectedSenseState(sense) {
        if (!sense) return null;
        return {
            ...sense,
            adopted: false,
            userRejected: true,
            status: sense.status === 'sensing' ? 'done' : sense.status,
            message: sense.message
                ? `${String(sense.message).replace(/（已不采纳）$/, '')}（已不采纳）`
                : '已不采纳感知方案',
        };
    }

    function buildAdoptedSenseState(sense) {
        if (!sense || sense.status !== 'done') return { ok: false, reason: 'not_done' };
        const overrides = sense.overrides || {};
        if (!Object.keys(overrides).length) {
            return { ok: false, reason: 'no_overrides' };
        }
        return {
            ok: true,
            sense: {
                ...sense,
                adopted: true,
                userRejected: false,
                action: sense.action === 'suggest' ? 'apply' : (sense.action || 'apply'),
                message: sense.message
                    ? String(sense.message).replace(/（已不采纳）/g, '').replace(/；未自动采纳$/, '')
                    : '已采纳感知方案',
            },
        };
    }

    /**
     * @returns {{ uncovered: object[], adoptIndexes: number[] }}
     */
    function planEnforceSenseAdopt(selectedItems = []) {
        const list = Array.isArray(selectedItems) ? selectedItems : [];
        const uncovered = [];
        const adoptIndexes = [];
        list.forEach((item, index) => {
            const s = item?.sense;
            if (s?.status === 'sensing') {
                uncovered.push(item);
                return;
            }
            if (isExplicitSenseReject(item)) return;
            if (s?.adopted && s.overrides && Object.keys(s.overrides).length) return;
            if (s?.status === 'done' && s.overrides && Object.keys(s.overrides).length) {
                adoptIndexes.push(index);
                return;
            }
            uncovered.push(item);
        });
        return { uncovered, adoptIndexes };
    }

    return {
        planSenseLanguagePrior,
        resolveSenseLanguagePriorAfterSniff,
        buildFinalizedSenseState,
        planInstantAvSense,
        isExplicitSenseReject,
        buildRejectedSenseState,
        buildAdoptedSenseState,
        planEnforceSenseAdopt,
    };
}));
