/**
 * Subtitle library — durable Media / Track / Version store with managed blobs.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getWritableRoot } = require('./app-paths');
const core = require('../src/js/subtitle-library-core');

const LIBRARY_DIR_NAME = 'subtitle-library';
const CATALOG_FILE = 'catalog.json';
const BLOBS_DIR = 'blobs';

function getLibraryRoot(root = getWritableRoot()) {
    return path.join(root, LIBRARY_DIR_NAME);
}

function getCatalogPath(root = getWritableRoot()) {
    return path.join(getLibraryRoot(root), CATALOG_FILE);
}

function getBlobsDir(root = getWritableRoot()) {
    return path.join(getLibraryRoot(root), BLOBS_DIR);
}

function ensureLibraryDirs(root = getWritableRoot()) {
    fs.mkdirSync(getBlobsDir(root), { recursive: true });
}

function loadCatalog(root = getWritableRoot()) {
    const filePath = getCatalogPath(root);
    if (!fs.existsSync(filePath)) return core.emptyCatalog();
    try {
        return core.normalizeCatalog(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch {
        return core.emptyCatalog();
    }
}

function saveCatalog(doc, root = getWritableRoot()) {
    ensureLibraryDirs(root);
    const next = core.normalizeCatalog(doc);
    next.updatedAt = core.nowIso();
    const filePath = getCatalogPath(root);
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, filePath);
    return next;
}

function hashBuffer(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function hashFile(filePath) {
    const buf = fs.readFileSync(filePath);
    return { hash: hashBuffer(buf), buf, size: buf.length };
}

function storeBlobFromFile(filePath, root = getWritableRoot()) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) {
        return { ok: false, error: '字幕文件不存在' };
    }
    ensureLibraryDirs(root);
    const { hash, size } = hashFile(resolved);
    const ext = path.extname(resolved).toLowerCase() || '.srt';
    const blobName = `${hash}${ext}`;
    const dest = path.join(getBlobsDir(root), blobName);
    if (!fs.existsSync(dest)) {
        fs.copyFileSync(resolved, dest);
    }
    return {
        ok: true,
        contentHash: hash,
        contentRef: path.join(BLOBS_DIR, blobName).replace(/\\/g, '/'),
        absPath: dest,
        size,
        ext,
    };
}

function resolveContentAbsPath(contentRef, root = getWritableRoot()) {
    const rel = String(contentRef || '').replace(/\\/g, '/');
    if (!rel || rel.includes('..')) return '';
    return path.join(getLibraryRoot(root), rel);
}

function findPresetMeta(options = {}) {
    const presetId = String(options.presetId || options.activePresetId || '').trim();
    if (!presetId) return { presetId: '', presetName: '' };
    try {
        const { loadPresets } = require('./presets-data');
        const hit = (loadPresets().presets || []).find((p) => p.id === presetId);
        return { presetId, presetName: hit?.name || '' };
    } catch {
        return { presetId, presetName: '' };
    }
}

function isLibraryProEntitled() {
    try {
        const entitlement = require('../src/js/advanced-entitlement-core');
        const gates = require('./advanced-gates');
        if (gates.isDevUnlockEnabled?.()) return true;
        const { readAdvancedDoc } = require('./advanced-license-data');
        const { getAdvancedDeviceId } = require('./advanced-device-id');
        const deviceId = getAdvancedDeviceId();
        const { doc } = readAdvancedDoc();
        const featureCheck = entitlement.isFeatureEntitled(
            doc.license,
            deviceId,
            entitlement.FEATURE_SUBTITLE_LIBRARY_PRO,
        );
        if (featureCheck.entitled) return true;
        // Buyout / wildcard Pro also unlocks library depth
        const ev = entitlement.evaluateEntitlement(doc.license, deviceId);
        return !!ev.entitled;
    } catch {
        return false;
    }
}

function notifyLibraryCatalogChanged(payload = {}) {
    try {
        const { notifySubtitleLibraryCatalogChanged } = require('./subtitle-library-window');
        notifySubtitleLibraryCatalogChanged(payload);
    } catch { /* library window optional */ }
}

function notifyEditorsMediaAssociation(payload = {}) {
    try {
        const { notifyEditorsLibraryMediaUpdated } = require('./subtitle-editor-window');
        notifyEditorsLibraryMediaUpdated(payload);
    } catch { /* editor windows optional */ }
}

function broadcastMediaAssociation(media, { cleared = false } = {}) {
    const mediaId = String(media?.id || '').trim();
    if (!mediaId) return;
    const videoPath = String(media?.path || '').trim();
    const mediaLinked = !!videoPath;
    const mediaExists = !!(videoPath && fs.existsSync(videoPath));
    const payload = {
        reason: cleared ? 'media-cleared' : 'media-association',
        mediaIds: [mediaId],
        mediaId,
        videoPath,
        mediaLinked,
        mediaExists,
        mediaTitle: media?.title || '',
        cleared: !!cleared,
    };
    notifyLibraryCatalogChanged(payload);
    notifyEditorsMediaAssociation(payload);
}

function upsertMedia(catalog, videoPath) {
    const resolved = path.resolve(String(videoPath || '').trim());
    const id = core.mediaIdFromPath(resolved);
    let media = catalog.media.find((m) => m.id === id);
    if (!media) {
        media = {
            id,
            path: resolved,
            pathKey: core.normalizePathKey(resolved),
            title: core.titleFromMediaPath(resolved),
            titleCustom: false,
            createdAt: core.nowIso(),
            updatedAt: core.nowIso(),
        };
        catalog.media.unshift(media);
    } else {
        media.path = resolved;
        media.pathKey = core.normalizePathKey(resolved);
        if (!media.title) media.title = core.titleFromMediaPath(resolved);
        media.updatedAt = core.nowIso();
    }
    return media;
}

function renameMediaTitle(mediaId, title, { root = getWritableRoot() } = {}) {
    const catalog = loadCatalog(root);
    const media = catalog.media.find((m) => m.id === mediaId);
    if (!media) return { ok: false, error: '未找到该作品' };
    const next = String(title || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!next) return { ok: false, error: '标题不能为空' };
    media.title = next;
    media.titleCustom = true;
    media.updatedAt = core.nowIso();
    saveCatalog(catalog, root);
    return {
        ok: true,
        media: {
            ...media,
            mediaLinked: !!String(media.path || '').trim(),
            mediaExists: !!(media.path && fs.existsSync(media.path)),
        },
    };
}

function mediaMatchesListQuery(media, tracks, versions, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const srcLang = tracks.find((t) => t.role === 'source' && t.lang)?.lang || '';
    const tgtLang = tracks.find((t) => t.role === 'target' && t.lang)?.lang || '';
    const langPair = (srcLang && tgtLang)
        ? `${srcLang}→${tgtLang} ${srcLang}->${tgtLang} ${srcLang} ${tgtLang}`
        : `${srcLang} ${tgtLang}`;
    const baseName = path.basename(String(media.path || ''));
    const stem = baseName.replace(/\.[^.]+$/, '');
    const tagBlob = versions.map((v) => (Array.isArray(v.tags) ? v.tags.join(' ') : '')).join(' ');
    const noteBlob = versions.map((v) => v.note || '').join(' ');
    const recipeBlob = versions.map((v) => core.formatRecipeSummary(v.recipe)).join(' ');
    const exportNames = versions.map((v) => path.basename(String(v.exportPath || ''))).join(' ');
    const hay = [
        media.title || '',
        media.path || '',
        baseName,
        stem,
        langPair,
        tagBlob,
        noteBlob,
        recipeBlob,
        exportNames,
    ].join(' ').toLowerCase();
    const compact = hay.replace(/\s+/g, '');
    const qCompact = q.replace(/\s+/g, '');
    return hay.includes(q) || (qCompact.length >= 2 && compact.includes(qCompact));
}

function upsertTrack(catalog, mediaId, role, lang = '') {
    let track = catalog.tracks.find(
        (t) => t.mediaId === mediaId && t.role === role && String(t.lang || '') === String(lang || ''),
    );
    if (!track) {
        // Prefer single track per role (lang soft)
        track = catalog.tracks.find((t) => t.mediaId === mediaId && t.role === role);
    }
    if (!track) {
        track = {
            id: core.makeId('track'),
            mediaId,
            role,
            lang: lang || (role === core.ROLE_TARGET ? 'zh' : role === core.ROLE_SOURCE ? '' : role),
            activeVersionId: '',
            createdAt: core.nowIso(),
            updatedAt: core.nowIso(),
        };
        catalog.tracks.push(track);
    } else {
        if (lang && !track.lang) track.lang = lang;
        track.updatedAt = core.nowIso();
    }
    return track;
}

function pruneTrack(catalog, track, root = getWritableRoot(), { libraryPro } = {}) {
    const entitled = libraryPro != null ? !!libraryPro : isLibraryProEntitled();
    const limit = core.getVersionLimit(entitled);
    const versions = catalog.versions.filter((v) => v.trackId === track.id);
    const toPrune = core.selectVersionsToPrune(versions, {
        limit,
        activeVersionId: track.activeVersionId,
    });
    if (!toPrune.length) return [];
    const pruneIds = new Set(toPrune.map((v) => v.id));
    catalog.versions = catalog.versions.filter((v) => !pruneIds.has(v.id));
    // Best-effort blob GC when unreferenced
    for (const v of toPrune) {
        tryGcBlob(catalog, v.contentRef, root);
    }
    return toPrune;
}

function tryGcBlob(catalog, contentRef, root = getWritableRoot()) {
    const ref = String(contentRef || '');
    if (!ref) return;
    const stillUsed = catalog.versions.some((v) => v.contentRef === ref);
    if (stillUsed) return;
    const abs = resolveContentAbsPath(ref, root);
    if (abs && fs.existsSync(abs)) {
        try { fs.unlinkSync(abs); } catch { /* ignore */ }
    }
}

function addVersion(catalog, {
    track,
    exportPath,
    blob,
    recipe,
    source = core.SOURCE_GENERATE,
    status = core.STATUS_RAW,
    parentVersionId = null,
    bindingSourceVersionId = null,
    runId = null,
    note = '',
    tags = null,
    setActive = true,
    libraryPro,
}, root = getWritableRoot()) {
    const version = {
        id: core.makeId('ver'),
        trackId: track.id,
        parentVersionId: parentVersionId || null,
        bindingSourceVersionId: bindingSourceVersionId || null,
        status,
        source,
        recipe: recipe || core.buildRecipeFromOptions({}),
        contentRef: blob.contentRef,
        contentHash: blob.contentHash,
        exportPath: path.resolve(String(exportPath || '')),
        size: blob.size || 0,
        cueCount: (() => {
            try {
                const p = blob.absPath || exportPath;
                if (!p || !fs.existsSync(p)) return null;
                return core.countSubtitleCues(fs.readFileSync(p, 'utf8'));
            } catch {
                return null;
            }
        })(),
        runId: runId || null,
        note: String(note || '').trim(),
        tags: core.normalizeLibraryTags(tags),
        createdAt: core.nowIso(),
    };
    catalog.versions.unshift(version);
    if (setActive) track.activeVersionId = version.id;
    track.updatedAt = core.nowIso();
    pruneTrack(catalog, track, root, { libraryPro });
    return version;
}

function ingestSubtitleFile(catalog, {
    videoPath,
    subtitlePath,
    role,
    lang,
    recipe,
    source,
    status,
    parentVersionId,
    bindingSourceVersionId,
    runId,
    setActive = true,
    libraryPro,
}, root = getWritableRoot()) {
    const sub = path.resolve(String(subtitlePath || ''));
    if (!fs.existsSync(sub)) {
        return { ok: false, error: '字幕文件不存在', path: sub };
    }
    const media = upsertMedia(catalog, videoPath || guessVideoFromSubtitle(sub));
    const inferredLang = lang || core.inferLangFromPath(sub);
    const inferredRole = role || core.inferRoleFromPath(sub, core.ROLE_TARGET);
    const track = upsertTrack(catalog, media.id, inferredRole, inferredLang);
    const blob = storeBlobFromFile(sub, root);
    if (!blob.ok) return blob;

    // Skip duplicate content if latest active already same hash
    if (track.activeVersionId) {
        const active = catalog.versions.find((v) => v.id === track.activeVersionId);
        if (active && active.contentHash === blob.contentHash && active.exportPath === sub) {
            return { ok: true, skipped: true, reason: 'duplicate', media, track, version: active };
        }
    }

    const version = addVersion(catalog, {
        track,
        exportPath: sub,
        blob,
        recipe,
        source,
        status,
        parentVersionId,
        bindingSourceVersionId,
        runId,
        setActive,
        libraryPro,
    }, root);
    media.updatedAt = core.nowIso();
    return { ok: true, media, track, version };
}

function guessVideoFromSubtitle(subtitlePath) {
    const dir = path.dirname(subtitlePath);
    const stem = path.basename(subtitlePath, path.extname(subtitlePath));
    const parts = stem.split('.');
    // strip trailing lang tags
    while (parts.length > 1) {
        const tag = parts[parts.length - 1].toLowerCase();
        if (/^(ja|en|zh|source|src|bilingual|zh-cn|zh-tw|[a-z]{2,3})$/.test(tag)) {
            parts.pop();
            continue;
        }
        break;
    }
    const mediaStem = parts.join('.');
    const { MEDIA_EXTENSIONS } = require('../src/js/media-extensions-core');
    for (const ext of MEDIA_EXTENSIONS) {
        const withDot = String(ext || '').startsWith('.') ? ext : `.${ext}`;
        const candidate = path.join(dir, `${mediaStem}${withDot}`);
        if (fs.existsSync(candidate)) return candidate;
    }
    return path.join(dir, mediaStem);
}

/**
 * Resolve ASR / source-language transcript path for library ingest.
 * Prefers live sidecar, then transcript-keep archive (merge-delete / translate_mt).
 */
function resolveSourceSubtitleForIngest(out = {}, { task = '', options = {} } = {}) {
    const videoPath = String(out.videoPath || '').trim();
    const direct = String(out.sourceSubtitlePath || '').trim();
    if (direct && fs.existsSync(direct)) return path.resolve(direct);

    const subtitlePath = String(out.subtitlePath || '').trim();
    const targetPath = String(out.targetSubtitlePath || '').trim();
    const t = String(task || '').trim();
    if (t === 'transcribe' && subtitlePath && fs.existsSync(subtitlePath)) {
        return path.resolve(subtitlePath);
    }

    try {
        const { findKeptTranscript } = require('./transcript-keep');
        const found = findKeptTranscript({
            videoPath,
            subPath: subtitlePath || targetPath || direct,
            options: options && typeof options === 'object' ? options : {},
        });
        if (found?.found && found.path && fs.existsSync(found.path)) {
            return path.resolve(found.path);
        }
    } catch { /* ignore */ }

    return '';
}

/**
 * Ingest a finished batch history entry (same shape as task-history record).
 * Source track = ASR transcription for that run (sidecar or transcript-keep).
 */
function ingestBatchHistoryEntry(entry, { root = getWritableRoot(), libraryPro } = {}) {
    const catalog = loadCatalog(root);
    const options = entry?.options && typeof entry.options === 'object' ? entry.options : {};
    const preset = findPresetMeta(options);
    const recipe = core.buildRecipeFromOptions(options, {
        presetId: preset.presetId,
        presetName: preset.presetName,
        task: entry?.task || options.task,
    });
    const runId = String(entry?.id || '').trim() || core.makeId('run');
    const task = String(entry?.task || options.task || '').trim();
    const outputs = Array.isArray(entry?.outputs) ? entry.outputs : [];
    const results = [];
    const entitled = libraryPro != null ? !!libraryPro : isLibraryProEntitled();

    for (const out of outputs) {
        if (String(out?.status || '') === 'failed' || String(out?.status || '') === 'cancelled') {
            continue;
        }
        const videoPath = String(out.videoPath || '').trim();
        const sourcePath = resolveSourceSubtitleForIngest(out, { task, options });
        const targetPath = String(out.targetSubtitlePath || '').trim();
        const bilingualPath = String(out.bilingualSubtitlePath || '').trim();
        const subtitlePath = String(out.subtitlePath || '').trim();

        let sourceVersionId = null;
        // 原文轨：每次任务产生的转录（含 keep 归档，不依赖旁路文件是否被合并删除）
        if (sourcePath) {
            const r = ingestSubtitleFile(catalog, {
                videoPath,
                subtitlePath: sourcePath,
                role: core.ROLE_SOURCE,
                lang: core.inferLangFromPath(sourcePath) || options.language || 'ja',
                recipe,
                source: core.SOURCE_GENERATE,
                status: core.STATUS_RAW,
                runId,
                libraryPro: entitled,
            }, root);
            results.push(r);
            if (r.ok && r.version) sourceVersionId = r.version.id;
        }

        if (targetPath) {
            const r = ingestSubtitleFile(catalog, {
                videoPath,
                subtitlePath: targetPath,
                role: core.ROLE_TARGET,
                lang: 'zh',
                recipe,
                source: core.SOURCE_GENERATE,
                status: core.STATUS_RAW,
                bindingSourceVersionId: sourceVersionId,
                runId,
                libraryPro: entitled,
            }, root);
            results.push(r);
        }

        if (bilingualPath) {
            const r = ingestSubtitleFile(catalog, {
                videoPath,
                subtitlePath: bilingualPath,
                role: core.ROLE_BILINGUAL,
                lang: 'bilingual',
                recipe,
                source: core.SOURCE_GENERATE,
                status: core.STATUS_RAW,
                bindingSourceVersionId: sourceVersionId,
                runId,
                libraryPro: entitled,
            }, root);
            results.push(r);
        }

        // Single-file tasks: subtitlePath only
        if (subtitlePath && !sourcePath && !targetPath && !bilingualPath) {
            const role = task === 'transcribe'
                ? core.ROLE_SOURCE
                : (task === 'translate' ? core.ROLE_TARGET : core.inferRoleFromPath(subtitlePath));
            const r = ingestSubtitleFile(catalog, {
                videoPath,
                subtitlePath,
                role,
                lang: role === core.ROLE_TARGET ? 'zh' : core.inferLangFromPath(subtitlePath),
                recipe,
                source: core.SOURCE_GENERATE,
                status: core.STATUS_RAW,
                runId,
                libraryPro: entitled,
            }, root);
            results.push(r);
        } else if (subtitlePath && task === 'translate' && !targetPath) {
            // translate often only fills subtitlePath as ZH
            const r = ingestSubtitleFile(catalog, {
                videoPath,
                subtitlePath,
                role: core.ROLE_TARGET,
                lang: 'zh',
                recipe,
                source: core.SOURCE_GENERATE,
                status: core.STATUS_RAW,
                bindingSourceVersionId: sourceVersionId,
                runId,
                libraryPro: entitled,
            }, root);
            results.push(r);
        }
    }

    saveCatalog(catalog, root);
    const ingested = results.filter((r) => r.ok && !r.skipped).length;
    const skipped = results.filter((r) => r.ok && r.skipped).length;
    const failed = results.filter((r) => !r.ok).length;
    const mediaIds = [...new Set(
        results.filter((r) => r.ok && r.media?.id).map((r) => r.media.id),
    )];
    if (ingested > 0) {
        notifyLibraryCatalogChanged({ reason: 'ingest', mediaIds, ingested, runId });
    }
    return {
        ok: true,
        runId,
        ingested,
        skipped,
        failed,
        results,
        mediaIds,
        caps: core.buildLibraryCaps(entitled),
    };
}

function findVersionByExportPath(catalog, exportPath) {
    const key = core.normalizePathKey(path.resolve(String(exportPath || '')));
    if (!key) return null;
    return catalog.versions.find((v) => core.normalizePathKey(v.exportPath) === key) || null;
}

function ingestEditedSubtitle({
    subtitlePath,
    videoPath = '',
    root = getWritableRoot(),
    source = core.SOURCE_EDIT,
    status = null,
    note = '',
    tags = null,
    bindingSourceVersionId = null,
    recipe: recipeOverride = null,
    parentVersionId = null,
    setActive = true,
} = {}) {
    const catalog = loadCatalog(root);
    const sub = path.resolve(String(subtitlePath || ''));
    if (!fs.existsSync(sub)) return { ok: false, error: '字幕文件不存在' };

    const existing = findVersionByExportPath(catalog, sub);
    let parent = existing;
    let media;
    let track;
    let recipe;
    let bindId = bindingSourceVersionId || null;
    let exportPathForVersion = sub;

    if (parentVersionId) {
        parent = catalog.versions.find((v) => v.id === parentVersionId) || existing || null;
    }

    if (parent) {
        track = catalog.tracks.find((t) => t.id === parent.trackId);
        media = track ? catalog.media.find((m) => m.id === track.mediaId) : null;
        recipe = recipeOverride
            ? core.inheritRecipe(parent.recipe, recipeOverride)
            : core.inheritRecipe(parent.recipe);
        if (!bindId) bindId = parent.bindingSourceVersionId || null;
        const parentExport = String(parent.exportPath || '').trim();
        if (parentExport && path.resolve(parentExport) !== sub) {
            // Keep sidecar lineage when the editor opened a library blob path.
            try {
                fs.mkdirSync(path.dirname(parentExport), { recursive: true });
                fs.copyFileSync(sub, parentExport);
                exportPathForVersion = parentExport;
            } catch {
                exportPathForVersion = sub;
            }
        } else if (parentExport) {
            exportPathForVersion = parentExport;
        }
    } else if (existing) {
        track = catalog.tracks.find((t) => t.id === existing.trackId);
        media = track ? catalog.media.find((m) => m.id === track.mediaId) : null;
        recipe = recipeOverride
            ? core.inheritRecipe(existing.recipe, recipeOverride)
            : core.inheritRecipe(existing.recipe);
        if (!bindId) bindId = existing.bindingSourceVersionId || null;
        parent = existing;
    } else {
        const vid = videoPath || guessVideoFromSubtitle(sub);
        media = upsertMedia(catalog, vid);
        const role = core.inferRoleFromPath(sub);
        track = upsertTrack(catalog, media.id, role, core.inferLangFromPath(sub));
        recipe = recipeOverride || core.buildRecipeFromOptions({}, { task: 'edit' });
    }

    if (!track || !media) {
        return { ok: false, error: '无法解析作品轨道' };
    }

    const blob = storeBlobFromFile(sub, root);
    if (!blob.ok) return blob;

    if (track.activeVersionId) {
        const active = catalog.versions.find((v) => v.id === track.activeVersionId);
        if (active && active.contentHash === blob.contentHash) {
            return { ok: true, skipped: true, reason: 'duplicate', media, track, version: active };
        }
    }

    const resolvedSource = String(source || core.SOURCE_EDIT).trim() || core.SOURCE_EDIT;
    const resolvedStatus = status
        || (resolvedSource === core.SOURCE_RETRANSLATE ? core.STATUS_RAW : core.STATUS_EDITED);

    // When tagging a对比 B, optionally label prior active as 对照A
    const tagList = core.normalizeLibraryTags(tags);
    if (tagList.includes('对照B') && track.activeVersionId) {
        const prior = catalog.versions.find((v) => v.id === track.activeVersionId);
        if (prior) {
            const priorTags = core.normalizeLibraryTags(prior.tags);
            if (!priorTags.includes('对照B') && !priorTags.includes('对照A')) {
                prior.tags = core.normalizeLibraryTags([...priorTags, '对照A']);
                if (!prior.note) prior.note = '对照A';
            }
        }
    }

    const version = addVersion(catalog, {
        track,
        exportPath: exportPathForVersion,
        blob,
        recipe,
        source: resolvedSource,
        status: resolvedStatus,
        parentVersionId: parent?.id || null,
        bindingSourceVersionId: bindId,
        note: note || (tagList.includes('对照B') ? '对照B' : ''),
        tags: tagList,
        setActive,
    }, root);

    if (media) media.updatedAt = core.nowIso();
    saveCatalog(catalog, root);
    if (media?.id) {
        notifyLibraryCatalogChanged({
            reason: 'edit',
            mediaIds: [media.id],
            versionId: version?.id || '',
        });
    }
    return { ok: true, media, track, version };
}

function hasRecipeFilter(filter = {}) {
    return !!(
        String(filter.presetId || '').trim()
        || String(filter.mtModel || '').trim()
        || String(filter.asrModel || '').trim()
        || String(filter.mtProvider || '').trim()
        || String(filter.tag || '').trim()
        || String(filter.recipeQuery || '').trim()
    );
}

function listMediaSummaries({
    root = getWritableRoot(),
    query = '',
    presetId = '',
    mtModel = '',
    asrModel = '',
    mtProvider = '',
    tag = '',
    recipeQuery = '',
} = {}) {
    const catalog = loadCatalog(root);
    const q = String(query || '').trim().toLowerCase();
    const entitled = isLibraryProEntitled();
    const caps = core.buildLibraryCaps(entitled);
    const filter = {
        presetId, mtModel, asrModel, mtProvider, tag, recipeQuery,
    };
    const filtering = hasRecipeFilter(filter);
    if (filtering && !entitled && !caps.recipeFilter) {
        // Soft: still allow filter in API for tests; UI gates Pro.
    }

    let media = catalog.media.slice().sort((a, b) => {
        const ta = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
        const tb = Date.parse(b.updatedAt || b.createdAt || 0) || 0;
        return tb - ta;
    });
    if (filtering) {
        media = media.filter((m) => {
            const tracks = catalog.tracks.filter((t) => t.mediaId === m.id);
            const versions = catalog.versions.filter((v) => tracks.some((t) => t.id === v.trackId));
            return versions.some((v) => core.versionMatchesRecipeFilter(v, filter));
        });
    }
    const versionLimit = core.getVersionLimit(entitled);
    const items = media.map((m) => {
        const tracks = catalog.tracks.filter((t) => t.mediaId === m.id);
        const versions = catalog.versions.filter(
            (v) => tracks.some((t) => t.id === v.trackId),
        );
        if (q && !mediaMatchesListQuery(m, tracks, versions, q)) {
            return null;
        }
        const countByRole = (role) => {
            const ids = new Set(tracks.filter((t) => t.role === role).map((t) => t.id));
            return versions.filter((v) => ids.has(v.trackId)).length;
        };
        const langOf = (role) => {
            const t = tracks.find((tr) => tr.role === role && tr.lang);
            return t?.lang || '';
        };
        const activeOf = (role) => {
            const t = tracks.find((tr) => tr.role === role);
            if (!t?.activeVersionId) return null;
            return versions.find((v) => v.id === t.activeVersionId) || null;
        };
        const cueOf = (version) => {
            if (!version) return null;
            if (version.cueCount != null && Number.isFinite(Number(version.cueCount))) {
                return Number(version.cueCount);
            }
            try {
                const text = readVersionText(version, root);
                if (text == null) return null;
                const n = core.countSubtitleCues(text);
                version.cueCount = n;
                return n;
            } catch {
                return null;
            }
        };
        let lastVersionAt = '';
        let lastVersionTs = 0;
        let latestVersion = null;
        for (const v of versions) {
            const ts = Date.parse(v.createdAt || 0) || 0;
            if (ts > lastVersionTs) {
                lastVersionTs = ts;
                lastVersionAt = v.createdAt || '';
                latestVersion = v;
            }
        }
        const srcActive = activeOf('source');
        const tgtActive = activeOf('target');
        const biActive = activeOf('bilingual');
        const recipeSource = tgtActive || biActive || srcActive || latestVersion;
        const preferredOpenVersionId = (tgtActive || biActive || srcActive)?.id || '';
        const sourceVersionCount = countByRole('source');
        const targetVersionCount = countByRole('target');
        const bilingualVersionCount = countByRole('bilingual');
        const mediaLinked = !!String(m.path || '').trim();
        const mediaExists = !!(m.path && fs.existsSync(m.path));
        const trackAtLimit = tracks.some((t) => {
            const n = versions.filter((v) => v.trackId === t.id).length;
            return n >= versionLimit;
        });
        const tagSet = new Set();
        for (const v of versions) {
            for (const t of core.normalizeLibraryTags(v.tags)) tagSet.add(t);
        }
        return {
            id: m.id,
            title: m.title,
            titleCustom: !!m.titleCustom,
            path: m.path,
            updatedAt: m.updatedAt,
            lastVersionAt: lastVersionAt || m.updatedAt || m.createdAt || '',
            trackCount: tracks.length,
            versionCount: versions.length,
            sourceVersionCount,
            targetVersionCount,
            bilingualVersionCount,
            sourceCueCount: cueOf(srcActive),
            targetCueCount: cueOf(tgtActive),
            bilingualCueCount: cueOf(biActive),
            sourceLang: langOf('source'),
            targetLang: langOf('target'),
            activeSourceVersionId: srcActive?.id || '',
            activeTargetVersionId: tgtActive?.id || '',
            activeBilingualVersionId: biActive?.id || '',
            preferredOpenVersionId,
            canOpenPreferred: !!preferredOpenVersionId,
            activeRecipeSummary: recipeSource
                ? core.formatRecipeSummary(recipeSource.recipe)
                : '',
            mediaLinked,
            mediaExists,
            roles: tracks.map((t) => t.role),
            tags: [...tagSet],
            trackAtLimit,
            maxVersionsPerTrack: versionLimit,
            statusHints: {
                mediaMissing: mediaLinked && !mediaExists,
                mediaUnlinked: !mediaLinked,
                noOpenable: !preferredOpenVersionId,
                sourceEmpty: sourceVersionCount === 0 && (targetVersionCount > 0 || bilingualVersionCount > 0),
                targetOnly: sourceVersionCount === 0 && targetVersionCount > 0,
            },
            matchedVersionCount: filtering
                ? versions.filter((v) => core.versionMatchesRecipeFilter(v, filter)).length
                : versions.length,
        };
    }).filter(Boolean);
    return {
        ok: true,
        items,
        caps,
        total: items.length,
        facets: core.collectRecipeFacets(catalog.versions),
        filter,
    };
}

function getMediaDetail(mediaId, {
    root = getWritableRoot(),
    presetId = '',
    mtModel = '',
    asrModel = '',
    mtProvider = '',
    tag = '',
    recipeQuery = '',
} = {}) {
    const catalog = loadCatalog(root);
    const media = catalog.media.find((m) => m.id === mediaId);
    if (!media) return { ok: false, error: '未找到该作品' };
    const caps = core.buildLibraryCaps(isLibraryProEntitled());
    const filter = {
        presetId, mtModel, asrModel, mtProvider, tag, recipeQuery,
    };
    const filtering = hasRecipeFilter(filter);
    const versionLimit = core.getVersionLimit(isLibraryProEntitled());
    const tracks = catalog.tracks.filter((t) => t.mediaId === media.id).map((track) => {
        const allOnTrack = catalog.versions
            .filter((v) => v.trackId === track.id)
            .slice()
            .sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0));
        // A/B pair must ignore recipe filters so compare actions stay available.
        const abPair = core.findAbComparePair(allOnTrack);
        let versions = allOnTrack;
        if (filtering) {
            versions = versions.filter((v) => core.versionMatchesRecipeFilter(v, filter));
        }
        const totalOnTrack = allOnTrack.length;
        versions = versions.map((v) => ({
            ...v,
            tags: core.normalizeLibraryTags(v.tags),
            recipeSummary: core.formatRecipeSummary(v.recipe),
            roleLabel: core.roleLabel(track.role),
            statusLabel: core.statusLabel(v.status),
            isActive: track.activeVersionId === v.id,
            blobExists: !!(v.contentRef && fs.existsSync(resolveContentAbsPath(v.contentRef, root))),
            exportExists: !!(v.exportPath && fs.existsSync(v.exportPath)),
            exportPathLabel: v.exportPath || '',
        }));
        const slotsLeft = Math.max(0, versionLimit - totalOnTrack);
        return {
            ...track,
            roleLabel: core.roleLabel(track.role),
            versions,
            versionLimit,
            versionCountTotal: totalOnTrack,
            versionSlotsLeft: slotsLeft,
            atVersionLimit: totalOnTrack >= versionLimit,
            limitHint: entitlementsLimitHint(totalOnTrack, versionLimit, caps.libraryPro),
            abPairAvailable: !!abPair.ok,
            abVersionIdA: abPair.versionA?.id || '',
            abVersionIdB: abPair.versionB?.id || '',
        };
    });
    const mediaPath = String(media.path || '').trim();
    const preferredOpenVersionId = (() => {
        for (const role of ['target', 'bilingual', 'source']) {
            const t = tracks.find((tr) => tr.role === role);
            if (t?.activeVersionId) return t.activeVersionId;
        }
        return '';
    })();
    return {
        ok: true,
        media: {
            ...media,
            titleCustom: !!media.titleCustom,
            mediaLinked: !!mediaPath,
            mediaExists: !!(mediaPath && fs.existsSync(mediaPath)),
            preferredOpenVersionId,
        },
        tracks,
        caps,
        filter,
        facets: core.collectRecipeFacets(
            catalog.versions.filter((v) => {
                const tr = catalog.tracks.find((t) => t.id === v.trackId);
                return tr && tr.mediaId === media.id;
            }),
        ),
    };
}

function entitlementsLimitHint(totalOnTrack, versionLimit, libraryPro) {
    const used = Number(totalOnTrack) || 0;
    const limit = Number(versionLimit) || 0;
    if (!limit) return '';
    const left = Math.max(0, limit - used);
    if (libraryPro) {
        return left <= 2
            ? `本轨 ${used}/${limit} 版 · 接近上限`
            : `本轨 ${used}/${limit} 版`;
    }
    if (left <= 0) {
        return `本轨已满 ${used}/${limit} 版 · 再生成将挤掉最旧非保护版（当前/发布/归档保留）`;
    }
    if (left === 1) {
        return `本轨 ${used}/${limit} 版 · 还可留 1 版`;
    }
    return `本轨 ${used}/${limit} 版 · 还可留 ${left} 版`;
}

function isAssociableMediaPath(filePath) {
    try {
        const { isMediaExt } = require('../src/js/media-extensions-core');
        return isMediaExt(filePath);
    } catch {
        return /\.(mp4|mkv|avi|mov|webm|m4v|mp3|wav|flac|m4a|aac|ogg)$/i.test(String(filePath || ''));
    }
}

/**
 * Suggest an AV file for a library media (task path, or sibling of subtitle exports).
 */
function suggestMediaAssociation(mediaId, { root = getWritableRoot() } = {}) {
    const catalog = loadCatalog(root);
    const media = catalog.media.find((m) => m.id === mediaId);
    if (!media) return { ok: false, error: '未找到该作品' };

    const current = String(media.path || '').trim();
    if (current && fs.existsSync(current) && isAssociableMediaPath(current)) {
        return {
            ok: true,
            path: path.resolve(current),
            exists: true,
            source: 'current',
            media,
        };
    }

    const tracks = catalog.tracks.filter((t) => t.mediaId === media.id);
    const versions = catalog.versions
        .filter((v) => tracks.some((t) => t.id === v.trackId))
        .slice()
        .sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0));

    const tried = [];
    for (const v of versions) {
        const exportPath = String(v.exportPath || '').trim();
        if (!exportPath) continue;
        const guessed = guessVideoFromSubtitle(exportPath);
        tried.push({
            exportPath,
            guessed: guessed || '',
            exists: !!(guessed && fs.existsSync(guessed)),
        });
        if (guessed && fs.existsSync(guessed) && isAssociableMediaPath(guessed)) {
            return {
                ok: true,
                path: path.resolve(guessed),
                exists: true,
                source: 'sidecar',
                media,
                tried: tried.slice(0, 6),
            };
        }
    }

    if (current) {
        return {
            ok: false,
            error: `关联文件不存在：${current}`,
            path: current,
            exists: false,
            source: 'current_missing',
            hint: '文件可能已挪盘或改名。可手动选择新位置并重新关联。',
            canPick: true,
            tried: tried.slice(0, 6),
            media,
        };
    }
    return {
        ok: false,
        error: '未找到可关联的音视频',
        hint: '未在字幕旁路旁找到同名影音。请手动选择文件，或确认任务是否带视频路径。',
        canPick: true,
        tried: tried.slice(0, 6),
        media,
    };
}

/**
 * Bind / clear the AV file for a library media. Keeps media.id stable (unlike path-based upsert).
 * Default association at ingest uses the task video/audio path via upsertMedia.
 */
function setMediaAssociation(mediaId, mediaPath = '', {
    root = getWritableRoot(),
    clear = false,
    updateTitle = false,
} = {}) {
    const catalog = loadCatalog(root);
    const media = catalog.media.find((m) => m.id === mediaId);
    if (!media) return { ok: false, error: '未找到该作品' };

    if (clear) {
        media.path = '';
        media.pathKey = '';
        media.updatedAt = core.nowIso();
        saveCatalog(catalog, root);
        broadcastMediaAssociation(media, { cleared: true });
        return {
            ok: true,
            cleared: true,
            media: {
                ...media,
                mediaLinked: false,
                mediaExists: false,
            },
        };
    }

    const resolved = path.resolve(String(mediaPath || '').trim());
    if (!resolved) return { ok: false, error: '缺少音视频路径' };
    if (!fs.existsSync(resolved)) return { ok: false, error: '音视频文件不存在' };
    if (!isAssociableMediaPath(resolved)) {
        return { ok: false, error: '请选择音视频文件' };
    }

    const pathKey = core.normalizePathKey(resolved);
    const clash = catalog.media.find((m) => m.id !== media.id && m.pathKey === pathKey);
    if (clash) {
        return {
            ok: false,
            error: `该文件已关联到「${clash.title || path.basename(clash.path || '')}」`,
        };
    }

    const prevPath = String(media.path || '');
    media.path = resolved;
    media.pathKey = pathKey;
    const prevTitleDefault = core.titleFromMediaPath(prevPath);
    if (
        updateTitle
        || (!media.titleCustom && (!media.title || media.title === prevTitleDefault))
    ) {
        media.title = core.titleFromMediaPath(resolved);
        if (updateTitle) media.titleCustom = false;
    }
    media.updatedAt = core.nowIso();
    saveCatalog(catalog, root);
    broadcastMediaAssociation(media);
    return {
        ok: true,
        media: {
            ...media,
            mediaLinked: true,
            mediaExists: true,
        },
        rematchHint: prevPath && prevPath !== resolved
            ? '已更新关联路径；若标题需同步文件名，可在详情中重命名或清除后重新匹配。'
            : '',
    };
}

function autoLinkMediaAssociation(mediaId, { root = getWritableRoot(), updateTitle = false } = {}) {
    const suggested = suggestMediaAssociation(mediaId, { root });
    if (!suggested.ok || !suggested.path || !suggested.exists) {
        return {
            ok: false,
            error: suggested.error || '未找到可关联的音视频',
            hint: suggested.hint || '',
            canPick: suggested.canPick !== false,
            tried: suggested.tried || [],
            source: suggested.source || '',
            suggestion: suggested,
        };
    }
    if (suggested.source === 'current') {
        return {
            ok: true,
            unchanged: true,
            media: {
                ...suggested.media,
                mediaLinked: true,
                mediaExists: true,
            },
            source: 'current',
        };
    }
    const set = setMediaAssociation(mediaId, suggested.path, { root, updateTitle });
    if (!set.ok) return set;
    return { ...set, source: suggested.source, autoLinked: true };
}

function setActiveVersion(versionId, { root = getWritableRoot(), writeExport = true } = {}) {
    const catalog = loadCatalog(root);
    const version = catalog.versions.find((v) => v.id === versionId);
    if (!version) return { ok: false, error: '未找到该版本' };
    const track = catalog.tracks.find((t) => t.id === version.trackId);
    if (!track) return { ok: false, error: '未找到轨道' };
    track.activeVersionId = version.id;
    track.updatedAt = core.nowIso();
    const media = catalog.media.find((m) => m.id === track.mediaId);
    if (media) media.updatedAt = core.nowIso();

    let wroteExport = false;
    if (writeExport && version.exportPath && version.contentRef) {
        const blobAbs = resolveContentAbsPath(version.contentRef, root);
        if (blobAbs && fs.existsSync(blobAbs)) {
            try {
                fs.mkdirSync(path.dirname(version.exportPath), { recursive: true });
                fs.copyFileSync(blobAbs, version.exportPath);
                wroteExport = true;
            } catch (err) {
                saveCatalog(catalog, root);
                return {
                    ok: false,
                    error: `已设为当前版，但写回失败：${err.message || err}`,
                    version,
                    track,
                };
            }
        }
    }

    saveCatalog(catalog, root);
    return { ok: true, version, track, wroteExport, caps: core.buildLibraryCaps(isLibraryProEntitled()) };
}

function openVersionPaths(versionId, {
    root = getWritableRoot(),
    autoLinkIfMissing = true,
} = {}) {
    const catalog = loadCatalog(root);
    const version = catalog.versions.find((v) => v.id === versionId);
    if (!version) return { ok: false, error: '未找到该版本' };
    const track = catalog.tracks.find((t) => t.id === version.trackId);
    const media = track ? catalog.media.find((m) => m.id === track.mediaId) : null;
    const blobAbs = resolveContentAbsPath(version.contentRef, root);
    const exportPath = String(version.exportPath || '').trim();
    let openPath = '';
    let openedFromBlob = false;
    if (exportPath && fs.existsSync(exportPath)) {
        openPath = exportPath;
    } else if (blobAbs && fs.existsSync(blobAbs)) {
        // Prefer materializing sidecar so editor save stays on exportPath lineage.
        if (exportPath) {
            try {
                fs.mkdirSync(path.dirname(exportPath), { recursive: true });
                fs.copyFileSync(blobAbs, exportPath);
                openPath = exportPath;
            } catch {
                openPath = blobAbs;
                openedFromBlob = true;
            }
        } else {
            openPath = blobAbs;
            openedFromBlob = true;
        }
    }
    if (!openPath) return { ok: false, error: '版本文件不存在' };

    let videoPath = String(media?.path || '').trim();
    let mediaLinkedOnOpen = false;
    if (media && (!videoPath || !fs.existsSync(videoPath))) {
        const suggested = suggestMediaAssociation(media.id, { root });
        if (suggested.ok && suggested.exists) {
            videoPath = suggested.path;
            // Relink when unbound OR when catalog path is stale/missing.
            const catalogPath = String(media.path || '').trim();
            const shouldRelink = autoLinkIfMissing && (
                !catalogPath || !fs.existsSync(catalogPath)
            );
            if (shouldRelink) {
                const linked = setMediaAssociation(media.id, suggested.path, { root });
                mediaLinkedOnOpen = !!linked.ok;
                if (linked.ok) Object.assign(media, linked.media);
            }
        }
    }

    const isActive = !!(track?.activeVersionId && track.activeVersionId === version.id);
    const recipeSummary = core.formatRecipeSummary(version.recipe);
    const role = String(track?.role || '');
    const mediaLinked = !!(media && String(media.path || '').trim());
    const mediaExists = !!(videoPath && fs.existsSync(videoPath));
    const siblings = catalog.versions.filter((v) => v.trackId === track?.id);
    const abPair = core.findAbComparePair(siblings);
    const session = {
        mediaId: media?.id || '',
        trackId: track?.id || '',
        versionId: version.id,
        role,
        roleLabel: core.roleLabel(role),
        recipeSummary,
        contentRef: version.contentRef || '',
        exportPath: exportPath || '',
        isActive,
        mediaTitle: media?.title || '',
        openedFromBlob,
        mediaLinked,
        mediaExists,
        abPairAvailable: !!abPair.ok,
        abVersionIdA: abPair.ok ? (abPair.versionA?.id || '') : '',
        abVersionIdB: abPair.ok ? (abPair.versionB?.id || '') : '',
    };

    return {
        ok: true,
        path: openPath,
        videoPath: videoPath || '',
        mediaLinkedOnOpen,
        ...session,
        library: session,
        version,
        track,
        media,
    };
}

/**
 * Auto-link AV for many media ids (or all that are unlinked / missing).
 */
function autoLinkMediaBatch(mediaIds = null, {
    root = getWritableRoot(),
    onlyUnlinkedOrMissing = true,
    updateTitle = false,
} = {}) {
    const catalog = loadCatalog(root);
    let ids = Array.isArray(mediaIds)
        ? [...new Set(mediaIds.map((id) => String(id || '').trim()).filter(Boolean))]
        : catalog.media.map((m) => m.id);
    if (onlyUnlinkedOrMissing && !Array.isArray(mediaIds)) {
        ids = catalog.media
            .filter((m) => {
                const p = String(m.path || '').trim();
                return !p || !fs.existsSync(p);
            })
            .map((m) => m.id);
    } else if (onlyUnlinkedOrMissing && Array.isArray(mediaIds)) {
        ids = ids.filter((id) => {
            const m = catalog.media.find((x) => x.id === id);
            if (!m) return false;
            const p = String(m.path || '').trim();
            return !p || !fs.existsSync(p);
        });
    }

    const results = [];
    let linked = 0;
    let unchanged = 0;
    let failed = 0;
    for (const id of ids) {
        const res = autoLinkMediaAssociation(id, { root, updateTitle });
        results.push({ mediaId: id, ...res });
        if (res?.ok && res.autoLinked) linked += 1;
        else if (res?.ok && res.unchanged) unchanged += 1;
        else failed += 1;
    }
    return {
        ok: true,
        total: ids.length,
        linked,
        unchanged,
        failed,
        results,
        caps: core.buildLibraryCaps(isLibraryProEntitled()),
    };
}

function readVersionText(version, root = getWritableRoot()) {
    const blobAbs = resolveContentAbsPath(version?.contentRef, root);
    if (blobAbs && fs.existsSync(blobAbs)) {
        return fs.readFileSync(blobAbs, 'utf8');
    }
    if (version?.exportPath && fs.existsSync(version.exportPath)) {
        return fs.readFileSync(version.exportPath, 'utf8');
    }
    return null;
}

/**
 * Read-only text preview of a library version (first N lines), without opening the editor.
 */
function previewVersion(versionId, { root = getWritableRoot(), maxLines = 48 } = {}) {
    const id = String(versionId || '').trim();
    if (!id) return { ok: false, error: '缺少版本 ID' };
    const catalog = loadCatalog(root);
    const version = catalog.versions.find((v) => v.id === id);
    if (!version) return { ok: false, error: '未找到该版本' };
    const track = catalog.tracks.find((t) => t.id === version.trackId);
    const media = track ? catalog.media.find((m) => m.id === track.mediaId) : null;
    let text = null;
    try {
        text = readVersionText(version, root);
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
    if (text == null) return { ok: false, error: '版本文件不存在' };
    const limit = Math.max(8, Math.min(400, Number(maxLines) || 48));
    const allLines = String(text).split(/\r?\n/);
    const truncated = allLines.length > limit;
    const preview = allLines.slice(0, limit).join('\n');
    const filePath = resolveVersionFilePath(version, root);
    return {
        ok: true,
        versionId: version.id,
        mediaId: media?.id || '',
        mediaTitle: media?.title || '',
        trackId: track?.id || '',
        role: track?.role || '',
        roleLabel: core.roleLabel(track?.role || ''),
        recipeSummary: core.formatRecipeSummary(version.recipe),
        note: String(version.note || ''),
        cueCount: core.countSubtitleCues(text),
        basename: filePath ? path.basename(filePath) : '',
        preview,
        truncated,
        lineCount: allLines.length,
        caps: core.buildLibraryCaps(isLibraryProEntitled()),
    };
}

/**
 * Read-only timed cues for library in-window player (no export materialize / auto-link).
 */
function loadVersionPlayback(versionId, { root = getWritableRoot() } = {}) {
    const id = String(versionId || '').trim();
    if (!id) return { ok: false, error: '缺少版本 ID' };
    const catalog = loadCatalog(root);
    const version = catalog.versions.find((v) => v.id === id);
    if (!version) return { ok: false, error: '未找到该版本' };
    const track = catalog.tracks.find((t) => t.id === version.trackId);
    const media = track ? catalog.media.find((m) => m.id === track.mediaId) : null;
    let text = null;
    try {
        text = readVersionText(version, root);
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
    if (text == null) return { ok: false, error: '版本文件不存在' };

    const filePath = resolveVersionFilePath(version, root);
    let format;
    let cues;
    let header;
    try {
        const { detectFormat, parseSubtitle, isEditableFormat } = require('./subtitle-format');
        format = detectFormat(filePath || '', text);
        if (!isEditableFormat(format)) {
            return {
                ok: false,
                error: `暂不支持预览 ${String(format || '').toUpperCase()} 格式`,
                format,
            };
        }
        const parsed = parseSubtitle(text, format);
        format = parsed.format;
        header = Array.isArray(parsed.header) ? parsed.header : [];
        cues = (Array.isArray(parsed.cues) ? parsed.cues : []).map((c) => ({
            startMs: Number(c?.startMs) || 0,
            endMs: c?.endMs != null && Number.isFinite(Number(c.endMs)) ? Number(c.endMs) : null,
            text: String(c?.text || ''),
        }));
    } catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }

    const videoPath = String(media?.path || '').trim();
    const mediaLinked = !!videoPath;
    const mediaExists = !!(videoPath && fs.existsSync(videoPath));
    return {
        ok: true,
        versionId: version.id,
        mediaId: media?.id || '',
        mediaTitle: media?.title || '',
        trackId: track?.id || '',
        role: track?.role || '',
        roleLabel: core.roleLabel(track?.role || ''),
        recipeSummary: core.formatRecipeSummary(version.recipe),
        note: String(version.note || ''),
        basename: filePath ? path.basename(filePath) : '',
        format,
        header,
        cues,
        cueCount: cues.length,
        videoPath,
        mediaLinked,
        mediaExists,
        caps: core.buildLibraryCaps(isLibraryProEntitled()),
    };
}

function requireLibraryProOrDev() {
    try {
        const { requireSubtitleLibraryPro } = require('./advanced-gates');
        return requireSubtitleLibraryPro();
    } catch (err) {
        return { ok: false, error: err.message || String(err), code: 'gate_error' };
    }
}

function diffVersions(versionIdA, versionIdB, {
    root = getWritableRoot(),
    requirePro = true,
} = {}) {
    if (requirePro) {
        const gate = requireLibraryProOrDev();
        if (!gate.ok) {
            return {
                ok: false,
                error: gate.error || '版本对比需解锁 Pro',
                code: gate.code || 'not_entitled',
                proRequired: true,
            };
        }
    }
    const catalog = loadCatalog(root);
    const a = catalog.versions.find((v) => v.id === versionIdA);
    const b = catalog.versions.find((v) => v.id === versionIdB);
    if (!a || !b) return { ok: false, error: '未找到对比版本' };
    if (a.trackId !== b.trackId) {
        return { ok: false, error: '只能对比同一轨道下的版本' };
    }
    const textA = readVersionText(a, root);
    const textB = readVersionText(b, root);
    if (textA == null || textB == null) return { ok: false, error: '版本内容缺失' };
    const diff = core.diffLines(textA, textB);
    const track = catalog.tracks.find((t) => t.id === a.trackId);
    return {
        ok: true,
        trackId: a.trackId,
        role: track?.role || '',
        versionA: {
            id: a.id,
            createdAt: a.createdAt,
            status: a.status,
            recipeSummary: core.formatRecipeSummary(a.recipe),
        },
        versionB: {
            id: b.id,
            createdAt: b.createdAt,
            status: b.status,
            recipeSummary: core.formatRecipeSummary(b.recipe),
        },
        stats: diff.stats,
        ops: core.summarizeDiffOps(diff.ops),
        caps: core.buildLibraryCaps(isLibraryProEntitled()),
    };
}

function setVersionStatus(versionId, status, { root = getWritableRoot(), requirePro = true } = {}) {
    const want = String(status || '').trim();
    const allowed = new Set([
        core.STATUS_RAW,
        core.STATUS_EDITED,
        core.STATUS_PUBLISHED,
        core.STATUS_ARCHIVED,
    ]);
    if (!allowed.has(want)) return { ok: false, error: '无效状态' };

    // published is Pro depth
    if (want === core.STATUS_PUBLISHED && requirePro) {
        const gate = requireLibraryProOrDev();
        if (!gate.ok) {
            return {
                ok: false,
                error: gate.error || '标记发布需解锁 Pro',
                code: gate.code || 'not_entitled',
                proRequired: true,
            };
        }
    }

    const catalog = loadCatalog(root);
    const version = catalog.versions.find((v) => v.id === versionId);
    if (!version) return { ok: false, error: '未找到该版本' };
    // Archiving the active version clears active pointer (must pick another to restore sidecar)
    const track = catalog.tracks.find((t) => t.id === version.trackId);
    version.status = want;
    if (track) {
        if (want === core.STATUS_ARCHIVED && track.activeVersionId === version.id) {
            const next = catalog.versions
                .filter((v) => v.trackId === track.id
                    && v.id !== version.id
                    && v.status !== core.STATUS_ARCHIVED)
                .sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0))[0];
            track.activeVersionId = next?.id || '';
        }
        track.updatedAt = core.nowIso();
    }
    const media = track ? catalog.media.find((m) => m.id === track.mediaId) : null;
    if (media) media.updatedAt = core.nowIso();
    saveCatalog(catalog, root);
    return {
        ok: true,
        version,
        track,
        caps: core.buildLibraryCaps(isLibraryProEntitled()),
    };
}

/**
 * Permanently remove a version and GC its blob when unreferenced.
 * Active versions must be archived or switched first.
 */
function deleteVersion(versionId, { root = getWritableRoot() } = {}) {
    const catalog = loadCatalog(root);
    const version = catalog.versions.find((v) => v.id === versionId);
    if (!version) return { ok: false, error: '未找到该版本' };
    const track = catalog.tracks.find((t) => t.id === version.trackId);
    if (track && track.activeVersionId === version.id) {
        return { ok: false, error: '当前版请先「设为其他版」或「归档」后再删除' };
    }
    if (version.status === core.STATUS_PUBLISHED) {
        return { ok: false, error: '发布版请先取消发布或归档后再删除' };
    }
    const contentRef = version.contentRef;
    catalog.versions = catalog.versions.filter((v) => v.id !== versionId);
    if (track) track.updatedAt = core.nowIso();
    const media = track ? catalog.media.find((m) => m.id === track.mediaId) : null;
    if (media) media.updatedAt = core.nowIso();
    tryGcBlob(catalog, contentRef, root);
    saveCatalog(catalog, root);
    return {
        ok: true,
        deletedId: versionId,
        caps: core.buildLibraryCaps(isLibraryProEntitled()),
    };
}

/**
 * Permanently remove a media entry with all tracks/versions and GC unreferenced blobs.
 * Does not delete video files or sidecar exports on disk.
 */
function deleteMedia(mediaId, { root = getWritableRoot(), notify = true } = {}) {
    const id = String(mediaId || '').trim();
    if (!id) return { ok: false, error: '缺少作品 ID' };
    const catalog = loadCatalog(root);
    const media = catalog.media.find((m) => m.id === id);
    if (!media) return { ok: false, error: '未找到该作品' };

    const trackIds = new Set(
        catalog.tracks.filter((t) => t.mediaId === id).map((t) => t.id),
    );
    const removedVersions = catalog.versions.filter((v) => trackIds.has(v.trackId));
    const contentRefs = [...new Set(removedVersions.map((v) => v.contentRef).filter(Boolean))];

    catalog.versions = catalog.versions.filter((v) => !trackIds.has(v.trackId));
    catalog.tracks = catalog.tracks.filter((t) => t.mediaId !== id);
    catalog.media = catalog.media.filter((m) => m.id !== id);

    for (const ref of contentRefs) {
        tryGcBlob(catalog, ref, root);
    }
    saveCatalog(catalog, root);

    if (notify) {
        notifyLibraryCatalogChanged({
            reason: 'delete-media',
            mediaIds: [id],
            mediaId: id,
            deletedVersionCount: removedVersions.length,
            deletedTrackCount: trackIds.size,
        });
        notifyEditorsMediaAssociation({
            reason: 'media-deleted',
            mediaIds: [id],
            mediaId: id,
            videoPath: '',
            mediaLinked: false,
            mediaExists: false,
        });
    }

    return {
        ok: true,
        deletedId: id,
        deletedVersionCount: removedVersions.length,
        deletedTrackCount: trackIds.size,
        title: media.title || '',
        caps: core.buildLibraryCaps(isLibraryProEntitled()),
    };
}

/**
 * Batch-delete media entries. Continues on per-item failures.
 */
function deleteMediaBatch(mediaIds, { root = getWritableRoot() } = {}) {
    const ids = [...new Set(
        (Array.isArray(mediaIds) ? mediaIds : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean),
    )];
    if (!ids.length) return { ok: false, error: '请选择要删除的作品' };

    const results = [];
    let deleted = 0;
    let failed = 0;
    let deletedVersionCount = 0;
    for (const id of ids) {
        const res = deleteMedia(id, { root, notify: false });
        results.push({ mediaId: id, ok: !!res.ok, error: res.error || '', title: res.title || '' });
        if (res.ok) {
            deleted += 1;
            deletedVersionCount += Number(res.deletedVersionCount) || 0;
        } else {
            failed += 1;
        }
    }

    if (deleted > 0) {
        const deletedIds = results.filter((r) => r.ok).map((r) => r.mediaId);
        notifyLibraryCatalogChanged({
            reason: 'delete-media',
            mediaIds: deletedIds,
            deleted,
            failed,
            deletedVersionCount,
        });
        for (const mediaId of deletedIds) {
            notifyEditorsMediaAssociation({
                reason: 'media-deleted',
                mediaIds: [mediaId],
                mediaId,
                videoPath: '',
                mediaLinked: false,
                mediaExists: false,
            });
        }
    }

    return {
        ok: deleted > 0,
        deleted,
        failed,
        total: ids.length,
        deletedVersionCount,
        results,
        error: deleted > 0 ? '' : (results[0]?.error || '删除失败'),
        caps: core.buildLibraryCaps(isLibraryProEntitled()),
    };
}

function setVersionNote(versionId, note, { root = getWritableRoot() } = {}) {
    const catalog = loadCatalog(root);
    const version = catalog.versions.find((v) => v.id === versionId);
    if (!version) return { ok: false, error: '未找到该版本' };
    version.note = String(note || '').trim().slice(0, 200);
    const track = catalog.tracks.find((t) => t.id === version.trackId);
    if (track) track.updatedAt = core.nowIso();
    const media = track ? catalog.media.find((m) => m.id === track.mediaId) : null;
    if (media) media.updatedAt = core.nowIso();
    saveCatalog(catalog, root);
    return {
        ok: true,
        version: {
            id: version.id,
            note: version.note,
            tags: core.normalizeLibraryTags(version.tags),
        },
        caps: core.buildLibraryCaps(isLibraryProEntitled()),
    };
}

/**
 * Set or clear exclusive 对照A / 对照B on a version (Pro).
 * @param {string} versionId
 * @param {string} abTag '对照A' | '对照B' | 'A' | 'B' | ''
 */
function setVersionAbTag(versionId, abTag, {
    root = getWritableRoot(),
    requirePro = true,
} = {}) {
    if (requirePro) {
        const gate = requireLibraryProOrDev();
        if (!gate.ok) {
            return {
                ok: false,
                error: gate.error || '对照标签需解锁 Pro',
                code: gate.code || 'not_entitled',
                proRequired: true,
            };
        }
    }
    const catalog = loadCatalog(root);
    const version = catalog.versions.find((v) => v.id === versionId);
    if (!version) return { ok: false, error: '未找到该版本' };
    const siblings = catalog.versions.filter((v) => v.trackId === version.trackId);
    const applied = core.applyExclusiveAbTag(siblings, versionId, abTag);
    if (!applied.ok) return applied;
    const track = catalog.tracks.find((t) => t.id === version.trackId);
    if (track) track.updatedAt = core.nowIso();
    const media = track ? catalog.media.find((m) => m.id === track.mediaId) : null;
    if (media) media.updatedAt = core.nowIso();
    saveCatalog(catalog, root);
    return {
        ok: true,
        version: {
            id: version.id,
            note: version.note || '',
            tags: core.normalizeLibraryTags(version.tags),
            abTag: applied.tag || '',
        },
        caps: core.buildLibraryCaps(isLibraryProEntitled()),
    };
}

function resolveVersionFilePath(version, root = getWritableRoot()) {
    if (!version) return '';
    const blobAbs = resolveContentAbsPath(version.contentRef, root);
    if (version.exportPath && fs.existsSync(version.exportPath)) return version.exportPath;
    if (blobAbs && fs.existsSync(blobAbs)) return blobAbs;
    return '';
}

function pickBestSourceVersion(versions) {
    const list = Array.isArray(versions) ? versions.slice() : [];
    list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return list[0] || null;
}

/**
 * Resolve JA source + ZH 对照A/B (or active target) paths for MT train handoff.
 */
function prepareLibraryMtTrainPair(mediaId, {
    root = getWritableRoot(),
    preferTag = core.TAG_COMPARE_B,
    requirePro = true,
} = {}) {
    if (requirePro) {
        const gate = requireLibraryProOrDev();
        if (!gate.ok) {
            return {
                ok: false,
                error: gate.error || '送入训练台需解锁 Pro',
                code: gate.code || 'not_entitled',
                proRequired: true,
            };
        }
    }
    const catalog = loadCatalog(root);
    const media = catalog.media.find((m) => m.id === mediaId);
    if (!media) return { ok: false, error: '未找到该作品' };

    const sourceTrack = catalog.tracks.find(
        (t) => t.mediaId === media.id && t.role === core.ROLE_SOURCE,
    );
    const targetTrack = catalog.tracks.find(
        (t) => t.mediaId === media.id && t.role === core.ROLE_TARGET,
    );
    if (!sourceTrack) return { ok: false, error: '缺少原文字幕轨道' };
    if (!targetTrack) return { ok: false, error: '缺少译文字幕轨道' };

    const sourceVersions = catalog.versions.filter((v) => v.trackId === sourceTrack.id);
    const targetVersions = catalog.versions.filter((v) => v.trackId === targetTrack.id);
    const activeSource = sourceVersions.find((v) => v.id === sourceTrack.activeVersionId)
        || pickBestSourceVersion(sourceVersions);
    const jaPath = resolveVersionFilePath(activeSource, root);
    if (!jaPath) return { ok: false, error: '原文版本文件不存在' };

    const pair = core.findAbComparePair(targetVersions);
    const prefer = core.normalizeAbTag(preferTag) || core.TAG_COMPARE_B;
    let zhVersion = null;
    if (pair.ok) {
        zhVersion = prefer === core.TAG_COMPARE_A ? pair.versionA : pair.versionB;
        if (!zhVersion) zhVersion = pair.versionB || pair.versionA;
    }
    if (!zhVersion) {
        zhVersion = targetVersions.find((v) => v.id === targetTrack.activeVersionId)
            || pickBestSourceVersion(targetVersions);
    }
    const zhPath = resolveVersionFilePath(zhVersion, root);
    if (!zhPath) return { ok: false, error: '译文版本文件不存在' };

    const zhPathA = pair.ok ? resolveVersionFilePath(pair.versionA, root) : '';
    const zhPathB = pair.ok ? resolveVersionFilePath(pair.versionB, root) : '';

    return {
        ok: true,
        mediaId: media.id,
        title: media.title || core.titleFromMediaPath(media.path),
        mediaPath: media.path || '',
        jaPath,
        zhPath,
        zhPathA,
        zhPathB,
        hasAbPair: !!pair.ok,
        sourceVersionId: activeSource?.id || '',
        targetVersionId: zhVersion?.id || '',
        versionIdA: pair.versionA?.id || '',
        versionIdB: pair.versionB?.id || '',
        caps: core.buildLibraryCaps(isLibraryProEntitled()),
    };
}

function safePackFileName(name, fallback = 'subtitle.srt') {
    const raw = String(name || fallback).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
    return (raw || fallback).slice(0, 120);
}

/**
 * Export active (or published-preferring) tracks of a media into destDir + manifest.
 */
function exportPublishPack(mediaId, destDir, {
    root = getWritableRoot(),
    preferPublished = true,
    requirePro = true,
} = {}) {
    if (requirePro) {
        const gate = requireLibraryProOrDev();
        if (!gate.ok) {
            return {
                ok: false,
                error: gate.error || '导出发布包需解锁 Pro',
                code: gate.code || 'not_entitled',
                proRequired: true,
            };
        }
    }
    const catalog = loadCatalog(root);
    const media = catalog.media.find((m) => m.id === mediaId);
    if (!media) return { ok: false, error: '未找到该作品' };
    const outDir = path.resolve(String(destDir || ''));
    if (!outDir) return { ok: false, error: '缺少导出目录' };
    fs.mkdirSync(outDir, { recursive: true });

    const tracks = catalog.tracks.filter((t) => t.mediaId === media.id);
    const files = [];
    const usedNames = new Set();

    for (const track of tracks) {
        const versions = catalog.versions.filter((v) => v.trackId === track.id);
        let chosen = null;
        if (preferPublished) {
            chosen = versions.find((v) => v.status === core.STATUS_PUBLISHED)
                || versions.find((v) => v.id === track.activeVersionId)
                || versions[0];
        } else {
            chosen = versions.find((v) => v.id === track.activeVersionId) || versions[0];
        }
        if (!chosen) continue;
        const text = readVersionText(chosen, root);
        if (text == null) continue;
        const ext = path.extname(chosen.exportPath || '') || path.extname(chosen.contentRef || '') || '.srt';
        const roleTag = track.role === core.ROLE_SOURCE
            ? (track.lang || 'source')
            : track.role === core.ROLE_TARGET
                ? (track.lang || 'zh')
                : 'bilingual';
        let fileName = safePackFileName(`${media.title || 'media'}.${roleTag}${ext}`);
        let n = 1;
        while (usedNames.has(fileName.toLowerCase())) {
            fileName = safePackFileName(`${media.title || 'media'}.${roleTag}.${n}${ext}`);
            n += 1;
        }
        usedNames.add(fileName.toLowerCase());
        const dest = path.join(outDir, fileName);
        fs.writeFileSync(dest, text, 'utf8');
        files.push({
            file: fileName,
            role: track.role,
            lang: track.lang || '',
            versionId: chosen.id,
            status: chosen.status,
            recipe: chosen.recipe,
            recipeSummary: core.formatRecipeSummary(chosen.recipe),
        });
    }

    if (!files.length) return { ok: false, error: '没有可导出的字幕版本' };

    const manifest = {
        version: 1,
        kind: 'transub-subtitle-publish-pack',
        exportedAt: core.nowIso(),
        media: {
            id: media.id,
            title: media.title,
            path: media.path,
        },
        files,
    };
    const manifestName = 'transub-publish-manifest.json';
    fs.writeFileSync(
        path.join(outDir, manifestName),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
    );

    return {
        ok: true,
        dir: outDir,
        files: files.map((f) => f.file),
        manifest: manifestName,
        count: files.length,
        caps: core.buildLibraryCaps(true),
    };
}

/**
 * Export publish packs for multiple media into subfolders under destDir.
 */
function exportPublishPackBatch(mediaIds, destDir, {
    root = getWritableRoot(),
    preferPublished = true,
    requirePro = true,
} = {}) {
    if (requirePro) {
        const gate = requireLibraryProOrDev();
        if (!gate.ok) {
            return {
                ok: false,
                error: gate.error || '导出发布包需解锁 Pro',
                code: gate.code || 'not_entitled',
                proRequired: true,
            };
        }
    }
    const ids = [...new Set((Array.isArray(mediaIds) ? mediaIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean))];
    if (!ids.length) return { ok: false, error: '未选择作品' };
    const outRoot = path.resolve(String(destDir || ''));
    if (!outRoot) return { ok: false, error: '缺少导出目录' };
    fs.mkdirSync(outRoot, { recursive: true });
    const catalog = loadCatalog(root);
    const usedDirs = new Set();
    const results = [];
    let fileCount = 0;
    let okCount = 0;
    for (const id of ids) {
        const media = catalog.media.find((m) => m.id === id);
        let folder = safePackFileName(media?.title || id, id);
        let n = 1;
        while (usedDirs.has(folder.toLowerCase())) {
            folder = safePackFileName(`${media?.title || id}.${n}`, `${id}_${n}`);
            n += 1;
        }
        usedDirs.add(folder.toLowerCase());
        const subDir = path.join(outRoot, folder);
        const res = exportPublishPack(id, subDir, {
            root,
            preferPublished,
            requirePro: false,
        });
        results.push({
            mediaId: id,
            title: media?.title || '',
            dir: subDir,
            ok: !!res?.ok,
            count: res?.count || 0,
            error: res?.ok ? '' : (res?.error || '导出失败'),
        });
        if (res?.ok) {
            okCount += 1;
            fileCount += Number(res.count) || 0;
        }
    }
    if (!okCount) {
        return {
            ok: false,
            error: results[0]?.error || '批量导出失败',
            results,
            caps: core.buildLibraryCaps(true),
        };
    }
    return {
        ok: true,
        dir: outRoot,
        mediaCount: okCount,
        count: fileCount,
        results,
        caps: core.buildLibraryCaps(true),
    };
}

/**
 * List published / edited versions as corpus export candidates (Pro).
 */
function listCorpusCandidates({
    root = getWritableRoot(),
    requirePro = true,
    statuses = [core.STATUS_PUBLISHED, core.STATUS_EDITED],
} = {}) {
    if (requirePro) {
        const gate = requireLibraryProOrDev();
        if (!gate.ok) {
            return {
                ok: false,
                error: gate.error || '语料导出需解锁 Pro',
                code: gate.code || 'not_entitled',
                proRequired: true,
            };
        }
    }
    const catalog = loadCatalog(root);
    const want = new Set(statuses);
    const items = [];
    for (const version of catalog.versions) {
        if (!want.has(version.status)) continue;
        const track = catalog.tracks.find((t) => t.id === version.trackId);
        if (!track) continue;
        const media = catalog.media.find((m) => m.id === track.mediaId);
        items.push({
            versionId: version.id,
            mediaId: media?.id || '',
            title: media?.title || '',
            role: track.role,
            lang: track.lang || '',
            status: version.status,
            createdAt: version.createdAt,
            recipeSummary: core.formatRecipeSummary(version.recipe),
            exportPath: version.exportPath || '',
            bindingSourceVersionId: version.bindingSourceVersionId || null,
        });
    }
    items.sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0));
    return {
        ok: true,
        items,
        total: items.length,
        caps: core.buildLibraryCaps(true),
    };
}

/**
 * Write corpus candidates as JSONL (one record per version, text included).
 */
function exportCorpusJsonl(destPath, {
    root = getWritableRoot(),
    requirePro = true,
    statuses = [core.STATUS_PUBLISHED, core.STATUS_EDITED],
} = {}) {
    const listed = listCorpusCandidates({ root, requirePro, statuses });
    if (!listed.ok) return listed;
    const out = path.resolve(String(destPath || ''));
    if (!out) return { ok: false, error: '缺少导出路径' };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const catalog = loadCatalog(root);
    const lines = [];
    for (const item of listed.items) {
        const version = catalog.versions.find((v) => v.id === item.versionId);
        if (!version) continue;
        const text = readVersionText(version, root);
        if (text == null) continue;
        let sourceText = null;
        if (version.bindingSourceVersionId) {
            const src = catalog.versions.find((v) => v.id === version.bindingSourceVersionId);
            if (src) sourceText = readVersionText(src, root);
        }
        lines.push(JSON.stringify({
            ...item,
            recipe: version.recipe || null,
            text,
            sourceText,
        }));
    }
    fs.writeFileSync(out, `${lines.join('\n')}${lines.length ? '\n' : ''}`, 'utf8');
    return {
        ok: true,
        path: out,
        count: lines.length,
        caps: core.buildLibraryCaps(true),
    };
}

function resolveSourceVersionForRerun(catalog, version) {
    if (!version) return null;
    const track = catalog.tracks.find((t) => t.id === version.trackId);
    if (!track) return null;
    if (track.role === core.ROLE_SOURCE) return { version, track };
    if (version.bindingSourceVersionId) {
        const src = catalog.versions.find((v) => v.id === version.bindingSourceVersionId);
        if (src) {
            const srcTrack = catalog.tracks.find((t) => t.id === src.trackId);
            return { version: src, track: srcTrack || track };
        }
    }
    // Fallback: active/latest source track on same media
    const mediaId = track.mediaId;
    const sourceTrack = catalog.tracks.find(
        (t) => t.mediaId === mediaId && t.role === core.ROLE_SOURCE,
    );
    if (!sourceTrack) return null;
    const srcVer = catalog.versions.find((v) => v.id === sourceTrack.activeVersionId)
        || catalog.versions.filter((v) => v.trackId === sourceTrack.id)
            .sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0))[0];
    if (!srcVer) return null;
    return { version: srcVer, track: sourceTrack };
}

/**
 * Prepare a retranslate plan from a library version (Pro).
 * Restores source blob beside the media (or exportPath) and returns hints for UI.
 */
function prepareLibraryRerun(versionId, {
    root = getWritableRoot(),
    presetId = '',
    requirePro = true,
} = {}) {
    if (requirePro) {
        const gate = requireLibraryProOrDev();
        if (!gate.ok) {
            return {
                ok: false,
                error: gate.error || '配方再跑需解锁 Pro',
                code: gate.code || 'not_entitled',
                proRequired: true,
            };
        }
    }
    const catalog = loadCatalog(root);
    const seed = catalog.versions.find((v) => v.id === versionId);
    if (!seed) return { ok: false, error: '未找到该版本' };
    const resolved = resolveSourceVersionForRerun(catalog, seed);
    if (!resolved?.version) {
        return { ok: false, error: '没有可再跑的原文版本（请先入库原文轨）' };
    }
    const { version: sourceVersion, track: sourceTrack } = resolved;
    const media = catalog.media.find((m) => m.id === (sourceTrack?.mediaId || ''));
    if (!media?.path) return { ok: false, error: '缺少关联视频路径' };
    if (!fs.existsSync(media.path)) {
        return { ok: false, error: `视频文件不存在：${media.path}` };
    }

    const text = readVersionText(sourceVersion, root);
    if (text == null || !String(text).trim()) {
        return { ok: false, error: '原文版本内容缺失' };
    }

    const ext = path.extname(sourceVersion.exportPath || '')
        || path.extname(sourceVersion.contentRef || '')
        || '.srt';
    const stem = path.basename(media.path, path.extname(media.path));
    const langTag = sourceTrack?.lang && sourceTrack.lang !== 'source'
        ? sourceTrack.lang
        : (core.inferLangFromPath(sourceVersion.exportPath) || 'ja');
    let restorePath = sourceVersion.exportPath
        ? path.resolve(sourceVersion.exportPath)
        : path.join(path.dirname(media.path), `${stem}.${langTag}${ext}`);

    try {
        fs.mkdirSync(path.dirname(restorePath), { recursive: true });
        fs.writeFileSync(restorePath, text, 'utf8');
    } catch (err) {
        // Fallback next to video
        restorePath = path.join(path.dirname(media.path), `${stem}.${langTag}${ext}`);
        fs.writeFileSync(restorePath, text, 'utf8');
    }

    // Also drop a copy into transcript-keep so main-window retranslate discovery works
    let keptPath = '';
    try {
        const { keepTranscriptFiles } = require('./transcript-keep');
        const kept = keepTranscriptFiles([restorePath], { keepTranscript: true });
        if (kept?.ok && kept.kept?.[0]) keptPath = kept.kept[0];
    } catch { /* optional */ }

    let recipe = sourceVersion.recipe || core.buildRecipeFromOptions({});
    // Prefer the seed version's recipe when rerunning from a target (same MT intent)
    if (seed.id !== sourceVersion.id && seed.recipe) {
        recipe = core.inheritRecipe(seed.recipe);
        // Keep ASR/language from source
        if (sourceVersion.recipe?.asr) {
            recipe.asr = { ...recipe.asr, ...sourceVersion.recipe.asr };
        }
    }

    let presetMeta = null;
    const wantPreset = String(presetId || '').trim();
    if (wantPreset) {
        try {
            const { loadPresets } = require('./presets-data');
            presetMeta = (loadPresets().presets || []).find((p) => p.id === wantPreset) || null;
        } catch { /* ignore */ }
        if (!presetMeta) return { ok: false, error: `未找到预设：${wantPreset}` };
        recipe = core.applyPresetToRecipe(recipe, presetMeta);
    }

    const hints = core.recipeToRetranslateHints(recipe);
    const destPath = path.join(
        path.dirname(media.path),
        `${stem}.zh${ext.startsWith('.') ? ext : `.${ext}`}`,
    );

    return {
        ok: true,
        mediaId: media.id,
        mediaPath: media.path,
        mediaTitle: media.title,
        sourceVersionId: sourceVersion.id,
        seedVersionId: seed.id,
        sourcePath: restorePath,
        keptPath: keptPath || '',
        destPath,
        recipe,
        hints,
        preset: presetMeta ? { id: presetMeta.id, name: presetMeta.name } : null,
        caps: core.buildLibraryCaps(true),
    };
}

function getLibraryStatus({ root = getWritableRoot() } = {}) {
    const catalog = loadCatalog(root);
    const entitled = isLibraryProEntitled();
    return {
        ok: true,
        caps: core.buildLibraryCaps(entitled),
        mediaCount: catalog.media.length,
        trackCount: catalog.tracks.length,
        versionCount: catalog.versions.length,
        root: getLibraryRoot(root),
    };
}

/**
 * One-click diff for 对照A vs 对照B on a track (Pro).
 */
function diffAbPair(trackId, { root = getWritableRoot(), requirePro = true } = {}) {
    const catalog = loadCatalog(root);
    const track = catalog.tracks.find((t) => t.id === trackId);
    if (!track) return { ok: false, error: '未找到轨道' };
    const versions = catalog.versions.filter((v) => v.trackId === track.id);
    const pair = core.findAbComparePair(versions);
    if (!pair.ok) {
        return {
            ok: false,
            error: pair.reason === 'same_version'
                ? '对照 A/B 指向同一版本'
                : '该轨道尚无完整的对照 A/B 标签对',
            code: 'no_ab_pair',
        };
    }
    const diff = diffVersions(pair.versionA.id, pair.versionB.id, { root, requirePro });
    if (!diff.ok) return diff;
    return {
        ...diff,
        abPair: true,
        versionA: {
            ...diff.versionA,
            tags: core.normalizeLibraryTags(pair.versionA.tags),
            note: pair.versionA.note || '',
        },
        versionB: {
            ...diff.versionB,
            tags: core.normalizeLibraryTags(pair.versionB.tags),
            note: pair.versionB.note || '',
        },
    };
}

/**
 * Export all versions matching tags for a media into destDir (Pro).
 * Default tags: 对照A + 对照B (对照组).
 */
function exportTaggedVersions(mediaId, destDir, {
    root = getWritableRoot(),
    tags = ['对照A', '对照B'],
    requirePro = true,
} = {}) {
    if (requirePro) {
        const gate = requireLibraryProOrDev();
        if (!gate.ok) {
            return {
                ok: false,
                error: gate.error || '导出对照组需解锁 Pro',
                code: gate.code || 'not_entitled',
                proRequired: true,
            };
        }
    }
    const catalog = loadCatalog(root);
    const media = catalog.media.find((m) => m.id === mediaId);
    if (!media) return { ok: false, error: '未找到该作品' };
    const outDir = path.resolve(String(destDir || ''));
    if (!outDir) return { ok: false, error: '缺少导出目录' };
    fs.mkdirSync(outDir, { recursive: true });

    const wantTags = core.normalizeLibraryTags(tags);
    if (!wantTags.length) return { ok: false, error: '未指定标签' };

    const tracks = catalog.tracks.filter((t) => t.mediaId === media.id);
    const files = [];
    const usedNames = new Set();

    for (const track of tracks) {
        const versions = catalog.versions
            .filter((v) => v.trackId === track.id)
            .filter((v) => {
                const vt = core.normalizeLibraryTags(v.tags);
                const note = String(v.note || '');
                return wantTags.some((t) => vt.includes(t) || note.includes(t));
            })
            .sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0));

        for (const chosen of versions) {
            const text = readVersionText(chosen, root);
            if (text == null) continue;
            const ext = path.extname(chosen.exportPath || '')
                || path.extname(chosen.contentRef || '')
                || '.srt';
            const roleTag = track.role === core.ROLE_SOURCE
                ? (track.lang || 'source')
                : track.role === core.ROLE_TARGET
                    ? (track.lang || 'zh')
                    : 'bilingual';
            const hitTags = core.normalizeLibraryTags(chosen.tags)
                .filter((t) => wantTags.includes(t));
            const tagPart = (hitTags[0] || wantTags[0] || 'tag').replace(/\s+/g, '');
            let fileName = safePackFileName(
                `${media.title || 'media'}.${roleTag}.${tagPart}${ext}`,
            );
            let n = 1;
            while (usedNames.has(fileName.toLowerCase())) {
                fileName = safePackFileName(
                    `${media.title || 'media'}.${roleTag}.${tagPart}.${n}${ext}`,
                );
                n += 1;
            }
            usedNames.add(fileName.toLowerCase());
            fs.writeFileSync(path.join(outDir, fileName), text, 'utf8');
            files.push({
                file: fileName,
                role: track.role,
                lang: track.lang || '',
                versionId: chosen.id,
                status: chosen.status,
                tags: core.normalizeLibraryTags(chosen.tags),
                note: chosen.note || '',
                recipe: chosen.recipe,
                recipeSummary: core.formatRecipeSummary(chosen.recipe),
            });
        }
    }

    if (!files.length) {
        return { ok: false, error: `没有带标签「${wantTags.join('/')}」的版本可导出` };
    }

    const manifest = {
        version: 1,
        kind: 'transub-subtitle-tag-export',
        exportedAt: core.nowIso(),
        tags: wantTags,
        media: {
            id: media.id,
            title: media.title,
            path: media.path,
        },
        files,
    };
    const manifestName = 'transub-tag-export-manifest.json';
    fs.writeFileSync(
        path.join(outDir, manifestName),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
    );

    return {
        ok: true,
        dir: outDir,
        files: files.map((f) => f.file),
        manifest: manifestName,
        count: files.length,
        tags: wantTags,
        caps: core.buildLibraryCaps(true),
    };
}

module.exports = {
    LIBRARY_DIR_NAME,
    getLibraryRoot,
    getCatalogPath,
    loadCatalog,
    saveCatalog,
    ingestBatchHistoryEntry,
    resolveSourceSubtitleForIngest,
    ingestEditedSubtitle,
    listMediaSummaries,
    getMediaDetail,
    renameMediaTitle,
    suggestMediaAssociation,
    setMediaAssociation,
    autoLinkMediaAssociation,
    autoLinkMediaBatch,
    setActiveVersion,
    openVersionPaths,
    previewVersion,
    loadVersionPlayback,
    diffVersions,
    diffAbPair,
    setVersionStatus,
    deleteVersion,
    deleteMedia,
    deleteMediaBatch,
    setVersionNote,
    setVersionAbTag,
    prepareLibraryMtTrainPair,
    resolveVersionFilePath,
    exportPublishPack,
    exportPublishPackBatch,
    exportTaggedVersions,
    listCorpusCandidates,
    exportCorpusJsonl,
    prepareLibraryRerun,
    getLibraryStatus,
    isLibraryProEntitled,
    storeBlobFromFile,
    readVersionText,
    core,
};
