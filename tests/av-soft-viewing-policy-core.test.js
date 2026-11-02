'use strict';

const assert = require('assert');
const policy = require('../src/js/av-soft-viewing-policy-core');
const preMt = require('../src/js/pre-mt-onomatopoeia-clean-core');
const post = require('../electron/engine-batch-postprocess-plan');

describe('av-soft-viewing-policy-core', () => {
    it('detects av_soft jobs', () => {
        assert.strictEqual(policy.isAvSoftJob({ contentProfile: 'av_soft' }), true);
        assert.strictEqual(policy.isAvSoftJob({ senseProfile: 'av_soft' }), true);
        assert.strictEqual(policy.isAvSoftJob({ contentProfile: 'film' }), false);
        assert.strictEqual(policy.isAvSoftJob({}), false);
    });

    it('pins viewing clean to clear for soft unless escape hatch', () => {
        assert.strictEqual(
            policy.resolveAvSoftViewingCleanMode({ contentProfile: 'av_soft' }, 'off'),
            'clear',
        );
        assert.strictEqual(
            policy.resolveAvSoftViewingCleanMode({ contentProfile: 'av_soft' }, 'light'),
            'clear',
        );
        assert.strictEqual(
            policy.resolveAvSoftViewingCleanMode({
                contentProfile: 'av_soft',
                avSoftViewingRespectUserModes: true,
            }, 'off'),
            'off',
        );
        assert.strictEqual(
            policy.resolveAvSoftViewingCleanMode({ contentProfile: 'film' }, 'light'),
            'light',
        );
    });

    it('caps Sakura/Gal/Murasaki soft MT windows; leaves Hy-MT alone', () => {
        assert.strictEqual(policy.resolveAvSoftMtWindowLines({
            promptFamily: 'sakura',
            windowLines: 8,
            options: { contentProfile: 'av_soft' },
        }), 3);
        assert.strictEqual(policy.resolveAvSoftMtWindowLines({
            promptFamily: 'galtransl',
            windowLines: 8,
            options: { contentProfile: 'av_soft' },
        }), 3);
        assert.strictEqual(policy.resolveAvSoftMtWindowLines({
            promptFamily: 'murasaki',
            windowLines: 6,
            options: { contentProfile: 'av_soft' },
        }), 3);
        assert.strictEqual(policy.resolveAvSoftMtWindowLines({
            promptFamily: 'hymt',
            windowLines: 1,
            options: { contentProfile: 'av_soft' },
        }), 1);
        assert.strictEqual(policy.resolveAvSoftMtWindowLines({
            promptFamily: 'sakura',
            windowLines: 8,
            options: { contentProfile: 'av_soft', windowLines: 5 },
        }), 5, 'explicit windowLines wins');
        assert.strictEqual(policy.resolveAvSoftMtWindowLines({
            promptFamily: 'sakura',
            windowLines: 8,
            options: { contentProfile: 'film' },
        }), 8);
    });

    it('pre-mt clean forces clear on soft even when mode is off', () => {
        const cues = [
            { start: 0, end: 1, text: 'はぁはぁ' },
            { start: 1, end: 2, text: '今日はいい天気ですね' },
        ];
        const out = preMt.applyPreMtOnomatopoeiaClean(cues, {
            postBatchOnomatopoeiaMode: 'off',
            contentProfile: 'av_soft',
            language: 'ja',
        });
        assert.strictEqual(out.mode, 'clear');
        assert.ok(out.dropped >= 1);
        assert.ok(out.cues.some((c) => /天気/.test(c.text)));
    });

    it('postprocess drop flags force clear on soft; escape hatch honors off', () => {
        const forced = post.resolveInterjectionDropFlags({
            postBatchInterjectionMode: 'off',
            postBatchOnomatopoeiaMode: 'off',
            contentProfile: 'av_soft',
        });
        assert.strictEqual(forced.dropDiscourse, true);
        assert.strictEqual(forced.dropOnomatopoeia, true);
        assert.strictEqual(forced.shouldCompact, true);
        assert.strictEqual(forced.softAvSkipped, false);

        const respect = post.resolveInterjectionDropFlags({
            postBatchInterjectionMode: 'off',
            postBatchOnomatopoeiaMode: 'off',
            contentProfile: 'av_soft',
            avSoftViewingRespectUserModes: true,
        });
        assert.strictEqual(respect.dropDiscourse, false);
        assert.strictEqual(respect.dropOnomatopoeia, false);
        assert.strictEqual(respect.shouldCompact, false);
    });
});
