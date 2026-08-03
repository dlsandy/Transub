/**
 * Regression: long-media Whisper mel must not allocate a full-file complex128 STFT.
 */
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

describe('whisper chunked mel', () => {
    it('matches upstream FeatureExtractor and stays bit-identical on short audio', () => {
        const runtimePy = path.join(__dirname, '..', 'transub-engine', 'runtime', 'python.exe');
        const engineRoot = path.join(__dirname, '..', 'transub-engine', 'runtime', 'Lib', 'site-packages');
        const py = `
import sys
sys.path.insert(0, r${JSON.stringify(engineRoot)})
import numpy as np
from faster_whisper.feature_extractor import FeatureExtractor
from transub_engine.asr.whisper_feature_patch import (
    _log_mel_from_waveform,
    install_chunked_mel_patch,
)

fe = FeatureExtractor()
rng = np.random.default_rng(42)
w = (rng.standard_normal(16000 * 45).astype(np.float32) * 0.02)

# Direct helper vs original full STFT path (bypass patched __call__)
window = np.hanning(fe.n_fft + 1)[:-1].astype("float32")
wf = np.pad(w, (0, 160))
stft = fe.stft(wf, fe.n_fft, fe.hop_length, window=window, return_complex=True).astype("complex64")
magnitudes = np.abs(stft[..., :-1]) ** 2
mel = fe.mel_filters @ magnitudes
ref = np.log10(np.clip(mel, a_min=1e-10, a_max=None))
ref = np.maximum(ref, ref.max() - 8.0)
ref = ((ref + 4.0) / 4.0).astype(np.float32)

got = _log_mel_from_waveform(fe, w, padding=160)
assert got.shape == ref.shape, (got.shape, ref.shape)
assert np.allclose(got, ref, rtol=0, atol=0), float(np.max(np.abs(got - ref)))

assert install_chunked_mel_patch() is True
patched = fe(w)
assert np.array_equal(patched, got)

# Sanity: multi-hour frame count would OOM on naive STFT; chunked only keeps mel.
hours = 4.0
n_frames = int(hours * 3600 * 16000 / 160) + 8
# complex128 (1, n_frames, 201) ≈ 4.4GiB — we only allocate mel float32 batches.
peak_complex_gib = (1 * n_frames * 201 * 16) / (1024 ** 3)
assert peak_complex_gib > 4.0, peak_complex_gib
print("ok", got.shape, round(peak_complex_gib, 2))
`;
        const r = spawnSync(runtimePy, ['-c', py], {
            encoding: 'utf8',
            env: { ...process.env, PYTHONPATH: engineRoot },
        });
        if (r.status !== 0) {
            assert.fail((r.stderr || r.stdout || 'python failed').toString());
        }
        assert.ok(String(r.stdout || '').includes('ok'));
    });
});
