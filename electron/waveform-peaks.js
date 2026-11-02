/**
 * Online mono s16le → peak envelope.
 * Buckets are sized to the requested window so a long file is not cut off
 * mid-stream (a hard peak cap used to drop the tail, and the painter then
 * repeated the last peak as a flat bar).
 */
function createWaveformPeakReducer(options = {}) {
    const sampleRate = 8000;
    const peaksPerSec = Math.max(5, Math.min(800, Number(options.peaksPerSec) || 20));
    const maxPeaks = Math.max(32, Math.min(48000, Number(options.maxPeaks) || 6000));
    const durationSec = Math.max(0, Number(options.durationSec) || 0);
    const defaultCap = sampleRate * 60 * 60 * 8;
    const sampleCap = Math.max(sampleRate, Number(options.sampleCap) || (
        durationSec > 0 ? Math.ceil(durationSec * sampleRate) + sampleRate : defaultCap
    ));

    let samplesPerPeak = Math.max(1, Math.round(sampleRate / peaksPerSec));
    if (durationSec > 0) {
        const expected = Math.ceil((durationSec * sampleRate) / samplesPerPeak);
        if (expected > maxPeaks) {
            samplesPerPeak = Math.max(1, Math.ceil((durationSec * sampleRate) / maxPeaks));
        }
    }

    /** @type {number[]} */
    let peaks = [];
    let carry = Buffer.alloc(0);
    let sampleCount = 0;
    let bucketPeak = 0;
    let bucketSamples = 0;
    let capped = false;

    function foldPeaks() {
        if (peaks.length < 2) return false;
        const merged = new Array(Math.ceil(peaks.length / 2));
        for (let i = 0; i < peaks.length; i += 2) {
            const a = peaks[i] || 0;
            const b = i + 1 < peaks.length ? (peaks[i + 1] || 0) : a;
            merged[i >> 1] = a > b ? a : b;
        }
        peaks = merged;
        samplesPerPeak *= 2;
        return true;
    }

    function pushPeak(peak) {
        const v = peak > 0 ? peak : 0;
        while (peaks.length >= maxPeaks) {
            if (!foldPeaks()) {
                capped = true;
                return false;
            }
        }
        peaks.push(v);
        return true;
    }

    function consumeSample(sample) {
        if (capped) return;
        sampleCount += 1;
        if (sample > bucketPeak) bucketPeak = sample;
        bucketSamples += 1;
        if (bucketSamples >= samplesPerPeak) {
            if (!pushPeak(bucketPeak)) return;
            bucketPeak = 0;
            bucketSamples = 0;
        }
        if (sampleCount >= sampleCap) capped = true;
    }

    function push(buf) {
        if (!buf || !buf.length || capped) return;
        let offset = 0;
        if (carry.length) {
            const need = 2 - carry.length;
            if (buf.length < need) {
                carry = Buffer.concat([carry, buf]);
                return;
            }
            const paired = Buffer.concat([carry, buf.subarray(0, need)], 2);
            carry = Buffer.alloc(0);
            offset = need;
            consumeSample(Math.abs(paired.readInt16LE(0)));
            if (capped) return;
        }
        while (offset + 1 < buf.length && !capped) {
            consumeSample(Math.abs(buf.readInt16LE(offset)));
            offset += 2;
        }
        if (offset < buf.length && !capped) {
            carry = Buffer.from(buf.subarray(offset));
        }
    }

    function finish() {
        if (!capped && bucketSamples > 0) pushPeak(bucketPeak);
        let peakMax = 0;
        for (let i = 0; i < peaks.length; i += 1) {
            if (peaks[i] > peakMax) peakMax = peaks[i];
        }
        return {
            peaks,
            sampleCount,
            peakMax,
            capped,
            sampleRate,
            samplesPerPeak,
        };
    }

    return {
        push,
        finish,
        get capped() { return capped; },
    };
}

function normalizeWaveformPeaks(peaks, peakMax, normRef) {
    const local = Math.max(1, Number(peakMax) || 1);
    const ref = Number(normRef);
    const scale = Number.isFinite(ref) && ref > 1 ? ref : local;
    return (peaks || []).map((p) => Math.min(1, (Number(p) || 0) / scale));
}

module.exports = {
    createWaveformPeakReducer,
    normalizeWaveformPeaks,
};
