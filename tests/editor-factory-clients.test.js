/**
 * Unit tests for shared engine client registry (no HTTP).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const clients = require('../electron/editor-factory-clients');

describe('editor-factory-clients', () => {
    let tmp;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-clients-'));
        const file = path.join(tmp, 'engine-clients.json');
        clients.initFactoryClients({
            clientsPath: file,
            hostKind: 'daemon',
            onIdleShutdown: () => { /* no-op */ },
        });
    });

    afterEach(() => {
        clients.disposeFactoryClients();
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    });

    it('registers and heartbeats editor client', () => {
        const r = clients.registerClient({ kind: 'editor', pid: process.pid, id: 'editor-test' });
        assert.strictEqual(r.ok, true);
        const hb = clients.heartbeatClient({ id: 'editor-test' });
        assert.strictEqual(hb.ok, true);
        const snap = clients.snapshot();
        assert.ok(snap.clients.some((c) => c.id === 'editor-test'));
        assert.strictEqual(snap.host.kind, 'daemon');
    });

    it('unregister last client on daemon triggers idle shutdown', async () => {
        let idle = false;
        clients.disposeFactoryClients();
        const file = path.join(tmp, 'engine-clients.json');
        clients.initFactoryClients({
            clientsPath: file,
            hostKind: 'daemon',
            onIdleShutdown: () => { idle = true; },
        });
        clients.registerClient({ kind: 'editor', pid: process.pid, id: 'editor-only' });
        const u = clients.unregisterClient({ id: 'editor-only' });
        assert.strictEqual(u.ok, true);
        assert.strictEqual(u.shuttingDown, true);
        await new Promise((r) => setImmediate(r));
        assert.strictEqual(idle, true);
    });

    it('unregister does not quit gui host when empty', () => {
        clients.disposeFactoryClients();
        const file = path.join(tmp, 'engine-clients2.json');
        let idle = false;
        clients.initFactoryClients({
            clientsPath: file,
            hostKind: 'gui',
            onIdleShutdown: () => { idle = true; },
        });
        clients.registerClient({ kind: 'editor', pid: process.pid, id: 'e1' });
        const u = clients.unregisterClient({ id: 'e1' });
        assert.strictEqual(u.shuttingDown, false);
        assert.strictEqual(idle, false);
    });
});
