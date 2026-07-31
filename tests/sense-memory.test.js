const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    recordSenseMemory,
    lookupSenseMemory,
    getSenseMemoryStats,
    clearSenseMemory,
    getSenseMemoryPath,
} = require('../electron/sense-memory');

describe('sense-memory', () => {
    let tmp;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transub-sense-mem-'));
    });

    afterEach(() => {
        try {
            fs.rmSync(tmp, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    it('records, looks up, and clears entries', () => {
        const rec = recordSenseMemory({
            key: 'folder:F:/clips',
            profile: 'av_soft',
            prefer: true,
            baseDir: tmp,
        });
        assert.strictEqual(rec.ok, true);
        assert.strictEqual(rec.entry.profile, 'av_soft');

        const look = lookupSenseMemory(['folder:F:/clips', 'folder:other'], tmp);
        assert.strictEqual(look.hits.length, 1);
        assert.strictEqual(look.hits[0].prefer, true);

        const stats = getSenseMemoryStats(tmp);
        assert.strictEqual(stats.count, 1);
        assert.ok(fs.existsSync(getSenseMemoryPath(tmp)));

        const cleared = clearSenseMemory(tmp);
        assert.strictEqual(cleared.ok, true);
        assert.strictEqual(cleared.cleared, 1);
        assert.strictEqual(getSenseMemoryStats(tmp).count, 0);
        assert.strictEqual(lookupSenseMemory(['folder:F:/clips'], tmp).hits.length, 0);
    });

    it('rejects invalid keys and unknown profile', () => {
        assert.strictEqual(recordSenseMemory({ key: '', profile: 'av_soft', baseDir: tmp }).ok, false);
        assert.strictEqual(recordSenseMemory({ key: 'maker:ssis', profile: 'unknown', baseDir: tmp }).ok, false);
        assert.strictEqual(getSenseMemoryStats(tmp).count, 0);
    });
});
