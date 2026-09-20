const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    buildSecondOpinionBadDrafts,
    appendAsrBadPoolDrafts,
} = require('../electron/asr-bad-pool-draft');

describe('asr-bad-pool-draft', () => {
    it('builds drafts for scrap/loop primary replaced by opinion', () => {
        const drafts = buildSecondOpinionBadDrafts({
            primaryCues: [{ text: 'ああああああ' }],
            opinionCues: [{ text: 'ちょっと待って' }],
            primaryAsr: 'anime-whisper',
            opinionAsr: 'sensevoice-small',
            contentProfile: 'av_soft',
            mediaPath: 'F:/clips/sample.mp4',
            startMs: 1000,
            endMs: 4000,
            reason: 'primary_loop',
        });
        assert.strictEqual(drafts.length, 1);
        assert.strictEqual(drafts[0].kind, 'loop');
        assert.strictEqual(drafts[0].ja_right, 'ちょっと待って');
        assert.strictEqual(drafts[0].status, 'open');
        assert.strictEqual(drafts[0].source, 'asr-second-opinion');
    });

    it('skips when opinion is not richer / not scrap', () => {
        const none = buildSecondOpinionBadDrafts({
            primaryCues: [{ text: '今日はいい天気ですね' }],
            opinionCues: [{ text: '今日はいい天気' }],
        });
        assert.strictEqual(none.length, 0);
    });

    it('appends jsonl under tmp/asr-bad-pool', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-bad-'));
        try {
            const drafts = buildSecondOpinionBadDrafts({
                primaryCues: [{ text: '…' }],
                opinionCues: [{ text: 'お願いします' }],
                primaryAsr: 'anime-whisper',
            });
            const res = appendAsrBadPoolDrafts(drafts, { root });
            assert.strictEqual(res.ok, true);
            assert.ok(res.appended >= 1);
            assert.ok(fs.existsSync(res.path));
            const line = fs.readFileSync(res.path, 'utf8').trim().split('\n').pop();
            const row = JSON.parse(line);
            assert.strictEqual(row.ja_right, 'お願いします');
            const { summarizeBadPoolJsonl } = require('../electron/asr-bad-pool-draft');
            const sum = summarizeBadPoolJsonl({ root });
            assert.ok(sum.total >= 1);
            assert.ok(sum.open >= 1);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
