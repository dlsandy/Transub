'use strict';

/**
 * Launch external download managers for manual .whl URL lists.
 * Thunder previously only opened the first ~6 tasks — open every URL (paced).
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function normalizeHttpUrls(list) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(list) ? list : []) {
        const url = String(raw || '').trim();
        if (!/^https?:\/\//i.test(url)) continue;
        const key = url.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(url);
    }
    return out;
}

function toThunderUrl(httpUrl) {
    const url = String(httpUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) return '';
    const raw = `AA${url}ZZ`;
    return `thunder://${Buffer.from(raw, 'utf8').toString('base64')}`;
}

function firstExisting(paths) {
    for (const p of paths) {
        const s = String(p || '').trim();
        if (!s) continue;
        try {
            if (fs.existsSync(s)) return s;
        } catch { /* ignore */ }
    }
    return '';
}

function findIdmExe() {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';
    return firstExisting([
        path.join(pf, 'Internet Download Manager', 'IDMan.exe'),
        path.join(pf86, 'Internet Download Manager', 'IDMan.exe'),
        local ? path.join(local, 'Programs', 'Internet Download Manager', 'IDMan.exe') : '',
    ]);
}

function findMotrixExe() {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const local = process.env.LOCALAPPDATA || '';
    return firstExisting([
        path.join(pf, 'Motrix', 'Motrix.exe'),
        local ? path.join(local, 'Programs', 'Motrix', 'Motrix.exe') : '',
        local ? path.join(local, 'motrix', 'Motrix.exe') : '',
    ]);
}

/**
 * @param {{ openExternal: (url: string) => Promise<void> }} shell
 * @param {string[]} urls
 * @param {{ delayMs?: number }} [opts]
 */
async function openThunderUrls(shell, urls, opts = {}) {
    const list = normalizeHttpUrls(urls);
    if (!list.length) return { ok: false, error: '没有可下载的链接', opened: 0, total: 0 };
    const delayMs = opts.delayMs != null ? Number(opts.delayMs) : 100;
    let opened = 0;
    const errors = [];
    for (const u of list) {
        const thunder = toThunderUrl(u);
        if (!thunder) continue;
        try {
            await shell.openExternal(thunder);
            opened += 1;
            if (delayMs > 0 && opened < list.length) await sleep(delayMs);
        } catch (err) {
            errors.push(err?.message || String(err));
        }
    }
    if (!opened) {
        return {
            ok: false,
            error: errors[0] || '唤起迅雷失败',
            opened: 0,
            total: list.length,
        };
    }
    return {
        ok: true,
        opened,
        total: list.length,
        tool: 'thunder',
        truncated: false,
        errors: errors.slice(0, 3),
    };
}

/**
 * IDM: IDMan.exe /d URL /n  (add without confirming for each when possible).
 * @param {string[]} urls
 * @param {{ delayMs?: number }} [opts]
 */
async function openIdmUrls(urls, opts = {}) {
    const list = normalizeHttpUrls(urls);
    if (!list.length) return { ok: false, error: '没有可下载的链接', opened: 0, total: 0 };
    const exe = findIdmExe();
    if (!exe) {
        return {
            ok: false,
            error: '未找到 IDM（Internet Download Manager）',
            opened: 0,
            total: list.length,
            missingApp: true,
            tool: 'idm',
        };
    }
    const delayMs = opts.delayMs != null ? Number(opts.delayMs) : 80;
    let opened = 0;
    for (const u of list) {
        try {
            const child = spawn(exe, ['/d', u, '/n'], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
            });
            child.unref();
            opened += 1;
            if (delayMs > 0 && opened < list.length) await sleep(delayMs);
        } catch { /* ignore per-url */ }
    }
    return {
        ok: opened > 0,
        opened,
        total: list.length,
        tool: 'idm',
        error: opened > 0 ? undefined : '无法向 IDM 添加任务',
    };
}

/**
 * Motrix: best-effort open app; tasks rely on clipboard paste / new-task URI when available.
 * @param {{ openExternal: (url: string) => Promise<void>, openPath?: (p: string) => Promise<string> }} shell
 * @param {string[]} urls
 */
async function openMotrixUrls(shell, urls) {
    const list = normalizeHttpUrls(urls);
    if (!list.length) return { ok: false, error: '没有可下载的链接', opened: 0, total: 0 };
    const exe = findMotrixExe();
    let launched = false;
    if (exe && typeof shell.openPath === 'function') {
        try {
            const err = await shell.openPath(exe);
            launched = !err;
        } catch { /* ignore */ }
    }
    if (!launched) {
        try {
            await shell.openExternal('motrix://');
            launched = true;
        } catch { /* ignore */ }
    }
    // Prefer clipboard paste in Motrix; optionally seed first task via URI if supported.
    if (list[0]) {
        try {
            await shell.openExternal(`motrix://new-task?url=${encodeURIComponent(list[0])}`);
        } catch { /* protocol may be unsupported */ }
    }
    return {
        ok: true,
        opened: launched ? 1 : 0,
        total: list.length,
        tool: 'motrix',
        missingApp: !exe && !launched,
        clipboardExpected: true,
        error: launched || exe
            ? undefined
            : '未找到 Motrix；链接已复制，请在 Motrix 中新建任务并粘贴',
    };
}

/**
 * @param {'thunder'|'idm'|'motrix'} tool
 * @param {string[]} urls
 * @param {{ shell: object }} deps
 */
async function openDownloadTool(tool, urls, deps = {}) {
    const shell = deps.shell;
    if (!shell?.openExternal) {
        return { ok: false, error: 'shell_unavailable' };
    }
    const id = String(tool || '').trim().toLowerCase();
    if (id === 'thunder' || id === 'xunlei') {
        return openThunderUrls(shell, urls);
    }
    if (id === 'idm') {
        return openIdmUrls(urls);
    }
    if (id === 'motrix') {
        return openMotrixUrls(shell, urls);
    }
    return { ok: false, error: `未知下载工具：${id}` };
}

module.exports = {
    normalizeHttpUrls,
    toThunderUrl,
    findIdmExe,
    findMotrixExe,
    openThunderUrls,
    openIdmUrls,
    openMotrixUrls,
    openDownloadTool,
};
