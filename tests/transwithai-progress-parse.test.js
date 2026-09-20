'use strict';

const assert = require('assert');
const {
    mapInferStageProgress,
    parseInferProgressLine,
    formatMediaTime,
} = require('../electron/transwithai-progress-parse');

describe('transwithai-progress-parse', () => {
    it('maps done stage to 100', () => {
        assert.strictEqual(mapInferStageProgress('done', 0), 100);
    });

    it('formats media time', () => {
        assert.strictEqual(formatMediaTime(65), '1:05');
    });

    it('parses vad init line', () => {
        const u = parseInferProgressLine('正在初始化增强VAD…', {});
        assert.strictEqual(u.stage, 'vad');
    });
});
