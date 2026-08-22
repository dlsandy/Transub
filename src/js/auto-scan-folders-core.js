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

    return {
        normalizeAutoScanFolders,
        formatAutoScanLog,
        renderAutoScanFoldersList,
        normalizePathKey,
    };
}));
