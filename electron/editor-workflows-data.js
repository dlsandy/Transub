const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const WORKFLOWS_FILE_NAME = 'transub-editor-workflows.json';

function workflowsCore() {
    return require('../src/js/subtitle-workflows-core');
}

function getWorkflowsFilePath() {
    return path.join(getWritableRoot(), WORKFLOWS_FILE_NAME);
}

function emptyWorkflows() {
    return workflowsCore().emptyWorkflowsDoc();
}

function readEditorWorkflows() {
    const filePath = getWorkflowsFilePath();
    const { ensureBuiltinWorkflows, emptyWorkflowsDoc } = workflowsCore();
    if (!fs.existsSync(filePath)) {
        return {
            ok: true,
            path: filePath,
            workflowsDoc: ensureBuiltinWorkflows(emptyWorkflowsDoc()),
            exists: false,
        };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
            ok: true,
            path: filePath,
            workflowsDoc: ensureBuiltinWorkflows(parsed),
            exists: true,
        };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: filePath };
    }
}

function writeEditorWorkflows(workflowsDoc) {
    const filePath = getWorkflowsFilePath();
    try {
        const { ensureBuiltinWorkflows, WORKFLOWS_VERSION } = workflowsCore();
        const payload = ensureBuiltinWorkflows({
            ...workflowsDoc,
            version: WORKFLOWS_VERSION,
            updatedAt: new Date().toISOString(),
        });
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        return { ok: true, path: filePath, workflowsDoc: payload };
    } catch (err) {
        return { ok: false, error: err.message || String(err), path: filePath };
    }
}

module.exports = {
    WORKFLOWS_FILE_NAME,
    getWorkflowsFilePath,
    emptyWorkflows,
    readEditorWorkflows,
    writeEditorWorkflows,
};
