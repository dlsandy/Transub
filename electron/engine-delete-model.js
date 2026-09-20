/**
 * Delete engine Hub models and managed LLM GGUF files (filesystem + doc cleanup).
 */
const fs = require('fs');
const path = require('path');
const { getEngineModelsRoot } = require('./engine-download-info');

const SHIPPED_MODEL_IDS = new Set(['whisper-tiny', 'fsmn-vad', 'firered-vad']);
const DEMUCS_MODEL_ID = 'demucs';

function uniqueIds(ids) {
    const seen = new Set();
    const out = [];
    for (const raw of ids || []) {
        const id = String(raw || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

function isManagedLlmModelId(modelId) {
    const id = String(modelId || '').trim();
    if (!id) return false;
    try {
        const sakura = require('../src/js/sakura-mt-catalog-core');
        if (sakura.isSakuraMtModel?.(id) || sakura.findCatalogEntry?.(id)) return true;
    } catch (_) { /* ignore */ }
    try {
        const managed = require('../src/js/advanced-managed-llm-catalog-core');
        if (managed.findCatalogEntry?.(id)) return true;
    } catch (_) { /* ignore */ }
    return false;
}

function canDeletePickItem(item = {}, deps = {}) {
    const id = String(item.id || '').trim();
    const demucsId = String(deps.demucsModelId || DEMUCS_MODEL_ID);
    if (!id) return { ok: false, reason: '未知模型' };
    if (id === demucsId) {
        return { ok: false, reason: 'Demucs 为 pip 组件，不能在此删除' };
    }
    if (SHIPPED_MODEL_IDS.has(id) || item.shipped) {
        return { ok: false, reason: '内置模型不可删除' };
    }
    if (!item.installed && !item.incomplete) {
        return { ok: false, reason: '模型未下载' };
    }
    return { ok: true };
}

function resolveEngineModelDir(modelId, row = {}, modelsRoot = '') {
    const id = String(modelId || '').trim();
    const kindRaw = String(row.kind || row.group || 'asr').toLowerCase();
    const kind = kindRaw === 'separate' ? 'asr' : (kindRaw === 'llm' ? 'mt' : kindRaw);
    const localDirname = String(
        row.local_dirname || row.localDirname || row.local_dir || id,
    ).trim();
    const root = String(modelsRoot || '').trim();
    if (!root || !localDirname || !kind) return '';
    return path.join(path.resolve(root), kind, localDirname);
}

function assertUnderModelsRoot(targetPath, modelsRoot) {
    const resolved = path.resolve(String(targetPath || ''));
    const root = path.resolve(String(modelsRoot || ''));
    if (!resolved || !root) throw new Error('invalid model path');
    const rel = path.relative(root, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('refusing to delete outside models directory');
    }
    return resolved;
}

function deleteEngineModelDirectory(modelId, row = {}, modelsRoot = '') {
    const id = String(modelId || '').trim();
    if (!id) return { ok: false, error: '未指定模型', id };
    if (SHIPPED_MODEL_IDS.has(id)) {
        return { ok: false, error: '内置模型不可删除', id, code: 'shipped' };
    }
    const root = getEngineModelsRoot(modelsRoot);
    const dir = resolveEngineModelDir(id, row, root);
    if (!dir) return { ok: false, error: '无法解析模型目录', id };
    let target;
    try {
        target = assertUnderModelsRoot(dir, root);
    } catch (err) {
        return { ok: false, error: err.message || String(err), id };
    }
    if (!fs.existsSync(target)) {
        return { ok: true, id, removed: false, missing: true, path: target };
    }
    try {
        fs.rmSync(target, { recursive: true, force: true });
        return { ok: true, id, removed: true, path: target };
    } catch (err) {
        return { ok: false, error: err.message || String(err), id, path: target };
    }
}

function deleteEngineModelsFilesystem(modelIds, options = {}, rowsById = {}) {
    const ids = uniqueIds(modelIds);
    const modelsRoot = getEngineModelsRoot(options.engineInstallPath);
    const deleted = [];
    const skipped = [];
    const failed = [];
    for (const id of ids) {
        if (isManagedLlmModelId(id)) {
            skipped.push({ id, reason: 'managed' });
            continue;
        }
        if (id === DEMUCS_MODEL_ID) {
            skipped.push({ id, reason: 'demucs' });
            continue;
        }
        const row = rowsById[id] || { id };
        const res = deleteEngineModelDirectory(id, row, modelsRoot);
        if (res.ok && res.removed) deleted.push(id);
        else if (res.ok && res.missing) skipped.push({ id, reason: 'not_installed' });
        else failed.push({ id, error: res.error || 'delete failed' });
    }
    return { ok: !failed.length, deleted, skipped, failed, modelsRoot };
}

function deleteManagedModelFile(modelId) {
    const id = String(modelId || '').trim();
    if (!id) return { ok: false, error: '未指定模型', id };
    const llmFs = require('./advanced-llm-fs');
    const llamaServer = require('./advanced-llama-server');
    const entry = llmFs.resolveModelEntry(id);
    if (!entry) return { ok: false, error: '未知模型', id, code: 'unknown_model' };

    llamaServer.stopLlamaServer();
    const del = llmFs.deleteModelFile(entry);
    if (!del.ok) return { ...del, id: entry.id };

    try {
        const { readAdvancedDoc, writeAdvancedDoc } = require('./advanced-license-data');
        const entitlement = require('../src/js/advanced-entitlement-core');
        const current = readAdvancedDoc();
        const doc = current?.doc || {};
        const managed = entitlement.normalizeManagedLlm(doc.managedLlm);
        const pulledIds = (managed.pulledIds || []).filter((x) => x !== entry.id);
        const patch = { ...managed, pulledIds };
        if (managed.activeModelId === entry.id) patch.activeModelId = '';
        if (managed.smartTranslateModelId === entry.id) patch.smartTranslateModelId = '';
        writeAdvancedDoc({ ...doc, managedLlm: patch });
    } catch (_) { /* ignore doc update errors — file already removed */ }

    try {
        const { broadcastManagedModelChanged } = require('./advanced-llm-pick-window');
        broadcastManagedModelChanged({
            deletedModelId: entry.id,
            activeModelId: '',
            smartTranslateModelId: '',
        });
    } catch (_) { /* optional broadcast */ }

    return {
        ok: true,
        id: entry.id,
        removed: !!del.removed,
        missing: !!del.missing,
        path: del.path || '',
    };
}

async function deleteModelsBatch(modelIds, options = {}, deps = {}) {
    const ids = uniqueIds(modelIds);
    if (!ids.length) return { ok: false, error: '未指定模型' };

    const deleted = [];
    const skipped = [];
    const failed = [];
    const rowsById = deps.rowsById && typeof deps.rowsById === 'object' ? deps.rowsById : {};

    const managedIds = ids.filter((id) => isManagedLlmModelId(id));
    const engineIds = ids.filter((id) => !managedIds.includes(id));

    for (const id of managedIds) {
        const res = deleteManagedModelFile(id);
        if (res.ok && (res.removed || res.missing)) {
            if (res.removed) deleted.push(id);
            else skipped.push({ id, reason: 'not_installed' });
        } else {
            failed.push({ id, error: res.error || 'delete failed' });
        }
    }

    if (engineIds.length) {
        if (typeof deps.deleteViaEngine === 'function') {
            const apiRes = await deps.deleteViaEngine(engineIds);
            if (apiRes?.deleted?.length) deleted.push(...apiRes.deleted);
            if (apiRes?.skipped?.length) skipped.push(...apiRes.skipped);
            if (apiRes?.failed?.length) failed.push(...apiRes.failed);
            if (apiRes?.ok === false && !apiRes?.deleted?.length && !apiRes?.skipped?.length) {
                const fsRes = deleteEngineModelsFilesystem(engineIds, options, rowsById);
                deleted.push(...(fsRes.deleted || []));
                skipped.push(...(fsRes.skipped || []));
                failed.push(...(fsRes.failed || []));
            }
        } else {
            const fsRes = deleteEngineModelsFilesystem(engineIds, options, rowsById);
            deleted.push(...(fsRes.deleted || []));
            skipped.push(...(fsRes.skipped || []));
            failed.push(...(fsRes.failed || []));
        }
    }

    const ok = failed.length === 0 && (deleted.length > 0 || skipped.length > 0);
    const message = deleted.length
        ? `已删除 ${deleted.length} 个模型`
        : (failed.length
            ? failed.map((f) => f.error || f.id).join('；')
            : '没有可删除的模型');
    return { ok, deleted, skipped, failed, message };
}

module.exports = {
    SHIPPED_MODEL_IDS,
    DEMUCS_MODEL_ID,
    uniqueIds,
    isManagedLlmModelId,
    canDeletePickItem,
    resolveEngineModelDir,
    deleteEngineModelDirectory,
    deleteEngineModelsFilesystem,
    deleteManagedModelFile,
    deleteModelsBatch,
};
