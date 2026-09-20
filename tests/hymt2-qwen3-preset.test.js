'use strict';

const assert = require('assert');
const { BUILTIN_PRESETS } = require('../electron/presets-data');

describe('hymt2 presets removed from ASR catalog', () => {
    it('does not register dedicated Hy-MT2 ASR presets (use smart hybrid + hy-mt2-7b instead)', () => {
        assert.strictEqual(BUILTIN_PRESETS.some((x) => x.id === 'ja-av-hymt2-qwen3-asr'), false);
        assert.strictEqual(BUILTIN_PRESETS.some((x) => x.id === 'ja-av-hymt2-anime-whisper'), false);
        assert.ok(BUILTIN_PRESETS.some((x) => x.id === 'ja-av-qwen3-galgame-ten'));
        assert.ok(BUILTIN_PRESETS.some((x) => x.id === 'ja-av-anime-whisper-firered'));
        assert.ok(!BUILTIN_PRESETS.some((x) => x.id === 'ja-av-anime-whisper-translate'));
        assert.ok(!BUILTIN_PRESETS.some((x) => x.id === 'anime-whisper-translate'));
    });
});
