/**
 * Build Transub CLI snippets for shell / Jasna post-export hooks (pure).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubCliCommand = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function cliCommandCoreFactory() {
    const CLI_KINDS = Object.freeze(['regular', 'jasna']);

    const CLI_KIND_LABELS = Object.freeze({
        regular: '常规',
        jasna: 'Jasna',
    });

    function normalizeCliKind(value) {
        const raw = String(value || '').trim().toLowerCase();
        return CLI_KINDS.includes(raw) ? raw : 'regular';
    }

    function quoteWindowsArg(raw) {
        const s = String(raw ?? '').trim();
        if (!s) return '""';
        if (s.startsWith('"') && s.endsWith('"')) return s;
        return `"${s.replace(/"/g, '\\"')}"`;
    }

    function normalizeMediaPaths(list) {
        if (!Array.isArray(list)) return [];
        const out = [];
        const seen = new Set();
        for (const entry of list) {
            const p = String(entry || '').trim();
            if (!p) continue;
            const key = p.replace(/\\/g, '/').toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(p);
        }
        return out;
    }

    /**
     * @param {{ transubExe?: string, packaged?: boolean, projectRoot?: string }} launcher
     */
    function resolveTransubExe(launcher = {}) {
        const exe = String(launcher.transubExe || '').trim();
        if (exe) return exe;
        return 'D:\\Transub\\transub.exe';
    }

    function buildRegularTransubCommand(launcher = {}, mediaPaths = []) {
        const paths = normalizeMediaPaths(mediaPaths);
        const exe = resolveTransubExe(launcher);
        const exeQuoted = quoteWindowsArg(exe);
        const filesArg = paths.length
            ? paths.join('|')
            : 'D:\\path\\to\\video.mkv';
        const pathHint = launcher.packaged === false
            ? '将 transub.exe 路径替换为实际解压/安装目录；'
            : '';
        const selectionHint = paths.length
            ? `已包含 ${paths.length} 个选中媒体；`
            : '将示例媒体路径替换为实际文件，或在任务列表选中条目后再生成；';
        return {
            kind: 'regular',
            command: `${exeQuoted} --files=${quoteWindowsArg(filesArg)}`,
            hint: `${pathHint}${selectionHint}在 cmd / PowerShell 中运行，或写入脚本。`,
            usesSelection: paths.length > 0,
        };
    }

    /** Jasna: run after each restored video (--post-export-video-command / GUI「每条视频完成后」). */
    function buildJasnaTransubCommand(launcher = {}) {
        const exe = resolveTransubExe(launcher);
        const exeQuoted = quoteWindowsArg(exe);
        const perVideo = `${exeQuoted} --files={output}`;
        const cliExample = [
            'jasna --input 输入文件夹 --output 输出文件夹 \\',
            `  --post-export-video-command ${quoteWindowsArg(`${exeQuoted} --files={output}`)}`,
        ].join('\n');
        return {
            kind: 'jasna',
            command: perVideo,
            cliExample,
            hint: '粘贴到 Jasna → Post-export →「Command after each video」（每条视频完成后）。'
                + ' Jasna 会在每条视频导出完成后，将 {output} 替换为该条输出文件的绝对路径（已自动加引号）。'
                + ' 也可在 CLI 使用 --post-export-video-command。',
            usesSelection: false,
        };
    }

    function buildCliCommand(kind, launcher = {}, mediaPaths = []) {
        return normalizeCliKind(kind) === 'jasna'
            ? buildJasnaTransubCommand(launcher)
            : buildRegularTransubCommand(launcher, mediaPaths);
    }

    return {
        CLI_KINDS,
        CLI_KIND_LABELS,
        normalizeCliKind,
        quoteWindowsArg,
        normalizeMediaPaths,
        buildRegularTransubCommand,
        buildJasnaTransubCommand,
        buildCliCommand,
    };
}));
