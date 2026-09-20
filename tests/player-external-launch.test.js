const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
    PLAYER_DOWNLOAD_URL,
    resolveExternalPlayerExe,
} = require('../electron/player-external-launch');

describe('player-external-launch', () => {
    it('exposes official download URL', () => {
        assert.strictEqual(PLAYER_DOWNLOAD_URL, 'https://www.transub.cc/en/#download');
    });

    it('resolveExternalPlayerExe finds configured path', () => {
        const tmp = path.join(os.tmpdir(), `transub-player-fake-${process.pid}.exe`);
        fs.writeFileSync(tmp, 'MZ');
        try {
            const r = resolveExternalPlayerExe({
                playerPath: tmp,
                env: {},
                getAppRoot: () => os.tmpdir(),
                execPath: path.join(os.tmpdir(), 'transub.exe'),
            });
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.source, 'settings');
        } finally {
            try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
        }
    });

    it('resolveExternalPlayerExe finds Program Files install', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-player-cand-'));
        const pf = path.join(root, 'ProgramFiles');
        const dir = path.join(pf, 'Transub Player');
        fs.mkdirSync(dir, { recursive: true });
        const exe = path.join(dir, 'TransubPlayer.exe');
        fs.writeFileSync(exe, 'MZ');
        try {
            const r = resolveExternalPlayerExe({
                env: { ProgramFiles: pf, LOCALAPPDATA: path.join(root, 'empty-local') },
                execPath: path.join(root, 'app', 'Transub.exe'),
                getAppRoot: () => path.join(root, 'app'),
            });
            assert.strictEqual(r.ok, true);
            assert.ok(r.path.toLowerCase().endsWith('transubplayer.exe'));
            assert.strictEqual(r.source, 'program-files');
        } finally {
            try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* ignore */ }
        }
    });

    it('resolveExternalPlayerExe returns not found cleanly', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-player-miss-'));
        try {
            const r = resolveExternalPlayerExe({
                env: { ProgramFiles: root, LOCALAPPDATA: root },
                execPath: path.join(root, 'Transub.exe'),
                getAppRoot: () => root,
            });
            assert.strictEqual(r.ok, false);
            assert.ok(/未找到/.test(r.error || ''));
        } finally {
            try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* ignore */ }
        }
    });
});

