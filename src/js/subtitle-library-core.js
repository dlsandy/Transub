/**
 * Subtitle library — pure catalog/recipe helpers (Node + browser).
 * Media → Track (source|target|bilingual) → Version (+ recipe + binding).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleLibraryCore = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleLibraryCoreFactory() {
    const CATALOG_VERSION = 1;
    const FREE_MAX_VERSIONS_PER_TRACK = 3;
    const PRO_MAX_VERSIONS_PER_TRACK = 30;

    const ROLE_SOURCE = 'source';
    const ROLE_TARGET = 'target';
    const ROLE_BILINGUAL = 'bilingual';

    const STATUS_RAW = 'raw';
    const STATUS_EDITED = 'edited';
    const STATUS_PUBLISHED = 'published';
    const STATUS_ARCHIVED = 'archived';

    const SOURCE_GENERATE = 'generate';
    const SOURCE_RETRANSLATE = 'retranslate';
    const SOURCE_EDIT = 'edit';
    const SOURCE_IMPORT = 'import';

    const TAG_COMPARE_A = '对照A';
    const TAG_COMPARE_B = '对照B';

    function nowIso(now = Date.now()) {
        const d = now instanceof Date ? now : new Date(now);
        return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    }

    function makeId(prefix = 'id') {
        const rand = Math.random().toString(36).slice(2, 10);
        return `${prefix}_${Date.now().toString(36)}_${rand}`;
    }

    function normalizePathKey(filePath) {
        const raw = String(filePath || '').trim();
        if (!raw) return '';
        let p = raw.replace(/\\/g, '/');
        // Drive letter case-insensitive on Windows-style paths
        if (/^[a-zA-Z]:\//.test(p)) {
            p = p.charAt(0).toUpperCase() + p.slice(1);
        }
        return p;
    }

    function mediaIdFromPath(filePath) {
        const key = normalizePathKey(filePath);
        if (!key) return '';
        let h = 2166136261;
        for (let i = 0; i < key.length; i += 1) {
            h ^= key.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return `media_${(h >>> 0).toString(16)}`;
    }

    function basenameStem(filePath) {
        const base = String(filePath || '').replace(/\\/g, '/').split('/').pop() || '';
        const noExt = base.replace(/\.[^.]+$/, '');
        return noExt || base || 'untitled';
    }

    function titleFromMediaPath(filePath) {
        const stem = basenameStem(filePath);
        // Drop language tags like movie.ja / movie.zh
        const parts = stem.split('.');
        if (parts.length >= 2) {
            const tag = parts[parts.length - 1].toLowerCase();
            if (/^(ja|en|zh|source|src|bilingual|[a-z]{2,3})$/.test(tag)) {
                return parts.slice(0, -1).join('.') || stem;
            }
        }
        return stem;
    }

    function inferLangFromPath(filePath) {
        const base = basenameStem(filePath).toLowerCase();
        const parts = base.split('.');
        if (parts.length < 2) return '';
        const tag = parts[parts.length - 1];
        if (tag === 'ja' || tag === 'jp') return 'ja';
        if (tag === 'en') return 'en';
        if (tag === 'zh' || tag === 'zh-cn' || tag === 'zh-tw' || tag === 'chs' || tag === 'cht') return 'zh';
        if (tag === 'source' || tag === 'src') return 'source';
        if (tag === 'bilingual') return 'bilingual';
        if (/^[a-z]{2,8}$/.test(tag)) return tag;
        return '';
    }

    function inferRoleFromPath(filePath, fallback = ROLE_TARGET) {
        const lang = inferLangFromPath(filePath);
        if (lang === 'bilingual') return ROLE_BILINGUAL;
        if (lang === 'zh' || lang === 'zh-cn' || lang === 'zh-tw') return ROLE_TARGET;
        if (lang === 'ja' || lang === 'en' || lang === 'source' || lang === 'src') return ROLE_SOURCE;
        return fallback;
    }

    function emptyCatalog() {
        return {
            version: CATALOG_VERSION,
            media: [],
            tracks: [],
            versions: [],
            updatedAt: null,
        };
    }

    function normalizeCatalog(doc) {
        const base = emptyCatalog();
        if (!doc || typeof doc !== 'object') return base;
        return {
            version: Number(doc.version) || CATALOG_VERSION,
            media: Array.isArray(doc.media) ? doc.media : [],
            tracks: Array.isArray(doc.tracks) ? doc.tracks : [],
            versions: Array.isArray(doc.versions) ? doc.versions : [],
            updatedAt: doc.updatedAt || null,
        };
    }

    function getVersionLimit(libraryProEntitled) {
        return libraryProEntitled ? PRO_MAX_VERSIONS_PER_TRACK : FREE_MAX_VERSIONS_PER_TRACK;
    }

    function buildRecipeFromOptions(options = {}, extras = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const presetId = String(opts.presetId || opts.activePresetId || extras.presetId || '').trim();
        const presetName = String(extras.presetName || opts.presetName || '').trim();
        const task = String(opts.task || extras.task || '').trim();
        const smartTranslate = !!(opts.smartTranslate || extras.smartTranslate);
        const sakuraMt = !!(opts.sakuraMt || extras.sakuraMt);
        let mtProvider = '';
        let mtModel = '';
        if (smartTranslate) {
            mtProvider = 'smart';
            mtModel = String(
                opts.smartTranslateModelId
                || opts.managedLlm?.smartTranslateModelId
                || opts.engineLlmMtModel
                || '',
            ).trim();
        } else if (sakuraMt) {
            mtProvider = 'sakura';
            mtModel = String(opts.sakuraModel || opts.engineLlmMtModel || opts.engineMtModel || '').trim();
        } else if (task === 'translate' || task === 'dual' || opts.engineMtModel || opts.engineOpusMtModel) {
            mtProvider = 'opus';
            mtModel = String(opts.engineOpusMtModel || opts.engineMtModel || '').trim();
        }

        const recipe = {
            presetId: presetId || null,
            presetName: presetName || null,
            presetRev: extras.presetRev != null ? extras.presetRev : null,
            task: task || null,
            asr: {
                engine: String(opts.engineBackend || opts.engine || 'transub').trim() || 'transub',
                model: String(opts.engineAsrModel || opts.asrModel || opts.model || '').trim() || null,
                device: String(opts.device || '').trim() || null,
                language: String(opts.language || '').trim() || null,
            },
            mt: {
                provider: mtProvider || null,
                model: mtModel || null,
                smartTranslate,
                sakuraMt,
            },
            post: {
                outputFormat: String(opts.subtitleFormat || opts.format || '').trim() || null,
                chineseVariant: String(opts.chineseVariant || opts.zhVariant || '').trim() || null,
                mergeDual: opts.mergeDualSubtitles !== false && (task === 'dual' || !!opts.mergeDualSubtitles),
                compactInterjections: opts.compactPureInterjections !== false,
            },
            extras: {},
        };

        const extraBag = extras.extras && typeof extras.extras === 'object' ? extras.extras : {};
        const keepKeys = [
            'beamSize', 'vadEnabled', 'vadModel', 'engineVadModel', 'filmAudioEnhance',
            'contentProfile', 'toneAdapt', 'glossaryId',
        ];
        for (const key of keepKeys) {
            if (opts[key] != null && opts[key] !== '') recipe.extras[key] = opts[key];
        }
        Object.assign(recipe.extras, extraBag);
        return recipe;
    }

    function formatRecipeSummary(recipe) {
        if (!recipe || typeof recipe !== 'object') return '—';
        const asr = recipe.asr?.model || recipe.asr?.engine || '';
        const mt = recipe.mt?.model
            ? `${recipe.mt.provider || 'mt'}:${recipe.mt.model}`
            : (recipe.mt?.provider || '');
        const preset = recipe.presetName || recipe.presetId || '';
        const parts = [];
        if (asr) parts.push(asr);
        if (mt) parts.push(mt);
        if (preset) parts.push(`预设「${preset}」`);
        if (!parts.length && recipe.task) parts.push(recipe.task);
        return parts.join(' · ') || '—';
    }

    function inheritRecipe(parentRecipe, patch = {}) {
        const base = parentRecipe && typeof parentRecipe === 'object'
            ? JSON.parse(JSON.stringify(parentRecipe))
            : buildRecipeFromOptions({});
        const next = { ...base, ...patch };
        if (patch.asr) next.asr = { ...base.asr, ...patch.asr };
        if (patch.mt) next.mt = { ...base.mt, ...patch.mt };
        if (patch.post) next.post = { ...base.post, ...patch.post };
        if (patch.extras) next.extras = { ...(base.extras || {}), ...patch.extras };
        next.extras = next.extras || {};
        if (parentRecipe) next.extras.inheritedFromRecipe = true;
        return next;
    }

    /**
     * Decide which versions to keep when over limit.
     * Prefer: active, published, archived, then newest createdAt. Drop oldest raw/edited.
     */
    function selectVersionsToPrune(versions, {
        limit = FREE_MAX_VERSIONS_PER_TRACK,
        activeVersionId = '',
    } = {}) {
        const list = Array.isArray(versions) ? versions.slice() : [];
        if (list.length <= limit) return [];
        const protectedIds = new Set();
        if (activeVersionId) protectedIds.add(activeVersionId);
        for (const v of list) {
            if (v?.status === STATUS_PUBLISHED || v?.status === STATUS_ARCHIVED) {
                protectedIds.add(v.id);
            }
        }
        const sorted = list.slice().sort((a, b) => {
            const ta = Date.parse(a?.createdAt || 0) || 0;
            const tb = Date.parse(b?.createdAt || 0) || 0;
            return tb - ta; // newest first
        });
        const keep = [];
        const prune = [];
        for (const v of sorted) {
            if (protectedIds.has(v.id) || keep.length < limit) {
                if (!keep.find((x) => x.id === v.id)) keep.push(v);
            } else {
                prune.push(v);
            }
        }
        // If protected overflowed limit, still prune non-protected oldest
        while (keep.length > limit) {
            const idx = keep.map((v, i) => ({ v, i }))
                .reverse()
                .find((x) => !protectedIds.has(x.v.id));
            if (!idx) break;
            prune.push(keep[idx.i]);
            keep.splice(idx.i, 1);
        }
        return prune;
    }

    /**
     * Free tier: at most one "current candidate" target beyond history window —
     * multi parallel A/B (keeping multiple non-archived targets as peers) is Pro.
     * Helper returns whether adding another live target would need Pro.
     */
    function needsProForParallelTarget(existingTargetVersions, { newStatus = STATUS_RAW } = {}) {
        if (newStatus === STATUS_ARCHIVED) return false;
        const live = (existingTargetVersions || []).filter(
            (v) => v && v.status !== STATUS_ARCHIVED,
        );
        return live.length >= 1;
    }

    function roleLabel(role) {
        if (role === ROLE_SOURCE) return '转录';
        if (role === ROLE_TARGET) return '译文';
        if (role === ROLE_BILINGUAL) return '双语';
        return role || '字幕';
    }

    function statusLabel(status) {
        if (status === STATUS_RAW) return '生成';
        if (status === STATUS_EDITED) return '编辑';
        if (status === STATUS_PUBLISHED) return '发布';
        if (status === STATUS_ARCHIVED) return '归档';
        return status || '';
    }

    function buildLibraryCaps(libraryProEntitled) {
        const entitled = !!libraryProEntitled;
        return {
            libraryPro: entitled,
            maxVersionsPerTrack: getVersionLimit(entitled),
            multiAb: entitled,
            versionDiff: entitled,
            publishPack: entitled,
            corpusExport: entitled,
            recipeRerun: entitled,
            recipeFilter: entitled,
        };
    }

    /**
     * Myers-lite line LCS diff. Returns ops: equal | add | del with text.
     */
    function diffLines(aText, bText) {
        const a = String(aText || '').replace(/\r\n/g, '\n').split('\n');
        const b = String(bText || '').replace(/\r\n/g, '\n').split('\n');
        // Drop trailing empty line from final newline
        if (a.length && a[a.length - 1] === '') a.pop();
        if (b.length && b[b.length - 1] === '') b.pop();
        const n = a.length;
        const m = b.length;
        const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
        for (let i = n - 1; i >= 0; i -= 1) {
            for (let j = m - 1; j >= 0; j -= 1) {
                dp[i][j] = a[i] === b[j]
                    ? dp[i + 1][j + 1] + 1
                    : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
        const ops = [];
        let i = 0;
        let j = 0;
        while (i < n && j < m) {
            if (a[i] === b[j]) {
                ops.push({ op: 'equal', text: a[i] });
                i += 1;
                j += 1;
            } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                ops.push({ op: 'del', text: a[i] });
                i += 1;
            } else {
                ops.push({ op: 'add', text: b[j] });
                j += 1;
            }
        }
        while (i < n) {
            ops.push({ op: 'del', text: a[i] });
            i += 1;
        }
        while (j < m) {
            ops.push({ op: 'add', text: b[j] });
            j += 1;
        }
        const changed = ops.filter((o) => o.op !== 'equal').length;
        return {
            ops,
            stats: {
                linesA: n,
                linesB: m,
                equal: ops.filter((o) => o.op === 'equal').length,
                added: ops.filter((o) => o.op === 'add').length,
                deleted: ops.filter((o) => o.op === 'del').length,
                changed,
            },
        };
    }

    function summarizeDiffOps(ops, { maxEqualContext = 2 } = {}) {
        const list = Array.isArray(ops) ? ops : [];
        const out = [];
        let i = 0;
        while (i < list.length) {
            const cur = list[i];
            if (cur.op !== 'equal') {
                out.push(cur);
                i += 1;
                continue;
            }
            let j = i;
            while (j < list.length && list[j].op === 'equal') j += 1;
            const run = list.slice(i, j);
            if (run.length <= maxEqualContext * 2) {
                out.push(...run);
            } else {
                out.push(...run.slice(0, maxEqualContext));
                out.push({ op: 'skip', text: `… ${run.length - maxEqualContext * 2} 行相同 …` });
                out.push(...run.slice(-maxEqualContext));
            }
            i = j;
        }
        return out;
    }

    function recipeToRetranslateHints(recipe = {}) {
        const r = recipe && typeof recipe === 'object' ? recipe : {};
        const mt = r.mt && typeof r.mt === 'object' ? r.mt : {};
        let mode = 'llm';
        if (mt.smartTranslate) mode = 'smart';
        else if (mt.provider === 'opus' || mt.provider === 'engine') mode = 'engine';
        else if (mt.provider === 'sakura' || mt.sakuraMt) mode = 'llm';
        else if (mt.provider === 'smart') mode = 'smart';
        const modelId = String(mt.model || '').trim();
        const language = String(r.asr?.language || '').trim() || 'ja';
        const chineseVariant = String(r.post?.chineseVariant || '').trim() || 'simplified';
        const faithfulTone = !!(r.extras?.faithfulTone || r.extras?.toneAdapt);
        return {
            mode,
            modelId,
            language,
            chineseVariant,
            faithfulTone,
            presetId: r.presetId || null,
            presetName: r.presetName || null,
            task: r.task || 'translate',
            recipeSummary: formatRecipeSummary(r),
        };
    }

    /**
     * Merge preset options into a recipe snapshot for rerun labeling.
     */
    function applyPresetToRecipe(baseRecipe, preset = {}) {
        const opts = preset.options && typeof preset.options === 'object' ? preset.options : {};
        const next = inheritRecipe(baseRecipe || buildRecipeFromOptions({}), {
            presetId: preset.id || baseRecipe?.presetId || null,
            presetName: preset.name || baseRecipe?.presetName || null,
        });
        const built = buildRecipeFromOptions({
            ...opts,
            presetId: preset.id || opts.presetId,
            task: opts.task || next.task || 'translate',
        }, {
            presetId: preset.id,
            presetName: preset.name,
        });
        // Prefer MT/ASR from preset options when present
        if (built.asr?.model) next.asr = { ...next.asr, ...built.asr };
        if (built.mt?.provider || built.mt?.model) next.mt = { ...next.mt, ...built.mt };
        if (built.post) next.post = { ...next.post, ...built.post };
        next.presetId = preset.id || next.presetId;
        next.presetName = preset.name || next.presetName;
        next.task = built.task || next.task;
        return next;
    }

    function normalizeLibraryTags(tags) {
        const list = Array.isArray(tags) ? tags : (tags ? [tags] : []);
        const out = [];
        const seen = new Set();
        for (const t of list) {
            const s = String(t || '').trim();
            if (!s || seen.has(s)) continue;
            seen.add(s);
            out.push(s.slice(0, 32));
        }
        return out.slice(0, 12);
    }

    function normalizeAbTag(tag) {
        const s = String(tag || '').trim();
        if (s === TAG_COMPARE_A || s === 'A' || s === 'a') return TAG_COMPARE_A;
        if (s === TAG_COMPARE_B || s === 'B' || s === 'b') return TAG_COMPARE_B;
        if (!s) return '';
        return null;
    }

    /**
     * Make 对照A/对照B exclusive on a track: at most one version per tag;
     * a version never holds both. Mutates version.tags in place.
     * @param {object[]} versionsOnTrack
     * @param {string} versionId
     * @param {string} abTag empty clears both compare tags on the version
     */
    function applyExclusiveAbTag(versionsOnTrack, versionId, abTag) {
        const want = normalizeAbTag(abTag);
        if (want === null) return { ok: false, error: '无效对照标签' };
        const list = Array.isArray(versionsOnTrack) ? versionsOnTrack : [];
        const target = list.find((v) => v && v.id === versionId);
        if (!target) return { ok: false, error: '未找到该版本' };

        for (const v of list) {
            if (!v) continue;
            let tags = normalizeLibraryTags(v.tags);
            if (v.id === versionId) {
                tags = tags.filter((t) => t !== TAG_COMPARE_A && t !== TAG_COMPARE_B);
                if (want) tags.push(want);
            } else if (want) {
                tags = tags.filter((t) => t !== want);
            }
            v.tags = normalizeLibraryTags(tags);
        }
        return { ok: true, version: target, tag: want };
    }

    function recipeSearchBlob(recipe) {
        if (!recipe || typeof recipe !== 'object') return '';
        return [
            recipe.presetId,
            recipe.presetName,
            recipe.task,
            recipe.asr?.model,
            recipe.asr?.engine,
            recipe.asr?.language,
            recipe.mt?.provider,
            recipe.mt?.model,
            formatRecipeSummary(recipe),
        ].filter(Boolean).join(' ').toLowerCase();
    }

    function versionMatchesRecipeFilter(version, filter = {}) {
        if (!version) return false;
        const presetId = String(filter.presetId || '').trim();
        const mtModel = String(filter.mtModel || '').trim().toLowerCase();
        const asrModel = String(filter.asrModel || '').trim().toLowerCase();
        const mtProvider = String(filter.mtProvider || '').trim().toLowerCase();
        const tag = String(filter.tag || '').trim();
        const recipeQ = String(filter.recipeQuery || '').trim().toLowerCase();
        const recipe = version.recipe || {};

        if (presetId && String(recipe.presetId || '') !== presetId) return false;
        if (mtProvider && String(recipe.mt?.provider || '').toLowerCase() !== mtProvider) return false;
        if (mtModel && !String(recipe.mt?.model || '').toLowerCase().includes(mtModel)) return false;
        if (asrModel && !String(recipe.asr?.model || '').toLowerCase().includes(asrModel)) return false;
        if (tag) {
            const tags = normalizeLibraryTags(version.tags);
            if (!tags.includes(tag)) return false;
        }
        if (recipeQ) {
            const hay = `${recipeSearchBlob(recipe)} ${String(version.note || '').toLowerCase()} ${normalizeLibraryTags(version.tags).join(' ')}`;
            if (!hay.includes(recipeQ)) return false;
        }
        return true;
    }

    function collectRecipeFacets(versions) {
        const presets = new Map();
        const mtModels = new Set();
        const asrModels = new Set();
        const mtProviders = new Set();
        const tags = new Set();
        for (const v of versions || []) {
            const r = v?.recipe || {};
            if (r.presetId) {
                presets.set(r.presetId, r.presetName || r.presetId);
            }
            if (r.mt?.model) mtModels.add(String(r.mt.model));
            if (r.asr?.model) asrModels.add(String(r.asr.model));
            if (r.mt?.provider) mtProviders.add(String(r.mt.provider));
            for (const t of normalizeLibraryTags(v?.tags)) tags.add(t);
        }
        return {
            presets: [...presets.entries()].map(([id, name]) => ({ id, name }))
                .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh')),
            mtModels: [...mtModels].sort(),
            asrModels: [...asrModels].sort(),
            mtProviders: [...mtProviders].sort(),
            tags: [...tags].sort(),
        };
    }

    /** Count cues in SRT/VTT (timing arrows) or ASS/SSA (Dialogue lines). */
    function countSubtitleCues(text) {
        const s = String(text || '');
        if (!s.trim()) return 0;
        if (/^\[Script Info\]/im.test(s) || /^\s*Dialogue:/m.test(s)) {
            return (s.match(/^\s*Dialogue:/gim) || []).length;
        }
        return (s.match(/-->/g) || []).length;
    }

    /**
     * Find 对照A / 对照B pair on a track's versions (newest of each tag).
     * Falls back to note field containing those labels.
     */
    function findAbComparePair(versions) {
        const list = Array.isArray(versions) ? versions.slice() : [];
        const byTag = (tag) => list
            .filter((v) => {
                const tags = normalizeLibraryTags(v?.tags);
                const note = String(v?.note || '');
                return tags.includes(tag) || note.includes(tag);
            })
            .sort((a, b) => (Date.parse(b?.createdAt || 0) || 0) - (Date.parse(a?.createdAt || 0) || 0));
        const aList = byTag(TAG_COMPARE_A);
        const bList = byTag(TAG_COMPARE_B);
        if (!aList.length || !bList.length) {
            return { ok: false, versionA: null, versionB: null };
        }
        // Prefer different versions
        let versionA = aList[0];
        let versionB = bList.find((v) => v.id !== versionA.id) || bList[0];
        if (versionA.id === versionB.id) {
            return { ok: false, versionA: null, versionB: null, reason: 'same_version' };
        }
        return { ok: true, versionA, versionB };
    }

    return {
        CATALOG_VERSION,
        FREE_MAX_VERSIONS_PER_TRACK,
        PRO_MAX_VERSIONS_PER_TRACK,
        ROLE_SOURCE,
        ROLE_TARGET,
        ROLE_BILINGUAL,
        STATUS_RAW,
        STATUS_EDITED,
        STATUS_PUBLISHED,
        STATUS_ARCHIVED,
        SOURCE_GENERATE,
        SOURCE_RETRANSLATE,
        SOURCE_EDIT,
        SOURCE_IMPORT,
        TAG_COMPARE_A,
        TAG_COMPARE_B,
        nowIso,
        makeId,
        normalizePathKey,
        mediaIdFromPath,
        basenameStem,
        titleFromMediaPath,
        inferLangFromPath,
        inferRoleFromPath,
        emptyCatalog,
        normalizeCatalog,
        getVersionLimit,
        buildRecipeFromOptions,
        formatRecipeSummary,
        inheritRecipe,
        selectVersionsToPrune,
        needsProForParallelTarget,
        roleLabel,
        statusLabel,
        buildLibraryCaps,
        diffLines,
        summarizeDiffOps,
        recipeToRetranslateHints,
        applyPresetToRecipe,
        normalizeLibraryTags,
        normalizeAbTag,
        applyExclusiveAbTag,
        recipeSearchBlob,
        versionMatchesRecipeFilter,
        collectRecipeFacets,
        findAbComparePair,
        countSubtitleCues,
    };
}));
