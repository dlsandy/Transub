const { cueDragChanged } = require('../src/js/subtitle-editor/playhead-scrub.js');

describe('playhead-scrub', () => {
    it('detects unchanged cue drag as no move', () => {
        const cue = { startMs: 1000, endMs: 2000 };
        const drag = { originStart: 1000, originEnd: 2000 };
        expect(cueDragChanged(drag, cue)).toBe(false);
    });

    it('detects moved cue drag', () => {
        const cue = { startMs: 1500, endMs: 2500 };
        const drag = { originStart: 1000, originEnd: 2000 };
        expect(cueDragChanged(drag, cue)).toBe(true);
    });
});
