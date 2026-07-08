const { nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const ICON_DIR = __dirname;

const TRAY_REPRESENTATIONS = [
    { file: 'tray-icon-subtitle-16.png', scaleFactor: 1 },
    { file: 'tray-icon-subtitle.png', scaleFactor: 2 },
];

const APP_ICON_CANDIDATES = [
    'app.ico',
    'icon-256.png',
    'icon-source.png',
];

function readIconFile(fileName) {
    const filePath = path.join(ICON_DIR, fileName);
    if (!fs.existsSync(filePath)) return null;
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
    for (const name of APP_ICON_CANDIDATES) {
        const image = readIconFile(name);
        if (image) return image;
    }
    return getTrayIcon();
}

module.exports = {
    getTrayIcon,
    getAppIcon,
};
