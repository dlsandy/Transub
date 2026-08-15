const assert = require('assert');
const core = require('../src/js/library-player-core');

describe('library-player-core', () => {
    it('finds cue index at time with overlap preference', () => {
        const cues = [
            { startMs: 0, endMs: 1000, text: 'a' },
            { startMs: 900, endMs: 2000, text: 'b' },
            { startMs: 2500, endMs: 3000, text: 'c' },
        ];
        assert.strictEqual(core.findCueIndexAt(cues, 500), 0);
        assert.strictEqual(core.findCueIndexAt(cues, 950), 1);
        assert.strictEqual(core.findCueIndexAt(cues, 2200), -1);
        assert.strictEqual(core.findCueIndexAt(cues, 2600), 2);
    });

    it('strips ASS tags for overlay text', () => {
        assert.strictEqual(core.plainOverlayText('{\\an8}hello{\\b1}'), 'hello');
        assert.strictEqual(core.plainOverlayText('a\\Nb'), 'a\nb');
    });

    it('picks default version preferring active target', () => {
        const detail = {
            media: { preferredOpenVersionId: 'src1' },
            tracks: [
                {
                    role: 'source',
                    activeVersionId: 'src1',
                    versions: [{ id: 'src1', blobExists: true, status: 'raw' }],
                },
                {
                    role: 'target',
                    activeVersionId: 'tgt2',
                    versions: [
                        { id: 'tgt1', blobExists: true, status: 'raw' },
                        { id: 'tgt2', blobExists: true, status: 'edited' },
                    ],
                },
            ],
        };
        assert.strictEqual(core.pickDefaultVersionId(detail), 'tgt2');
    });

    it('neighbors playable versions on the same track', () => {
        const detail = {
            tracks: [{
                role: 'target',
                abPairAvailable: true,
                abVersionIdA: 'a',
                abVersionIdB: 'b',
                versions: [
                    { id: 'a', blobExists: true, status: 'raw' },
                    { id: 'x', blobExists: false, status: 'raw' },
                    { id: 'b', blobExists: true, status: 'edited' },
                ],
            }],
        };
        assert.strictEqual(core.neighborVersionId(detail, 'a', 1), 'b');
        assert.strictEqual(core.neighborVersionId(detail, 'b', 1), 'a');
        assert.strictEqual(core.neighborVersionId(detail, 'b', -1), 'a');
        const pair = core.findAbPair(detail);
        assert.strictEqual(pair.versionIdA, 'a');
        assert.strictEqual(pair.versionIdB, 'b');
    });

    it('picks primary track target → bilingual → source', () => {
        const detail = {
            tracks: [
                { id: 's', role: 'source' },
                { id: 'b', role: 'bilingual' },
                { id: 't', role: 'target' },
            ],
        };
        assert.strictEqual(core.pickPrimaryTrack(detail).id, 't');
        assert.strictEqual(core.pickPrimaryTrack({ tracks: [{ id: 's', role: 'source' }] }).id, 's');
        assert.strictEqual(core.pickPrimaryTrack({ tracks: [] }), null);
    });

    it('formats clock and compares media paths', () => {
        assert.strictEqual(core.formatClock(65), '1:05');
        assert.strictEqual(core.formatClock(3661), '1:01:01');
        assert.ok(core.sameMediaPath('C:\\a\\b.mp4', 'c:/a/b.mp4'));
        assert.ok(!core.sameMediaPath('a.mp4', 'b.mp4'));
    });

    it('lists playable tracks with bilingual support', () => {
        const detail = {
            tracks: [
                {
                    role: 'source',
                    roleLabel: '转录',
                    versions: [{ id: 's1', blobExists: true, status: 'raw' }],
                },
                {
                    role: 'bilingual',
                    roleLabel: '双语',
                    versions: [{ id: 'b1', blobExists: true, status: 'raw' }],
                },
                {
                    role: 'target',
                    roleLabel: '译文',
                    versions: [
                        { id: 't1', blobExists: true, status: 'raw' },
                        { id: 't2', blobExists: false, status: 'raw' },
                    ],
                },
            ],
        };
        const groups = core.playableTracks(detail);
        assert.deepStrictEqual(groups.map((g) => g.track.role), ['target', 'bilingual', 'source']);
        assert.strictEqual(groups[0].versions.length, 1);
        assert.strictEqual(groups[0].versions[0].id, 't1');
        assert.strictEqual(core.roleLabel('bilingual'), '双语');
    });

    it('treats archived versions as playable when file exists', () => {
        assert.strictEqual(
            core.playableVersion({ id: 'a', blobExists: true, status: 'archived' }),
            true,
        );
        assert.strictEqual(
            core.playableVersion({ id: 'b', blobExists: false, exportExists: false, status: 'edited' }),
            false,
        );
    });
});
