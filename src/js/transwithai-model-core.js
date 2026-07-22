/**
 * TransWithAI 转写/翻译模型路径路由（浏览器与 Node 共用）
 * 官方转写与翻译为不同 CT2 权重，无合一模型。
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTransWithAiModels = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function transwithaiModelCoreFactory() {
    function normalizeModelPathValue(value) {
        return String(value || '').trim().replace(/\\/g, '/');
    }

    /**
     * Known official CT2 packs (fingerprint from config.json alignment_heads / lang_ids).
     * Verified against Hugging Face:
     * - chickenrice0721/whisper-large-v2-translate-zh-v0.2-st-ct2
     * - TransWithAI/whisper-ja-1.5B-ct2
     */
    const KNOWN_MODEL_SIGNATURES = [
        {
            id: 'chickenrice-large-v2-zh',
            kind: 'translate',
            firstAlign: [10, 12],
            alignCount: 23,
            langIdsCount: 99,
        },
        {
            id: 'whisper-ja-1.5B',
            kind: 'transcribe',
            firstAlign: [0, 1],
            alignCount: 20,
            langIdsCount: 100,
        },
    ];

    function normalizeAlignPair(pair) {
        if (!Array.isArray(pair) || pair.length < 2) return null;
        const a = Number(pair[0]);
        const b = Number(pair[1]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        return [a, b];
    }

    /**
     * Extract lightweight fingerprint fields from a CT2 Whisper config.json object.
     */
    function extractConfigFingerprint(config) {
        const cfg = config && typeof config === 'object' ? config : {};
        const heads = Array.isArray(cfg.alignment_heads) ? cfg.alignment_heads : [];
        const langIds = Array.isArray(cfg.lang_ids) ? cfg.lang_ids : [];
        const suppress = Array.isArray(cfg.suppress_ids) ? cfg.suppress_ids : [];
        const firstAlign = normalizeAlignPair(heads[0]);
        return {
            alignCount: heads.length,
            langIdsCount: langIds.length,
            suppressIdsCount: suppress.length,
            firstAlign,
            firstAlignKey: firstAlign ? `${firstAlign[0]},${firstAlign[1]}` : '',
        };
    }

    function scoreSignatureMatch(fp, signature) {
        if (!fp || !signature) return 0;
        let score = 0;
        const first = normalizeAlignPair(fp.firstAlign);
        const want = normalizeAlignPair(signature.firstAlign);
        if (first && want && first[0] === want[0] && first[1] === want[1]) score += 5;
        if (Number(fp.alignCount) === Number(signature.alignCount)) score += 3;
        if (Number(fp.langIdsCount) === Number(signature.langIdsCount)) score += 2;
        return score;
    }

    /**
     * Folder-name heuristics (fallback when config fingerprint is unavailable).
     */
    function detectModelKindFromName(folderName) {
        const lower = String(folderName || '').trim().toLowerCase();
        if (!lower) return { kind: 'custom', source: 'unknown', confidence: 0 };
        if (/translate|chicken|海南|hainan/.test(lower)) {
            return { kind: 'translate', source: 'name', confidence: 0.7, matchId: 'name-translate' };
        }
        if (/transcribe|whisper-ja|ja-1\.5|日文|jim6789/.test(lower)) {
            return { kind: 'transcribe', source: 'name', confidence: 0.7, matchId: 'name-transcribe' };
        }
        return { kind: 'custom', source: 'unknown', confidence: 0 };
    }

    /**
     * Detect transcribe vs translate from config fingerprints + optional folder name.
     * @param {{ folderName?: string, config?: object, alignCount?: number, langIdsCount?: number, firstAlign?: number[] }} features
     * @returns {{ kind: string, source: 'signature'|'name'|'unknown', confidence: number, matchId?: string, scores?: object }}
     */
    function detectModelKind(features = {}) {
        const folderName = String(features.folderName || features.name || '').trim();
        const fp = features.config
            ? extractConfigFingerprint(features.config)
            : {
                alignCount: Number(features.alignCount) || 0,
                langIdsCount: Number(features.langIdsCount) || 0,
                suppressIdsCount: Number(features.suppressIdsCount) || 0,
                firstAlign: normalizeAlignPair(features.firstAlign),
                firstAlignKey: '',
            };
        if (!fp.firstAlignKey && fp.firstAlign) {
            fp.firstAlignKey = `${fp.firstAlign[0]},${fp.firstAlign[1]}`;
        }

        let best = null;
        const scores = {};
        for (const sig of KNOWN_MODEL_SIGNATURES) {
            const score = scoreSignatureMatch(fp, sig);
            scores[sig.id] = score;
            // Require strong evidence: firstAlign match (+5) plus at least one structural field
            if (score >= 8 && (!best || score > best.score)) {
                best = { signature: sig, score };
            }
        }
        if (best) {
            return {
                kind: best.signature.kind,
                source: 'signature',
                confidence: Math.min(1, best.score / 10),
                matchId: best.signature.id,
                scores,
                fingerprint: fp,
            };
        }

        const byName = detectModelKindFromName(folderName);
        return {
            ...byName,
            scores,
            fingerprint: fp,
        };
    }

    /**
     * Resolve which model path to use for a given infer task.
     * Legacy `modelPath` is fallback when dedicated fields are empty.
     */
    function resolvePassModelPath(options = {}, task = 'translate') {
        const legacy = normalizeModelPathValue(options.modelPath);
        const transcribe = normalizeModelPathValue(options.transcribeModelPath) || legacy;
        const translate = normalizeModelPathValue(options.translateModelPath) || legacy;
        const t = String(task || '').trim().toLowerCase();
        if (t === 'transcribe') return transcribe;
        if (t === 'translate') return translate;
        // dual / unknown: prefer translate for single-arg callers; dual should call per-pass
        return translate || transcribe || legacy;
    }

    function kindRank(item) {
        if (!item || !item.ready) return -1;
        const sourceScore = item.kindSource === 'signature' ? 3
            : item.kindSource === 'name' ? 2
                : item.kind === 'root' ? 1
                    : 0;
        const conf = Number(item.kindConfidence) || 0;
        return sourceScore * 10 + conf;
    }

    function findReadyByKind(items, kind) {
        const list = Array.isArray(items) ? items : [];
        const matches = list.filter((i) => i && i.ready && i.kind === kind);
        if (!matches.length) return null;
        matches.sort((a, b) => kindRank(b) - kindRank(a));
        return matches[0];
    }

    /**
     * Auto-pick first ready transcribe + translate models from listTransWithAiModels items.
     */
    function suggestModelsFromList(items) {
        const list = Array.isArray(items) ? items : [];
        const transcribe = findReadyByKind(list, 'transcribe')
            || findReadyByKind(list, 'root')
            || list.find((i) => i && i.ready) || null;
        const translate = findReadyByKind(list, 'translate') || null;
        return {
            transcribeModelPath: normalizeModelPathValue(transcribe?.path),
            translateModelPath: normalizeModelPathValue(translate?.path),
            transcribeItem: transcribe,
            translateItem: translate,
        };
    }

    /**
     * Fill empty dedicated fields and auto-correct crossed / wrong-kind selections.
     * Official TransWithAI packages are separate CT2 weights for transcribe vs translate.
     */
    function fillMissingModelPaths(options = {}, items = []) {
        const legacy = normalizeModelPathValue(options.modelPath);
        let transcribe = normalizeModelPathValue(options.transcribeModelPath);
        let translate = normalizeModelPathValue(options.translateModelPath);
        const suggested = suggestModelsFromList(items);
        const list = Array.isArray(items) ? items : [];

        const kindOf = (modelPath) => {
            const item = lookupModelItem(list, modelPath);
            return item?.kind || null;
        };

        // Empty → suggestions / legacy
        if (!transcribe) transcribe = suggested.transcribeModelPath || legacy;
        if (!translate) translate = suggested.translateModelPath || legacy;

        if (list.length) {
            const tKind = kindOf(transcribe);
            const trKind = kindOf(translate);

            // Clearly swapped: put each into the matching slot
            if (
                transcribe
                && translate
                && tKind === 'translate'
                && trKind === 'transcribe'
            ) {
                const tmp = transcribe;
                transcribe = translate;
                translate = tmp;
            } else {
                // Transcribe slot holds a translate pack → move / replace
                if (transcribe && tKind === 'translate') {
                    if (!translate || kindOf(translate) !== 'translate') {
                        translate = transcribe;
                    }
                    transcribe = suggested.transcribeModelPath
                        || (trKind === 'transcribe' ? translate : '')
                        || legacy;
                    if (transcribe && kindOf(transcribe) === 'translate') {
                        transcribe = suggested.transcribeModelPath || '';
                    }
                }
                // Translate slot holds a transcribe pack → move / replace
                if (translate && kindOf(translate) === 'transcribe') {
                    if (!transcribe || kindOf(transcribe) !== 'transcribe') {
                        transcribe = translate;
                    }
                    translate = suggested.translateModelPath || '';
                }
            }

            // Final pass: still empty after corrections
            if (!transcribe) transcribe = suggested.transcribeModelPath || legacy;
            if (!translate) translate = suggested.translateModelPath || legacy;
        }

        return {
            ...options,
            transcribeModelPath: transcribe,
            translateModelPath: translate,
            modelPath: legacy || translate || transcribe,
        };
    }

    /** Alias: auto-detect / auto-correct model paths from listed packages. */
    function autoAssignModelPaths(options = {}, items = []) {
        return fillMissingModelPaths(options, items);
    }

    function lookupModelItem(items, modelPath) {
        const want = normalizeModelPathValue(modelPath).toLowerCase();
        if (!want) return null;
        const list = Array.isArray(items) ? items : [];
        return list.find((i) => normalizeModelPathValue(i?.path).toLowerCase() === want) || null;
    }

    /**
     * @returns {{ ok: boolean, error?: string, warnings?: string[] }}
     */
    function validateModelsForTask(options = {}, items = [], task = 'translate') {
        const warnings = [];
        const t = String(task || 'translate').trim().toLowerCase();
        const filled = fillMissingModelPaths(options, items);
        const transcribePath = normalizeModelPathValue(filled.transcribeModelPath);
        const translatePath = normalizeModelPathValue(filled.translateModelPath);
        const list = Array.isArray(items) ? items : [];

        const checkOne = (pathValue, expectKind, label) => {
            if (!pathValue) {
                return `${label}未配置。请在「安装」中选择对应模型（官方转写与翻译为不同权重）。`;
            }
            if (!list.length) return null;
            const item = lookupModelItem(list, pathValue);
            if (item && item.ready === false) {
                return `${label}不完整：${item.label || pathValue}`;
            }
            if (item && expectKind && item.kind && item.kind !== expectKind && item.kind !== 'custom' && item.kind !== 'root') {
                warnings.push(`${label}目录 kind=${item.kind}，期望 ${expectKind}，请确认未选错包`);
            }
            return null;
        };

        if (t === 'dual') {
            const e1 = checkOne(transcribePath, 'transcribe', '转写模型');
            if (e1) return { ok: false, error: e1, warnings };
            const e2 = checkOne(translatePath, 'translate', '翻译模型');
            if (e2) return { ok: false, error: e2, warnings };
            if (transcribePath && translatePath && transcribePath.toLowerCase() === translatePath.toLowerCase()) {
                warnings.push('转写与翻译指向同一目录。官方通常无合一模型，双语结果可能不可靠。');
            }
            return { ok: true, warnings, options: filled };
        }

        if (t === 'transcribe') {
            // 空路径 = 使用安装默认；仅在已选择时校验完整性
            if (transcribePath) {
                const err = checkOne(transcribePath, 'transcribe', '转写模型');
                if (err) return { ok: false, error: err, warnings };
            }
            return { ok: true, warnings, options: filled };
        }

        // translate (default)
        if (translatePath) {
            const err = checkOne(translatePath, 'translate', '翻译模型');
            if (err) return { ok: false, error: err, warnings };
        }
        return { ok: true, warnings, options: filled };
    }

    function modelLabelFromPath(modelPath) {
        const p = normalizeModelPathValue(modelPath);
        if (!p) return '默认';
        const parts = p.split('/');
        return parts[parts.length - 1] || p;
    }

    return {
        normalizeModelPathValue,
        KNOWN_MODEL_SIGNATURES,
        extractConfigFingerprint,
        detectModelKindFromName,
        detectModelKind,
        resolvePassModelPath,
        suggestModelsFromList,
        fillMissingModelPaths,
        autoAssignModelPaths,
        lookupModelItem,
        validateModelsForTask,
        modelLabelFromPath,
    };
}));
