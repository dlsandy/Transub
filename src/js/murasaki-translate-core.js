/**
 * Murasaki JA→ZH v0.3 presets + inference (loads murasaki-profile-core).
 * PRESET_PROMPTS: novel / script / short. Subtitle default = script (Non-Think);
 * blank-retry / single-line salvage → short. CoT in <think> stripped after decode.
 * @see https://huggingface.co/Murasaki-Project/Murasaki-4B-v0.3
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMurasakiTranslate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function murasakiTranslateCoreFactory() {
    function loadSakuraCore() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./sakura-translate-core')
                : (global && global.TransubSakuraTranslate);
        } catch (_) {
            return null;
        }
    }

    function loadProfile() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./murasaki-profile-core')
                : (global && global.TransubMurasakiProfile);
        } catch (_) {
            return null;
        }
    }

    /** Official v0.3 scenario presets (system body only; think/non-think variants). */
    const PRESET_PROMPTS = Object.freeze({
        novel: Object.freeze({
            think: [
                '你是一位精通二次元文化的资深轻小说翻译家。',
                '请将日文文本翻译成流畅、优美的中文。',
                '',
                '**核心要求：**',
                '1. **深度思考：** 在翻译前，先在 <think> 标签中分析文风、补全主语并梳理逻辑。',
                '2. **信达雅：** 译文需符合中文轻小说阅读习惯，还原原作的沉浸感与文学性。',
            ].join('\n'),
            nonThink: [
                '你是一位精通二次元文化的资深轻小说翻译家。',
                '请将日文文本翻译成流畅、优美的中文。',
                '',
                '**核心要求：**',
                '1. **术语校对：** 在翻译前先完成术语映射、风格统一与逻辑校验，仅输出译文。',
                '2. **信达雅：** 译文需符合中文轻小说阅读习惯，还原原作的沉浸感与文学性。',
            ].join('\n'),
        }),
        script: Object.freeze({
            think: [
                '你是一位专注于 Galgame 与动漫台词的本地化专家。',
                '请将剧本/台词翻译为地道的中文口语。',
                '',
                '**核心要求：**',
                '1. **深度思考：** 在翻译前，先在 <think> 标签中分析语气与指示对象，再输出译文。',
                '2. **拒绝翻译腔：** 译文必须自然生动，符合“能被读出来的台词”标准。',
                '多行输入时每行日文对应一行中文，不要编号、不要解释。',
            ].join('\n'),
            nonThink: [
                '你是一位专注于 Galgame 与动漫台词的本地化专家。',
                '请将剧本/台词翻译为地道的中文口语。',
                '',
                '**核心要求：**',
                '1. **拒绝翻译腔：** 译文必须自然生动，符合“能被读出来的台词”标准。',
                '2. **术语校对：** 完成术语映射后仅输出台词译文，不要输出思考或分析。',
                '多行输入时每行日文对应一行中文，不要编号、不要解释。',
            ].join('\n'),
        }),
        short: Object.freeze({
            think: [
                '你是一个严谨的 ACGN 短句翻译引擎。',
                '请对输入的日文短句进行精准直译。',
                '',
                '**核心要求：**',
                '1. **深度思考：** 可在 <think> 中极简确认指代，再输出译文。',
                '2. **零上下文：** 严禁脑补不存在的背景或主语。指代不明时保持模糊。',
                '3. **精准还原：** 忠实保留原文的结构与信息量，不进行过度润色。',
            ].join('\n'),
            nonThink: [
                '你是一个严谨的 ACGN 短句翻译引擎。',
                '请对输入的日文短句进行精准直译。',
                '',
                '**核心要求：**',
                '1. **零上下文：** 严禁脑补不存在的背景或主语。指代不明时保持模糊。',
                '2. **精准还原：** 忠实保留原文的结构与信息量，不进行过度润色。',
                '3. **仅输出译文：** 不要输出思考、分析或标签。',
            ].join('\n'),
        }),
    });

    /** Anti-ellipsis / no-analysis for short salvage (lighter than full script addon). */
    const SHORT_PROMPT_ADDON = [
        '禁止用单独的「…」「......」「-」「{」「}」代替译文；即使是「ええと／あの…／んー…／うわ」也要译成「呃／那个…／嗯…／哇」等短中文。',
        'そのまま＝就这样；どっちに＝往哪边；あ…そうだね＝啊…也是呢；いいか?＝可以吗（不是「挺好吗」）。',
        '気持ちいい必须带「舒服」，禁止只输出「吗？」。',
        '禁止输出语尾/语气分析、方括号标签或角色前缀。',
    ].join('');

    /** @deprecated use PRESET_PROMPTS.script.nonThink — kept for tests/callers. */
    const SCRIPT_SYSTEM_PROMPT = PRESET_PROMPTS.script.nonThink;

    function normalizePresetId(value) {
        const s = String(value || '').trim().toLowerCase();
        if (s === 'novel' || s === 'script' || s === 'short') return s;
        return '';
    }

    /** Official catalog ids (F16 retired — Q8_0 is top practical quant). */
    const MURASAKI_MODEL_IDS = Object.freeze([
        'murasaki-4b-v03',
        'murasaki-4b-v03-q6k',
        'murasaki-4b-v03-q8',
    ]);

    /** Legacy F16 / retired ids → current catalog id. */
    function canonicalizeMurasakiModelId(modelId) {
        const s = String(modelId || '').trim();
        if (!s) return '';
        if (/^murasaki-4b-v03-f16$/i.test(s)) return 'murasaki-4b-v03-q8';
        return s;
    }

    function orderMurasakiModelIdsForVram(vramGb) {
        const v = Number(vramGb);
        // Q8_0 ~4.4GB → prefer ≥8GB headroom for KV/context.
        if (Number.isFinite(v) && v >= 8) {
            return [
                'murasaki-4b-v03-q8',
                'murasaki-4b-v03-q6k',
                'murasaki-4b-v03',
            ];
        }
        if (Number.isFinite(v) && v >= 6) {
            return [
                'murasaki-4b-v03-q6k',
                'murasaki-4b-v03-q8',
                'murasaki-4b-v03',
            ];
        }
        return [
            'murasaki-4b-v03',
            'murasaki-4b-v03-q6k',
            'murasaki-4b-v03-q8',
        ];
    }

    /**
     * Pick installed Murasaki quant by VRAM; else return preferred id for recommend.
     * Skips retired F16 even if the GGUF is still on disk.
     * @param {{ vramGb?: number, installedIds?: string[] }} [input]
     * @returns {string}
     */
    function pickMurasakiModelIdForVram(input = {}) {
        const order = orderMurasakiModelIdsForVram(input.vramGb);
        // Skip retired F16 even if the GGUF is still on disk — never auto-pick it.
        const installed = (Array.isArray(input.installedIds) ? input.installedIds : [])
            .map((x) => String(x || '').trim())
            .filter((id) => id && !/^murasaki-4b-v03-f16$/i.test(id));
        if (installed.length) {
            const lower = new Map(installed.map((id) => [id.toLowerCase(), id]));
            for (const id of order) {
                const hit = lower.get(id.toLowerCase());
                if (hit) return hit;
            }
        }
        return order[0];
    }

    /** Long talk/lecture cues with few dialogue quotes → novel Non-Think. */
    function looksLikeLongNarration(options = {}) {
        const cues = Array.isArray(options.cues) ? options.cues : [];
        if (!cues.length) {
            const t = String(options.sourceText || '');
            const n = [...t].length;
            return n >= 80 && !/[「」『』]/.test(t);
        }
        if (cues.length < 2) return false;
        let dialogMarks = 0;
        let totalChars = 0;
        for (const c of cues) {
            const t = String(c?.text || '');
            totalChars += [...t].length;
            if (/[「」『』]/.test(t)) dialogMarks += 1;
        }
        const avg = totalChars / cues.length;
        return avg >= 36 && (dialogMarks / cues.length) <= 0.25;
    }

    /**
     * Auto-route: blank → short; AV/film → script; talk narration → novel; else script.
     * @param {object} [options]
     * @returns {'novel'|'script'|'short'}
     */
    function resolveMurasakiPreset(options = {}) {
        const explicit = normalizePresetId(
            options.murasakiPreset
            || options.murasakiMode
            || options.presetId,
        );
        if (explicit) return explicit;
        // Ellipsis / leftover「…」recovery must mirror editor batch retranslate:
        // Script + previous-line context. Forcing Short here was the main reason
        // pipeline left「…」while the same model filled them in the editor.
        if (options._ellipsisQuickDirect) return 'script';
        if (options._blankRetry || options._lineAlignFallback) {
            return 'short';
        }
        const nCues = Array.isArray(options.cues) ? options.cues.length : 0;
        const win = Number(options.windowLines);
        if (nCues === 1 && Number.isFinite(win) && win <= 1) return 'short';
        const profile = String(options.contentProfile || options.senseProfile || '')
            .trim()
            .toLowerCase();
        // AV / film dialogue must never enter novel (主语补全会加戏).
        if (profile === 'av_soft' || profile === 'film') return 'script';
        if (profile === 'talk' && looksLikeLongNarration(options)) return 'novel';
        return 'script';
    }

    /** Shared blank + glossary + repetition retry budget (avoid storm). */
    function resolveMurasakiRetryBudget(totalCues) {
        const n = Math.max(0, Number(totalCues) || 0);
        return Math.max(48, Math.min(160, Math.ceil(n * 0.14)));
    }

    /**
     * Last 1–2 cues before current window (script continuity only).
     * @returns {{ previousSourceText?: string, previousTranslationText?: string }}
     */
    function buildMurasakiPreviousContext({
        sourceCues,
        translatedByIndex,
        currentChunkCues,
        maxLines = 2,
    } = {}) {
        const all = Array.isArray(sourceCues) ? sourceCues : [];
        const cur = Array.isArray(currentChunkCues) ? currentChunkCues : [];
        if (!all.length || !cur.length) return {};
        const firstIdx = Number(cur[0]?.index);
        if (!Number.isInteger(firstIdx)) return {};
        const before = [];
        for (const c of all) {
            const idx = Number(c?.index);
            if (!Number.isInteger(idx) || idx >= firstIdx) continue;
            before.push(c);
        }
        const take = before.slice(-Math.max(1, Math.min(4, Number(maxLines) || 2)));
        if (!take.length) return {};
        const map = translatedByIndex instanceof Map ? translatedByIndex : new Map();
        const prevSrc = take.map((c) => String(c?.text || '').trim()).filter(Boolean).join('\n');
        const prevTgt = take
            .map((c) => String(map.get(Number(c.index)) ?? '').trim())
            .filter(Boolean)
            .join('\n');
        const out = {};
        if (prevSrc) out.previousSourceText = prevSrc;
        if (prevTgt) out.previousTranslationText = prevTgt;
        return out;
    }

    const MURASAKI_STOP = Object.freeze([
        '[Style',
        '对白调校：',
        '- 场景：',
        '- 基调：',
        '- 语尾：',
        '**核心要求',
    ]);

    function isMurasakiModel(modelIdOrFamily) {
        const s = String(modelIdOrFamily || '').trim().toLowerCase();
        if (!s) return false;
        if (s === 'murasaki') return true;
        return /murasaki/i.test(s);
    }

    function isLargeMurasakiModel(options = {}) {
        const profile = loadProfile();
        if (profile?.resolveMurasakiProfile) {
            return !!profile.resolveMurasakiProfile(options).large;
        }
        const n = Number(options.paramBillion);
        return Number.isFinite(n) && n >= 8;
    }

    function resolveMurasakiInferenceOptions(options = {}) {
        const profile = loadProfile();
        const preset = resolveMurasakiPreset(options);
        let inf;
        if (profile?.resolveMurasakiProfile) {
            inf = { ...profile.resolveMurasakiProfile(options).inference };
        } else {
            inf = {
                temperature: 0.26,
                top_p: 0.8,
                repetition_penalty: 1.05,
                contextSize: 8192,
                cachePrompt: true,
                windowLines: 6,
                enableThinking: true,
                maxTokensCap: 1536,
            };
        }
        if (preset === 'short') {
            inf.windowLines = 1;
            inf.enableThinking = false;
            inf.maxTokensCap = Math.min(inf.maxTokensCap || 640, 256);
        } else if (preset === 'novel') {
            // Novel: roomier KV; Think needs larger windows + token budget (CoT share shrinks).
            inf.contextSize = Math.max(inf.contextSize || 4096, 8192);
            if (options.enableThinking === true) {
                inf.enableThinking = true;
                inf.windowLines = Math.max(inf.windowLines || 3, 6);
                inf.maxTokensCap = Math.max(inf.maxTokensCap || 640, 1536);
            } else {
                inf.windowLines = Math.max(inf.windowLines || 3, 4);
            }
        }
        // Explicit override after preset defaults.
        if (options.enableThinking === true) inf.enableThinking = true;
        if (options.enableThinking === false) inf.enableThinking = false;
        // Think mode: keep serial-friendly (caller already prefers serial chunks).
        if (inf.enableThinking === true) {
            inf.forceSingleSlot = true;
            inf.windowLines = Math.max(inf.windowLines || 3, 4);
        }
        // Glossary / quality / repetition salvage: cooler + higher rep (official 1.05→1.1).
        if (options._glossaryRetry || options._qualityRetry) {
            inf.temperature = Math.min(Number(inf.temperature) || 0.28, 0.2);
            inf.repetition_penalty = Math.min(
                1.1,
                Math.max(Number(inf.repetition_penalty) || 1.05, 1.08),
            );
            inf.enableThinking = false;
            inf.windowLines = 1;
        }
        // Cut analysis leaks early (post-decode finalize still runs).
        if (!Array.isArray(inf.stop) || !inf.stop.length) {
            inf.stop = [...MURASAKI_STOP];
        }
        return inf;
    }

    function normalizeGlossaryEntries(glossaryTerms) {
        const out = [];
        const seen = new Set();
        for (const t of Array.isArray(glossaryTerms) ? glossaryTerms : []) {
            const term = String(t?.term || t?.src || '').trim();
            const translation = String(t?.translation || t?.dst || '').trim();
            if (!term || !translation || term === translation) continue;
            if ([...term].length < 2 || [...translation].length < 2) continue;
            const key = `${term}\0${translation}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ term, translation });
        }
        return out;
    }

    function resolveTermsForCoverage(options = {}, sourceText = '') {
        const sakura = loadSakuraCore();
        if (sakura?.resolveGlossaryTermsForPrompt) {
            return normalizeGlossaryEntries(
                sakura.resolveGlossaryTermsForPrompt(
                    { ...options, promptFamily: 'murasaki' },
                    sourceText,
                ),
            );
        }
        return normalizeGlossaryEntries(options.glossaryTerms);
    }

    /** Stutter / looped ZH — bump rep on quality retry. */
    function looksLikeMurasakiRepetition(text) {
        const t = String(text || '').trim();
        if ([...t].length < 8) return false;
        if (/(.)\1{7,}/u.test(t)) return true;
        // Short units first so「快点快点…」beats greedy longer spans.
        for (let n = 2; n <= 8; n += 1) {
            if (new RegExp(`(.{${n}})\\1{3,}`, 'u').test(t)) return true;
        }
        if (/(.{4,16})\1{2,}/u.test(t)) return true;
        return false;
    }

    /**
     * Terms present in JA but missing from ZH → coverage miss indexes.
     * Structural blanks are handled elsewhere; skip empty/unusable ZH here.
     */
    function collectMurasakiGlossaryMissIndexes(sourceCues, translatedCues, options = {}) {
        const sources = Array.isArray(sourceCues) ? sourceCues : [];
        const joined = sources.map((c) => String(c?.text || '')).join('\n');
        const terms = resolveTermsForCoverage({
            ...options,
            glossaryPromptInjectMode: 'hitOnly',
        }, joined);
        const byIndex = new Map(
            (Array.isArray(translatedCues) ? translatedCues : []).map((u) => [
                Number(u.index),
                String(u.text ?? ''),
            ]),
        );
        const maxRetry = Math.max(1, Math.min(24, Number(options.maxRetry) || 8));
        const indexes = [];
        const missedByIndex = new Map();
        const profile = loadProfile();
        for (const cue of sources) {
            if (indexes.length >= maxRetry) break;
            const idx = Number(cue?.index);
            if (!Number.isInteger(idx)) continue;
            const ja = String(cue?.text || '');
            const zh = String(byIndex.has(idx) ? byIndex.get(idx) : '').trim();
            if (!ja.trim() || !zh) continue;
            if (profile?.isMurasakiUnusableZh?.(zh)) continue;
            const hitTerms = terms.filter((t) => ja.includes(t.term));
            if (!hitTerms.length) continue;
            const missed = hitTerms.filter((t) => !zh.includes(t.translation));
            if (!missed.length) continue;
            // Require majority miss when many terms apply (avoid flaky single-alias misses).
            if (missed.length < Math.max(1, Math.ceil(hitTerms.length * 0.5))) continue;
            indexes.push(idx);
            missedByIndex.set(idx, missed);
        }
        return { indexes, missedByIndex, termCount: terms.length };
    }

    /**
     * Glossary miss + repetition → single-cue quality retry (once per cue).
     */
    function collectMurasakiQualityRetryIndexes(sourceCues, translatedCues, options = {}) {
        const maxRetry = Math.max(1, Math.min(24, Number(options.maxRetry) || 8));
        const gloss = collectMurasakiGlossaryMissIndexes(sourceCues, translatedCues, {
            ...options,
            maxRetry,
        });
        const indexes = [...gloss.indexes];
        const reasons = new Map();
        for (const idx of gloss.indexes) {
            reasons.set(idx, ['glossary_miss']);
        }
        const byIndex = new Map(
            (Array.isArray(translatedCues) ? translatedCues : []).map((u) => [
                Number(u.index),
                String(u.text ?? ''),
            ]),
        );
        const profile = loadProfile();
        for (const cue of (Array.isArray(sourceCues) ? sourceCues : [])) {
            if (indexes.length >= maxRetry) break;
            const idx = Number(cue?.index);
            if (!Number.isInteger(idx) || reasons.has(idx)) continue;
            const zh = String(byIndex.has(idx) ? byIndex.get(idx) : '').trim();
            if (!zh || profile?.isMurasakiUnusableZh?.(zh)) continue;
            if (looksLikeMurasakiRepetition(zh)) {
                indexes.push(idx);
                reasons.set(idx, ['repetition']);
            }
        }
        return {
            indexes,
            reasons,
            missedByIndex: gloss.missedByIndex,
            termCount: gloss.termCount,
        };
    }

    function formatMurasakiGlossaryBlock(glossaryTerms, options = {}) {
        const sakura = loadSakuraCore();
        const block = sakura?.formatGlossaryBlock
            ? sakura.formatGlossaryBlock(glossaryTerms, { maxTerms: Number(options.maxTerms) || 40 })
            : '';
        if (!block) return '';
        const lines = String(block).split('\n').map((line) => {
            const t = String(line || '').trim();
            if (!t) return '';
            return t.replace(/->/g, ': ').replace(/\s+#/, ' #');
        }).filter(Boolean);
        if (!lines.length) return '';
        return `【术语表】\n${lines.join('\n')}`;
    }

    function resolveSystemPrompt(options = {}) {
        const profile = loadProfile();
        const preset = resolveMurasakiPreset(options);
        const inf = resolveMurasakiInferenceOptions(options);
        const pack = PRESET_PROMPTS[preset] || PRESET_PROMPTS.script;
        const body = inf.enableThinking === true ? pack.think : pack.nonThink;
        const parts = [body];
        if (preset === 'script') {
            const addon = String(profile?.LINE_PROMPT_ADDON || '').trim();
            if (addon) parts.push(addon);
        } else if (preset === 'short') {
            if (SHORT_PROMPT_ADDON) parts.push(SHORT_PROMPT_ADDON);
        }
        if (inf.enableThinking === true) {
            const think = profile?.resolveMurasakiProfile?.(options)?.thinkHint || '';
            if (think) parts.push(think);
        }
        // Glossary stays in user message (v0.3 sample + stable system → better cachePrompt).
        return parts.join('\n');
    }

    function buildMurasakiChatMessages(chunkCuesList, options = {}) {
        const sakura = loadSakuraCore();
        const list = sakura?.normalizeCueList
            ? sakura.normalizeCueList(chunkCuesList)
            : (Array.isArray(chunkCuesList) ? chunkCuesList : []);
        const joined = list.map((c) => c.text || '').join('\n');
        const opts = { ...options, cues: list, sourceText: joined };
        // v0.3: always hit-only — fewer false coverage retries + smaller prompt.
        const terms = sakura?.resolveGlossaryTermsForPrompt
            ? sakura.resolveGlossaryTermsForPrompt({
                ...opts,
                promptFamily: 'murasaki',
                glossaryPromptInjectMode: 'hitOnly',
            }, joined)
            : (Array.isArray(options.glossaryTerms) ? options.glossaryTerms : []).filter((t) => {
                const term = String(t?.term || t?.src || '').trim();
                return term && joined.includes(term);
            });
        const glossary = formatMurasakiGlossaryBlock(terms, options);
        const preset = resolveMurasakiPreset(opts);
        const prevSrc = String(options.previousSourceText || options.prevSourceText || '').trim();
        const prevTgt = String(options.previousTranslationText || options.prevTranslationText || '').trim();
        let user = glossary
            ? `${glossary}\n\n请翻译：\n${joined}`
            : `请翻译：\n${joined}`;
        // Script only: light prev-tail (not novel — avoids inventing subjects from context).
        if (preset === 'script' && prevSrc && !options._blankRetry && !options._glossaryRetry) {
            const prevBlock = prevTgt
                ? `上文参考（勿翻译）：\n${prevSrc}\n${prevTgt}`
                : `上文参考（勿翻译）：\n${prevSrc}`;
            user = `${prevBlock}\n\n${user}`;
        }
        if (options._glossaryRetry && glossary) {
            user += '\n\n注意：请严格使用上方术语表中的译名，不要另造同义说法。';
        }
        try {
            const emoApi = (typeof module !== 'undefined' && module.exports)
                ? require('./sensevoice-emotion-mt-style-core')
                : (typeof globalThis !== 'undefined' ? globalThis.TransubSensevoiceEmotionMtStyle : null);
            if (emoApi?.appendEmotionHintToUserContent) {
                user = emoApi.appendEmotionHintToUserContent(user, list, options);
            }
        } catch { /* optional */ }
        return [
            { role: 'system', content: resolveSystemPrompt(opts) },
            { role: 'user', content: user },
        ];
    }

    function estimateMaxTokens(cues, options = {}) {
        const sakura = loadSakuraCore();
        const inf = resolveMurasakiInferenceOptions(options);
        const base = typeof sakura?.estimateMaxTokens === 'function'
            ? sakura.estimateMaxTokens(cues)
            : 256;
        if (!inf.enableThinking) {
            return Math.max(64, Math.min(inf.maxTokensCap, base));
        }
        const n = Array.isArray(cues) ? Math.max(1, cues.length) : 1;
        const cot = inf.maxTokensCap <= 768 ? 160 + (n * 24) : 384 + (n * 64);
        return Math.max(256, Math.min(inf.maxTokensCap, base + cot));
    }

    const profile = loadProfile();

    return {
        PRESET_PROMPTS,
        SCRIPT_SYSTEM_PROMPT,
        SHORT_PROMPT_ADDON,
        MURASAKI_MODEL_IDS,
        MURASAKI_STOP,
        MURASAKI_INFERENCE: profile?.INFERENCE_SMALL || null,
        MURASAKI_INFERENCE_LARGE: profile?.INFERENCE_LARGE || null,
        canonicalizeMurasakiModelId,
        isMurasakiModel,
        isLargeMurasakiModel,
        orderMurasakiModelIdsForVram,
        pickMurasakiModelIdForVram,
        looksLikeLongNarration,
        resolveMurasakiPreset,
        resolveMurasakiRetryBudget,
        buildMurasakiPreviousContext,
        resolveMurasakiInferenceOptions,
        resolveSystemPrompt,
        buildMurasakiChatMessages,
        estimateMaxTokens,
        formatMurasakiGlossaryBlock,
        looksLikeMurasakiRepetition,
        collectMurasakiGlossaryMissIndexes,
        collectMurasakiQualityRetryIndexes,
        looksLikeMurasakiPromptLeak: profile?.looksLikeMurasakiPromptLeak,
        stripMurasakiLeak: profile?.stripMurasakiLeak,
        isMurasakiUnusableZh: profile?.isMurasakiUnusableZh,
        finalizeMurasakiCue: profile?.finalizeMurasakiCue,
    };
}));
