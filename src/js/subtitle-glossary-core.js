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
        const roleRaw = String(raw.role || '').trim().toLowerCase();
        let role = 'term';
        if (roleRaw === 'character' || roleRaw === 'char' || roleRaw === 'name') role = 'character';
        else if (roleRaw === 'prereplace' || roleRaw === 'pre') role = 'preReplace';
        else if (roleRaw === 'postreplace' || roleRaw === 'post') role = 'postReplace';
        else if (raw.asrReplace === true || raw.asrMisheard === true) role = 'preReplace';

        let promptInject = String(raw.promptInject || '').trim().toLowerCase();
        if (promptInject !== 'hit' && promptInject !== 'always' && promptInject !== 'never') {
            promptInject = role === 'character' ? 'always' : 'hit';
        }

        const entry = {
            id: String(raw.id || makeEntryId()),
            canonical,
            aliases,
            caseSensitive: !!raw.caseSensitive,
            enabled: raw.enabled !== false,
            note: String(raw.note || '').trim(),
            asrReplace: raw.asrReplace === true || raw.asrMisheard === true,
            role,
            promptInject,
        };
        const normalizedPost = normalizePostReplace(raw.postReplace);
        if (normalizedPost) entry.postReplace = normalizedPost;
        return entry;
    }

    function normalizeStringList(raw) {
        if (Array.isArray(raw)) {
            return raw.map((s) => String(s || '').trim()).filter(Boolean);
        }
        if (typeof raw === 'string') {
            return String(raw)
                .split(/[,，、;；|／/\n\r\t]+/)
                .map((s) => s.trim())
                .filter(Boolean);
        }
        return [];
    }

    /**
     * Normalize nested postReplace; empty/invalid → null.
     */
    function normalizePostReplace(raw) {
        if (raw == null || raw === false) return null;
        if (typeof raw !== 'object') return null;
        const whenRaw = raw.when && typeof raw.when === 'object' ? raw.when : {};
        const when = {};
        for (const key of ['srcIncludes', 'srcExcludes', 'dstIncludes', 'dstExcludes', 'audioEventIn']) {
            const list = normalizeStringList(whenRaw[key]);
            if (list.length) when[key] = list;
        }
        const replace = [];
        for (const rule of Array.isArray(raw.replace) ? raw.replace : []) {
            const from = String(rule?.from || '').trim();
            const to = String(rule?.to ?? '').trim();
            if (!from) continue;
            replace.push({ from, to });
        }
        if (!replace.length && raw.enabled === false && !Object.keys(when).length) {
            return null;
        }
        return {
            enabled: raw.enabled !== false,
            when,
            replace,
        };
    }

    /**
     * Parse editor form fields into a postReplace object (or null if empty).
     */
    function parsePostReplaceFormFields(fields = {}) {
        const enabled = fields.enabled !== false && fields.enabled !== 'false' && fields.enabled !== 0;
        const when = {};
        const srcIncludes = normalizeStringList(fields.srcIncludes);
        const srcExcludes = normalizeStringList(fields.srcExcludes);
        const dstIncludes = normalizeStringList(fields.dstIncludes);
        const dstExcludes = normalizeStringList(fields.dstExcludes);
        const audioEventIn = normalizeStringList(fields.audioEventIn).map((x) => x.toUpperCase());
        if (srcIncludes.length) when.srcIncludes = srcIncludes;
        if (srcExcludes.length) when.srcExcludes = srcExcludes;
        if (dstIncludes.length) when.dstIncludes = dstIncludes;
        if (dstExcludes.length) when.dstExcludes = dstExcludes;
        if (audioEventIn.length) when.audioEventIn = audioEventIn;

        const replace = [];
        const pairText = String(fields.replaceText || fields.replacePairs || '');
        for (const line of pairText.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const m = trimmed.match(/^(.+?)\s*(?:→|->|=>|=|｜|\|)\s*(.*)$/);
            if (!m) continue;
            const from = m[1].trim();
            const to = m[2].trim();
            if (!from) continue;
            replace.push({ from, to });
        }
        if (Array.isArray(fields.replace)) {
            for (const rule of fields.replace) {
                const from = String(rule?.from || '').trim();
                const to = String(rule?.to ?? '').trim();
                if (!from) continue;
                replace.push({ from, to });
            }
        }
        if (!replace.length && !Object.keys(when).length && enabled !== false) {
            return null;
        }
        return normalizePostReplace({ enabled, when, replace });
    }

    /**
     * Flatten postReplace for editor form fields.
     */
    function formatPostReplaceFormFields(postReplace) {
        const pr = normalizePostReplace(postReplace) || {
            enabled: true,
            when: {},
            replace: [],
        };
        const join = (list) => (Array.isArray(list) ? list.join('，') : '');
        return {
            enabled: pr.enabled !== false,
            srcIncludes: join(pr.when?.srcIncludes),
            srcExcludes: join(pr.when?.srcExcludes),
            dstIncludes: join(pr.when?.dstIncludes),
            dstExcludes: join(pr.when?.dstExcludes),
            audioEventIn: join(pr.when?.audioEventIn),
            replaceText: (pr.replace || []).map((r) => `${r.from}→${r.to}`).join('\n'),
        };
    }

    /**
     * Built-in address cleanup rules (GalTransl-style postReplace table).
     * Applied by applyConditionalPostReplace + address heuristics fallback.
     */
    const BUILTIN_ADDRESS_POST_REPLACE_ENTRIES = [
        {
            id: 'builtin_dup_honorific',
            canonical: '_builtin_dup_honorific',
            enabled: true,
            role: 'postReplace',
            promptInject: 'never',
            postReplace: {
                enabled: true,
                when: {},
                replace: [
                    { from: '小姐小姐', to: '小姐' },
                    { from: '先生先生', to: '先生' },
                ],
            },
        },
        {
            id: 'builtin_oka_sama',
            canonical: '_builtin_oka_sama',
            enabled: true,
            role: 'postReplace',
            promptInject: 'never',
            postReplace: {
                enabled: true,
                when: { dstIncludes: ['奥小姐'], srcExcludes: ['奥小姐'] },
                replace: [{ from: '奥小姐', to: '太太' }],
            },
        },
        {
            id: 'builtin_danna',
            canonical: '_builtin_danna',
            enabled: true,
            role: 'postReplace',
            promptInject: 'never',
            postReplace: {
                enabled: true,
                when: { dstIncludes: ['旦那小姐'] },
                replace: [{ from: '旦那小姐', to: '老公' }],
            },
        },
    ];

    function matchPostReplaceWhen(when, src, zh, audioEvent) {
        const w = when && typeof when === 'object' ? when : {};
        const srcInc = Array.isArray(w.srcIncludes) ? w.srcIncludes : [];
        const srcExc = Array.isArray(w.srcExcludes) ? w.srcExcludes : [];
        const dstInc = Array.isArray(w.dstIncludes) ? w.dstIncludes : [];
        const dstExc = Array.isArray(w.dstExcludes) ? w.dstExcludes : [];
        if (srcInc.length && !srcInc.some((p) => src.includes(String(p)))) return false;
        if (srcExc.some((p) => src.includes(String(p)))) return false;
        if (dstInc.length && !dstInc.some((p) => zh.includes(String(p)))) return false;
        if (dstExc.some((p) => zh.includes(String(p)))) return false;
        const evtNeed = Array.isArray(w.audioEventIn)
            ? w.audioEventIn.map((x) => String(x).toUpperCase())
            : [];
        if (evtNeed.length) {
            const evt = String(audioEvent || '').toUpperCase();
            if (!evtNeed.includes(evt)) return false;
        }
        return true;
    }

    function applyPostReplaceEntriesToText(zhText, srcText, entries, options = {}) {
        let zh = String(zhText || '');
        const src = String(srcText || '');
        const audioEvent = options.audioEvent || '';
        let touched = false;
        const reasons = [];
        for (const entry of entries || []) {
            if (!entry || entry.enabled === false || !entry.postReplace || entry.postReplace.enabled === false) {
                continue;
            }
            if (!matchPostReplaceWhen(entry.postReplace.when, src, zh, audioEvent)) continue;
            for (const rule of entry.postReplace.replace || []) {
                const from = String(rule?.from || '').trim();
                const to = String(rule?.to ?? '').trim();
                if (!from || !zh.includes(from)) continue;
                zh = zh.split(from).join(to);
                touched = true;
                if (entry.id) reasons.push(entry.id);
            }
        }
        return { text: zh, changed: touched, reasons: [...new Set(reasons)] };
    }

    function applyBuiltinAddressPostReplaceToText(zhText, srcText, options = {}) {
        return applyPostReplaceEntriesToText(
            zhText,
            srcText,
            BUILTIN_ADDRESS_POST_REPLACE_ENTRIES,
            options,
        );
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
        const idx = doc.entries.findIndex((e) => e.id === String(patch?.id || ''));
        const prev = idx >= 0 ? doc.entries[idx] : null;
        const entry = normalizeEntry({
            ...(prev || {}),
            ...patch,
            // Form edits pass postReplace explicitly; omit key to keep prior rules; null clears.
            postReplace: patch?.postReplace !== undefined
                ? patch.postReplace
                : (prev?.postReplace),
            id: patch?.id || prev?.id,
        });
        // normalizeEntry drops null postReplace; ensure clear sticks when patching.
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'postReplace') && !patch.postReplace) {
            delete entry.postReplace;
        }
        if (!entry.canonical) {
            return { ok: false, error: '标准写法不能为空', glossary: doc };
        }
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

    /**
     * 将术语表转为 faster-whisper 可用的 initial_prompt / hotwords（不改 TransWithAI 源码，仅写 generation_config）。
     */
    function buildAsrPromptHints(glossary, options = {}) {
        const maxTerms = Math.max(1, Math.min(80, Number(options.maxTerms) || 40));
        const terms = collectProtectTerms(glossary, options).slice(0, maxTerms);
        if (!terms.length) {
            return { initial_prompt: '', hotwords: '', termCount: 0 };
        }
        const hotwords = terms.join(' ');
        const promptTerms = terms.slice(0, Math.min(24, terms.length));
        const initial_prompt = `以下专有名词请优先采用：${promptTerms.join('、')}。`;
        return { initial_prompt, hotwords, termCount: terms.length };
    }

    /**
     * Soft-AV JA vocabulary for Whisper (keep didactic text out — model echoes it).
     * Mens-esthe hotwords help massage titles; school/sibling titles (IPZZ-745)
     * should use a lighter general prompt via options.hint / mediaPath / title.
     * Keep compact — sync with transub_engine.cue_cleanup.ja_av_domain_whisper_bias.
     */
    const JA_AV_MENS_ESTHE_HOTWORDS = [
        'メンズエステ', 'メンエス', 'オイル', '指圧', '半パンツ', 'リンパ',
        'ふくらはぎ', 'ほぐして', 'うつ伏せ', '仰向け', 'ゲスト',
        '施術', 'マッサージ', '肩', '背中', '追加', 'コース', '店長', '着替え',
    ].join(' ');
    const JA_AV_GENERAL_HOTWORDS = [
        'お兄ちゃん', '気持ちいい', 'だめ', 'エッチ', 'あぁん',
        'やめて', '恥ずかしい', '好き', 'キス', 'もっと',
    ].join(' ');

    function buildJaAvAsrPromptHints(options = {}) {
        const hint = [
            options.hint,
            options.title,
            options.mediaPath,
            options.media_path,
            options.fileName,
        ].map((x) => String(x || '')).join(' ');
        const esthe = /メンズエステ|メンエス|massage|esthe|オイルマッサージ|mens[-_]?esthe/i.test(hint);
        const nonEsthe = /学校|妹|兄|お兄|学園|制服|skirt|sister|brother|\bipzz\b|\bsone\b|\bssis\b|\bsnis\b|\bmide\b/i.test(hint);
        if (nonEsthe && !esthe) {
            return {
                initial_prompt: '日本語の自然な会話。',
                hotwords: JA_AV_GENERAL_HOTWORDS,
                termCount: JA_AV_GENERAL_HOTWORDS.split(/\s+/).filter(Boolean).length,
                domain: 'soft_av_general',
            };
        }
        return {
            initial_prompt: 'メンズエステの店内会話。',
            hotwords: JA_AV_MENS_ESTHE_HOTWORDS,
            termCount: JA_AV_MENS_ESTHE_HOTWORDS.split(/\s+/).filter(Boolean).length,
            domain: 'mens_esthe',
        };
    }

    /** Parse `blacklist: a | b` from glossary entry note (asr-hotword import). */
    function parseAsrBlacklistNote(note) {
        const raw = String(note || '').trim();
        const m = /^blacklist:\s*(.+)$/i.exec(raw);
        if (!m) return [];
        return m[1].split('|').map((s) => s.trim()).filter(Boolean);
    }

    function entryAsrReplaceEnabled(entry) {
        if (!entry || entry.enabled === false) return false;
        if (entry.asrReplace === true || entry.asrMisheard === true) return true;
        const note = String(entry.note || '').toLowerCase();
        if (note.includes('asr-hotword') || note.includes('bad-pool') || note.includes('misheard')) {
            return true;
        }
        return false;
    }

    /**
     * Build engine asrGlossary rows: alias/misheard → canonical.
     * Only entries marked for replace (hotword / misheard); AniList names stay prompt-only.
     */
    function buildAsrGlossaryEntries(glossary, options = {}) {
        const doc = normalizeGlossary(glossary);
        const out = [];
        const seen = new Set();
        for (const entry of doc.entries) {
            if (!entryAsrReplaceEnabled(entry)) continue;
            const correct = String(entry.canonical || '').trim();
            if (!correct) continue;
            const blacklist = parseAsrBlacklistNote(entry.note);
            for (const alias of entry.aliases || []) {
                const wrong = String(alias || '').trim();
                if (!wrong || wrong === correct) continue;
                const key = `${wrong.toLowerCase()}\0${correct}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const row = { wrong, correct, stage: 'asr' };
                if (blacklist.length) row.blacklist = blacklist;
                out.push(row);
            }
        }
        out.sort((a, b) => b.wrong.length - a.wrong.length || a.wrong.localeCompare(b.wrong, 'ja'));
        return out;
    }

    function normalizeGlossaryPromptInjectMode(value) {
        const v = String(value == null ? 'hitOnly' : value).trim().toLowerCase();
        if (v === 'legacy' || v === 'all' || v === 'off' || v === 'full') return 'legacy';
        return 'hitOnly';
    }

    function clampGlossaryAlwaysCharacterMax(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 8;
        return Math.max(0, Math.min(16, Math.round(n)));
    }

    function entryAppearsInText(entry, sourceText) {
        const text = String(sourceText || '');
        if (!text || !entry) return false;
        const forms = [entry.canonical, ...(entry.aliases || [])]
            .map((t) => String(t || '').trim())
            .filter(Boolean)
            .sort((a, b) => b.length - a.length);
        for (const form of forms) {
            if (countMatches(text, form, entry.caseSensitive) > 0) return true;
        }
        return false;
    }

    /**
     * GalTransl-style GPT dict: hit-only inject + character always-cap.
     * @returns {Array<{term:string,translation:string,info:string,role?:string}>}
     */
    function selectGlossaryTermsForBatch(glossary, sourceText, options = {}) {
        const doc = normalizeGlossary(glossary);
        const mode = normalizeGlossaryPromptInjectMode(options.glossaryPromptInjectMode);
        const alwaysMax = clampGlossaryAlwaysCharacterMax(options.glossaryAlwaysCharacterMax);
        const maxTerms = Math.max(8, Math.min(80, Number(options.maxTerms) || 48));
        const text = String(sourceText || '');

        const toMtTerm = (entry) => {
            const alias = (entry.aliases || [])[0] || entry.canonical;
            return {
                term: alias,
                translation: entry.canonical,
                info: entry.note || '',
                role: entry.role,
                src: alias,
                dst: entry.canonical,
                note: entry.note || '',
            };
        };

        if (mode === 'legacy') {
            const out = [];
            for (const entry of doc.entries) {
                if (entry.enabled === false || entry.promptInject === 'never') continue;
                out.push(toMtTerm(entry));
                if (out.length >= maxTerms) break;
            }
            return out;
        }

        const always = [];
        const hits = [];
        for (const entry of doc.entries) {
            if (entry.enabled === false || entry.promptInject === 'never') continue;
            if (entry.promptInject === 'always' || (entry.role === 'character' && entry.promptInject !== 'hit')) {
                always.push(entry);
                continue;
            }
            if (entryAppearsInText(entry, text)) hits.push(entry);
        }

        const picked = [];
        const seen = new Set();
        const push = (entry) => {
            const key = String(entry.canonical || '').toLowerCase();
            if (!key || seen.has(key)) return;
            seen.add(key);
            picked.push(toMtTerm(entry));
        };
        for (const entry of always.slice(0, alwaysMax)) push(entry);
        for (const entry of hits) {
            if (picked.length >= maxTerms) break;
            push(entry);
        }
        return picked;
    }

    /**
     * Conditional post-replace (GalTransl-style when predicates).
     * Includes built-in address cleanup unless options.includeBuiltinAddressRules === false.
     */
    function applyConditionalPostReplace(cues, glossary, options = {}) {
        if (options.glossaryConditionalPostReplace === false) {
            return { cues: Array.isArray(cues) ? cues.slice() : [], changed: 0 };
        }
        const doc = normalizeGlossary(glossary);
        const includeBuiltin = options.includeBuiltinAddressRules !== false;
        const entries = [
            ...(includeBuiltin ? BUILTIN_ADDRESS_POST_REPLACE_ENTRIES : []),
            ...doc.entries,
        ];
        const list = Array.isArray(cues) ? cues : [];
        let changed = 0;
        const next = list.map((c) => {
            let zh = String(c?.text ?? c?.targetText ?? '');
            const src = String(c?.sourceText ?? c?.ja ?? '');
            const applied = applyPostReplaceEntriesToText(zh, src, entries, {
                audioEvent: c?.audioEvent,
            });
            if (!applied.changed) return c;
            changed += 1;
            if (c?.targetText != null) return { ...c, targetText: applied.text };
            return { ...c, text: applied.text };
        });
        return { cues: next, changed };
    }

    function glossaryRoleLabelZh(role) {
        const r = String(role || '').trim();
        if (r === 'character') return '角色';
        if (r === 'preReplace') return 'ASR';
        if (r === 'postReplace') return '译后';
        return '';
    }

    return {
        GLOSSARY_VERSION,
        escapeRegExp,
        isAsciiWord,
        normalizeAliasList,
        makeEntryId,
        coerceAliases,
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
        buildAsrPromptHints,
        buildJaAvAsrPromptHints,
        parseAsrBlacklistNote,
        entryAsrReplaceEnabled,
        buildAsrGlossaryEntries,
        normalizeGlossaryPromptInjectMode,
        clampGlossaryAlwaysCharacterMax,
        entryAppearsInText,
        selectGlossaryTermsForBatch,
        normalizePostReplace,
        parsePostReplaceFormFields,
        formatPostReplaceFormFields,
        BUILTIN_ADDRESS_POST_REPLACE_ENTRIES,
        matchPostReplaceWhen,
        applyPostReplaceEntriesToText,
        applyBuiltinAddressPostReplaceToText,
        applyConditionalPostReplace,
        glossaryRoleLabelZh,
    };
}));
