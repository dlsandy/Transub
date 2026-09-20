'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('settings-data cache', () => {
    let tmpRoot;
    let settingsData;
    let origWritable;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-settings-cache-'));
        delete require.cache[require.resolve('../electron/settings-data')];
        const appPaths = require('../electron/app-paths');
        origWritable = appPaths.getWritableRoot;
        appPaths.getWritableRoot = () => tmpRoot;
        settingsData = require('../electron/settings-data');
        settingsData.invalidateSettingsCache();
    });

    afterEach(() => {
        try {
            const appPaths = require('../electron/app-paths');
            if (origWritable) appPaths.getWritableRoot = origWritable;
        } catch { /* ignore */ }
        delete require.cache[require.resolve('../electron/settings-data')];
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    it('loadSettings serves memory after first disk read', () => {
        settingsData.saveSettings(() => tmpRoot, { language: 'ja', beamSize: 3 });
        const filePath = settingsData.getSettingsFilePath(() => tmpRoot);
        const before = fs.readFileSync(filePath, 'utf8');

        const a = settingsData.loadSettings(() => tmpRoot);
        assert.strictEqual(a.options.language, 'ja');

        // Corrupt on-disk file; cache must still return prior options.
        fs.writeFileSync(filePath, '{ broken', 'utf8');
        const b = settingsData.loadSettings(() => tmpRoot);
        assert.strictEqual(b.options.language, 'ja');
        assert.strictEqual(b.options.beamSize, 3);

        // Default load returns a frozen shared snapshot — mutations must not poison cache.
        assert.ok(Object.isFrozen(b.options));
        assert.throws(() => {
            b.options.language = 'en';
        });
        const c = settingsData.loadSettings(() => tmpRoot);
        assert.strictEqual(c.options.language, 'ja');
        // Same reference on warm path (no per-call deep clone).
        assert.strictEqual(c.options, b.options);

        fs.writeFileSync(filePath, before, 'utf8');
    });

    it('loadSettings({ clone: true }) returns a mutable deep copy', () => {
        settingsData.saveSettings(() => tmpRoot, { language: 'ja' });
        const a = settingsData.loadSettings(() => tmpRoot, { clone: true });
        a.options.language = 'en';
        const b = settingsData.loadSettings(() => tmpRoot);
        assert.strictEqual(b.options.language, 'ja');
    });

    it('saveSettings skips rewrite when options are unchanged', () => {
        settingsData.saveSettings(() => tmpRoot, { language: 'ko' });
        const filePath = settingsData.getSettingsFilePath(() => tmpRoot);
        const st1 = fs.statSync(filePath);
        const body1 = fs.readFileSync(filePath, 'utf8');

        settingsData.saveSettings(() => tmpRoot, { language: 'ko' });
        const body2 = fs.readFileSync(filePath, 'utf8');
        const st2 = fs.statSync(filePath);
        assert.strictEqual(body1, body2);
        assert.strictEqual(st1.mtimeMs, st2.mtimeMs);
    });

    it('saveSettings writes when options change and refreshes cache', () => {
        settingsData.saveSettings(() => tmpRoot, { language: 'ja' });
        settingsData.saveSettings(() => tmpRoot, { language: 'en' });
        const loaded = settingsData.loadSettings(() => tmpRoot);
        assert.strictEqual(loaded.options.language, 'en');
        const disk = JSON.parse(fs.readFileSync(settingsData.getSettingsFilePath(() => tmpRoot), 'utf8'));
        assert.strictEqual(disk.options.language, 'en');
    });
});
