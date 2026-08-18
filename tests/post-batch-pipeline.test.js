'use strict';

const assert = require('assert');
const path = require('path');
const {
    stemKeyForPairing,
    resolveSourceForTarget,
} = require('../electron/post-batch-pipeline');

function isSourceTrack(filePath) {
    return /\.src\.|_src\.|\.source\./i.test(path.basename(String(filePath || '')))
        || /[.\\_-]ja(?:\.|$)/i.test(path.basename(String(filePath || '')));
}

describe('post-batch JA↔ZH stem pairing', () => {
    it('matches cross-directory JA src and ZH target by stem', () => {
        const ja = 'F:\\Transub\\subtitles\\START-616.src.srt';
        const zh = 'E:\\un\\START-616.srt';
        assert.strictEqual(stemKeyForPairing(ja, isSourceTrack), 'start-616');
        assert.strictEqual(stemKeyForPairing(zh, isSourceTrack), 'start-616');
        assert.strictEqual(
            stemKeyForPairing(ja, isSourceTrack),
            stemKeyForPairing(zh, isSourceTrack),
        );
    });

    it('prefers same-directory source when multiple stems collide', () => {
        const sourcesByStem = new Map([
            ['mida-752', [
                'F:\\Transub\\subtitles\\MIDA-752.src.srt',
                'E:\\un\\MIDA-752.src.srt',
            ]],
        ]);
        const picked = resolveSourceForTarget(
            sourcesByStem,
            'E:\\un\\MIDA-752.srt',
            isSourceTrack,
        );
        assert.strictEqual(picked, 'E:\\un\\MIDA-752.src.srt');
    });

    it('falls back to any stem match when dirs differ', () => {
        const sourcesByStem = new Map([
            ['mida-752', ['F:\\Transub\\subtitles\\MIDA-752.src.srt']],
        ]);
        const picked = resolveSourceForTarget(
            sourcesByStem,
            'E:\\un\\MIDA-752.srt',
            isSourceTrack,
        );
        assert.strictEqual(picked, 'F:\\Transub\\subtitles\\MIDA-752.src.srt');
    });
});

describe('post-batch memory source cues', () => {
    it('exports applyPostBatchPipeline', () => {
        const { applyPostBatchPipeline } = require('../electron/post-batch-pipeline');
        assert.strictEqual(typeof applyPostBatchPipeline, 'function');
    });
});
