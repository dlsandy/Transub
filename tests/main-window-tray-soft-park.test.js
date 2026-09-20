const assert = require('assert');
const {
    USE_SOFT_PARK,
    SOFT_PARK_POS,
    SOFT_UNPARK_STEP2_MS,
    MINIMIZE_CLASSIFY_DELAY_MS,
    createMainWindowTray,
} = require('../electron/main-window-tray');

const afterClassify = () => new Promise((r) => setTimeout(r, MINIMIZE_CLASSIFY_DELAY_MS + 40));
const afterClassifyAndSettle = () => new Promise((r) => setTimeout(r, MINIMIZE_CLASSIFY_DELAY_MS + 120));

describe('main-window-tray soft-park', () => {
    it('exports soft-park constants for Windows', () => {
        assert.strictEqual(typeof USE_SOFT_PARK, 'boolean');
        assert.strictEqual(USE_SOFT_PARK, process.platform === 'win32');
        assert.strictEqual(SOFT_PARK_POS.x, -32000);
        assert.strictEqual(SOFT_PARK_POS.y, -32000);
        assert.strictEqual(SOFT_UNPARK_STEP2_MS, 150);
    });

    it('isMainVisiblyOpen is false while marked hidden to tray', () => {
        const throttleCalls = [];
        const fakeWin = {
            isDestroyed: () => false,
            isVisible: () => true,
            isMinimized: () => false,
            isMaximized: () => false,
            isFocused: () => false,
            getBounds: () => ({ x: 100, y: 100, width: 1200, height: 800 }),
            getNormalBounds: () => ({ x: 100, y: 100, width: 1200, height: 800 }),
            getOpacity: () => 0,
            setOpacity() {},
            setSkipTaskbar() {},
            setIgnoreMouseEvents() {},
            setBounds() {},
            setPosition() {},
            showInactive() {},
            show() {},
            hide() {},
            restore() {},
            unmaximize() {},
            maximize() {},
            focus() {},
            webContents: {
                isDestroyed: () => false,
                setBackgroundThrottling(v) { throttleCalls.push(!!v); },
                focus() {},
                invalidate() {},
                executeJavaScript: async () => true,
            },
            on() {},
            once() {},
            id: 1,
        };

        const tray = createMainWindowTray({
            getMainWindow: () => fakeWin,
            isQuitting: () => false,
            ensureMainWindow: () => fakeWin,
            confirmQuitApp: () => {},
            dialogShowMessageBox: async () => ({ response: 0 }),
        });

        assert.strictEqual(tray.isMainVisiblyOpen(), true);
        assert.strictEqual(tray.isMainHiddenToTray(), false);

        // Monkey-patch: call hideToTray which sets internal flag.
        tray.hideToTray();
        assert.strictEqual(tray.isMainHiddenToTray(), true);
        assert.strictEqual(tray.isMainVisiblyOpen(), false);

        if (USE_SOFT_PARK) {
            const snap = tray._softParkSnapshot();
            assert.ok(snap);
            assert.strictEqual(snap.x, 100);
            assert.strictEqual(snap.y, 100);
            assert.strictEqual(snap.width, 1200);
            assert.strictEqual(snap.height, 800);
            // Soft-park must keep throttling disabled (last call false), never
            // re-enable it while parked — that blanks long ASR restores.
            assert.ok(throttleCalls.includes(false));
            assert.ok(!throttleCalls.includes(true),
                'win32 soft-park must not re-enable backgroundThrottling while parked');
        }
    });

    it('reveal clears tray-hidden flag', async () => {
        const calls = [];
        let bounds = { x: 40, y: 50, width: 1100, height: 700 };
        const fakeWin = {
            isDestroyed: () => false,
            isVisible: () => true,
            isMinimized: () => false,
            isMaximized: () => false,
            isFocused: () => false,
            getBounds: () => ({ ...bounds }),
            getNormalBounds: () => ({ ...bounds }),
            getOpacity: () => 1,
            setOpacity(v) { calls.push(['opacity', v]); },
            setSkipTaskbar(v) { calls.push(['skipTaskbar', v]); },
            setIgnoreMouseEvents(v) { calls.push(['ignoreMouse', v]); },
            setBounds(b) {
                bounds = { ...bounds, ...b };
                calls.push(['bounds', { ...b }]);
            },
            setPosition() {},
            showInactive() {},
            show() { calls.push(['show']); },
            hide() { calls.push(['hide']); },
            restore() {},
            unmaximize() {},
            maximize() {},
            focus() {},
            moveTop() {},
            webContents: {
                isDestroyed: () => false,
                setBackgroundThrottling() {},
                focus() {},
                invalidate() {},
                isLoading: () => false,
                executeJavaScript: async () => true,
                reload() { calls.push(['reload']); },
            },
            on() {},
            once() {},
            id: 2,
        };

        const tray = createMainWindowTray({
            getMainWindow: () => fakeWin,
            isQuitting: () => false,
            ensureMainWindow: () => fakeWin,
            confirmQuitApp: () => {},
            dialogShowMessageBox: async () => ({ response: 0 }),
        });

        tray.hideToTray();
        assert.strictEqual(tray.isMainHiddenToTray(), true);

        if (USE_SOFT_PARK) {
            assert.ok(!calls.some((c) => c[0] === 'hide'), 'win32 soft-park must not call hide()');
        }

        tray.revealMainWindowChrome();
        assert.strictEqual(tray.isMainHiddenToTray(), false);
        assert.strictEqual(tray.isMainVisiblyOpen(), true);
        assert.ok(calls.some((c) => c[0] === 'skipTaskbar' && c[1] === false));

        if (USE_SOFT_PARK) {
            // Step 1: height-1 on-screen; step 2 restores full height.
            const step1 = calls.find((c) => c[0] === 'bounds' && c[1].height === 699 && c[1].x === 40);
            assert.ok(step1, 'soft-unpark step1 must use height-1');
            await new Promise((r) => setTimeout(r, SOFT_UNPARK_STEP2_MS + 40));
            const step2 = calls.find((c) => c[0] === 'bounds' && c[1].height === 700 && c[1].x === 40);
            assert.ok(step2, 'soft-unpark step2 must restore full height across event-loop');
        }
    });

    it('suppress undoes minimize even after focus moves to main (dark editor close)', async () => {
        const listeners = new Map();
        let focused = false;
        let minimized = false;
        let opacity = 1;
        let skipTaskbar = false;
        let bounds = { x: 80, y: 90, width: 1100, height: 700 };

        const fakeWin = {
            id: 3,
            isDestroyed: () => false,
            isVisible: () => true,
            isMinimized: () => minimized,
            isMaximized: () => false,
            isFocused: () => focused,
            getBounds: () => ({ ...bounds }),
            getNormalBounds: () => ({ ...bounds }),
            getOpacity: () => opacity,
            setOpacity(v) { opacity = v; },
            setSkipTaskbar(v) { skipTaskbar = !!v; },
            setIgnoreMouseEvents() {},
            setBounds(b) { bounds = { ...bounds, ...b }; },
            setPosition(x, y) { bounds.x = x; bounds.y = y; },
            showInactive() {},
            show() { minimized = false; },
            hide() {},
            restore() { minimized = false; },
            unmaximize() {},
            maximize() {},
            focus() { focused = true; },
            moveTop() {},
            webContents: {
                isDestroyed: () => false,
                setBackgroundThrottling() {},
                focus() {},
                invalidate() {},
                isLoading: () => false,
                executeJavaScript: async () => true,
                reload() {},
            },
            on(evt, fn) {
                const list = listeners.get(evt) || [];
                list.push(fn);
                listeners.set(evt, list);
            },
            once() {},
            emit(evt, ...args) {
                for (const fn of (listeners.get(evt) || [])) fn(...args);
            },
        };

        const tray = createMainWindowTray({
            getMainWindow: () => fakeWin,
            isQuitting: () => false,
            ensureMainWindow: () => fakeWin,
            confirmQuitApp: () => {},
            dialogShowMessageBox: async () => ({ response: 0 }),
        });

        tray.attachTrayBehavior(fakeWin);
        // Editor/settings close: main receives focus, then a spurious minimize
        // (worse when nativeTheme flips dark→system after a dark editor closes).
        fakeWin.emit('focus');
        focused = true;
        tray.beginSuppressMinimizeToTray(800);

        const preventDefault = () => {};
        fakeWin.emit('minimize', { preventDefault });

        await afterClassify();
        assert.strictEqual(tray.isMainHiddenToTray(), false,
            'suppress must undo hide-to-tray even when main just gained focus');
        assert.strictEqual(skipTaskbar, false);
        assert.ok(opacity === 1 || opacity === 0.99);

        // Allow settle timeout from minimize handler to run.
        await afterClassifyAndSettle();
        assert.strictEqual(tray.isMainHiddenToTray(), false);
        assert.strictEqual(tray.isMainVisiblyOpen(), true);
    });

    it('suppress blocks spurious close so app does not force-quit', async () => {
        const listeners = new Map();
        let focused = false;
        let closedAllowed = false;
        let bounds = { x: 80, y: 90, width: 1100, height: 700 };

        const fakeWin = {
            id: 4,
            isDestroyed: () => false,
            isVisible: () => true,
            isMinimized: () => false,
            isMaximized: () => false,
            isFocused: () => focused,
            getBounds: () => ({ ...bounds }),
            getNormalBounds: () => ({ ...bounds }),
            getOpacity: () => 1,
            setOpacity() {},
            setSkipTaskbar() {},
            setIgnoreMouseEvents() {},
            setBounds(b) { bounds = { ...bounds, ...b }; },
            setPosition() {},
            showInactive() {},
            show() {},
            hide() {},
            restore() {},
            unmaximize() {},
            maximize() {},
            focus() { focused = true; },
            moveTop() {},
            webContents: {
                isDestroyed: () => false,
                setBackgroundThrottling() {},
                focus() {},
                invalidate() {},
                isLoading: () => false,
                executeJavaScript: async () => true,
                reload() {},
            },
            on(evt, fn) {
                const list = listeners.get(evt) || [];
                list.push(fn);
                listeners.set(evt, list);
            },
            once() {},
            emit(evt, ...args) {
                for (const fn of (listeners.get(evt) || [])) fn(...args);
            },
        };

        const tray = createMainWindowTray({
            getMainWindow: () => fakeWin,
            isQuitting: () => false,
            ensureMainWindow: () => fakeWin,
            confirmQuitApp: () => {},
            dialogShowMessageBox: async () => ({ response: 0 }),
        });

        tray.attachTrayBehavior(fakeWin);
        tray.beginSuppressMinimizeToTray(800);

        const event = {
            preventDefault() { closedAllowed = false; },
        };
        closedAllowed = true;
        fakeWin.emit('close', event);

        assert.strictEqual(closedAllowed, false, 'spurious close must be prevented during suppress');
        assert.strictEqual(tray.isSuppressMinimizeToTrayActive(), true);

        await new Promise((r) => setTimeout(r, 20));
        assert.strictEqual(tray.isMainHiddenToTray(), false);
    });

    it('does not soft-park when settings is focused and main gets spurious minimize', async () => {
        const listeners = new Map();
        let focused = false;
        let opacity = 1;
        let skipTaskbar = false;
        let bounds = { x: 80, y: 90, width: 1100, height: 700 };
        let hideCalls = 0;

        const fakeWin = {
            id: 10,
            isDestroyed: () => false,
            isVisible: () => true,
            isMinimized: () => false,
            isMaximized: () => false,
            isFocused: () => focused,
            getBounds: () => ({ ...bounds }),
            getNormalBounds: () => ({ ...bounds }),
            getOpacity: () => opacity,
            setOpacity(v) { opacity = v; },
            setSkipTaskbar(v) { skipTaskbar = !!v; },
            setIgnoreMouseEvents() {},
            setBounds(b) { bounds = { ...bounds, ...b }; },
            setPosition(x, y) { bounds.x = x; bounds.y = y; },
            showInactive() {},
            show() {},
            hide() { hideCalls += 1; },
            restore() {},
            unmaximize() {},
            maximize() {},
            focus() { focused = true; },
            moveTop() {},
            webContents: {
                isDestroyed: () => false,
                setBackgroundThrottling() {},
                focus() {},
                invalidate() {},
                isLoading: () => false,
                executeJavaScript: async () => true,
                reload() {},
            },
            on(evt, fn) {
                const list = listeners.get(evt) || [];
                list.push(fn);
                listeners.set(evt, list);
            },
            once() {},
            emit(evt, ...args) {
                for (const fn of (listeners.get(evt) || [])) fn(...args);
            },
        };

        const settingsWin = {
            id: 11,
            isDestroyed: () => false,
            isVisible: () => true,
            isMinimized: () => false,
            isFocused: () => true,
        };

        const tray = createMainWindowTray({
            getMainWindow: () => fakeWin,
            isQuitting: () => false,
            ensureMainWindow: () => fakeWin,
            confirmQuitApp: () => {},
            dialogShowMessageBox: async () => ({ response: 0 }),
            BrowserWindow: {
                getFocusedWindow: () => settingsWin,
                getAllWindows: () => [fakeWin, settingsWin],
            },
        });

        tray.attachTrayBehavior(fakeWin);
        // Settings owns focus; blur clears mainHadUserFocus after 50ms.
        fakeWin.emit('blur');
        focused = false;
        await new Promise((r) => setTimeout(r, 60));

        fakeWin.emit('minimize', { preventDefault() {} });

        await afterClassify();
        assert.strictEqual(tray.isMainHiddenToTray(), false,
            'must not hide-to-tray while a visible secondary owns the session');
        assert.strictEqual(skipTaskbar, false);
        assert.ok(opacity === 1 || opacity === 0.99);
        if (USE_SOFT_PARK) {
            assert.ok(bounds.x !== SOFT_PARK_POS.x,
                'must not soft-park off-screen on sibling spurious minimize');
        }
        assert.strictEqual(hideCalls, 0);
    });

    it('undoes recent soft-park when secondary minimize races ahead of suppress', async () => {
        const listeners = new Map();
        let focused = false;
        let opacity = 1;
        let skipTaskbar = false;
        let bounds = { x: 80, y: 90, width: 1100, height: 700 };

        const fakeWin = {
            id: 12,
            isDestroyed: () => false,
            isVisible: () => true,
            isMinimized: () => false,
            isMaximized: () => false,
            isFocused: () => focused,
            getBounds: () => ({ ...bounds }),
            getNormalBounds: () => ({ ...bounds }),
            getOpacity: () => opacity,
            setOpacity(v) { opacity = v; },
            setSkipTaskbar(v) { skipTaskbar = !!v; },
            setIgnoreMouseEvents() {},
            setBounds(b) { bounds = { ...bounds, ...b }; },
            setPosition(x, y) { bounds.x = x; bounds.y = y; },
            showInactive() {},
            show() {},
            hide() {},
            restore() {},
            unmaximize() {},
            maximize() {},
            focus() { focused = true; },
            moveTop() {},
            webContents: {
                isDestroyed: () => false,
                setBackgroundThrottling() {},
                focus() {},
                invalidate() {},
                isLoading: () => false,
                executeJavaScript: async () => true,
                reload() {},
            },
            on(evt, fn) {
                const list = listeners.get(evt) || [];
                list.push(fn);
                listeners.set(evt, list);
            },
            once() {},
            emit(evt, ...args) {
                for (const fn of (listeners.get(evt) || [])) fn(...args);
            },
        };

        const secondaryListeners = new Map();
        const settingsWin = {
            id: 13,
            isDestroyed: () => false,
            isVisible: () => true,
            isMinimized: () => false,
            isFocused: () => false,
            on(evt, fn) {
                const list = secondaryListeners.get(evt) || [];
                list.push(fn);
                secondaryListeners.set(evt, list);
            },
            emit(evt, ...args) {
                for (const fn of (secondaryListeners.get(evt) || [])) fn(...args);
            },
        };

        const tray = createMainWindowTray({
            getMainWindow: () => fakeWin,
            isQuitting: () => false,
            ensureMainWindow: () => fakeWin,
            confirmQuitApp: () => {},
            dialogShowMessageBox: async () => ({ response: 0 }),
            BrowserWindow: {
                getFocusedWindow: () => null,
                getAllWindows: () => [fakeWin, settingsWin],
            },
        });

        tray.attachTrayBehavior(fakeWin);
        tray._attachSecondaryMinimizeGuard(settingsWin);

        // User focus was on main earlier; clear it so minimize looks non-user.
        fakeWin.emit('blur');
        focused = false;
        await new Promise((r) => setTimeout(r, 60));

        // Main minimize runs first (no suppress yet) → would soft-park without the fix.
        // Force park by temporarily having no visible secondary / no race marker:
        // simulate park via hideToTray then immediate secondary minimize recovery.
        tray.hideToTray();
        assert.strictEqual(tray.isMainHiddenToTray(), true);

        settingsWin.isMinimized = () => true;
        settingsWin.emit('minimize');
        await new Promise((r) => setTimeout(r, MINIMIZE_CLASSIFY_DELAY_MS + 40));

        assert.strictEqual(tray.isMainHiddenToTray(), false,
            'recent park must be undone when secondary minimize arrives');
        assert.strictEqual(skipTaskbar, false);
        assert.ok(opacity === 1 || opacity === 0.99);
    });

    it('uses native minimize for show-desktop instead of soft-park', async () => {
        const listeners = new Map();
        let focused = true;
        let minimized = false;
        let opacity = 1;
        let skipTaskbar = false;
        let bounds = { x: 80, y: 90, width: 1100, height: 700 };
        let nativeMinimizeCalls = 0;

        const fakeWin = {
            id: 20,
            isDestroyed: () => false,
            isVisible: () => !minimized,
            isMinimized: () => minimized,
            isMaximized: () => false,
            isFocused: () => focused && !minimized,
            getBounds: () => ({ ...bounds }),
            getNormalBounds: () => ({ ...bounds }),
            getOpacity: () => opacity,
            setOpacity(v) { opacity = v; },
            setSkipTaskbar(v) { skipTaskbar = !!v; },
            setIgnoreMouseEvents() {},
            setBounds(b) { bounds = { ...bounds, ...b }; },
            setPosition(x, y) { bounds.x = x; bounds.y = y; },
            showInactive() {},
            show() { minimized = false; },
            hide() {},
            restore() { minimized = false; },
            unmaximize() {},
            maximize() {},
            focus() { focused = true; },
            moveTop() {},
            minimize() {
                nativeMinimizeCalls += 1;
                minimized = true;
                focused = false;
                fakeWin.emit('minimize', { preventDefault() {} });
            },
            webContents: {
                isDestroyed: () => false,
                setBackgroundThrottling() {},
                focus() {},
                invalidate() {},
                isLoading: () => false,
                executeJavaScript: async () => true,
                reload() {},
            },
            on(evt, fn) {
                const list = listeners.get(evt) || [];
                list.push(fn);
                listeners.set(evt, list);
            },
            once() {},
            emit(evt, ...args) {
                for (const fn of (listeners.get(evt) || [])) fn(...args);
            },
        };

        let settingsMinimized = false;
        const settingsWin = {
            id: 21,
            isDestroyed: () => false,
            isVisible: () => !settingsMinimized,
            isMinimized: () => settingsMinimized,
            isFocused: () => false,
            on() {},
        };

        const tray = createMainWindowTray({
            getMainWindow: () => fakeWin,
            isQuitting: () => false,
            ensureMainWindow: () => fakeWin,
            confirmQuitApp: () => {},
            dialogShowMessageBox: async () => ({ response: 0 }),
            BrowserWindow: {
                getFocusedWindow: () => null,
                getAllWindows: () => [fakeWin, settingsWin],
            },
        });

        tray.attachTrayBehavior(fakeWin);
        tray._attachSecondaryMinimizeGuard(settingsWin);
        fakeWin.emit('focus');

        // Ctrl+D / Win+D: both windows minimize; focus already on desktop.
        settingsMinimized = true;
        focused = false;
        fakeWin.emit('minimize', { preventDefault() {} });

        await afterClassifyAndSettle();

        assert.strictEqual(tray.isMainHiddenToTray(), false,
            'show-desktop must not soft-park/hide-to-tray');
        assert.ok(nativeMinimizeCalls >= 1, 'show-desktop must complete via native minimize');
        assert.strictEqual(minimized, true);
        assert.strictEqual(skipTaskbar, false);
        if (USE_SOFT_PARK) {
            assert.ok(bounds.x !== SOFT_PARK_POS.x, 'show-desktop must not soft-park off-screen');
        }

        // Restore after show-desktop should wake the surface without staying blank.
        minimized = false;
        fakeWin.emit('restore');
        await new Promise((r) => setTimeout(r, 40));
        assert.strictEqual(tray.isMainHiddenToTray(), false);
        assert.ok(opacity === 1 || opacity === 0.99);
    });

    it('still hides to tray when user minimizes main while settings is open', async () => {
        const listeners = new Map();
        let focused = true;
        let opacity = 1;
        let skipTaskbar = false;
        let bounds = { x: 80, y: 90, width: 1100, height: 700 };

        const fakeWin = {
            id: 14,
            isDestroyed: () => false,
            isVisible: () => true,
            isMinimized: () => false,
            isMaximized: () => false,
            isFocused: () => focused,
            getBounds: () => ({ ...bounds }),
            getNormalBounds: () => ({ ...bounds }),
            getOpacity: () => opacity,
            setOpacity(v) { opacity = v; },
            setSkipTaskbar(v) { skipTaskbar = !!v; },
            setIgnoreMouseEvents() {},
            setBounds(b) { bounds = { ...bounds, ...b }; },
            setPosition(x, y) { bounds.x = x; bounds.y = y; },
            showInactive() {},
            show() {},
            hide() {},
            restore() {},
            unmaximize() {},
            maximize() {},
            focus() { focused = true; },
            moveTop() {},
            webContents: {
                isDestroyed: () => false,
                setBackgroundThrottling() {},
                focus() {},
                invalidate() {},
                isLoading: () => false,
                executeJavaScript: async () => true,
                reload() {},
            },
            on(evt, fn) {
                const list = listeners.get(evt) || [];
                list.push(fn);
                listeners.set(evt, list);
            },
            once() {},
            emit(evt, ...args) {
                for (const fn of (listeners.get(evt) || [])) fn(...args);
            },
        };

        const settingsWin = {
            id: 15,
            isDestroyed: () => false,
            isVisible: () => true,
            isMinimized: () => false,
            isFocused: () => false,
        };

        const tray = createMainWindowTray({
            getMainWindow: () => fakeWin,
            isQuitting: () => false,
            ensureMainWindow: () => fakeWin,
            confirmQuitApp: () => {},
            dialogShowMessageBox: async () => ({ response: 0 }),
            BrowserWindow: {
                getFocusedWindow: () => fakeWin,
                getAllWindows: () => [fakeWin, settingsWin],
            },
        });

        tray.attachTrayBehavior(fakeWin);
        fakeWin.emit('focus');
        focused = true;

        fakeWin.emit('minimize', { preventDefault() {} });

        await afterClassifyAndSettle();
        assert.strictEqual(tray.isMainHiddenToTray(), true,
            'user title-bar minimize must still hide-to-tray with settings open');
        assert.strictEqual(skipTaskbar, true);
    });

    it('does not reload renderer while an active task is running', async () => {
        const computeLock = require('../electron/compute-task-lock');
        let reloadCount = 0;
        let bounds = { x: -32000, y: -32000, width: 1100, height: 700 };
        const fakeWin = {
            isDestroyed: () => false,
            isVisible: () => true,
            isMinimized: () => false,
            isMaximized: () => false,
            isFocused: () => false,
            getBounds: () => ({ ...bounds }),
            getNormalBounds: () => ({ ...bounds }),
            getOpacity: () => 0.4,
            setOpacity() {},
            setSkipTaskbar() {},
            setIgnoreMouseEvents() {},
            setBounds(b) { bounds = { ...bounds, ...b }; },
            setPosition() {},
            showInactive() {},
            show() {},
            hide() {},
            restore() {},
            unmaximize() {},
            maximize() {},
            focus() {},
            webContents: {
                isDestroyed: () => false,
                setBackgroundThrottling() {},
                focus() {},
                invalidate() {},
                isLoading: () => false,
                executeJavaScript: async () => false,
                reload() { reloadCount += 1; },
            },
            on() {},
            once() {},
            id: 5,
        };

        const tray = createMainWindowTray({
            getMainWindow: () => fakeWin,
            isQuitting: () => false,
            ensureMainWindow: () => fakeWin,
            confirmQuitApp: () => {},
            dialogShowMessageBox: async () => ({ response: 0 }),
        });

        const lock = computeLock.tryAcquire({ kind: 'engine_batch', forceLocal: true });
        assert.strictEqual(lock.ok, true);
        try {
            tray.hideToTray();
            assert.strictEqual(tray.isMainHiddenToTray(), true);
            tray._armBlankReload();
            tray._ensureMainSurfaceAlive();
            // Wait past nudge + chrome-still-parked + active-task wake retry.
            await new Promise((r) => setTimeout(r, 1800));
            assert.strictEqual(reloadCount, 0, 'must not wc.reload while hasActiveTask');
        } finally {
            if (lock.token) computeLock.release(lock.token);
        }
    });
});
