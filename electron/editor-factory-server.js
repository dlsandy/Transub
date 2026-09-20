/**
 * Loopback HTTP Factory for Transub Editor + Desktop (C# D1).
 * Binds 127.0.0.1 only; writes %AppData%/Transub/factory.json.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildHealthSnapshot } = require('./editor-factory-entitlement');
const factoryHandlers = require('./editor-factory-handlers');

/** @type {import('http').Server | null} */
let server = null;
/** @type {string | null} */
let token = null;
/** @type {number | null} */
let port = null;
/** @type {string | null} */
let factoryJsonPath = null;
/** @type {Map<string, { kind: string, since: number, lockToken?: string }>} */
const editorJobs = new Map();

function defaultFactoryJsonPath() {
    try {
        const { app } = require('electron');
        return path.join(app.getPath('appData'), 'Transub', 'factory.json');
    } catch (_) {
        return path.join(
            process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming'),
            'Transub',
            'factory.json',
        );
    }
}

function json(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Cache-Control': 'no-store',
    });
    res.end(payload);
}

function readBody(req, limit = 2 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (c) => {
            size += c.length;
            if (size > limit) {
                reject(Object.assign(new Error('body too large'), { code: 'payload_too_large' }));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) return resolve({});
            try {
                resolve(JSON.parse(raw));
            } catch (err) {
                reject(Object.assign(new Error('invalid json'), { code: 'invalid_json', cause: err }));
            }
        });
        req.on('error', reject);
    });
}

function checkAuth(req) {
    const h = String(req.headers.authorization || '');
    const m = /^Bearer\s+(.+)$/i.exec(h);
    const got = m ? m[1].trim() : '';
    return !!(token && got && got === token);
}

function getLiveEntitlementDeps() {
    return {
        isDevUnlock: () => {
            try {
                return !!require('./advanced-gates').isDevUnlockEnabled();
            } catch (_) {
                return false;
            }
        },
        getEntitlementEval: () => {
            const entitlement = require('../src/js/advanced-entitlement-core');
            const { readAdvancedDoc } = require('./advanced-license-data');
            const { getAdvancedDeviceId } = require('./advanced-device-id');
            const current = readAdvancedDoc();
            return entitlement.evaluateEntitlement(current.doc.license, getAdvancedDeviceId(), {
                requireOnlineFresh: false,
            });
        },
    };
}

function computeBusy() {
    try {
        return require('./compute-task-lock').getStatus();
    } catch (_) {
        return { busy: false };
    }
}

function buildHealth() {
    const snap = buildHealthSnapshot(getLiveEntitlementDeps());
    const lock = computeBusy();
    snap.busy = !!lock.busy;
    if (lock.busy) {
        snap.busyHolder = {
            kind: lock.kind || null,
            owner: lock.owner || null,
            source: lock.source || null,
            label: lock.label || null,
        };
    }
    return snap;
}

async function handleRequest(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const method = String(req.method || 'GET').toUpperCase();
    const p = url.pathname.replace(/\/+$/, '') || '/';

    if (method === 'GET' && (p === '/editor/v1/health' || p === '/editor/v1/entitlement')) {
        // health is discoverable; still require bearer once token is known to Editor
        if (!checkAuth(req)) {
            return json(res, 401, { ok: false, code: 'unauthorized', error: 'invalid token' });
        }
        const health = buildHealth();
        if (p.endsWith('/entitlement')) {
            return json(res, 200, health.entitlement || { pro: false });
        }
        return json(res, 200, health);
    }

    if (method === 'GET' && p === '/editor/v1/events') {
        if (!checkAuth(req)) {
            return json(res, 401, { ok: false, code: 'unauthorized', error: 'invalid token' });
        }
        const requestId = String(url.searchParams.get('requestId') || '').trim();
        if (!requestId) {
            return json(res, 400, { ok: false, code: 'bad_request', error: '缺少 requestId' });
        }
        const progress = require('./editor-factory-progress');
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, requestId })}\n\n`);
        const unsub = progress.subscribe(requestId, (evt) => {
            try {
                res.write(`event: progress\ndata: ${JSON.stringify(evt)}\n\n`);
            } catch (_) { /* ignore */ }
        });
        const keepAlive = setInterval(() => {
            try { res.write(': keepalive\n\n'); } catch (_) { /* ignore */ }
        }, 15000);
        const cleanup = () => {
            clearInterval(keepAlive);
            unsub();
        };
        req.on('close', cleanup);
        req.on('error', cleanup);
        return;
    }

    if (!checkAuth(req)) {
        return json(res, 401, { ok: false, code: 'unauthorized', error: 'invalid token' });
    }

    if (method === 'POST' && p === '/editor/v1/abort') {
        const body = await readBody(req).catch((err) => ({ __error: err }));
        if (body.__error) return json(res, 400, { ok: false, code: body.__error.code || 'bad_request', error: body.__error.message });
        const requestId = String(body.requestId || '').trim();
        if (requestId && editorJobs.has(requestId)) {
            editorJobs.delete(requestId);
        }
        try {
            require('./editor-factory-batch').noteFactoryBatchAborted();
        } catch (_) { /* ignore */ }
        try {
            require('./editor-factory-models').noteFactoryDownloadAborted();
        } catch (_) { /* ignore */ }
        const aborted = factoryHandlers.abortFactoryJobs();
        return json(res, 200, { ...aborted, requestId: requestId || null });
    }

    if (method === 'GET' && p === '/editor/v1/options') {
        const snap = require('./editor-factory-batch').getFactoryOptionsSnapshot();
        return json(res, snap.ok ? 200 : 500, snap);
    }

    if (method === 'PUT' || method === 'PATCH') {
        if (p === '/editor/v1/options') {
            const body = await readBody(req, 4 * 1024 * 1024).catch((err) => ({ __error: err }));
            if (body.__error) {
                return json(res, 400, {
                    ok: false,
                    code: body.__error.code || 'bad_request',
                    error: body.__error.message,
                });
            }
            const result = await require('./editor-factory-batch').saveFactoryOptions(body, {
                replace: method === 'PUT' || !!body.replace,
            });
            return json(res, result.httpStatus || 500, result.body || { ok: false });
        }
    }

    if (method === 'GET' && p === '/editor/v1/models') {
        const result = await require('./editor-factory-models').listFactoryModels({});
        return json(res, result.httpStatus || 500, result.body || { ok: false });
    }

    if (method === 'POST' && p === '/editor/v1/models') {
        // Allow POST with optional filter body (same as GET list).
        const body = await readBody(req).catch((err) => ({ __error: err }));
        if (body.__error) {
            return json(res, 400, {
                ok: false,
                code: body.__error.code || 'bad_request',
                error: body.__error.message,
            });
        }
        const result = await require('./editor-factory-models').listFactoryModels(body);
        return json(res, result.httpStatus || 500, result.body || { ok: false });
    }

    if (method === 'GET' && p === '/editor/v1/models/download/status') {
        const requestId = String(url.searchParams.get('requestId') || '').trim();
        const status = require('./editor-factory-models').getFactoryDownloadStatus(requestId);
        return json(res, 200, status);
    }

    if (method === 'POST' && p === '/editor/v1/models/download') {
        const body = await readBody(req).catch((err) => ({ __error: err }));
        if (body.__error) {
            return json(res, 400, {
                ok: false,
                code: body.__error.code || 'bad_request',
                error: body.__error.message,
            });
        }
        const result = await require('./editor-factory-models').startFactoryModelDownload(body);
        const requestId = result?.body?.requestId;
        if (requestId && result.httpStatus === 202) {
            editorJobs.set(requestId, { kind: 'models-download', since: Date.now() });
        }
        return json(res, result.httpStatus || 500, result.body || { ok: false });
    }

    if (method === 'GET' && p === '/editor/v1/batch/status') {
        const requestId = String(url.searchParams.get('requestId') || '').trim();
        const status = require('./editor-factory-batch').getFactoryBatchStatus(requestId);
        return json(res, 200, status);
    }

    if (method === 'POST' && p === '/editor/v1/batch') {
        const body = await readBody(req, 4 * 1024 * 1024).catch((err) => ({ __error: err }));
        if (body.__error) {
            return json(res, 400, {
                ok: false,
                code: body.__error.code || 'bad_request',
                error: body.__error.message,
            });
        }
        const result = await require('./editor-factory-batch').startFactoryBatch(body);
        const requestId = result?.body?.requestId;
        if (requestId && result.httpStatus === 202) {
            editorJobs.set(requestId, { kind: 'batch', since: Date.now() });
        }
        return json(res, result.httpStatus || 500, result.body || { ok: false, code: 'error' });
    }

    if (method === 'POST' && (p === '/editor/v1/transcribe-range' || p === '/editor/v1/translate-cues')) {
        const body = await readBody(req).catch((err) => ({ __error: err }));
        if (body.__error) return json(res, 400, { ok: false, code: body.__error.code || 'bad_request', error: body.__error.message });

        const lock = computeBusy();
        if (lock.busy) {
            return json(res, 409, {
                ok: false,
                code: 'busy',
                error: lock.label
                    ? `已有${lock.label}正在运行，请稍后再试`
                    : '计算任务繁忙',
                holder: {
                    kind: lock.kind || null,
                    owner: lock.owner || null,
                    source: lock.source || null,
                    label: lock.label || null,
                },
            });
        }

        const health = buildHealth();
        const ent = health.entitlement || { pro: false, features: [] };
        const wantSmart = !!(body.smartTranslate || body.mode === 'smart' || body.feature === 'smartTranslate' || body.preferSmart);
        if (p.endsWith('translate-cues') && wantSmart) {
            const okFeat = ent.pro && (
                (ent.features || []).includes('smartTranslate')
                || (ent.features || []).includes('contextReconstruct')
                || (ent.features || []).includes('*')
            );
            if (!okFeat) {
                return json(res, 403, {
                    ok: false,
                    code: 'unauthorized',
                    error: '智能翻译需在 Transub 设置 → Pro 激活（与 Editor 共用许可）',
                    entitlement: ent,
                });
            }
        }

        const requestId = String(body.requestId || '').trim() || require('crypto').randomUUID();
        editorJobs.set(requestId, { kind: p.endsWith('translate-cues') ? 'translate' : 'transcribe', since: Date.now() });
        try {
            const result = p.endsWith('translate-cues')
                ? await factoryHandlers.handleTranslateCues({ ...body, requestId })
                : await factoryHandlers.handleTranscribeRange({ ...body, requestId });
            return json(res, result.httpStatus || 500, result.body || { ok: false, code: 'error' });
        } finally {
            editorJobs.delete(requestId);
            try { require('./editor-factory-progress').close(requestId); } catch (_) { /* ignore */ }
        }
    }

    if (method === 'POST' && (
        p === '/editor/v1/convert-chinese'
        || p === '/editor/v1/compact-repetition'
        || p === '/editor/v1/qc-report'
        || p === '/editor/v1/qc-fix'
    )) {
        const body = await readBody(req, 16 * 1024 * 1024).catch((err) => ({ __error: err }));
        if (body.__error) {
            return json(res, 400, {
                ok: false,
                code: body.__error.code || 'bad_request',
                error: body.__error.message,
            });
        }
        const requestId = String(body.requestId || '').trim() || require('crypto').randomUUID();
        editorJobs.set(requestId, { kind: path.basename(p), since: Date.now() });
        try {
            let result;
            if (p.endsWith('convert-chinese')) {
                result = await factoryHandlers.handleConvertChinese({ ...body, requestId });
            } else if (p.endsWith('compact-repetition')) {
                result = await factoryHandlers.handleCompactRepetition({ ...body, requestId });
            } else if (p.endsWith('qc-report')) {
                result = await factoryHandlers.handleQcReport({ ...body, requestId });
            } else {
                result = await factoryHandlers.handleQcFix({ ...body, requestId });
            }
            return json(res, result.httpStatus || 500, result.body || { ok: false, code: 'error' });
        } finally {
            editorJobs.delete(requestId);
            try { require('./editor-factory-progress').close(requestId); } catch (_) { /* ignore */ }
        }
    }

    if (method === 'POST' && p.startsWith('/editor/v1/pro/')) {
        const action = p.slice('/editor/v1/pro/'.length);
        const featureByAction = {
            'context-reconstruct': 'contextReconstruct',
            'film-context-reconstruct': 'filmContextReconstruct',
            'qc-smart-fix': 'qcSmartFix',
        };
        const featureId = featureByAction[action];
        if (!featureId) {
            return json(res, 404, {
                ok: false,
                code: 'not_found',
                error: `未知 Pro 路由: ${action}`,
            });
        }

        const health = buildHealth();
        const ent = health.entitlement || { pro: false, features: [] };
        if (!ent.pro) {
            return json(res, 403, {
                ok: false,
                code: 'unauthorized',
                error: 'Pro 功能需在 Transub 设置 → Pro 激活（与 Editor 共用许可）',
                entitlement: ent,
                feature: featureId,
            });
        }
        const features = Array.isArray(ent.features) ? ent.features : [];
        if (
            features.length > 0
            && !features.includes('*')
            && !features.includes(featureId)
        ) {
            return json(res, 403, {
                ok: false,
                code: 'unauthorized',
                error: `当前许可未包含功能：${featureId}`,
                entitlement: ent,
                feature: featureId,
            });
        }

        const body = await readBody(req, 16 * 1024 * 1024).catch((err) => ({ __error: err }));
        if (body.__error) {
            return json(res, 400, {
                ok: false,
                code: body.__error.code || 'bad_request',
                error: body.__error.message,
            });
        }

        const lock = computeBusy();
        if (lock.busy) {
            return json(res, 409, {
                ok: false,
                code: 'busy',
                error: lock.label
                    ? `已有${lock.label}正在运行，请稍后再试`
                    : '计算任务繁忙',
                holder: {
                    kind: lock.kind || null,
                    owner: lock.owner || null,
                    source: lock.source || null,
                    label: lock.label || null,
                },
            });
        }

        const requestId = String(body.requestId || '').trim() || require('crypto').randomUUID();
        editorJobs.set(requestId, { kind: `pro/${action}`, since: Date.now() });
        try {
            const result = await factoryHandlers.handleProAction(action, { ...body, requestId });
            return json(res, result.httpStatus || 500, result.body || { ok: false, code: 'error' });
        } finally {
            editorJobs.delete(requestId);
            try { require('./editor-factory-progress').close(requestId); } catch (_) { /* ignore */ }
        }
    }

    return json(res, 404, { ok: false, code: 'not_found', error: 'unknown route' });
}

function writeFactoryJson(filePath, baseUrl, bearer) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
        schemaVersion: 1,
        baseUrl,
        token: bearer,
        pid: process.pid,
        updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8' });
    try {
        fs.chmodSync(filePath, 0o600);
    } catch (_) { /* windows may ignore */ }
}

function clearFactoryJson(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) { /* ignore */ }
}

/**
 * @returns {Promise<{ ok: boolean, baseUrl?: string, token?: string, port?: number, error?: string }>}
 */
function startEditorFactoryServer(options = {}) {
    if (server) {
        return Promise.resolve({
            ok: true,
            baseUrl: `http://127.0.0.1:${port}`,
            token,
            port,
            already: true,
        });
    }

    token = crypto.randomBytes(24).toString('hex');
    factoryJsonPath = options.factoryJsonPath || defaultFactoryJsonPath();

    return new Promise((resolve) => {
        server = http.createServer((req, res) => {
            handleRequest(req, res).catch((err) => {
                json(res, 500, { ok: false, code: 'internal', error: err.message || String(err) });
            });
        });
        server.on('error', (err) => {
            server = null;
            resolve({ ok: false, error: err.message || String(err) });
        });
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            port = addr && typeof addr === 'object' ? addr.port : null;
            const baseUrl = `http://127.0.0.1:${port}`;
            try {
                writeFactoryJson(factoryJsonPath, baseUrl, token);
            } catch (err) {
                try { server.close(); } catch (_) { /* ignore */ }
                server = null;
                return resolve({ ok: false, error: `write factory.json failed: ${err.message}` });
            }
            resolve({ ok: true, baseUrl, token, port, factoryJsonPath });
        });
    });
}

function stopEditorFactoryServer() {
    const file = factoryJsonPath;
    return new Promise((resolve) => {
        const done = () => {
            clearFactoryJson(file);
            token = null;
            port = null;
            factoryJsonPath = null;
            editorJobs.clear();
            resolve({ ok: true });
        };
        if (!server) return done();
        const s = server;
        server = null;
        try {
            s.close(() => done());
        } catch (_) {
            done();
        }
    });
}

function getEditorFactoryStatus() {
    if (!server || !port) return { running: false };
    return {
        running: true,
        baseUrl: `http://127.0.0.1:${port}`,
        port,
        factoryJsonPath,
    };
}

module.exports = {
    startEditorFactoryServer,
    stopEditorFactoryServer,
    getEditorFactoryStatus,
    /** @private tests */
    _test: {
        handleRequest,
        buildHealth,
        checkAuth: (req) => checkAuth(req),
        setToken: (t) => { token = t; },
        writeFactoryJson,
        clearFactoryJson,
    },
};
