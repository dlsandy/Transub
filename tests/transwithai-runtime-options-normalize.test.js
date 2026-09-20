const assert = require('assert');
const { normalizeTransWithAiRuntimeOptions } = require('../electron/transwithai-runtime-options-normalize');

function testNormalizeKeepsKnownKeys() {
    const opts = normalizeTransWithAiRuntimeOptions({
        engineBackend: 'transub',
        task: 'dual',
        language: 'ja',
        glossaryPromptEnabled: false,
        filmBriefSampleMode: 'full',
        subFormats: 'srt,vtt',
    });
    assert.strictEqual(opts.engineBackend, 'transub');
    assert.strictEqual(opts.task, 'dual');
    assert.strictEqual(opts.language, 'ja');
    assert.strictEqual(opts.glossaryPromptEnabled, false);
    assert.strictEqual(opts.filmBriefSampleMode, 'full');
    assert.strictEqual(opts.subFormats, 'srt,vtt');
    assert.ok(Object.prototype.hasOwnProperty.call(opts, 'mergeBilingualSubtitles'));
    assert.ok(Object.prototype.hasOwnProperty.call(opts, 'smartTranslateHybridMt'));
    assert.ok(Object.prototype.hasOwnProperty.call(opts, 'audioSuffixes'));
}

function testNormalizeDefaults() {
    const defaults = normalizeTransWithAiRuntimeOptions({});
    assert.strictEqual(defaults.engineBackend, 'transub');
    assert.strictEqual(defaults.task, 'translate');
    assert.strictEqual(defaults.subFormats, 'srt');
    assert.strictEqual(defaults.filmBriefSampleMode, 'auto');
}

describe('transwithai-runtime-options-normalize', () => {
    it('keeps known keys through normalize', () => {
        testNormalizeKeepsKnownKeys();
    });
    it('applies expected defaults', () => {
        testNormalizeDefaults();
    });
});
