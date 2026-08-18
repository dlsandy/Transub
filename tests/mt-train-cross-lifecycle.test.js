'use strict';

const assert = require('assert');
const multiCorpus = require('../tools/mt-train/lib/multi-corpus');
const ruleLifecycle = require('../tools/mt-train/lib/rule-lifecycle');
const historyPairs = require('../tools/mt-train/lib/history-pairs');
const autoQuality = require('../tools/mt-train/lib/auto-quality');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('mt-train multi-corpus', () => {
    it('estimateCrossTitleCollateral flags high fan-out', () => {
        const payload = {
            mode: 'replace',
            jaAnchor: 'イッ',
            zhFrom: '去了',
            zhTo: '射了',
        };
        const byTitle = [
            {
                code: 'A',
                cues: [
                    { ji: 1, src: 'イッちゃう', after: '要去了', dst: '要去了' },
                    { ji: 2, src: 'イッた', after: '去了', dst: '去了' },
                ],
            },
            {
                code: 'B',
                cues: [
                    { ji: 1, src: 'イッて', after: '去了啊', dst: '去了啊' },
                ],
            },
        ];
        const cross = multiCorpus.estimateCrossTitleCollateral(payload, { byTitle });
        assert.ok(cross.totalHits >= 2);
        assert.ok(cross.titlesHit >= 2);
    });
});

describe('mt-train rule-lifecycle', () => {
    it('classifyLifecycle marks zero-hit old rules stale', () => {
        const old = new Date(Date.now() - 20 * 86400 * 1000).toISOString();
        const life = ruleLifecycle.classifyLifecycle(
            { id: 'x', enabled: true, createdAt: old, hitCount: 0 },
            { totalHits: 0 },
        );
        assert.ok(life.stale);
    });

    it('filterRulesByTitle matches title/note', () => {
        const rows = [
            { id: '1', title: 'ADN-798', note: 'iku' },
            { id: '2', title: 'MIDA-762', note: 'rod' },
        ];
        assert.strictEqual(ruleLifecycle.filterRulesByTitle(rows, 'mida').length, 1);
    });
});

describe('mt-train history-pairs', () => {
    it('collectHistorySubtitlePairs resolves done outputs', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-hist-'));
        const ja = path.join(dir, 'FOO-1.src.srt');
        const zh = path.join(dir, 'FOO-1.srt');
        fs.writeFileSync(ja, '1\n00:00:00,000 --> 00:00:01,000\na\n');
        fs.writeFileSync(zh, '1\n00:00:00,000 --> 00:00:01,000\nb\n');
        const pairs = historyPairs.collectHistorySubtitlePairs([{
            id: 'job1',
            finishedAt: '2026-08-16T00:00:00Z',
            task: 'dual',
            outputs: [{
                status: 'done',
                videoPath: path.join(dir, 'FOO-1.mp4'),
                subtitlePath: zh,
                sourceSubtitlePath: ja,
                targetSubtitlePath: zh,
            }],
        }], {
            fileExists: (p) => fs.existsSync(p),
        });
        assert.strictEqual(pairs.length, 1);
        assert.ok(pairs[0].title.includes('FOO') || pairs[0].jaPath.endsWith('.src.srt'));
    });
});

describe('mt-train cross confidence', () => {
    it('scoreConfidence demotes risky cross fan-out', () => {
        const p = {
            status: 'ready',
            payload: { jaAnchor: 'イッ', zhFrom: '去了', zhTo: '射了', mode: 'replace' },
            trial: { matchesExpect: true },
            src: 'イッちゃう',
        };
        const conf = autoQuality.scoreConfidence(p, null, {
            totalHits: 50,
            titlesHit: 6,
            titleCount: 8,
            corpusSize: 200,
            ratio: 0.25,
            risky: true,
            perTitle: [],
        });
        assert.ok(conf.level === 'reject' || conf.level === 'review');
        assert.ok((conf.reasons || []).some((r) => /跨片/.test(r)));
    });
});
