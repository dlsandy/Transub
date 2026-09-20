const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const handoff = require('../electron/engine-asr-semantic-handoff');

describe('engine-asr-semantic-handoff', () => {
    it('builds translate job with checkpoint', () => {
        const body = handoff.buildTranslateJobWithCheckpoint(
            { task: 'translate_mt', mediaPath: 'a.mp4' },
            [{ start: 0, end: 1, text: 'ja' }],
        );
        assert.strictEqual(body.task, 'translate_mt');
        assert.strictEqual(body._checkpoint.stage, 'asr_done');
        assert.strictEqual(body._checkpoint.sourceCues.length, 1);
    });

    it('resolveSkipAsrEntry maps shelf original / transcript', () => {
        const fromOriginal = handoff.resolveSkipAsrEntry({
            fileMerged: {
                skipAsr: true,
                shelfEntryStage: 'translate',
                shelfSourceSubtitlePath: 'D:/a.original.srt',
            },
        });
        assert.strictEqual(fromOriginal.active, true);
        assert.strictEqual(fromOriginal.entryStage, 'translate');
        assert.strictEqual(fromOriginal.runRepair, false);

        const fromTranscript = handoff.resolveSkipAsrEntry({
            options: {
                skipAsr: true,
                shelfEntryStage: 'repair',
                shelfSourceSubtitlePath: 'D:/a.transcribe.srt',
            },
        });
        assert.strictEqual(fromTranscript.active, true);
        assert.strictEqual(fromTranscript.entryStage, 'repair');
        assert.strictEqual(fromTranscript.runRepair, true);

        const normal = handoff.resolveSkipAsrEntry({
            fileMerged: { sourceSubtitlePath: 'D:/leftover.srt' },
        });
        assert.strictEqual(normal.active, false);
    });

    it('runEngineJobFromExistingSource skips ASR and runs translate checkpoint', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-shelf-mt-'));
        const src = path.join(dir, 'src.srt');
        fs.writeFileSync(src, '1\n00:00:00,000 --> 00:00:01,000\nこんにちは\n');
        const jobs = [];
        try {
            const outcome = await handoff.runEngineJobFromExistingSource({
                jobBody: { task: 'translate_mt', mediaPath: 'a.mp4' },
                engineTask: 'translate_mt',
                fileMerged: { skipAsr: true, shelfEntryStage: 'translate' },
                options: {},
                repairMeta: { mediaPath: 'a.mp4' },
                onLog: () => {},
                onProgress: () => {},
                runSingleJob: async (body) => {
                    jobs.push(body);
                    return { ok: true, result: { outputs: [] } };
                },
            }, {
                active: true,
                sourcePath: src,
                entryStage: 'translate',
                runRepair: false,
            });
            assert.strictEqual(outcome.ok, true);
            assert.strictEqual(outcome.skippedAsr, true);
            assert.strictEqual(jobs.length, 1);
            assert.strictEqual(jobs[0]._checkpoint.stage, 'asr_done');
            assert.ok(jobs[0]._checkpoint.sourceCues.length >= 1);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('extracts source cues from job result', () => {
        const cues = handoff.extractEngineSourceCues({ cues: { source: [{ text: 'x' }] } });
        assert.strictEqual(cues.length, 1);
    });

    it('buildRepairInput sets nested batch mode for compute lock', () => {
        const input = handoff.buildRepairInput({ asrSemanticRepair: 'auto' });
        assert.strictEqual(input._batchMode, true);
        assert.strictEqual(input.options.asrSemanticRepair, 'auto');
    });

    it('buildRepairInput forwards glossary and asr meta', () => {
        const input = handoff.buildRepairInput(
            { asrSemanticRepair: 'auto', language: 'ja' },
            { glossary: [{ src: '太郎', tgt: '太郎' }], primaryAsr: 'sensevoice-small', mediaPath: 'a.mp4' },
        );
        assert.strictEqual(input.glossary.length, 1);
        assert.strictEqual(input.primaryAsr, 'sensevoice-small');
        assert.strictEqual(input.options.language, 'ja');
    });

    it('formatRepairFailure includes code and hint', () => {
        const msg = handoff.formatRepairFailure({ error: 'busy', code: 'compute_busy' });
        assert.match(msg, /compute_busy/);
        assert.match(msg, /等待/);
    });

    it('logRepairResult writes audit lines', () => {
        const logs = [];
        handoff.logRepairResult({
            ok: true,
            changed: 1,
            substantiveChanged: 1,
            summary: 'done',
            auditLines: ['line-a', 'line-b'],
        }, { onLog: (line) => logs.push(line) });
        assert.deepStrictEqual(logs, ['done', 'line-a', 'line-b']);
    });

    it('cleanupPreMtTranscribeMediaSidecars removes bare phase-1 srt when 译文 only', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-premt-'));
        const bare = path.join(dir, 'Movie.srt');
        const zh = path.join(dir, 'Movie.zh-cn.srt');
        fs.writeFileSync(bare, '1\n00:00:00,000 --> 00:00:01,000\nja\n');
        fs.writeFileSync(zh, '1\n00:00:00,000 --> 00:00:01,000\n中\n');
        const logs = [];
        const result = handoff.cleanupPreMtTranscribeMediaSidecars({
            options: { outputWriteSource: false },
            phase1Result: {
                outputs: [{ role: 'source', path: bare, format: 'srt' }],
            },
            phase2Result: {
                outputs: [{ role: 'zh', path: zh, format: 'srt' }],
            },
            onLog: (line) => logs.push(line),
        });
        assert.deepStrictEqual(result.removed, [bare]);
        assert.strictEqual(fs.existsSync(bare), false);
        assert.strictEqual(fs.existsSync(zh), true);
        assert.match(logs.join('\n'), /未勾选原文/);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('cleanupPreMtTranscribeMediaSidecars keeps bare srt when it is the final media-named target', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-premt-'));
        const mediaNamed = path.join(dir, 'Movie.srt');
        fs.writeFileSync(mediaNamed, '1\n00:00:00,000 --> 00:00:01,000\n中\n');
        const result = handoff.cleanupPreMtTranscribeMediaSidecars({
            options: { outputWriteSource: false },
            phase1Result: {
                outputs: [{ role: 'source', path: mediaNamed, format: 'srt' }],
            },
            phase2Result: {
                outputs: [{ role: 'zh', path: mediaNamed, format: 'srt' }],
            },
        });
        assert.deepStrictEqual(result.removed, []);
        assert.strictEqual(fs.existsSync(mediaNamed), true);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('cleanupPreMtTranscribeMediaSidecars drops bare leftover when final .src exists', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-premt-'));
        const bare = path.join(dir, 'Movie.srt');
        const src = path.join(dir, 'Movie.src.srt');
        const zh = path.join(dir, 'Movie.zh-cn.srt');
        fs.writeFileSync(bare, 'ja');
        fs.writeFileSync(src, 'ja');
        fs.writeFileSync(zh, 'zh');
        const result = handoff.cleanupPreMtTranscribeMediaSidecars({
            options: { outputWriteSource: true },
            phase1Result: {
                outputs: [{ role: 'source', path: bare, format: 'srt' }],
            },
            phase2Result: {
                outputs: [
                    { role: 'source', path: src, format: 'srt' },
                    { role: 'zh', path: zh, format: 'srt' },
                ],
            },
        });
        assert.deepStrictEqual(result.removed, [bare]);
        assert.strictEqual(fs.existsSync(src), true);
        assert.strictEqual(fs.existsSync(zh), true);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('runEngineJobWithPreMtHandoffs saves shelf source before phase2 translate', async () => {
        const Module = require('module');
        const originalLoad = Module._load;
        const order = [];
        let phase = 0;
        Module._load = function patched(request, parent, isMain) {
            if (request === './subtitle-shelf-pipeline-ingest'
                || request === path.join(__dirname, '../electron/subtitle-shelf-pipeline-ingest')) {
                return {
                    saveShelfSourceSlotsBeforeMt: (input) => {
                        order.push('shelf');
                        assert.ok(input.mediaPath);
                        assert.ok(Array.isArray(input.sourceCues));
                        return { ok: true, outPaths: input.outPaths || {} };
                    },
                };
            }
            if (request === './engine-asr-second-opinion-handoff') {
                const real = originalLoad(request, parent, isMain);
                return {
                    ...real,
                    planAsrSecondOpinionBatch: () => ({ enabled: false, mode: 'off', reason: 'off' }),
                    resolveTranscribeSourcePaths: async () => ({
                        outPaths: { sourceSubtitlePath: 'C:\\tmp\\clip.srt' },
                        sourcePath: 'C:\\tmp\\clip.srt',
                    }),
                    applyPreMtTranscribeGpuHold: (body) => body,
                    shouldReleaseAsrGpuAfterSkippedSecondOpinion: () => false,
                    applySecondOpinionAfterTranscribe: async () => ({ logs: [], outPaths: {} }),
                    isTranslateLikeEngineTask: real.isTranslateLikeEngineTask,
                };
            }
            return originalLoad(request, parent, isMain);
        };
        try {
            delete require.cache[require.resolve('../electron/engine-asr-semantic-handoff')];
            delete require.cache[require.resolve('../electron/engine-asr-second-opinion-handoff')];
            const fresh = require('../electron/engine-asr-semantic-handoff');
            const outcome = await fresh.runEngineJobWithPreMtHandoffs({
                engineTask: 'dual',
                jobBody: { task: 'dual', mediaPath: 'C:\\tmp\\clip.mp4' },
                fileMerged: { task: 'dual', asrSecondOpinion: 'off', asrSemanticRepair: 'off' },
                options: { mediaPath: 'C:\\tmp\\clip.mp4', asrSecondOpinion: 'off', asrSemanticRepair: 'off' },
                repairMeta: { mediaPath: 'C:\\tmp\\clip.mp4', primaryAsr: 'sensevoice-small' },
                runSingleJob: async (body, meta) => {
                    phase += 1;
                    order.push(phase === 1 ? 'phase1' : 'phase2');
                    if (phase === 1) {
                        assert.strictEqual(body.task, 'transcribe');
                        assert.strictEqual(meta?.itemDualPhase, 'source');
                        return {
                            ok: true,
                            result: {
                                cues: { source: [{ start: 0, end: 1, text: 'こんにちは' }] },
                                outputs: [{ role: 'source', path: 'C:\\tmp\\clip.srt' }],
                            },
                            jobId: 'j1',
                        };
                    }
                    assert.ok(body._checkpoint?.sourceCues?.length);
                    assert.strictEqual(meta?.itemDualPhase, 'translate');
                    return {
                        ok: true,
                        result: { cues: { zh: [{ start: 0, end: 1, text: '你好' }] } },
                        jobId: 'j2',
                    };
                },
            });
            assert.strictEqual(outcome.ok, true);
            assert.strictEqual(outcome.preMtShelfSourceSaved, true);
            assert.deepStrictEqual(order, ['phase1', 'shelf', 'phase2']);
        } finally {
            Module._load = originalLoad;
            delete require.cache[require.resolve('../electron/engine-asr-semantic-handoff')];
            delete require.cache[require.resolve('../electron/engine-asr-second-opinion-handoff')];
        }
    });
});
