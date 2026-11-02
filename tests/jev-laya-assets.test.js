const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    LAYA_MODEL_ID,
    LAYA_MODEL_KIND,
    resolveBundledWheelsDir,
    findBundledOpendeciderWheel,
    isLayaModelDirReady,
} = require('../electron/jev-laya-assets');

describe('jev-laya-assets', () => {
    it('resolves bundled opendecider wheel under transub-engine/wheels', () => {
        const dir = resolveBundledWheelsDir();
        assert.ok(dir, 'wheels dir');
        assert.ok(fs.existsSync(dir), dir);
        const whl = findBundledOpendeciderWheel(dir);
        assert.ok(whl, 'opendecider wheel');
        assert.ok(/opendecider-.*\.whl$/i.test(path.basename(whl)));
        assert.ok(fs.statSync(whl).size > 40 * 1024);
    });

    it('exports catalog ids for model manager', () => {
        assert.strictEqual(LAYA_MODEL_ID, 'opendecider-nano');
        assert.strictEqual(LAYA_MODEL_KIND, 'decision');
    });

    it('rejects incomplete model dirs', () => {
        assert.strictEqual(isLayaModelDirReady(''), false);
        assert.strictEqual(isLayaModelDirReady(path.join(__dirname, 'no-such-dir')), false);
    });
});
