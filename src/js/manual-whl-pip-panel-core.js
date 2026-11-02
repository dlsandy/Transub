/**
 * Manual-repair pip command helpers (ROCm / CUDA / Whisper etc.).
 * Keeps merge + status copy out of the modal shell.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubManualWhlPipPanel = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function manualWhlPipPanelFactory() {
    const DOWNLOAD_INFO_TIMEOUT_MS = 30000;

    function trimPipCommand(value) {
        return String(value || '').trim();
    }

    function expectedRuntimePythonPath(installPath) {
        const root = String(installPath || '').trim().replace(/[\\/]+$/, '');
        if (!root) return 'transub-engine\\runtime\\python.exe';
        const sep = root.includes('/') && !root.includes('\\') ? '/' : '\\';
        return `${root}${sep}runtime${sep}python.exe`;
    }

    function buildMissingRuntimePythonBanner(info = {}) {
        const expected = String(info.runtimePythonExpected || '').trim()
            || expectedRuntimePythonPath(info.engineInstallPath || info.folder || '');
        return [
            '引擎不完整：找不到 runtime\\python.exe。',
            `期望路径：${expected}`,
            '请重新下载完整安装包并完整解压；检查杀毒是否隔离了 transub-engine\\runtime。',
            '缺少该文件时，ROCm / CUDA / XPU 无法装进本软件引擎（系统 Python 无效）。',
        ].join('\n');
    }

    /**
     * Merge per-kind download-info payloads into one modal state.info.
     * Preserves pipCommand (joined) and runtime-python flags — unlike a bare items merge.
     * @param {Array<object>} parts
     * @param {{ kindList?: string[], kindLabel?: (k: string) => string }} [opts]
     */
    function mergeManualDownloadInfoParts(parts, opts = {}) {
        const list = Array.isArray(parts) ? parts.filter(Boolean) : [];
        const kindList = Array.isArray(opts.kindList) ? opts.kindList : [];
        const kindLabel = typeof opts.kindLabel === 'function'
            ? opts.kindLabel
            : (k) => String(k || '');
        const mergedItems = [];
        const pipCommands = [];
        let folder = '';
        let wheelHint = '';
        let title = '';
        let runtimePythonMissing = false;
        let runtimePythonExpected = '';
        let engineInstallPath = '';

        for (const part of list) {
            const info = part && typeof part === 'object' ? (part.info || part) : null;
            if (!info || typeof info !== 'object') continue;
            folder = folder || String(info.folder || '').trim();
            title = title || String(info.title || '').trim();
            wheelHint = wheelHint || String(info.wheelHint || info.hint || '').trim();
            engineInstallPath = engineInstallPath
                || String(info.engineInstallPath || '').trim();
            if (info.runtimePythonMissing) runtimePythonMissing = true;
            if (!runtimePythonExpected) {
                runtimePythonExpected = String(info.runtimePythonExpected || '').trim();
            }
            const pip = trimPipCommand(info.pipCommand);
            if (pip) pipCommands.push(pip);
            const items = Array.isArray(info.items) ? info.items : [];
            const partKind = String(info.kind || '').trim();
            for (const it of items) {
                const key = `${it.id || ''}::${it.fileName || it.defaultUrl || ''}`;
                if (mergedItems.some((x) => `${x.id || ''}::${x.fileName || x.defaultUrl || ''}` === key)) {
                    continue;
                }
                mergedItems.push({
                    ...it,
                    group: it.group || kindLabel(it.kind || partKind),
                    kind: it.kind || partKind,
                });
            }
        }

        if (!runtimePythonExpected && engineInstallPath) {
            runtimePythonExpected = expectedRuntimePythonPath(engineInstallPath);
        }

        const pipCommand = pipCommands.join('\n\n');
        const multi = kindList.length > 1;
        return {
            kind: kindList.length === 1 ? kindList[0] : 'bundle',
            title,
            folder,
            engineInstallPath,
            runtimePythonMissing,
            runtimePythonExpected,
            pipCommand,
            wheelHint: multi
                ? '按分组下载所需 .whl（可多选后一次安装）。重复的包只需下一份。'
                : (wheelHint || '请下载对应 .whl，再选择本地文件安装。'),
            hint: wheelHint,
            items: mergedItems,
        };
    }

    /**
     * Status line after catalog load (or while loading).
     * @returns {{ message: string, tone: 'info'|'warn'|'ok'|'err' }}
     */
    function resolveManualCatalogStatus(info, { loading = false } = {}) {
        if (loading) {
            return { message: '正在加载下载清单…', tone: 'info' };
        }
        const src = info && typeof info === 'object' ? info : {};
        if (src.runtimePythonMissing) {
            return {
                message: '引擎 runtime\\python.exe 缺失，请先重装/重新解压完整包',
                tone: 'err',
            };
        }
        const items = Array.isArray(src.items) ? src.items : [];
        const pip = trimPipCommand(src.pipCommand);
        if (!items.length && pip) {
            return {
                message: '无直链清单：请复制下方 pip 命令，在 cmd.exe 中执行（勿用 PowerShell）',
                tone: 'warn',
            };
        }
        if (!items.length && !pip) {
            return { message: '未获取到下载清单，请关闭后重试或检查引擎路径', tone: 'warn' };
        }
        if (pip) {
            return {
                message: `已加载 ${items.length} 个包；也可复制下方 pip 命令安装`,
                tone: 'info',
            };
        }
        return { message: `已加载 ${items.length} 个包，可复制链接或选择本地 .whl`, tone: 'info' };
    }

    function emptyPackageListMessage(info) {
        const src = info && typeof info === 'object' ? info : {};
        if (trimPipCommand(src.pipCommand)) {
            return '无独立 .whl 直链清单。请复制上方 pip 命令，在 cmd.exe 中安装（AMD ROCm / Intel XPU 等场景）。';
        }
        return '暂无镜像清单，请自行在浏览器搜索对应包的 win_amd64 .whl。';
    }

    function withTimeout(promise, ms = DOWNLOAD_INFO_TIMEOUT_MS, label = '下载清单超时') {
        const timeoutMs = Math.max(1000, Number(ms) || DOWNLOAD_INFO_TIMEOUT_MS);
        let timer = 0;
        const guarded = Promise.resolve(promise);
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`${label}（${Math.round(timeoutMs / 1000)}s）`));
            }, timeoutMs);
            if (typeof timer === 'object' && typeof timer.unref === 'function') {
                timer.unref();
            }
        });
        return Promise.race([guarded, timeout]).finally(() => {
            if (timer) clearTimeout(timer);
        });
    }

    return {
        DOWNLOAD_INFO_TIMEOUT_MS,
        trimPipCommand,
        expectedRuntimePythonPath,
        buildMissingRuntimePythonBanner,
        mergeManualDownloadInfoParts,
        resolveManualCatalogStatus,
        emptyPackageListMessage,
        withTimeout,
    };
}));
