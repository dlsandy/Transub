const assert = require('assert');
const fin = require('../src/js/sense-finalize-core');
const post = require('../electron/engine-batch-postprocess-plan');
const autofix = require('../src/js/post-batch-autofix-plan-core');
const retrans = require('../src/js/retranslate-plan-core');
const infer = require('../src/js/infer-stage-progress-core');
const ready = require('../src/js/start-readiness-core');

describe('final-round cores', () => {
    it('sense adopt/reject/enforce', () => {
        assert.strictEqual(fin.isExplicitSenseReject({
            sense: { action: 'suggest', adopted: false },
        }), true);
        const rejected = fin.buildRejectedSenseState({
            status: 'done',
            adopted: true,
            message: '方案A',
        });
        assert.strictEqual(rejected.adopted, false);
        assert.ok(rejected.message.includes('已不采纳'));

        const adopted = fin.buildAdoptedSenseState({
            status: 'done',
            action: 'suggest',
            overrides: { language: 'ja' },
            message: '方案（已不采纳）',
        });
        assert.strictEqual(adopted.ok, true);
        assert.strictEqual(adopted.sense.adopted, true);

        const planned = fin.planEnforceSenseAdopt([
            { sense: { status: 'done', overrides: { language: 'ja' }, adopted: false } },
            { sense: { status: 'sensing' } },
        ]);
        assert.deepStrictEqual(planned.adoptIndexes, [0]);
        assert.strictEqual(planned.uncovered.length, 1);
    });

    it('engine postprocess plan', () => {
        assert.strictEqual(post.isTranslateLikeTask('dual', 'transcribe'), true);
        const paths = post.collectUniqueZhSubtitlePaths({
            sourceSubtitlePath: 'D:/a.src.srt',
            targetSubtitlePath: 'D:/a.srt',
            subtitlePath: 'D:/a.srt',
        }, {
            resolve: (p) => p.replace(/\\/g, '/'),
            existsSync: () => true,
        });
        assert.deepStrictEqual(paths, ['D:/a.srt']);
        const flags = post.resolveInterjectionDropFlags({
            postBatchInterjectionMode: 'clear',
            postBatchOnomatopoeiaMode: 'off',
        });
        assert.strictEqual(flags.dropDiscourse, true);
        assert.strictEqual(flags.dropOnomatopoeia, false);
        assert.strictEqual(post.resolveInterjectionDropFlags({}).shouldCompact, false);
        assert.strictEqual(post.resolveInterjectionDropFlags({
            postBatchCompactPureInterjections: true,
        }).shouldCompact, true);
    });

    it('post-batch autofix flags', () => {
        const flags = autofix.planPostBatchAutofixFlags({
            savedOpts: {
                task: 'translate',
                postBatchCpsSplit: true,
                postBatchRemoveNoise: false,
                postBatchCompressRepetition: true,
                postBatchViewingPunctMode: 'clear',
                postBatchInterjectionMode: 'off',
                postBatchOnomatopoeiaMode: 'light',
            },
            normalizeViewingCleanMode: (v, fb) => v || fb,
            isTranslateLikeTask: (t) => t === 'translate' || t === 'dual',
        });
        assert.strictEqual(flags.doNoise, false);
        assert.strictEqual(flags.doSpacePunct, true);
        assert.strictEqual(flags.doSoftenOnomatopoeia, true);
        assert.ok(autofix.buildPostBatchAutofixLabelParts(flags).includes('观影清除标点'));
    });

    it('retranslate plan helpers', () => {
        assert.strictEqual(retrans.primarySubFormatFromList('vtt,srt'), 'vtt');
        const dest = retrans.resolveRetranslateDestPath(
            { path: 'D:/v/a.mp4' },
            'D:/k/a.src.srt',
            {
                resolveOutputDir: () => 'D:/out',
                pathDirname: (p) => p.replace(/[/\\][^/\\]+$/, ''),
                pathJoin: (...xs) => xs.join('/'),
                stemNoExt: (p) => p.split(/[/\\]/).pop().replace(/\.[^.]+$/, ''),
                normPath: (p) => p.toLowerCase(),
                subFormats: 'srt',
            },
        );
        assert.strictEqual(dest, 'D:/out/a.srt');
        const pct = retrans.computeRetranslateOverallPct({ index: 0, itemPct: 50, total: 2 });
        assert.strictEqual(pct.displayOverall, 25);
        assert.strictEqual(
            retrans.isSmartTranslateCapableModel({ id: 'x', family: 'sakura' }),
            false,
        );
        const smartUi = retrans.buildRetranslateSmartUiState({ hybridOn: true, polishOn: true });
        assert.strictEqual(smartUi.showHybridMt, true);
        assert.strictEqual(smartUi.showDialogModel, true);
        assert.strictEqual(smartUi.requireDialogModel, false);
        assert.match(smartUi.dialogLabel, /润色/);
        const lineOnly = retrans.buildRetranslateSmartUiState({ hybridOn: false, polishOn: false });
        assert.strictEqual(lineOnly.showHybridMt, false);
        assert.strictEqual(lineOnly.requireDialogModel, true);
        const hybridOnly = retrans.buildRetranslateSmartUiState({ hybridOn: true, polishOn: false });
        assert.strictEqual(hybridOnly.showDialogModel, false);
        assert.strictEqual(hybridOnly.showHybridMt, true);
    });

    it('infer progress payload + params chip', () => {
        const next = infer.applyVideoProgressPayload(
            { itemStage: 'starting', videoProgress: 0 },
            { phase: 'running', itemStage: 'transcribe', itemProgress: 40, videoTotalSec: 100, videoCurrentSec: 40 },
        );
        assert.ok(next.videoProgress >= 40 || next.videoProgress > 0);
        const chip = ready.buildParamsModeChipViewModel({
            autoEnabled: true,
            autoSenseUi: { chipLabel: '开', tone: 'idle' },
            mtUseForm: true,
            translateTask: true,
        });
        assert.strictEqual(chip.label, '智能感知');
        assert.ok(chip.title.includes('影片') || chip.title.includes('类型') || chip.title.includes('匹配'));
    });
});
