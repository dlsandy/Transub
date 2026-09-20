'use strict';

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

describe('subtitle-editor target-lang-ui', () => {
    it('attachTranslateTargetFields merges style + target', () => {
        // Load as Node module (UMD exports helpers)
        const ui = require('../src/js/subtitle-editor/target-lang-ui');
        const payload = ui.attachTranslateTargetFields({}, {
            subtitleTargetLang: 'ja',
            chineseSubtitleVariant: 'ja',
            translateStylePreset: 'film_dialogue',
            translateStyleCustomNote: '',
            language: 'ja',
        });
        assert.strictEqual(payload.subtitleTargetLang, 'ja');
        assert.strictEqual(payload.targetLang, 'ja');
        assert.strictEqual(payload.targetLanguage, '日本語');
        assert.strictEqual(payload.translateStylePreset, 'film_dialogue');
        assert.strictEqual(payload.language, 'ja');
    });

    it('editor HTML wires target chip + context menu + scripts', () => {
        const fs = require('fs');
        const html = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'subtitle-editor.html'),
            'utf8',
        );
        assert.ok(html.includes('id="editorTargetLangSelect"'));
        assert.ok(html.includes('id="editorCueContextMenu"'));
        assert.ok(html.includes('data-ctx-action="sakura-translate"'));
        assert.ok(html.includes('js/subtitle-target-lang-core.js'));
        assert.ok(html.includes('js/subtitle-editor/target-lang-ui.js'));
        assert.ok(html.includes('id="editorSakuraTranslateBtn"'));
        // 翻译 is primary (not only buried in 更多)
        const sakuraIdx = html.indexOf('id="editorSakuraTranslateBtn"');
        const moreIdx = html.indexOf('data-dd-trigger="more"');
        assert.ok(sakuraIdx > 0 && moreIdx > 0);
        assert.ok(sakuraIdx < moreIdx, '翻译 button should appear before 更多 menu');
    });
});
