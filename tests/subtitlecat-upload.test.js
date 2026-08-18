'use strict';

const assert = require('assert');
const {
    sanitizeUploadFileName,
    parseUploadForm,
    pickLanguageOptionValue,
    isDevBuild,
    UPLOAD_PAGE_URL,
    DEFAULT_TARGET_LANGUAGE,
} = require('../electron/subtitlecat-upload');
const {
    buildSubtitleEditorMenuTemplate,
    SUBTITLE_EDITOR_MENU_ACTIONS,
    SUBTITLE_EDITOR_DEV_MENU_ACTIONS,
} = require('../electron/subtitle-editor-menu');

const FIXTURE_HTML = `
<html><body>
<form method="post" action="/upload_handler.php" enctype="multipart/form-data">
  <input type="hidden" name="token" value="abc" />
  <input type="file" name="file" />
  <select name="language">
    <option value="en">English</option>
    <option value="zh-cn">Chinese (Simplified)</option>
    <option value="ja">Japanese</option>
  </select>
  <input type="submit" name="submit" value="translate" />
</form>
</body></html>
`;

describe('subtitlecat-upload', () => {
    it('sanitizes upload file names with .zh-cn(by transub) branding', () => {
        assert.strictEqual(
            sanitizeUploadFileName('Foo/Bar:Baz.ass'),
            'Bar_Baz.zh-cn(by transub).srt',
        );
        assert.strictEqual(
            sanitizeUploadFileName('MIKR-116'),
            'MIKR-116.zh-cn(by transub).srt',
        );
        assert.strictEqual(
            sanitizeUploadFileName('MIKR-116.zh-cn(by transub).srt'),
            'MIKR-116.zh-cn(by transub).srt',
        );
        assert.ok(sanitizeUploadFileName('').endsWith('.zh-cn(by transub).srt'));
    });

    it('parses upload form fields from HTML', () => {
        const form = parseUploadForm(FIXTURE_HTML, UPLOAD_PAGE_URL);
        assert.ok(form);
        assert.strictEqual(form.fileField, 'file');
        assert.strictEqual(form.languageField, 'language');
        assert.strictEqual(form.hiddenFields.token, 'abc');
        assert.strictEqual(form.submitName, 'submit');
        assert.strictEqual(form.submitValue, 'translate');
        assert.ok(String(form.actionUrl).includes('/upload_handler.php'));
    });

    it('picks Chinese (Simplified) language option', () => {
        const value = pickLanguageOptionValue(FIXTURE_HTML, DEFAULT_TARGET_LANGUAGE);
        assert.strictEqual(value, 'zh-cn');
    });

    it('reports packaged builds as non-dev', () => {
        assert.strictEqual(isDevBuild({ isPackaged: true }), false);
        assert.strictEqual(isDevBuild({ isPackaged: false }), true);
    });
});

describe('subtitle-editor-menu subtitlecat (dev)', () => {
    it('hides SubtitleCat item unless isDev', () => {
        const prod = buildSubtitleEditorMenuTemplate(() => {}, { onClose: () => {} });
        const fileMenu = prod.find((item) => item.label === '文件(&F)');
        const prodLabels = fileMenu.submenu.map((item) => item.label).filter(Boolean);
        assert.ok(!prodLabels.includes('上传到 SubtitleCat（开发）'));

        /** @type {string[]} */
        const collected = [];
        const dev = buildSubtitleEditorMenuTemplate(() => {}, {
            isDev: true,
            collectedActions: collected,
            onClose: () => {},
        });
        const devFile = dev.find((item) => item.label === '文件(&F)');
        const devLabels = devFile.submenu.map((item) => item.label).filter(Boolean);
        assert.ok(devLabels.includes('上传到 SubtitleCat（开发）'));
        assert.ok(collected.includes('upload-subtitlecat'));
        assert.deepStrictEqual(
            [...SUBTITLE_EDITOR_DEV_MENU_ACTIONS].sort(),
            ['upload-subtitlecat'],
        );
        assert.ok(!SUBTITLE_EDITOR_MENU_ACTIONS.includes('upload-subtitlecat'));
    });
});
