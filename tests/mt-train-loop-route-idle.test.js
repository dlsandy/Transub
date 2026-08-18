'use strict';

const assert = require('assert');
const loopReport = require('../tools/mt-train/lib/loop-report');
const trainRoute = require('../tools/mt-train/lib/train-route');
const idleTrain = require('../tools/mt-train/lib/idle-train');
const autoPropose = require('../tools/mt-train/lib/auto-propose');
const sanitize = require('../src/js/mt-sanitize-core.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('mt-train loop-report', () => {
    it('diffSnapshots reports cluster deltas', () => {
        const before = {
            liveHitCount: 10,
            softHitCount: 2,
            liveClusterCounts: { iku_shoot: 4, latin: 2 },
        };
        const after = {
            liveHitCount: 6,
            softHitCount: 2,
            liveClusterCounts: { iku_shoot: 1, latin: 2, invent_rod: 1 },
        };
        const diff = loopReport.diffSnapshots(before, after);
        assert.strictEqual(diff.liveDelta, -4);
        assert.ok(diff.improved);
        const iku = diff.clusters.find((c) => c.cluster === 'iku_shoot');
        assert.ok(iku);
        assert.strictEqual(iku.delta, -3);
        const text = loopReport.formatLoopReport(diff, { applied: 2, title: 'TEST' });
        assert.ok(/待修 10→6/.test(text));
    });
});

describe('mt-train train-route', () => {
    it('classifies align as skip and iku as zh_remap', () => {
        const skip = trainRoute.classifyTrainRoute({
            src: '&',
            dst: '很长的中文对不上',
            after: '很长的中文对不上',
            issues: ['align_suspect'],
        });
        assert.strictEqual(skip.route, 'skip');

        const zh = trainRoute.classifyTrainRoute({
            src: 'イッちゃう',
            dst: '要去了',
            after: '要去了',
            issues: ['iku_shoot'],
        });
        assert.strictEqual(zh.route, 'zh_remap');
    });

    it('sortHitsByClusterQueue prefers iku before under_stub', () => {
        const hits = [
            { ji: 1, src: 'お願い', issues: ['under_stub'] },
            { ji: 2, src: 'イッちゃう', issues: ['iku_shoot'] },
        ];
        const sorted = trainRoute.sortHitsByClusterQueue(hits);
        assert.strictEqual(sorted[0].ji, 2);
    });

    it('filterHitsByCluster keeps only matching issue', () => {
        const hits = [
            { ji: 1, issues: ['iku_shoot'] },
            { ji: 2, issues: ['latin'] },
        ];
        const only = trainRoute.filterHitsByCluster(hits, 'latin');
        assert.strictEqual(only.length, 1);
        assert.strictEqual(only[0].ji, 2);
    });
});

describe('mt-train idle + propose cluster', () => {
    afterEach(() => {
        sanitize.reloadTrainedRemaps();
    });

    it('proposeFromHits respects cluster filter', () => {
        sanitize.reloadTrainedRemaps({ version: 1, zhRemaps: [], asrPairs: [] });
        const hits = [
            {
                ji: 1,
                src: 'イッちゃう',
                dst: '要去了啊',
                after: '要去了啊',
                issues: ['iku_shoot'],
            },
            {
                ji: 2,
                src: 'bump bump',
                dst: 'bump bump',
                after: 'bump bump',
                issues: ['latin'],
            },
        ];
        const out = autoPropose.proposeFromHits(sanitize, hits, { max: 8, cluster: 'latin' });
        const actionable = out.proposals.filter((p) => ['ready', 'review', 'failed', 'needs_expect'].includes(p.status));
        assert.ok(actionable.every((p) => (p.issues || []).includes('latin') || p.issue === 'latin'));
        assert.ok(!actionable.some((p) => p.ji === 1 && p.status === 'ready'));
    });

    it('runIdlePass writes report without applying rules', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-idle-'));
        const prevDir = idleTrain.REPORT_DIR;
        // monkey: write into temp by stubbing via run with empty titles
        const report = idleTrain.runIdlePass({
            titles: [],
            maxTitles: 1,
            scanPair: () => ({ liveHitCount: 0, softHitCount: 0, clusters: [], summary: { liveClusterCounts: {} } }),
            proposeFromHits: () => ({ proposals: [], count: 0 }),
            sanitize,
            label: 'test',
        });
        assert.ok(report.id);
        assert.strictEqual(report.written, false);
        assert.ok(fs.existsSync(report.path));
        const loaded = idleTrain.loadReport('latest');
        assert.ok(loaded);
        assert.strictEqual(loaded.id, report.id);
        void prevDir;
        void dir;
    });
});
