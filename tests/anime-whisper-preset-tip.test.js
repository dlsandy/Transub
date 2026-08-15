'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('anime-whisper-preset-tip', () => {
    function loadTipApi() {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'js', 'anime-whisper-preset-tip.js'),
            'utf8',
        );
        const map = new Map();
        const sandbox = {
            localStorage: {
                getItem: (k) => (map.has(k) ? map.get(k) : null),
                setItem: (k, v) => { map.set(String(k), String(v)); },
                removeItem: (k) => { map.delete(k); },
            },
            document: {
                getElementById: () => null,
            },
        };
        sandbox.window = sandbox;
        vm.runInNewContext(src, sandbox, { filename: 'anime-whisper-preset-tip.js' });
        return sandbox.TransubAnimeWhisperPresetTip;
    }

    it('gates tip to first run of 3.0.5 only', () => {
        const tip = loadTipApi();
        const store = (() => {
            const map = new Map();
            return {
                getItem: (k) => (map.has(k) ? map.get(k) : null),
                setItem: (k, v) => { map.set(String(k), String(v)); },
            };
        })();

        assert.strictEqual(tip.shouldShowTip('3.0.5', store), true);
        assert.strictEqual(tip.shouldShowTip('v3.0.5', store), true);
        assert.strictEqual(tip.shouldShowTip('3.0.4', store), false);
        assert.strictEqual(tip.shouldShowTip('3.0.6', store), false);
        assert.strictEqual(tip.shouldShowTip('', store), false);

        tip.markDismissed(store);
        assert.strictEqual(tip.shouldShowTip('3.0.5', store), false);
        assert.strictEqual(tip.isDismissed(store), true);
    });

    it('targets the builtin Anime Whisper translate preset', () => {
        const tip = loadTipApi();
        assert.strictEqual(tip.PRESET_ID, 'ja-av-anime-whisper-translate');
        assert.strictEqual(tip.TIP_VERSION, '3.0.5');

        const { BUILTIN_PRESETS } = require('../electron/presets-data');
        const preset = BUILTIN_PRESETS.find((p) => p.id === tip.PRESET_ID);
        assert.ok(preset, 'Anime Whisper builtin preset must exist');
        assert.ok(String(preset.name || '').includes('Anime Whisper'));
        assert.strictEqual(
            preset.options?.postBatchCompactPureInterjections,
            true,
            'Anime Whisper preset should enable compact pure interjections by default',
        );
    });

    it('exposes apply + maybeShow helpers (quick AW chip removed)', () => {
        const tip = loadTipApi();
        assert.strictEqual(typeof tip.applyAnimeWhisperPreset, 'function');
        assert.strictEqual(typeof tip.maybeShow, 'function');
        assert.strictEqual(tip.bindQuickBtn, undefined);
        assert.strictEqual(tip.initQuickAccess, undefined);
        assert.strictEqual(tip.syncQuickBtnState, undefined);
    });
});
