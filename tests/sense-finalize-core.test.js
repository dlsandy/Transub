const assert = require('assert');
const fin = require('../src/js/sense-finalize-core');

describe('sense-finalize-core', () => {
    it('planSenseLanguagePrior form / path / needSniff', () => {
        const form = fin.planSenseLanguagePrior({
            formLang: 'ja',
            itemPath: 'a.mp4',
        });
        assert.strictEqual(form.done, true);
        assert.strictEqual(form.prior.language, 'ja');

        const profileApi = {
            priorFromMetaLanguage: () => null,
            guessLanguageFromName: () => ({ language: 'ja', confidence: 0.9, reason: '番号' }),
            shouldSniffSpokenLanguage: () => false,
        };
        const pathDone = fin.planSenseLanguagePrior({
            formLang: 'auto',
            itemPath: 'SSIS-001.mp4',
            profileApi,
            hasDetectApi: true,
            backend: 'transub',
        });
        assert.strictEqual(pathDone.done, true);
        assert.strictEqual(pathDone.prior.source, 'name');

        const need = fin.planSenseLanguagePrior({
            formLang: 'auto',
            itemPath: 'movie.mp4',
            profileApi: {
                ...profileApi,
                guessLanguageFromName: () => null,
                shouldSniffSpokenLanguage: () => true,
            },
            hasDetectApi: true,
            backend: 'transub',
        });
        assert.strictEqual(need.done, false);
        assert.strictEqual(need.needSniff, true);
    });

    it('resolveSenseLanguagePriorAfterSniff prefers sniff', () => {
        const profileApi = {
            shouldPreferSniffLanguage: () => true,
        };
        const out = fin.resolveSenseLanguagePriorAfterSniff({
            sniffRes: { ok: true, language: 'en', confidence: 0.8, startSec: 0 },
            sniffWin: { startSec: 0, reason: '片头区' },
            pathPrior: { language: 'ja', confidence: 0.6, reason: 'name' },
            profileApi,
        });
        assert.strictEqual(out.prior.source, 'sniff');
        assert.strictEqual(out.prior.language, 'en');
    });

    it('buildFinalizedSenseState + planInstantAvSense', () => {
        const profileApi = {
            refineSenseModels: (overrides) => ({ overrides, notes: ['n1'] }),
            sanitizeSakuraMtForLanguage: () => ({ changed: false }),
            collectSenseSupportGaps: () => ({ missing: [] }),
            guessLanguageFromName: () => ({ language: 'ja', confidence: 0.9, reason: '番号' }),
            classifyContentProfile: () => ({ profile: 'av', label: 'AV', confidence: 0.95, strongAv: true }),
            isInstantAvSenseCandidate: (c) => !!c?.strongAv,
            resolveItemSense: () => ({
                adopted: true,
                action: 'apply',
                message: '命中',
                classification: { profile: 'av', label: 'AV' },
                overrides: { language: 'ja' },
            }),
        };
        const built = fin.buildFinalizedSenseState({
            itemName: 'a.mp4',
            resolved: {
                adopted: true,
                action: 'apply',
                message: '命中',
                classification: { profile: 'av' },
                overrides: {},
            },
            langPrior: { language: 'ja', source: 'name', confidence: 0.9, reason: '番号' },
            senseBase: { language: 'auto', task: 'dual' },
            profileApi,
            refineModels: true,
        });
        assert.strictEqual(built.sense.status, 'done');
        assert.strictEqual(built.sense.overrides.language, 'ja');
        assert.strictEqual(built.recordMemory, true);
        assert.ok(built.logLines.some((l) => l.text.includes('模型匹配')));

        const instant = fin.planInstantAvSense({
            path: 'SSIS-001.mp4',
            durationSec: 7200,
            senseBaseOptions: { task: 'dual' },
            profileApi,
        });
        assert.ok(instant);
        assert.strictEqual(instant.langPrior.source, 'name');
        assert.ok(instant.resolved.adopted);
    });

    it('wizard-style deep prior: eng container tag must not beat AV 番号 ja', () => {
        const profile = require('../src/js/content-profile-core');
        const path = 'e:/un/MIKR-116.mp4';
        const classification = profile.classifyContentProfile({ path, durationSec: 7200 });
        assert.strictEqual(classification.profile, 'av_soft');
        assert.ok(classification.strongAv);

        const planned = fin.planSenseLanguagePrior({
            formLang: 'auto',
            metaRaw: 'eng',
            itemPath: path,
            senseHints: {
                profile: classification.profile,
                profileConfidence: classification.confidence,
                profileConfident: false,
                strongAv: true,
                forceDeep: true,
            },
            backend: 'transub',
            hasDetectApi: true,
            senseBase: { language: 'auto' },
            profileApi: profile,
        });
        // Deep force → short-window sniff allowed, but path prior must already be JA
        assert.strictEqual(planned.needSniff, true);
        assert.strictEqual(planned.pathPrior?.language, 'ja');
        assert.ok(Number(planned.pathPrior?.confidence) > Number(planned.metaGuess?.confidence || 0));

        const after = fin.resolveSenseLanguagePriorAfterSniff({
            sniffRes: { ok: true, language: 'en', confidence: 0.82, startSec: 90 },
            sniffWin: { startSec: 90, durationSec: 12, skippedIntro: true, reason: '跳过片头约90s' },
            pathPrior: planned.pathPrior,
            metaGuess: planned.metaGuess,
            nameGuess: planned.nameGuess,
            senseHints: { strongAv: true, forceDeep: true },
            profileApi: profile,
        });
        assert.strictEqual(after.prior.language, 'ja');
        assert.notStrictEqual(after.prior.source, 'sniff');
    });

    it('discards exotic meta tags like nn and coerces soft-AV to ja', () => {
        const profile = require('../src/js/content-profile-core');
        assert.strictEqual(profile.priorFromMetaLanguage('nn'), null);
        assert.strictEqual(profile.priorFromMetaLanguage('de'), null);
        assert.ok(profile.priorFromMetaLanguage('ja')?.language === 'ja');
        assert.strictEqual(profile.isSupportedSenseLanguage('nn'), false);
        assert.strictEqual(profile.isSupportedSenseLanguage('ja'), true);
        assert.strictEqual(
            profile.coerceLanguageForSoftAv('nn', { strongAv: true, profile: 'av_soft' }),
            'ja',
        );
        assert.strictEqual(
            profile.coerceLanguageForSoftAv('en', { profile: 'av_soft' }),
            'ja',
        );
        assert.strictEqual(
            profile.shouldPreferSniffLanguage(
                { language: 'nn', confidence: 0.95 },
                { language: 'ja', confidence: 0.7, reason: '软声语境先验' },
                { avLikely: true },
            ),
            false,
        );

        // Critical: planSenseLanguagePrior must NOT fall back to raw "nn"
        const plannedNn = fin.planSenseLanguagePrior({
            formLang: 'auto',
            metaRaw: 'nn',
            itemPath: 'e:/un/MIKR-116.mp4',
            senseHints: {
                profile: 'av_soft',
                strongAv: true,
                forceDeep: true,
            },
            backend: 'transub',
            hasDetectApi: true,
            senseBase: { language: 'auto' },
            profileApi: profile,
        });
        assert.notStrictEqual(plannedNn.metaGuess?.language, 'nn');
        assert.strictEqual(plannedNn.pathPrior?.language, 'ja');

        const afterNnOnly = fin.resolveSenseLanguagePriorAfterSniff({
            sniffRes: { ok: true, language: 'nn', confidence: 0.9, startSec: 90 },
            sniffWin: { startSec: 90, durationSec: 12, skippedIntro: true },
            pathPrior: null,
            metaGuess: null,
            nameGuess: null,
            senseHints: { strongAv: true, profile: 'av_soft' },
            profileApi: profile,
        });
        assert.strictEqual(afterNnOnly.prior.language, 'ja');
    });

    it('buildFinalizedSenseState coerces soft-AV nn prior to ja before refine', () => {
        const profile = require('../src/js/content-profile-core');
        const built = fin.buildFinalizedSenseState({
            itemName: 'MIKR-116.mp4',
            resolved: {
                adopted: true,
                action: 'apply',
                message: 'ok',
                classification: { profile: 'av_soft', strongAv: true, label: '软声' },
                overrides: { language: 'nn', engineAsrModel: 'anime-whisper' },
            },
            langPrior: { language: 'nn', source: 'meta', confidence: 0.85, reason: '音轨标记' },
            senseBase: { language: 'auto', task: 'translate' },
            depth: 'quick',
            refineModels: false,
            profileApi: profile,
        });
        assert.strictEqual(built.sense.overrides.language, 'ja');
        assert.strictEqual(built.sense.languagePrior.language, 'ja');
    });
});
