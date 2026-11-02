const assert = require('assert');
const prompt = require('../src/js/jev-laya-install-prompt-core');

describe('jev-laya-install-prompt-core', () => {
    it('treats local auto as install candidate', () => {
        assert.strictEqual(prompt.isLocalAuto('auto', 'local'), true);
        assert.strictEqual(prompt.isLocalAuto('off', 'local'), false);
        assert.strictEqual(prompt.isLocalAuto('auto', 'studio'), false);
    });

    it('prompts install when missing, start when installed-but-down', () => {
        assert.strictEqual(prompt.nextLocalLayaPrompt({
            mode: 'auto',
            endpoint: 'local',
            local: true,
            installed: false,
            reachable: false,
        }), 'install');
        assert.strictEqual(prompt.nextLocalLayaPrompt({
            mode: 'auto',
            endpoint: 'local',
            local: true,
            installed: true,
            reachable: false,
        }), 'start');
        assert.strictEqual(prompt.nextLocalLayaPrompt({
            mode: 'auto',
            endpoint: 'local',
            local: true,
            installed: true,
            reachable: true,
        }), 'none');
        assert.strictEqual(prompt.nextLocalLayaPrompt({
            mode: 'auto',
            endpoint: 'studio',
            local: false,
        }), 'none');
    });

    it('asks to install in the dialog copy', () => {
        const copy = prompt.installDialogCopy();
        assert.ok(/未安装/.test(copy.title));
        assert.ok(/是否现在安装/.test(copy.message));
        assert.ok(/wheel|模型管理|OpenDecider|0\.8GB|网络/.test(copy.message));
        assert.strictEqual(copy.primaryLabel, '安装');
    });

    it('shows overlay and streams install IPC', async () => {
        const statuses = [];
        const overlay = [];
        const electron = {
            transubAdvancedLayaLocalStatus: async () => ({
                local: true,
                installed: false,
                reachable: false,
            }),
            transubAdvancedLayaInstall: async () => {
                electron._progress({ message: 'Downloading opendecider' });
                return { ok: true, message: '已安装并启动 Laya' };
            },
            onAdvancedLayaProgress: (cb) => {
                electron._progress = cb;
                return () => { electron._progress = null; };
            },
        };
        const api = prompt.createJevLayaInstallPrompt({
            electron,
            els: {
                jevDecisionModeSelect: { value: 'auto' },
                jevDecisionEndpointInput: { value: 'local' },
            },
            appConfirm: async () => true,
            setJevStatus: (msg) => statuses.push(String(msg || '')),
            showToast: () => {},
            uiTx: (s) => s,
        });
        globalThis.TransubBusyOverlay = {
            showBusyOverlayAndWait: async (msg) => { overlay.push(`show:${msg}`); },
            updateBusyOverlayMessage: (msg) => { overlay.push(`upd:${msg}`); },
            hideBusyOverlay: () => { overlay.push('hide'); },
        };
        try {
            const res = await api.promptWhenEnablingLocal();
            assert.strictEqual(res.action, 'installed');
            assert.ok(overlay.some((l) => l.startsWith('show:')));
            assert.ok(overlay.includes('hide'));
            assert.ok(statuses.some((s) => /Downloading/.test(s) || /安装/.test(s)));
        } finally {
            delete globalThis.TransubBusyOverlay;
        }
    });
});
