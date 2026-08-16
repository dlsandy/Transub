const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rangeAsr = require('../electron/engine-range-asr-policy');
const runAsr = require('../electron/engine-run-asr-job');
const batchRecovery = require('../src/js/batch-recovery-core');
const {
    summarizeDomainFixChanges,
    mergeDomainFixTraces,
    formatDomainFixLogLine,
} = require('../electron/asr-domain-fix-trace');
const {
    buildDiagnosticsPayload,
    exportAsrDiagnosticsPack,
    redactOptions,
} = require('../electron/asr-diagnostics-export');
const meta = require('../src/js/subtitle-meta-core');
const { seedAsrConfidenceMeta, pickEngineCuesForConfidence } = require('../electron/asr-confidence-seed');
const {
    interpretWaitJobResult,
    buildFailedItemResult,
} = require('../electron/engine-batch-item');

describe('ASR software improvements', () => {
    it('buildBatchAsrCandidates covers sensevoice and specialists', () => {
        assert.deepStrictEqual(
            rangeAsr.buildBatchAsrCandidates('sensevoice-small'),
            ['sensevoice-small', 'whisper-tiny', 'whisper-large-v3-turbo'],
        );
        const ja = rangeAsr.buildBatchAsrCandidates('whisper-ja-1.5b');
        assert.strictEqual(ja[0], 'whisper-ja-1.5b');
        assert.ok(ja.indexOf('kotoba-whisper-v2.0-faster') < ja.indexOf('sensevoice-small'));
        assert.ok(ja.includes('anime-whisper'));
        assert.ok(ja.includes('sensevoice-small'));
        assert.ok(ja.includes('whisper-tiny'));
        const anime = rangeAsr.buildBatchAsrCandidates('anime-whisper');
        assert.ok(anime.indexOf('kotoba-whisper-v2.0-faster') < anime.indexOf('sensevoice-small'));
        assert.ok(anime.includes('qwen3-asr-1.7b-ja-anime-galgame'));
        assert.deepStrictEqual(
            rangeAsr.buildRangeAsrCandidates('sensevoice-small'),
            rangeAsr.buildBatchAsrCandidates('sensevoice-small'),
        );
    });

    it('runEngineJobWithAsrFailover retries empty ASR then succeeds', async () => {
        const calls = [];
        const createJob = async (_url, body) => {
            calls.push(body.asrModel);
            return { ok: true, data: { id: `j-${body.asrModel}` } };
        };
        const waitJob = async (_url, jobId) => {
            if (jobId.includes('sensevoice')) {
                return { ok: false, error: '未识别到有效字幕', code: 'ASR_EMPTY' };
            }
            return { ok: true, data: { result: { cues: { source: [{ start: 0, end: 1, text: 'ok' }] } } } };
        };
        const out = await runAsr.runEngineJobWithAsrFailover({
            baseUrl: 'http://127.0.0.1:9',
            primaryAsr: 'sensevoice-small',
            buildJobBody: (asrModel) => ({ asrModel, task: 'transcribe' }),
            createJob,
            waitJob,
        });
        assert.ok(out.ok);
        assert.strictEqual(out.asrModel, 'whisper-tiny');
        assert.ok(calls.length >= 2);
        assert.strictEqual(calls[0], 'sensevoice-small');
    });

    it('runSingleEngineJob restarts engine and retries same ASR on network fail', async () => {
        const calls = [];
        let creates = 0;
        let restarts = 0;
        const createJob = async (_url, body) => {
            creates += 1;
            calls.push(body.asrModel);
            if (creates === 1) {
                return { ok: false, error: 'fetch failed', code: 'network' };
            }
            return { ok: true, data: { id: 'j-ok' } };
        };
        const waitJob = async () => ({
            ok: true,
            data: { result: { cues: { source: [{ start: 0, end: 1, text: 'ok' }] } } },
        });
        const out = await runAsr.runEngineJobWithAsrFailover({
            baseUrl: 'http://127.0.0.1:9',
            primaryAsr: 'anime-whisper',
            candidates: ['anime-whisper', 'whisper-tiny'],
            buildJobBody: (asrModel) => ({ asrModel, task: 'transcribe' }),
            createJob,
            waitJob,
            restartEngine: async () => {
                restarts += 1;
                return { ok: true, baseUrl: 'http://127.0.0.1:9' };
            },
        });
        assert.ok(out.ok);
        assert.strictEqual(out.asrModel, 'anime-whisper');
        assert.strictEqual(creates, 2);
        assert.strictEqual(restarts, 1);
        assert.deepStrictEqual(calls, ['anime-whisper', 'anime-whisper']);
        assert.strictEqual(runAsr.isEngineNetworkFail({ ok: false, code: 'network', error: 'fetch failed' }), true);
    });

    it('attachCheckpointResumeHint marks asr_done resumable', async () => {
        const hint = await runAsr.attachCheckpointResumeHint(
            'http://x',
            'job1',
            async () => ({ ok: true, data: { stage: 'asr_done', sourceCueCount: 12 } }),
        );
        assert.strictEqual(hint.resumable, true);
        assert.strictEqual(hint.resumeFromJobId, 'job1');
    });

    it('batch recovery prefers resume when checkpoint exists', () => {
        const g = batchRecovery.buildBatchFailureGuidance({
            message: '外部翻译失败',
            code: 'MT_FAIL',
            resumable: true,
            resumeFromJobId: 'abc',
        });
        assert.strictEqual(g.primaryAction.id, 'resume-from-asr');
        assert.ok(g.actions.some((a) => a.id === 'resume-from-asr'));
        const idle = batchRecovery.buildBatchFailureGuidance({
            message: '任务长时间无响应',
            code: 'idle_timeout',
        });
        assert.strictEqual(idle.primaryAction.id, 'retry-item');
        const chips = batchRecovery.buildBatchRecoveryChipsHtml(idle, 3, (s) => String(s), { max: 3 });
        assert.ok(chips.includes('data-batch-recover="retry-item"'));
        assert.ok(chips.includes('data-batch-recover-idx="3"'));
        assert.strictEqual(
            batchRecovery.buildBatchRecoveryChipsHtml(idle, 0, (s) => s, { running: true }),
            '',
        );
        const net = batchRecovery.buildBatchFailureGuidance({
            message: '引擎连接失败，可点「重试本条」',
            code: 'network',
            asrCandidates: ['anime-whisper'],
            asrAttempts: 1,
        });
        assert.strictEqual(net.primaryAction.id, 'retry-item');
        assert.ok(net.tip.includes('重试本条'));
        assert.ok(!net.tip.includes('打开引擎日志') || net.primaryAction.id === 'retry-item');
    });

    it('domain fix trace summarizes stages', () => {
        const a = summarizeDomainFixChanges([
            { from: 'アパイタ', to: 'アルバイト', count: 2 },
            { from: 'アパイタ', to: 'アルバイト', count: 1 },
        ], 'desktop_sanitize');
        assert.strictEqual(a.total, 3);
        assert.ok(formatDomainFixLogLine(a).includes('asr-domain'));
        const merged = mergeDomainFixTraces([a, summarizeDomainFixChanges([], 'engine_d01')]);
        assert.strictEqual(merged.total, 3);
    });

    it('diagnostics pack redacts secrets and writes files', () => {
        const red = redactOptions({ engineUrl: 'http://x', apiKey: 'secret', token: 't' });
        assert.strictEqual(red.apiKey, '[redacted]');
        assert.strictEqual(red.token, '[redacted]');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-diag-'));
        const out = exportAsrDiagnosticsPack({
            outDir: dir,
            options: { device: 'cpu', hfToken: 'nope' },
            jobId: 'j1',
            mediaPath: 'F:/media/foo.mp4',
            logLines: ['a', 'b'],
            cueStats: { source: 10 },
        });
        assert.ok(out.ok);
        assert.ok(fs.existsSync(out.manifestPath));
        const payload = buildDiagnosticsPayload({ jobId: 'j1', options: { password: 'x' } });
        assert.strictEqual(payload.options.password, '[redacted]');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('confidence accepts score backends and heuristic', () => {
        const scored = meta.confidenceFromAsrMeta({ confidence: 0.91 });
        assert.ok(scored.confidence > 0.8);
        assert.strictEqual(scored.source, 'asr_score');
        const heur = meta.confidenceFromAsrMeta({ text: 'あ' }, { allowHeuristic: true });
        assert.ok(heur.flags.includes('heuristic'));
        const doc = meta.buildAsrSidecarFromEngineCues([
            { start: 0, end: 1, text: 'hello', score: 0.4 },
            { start: 1, end: 2, text: 'world' },
        ]);
        assert.ok(doc.entries.length >= 1);
    });

    it('mergeRangeAsrConfidence merges time window into sidecar', () => {
        const { mergeRangeAsrConfidenceMeta } = require('../electron/asr-confidence-seed');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-range-conf-'));
        const subPath = path.join(dir, 'sample.srt');
        fs.writeFileSync(subPath, '1\n00:00:00,000 --> 00:00:05,000\nold\n');
        const seeded = seedAsrConfidenceMeta(subPath, [
            { startMs: 0, endMs: 2000, text: 'aaa', confidence: 0.9 },
            { startMs: 3000, endMs: 5000, text: 'bbb', confidence: 0.85 },
        ]);
        assert.ok(seeded.ok);
        const merged = mergeRangeAsrConfidenceMeta(subPath, [
            { startMs: 2800, endMs: 4200, text: 'ccc', confidence: 0.4 },
        ], { startMs: 2500, endMs: 4500 });
        assert.ok(merged.ok);
        assert.ok(merged.merged);
        const { readSubtitleMeta } = require('../electron/subtitle-meta');
        const doc = readSubtitleMeta(subPath);
        assert.ok(doc?.ok && doc.meta);
        assert.ok(doc.meta.entries.some((e) => e.text === 'aaa'));
        assert.ok(doc.meta.entries.some((e) => e.text === 'ccc'));
        assert.ok(!doc.meta.entries.some((e) => e.text === 'bbb'));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('batch handoff: cues → sanitize-shaped domain → confidence seed', () => {
        const cues = pickEngineCuesForConfidence({
            cues: {
                source: [
                    { start: 0, end: 1.2, text: 'テスト', confidence: 0.88 },
                    { start: 1.2, end: 2.0, text: '…', avgLogprob: -0.9 },
                ],
            },
        });
        assert.strictEqual(cues.length, 2);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-handoff-'));
        const subPath = path.join(dir, 'sample.srt');
        fs.writeFileSync(subPath, '1\n00:00:00,000 --> 00:00:01,000\nテスト\n');
        const seeded = seedAsrConfidenceMeta(subPath, cues);
        assert.ok(seeded.ok);
        assert.ok(seeded.entryCount >= 1);
        const failed = buildFailedItemResult('a.mp4', 'idle', {
            code: 'idle_timeout',
            resumable: true,
            resumeFromJobId: 'j9',
        });
        assert.strictEqual(failed.resumeFromJobId, 'j9');
        const waitFail = interpretWaitJobResult({
            ok: false,
            error: '任务长时间无响应',
            code: 'idle_timeout',
            jobId: 'j9',
        });
        assert.strictEqual(waitFail.kind, 'failed');
        assert.strictEqual(waitFail.code, 'idle_timeout');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('e2e-shaped: failover → confidence seed → recovery guidance', async () => {
        const {
            summarizeAsrRunMeta,
            appendAsrRunToDetail,
        } = require('../electron/engine-batch-item');
        const { buildUiProgress } = require('../electron/engine-job-progress');
        const calls = [];
        const createJob = async (_url, body) => {
            calls.push(body.asrModel);
            return { ok: true, data: { id: `j-${body.asrModel}` } };
        };
        const waitJob = async (_url, jobId) => {
            if (jobId.includes('sensevoice')) {
                return { ok: false, error: '未识别到有效字幕', code: 'ASR_EMPTY' };
            }
            return {
                ok: true,
                data: {
                    result: {
                        cues: {
                            source: [
                                { start: 0, end: 1, text: 'hello', confidence: 0.9 },
                            ],
                        },
                    },
                },
            };
        };
        const out = await runAsr.runEngineJobWithAsrFailover({
            baseUrl: 'http://127.0.0.1:9',
            primaryAsr: 'sensevoice-small',
            buildJobBody: (asrModel) => ({ asrModel, task: 'transcribe' }),
            createJob,
            waitJob,
        });
        assert.ok(out.ok);
        assert.strictEqual(out.asrModel, 'whisper-tiny');
        assert.ok(out.asrAttempts >= 2);
        assert.deepStrictEqual(calls.slice(0, 2), ['sensevoice-small', 'whisper-tiny']);

        const asrRun = summarizeAsrRunMeta({
            asrModel: out.asrModel,
            primaryAsr: 'sensevoice-small',
            asrAttempts: out.asrAttempts,
        });
        assert.ok(asrRun.failedOver);
        const detail = appendAsrRunToDetail('完成', asrRun);
        assert.ok(detail.includes('whisper-tiny'));

        const cues = pickEngineCuesForConfidence(out.result);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-e2e-asr-'));
        const subPath = path.join(dir, 'out.srt');
        fs.writeFileSync(subPath, '1\n00:00:00,000 --> 00:00:01,000\nhello\n');
        const seeded = seedAsrConfidenceMeta(subPath, cues);
        assert.ok(seeded.ok);

        const ui = buildUiProgress({
            stage: 'done',
            detail,
            asrModel: asrRun.asrModel,
            primaryAsr: asrRun.primaryAsr,
            asrAttempts: asrRun.asrAttempts,
            asrFailedOver: asrRun.failedOver,
        });
        assert.strictEqual(ui.phase, 'done');
        assert.strictEqual(ui.asrFailedOver, true);

        const idle = batchRecovery.buildBatchFailureGuidance({
            message: '任务长时间无响应',
            code: 'idle_timeout',
        });
        assert.strictEqual(idle.primaryAction.id, 'retry-item');
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
