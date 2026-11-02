const assert = require('assert');
const soHandoff = require('../electron/engine-asr-second-opinion-handoff');
const core = require('../src/js/asr-second-opinion-core');

describe('engine-asr-second-opinion-handoff', () => {
    it('plans batch second opinion from settings mode', () => {
        assert.strictEqual(soHandoff.planAsrSecondOpinionBatch(
            { asrSecondOpinion: 'off' },
            'dual',
        ).enabled, false);
        assert.strictEqual(soHandoff.planAsrSecondOpinionBatch(
            {
                asrSecondOpinion: 'off',
                contentProfile: 'av_soft',
                engineAsrModel: 'qwen3-asr-1.7b-ja-anime-galgame',
            },
            'transcribe',
        ).enabled, false);
        assert.strictEqual(soHandoff.planAsrSecondOpinionBatch(
            { asrSecondOpinion: 'on', contentProfile: 'film' },
            'translate_mt',
        ).enabled, true);
        assert.strictEqual(soHandoff.planAsrSecondOpinionBatch(
            { asrSecondOpinion: 'on', contentProfile: 'film' },
            'translate_mt',
        ).splitBeforeMt, true);
        const autoSoft = soHandoff.planAsrSecondOpinionBatch(
            { asrSecondOpinion: 'auto', contentProfile: 'av_soft', engineAsrModel: 'anime-whisper' },
            'dual',
        );
        assert.strictEqual(autoSoft.enabled, true);
        // qualityPipelineMode=auto + default quality perf → film also enables auto SO
        const autoFilm = soHandoff.planAsrSecondOpinionBatch(
            { asrSecondOpinion: 'auto', contentProfile: 'film', engineAsrModel: 'sensevoice-small' },
            'dual',
        );
        assert.strictEqual(autoFilm.enabled, true);
        const autoFilmSpeed = soHandoff.planAsrSecondOpinionBatch(
            {
                asrSecondOpinion: 'auto',
                contentProfile: 'film',
                engineAsrModel: 'sensevoice-small',
                perfProfile: 'speed',
            },
            'dual',
        );
        assert.strictEqual(autoFilmSpeed.enabled, false);
        const speedAuto = soHandoff.planAsrSecondOpinionBatch(
            {
                asrSecondOpinion: 'auto',
                contentProfile: 'av_soft',
                engineAsrModel: 'anime-whisper',
                perfProfile: 'speed',
            },
            'dual',
        );
        assert.strictEqual(speedAuto.enabled, false);
        assert.strictEqual(speedAuto.reason, 'speed_profile');
        const speedOn = soHandoff.planAsrSecondOpinionBatch(
            { asrSecondOpinion: 'on', contentProfile: 'film', perfProfile: 'speed' },
            'translate_mt',
        );
        assert.strictEqual(speedOn.enabled, true);
        const qwenPlan = soHandoff.planAsrSecondOpinionBatch(
            { asrSecondOpinion: 'on', engineAsrModel: 'qwen3-asr-1.7b-ja' },
            'dual',
        );
        assert.strictEqual(qwenPlan.reusePrimary, true);
        const held = soHandoff.applyPreMtTranscribeGpuHold(
            { task: 'transcribe', releaseGpuAfter: true },
            qwenPlan,
        );
        assert.strictEqual(held.releaseGpuAfter, false);
        assert.strictEqual(soHandoff.shouldReleaseAsrGpuAfterSkippedSecondOpinion(
            qwenPlan,
            { secondOpinion: { skipped: true, reason: 'few_cues' } },
        ), true);
        assert.strictEqual(soHandoff.shouldReleaseAsrGpuAfterSkippedSecondOpinion(
            qwenPlan,
            { secondOpinion: { attempted: 3 } },
        ), false);
        const animePlan = soHandoff.planAsrSecondOpinionBatch(
            { asrSecondOpinion: 'on', engineAsrModel: 'anime-whisper' },
            'dual',
        );
        assert.strictEqual(animePlan.reusePrimary, false);
        const notHeld = soHandoff.applyPreMtTranscribeGpuHold(
            { task: 'transcribe', releaseGpuAfter: true },
            animePlan,
        );
        assert.strictEqual(notHeld.releaseGpuAfter, true);
    });

    it('holds GPU across second-opinion range jobs', () => {
        const { buildSecondOpinionRangeOptions } = require('../electron/engine-asr-second-opinion');
        const opts = buildSecondOpinionRangeOptions(
            { beamSize: 5, releaseGpuAfter: true },
            'qwen3-asr-1.7b-ja',
        );
        assert.strictEqual(opts.releaseGpuAfter, false);
        assert.strictEqual(opts.engineAsrModel, 'qwen3-asr-1.7b-ja');
        assert.strictEqual(opts.task, 'transcribe');
        assert.strictEqual(opts.smartTranslate, false);
    });

    it('SenseVoice sibling remaps TEN VAD to fsmn-vad', () => {
        const { buildSecondOpinionRangeOptions } = require('../electron/engine-asr-second-opinion');
        const opts = buildSecondOpinionRangeOptions(
            { engineVadModel: 'ten-vad', timingAlignModel: 'ten', releaseGpuAfter: true },
            'sensevoice-small',
        );
        assert.strictEqual(opts.engineVadModel, 'fsmn-vad');
        assert.strictEqual(opts.engineAsrModel, 'sensevoice-small');
    });

    it('converts ms cues back to engine shape', () => {
        const out = soHandoff.engineCuesFromMs([
            { startMs: 1000, endMs: 2500, text: 'こんにちは' },
        ]);
        assert.strictEqual(out.length, 1);
        assert.ok(Math.abs(out[0].start - 1) < 1e-6);
        assert.strictEqual(out[0].text, 'こんにちは');
    });

    it('respects shouldRun gate through plan', () => {
        assert.strictEqual(core.shouldRunAsrSecondOpinion({
            asrSecondOpinion: 'auto',
            primaryAsr: 'anime-whisper',
        }), true);
    });
});
