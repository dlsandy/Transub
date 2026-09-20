const assert = require('assert');
const http = require('http');
const {
    mapEngineStageToItemStage,
    engineStageZh,
    buildUiProgress,
    remapJobProgress,
    remapBridgeProgress,
    extractOutputPaths,
    mapEngineResultsToHistoryOutputs,
} = require('../electron/engine-job-progress');
const {
    parseHostPort,
    mapDeviceForEngine,
    waitForHealth,
} = require('../electron/engine-spawn-utils');
const { getHealth } = require('../electron/engine-client');

describe('engine-job-progress', () => {
    it('maps engine stages to UI item stages', () => {
        assert.strictEqual(mapEngineStageToItemStage('queued'), 'starting');
        assert.strictEqual(mapEngineStageToItemStage('mt'), 'translate');
        assert.strictEqual(mapEngineStageToItemStage('save'), 'save');
        assert.strictEqual(mapEngineStageToItemStage('write'), 'save');
        assert.strictEqual(mapEngineStageToItemStage('running'), 'transcribe');
        assert.strictEqual(mapEngineStageToItemStage('error'), 'failed');
        assert.strictEqual(mapEngineStageToItemStage('asr_semantic_repair'), 'semantic_repair');
        assert.strictEqual(mapEngineStageToItemStage('pre_mt_qc'), 'pre_mt_qc');
        assert.strictEqual(mapEngineStageToItemStage('qc_loop'), 'qc_loop');
        assert.strictEqual(mapEngineStageToItemStage('polish'), 'cleanup');
        assert.strictEqual(mapEngineStageToItemStage('postprocess'), 'postprocess');
        assert.strictEqual(engineStageZh('semantic_repair'), '原文校正');
        assert.strictEqual(engineStageZh('postprocess'), '字幕后期处理');
        assert.strictEqual(engineStageZh('model'), '加载识别模型');
        assert.strictEqual(engineStageZh('transcribe'), '原文提取');
    });

    it('remapJobProgress keeps semantic repair and MT in separate bands', () => {
        const asrEnd = remapJobProgress('translate_mt', { stage: 'transcribe', percent: 100 }).percent;
        const repair = remapJobProgress('translate_mt', { stage: 'asr_semantic_repair', percent: 50 }).percent;
        const asrCleanup = remapJobProgress('translate_mt', { stage: 'source_cleanup', percent: 88 }).percent;
        const mt0 = remapJobProgress('translate_mt', { stage: 'translate', percent: 0 }).percent;
        const mtMid = remapJobProgress('translate_mt', { stage: 'translate', percent: 50 }).percent;
        const polish = remapJobProgress('translate_mt', { stage: 'cleanup', percent: 50 }).percent;
        const save = remapJobProgress('translate_mt', { stage: 'save', percent: 50 }).percent;
        const qc = remapJobProgress('translate_mt', { stage: 'qc_fix', percent: 50 }).percent;
        assert.ok(asrEnd <= 65, `asr end ${asrEnd}`);
        assert.ok(repair >= 62 && repair <= 65, `repair ${repair}`);
        assert.ok(asrCleanup >= 62 && asrCleanup <= 65, `asr cleanup ${asrCleanup}`);
        assert.ok(asrCleanup < polish, `asr cleanup ${asrCleanup} vs polish ${polish}`);
        assert.ok(repair <= mt0, `repair ${repair} vs mt0 ${mt0}`);
        assert.strictEqual(mt0, 65);
        assert.ok(mtMid > 70 && mtMid < 95);
        assert.ok(polish >= 95 && polish <= 97);
        assert.ok(save >= 97 && save <= 98);
        assert.ok(qc >= 98 && qc <= 100);
    });

    it('remapBridgeProgress maps bridge handoff ticks', () => {
        const mapped = remapBridgeProgress('dual', {
            stage: 'asr_semantic_repair',
            percent: 50,
            detail: '转录语义校正…',
            itemDualPhase: 'source',
        });
        assert.ok(mapped.percent >= 62 && mapped.percent <= 65);
        assert.strictEqual(mapped.itemDualPhase, 'source');
        const mt = remapBridgeProgress('dual', {
            stage: 'translate',
            percent: 0,
            itemDualPhase: 'translate',
        });
        assert.strictEqual(mt.percent, 65);
    });

    it('softenTranslateProgressFields holds premature translate spikes', () => {
        const {
            softenTranslateProgressFields,
            getTranslateProgressSession,
            clearTranslateProgressSessions,
            TRANSLATE_LOAD_LO,
        } = require('../electron/engine-job-progress');
        clearTranslateProgressSessions();
        const session = getTranslateProgressSession('D:/a.mp4');
        const first = softenTranslateProgressFields({
            stage: 'translate',
            percent: 95,
            detail: '翻译完成',
        }, session);
        assert.strictEqual(first.percent, TRANSLATE_LOAD_LO);
        const zeroWork = softenTranslateProgressFields({
            stage: 'translate',
            percent: 95,
            detail: '翻译 0/200',
        }, getTranslateProgressSession('D:/b.mp4'));
        assert.strictEqual(zeroWork.percent, TRANSLATE_LOAD_LO);
        const withWork = softenTranslateProgressFields({
            stage: 'translate',
            percent: 95,
            detail: '翻译 40/200',
        }, session);
        assert.ok(withWork.percent >= 70 && withWork.percent < 95);
    });

    it('parseTranslateWorkNumerator ignores Sakura chunk labels', () => {
        const { parseTranslateWorkNumerator } = require('../electron/engine-job-progress');
        assert.strictEqual(parseTranslateWorkNumerator('Sakura 翻译 5/5 · 第 33–40 条 完成'), null);
        assert.strictEqual(parseTranslateWorkNumerator('推理翻译 5/5 · 第 33–40 条 完成'), null);
        assert.deepStrictEqual(parseTranslateWorkNumerator('翻译 40/1283'), { done: 40, total: 1283 });
    });

    it('engine SSE translate percent is job-wide — must not remap twice', () => {
        // Python jobs.progress() already maps local 1 → ~66 job-wide.
        const engineSse = { stage: 'translate', percent: 66 };
        const wronglyDouble = remapJobProgress('translate_mt', engineSse).percent;
        assert.ok(wronglyDouble >= 85, 'double remap inflates translate band');
        assert.strictEqual(engineSse.percent, 66, 'pass engine SSE percent through unchanged');
    });

    it('buildUiProgress sets phase and dualPhase', () => {
        const ui = buildUiProgress({
            file: 'D:/a.mp4',
            index1: 1,
            total: 2,
            stage: 'translate',
            detail: '翻译 1/10',
            percent: 40,
            processedSec: 12,
            mediaDurationSec: 120,
        });
        assert.strictEqual(ui.phase, 'running');
        assert.strictEqual(ui.itemStage, 'translate');
        assert.strictEqual(ui.itemDualPhase, 'translate');
        assert.strictEqual(ui.itemProgress, 40);
        assert.strictEqual(ui.videoCurrentSec, 12);
        assert.strictEqual(ui.videoTotalSec, 120);
        const done = buildUiProgress({
            stage: 'done',
            detail: '完成',
            asrModel: 'whisper-tiny',
            primaryAsr: 'sensevoice-small',
            asrAttempts: 2,
            asrFailedOver: true,
        });
        assert.strictEqual(done.phase, 'done');
        assert.strictEqual(done.asrModel, 'whisper-tiny');
        assert.strictEqual(done.asrFailedOver, true);
    });

    it('extractOutputPaths prefers dual / roles', () => {
        const paths = extractOutputPaths({
            outputs: [
                { role: 'source', path: 'a.src.srt' },
                { role: 'zh', path: 'a.zh.srt' },
                { role: 'dual', path: 'a.dual.srt' },
            ],
        });
        assert.strictEqual(paths.subtitlePath, 'a.dual.srt');
        assert.strictEqual(paths.sourceSubtitlePath, 'a.src.srt');
        assert.strictEqual(paths.targetSubtitlePath, 'a.zh.srt');
        assert.strictEqual(paths.bilingualSubtitlePath, 'a.dual.srt');
    });

    it('mapEngineResultsToHistoryOutputs filters empty', () => {
        const outs = mapEngineResultsToHistoryOutputs([
            { path: 'v.mp4', subtitlePath: 'v.srt', ok: true },
            { path: '', subtitlePath: '', ok: false },
            { path: 'x.mp4', ok: false, cancelled: true },
        ]);
        assert.strictEqual(outs.length, 2);
        assert.strictEqual(outs[0].status, 'done');
        assert.strictEqual(outs[1].status, 'cancelled');
    });
});

describe('engine-spawn-utils', () => {
    it('parses host/port and maps devices', () => {
        assert.deepStrictEqual(parseHostPort('http://127.0.0.1:9000'), {
            host: '127.0.0.1',
            port: 9000,
        });
        assert.strictEqual(parseHostPort('not-a-url').port, 8765);
        assert.strictEqual(mapDeviceForEngine('cuda_low_vram'), 'cuda');
        assert.strictEqual(mapDeviceForEngine('cpu'), 'cpu');
        assert.strictEqual(mapDeviceForEngine('auto'), 'auto');
    });

    it('waitForHealth succeeds against mock engine', async () => {
        const server = http.createServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, apiVersion: '1.0.0' }));
        });
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        const { port } = server.address();
        try {
            const res = await waitForHealth(`http://127.0.0.1:${port}`, {
                timeoutMs: 2000,
                intervalMs: 50,
                getHealth,
            });
            assert.strictEqual(res.ok, true);
        } finally {
            await new Promise((r) => server.close(r));
        }
    });

    it('waitForHealth prefers network error over HTTP 0', async () => {
        const { formatHealthProbeError } = require('../electron/engine-spawn-utils');
        assert.strictEqual(
            formatHealthProbeError({ ok: false, status: 0, error: '引擎未响应（连接被拒绝）' }),
            '引擎未响应（连接被拒绝）',
        );
        assert.strictEqual(
            formatHealthProbeError({ ok: false, status: 0, data: null }),
            '引擎未响应',
        );
        assert.strictEqual(
            formatHealthProbeError({ ok: false, status: 503, data: { message: 'busy' } }),
            'busy',
        );
        assert.strictEqual(
            formatHealthProbeError({ ok: false, status: 502 }),
            'HTTP 502',
        );

        let alive = true;
        const res = await waitForHealth('http://127.0.0.1:1', {
            timeoutMs: 800,
            intervalMs: 50,
            getHealth: async () => ({
                ok: false,
                status: 0,
                data: null,
                error: '引擎未响应（连接被拒绝）',
                code: 'network',
            }),
            isChildAlive: () => {
                alive = false;
                return false;
            },
            getChildExitCode: () => 0,
        });
        assert.strictEqual(res.ok, false);
        assert.ok(!String(res.error).includes('HTTP 0'), res.error);
        assert.ok(/退出/.test(String(res.error)), res.error);
        assert.strictEqual(res.exitCode, 0);
        assert.strictEqual(alive, false);
    });
});
