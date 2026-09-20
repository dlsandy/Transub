'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const del = require('../electron/engine-delete-model');

describe('engine-delete-model', () => {
    it('blocks shipped models and demucs', () => {
        assert.strictEqual(
            del.canDeletePickItem({ id: 'whisper-tiny', installed: true, shipped: true }).ok,
            false,
        );
        assert.strictEqual(
            del.canDeletePickItem({ id: 'demucs', installed: true }).ok,
            false,
        );
        assert.strictEqual(
            del.canDeletePickItem({ id: 'anime-whisper', installed: true }).ok,
            true,
        );
    });

    it('resolves engine model directory under models root', () => {
        const root = path.join('D:', 'engine', 'models');
        const dir = del.resolveEngineModelDir('anime-whisper', {
            kind: 'asr',
            local_dirname: 'anime-whisper',
        }, root);
        assert.ok(dir.replace(/\\/g, '/').endsWith('engine/models/asr/anime-whisper'));
    });

    it('deletes engine model directory on disk', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-del-'));
        const modelsRoot = path.join(tmp, 'models');
        const target = path.join(modelsRoot, 'asr', 'demo-model');
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(path.join(target, 'model.bin'), 'demo');
        const res = del.deleteEngineModelDirectory('demo-model', {
            kind: 'asr',
            local_dirname: 'demo-model',
        }, path.dirname(modelsRoot));
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.removed, true);
        assert.strictEqual(fs.existsSync(target), false);
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('refuses deleting outside models root', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-del-'));
        const res = del.deleteEngineModelDirectory('x', {
            kind: 'asr',
            local_dirname: '../../outside',
        }, path.join(tmp, 'models'));
        assert.strictEqual(res.ok, false);
        assert.match(String(res.error || ''), /outside models/i);
        fs.rmSync(tmp, { recursive: true, force: true });
    });
});
