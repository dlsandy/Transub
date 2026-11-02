const assert = require('node:assert/strict');
const {
    kindNeedsHardEngineStop,
    pathsNeedHardEngineStop,
} = require('../electron/local-whl-ipc');

describe('numpy cold heal desktop guards', () => {
    it('hard-stops engine for whisper / sensevoice / numpy wheels', () => {
        assert.equal(kindNeedsHardEngineStop('whisper'), true);
        assert.equal(kindNeedsHardEngineStop('sensevoice'), true);
        assert.equal(kindNeedsHardEngineStop('gpu'), true);
        assert.equal(kindNeedsHardEngineStop('llamaRuntime'), false);
        assert.equal(
            pathsNeedHardEngineStop(['C:\\cache\\numpy-2.4.6-cp312-cp312-win_amd64.whl']),
            true,
        );
        assert.equal(
            pathsNeedHardEngineStop(['C:\\cache\\faster_whisper-1.2.1-py3-none-any.whl']),
            false,
        );
    });
});
