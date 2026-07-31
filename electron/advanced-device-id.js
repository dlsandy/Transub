/**
 * 稳定设备指纹（用于 Advanced 许可绑定）
 */
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { getWritableRoot } = require('./app-paths');

const DEVICE_FILE = 'transub-advanced-device.json';

function hashId(parts) {
    return crypto.createHash('sha256').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 32);
}

function readStoredDeviceId() {
    try {
        const filePath = path.join(getWritableRoot(), DEVICE_FILE);
        if (!fs.existsSync(filePath)) return '';
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return String(parsed?.deviceId || '').trim();
    } catch (_) {
        return '';
    }
}

function writeStoredDeviceId(deviceId) {
    try {
        const filePath = path.join(getWritableRoot(), DEVICE_FILE);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify({
            version: 1,
            deviceId,
            createdAt: new Date().toISOString(),
        }, null, 2)}\n`, 'utf8');
    } catch (_) { /* ignore */ }
}

function computeMachineFingerprint() {
    const nets = os.networkInterfaces() || {};
    let mac = '';
    for (const list of Object.values(nets)) {
        for (const n of list || []) {
            if (n && !n.internal && n.mac && n.mac !== '00:00:00:00:00:00') {
                mac = n.mac;
                break;
            }
        }
        if (mac) break;
    }
    return hashId([
        'transub-advanced-v1',
        os.hostname(),
        os.platform(),
        os.arch(),
        mac,
        typeof os.userInfo === 'function' ? (os.userInfo().username || '') : '',
    ]);
}

/**
 * 优先使用已持久化的 deviceId（换网卡后仍稳定），否则计算并落盘。
 */
function getAdvancedDeviceId() {
    const stored = readStoredDeviceId();
    if (stored) return stored;
    const id = computeMachineFingerprint();
    writeStoredDeviceId(id);
    return id;
}

function getDeviceLabel() {
    try {
        return `${os.hostname()} (${os.platform()})`.slice(0, 64);
    } catch (_) {
        return 'device';
    }
}

module.exports = {
    DEVICE_FILE,
    getAdvancedDeviceId,
    getDeviceLabel,
    computeMachineFingerprint,
};
