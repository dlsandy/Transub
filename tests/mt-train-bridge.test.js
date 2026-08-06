'use strict';

const assert = require('assert');
const {
    parseJsonObject,
    collectHistorySubtitlePairs,
} = require('../electron/mt-train-bridge.js');
const { isDevBuild } = require('../electron/mt-train-window.js');

describe('mt-train electron bridge helpers', () => {
    it('parseJsonObject accepts raw and fenced JSON', () => {
        assert.deepStrictEqual(parseJsonObject('{"expectZh":"要去了","mode":"replace"}'), {
            expectZh: '要去了',
            mode: 'replace',
        });
        assert.strictEqual(
            parseJsonObject('```json\n{"expectZh":"…","mode":"blank"}\n```').mode,
            'blank',
        );
        assert.strictEqual(parseJsonObject('nope'), null);
    });

    it('isDevBuild follows app.isPackaged', () => {
        assert.strictEqual(isDevBuild({ isPackaged: false }), true);
        assert.strictEqual(isDevBuild({ isPackaged: true }), false);
    });

    it('collectHistorySubtitlePairs joins ZH output with keep-dir JA', () => {
        const entries = [{
            id: 'job-1',
            finishedAt: '2026-08-06T03:00:00.000Z',
            task: 'translate',
            outputs: [{
                videoPath: 'E:/videos/SNOS-274 title.mp4',
                subtitlePath: 'E:/videos/SNOS-274 title.srt',
                targetSubtitlePath: 'E:/videos/SNOS-274 title.srt',
                sourceSubtitlePath: '',
                status: 'done',
            }, {
                videoPath: 'E:/videos/missing.mp4',
                subtitlePath: 'E:/videos/missing.srt',
                status: 'done',
            }, {
                videoPath: 'E:/videos/failed.mp4',
                subtitlePath: 'E:/videos/failed.srt',
                status: 'failed',
            }],
        }];
        const pairs = collectHistorySubtitlePairs(entries, {
            fileExists: (p) => p.includes('SNOS-274'),
            resolveJaPath: (output, zhPath) => {
                if (String(zhPath).includes('SNOS-274')) {
                    return 'F:/Transub/subtitles/SNOS-274 title.src.srt';
                }
                return '';
            },
        });
        assert.strictEqual(pairs.length, 1);
        assert.strictEqual(pairs[0].id, 'job-1::0');
        assert.strictEqual(pairs[0].title, 'SNOS-274 title');
        assert.ok(pairs[0].jaPath.endsWith('.src.srt'));
        assert.ok(pairs[0].zhPath.endsWith('.srt'));
    });

    it('collectHistorySubtitlePairs prefers explicit sourceSubtitlePath', () => {
        const pairs = collectHistorySubtitlePairs([{
            id: 'job-2',
            outputs: [{
                videoPath: 'E:/a.mp4',
                sourceSubtitlePath: 'E:/a.ja.srt',
                targetSubtitlePath: 'E:/a.zh.srt',
                status: 'done',
            }],
        }], {
            fileExists: () => true,
            resolveJaPath: (o) => String(o.sourceSubtitlePath || ''),
        });
        assert.strictEqual(pairs.length, 1);
        assert.strictEqual(pairs[0].jaPath, 'E:/a.ja.srt');
        assert.strictEqual(pairs[0].zhPath, 'E:/a.zh.srt');
    });
});
