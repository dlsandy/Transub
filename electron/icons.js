const { nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const ICON_DIR = __dirname;

const TRAY_REPRESENTATIONS = [
    { file: 'tray-icon-subtitle-16.png', scaleFactor: 1 },
    { file: 'tray-icon-subtitle.png', scaleFactor: 2 },
];

/** Prefer .ico for Windows taskbar / window chrome */
const APP_ICON_CANDIDATES = [
    'app.ico',
    'icon-256.png',
    'icon-source.png',
];

function asarUnpackedPath(filePath) {
    const raw = String(filePath || '');
    if (!raw.includes(`${path.sep}app.asar${path.sep}`) && !raw.includes('/app.asar/')) {
        return raw;
    }
    return raw.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
        .replace('/app.asar/', '/app.asar.unpacked/');
}

function firstExistingPath(candidates) {
    for (const candidate of candidates) {
        if (!candidate) continue;
        const unpacked = asarUnpackedPath(candidate);
        if (fs.existsSync(unpacked)) return unpacked;
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

/**
 * Absolute path to the best on-disk app icon (prefer .ico on Windows).
 * BrowserWindow should receive this path string — NativeImage often fails to
 * update the Windows taskbar icon. Packaged builds must not rely on asar-only
 * paths (Windows cannot use .ico inside asar for the taskbar).
 */
function getAppIconPath() {
    const resources = typeof process.resourcesPath === 'string' ? process.resourcesPath : '';
    const packagedRoots = resources
        ? [
            path.join(resources, 'icons', 'app.ico'),
            path.join(resources, 'app.ico'),
        ]
        : [];

    const localIco = path.join(ICON_DIR, 'app.ico');
    const foundIco = firstExistingPath([...packagedRoots, localIco]);
    if (foundIco) return foundIco;

    for (const name of APP_ICON_CANDIDATES) {
        const found = firstExistingPath([path.join(ICON_DIR, name)]);
        if (found) return found;
    }
    return null;
}

function readIconFile(fileName) {
    const filePath = firstExistingPath([path.join(ICON_DIR, fileName)]);
    if (!filePath) return null;
    const image = nativeImage.createFromPath(filePath);
    return image.isEmpty() ? null : image;
}

function getTrayIcon() {
    const reps = [];
    for (const { file, scaleFactor } of TRAY_REPRESENTATIONS) {
        const image = readIconFile(file);
        if (image) reps.push({ scaleFactor, buffer: image.toPNG() });
    }
    if (reps.length >= 1) {
        const icon = nativeImage.createEmpty();
        reps.forEach((r) => icon.addRepresentation(r));
        if (!icon.isEmpty()) return icon;
    }
    for (const fileName of ['tray-icon-subtitle-16.png', 'tray-icon-subtitle.png']) {
        const single = readIconFile(fileName);
        if (single) {
            const { width } = single.getSize();
            if (process.platform === 'win32' && width > 16) {
                return single.resize({ width: 16, height: 16 });
            }
            return single;
        }
    }
    return nativeImage.createEmpty();
}

function getAppIcon() {
    const iconPath = getAppIconPath();
    if (iconPath) {
        const image = nativeImage.createFromPath(iconPath);
        if (!image.isEmpty()) return image;
    }
    for (const name of APP_ICON_CANDIDATES) {
        const image = readIconFile(name);
        if (image) return image;
    }
    return getTrayIcon();
}

/** Value suitable for BrowserWindow `icon` option */
function getWindowIconOption() {
    const iconPath = getAppIconPath();
    if (iconPath) return iconPath;
    const image = getAppIcon();
    return image.isEmpty() ? undefined : image;
}

function applyWindowIcon(win) {
    if (!win || win.isDestroyed()) return;
    const iconPath = getAppIconPath();
    if (!iconPath) return;
    try {
        win.setIcon(iconPath);
    } catch (_) { /* ignore */ }
}

module.exports = {
    getTrayIcon,
    getAppIcon,
    getAppIconPath,
    getWindowIconOption,
    applyWindowIcon,
};
