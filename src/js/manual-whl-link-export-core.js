/**
 * Build plain-text URL lists for IDM / aria2 / Motrix / Thunder batch import.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubManualWhlLinkExport = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function manualWhlLinkExportFactory() {
    function itemPreferredUrl(item) {
        const it = item && typeof item === 'object' ? item : {};
        return String(it.defaultUrl || it.mirrorUrl || it.officialUrl || '').trim();
    }

    function itemFileName(item) {
        const it = item && typeof item === 'object' ? item : {};
        const named = String(it.fileName || '').trim();
        if (named) return named;
        const url = itemPreferredUrl(it);
        if (!url) return '';
        try {
            const pathPart = String(url).split(/[?#]/)[0];
            const base = pathPart.split('/').pop() || '';
            return decodeURIComponent(base);
        } catch {
            return '';
        }
    }

    /**
     * Unique download URLs (preferred mirror first), one per package.
     * @param {Array<object>} items
     * @returns {string[]}
     */
    function collectManualWhlUrls(items) {
        const list = Array.isArray(items) ? items : [];
        const urls = [];
        const seen = new Set();
        for (const it of list) {
            const url = itemPreferredUrl(it);
            if (!url) continue;
            const key = url.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            urls.push(url);
        }
        return urls;
    }

    /**
     * Text block for download managers: header comments + one URL per line.
     * @param {Array<object>} items
     * @param {{ title?: string, includeOfficialComments?: boolean }} [opts]
     */
    function buildManualWhlLinkExportText(items, opts = {}) {
        const list = Array.isArray(items) ? items : [];
        const title = String(opts.title || 'Transub 手动下载链接').trim();
        const includeOfficial = opts.includeOfficialComments !== false;
        const lines = [
            `# ${title}`,
            '# 用法：整段复制到 IDM / Motrix / aria2 / 迅雷等「批量导入」；每行一个链接。',
            '# 优先镜像直链；需要官方源时可看下方 # official: 注释。',
            '',
        ];
        const seen = new Set();
        for (const it of list) {
            const url = itemPreferredUrl(it);
            if (!url) continue;
            const key = url.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const name = itemFileName(it) || String(it.name || it.id || '').trim();
            const group = String(it.group || it.kind || '').trim();
            if (name || group) {
                lines.push(`# ${[group, name].filter(Boolean).join(' · ')}`);
            }
            lines.push(url);
            if (includeOfficial) {
                const official = String(it.officialUrl || '').trim();
                if (official && official.toLowerCase() !== key) {
                    lines.push(`# official: ${official}`);
                }
            }
            lines.push('');
        }
        if (seen.size === 0) {
            lines.push('# （当前清单没有可导出的直链）');
            lines.push('');
        }
        return lines.join('\n');
    }

    function defaultExportFileName(kind) {
        const k = String(kind || 'wheels').trim().replace(/[^\w.-]+/g, '-') || 'wheels';
        return `transub-manual-${k}-urls.txt`;
    }

    /**
     * Classic Thunder task URL for a single http(s) link.
     * @param {string} httpUrl
     * @returns {string}
     */
    function buildThunderUrl(httpUrl) {
        const url = String(httpUrl || '').trim();
        if (!/^https?:\/\//i.test(url)) return '';
        const raw = `AA${url}ZZ`;
        try {
            if (typeof Buffer !== 'undefined') {
                return `thunder://${Buffer.from(raw, 'utf8').toString('base64')}`;
            }
            if (typeof btoa === 'function') {
                return `thunder://${btoa(raw)}`;
            }
        } catch {
            return '';
        }
        return '';
    }

    return {
        itemPreferredUrl,
        itemFileName,
        collectManualWhlUrls,
        buildManualWhlLinkExportText,
        defaultExportFileName,
        buildThunderUrl,
        DOWNLOAD_TOOLS: Object.freeze([
            Object.freeze({ id: 'thunder', label: '迅雷下载' }),
            Object.freeze({ id: 'idm', label: 'IDM 下载' }),
            Object.freeze({ id: 'motrix', label: 'Motrix 下载' }),
        ]),
    };
}));
