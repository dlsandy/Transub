'use strict';

/**
 * Smart-translate file orchestration: read subtitle → runSmartTranslate → write dest.
 * No proprietary prompts/algorithms (those live in advanced-smart-translate / _advanced).
 */
const path = require('path');

/**
 * @param {object} host
 * @param {(payload?: object, event?: any) => Promise<object>} host.runSmartTranslate
 * @param {(v: any) => object} host.asPlainObject
 * @param {(v: any, max?: number) => string} host.asString
 */
function createAdvancedSmartTranslateFile(host = {}) {
    if (typeof host.runSmartTranslate !== 'function') {
        throw new Error('createAdvancedSmartTranslateFile: host.runSmartTranslate required');
    }
    if (typeof host.asPlainObject !== 'function') {
        throw new Error('createAdvancedSmartTranslateFile: host.asPlainObject required');
    }
    if (typeof host.asString !== 'function') {
        throw new Error('createAdvancedSmartTranslateFile: host.asString required');
    }

    const { asPlainObject, asString, runSmartTranslate } = host;

    /**
     * 读字幕文档 → 智能翻译 → 写到 dest（可与源相同）。
     */
    async function smartTranslateSubtitleFile(options = {}) {
        const opts = asPlainObject(options);
        const nested = asPlainObject(opts.options);
        const sourcePath = asString(opts.sourcePath || opts.path, 4096).trim();
        const destPath = asString(opts.destPath || sourcePath, 4096).trim();
        if (!sourcePath) return { ok: false, error: '缺少字幕路径' };

        const { readSubtitleDocument, writeSubtitleDocument } = require('./extensions-subtitle-document');
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

        const plan = (() => {
            try { return require('../src/js/retranslate-plan-core'); } catch { return null; }
        })();
        const creditLang = (() => {
            try {
                const creditCore = require('../src/js/subtitle-software-credit-core');
                const tgt = require('../src/js/subtitle-target-lang-core');
                const lang = tgt.resolveSubtitleTargetLang({
                    subtitleTargetLang: opts.subtitleTargetLang ?? nested.subtitleTargetLang,
                    targetLang: opts.targetLang ?? nested.targetLang,
                    chineseSubtitleVariant: opts.chineseSubtitleVariant ?? nested.chineseSubtitleVariant,
                    targetLanguage: opts.targetLanguage ?? nested.targetLanguage,
                });
                return creditCore.normalizeCreditLang(lang) || 'zh';
            } catch {
                return 'zh';
            }
        })();
        const allCues = doc.cues.map((c, i) => ({
            index: Number.isInteger(Number(c.index)) ? Number(c.index) : i,
            startMs: c.startMs,
            endMs: c.endMs,
            text: c.text || '',
        }));
        const parted = plan?.partitionRetranslatePayload
            ? plan.partitionRetranslatePayload(allCues, {
                isPro: !!(opts.isPro ?? nested.isPro),
                lang: creditLang,
                dualLineOrder: opts.dualLineOrder ?? nested.dualLineOrder,
            })
            : { mtCues: allCues, restoreByIndex: new Map(), skipped: 0 };
        let restoreByIndex = parted.restoreByIndex instanceof Map
            ? parted.restoreByIndex
            : new Map();
        let destCues = null;
        if (destPath && path.resolve(destPath) !== path.resolve(sourcePath)) {
            try {
                const destDoc = readSubtitleDocument(destPath);
                if (destDoc?.ok && Array.isArray(destDoc.cues)) destCues = destDoc.cues;
            } catch { /* optional */ }
        }
        if (destCues && plan?.augmentCreditRestoreMap) {
            restoreByIndex = plan.augmentCreditRestoreMap(allCues, destCues, restoreByIndex, {
                isPro: !!(opts.isPro ?? nested.isPro),
                lang: creditLang,
                dualLineOrder: opts.dualLineOrder ?? nested.dualLineOrder,
            });
        }
        const mtCues = (parted.mtCues || allCues).filter((c) => {
            const idx = Number.isInteger(Number(c.index)) ? Number(c.index) : -1;
            return String(c.text || '').trim() && !restoreByIndex.has(idx);
        });

        const result = await runSmartTranslate({
            cues: mtCues.length ? mtCues : allCues,
            chineseSubtitleVariant: opts.chineseSubtitleVariant ?? nested.chineseSubtitleVariant,
            subtitleTargetLang: opts.subtitleTargetLang ?? nested.subtitleTargetLang
                ?? opts.targetLang ?? nested.targetLang,
            targetLang: opts.targetLang ?? nested.targetLang
                ?? opts.subtitleTargetLang ?? nested.subtitleTargetLang,
            targetLanguage: opts.targetLanguage ?? nested.targetLanguage,
            note: opts.note ?? nested.note,
            windowCues: opts.windowCues ?? nested.windowCues,
            overlapCues: opts.overlapCues ?? nested.overlapCues,
            smartTranslateFaithfulTone: !!(
                opts.smartTranslateFaithfulTone
                ?? opts.faithfulTone
                ?? nested.smartTranslateFaithfulTone
                ?? nested.faithfulTone
            ),
            smartTranslateHybridMt: opts.smartTranslateHybridMt ?? nested.smartTranslateHybridMt,
            smartTranslatePlotPolish: opts.smartTranslatePlotPolish ?? nested.smartTranslatePlotPolish,
            smartTranslateFaithfulVerify: opts.smartTranslateFaithfulVerify ?? nested.smartTranslateFaithfulVerify,
            smartTranslateAddressConsistency: opts.smartTranslateAddressConsistency
                ?? nested.smartTranslateAddressConsistency,
            engineLlmMtModel: opts.engineLlmMtModel ?? nested.engineLlmMtModel,
            hybridMtModelId: opts.hybridMtModelId ?? nested.hybridMtModelId
                ?? opts.engineLlmMtModel ?? nested.engineLlmMtModel,
            language: opts.language ?? nested.language,
            dryRun: opts.dryRun ?? nested.dryRun,
            signal: opts.signal,
            onProgress: opts.onProgress,
            _batchMode: !!opts._batchMode,
        }, opts.event || null);

        if (!result?.ok) {
            return { ok: false, error: result?.error || '智能翻译失败', code: result?.code, path: sourcePath };
        }

        const nextCues = plan?.mergeRetranslateCues
            ? plan.mergeRetranslateCues(doc.cues, result.cues || [], {
                translatedIndexes: mtCues.map((c) => Number(c.index)),
                restoreByIndex,
                destCues,
                isPro: !!(opts.isPro ?? nested.isPro),
                lang: creditLang,
                dualLineOrder: opts.dualLineOrder ?? nested.dualLineOrder,
            })
            : (() => {
                const map = new Map((result.cues || []).map((u) => [Number(u.index), String(u.text ?? '')]));
                return (doc.cues || []).map((c, i) => {
                    const idx = Number.isInteger(Number(c.index)) ? Number(c.index) : i;
                    if (restoreByIndex?.has?.(idx)) {
                        return { ...c, text: restoreByIndex.get(idx) };
                    }
                    if (!map.has(idx)) return { ...c };
                    return { ...c, text: map.get(idx) };
                });
            })();
        let changed = 0;
        for (let i = 0; i < (doc.cues || []).length; i += 1) {
            if (String(doc.cues[i]?.text ?? '') !== String(nextCues[i]?.text ?? '')) changed += 1;
        }

        const written = writeSubtitleDocument(destPath, {
            format: doc.format,
            cues: nextCues,
        });
        if (!written?.ok) {
            return { ok: false, error: written?.error || '写回字幕失败', path: destPath };
        }

        return {
            ok: true,
            path: destPath,
            changed,
            summary: result.message || result.summary,
            softwareCreditRestored: parted.skipped || 0,
            stats: result.stats,
            via: result.via,
            llmSource: result.llmSource,
        };
    }

    return { smartTranslateSubtitleFile };
}

module.exports = { createAdvancedSmartTranslateFile };
