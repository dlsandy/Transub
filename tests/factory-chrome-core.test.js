const assert = require('assert');
const chrome = require('../src/js/factory-chrome-core');

describe('factory-chrome-core', () => {
    it('product names and workspace', () => {
        assert.strictEqual(chrome.PRODUCT_DISPLAY_NAME, 'Transub 字幕工厂');
        assert.strictEqual(chrome.productWindowTitle(true), 'Transub 字幕工厂');
        assert.strictEqual(chrome.productWindowTitle(false), 'Transub 字幕工厂');
        assert.strictEqual(chrome.normalizeWorkspace('handoff'), 'queue');
        assert.strictEqual(chrome.normalizeWorkspace('shelf'), 'shelf');
        assert.strictEqual(chrome.normalizeWorkspace('library'), 'shelf');
        assert.strictEqual(chrome.normalizeWorkspace('scenes'), 'scenes');
        assert.strictEqual(chrome.normalizeWorkspace('scene-presets'), 'scenes');
        assert.strictEqual(chrome.normalizeWorkspace('presets'), 'scenes');
        assert.strictEqual(chrome.normalizeWorkspace('models'), 'models');
        assert.strictEqual(chrome.normalizeWorkspace('model-mgmt'), 'models');
        assert.strictEqual(chrome.normalizeWorkspace('burn'), 'burn');
        assert.strictEqual(chrome.normalizeWorkspace('burnin'), 'burn');
        assert.strictEqual(chrome.normalizeWorkspace('hardsub'), 'burn');
        assert.strictEqual(chrome.normalizeWorkspace('x'), 'queue');
        assert.strictEqual(chrome.WORKSPACE_SCENES, 'scenes');
    });
});
