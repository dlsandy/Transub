const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    isVisibleEllipsisZh,
    countRecoverableEllipsisLeft,
} = require('../electron/hymt-ellipsis-policy');

describe('hymt ellipsis gate recount', () => {
    it('isVisibleEllipsisZh ignores empty (dropAll blank) but catches …', () => {
        assert.strictEqual(isVisibleEllipsisZh(''), false);
        assert.strictEqual(isVisibleEllipsisZh('   '), false);
        assert.strictEqual(isVisibleEllipsisZh('…'), true);
        assert.strictEqual(isVisibleEllipsisZh('...'), true);
        assert.strictEqual(isVisibleEllipsisZh('……'), true);
        assert.strictEqual(isVisibleEllipsisZh('好的'), false);
    });

    it('countRecoverableEllipsisLeft visibleOnly skips empty slots after dropAll', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hymt-ellip-gate-'));
        const zhPath = path.join(dir, 'a.srt');
        const jaPath = path.join(dir, 'a.src.srt');
        const zhBody = [
            '1',
            '00:00:01,000 --> 00:00:02,000',
            '…',
            '',
            '2',
            '00:00:02,000 --> 00:00:03,000',
            '',
            '',
            '3',
            '00:00:03,000 --> 00:00:04,000',
            '早上好',
            '',
        ].join('\n');
        const jaBody = [
            '1',
            '00:00:01,000 --> 00:00:02,000',
            'まだ何も答えられない',
            '',
            '2',
            '00:00:02,000 --> 00:00:03,000',
            '検査室に行ってください',
            '',
            '3',
            '00:00:03,000 --> 00:00:04,000',
            'おはようございます',
            '',
        ].join('\n');
        fs.writeFileSync(zhPath, zhBody, 'utf8');
        fs.writeFileSync(jaPath, jaBody, 'utf8');
        try {
            const visible = countRecoverableEllipsisLeft(zhPath, jaPath, { visibleOnly: true });
            const allBlank = countRecoverableEllipsisLeft(zhPath, jaPath, { visibleOnly: false });
            assert.strictEqual(visible, 1, 'only the visible … counts for gate');
            assert.ok(allBlank >= 2, 'empty lexical blank also counts when visibleOnly=false');
        } finally {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });

    it('runHyMtEllipsisPolicyPass honors AbortSignal before LLM recover', async () => {
        const { runHyMtEllipsisPolicyPass } = require('../electron/hymt-ellipsis-policy');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hymt-ellip-cancel-'));
        const zhPath = path.join(dir, 'b.srt');
        const jaPath = path.join(dir, 'b.src.srt');
        fs.writeFileSync(zhPath, [
            '1',
            '00:00:01,000 --> 00:00:02,000',
            '…',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(jaPath, [
            '1',
            '00:00:01,000 --> 00:00:02,000',
            'まだ何も答えられない',
            '',
        ].join('\n'), 'utf8');
        const ctrl = new AbortController();
        ctrl.abort();
        try {
            const res = await runHyMtEllipsisPolicyPass({
                zhPath,
                jaPath,
                options: { hyMtEllipsisPolicy: true },
                signal: ctrl.signal,
            });
            assert.strictEqual(res.cancelled, true);
            assert.strictEqual(res.code, 'cancelled');
        } finally {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });
});
