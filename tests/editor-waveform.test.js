const { createWaveformPeakReducer, normalizeWaveformPeaks } = require('../electron/waveform-peaks');
const wave = require('../src/js/subtitle-editor/waveform');

function pcmSilence(sampleCount, impulseAt = []) {
    const buf = Buffer.alloc(sampleCount * 2);
    for (const at of impulseAt) {
        if (at >= 0 && at < sampleCount) buf.writeInt16LE(20000, at * 2);
    }
    return buf;
}

function pushOddChunks(reducer, buf) {
    let offset = 0;
    let size = 1;
    while (offset < buf.length) {
        const n = Math.min(size, buf.length - offset);
        reducer.push(buf.subarray(offset, offset + n));
        offset += n;
        size = size === 1 ? 2 : 1;
    }
}

describe('waveform peak reducer', () => {
    it('keeps a tail impulse when the natural peak count exceeds maxPeaks', () => {
        const sampleRate = 8000;
        const durationSec = 30;
        const total = sampleRate * durationSec;
        const reducer = createWaveformPeakReducer({
            peaksPerSec: 100,
            maxPeaks: 50,
            durationSec,
        });
        reducer.push(pcmSilence(total, [10, total - 10]));
        const out = reducer.finish();
        expect(out.capped).toBe(false);
        expect(out.peaks.length).toBeGreaterThan(8);
        expect(out.peaks.length).toBeLessThanOrEqual(50);
        expect(out.peaks[0]).toBeGreaterThan(0);
        expect(out.peaks[out.peaks.length - 1]).toBeGreaterThan(0);
        const mid = out.peaks[Math.floor(out.peaks.length / 2)];
        expect(mid).toBe(0);
    });

    it('matches a single buffer when PCM arrives in odd-sized chunks', () => {
        const buf = pcmSilence(5000, [3, 2500, 4990]);
        const a = createWaveformPeakReducer({ peaksPerSec: 50, maxPeaks: 4000, durationSec: 5000 / 8000 });
        const b = createWaveformPeakReducer({ peaksPerSec: 50, maxPeaks: 4000, durationSec: 5000 / 8000 });
        a.push(buf);
        pushOddChunks(b, buf);
        expect(b.finish().peaks).toEqual(a.finish().peaks);
    });

    it('scales detail peaks against the overview peak so zoom does not jump to full height', () => {
        const scaled = normalizeWaveformPeaks([1000], 1000, 10000);
        expect(scaled[0]).toBeCloseTo(0.1, 5);
    });
});

describe('waveform paint', () => {
    function mockCanvas() {
        const bars = [];
        return {
            width: 0,
            height: 0,
            style: {},
            bars,
            getContext() {
                return {
                    setTransform() {},
                    clearRect() {},
                    fillRect(_x, _y, _w, h) { bars.push(h); },
                };
            },
        };
    }

    it('does not smear the last peak across a view past the envelope', () => {
        const canvas = mockCanvas();
        wave.paintWaveformCanvas({
            canvas,
            peaks: [0.2, 1, 0.2],
            peaksStartMs: 0,
            peaksDurationMs: 3000,
            viewStartMs: 20000,
            viewEndMs: 21000,
            cssWidth: 120,
            cssHeight: 40,
            devicePixelRatio: 1,
        });
        expect(Math.max(...canvas.bars)).toBe(2);

        const onPeak = mockCanvas();
        wave.paintWaveformCanvas({
            canvas: onPeak,
            peaks: [0.2, 1, 0.2],
            peaksStartMs: 0,
            peaksDurationMs: 3000,
            viewStartMs: 0,
            viewEndMs: 3000,
            cssWidth: 120,
            cssHeight: 40,
            devicePixelRatio: 1,
        });
        expect(Math.max(...onPeak.bars)).toBeGreaterThan(2);
    });

    it('leaves the canvas alone when the track has no layout size', () => {
        const canvas = mockCanvas();
        canvas.width = 400;
        canvas.style.width = '1px';
        const painted = wave.paintWaveformCanvas({
            canvas,
            peaks: [1, 0, 1],
            peaksStartMs: 0,
            peaksDurationMs: 1000,
            viewStartMs: 0,
            viewEndMs: 1000,
            cssWidth: 0,
            cssHeight: 0,
            devicePixelRatio: 1,
        });
        expect(painted).toBe(false);
        expect(canvas.width).toBe(400);
        expect(canvas.bars).toEqual([]);
    });

    it('asks for a detail window when the overview is coarser than the pixels', () => {
        const overview = wave.buildOverviewRequest({ mediaDurationMs: 2 * 60 * 60 * 1000 });
        expect(overview.durationSec).toBeGreaterThan(7000);
        expect(overview.peaksPerSec * overview.durationSec).toBeLessThanOrEqual(wave.OVERVIEW_MAX_PEAKS + 1);
        const mediaMs = overview.durationSec * 1000;
        const peaksLength = Math.round(overview.peaksPerSec * overview.durationSec);
        expect(wave.shouldLoadDetailPeaks({
            peaksLength,
            mediaDurationMs: mediaMs,
            viewStartMs: 30 * 60 * 1000,
            viewEndMs: 30 * 60 * 1000 + 2000,
            widthPx: 1000,
            detail: null,
        })).toBe(true);
    });

    it('snaps overview duration onto the media clock when extract matches', () => {
        const wf = {};
        wave.assignOverview(wf, {
            peaks: [0.1, 0.4],
            durationSec: 10.02,
            startSec: 0,
            peakMax: 16000,
            truncated: false,
        }, 10000);
        expect(wf.durationSec).toBeCloseTo(10, 5);
        expect(wf.normRef).toBe(16000);
        expect(wf.detail).toBe(null);
    });
});
