const assert = require('assert');
const http = require('http');
const {
    mapEngineStageToItemStage,
    engineStageZh,
    buildUiProgress,
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
        assert.strictEqual(mapEngineStageToItemStage('running'), 'transcribe');
        assert.strictEqual(mapEngineStageToItemStage('error'), 'failed');
        assert.strictEqual(engineStageZh('vad'), '语音检测');
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
});
