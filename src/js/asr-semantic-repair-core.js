/**
 * Pro ASR semantic repair: selective LLM inference after rule cleanup, before MT.
 * Pure logic — no network.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAsrSemanticRepair = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function asrSemanticRepairCoreFactory() {
    const MODE_OFF = 'off';
    const MODE_AUTO = 'auto';
    const MODE_THOROUGH = 'thorough';

    const DEFAULT_MAX_AUTO_CUES = 32;
    const DEFAULT_MAX_THOROUGH_CUES = 240;
    const DEFAULT_NEIGHBOR_RADIUS = 1;
    const DEFAULT_LOW_CONF_THRESHOLD = 0.48;
    const DEFAULT_VERY_LOW_CONF_THRESHOLD = 0.36;
    const DEFAULT_AUTO_MIN_SCORE = 4;
    const DEFAULT_MAX_GLOSSARY_TERMS = 32;
    const DEFAULT_MAX_LENGTH_RATIO = 1.45;
    const DEFAULT_MIN_LENGTH_RATIO = 0.55;
    const DEFAULT_MAX_AUDIT_LINES = 8;
    const DEFAULT_MAX_AUDIT_TEXT = 48;

    const REPAIR_FAILURE_HINTS = Object.freeze({
        compute_busy: '请等待当前引擎/Pro 任务结束后再试。',
        llm_failed: '请检查 Pro 对话模型或 BYOK 配置、网络与额度。',
        parse_empty: '模型未返回有效 JSON，可换更强的通用对话模型重试。',
        aborted: '任务已取消。',
        not_entitled: '需要 Pro 授权（或已解锁语境重构）。',
        no_llm: '未配置可用于语义校正的对话模型。',
        timeout: '请求超时，可稍后重试或换更快的服务端。',
    });

    const REPAIR_CONSTRAINTS = [
        '根据前后对白语境，修正明显 ASR 误听、断句错误或同音误字。',
        '只做听写忠实的小修，勿整句创作式改写，勿改剧情语气与专名语义。',
        '勿为全角半角标点、句读点、空格差异而改写；若无同音误听/缺词/明显误听，必须原样返回。',
        '勿为书面语法通顺而改写口语；口语省略、重复、语气词应保留。',
        '保持每条 index 不变，不要合并或拆分，不要改时间轴。',
        '保留语气词与拟声；勿把有语义对白压成单字语气词。',
        '不确定时原样返回；改动宜小；输出语言必须与输入一致，不要翻译。',
    ].join('');

    const REPAIR_LANG_PROFILES = Object.freeze({
        ja: {
            label: '日语',
            outputRule: '输出语言必须是日语（与输入一致），不要翻译成中文或其它语言。',
        },
        zh: {
            label: '中文',
            outputRule: '输出语言必须是中文（与输入一致），不要翻译成日语或其它语言。',
        },
        en: {
            label: '英语',
            outputRule: '输出语言必须是英语（与输入一致），不要翻译成其它语言。',
        },
        generic: {
            label: '源语',
            outputRule: '输出语言必须与每条输入字幕一致，不要翻译成其它语言。',
        },
    });

    const PROFILE_REPAIR_HINTS = Object.freeze({
        av_soft: '本片为软声/亲密对白：保留呻吟、短促语气与拟声；勿删有句义的单字语气词。',
        film: '本片为影视对白：允许口语省略与断句；勿改成书面语或摘要式表达。',
        anime: '本片为动画/游戏对白：角色称呼与语气词多样，勿统一改写风格。',
        dialogue: '本片为对话片：以听写忠实为先，勿润色成更「好看」的台词。',
        default: '本片为口语对白：判断 ASR 误听即可，勿为语法通顺而改写。',
    });

    let fluency = null;
    try {
        fluency = (typeof module !== 'undefined' && module.exports)
            ? require('./subtitle-fluency-core')
            : null;
    } catch (_) {
        fluency = null;
    }

    function clampInt(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, Math.round(n)));
    }

    /** @returns {'off'|'auto'|'thorough'} */
    function normalizeAsrSemanticRepairMode(value) {
        if (value === false || value === 0) return MODE_OFF;
        const s = String(value == null ? MODE_AUTO : value).trim().toLowerCase();
        if (s === 'false' || s === '0' || s === 'off' || s === 'no') return MODE_OFF;
        if (s === 'thorough' || s === 'full' || s === 'all' || s === 'on' || s === 'true' || s === '1') {
            return MODE_THOROUGH;
        }
        if (s === 'auto' || s === '') return MODE_AUTO;
        return MODE_AUTO;
    }

    function resolveRepairMode(options = {}) {
        return normalizeAsrSemanticRepairMode(options.asrSemanticRepair ?? options.enabled);
    }

    function isSpeedPerfProfile(options = {}) {
        const v = String(options.perfProfile || '').trim().toLowerCase();
        return v === 'speed' || v === 'fast';
    }

    function shouldRunAsrSemanticRepair(options = {}) {
        const mode = resolveRepairMode(options);
        if (mode === MODE_OFF) return false;
        // Speed profile skips auto extras; explicit thorough still runs.
        if (isSpeedPerfProfile(options) && mode !== MODE_THOROUGH) return false;
        return true;
    }

    function normalizeLanguageTag(value) {
        const lang = String(value || '').trim().toLowerCase();
        if (!lang || lang === 'auto') return '';
        if (lang === 'ja' || lang === 'japanese' || lang === 'jp') return 'ja';
        if (lang === 'zh' || lang === 'chinese' || lang === 'cmn' || lang.startsWith('zh-')) return 'zh';
        if (lang === 'en' || lang === 'english' || lang.startsWith('en-')) return 'en';
        return lang.split(/[-_]/)[0] || '';
    }

    function normalizeContentProfile(options = {}) {
        return String(options.contentProfile || options.senseProfile || '').trim().toLowerCase();
    }

    function basenameMediaHint(mediaPath) {
        const p = String(mediaPath || '').trim();
        if (!p) return '';
        const parts = p.replace(/\\/g, '/').split('/');
        return parts[parts.length - 1] || '';
    }

    function clipAuditText(text, max = DEFAULT_MAX_AUDIT_TEXT) {
        const t = String(text || '').replace(/\s+/g, ' ').trim();
        if (!t) return '';
        const cap = Math.max(8, Number(max) || DEFAULT_MAX_AUDIT_TEXT);
        if (t.length <= cap) return t;
        return `${t.slice(0, cap - 1)}…`;
    }

    function isJaLanguage(options = {}) {
        const key = resolveRepairLanguageInfo(options).key;
        return key === 'ja' || key === 'generic';
    }

    function inferRepairLanguageFromCues(cues = [], options = {}) {
        let kana = 0;
        let cjk = 0;
        let latin = 0;
        for (const cue of Array.isArray(cues) ? cues : []) {
            const t = String(cue?.text || '');
            kana += (t.match(/[\u3040-\u30ff]/g) || []).length;
            cjk += (t.match(/[\u4e00-\u9fff]/g) || []).length;
            latin += (t.match(/[A-Za-z]/g) || []).length;
        }
        if (kana > 0) return 'ja';
        if (latin > 0 && latin >= cjk) return 'en';
        if (cjk > 0) {
            const profile = normalizeContentProfile(options);
            if (/av_soft|anime|ja/.test(profile)) return 'ja';
            return 'zh';
        }
        return 'generic';
    }

    /**
     * @returns {{ key: string, source: 'setting'|'profile'|'inferred' }}
     */
    function resolveRepairLanguageInfo(options = {}, cues = []) {
        const fromOpt = normalizeLanguageTag(options.language);
        if (fromOpt === 'ja' || fromOpt === 'zh' || fromOpt === 'en') {
            return { key: fromOpt, source: 'setting' };
        }
        const profile = normalizeContentProfile(options);
        if (/av_soft|anime|ja-/.test(profile)) {
            return { key: 'ja', source: 'profile' };
        }
        const inferred = inferRepairLanguageFromCues(cues, options);
        return { key: inferred || 'generic', source: 'inferred' };
    }

    function resolveRepairLanguageKey(options = {}, cues = []) {
        return resolveRepairLanguageInfo(options, cues).key;
    }

    function buildRegisterLine(options = {}) {
        const profile = normalizeContentProfile(options);
        if (profile && PROFILE_REPAIR_HINTS[profile]) {
            return PROFILE_REPAIR_HINTS[profile];
        }
        if (/av|soft|anime|galgame/.test(profile)) {
            return PROFILE_REPAIR_HINTS.av_soft;
        }
        if (/film|movie|drama|tv/.test(profile)) {
            return PROFILE_REPAIR_HINTS.film;
        }
        return PROFILE_REPAIR_HINTS.default;
    }

    function buildFilmLanguageLine(langInfo = {}) {
        const profile = REPAIR_LANG_PROFILES[langInfo.key] || REPAIR_LANG_PROFILES.generic;
        if (langInfo.source === 'setting') {
            return `本片对白语言为${profile.label}。你的任务是修正 ASR 听写错误，不是润色、摘要或翻译。`;
        }
        if (langInfo.source === 'profile') {
            return `本片按片源画像推断为${profile.label}对白。你的任务是修正 ASR 听写错误，不是润色、摘要或翻译。`;
        }
        return `本片对白语言推断为${profile.label}（识别语言为自动）。你的任务是修正 ASR 听写错误；不确定时请少改或原样返回。`;
    }

    function extractRepairGlossaryTerms(glossary, maxTerms = DEFAULT_MAX_GLOSSARY_TERMS) {
        const out = [];
        const seen = new Set();
        const push = (term, aliases = []) => {
            const t = String(term || '').trim();
            if (!t || seen.has(t)) return;
            seen.add(t);
            out.push({
                term: t,
                aliases: (Array.isArray(aliases) ? aliases : [])
                    .map((a) => String(a || '').trim())
                    .filter(Boolean),
            });
        };

        if (Array.isArray(glossary)) {
            for (const row of glossary) {
                if (!row || typeof row !== 'object') continue;
                const src = String(row.src || row.source || row.from || '').trim();
                const aliases = Array.isArray(row.aliases) ? row.aliases : [];
                if (src) push(src, aliases);
                else if (row.term) push(row.term, aliases);
            }
        } else if (glossary && typeof glossary === 'object') {
            const entries = Array.isArray(glossary.entries) ? glossary.entries : [];
            for (const entry of entries) {
                if (!entry || entry.enabled === false) continue;
                const sources = [];
                const explicit = entry.source || entry.mtSource || entry.src || entry.from;
                if (explicit) sources.push(String(explicit).trim());
                if (entry.term) sources.push(String(entry.term).trim());
                if (entry.canonical) sources.push(String(entry.canonical).trim());
                if (Array.isArray(entry.aliases)) {
                    for (const a of entry.aliases) {
                        const s = String(a || '').trim();
                        if (s) sources.push(s);
                    }
                }
                const primary = sources.find(Boolean);
                if (primary) {
                    push(primary, sources.filter((s) => s && s !== primary));
                }
            }
        }

        return out.slice(0, maxTerms);
    }

    /**
     * @returns {object}
     */
    function buildRepairContext(options = {}, cues = []) {
        const langInfo = resolveRepairLanguageInfo(options, cues);
        const langProfile = REPAIR_LANG_PROFILES[langInfo.key] || REPAIR_LANG_PROFILES.generic;
        const asrModel = String(
            options.primaryAsr || options.engineAsrModel || options.asrModel || '',
        ).trim();
        return {
            langKey: langInfo.key,
            langLabel: langProfile.label,
            languageSource: langInfo.source,
            contentProfile: normalizeContentProfile(options),
            mediaBasename: basenameMediaHint(options.mediaPath),
            filmLanguageLine: buildFilmLanguageLine(langInfo),
            registerLine: buildRegisterLine(options),
            asrModelLine: asrModel ? `上游 ASR 模型：${asrModel}。` : '',
            userNote: String(options.asrSemanticRepairNote || options.note || '').trim(),
            glossaryTerms: extractRepairGlossaryTerms(options.glossary),
            constraints: REPAIR_CONSTRAINTS,
        };
    }

    function buildRepairNote(ctx = {}) {
        const label = ctx.langLabel || REPAIR_LANG_PROFILES.generic.label;
        return `${REPAIR_CONSTRAINTS}（${label}听写）`;
    }

    function cueConfidence(cue, annotations, index) {
        if (Array.isArray(annotations) && annotations[index]) {
            const a = annotations[index];
            const c = Number(a.confidence ?? a.score);
            if (Number.isFinite(c)) return c;
        }
        const m = cue?.meta && typeof cue.meta === 'object' ? cue.meta : cue;
        const c = Number(m?.confidence ?? m?.score ?? m?.avgLogprob);
        if (Number.isFinite(c)) {
            return c <= 0 ? Math.max(0, Math.min(1, 1 + c)) : Math.max(0, Math.min(1, c));
        }
        return null;
    }

    function looksSuspiciousAsrText(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (fluency?.looksLikeWeirdCueText?.(t)) return true;
        if (/[A-Za-z]{6,}/.test(t) && !/^[A-Za-z\s'.-]+$/.test(t)) return true;
        if (/^[ぁ-んァ-ン]{1,2}$/.test(t) && t.length <= 2) return false;
        if (/^[A-Za-z]{1,2}$/.test(t) && t.length <= 2) return false;
        const symbols = (t.match(/[^\w\u3040-\u30ff\u4e00-\u9fff\s]/g) || []).length;
        if (t.length >= 5 && symbols / t.length >= 0.35) return true;
        if (/(.)\1{4,}/.test(t)) return true;
        if (/^[、。，．.!！?？…\s]+$/.test(t)) return true;
        return false;
    }

    function scoreRepairCandidate(cue, index, cues, options = {}) {
        const text = String(cue?.text || '').trim();
        if (!text) return -1;
        let score = 0;
        const suspicious = looksSuspiciousAsrText(text);
        if (suspicious) score += 5;
        const conf = cueConfidence(cue, options.annotations, index);
        const threshold = Number(options.lowConfThreshold) || DEFAULT_LOW_CONF_THRESHOLD;
        const veryLow = Number(options.veryLowConfThreshold) || DEFAULT_VERY_LOW_CONF_THRESHOLD;
        if (conf != null) {
            if (conf < veryLow) score += 4;
            else if (conf < threshold && suspicious) score += 2;
            else if (conf < threshold && text.length >= 12) score += 1;
        }
        if (text.length <= 2 && /[ぁ-んァ-ン]/.test(text)) score -= 2;
        if (text.length <= 2 && /^[A-Za-z]{1,3}$/.test(text)) score -= 2;
        if (/^[ぁ-んァ-ンー〜～!！?？…]+$/.test(text) && text.length <= 8) score -= 1;
        if (/^[A-Za-z\s'.!?-]+$/.test(text) && text.length <= 8) score -= 1;
        const prev = cues[index - 1];
        const next = cues[index + 1];
        if (prev && next) {
            const p = String(prev.text || '').trim();
            const n = String(next.text || '').trim();
            if (p && n && !/[。！？!?]/.test(p) && text.length >= 12) score += 1;
        }
        return score;
    }

    /**
     * @returns {{ index: number, score: number }[]}
     */
    function selectRepairTargets(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const mode = resolveRepairMode(options);
        const max = mode === MODE_THOROUGH
            ? clampInt(options.maxThoroughCues, 1, 500, DEFAULT_MAX_THOROUGH_CUES)
            : clampInt(options.maxAutoCues, 1, 200, DEFAULT_MAX_AUTO_CUES);
        if (mode === MODE_THOROUGH) {
            const out = [];
            for (let i = 0; i < list.length; i += 1) {
                const text = String(list[i]?.text || '').trim();
                if (!text) continue;
                out.push({ index: i, score: 1 });
            }
            return out.slice(0, max);
        }
        const scored = [];
        const minScore = clampInt(options.autoMinScore, 1, 12, DEFAULT_AUTO_MIN_SCORE);
        for (let i = 0; i < list.length; i += 1) {
            const score = scoreRepairCandidate(list[i], i, list, options);
            if (score >= minScore) scored.push({ index: i, score });
        }
        scored.sort((a, b) => b.score - a.score || a.index - b.index);
        return scored.slice(0, max);
    }

    function expandIndexesWithNeighbors(indexes, length, radius = DEFAULT_NEIGHBOR_RADIUS) {
        const r = clampInt(radius, 0, 4, DEFAULT_NEIGHBOR_RADIUS);
        const set = new Set();
        for (const raw of Array.isArray(indexes) ? indexes : []) {
            const idx = Number(raw);
            if (!Number.isInteger(idx) || idx < 0 || idx >= length) continue;
            for (let d = -r; d <= r; d += 1) {
                const j = idx + d;
                if (j >= 0 && j < length) set.add(j);
            }
        }
        return [...set].sort((a, b) => a - b);
    }

    function buildRepairCuePayload(cues, indexes, targetIndexSet = null) {
        const list = Array.isArray(cues) ? cues : [];
        const targets = targetIndexSet instanceof Set ? targetIndexSet : null;
        return (Array.isArray(indexes) ? indexes : [])
            .map((idx) => {
                const c = list[idx];
                if (!c) return null;
                return {
                    index: idx,
                    startMs: Number(c.startMs) || 0,
                    endMs: Number(c.endMs) || 0,
                    text: String(c.text || ''),
                    editable: targets ? targets.has(idx) : true,
                };
            })
            .filter(Boolean);
    }

    function buildRepairSystemPrompt(ctx = {}) {
        const profile = REPAIR_LANG_PROFILES[ctx.langKey] || REPAIR_LANG_PROFILES.generic;
        return [
            '你是影视 ASR 转录校正助手。',
            ctx.filmLanguageLine || buildFilmLanguageLine({ key: ctx.langKey, source: 'inferred' }),
            profile.outputRule,
            '保持每条字幕的 index 不变，不要合并或拆分条目，不要改时间轴。',
            '只做听写忠实的小修：同音误字、缺词、明显误听、断句错误。',
            '禁止仅修改标点、全角半角或句读点；若无听写错误，text 必须与输入完全一致。',
            '不要编造剧情、不要添加原文没有的信息。',
            '保留语气词、拟声与口语风格；专名不确定时保持原样。',
            '只输出 JSON，不要 Markdown，不要解释。格式：',
            '{"cues":[{"index":0,"text":"校正后的听写"}]}',
            '仅对 editable=true 的条目返回改写；editable=false 的上下文条目必须原样返回。',
            'cues 必须覆盖输入中的每一个 index，每个 index 恰好一条。',
        ].join('\n');
    }

    function buildRepairUserPrompt(cues, ctx = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const lines = [];
        if (ctx.registerLine) lines.push(ctx.registerLine);
        if (ctx.mediaBasename) {
            lines.push(`片源：${ctx.mediaBasename}（仅作体裁参考，勿据此编造剧情）`);
        }
        if (ctx.asrModelLine) lines.push(ctx.asrModelLine);
        if (ctx.glossaryTerms?.length) {
            lines.push('专名/术语（须保持一致）：');
            for (const g of ctx.glossaryTerms) {
                const alias = g.aliases?.length ? `（别名：${g.aliases.join('、')}）` : '';
                lines.push(`- ${g.term}${alias}`);
            }
            lines.push('');
        }
        if (ctx.userNote) lines.push(`补充要求：${ctx.userNote}`, '');
        if (ctx.langKey === 'ja') {
            lines.push(
                '日语示例：应修同音误字/缺词/粘连（如 以外→意外）；'
                + '不修 ?↔？、句号有无、仅空格差异。',
                '',
            );
        }
        lines.push(REPAIR_CONSTRAINTS, '');
        const editableCount = list.filter((c) => c.editable !== false).length;
        lines.push(`本批共 ${list.length} 条（其中 ${editableCount} 条可改写），请返回恰好 ${list.length} 条（每个 index 一条）。`);
        lines.push('待校正转录（JSON，editable=false 为只读上下文）：');
        lines.push(JSON.stringify(list.map((c) => ({
            index: c.index,
            text: c.text,
            editable: c.editable !== false,
        })), null, 2));
        return lines.join('\n');
    }

    function buildRepairChatMessages(cues, options = {}) {
        const allCues = Array.isArray(options.allCues) ? options.allCues : cues;
        const ctx = buildRepairContext(options, allCues);
        return [
            { role: 'system', content: buildRepairSystemPrompt(ctx) },
            { role: 'user', content: buildRepairUserPrompt(cues, ctx) },
        ];
    }

    function textScriptProfile(text) {
        const t = String(text || '');
        const kana = (t.match(/[\u3040-\u30ff]/g) || []).length;
        const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
        const latin = (t.match(/[A-Za-z]/g) || []).length;
        if (kana > 0) return 'ja';
        if (latin > 0 && latin >= cjk) return 'en';
        if (cjk > 0) return 'zh';
        return 'other';
    }

    function normalizeRepairCompareText(text) {
        return String(text || '')
            .normalize('NFKC')
            .replace(/[\s\u3000]+/g, '')
            .replace(/[、。，．,.!！?？…〜～ー\-—–·・「」『』（）()\[\]【】「」『』]/g, '')
            .toLowerCase();
    }

    function isTrivialRepairEdit(before, after) {
        const prev = String(before || '').trim();
        const next = String(after || '').trim();
        if (!next || prev === next) return true;
        return normalizeRepairCompareText(prev) === normalizeRepairCompareText(next);
    }

    /**
     * Reject over-edits / cross-language drift.
     * @returns {{ ok: boolean, reason?: string }}
     */
    function validateRepairUpdate(before, after, options = {}) {
        const prev = String(before || '').trim();
        const next = String(after || '').trim();
        if (!next) return { ok: false, reason: 'empty' };
        if (prev === next) return { ok: true };
        if (isTrivialRepairEdit(prev, next)) {
            return { ok: false, reason: 'trivial' };
        }
        const maxRatio = Number(options.maxLengthRatio) || DEFAULT_MAX_LENGTH_RATIO;
        const minRatio = Number(options.minLengthRatio) || DEFAULT_MIN_LENGTH_RATIO;
        if (prev.length >= 4) {
            const ratio = next.length / Math.max(1, prev.length);
            if (ratio > maxRatio || ratio < minRatio) {
                return { ok: false, reason: 'length_drift' };
            }
        }
        const langKey = options.langKey || 'generic';
        const beforeScript = textScriptProfile(prev);
        const afterScript = textScriptProfile(next);
        if (langKey === 'ja' && beforeScript === 'ja' && afterScript === 'zh') {
            return { ok: false, reason: 'script_drift' };
        }
        if (langKey === 'zh' && beforeScript === 'zh' && afterScript === 'ja') {
            return { ok: false, reason: 'script_drift' };
        }
        if (langKey === 'en' && beforeScript === 'en' && afterScript === 'zh') {
            return { ok: false, reason: 'script_drift' };
        }
        return { ok: true };
    }

    function extractJsonObject(text) {
        const raw = String(text || '').trim();
        if (!raw) return null;
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const body = fence ? fence[1].trim() : raw;
        const start = body.indexOf('{');
        const end = body.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            return JSON.parse(body.slice(start, end + 1));
        } catch {
            return null;
        }
    }

    let reconstructJson = null;
    function getReconstructJsonParser() {
        if (reconstructJson) return reconstructJson;
        try {
            reconstructJson = require('./advanced-context-reconstruct-core');
        } catch (_) {
            reconstructJson = null;
        }
        return reconstructJson;
    }

    function snippetRepairModelOutput(content, max = 240) {
        const recon = getReconstructJsonParser();
        if (typeof recon?.snippetModelOutput === 'function') {
            return recon.snippetModelOutput(content, max);
        }
        return clipAuditText(content, max) || '(空)';
    }

    function tryParseRepairJson(content) {
        const recon = getReconstructJsonParser();
        if (typeof recon?.tryParseJsonObject === 'function') {
            return recon.tryParseJsonObject(content);
        }
        return extractJsonObject(content);
    }

    function estimateRepairMaxTokens(cueCount = 1) {
        const n = Math.max(1, Number(cueCount) || 1);
        return Math.min(4096, 160 + Math.round(n * 72));
    }

    function parseRepairResponse(content, allowedIndexes) {
        const allowed = new Set(
            (Array.isArray(allowedIndexes) ? allowedIndexes : [])
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n) && n >= 0),
        );
        const parsed = tryParseRepairJson(content);
        const rows = Array.isArray(parsed?.cues)
            ? parsed.cues
            : (Array.isArray(parsed) ? parsed : []);
        const updates = [];
        for (const row of rows) {
            const index = Number(row?.index);
            if (!Number.isInteger(index) || index < 0) continue;
            if (allowed.size && !allowed.has(index)) continue;
            const text = String(row?.text ?? '').trim();
            if (!text) continue;
            updates.push({ index, text });
        }
        if (!updates.length) {
            return {
                ok: false,
                error: '模型未返回有效校正',
                code: 'parse_empty',
                snippet: snippetRepairModelOutput(content),
            };
        }
        return { ok: true, updates };
    }

    function applyRepairUpdates(cues, updates, options = {}) {
        const list = (Array.isArray(cues) ? cues : []).map((c) => ({ ...c }));
        const allow = new Set(
            (Array.isArray(options.allowIndexes) ? options.allowIndexes : [])
                .map((n) => Number(n))
                .filter((n) => Number.isInteger(n) && n >= 0),
        );
        const langKey = options.langKey || resolveRepairLanguageKey(options, list);
        const changedIndexes = [];
        const rejectedIndexes = [];
        const skippedTrivialIndexes = [];
        for (const row of Array.isArray(updates) ? updates : []) {
            const index = Number(row?.index);
            if (!Number.isInteger(index) || index < 0 || index >= list.length) continue;
            if (allow.size && !allow.has(index)) continue;
            const next = String(row?.text ?? '').trim();
            const prev = String(list[index]?.text || '').trim();
            if (!next || next === prev) continue;
            const check = validateRepairUpdate(prev, next, { ...options, langKey });
            if (!check.ok) {
                if (check.reason === 'trivial') skippedTrivialIndexes.push(index);
                else rejectedIndexes.push(index);
                continue;
            }
            list[index] = { ...list[index], text: next };
            changedIndexes.push(index);
        }
        return {
            cues: list,
            changed: changedIndexes.length,
            changedIndexes,
            rejected: rejectedIndexes.length,
            rejectedIndexes,
            skippedTrivial: skippedTrivialIndexes.length,
            skippedTrivialIndexes,
        };
    }

    function mockRepairUpdates(cues, targets) {
        const indexes = (Array.isArray(targets) ? targets : []).map((t) => t.index);
        const payload = buildRepairCuePayload(cues, indexes, new Set(indexes));
        return payload.map((c) => ({ index: c.index, text: c.text }));
    }

    function readOptionalMs(value) {
        if (value == null || value === '') return NaN;
        const n = Number(value);
        return Number.isFinite(n) ? n : NaN;
    }

    /**
     * Normalize engine `{start,end}` (seconds) and/or `{startMs,endMs}` into repair cues.
     * Never treat `index` alone as proof of ms timing — engine ASR rows often ship both
     * `index` and second-based `start`/`end` (MFYD-185: false hasMs zeroed the timeline).
     */
    function engineCuesToRepairMs(engineCues) {
        return (Array.isArray(engineCues) ? engineCues : []).map((c, i) => {
            const startSec = Number(c.start ?? c.startSec);
            const endSec = Number(c.end ?? c.endSec);
            let startMs = readOptionalMs(c.startMs);
            let endMs = readOptionalMs(c.endMs);
            // Prefer seconds when ms is absent, or when ms collapsed to ~0 while seconds
            // still look real (guards index-only / zeroed intake bugs).
            if (!Number.isFinite(startMs)
                || (startMs <= 0 && Number.isFinite(startSec) && startSec > 0.05)) {
                startMs = Number.isFinite(startSec) ? Math.round(startSec * 1000) : i * 1000;
            }
            if (!Number.isFinite(endMs)
                || (endMs <= startMs && Number.isFinite(endSec) && endSec > (Number.isFinite(startSec) ? startSec : startMs / 1000))) {
                endMs = Number.isFinite(endSec) ? Math.round(endSec * 1000) : startMs + 1000;
            }
            if (!(endMs > startMs)) endMs = startMs + 1000;
            return {
                index: i,
                startMs,
                endMs,
                text: String(c.text || ''),
                meta: c.meta && typeof c.meta === 'object' ? { ...c.meta } : undefined,
            };
        }).filter((c) => c.text);
    }

    function repairMsToEngineCues(cues) {
        return (Array.isArray(cues) ? cues : []).map((c) => {
            const startMs = Number(c.startMs) || 0;
            const endMs = Number(c.endMs) || startMs + 1000;
            const row = {
                start: startMs / 1000,
                end: endMs / 1000,
                text: String(c.text || ''),
            };
            if (c.meta && typeof c.meta === 'object') row.meta = { ...c.meta };
            return row;
        });
    }

    function summarizeRepairPlan(targets, mode) {
        const n = Array.isArray(targets) ? targets.length : 0;
        if (!n) return '转录语义校正：无需处理';
        if (mode === MODE_THOROUGH) return `转录语义校正（加强）：${n} 条`;
        return `转录语义校正（自动）：${n} 条可疑`;
    }

    /**
     * @returns {{ index: number, before: string, after: string }[]}
     */
    function buildRepairAuditEntries(beforeTexts, cues, changedIndexes = []) {
        const before = Array.isArray(beforeTexts) ? beforeTexts : [];
        const list = Array.isArray(cues) ? cues : [];
        const out = [];
        for (const raw of changedIndexes) {
            const index = Number(raw);
            if (!Number.isInteger(index) || index < 0 || index >= list.length) continue;
            const prev = String(before[index] ?? list[index]?.text ?? '').trim();
            const next = String(list[index]?.text ?? '').trim();
            if (!prev || !next || prev === next) continue;
            out.push({ index, before: prev, after: next });
        }
        return out;
    }

    function formatRepairAuditLogLines(entries = [], options = {}) {
        const maxLines = clampInt(options.maxLines, 1, 24, DEFAULT_MAX_AUDIT_LINES);
        const list = Array.isArray(entries) ? entries : [];
        if (!list.length) return [];
        const lines = [`转录语义校正 · 改写抽样（${list.length} 条）`];
        for (const row of list.slice(0, maxLines)) {
            const idx = Number(row.index);
            const before = clipAuditText(row.before, options.maxText);
            const after = clipAuditText(row.after, options.maxText);
            lines.push(`#${idx + 1}：${before} → ${after}`);
        }
        const extra = list.length - Math.min(list.length, maxLines);
        if (extra > 0) lines.push(`…另有 ${extra} 条未列出`);
        return lines;
    }

    function formatRepairResultSummary({
        targets = [],
        mode = MODE_AUTO,
        changed = 0,
        rejected = 0,
        skippedTrivial = 0,
        domainChanged = 0,
    } = {}) {
        const head = summarizeRepairPlan(targets, mode);
        if (changed <= 0 && skippedTrivial > 0) {
            return `${head}，未发现实质性听写错误（已忽略 ${skippedTrivial} 条标点级改动）`;
        }
        if (changed <= 0) {
            return `${head}，未发现需修改条目`;
        }
        const parts = [`${head}，实质性改写 ${changed} 条`];
        if (skippedTrivial > 0) parts.push(`忽略标点级 ${skippedTrivial} 条`);
        if (rejected > 0) parts.push(`校验拒绝 ${rejected} 条`);
        if (domainChanged > 0) parts.push(`规则补正 ${domainChanged} 处`);
        return parts.join('，');
    }

    function formatRepairFailureHint(code) {
        const key = String(code || '').trim().toLowerCase();
        if (!key) return '';
        return REPAIR_FAILURE_HINTS[key] || '';
    }

    function formatRepairFailureMessage(repair = {}) {
        const code = String(repair.code || '').trim();
        const err = String(repair.error || 'unknown').trim();
        const base = code && code !== err ? `${err} (${code})` : err;
        const hint = formatRepairFailureHint(code);
        return hint ? `${base} — ${hint}` : base;
    }

    return {
        MODE_OFF,
        MODE_AUTO,
        MODE_THOROUGH,
        DEFAULT_MAX_AUTO_CUES,
        DEFAULT_MAX_THOROUGH_CUES,
        DEFAULT_NEIGHBOR_RADIUS,
        DEFAULT_LOW_CONF_THRESHOLD,
        DEFAULT_VERY_LOW_CONF_THRESHOLD,
        DEFAULT_AUTO_MIN_SCORE,
        REPAIR_CONSTRAINTS,
        REPAIR_NOTE_GENERIC: REPAIR_CONSTRAINTS,
        PROFILE_REPAIR_HINTS,
        REPAIR_FAILURE_HINTS,
        normalizeAsrSemanticRepairMode,
        resolveRepairMode,
        isSpeedPerfProfile,
        shouldRunAsrSemanticRepair,
        normalizeLanguageTag,
        normalizeContentProfile,
        isJaLanguage,
        inferRepairLanguageFromCues,
        resolveRepairLanguageKey,
        resolveRepairLanguageInfo,
        buildRepairContext,
        buildRepairNote,
        buildRegisterLine,
        buildFilmLanguageLine,
        extractRepairGlossaryTerms,
        selectRepairTargets,
        expandIndexesWithNeighbors,
        buildRepairCuePayload,
        buildRepairSystemPrompt,
        buildRepairUserPrompt,
        buildRepairChatMessages,
        validateRepairUpdate,
        parseRepairResponse,
        applyRepairUpdates,
        mockRepairUpdates,
        engineCuesToRepairMs,
        repairMsToEngineCues,
        summarizeRepairPlan,
        buildRepairAuditEntries,
        formatRepairAuditLogLines,
        formatRepairResultSummary,
        formatRepairFailureHint,
        formatRepairFailureMessage,
        basenameMediaHint,
        clipAuditText,
        estimateRepairMaxTokens,
        snippetRepairModelOutput,
        tryParseRepairJson,
        looksSuspiciousAsrText,
        looksSuspiciousJaAsrText: looksSuspiciousAsrText,
        scoreRepairCandidate,
        textScriptProfile,
        normalizeRepairCompareText,
        isTrivialRepairEdit,
    };
}));
