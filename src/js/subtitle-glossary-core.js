/**
 * 术语表 / 专名一致性（浏览器与 Node 测试共用）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleGlossary = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleGlossaryCoreFactory() {
    const GLOSSARY_VERSION = 1;

    function escapeRegExp(text) {
        return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function isAsciiWord(term) {
        return /^[A-Za-z0-9][A-Za-z0-9_'’-]*$/.test(String(term || '').trim());
    }

    function normalizeAliasList(aliases) {
        if (!Array.isArray(aliases)) return [];
        const seen = new Set();
        const out = [];
        for (const raw of aliases) {
            const term = String(raw || '').trim();
            if (!term) continue;
            const key = term.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(term);
        }
        return out;
    }

    function makeEntryId() {
        return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function coerceAliases(rawAliases) {
        if (Array.isArray(rawAliases)) return normalizeAliasList(rawAliases);
        if (typeof rawAliases === 'string') {
            return normalizeAliasList(
                String(rawAliases)
                    .split(/[,，;；|／/\n\r\t]+/)
                    .map((s) => s.trim()),
            );
        }
        return [];
    }

    function normalizeEntry(raw = {}) {
        const canonical = String(raw.canonical || '').trim();
        const aliases = coerceAliases(raw.aliases)
            .filter((a) => a.toLowerCase() !== canonical.toLowerCase());
        return {
            id: String(raw.id || makeEntryId()),
            canonical,
            aliases,
            caseSensitive: !!raw.caseSensitive,
            enabled: raw.enabled !== false,
            note: String(raw.note || '').trim(),
        };
    }

    function normalizeGlossary(doc = {}) {
        const entries = Array.isArray(doc.entries)
            ? doc.entries.map(normalizeEntry).filter((e) => e.canonical)
            : [];
        return {
            version: GLOSSARY_VERSION,
            updatedAt: doc.updatedAt || null,
            entries,
        };
    }

    function buildTermRegExp(term, caseSensitive) {
        const trimmed = String(term || '').trim();
        if (!trimmed) return null;
        const body = escapeRegExp(trimmed);
        const source = isAsciiWord(trimmed) ? `\\b${body}\\b` : body;
        return new RegExp(source, caseSensitive ? 'g' : 'gi');
    }

    function countMatches(text, term, caseSensitive) {
        const re = buildTermRegExp(term, caseSensitive);
        if (!re) return 0;
        const hits = String(text || '').match(re);
        return hits ? hits.length : 0;
    }

    function replaceTerm(text, from, to, caseSensitive) {
        const re = buildTermRegExp(from, caseSensitive);
        if (!re) return { text: String(text || ''), count: 0 };
        let count = 0;
        const next = String(text || '').replace(re, () => {
            count += 1;
            return to;
        });
        return { text: next, count };
    }

    function collectForms(entry) {
        const canonical = String(entry.canonical || '').trim();
        const aliases = normalizeAliasList(entry.aliases)
            .filter((a) => a.toLowerCase() !== canonical.toLowerCase());
        // 长词优先，避免短词抢匹配
        const forms = [canonical, ...aliases]
            .filter(Boolean)
            .sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-CN'));
        return { canonical, aliases, forms };
    }

    /**
     * 扫描术语不一致 / 可统一的别名
     */
    function scanGlossaryIssues(cues, glossary, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const doc = normalizeGlossary(glossary);
        const issues = [];
        const includeAliasOnly = options.includeAliasOnly !== false;

        for (const entry of doc.entries) {
            if (!entry.enabled) continue;
            const { canonical, aliases, forms } = collectForms(entry);
            if (!canonical || !forms.length) continue;

            /** @type {Map<string, { form: string, count: number, indices: number[] }>} */
            const found = new Map();
            for (let i = 0; i < list.length; i += 1) {
                const text = String(list[i]?.text || '');
                for (const form of forms) {
                    const re = buildTermRegExp(form, entry.caseSensitive);
                    if (!re) continue;
                    re.lastIndex = 0;
                    let match = re.exec(text);
                    while (match) {
                        const actual = match[0];
                        const key = entry.caseSensitive ? actual : actual.toLowerCase();
                        const prev = found.get(key) || { form: actual, count: 0, indices: [] };
                        prev.count += 1;
                        if (!prev.indices.includes(i)) prev.indices.push(i);
                        found.set(key, prev);
                        if (!re.global) break;
                        match = re.exec(text);
                    }
                }
            }

            if (!found.size) continue;

            const formsFound = [...found.values()];
            const isCanonicalForm = (form) => (
                entry.caseSensitive
                    ? form === canonical
                    : form.toLowerCase() === canonical.toLowerCase()
            );
            const hasCanonical = formsFound.some((f) => isCanonicalForm(f.form));
            const aliasHits = formsFound.filter((f) => !isCanonicalForm(f.form));

            let type = null;
            if (formsFound.length >= 2) type = 'variant';
            else if (includeAliasOnly && aliasHits.length && !hasCanonical) type = 'alias_only';
            else if (aliasHits.length && hasCanonical) type = 'mixed'; // 标准形与别名并存
            if (!type) continue;
            if (type === 'mixed') type = 'variant';

            const cueIndices = [...new Set(formsFound.flatMap((f) => f.indices))].sort((a, b) => a - b);
            issues.push({
                entryId: entry.id,
                canonical,
                type,
                formsFound: formsFound.map((f) => ({
                    form: f.form,
                    count: f.count,
                    indices: f.indices.slice(),
                })),
                cueIndices,
                message: type === 'alias_only'
                    ? `出现别名「${aliasHits[0].form}」，可统一为「${canonical}」`
                    : `「${canonical}」存在多种写法：${formsFound.map((f) => f.form).join(' / ')}`,
            });
        }

        return {
            issues,
            summary: {
                total: issues.length,
                variant: issues.filter((i) => i.type === 'variant').length,
                aliasOnly: issues.filter((i) => i.type === 'alias_only').length,
            },
        };
    }

    function summarizeGlossaryScan(summary) {
        if (!summary?.total) return '术语用法一致';
        const parts = [];
        if (summary.variant) parts.push(`写法不一 ${summary.variant}`);
        if (summary.aliasOnly) parts.push(`待统一别名 ${summary.aliasOnly}`);
        return `${summary.total} 项术语问题：${parts.join(' · ')}`;
    }

    /**
     * 将别名统一为标准写法（不改时间轴）
     */
    function applyGlossaryToCues(cues, glossary, options = {}) {
        const list = Array.isArray(cues)
            ? cues.map((c) => ({
                index: c.index,
                startMs: c.startMs,
                endMs: c.endMs,
                text: c.text ?? '',
            }))
            : [];
        const doc = normalizeGlossary(glossary);
        const onlyIds = Array.isArray(options.entryIds) && options.entryIds.length
            ? new Set(options.entryIds.map(String))
            : null;

        let replaceCount = 0;
        let cueTouched = 0;
        const touchedEntries = new Set();

        const entries = doc.entries
            .filter((e) => e.enabled && e.canonical)
            .filter((e) => !onlyIds || onlyIds.has(e.id))
            .map((e) => {
                const aliases = normalizeAliasList(e.aliases)
                    .filter((a) => a.toLowerCase() !== e.canonical.toLowerCase())
                    .sort((a, b) => b.length - a.length);
                return { ...e, aliases };
            })
            .filter((e) => e.aliases.length);

        for (let i = 0; i < list.length; i += 1) {
            let text = String(list[i].text || '');
            let cueChanged = false;
            for (const entry of entries) {
                for (const alias of entry.aliases) {
                    const result = replaceTerm(text, alias, entry.canonical, entry.caseSensitive);
                    if (result.count) {
                        text = result.text;
                        replaceCount += result.count;
                        cueChanged = true;
                        touchedEntries.add(entry.id);
                    }
                }
            }
            if (cueChanged) {
                list[i].text = text;
                cueTouched += 1;
            }
        }

        return {
            cues: list,
            stats: {
                replaceCount,
                cueTouched,
                entryTouched: touchedEntries.size,
            },
            summary: replaceCount
                ? `已统一 ${replaceCount} 处用语（涉及 ${cueTouched} 条字幕、${touchedEntries.size} 个术语）`
                : '没有可统一的别名',
        };
    }

    function parseAliasesInput(text) {
        return normalizeAliasList(
            String(text || '')
                .split(/[,，;；|／/\n\r\t]+/)
                .map((s) => s.trim()),
        );
    }

    function upsertEntry(glossary, patch) {
        const doc = normalizeGlossary(glossary);
        const entry = normalizeEntry(patch);
        if (!entry.canonical) {
            return { ok: false, error: '标准写法不能为空', glossary: doc };
        }
        const idx = doc.entries.findIndex((e) => e.id === entry.id);
        if (idx >= 0) doc.entries[idx] = entry;
        else doc.entries.push(entry);
        doc.updatedAt = new Date().toISOString();
        return { ok: true, glossary: doc, entry };
    }

    function removeEntry(glossary, entryId) {
        const doc = normalizeGlossary(glossary);
        doc.entries = doc.entries.filter((e) => e.id !== String(entryId));
        doc.updatedAt = new Date().toISOString();
        return doc;
    }

    /**
     * 合并全局 + 项目术语表；同 canonical（不区分大小写）时项目条目覆盖全局。
     */
    function mergeGlossaries(globalDoc = {}, projectDoc = {}) {
        const global = normalizeGlossary(globalDoc);
        const project = normalizeGlossary(projectDoc);
        const byCanonical = new Map();
        for (const entry of global.entries) {
            byCanonical.set(entry.canonical.toLowerCase(), entry);
        }
        for (const entry of project.entries) {
            byCanonical.set(entry.canonical.toLowerCase(), entry);
        }
        return {
            version: GLOSSARY_VERSION,
            updatedAt: project.updatedAt || global.updatedAt || null,
            entries: [...byCanonical.values()],
        };
    }

    /** 简繁转换保护用：启用条目的 canonical + aliases，长词优先 */
    function collectProtectTerms(glossary, options = {}) {
        const includeDisabled = options.includeDisabled === true;
        const doc = normalizeGlossary(glossary);
        const seen = new Set();
        const terms = [];
        for (const entry of doc.entries) {
            if (!includeDisabled && entry.enabled === false) continue;
            const forms = [entry.canonical, ...(entry.aliases || [])]
                .map((t) => String(t || '').trim())
                .filter(Boolean);
            for (const form of forms) {
                const key = form.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                terms.push(form);
            }
        }
        return terms.sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-CN'));
    }

    return {
        GLOSSARY_VERSION,
        escapeRegExp,
        isAsciiWord,
        normalizeAliasList,
        normalizeEntry,
        normalizeGlossary,
        buildTermRegExp,
        countMatches,
        replaceTerm,
        scanGlossaryIssues,
        summarizeGlossaryScan,
        applyGlossaryToCues,
        parseAliasesInput,
        upsertEntry,
        removeEntry,
        mergeGlossaries,
        collectProtectTerms,
        makeEntryId,
    };
}));
