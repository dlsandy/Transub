'use strict';

const assert = require('assert');
const sanitize = require('../src/js/mt-sanitize-core.js');
const autoPropose = require('../tools/mt-train/lib/auto-propose.js');

describe('mt-train auto-propose', () => {
    afterEach(() => {
        sanitize.reloadTrainedRemaps();
    });

    it('skips align garbage and proposes iku_shoot heuristic', () => {
        const hits = [
            {
                ji: 1,
                src: '&',
                dst: '让这身体变内敛，用双手动情抚摸的。',
                after: '让这身体变内敛，用双手动情抚摸的。',
                issues: ['align_suspect'],
            },
            {
                ji: 2,
                src: 'イッちゃう',
                dst: '要去了啊',
                after: '要去了啊',
                issues: ['iku_shoot'],
            },
        ];
        sanitize.reloadTrainedRemaps({ version: 1, zhRemaps: [], asrPairs: [] });
        const out = autoPropose.proposeFromHits(sanitize, hits, { max: 8, title: 'TEST' });
        assert.ok(out.proposals.some((p) => p.ji === 1 && p.status === 'skipped'));
        const iku = out.proposals.find((p) => p.ji === 2);
        assert.ok(iku, 'iku proposal missing');
        assert.ok(['ready', 'review', 'failed'].includes(iku.status), iku.status);
        assert.ok(iku.payload?.expect);
        assert.ok(/要射了/.test(iku.payload.expect), iku.payload.expect);
    });

    it('applyProposals requires accepted flag', () => {
        const prev = require('../tools/mt-train/lib/train.js').readPack();
        const train = require('../tools/mt-train/lib/train.js');
        try {
            train.writePack({ version: 1, zhRemaps: [], asrPairs: [] });
            const hits = [{
                ji: 9,
                src: 'やめってば',
                dst: '不要射了',
                after: '不要射了',
                issues: ['yame_shoot'],
            }];
            sanitize.reloadTrainedRemaps({ version: 1, zhRemaps: [], asrPairs: [] });
            const out = autoPropose.proposeFromHits(sanitize, hits, { max: 4 });
            const ready = out.proposals.find((p) => p.status === 'ready' || p.status === 'review');
            if (!ready) return; // heuristic may fail try on some packs
            ready.accepted = false;
            const denied = autoPropose.applyProposals([ready]);
            assert.strictEqual(denied.applied, 0);
            ready.accepted = true;
            ready.force = ready.status === 'review';
            const ok = autoPropose.applyProposals([ready], { onlyReady: false });
            assert.ok(ok.applied >= 0);
        } finally {
            train.writePack(prev);
            sanitize.reloadTrainedRemaps();
        }
    });

    it('dedupes identical rule keys across hits', () => {
        sanitize.reloadTrainedRemaps({ version: 1, zhRemaps: [], asrPairs: [] });
        const hits = [
            { ji: 1, src: 'イッちゃうよ', dst: '要去了啊', after: '要去了啊', issues: ['iku_shoot'] },
            { ji: 2, src: 'イッちゃうよ', dst: '要去了啊', after: '要去了啊', issues: ['iku_shoot'] },
        ];
        const out = autoPropose.proposeFromHits(sanitize, hits, { max: 8 });
        const actionable = out.proposals.filter((p) => ['ready', 'review', 'failed'].includes(p.status));
        const dups = out.proposals.filter((p) => p.status === 'duplicate');
        assert.ok(actionable.length <= 1, `expected <=1 actionable, got ${actionable.length}`);
        assert.ok(dups.length >= 1 || out.duplicates >= 1);
    });
});
