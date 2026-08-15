/**
 * Path / HTML / duration helpers shared by the main batch UI.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubAppPathUtils = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function appPathUtilsFactory() {
    function basename(p) {
        return String(p || '').split(/[/\\]/).pop() || '—';
    }

    function normPath(p) {
        return String(p || '').replace(/\//g, '\\').toLowerCase();
    }

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatDuration(sec) {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const r = s % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
        return `${m}:${String(r).padStart(2, '0')}`;
    }

    function pathDirname(filePath) {
        const p = String(filePath || '');
        const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
        return i >= 0 ? p.slice(0, i) : '';
    }

    function pathJoin(dir, name) {
        const d = String(dir || '');
        const n = String(name || '');
        if (!d) return n;
        const sep = d.includes('/') && !d.includes('\\') ? '/' : '\\';
        return d.endsWith('/') || d.endsWith('\\') ? `${d}${n}` : `${d}${sep}${n}`;
    }

    function stemNoExt(filePath) {
        const base = basename(filePath);
        const dot = base.lastIndexOf('.');
        return dot > 0 ? base.slice(0, dot) : base;
    }

    return {
        basename,
        normPath,
        esc,
        formatDuration,
        pathDirname,
        pathJoin,
        stemNoExt,
    };
}));
