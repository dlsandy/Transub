const assert = require('assert');
const pathUtils = require('../src/js/app-path-utils-core');
const infer = require('../src/js/infer-stage-progress-core');
const dlFmt = require('../src/js/engine-download-format-core');
const { buildHubUrls, normalizeHfEndpoint } = require('../electron/engine-download-urls');
const { buildUpdateFailure, formatUpdateFailureMeta } = require('../electron/app-updater');

describe('extracted cores (first-pass monolith split)', () => {
    it('app-path-utils-core formats paths and duration', () => {
        assert.strictEqual(pathUtils.basename('a\\b\\c.srt'), 'c.srt');
        assert.strictEqual(pathUtils.stemNoExt('a/b/c.srt'), 'c');
        assert.strictEqual(pathUtils.formatDuration(65), '1:05');
        assert.ok(pathUtils.esc('<x>').includes('&lt;'));
    });

    it('infer-stage-progress-core maps stages', () => {
        assert.strictEqual(infer.stageRank('transcribe'), 4);
        assert.ok(infer.stageRank('translate') > infer.stageRank('transcribe'));
        assert.ok(infer.stageRank('cleanup') > infer.stageRank('transcribe'));
        assert.strictEqual(infer.isPreTranscribeStage('vad'), true);
        assert.strictEqual(infer.isPreTranscribeStage('cleanup'), false);
        assert.strictEqual(infer.mapStageProgress('transcribe', 100, 600, 600), 68);
        assert.strictEqual(infer.mapStageProgress('translate', 50), 82);
        assert.strictEqual(infer.mapStageProgress('save'), 99);
        assert.strictEqual(infer.bumpProgress(10, 40), 40);
        assert.ok(infer.scrubProgressDetail('转写中 · 00:10').includes('00:10') || infer.scrubProgressDetail('转写中 · 00:10') === '00:10');
    });

    it('engine-download-format-core formats sizes', () => {
        assert.ok(dlFmt.formatEngineDownloadBytes(2048).includes('KB'));
        assert.ok(dlFmt.formatEngineDownloadSizeLine({ downloadedBytes: 100, totalBytes: 200 }).includes('/'));
    });

    it('engine-download-urls builds hub links', () => {
        assert.strictEqual(normalizeHfEndpoint('https://hf-mirror.com/'), 'https://hf-mirror.com');
        const urls = buildHubUrls('org/model', 'https://hf-mirror.com');
        assert.ok(urls.officialUrl.includes('huggingface.co/org/model'));
        assert.ok(urls.mirrorUrl.includes('hf-mirror.com/org/model'));
    });

    it('buildUpdateFailure / formatUpdateFailureMeta expose diagnostics', () => {
        const err = new Error('增量包校验失败: x.zip');
        err.code = 'checksum';
        err.expectedSha = 'abc';
        err.gotSha = 'def';
        const fail = buildUpdateFailure(err, { preferredSource: '官网', triedSources: ['GitHub', '官网'] });
        assert.strictEqual(fail.ok, false);
        assert.strictEqual(fail.code, 'checksum');
        assert.strictEqual(fail.expectedSha, 'abc');
        const meta = formatUpdateFailureMeta(fail);
        assert.ok(meta.includes('checksum'));
        assert.ok(meta.includes('官网'));
    });
});
