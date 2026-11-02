/**
 * First-run Hugging Face endpoint:
 * seed domestic mirror when unset; preserve an existing saved preference.
 * Manual 测速 still uses pickBestHfEndpoint via transub-pick-hf-endpoint.
 */
const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');
const {
    loadSettings,
    patchSettings,
} = require('./settings-data');
const {
    DEFAULT_HF_MIRROR_ENDPOINT,
} = require('./proxy-settings');

const STAMP_FILE_NAME = 'hf-endpoint-autopick.json';

/** @type {Promise<object>|null} */
let inflight = null;

function getStampPath(writableRoot = '') {
    const root = String(writableRoot || '').trim() || getWritableRoot();
    return path.join(root, STAMP_FILE_NAME);
}

function readStamp(writableRoot = '') {
    try {
        const filePath = getStampPath(writableRoot);
        if (!fs.existsSync(filePath)) return null;
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!raw || typeof raw !== 'object' || !raw.done) return null;
        return {
            done: true,
            hfEndpoint: raw.hfEndpoint != null
                ? String(raw.hfEndpoint).trim().replace(/\/+$/, '')
                : '',
            label: String(raw.label || ''),
            latencyMs: Number.isFinite(raw.latencyMs) ? raw.latencyMs : null,
            preserved: !!raw.preserved,
            fallback: !!raw.fallback,
            updatedAt: String(raw.updatedAt || ''),
        };
    } catch {
        return null;
    }
}

function writeStamp(payload = {}, writableRoot = '') {
    const filePath = getStampPath(writableRoot);
    const next = {
        done: true,
        hfEndpoint: payload.hfEndpoint != null
            ? String(payload.hfEndpoint).trim().replace(/\/+$/, '')
            : '',
        label: String(payload.label || ''),
        latencyMs: Number.isFinite(payload.latencyMs) ? payload.latencyMs : null,
        preserved: !!payload.preserved,
        fallback: !!payload.fallback,
        updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
}

function optionsHaveHfEndpointKey(options) {
    return !!(options && typeof options === 'object'
        && Object.prototype.hasOwnProperty.call(options, 'engineHfEndpoint'));
}

function broadcastSettingsUpdated(options) {
    try {
        const { BrowserWindow } = require('electron');
        for (const win of BrowserWindow.getAllWindows()) {
            try {
                win.webContents.send('transub-settings-updated', { options });
            } catch (_) { /* ignore */ }
        }
    } catch (_) { /* ignore */ }
}

/**
 * @param {{
 *   force?: boolean,
 *   proxyEnabled?: boolean,
 *   proxyUrl?: string,
 *   proxyBypass?: string,
 *   getAppRoot?: Function,
 *   pickFn?: Function,
 * }} [opts]
 */
async function ensureFirstRunHfEndpoint(opts = {}) {
    const options = opts && typeof opts === 'object' ? opts : {};
    const writableRoot = String(options.writableRoot || '').trim();
    if (!options.force) {
        const stamp = readStamp(writableRoot);
        if (stamp?.done) {
            return {
                ok: true,
                skipped: true,
                already: true,
                hfEndpoint: stamp.hfEndpoint,
                label: stamp.label,
                latencyMs: stamp.latencyMs,
                preserved: stamp.preserved,
                fallback: stamp.fallback,
                message: stamp.preserved
                    ? '已保留本机 Hugging Face 镜像设置'
                    : `下载源：${stamp.label || stamp.hfEndpoint || '国内镜像'}`,
            };
        }
    }
    if (inflight) return inflight;

    inflight = (async () => {
        const getAppRoot = typeof options.getAppRoot === 'function'
            ? options.getAppRoot
            : (() => writableRoot || getWritableRoot());

        // Upgrade / returning install: keep existing saved preference (incl. empty = official).
        // Only inspect the current writable settings file — not legacy AppData / install copies.
        const settingsPath = writableRoot
            ? path.join(writableRoot, require('./settings-data').SETTINGS_FILE_NAME)
            : require('./settings-data').getSettingsFilePath(getAppRoot);
        if (!options.force && fs.existsSync(settingsPath)) {
            const loaded = loadSettings(getAppRoot, { clone: true });
            const current = loaded?.options || {};
            if (optionsHaveHfEndpointKey(current)) {
                const hfEndpoint = String(current.engineHfEndpoint || '').trim().replace(/\/+$/, '');
                const stamp = writeStamp({
                    hfEndpoint,
                    label: hfEndpoint ? '已保存镜像' : '官方 Hub',
                    preserved: true,
                    fallback: false,
                }, writableRoot);
                return {
                    ok: true,
                    skipped: true,
                    preserved: true,
                    hfEndpoint: stamp.hfEndpoint,
                    label: stamp.label,
                    message: '已保留本机 Hugging Face 镜像设置',
                };
            }
        }

        // Cold start / force: default domestic mirror. Optional pickFn (tests / 测速) may override.
        let pick;
        try {
            if (typeof options.pickFn === 'function') {
                const loaded = loadSettings(getAppRoot, { clone: true });
                const current = loaded?.options || {};
                const proxyOpts = {
                    proxyEnabled: options.proxyEnabled != null
                        ? !!options.proxyEnabled
                        : !!current.proxyEnabled,
                    proxyUrl: options.proxyUrl != null
                        ? String(options.proxyUrl || '').trim()
                        : String(current.proxyUrl || '').trim(),
                    proxyBypass: options.proxyBypass != null
                        ? String(options.proxyBypass || '').trim()
                        : String(current.proxyBypass || '').trim(),
                };
                pick = await options.pickFn(proxyOpts);
            } else {
                pick = {
                    ok: true,
                    hfEndpoint: DEFAULT_HF_MIRROR_ENDPOINT,
                    label: '国内镜像',
                    latencyMs: null,
                    fallback: false,
                    message: '下载源：国内镜像（默认）',
                };
            }
        } catch (err) {
            pick = {
                ok: false,
                fallback: true,
                hfEndpoint: DEFAULT_HF_MIRROR_ENDPOINT,
                label: '国内镜像',
                latencyMs: null,
                message: '测速失败，已回退国内镜像；可稍后在设置 → 网络调整',
                error: err?.message || String(err),
            };
        }

        const hfEndpoint = pick.hfEndpoint != null
            ? String(pick.hfEndpoint).trim().replace(/\/+$/, '')
            : DEFAULT_HF_MIRROR_ENDPOINT;

        try {
            const loaded = loadSettings(getAppRoot, { clone: true });
            const current = loaded?.options || {};
            const saved = patchSettings(getAppRoot, { engineHfEndpoint: hfEndpoint });
            broadcastSettingsUpdated(saved?.options || { ...current, engineHfEndpoint: hfEndpoint });
        } catch (err) {
            return {
                ok: false,
                error: err?.message || String(err),
                hfEndpoint,
                label: pick.label || '',
                fallback: true,
            };
        }

        const stamp = writeStamp({
            hfEndpoint,
            label: pick.label || (hfEndpoint ? hfEndpoint : '官方 Hub'),
            latencyMs: pick.latencyMs,
            fallback: !!pick.fallback,
            preserved: false,
        }, writableRoot);

        return {
            ok: !!pick.ok,
            fallback: !!pick.fallback,
            hfEndpoint: stamp.hfEndpoint,
            label: stamp.label,
            latencyMs: stamp.latencyMs,
            results: pick.results || [],
            viaProxy: !!pick.viaProxy,
            message: pick.message
                || `下载源：${stamp.label}${Number.isFinite(stamp.latencyMs) ? `（约 ${stamp.latencyMs} ms）` : ''}`,
            stamped: true,
        };
    })();

    try {
        return await inflight;
    } finally {
        inflight = null;
    }
}

module.exports = {
    STAMP_FILE_NAME,
    getStampPath,
    readStamp,
    writeStamp,
    ensureFirstRunHfEndpoint,
    /** @internal tests */
    _resetInflightForTests() {
        inflight = null;
    },
};
