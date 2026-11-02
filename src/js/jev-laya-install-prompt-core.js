/**
 * Settings: when enabling local Laya, prompt to install or start OpenDecider.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubJevLayaInstallPrompt = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function jevLayaInstallPromptFactory() {
    function getJev() {
        try {
            return (typeof module !== 'undefined' && module.exports)
                ? require('./jev-decision-core')
                : (typeof globalThis !== 'undefined' && globalThis.TransubJevDecision);
        } catch {
            return null;
        }
    }

    function isLocalAuto(mode, endpointPref) {
        const jev = getJev();
        const m = jev?.normalizeJevDecisionMode
            ? jev.normalizeJevDecisionMode(mode)
            : String(mode || 'auto').toLowerCase();
        if (m !== 'auto') return false;
        const resolved = jev?.resolveJevEndpoint
            ? jev.resolveJevEndpoint(endpointPref || 'local')
            : String(endpointPref || 'local');
        if (jev?.isLocalSystemOneEndpoint) {
            return jev.isLocalSystemOneEndpoint(resolved);
        }
        return /127\.0\.0\.1|localhost/i.test(resolved) || resolved === 'local';
    }

    /**
     * @param {{ reachable?: boolean, installed?: boolean, local?: boolean, mode?: string }} s
     * @returns {'none'|'install'|'start'}
     */
    function nextLocalLayaPrompt(s = {}) {
        if (!isLocalAuto(s.mode, s.endpoint)) return 'none';
        if (s.local === false) return 'none';
        if (s.reachable) return 'none';
        if (s.installed) return 'start';
        return 'install';
    }

    function installDialogCopy() {
        return {
            title: '未安装 Laya',
            message: [
                '本机未检测到 Laya / OpenDecider（System One）。',
                '决策辅助需要单独安装，并监听 127.0.0.1:39283（勿占用 8765 / 39281 / 39282）。',
                '',
                '是否现在安装 OpenDecider 并尝试启动？',
                '（使用内置 opendecider wheel；权重经「模型管理」下载 OpenDecider nano，约 0.8GB，镜像/代理同网络设置。）',
            ].join('\n'),
            primaryLabel: '安装',
            secondaryLabel: '暂不',
        };
    }

    function startDialogCopy() {
        return {
            title: 'Laya 未运行',
            message: [
                '已检测到 OpenDecider，但 39283 上没有服务。',
                '是否现在启动 Laya / System One？',
                '（首次启动会经 HF 镜像下载模型，可能较慢；请保持窗口打开。）',
            ].join('\n'),
            primaryLabel: '启动',
            secondaryLabel: '暂不',
        };
    }

    /**
     * @param {object} deps
     */
    function createJevLayaInstallPrompt(deps) {
        const d = deps || {};
        const electron = d.electron;
        const els = d.els || {};
        const appConfirm = d.appConfirm || (async () => false);
        const markSettingsDirty = d.markSettingsDirty || (() => {});
        const setJevStatus = d.setJevStatus || (() => {});
        const showToast = d.showToast || (() => {});
        const uiTx = d.uiTx || ((s) => s);
        const appendLog = d.appendLog || (() => {});

        function overlayApi() {
            return (typeof globalThis !== 'undefined' && globalThis.TransubBusyOverlay) || {};
        }

        function currentMode() {
            return String(els.jevDecisionModeSelect?.value || 'off');
        }

        function currentEndpoint() {
            return String(els.jevDecisionEndpointInput?.value || 'local').trim() || 'local';
        }

        function revertOff() {
            if (els.jevDecisionModeSelect) els.jevDecisionModeSelect.value = 'off';
            markSettingsDirty(true);
        }

        function appendInstallLog(line) {
            const text = String(line || '').trim();
            if (!text) return;
            const box = els.jevLayaInstallLog;
            if (box) {
                box.classList.remove('hidden');
                const prev = String(box.textContent || '');
                const next = prev ? `${prev}\n${text}` : text;
                box.textContent = next.split('\n').slice(-40).join('\n');
                box.scrollTop = box.scrollHeight;
            }
            setJevStatus(text.length > 80 ? `${text.slice(0, 77)}…` : text, undefined);
            const upd = overlayApi().updateBusyOverlayMessage;
            if (typeof upd === 'function') {
                upd(text.length > 90 ? `${text.slice(0, 87)}…` : text);
            }
            try { appendLog(`Laya：${text}`); } catch { /* ignore */ }
        }

        function subscribeProgress() {
            if (typeof electron?.onAdvancedLayaProgress !== 'function') return () => {};
            return electron.onAdvancedLayaProgress((payload) => {
                appendInstallLog(payload?.message || payload);
            });
        }

        async function runWithOverlay(title, work) {
            const unsub = subscribeProgress();
            const busy = overlayApi();
            const showBusy = busy.showBusyOverlayAndWait || busy.showBusyOverlay
                || (async (msg) => { setJevStatus(msg, undefined); });
            const hideBusy = busy.hideBusyOverlay || (() => {});
            try {
                await showBusy(title);
                appendInstallLog(title);
                return await work();
            } finally {
                try { unsub?.(); } catch { /* ignore */ }
                hideBusy();
            }
        }

        async function runInstall() {
            if (!electron?.transubAdvancedLayaInstall) {
                const msg = uiTx('当前窗口无法安装（请完全退出后重启 Transub）');
                setJevStatus(msg, false);
                showToast(msg, 'err');
                return { action: 'no_ipc' };
            }
            const endpoint = currentEndpoint();
            const res = await runWithOverlay(
                uiTx('正在安装 OpenDecider（pip），请稍候…'),
                () => electron.transubAdvancedLayaInstall({ endpoint, start: true }),
            );
            if (res?.ok) {
                setJevStatus(res.message || uiTx('安装完成'), true);
                showToast(res.message || uiTx('Laya 已就绪'), 'ok');
                return { action: 'installed', status: res };
            }
            const err = [res?.error, res?.hint].filter(Boolean).join(' — ') || uiTx('安装失败');
            setJevStatus(err, false);
            showToast(err, 'err');
            return { action: 'install_failed', error: res?.error };
        }

        async function runStart() {
            if (!electron?.transubAdvancedLayaStart) {
                const msg = uiTx('当前窗口无法启动 Laya（请重启 Transub）');
                setJevStatus(msg, false);
                showToast(msg, 'err');
                return { action: 'no_ipc' };
            }
            const endpoint = currentEndpoint();
            const res = await runWithOverlay(
                uiTx('正在启动 Laya…'),
                () => electron.transubAdvancedLayaStart({ endpoint }),
            );
            if (res?.ok) {
                setJevStatus(res.message || uiTx('Laya 已启动'), true);
                showToast(res.message || uiTx('Laya 已启动'), 'ok');
                return { action: 'started', status: res };
            }
            const err = [res?.error, res?.hint].filter(Boolean).join(' — ') || uiTx('启动失败');
            setJevStatus(err, false);
            showToast(err, 'err');
            return { action: 'start_failed', error: res?.error };
        }

        async function promptWhenEnablingLocal({ skipConfirm = false } = {}) {
            const mode = currentMode();
            const endpoint = currentEndpoint();
            if (!isLocalAuto(mode, endpoint) && !skipConfirm) return { action: 'none' };
            if (!electron?.transubAdvancedLayaLocalStatus) {
                const msg = uiTx('当前窗口无法检测 Laya（请完全退出后重启 Transub）');
                setJevStatus(msg, false);
                showToast(msg, 'err');
                return { action: 'no_ipc' };
            }

            setJevStatus(uiTx('正在检测本机 Laya…'), undefined);
            let status;
            try {
                status = await electron.transubAdvancedLayaLocalStatus({ endpoint });
            } catch (err) {
                setJevStatus(err?.message || uiTx('检测失败'), false);
                showToast(err?.message || uiTx('检测失败'), 'err');
                return { action: 'error', error: err?.message };
            }

            const kind = nextLocalLayaPrompt({
                mode: skipConfirm ? 'auto' : mode,
                endpoint,
                local: status?.local,
                installed: status?.installed,
                reachable: status?.reachable,
            });
            if (kind === 'none') {
                if (status?.reachable) {
                    setJevStatus(uiTx('本机 Laya 可达'), true);
                    showToast(uiTx('本机 Laya 可达'), 'ok');
                }
                return { action: 'ready', status };
            }

            if (kind === 'start') {
                if (!skipConfirm) {
                    const ok = await appConfirm(startDialogCopy());
                    if (!ok) {
                        setJevStatus(uiTx('已跳过启动；任务中将回退启发式 / LLM'), false);
                        return { action: 'skip_start', status };
                    }
                }
                return runStart();
            }

            if (!skipConfirm) {
                const go = await appConfirm(installDialogCopy());
                if (!go) {
                    revertOff();
                    setJevStatus(uiTx('已关闭 Laya 决策辅助'), false);
                    showToast(uiTx('未安装 Laya，已关闭该功能'), 'warn');
                    return { action: 'declined' };
                }
            }
            return runInstall();
        }

        return { promptWhenEnablingLocal, runInstall, runStart };
    }

    return {
        isLocalAuto,
        nextLocalLayaPrompt,
        installDialogCopy,
        startDialogCopy,
        createJevLayaInstallPrompt,
    };
}));
