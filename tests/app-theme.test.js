'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

describe('app-theme', () => {
    /** @type {string} */
    let tmpDir;
    /** @type {typeof import('../electron/app-theme')} */
    let appTheme;
    /** @type {string[]} */
    let themeSourceLog;
    /** @type {number[]} */
    let suppressLog;
    /** @type {object[]} */
    let fakeWindows;

    const electronStub = {
        app: {
            getPath: () => tmpDir,
        },
        BrowserWindow: {
            getAllWindows: () => fakeWindows,
        },
        nativeTheme: {
            themeSource: 'system',
        },
    };

    function loadFresh() {
        const resolved = require.resolve('../electron/app-theme');
        delete require.cache[resolved];
        const electronPath = require.resolve('electron');
        const prev = require.cache[electronPath];
        require.cache[electronPath] = {
            id: electronPath,
            filename: electronPath,
            loaded: true,
            exports: electronStub,
        };
        try {
            // Bypass electron real module if resolve fails in mocha
            const origLoad = Module._load;
            Module._load = function (request, parent, isMain) {
                if (request === 'electron') return electronStub;
                return origLoad.apply(this, arguments);
            };
            try {
                appTheme = require('../electron/app-theme');
            } finally {
                Module._load = origLoad;
            }
        } finally {
            if (prev) require.cache[electronPath] = prev;
            else delete require.cache[electronPath];
        }
    }

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-app-theme-'));
        themeSourceLog = [];
        suppressLog = [];
        fakeWindows = [];
        electronStub.nativeTheme.themeSource = 'system';
        Object.defineProperty(electronStub.nativeTheme, 'themeSource', {
            configurable: true,
            enumerable: true,
            get() { return this._themeSource || 'system'; },
            set(v) {
                this._themeSource = v;
                themeSourceLog.push(v);
            },
        });
        electronStub.nativeTheme._themeSource = 'system';
        loadFresh();
        appTheme.linkSuppressMinimizeToTray((ms) => suppressLog.push(ms));
    });

    afterEach(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
        const resolved = require.resolve('../electron/app-theme');
        delete require.cache[resolved];
    });

    it('normalizeTheme maps unknown to light', () => {
        assert.strictEqual(appTheme.normalizeTheme('dark'), 'dark');
        assert.strictEqual(appTheme.normalizeTheme('DARK'), 'light');
        assert.strictEqual(appTheme.normalizeTheme(''), 'light');
        assert.strictEqual(appTheme.normalizeTheme(null), 'light');
    });

    it('initAppTheme seeds from legacy editor chrome file', () => {
        fs.writeFileSync(path.join(tmpDir, 'transub-editor-chrome-theme'), 'dark', 'utf8');
        const theme = appTheme.initAppTheme();
        assert.strictEqual(theme, 'dark');
        assert.strictEqual(appTheme.getAppTheme(), 'dark');
        assert.ok(themeSourceLog.includes('dark'));
        assert.strictEqual(
            fs.readFileSync(path.join(tmpDir, 'transub-app-theme'), 'utf8').trim(),
            'dark',
        );
    });

    it('setAppTheme persists, sets nativeTheme, and suppresses only on change', () => {
        appTheme.initAppTheme();
        suppressLog.length = 0;
        themeSourceLog.length = 0;

        assert.strictEqual(appTheme.setAppTheme('dark'), 'dark');
        assert.strictEqual(appTheme.getAppTheme(), 'dark');
        assert.deepStrictEqual(suppressLog, [1600]);
        assert.ok(themeSourceLog.includes('dark'));
        assert.strictEqual(
            fs.readFileSync(path.join(tmpDir, 'transub-app-theme'), 'utf8').trim(),
            'dark',
        );
        assert.strictEqual(
            fs.readFileSync(path.join(tmpDir, 'transub-editor-chrome-theme'), 'utf8').trim(),
            'dark',
        );

        suppressLog.length = 0;
        themeSourceLog.length = 0;
        appTheme.setAppTheme('dark');
        assert.deepStrictEqual(suppressLog, [], 'same theme must not re-arm suppress');
    });

    it('setAppTheme updates editor and main window background colors', () => {
        const calls = [];
        fakeWindows = [
            {
                __transubIsEditorWindow: true,
                isDestroyed: () => false,
                setBackgroundColor: (c) => calls.push(['editor', c]),
                webContents: {
                    isDestroyed: () => false,
                    send: () => {},
                    getURL: () => 'file:///subtitle-editor.html',
                },
            },
            {
                isDestroyed: () => false,
                setBackgroundColor: (c) => calls.push(['main', c]),
                webContents: {
                    isDestroyed: () => false,
                    send: () => {},
                    getURL: () => 'file:///index.html',
                },
            },
        ];
        appTheme.initAppTheme();
        appTheme.setAppTheme('dark');
        assert.ok(calls.some((c) => c[0] === 'editor' && c[1] === appTheme.EDITOR_BG.dark));
        assert.ok(calls.some((c) => c[0] === 'main' && c[1] === appTheme.MAIN_BG.dark));
    });

    it('setAppTheme broadcasts theme change', () => {
        const sent = [];
        fakeWindows = [{
            isDestroyed: () => false,
            setBackgroundColor: () => {},
            webContents: {
                isDestroyed: () => false,
                send: (ch, payload) => sent.push([ch, payload]),
                getURL: () => '',
            },
        }];
        appTheme.initAppTheme();
        appTheme.setAppTheme('dark');
        assert.ok(sent.some((s) => s[0] === 'transub-app-theme-changed' && s[1]?.theme === 'dark'));
    });
});
