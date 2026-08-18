'use strict';

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

describe('mt-train pro audience', () => {
    it('canOpenMtTrain reports structure', () => {
        const win = require('../electron/mt-train-window');
        assert.strictEqual(typeof win.canOpenMtTrain, 'function');
        assert.strictEqual(typeof win.isDevBuild, 'function');
        // Unpackaged test process: treat as not packaged → still need electron app mock.
        // Function should not throw when app missing packaging flag.
        const access = win.canOpenMtTrain({ isPackaged: false });
        assert.ok(access);
        assert.strictEqual(typeof access.ok, 'boolean');
    });

    it('health reports audience=pro when env set', async () => {
        const port = 8791;
        const root = path.resolve(__dirname, '..');
        const serverJs = path.join(root, 'tools', 'mt-train', 'server.js');
        const child = spawn(process.execPath, [serverJs, `--port=${port}`, '--force'], {
            cwd: root,
            env: {
                ...process.env,
                TRANSUB_MT_TRAIN_AUDIENCE: 'pro',
                MT_TRAIN_TARGET: 'sandbox',
                TRANSUB_MT_SANDBOX_ROOT: path.join(root, 'tmp', 'mt-pro-audience-test'),
            },
            stdio: 'ignore',
            windowsHide: true,
        });
        const cleanup = () => {
            try {
                if (process.platform === 'win32' && child.pid) {
                    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
                        stdio: 'ignore',
                        windowsHide: true,
                    });
                } else {
                    child.kill('SIGTERM');
                }
            } catch (_) { /* ignore */ }
        };
        try {
            let health = null;
            for (let i = 0; i < 40; i += 1) {
                health = await new Promise((resolve) => {
                    const req = http.get({
                        hostname: '127.0.0.1',
                        port,
                        path: '/api/health',
                        timeout: 500,
                    }, (res) => {
                        let raw = '';
                        res.setEncoding('utf8');
                        res.on('data', (c) => { raw += c; });
                        res.on('end', () => {
                            try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve(null); }
                        });
                    });
                    req.on('error', () => resolve(null));
                    req.on('timeout', () => { req.destroy(); resolve(null); });
                });
                if (health?.ok) break;
                await new Promise((r) => setTimeout(r, 200));
            }
            assert.ok(health?.ok, 'server health');
            assert.strictEqual(health.audience, 'pro');
            assert.strictEqual(health.features.forceSandbox, true);
            assert.strictEqual(health.features.shipGate, false);
            assert.strictEqual(health.features.proAudience, true);
        } finally {
            cleanup();
        }
    }, 20000);
});
