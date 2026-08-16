/**
 * FireRedVAD catalog + island-timing wiring.
 */
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { normalizeVadModelId } = require('../electron/engine-options');

const RUNTIME_PY = path.join(
    __dirname,
    '..',
    'transub-engine',
    'runtime',
    'python.exe',
);

function runPy(script) {
    const res = spawnSync(RUNTIME_PY, ['-c', script], {
        encoding: 'utf8',
        timeout: 30000,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`python failed (${res.status}): ${res.stderr || res.stdout}`);
    }
    return String(res.stdout || '').trim();
}

describe('firered-vad', () => {
    it('normalizes aliases and registers catalog/extras', function () {
        assert.strictEqual(normalizeVadModelId('firered'), 'firered-vad');
        assert.strictEqual(normalizeVadModelId('FireRedVAD'), 'firered-vad');
        if (process.platform !== 'win32') this.skip();
        const out = runPy(`
import json
from transub_engine.models_catalog import get_spec, resolve_asr_backend
from transub_engine.runtime_extras import extras_for_model_ids, EXTRA_PACKAGES
from transub_engine.asr.whisper_fw import _resolve_island_vad_backend
from transub_engine.asr.qwen3_asr import _island_vad_backend, wants_forced_aligner
from transub_engine.vad.firered_vad_seg import firered_vad_available, _seconds_to_frames
spec = get_spec('firered-vad')
from transub_engine.models_catalog import SHIPPED_WITH_APP
from transub_engine.download import is_model_installed, list_models_status
status = next(x for x in list_models_status() if x['id'] == 'firered-vad')
print(json.dumps({
    'backend': spec.backend,
    'hub': spec.hub_id,
    'kind': spec.kind,
    'shipped': 'firered-vad' in SHIPPED_WITH_APP,
    'installed': is_model_installed('firered-vad'),
    'status_shipped': status.get('shipped'),
    'status_bundled': status.get('bundled'),
    'extras': extras_for_model_ids(['firered-vad']),
    'pkgs': list(EXTRA_PACKAGES.get('vad-firered') or ()),
    'island_none': _resolve_island_vad_backend(None),
    'island_firered': _resolve_island_vad_backend('firered'),
    'island_firered_vad': _resolve_island_vad_backend('firered-vad'),
    'island_off': _resolve_island_vad_backend(''),
    'qwen_firered': _island_vad_backend('firered'),
    'qwen_ten': _island_vad_backend(None),
    'want_align_firered': wants_forced_aligner('firered'),
    'frames_6s': _seconds_to_frames(6.0),
    'avail': firered_vad_available(),
}))
`);
        const j = JSON.parse(out);
        assert.strictEqual(j.backend, 'firered');
        assert.strictEqual(j.kind, 'vad');
        assert.strictEqual(j.shipped, true);
        assert.strictEqual(j.installed, true);
        assert.strictEqual(j.status_shipped, true);
        assert.strictEqual(j.status_bundled, true);
        assert.ok(String(j.hub).includes('FireRedTeam/FireRedVAD'));
        assert.ok(j.extras.includes('vad-firered'));
        assert.ok(j.pkgs.some((p) => /fireredvad/.test(p)));
        assert.strictEqual(j.island_none, 'ten');
        assert.strictEqual(j.island_firered, 'firered');
        assert.strictEqual(j.island_firered_vad, 'firered');
        assert.strictEqual(j.island_off, null);
        assert.strictEqual(j.qwen_firered, 'firered');
        assert.strictEqual(j.qwen_ten, 'ten');
        assert.strictEqual(j.want_align_firered, false);
        assert.strictEqual(j.frames_6s, 600);
        assert.strictEqual(typeof j.avail, 'boolean');
    });
});
