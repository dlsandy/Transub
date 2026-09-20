/**
 * Auto-scan folder list helpers (pure + light DOM render).
 * Settings: unlimited watch folders + recursive flag; main: log summary text.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAutoScanFolders = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function autoScanFoldersFactory() {
    function normalizePathKey(p) {
        return String(p || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    }

    function normalizeAutoScanFolders(raw) {
        const list = Array.isArray(raw) ? raw : [];
        const out = [];
        const seen = new Set();
        for (const entry of list) {
            const folder = String(entry || '').trim();
            if (!folder) continue;
            const key = normalizePathKey(folder);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(folder);
        }
        return out;
    }

    function formatAutoScanLog({
        added = 0,
        skippedHasSub = 0,
        skippedDup = 0,
        skippedMissingFolder = 0,
        clearedInvalid = 0,
        scanned = 0,
        folderCount = 0,
        folderErrors = [],
    } = {}) {
        const parts = [];
        parts.push(`自动添加：扫描 ${folderCount} 个目录`);
        if (scanned > 0) parts.push(`发现 ${scanned} 个媒体`);
        parts.push(`加入 ${added} 个`);
        if (skippedHasSub > 0) parts.push(`已有字幕跳过 ${skippedHasSub} 个`);
        if (skippedDup > 0) parts.push(`列表已有跳过 ${skippedDup} 个`);
        if (clearedInvalid > 0) parts.push(`清除失效 ${clearedInvalid} 个`);
        if (skippedMissingFolder > 0) parts.push(`无效目录 ${skippedMissingFolder} 个`);
        const errN = Array.isArray(folderErrors) ? folderErrors.length : 0;
        if (errN > 0 && skippedMissingFolder === 0) parts.push(`目录错误 ${errN} 个`);
        return parts.join('，');
    }

    function renderAutoScanFoldersList(host, folders, { onRemove } = {}) {
        if (!host) return;
        const list = normalizeAutoScanFolders(folders);
        host.replaceChildren();
        if (!list.length) {
            const empty = document.createElement('p');
            empty.className = 'text-xs text-gray-500 leading-relaxed';
            empty.textContent = '尚未添加目录。点击下方「添加目录」选择要监视的文件夹。';
            host.appendChild(empty);
            return;
        }
        list.forEach((folder, index) => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white/70';
            row.dataset.folderIndex = String(index);

            const pathEl = document.createElement('div');
            pathEl.className = 'flex-1 min-w-0 text-sm text-gray-800 truncate';
            pathEl.title = folder;
            pathEl.textContent = folder;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'shrink-0 px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded';
            removeBtn.title = '移除此目录';
            removeBtn.setAttribute('aria-label', `移除目录 ${folder}`);
            removeBtn.innerHTML = '<i class="fa fa-trash-o" aria-hidden="true"></i>';
            removeBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (typeof onRemove === 'function') onRemove(index, folder);
            });

            row.appendChild(pathEl);
            row.appendChild(removeBtn);
            host.appendChild(row);
        });
    }

    /**
     * Scan configured folders for media lacking subtitles and add them to the queue.
     * @param {{
     *   electron?: { transWithAiAutoScanFolders?: (p: object) => Promise<any> },
     *   els?: { autoScanRecursiveCheck?: HTMLInputElement|null },
     *   getFoldersDraft?: () => string[],
     *   setFoldersDraft?: (folders: string[]) => void,
     *   getSavedOptionsSnapshot?: () => { autoScanFolders?: string[], autoScanRecursive?: boolean }|null,
     *   refreshFoldersListUi?: () => void,
     *   resolveOutputDirFromForm?: () => string,
     *   addFiles?: (paths: string[]) => Promise<void>|void,
     *   getItemCount?: () => number,
     *   clearInvalidFiles?: () => Promise<{ removed?: number }|void>|void,
     *   setLoading?: (busy: boolean, msg?: string) => void,
     *   appendLog?: (msg: string, tone?: string) => void,
     *   showToast?: (msg: string, tone?: string) => void,
     *   openAppSettings?: (tab?: string) => void,
     * }} [deps]
     */
    async function runAutoAddMissingSubtitles(deps = {}) {
        const electron = deps.electron;
        const els = deps.els || {};
        const getFoldersDraft = deps.getFoldersDraft || (() => []);
        const setFoldersDraft = deps.setFoldersDraft || (() => {});
        const getSavedOptionsSnapshot = deps.getSavedOptionsSnapshot || (() => null);
        const refreshFoldersListUi = deps.refreshFoldersListUi || (() => {});
        const resolveOutputDirFromForm = deps.resolveOutputDirFromForm || (() => '');
        const addFiles = deps.addFiles || (async () => {});
        const getItemCount = deps.getItemCount || (() => 0);
        const clearInvalidFiles = deps.clearInvalidFiles || (async () => ({ removed: 0 }));
        const setLoading = deps.setLoading || (() => {});
        const appendLog = deps.appendLog || (() => {});
        const showToast = deps.showToast || (() => {});
        const openAppSettings = deps.openAppSettings || (() => {});

        let clearedInvalid = 0;
        try {
            const cleared = await clearInvalidFiles();
            clearedInvalid = Math.max(0, Number(cleared?.removed) || 0);
        } catch (err) {
            appendLog(`清除失效文件失败：${err?.message || err}`, 'warn');
        }

        let folders = normalizeAutoScanFolders(getFoldersDraft());
        if (!folders.length) {
            const saved = normalizeAutoScanFolders(getSavedOptionsSnapshot()?.autoScanFolders);
            if (saved.length) {
                folders = saved;
                setFoldersDraft(saved);
                refreshFoldersListUi();
            }
        }
        if (!folders.length) {
            appendLog('自动添加：请先在设置 → 扫描目录 中添加至少一个目录', 'warn');
            showToast('请先在设置中配置扫描目录', 'warn');
            openAppSettings('auto-scan');
            return;
        }
        const snapshot = getSavedOptionsSnapshot();
        const recursive = els.autoScanRecursiveCheck
            ? !!els.autoScanRecursiveCheck.checked
            : (snapshot?.autoScanRecursive !== false);
        const outputDir = resolveOutputDirFromForm();
        setLoading(true, '正在扫描无字幕媒体…');
        let scan;
        try {
            scan = await electron?.transWithAiAutoScanFolders?.({
                folders,
                recursive,
                outputDir,
            });
        } finally {
            setLoading(false);
        }
        if (!scan?.ok) {
            appendLog(scan?.error || '自动扫描失败', 'err');
            return;
        }
        const paths = Array.isArray(scan.files) ? scan.files : [];
        const before = getItemCount();
        if (paths.length) await addFiles(paths);
        const added = getItemCount() - before;
        const skippedDup = Math.max(0, paths.length - added);
        const logLine = formatAutoScanLog({
            added,
            skippedHasSub: scan.skippedHasSub || 0,
            skippedDup,
            skippedMissingFolder: scan.skippedMissingFolder || 0,
            clearedInvalid,
            scanned: scan.scanned || 0,
            folderCount: scan.folderCount || folders.length,
            folderErrors: scan.folderErrors || [],
        });
        appendLog(logLine, added > 0 || clearedInvalid > 0 ? 'info' : 'warn');
        if (Array.isArray(scan.folderErrors) && scan.folderErrors.length) {
            for (const err of scan.folderErrors.slice(0, 5)) {
                appendLog(`扫描目录无效：${err.folder}（${err.error || '未知错误'}）`, 'warn');
            }
        }
    }

    return {
        normalizeAutoScanFolders,
        formatAutoScanLog,
        renderAutoScanFoldersList,
        normalizePathKey,
        runAutoAddMissingSubtitles,
    };
}));
