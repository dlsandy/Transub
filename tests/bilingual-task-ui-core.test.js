'use strict';

const assert = require('assert');
const { createBilingualTaskUi } = require('../src/js/bilingual-task-ui-core.js');

function makeSelect(value, optionValues) {
    const options = (optionValues || ['source', 'simplified', 'traditional']).map((v) => ({ value: v }));
    return {
        value,
        options,
        disabled: false,
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    };
}

function makeUi(els) {
    return createBilingualTaskUi({
        els,
        readTaskFromForm: () => String(els.taskSelect?.value || 'translate'),
        isTranslateLikeTask: (t) => t === 'translate' || t === 'dual',
        toQuickTargetLang: (v) => String(v || 'simplified'),
        updateModelSelectHint: () => {},
        syncBilingualChipUi: () => {},
        syncFaithfulToneUi: () => {},
        syncHybridMtUi: () => {},
        syncAdvancedFeaturesGate: () => {},
        applyTranslateModeToForm: () => {},
        canUseSmartTranslateUi: () => false,
    });
}

describe('TransubBilingualTaskUi', () => {
    beforeEach(() => {
        globalThis.TransubSubtitleTargetLang = require('../src/js/subtitle-target-lang-core');
    });

    it('yue + 简体 switches to translate (粤→普通话)', () => {
        const quickLanguageSelect = makeSelect('yue', ['auto', 'ja', 'yue']);
        const quickTargetLangSelect = makeSelect('source');
        const taskSelect = makeSelect('transcribe', ['translate', 'transcribe', 'dual']);
        const chineseSubtitleVariantSelect = makeSelect('simplified', [
            'simplified', 'traditional', 'en',
        ]);
        const api = makeUi({
            quickLanguageSelect,
            quickTargetLangSelect,
            taskSelect,
            chineseSubtitleVariantSelect,
        });
        api.applyQuickTargetChipValue('simplified');
        assert.strictEqual(taskSelect.value, 'translate');
        assert.strictEqual(quickTargetLangSelect.value, 'simplified');
        assert.strictEqual(chineseSubtitleVariantSelect.value, 'simplified');
    });

    it('yue + 繁体 switches to translate and sets variant', () => {
        const quickLanguageSelect = makeSelect('yue', ['auto', 'ja', 'yue']);
        const quickTargetLangSelect = makeSelect('source');
        const taskSelect = makeSelect('transcribe', ['translate', 'transcribe', 'dual']);
        const chineseSubtitleVariantSelect = makeSelect('simplified', [
            'simplified', 'traditional',
        ]);
        const api = makeUi({
            quickLanguageSelect,
            quickTargetLangSelect,
            taskSelect,
            chineseSubtitleVariantSelect,
        });
        api.applyQuickTargetChipValue('traditional');
        assert.strictEqual(taskSelect.value, 'translate');
        assert.strictEqual(quickTargetLangSelect.value, 'traditional');
        assert.strictEqual(chineseSubtitleVariantSelect.value, 'traditional');
    });

    it('yue + 原文 keeps task=transcribe', () => {
        const quickLanguageSelect = makeSelect('yue', ['auto', 'ja', 'yue']);
        const quickTargetLangSelect = makeSelect('simplified');
        const taskSelect = makeSelect('translate', ['translate', 'transcribe', 'dual']);
        const chineseSubtitleVariantSelect = makeSelect('simplified', [
            'simplified', 'traditional',
        ]);
        const api = makeUi({
            quickLanguageSelect,
            quickTargetLangSelect,
            taskSelect,
            chineseSubtitleVariantSelect,
        });
        api.applyQuickTargetChipValue('source');
        assert.strictEqual(taskSelect.value, 'transcribe');
        assert.strictEqual(quickTargetLangSelect.value, 'source');
    });

    it('ja + 简体 still switches to translate', () => {
        const quickLanguageSelect = makeSelect('ja', ['auto', 'ja', 'yue']);
        const quickTargetLangSelect = makeSelect('source');
        const taskSelect = makeSelect('transcribe', ['translate', 'transcribe', 'dual']);
        const chineseSubtitleVariantSelect = makeSelect('simplified', [
            'simplified', 'traditional',
        ]);
        const api = makeUi({
            quickLanguageSelect,
            quickTargetLangSelect,
            taskSelect,
            chineseSubtitleVariantSelect,
        });
        api.applyQuickTargetChipValue('simplified');
        assert.strictEqual(taskSelect.value, 'translate');
        assert.strictEqual(quickTargetLangSelect.value, 'simplified');
    });

    it('syncChineseSubtitleVariantUi keeps 原文 when chip and task are transcribe', () => {
        const quickTargetLangSelect = makeSelect('source');
        const taskSelect = makeSelect('transcribe', ['translate', 'transcribe', 'dual']);
        const api = makeUi({
            quickLanguageSelect: makeSelect('ja', ['ja', 'yue']),
            quickTargetLangSelect,
            taskSelect,
            chineseSubtitleVariantSelect: makeSelect('simplified', ['simplified', 'traditional']),
        });
        api.syncChineseSubtitleVariantUi();
        assert.strictEqual(taskSelect.value, 'transcribe');
        assert.strictEqual(quickTargetLangSelect.value, 'source');
    });
});
