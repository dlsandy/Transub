/**
 * Best-effort system font family list (cached ~10 min).
 * Extracted from extensions-bridge.
 *
 * Windows: System.Drawing InstalledFontCollection via PowerShell.
 * Font names are Base64(UTF-8) on the wire so CP936/OEM consoles cannot mojibake CJK names.
 */

const { execFile } = require('child_process');

let _systemFontCache = null;
let _systemFontCacheAt = 0;

function listSystemFontFamilies() {
    const now = Date.now();
    if (_systemFontCache && (now - _systemFontCacheAt) < 10 * 60 * 1000) {
        return Promise.resolve(_systemFontCache);
    }
    return new Promise((resolve) => {
        const finish = (fonts) => {
            const list = Array.from(new Set(
                (Array.isArray(fonts) ? fonts : [])
                    .map((f) => String(f || '').trim())
                    .filter(Boolean),
            )).sort((a, b) => a.localeCompare(b, 'zh-CN'));
            _systemFontCache = list;
            _systemFontCacheAt = Date.now();
            resolve(list);
        };
        if (process.platform === 'win32') {
            const ps = [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); "
                + "$OutputEncoding = [Console]::OutputEncoding; "
                + "Add-Type -AssemblyName System.Drawing; "
                + "[System.Drawing.Text.InstalledFontCollection]::new().Families "
                + "| ForEach-Object { "
                + "[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([string]$_.Name)) "
                + "}",
            ];
            execFile('powershell.exe', ps, {
                windowsHide: true,
                timeout: 15000,
                maxBuffer: 2 * 1024 * 1024,
                encoding: 'utf8',
            }, (err, stdout) => {
                if (err) {
                    finish([]);
                    return;
                }
                const fonts = String(stdout || '')
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((b64) => {
                        try {
                            return Buffer.from(b64, 'base64').toString('utf8');
                        } catch {
                            return '';
                        }
                    })
                    .filter(Boolean);
                finish(fonts);
            });
            return;
        }
        execFile('fc-list', [':family'], {
            timeout: 10000,
            maxBuffer: 2 * 1024 * 1024,
            encoding: 'utf8',
            env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' },
        }, (err, stdout) => {
            if (err) {
                finish([]);
                return;
            }
            const names = [];
            for (const line of String(stdout || '').split(/\r?\n/)) {
                const family = line.split(',')[0].trim();
                if (family) names.push(family);
            }
            finish(names);
        });
    });
}

/**
 * @param {(channel: string, handler: Function) => void} register
 */
function registerExtensionsSystemFontsIpc(register) {
    if (typeof register !== 'function') {
        throw new Error('registerExtensionsSystemFontsIpc: register required');
    }
    register('transub-list-system-fonts', async () => {
        try {
            const fonts = await listSystemFontFamilies();
            return { ok: true, fonts, count: fonts.length };
        } catch (err) {
            return { ok: false, error: err.message || String(err), fonts: [] };
        }
    });
}

module.exports = {
    listSystemFontFamilies,
    registerExtensionsSystemFontsIpc,
};
