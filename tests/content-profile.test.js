const assert = require('assert');
const {
    classifyContentProfile,
    classifyBatchContentProfile,
    resolveItemSense,
    resolveContentProfileForJob,
    suggestPostReconstructMode,
    hasManualAudioProfile,
    mergeContentProfileOptions,
    mergeSenseOverrides,
    describeAudioMethod,
    describeAutoSenseUi,
    guessLanguageFromName,
    shouldSniffSpokenLanguage,
    shouldPreferSniffLanguage,
    resolveSenseSniffWindow,
    extractAvCodes,
    priorFromMetaLanguage,
    refineSenseModels,
    collectSenseSupportGaps,
    mergeSenseSupportGaps,
    sanitizeSakuraMtForLanguage,
    buildSenseMemoryKeys,
    applySenseMemoryToClassification,
    applyAcousticHints,
    isFilenameSenseConfident,
    isInstantAvSenseCandidate,
    shouldProbeAcoustic,
    AV_SOFT_PATCH,
    FILM_PATCH,
    APPLY_CONFIDENCE,
    SENSE_OWNED_KEYS,
} = require('../src/js/content-profile-core');

describe('content-profile-core', () => {
    it('classifies Japanese AV product codes as av_soft', () => {
        const hit = classifyContentProfile({
            fileName: 'SSIS-001_uncensored.mp4',
            language: 'ja',
            durationSec: 7200,
        });
        assert.strictEqual(hit.profile, 'av_soft');
        assert.ok(hit.confidence >= APPLY_CONFIDENCE);
        assert.ok(hit.presetId === 'ja-av-soft-translate');
    });

    it('skips codec-looking product codes', () => {
        const hit = classifyContentProfile({
            fileName: 'movie_H264-1080.mkv',
            language: 'en',
        });
        assert.notStrictEqual(hit.profile, 'av_soft');
    });

    it('classifies BluRay / remux as film', () => {
        const hit = classifyContentProfile({
            fileName: 'Some.Movie.2020.1080p.BluRay.Remux.mkv',
            durationSec: 7200,
        });
        assert.strictEqual(hit.profile, 'film');
        assert.ok(hit.confidence >= 0.4);
    });

    it('classifies interview / podcast as talk', () => {
        const hit = classifyContentProfile({
            fileName: 'Tech_Podcast_Interview_Ep12.mp3',
        });
        assert.strictEqual(hit.profile, 'talk');
    });

    it('returns unknown for generic names', () => {
        const hit = classifyContentProfile({ fileName: 'video001.mp4' });
        assert.strictEqual(hit.profile, 'unknown');
    });

    it('batch consensus applies when profiles agree', () => {
        const batch = classifyBatchContentProfile([
            { path: 'F:/a/SSIS-100.mp4', durationSec: 7000 },
            { path: 'F:/a/SSIS-101.mp4', durationSec: 7100 },
        ], { language: 'ja' });
        assert.strictEqual(batch.profile, 'av_soft');
        assert.strictEqual(batch.mixed, false);
    });

    it('resolveItemSense applies soft patch when confidence high', () => {
        const base = {
            language: 'auto',
            task: 'translate',
            filmAudioEnhance: false,
            vadSensitive: false,
            engineVadModel: 'fsmn-vad',
            engineAsrModel: 'sensevoice-small',
        };
        const resolved = resolveItemSense(
            { path: 'FC2-PPV-1234567.mp4', durationSec: 5400 },
            base,
            { autoSense: true, advancedEntitled: true },
        );
        assert.strictEqual(resolved.action, 'apply');
        assert.strictEqual(resolved.adopted, true);
        assert.strictEqual(resolved.overrides.vadSensitive, true);
        assert.strictEqual(resolved.overrides.engineVadModel, 'whisperseg-asmr');
        assert.strictEqual(resolved.overrides.language, 'ja');
        assert.strictEqual(resolved.overrides.engineAsrModel, 'whisper-large-v3-turbo');
        assert.strictEqual(resolved.overrides.engineMtModel, 'sakura-1.5b');
        assert.strictEqual(resolved.overrides.filmAudioEnhance, false);
        assert.strictEqual(base.vadSensitive, false, 'must not mutate base');
        assert.ok(SENSE_OWNED_KEYS.includes('language'));
    });

    it('skips MT model override when task is transcribe', () => {
        const resolved = resolveItemSense(
            { path: 'SSIS-001.mp4', durationSec: 7200 },
            { language: 'ja', task: 'transcribe', filmAudioEnhance: false, vadSensitive: false, engineVadModel: 'fsmn-vad' },
            { autoSense: true, advancedEntitled: true },
        );
        assert.strictEqual(resolved.action, 'apply');
        assert.ok(!Object.prototype.hasOwnProperty.call(resolved.overrides, 'engineMtModel'));
    });

    it('adopts by default even when form already has manual audio profile', () => {
        const resolved = resolveItemSense(
            { path: 'SSIS-200.mp4' },
            { language: 'ja', task: 'translate', vadSensitive: true, engineVadModel: 'whisperseg-asmr' },
            { autoSense: true },
        );
        assert.strictEqual(resolved.action, 'apply');
        assert.strictEqual(resolved.adopted, true);
        assert.ok(/覆盖|采纳/.test(resolved.message));
    });

    it('adopts mid-confidence results by default', () => {
        const resolved = resolveItemSense(
            { path: 'product_demo_talk_show.mp4', durationSec: 600 },
            { language: 'zh', task: 'translate', filmAudioEnhance: false, vadSensitive: false },
            { autoSense: true, advancedEntitled: true },
        );
        if (resolved.classification?.profile && resolved.classification.profile !== 'unknown'
            && Object.keys(resolved.overrides || {}).length) {
            assert.strictEqual(resolved.adopted, true);
            assert.strictEqual(resolved.action, 'apply');
        }
    });

    it('does not auto-adopt when sense memory forceSuggest', () => {
        const resolved = resolveItemSense(
            { path: 'SSIS-200.mp4', durationSec: 7200 },
            { language: 'ja', task: 'translate', filmAudioEnhance: false, vadSensitive: false, engineVadModel: 'fsmn-vad' },
            {
                autoSense: true,
                advancedEntitled: true,
                memoryHits: [{ key: 'maker:ssis', profile: 'av_soft', prefer: false }],
            },
        );
        assert.strictEqual(resolved.classification.profile, 'av_soft');
        assert.strictEqual(resolved.adopted, false);
        assert.strictEqual(resolved.action, 'suggest');
        assert.ok(/未自动采纳/.test(resolved.message));
    });

    it('skips when autoSense is off', () => {
        const resolved = resolveItemSense(
            { path: 'SSIS-200.mp4' },
            { language: 'ja' },
            { autoSense: false },
        );
        assert.strictEqual(resolved.action, 'skip');
        assert.strictEqual(resolved.adopted, false);
    });

    it('film free fallback when Advanced not entitled', () => {
        const resolved = resolveItemSense(
            { path: 'Feature.Film.BluRay.Remux.mkv', durationSec: 8000 },
            { language: 'en', filmAudioEnhance: false },
            { autoSense: true, advancedEntitled: false },
        );
        assert.strictEqual(resolved.action, 'apply');
        assert.strictEqual(resolved.overrides.filmAudioEnhance, false);
        assert.strictEqual(resolved.overrides.audioLightDenoise, true);
    });

    it('mergeSenseOverrides only touches sense-owned keys', () => {
        const out = mergeSenseOverrides(
            { task: 'translate', device: 'cuda', language: 'auto', vadSensitive: false },
            { ...AV_SOFT_PATCH, task: 'transcribe', device: 'cpu' },
        );
        assert.strictEqual(out.task, 'translate');
        assert.strictEqual(out.device, 'cuda');
        assert.strictEqual(out.language, 'ja');
        assert.strictEqual(out.vadSensitive, true);
        assert.strictEqual(out.sakuraNsfwPrompt, true);
        assert.strictEqual(AV_SOFT_PATCH.sakuraNsfwPrompt, true);
    });

    it('detects manual audio profile helpers', () => {
        assert.ok(hasManualAudioProfile({ filmAudioEnhance: true }));
        assert.ok(hasManualAudioProfile({ engineVadModel: 'whisperseg-asmr' }));
        assert.ok(!hasManualAudioProfile({ engineVadModel: 'fsmn-vad' }));
    });

    it('merge only touches owned keys', () => {
        const { options, appliedKeys } = mergeContentProfileOptions(
            { task: 'translate', device: 'cuda', vadSensitive: false },
            { ...AV_SOFT_PATCH, task: 'transcribe' },
        );
        assert.strictEqual(options.task, 'translate');
        assert.ok(appliedKeys.includes('vadSensitive'));
        assert.ok(!appliedKeys.includes('task'));
    });

    it('suggests reconstruct mode after batch', () => {
        assert.strictEqual(suggestPostReconstructMode({ profile: 'film', task: 'translate' }).mode, 'film');
        assert.strictEqual(suggestPostReconstructMode({ profile: 'av_soft', task: 'dual' }).mode, 'basic');
        assert.strictEqual(suggestPostReconstructMode({ profile: 'unknown', task: 'translate' }).mode, 'none');
    });

    it('describes audio method from options', () => {
        assert.strictEqual(describeAudioMethod({ filmAudioEnhance: true }).id, 'film_enhance');
        assert.strictEqual(describeAudioMethod({ vadSensitive: true }).id, 'sensitive');
        assert.strictEqual(describeAudioMethod({}).short, '默认');
    });

    it('builds auto-sense UI summary', () => {
        const sensing = describeAutoSenseUi({
            autoEnabled: true,
            sensingCount: 2,
            adoptedCount: 0,
            doneCount: 0,
            itemCount: 5,
        });
        assert.strictEqual(sensing.tone, 'apply');
        assert.ok(/感知中/.test(sensing.chipLabel));

        const off = describeAutoSenseUi({ autoEnabled: false });
        assert.strictEqual(off.tone, 'off');
        assert.ok(/关/.test(off.chipLabel));
    });

    it('keeps known AV maker codes even without JA language', () => {
        const hit = classifyContentProfile({ fileName: 'SSIS-001.mp4' });
        assert.strictEqual(hit.profile, 'av_soft');
        assert.ok(hit.strongAv);
        assert.ok(hit.confidence >= APPLY_CONFIDENCE);
    });

    it('keeps AV when known maker coexists with unrelated words', () => {
        const hit = classifyContentProfile({
            fileName: 'SSIS-270_介绍_uncensored.mp4',
            language: 'ja',
        });
        assert.strictEqual(hit.profile, 'av_soft');
        assert.ok(hit.strongAv);
    });

    it('classifies shop product intro as talk, not AV', () => {
        const hit = classifyContentProfile({
            path: 'd:/SUSEMSE天猫旗舰店/SL105纯色/视频/ABF-270 产品介绍.mp4',
            language: 'zh',
            durationSec: 180,
        });
        assert.strictEqual(hit.profile, 'talk');
        assert.ok(!hit.strongAv);
    });

    it('legacy resolveContentProfileForJob still works for single item', () => {
        const resolved = resolveContentProfileForJob(
            [{ path: 'MIDV-123.mp4', durationSec: 7200 }],
            { language: 'ja', task: 'translate', filmAudioEnhance: false, vadSensitive: false, engineVadModel: 'fsmn-vad' },
            { autoSense: true, advancedEntitled: true },
        );
        assert.strictEqual(resolved.action, 'apply');
        assert.strictEqual(resolved.classification.profile, 'av_soft');
        assert.strictEqual(resolved.adopted, true);
    });

    it('guesses language from kana / hangul / AV cues', () => {
        const ja = guessLanguageFromName('日本語レッスン.mp4');
        assert.strictEqual(ja.language, 'ja');
        const ko = guessLanguageFromName('한국어강의.mp4');
        assert.strictEqual(ko.language, 'ko');
        const av = guessLanguageFromName('SSIS-001.mp4');
        assert.strictEqual(av.language, 'ja');
    });

    it('recognizes numbered amateur series codes (200GANA, 300MIUM)', () => {
        const paths = [
            'hhd800.com@200GANA-3420.mp4',
            '200GANA-3420.mp4',
            '300MIUM-123.mp4',
            '261ARA-456.mp4',
        ];
        for (const fileName of paths) {
            const codes = extractAvCodes(fileName.replace(/\.[^.]+$/, ''));
            assert.ok(codes.some((c) => c.known), `${fileName} should match a known maker`);
            const lang = guessLanguageFromName(fileName);
            assert.strictEqual(lang.language, 'ja', fileName);
            const hit = classifyContentProfile({ fileName, language: 'auto' });
            assert.strictEqual(hit.profile, 'av_soft', fileName);
            assert.ok(hit.strongAv, fileName);
        }
    });

    it('reads known maker codes from parent folder when file is renamed', () => {
        const path = 'e:/迅雷下载/200GANA-3420/test.mp4';
        const lang = guessLanguageFromName(path);
        assert.strictEqual(lang.language, 'ja');
        assert.ok(lang.reason.includes('AV'));
        const hit = classifyContentProfile({ path, language: 'auto' });
        assert.strictEqual(hit.profile, 'av_soft');
        assert.ok(hit.strongAv);
        assert.ok(hit.reasons.some((r) => /GANA/i.test(r)));
    });

    it('treats bare English container tags as weak meta priors', () => {
        const en = priorFromMetaLanguage('eng');
        assert.strictEqual(en.language, 'en');
        assert.ok(en.confidence < 0.65);
        const ja = priorFromMetaLanguage('jpn');
        assert.strictEqual(ja.language, 'ja');
        assert.ok(ja.confidence >= 0.65);
    });

    it('shouldPreferSniffLanguage defers weak sniff to stronger name prior', () => {
        const namePrior = { language: 'ja', confidence: 0.58, reason: 'AV 语境先验' };
        assert.strictEqual(
            shouldPreferSniffLanguage({ language: 'en', confidence: 0.53 }, namePrior, { skippedIntro: true }),
            false,
        );
        assert.strictEqual(
            shouldPreferSniffLanguage({ language: 'en', confidence: 0.7 }, namePrior, { skippedIntro: true }),
            true,
        );
        assert.strictEqual(
            shouldPreferSniffLanguage({ language: 'ja', confidence: 0.53 }, namePrior, { skippedIntro: true }),
            false,
        );
        assert.strictEqual(
            shouldPreferSniffLanguage({ language: 'en', confidence: 0.55 }, null, { skippedIntro: true }),
            true,
        );
        // Intro-region samples need a higher bar
        assert.strictEqual(
            shouldPreferSniffLanguage({ language: 'en', confidence: 0.55 }, null, { skippedIntro: false }),
            false,
        );
        assert.strictEqual(
            shouldPreferSniffLanguage({ language: 'en', confidence: 0.65 }, null, { skippedIntro: false }),
            true,
        );
    });

    it('resolveSenseSniffWindow skips typical opening titles', () => {
        const longAv = resolveSenseSniffWindow({ durationSec: 7200 });
        assert.ok(longAv.startSec >= 60);
        assert.ok(longAv.startSec <= 180);
        assert.strictEqual(longAv.skippedIntro, true);
        assert.strictEqual(longAv.durationSec, 12);

        const unknown = resolveSenseSniffWindow({ durationSec: 0 });
        assert.strictEqual(unknown.startSec, 60);
        assert.strictEqual(unknown.skippedIntro, true);

        const short = resolveSenseSniffWindow({ durationSec: 40 });
        assert.ok(short.startSec > 0);
        assert.ok(short.startSec < 40);
        assert.strictEqual(short.skippedIntro, false);
    });

    it('shouldSniffSpokenLanguage skips when form or meta/name strong', () => {
        assert.strictEqual(shouldSniffSpokenLanguage({}, { language: 'ja' }), false);
        assert.strictEqual(shouldSniffSpokenLanguage({
            metaLanguage: 'ja',
            metaConfidence: 0.82,
        }, { language: 'auto' }), false);
        assert.strictEqual(shouldSniffSpokenLanguage({
            metaLanguage: 'en',
            metaConfidence: 0.4,
        }, { language: 'auto' }), true);
        assert.strictEqual(shouldSniffSpokenLanguage({
            nameLanguage: 'ja',
            nameConfidence: 0.72,
        }, { language: 'auto' }), false);
        assert.strictEqual(shouldSniffSpokenLanguage({}, { language: 'auto' }), true);
    });

    it('skips deep probes when filename classification is confident', () => {
        const av = classifyContentProfile({
            fileName: 'SSIS-001_uncensored.mp4',
            language: 'ja',
        });
        assert.ok(isFilenameSenseConfident(av));
        assert.ok(isInstantAvSenseCandidate(av));
        assert.strictEqual(shouldSniffSpokenLanguage({
            profile: av.profile,
            profileConfidence: av.confidence,
            strongAv: av.strongAv,
        }, { language: 'auto' }), false);
        assert.strictEqual(shouldSniffSpokenLanguage({
            profile: av.profile,
            profileConfidence: av.confidence,
            strongAv: av.strongAv,
            forceDeep: true,
        }, { language: 'auto' }), true);
        assert.strictEqual(shouldProbeAcoustic({
            profile: av.profile,
            strongAv: av.strongAv,
            confidence: av.confidence,
        }), false);

        const film = classifyContentProfile({
            fileName: 'Movie.Title.2020.1080p.BluRay.x264.mp4',
        });
        assert.ok(film.profile === 'film');
        assert.ok(isFilenameSenseConfident(film));
        assert.strictEqual(isInstantAvSenseCandidate(film), false);
        assert.strictEqual(shouldSniffSpokenLanguage({
            profile: film.profile,
            profileConfidence: film.confidence,
        }, { language: 'auto' }), false);
        assert.strictEqual(shouldProbeAcoustic({
            profile: film.profile,
            confidence: film.confidence,
        }), false);

        const weak = classifyContentProfile({ fileName: 'clip_001.mp4' });
        assert.strictEqual(isFilenameSenseConfident(weak), false);
        assert.strictEqual(isInstantAvSenseCandidate(weak), false);
        assert.strictEqual(shouldSniffSpokenLanguage({
            profile: weak.profile,
            profileConfidence: weak.confidence,
        }, { language: 'auto' }), true);
        assert.strictEqual(shouldProbeAcoustic({
            profile: weak.profile || 'unknown',
            confidence: weak.confidence,
        }), true);
    });

    it('marks known 番号 as instant AV sense candidates', () => {
        const codes = [
            'SSIS-001.mp4',
            'MIDV-123_1080p.mkv',
            'hhd800.com@200GANA-3420.mp4',
            'F:/AV/FC2-PPV-1234567.mp4',
            'ABF-372.mp4',
            'CJOD-522.mp4',
            'SONE-855.mp4',
        ];
        for (const fileName of codes) {
            const hit = classifyContentProfile({ fileName });
            assert.ok(isInstantAvSenseCandidate(hit), fileName);
            assert.ok(hit.strongAv, fileName);
            assert.strictEqual(hit.profile, 'av_soft', fileName);
        }
        assert.strictEqual(
            isInstantAvSenseCandidate(classifyContentProfile({ fileName: 'lecture_sku_A12.mp4' })),
            false,
        );
    });

    it('loads opaque AV maker prefixes beyond the inline fallback', () => {
        const { KNOWN_AV_MAKERS } = require('../src/js/content-profile-core');
        assert.ok(KNOWN_AV_MAKERS.has('ssis'));
        assert.ok(KNOWN_AV_MAKERS.has('abf'), 'opaque list should include ABF');
        assert.ok(KNOWN_AV_MAKERS.has('cjod'), 'opaque list should include CJOD');
        assert.ok(KNOWN_AV_MAKERS.size >= 100);
    });

    it('refineSenseModels prefers Sakura for JA AV when installed', () => {
        const { overrides } = refineSenseModels(
            {
                language: 'ja',
                engineAsrModel: 'whisper-large-v3-turbo',
                engineMtModel: 'opus-mt-ja-zh',
            },
            {
                profile: 'av_soft',
                language: 'ja',
                task: 'translate',
                installedModels: [
                    { id: 'whisper-ja-1.5b', installed: true },
                    { id: 'sakura-1.5b', installed: true },
                    { id: 'opus-mt-ja-zh', installed: true },
                ],
            },
        );
        assert.strictEqual(overrides.engineAsrModel, 'whisper-ja-1.5b');
        assert.strictEqual(overrides.engineMtModel, 'sakura-1.5b');
    });

    it('refineSenseModels keeps Sakura as declared target when neither Sakura nor Opus installed', () => {
        const { overrides, notes } = refineSenseModels(
            {
                language: 'ja',
                engineMtModel: 'opus-mt-ja-zh',
            },
            {
                profile: 'av_soft',
                language: 'ja',
                task: 'translate',
                installedModels: [
                    { id: 'sensevoice-small', installed: true },
                    { id: 'fsmn-vad', installed: true },
                ],
            },
        );
        assert.strictEqual(overrides.engineMtModel, 'sakura-1.5b');
        assert.ok(notes.some((n) => /sakura-1\.5b/i.test(n)));
    });

    it('refineSenseModels falls back to Opus when Sakura missing but Opus installed', () => {
        const { overrides, notes } = refineSenseModels(
            {
                language: 'ja',
                engineAsrModel: 'whisper-large-v3-turbo',
                engineMtModel: 'opus-mt-en-zh',
                engineVadModel: 'whisperseg-asmr',
            },
            {
                profile: 'av_soft',
                language: 'ja',
                task: 'translate',
                installedModels: [
                    { id: 'whisper-ja-1.5b', installed: true },
                    { id: 'whisper-large-v3-turbo', installed: true },
                    { id: 'opus-mt-ja-zh', installed: true },
                    { id: 'fsmn-vad', installed: true },
                ],
            },
        );
        assert.strictEqual(overrides.engineAsrModel, 'whisper-ja-1.5b');
        assert.strictEqual(overrides.engineMtModel, 'opus-mt-ja-zh');
        assert.ok(notes.length >= 1);
    });

    it('refineSenseModels prefers general LLM over Opus when Sakura missing (JA)', () => {
        const { overrides, notes } = refineSenseModels(
            {
                language: 'ja',
                engineMtModel: 'opus-mt-ja-zh',
            },
            {
                profile: 'av_soft',
                language: 'ja',
                task: 'translate',
                installedModels: [
                    { id: 'qwen25-7b', installed: true },
                    { id: 'opus-mt-ja-zh', installed: true },
                ],
            },
        );
        assert.strictEqual(overrides.engineMtModel, 'qwen25-7b');
        assert.ok(notes.some((n) => /推理|qwen/i.test(n)));
    });

    it('refineSenseModels never selects Sakura for non-Japanese film', () => {
        const { overrides, notes } = refineSenseModels(
            {
                language: 'en',
                engineMtModel: 'sakura-1.5b',
                sakuraNsfwPrompt: true,
            },
            {
                profile: 'film',
                language: 'en',
                task: 'translate',
                installedModels: [
                    { id: 'sakura-1.5b', installed: true },
                    { id: 'opus-mt-en-zh', installed: true },
                    { id: 'whisper-large-v3-turbo', installed: true },
                ],
            },
        );
        assert.ok(!/^sakura-/i.test(String(overrides.engineMtModel || '')));
        assert.ok(!Object.prototype.hasOwnProperty.call(overrides, 'engineMtModel')
            || !/^opus-mt-/i.test(String(overrides.engineMtModel || '')));
        assert.strictEqual(overrides.sakuraNsfwPrompt, false);
        assert.ok(notes.some((n) => /非日语|Sakura/i.test(n)));
    });

    it('refineSenseModels prefers LLM over Opus for English film', () => {
        const { overrides } = refineSenseModels(
            {
                language: 'en',
                engineMtModel: 'opus-mt-en-zh',
            },
            {
                profile: 'film',
                language: 'en',
                task: 'translate',
                installedModels: [
                    { id: 'qwen25-7b', installed: true },
                    { id: 'opus-mt-en-zh', installed: true },
                ],
            },
        );
        assert.strictEqual(overrides.engineMtModel, 'qwen25-7b');
    });

    it('refineSenseModels rejects Sakura for av_soft when language is English', () => {
        const { overrides } = refineSenseModels(
            {
                language: 'en',
                engineMtModel: 'sakura-1.5b',
                sakuraNsfwPrompt: true,
            },
            {
                profile: 'av_soft',
                language: 'en',
                task: 'translate',
                installedModels: [
                    { id: 'sakura-1.5b', installed: true },
                    { id: 'qwen25-3b', installed: true },
                    { id: 'opus-mt-en-zh', installed: true },
                ],
            },
        );
        assert.strictEqual(overrides.engineMtModel, 'qwen25-3b');
        assert.strictEqual(overrides.sakuraNsfwPrompt, false);
    });

    it('sanitizeSakuraMtForLanguage strips form Sakura when language is non-ja', () => {
        const { options, changed, note } = sanitizeSakuraMtForLanguage(
            { language: 'en', engineMtModel: 'sakura-1.5b', sakuraNsfwPrompt: true },
            'en',
        );
        assert.strictEqual(changed, true);
        assert.ok(!/^sakura-/i.test(String(options.engineMtModel || '')));
        assert.ok(!/^opus-mt-/i.test(String(options.engineMtModel || '')));
        assert.strictEqual(options.sakuraNsfwPrompt, false);
        assert.ok(/非日语/.test(note));
    });

    it('sanitizeSakuraMtForLanguage prefers LLM when installed for non-ja', () => {
        const { options, changed } = sanitizeSakuraMtForLanguage(
            { language: 'en', engineMtModel: 'sakura-1.5b' },
            'en',
            { installedModels: [{ id: 'qwen25-7b', installed: true }] },
        );
        assert.strictEqual(changed, true);
        assert.strictEqual(options.engineMtModel, 'qwen25-7b');
    });

    it('sanitizeSakuraMtForLanguage keeps Sakura for Japanese', () => {
        const { options, changed } = sanitizeSakuraMtForLanguage(
            { language: 'ja', engineMtModel: 'sakura-1.5b' },
            'ja',
        );
        assert.strictEqual(changed, false);
        assert.strictEqual(options.engineMtModel, 'sakura-1.5b');
    });

    it('collectSenseSupportGaps does not prefer Sakura for English film', () => {
        const { preferred } = collectSenseSupportGaps(
            {
                language: 'en',
                engineAsrModel: 'whisper-large-v3-turbo',
                engineMtModel: 'qwen25-7b',
            },
            {
                profile: 'film',
                language: 'en',
                task: 'translate',
                installedModels: [
                    { id: 'sakura-1.5b', installed: true },
                    { id: 'opus-mt-en-zh', installed: true },
                    { id: 'whisper-large-v3-turbo', installed: true },
                ],
            },
        );
        const mtIds = preferred.filter((p) => p.role === 'mt').map((p) => p.id);
        assert.ok(!mtIds.some((id) => /^sakura-/i.test(id)));
        assert.ok(!mtIds.some((id) => /^opus-mt-/i.test(id)));
        assert.ok(mtIds.some((id) => /qwen/i.test(id)));
    });

    it('refineSenseModels drops missing VAD to fallback', () => {
        const { overrides } = refineSenseModels(
            { engineVadModel: 'whisperseg-asmr', vadSensitive: true },
            {
                profile: 'av_soft',
                task: 'translate',
                installedModels: [{ id: 'fsmn-vad', installed: true }],
            },
        );
        assert.strictEqual(overrides.engineVadModel, 'fsmn-vad');
        assert.strictEqual(overrides.vadSensitive, false);
    });

    it('collectSenseSupportGaps lists preferred AV models when missing', () => {
        const { missing } = collectSenseSupportGaps(
            {
                language: 'ja',
                engineAsrModel: 'whisper-large-v3-turbo',
                engineVadModel: 'fsmn-vad',
                vadSensitive: false,
                engineMtModel: 'opus-mt-ja-zh',
            },
            {
                profile: 'av_soft',
                language: 'ja',
                task: 'translate',
                installedModels: [
                    { id: 'whisper-large-v3-turbo', installed: true },
                    { id: 'fsmn-vad', installed: true },
                    { id: 'opus-mt-ja-zh', installed: true },
                ],
            },
        );
        const ids = missing.map((m) => m.id);
        assert.ok(ids.includes('whisper-ja-1.5b'));
        assert.ok(ids.includes('whisperseg-asmr'));
        assert.ok(ids.includes('sakura-1.5b'));
    });

    it('collectSenseSupportGaps treats Sakura 7B as satisfying Sakura preference', () => {
        const { missing } = collectSenseSupportGaps(
            { language: 'ja', filmAudioEnhance: false },
            {
                profile: 'av_soft',
                language: 'ja',
                task: 'translate',
                installedModels: [
                    { id: 'whisper-ja-1.5b', installed: true },
                    { id: 'whisperseg-asmr', installed: true },
                    { id: 'sakura-7b', installed: true },
                ],
            },
        );
        assert.strictEqual(missing.length, 0);
    });

    it('collectSenseSupportGaps flags Demucs for film enhance', () => {
        const { missing } = collectSenseSupportGaps(
            {
                filmAudioEnhance: true,
                engineAsrModel: 'whisper-large-v3-turbo',
            },
            {
                profile: 'film',
                task: 'transcribe',
                installedModels: [{ id: 'whisper-large-v3-turbo', installed: true }],
                demucsReady: false,
            },
        );
        assert.ok(missing.some((m) => m.kind === 'demucs'));
    });

    it('mergeSenseSupportGaps dedupes by kind:id', () => {
        const merged = mergeSenseSupportGaps([
            { missing: [{ id: 'sakura-1.5b', kind: 'model', label: 'a' }] },
            [{ id: 'sakura-1.5b', kind: 'model', label: 'b' }, { id: 'demucs', kind: 'demucs', label: 'c' }],
        ]);
        assert.strictEqual(merged.length, 2);
        assert.strictEqual(merged[0].label, 'a');
    });

    it('builds sense memory keys from folder and maker', () => {
        const keys = buildSenseMemoryKeys('F:/Media/JAV/SSIS-001.mp4');
        assert.ok(keys.some((k) => k.startsWith('folder:')));
        assert.ok(keys.includes('maker:ssis'));
    });

    it('applies sense memory prefer / avoid', () => {
        const base = classifyContentProfile({ fileName: 'video001.mp4' });
        const preferred = applySenseMemoryToClassification(base, [
            { key: 'folder:x', profile: 'film', prefer: true, hits: 2 },
        ]);
        assert.strictEqual(preferred.classification.profile, 'film');
        assert.ok(preferred.forceAdopt);

        const avoided = applySenseMemoryToClassification(
            classifyContentProfile({ fileName: 'Movie.BluRay.mkv', durationSec: 7200 }),
            [{ key: 'folder:y', profile: 'film', prefer: false, hits: 1 }],
        );
        assert.ok(avoided.forceSuggest);
    });

    it('applies acoustic music/soft hints', () => {
        const music = applyAcousticHints(
            { filmAudioEnhance: false },
            { musicLikely: true, hint: 'music' },
            { profile: 'film', advancedEntitled: true },
        );
        assert.strictEqual(music.overrides.filmAudioEnhance, false);
        assert.strictEqual(music.overrides.audioLightDenoise, true);
        assert.ok(music.notes.some((n) => /Demucs|轻度降噪/.test(n)));

        const soft = applyAcousticHints(
            { vadSensitive: false, audioLightDenoise: true },
            { softSparse: true, hint: 'soft' },
            { profile: 'av_soft', advancedEntitled: true },
        );
        assert.strictEqual(soft.overrides.vadSensitive, true);
        assert.strictEqual(soft.overrides.audioLightDenoise, false);
    });

    it('FILM_PATCH keeps film VAD without Demucs', () => {
        assert.strictEqual(FILM_PATCH.filmAudioEnhance, false);
        assert.strictEqual(FILM_PATCH.audioLightDenoise, true);
        assert.strictEqual(FILM_PATCH.vadThreshold, 0.55);
        assert.strictEqual(FILM_PATCH.vadMinSpeechDurationMs, 350);
        assert.strictEqual(FILM_PATCH.vadMinSilenceDurationMs, 280);
        assert.strictEqual(FILM_PATCH.hallucinationSilenceThreshold, 2);
    });

    it('resolveItemSense film never enables Demucs even when Pro entitled', () => {
        const resolved = resolveItemSense(
            { path: 'Feature.Film.BluRay.Remux.mkv', durationSec: 8000 },
            { language: 'en', filmAudioEnhance: false },
            { autoSense: true, advancedEntitled: true },
        );
        assert.strictEqual(resolved.action, 'apply');
        assert.strictEqual(resolved.overrides.filmAudioEnhance, false);
        assert.strictEqual(resolved.overrides.audioLightDenoise, true);
    });
});
