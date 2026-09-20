/**
 * Runtime smoke for deferred UI fragments (Electron).
 * Usage: node tools/smoke-ui-fragments-runtime.js
 */
const path = require('path');
const fs = require('fs');

const CHILD = process.env.TRANSUB_UI_FRAGMENT_SMOKE_CHILD === '1';

if (!CHILD) {
    const electronBin = require('electron');
    const { spawn } = require('child_process');
    const child = spawn(electronBin, [__filename], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        env: { ...process.env, TRANSUB_UI_FRAGMENT_SMOKE_CHILD: '1' },
    });
    child.on('exit', (code, signal) => {
        if (signal) process.exit(1);
        process.exit(code || 0);
    });
} else {
    const { app, BrowserWindow, ipcMain } = require('electron');
    const root = path.join(__dirname, '..');
    const src = path.join(root, 'src');

    // Keep process alive between sequential probes (destroying the factory
    // window would otherwise quit Electron before the editor probe).
    app.on('window-all-closed', (e) => {
        e.preventDefault();
    });

    const allow = new Set([
        'settings-panels.fragment.html',
        'workspace-scenes.fragment.html',
        'workspace-shelf.fragment.html',
        'workspace-models.fragment.html',
        'workspace-burn.fragment.html',
        'setup-wizard.fragment.html',
        'factory-modals.fragment.html',
        'editor-modals-drawers.fragment.html',
        'editor-modals-tools.fragment.html',
        'editor-modals-pro.fragment.html',
    ]);
    ipcMain.handle('transub-read-ui-fragment', async (_e, payload = {}) => {
        const base = path.basename(String(payload?.name || '').trim());
        if (!allow.has(base)) return { ok: false, error: 'not allowed' };
        try {
            return { ok: true, html: await fs.promises.readFile(path.join(src, base), 'utf8') };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });

    async function probe(file, script) {
        const win = new BrowserWindow({
            show: false,
            width: 1280,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(root, 'electron', 'preload.js'),
            },
        });
        win.webContents.on('console-message', (event) => {
            const message = event?.message || '';
            if (/ReferenceError|TypeError|fragment|Failed/i.test(String(message))) {
                console.log(`[console:${file}]`, message);
            }
        });
        const filePath = path.join(src, file);
        await win.loadFile(filePath);
        await new Promise((r) => setTimeout(r, 1500));
        const result = await win.webContents.executeJavaScript(script, true);
        win.destroy();
        return result;
    }

    app.whenReady().then(async () => {
        // Register a broad set of no-op handlers used during chrome boot.
        const stubChannels = [
            'ffmpeg-burn-list-encoders', 'transub-shelf-status', 'transwithai-get-presets',
            'transub-advanced-managed-llm-status', 'transub-get-app-theme', 'transub-get-system-resources',
            'transub-get-ui-zoom', 'transub-window-is-maximized', 'transub-engine-bundled-path',
            'transub-engine-models-cache-load', 'transub-engine-validate', 'transub-advanced-get-entitlement',
            'transwithai-get-pending-files', 'transub-live-batch-snapshot', 'transwithai-set-post-task',
            'transub-consume-pending-open-params', 'transub-open-setup-wizard', 'transwithai-get-options',
            'transub-engine-status', 'transub-compute-task-status', 'transub-advanced-get-status',
            'transub-has-settings-file', 'transub-get-app-version', 'transub-engine-soft-status',
            'transub-tdp-get-status', 'transub-get-text-presets', 'transwithai-list-models',
            'transub-engine-gpu-status',
        ];
        for (const ch of stubChannels) {
            try { ipcMain.removeHandler(ch); } catch (_) { /* ignore */ }
            try { ipcMain.handle(ch, async () => ({ ok: true, options: {}, status: {}, entitled: false, exists: true, models: [] })); } catch (_) { /* ignore */ }
        }

        let factory;
        let editor;
        try {
            factory = await probe('index.html', `(async () => {
            const L = window.TransubUiFragmentLoad;
            if (!L) return { ok:false, error:'TransubUiFragmentLoad missing' };
            await L.ensureFactoryChromeDom();
            await L.ensureUiFragment('settings-panels').catch(()=>null);
            const need = ['retranslateModeLlm','envCheckStartBtn','manualWhlCancelBtn','setupWizardNextBtn','appConfirmPrimaryBtn','startBtn'];
            const missing = need.filter(id => !document.getElementById(id));
            const toggles = [];
            for (const id of ['retranslateModal','setupWizardModal','envCheckModal','appConfirmModal','shortcutsModal','cliCommandModal']) {
                const el = document.getElementById(id);
                if (!el) { toggles.push({id, error:'missing'}); continue; }
                el.classList.remove('hidden'); el.classList.add('flex');
                const opened = !el.classList.contains('hidden');
                el.classList.add('hidden'); el.classList.remove('flex');
                toggles.push({id, opened});
            }
            const pendingLeft = ['retranslateModal','setupWizardModal','envCheckModal','manualWhlModal']
                .filter(id => document.getElementById(id)?.getAttribute('data-ui-fragment')==='pending');
            return { ok: !missing.length && toggles.every(t=>t.opened) && !pendingLeft.length, missing, toggles, pendingLeft };
        })()`);
            console.log('[smoke-ui-fragments] factory', JSON.stringify(factory, null, 2));
        } catch (err) {
            console.error('[smoke-ui-fragments] factory probe failed', err);
            factory = { ok: false, error: String(err?.message || err) };
        }

        await new Promise((r) => setTimeout(r, 500));

        try {
            editor = await probe('subtitle-editor.html', `(async () => {
            const L = window.TransubEditorUiFragments || window.TransubUiFragmentLoad;
            if (!L) return { ok:false, error:'editor fragment loader missing' };
            if (L.ensureEditorModalDom) await L.ensureEditorModalDom();
            else await Promise.all(['editor-modals-drawers','editor-modals-tools','editor-modals-pro'].map(k=>window.TransubUiFragmentLoad.ensureUiFragment(k)));
            const need = ['editorAssStyleList','editorBatchDurConfirm','editorFindReplaceModal','editorSplitModal','editorCueBody'];
            const missing = need.filter(id => !document.getElementById(id));
            const toggles = [];
            for (const id of ['editorFindReplaceModal','editorSplitModal','editorBatchDurModal','editorShortcutsModal','editorAssStylesModal']) {
                const el = document.getElementById(id);
                if (!el) { toggles.push({id, error:'missing'}); continue; }
                el.classList.remove('hidden');
                const opened = !el.classList.contains('hidden');
                el.classList.add('hidden');
                toggles.push({id, opened});
            }
            const pendingLeft = ['editorFindReplaceModal','editorSplitModal','editorBatchDurModal']
                .filter(id => document.getElementById(id)?.getAttribute('data-ui-fragment')==='pending');
            return { ok: !missing.length && toggles.every(t=>t.opened) && !pendingLeft.length, missing, toggles, pendingLeft };
        })()`);
            console.log('[smoke-ui-fragments] editor', JSON.stringify(editor, null, 2));
        } catch (err) {
            console.error('[smoke-ui-fragments] editor probe failed', err);
            editor = { ok: false, error: String(err?.message || err) };
        }

        const ok = !!(factory && factory.ok && editor && editor.ok);
        app.exit(ok ? 0 : 1);
    }).catch((err) => {
        console.error(err);
        app.exit(1);
    });
}