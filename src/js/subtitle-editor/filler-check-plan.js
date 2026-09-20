/**
 * Subtitle editor — collect pure / inline discourse·onomatopoeia cues (multi-lang).
 * Uses TransubSubtitleFluency predicates; delete via batchCueFilterPlan.
 */
(function (global) {
    function getFluency(deps) {
        if (deps?.fluency) return deps.fluency;
        if (global.TransubSubtitleFluency) return global.TransubSubtitleFluency;
        try {
            if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
                return require('../subtitle-fluency-core');
            }
        } catch (_) { /* ignore */ }
        return null;
    }

    function getFilterPlan(deps) {
        if (deps?.filterPlan) return deps.filterPlan;
        if (global.TransubEditorParts?.batchCueFilterPlan) {
            return global.TransubEditorParts.batchCueFilterPlan;
        }
        try {
            if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
                return require('./batch-cue-filter-plan');
            }
        } catch (_) { /* ignore */ }
        return null;
    }

    const KIND_LABEL = {
        discourse: '语气',
        onomatopoeia: '拟声',
        mixed: '语气+拟声',
    };

    const LANG_LABEL = {
        ja: '日',
        zh: '中',
        en: '英',
        ko: '韩',
    };

    function normalizeOptions(options = {}) {
        const checkDiscourse = options.checkDiscourse !== false;
        const checkOnomatopoeia = options.checkOnomatopoeia !== false;
        const includeInline = !!options.includeInline;
        const langMode = String(options.langMode || 'auto').toLowerCase() === 'target'
            ? 'target'
            : 'auto';
        const preferredLang = options.preferredLang || options.targetLang || 'zh';
        return {
            checkDiscourse,
            checkOnomatopoeia,
            includeInline,
            langMode,
            preferredLang,
        };
    }

    function resolveLangsForText(text, opts, fluency) {
        if (opts.langMode === 'target') {
            const bucket = fluency.normalizeFillerLang
                ? fluency.normalizeFillerLang(opts.preferredLang)
                : 'zh';
            return [bucket];
        }
        const detected = fluency.detectFillerLineLang?.(text) || '';
        const order = ['ja', 'zh', 'en', 'ko'];
        if (detected && order.includes(detected)) {
            return [detected, ...order.filter((l) => l !== detected)];
        }
        return order;
    }

    function classifyPureHit(text, opts, fluency) {
        const langs = resolveLangsForText(text, opts, fluency);
        for (const lang of langs) {
            if (opts.checkDiscourse && opts.checkOnomatopoeia) {
                if (!fluency.isPureInterjectionForLang(text, lang)) continue;
                const discourse = fluency.isPureDiscourseForLang?.(text, lang);
                const onomato = fluency.isPureOnomatopoeiaForLang?.(text, lang);
                if (discourse && !onomato) return { kind: 'discourse', lang, text };
                if (onomato && !discourse) return { kind: 'onomatopoeia', lang, text };
                return { kind: discourse ? 'discourse' : 'onomatopoeia', lang, text };
            }
            if (opts.checkDiscourse && fluency.isPureDiscourseForLang?.(text, lang)) {
                return { kind: 'discourse', lang, text };
            }
            if (opts.checkOnomatopoeia && fluency.isPureOnomatopoeiaForLang?.(text, lang)) {
                return { kind: 'onomatopoeia', lang, text };
            }
        }
        return null;
    }

    /**
     * @returns {{
     *   action: 'delete'|'strip',
     *   kind: string,
     *   lang: string,
     *   text: string,
     *   nextText?: string,
     *   removedTokens?: string[]
     * }|null}
     */
    function classifyCueFiller(cue, options = {}, deps = {}) {
        const fluency = getFluency(deps);
        if (!fluency?.isPureInterjectionForLang) return null;
        const opts = normalizeOptions(options);
        if (!opts.checkDiscourse && !opts.checkOnomatopoeia) return null;

        const text = String(cue?.text || '').trim();
        if (!text) return null;

        const pureHit = classifyPureHit(text, opts, fluency);
        if (pureHit) {
            // Substantive guard only blocks false-positive "pure" on long slots.
            if (fluency.shouldPreserveSubstantiveDialogueCue?.(cue, text)) return null;
            return {
                action: 'delete',
                kind: pureHit.kind,
                lang: pureHit.lang,
                text,
            };
        }

        if (!opts.includeInline || !fluency.stripInlineFillersInText) return null;

        const langs = resolveLangsForText(text, opts, fluency);
        let best = null;
        for (const lang of langs) {
            const stripped = fluency.stripInlineFillersInText(text, {
                checkDiscourse: opts.checkDiscourse,
                checkOnomatopoeia: opts.checkOnomatopoeia,
                lang,
                preferredLang: opts.preferredLang,
            });
            if (!stripped?.changed || !stripped.removedTokens?.length) continue;
            if (stripped.pure) {
                return {
                    action: 'delete',
                    kind: stripped.kind || 'discourse',
                    lang: stripped.lang || lang,
                    text,
                    removedTokens: stripped.removedTokens,
                };
            }
            best = {
                action: 'strip',
                kind: stripped.kind || 'discourse',
                lang: stripped.lang || lang,
                text,
                nextText: stripped.text,
                removedTokens: stripped.removedTokens,
            };
            break;
        }
        return best;
    }

    /**
     * @returns {Array<object>}
     */
    function collectFillerMatches(cues, options = {}, deps = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const out = [];
        list.forEach((cue, index) => {
            const hit = classifyCueFiller(cue, options, deps);
            if (!hit) return;
            const kindLabel = KIND_LABEL[hit.kind] || hit.kind;
            const langLabel = LANG_LABEL[hit.lang] || hit.lang;
            const actionLabel = hit.action === 'strip' ? '清理夹杂' : '整条删除';
            out.push({
                index,
                action: hit.action,
                kind: hit.kind,
                lang: hit.lang,
                text: hit.text,
                nextText: hit.nextText || '',
                removedTokens: Array.isArray(hit.removedTokens) ? hit.removedTokens : [],
                label: `${kindLabel}·${langLabel}·${actionLabel}`,
            });
        });
        return out;
    }

    function previewFillerCheckPlan({
        matches = [],
        checkDiscourse = true,
        checkOnomatopoeia = true,
        includeInline = false,
        totalCues = 0,
    } = {}) {
        if (!checkDiscourse && !checkOnomatopoeia) {
            return {
                matched: 0,
                deleteCount: 0,
                stripCount: 0,
                discourse: 0,
                onomatopoeia: 0,
                summary: '请至少勾选「语气词」或「拟声词」',
                isErr: true,
            };
        }
        const list = Array.isArray(matches) ? matches : [];
        if (!list.length) {
            return {
                matched: 0,
                deleteCount: 0,
                stripCount: 0,
                discourse: 0,
                onomatopoeia: 0,
                summary: includeInline
                    ? '未发现纯语气/拟声或夹杂条目'
                    : '未发现纯语气/拟声条目',
                isErr: true,
            };
        }
        let discourse = 0;
        let onomatopoeia = 0;
        let deleteCount = 0;
        let stripCount = 0;
        for (const row of list) {
            if (row.action === 'strip') stripCount += 1;
            else deleteCount += 1;
            if (row.kind === 'onomatopoeia') onomatopoeia += 1;
            else if (row.kind === 'mixed') {
                discourse += 1;
                onomatopoeia += 1;
            } else discourse += 1;
        }
        const parts = [];
        if (discourse) parts.push(`语气 ${discourse}`);
        if (onomatopoeia) parts.push(`拟声 ${onomatopoeia}`);
        const actionParts = [];
        if (deleteCount) actionParts.push(`删整条 ${deleteCount}`);
        if (stripCount) actionParts.push(`清理夹杂 ${stripCount}`);
        const total = Math.max(0, Math.floor(Number(totalCues) || 0));
        const remaining = Math.max(0, total - deleteCount);
        return {
            matched: list.length,
            deleteCount,
            stripCount,
            discourse,
            onomatopoeia,
            remaining,
            summary: `匹配 ${list.length} 条（${parts.join(' · ')}；${actionParts.join(' · ')}）→ 应用后约剩 ${remaining} 条`,
            isErr: false,
        };
    }

    function applyDeleteCueIndexes(cues, indexes, deps = {}) {
        const plan = getFilterPlan(deps);
        if (plan?.applyDeleteCueIndexes) {
            return plan.applyDeleteCueIndexes(cues, indexes);
        }
        const list = Array.isArray(cues) ? cues : [];
        const remove = new Set(
            (Array.isArray(indexes) ? indexes : [])
                .filter((n) => Number.isInteger(n) && n >= 0 && n < list.length),
        );
        if (!remove.size) {
            return {
                cues: list.slice(),
                removedIndexes: [],
                removed: 0,
                kept: list.length,
            };
        }
        const kept = [];
        const removedIndexes = [];
        list.forEach((cue, index) => {
            if (remove.has(index)) removedIndexes.push(index);
            else kept.push(cue);
        });
        return {
            cues: kept,
            removedIndexes,
            removed: removedIndexes.length,
            kept: kept.length,
        };
    }

    function nextSelectedIndexAfterDelete(selectedIndex, removedIndexes, remainingLength, deps = {}) {
        const plan = getFilterPlan(deps);
        if (plan?.nextSelectedIndexAfterDelete) {
            return plan.nextSelectedIndexAfterDelete(selectedIndex, removedIndexes, remainingLength);
        }
        const rem = Math.max(0, Math.floor(Number(remainingLength) || 0));
        return rem ? 0 : -1;
    }

    /**
     * Apply checked matches: delete pure cues, strip inline fillers from mixed cues.
     * @param {object[]} cues
     * @param {Array<{ index: number, action?: string, nextText?: string }>} matches
     */
    function applyFillerMatches(cues, matches) {
        const list = Array.isArray(cues) ? cues.map((c) => ({ ...c })) : [];
        const rows = (Array.isArray(matches) ? matches : [])
            .filter((m) => Number.isInteger(m?.index) && m.index >= 0 && m.index < list.length)
            .slice()
            .sort((a, b) => a.index - b.index);

        let stripped = 0;
        const deleteIndexes = [];
        for (const row of rows) {
            if (row.action === 'strip' && row.nextText != null) {
                const before = String(list[row.index]?.text ?? '');
                const next = String(row.nextText);
                if (next !== before) {
                    list[row.index] = { ...list[row.index], text: next };
                    stripped += 1;
                }
            } else {
                deleteIndexes.push(row.index);
            }
        }

        const deleted = applyDeleteCueIndexes(list, deleteIndexes);
        return {
            cues: deleted.cues,
            removedIndexes: deleted.removedIndexes,
            removed: deleted.removed,
            stripped,
            kept: deleted.kept,
            touched: deleted.removed + stripped,
        };
    }

    const api = {
        KIND_LABEL,
        LANG_LABEL,
        normalizeOptions,
        classifyCueFiller,
        collectFillerMatches,
        previewFillerCheckPlan,
        applyDeleteCueIndexes,
        nextSelectedIndexAfterDelete,
        applyFillerMatches,
    };

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.fillerCheckPlan = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
