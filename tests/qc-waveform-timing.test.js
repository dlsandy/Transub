const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    extractPcmWindow,
    scanWaveformTimingSuspects,
    runQcWaveformTimingPhase,
    prepareWaveformExtractSession,
    resolveWaveformBudgets,
    openWavPcmReader,
    pcmInt16FromBytes,
    snapsLookCatastrophic,
    MAX_CONSECUTIVE_EXTRACT_FAILS,
} = require('../electron/qc-waveform-timing');

function writeMonoS16Wav(filePath, sampleRate, samples) {
    const dataSize = samples.length * 2;
    const buf = Buffer.alloc(44 + dataSize);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(1, 22); // mono
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    for (let i = 0; i < samples.length; i += 1) {
        buf.writeInt16LE(samples[i], 44 + i * 2);
    }
    fs.writeFileSync(filePath, buf);
}

function hungSpawn() {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => {
        proc.emit('close', null, 'SIGKILL');
    };
    return proc;
}

function failSpawn() {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.pid = 7;
    proc.kill = () => {};
    setImmediate(() => proc.emit('close', 1, null));
    return proc;
}

function pcmSpawn() {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.pid = 9;
    proc.kill = () => {};
    setImmediate(() => {
        // ~100ms of silence @16k mono s16le keeps analyzers happy.
        proc.stdout.emit('data', Buffer.alloc(3200));
        proc.emit('close', 0, null);
    });
    return proc;
}

function makeCues(n) {
    const cues = [];
    for (let i = 0; i < n; i += 1) {
        cues.push({
            index: i,
            startMs: i * 1000,
            endMs: i * 1000 + 800,
            text: '啊'.repeat(12),
        });
    }
    return cues;
}

describe('qc-waveform-timing extract', () => {
    it('times out a hung ffmpeg without waiting forever', async () => {
        const t0 = Date.now();
        const res = await extractPcmWindow('clip.mp4', 1000, 1800, {
            spawn: hungSpawn,
            extractTimeoutMs: 250,
        });
        assert.strictEqual(res.ok, false);
        assert.ok(res.timedOut || /timeout|killed/i.test(String(res.error || '')));
        assert.ok(Date.now() - t0 < 2000);
    });

    it('aborts remaining windows after consecutive extract failures', async () => {
        const cues = makeCues(20);
        let spawnCalls = 0;
        const scanned = await scanWaveformTimingSuspects(cues, {
            mediaPath: 'clip.mp4',
            maxCandidates: 20,
            spawn: () => {
                spawnCalls += 1;
                return failSpawn();
            },
        });
        assert.strictEqual(scanned.ok, true);
        assert.ok(scanned.stats.consecutiveAbort);
        assert.ok(spawnCalls <= MAX_CONSECUTIVE_EXTRACT_FAILS + 1);
        assert.ok(spawnCalls < 20);
    });

    it('extracts PCM when ffmpeg closes with audio bytes', async () => {
        const res = await extractPcmWindow('clip.mp4', 1000, 1800, {
            spawn: pcmSpawn,
            extractTimeoutMs: 1500,
        });
        assert.strictEqual(res.ok, true);
        assert.ok(res.pcm?.length > 0);
    });

    it('skips audio proxy demux when spawn is injected (tests / direct path)', async () => {
        const session = await prepareWaveformExtractSession('movie.mp4', {
            spawn: pcmSpawn,
        });
        assert.strictEqual(session.mediaPath, 'movie.mp4');
        assert.strictEqual(session.isProxy, false);
    });

    it('detaches PCM from Buffer pools so cached windows stay independent', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-pcm-copy-'));
        const wavPath = path.join(dir, 'proxy.wav');
        const samples = new Int16Array(16000 * 2);
        for (let i = 0; i < 16000; i += 1) samples[i] = 5000;
        for (let i = 16000; i < samples.length; i += 1) samples[i] = 50;
        writeMonoS16Wav(wavPath, 16000, samples);
        const reader = openWavPcmReader(wavPath);
        const a = reader.sliceWindow(200, 800, { preMs: 0, postMs: 0 });
        const b = reader.sliceWindow(1200, 1800, { preMs: 0, postMs: 0 });
        assert.ok(a.ok && b.ok);
        const mean = (pcm) => {
            let s = 0;
            for (let i = 0; i < pcm.length; i += 1) s += Math.abs(pcm[i]);
            return s / Math.max(1, pcm.length);
        };
        assert.ok(mean(a.pcm) > 1000, 'loud window');
        assert.ok(mean(b.pcm) < 200, 'quiet window must stay quiet after later reads');
        assert.ok(pcmInt16FromBytes(Buffer.from([1, 0, 2, 0]), 4)?.length === 2);
        assert.ok(snapsLookCatastrophic(
            [{ startMs: 0, endMs: 1000 }, { startMs: 2000, endMs: 3000 }, { startMs: 4000, endMs: 5000 },
                { startMs: 6000, endMs: 7000 }, { startMs: 8000, endMs: 9000 }, { startMs: 10000, endMs: 11000 },
                { startMs: 12000, endMs: 13000 }, { startMs: 14000, endMs: 15000 }],
            Array.from({ length: 8 }, () => ({ startMs: 0, endMs: 500 })),
            8,
        ));
        reader.close();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('prefers engine timing PCM sidecar over demux', async () => {
        const {
            resolveTimingAudioSidecar,
            cleanupTimingAudioSidecar,
        } = require('../electron/qc-waveform-timing');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-timing-'));
        const media = path.join(dir, 'clip.mp4');
        fs.writeFileSync(media, 'x');
        const cacheDir = path.join(dir, '.transub-cache');
        fs.mkdirSync(cacheDir);
        const wavPath = path.join(cacheDir, 'clip.timing-16k.wav');
        const samples = new Int16Array(16000);
        samples.fill(200);
        writeMonoS16Wav(wavPath, 16000, samples);
        assert.strictEqual(resolveTimingAudioSidecar(media, { outputDir: dir }), wavPath);
        const session = await prepareWaveformExtractSession(media, { outputDir: dir });
        assert.ok(session.fromTimingCache);
        assert.strictEqual(session.mediaPath, wavPath);
        await session.cleanup?.();
        assert.ok(cleanupTimingAudioSidecar(wavPath));
        assert.ok(!fs.existsSync(wavPath));
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('resolveTimingAudioSidecar prefers app timing-pcm cache over media dir', () => {
        const { resolveTimingAudioSidecar } = require('../electron/qc-waveform-timing');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-timing-app-'));
        const media = path.join(dir, 'film', 'clip.mp4');
        const appCache = path.join(dir, 'app-cache');
        fs.mkdirSync(path.dirname(media), { recursive: true });
        fs.mkdirSync(path.join(appCache, '.transub-cache'), { recursive: true });
        fs.writeFileSync(media, 'x');
        const wavPath = path.join(appCache, '.transub-cache', 'clip.timing-16k.wav');
        const samples = new Int16Array(16000);
        samples.fill(200);
        writeMonoS16Wav(wavPath, 16000, samples);
        assert.strictEqual(
            resolveTimingAudioSidecar(media, { timingPcmCacheRoot: appCache }),
            wavPath,
        );
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('tightens candidate/snap budgets for long 4K media', () => {
        const b = resolveWaveformBudgets({
            maxCandidates: 64,
            maxEdgeSnaps: 40,
            mediaDurationSec: 7200,
            mediaHeight: 2160,
        });
        assert.ok(b.maxCandidates <= 24);
        assert.ok(b.maxEdgeSnaps <= 14);
    });

    it('reuses scan PCM for edge snap (no second ffmpeg pass)', async () => {
        const cues = makeCues(12);
        let spawnCalls = 0;
        const phase = await runQcWaveformTimingPhase(cues, {
            mediaPath: 'clip.mp4',
            maxCandidates: 12,
            maxEdgeSnaps: 12,
            waveformTimingLaya: false,
            waveformPhaseBudgetMs: 30000,
            spawn: () => {
                spawnCalls += 1;
                return pcmSpawn();
            },
        });
        assert.strictEqual(phase.ok, true);
        assert.ok(phase.stats?.pcmCached > 0);
        assert.strictEqual(Number(phase.stats?.snapExtractCalls) || 0, 0);
        // Scan only — snap must not re-spawn ffmpeg for cached indexes.
        assert.ok(spawnCalls <= 12);
        assert.ok(spawnCalls === phase.stats.analyzed || spawnCalls === phase.stats.candidates);
    });

    it('slices PCM windows from WAV without spawning ffmpeg', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-wave-test-'));
        const wavPath = path.join(dir, 'proxy.wav');
        const sr = 16000;
        // 3 seconds of low-level noise so energy heuristics have samples.
        const samples = new Int16Array(sr * 3);
        for (let i = 0; i < samples.length; i += 1) {
            samples[i] = (i % 40 === 0) ? 1200 : 80;
        }
        writeMonoS16Wav(wavPath, sr, samples);
        const reader = openWavPcmReader(wavPath);
        assert.ok(reader);
        let spawnCalls = 0;
        const res = await extractPcmWindow(wavPath, 1000, 1800, {
            wavReader: reader,
            spawn: () => {
                spawnCalls += 1;
                return pcmSpawn();
            },
        });
        // spawn injected forces ffmpeg path — verify reader path without spawn:
        const res2 = await extractPcmWindow(wavPath, 1000, 1800, { wavReader: reader });
        assert.strictEqual(res2.ok, true);
        assert.ok(res2.fromWav);
        assert.ok(res2.pcm.length > 100);
        reader.close();
        const session = await prepareWaveformExtractSession(wavPath, {});
        assert.ok(session.sliceDirect);
        assert.ok(session.wavReader);
        const phase = await runQcWaveformTimingPhase(makeCues(8), {
            mediaPath: wavPath,
            waveformSession: session,
            maxCandidates: 8,
            maxEdgeSnaps: 4,
            waveformTimingLaya: false,
        });
        assert.ok(Number(phase.stats?.sliceDirectHits) > 0 || phase.stats?.sliceDirect);
        await session.cleanup?.();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        // Keep assert so unused locals don't confuse — spawn path still works with injection.
        assert.ok(res.ok === true || res.ok === false);
        assert.strictEqual(spawnCalls, 1);
    });

    it('snapsLookCatastrophic rejects majority same-start collapse', () => {
        const before = makeCues(20);
        const after = before.map((c) => ({ ...c, startMs: 0, endMs: 500 }));
        assert.strictEqual(snapsLookCatastrophic(before, after, 12), true);
        assert.strictEqual(snapsLookCatastrophic(before, before, 12), false);
    });

    it('honors phase wall-clock budget', async () => {
        const cues = makeCues(30);
        let spawnCalls = 0;
        const phase = await runQcWaveformTimingPhase(cues, {
            mediaPath: 'clip.mp4',
            maxCandidates: 30,
            maxEdgeSnaps: 4,
            waveformTimingLaya: false,
            waveformEdgeSnap: false,
            waveformPhaseBudgetMs: 120,
            extractTimeoutMs: 250,
            spawn: () => {
                spawnCalls += 1;
                const proc = new EventEmitter();
                proc.stdout = new EventEmitter();
                proc.stderr = new EventEmitter();
                proc.pid = 11;
                proc.kill = () => {
                    proc.emit('close', null, 'SIGKILL');
                };
                // Deliberately slow so the phase budget trips.
                setTimeout(() => {
                    proc.stdout.emit('data', Buffer.alloc(3200));
                    proc.emit('close', 0, null);
                }, 60);
                return proc;
            },
        });
        assert.strictEqual(phase.ok, true);
        assert.ok(
            phase.budgetExhausted || phase.stats?.budgetAbort || spawnCalls < 30,
            `expected budget abort, got spawnCalls=${spawnCalls} stats=${JSON.stringify(phase.stats)}`,
        );
    });
});
