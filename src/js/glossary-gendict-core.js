/**
 * GenDict-style glossary drafts from JA subtitle cues (propose only; human confirm).
 * Reuses ja-person-names honorific harvest — never auto-writes the formal glossary.
 */
(function (global, factory) {
    let jaNames = null;
    try {
        jaNames = (typeof module !== 'undefined' && module.exports)
            ? require('./ja-person-names-core')
            : (global && global.TransubJaPersonNames);
    } catch (_) {
        jaNames = null;
    }
    let glossaryCore = null;
    try {
        glossaryCore = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-glossary-core')
            : (global && global.TransubSubtitleGlossary);
    } catch (_) {
        glossaryCore = null;
    }
    const api = factory(jaNames, glossaryCore);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubGlossaryGendict = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function glossaryGendictFactory(jaNames, glossaryCore) {
    const DRAFT_NOTE = 'GenDict 草稿·待确认';
    const KATA_NAME_RE = /[ァ-ヶー]{2,10}/g;
    const KATA_STOP = new Set([
        'コレ', 'ソレ', 'アレ', 'ドレ', 'ココ', 'ソコ', 'アソコ', 'ダレ', 'ナニ',
        'タイ', 'デス', 'マス', 'ナイ', 'カラ', 'マデ', 'ヨリ', 'デモ', 'カツ',
        'ハイ', 'イエ', 'ネエ', 'サア', 'アア', 'ウウ', 'オオ', 'ンン',
    ]);

    function normalizeGlossary(doc) {
        if (glossaryCore?.normalizeGlossary) {
            return glossaryCore.normalizeGlossary(doc || {});
        }
        return {
            version: 1,
            updatedAt: doc?.updatedAt || null,
            entries: Array.isArray(doc?.entries) ? doc.entries : [],
        };
    }

    function existingKeys(glossary) {
        const keys = new Set();
        for (const e of normalizeGlossary(glossary).entries) {
            const can = String(e.canonical || '').trim().toLowerCase();
            if (can) keys.add(can);
            for (const a of e.aliases || []) {
                const k = String(a || '').trim().toLowerCase();
                if (k) keys.add(k);
            }
        }
        return keys;
    }

    function harvestKatakanaNameDrafts(cues, options = {}) {
        const minCount = Math.max(1, Number(options.minCount) || 2);
        const tallies = new Map();
        for (const c of cues || []) {
            const text = String(c?.text || c?.sourceText || '');
            if (!text) continue;
            const hits = text.match(KATA_NAME_RE) || [];
            for (const raw of hits) {
                const stem = String(raw || '').trim();
                if (stem.length < 2 || KATA_STOP.has(stem)) continue;
                // Skip pure elongation / moan-like tokens
                if (/^[アィウエオァィゥェォー]+$/.test(stem)) continue;
                tallies.set(stem, (tallies.get(stem) || 0) + 1);
            }
        }
        const out = [];
        for (const [stem, count] of tallies) {
            if (count < minCount) continue;
            out.push({
                term: stem,
                translation: stem,
                info: '片假名专名候选',
                aliases: [],
                hitCount: count,
                via: 'katakana',
            });
        }
        return out.sort((a, b) => (b.hitCount - a.hitCount) || a.term.localeCompare(b.term, 'ja'));
    }

    /**
     * @param {Array} cues
     * @param {object} [glossary] existing glossary to skip duplicates
     * @param {{ minCount?: number, maxDrafts?: number, includeKatakana?: boolean }} [options]
     * @returns {{ drafts: object[], skippedExisting: number, summary: string }}
     */
    function proposeGlossaryDraftsFromCues(cues, glossary = null, options = {}) {
        const minCount = Math.max(1, Number(options.minCount) || 2);
        const maxDrafts = Math.max(1, Math.min(64, Number(options.maxDrafts) || 24));
        const includeKatakana = options.includeKatakana !== false;
        const seen = existingKeys(glossary);
        const raw = [];

        if (typeof jaNames?.harvestHonorificCastTerms === 'function') {
            for (const t of jaNames.harvestHonorificCastTerms(cues, { minCount })) {
                raw.push({
                    ...t,
                    hitCount: minCount,
                    via: 'honorific',
                });
            }
        }
        if (includeKatakana) {
            raw.push(...harvestKatakanaNameDrafts(cues, { minCount }));
        }

        const drafts = [];
        let skippedExisting = 0;
        const draftKeys = new Set();
        for (const t of raw) {
            const zh = String(t.translation || t.term || '').trim();
            const ja = String(t.term || '').trim();
            if (!zh) continue;
            const keyZh = zh.toLowerCase();
            const keyJa = ja.toLowerCase();
            if (seen.has(keyZh) || (keyJa && seen.has(keyJa))) {
                skippedExisting += 1;
                continue;
            }
            if (draftKeys.has(keyZh) || (keyJa && draftKeys.has(keyJa))) continue;
            draftKeys.add(keyZh);
            if (keyJa) draftKeys.add(keyJa);
            const aliases = Array.isArray(t.aliases) ? t.aliases.slice() : [];
            if (ja && ja !== zh && !aliases.includes(ja)) aliases.push(ja);
            drafts.push({
                canonical: zh,
                aliases,
                role: 'character',
                // Default hit-only so drafts do not fill the always-character cap.
                promptInject: 'hit',
                enabled: true,
                note: `${DRAFT_NOTE}${t.info ? ` · ${t.info}` : ''}`,
                via: t.via || 'gendict',
                hitCount: Number(t.hitCount) || minCount,
                selected: true,
            });
            if (drafts.length >= maxDrafts) break;
        }

        const summary = drafts.length
            ? `扫到 ${drafts.length} 条专名草稿${skippedExisting ? `（跳过已有 ${skippedExisting}）` : ''}，确认后写入术语表`
            : (skippedExisting
                ? `未发现新专名（已有术语覆盖 ${skippedExisting} 条候选）`
                : '未从原文扫到可用专名草稿');

        return { drafts, skippedExisting, summary };
    }

    /**
     * Apply user-confirmed drafts into a glossary document.
     * Skips drafts with selected === false.
     * @returns {{ ok: boolean, glossary: object, added: number, skipped: number, error?: string }}
     */
    function applyGlossaryDrafts(glossary, drafts) {
        const list = Array.isArray(drafts) ? drafts : [];
        if (!list.length) {
            return { ok: true, glossary: normalizeGlossary(glossary), added: 0, skipped: 0 };
        }
        if (!glossaryCore?.upsertEntry) {
            return { ok: false, glossary: normalizeGlossary(glossary), added: 0, skipped: 0, error: '术语表模块不可用' };
        }
        let doc = normalizeGlossary(glossary);
        let added = 0;
        let skipped = 0;
        for (const d of list) {
            if (d && d.selected === false) {
                skipped += 1;
                continue;
            }
            const promptInject = String(d.promptInject || 'hit').trim().toLowerCase() === 'always'
                ? 'always'
                : 'hit';
            const r = glossaryCore.upsertEntry(doc, {
                canonical: d.canonical,
                aliases: d.aliases || [],
                role: d.role || 'character',
                promptInject,
                enabled: d.enabled !== false,
                note: d.note || DRAFT_NOTE,
            });
            if (r?.ok) {
                doc = r.glossary;
                added += 1;
            }
        }
        return { ok: true, glossary: doc, added, skipped };
    }

    /**
     * Collect drafts from a confirm-list DOM (or plain objects) after user edits.
     * @param {Array<{ selected?: boolean, canonical?: string, aliases?: string[], promptInject?: string, note?: string, role?: string }>} rows
     */
    function normalizeConfirmedDrafts(rows) {
        const out = [];
        for (const d of Array.isArray(rows) ? rows : []) {
            const canonical = String(d?.canonical || '').trim();
            if (!canonical) continue;
            const aliases = Array.isArray(d.aliases)
                ? d.aliases.map((a) => String(a || '').trim()).filter(Boolean)
                : [];
            out.push({
                canonical,
                aliases,
                role: d.role || 'character',
                promptInject: String(d.promptInject || 'hit').trim().toLowerCase() === 'always'
                    ? 'always'
                    : 'hit',
                enabled: d.enabled !== false,
                note: d.note || DRAFT_NOTE,
                selected: d.selected !== false,
                via: d.via || 'gendict',
            });
        }
        return out;
    }

    function formatDraftConfirmMessage(drafts) {
        const lines = (Array.isArray(drafts) ? drafts : []).slice(0, 16).map((d, i) => {
            const alias = (d.aliases || []).filter((a) => a && a !== d.canonical).slice(0, 2).join('/');
            const inject = d.promptInject === 'always' ? '常驻' : '命中';
            return `${i + 1}. ${d.canonical}${alias ? `（${alias}）` : ''} · ${inject}`;
        });
        const more = drafts.length > 16 ? `\n…另有 ${drafts.length - 16} 条` : '';
        return `将写入以下专名草稿（须人工确认；默认仅命中注入）：\n${lines.join('\n')}${more}\n\n确定写入当前术语表？`;
    }

    return {
        DRAFT_NOTE,
        proposeGlossaryDraftsFromCues,
        applyGlossaryDrafts,
        normalizeConfirmedDrafts,
        formatDraftConfirmMessage,
        harvestKatakanaNameDrafts,
    };
}));
