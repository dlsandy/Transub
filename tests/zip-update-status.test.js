const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    writeZipUpdateStatus,
    readZipUpdateStatus,
} = require('../electron/zip-update-status');

describe('zip-update-status', () => {
    it('writes and merges status patches', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-upd-status-'));
        const file = path.join(dir, 'status.json');
        try {
            writeZipUpdateStatus(file, {
                phase: 'waiting',
                message: '等待退出',
                percent: 5,
            });
            writeZipUpdateStatus(file, {
                phase: 'copying',
                message: '替换中',
                percent: 40,
            });
            const status = readZipUpdateStatus(file);
            assert.ok(status);
            assert.strictEqual(status.phase, 'copying');
            assert.strictEqual(status.message, '替换中');
            assert.strictEqual(status.percent, 40);
            assert.ok(status.updatedAt);
        } finally {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });
});
