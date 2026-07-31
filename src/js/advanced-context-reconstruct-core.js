/**
 * 语境重构：分块、提示词、模型输出解析（无网络）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAdvancedContextReconstruct = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function advancedContextReconstructCoreFactory() {
    const DEFAULT_WINDOW_CUES = 30;
    const DEFAULT_OVERLAP_CUES = 2;
    const MAX_GLOSSARY_TERMS = 40;

    function clampInt(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, Math.round(n)));
    }

    function normalizeCue(raw, fallbackIndex = 0) {
        const index = Number.isInteger(Number(raw?.index))
            ? Number(raw.index)
            : fallbackIndex;
        return {
            index,
            startMs: Number(raw?.startMs) || 0,
            endMs: Number(raw?.endMs) || 0,
            text: String(raw?.text ?? ''),
            sourceText: String(raw?.sourceText ?? ''),
        };
    }

    function normalizeCueList(cues) {
        if (!Array.isArray(cues)) return [];
        return cues.map((c, i) => normalizeCue(c, i));
    }

    /**
     * 按条数分块，块间重叠 overlap 条，便于跨句连贯。
     * @returns {{ chunkIndex: number, cues: object[], overlapFromPrev: number }[]}
     */
    function chunkCues(cues, { windowCues = DEFAULT_WINDOW_CUES, overlapCues = DEFAULT_OVERLAP_CUES } = {}) {
        const list = normalizeCueList(cues);
        const size = clampInt(windowCues, 5, 80, DEFAULT_WINDOW_CUES);
        const overlap = clampInt(overlapCues, 0, Math.floor(size / 2), DEFAULT_OVERLAP_CUES);
        if (!list.length) return [];
        const step = Math.max(1, size - overlap);
        const chunks = [];
        for (let start = 0; start < list.length; start += step) {
            const slice = list.slice(start, start + size);
            chunks.push({
                chunkIndex: chunks.length,
                cues: slice,
                overlapFromPrev: start === 0 ? 0 : overlap,
            });
            if (start + size >= list.length) break;
        }
        return chunks;
    }

    function extractGlossaryTerms(glossary, maxTerms = MAX_GLOSSARY_TERMS) {
        const entries = Array.isArray(glossary?.entries) ? glossary.entries : [];
        const out = [];
        const seen = new Set();
        for (const e of entries) {
            const term = String(e?.term || e?.canonical || '').trim();
            if (!term || seen.has(term)) continue;
            seen.add(term);
            const aliases = Array.isArray(e?.aliases)
                ? e.aliases.map((a) => String(a).trim()).filter(Boolean)
                : [];
            out.push({ term, aliases });
            if (out.length >= maxTerms) break;
        }
        return out;
    }

    function normalizeIntensity(value) {
        const v = String(value || '').trim().toLowerCase();
        if (v === 'light' || v === 'strong') return v;
        return 'balanced';
    }

    function getIntensityTemperature(intensity) {
        const map = { light: 0.2, balanced: 0.3, strong: 0.45 };
        return map[normalizeIntensity(intensity)] ?? 0.3;
    }

    function buildSystemPrompt({ preserveTiming = true, intensity = 'balanced' } = {}) {
        const timing = preserveTiming
            ? '保持每条字幕的 index 不变，不要合并或拆分条目，不要改时间轴。'
            : '尽量保持条目数量与 index；若必须调整，仍用原 index 回写文本。';
        const level = normalizeIntensity(intensity);
        const intensityLine = level === 'light'
            ? '改写幅度宜小：轻度润色，尽量保留原句结构与用词，仅修正明显不通顺处。'
            : (level === 'strong'
                ? '可在不编造的前提下更大胆统一专名、语气与跨句风格。'
                : '');
        return [
            '你是影视字幕润色助手，负责在保留原意的前提下重构译文，使跨句语境更连贯、用词更统一、口语更自然。',
            timing,
            intensityLine,
            '不要编造剧情、不要添加原文没有的信息、不要翻译成其它语言（保持目标语言）。',
            '若提供了原文对照，以原文语义为准修正明显误译，但仍输出目标语言译文。',
            '若提供了术语表，专有名词必须使用术语表中的标准译名。',
            '只输出 JSON，不要 Markdown，不要解释。格式：',
            '{"cues":[{"index":0,"text":"改写后的字幕文本"}]}',
            'cues 必须覆盖输入中的每一个 index，text 可为多行（用 \\n）。',
        ].filter(Boolean).join('\n');
    }

    function buildUserPrompt({ cues, glossaryTerms = [], note = '' }) {
        const lines = [];
        if (note) lines.push(`补充要求：${note}`, '');
        if (glossaryTerms.length) {
            lines.push('术语表（必须遵守）：');
            for (const g of glossaryTerms) {
                const alias = g.aliases?.length ? `（别名：${g.aliases.join('、')}）` : '';
                lines.push(`- ${g.term}${alias}`);
            }
            lines.push('');
        }
        lines.push('待重构字幕（JSON）：');
        const payload = cues.map((c) => {
            const row = { index: c.index, text: c.text };
            if (c.sourceText) row.source = c.sourceText;
            return row;
        });
        lines.push(JSON.stringify(payload, null, 2));
        return lines.join('\n');
    }

    function buildChatMessages(chunkCuesList, options = {}) {
        const glossaryTerms = options.glossaryTerms
            || extractGlossaryTerms(options.glossary);
        return [
            {
                role: 'system',
                content: buildSystemPrompt({
                    preserveTiming: options.preserveTiming !== false,
                    intensity: options.intensity,
                }),
            },
            {
                role: 'user',
                content: buildUserPrompt({
                    cues: normalizeCueList(chunkCuesList),
                    glossaryTerms,
                    note: String(options.note || '').trim(),
                }),
            },
        ];
    }

    function stripCodeFence(text) {
        let s = String(text || '').trim();
        if (s.startsWith('```')) {
            s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        }
        return s;
    }

    /** Strip thinking / reasoning wrappers that break JSON.parse for chat models. */
    function stripThinkBlocks(text) {
        return String(text || '')
            .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '\n')
            .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '\n')
            .replace(/```thinking\b[\s\S]*?```/gi, '\n')
            .replace(/<think\b[^>]*>[\s\S]*?(?=\{|\[)/gi, '\n')
            .trim();
    }

    /** Drop leading prose before the first JSON object/array (untagged CoT). */
    function stripLeadingProse(text) {
        const s = String(text || '');
        const cuesObj = s.search(/\{\s*"cues"\s*:/);
        if (cuesObj >= 0) return s.slice(cuesObj);
        const arr = s.search(/\[\s*\{\s*"index"\s*:/);
        if (arr >= 0) return s.slice(arr);
        const brace = s.search(/[\{\[]/);
        if (brace >= 0) return s.slice(brace);
        return s.trim();
    }

    function relaxJsonSyntax(raw) {
        let s = String(raw || '').trim();
        if (!s) return s;
        s = s.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
        s = s.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
        s = s.replace(/｛/g, '{').replace(/｝/g, '}');
        s = s.replace(/［/g, '[').replace(/］/g, ']');
        s = s.replace(/,\s*([}\]])/g, '$1');
        s = s.replace(/\/\*[\s\S]*?\*\//g, '');
        s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');
        return s.trim();
    }

    /**
     * Extract a JSON object/array candidate; repair truncated payloads when possible.
     */
    function extractJsonCandidate(text) {
        let s = stripCodeFence(stripThinkBlocks(text));
        s = stripLeadingProse(s);
        if (!s) return '';

        const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
        if (fence && fence[1]) {
            s = stripLeadingProse(fence[1].trim());
        }

        const objStart = s.indexOf('{');
        const arrStart = s.indexOf('[');
        let start = -1;
        let openCh = '{';
        let closeCh = '}';
        if (objStart >= 0 && (arrStart < 0 || objStart <= arrStart)) {
            start = objStart;
            openCh = '{';
            closeCh = '}';
        } else if (arrStart >= 0) {
            start = arrStart;
            openCh = '[';
            closeCh = ']';
        }
        if (start < 0) return s.trim();

        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < s.length; i += 1) {
            const ch = s[i];
            if (inString) {
                if (escape) {
                    escape = false;
                } else if (ch === '\\') {
                    escape = true;
                } else if (ch === '"') {
                    inString = false;
                }
                continue;
            }
            if (ch === '"') {
                inString = true;
                continue;
            }
            if (ch === openCh) depth += 1;
            else if (ch === closeCh) {
                depth -= 1;
                if (depth === 0) {
                    return s.slice(start, i + 1);
                }
            }
        }

        // Truncated JSON — close open string / brackets so partial cues can be recovered.
        let truncated = s.slice(start);
        // Drop a trailing incomplete object after the last complete cue when possible.
        const lastCompleteObj = truncated.lastIndexOf('}');
        if (openCh === '{' && /"cues"\s*:\s*\[/.test(truncated) && lastCompleteObj > 0) {
            const cuesOpen = truncated.indexOf('[');
            if (cuesOpen > 0 && lastCompleteObj > cuesOpen) {
                let repaired = truncated.slice(0, lastCompleteObj + 1);
                // Ensure cues array + root object closed
                const openBrackets = (repaired.match(/\[/g) || []).length;
                const closeBrackets = (repaired.match(/\]/g) || []).length;
                if (openBrackets > closeBrackets) repaired += ']'.repeat(openBrackets - closeBrackets);
                const openBraces = (repaired.match(/\{/g) || []).length;
                const closeBraces = (repaired.match(/\}/g) || []).length;
                if (openBraces > closeBraces) repaired += '}'.repeat(openBraces - closeBraces);
                return repaired.replace(/,\s*([}\]])/g, '$1');
            }
        }
        if (openCh === '[' && lastCompleteObj > 0) {
            let repaired = truncated.slice(0, lastCompleteObj + 1);
            const openBrackets = (repaired.match(/\[/g) || []).length;
            const closeBrackets = (repaired.match(/\]/g) || []).length;
            if (openBrackets > closeBrackets) repaired += ']'.repeat(openBrackets - closeBrackets);
            return repaired.replace(/,\s*([}\]])/g, '$1');
        }

        truncated = truncated.replace(/,\s*$/, '');
        const quoteCount = (truncated.match(/"/g) || []).length;
        if (quoteCount % 2 === 1) truncated += '"';
        if (openCh === '{') {
            const open = (truncated.match(/\{/g) || []).length;
            const close = (truncated.match(/\}/g) || []).length;
            const openSq = (truncated.match(/\[/g) || []).length;
            const closeSq = (truncated.match(/\]/g) || []).length;
            if (openSq > closeSq) truncated += ']'.repeat(openSq - closeSq);
            if (open > close) truncated += '}'.repeat(open - close);
        } else {
            const openSq = (truncated.match(/\[/g) || []).length;
            const closeSq = (truncated.match(/\]/g) || []).length;
            if (openSq > closeSq) truncated += ']'.repeat(openSq - closeSq);
        }
        return truncated;
    }

    /**
     * Coalesce NDJSON / space-separated cue objects into {"cues":[...]}.
     * Models sometimes emit: { "index": 0, "text": "a" } { "index": 1, "text": "b" }
     */
    function coalesceNdjsonCueObjects(text) {
        const s = String(text || '').trim();
        if (!s || /"cues"\s*:/.test(s)) return null;
        const objects = [];
        let i = 0;
        while (i < s.length) {
            while (i < s.length && /[\s,;]/.test(s[i])) i += 1;
            if (i >= s.length) break;
            if (s[i] !== '{') break;
            let depth = 0;
            let inString = false;
            let escape = false;
            let j = i;
            for (; j < s.length; j += 1) {
                const ch = s[j];
                if (inString) {
                    if (escape) escape = false;
                    else if (ch === '\\') escape = true;
                    else if (ch === '"') inString = false;
                    continue;
                }
                if (ch === '"') {
                    inString = true;
                    continue;
                }
                if (ch === '{') depth += 1;
                else if (ch === '}') {
                    depth -= 1;
                    if (depth === 0) {
                        j += 1;
                        break;
                    }
                }
            }
            if (depth !== 0) break;
            const chunk = s.slice(i, j);
            try {
                const obj = JSON.parse(chunk);
                if (
                    obj
                    && typeof obj === 'object'
                    && !Array.isArray(obj)
                    && Number.isInteger(Number(obj.index))
                    && Object.prototype.hasOwnProperty.call(obj, 'text')
                ) {
                    objects.push({
                        index: Number(obj.index),
                        text: String(obj.text ?? ''),
                    });
                } else {
                    break;
                }
            } catch (_) {
                break;
            }
            i = j;
        }
        if (objects.length < 2) return null;
        return { cues: objects };
    }

    function tryParseJsonObject(text) {
        // Prefer NDJSON cue streams before accepting a lone {index,text} object
        // (extractJsonCandidate would otherwise stop at the first {...}).
        const ndjson = coalesceNdjsonCueObjects(stripLeadingProse(stripThinkBlocks(text)));
        if (ndjson) return ndjson;

        const attempts = [
            extractJsonCandidate(text),
            relaxJsonSyntax(extractJsonCandidate(text)),
            stripCodeFence(stripThinkBlocks(text)),
        ];
        for (const raw of attempts) {
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    // Single cue object without cues[] — wrap if it looks like a cue row
                    if (
                        !Array.isArray(parsed)
                        && !Array.isArray(parsed.cues)
                        && Number.isInteger(Number(parsed.index))
                        && Object.prototype.hasOwnProperty.call(parsed, 'text')
                    ) {
                        return { cues: [{ index: Number(parsed.index), text: String(parsed.text ?? '') }] };
                    }
                    return parsed;
                }
            } catch (_) { /* try next */ }
            try {
                const parsed = JSON.parse(relaxJsonSyntax(raw));
                if (parsed && typeof parsed === 'object') {
                    if (
                        !Array.isArray(parsed)
                        && !Array.isArray(parsed.cues)
                        && Number.isInteger(Number(parsed.index))
                        && Object.prototype.hasOwnProperty.call(parsed, 'text')
                    ) {
                        return { cues: [{ index: Number(parsed.index), text: String(parsed.text ?? '') }] };
                    }
                    return parsed;
                }
            } catch (_) { /* try next */ }
        }
        // Repair common LLM glitch: },"{"index": → },{"index":
        const repairedQuotes = String(text || '').replace(/\}\s*,\s*"\s*\{/g, '},{');
        if (repairedQuotes !== String(text || '')) {
            const again = tryParseJsonObjectWithoutNdjson(repairedQuotes);
            if (again) return again;
        }
        return null;
    }

    function tryParseJsonObjectWithoutNdjson(text) {
        const attempts = [
            extractJsonCandidate(text),
            relaxJsonSyntax(extractJsonCandidate(text)),
        ];
        for (const raw of attempts) {
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            } catch (_) { /* try next */ }
            try {
                const parsed = JSON.parse(relaxJsonSyntax(raw));
                if (parsed && typeof parsed === 'object') return parsed;
            } catch (_) { /* try next */ }
        }
        return null;
    }

    function snippetModelOutput(content, max = 240) {
        const s = String(content || '').replace(/\s+/g, ' ').trim();
        if (!s) return '(空)';
        return s.length <= max ? s : `${s.slice(0, max)}…`;
    }

    /**
     * @returns {{ ok: true, cues: {index,text}[], incomplete: number[] } | { ok: false, error: string, snippet?: string }}
     */
    function parseModelResponse(content, expectedIndexes) {
        const expected = Array.isArray(expectedIndexes)
            ? expectedIndexes.map((n) => Number(n)).filter((n) => Number.isInteger(n))
            : [];
        const parsed = tryParseJsonObject(content);
        if (!parsed || typeof parsed !== 'object') {
            return {
                ok: false,
                error: '模型未返回可解析的 JSON',
                snippet: snippetModelOutput(content),
            };
        }
        const rawList = Array.isArray(parsed.cues)
            ? parsed.cues
            : (Array.isArray(parsed) ? parsed : null);
        if (!rawList) {
            return {
                ok: false,
                error: 'JSON 中缺少 cues 数组',
                snippet: snippetModelOutput(content),
            };
        }
        const byIndex = new Map();
        for (const row of rawList) {
            const index = Number(row?.index);
            if (!Number.isInteger(index)) continue;
            byIndex.set(index, String(row?.text ?? ''));
        }
        const cues = [];
        const incomplete = [];
        for (const index of expected) {
            if (!byIndex.has(index)) {
                incomplete.push(index);
                continue;
            }
            cues.push({ index, text: byIndex.get(index) });
        }
        if (!cues.length) {
            return {
                ok: false,
                error: '模型输出未匹配任何输入 index',
                snippet: snippetModelOutput(content),
            };
        }
        return { ok: true, cues, incomplete };
    }

    /**
     * 合并多块结果：后写覆盖先写；重叠区优先采用后一块（含更多下文）。
     */
    function mergeCueUpdates(updateLists) {
        const map = new Map();
        for (const list of updateLists || []) {
            for (const u of list || []) {
                const index = Number(u?.index);
                if (!Number.isInteger(index)) continue;
                map.set(index, String(u?.text ?? ''));
            }
        }
        return [...map.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([index, text]) => ({ index, text }));
    }

    /**
     * 无 LLM 的本地模拟：轻微规整空白，便于打通 UI / 工作流。
     */
    function mockReconstructCues(cues) {
        return normalizeCueList(cues).map((c) => ({
            index: c.index,
            text: String(c.text || '')
                .replace(/[ \t]+\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .replace(/[ \t]{2,}/g, ' ')
                .trim(),
        }));
    }

    return {
        DEFAULT_WINDOW_CUES,
        DEFAULT_OVERLAP_CUES,
        MAX_GLOSSARY_TERMS,
        normalizeCue,
        normalizeCueList,
        chunkCues,
        extractGlossaryTerms,
        normalizeIntensity,
        getIntensityTemperature,
        buildSystemPrompt,
        buildUserPrompt,
        buildChatMessages,
        stripCodeFence,
        stripThinkBlocks,
        stripLeadingProse,
        extractJsonCandidate,
        tryParseJsonObject,
        parseModelResponse,
        mergeCueUpdates,
        mockReconstructCues,
    };
}));
