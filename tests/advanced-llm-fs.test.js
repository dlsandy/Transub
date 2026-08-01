/**
 * @vitest-environment node
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const llmFs = require('../electron/advanced-llm-fs');
const catalog = require('../src/js/advanced-managed-llm-catalog-core');

describe('advanced-llm-fs model validation', () => {
    const catalogEntry = catalog.findCatalogEntry('qwen25-7b');
    assert.ok(catalogEntry, 'catalog should include qwen25-7b');

    /** Compact stand-in so tests need not allocate multi-GB files. */
    const entry = {
        id: 'test-tiny-gguf',
        name: '测试 Tiny GGUF',
        fileName: 'Test-Tiny-Q4_K_M.gguf',
        sizeBytes: 3 * 1024 * 1024,
        sizeHint: '3 MB',
    };

    let tmpDir;
    let modelsDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-llm-fs-'));
        modelsDir = path.join(tmpDir, 'models');
        fs.mkdirSync(modelsDir, { recursive: true });
        llmFs.__setModelsDirForTests(modelsDir);
    });

    afterEach(() => {
        llmFs.__setModelsDirForTests(null);
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (_) { /* ignore */ }
    });

    function writeGguf(fileName, sizeBytes) {
        const dest = path.join(modelsDir, fileName);
        const fd = fs.openSync(dest, 'w');
        try {
            fs.writeSync(fd, Buffer.from('GGUF'), 0, 4, 0);
            fs.ftruncateSync(fd, sizeBytes);
        } finally {
            fs.closeSync(fd);
        }
        return dest;
    }

    it('rejects missing model file', () => {
        const res = llmFs.validateModelFile(entry);
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'model_file_missing');
        assert.ok(/未找到/.test(res.error));
    });

    it('rejects non-GGUF magic (e.g. HTML download mistake)', () => {
        const dest = path.join(modelsDir, entry.fileName);
        fs.writeFileSync(dest, Buffer.concat([
            Buffer.from('<!DOCTYPE html>'),
            Buffer.alloc(2 * 1024 * 1024, 0x61),
        ]));
        const res = llmFs.validateModelFile(entry);
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'model_not_gguf');
        assert.ok(/GGUF/.test(res.error));
    });

    it('rejects size mismatch even with GGUF magic', () => {
        writeGguf(entry.fileName, 2 * 1024 * 1024);
        const res = llmFs.validateModelFile(entry);
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'model_size_mismatch');
        assert.ok(/体积不符/.test(res.error));
    });

    it('accepts GGUF with size near catalog hint', () => {
        writeGguf(entry.fileName, entry.sizeBytes);
        const res = llmFs.validateModelFile(entry);
        assert.strictEqual(res.ok, true, res.error);
        assert.strictEqual(res.size, entry.sizeBytes);
    });

    it('detects misplaced lookalike by size and suggests rename', () => {
        const wrongName = 'manual-download.gguf';
        writeGguf(wrongName, entry.sizeBytes);
        const hits = llmFs.findMisplacedModelCandidates(entry);
        assert.ok(hits.length >= 1, 'expected lookalike candidate');
        assert.strictEqual(hits[0].suggestRenameTo, entry.fileName);
        const hint = llmFs.buildMisplacedModelHint(entry);
        assert.ok(/重命名/.test(hint));
        assert.ok(hint.includes(wrongName));
    });

    it('matchCatalogEntryForFile recognizes filename variants for catalog models', () => {
        const variant = catalogEntry.fileName.toLowerCase();
        // Use size match path with a compact synthetic file against a tiny fake
        // catalog-like path: filename normalization for real catalog entry.
        writeGguf(variant, 2 * 1024 * 1024);
        const p = path.join(modelsDir, variant);
        const hit = llmFs.matchCatalogEntryForFile(p, { skipSize: true });
        assert.ok(hit);
        assert.strictEqual(hit.entry.id, catalogEntry.id);
        assert.strictEqual(hit.reason, 'filename');
    });
});
