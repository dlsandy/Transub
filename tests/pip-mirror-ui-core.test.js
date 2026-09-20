const assert = require('assert');
const api = require('../src/js/pip-mirror-ui-core.js');

describe('pip-mirror-ui-core', () => {
    it('exports catalog and normalizes auto', () => {
        assert.ok(Array.isArray(api.CATALOG));
        assert.ok(api.CATALOG.length >= 6);
        assert.strictEqual(api.normalizePreferred(''), '');
        assert.strictEqual(api.normalizePreferred('自动测速'), '');
        assert.strictEqual(api.normalizePreferred('aliyun'), 'aliyun');
        assert.strictEqual(api.labelFor('tsinghua'), '清华大学');
    });

    it('get/set preferred and downloadPayloadPatch', () => {
        api.setPreferred('tencent', { syncDom: false });
        assert.strictEqual(api.getPreferred(), 'tencent');
        assert.deepStrictEqual(api.downloadPayloadPatch(), { preferredPipMirror: 'tencent' });
        api.setPreferred('auto', { syncDom: false });
        assert.strictEqual(api.getPreferred(), '');
        assert.deepStrictEqual(api.downloadPayloadPatch(), {});
    });

    it('formatActiveMirrorLine mentions host', () => {
        api.setPreferred('aliyun', { syncDom: false });
        const line = api.formatActiveMirrorLine({ mirror: 'mirrors.aliyun.com' }, (t) => t);
        assert.match(line, /阿里云/);
        assert.match(line, /mirrors\.aliyun\.com/);
    });

    it('lists prepare + system-check select ids', () => {
        assert.ok(api.SELECT_IDS.includes('setupWizardPipMirrorSelect'));
        assert.ok(api.SELECT_IDS.includes('envCheckPipMirrorSelect'));
    });
});
