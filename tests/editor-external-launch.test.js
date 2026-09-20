const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
    normalizeBackend,
    resolveExternalEditorExe,
    buildExternalEditorArgs,
    shouldUseExternalEditor,
} = require('../electron/editor-external-launch');

describe('editor-external-launch', () => {
    it('normalizeBackend maps aliases', () => {
        assert.strictEqual(normalizeBackend('external'), 'external');
        assert.strictEqual(normalizeBackend('Electron'), 'electron');
        assert.strictEqual(normalizeBackend('csharp'), 'external');
        assert.strictEqual(normalizeBackend('auto'), 'auto');
    });

    it('shouldUseExternalEditor respects force flags', () => {
        assert.strictEqual(shouldUseExternalEditor({
            options: { subtitleEditorBackend: 'external' },
            forceElectron: true,
        }), false);
        assert.strictEqual(shouldUseExternalEditor({
            options: { subtitleEditorBackend: 'electron' },
            forceExternal: true,
        }), true);
        assert.strictEqual(shouldUseExternalEditor({
            options: { subtitleEditorBackend: 'external' },
        }), true);
    });

    it('auto backend uses external only when exe exists', () => {
        const tmp = path.join(os.tmpdir(), `transub-editor-auto-${process.pid}.exe`);
        fs.writeFileSync(tmp, 'MZ');
        try {
            assert.strictEqual(shouldUseExternalEditor({
                options: { subtitleEditorBackend: 'auto', subtitleEditorPath: tmp },
                getAppRoot: () => os.tmpdir(),
            }), true);
            assert.strictEqual(shouldUseExternalEditor({
                options: { subtitleEditorBackend: 'auto', subtitleEditorPath: path.join(os.tmpdir(), 'missing-editor.exe') },
                getAppRoot: () => os.tmpdir(),
                env: {},
            }), false);
        } finally {
            try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
        }
    });

    it('resolveExternalEditorExe finds configured path', () => {
        const tmp = path.join(os.tmpdir(), `transub-editor-fake-${process.pid}.exe`);
        fs.writeFileSync(tmp, 'MZ');
        try {
            const r = resolveExternalEditorExe({
                subtitleEditorPath: tmp,
                env: {},
                getAppRoot: () => os.tmpdir(),
                execPath: path.join(os.tmpdir(), 'transub.exe'),
            });
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.source, 'settings');
            assert.ok(r.path.toLowerCase().includes(path.basename(tmp).toLowerCase()) || r.path === path.resolve(tmp));
        } finally {
            try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
        }
    });

    it('resolveExternalEditorExe finds rust transub-editor.exe under LOCALAPPDATA', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-editor-cand-'));
        const dir = path.join(root, 'Programs', 'Transub.Editor');
        fs.mkdirSync(dir, { recursive: true });
        const exe = path.join(dir, 'transub-editor.exe');
        fs.writeFileSync(exe, 'MZ');
        try {
            const r = resolveExternalEditorExe({
                env: { LOCALAPPDATA: root },
                execPath: path.join(root, 'Transub.exe'),
                getAppRoot: () => root,
            });
            assert.strictEqual(r.ok, true);
            assert.ok(r.path.toLowerCase().endsWith('transub-editor.exe'));
            assert.strictEqual(r.source, 'localapp-programs');
        } finally {
            try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* ignore */ }
        }
    });

    it('writebackStampPath matches Editor sidecar name', () => {
        const { writebackStampPath } = require('../electron/editor-external-launch');
        const stamp = writebackStampPath('C:\\film\\a.ja.srt');
        assert.ok(stamp.replace(/\//g, '\\').endsWith('a.ja.srt.transub-editor-saved.json'));
    });

    it('buildExternalEditorArgs prefers protocol when lang set', () => {
        const args = buildExternalEditorArgs({
            subPath: 'C:\\film\\a.srt',
            videoPath: 'C:\\film\\a.mkv',
            sourceLanguage: 'ja',
            translateTarget: 'zh',
            from: 'transub',
        });
        assert.strictEqual(args.length, 1);
        assert.ok(args[0].startsWith('transub://edit?'));
        assert.ok(args[0].includes('src=ja'));
        assert.ok(args[0].includes('tgt=zh'));
    });

    it('buildExternalEditorArgs uses flags without lang', () => {
        const args = buildExternalEditorArgs({
            subPath: 'C:\\film\\a.srt',
            mediaPath: 'C:\\film\\a.mkv',
        });
        assert.deepStrictEqual(args.slice(0, 2), ['--sub', path.resolve('C:\\film\\a.srt')]);
        assert.ok(args.includes('--media'));
        assert.ok(args.includes('--from'));
    });
});
