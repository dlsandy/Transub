const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const settingsData = require('../electron/settings-data');
const {
    resolveDialogDefaultPath,
    directoryFromPickedPath,
    rememberOpenPath,
    isRememberEnabled,
} = require('../electron/last-open-dir');

describe('last-open-dir', () => {
    let tmpRoot;
    const getAppRoot = () => tmpRoot;
    let origLoad;
    let origSave;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-last-open-'));
        origLoad = settingsData.loadSettings;
        origSave = settingsData.saveSettings;
    });

    afterEach(() => {
        settingsData.loadSettings = origLoad;
        settingsData.saveSettings = origSave;
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    it('isRememberEnabled defaults to true', () => {
        assert.strictEqual(isRememberEnabled({}), true);
        assert.strictEqual(isRememberEnabled({ rememberLastOpenDir: true }), true);
        assert.strictEqual(isRememberEnabled({ rememberLastOpenDir: false }), false);
    });

    it('directoryFromPickedPath returns parent for files', () => {
        const file = path.join(tmpRoot, 'clip.mp4');
        fs.writeFileSync(file, 'x');
        assert.strictEqual(directoryFromPickedPath(file), tmpRoot);
        assert.strictEqual(directoryFromPickedPath(tmpRoot), tmpRoot);
    });

    it('resolveDialogDefaultPath prefers explicit hint', () => {
        const nested = path.join(tmpRoot, 'media');
        fs.mkdirSync(nested);
        const file = path.join(nested, 'a.mp4');
        fs.writeFileSync(file, 'x');

        settingsData.loadSettings = () => ({
            options: { rememberLastOpenDir: true, lastOpenDir: tmpRoot },
        });
        settingsData.saveSettings = () => {};

        assert.strictEqual(resolveDialogDefaultPath(getAppRoot, file), nested);
        assert.strictEqual(resolveDialogDefaultPath(getAppRoot, ''), tmpRoot);
        settingsData.loadSettings = () => ({
            options: { rememberLastOpenDir: false, lastOpenDir: tmpRoot },
        });
        assert.strictEqual(resolveDialogDefaultPath(getAppRoot, ''), undefined);
    });

    it('rememberOpenPath writes lastOpenDir when enabled', () => {
        const file = path.join(tmpRoot, 'b.srt');
        fs.writeFileSync(file, 'x');
        let stored = { rememberLastOpenDir: true, lastOpenDir: '' };
        settingsData.loadSettings = () => ({ options: { ...stored } });
        settingsData.saveSettings = (_root, options) => {
            stored = { ...options };
        };

        const dir = rememberOpenPath(getAppRoot, file);
        assert.strictEqual(dir, tmpRoot);
        assert.strictEqual(stored.lastOpenDir, tmpRoot);
        stored.rememberLastOpenDir = false;
        assert.strictEqual(rememberOpenPath(getAppRoot, file), null);
    });
});
