'use strict';

const assert = require('assert');
const path = require('path');
const {
    stemKeyForPairing,
    resolveSourceForTarget,
    buildPostBatchIsSourceTrack,
} = require('../electron/post-batch-pipeline');

function isSourceTrack(filePath) {
    const base = path.basename(String(filePath || ''));
    return /\.src\.|_src\.|\.source\./i.test(base)
        || /\.transcribe\./i.test(base)
        || /\.original\./i.test(base)
        || /[.\\_-]ja(?:\.|$)/i.test(base);
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

    it('matches .transcribe.srt with .zh-cn.srt (engine keep naming)', () => {
        const ja = 'F:\\Transub3\\subtitles\\DLDSS-533.transcribe.srt';
        const zh = 'E:\\迅雷下载\\DLDSS-533.zh-cn.srt';
        assert.strictEqual(stemKeyForPairing(ja, isSourceTrack), 'dldss-533');
        assert.strictEqual(stemKeyForPairing(zh, isSourceTrack), 'dldss-533');
        const sourcesByStem = new Map([
            ['dldss-533', [ja]],
        ]);
        assert.strictEqual(
            resolveSourceForTarget(sourcesByStem, zh, isSourceTrack),
            ja,
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

describe('post-batch buildPostBatchIsSourceTrack', () => {
    it('treats explicit sourceSubtitlePath as JA even when basename is plain .srt', () => {
        const ja = 'E:\\un\\MARR-015.srt';
        const zh = 'E:\\un\\MARR-015.zh-cn.srt';
        const isSrc = buildPostBatchIsSourceTrack(
            { sourceSubtitlePath: ja },
            isSourceTrack,
        );
        assert.strictEqual(isSrc(ja), true);
        assert.strictEqual(isSrc(zh), false);
    });

    it('treats all paths as source on ASR-only task=transcribe', () => {
        const bare = 'E:\\un\\IPZZ-949.srt';
        const isSrc = buildPostBatchIsSourceTrack(
            { engineTask: 'transcribe' },
            isSourceTrack,
        );
        assert.strictEqual(isSrc(bare), true);
    });

    it('keeps basename markers via fallback when no explicit path', () => {
        const isSrc = buildPostBatchIsSourceTrack({}, isSourceTrack);
        assert.strictEqual(isSrc('F:\\sub\\A.transcribe.srt'), true);
        assert.strictEqual(isSrc('F:\\sub\\A.zh-cn.srt'), false);
    });
});
