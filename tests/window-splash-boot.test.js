'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { attachSplashThenLoad } = require('../electron/window-splash-boot');

function makeFakeWin() {
    const listeners = {
        once: new Map(),
        on: new Map(),
    };
    const win = {
        destroyed: false,
        visible: false,
        loads: [],
        isDestroyed() { return this.destroyed; },
        isVisible() { return this.visible; },
        show() { this.visible = true; },
        focus() {},
        loadFile(file, opts) {
            this.loads.push({ file, search: opts?.search || '' });
            return Promise.resolve();
        },
        once(event, handler) {
            listeners.once.set(event, handler);
        },
        webContents: {
            destroyed: false,
            isDestroyed() { return this.destroyed; },
            getURL() {
                const last = win.loads[win.loads.length - 1];
                return last ? `file://${last.file}${last.search ? `?${last.search}` : ''}` : '';
            },
            on(event, handler) {
                listeners.on.set(event, handler);
            },
            emit(event) {
                const handler = listeners.on.get(event);
                if (handler) handler();
            },
        },
        emitOnce(event) {
            const handler = listeners.once.get(event);
            if (handler) handler();
        },
    };
    return win;
}

describe('window-splash-boot', () => {
    it('loads splash first then navigates to main html', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-splash-'));
        const splash = path.join(dir, 'splash.html');
        const main = path.join(dir, 'index.html');
        fs.writeFileSync(splash, '<html></html>');
        fs.writeFileSync(main, '<html></html>');

        const win = makeFakeWin();
        const reveals = [];
        const mains = [];
        attachSplashThenLoad(win, {
            splashHtml: splash,
            splashSearch: 'kind=settings',
            mainHtml: main,
            mainSearch: 'standaloneSettings=1',
            splashRevealMs: 60_000,
            onReveal: () => reveals.push('reveal'),
            onMainLoaded: () => mains.push('main'),
        });

        assert.strictEqual(win.loads.length, 1);
        assert.ok(win.loads[0].file.endsWith('splash.html'));
        assert.strictEqual(win.loads[0].search, 'kind=settings');

        win.emitOnce('ready-to-show');
        assert.deepStrictEqual(reveals, ['reveal']);
        assert.strictEqual(win.loads.length, 2);
        assert.ok(win.loads[1].file.endsWith('index.html'));
        assert.strictEqual(win.loads[1].search, 'standaloneSettings=1');

        win.webContents.emit('did-finish-load');
        assert.deepStrictEqual(mains, ['main']);
    });

    it('falls back to direct main load when splash is missing', () => {
        const win = makeFakeWin();
        const reveals = [];
        attachSplashThenLoad(win, {
            splashHtml: path.join(os.tmpdir(), 'missing-splash-xyz.html'),
            mainHtml: path.join(os.tmpdir(), 'index.html'),
            mainSearch: 'standaloneWizard=1',
            fallbackRevealMs: 60_000,
            onReveal: () => reveals.push('reveal'),
        });
        assert.strictEqual(win.loads.length, 1);
        assert.ok(win.loads[0].file.endsWith('index.html'));
        win.emitOnce('ready-to-show');
        assert.deepStrictEqual(reveals, ['reveal']);
    });
});
