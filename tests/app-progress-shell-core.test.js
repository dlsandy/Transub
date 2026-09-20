'use strict';

const assert = require('assert');
const { createAppProgressShell } = require('../src/js/app-progress-shell-core.js');

describe('TransubAppProgressShell', () => {
    it('isPreTranscribeStage survives circular host late-binding via inferProgress', () => {
        const infer = {
            isPreTranscribeStage: (stage) => stage === 'starting' || stage === 'model' || stage === 'vad',
            stageRank: (stage) => (stage === 'transcribe' ? 10 : 1),
        };
        let shell;
        const host = {};
        // Historical bug: wire passed isPreTranscribeStage: late(h, 'isPreTranscribeStage')
        // after binding the shell method onto the same host key → stack overflow on progress.
        shell = createAppProgressShell({
            state: {},
            inferProgress: infer,
            isPreTranscribeStage: (...a) => host.isPreTranscribeStage(...a),
        });
        host.isPreTranscribeStage = (...a) => shell.isPreTranscribeStage(...a);

        assert.strictEqual(host.isPreTranscribeStage('starting'), true);
        assert.strictEqual(host.isPreTranscribeStage('vad'), true);
        assert.strictEqual(host.isPreTranscribeStage('transcribe'), false);
    });
});
