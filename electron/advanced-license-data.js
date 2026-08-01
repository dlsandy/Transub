const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const ADVANCED_FILE_NAME = 'transub-advanced.json';

function entitlementCore() {
    return require('../src/js/advanced-entitlement-core');
}

function runtimePreferHints() {
    try {
        return require('./advanced-runtime-prefer').getHints();
    } catch (_) {
        return {};
    }
}

function getAdvancedFilePath() {
    return path.join(getWritableRoot(), ADVANCED_FILE_NAME);
}

function readAdvancedDoc() {
    const filePath = getAdvancedFilePath();
    const { emptyAdvancedDoc, normalizeAdvancedDoc } = entitlementCore();
    const hints = runtimePreferHints();
    if (!fs.existsSync(filePath)) {
        return {
            ok: true,
            path: filePath,
            doc: normalizeAdvancedDoc(emptyAdvancedDoc(), hints),
            exists: false,
        };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
            ok: true,
            path: filePath,
            doc: normalizeAdvancedDoc(parsed, hints),
            exists: true,
        };
    } catch (err) {
        return {
            ok: false,
            error: err.message || String(err),
            path: filePath,
            doc: normalizeAdvancedDoc(emptyAdvancedDoc(), hints),
        };
    }
}

function writeAdvancedDoc(doc) {
    const filePath = getAdvancedFilePath();
    const { normalizeAdvancedDoc, ADVANCED_DOC_VERSION } = entitlementCore();
    try {
        const payload = normalizeAdvancedDoc({
            ...doc,
            version: ADVANCED_DOC_VERSION,
            updatedAt: new Date().toISOString(),
        }, runtimePreferHints());
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        return { ok: true, path: filePath, doc: payload };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: filePath };
    }
}

function patchAdvancedDoc(patch) {
    const current = readAdvancedDoc();
    if (!current.ok && current.exists !== false && current.error) {
        return current;
    }
    const p = patch && typeof patch === 'object' ? patch : {};
    const next = {
        ...current.doc,
        ...p,
        license: p.license != null
            ? { ...current.doc.license, ...p.license }
            : current.doc.license,
        byok: p.byok != null
            ? { ...current.doc.byok, ...p.byok }
            : current.doc.byok,
        managedLlm: p.managedLlm != null
            ? { ...current.doc.managedLlm, ...p.managedLlm }
            : current.doc.managedLlm,
        llmSource: Object.prototype.hasOwnProperty.call(p, 'llmSource')
            ? p.llmSource
            : current.doc.llmSource,
        byokKeyBlob: Object.prototype.hasOwnProperty.call(p, 'byokKeyBlob')
            ? String(p.byokKeyBlob || '')
            : current.doc.byokKeyBlob,
    };
    return writeAdvancedDoc(next);
}

module.exports = {
    ADVANCED_FILE_NAME,
    getAdvancedFilePath,
    readAdvancedDoc,
    writeAdvancedDoc,
    patchAdvancedDoc,
};
