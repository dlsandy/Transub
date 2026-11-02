/**
 * Subtitle postprocess + ZH/JA pair fixup (batch delivery / MT sanitize).
 * Injected host supplies read/write helpers from extensions-bridge (no circular require).
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {object} host
 * @param {(filePath: string) => object} host.readSubtitleDocument
 * @param {(filePath: string, payload?: object) => object} host.writeSubtitleDocument
 * @param {(filePath: string) => boolean} host.isSourceSubtitleTrack
 */
function createSubtitlePostprocess(host = {}) {
    if (typeof host.readSubtitleDocument !== 'function') {
        throw new Error('createSubtitlePostprocess: host.readSubtitleDocument required');
    }
    if (typeof host.writeSubtitleDocument !== 'function') {
        throw new Error('createSubtitlePostprocess: host.writeSubtitleDocument required');
    }
    if (typeof host.isSourceSubtitleTrack !== 'function') {
        throw new Error('createSubtitlePostprocess: host.isSourceSubtitleTrack required');
    }

    const readSubtitleDocument = host.readSubtitleDocument;
    const writeSubtitleDocument = host.writeSubtitleDocument;
    const isSourceSubtitleTrack = host.isSourceSubtitleTrack;

    function glossaryData() {
        return require('./glossary-data');
    }

    /**
     * 批量后处理：可选句读后空格、CPS 智能拆分、清理杂音/幻觉短句、压缩叠词、翻译任务简繁体，写回字幕文件。
     * 顺序：句读后空格 → CPS 拆句 → 清理杂音 → 压缩叠词 → 观影精简标点 → 简繁转换（仅繁体变体；简体目标跳过 OpenCC）。
     */
    function applySubtitlePostprocess(filePath, options = {}) {
        const doc = readSubtitleDocument(filePath);
        if (!doc.ok) return doc;

        let cues = doc.cues;
        const result = {
            ok: true,
            path: doc.path,
            beforeCount: cues.length,
            afterCount: cues.length,
            spacePunct: null,
            cpsSplit: null,
            noise: null,
            asrEcho: null,
            jaStitch: null,
            trailingEllipsis: null,
            compressRep: null,
            viewingPunct: null,
            trailingPeriod: null,
            inlineFillerStrip: null,
            fillerSoften: null,
            bilingualFillerDrop: null,
            chinese: null,
            written: false,
        };

        const doSpacePunct = options.spaceAfterChinesePunctuation === true;
        const doCpsSplit = options.cpsSplit === true;
        const doNoise = options.removeNoise === true || options.removeHallucinations === true;
        const doRemoveDuplicates = options.removeDuplicates === true;
        const doCompressRep = options.compressRepetition === true;
        const sourceTrack = isSourceSubtitleTrack(doc.path);
        // Default: delete noise (not blank to 「…」). For JA↔ZH alignment use
        // removeNoiseFromSubtitlePair / removeAlignedNoiseFromCuePairs instead.
        const blankInsteadOfRemove = options.blankInsteadOfRemove === true;
        // JA mid-phrase stitch only helps source tracks; skip on ZH.
        const stitchJaFragments = options.stitchJaFragments != null
            ? options.stitchJaFragments !== false
            : sourceTrack;
        const chineseVariant = String(options.chineseSubtitleVariant || '').trim();
        // MT already emits simplified; OpenCC twp→cn is unnecessary and can corrupt 么→幺.
        const doChinese = chineseVariant === 'traditional'
            || chineseVariant === 'traditional-tw'
            || chineseVariant === 'traditional-hk'
            || chineseVariant === 'traditional-twp';

        if (doSpacePunct) {
            let chinese;
            try {
                chinese = require('../src/js/subtitle-chinese-core');
            } catch (err) {
                return { ok: false, error: err.message || '无法加载简繁转换模块' };
            }
            const spaced = chinese.spaceAfterChinesePunctuationCues(cues);
            cues = spaced.cues;
            result.spacePunct = {
                summary: spaced.summary,
                stats: spaced.stats,
            };
        }

        if (doCpsSplit) {
            let qc;
            try {
                qc = require('../src/js/subtitle-qc-core');
            } catch (err) {
                return { ok: false, error: err.message || '无法加载 QC 模块' };
            }
            const fix = qc.applyQcFixes(cues, {
                fixOverlap: options.fixOverlap !== false,
                fixCpsBySplit: true,
                fixCpsByExtend: options.fixCpsByExtend === true,
                enforceMinDur: options.enforceMinDur === true,
                enforceMaxDur: options.enforceMaxDur !== false,
                fixInvalid: options.fixInvalid !== false,
                skipBrokenTimelineTimingFix: options.skipBrokenTimelineTimingFix !== false,
                allowInvalidCascade: options.allowInvalidCascade,
                maxCps: Number(options.maxCps) || 18,
                maxSec: Number(options.maxSec) || 10,
                smartMaxChars: Number(options.smartMaxChars) || 20,
                smartLineChars: Number(options.smartLineChars) || 18,
                targetCps: Number(options.targetCps) || 3,
                gapMs: Number(options.gapMs) >= 0 ? Number(options.gapMs) : 1,
                minSplitDurMs: Number(options.minSplitDurMs) >= 0
                    ? Math.round(Number(options.minSplitDurMs))
                    : 0,
            });
            cues = fix.cues;
            result.cpsSplit = {
                summary: fix.summary,
                beforeCount: fix.beforeCount,
                afterCount: fix.afterCount,
                stats: fix.stats,
                remaining: fix.remaining,
                remainingText: fix.remainingText,
            };
        }

        if (doNoise || doRemoveDuplicates) {
            let fluency;
            let slotCore;
            try {
                fluency = require('../src/js/subtitle-fluency-core');
                slotCore = require('../src/js/mt-subtitle-slot-core');
            } catch (err) {
                return { ok: false, error: err.message || '无法加载通顺度模块' };
            }
            const cuesBeforeNoise = sourceTrack ? null : cues.map((c) => ({ ...c }));
            // Drop leftover ASR echoes before stitch/noise (tail replay across two cues).
            if (
                doNoise
                && sourceTrack
                && options.dedupeAsrEchoes !== false
                && typeof fluency.dedupeAsrEchoCues === 'function'
            ) {
                const deduped = fluency.dedupeAsrEchoCues(cues, {
                    maxGapMs: options.asrEchoMaxGapMs,
                });
                if (deduped.removed > 0) {
                    cues = deduped.cues;
                    result.asrEcho = {
                        summary: fluency.summarizeAsrEchoDedupe(deduped.stats),
                        stats: deduped.stats,
                    };
                }
            }
            // Stitch JA mid-phrase ASR splits before deleting leftover fragments.
            if (doNoise && stitchJaFragments && typeof fluency.stitchJaFragmentCues === 'function') {
                const stitched = fluency.stitchJaFragmentCues(cues, {
                    maxGapMs: options.jaStitchMaxGapMs,
                    wideGapMs: options.jaStitchWideGapMs,
                    phraseGapMs: options.jaStitchPhraseGapMs,
                    maxMergedDurMs: options.jaStitchMaxMergedDurMs,
                    phraseStitch: options.phraseStitch !== false,
                });
                if (stitched.mergedPairs > 0) {
                    cues = stitched.cues;
                    result.jaStitch = {
                        summary: fluency.summarizeJaStitch(stitched.stats),
                        stats: stitched.stats,
                    };
                }
            }
            // ZH prenominal「…的｜名词」on translation tracks (MARR: 爱喝酒的｜青豆腐).
            if (
                doNoise
                && !sourceTrack
                && options.zhPhraseStitch !== false
                && typeof fluency.stitchZhPrenominalCues === 'function'
            ) {
                const zhStitched = fluency.stitchZhPrenominalCues(cues, {
                    phraseGapMs: options.jaStitchPhraseGapMs,
                    maxMergedDurMs: options.jaStitchMaxMergedDurMs,
                    phraseStitch: options.phraseStitch !== false,
                });
                if (zhStitched.mergedPairs > 0) {
                    cues = zhStitched.cues;
                    result.zhStitch = {
                        summary: `拼接中文半句 ${zhStitched.mergedPairs} 处（${zhStitched.stats.before}→${zhStitched.stats.after} 条）`,
                        stats: zhStitched.stats,
                    };
                }
            }
            // Never delete empty slots on translation tracks — failed/blank MT is not noise.
            const noiseBase = sourceTrack
                ? slotCore.buildSourceTrackNoiseOptions({
                    removeEmpty: doNoise && options.removeEmpty !== false,
                    removeFragments: doNoise && options.removeFragments !== false,
                    removeSoundEffects: doNoise && options.removeSoundEffects !== false,
                    removeSymbolOnly: doNoise && options.removeSymbolOnly !== false,
                    removeDuplicates: doRemoveDuplicates,
                    removeHallucinations: doNoise && options.removeHallucinations !== false,
                    blankInsteadOfRemove,
                    blankPlaceholder: options.blankPlaceholder,
                })
                : slotCore.buildTranslationTrackNoiseOptions({
                    removeDuplicates: doRemoveDuplicates,
                    removeHallucinations: doNoise && options.removeHallucinations !== false,
                    blankInsteadOfRemove,
                    blankPlaceholder: options.blankPlaceholder,
                });
            const noise = fluency.removeNoiseFromCues(cues, noiseBase);
            let guarded = noise.cues;
            let noiseGuard;
            if (!sourceTrack && cuesBeforeNoise) {
                const guardRes = slotCore.guardTranslationTrackNoiseStep({
                    beforeCues: cuesBeforeNoise,
                    afterCues: noise.cues,
                    noiseStats: noise.stats,
                    isTranslationTrack: true,
                });
                if (guardRes.reverted) {
                    guarded = guardRes.cues;
                    noiseGuard = guardRes.guard;
                }
            }
            cues = guarded;
            result.noise = {
                summary: fluency.summarizeNoiseRemoval(noise.stats),
                stats: noise.stats,
                guard: noiseGuard,
            };
            // Mens-esthe / soft-AV ASR mishears on source tracks (免税→メンエス …)
            if (doNoise && options.jaAsrDomainFix !== false) {
                try {
                    const mtSanitize = require('../src/js/mt-sanitize-core');
                    if (typeof mtSanitize.correctJaAsrDomainMishearsInCues === 'function') {
                        const domain = mtSanitize.correctJaAsrDomainMishearsInCues(cues);
                        if (domain.changed > 0) {
                            cues = domain.cues;
                            result.jaAsrDomain = {
                                changed: domain.changed,
                                summary: `ASR领域纠错 ${domain.changed} 条`,
                            };
                        }
                    }
                } catch { /* domain fix optional */ }
            }
            // Decorative trailing … from JA ASR (keep mid-cue / pure placeholders).
            if (
                doNoise
                && sourceTrack
                && options.stripAsrTrailingEllipsis !== false
                && typeof fluency.stripAsrDecorativeTrailingEllipsisInCues === 'function'
            ) {
                const stripped = fluency.stripAsrDecorativeTrailingEllipsisInCues(cues);
                if (stripped.changed > 0) {
                    cues = stripped.cues;
                    result.trailingEllipsis = {
                        changed: stripped.changed,
                        summary: `去除句尾装饰省略号 ${stripped.changed} 条`,
                    };
                }
            }
        }

        if (doCompressRep) {
            // Viewing CPS compress (出る×3 → 出る出る！) belongs on delivery ZH.
            // On JA ASR/source it invents ！ and collapses intentional repeats
            // (MUDR-403: 不二、不二、不二も → 不二、不二！も; あったかい…あったかい → glued).
            // Opt-in: compressRepetitionOnSource.
            const allowCompressOnSource = options.compressRepetitionOnSource === true;
            if (sourceTrack && !allowCompressOnSource) {
                result.compressRep = {
                    summary: '压缩叠词：已跳过原文轨',
                    stats: { cueTotal: cues.length, cueTouched: 0, skippedSource: true },
                    skippedSource: true,
                };
            } else {
                let fluency;
                try {
                    fluency = require('../src/js/subtitle-fluency-core');
                } catch (err) {
                    return { ok: false, error: err.message || '无法加载通顺度模块' };
                }
                const compressed = fluency.compressRepetitionInCues(cues, {
                    compressSingleChar: options.compressSingleChar !== false,
                    addExclaim: options.addExclaim !== false,
                    minRepeats: Number(options.minRepeats) || 3,
                });
                cues = compressed.cues;
                result.compressRep = {
                    summary: compressed.summary,
                    stats: compressed.stats,
                };
            }
        }

        // 行内清语气：唉，啊…手有点…，啊，要射了 → 手有点…，要射了（清除档；保留句末软语气「好棒啊」）
        // Run before viewing-punct so 、，… separators still help tokenize breath stacks.
        const doStripInlineFillers = options.stripInlineFillers === true
            && !sourceTrack;
        if (doStripInlineFillers) {
            let fluency;
            try {
                fluency = require('../src/js/subtitle-fluency-core');
            } catch (err) {
                return { ok: false, error: err.message || '无法加载通顺度模块' };
            }
            if (typeof fluency.stripInlineFillersInCues === 'function') {
                const stripped = fluency.stripInlineFillersInCues(cues, {
                    checkDiscourse: options.stripInlineDiscourse !== false,
                    checkOnomatopoeia: options.stripInlineOnomatopoeia !== false,
                    targetLang: options.subtitleTargetLang || options.targetLang || 'zh',
                    dropEmptied: options.stripInlineDropEmptied !== false,
                });
                cues = stripped.cues;
                if (stripped.stats?.cueTouched || stripped.stats?.dropped) {
                    result.inlineFillerStrip = {
                        summary: stripped.summary,
                        stats: stripped.stats,
                        changedIndexes: stripped.changedIndexes,
                        droppedIndexes: stripped.droppedIndexes,
                    };
                }
            }
        }

        const doViewingPunctLevel = (() => {
            const fluency = (() => {
                try { return require('../src/js/subtitle-fluency-core'); } catch { return null; }
            })();
            const norm = fluency?.normalizeViewingCleanLevel
                || ((v, fb) => {
                    const s = String(v ?? '').toLowerCase();
                    if (s === 'off' || s === 'light' || s === 'clear') return s;
                    return fb;
                });
            if (options.viewingPunctMode != null || options.simplifyViewingPunctuationLevel != null) {
                return norm(options.viewingPunctMode || options.simplifyViewingPunctuationLevel, 'off');
            }
            if (options.simplifyViewingPunctuation === true) return 'light';
            if (options.simplifyViewingPunctuation === false) return 'off';
            return 'off';
        })();
        if (doViewingPunctLevel !== 'off') {
            // Viewing-punct is for delivery ZH (观影). Applying it to JA ASR/source
            // strips 、/… that MT and archive fidelity need (PPPE-446 over-clean).
            // Opt-in: viewingPunctOnSource / simplifyViewingPunctuationOnSource.
            const allowOnSource = options.viewingPunctOnSource === true
                || options.simplifyViewingPunctuationOnSource === true;
            if (sourceTrack && !allowOnSource) {
                result.viewingPunct = {
                    summary: '观影精简标点：已跳过原文轨',
                    stats: { cueTotal: cues.length, cueTouched: 0, skippedSource: true },
                    skippedSource: true,
                };
            } else {
                let fluency;
                try {
                    fluency = require('../src/js/subtitle-fluency-core');
                } catch (err) {
                    return { ok: false, error: err.message || '无法加载通顺度模块' };
                }
                const simplified = fluency.simplifyViewingPunctuationInCues(cues, {
                    level: doViewingPunctLevel,
                });
                cues = simplified.cues;
                result.viewingPunct = {
                    summary: simplified.summary,
                    stats: simplified.stats,
                };
            }
        }

        // Always strip trailing 。／． on delivery ZH — even when viewing punct is off
        // (Murasaki/GalTransl often add sentence-final periods). Also normalize ~~ → ….
        const doStripTrailingPeriod = options.stripTrailingSentencePeriod !== false;
        if (doStripTrailingPeriod && !sourceTrack) {
            let fluency;
            try {
                fluency = require('../src/js/subtitle-fluency-core');
            } catch (err) {
                return { ok: false, error: err.message || '无法加载通顺度模块' };
            }
            if (typeof fluency.stripTrailingZhSentencePeriodInCues === 'function') {
                const stripped = fluency.stripTrailingZhSentencePeriodInCues(cues, {});
                cues = stripped.cues;
                result.trailingPeriod = {
                    summary: stripped.summary,
                    stats: stripped.stats,
                };
            }
        }

        // 语气/拟声轻度：仅压缩纯条目叠写，不删条（清除档在成对路径里做）
        const softenDiscourse = options.softenDiscourseFillers === true;
        const softenOnomatopoeia = options.softenOnomatopoeiaFillers === true;
        if (softenDiscourse || softenOnomatopoeia) {
            let fluency;
            try {
                fluency = require('../src/js/subtitle-fluency-core');
            } catch (err) {
                return { ok: false, error: err.message || '无法加载通顺度模块' };
            }
            const lang = sourceTrack
                ? 'ja'
                : (options.subtitleTargetLang || options.targetLang || 'zh');
            const softStats = { cueTouched: 0, parts: [] };
            if (softenDiscourse && typeof fluency.softenPureFillerInCues === 'function') {
                const soft = fluency.softenPureFillerInCues(cues, { kind: 'discourse', lang });
                cues = soft.cues;
                if (soft.stats?.cueTouched) {
                    softStats.cueTouched += soft.stats.cueTouched;
                    softStats.parts.push(soft.summary);
                }
            }
            if (softenOnomatopoeia && typeof fluency.softenPureFillerInCues === 'function') {
                const soft = fluency.softenPureFillerInCues(cues, { kind: 'onomatopoeia', lang });
                cues = soft.cues;
                if (soft.stats?.cueTouched) {
                    softStats.cueTouched += soft.stats.cueTouched;
                    softStats.parts.push(soft.summary);
                }
            }
            if (softStats.cueTouched) {
                result.fillerSoften = {
                    summary: softStats.parts.join(' · '),
                    stats: softStats,
                };
            }
        }

        // 合并双语轨：清除档时按行内 JA+ZH 成对删除纯语气/拟声（无需旁路原文文件）
        const dropBiDiscourse = options.dropBilingualDiscourse === true
            || (options.dropBilingualPureFillers === true
                && options.dropBilingualDiscourse == null
                && options.dropBilingualOnomatopoeia == null);
        const dropBiOnomatopoeia = options.dropBilingualOnomatopoeia === true
            || (options.dropBilingualPureFillers === true
                && options.dropBilingualDiscourse == null
                && options.dropBilingualOnomatopoeia == null);
        if (dropBiDiscourse || dropBiOnomatopoeia) {
            let fluency;
            try {
                fluency = require('../src/js/subtitle-fluency-core');
            } catch (err) {
                return { ok: false, error: err.message || '无法加载通顺度模块' };
            }
            if (typeof fluency.dropPureFillerBilingualCues === 'function') {
                const dropped = fluency.dropPureFillerBilingualCues(cues, {
                    dropDiscourse: dropBiDiscourse,
                    dropOnomatopoeia: dropBiOnomatopoeia,
                    targetLang: options.subtitleTargetLang || options.targetLang || 'zh',
                    sourceLang: options.sourceLang || 'ja',
                });
                if (!dropped.skipped && dropped.dropped) {
                    cues = dropped.cues;
                    result.bilingualFillerDrop = {
                        summary: dropped.summary,
                        dropped: dropped.dropped,
                        droppedIndexes: dropped.droppedIndexes,
                    };
                }
            }
        }

        if (doChinese) {
            let chinese;
            try {
                chinese = require('../src/js/subtitle-chinese-core');
            } catch (err) {
                return { ok: false, error: err.message || '无法加载简繁转换模块' };
            }
            let protectTerms = Array.isArray(options.protectTerms) ? options.protectTerms : null;
            if (!protectTerms) {
                try {
                    const { readGlossary } = glossaryData();
                    const { collectProtectTerms } = require('../src/js/subtitle-glossary-core');
                    const gloss = readGlossary();
                    if (gloss?.ok && gloss.glossary) {
                        protectTerms = collectProtectTerms(gloss.glossary);
                    }
                } catch {
                    /* glossary optional */
                }
            }
            const convertOpts = typeof chinese.variantToConvertOptions === 'function'
                ? chinese.variantToConvertOptions(chineseVariant)
                : { direction: 's2t', locale: 'twp' };
            const converted = chinese.convertCues(cues, {
                direction: convertOpts.direction,
                locale: convertOpts.locale,
                protectTerms: protectTerms || [],
            });
            cues = converted.cues;
            result.chinese = {
                summary: converted.summary,
                stats: converted.stats,
            };
        }

        result.afterCount = cues.length;
        const noiseTouched = result.noise && (
            Number(result.noise.stats?.removed) > 0
            || Number(result.noise.stats?.blanked) > 0
            || Number(result.noise.stats?.asrNameLoops) > 0
            || Number(result.noise.stats?.asrNormalize) > 0
        );
        const changed = result.afterCount !== result.beforeCount
            || (result.spacePunct && Number(result.spacePunct.stats?.cueTouched) > 0)
            || (result.cpsSplit && Number(result.cpsSplit.stats?.affected) > 0)
            || noiseTouched
            || (result.asrEcho && Number(result.asrEcho.stats?.removed) > 0)
            || (result.jaStitch && Number(result.jaStitch.stats?.mergedPairs) > 0)
            || (result.jaAsrDomain && Number(result.jaAsrDomain.changed) > 0)
            || (result.trailingEllipsis && Number(result.trailingEllipsis.changed) > 0)
            || (result.compressRep && Number(result.compressRep.stats?.cueTouched) > 0)
            || (result.viewingPunct && Number(result.viewingPunct.stats?.cueTouched) > 0)
            || (result.trailingPeriod && Number(result.trailingPeriod.stats?.cueTouched) > 0)
            || (result.fillerSoften && Number(result.fillerSoften.stats?.cueTouched) > 0)
            || (result.inlineFillerStrip && (
                Number(result.inlineFillerStrip.stats?.cueTouched) > 0
                || Number(result.inlineFillerStrip.stats?.dropped) > 0
            ))
            || (result.bilingualFillerDrop && Number(result.bilingualFillerDrop.dropped) > 0)
            || (result.chinese && Number(result.chinese.stats?.cueTouched) > 0);

        if (!changed) {
            return { ...result, written: false, summary: '无需后处理' };
        }
        if (!cues.length) {
            return { ok: false, error: '后处理后无剩余字幕，已取消写入', ...result, written: false };
        }

        const written = writeSubtitleDocument(doc.path, {
            cues,
            format: doc.format,
            header: doc.header,
            backupMode: options.backupMode || 'off',
        });
        if (!written.ok) return written;

        const parts = [];
        if (result.spacePunct?.summary && result.spacePunct.stats?.cueTouched) {
            parts.push(result.spacePunct.summary);
        }
        if (result.cpsSplit?.summary) parts.push(result.cpsSplit.summary);
        if (result.asrEcho?.summary && result.asrEcho.stats?.removed) {
            parts.push(result.asrEcho.summary);
        }
        if (result.jaStitch?.summary && result.jaStitch.stats?.mergedPairs) {
            parts.push(result.jaStitch.summary);
        }
        if (result.trailingEllipsis?.summary && result.trailingEllipsis.changed) {
            parts.push(result.trailingEllipsis.summary);
        }
        if (result.noise?.summary && (result.noise.stats?.removed || result.noise.stats?.blanked)) {
            parts.push(result.noise.summary);
        }
        if (result.compressRep?.summary && result.compressRep.stats?.cueTouched) {
            parts.push(result.compressRep.summary.replace(/^将/, '已'));
        }
        if (result.viewingPunct?.summary && result.viewingPunct.stats?.cueTouched) {
            parts.push(result.viewingPunct.summary);
        }
        if (result.trailingPeriod?.summary && result.trailingPeriod.stats?.cueTouched) {
            parts.push(result.trailingPeriod.summary);
        }
        if (result.fillerSoften?.summary && result.fillerSoften.stats?.cueTouched) {
            parts.push(result.fillerSoften.summary);
        }
        if (result.inlineFillerStrip?.summary
            && (result.inlineFillerStrip.stats?.cueTouched || result.inlineFillerStrip.stats?.dropped)) {
            parts.push(result.inlineFillerStrip.summary);
        }
        if (result.bilingualFillerDrop?.summary && result.bilingualFillerDrop.dropped) {
            parts.push(result.bilingualFillerDrop.summary);
        }
        if (result.chinese?.summary && result.chinese.stats?.cueTouched) parts.push(result.chinese.summary);
        return {
            ...result,
            written: true,
            summary: parts.join('；') || `已更新（${result.beforeCount} → ${result.afterCount} 条）`,
        };
    }

    /**
     * Delete noise from ZH+JA subtitle files together (union of noisy indexes) and renumber.
     * Keeps JA↔ZH cue counts aligned without blanking ZH to 「…」.
     * @param {string} targetPath
     * @param {string} sourcePath
     * @param {object} [options]
     */
    function removeNoiseFromSubtitlePair(targetPath, sourcePath = '', options = {}) {
        const target = readSubtitleDocument(targetPath);
        if (!target.ok) return target;

        let sourceCues = Array.isArray(options.sourceCues) ? options.sourceCues : [];
        const srcPath = String(sourcePath || options.sourcePath || '').trim();
        let sourceDoc = null;
        if (srcPath) {
            try {
                if (fs.existsSync(path.resolve(srcPath))) {
                    sourceDoc = readSubtitleDocument(srcPath);
                    if (sourceDoc.ok && Array.isArray(sourceDoc.cues) && sourceDoc.cues.length) {
                        sourceCues = sourceDoc.cues;
                    }
                }
            } catch { /* keep sourceCues fallback */ }
        }
        if (!sourceCues.length) {
            return {
                ok: true,
                removed: 0,
                skipped: true,
                reason: 'no_source',
                path: target.path,
            };
        }

        let fluency;
        try {
            fluency = require('../src/js/subtitle-fluency-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载通顺度模块' };
        }
        if (typeof fluency.removeAlignedNoiseFromCuePairs !== 'function') {
            return { ok: false, error: '通顺度模块缺少成对清噪接口' };
        }

        // Phrase/mid-word JA stitch with lockstep ZH (before noise delete).
        let workingZh = target.cues;
        let stitchStats = null;
        let echoStats = null;
        // Echo dedupe on equal-length JA↔ZH: drop JA leftover + matching ZH index.
        if (
            options.dedupeAsrEchoes !== false
            && workingZh.length === sourceCues.length
            && typeof fluency.dedupeAsrEchoCues === 'function'
            && typeof fluency.isAsrEchoPair === 'function'
        ) {
            const maxGapMs = Math.max(0, Math.min(12000, Number(options.asrEchoMaxGapMs) || 4000));
            const nextZh = [];
            const nextJa = [];
            let removed = 0;
            for (let i = 0; i < sourceCues.length; i += 1) {
                const ja = sourceCues[i];
                const zh = workingZh[i];
                if (nextJa.length) {
                    const prevJa = nextJa[nextJa.length - 1];
                    const gap = (Number(ja?.startMs) || 0) - (Number(prevJa?.endMs) || 0);
                    if (
                        Number.isFinite(gap)
                        && gap <= maxGapMs
                        && fluency.isAsrEchoPair(prevJa?.text, ja?.text)
                    ) {
                        const prevBare = fluency.bareAsrEchoText(prevJa?.text);
                        const curBare = fluency.bareAsrEchoText(ja?.text);
                        if (curBare.length > prevBare.length) {
                            nextJa[nextJa.length - 1] = ja;
                            nextZh[nextZh.length - 1] = zh;
                        }
                        removed += 1;
                        continue;
                    }
                }
                nextJa.push(ja);
                nextZh.push(zh);
            }
            if (removed > 0) {
                workingZh = nextZh;
                sourceCues = nextJa;
                echoStats = {
                    before: target.cues.length,
                    after: nextJa.length,
                    removed,
                };
            }
        }
        if (
            options.stitchJaFragments !== false
            && typeof fluency.stitchAlignedJaZhFragmentPairs === 'function'
        ) {
            const stitched = fluency.stitchAlignedJaZhFragmentPairs(workingZh, sourceCues, {
                maxGapMs: options.jaStitchMaxGapMs,
                wideGapMs: options.jaStitchWideGapMs,
                phraseGapMs: options.jaStitchPhraseGapMs,
                maxMergedDurMs: options.jaStitchMaxMergedDurMs,
                phraseStitch: options.phraseStitch !== false,
            });
            if (!stitched.skipped && stitched.mergedPairs > 0) {
                workingZh = stitched.zhCues;
                sourceCues = stitched.jaCues;
                stitchStats = stitched.stats;
            }
        }

        const before = workingZh.length;
        let slotCore;
        try {
            slotCore = require('../src/js/mt-subtitle-slot-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载译文字幕保护模块' };
        }
        const cleaned = fluency.removeAlignedNoiseFromCuePairs(workingZh, sourceCues, {
            removeEmpty: options.removeEmpty !== false,
            removeFragments: options.removeFragments !== false,
            removeSoundEffects: options.removeSoundEffects !== false,
            removeSymbolOnly: options.removeSymbolOnly !== false,
            removeDuplicates: options.removeDuplicates !== false,
            removeHallucinations: options.removeHallucinations !== false,
            hallucinationMaxChars: options.hallucinationMaxChars,
            hallucinationMaxDurMs: options.hallucinationMaxDurMs,
        });
        if (cleaned.skipped) {
            let skipJa = sourceCues;
            let skipEllipsis = 0;
            if (
                options.stripAsrTrailingEllipsis !== false
                && typeof fluency.stripAsrDecorativeTrailingEllipsisInCues === 'function'
            ) {
                const stripped = fluency.stripAsrDecorativeTrailingEllipsisInCues(skipJa);
                if (stripped.changed > 0) {
                    skipJa = stripped.cues;
                    skipEllipsis = Number(stripped.changed) || 0;
                }
            }
            // Persist echo/stitch/ellipsis progress when noise path skips.
            if (stitchStats?.mergedPairs || echoStats?.removed || skipEllipsis) {
                const writtenZh = writeSubtitleDocument(target.path, {
                    cues: workingZh,
                    format: target.format,
                    header: target.header,
                    backupMode: options.backupMode || 'off',
                });
                if (!writtenZh.ok) return writtenZh;
                let sourceWritten = false;
                if (
                    options.writeSource !== false
                    && sourceDoc?.ok
                    && srcPath
                    && fs.existsSync(path.resolve(srcPath))
                ) {
                    const srcWrite = writeSubtitleDocument(sourceDoc.path, {
                        cues: skipJa,
                        format: sourceDoc.format,
                        header: sourceDoc.header,
                        backupMode: options.backupMode || 'off',
                    });
                    sourceWritten = !!srcWrite.ok;
                }
                const parts = [];
                if (echoStats?.removed) parts.push(fluency.summarizeAsrEchoDedupe(echoStats));
                if (stitchStats?.mergedPairs) parts.push(fluency.summarizeJaStitch(stitchStats));
                if (skipEllipsis) parts.push(`去除句尾装饰省略号 ${skipEllipsis} 条`);
                return {
                    ok: true,
                    removed: Number(echoStats?.removed) || 0,
                    stitched: stitchStats?.mergedPairs || 0,
                    path: target.path,
                    sourcePath: srcPath || undefined,
                    sourceWritten,
                    asrEcho: echoStats || undefined,
                    jaStitch: stitchStats || undefined,
                    trailingEllipsis: skipEllipsis ? { changed: skipEllipsis } : undefined,
                    summary: parts.join('；'),
                    written: true,
                };
            }
            return {
                ok: true,
                removed: 0,
                skipped: true,
                reason: cleaned.reason || 'skipped',
                path: target.path,
                sourcePath: srcPath || undefined,
            };
        }
        const noiseRemoved = Number(cleaned.stats?.removed) || 0;
        let outZh = noiseRemoved ? cleaned.zhCues : workingZh;
        let outJa = noiseRemoved ? cleaned.jaCues : sourceCues;
        let trailingEllipsisChanged = 0;
        if (
            options.stripAsrTrailingEllipsis !== false
            && typeof fluency.stripAsrDecorativeTrailingEllipsisInCues === 'function'
        ) {
            const stripped = fluency.stripAsrDecorativeTrailingEllipsisInCues(outJa);
            if (stripped.changed > 0) {
                outJa = stripped.cues;
                trailingEllipsisChanged = Number(stripped.changed) || 0;
            }
        }
        if (!noiseRemoved && !stitchStats?.mergedPairs && !echoStats?.removed
            && !trailingEllipsisChanged) {
            return {
                ok: true,
                removed: 0,
                path: target.path,
                sourcePath: srcPath || undefined,
                summary: fluency.summarizeNoiseRemoval(cleaned.stats),
            };
        }
        if (!outZh.length) {
            return {
                ok: false,
                error: '清噪后无剩余字幕，已取消写入',
                removed: noiseRemoved,
                path: target.path,
            };
        }

        const massLoss = slotCore.detectTranslationSlotMassDeletion({
            beforeCount: before,
            afterCount: outZh.length,
            sourceCount: sourceCues.length,
            isTranslationTrack: true,
        });
        if (massLoss.blocked) {
            return {
                ok: false,
                error: '检测到译文字幕大规模丢失（可能误删空白占位），已取消写入',
                guard: massLoss,
                removed: noiseRemoved,
                path: target.path,
                sourcePath: srcPath || undefined,
            };
        }

        const writtenZh = writeSubtitleDocument(target.path, {
            cues: outZh,
            format: target.format,
            header: target.header,
            backupMode: options.backupMode || 'off',
        });
        if (!writtenZh.ok) return writtenZh;

        let sourceWritten = false;
        if (
            options.writeSource !== false
            && sourceDoc?.ok
            && srcPath
            && fs.existsSync(path.resolve(srcPath))
        ) {
            const srcWrite = writeSubtitleDocument(sourceDoc.path, {
                cues: outJa,
                format: sourceDoc.format,
                header: sourceDoc.header,
                backupMode: options.backupMode || 'off',
            });
            sourceWritten = !!srcWrite.ok;
        }

        const parts = [];
        if (echoStats?.removed) parts.push(fluency.summarizeAsrEchoDedupe(echoStats));
        if (stitchStats?.mergedPairs) parts.push(fluency.summarizeJaStitch(stitchStats));
        if (noiseRemoved) parts.push(fluency.summarizeNoiseRemoval(cleaned.stats));
        if (trailingEllipsisChanged) {
            parts.push(`去除句尾装饰省略号 ${trailingEllipsisChanged} 条`);
        }
        return {
            ok: true,
            removed: noiseRemoved + (Number(echoStats?.removed) || 0),
            stitched: stitchStats?.mergedPairs || 0,
            beforeCount: before,
            afterCount: outZh.length,
            path: target.path,
            sourcePath: srcPath || undefined,
            sourceWritten,
            stats: cleaned.stats,
            asrEcho: echoStats || undefined,
            jaStitch: stitchStats || undefined,
            trailingEllipsis: trailingEllipsisChanged
                ? { changed: trailingEllipsisChanged }
                : undefined,
            summary: parts.join('；') || fluency.summarizeNoiseRemoval(cleaned.stats),
            written: true,
        };
    }

    /**
     * Optional compact delivery: drop pure interjection / moan cues from both ZH and JA
     * when both sides are filler-only, then renumber on write.
     * @param {string} targetPath - Chinese / translation subtitle
     * @param {string} [sourcePath] - Japanese / ASR source subtitle
     * @param {object} [options]
     * @returns {{ ok: boolean, dropped?: number, skipped?: boolean, reason?: string, path?: string, sourcePath?: string, summary?: string, error?: string }}
     */
    function compactPureInterjectionSubtitlePair(targetPath, sourcePath = '', options = {}) {
        const target = readSubtitleDocument(targetPath);
        if (!target.ok) return target;

        let sourceCues = Array.isArray(options.sourceCues) ? options.sourceCues : [];
        const srcPath = String(sourcePath || options.sourcePath || '').trim();
        let sourceDoc = null;
        if (srcPath) {
            try {
                if (fs.existsSync(path.resolve(srcPath))) {
                    sourceDoc = readSubtitleDocument(srcPath);
                    if (sourceDoc.ok && Array.isArray(sourceDoc.cues) && sourceDoc.cues.length) {
                        sourceCues = sourceDoc.cues;
                    }
                }
            } catch { /* keep sourceCues fallback */ }
        }
        if (!sourceCues.length) {
            return {
                ok: true,
                dropped: 0,
                skipped: true,
                reason: 'no_source',
                path: target.path,
            };
        }

        let fluency;
        try {
            fluency = require('../src/js/subtitle-fluency-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载通顺度模块' };
        }
        if (typeof fluency.dropPureInterjectionPairs !== 'function') {
            return { ok: false, error: '通顺度模块缺少成对精简接口' };
        }

        const before = target.cues.length;
        const dropDiscourse = options.dropDiscourse !== false;
        const dropOnomatopoeia = options.dropOnomatopoeia !== false;
        const droppedRes = fluency.dropPureInterjectionPairs(target.cues, sourceCues, {
            dropDiscourse,
            dropOnomatopoeia,
            targetLang: options.subtitleTargetLang || options.targetLang || 'zh',
            sourceLang: options.sourceLang || 'ja',
        });
        // User setting (含番号 / AV soft) wins — no mass-drop cap that silently skips clear mode.
        if (droppedRes.skipped) {
            return {
                ok: true,
                dropped: 0,
                skipped: true,
                reason: droppedRes.reason || 'skipped',
                path: target.path,
                sourcePath: srcPath || undefined,
            };
        }
        if (!droppedRes.dropped) {
            return {
                ok: true,
                dropped: 0,
                path: target.path,
                sourcePath: srcPath || undefined,
                summary: fluency.summarizePureInterjectionDrop?.(0, {
                    dropDiscourse,
                    dropOnomatopoeia,
                })
                    || '未发现可清除的纯语气/拟声条目',
            };
        }

        const writtenZh = writeSubtitleDocument(target.path, {
            cues: droppedRes.zhCues,
            format: target.format,
            header: target.header,
            backupMode: options.backupMode || 'off',
        });
        if (!writtenZh.ok) return writtenZh;

        let writtenSrc = false;
        if (
            options.writeSource !== false
            && sourceDoc?.ok
            && srcPath
            && fs.existsSync(path.resolve(srcPath))
        ) {
            const srcWrite = writeSubtitleDocument(sourceDoc.path, {
                cues: droppedRes.jaCues,
                format: sourceDoc.format,
                header: sourceDoc.header,
                backupMode: options.backupMode || 'off',
            });
            writtenSrc = !!srcWrite.ok;
        }

        const summary = fluency.summarizePureInterjectionDrop?.(droppedRes.dropped, {
            dropDiscourse,
            dropOnomatopoeia,
        })
            || `清除纯语气/拟声 ${droppedRes.dropped} 条`;
        return {
            ok: true,
            dropped: droppedRes.dropped,
            beforeCount: before,
            afterCount: droppedRes.zhCues.length,
            path: target.path,
            sourcePath: srcPath || undefined,
            sourceWritten: writtenSrc,
            summary,
        };
    }

    function recoverBlankedMtCues(cleanedCues, sourceCues, options = {}) {
        let mtSanitize;
        try {
            mtSanitize = require('../src/js/mt-sanitize-core');
        } catch {
            return { cues: cleanedCues, recovered: 0 };
        }
        if (options.recoverBlanked === false) {
            return { cues: cleanedCues, recovered: 0 };
        }

        let dualCore = null;
        let sourceOverlapIndex = null;
        try {
            dualCore = require('../src/js/dual-subtitle-core');
            if (typeof dualCore.buildOverlapIndex === 'function') {
                sourceOverlapIndex = dualCore.buildOverlapIndex(sourceCues);
            }
        } catch { /* optional */ }

        let smartCore = null;
        try {
            smartCore = require('../src/js/advanced-smart-translate-core');
        } catch { /* optional */ }
        if (!smartCore) {
            try {
                const { loadClosedSmartTranslateCore } = require('./advanced-closed-api');
                smartCore = loadClosedSmartTranslateCore();
            } catch { /* optional */ }
        }

        const fillOpts = {
            contentProfile: options.contentProfile || options.senseProfile,
            senseProfile: options.senseProfile || options.contentProfile,
            smartTranslateFaithfulTone: options.smartTranslateFaithfulTone || options.faithfulTone,
            faithfulTone: options.faithfulTone || options.smartTranslateFaithfulTone,
            sakuraNsfwPrompt: options.sakuraNsfwPrompt,
            nsfwPrompt: options.nsfwPrompt,
            skipFakeGreeting: options.skipFakeGreeting,
            subtitleTargetLang: options.subtitleTargetLang || options.targetLang,
            targetLang: options.targetLang || options.subtitleTargetLang,
            targetLanguage: options.targetLanguage,
            chineseSubtitleVariant: options.chineseSubtitleVariant,
        };

        let recovered = 0;
        const cues = (cleanedCues || []).map((c, i) => {
            let text = String(c?.text ?? '');
            if (!mtSanitize.isEllipsisOrEmptyZh?.(text)) {
                return c;
            }
            let src = '';
            if (dualCore?.findBestOverlapCue) {
                const startMs = Number(c?.startMs) || 0;
                const endMs = c?.endMs != null ? Number(c.endMs) : startMs + 2000;
                try {
                    const hit = dualCore.findBestOverlapCue(sourceCues, startMs, endMs, {
                        index: sourceOverlapIndex,
                        maxStartGapMs: 2500,
                    });
                    src = String(hit?.cue?.text ?? '');
                } catch { /* ignore */ }
            }
            if (!src.trim()) {
                src = String(sourceCues[i]?.text ?? '');
            }
            if (!src.trim()) return c;

            const rec = mtSanitize.recoverBlankedAdultZh?.(text, src, fillOpts);
            if (rec?.changed && String(rec.text || '').trim()
                && !mtSanitize.isEllipsisOrEmptyZh?.(rec.text)
                && !mtSanitize.isMostlyUntranslatedJa?.(rec.text)) {
                recovered += 1;
                return { ...c, text: rec.text };
            }
            const fb = smartCore?.fallbackShortJaCue?.(src, fillOpts);
            if (fb && String(fb).trim()
                && !mtSanitize.isEllipsisOrEmptyZh?.(fb)
                && !mtSanitize.isMostlyUntranslatedJa?.(fb)) {
                recovered += 1;
                return { ...c, text: fb };
            }
            return c;
        });
        return { cues, recovered };
    }

    /**
     * Final delivery: delete translation cues whose text is only ellipsis / blank MT
     * placeholders (… / ... / ……). When JA↔ZH lists are same-length and aligned,
     * drop the paired JA row too, then renumber both files.
     * @param {string} targetPath - Chinese / translation subtitle
     * @param {string} [sourcePath] - Japanese / ASR source subtitle
     * @param {object} [options]
     * @returns {{ ok: boolean, dropped?: number, skipped?: boolean, reason?: string, path?: string, sourcePath?: string, sourceWritten?: boolean, summary?: string, error?: string }}
     */
    function removeEllipsisOnlyDeliveryPair(targetPath, sourcePath = '', options = {}) {
        const target = readSubtitleDocument(targetPath);
        if (!target.ok) return target;

        let sourceCues = Array.isArray(options.sourceCues) ? options.sourceCues : [];
        const srcPath = String(sourcePath || options.sourcePath || '').trim();
        let sourceDoc = null;
        if (srcPath) {
            try {
                if (fs.existsSync(path.resolve(srcPath))) {
                    sourceDoc = readSubtitleDocument(srcPath);
                    if (sourceDoc?.ok && Array.isArray(sourceDoc.cues) && sourceDoc.cues.length) {
                        sourceCues = sourceDoc.cues;
                    }
                }
            } catch { /* keep sourceCues fallback */ }
        }

        let mtSanitize;
        let slotCore;
        try {
            mtSanitize = require('../src/js/mt-sanitize-core');
            slotCore = require('../src/js/mt-subtitle-slot-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载译后清洗模块' };
        }
        const isEllipsisOnly = (text) => (
            typeof mtSanitize.isEllipsisOrEmptyZh === 'function'
                ? mtSanitize.isEllipsisOrEmptyZh(text)
                : slotCore.isBlankMtSlotText(text)
        );

        let zhWorking = Array.isArray(target.cues) ? target.cues.map((c) => ({ ...c })) : [];
        let sourceWorking = Array.isArray(sourceCues) ? sourceCues.map((c) => ({ ...c })) : [];
        let rematerialized = false;
        let unpairedTimePrune = false;
        const hasEllipsis = zhWorking.some((c) => isEllipsisOnly(String(c?.text ?? '')));
        let paired = sourceWorking.length > 0 && sourceWorking.length === zhWorking.length;

        // Unequal counts + ellipsis present: time-align prune without inventing new JA slots
        // (full rematerialize used to mint「…」for orphan JA and regress clean tracks like ABF-384).
        if (!paired && sourceWorking.length > 0 && hasEllipsis) {
            let dualCore = null;
            let overlapIndex = null;
            try {
                dualCore = require('../src/js/dual-subtitle-core');
                overlapIndex = dualCore.buildOverlapIndex?.(sourceWorking) || null;
            } catch { /* optional */ }
            let ellipsisPolicy = null;
            try {
                ellipsisPolicy = require('../src/js/hymt-ellipsis-policy-core');
            } catch { /* optional */ }
            const keptZh = [];
            let dropped = 0;
            let keptLexicalBlank = 0;
            let detFilled = 0;
            const jaByStart = new Map(
                sourceWorking.map((c) => [Math.round(Number(c.startMs) || 0), c]),
            );
            const recoverOpts = {
                contentProfile: options.contentProfile || options.senseProfile || 'av_soft',
                smartTranslateFaithfulTone: options.smartTranslateFaithfulTone !== false,
                sakuraNsfwPrompt: options.sakuraNsfwPrompt !== false,
                postBatchRemoveNoise: true,
            };
            for (let i = 0; i < zhWorking.length; i += 1) {
                const text = String(zhWorking[i]?.text ?? '').trim();
                if (!isEllipsisOnly(text)) {
                    keptZh.push({ ...zhWorking[i] });
                    continue;
                }
                let jaText = '';
                const sm = Math.round(Number(zhWorking[i]?.startMs) || 0);
                if (jaByStart.has(sm)) jaText = String(jaByStart.get(sm)?.text ?? '');
                // Exact startMs often misses after credit insert / TEN realign — fuzzy ±800ms.
                if (!jaText && Number.isFinite(sm) && sm > 0) {
                    let best = null;
                    let bestAbs = Infinity;
                    for (const jc of sourceWorking) {
                        const js = Math.round(Number(jc?.startMs) || 0);
                        if (!js) continue;
                        const d = Math.abs(js - sm);
                        if (d < bestAbs) {
                            bestAbs = d;
                            best = jc;
                        }
                    }
                    if (best && bestAbs <= 800) jaText = String(best.text ?? '');
                }
                if (!jaText && dualCore?.findBestOverlapCue) {
                    const hit = dualCore.findBestOverlapCue(
                        sourceWorking,
                        Number(zhWorking[i]?.startMs) || 0,
                        Number(zhWorking[i]?.endMs) || Number(zhWorking[i]?.startMs) || 0,
                        { maxStartGapMs: 2500, index: overlapIndex },
                    );
                    if (hit?.cue) jaText = String(hit.cue.text ?? '');
                }
                // Noise / moan / empty → drop before any recover invent.
                let forceDelete = !jaText;
                if (!forceDelete && ellipsisPolicy?.planEllipsisSlotAction) {
                    const plan = ellipsisPolicy.planEllipsisSlotAction(jaText, text, {});
                    forceDelete = plan.action === 'delete';
                } else if (!forceDelete && mtSanitize?.jaCueHasLexicalResidue) {
                    const lexical = !!mtSanitize.jaCueHasLexicalResidue(jaText);
                    const moan = !!mtSanitize.isMoanOrSfxHeavyJa?.(jaText);
                    forceDelete = !lexical || moan;
                }
                if (forceDelete) {
                    dropped += 1;
                    continue;
                }
                // Lexical leftover: last-chance recover; never ship bare「…」.
                let recovered = '';
                if (ellipsisPolicy?.deterministicEllipsisFill) {
                    try {
                        const hit = ellipsisPolicy.deterministicEllipsisFill(jaText, recoverOpts);
                        if (hit && !isEllipsisOnly(String(hit).trim())) recovered = String(hit).trim();
                    } catch { /* try sanitize */ }
                }
                if (!recovered && typeof mtSanitize.sanitizeMtCueText === 'function') {
                    try {
                        const filledOne = mtSanitize.sanitizeMtCueText('…', jaText, recoverOpts);
                        const nt = String(filledOne?.text || '').trim();
                        if (nt && !isEllipsisOnly(nt)) recovered = nt;
                    } catch { /* drop below */ }
                }
                if (recovered) {
                    keptZh.push({ ...zhWorking[i], text: recovered });
                    detFilled += 1;
                    continue;
                }
                dropped += 1;
            }

            keptZh.forEach((c, idx) => {
                c.index = idx + 1;
            });
            if (typeof mtSanitize.fillBlankZhSlotsFromJa === 'function') {
                // Prefer startMs/overlap — list index is unreliable on unpaired tracks.
                const filled = mtSanitize.fillBlankZhSlotsFromJa(keptZh, sourceWorking);
                if (filled?.filled > 0) {
                    keptZh.length = 0;
                    keptZh.push(...filled.cues);
                    keptZh.forEach((c, idx) => {
                        c.index = idx + 1;
                    });
                    detFilled += filled.filled;
                }
            }
            // Sweep any … that fillBlank could not resolve.
            for (let i = keptZh.length - 1; i >= 0; i -= 1) {
                if (isEllipsisOnly(String(keptZh[i]?.text ?? ''))) {
                    keptZh.splice(i, 1);
                    dropped += 1;
                    keptLexicalBlank = Math.max(0, keptLexicalBlank - 1);
                }
            }
            keptZh.forEach((c, idx) => {
                c.index = idx + 1;
            });

            if (!dropped && !detFilled) {
                return {
                    ok: true,
                    dropped: 0,
                    keptLexicalBlank,
                    skipped: true,
                    reason: keptLexicalBlank ? 'kept_lexical_blanks' : 'none',
                    unpairedTimePrune: true,
                    beforeCount: zhWorking.length,
                    afterCount: zhWorking.length,
                    path: target.path,
                    sourcePath: srcPath || undefined,
                };
            }

            const writtenZh = writeSubtitleDocument(target.path, {
                cues: keptZh,
                format: target.format,
                header: target.header,
                backupMode: options.backupMode || 'off',
            });
            if (!writtenZh.ok) return writtenZh;
            unpairedTimePrune = true;
            return {
                ok: true,
                dropped,
                keptLexicalBlank,
                detFilled,
                unpairedTimePrune,
                beforeCount: zhWorking.length,
                afterCount: keptZh.length,
                path: target.path,
                sourcePath: srcPath || undefined,
                sourceWritten: false,
                summary: `按时间轴清理省略号 ${dropped} 条（未对齐轨，${zhWorking.length}→${keptZh.length}）${detFilled ? ` · 确定性补全 ${detFilled}` : ''}`,
                written: true,
            };
        }

        if (!paired && sourceWorking.length > 0) {
            return {
                ok: true,
                dropped: 0,
                skipped: true,
                reason: 'unpaired_count_guard',
                path: target.path,
                sourcePath: srcPath || undefined,
                sourceCount: sourceWorking.length,
                targetCount: zhWorking.length,
            };
        }
        let ellipsisPolicy = null;
        try {
            ellipsisPolicy = require('../src/js/hymt-ellipsis-policy-core');
        } catch { /* optional */ }

        const keptZh = [];
        const keptJa = [];
        let dropped = 0;
        let keptLexicalBlank = 0;
        let detFilled = 0;
        const zhBefore = zhWorking;
        const recoverOpts = {
            contentProfile: options.contentProfile || options.senseProfile || 'av_soft',
            smartTranslateFaithfulTone: options.smartTranslateFaithfulTone !== false,
            sakuraNsfwPrompt: options.sakuraNsfwPrompt !== false,
            postBatchRemoveNoise: true,
        };

        /** Prefer shipping incomplete ZH over wiping real JA dialogue (IESP-763 加奈と申します).
         * Never keep slots the ellipsis plan already classed as delete (asr_debris/moan) —
         * isSubstantiveJa is too loose on katakana mash and would otherwise ship bare「…」. */
        const shouldKeepSubstantiveEllipsisSlot = (jaText, jaCue) => {
            const ja = String(jaText || '').trim();
            if (!ja) return false;
            try {
                if (ellipsisPolicy?.isDeterministicAsrDebrisJa?.(ja)
                    || ellipsisPolicy?.isPureMoanOrSfxJa?.(ja)) {
                    return false;
                }
                const plan = ellipsisPolicy?.planEllipsisSlotAction?.(ja, '…', {});
                if (plan?.action === 'delete') return false;
            } catch { /* optional */ }
            try {
                const fluency = require('../src/js/subtitle-fluency-core');
                if (fluency.shouldPreserveSubstantiveDialogueCue?.(jaCue || null, ja)) {
                    return true;
                }
            } catch { /* optional */ }
            try {
                // Only keep bare「…」when JA is truly substantive dialogue.
                // Do not keep merely because plan says lexical_blank (scraps used to fall through).
                if (ellipsisPolicy?.isSubstantiveJa?.(ja)) return true;
                const plan = ellipsisPolicy?.planEllipsisSlotAction?.(ja, '…', {});
                if (
                    plan?.action === 'recover'
                    && plan?.reason === 'lexical_blank'
                    && ellipsisPolicy?.isSubstantiveJa?.(ja)
                ) {
                    return true;
                }
            } catch { /* optional */ }
            return false;
        };

        // Final delivery: hard-drop ASR debris/moan; last-chance fill bare「…」;
        // substantive unrecovered lexical → keep slot (never pair-delete real dialogue).
        for (let i = 0; i < zhBefore.length; i += 1) {
            const text = String(zhBefore[i]?.text ?? '').trim();
            const jaText = paired ? String(sourceWorking[i]?.text ?? '') : '';
            if (paired && jaText) {
                let hardDrop = false;
                if (typeof mtSanitize.isDeterministicAsrDebrisJaForSanitize === 'function') {
                    hardDrop = !!mtSanitize.isDeterministicAsrDebrisJaForSanitize(jaText, text);
                }
                // Also consult ellipsis plan — sanitize debris helper ignores filler ZH「嗯」
                // on pure ん breath, which previously shipped dozens of「嗯」slots (YUJ-071).
                if (!hardDrop && ellipsisPolicy?.planEllipsisSlotAction) {
                    const plan = ellipsisPolicy.planEllipsisSlotAction(jaText, text, {
                        prevJa: i > 0 ? sourceWorking[i - 1]?.text : '',
                        nextJa: i + 1 < sourceWorking.length ? sourceWorking[i + 1]?.text : '',
                    });
                    hardDrop = plan.action === 'delete'
                        && (
                            plan.reason === 'asr_garbage'
                            || plan.reason === 'asr_debris'
                            || plan.reason === 'asr_scrap'
                            || plan.reason === 'asr_crumb'
                            || plan.reason === 'non_substantive_blank'
                            || plan.reason === 'pure_moan'
                            || plan.reason === 'empty_ja'
                        );
                }
                // Never hard-drop substantive dialogue even if a debris heuristic misfires.
                if (hardDrop && shouldKeepSubstantiveEllipsisSlot(jaText, sourceWorking[i])) {
                    hardDrop = false;
                }
                if (hardDrop) {
                    dropped += 1;
                    continue;
                }
                // Filler ZH「嗯/哈」on short JA: prefer lexical det-fill (まあ→反正) over shipping 嗯.
                const fillerOnlyZh = /^(?:嗯+|嗯嗯|哈+|啊+|哦+|诶)[…·.~～！!？?\s]*$/u.test(text);
                if (fillerOnlyZh && ellipsisPolicy?.deterministicEllipsisFill) {
                    try {
                        const hit = String(
                            ellipsisPolicy.deterministicEllipsisFill(jaText, recoverOpts) || '',
                        ).trim();
                        const hitCore = hit
                            .replace(/[哈啊嗯哦诶呜呵唉哎喔呼嘻]+/gu, '')
                            .replace(/[…·.•\-—_~～\s！!？?。．.、，,]+/gu, '');
                        if (hit && Array.from(hitCore).length >= 1) {
                            keptZh.push({ ...zhBefore[i], text: hit });
                            if (paired) keptJa.push({ ...sourceWorking[i] });
                            detFilled += 1;
                            continue;
                        }
                    } catch { /* fall through */ }
                }
            }
            if (!isEllipsisOnly(text)) {
                keptZh.push({ ...zhBefore[i] });
                if (paired) keptJa.push({ ...sourceWorking[i] });
                continue;
            }

            // Plan says delete (moan / empty / non-lexical) → drop; never invent from moan.
            let forceDelete = !jaText;
            if (!forceDelete && ellipsisPolicy?.planEllipsisSlotAction) {
                const plan = ellipsisPolicy.planEllipsisSlotAction(jaText, text, {
                    prevJa: i > 0 ? sourceWorking[i - 1]?.text : '',
                    nextJa: i + 1 < sourceWorking.length ? sourceWorking[i + 1]?.text : '',
                });
                forceDelete = plan.action === 'delete';
            } else if (!forceDelete && mtSanitize?.jaCueHasLexicalResidue) {
                const lexical = !!mtSanitize.jaCueHasLexicalResidue(jaText);
                const moan = !!mtSanitize.isMoanOrSfxHeavyJa?.(jaText);
                forceDelete = !lexical || moan;
            }
            if (forceDelete && !shouldKeepSubstantiveEllipsisSlot(jaText, sourceWorking[i])) {
                dropped += 1;
                continue;
            }

            // Lexical leftover: last-chance deterministic recover before delete.
            if (paired && jaText) {
                let recovered = '';
                if (ellipsisPolicy?.deterministicEllipsisFill) {
                    try {
                        const hit = ellipsisPolicy.deterministicEllipsisFill(jaText, recoverOpts);
                        if (hit && !isEllipsisOnly(String(hit).trim())) recovered = String(hit).trim();
                    } catch { /* try sanitize */ }
                }
                if (!recovered && typeof mtSanitize.sanitizeMtCueText === 'function') {
                    try {
                        const filledOne = mtSanitize.sanitizeMtCueText('…', jaText, recoverOpts);
                        const nt = String(filledOne?.text || '').trim();
                        if (nt && !isEllipsisOnly(nt)) recovered = nt;
                    } catch { /* drop below */ }
                }
                if (recovered) {
                    keptZh.push({ ...zhBefore[i], text: recovered });
                    if (paired) keptJa.push({ ...sourceWorking[i] });
                    detFilled += 1;
                    continue;
                }
            }

            // Unrecovered bare「…」: moan/debris still drop; substantive JA keep the slot.
            if (shouldKeepSubstantiveEllipsisSlot(jaText, sourceWorking[i])) {
                keptZh.push({ ...zhBefore[i], text: text || '…' });
                if (paired) keptJa.push({ ...sourceWorking[i] });
                keptLexicalBlank += 1;
                continue;
            }
            dropped += 1;
        }

        if (!dropped && !detFilled) {
            return {
                ok: true,
                dropped: 0,
                keptLexicalBlank,
                skipped: true,
                reason: keptLexicalBlank ? 'kept_lexical_blanks' : 'none',
                beforeCount: zhBefore.length,
                afterCount: zhBefore.length,
                path: target.path,
                sourcePath: srcPath || undefined,
            };
        }

        // Ellipsis delivery prune is *meant* to drop bare「…」; use a soft floor so
        // titles with dozens/hundreds of unrecovered blanks are not blocked by the
        // general translation-slot mass-deletion guard (0.7 keep ratio).
        const massLoss = slotCore.detectTranslationSlotMassDeletion({
            beforeCount: zhBefore.length,
            afterCount: keptZh.length,
            sourceCount: sourceWorking.length,
            isTranslationTrack: true,
            minKeepRatio: 0.35,
        });
        if (massLoss.blocked) {
            return {
                ok: false,
                error: '检测到译文字幕大规模丢失（可能误删空白占位），已取消写入',
                guard: massLoss,
                dropped,
                path: target.path,
                sourcePath: srcPath || undefined,
            };
        }

        keptZh.forEach((c, idx) => {
            c.index = idx + 1;
        });
        if (paired) {
            keptJa.forEach((c, idx) => {
                c.index = idx + 1;
            });
        }

        if (paired && typeof mtSanitize.fillBlankZhSlotsFromJa === 'function') {
            try {
                const filled = mtSanitize.fillBlankZhSlotsFromJa(keptZh, keptJa.length ? keptJa : sourceWorking);
                if (filled?.filled > 0) {
                    keptZh.length = 0;
                    keptZh.push(...filled.cues);
                    keptZh.forEach((c, idx) => {
                        c.index = idx + 1;
                    });
                    detFilled += filled.filled;
                }
            } catch { /* optional */ }
        }
        // Sweep … that fillBlank could not resolve. Moan/debris pairs still drop;
        // substantive JA keeps the slot so delivery never erases real dialogue.
        for (let i = keptZh.length - 1; i >= 0; i -= 1) {
            if (!isEllipsisOnly(String(keptZh[i]?.text ?? ''))) continue;
            const jaCue = paired ? keptJa[i] : null;
            const jaText = jaCue ? String(jaCue.text ?? '') : '';
            if (shouldKeepSubstantiveEllipsisSlot(jaText, jaCue)) {
                keptLexicalBlank += 1;
                continue;
            }
            keptZh.splice(i, 1);
            if (paired && keptJa[i]) keptJa.splice(i, 1);
            dropped += 1;
        }
        keptZh.forEach((c, idx) => {
            c.index = idx + 1;
        });
        if (paired) {
            keptJa.forEach((c, idx) => {
                c.index = idx + 1;
            });
        }

        const writtenZh = writeSubtitleDocument(target.path, {
            cues: keptZh,
            format: target.format,
            header: target.header,
            backupMode: options.backupMode || 'off',
        });
        if (!writtenZh.ok) return writtenZh;

        let sourceWritten = false;
        if (
            paired
            && options.writeSource !== false
            && sourceDoc?.ok
            && srcPath
            && fs.existsSync(path.resolve(srcPath))
        ) {
            const srcWrite = writeSubtitleDocument(sourceDoc.path, {
                cues: keptJa,
                format: sourceDoc.format,
                header: sourceDoc.header,
                backupMode: options.backupMode || 'off',
            });
            sourceWritten = !!srcWrite.ok;
        }

        return {
            ok: true,
            dropped,
            keptLexicalBlank,
            rematerialized,
            unpairedTimePrune,
            detFilled,
            beforeCount: (target.cues || []).length,
            afterCount: keptZh.length,
            path: target.path,
            sourcePath: srcPath || undefined,
            sourceWritten,
            summary: `删除仅省略号条目 ${dropped} 条（${(target.cues || []).length}→${keptZh.length}）`
                + (detFilled ? ` · 确定性补全 ${detFilled}` : '')
                + (keptLexicalBlank ? ` · 保留实质对白空槽 ${keptLexicalBlank}` : ''),
            written: true,
        };
    }

    /**
     * File-level MT sanitize: strip trailing hallucinated names / Gloss / loops on ZH
     * against the JA source (covers Opus path and any adapter miss).
     * @param {string} targetPath - Chinese / translation subtitle
     * @param {string} [sourcePath] - Japanese / ASR source subtitle
     * @param {object} [options]
     * @returns {{ ok: boolean, changed?: number, skipped?: boolean, reason?: string, path?: string, summary?: string, flags?: object, error?: string }}
     */
    function sanitizeMtSubtitlePair(targetPath, sourcePath = '', options = {}) {
        const target = readSubtitleDocument(targetPath);
        if (!target.ok) return target;

        let fillBlankAllowed = true;
        try {
            const { resolveMtTargetFields } = require('./sanitize-target-opts');
            const targetFields = resolveMtTargetFields(options);
            fillBlankAllowed = targetFields.isZhTarget === true;
        } catch { fillBlankAllowed = true; }

        let sourceCues = Array.isArray(options.sourceCues) ? options.sourceCues : [];
        const srcPath = String(sourcePath || options.sourcePath || '').trim();
        let sourceDoc = null;
        const srcResolved = srcPath ? path.resolve(srcPath) : '';
        const srcExists = srcResolved && fs.existsSync(srcResolved);
        if (srcExists && (!sourceCues.length || options.cleanSource !== false)) {
            sourceDoc = readSubtitleDocument(srcResolved);
            if (!sourceCues.length && sourceDoc?.ok && Array.isArray(sourceDoc.cues)) {
                sourceCues = sourceDoc.cues;
            }
        }
        if (!sourceCues.length) {
            return {
                ok: true,
                changed: 0,
                skipped: true,
                reason: 'no_source',
                path: target.path,
            };
        }

        // Fix whole-track off-by-one when re-MT ran against a credited JA track.
        let shiftRepaired = 0;
        try {
            const creditCore = require('../src/js/subtitle-software-credit-core');
            let creditLang = 'zh';
            try {
                const { resolveMtTargetFields } = require('./sanitize-target-opts');
                const fields = resolveMtTargetFields(options);
                creditLang = creditCore.normalizeCreditLang(
                    fields.isZhTarget ? 'zh' : (fields.engineTargetLanguage || fields.subtitleTargetLang || 'en'),
                ) || 'zh';
            } catch { /* default zh */ }
            const shiftOpts = {
                isPro: /Transub\s*Pro/i.test(sourceCues.map((c) => c.text).join('\n')),
                lang: creditLang,
                skipDialogueContentShiftRepair: options.skipDialogueContentShiftRepair === true,
            };
            if (typeof creditCore.repairOffByOneCreditShift === 'function') {
                const fixed = creditCore.repairOffByOneCreditShift(target.cues, sourceCues, shiftOpts);
                if (fixed.changed) {
                    target.cues = fixed.cues;
                    shiftRepaired = fixed.repaired || fixed.cues.length;
                }
            }
            // +N dialogue shift with credit head already correct (SAME-237 / FNS-247).
            // Skip after QC 局部重转写 / ASR 污染轨，避免整轨旋转移位成「…」风暴。
            if (
                options.skipDialogueContentShiftRepair !== true
                && typeof creditCore.repairDetectedDialogueContentShift === 'function'
            ) {
                const shifted = creditCore.repairDetectedDialogueContentShift(
                    target.cues,
                    sourceCues,
                    shiftOpts,
                );
                if (shifted.changed) {
                    target.cues = shifted.cues;
                    shiftRepaired += Number(shifted.repaired) || 0;
                }
            }
        } catch { /* optional */ }

        // Delivery finalize (JA timeline truth): rematerialize orphans + realign + recycle + prune.
        let startMsRealign = 0;
        let deliveryFinalize = null;
        let deliveryTouched = 0;
        try {
            const finCore = require('../src/js/smart-translate-delivery-finalize-core');
            deliveryFinalize = finCore.finalizeDeliveryCues?.(sourceCues, target.cues, {
                blankText: '…',
                scrubRecycle: true,
                pruneDebris: options.dropAsrDebrisPairs !== false,
                fillBlank: fillBlankAllowed,
                postBatchRemoveNoise: options.postBatchRemoveNoise,
                dropUselessEllipsis: options.dropUselessEllipsis,
            }) || null;
            if (deliveryFinalize?.changed && Array.isArray(deliveryFinalize.cues)) {
                target.cues = deliveryFinalize.cues;
                if (Array.isArray(deliveryFinalize.sourceCues) && deliveryFinalize.sourceCues.length) {
                    sourceCues = deliveryFinalize.sourceCues;
                }
                // Rematerialize/realign/scrub counts are timeline hygiene — not dialogue
                // content-shift repair. Keep them out of「错位回正」so logs stay honest.
                deliveryTouched = Number(deliveryFinalize.rematerialized || 0)
                    + Number(deliveryFinalize.realigned || 0)
                    + Number(deliveryFinalize.scrubbed || 0)
                    + Number(deliveryFinalize.pruned || 0)
                    + Number(deliveryFinalize.filled || 0)
                    + Number(deliveryFinalize.durationCapped || 0);
                startMsRealign = Number(deliveryFinalize.realigned || deliveryFinalize.rematerialized || 0);
            }
        } catch { /* optional — fall back to legacy realign below */ }

        // GalTransl-style conditional post-replace (术语条件译后).
        let glossaryPostReplaced = 0;
        try {
            if (options.glossaryConditionalPostReplace !== false && options.glossary) {
                const glossCore = require('../src/js/subtitle-glossary-core');
                if (typeof glossCore.applyConditionalPostReplace === 'function') {
                    const paired = (Array.isArray(target.cues) ? target.cues : []).map((c, i) => {
                        const src = sourceCues[i] || sourceCues.find((s) => Number(s?.index) === Number(c?.index));
                        return {
                            ...c,
                            sourceText: String(src?.text || c?.sourceText || ''),
                            audioEvent: c?.audioEvent || src?.audioEvent,
                        };
                    });
                    const post = glossCore.applyConditionalPostReplace(paired, options.glossary, options);
                    if (post.changed > 0) {
                        target.cues = post.cues.map((c) => {
                            const { sourceText, ...rest } = c;
                            return rest;
                        });
                        glossaryPostReplaced = post.changed;
                    }
                }
            }
        } catch { /* optional */ }

        if (!deliveryFinalize) {
            // Legacy EBWH-363/365 realign + recycle when finalize core unavailable
            try {
                const alignCore = require('../src/js/smart-translate-align-core');
                const realignFn = typeof alignCore.realignIfNeeded === 'function'
                    ? alignCore.realignIfNeeded
                    : alignCore.realignTranslatedCuesByStartMs;
                if (typeof realignFn === 'function') {
                    const laid = realignFn(sourceCues, target.cues, { blankText: '…' });
                    if (laid?.changed && Array.isArray(laid.cues) && laid.cues.length) {
                        target.cues = laid.cues;
                        startMsRealign = Number(laid.realigned) || laid.cues.length;
                        deliveryTouched += startMsRealign;
                    }
                }
            } catch { /* optional */ }
            try {
                const recycleGuard = require('../src/js/smart-translate-recycle-guard-core');
                if (typeof recycleGuard.scrubTrackRecycledTranslations === 'function') {
                    const preScrub = recycleGuard.scrubTrackRecycledTranslations(
                        target.cues,
                        sourceCues,
                        { blankText: '…' },
                    );
                    if (preScrub.scrubbed > 0) {
                        target.cues = preScrub.cues;
                        deliveryTouched += preScrub.scrubbed;
                    }
                }
            } catch { /* optional */ }
        }

        // Drop Whisper JA name-loops on source before justify / ZH sanitize
        let sourceAsrCleaned = 0;
        try {
            const jaNames = require('../src/js/ja-person-names-core');
            if (typeof jaNames.stripAsrHallucinationLoopsInCues === 'function') {
                const srcClean = jaNames.stripAsrHallucinationLoopsInCues(sourceCues);
                sourceCues = srcClean.cues;
                sourceAsrCleaned = srcClean.changed || 0;
            }
        } catch { /* source ASR clean optional */ }

        // Mens-esthe / soft-AV ASR mishears (免税→メンエス, 本島→オイル, …)
        let sourceDomainCleaned = 0;
        try {
            const mtSanitizePre = require('../src/js/mt-sanitize-core');
            if (typeof mtSanitizePre.correctJaAsrDomainMishearsInCues === 'function') {
                const domainClean = mtSanitizePre.correctJaAsrDomainMishearsInCues(sourceCues);
                sourceCues = domainClean.cues;
                sourceDomainCleaned = domainClean.changed || 0;
            }
        } catch { /* domain ASR clean optional */ }

        if (
            (sourceAsrCleaned > 0 || sourceDomainCleaned > 0)
            && options.cleanSource !== false
            && sourceDoc?.ok
        ) {
            try {
                writeSubtitleDocument(sourceDoc.path, {
                    cues: sourceCues,
                    format: sourceDoc.format,
                    header: sourceDoc.header,
                    backupMode: options.backupMode || 'off',
                });
            } catch { /* keep going */ }
        }

        let mtSanitize;
        try {
            mtSanitize = require('../src/js/mt-sanitize-core');
        } catch (err) {
            return { ok: false, error: err.message || '无法加载译后清洗模块' };
        }

        const { pickSanitizeTargetOpts } = require('./sanitize-target-opts');
        const cleaned = mtSanitize.sanitizeMtCues(target.cues, sourceCues, {
            ...pickSanitizeTargetOpts(options),
            glossary: options.glossary,
            glossaryTerms: options.glossaryTerms,
            nameMap: options.nameMap,
            unifyNames: options.unifyNames !== false,
            sakuraNsfwPrompt: options.sakuraNsfwPrompt,
            nsfwPrompt: options.nsfwPrompt,
            contentProfile: options.contentProfile || options.senseProfile,
            senseProfile: options.senseProfile || options.contentProfile,
            faithfulTone: options.faithfulTone || options.smartTranslateFaithfulTone,
            smartTranslateFaithfulTone: options.smartTranslateFaithfulTone || options.faithfulTone,
            applyNsfwLexicon: options.applyNsfwLexicon,
            skipFakeGreeting: options.skipFakeGreeting,
            // Source already domain-corrected above; avoid double-counting flags only
            skipJaAsrDomain: sourceDomainCleaned > 0,
            postBatchRemoveNoise: options.postBatchRemoveNoise,
            // DELETE moan/… slots only when「完成后清理杂音」allows (fill still runs above).
            dropUselessEllipsis: (() => {
                try {
                    const policy = require('../src/js/mt-delivery-policy-core');
                    if (typeof policy.mayDropUselessEllipsis === 'function') {
                        return policy.mayDropUselessEllipsis(options);
                    }
                } catch { /* fall through */ }
                return options.dropUselessEllipsis !== false
                    && options.postBatchRemoveNoise !== false;
            })(),
            dropAllEllipsisSlots: options.dropAllEllipsisSlots === true,
            // Hard-drop Whisper garbage / moan pairs only under the same noise-cleanup gate
            dropAsrDebrisPairs: (() => {
                try {
                    const policy = require('../src/js/mt-delivery-policy-core');
                    if (typeof policy.mayDropUselessEllipsis === 'function') {
                        return policy.mayDropUselessEllipsis({
                            ...options,
                            dropUselessEllipsis: options.dropAsrDebrisPairs !== false,
                        });
                    }
                } catch { /* fall through */ }
                return options.dropAsrDebrisPairs !== false
                    && options.postBatchRemoveNoise !== false;
            })(),
        });
        if (shiftRepaired > 0) {
            cleaned.changed = (Number(cleaned.changed) || 0) + shiftRepaired;
            cleaned.flags = cleaned.flags || {};
            cleaned.flags.off_by_one_credit_shift = shiftRepaired;
            if (startMsRealign > 0) {
                cleaned.flags.start_ms_realign = startMsRealign;
            }
        }
        if (deliveryTouched > 0) {
            cleaned.changed = (Number(cleaned.changed) || 0) + deliveryTouched;
            cleaned.flags = cleaned.flags || {};
            if (startMsRealign > 0) cleaned.flags.start_ms_realign = startMsRealign;
            cleaned.flags.delivery_finalize_touched = deliveryTouched;
        }

        const recovered = recoverBlankedMtCues(cleaned.cues, sourceCues, options);
        if (recovered.recovered > 0) {
            cleaned.cues = recovered.cues;
            cleaned.changed = (Number(cleaned.changed) || 0) + recovered.recovered;
            cleaned.flags = cleaned.flags || {};
            cleaned.flags.blank_adult_recover = (cleaned.flags.blank_adult_recover || 0) + recovered.recovered;
        }

        // EBWH-366: long/mid ZH paste onto divergent JA — blank for 补翻.
        // Never mass-blank a hybrid track (>20%) — same guard as delivery finalize.
        try {
            const recycleGuard = require('../src/js/smart-translate-recycle-guard-core');
            if (typeof recycleGuard.scrubTrackRecycledTranslations === 'function') {
                const trackScrub = recycleGuard.scrubTrackRecycledTranslations(
                    cleaned.cues,
                    sourceCues,
                    { blankText: '…' },
                );
                const scrubN = Number(trackScrub.scrubbed) || 0;
                const totalN = Math.max(1, (cleaned.cues || []).length);
                if (scrubN > 0 && scrubN / totalN <= 0.2) {
                    cleaned.cues = trackScrub.cues;
                    cleaned.changed = (Number(cleaned.changed) || 0) + scrubN;
                    cleaned.flags = cleaned.flags || {};
                    cleaned.flags.recycle_scrub = scrubN;
                } else if (scrubN > 0) {
                    cleaned.flags = cleaned.flags || {};
                    cleaned.flags.recycle_scrub_skipped = scrubN;
                }
            }
        } catch { /* optional */ }

        // Soft-AV 好舒服 stub: apply deterministic hard expands (Laya soft-band is ST-only).
        try {
            const pipe = require('../src/js/jev-laya-pipeline-core');
            if (typeof pipe.collectKimochiUnderfillCandidates === 'function') {
                const collected = pipe.collectKimochiUnderfillCandidates(
                    cleaned.cues,
                    sourceCues,
                );
                if (collected.hardExpand?.length) {
                    const applied = pipe.applyKimochiUnderfillDecisions(cleaned.cues, {
                        hardExpand: collected.hardExpand,
                    }, { blankText: '…' });
                    if (applied.changed) {
                        cleaned.cues = applied.cues;
                        cleaned.changed = (Number(cleaned.changed) || 0) + applied.changed;
                        cleaned.flags = cleaned.flags || {};
                        cleaned.flags.kimochi_hard_expand = applied.changed;
                    }
                }
            }
        } catch { /* optional */ }

        // Intl: scrub any remaining Han (model leak or stale ZH fills).
        try {
            const { resolveMtTargetFields } = require('./sanitize-target-opts');
            const fields = resolveMtTargetFields(options);
            if (fields.isZhTarget === false && typeof mtSanitize.finalizeIntlMtDeliveryText === 'function') {
                let scrubbed = 0;
                const srcByIndex = new Map(
                    (Array.isArray(sourceCues) ? sourceCues : []).map((c) => [
                        Number(c?.index),
                        String(c?.text ?? ''),
                    ]),
                );
                cleaned.cues = (cleaned.cues || []).map((c, i) => {
                    const src = srcByIndex.has(Number(c?.index))
                        ? srcByIndex.get(Number(c.index))
                        : String(sourceCues?.[i]?.text ?? '');
                    const fin = mtSanitize.finalizeIntlMtDeliveryText(
                        String(c?.text ?? ''),
                        fields.subtitleTargetLang,
                        src,
                    );
                    if (!fin.changed) return c;
                    scrubbed += 1;
                    return { ...c, text: fin.text || '…' };
                });
                if (scrubbed) {
                    cleaned.changed = (Number(cleaned.changed) || 0) + scrubbed;
                    cleaned.flags = cleaned.flags || {};
                    cleaned.flags.intl_han_scrub = scrubbed;
                }
            } else if (fields.isZhTarget === false && typeof mtSanitize.scrubHanLeakForIntlTarget === 'function') {
                let scrubbed = 0;
                cleaned.cues = (cleaned.cues || []).map((c) => {
                    const scrub = mtSanitize.scrubHanLeakForIntlTarget(
                        String(c?.text ?? ''),
                        fields.subtitleTargetLang,
                    );
                    if (!scrub.changed) return c;
                    scrubbed += 1;
                    return { ...c, text: scrub.text || '…' };
                });
                if (scrubbed) {
                    cleaned.changed = (Number(cleaned.changed) || 0) + scrubbed;
                    cleaned.flags = cleaned.flags || {};
                    cleaned.flags.intl_han_scrub = scrubbed;
                }
            }
        } catch { /* optional */ }

        // Prefer domain-corrected source from sanitize when it rewrote again
        if (Array.isArray(cleaned.sourceCues) && cleaned.jaAsrDomainChanged > 0) {
            sourceCues = cleaned.sourceCues;
            sourceDomainCleaned += cleaned.jaAsrDomainChanged;
            if (options.cleanSource !== false && sourceDoc?.ok) {
                try {
                    writeSubtitleDocument(sourceDoc.path, {
                        cues: sourceCues,
                        format: sourceDoc.format,
                        header: sourceDoc.header,
                        backupMode: options.backupMode || 'off',
                    });
                } catch { /* ignore */ }
            }
        }

        // Align gate: rematerialize when cue counts differ, or when index↔startMs drifts
        // (EBWH-363/365). Never rematerialize on semantic "suspicious" alone — loose
        // overlap merge previously mashed whole tracks (DLDSS-533).
        let alignRematerialized = 0;
        let alignFilled = 0;
        try {
            let zhCues = Array.isArray(cleaned.cues) ? cleaned.cues : [];
            const countDiff = Math.abs(zhCues.length - sourceCues.length) >= 1;
            let startDrift = false;
            try {
                const alignCore = require('../src/js/smart-translate-align-core');
                startDrift = typeof alignCore.shouldRealignByStartMs === 'function'
                    && alignCore.shouldRealignByStartMs(sourceCues, zhCues);
            } catch { /* optional */ }
            if (countDiff || startDrift) {
                const laid = mtSanitize.rematerializeTranslatedOntoSource(sourceCues, zhCues, {
                    blankText: '…',
                    preferIndex: false,
                    fillFromSource: false,
                });
                if (laid?.cues?.length) {
                    zhCues = laid.cues;
                    const laidChanged = Number(laid.changed);
                    alignRematerialized = (Number.isFinite(laidChanged) && laidChanged > 0)
                        ? laidChanged
                        : (zhCues.length !== (Array.isArray(cleaned.cues) ? cleaned.cues.length : zhCues.length)
                            ? Math.abs(zhCues.length - (Array.isArray(cleaned.cues) ? cleaned.cues.length : 0))
                            : 0);
                    cleaned.cues = zhCues;
                    cleaned.changed = (Number(cleaned.changed) || 0) + (alignRematerialized > 0 ? 1 : 0);
                    cleaned.flags = cleaned.flags || {};
                    cleaned.flags.rematerialize_align_gate = alignRematerialized;
                    if (startDrift) cleaned.flags.start_ms_align_gate = true;
                }
            }
            if (fillBlankAllowed && typeof mtSanitize.fillBlankZhSlotsFromJa === 'function') {
                const filled = mtSanitize.fillBlankZhSlotsFromJa(
                    Array.isArray(cleaned.cues) ? cleaned.cues : zhCues,
                    sourceCues,
                );
                if (filled.filled > 0) {
                    cleaned.cues = filled.cues;
                    cleaned.changed = (Number(cleaned.changed) || 0) + filled.filled;
                    cleaned.flags = cleaned.flags || {};
                    cleaned.flags.fill_blank_from_ja = filled.filled;
                    alignFilled = filled.filled;
                }
            }
        } catch { /* optional */ }

        // Final delivery gate again after sanitize (sanitize may drop/unstick slots).
        try {
            const finCore = require('../src/js/smart-translate-delivery-finalize-core');
            const postFin = finCore.finalizeDeliveryCues?.(sourceCues, cleaned.cues, {
                blankText: '…',
                scrubRecycle: true,
                pruneDebris: options.dropAsrDebrisPairs !== false,
                fillBlank: fillBlankAllowed,
                postBatchRemoveNoise: options.postBatchRemoveNoise,
                dropUselessEllipsis: options.dropUselessEllipsis,
            });
            if (postFin?.changed && Array.isArray(postFin.cues)) {
                cleaned.cues = postFin.cues;
                if (Array.isArray(postFin.sourceCues) && postFin.sourceCues.length) {
                    sourceCues = postFin.sourceCues;
                }
                const bump = Number(postFin.rematerialized || 0)
                    + Number(postFin.realigned || 0)
                    + Number(postFin.scrubbed || 0)
                    + Number(postFin.pruned || 0)
                    + Number(postFin.filled || 0)
                    + Number(postFin.durationCapped || 0);
                cleaned.changed = (Number(cleaned.changed) || 0) + Math.max(1, bump);
                cleaned.flags = { ...(cleaned.flags || {}), ...(postFin.flags || {}), delivery_finalize: true };
                if (postFin.rematerialized) alignRematerialized = postFin.rematerialized;
                if (postFin.filled) alignFilled = (alignFilled || 0) + postFin.filled;
                if (postFin.durationCapped) {
                    cleaned.flags.duration_cap = postFin.durationCapped;
                }
                if (!postFin.gateOk) {
                    cleaned.flags.delivery_align_gate_warn = true;
                }
            }
        } catch { /* optional */ }

        // Last-mile filler/moan duration cap (rematerialize copies JA endMs and can re-inflate).
        let durationCappedLast = 0;
        try {
            const durationCap = require('../src/js/cue-duration-cap-core');
            if (typeof durationCap.capFillerMoanCueDurations === 'function') {
                const capped = durationCap.capFillerMoanCueDurations(
                    Array.isArray(cleaned.cues) ? cleaned.cues : [],
                    sourceCues,
                );
                if (capped.changed) {
                    cleaned.cues = capped.cues;
                    if (Array.isArray(capped.sourceCues) && capped.sourceCues.length) {
                        sourceCues = capped.sourceCues;
                    }
                    durationCappedLast = Number(capped.capped) || 0;
                    cleaned.changed = (Number(cleaned.changed) || 0) + durationCappedLast;
                    cleaned.flags = cleaned.flags || {};
                    cleaned.flags.duration_cap = (Number(cleaned.flags.duration_cap) || 0) + durationCappedLast;
                }
            }
        } catch { /* optional */ }

        // Persist when sanitize OR delivery realign/scrub changed the track.
        // Previously: !cleaned.changed early-return skipped write and left disk misaligned
        // even after in-memory realign (PPPE/MUDR evening batch).
        const mustWrite = !!cleaned.changed
            || shiftRepaired > 0
            || deliveryTouched > 0
            || glossaryPostReplaced > 0
            || startMsRealign > 0
            || alignRematerialized > 0
            || durationCappedLast > 0
            || !!cleaned.flags?.delivery_finalize
            || !!cleaned.flags?.duration_cap;

        if (!mustWrite) {
            return {
                ok: true,
                changed: 0,
                sourceAsrCleaned,
                sourceDomainCleaned,
                path: target.path,
                flags: cleaned.flags || {},
                summary: [
                    sourceAsrCleaned ? `ASR叠名清理 ${sourceAsrCleaned} 条` : '',
                    sourceDomainCleaned ? `ASR领域纠错 ${sourceDomainCleaned} 条` : '',
                ].filter(Boolean).join(' · ') || undefined,
            };
        }

        // Cue-count may shrink when useless … slots are dropped — still a successful write.
        const beforeCount = target.cues.length;
        const afterCount = cleaned.cues.length;
        const droppedEllipsis = Number(cleaned.flags?.drop_useless_ellipsis) || 0;

        const written = writeSubtitleDocument(target.path, {
            cues: cleaned.cues,
            format: target.format,
            header: target.header,
            backupMode: options.backupMode || 'off',
        });
        if (!written.ok) return written;

        // Persist capped JA timings even when cue count unchanged (filler duration shrink).
        if (
            options.cleanSource !== false
            && sourceDoc?.ok
            && Array.isArray(sourceCues)
            && (
                sourceCues.length !== (sourceDoc.cues || []).length
                || durationCappedLast > 0
                || Number(cleaned.flags?.duration_cap) > 0
            )
        ) {
            try {
                writeSubtitleDocument(sourceDoc.path, {
                    cues: sourceCues,
                    format: sourceDoc.format,
                    header: sourceDoc.header,
                    backupMode: options.backupMode || 'off',
                });
            } catch { /* ignore */ }
        }

        const bits = [`译后清洗 ${cleaned.changed || shiftRepaired || deliveryTouched || 1} 条`];
        if (shiftRepaired) bits.unshift(`错位回正 ${shiftRepaired} 条`);
        if (deliveryTouched && !alignRematerialized) bits.push(`成片对齐 ${deliveryTouched}`);
        if (alignRematerialized) bits.push('对位重铺');
        if (alignFilled) bits.push(`短句回填 ${alignFilled}`);
        if (durationCappedLast || cleaned.flags?.duration_cap) {
            bits.push(`时长钳制 ${durationCappedLast || cleaned.flags.duration_cap}`);
        }
        if (sourceAsrCleaned) bits.push(`ASR叠名 ${sourceAsrCleaned}`);
        if (sourceDomainCleaned) bits.push(`ASR领域 ${sourceDomainCleaned}`);
        if (glossaryPostReplaced) bits.push(`术语条件译后 ${glossaryPostReplaced}`);
        if (droppedEllipsis) bits.push(`清除无用省略号 ${droppedEllipsis}（${beforeCount}→${afterCount}）`);
        if (cleaned.flags?.delivery_align_gate_warn) bits.push('对齐门禁告警');
        return {
            ok: true,
            changed: cleaned.changed || shiftRepaired || 1,
            sourceAsrCleaned,
            sourceDomainCleaned,
            droppedEllipsis,
            alignRematerialized,
            alignFilled,
            path: target.path,
            flags: cleaned.flags || {},
            summary: bits.join(' · '),
        };
    }

    return {
        applySubtitlePostprocess,
        removeNoiseFromSubtitlePair,
        compactPureInterjectionSubtitlePair,
        recoverBlankedMtCues,
        removeEllipsisOnlyDeliveryPair,
        sanitizeMtSubtitlePair,
    };
}

module.exports = {
    createSubtitlePostprocess,
};
