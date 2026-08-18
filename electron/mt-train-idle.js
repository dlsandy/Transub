'use strict';

/**
 * Dev-only: when the machine is idle, start mt-train server and POST /api/idle/run.
 * Never auto-writes rules — only generates a morning report for human confirm.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { powerMonitor, Notification, app: electronApp } = require('electron');

const idleSchedule = require('../tools/mt-train/lib/idle-schedule');

const STATE_NAME = 'mt-train-idle-state.json';

/** @type {ReturnType<typeof setInterval>|null} */
let pollTimer = null;
/** @type {boolean} */
let running = false;
/** @type {object|null} */
let lastStatus = null;
/** @type {boolean} */
let unlockHookInstalled = false;

function isDevBuild(app = electronApp) {
    try {
        return !app.isPackaged;
    } catch (_) {
        return false;
    }
}

function statePath(app = electronApp) {
    try {
        const { getWritableRoot } = require('./app-paths');
        return path.join(getWritableRoot(), STATE_NAME);
    } catch (_) {
        return path.join(app.getPath('userData'), STATE_NAME);
    }
}

function readState(app = electronApp) {
    const defaults = {
        ...idleSchedule.defaultIdlePrefs(),
        lastRunAt: null,
        lastReportId: null,
        lastError: null,
        lastSkipReason: null,
    };
    try {
        const file = statePath(app);
        if (!fs.existsSync(file)) return defaults;
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { ...defaults, ...raw };
    } catch (_) {
        return defaults;
    }
}

function writeState(patch, app = electronApp) {
    const next = { ...readState(app), ...patch };
    const file = statePath(app);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
}

function httpJson(method, urlPath, body = null, { port = 8787, timeoutMs = 600000 } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: urlPath,
            method,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                ...(payload ? { 'Content-Length': payload.length } : {}),
            },
            timeout: timeoutMs,
        }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { raw += c; });
            res.on('end', () => {
                let data = {};
                try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { raw }; }
                if (res.statusCode >= 400) {
                    reject(new Error(data.error || `HTTP ${res.statusCode}`));
                    return;
                }
                resolve(data);
            });
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('idle train request timeout'));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function notifyReportReady(report) {
    try {
        if (!Notification.isSupported()) return;
        const n = new Notification({
            title: 'Sanitize 训练早报已就绪',
            body: `可直接写 ${report?.confidence?.auto ?? 0} · 建议改 ${report?.confidence?.review ?? 0}（未自动写入）`,
        });
        n.show();
    } catch (_) { /* ignore */ }
}

/**
 * @param {import('electron').App} app
 * @param {{ force?: boolean, label?: string }} [opts]
 */
async function runIdlePassNow(app, opts = {}) {
    if (!isDevBuild(app)) {
        return { ok: false, error: '仅开发模式' };
    }
    if (running) {
        return { ok: false, error: '早报任务进行中' };
    }
    const state = readState(app);
    if (!opts.force) {
        let idleSeconds = 0;
        try {
            idleSeconds = Number(powerMonitor.getSystemIdleTime?.()) || 0;
        } catch (_) { idleSeconds = 0; }
        const gate = idleSchedule.shouldRunIdlePass({
            ...state,
            idleSeconds,
            now: new Date(),
        });
        if (!gate.ok) {
            lastStatus = { at: new Date().toISOString(), skipped: true, reason: gate.reason };
            writeState({ lastSkipReason: gate.reason }, app);
            return { ok: false, skipped: true, reason: gate.reason };
        }
    }

    running = true;
    lastStatus = { at: new Date().toISOString(), running: true };
    try {
        const { ensureTrainServer, TRAIN_PORT } = require('./mt-train-window');
        const server = await ensureTrainServer();
        if (!server.ok) {
            writeState({ lastError: server.error || '训练台未就绪' }, app);
            return { ok: false, error: server.error || '训练台未就绪' };
        }
        const report = await httpJson('POST', '/api/idle/run', {
            maxTitles: state.maxTitles || 8,
            maxPerTitle: state.maxPerTitle || 8,
            label: opts.label || 'idle-auto',
        }, { port: TRAIN_PORT, timeoutMs: 900000 });

        writeState({
            lastRunAt: new Date().toISOString(),
            lastReportId: report.id || null,
            lastError: null,
            lastSkipReason: null,
        }, app);
        notifyReportReady(report);
        lastStatus = {
            at: new Date().toISOString(),
            ok: true,
            reportId: report.id,
            confidence: report.confidence || null,
        };
        return { ok: true, report };
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        writeState({ lastError: msg }, app);
        lastStatus = { at: new Date().toISOString(), ok: false, error: msg };
        return { ok: false, error: msg };
    } finally {
        running = false;
    }
}

function getIdleStatus(app = electronApp) {
    const state = readState(app);
    let idleSeconds = 0;
    try {
        idleSeconds = Number(powerMonitor.getSystemIdleTime?.()) || 0;
    } catch (_) { /* ignore */ }
    const gate = idleSchedule.shouldRunIdlePass({
        ...state,
        idleSeconds,
        now: new Date(),
    });
    return {
        ok: true,
        enabled: state.enabled !== false,
        prefs: {
            enabled: state.enabled !== false,
            idleMinutes: state.idleMinutes,
            maxTitles: state.maxTitles,
            maxPerTitle: state.maxPerTitle,
            nightOnly: !!state.nightOnly,
            nightStartHour: state.nightStartHour,
            nightEndHour: state.nightEndHour,
            minHoursBetween: state.minHoursBetween,
            pollMinutes: state.pollMinutes,
        },
        idleSeconds,
        lastRunAt: state.lastRunAt,
        lastReportId: state.lastReportId,
        lastError: state.lastError,
        lastSkipReason: state.lastSkipReason,
        gate,
        running,
        lastStatus,
    };
}

function setIdlePrefs(patch = {}, app = electronApp) {
    const allowed = [
        'enabled', 'idleMinutes', 'maxTitles', 'maxPerTitle',
        'nightOnly', 'nightStartHour', 'nightEndHour',
        'minHoursBetween', 'pollMinutes',
    ];
    const next = {};
    for (const k of allowed) {
        if (patch[k] != null) next[k] = patch[k];
    }
    if (next.idleMinutes != null) next.idleMinutes = Math.max(5, Math.min(120, Number(next.idleMinutes) || 15));
    if (next.pollMinutes != null) next.pollMinutes = Math.max(2, Math.min(30, Number(next.pollMinutes) || 5));
    if (next.maxTitles != null) next.maxTitles = Math.max(1, Math.min(24, Number(next.maxTitles) || 8));
    const state = writeState(next, app);
    restartIdleWatcher(app);
    return { ok: true, prefs: getIdleStatus(app).prefs, state };
}

async function tick(app) {
    if (!isDevBuild(app)) return;
    const state = readState(app);
    if (state.enabled === false) return;
    await runIdlePassNow(app, { force: false, label: 'idle-auto' });
}

function stopIdleWatcher() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function startIdleWatcher(app = electronApp) {
    if (!isDevBuild(app)) return { ok: false, error: '仅开发模式' };
    stopIdleWatcher();
    const state = readState(app);
    if (state.enabled === false) {
        return { ok: true, enabled: false };
    }
    const pollMs = Math.max(2, Number(state.pollMinutes) || 5) * 60 * 1000;
    pollTimer = setInterval(() => {
        tick(app).catch(() => {});
    }, pollMs);
    // First tick after short delay so startup is not blocked
    setTimeout(() => { tick(app).catch(() => {}); }, 45_000);
    if (!unlockHookInstalled) {
        unlockHookInstalled = true;
        try {
            powerMonitor.on('unlock-screen', () => {
                const st = readState(app);
                if (st.lastReportId && st.lastRunAt) {
                    const age = Date.now() - new Date(st.lastRunAt).getTime();
                    if (age >= 0 && age < 16 * 3600 * 1000) {
                        notifyReportReady({
                            confidence: lastStatus?.confidence || { auto: '?', review: '?' },
                        });
                    }
                }
            });
        } catch (_) { /* ignore */ }
    }
    return { ok: true, enabled: true, pollMinutes: state.pollMinutes || 5 };
}

function restartIdleWatcher(app = electronApp) {
    stopIdleWatcher();
    return startIdleWatcher(app);
}

module.exports = {
    isDevBuild,
    readState,
    writeState,
    getIdleStatus,
    setIdlePrefs,
    runIdlePassNow,
    startIdleWatcher,
    stopIdleWatcher,
    restartIdleWatcher,
};
