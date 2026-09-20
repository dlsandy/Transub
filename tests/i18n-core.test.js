const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../src/js/i18n-core');
const catalogMod = require('../src/js/i18n-catalogs');

describe('i18n-core', () => {
    const catalogs = (typeof catalogMod.loadCatalogsFromDisk === 'function')
        ? catalogMod.loadCatalogsFromDisk()
        : catalogMod.getCatalogs();

    it('normalizes locale aliases including en/ja/ko', () => {
        assert.strictEqual(core.normalizeUiLocale(''), 'zh-Hans');
        assert.strictEqual(core.normalizeUiLocale('zh-CN'), 'zh-Hans');
        assert.strictEqual(core.normalizeUiLocale('zh-tw'), 'zh-Hant-TW');
        assert.strictEqual(core.normalizeUiLocale('zh-Hant-TW'), 'zh-Hant-TW');
        assert.strictEqual(core.normalizeUiLocale('en-US'), 'en');
        assert.strictEqual(core.normalizeUiLocale('ja-JP'), 'ja');
        assert.strictEqual(core.normalizeUiLocale('ko-KR'), 'ko');
        assert.strictEqual(core.normalizeUiLocale('nope'), 'zh-Hans');
    });

    it('exposes enabled locale registry', () => {
        const enabled = core.listUiLocales({ enabledOnly: true }).map((e) => e.id);
        assert.deepStrictEqual(enabled, ['zh-Hans', 'zh-Hant-TW', 'en', 'ja', 'ko']);
        assert.strictEqual(core.localeStrategy('en'), 'catalog');
        assert.strictEqual(core.localeStrategy('zh-Hant-TW'), 'hans-opencc');
        assert.strictEqual(core.localeStrategy('zh-Hans'), 'source');
    });

    it('maps html lang / bcp47', () => {
        assert.strictEqual(core.htmlLangForLocale('zh-Hans'), 'zh-CN');
        assert.strictEqual(core.htmlLangForLocale('zh-Hant-TW'), 'zh-TW');
        assert.strictEqual(core.htmlLangForLocale('en'), 'en');
        assert.strictEqual(core.htmlLangForLocale('ja'), 'ja');
        assert.strictEqual(core.htmlLangForLocale('ko'), 'ko');
    });

    it('interpolates vars and walks fallback chain locale→en→zh-Hans', () => {
        const packs = {
            'zh-Hans': { 'hello.name': '你好，{name}', 'only.hans': '仅简体' },
            en: { 'hello.name': 'Hello, {name}' },
            'zh-Hant-TW': { 'hello.name': '你好，{name}' },
            ja: {},
        };
        assert.strictEqual(
            core.t('hello.name', { catalogs: packs, locale: 'zh-Hans', vars: { name: 'A' } }),
            '你好，A',
        );
        assert.strictEqual(
            core.t('hello.name', { catalogs: packs, locale: 'en', vars: { name: 'A' } }),
            'Hello, A',
        );
        // ja missing → en
        assert.strictEqual(
            core.t('hello.name', { catalogs: packs, locale: 'ja', vars: { name: 'A' } }),
            'Hello, A',
        );
        // only in Hans → after en miss, Hans
        assert.strictEqual(
            core.t('only.hans', { catalogs: packs, locale: 'ja' }),
            '仅简体',
        );
        assert.strictEqual(
            core.t('missing.key', { catalogs: packs, locale: 'zh-Hans' }),
            'missing.key',
        );
    });

    it('ships settings keys across enabled catalogs', () => {
        const key = 'settings.uiLocale.label';
        for (const id of ['zh-Hans', 'zh-Hant-TW', 'en', 'ja', 'ko']) {
            assert.ok(catalogs[id]?.[key], `missing ${key} in ${id}`);
            assert.ok(
                catalogs[id][`settings.uiLocale.locale.${id}`],
                `missing option label for ${id}`,
            );
        }
        assert.notStrictEqual(catalogs['zh-Hans'][key], catalogs.en[key]);
        const i18n = core.createI18n({ catalogs, locale: 'en' });
        assert.strictEqual(i18n.t(key), catalogs.en[key]);
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

    it('tx uses phrase catalogs for en/ja/ko', () => {
        const packs = {
            'zh-Hans': { 'phrase.设置': '设置' },
            en: { 'phrase.设置': 'Settings' },
            ja: { 'phrase.设置': '設定' },
            ko: { 'phrase.设置': '설정' },
        };
        assert.strictEqual(core.tx('设置', { catalogs: packs, locale: 'en' }), 'Settings');
        assert.strictEqual(core.tx('设置', { catalogs: packs, locale: 'ja' }), '設定');
        assert.strictEqual(core.tx('设置', { catalogs: packs, locale: 'ko' }), '설정');
        // missing phrase → Hans passthrough
        assert.strictEqual(core.tx('未知文案xyz', { catalogs: packs, locale: 'en' }), '未知文案xyz');
    });

    it('tf formats placeholders via phrase catalogs', () => {
        const packs = {
            'zh-Hans': { 'phrase.已指定对话模型：{name}': '已指定对话模型：{name}' },
            en: { 'phrase.已指定对话模型：{name}': 'Assigned chat model: {name}' },
        };
        assert.strictEqual(
            core.tf('已指定对话模型：{name}', { name: 'gpt' }, { catalogs: packs, locale: 'en' }),
            'Assigned chat model: gpt',
        );
        assert.strictEqual(
            core.tf('已指定对话模型：{name}', { name: 'gpt' }, { catalogs: packs, locale: 'zh-Hans' }),
            '已指定对话模型：gpt',
        );
    });

    it('applyDomDeep re-translates after live text lost CJK', () => {
        const NodeFilter = { FILTER_ACCEPT: 1, FILTER_REJECT: 2, SHOW_TEXT: 4 };
        globalThis.NodeFilter = NodeFilter;

        const textOrig = new WeakMap();
        const stores = { textOrig, attrOrig: new WeakMap() };
        const parent = {
            nodeType: 1,
            tagName: 'P',
            isContentEditable: false,
            closest: () => null,
        };
        const nodes = [{
            nodeType: 3,
            nodeValue: '界面语言',
            parentElement: parent,
        }];
        const fakeDoc = {
            nodeType: 9,
            createTreeWalker(_scope, _what, filter) {
                let i = -1;
                return {
                    nextNode() {
                        while (true) {
                            i += 1;
                            if (i >= nodes.length) return null;
                            const n = nodes[i];
                            const verdict = filter.acceptNode(n);
                            if (verdict === NodeFilter.FILTER_ACCEPT) return n;
                        }
                    },
                };
            },
        };
        const root = {
            nodeType: 1,
            ownerDocument: fakeDoc,
            body: null,
            querySelectorAll: () => [],
        };

        const packs = {
            'zh-Hans': { 'phrase.界面语言': '界面语言' },
            en: { 'phrase.界面语言': 'UI language' },
            ja: { 'phrase.界面语言': '表示言語' },
        };
        const i18n = core.createI18n({ catalogs: packs, locale: 'zh-Hans' });

        core.applyDomDeep(root, (s) => i18n.tx(s), stores);
        assert.ok(textOrig.has(nodes[0]));
        assert.strictEqual(nodes[0].nodeValue, '界面语言');

        i18n.setLocale('en');
        core.applyDomDeep(root, (s) => i18n.tx(s), stores);
        assert.strictEqual(nodes[0].nodeValue, 'UI language');

        i18n.setLocale('ja');
        const updated = core.applyDomDeep(root, (s) => i18n.tx(s), stores);
        assert.ok(updated >= 1, 'expected re-translate after non-CJK live text');
        assert.strictEqual(nodes[0].nodeValue, '表示言語');

        i18n.setLocale('zh-Hans');
        core.applyDomDeep(root, (s) => i18n.tx(s), stores);
        assert.strictEqual(nodes[0].nodeValue, '界面语言');
    });

    it('locales.json matches core registry ids', () => {
        const file = path.join(__dirname, '..', 'shared', 'i18n', 'locales.json');
        const reg = JSON.parse(fs.readFileSync(file, 'utf8'));
        const diskIds = reg.locales.map((e) => e.id);
        assert.deepStrictEqual(diskIds, [...core.UI_LOCALES]);
        assert.deepStrictEqual(reg.fallbackChain, [...core.UI_LOCALE_REGISTRY.fallbackChain]);
    });
});
