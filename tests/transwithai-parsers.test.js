const assert = require('assert');
const path = require('path');

const {
    parseInferProgressLine,
    detectTransWithAiVersion,
    normalizeTransWithAiRuntimeOptions,
    mapInferStageProgress,
} = require('../electron/transwithai-bridge');

function testMapInferStageProgress() {
    assert.strictEqual(mapInferStageProgress('starting'), 0);
    assert.strictEqual(mapInferStageProgress('vad', 100), 0);
    assert.strictEqual(mapInferStageProgress('model', 100), 0);
    assert.strictEqual(mapInferStageProgress('transcribe', 0), 0);
    assert.strictEqual(mapInferStageProgress('transcribe', 50), 49);
    assert.strictEqual(mapInferStageProgress('transcribe', 100, 600, 600), 98);
    assert.strictEqual(mapInferStageProgress('save'), 99);
    assert.strictEqual(mapInferStageProgress('done'), 100);
}

function testParseInferProgressLine() {
    const vad = parseInferProgressLine('VAD进度： 3 / 10 块（30.0%）');
    assert.strictEqual(vad.stage, 'vad');
    assert.strictEqual(vad.videoProgress, 0);
    assert.ok(String(vad.detail || '').includes('3/10'));
    assert.strictEqual(vad.videoCurrentSec, undefined);
    assert.strictEqual(vad.videoTotalSec, undefined);

    const model = parseInferProgressLine('正在加载Whisper模型…');
    assert.strictEqual(model.stage, 'model');

    const save = parseInferProgressLine('正在写入：output.srt');
    assert.strictEqual(save.stage, 'save');

    assert.strictEqual(parseInferProgressLine('写入临时文件'), null);
    assert.strictEqual(parseInferProgressLine('数据写入缓存完成'), null);

    const duration = parseInferProgressLine('时长： 10分0秒 → 8分0秒');
    assert.strictEqual(duration.stage, undefined);
    assert.strictEqual(duration.videoProgress, 0);

    const empty = parseInferProgressLine('');
    assert.strictEqual(empty, null);
}

function testNormalizeOutputOptions() {
    const opts = normalizeTransWithAiRuntimeOptions({
        outputMode: 'custom',
        outputDir: 'D:\\subs',
        audioSuffixes: 'mp3,wav',
        device: 'modal',
    });
    assert.strictEqual(opts.outputMode, 'custom');
    assert.strictEqual(opts.outputDir, 'D:\\subs');
    assert.strictEqual(opts.device, 'modal');
}

function testNormalizeHallucinationOptions() {
    const defaults = normalizeTransWithAiRuntimeOptions({});
    assert.strictEqual(defaults.noSpeechThreshold, 0.6);
    assert.strictEqual(defaults.logProbThreshold, -1);
    assert.strictEqual(defaults.compressionRatioThreshold, 2.4);
    assert.strictEqual(defaults.hallucinationSilenceThreshold, null);
    assert.strictEqual(defaults.chineseSubtitleVariant, 'simplified');

    const opts = normalizeTransWithAiRuntimeOptions({
        noSpeechThreshold: 0.7,
        logProbThreshold: -0.8,
        compressionRatioThreshold: 2.1,
        hallucinationSilenceThreshold: 1.5,
        chineseSubtitleVariant: 'traditional',
    });
    assert.strictEqual(opts.noSpeechThreshold, 0.7);
    assert.strictEqual(opts.logProbThreshold, -0.8);
    assert.strictEqual(opts.compressionRatioThreshold, 2.1);
    assert.strictEqual(opts.hallucinationSilenceThreshold, 1.5);
    assert.strictEqual(opts.chineseSubtitleVariant, 'traditional');

    const cleared = normalizeTransWithAiRuntimeOptions({ hallucinationSilenceThreshold: '' });
    assert.strictEqual(cleared.hallucinationSilenceThreshold, null);

    const invalidVariant = normalizeTransWithAiRuntimeOptions({ chineseSubtitleVariant: 'nope' });
    assert.strictEqual(invalidVariant.chineseSubtitleVariant, 'simplified');
}

async function testDetectVersionFromLog() {
    const fs = require('fs');
    const os = require('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-test-'));
    try {
        const logPath = path.join(tmpDir, 'latest.log');
        fs.writeFileSync(logPath, '启动 infer\n程序版本：v2.1.0\n', 'utf8');
        const version = await detectTransWithAiVersion(tmpDir);
        assert.strictEqual(version, 'v2.1.0');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

describe('transwithai-parsers', () => {
    it('map infer stage progress', () => {
        testMapInferStageProgress();
    });
    it('parse infer progress line', () => {
        testParseInferProgressLine();
    });
    it('normalize output options', () => {
        testNormalizeOutputOptions();
    });
    it('normalize hallucination options', () => {
        testNormalizeHallucinationOptions();
    });
    it('detect version from log', async () => {
        await testDetectVersionFromLog();
    });
});
