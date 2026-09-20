'use strict';

const assert = require('assert');
const style = require('../src/js/translate-style-core');

describe('translate-style-core', () => {
    it('lists all presets including web slang and academic', () => {
        const ids = style.listPresetOptions({ entitled: true }).map((p) => p.id);
        assert.ok(ids.includes('web_slang'));
        assert.ok(ids.includes('academic'));
        assert.ok(ids.includes('custom'));
    });

    it('hides custom preset for non-Pro', () => {
        const ids = style.listPresetOptions({ entitled: false }).map((p) => p.id);
        assert.ok(!ids.includes('custom'));
    });

    it('resolves per-item override over global', () => {
        const resolved = style.resolveEffectiveTranslateStyle({
            globalPreset: 'natural_spoken',
            itemPreset: 'news_narration',
        });
        assert.strictEqual(resolved.preset, 'news_narration');
        assert.strictEqual(resolved.followGlobal, false);
    });

    it('follows global when item preset is null', () => {
        const resolved = style.resolveEffectiveTranslateStyle({
            globalPreset: 'film_dialogue',
            itemPreset: null,
        });
        assert.strictEqual(resolved.preset, 'film_dialogue');
        assert.strictEqual(resolved.followGlobal, true);
    });

    it('defaults style enabled to false (opt-in)', () => {
        const out = style.normalizeTranslateStyleOptions({});
        assert.strictEqual(out.translateStyleEnabled, false);
        assert.strictEqual(out.translateStylePreset, style.DEFAULT_PRESET);
    });

    it('buildStylePromptLine is empty when disabled', () => {
        const line = style.buildStylePromptLine(style.resolveFromOptions({
            translateStyleEnabled: false,
            translateStylePreset: 'web_slang',
        }));
        assert.strictEqual(line, '');
    });

    it('buildStyleUserPrefix includes forced style when enabled', () => {
        const prefix = style.buildStyleUserPrefix({
            translateStyleEnabled: true,
            translateStylePreset: 'web_slang',
        });
        assert.ok(prefix.includes('强制译文风格'));
        assert.ok(prefix.includes('网感'));
    });

    it('downgrades custom for non-Pro', () => {
        const out = style.normalizeTranslateStyleOptions({
            translateStyleEnabled: true,
            translateStylePreset: 'custom',
            translateStyleCustomNote: '口语自然',
        }, { entitled: false });
        assert.strictEqual(out.translateStyleEnabled, true);
        assert.strictEqual(out.translateStylePreset, style.DEFAULT_PRESET);
        assert.strictEqual(out.translateStyleCustomNote, '');
    });

    it('builds sakura system prompt append for news narration', () => {
        const prompt = style.appendStyleToSystemPrompt('base prompt', {
            translateStyleEnabled: true,
            translateStylePreset: 'news_narration',
        });
        assert.ok(prompt.includes('base prompt'));
        assert.ok(prompt.includes('旁白'));
        assert.ok(prompt.includes('强制译文风格'));
    });

    it('buildItemStyleOverrides omits follow-global items', () => {
        assert.strictEqual(
            style.buildItemStyleOverrides({ translateStylePreset: null }),
            undefined,
        );
        const ov = style.buildItemStyleOverrides({ translateStylePreset: 'web_slang' });
        assert.deepStrictEqual(ov, { translateStylePreset: 'web_slang' });
    });

    it('shouldShowStyleBadge when item differs from global', () => {
        assert.strictEqual(
            style.shouldShowStyleBadge({ translateStylePreset: 'academic' }, 'natural_spoken'),
            true,
        );
        assert.strictEqual(
            style.shouldShowStyleBadge({ translateStylePreset: 'natural_spoken' }, 'natural_spoken'),
            false,
        );
    });

    it('suggestTranslateStyleFromSense maps film profile to film_dialogue', () => {
        const s = style.suggestTranslateStyleFromSense({ profile: 'film' });
        assert.strictEqual(s?.preset, 'film_dialogue');
    });

    it('applySenseStyleSuggestionToItem skips when same as global', () => {
        const item = { sense: { classification: { profile: 'film' } } };
        assert.strictEqual(
            style.applySenseStyleSuggestionToItem(item, 'natural_spoken')?.preset,
            'film_dialogue',
        );
        assert.strictEqual(item.translateStyleSenseSuggested, true);
        const sameGlobal = { sense: { classification: { profile: 'talk' } } };
        assert.strictEqual(
            style.applySenseStyleSuggestionToItem(sameGlobal, 'natural_spoken'),
            null,
        );
    });

    it('applySenseStyleSuggestionToItem respects user preset', () => {
        const item = {
            translateStylePreset: 'academic',
            sense: { classification: { profile: 'film' } },
        };
        assert.strictEqual(style.applySenseStyleSuggestionToItem(item, 'natural_spoken'), null);
    });

    it('pickItemStyleFields preserves user/sense style across rebuild', () => {
        const patch = style.pickItemStyleFields({
            translateStylePreset: 'web_slang',
            translateStyleUserSet: true,
            translateStyleCustomNote: '',
        });
        assert.strictEqual(patch.translateStylePreset, 'web_slang');
        assert.strictEqual(patch.translateStyleUserSet, true);
        assert.deepStrictEqual(style.pickItemStyleFields({}), {});
        assert.deepStrictEqual(
            style.pickItemStyleFields({ translateStylePreset: null }),
            { translateStylePreset: null },
        );
    });
});
