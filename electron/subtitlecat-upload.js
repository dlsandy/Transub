'use strict';

/**
 * Dev-only: upload current editor SRT to subtitlecat.com catalog.
 * Prefer programmatic multipart POST after discovering the upload form;
 * fall back to an assisted BrowserWindow (CDP file prefills) or openExternal.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app: electronApp, BrowserWindow, shell, clipboard } = require('electron');
const { serializeSubtitle } = require('./subtitle-format');
const { assertSafeExternalUrl } = require('./ipc-validate');

const UPLOAD_PAGE_URL = 'https://www.subtitlecat.com/upload.php';
const DEFAULT_TARGET_LANGUAGE = 'Chinese (Simplified)';
/** Catalog / search branding suffix inserted before `.srt`. */
const UPLOAD_NAME_BRAND_SUFFIX = '.zh-cn(by transub)';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 TransubDev/1';

/** @type {import('electron').BrowserWindow | null} */
let assistWindow = null;

function isDevBuild(app = electronApp) {
    try {
        return !app.isPackaged;
    } catch (_) {
        return false;
    }
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function sanitizeUploadFileName(raw) {
    const input = String(raw || 'subtitle.srt').trim() || 'subtitle.srt';
    const base = path.basename(input);
    let stem = base.replace(/\.[^.]+$/i, '') || 'subtitle';
    // Avoid double branding if re-uploading a previously branded name.
    const brandRe = /\.zh-cn\s*\(\s*by\s*transub\s*\)\s*$/i;
    stem = stem.replace(brandRe, '');
    const cleaned = stem
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160) || 'subtitle';
    return `${cleaned}${UPLOAD_NAME_BRAND_SUFFIX}.srt`;
}

/**
 * @param {string} html
 * @param {string} baseUrl
 * @returns {{
 *   actionUrl: string,
 *   fileField: string,
 *   languageField: string | null,
 *   hiddenFields: Record<string, string>,
 *   submitName: string | null,
 *   submitValue: string | null,
 * } | null}
 */
function parseUploadForm(html, baseUrl = UPLOAD_PAGE_URL) {
    const source = String(html || '');
    if (!source) return null;

    const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
    /** @type {{ attrs: string, body: string }[]} */
    const forms = [];
    let match;
    while ((match = formRe.exec(source))) {
        forms.push({ attrs: match[1] || '', body: match[2] || '' });
    }
    if (!forms.length) return null;

    const withFile = forms.find((form) => /<input\b[^>]*\btype\s*=\s*["']?file["']?/i.test(form.body))
        || forms.find((form) => /<input\b[^>]*\bname\s*=\s*["'][^"']*file[^"']*["']/i.test(form.body));
    if (!withFile) return null;

    const actionMatch = withFile.attrs.match(/\baction\s*=\s*["']([^"']*)["']/i);
    let actionUrl = (actionMatch?.[1] || '').trim() || baseUrl;
    try {
        actionUrl = new URL(actionUrl, baseUrl).toString();
    } catch {
        actionUrl = baseUrl;
    }

    const fileInput = withFile.body.match(/<input\b[^>]*\btype\s*=\s*["']?file["']?[^>]*>/i)
        || withFile.body.match(/<input\b[^>]*\bname\s*=\s*["'][^"']*file[^"']*["'][^>]*>/i);
    const fileFieldMatch = fileInput?.[0]?.match(/\bname\s*=\s*["']([^"']+)["']/i);
    const fileField = (fileFieldMatch?.[1] || 'file').trim() || 'file';

    const selectMatch = withFile.body.match(/<select\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>/i);
    const languageField = selectMatch?.[1]?.trim() || null;

    /** @type {Record<string, string>} */
    const hiddenFields = {};
    const hiddenRe = /<input\b([^>]*\btype\s*=\s*["']hidden["'][^>]*)>/gi;
    let hidden;
    while ((hidden = hiddenRe.exec(withFile.body))) {
        const attrs = hidden[1] || '';
        const name = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
        if (!name) continue;
        const value = attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
        hiddenFields[name] = value;
    }

    const submitEl = withFile.body.match(/<(?:input|button)\b[^>]*\btype\s*=\s*["']?submit["']?[^>]*>/i);
    const submitName = submitEl?.[0]?.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1] || null;
    const submitValue = submitEl?.[0]?.match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1]
        || (/translate/i.test(submitEl?.[0] || '') ? 'translate' : null);

    return {
        actionUrl,
        fileField,
        languageField,
        hiddenFields,
        submitName,
        submitValue,
    };
}

/**
 * @param {string} html
 * @param {string} preferred
 * @returns {string | null}
 */
function pickLanguageOptionValue(html, preferred = DEFAULT_TARGET_LANGUAGE) {
    const source = String(html || '');
    const want = String(preferred || '').trim().toLowerCase();
    const optionRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    /** @type {{ value: string, label: string }[]} */
    const options = [];
    let m;
    while ((m = optionRe.exec(source))) {
        const attrs = m[1] || '';
        const label = String(m[2] || '').replace(/<[^>]+>/g, '').trim();
        const valueAttr = attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1];
        const value = (valueAttr != null ? valueAttr : label).trim();
        if (!value && !label) continue;
        options.push({ value: value || label, label: label || value });
    }
    if (!options.length) return preferred || null;

    const exact = options.find((o) => o.label.toLowerCase() === want || o.value.toLowerCase() === want);
    if (exact) return exact.value;

    const fuzzy = options.find((o) => {
        const blob = `${o.label} ${o.value}`.toLowerCase();
        return blob.includes('chinese (simplified)')
            || blob.includes('simplified chinese')
            || (blob.includes('chinese') && blob.includes('simplified'))
            || blob.includes('zh-cn')
            || blob.includes('zh_cn')
            || blob.includes('简体');
    });
    if (fuzzy) return fuzzy.value;

    if (want) {
        const partial = options.find((o) => {
            const blob = `${o.label} ${o.value}`.toLowerCase();
            return blob.includes(want) || want.includes(blob);
        });
        if (partial) return partial.value;
    }
    return options[0]?.value || preferred || null;
}

/**
 * @returns {typeof fetch}
 */
function getFetch() {
    try {
        const undici = require('undici');
        if (typeof undici.fetch === 'function') return undici.fetch.bind(undici);
    } catch (_) { /* ignore */ }
    if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
    throw new Error('当前环境缺少 fetch，无法访问 SubtitleCat');
}

/**
 * @returns {typeof FormData}
 */
function getFormDataCtor() {
    try {
        const undici = require('undici');
        if (undici.FormData) return undici.FormData;
    } catch (_) { /* ignore */ }
    if (typeof globalThis.FormData === 'function') return globalThis.FormData;
    throw new Error('当前环境缺少 FormData');
}

/**
 * @returns {typeof File}
 */
function getFileCtor() {
    try {
        const undici = require('undici');
        if (undici.File) return undici.File;
    } catch (_) { /* ignore */ }
    if (typeof globalThis.File === 'function') return globalThis.File;
    throw new Error('当前环境缺少 File');
}

/**
 * @param {object} opts
 * @param {string} opts.filePath
 * @param {string} opts.fileName
 * @param {string} [opts.targetLanguage]
 * @param {typeof fetch} [opts.fetchImpl]
 * @returns {Promise<{ ok: boolean, mode?: string, resultUrl?: string, error?: string, detail?: string }>}
 */
async function programmaticUpload(opts = {}) {
    const fetchImpl = opts.fetchImpl || getFetch();
    const filePath = String(opts.filePath || '').trim();
    const fileName = sanitizeUploadFileName(opts.fileName || path.basename(filePath));
    const targetLanguage = String(opts.targetLanguage || DEFAULT_TARGET_LANGUAGE).trim() || DEFAULT_TARGET_LANGUAGE;
    if (!filePath || !fs.existsSync(filePath)) {
        return { ok: false, error: '临时字幕文件不存在' };
    }

    const pageRes = await fetchImpl(UPLOAD_PAGE_URL, {
        method: 'GET',
        headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
    });
    const pageHtml = await pageRes.text();
    if (!pageRes.ok) {
        return { ok: false, error: `打开上传页失败（HTTP ${pageRes.status}）` };
    }

    const form = parseUploadForm(pageHtml, pageRes.url || UPLOAD_PAGE_URL);
    if (!form) {
        return { ok: false, error: '未能解析 SubtitleCat 上传表单' };
    }

    const languageValue = form.languageField
        ? (pickLanguageOptionValue(pageHtml, targetLanguage) || targetLanguage)
        : null;

    const FormDataCtor = getFormDataCtor();
    const FileCtor = getFileCtor();
    const body = new FormDataCtor();
    for (const [k, v] of Object.entries(form.hiddenFields || {})) {
        body.append(k, v);
    }
    const buf = fs.readFileSync(filePath);
    body.append(form.fileField, new FileCtor([buf], fileName, { type: 'application/x-subrip' }));
    if (form.languageField && languageValue != null) {
        body.append(form.languageField, languageValue);
    }
    if (form.submitName) {
        body.append(form.submitName, form.submitValue || 'translate');
    }

    const postRes = await fetchImpl(form.actionUrl, {
        method: 'POST',
        headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
            Referer: UPLOAD_PAGE_URL,
        },
        body,
        redirect: 'follow',
    });
    const finalUrl = String(postRes.url || form.actionUrl);
    const postHtml = await postRes.text().catch(() => '');

    if (/\/subs\//i.test(finalUrl)) {
        return { ok: true, mode: 'http', resultUrl: finalUrl };
    }

    const linked = postHtml.match(/https?:\/\/[^"'>\s]+\/subs\/[^"'>\s]+/i)
        || postHtml.match(/href\s*=\s*["']([^"']*\/subs\/[^"']+)["']/i);
    if (linked) {
        const raw = linked[1] || linked[0];
        try {
            const abs = new URL(raw, finalUrl).toString();
            return { ok: true, mode: 'http', resultUrl: abs };
        } catch (_) { /* ignore */ }
    }

    if (!postRes.ok) {
        return {
            ok: false,
            error: `上传失败（HTTP ${postRes.status}）`,
            detail: finalUrl,
        };
    }

    return {
        ok: false,
        error: '上传已提交，但未识别到结果页；将打开辅助窗口',
        detail: finalUrl,
    };
}

/**
 * @param {import('electron').WebContents} webContents
 * @param {string} filePath
 */
async function setFileInputViaCdp(webContents, filePath) {
    const debuggerApi = webContents.debugger;
    try {
        debuggerApi.attach('1.3');
    } catch (err) {
        if (!/already attached/i.test(String(err?.message || err))) throw err;
    }
    try {
        const doc = await debuggerApi.sendCommand('DOM.getDocument', { depth: -1 });
        const rootId = doc?.root?.nodeId;
        if (!rootId) throw new Error('无法读取页面 DOM');
        const found = await debuggerApi.sendCommand('DOM.querySelector', {
            nodeId: rootId,
            selector: 'input[type="file"]',
        });
        if (!found?.nodeId) throw new Error('上传页未找到文件选择框');
        await debuggerApi.sendCommand('DOM.setFileInputFiles', {
            nodeId: found.nodeId,
            files: [filePath],
        });
    } finally {
        try {
            if (debuggerApi.isAttached()) debuggerApi.detach();
        } catch (_) { /* ignore */ }
    }
}

/**
 * @param {object} opts
 * @param {string} opts.filePath
 * @param {string} [opts.targetLanguage]
 * @param {boolean} [opts.autoSubmit]
 * @returns {Promise<{ ok: boolean, mode: string, resultUrl?: string, error?: string }>}
 */
async function assistUploadInWindow(opts = {}) {
    const filePath = String(opts.filePath || '').trim();
    const targetLanguage = String(opts.targetLanguage || DEFAULT_TARGET_LANGUAGE).trim() || DEFAULT_TARGET_LANGUAGE;
    const autoSubmit = opts.autoSubmit !== false;
    if (!filePath || !fs.existsSync(filePath)) {
        return { ok: false, mode: 'assist', error: '临时字幕文件不存在' };
    }

    if (assistWindow && !assistWindow.isDestroyed()) {
        try {
            assistWindow.close();
        } catch (_) { /* ignore */ }
    }

    const win = new BrowserWindow({
        width: 980,
        height: 820,
        minWidth: 640,
        minHeight: 520,
        show: false,
        title: 'SubtitleCat 上传（开发）',
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    assistWindow = win;
    win.setMenuBarVisibility(false);
    try {
        win.removeMenu();
    } catch (_) { /* ignore */ }

    win.on('closed', () => {
        if (assistWindow === win) assistWindow = null;
    });

    await win.loadURL(UPLOAD_PAGE_URL);
    await setFileInputViaCdp(win.webContents, filePath);

    await win.webContents.executeJavaScript(`(() => {
        const want = ${JSON.stringify(targetLanguage)};
        const wantLower = String(want || '').toLowerCase();
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
            const options = Array.from(sel.options || []);
            let hit = options.find((o) => {
                const label = String(o.textContent || '').trim().toLowerCase();
                const value = String(o.value || '').trim().toLowerCase();
                return label === wantLower || value === wantLower;
            });
            if (!hit) {
                hit = options.find((o) => {
                    const blob = (String(o.textContent || '') + ' ' + String(o.value || '')).toLowerCase();
                    return blob.includes('chinese (simplified)')
                        || blob.includes('simplified')
                        || blob.includes('zh-cn')
                        || blob.includes('简体');
                });
            }
            if (hit) {
                sel.value = hit.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                break;
            }
        }
        ${autoSubmit ? `const form = document.querySelector('form');
        if (form) {
            const submit = form.querySelector('input[type="submit"], button[type="submit"], button');
            if (submit) submit.click();
            else form.submit();
        }` : ''}
        return true;
    })();`, true);

    win.once('ready-to-show', () => {
        if (!win.isDestroyed()) {
            win.show();
            win.focus();
        }
    });
    if (!win.isVisible()) {
        win.show();
        win.focus();
    }

    return {
        ok: true,
        mode: 'assist',
        resultUrl: UPLOAD_PAGE_URL,
    };
}

/**
 * @param {object} payload
 * @param {unknown[]} [payload.cues]
 * @param {string} [payload.fileName]
 * @param {string} [payload.sourcePath]
 * @param {string} [payload.targetLanguage]
 * @param {boolean} [payload.openResult]
 * @param {import('electron').App} [app]
 * @returns {Promise<object>}
 */
async function uploadSubtitleToSubtitleCat(payload = {}, app = electronApp) {
    if (!isDevBuild(app)) {
        return { ok: false, error: '仅开发模式可用', code: 'not_dev' };
    }

    const cues = Array.isArray(payload.cues) ? payload.cues : [];
    if (!cues.length) {
        return { ok: false, error: '字幕内容为空' };
    }

    const targetLanguage = String(payload.targetLanguage || DEFAULT_TARGET_LANGUAGE).trim()
        || DEFAULT_TARGET_LANGUAGE;
    const openResult = payload.openResult !== false;
    const preferredName = payload.fileName
        || payload.sourcePath
        || 'subtitle.srt';
    const fileName = sanitizeUploadFileName(preferredName);

    const tempDir = path.join(os.tmpdir(), 'transub-subtitlecat');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${Date.now()}-${fileName}`);
    const content = serializeSubtitle({ format: 'srt', cues });
    fs.writeFileSync(tempPath, content, 'utf8');

    /** @type {object} */
    let result = { ok: false, error: '未知错误', tempPath, fileName };

    try {
        const httpResult = await programmaticUpload({
            filePath: tempPath,
            fileName,
            targetLanguage,
        });
        if (httpResult.ok && httpResult.resultUrl) {
            result = {
                ok: true,
                mode: 'http',
                resultUrl: httpResult.resultUrl,
                fileName,
                tempPath,
                targetLanguage,
            };
            if (openResult) {
                try {
                    await shell.openExternal(assertSafeExternalUrl(httpResult.resultUrl));
                } catch (err) {
                    result.openError = err.message || String(err);
                }
            }
            return result;
        }

        const assist = await assistUploadInWindow({
            filePath: tempPath,
            targetLanguage,
            autoSubmit: true,
        });
        if (assist.ok) {
            return {
                ok: true,
                mode: 'assist',
                resultUrl: assist.resultUrl || UPLOAD_PAGE_URL,
                fileName,
                tempPath,
                targetLanguage,
                note: httpResult.error || '已打开辅助上传窗口（文件已预填）',
            };
        }

        try {
            clipboard.writeText(tempPath);
        } catch (_) { /* ignore */ }
        try {
            await shell.openExternal(assertSafeExternalUrl(UPLOAD_PAGE_URL));
        } catch (err) {
            return {
                ok: false,
                error: `无法打开 SubtitleCat：${err.message || err}`,
                tempPath,
                fileName,
            };
        }
        return {
            ok: true,
            mode: 'external',
            resultUrl: UPLOAD_PAGE_URL,
            fileName,
            tempPath,
            targetLanguage,
            note: '已打开上传页；临时字幕路径已复制到剪贴板',
        };
    } catch (err) {
        try {
            clipboard.writeText(tempPath);
        } catch (_) { /* ignore */ }
        try {
            await shell.openExternal(assertSafeExternalUrl(UPLOAD_PAGE_URL));
        } catch (_) { /* ignore */ }
        return {
            ok: false,
            error: err.message || String(err),
            tempPath,
            fileName,
            note: '已尝试打开上传页；临时字幕路径已复制到剪贴板（如可用）',
        };
    }
}

module.exports = {
    UPLOAD_PAGE_URL,
    DEFAULT_TARGET_LANGUAGE,
    UPLOAD_NAME_BRAND_SUFFIX,
    isDevBuild,
    sanitizeUploadFileName,
    parseUploadForm,
    pickLanguageOptionValue,
    programmaticUpload,
    assistUploadInWindow,
    uploadSubtitleToSubtitleCat,
};
