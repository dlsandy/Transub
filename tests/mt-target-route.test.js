'use strict';

const assert = require('assert');
const route = require('../src/js/mt-target-route-core');
const { resolveFileMtPlan } = require('../electron/engine-batch-item');
const hybrid = require('../src/js/smart-translate-hybrid-core');
const profile = require('../src/js/content-profile-core');
const missing = require('../src/js/engine-missing-models-core');
const concept = require('../src/js/mt-concept-core');
const castLink = require('../src/js/mt-cast-link-core');

describe('mt-target-route-core', () => {
    it('maps engine mode to llm and never allows Opus', () => {
        const r = route.resolveMtTargetRoute({
            subtitleTargetLang: 'zh-Hans',
            translateMode: 'engine',
        });
        assert.strictEqual(r.isZhTarget, true);
        assert.strictEqual(r.allowOpus, false);
        assert.strictEqual(r.allowSakuraHybrid, true);
        assert.strictEqual(r.engineTargetLanguage, 'zh');
        assert.strictEqual(r.effectiveTranslateMode, 'llm');
        assert.strictEqual(r.opusModelId, '');
    });

    it('maps legacy engine+en target to llm (no Opus pair)', () => {
        const r = route.resolveMtTargetRoute({
            subtitleTargetLang: 'en',
            language: 'ja',
            translateMode: 'engine',
        });
        assert.strictEqual(r.isZhTarget, false);
        assert.strictEqual(r.allowOpus, false);
        assert.strictEqual(r.allowSakuraHybrid, false);
        assert.strictEqual(r.engineTargetLanguage, 'en');
        assert.strictEqual(r.effectiveTranslateMode, 'llm');
        assert.strictEqual(r.opusModelId, '');
    });

    it('forces llm for ko target', () => {
        const r = route.resolveMtTargetRoute({
            subtitleTargetLang: 'ko',
            language: 'ja',
            translateMode: 'engine',
        });
        assert.strictEqual(r.allowOpus, false);
        assert.strictEqual(r.effectiveTranslateMode, 'llm');
        assert.ok(r.reason);
    });

    it('apply strips leftover Opus ids and blocks native Opus plans', () => {
        const { options, blockedNativeOpus, intlMtError } = route.applyMtTargetRouteToOptions({
            subtitleTargetLang: 'en',
            language: 'ja',
            translateMode: 'engine',
            engineMtModel: 'opus-mt-ja-zh',
            smartTranslate: false,
        });
        assert.notStrictEqual(options.engineMtModel, 'opus-mt-ja-zh');
        assert.ok(!route.isOpusMtId(options.engineMtModel));
        assert.strictEqual(options.engineOpusMtModel, '');
        assert.ok(options.smartTranslateHybridMt !== true);
        assert.strictEqual(options.translateMode, 'llm');
        assert.strictEqual(blockedNativeOpus, true);
        assert.ok(String(intlMtError || '').includes('已移除'));
    });

    it('keeps hybrid available for en/ko/ja targets', () => {
        for (const lang of ['en', 'ko', 'ja']) {
            const r = route.resolveMtTargetRoute({
                subtitleTargetLang: lang,
                language: 'ja',
                translateMode: 'smart',
            });
            assert.strictEqual(r.disableHybridMt, false, lang);
            assert.strictEqual(r.allowSakuraHybrid, false, lang);
            const cap = route.resolveMtCapability({
                subtitleTargetLang: lang,
                language: 'ja',
            });
            assert.strictEqual(cap.allowHybridMt, true, lang);
            assert.strictEqual(cap.allowSakuraModels, false, lang);
        }
    });

    it('allows LN-Korean for ko→zh and LN-ko2ja for ko→ja', () => {
        const koZh = route.resolveMtCapability({
            subtitleTargetLang: 'zh-Hans',
            language: 'ko',
        });
        assert.strictEqual(koZh.allowSakuraModels, true);
        assert.strictEqual(koZh.allowKoZhSpecialists, true);
        assert.strictEqual(koZh.allowJaZhSpecialists, false);
        assert.strictEqual(route.isMtModelAllowedForTarget('sakura-ln-korean-7b', {
            subtitleTargetLang: 'zh-Hans',
            language: 'ko',
        }), true);
        assert.strictEqual(route.isMtModelAllowedForTarget('sakura-7b', {
            subtitleTargetLang: 'zh-Hans',
            language: 'ko',
        }), false);
        assert.strictEqual(route.isMtModelAllowedForTarget('sakura-galtransl-7b', {
            subtitleTargetLang: 'zh-Hans',
            language: 'ko',
        }), false);

        const koJa = route.resolveMtCapability({
            subtitleTargetLang: 'ja',
            language: 'ko',
        });
        assert.strictEqual(koJa.allowSakuraModels, true);
        assert.strictEqual(koJa.allowKoJaSpecialists, true);
        assert.strictEqual(koJa.allowSakuraHybrid, true);
        assert.strictEqual(route.isMtModelAllowedForTarget('sakura-ln-ko2ja-14b', {
            subtitleTargetLang: 'ja',
            language: 'ko',
        }), true);
        assert.strictEqual(route.isMtModelAllowedForTarget('sakura-ln-korean-7b', {
            subtitleTargetLang: 'ja',
            language: 'ko',
        }), false);
        assert.strictEqual(route.isMtModelAllowedForTarget('sakura-1.5b', {
            subtitleTargetLang: 'ja',
            language: 'ko',
        }), false);
    });

    it('picks LN specialists in hybrid for Korean source', () => {
        assert.strictEqual(hybrid.pickHybridMtModelId({
            preferredId: '',
            installedIds: ['sakura-1.5b', 'sakura-ln-korean-7b', 'translategemma-4b'],
            subtitleTargetLang: 'zh-Hans',
            language: 'ko',
        }), 'sakura-ln-korean-7b');
        assert.strictEqual(hybrid.pickHybridMtModelId({
            preferredId: '',
            installedIds: ['sakura-ln-ko2ja-14b', 'translategemma-4-sub-e4b'],
            subtitleTargetLang: 'ja',
            language: 'ko',
        }), 'sakura-ln-ko2ja-14b');
        assert.strictEqual(hybrid.shouldUseHybridChunkMt({
            enabled: true,
            language: 'ko',
            cues: [{ text: '안녕하세요' }],
            modelId: 'sakura-ln-korean-7b',
            subtitleTargetLang: 'zh-Hans',
        }).ok, true);
        assert.strictEqual(hybrid.shouldUseHybridChunkMt({
            enabled: true,
            language: 'ko',
            cues: [{ text: '안녕하세요' }],
            modelId: 'sakura-ln-ko2ja-14b',
            subtitleTargetLang: 'ja',
        }).ok, true);
    });
});

describe('resolveFileMtPlan intl', () => {
    const isLlm = (id) => /sakura|qwen|galtransl/i.test(String(id || ''));
    const usesExternal = ({ smartTranslate, sakuraMt }) => !!(smartTranslate || sakuraMt);

    it('blocks leftover native Opus for english target', () => {
        const plan = resolveFileMtPlan({
            task: 'translate',
            subtitleTargetLang: 'en',
            language: 'ja',
            engineMtModel: 'opus-mt-ja-zh',
            smartTranslate: false,
            translateMode: 'engine',
        }, {
            isLlmMtId: isLlm,
            usesExternalMt: usesExternal,
            mapTaskToEngineTask: (t) => t,
        });
        assert.strictEqual(plan.blockedNativeOpus, true);
        assert.ok(plan.intlMtError);
        assert.ok(!route.isOpusMtId(plan.jobMtModel));
        assert.strictEqual(plan.useExternalMt, false);
    });

    it('blocks ko target without llm/smart', () => {
        const plan = resolveFileMtPlan({
            task: 'translate',
            subtitleTargetLang: 'ko',
            language: 'ja',
            engineMtModel: 'opus-mt-ja-zh',
            smartTranslate: false,
        }, {
            isLlmMtId: isLlm,
            usesExternalMt: usesExternal,
            mapTaskToEngineTask: (t) => t,
        });
        assert.strictEqual(plan.blockedNativeOpus, true);
        assert.ok(plan.intlMtError);
    });

    it('allows smart translate for english target', () => {
        const plan = resolveFileMtPlan({
            task: 'translate',
            subtitleTargetLang: 'en',
            smartTranslate: true,
            engineMtModel: '',
        }, {
            isLlmMtId: isLlm,
            usesExternalMt: usesExternal,
            mapTaskToEngineTask: (t) => t,
        });
        assert.strictEqual(plan.useSmartTranslate, true);
        assert.strictEqual(plan.blockedNativeOpus, false);
    });

    it('allows general llm for english (blocks only sakura family)', () => {
        const plan = resolveFileMtPlan({
            task: 'translate',
            subtitleTargetLang: 'en',
            engineMtModel: 'qwen25-7b',
            smartTranslate: false,
            translateMode: 'llm',
        }, {
            isLlmMtId: isLlm,
            usesExternalMt: usesExternal,
            mapTaskToEngineTask: (t) => t,
        });
        assert.strictEqual(plan.blockedNativeOpus, false);
        assert.strictEqual(plan.intlMtError, '');
        assert.strictEqual(plan.useSakuraMt, true);
        assert.strictEqual(plan.fileMerged.engineMtModel, 'qwen25-7b');
    });

    it('blocks sakura family for english even if marked llm', () => {
        const plan = resolveFileMtPlan({
            task: 'translate',
            subtitleTargetLang: 'en',
            engineMtModel: 'sakura-1.5b',
            smartTranslate: false,
        }, {
            isLlmMtId: isLlm,
            usesExternalMt: usesExternal,
            mapTaskToEngineTask: (t) => t,
        });
        assert.strictEqual(plan.useSakuraMt, false);
        assert.ok(plan.blockedNativeOpus || !plan.jobMtModel || !/sakura/i.test(plan.jobMtModel || ''));
    });
});

describe('hybrid gate intl', () => {
    it('allows hybrid for en/ko/ja with multilingual MT; blocks Sakura', () => {
        const ja = [{ text: 'こんにちは' }];
        assert.strictEqual(hybrid.shouldUseHybridChunkMt({
            enabled: true,
            language: 'ja',
            cues: ja,
            modelId: 'sakura-1.5b',
            subtitleTargetLang: 'en',
        }).ok, false);
        assert.strictEqual(hybrid.shouldUseHybridChunkMt({
            enabled: true,
            language: 'ja',
            cues: ja,
            modelId: 'sakura-1.5b',
            subtitleTargetLang: 'en',
        }).reason, 'model_target');
        assert.strictEqual(hybrid.shouldUseHybridChunkMt({
            enabled: true,
            language: 'ja',
            cues: ja,
            modelId: 'translategemma-4b',
            subtitleTargetLang: 'en',
        }).ok, true);
        assert.strictEqual(hybrid.shouldUseHybridChunkMt({
            enabled: true,
            language: 'ja',
            cues: ja,
            modelId: 'translategemma-4-sub-e4b',
            subtitleTargetLang: 'ko',
        }).ok, true);
        assert.strictEqual(hybrid.shouldUseHybridChunkMt({
            enabled: true,
            language: 'ja',
            cues: ja,
            modelId: 'translategemma-4b',
            subtitleTargetLang: 'ja',
        }).ok, true);
    });

    it('picks TranslateGemma for en target, not Sakura', () => {
        assert.strictEqual(hybrid.pickHybridMtModelId({
            preferredId: '',
            installedIds: ['sakura-1.5b', 'sakura-galtransl-7b', 'translategemma-4b', 'translategemma-12b', 'translategemma-4-sub-e4b'],
            subtitleTargetLang: 'en',
            language: 'ja',
            contentProfile: 'av_soft',
        }), 'translategemma-4-sub-e4b');
        assert.strictEqual(hybrid.pickHybridMtModelId({
            preferredId: 'sakura-1.5b',
            installedIds: ['sakura-1.5b', 'translategemma-4-sub-e4b'],
            subtitleTargetLang: 'ko',
            language: 'ja',
        }), 'translategemma-4-sub-e4b');
    });
});

describe('recommendFormMtModel intl', () => {
    it('recommends llm (not Opus) for en target legacy engine mode', () => {
        const rec = profile.recommendFormMtModel({
            translateMode: 'engine',
            language: 'ja',
            subtitleTargetLang: 'en',
            installedModels: [{ id: 'qwen25-7b', installed: true }],
        });
        assert.strictEqual(rec.mode, 'llm');
        assert.ok(!/opus/i.test(rec.preferId || ''));
        assert.strictEqual(rec.allowSakuraModels, false);
        assert.strictEqual(rec.id, 'qwen25-7b');
    });

    it('recommends llm for ko target', () => {
        const rec = profile.recommendFormMtModel({
            translateMode: 'engine',
            language: 'ja',
            subtitleTargetLang: 'ko',
            installedModels: [{ id: 'qwen25-7b', installed: true }],
        });
        assert.strictEqual(rec.mode, 'llm');
        assert.ok(!/opus/i.test(rec.preferId || ''));
    });

    it('does not recommend Sakura for english 成片', () => {
        const rec = profile.recommendFormMtModel({
            translateMode: 'llm',
            language: 'ja',
            subtitleTargetLang: 'en',
            installedModels: [
                { id: 'sakura-1.5b', installed: true },
                { id: 'qwen25-7b', installed: true },
            ],
        });
        assert.ok(!/sakura|galtransl|hy-?mt/i.test(rec.id || ''));
        assert.strictEqual(rec.id, 'qwen25-7b');
    });
});

describe('resolveMtCapability + lastMt + validate', () => {
    it('disallows Sakura for en target but allows hybrid + TranslateGemma', () => {
        const cap = route.resolveMtCapability({
            subtitleTargetLang: 'en',
            language: 'ja',
        });
        assert.strictEqual(cap.allowSakuraModels, false);
        assert.strictEqual(cap.allowHybridMt, true);
        assert.strictEqual(cap.disableHybridMt, false);
        assert.strictEqual(route.isMtModelAllowedForTarget('sakura-1.5b', {
            subtitleTargetLang: 'en',
            language: 'ja',
        }), false);
        assert.strictEqual(route.isMtModelAllowedForTarget('qwen25-7b', {
            subtitleTargetLang: 'en',
        }), true);
        assert.strictEqual(route.isMtModelAllowedForTarget('translategemma-4b', {
            subtitleTargetLang: 'en',
        }), true);
        assert.ok(route.mtModelBlockReasonForTarget('sakura-1.5b', {
            subtitleTargetLang: 'en',
            language: 'ja',
        }));
        assert.strictEqual(route.mtModelBlockReasonForTarget('qwen25-7b', {
            subtitleTargetLang: 'en',
        }), '');
        assert.strictEqual(route.allowSmartHybridForTarget({
            subtitleTargetLang: 'ko',
            language: 'ja',
        }), true);
        assert.strictEqual(route.allowSmartHybridForTarget({
            subtitleTargetLang: 'ja',
            language: 'ja',
        }), true);
    });

    it('allows TranslateGemma / Chimera for ko target but blocks Sakura', () => {
        const opts = { subtitleTargetLang: 'ko', language: 'ja' };
        assert.strictEqual(route.isMtModelAllowedForTarget('sakura-galtransl-7b', opts), false);
        assert.strictEqual(route.isMtModelAllowedForTarget('hy-mt2-7b', opts), false);
        assert.strictEqual(route.isMtModelAllowedForTarget('translategemma-4b', opts), true);
        assert.strictEqual(route.isMtModelAllowedForTarget('translategemma-4-sub-e4b', opts), true);
        assert.strictEqual(route.isMtModelAllowedForTarget('hunyuan-mt-chimera-7b-abliterated', opts), true);
        assert.ok(route.mtModelBlockReasonForTarget('sakura-1.5b', opts));
    });

    it('remembers and recalls lastMtByTarget buckets', () => {
        let map = route.normalizeLastMtByTarget({});
        map = route.rememberLastMtForTarget(map, 'zh-Hans', 'sakura-1.5b');
        map = route.rememberLastMtForTarget(map, 'en', 'qwen25-7b');
        assert.strictEqual(route.recallLastMtForTarget(map, 'zh-Hant'), 'sakura-1.5b');
        assert.strictEqual(route.recallLastMtForTarget(map, 'en'), 'qwen25-7b');
    });

    it('validate strips Sakura for en but keeps hybrid on', () => {
        const gate = route.validateMtSelectionForTarget({
            subtitleTargetLang: 'en',
            language: 'ja',
            translateMode: 'llm',
            engineLlmMtModel: 'sakura-1.5b',
            smartTranslateHybridMt: true,
            task: 'translate',
        }, {
            installedIds: ['sakura-1.5b', 'qwen25-7b', 'translategemma-4b'],
        });
        assert.ok(!Object.prototype.hasOwnProperty.call(gate.fixes, 'smartTranslateHybridMt')
            || gate.fixes.smartTranslateHybridMt !== false);
        assert.ok(gate.fixes.engineLlmMtModel);
        assert.ok(!/sakura|galtransl|hy-?mt/i.test(gate.fixes.engineLlmMtModel));
        assert.ok(gate.issues.length);
    });
});

describe('mt-target-form-sync', () => {
    const sync = require('../src/js/mt-target-form-sync-core');

    it('switches zh Sakura pick to general when target becomes en; keeps hybrid available', () => {
        const r = sync.syncFormAfterTargetLangChange({
            prevTargetLang: 'zh-Hans',
            nextTargetLang: 'en',
            language: 'ja',
            currentModelId: 'sakura-1.5b',
            lastMtByTarget: { zh: 'sakura-1.5b', en: '', ja: '', ko: '' },
            hybridOn: true,
            translateMode: 'llm',
            installedIds: ['sakura-1.5b', 'qwen25-7b', 'translategemma-4b'],
            recommendId: 'translategemma-4b',
        });
        assert.strictEqual(r.forceHybridOff, false);
        assert.strictEqual(r.smartTranslateHybridMt, true);
        assert.ok(r.engineLlmMtModel);
        assert.ok(!/sakura|galtransl/i.test(r.engineLlmMtModel));
        assert.strictEqual(r.lastMtByTarget.zh, 'sakura-1.5b');
    });

    it('restores remembered en model when switching back', () => {
        const r = sync.syncFormAfterTargetLangChange({
            prevTargetLang: 'zh-Hans',
            nextTargetLang: 'en',
            language: 'ja',
            currentModelId: 'sakura-7b',
            lastMtByTarget: { zh: 'sakura-7b', en: 'qwen25-7b', ja: '', ko: '' },
            hybridOn: true,
            installedIds: ['sakura-7b', 'qwen25-7b'],
        });
        assert.strictEqual(r.engineLlmMtModel, 'qwen25-7b');
        assert.ok(r.modelChanged);
    });

    it('keeps Sakura visible but disabled for non-ZH target filter', () => {
        const filter = sync.buildLlmMtModelFilter(
            { subtitleTargetLang: 'ko', language: 'ja' },
            () => true,
        );
        assert.strictEqual(filter({ id: 'sakura-1.5b' }), true);
        assert.strictEqual(filter({ id: 'qwen25-7b' }), true);
        const disable = sync.buildLlmMtModelDisableReason({
            subtitleTargetLang: 'ko',
            language: 'ja',
        });
        assert.ok(disable({ id: 'sakura-1.5b' }));
        assert.strictEqual(disable({ id: 'qwen25-7b' }), '');
        assert.strictEqual(disable({ id: 'translategemma-4b' }), '');
    });
});

describe('missing models pair', () => {
    it('never expects Opus downloads', () => {
        const ids = missing.resolveExpectedOpusMtModelIds({
            task: 'translate',
            translateMode: 'engine',
            formLang: 'ja',
            subtitleTargetLang: 'en',
        });
        assert.deepStrictEqual(ids, []);
    });
});

describe('mt-concept / cast-link scaffold', () => {
    it('annotates cast mentions from castNames', () => {
        const ann = concept.annotateJaCue('三上悠亜が出演', {
            castNames: ['三上悠亜'],
            subtitleTargetLang: 'en',
        });
        assert.ok(ann.castMentions.some((m) => m.src === '三上悠亜'));
        assert.ok(ann.flags.includes('cast'));
    });

    it('resolves EN surface via cast link', () => {
        const surface = castLink.resolveCastSurface('三上悠亜', 'en');
        assert.strictEqual(surface, 'Yua Mikami');
    });
});
