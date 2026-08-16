const assert = require('assert');
const core = require('../src/js/i18n-core');
const catalogMod = require('../src/js/i18n-catalogs');

describe('i18n-core', () => {
    const catalogs = catalogMod.getCatalogs();

    it('normalizes locale aliases', () => {
        assert.strictEqual(core.normalizeUiLocale(''), 'zh-Hans');
        assert.strictEqual(core.normalizeUiLocale('zh-CN'), 'zh-Hans');
        assert.strictEqual(core.normalizeUiLocale('zh-tw'), 'zh-Hant-TW');
        assert.strictEqual(core.normalizeUiLocale('zh-Hant-TW'), 'zh-Hant-TW');
        assert.strictEqual(core.normalizeUiLocale('nope'), 'zh-Hans');
    });

    it('maps html lang', () => {
        assert.strictEqual(core.htmlLangForLocale('zh-Hans'), 'zh-CN');
        assert.strictEqual(core.htmlLangForLocale('zh-Hant-TW'), 'zh-TW');
    });

    it('interpolates vars and falls back', () => {
        const packs = {
            'zh-Hans': { 'hello.name': '你好，{name}', 'only.hans': '仅简体' },
            'zh-Hant-TW': { 'hello.name': '你好，{name}' },
        };
        assert.strictEqual(
            core.t('hello.name', { catalogs: packs, locale: 'zh-Hans', vars: { name: 'A' } }),
            '你好，A',
        );
        assert.strictEqual(
            core.t('only.hans', { catalogs: packs, locale: 'zh-Hant-TW' }),
            '仅简体',
        );
        assert.strictEqual(
            core.t('missing.key', { catalogs: packs, locale: 'zh-Hans' }),
            'missing.key',
        );
    });

    it('ships settings keys in both catalogs', () => {
        const key = 'settings.uiLocale.label';
        assert.ok(catalogs['zh-Hans'][key]);
        assert.ok(catalogs['zh-Hant-TW'][key]);
        assert.notStrictEqual(catalogs['zh-Hans'][key], catalogs['zh-Hant-TW'][key]);
        const i18n = core.createI18n({ catalogs, locale: 'zh-Hant-TW' });
        assert.strictEqual(i18n.t(key), catalogs['zh-Hant-TW'][key]);
    });

    it('tx converts Hans chrome with phrase overrides + OpenCC', () => {
        const OpenCC = require('opencc-js');
        const convert = OpenCC.Converter({ from: 'cn', to: 'twp' });
        const out = core.tx('添加视频到文件夹', {
            catalogs,
            locale: 'zh-Hant-TW',
            convertHansToHant: convert,
        });
        assert.ok(out.includes('影片'), `expected 影片 in: ${out}`);
        assert.ok(out.includes('資料夾'), `expected 資料夾 in: ${out}`);
        assert.strictEqual(
            core.tx('添加视频', { catalogs, locale: 'zh-Hans', convertHansToHant: convert }),
            '添加视频',
        );
    });
});
