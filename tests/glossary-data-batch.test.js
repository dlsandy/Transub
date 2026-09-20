const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    readBatchMergedGlossary,
    projectGlossaryPathForMedia,
    PROJECT_GLOSSARY_SUFFIX,
} = require('../electron/glossary-data');

describe('glossary-data batch merge', () => {
    it('merges global and media-side project glossary', () => {
        const { invalidateBatchGlossaryCache } = require('../electron/glossary-data');
        invalidateBatchGlossaryCache();
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-gloss-'));
        const mediaPath = path.join(tmp, 'ep01.mkv');
        fs.writeFileSync(mediaPath, '');
        const glossPath = projectGlossaryPathForMedia(mediaPath);
        fs.writeFileSync(glossPath, `${JSON.stringify({
            version: 1,
            entries: [{ id: '1', canonical: '長門有希', aliases: [], enabled: true }],
        }, null, 2)}\n`, 'utf8');

        const merged = readBatchMergedGlossary({ mediaPath });
        assert.ok(merged.entries.some((e) => e.canonical === '長門有希'));
        const cached = readBatchMergedGlossary({ mediaPath });
        assert.strictEqual(cached, merged);
        fs.rmSync(tmp, { recursive: true, force: true });
        invalidateBatchGlossaryCache();
    });

    it('projectGlossaryPathForMedia uses glossary suffix', () => {
        assert.ok(projectGlossaryPathForMedia('D:/a/foo.mkv').endsWith(`foo${PROJECT_GLOSSARY_SUFFIX}`));
    });
});
