'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sandbox = require('../tools/mt-train/lib/sandbox');
const train = require('../tools/mt-train/lib/train');
const sanitize = require('../src/js/mt-sanitize-core');

describe('mt-train user sandbox', () => {
    let tmpRoot;
    let prevRoot;
    let prevRemaps;
    let prevTarget;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-sandbox-'));
        prevRoot = process.env.TRANSUB_MT_SANDBOX_ROOT;
        prevRemaps = process.env.TRANSUB_MT_USER_REMAPS;
        prevTarget = process.env.MT_TRAIN_TARGET;
        process.env.TRANSUB_MT_SANDBOX_ROOT = tmpRoot;
        process.env.TRANSUB_MT_USER_REMAPS = path.join(tmpRoot, 'mt-user-remaps.json');
        process.env.MT_TRAIN_TARGET = 'sandbox';
        sandbox.setWriteTarget('sandbox');
    });

    afterEach(() => {
        if (prevRoot == null) delete process.env.TRANSUB_MT_SANDBOX_ROOT;
        else process.env.TRANSUB_MT_SANDBOX_ROOT = prevRoot;
        if (prevRemaps == null) delete process.env.TRANSUB_MT_USER_REMAPS;
        else process.env.TRANSUB_MT_USER_REMAPS = prevRemaps;
        if (prevTarget == null) delete process.env.MT_TRAIN_TARGET;
        else process.env.MT_TRAIN_TARGET = prevTarget;
        sanitize.reloadTrainedRemaps();
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        } catch (_) { /* ignore */ }
    });

    it('writes zh remaps to sandbox path, not official', () => {
        const beforeOfficial = sandbox.readOfficialPack().zhRemaps.length;
        const rule = train.addZhRemap({
            title: 'sandbox-test',
            jaIncludes: ['サンドボックステスト'],
            zhFrom: '错词',
            zhTo: '对词',
            pinFinal: true,
        });
        assert.ok(rule.id);
        const user = sandbox.readSandboxPack();
        assert.strictEqual(user.zhRemaps.length, 1);
        assert.strictEqual(sandbox.readOfficialPack().zhRemaps.length, beforeOfficial);
        assert.ok(fs.existsSync(sandbox.sandboxPackPath()));
    });

    it('layers sandbox after official for try/sanitize', () => {
        train.addZhRemap({
            title: 'sandbox-layer',
            jaIncludes: ['レイヤーテスト'],
            zhFrom: '错了',
            zhTo: '对了',
            pinFinal: true,
        });
        const merged = train.readMergedPack();
        assert.ok(merged.zhRemaps.length >= 1);
        sanitize.reloadTrainedRemaps(merged);
        const r = sanitize.applyTrainedZhRemaps('错了啊', 'レイヤーテスト', { pinFinalPass: true });
        assert.strictEqual(r.text, '对了啊');
    });

    it('rollback restores previous sandbox pack', () => {
        train.addZhRemap({
            title: 'sb1',
            jaIncludes: ['ロールバック一'],
            zhFrom: 'A',
            zhTo: 'B',
        });
        assert.strictEqual(sandbox.readSandboxPack().zhRemaps.length, 1);
        train.addZhRemap({
            title: 'sb2',
            jaIncludes: ['ロールバック二'],
            zhFrom: 'C',
            zhTo: 'D',
        });
        assert.strictEqual(sandbox.readSandboxPack().zhRemaps.length, 2);
        const st = sandbox.status();
        assert.ok(st.canRollback);
        const out = sandbox.rollbackSandbox();
        assert.ok(out.ok);
        // After second write, latest snap is pre-second → 1 rule
        assert.strictEqual(sandbox.readSandboxPack().zhRemaps.length, 1);
    });

    it('listRules tags source official vs sandbox', () => {
        train.addZhRemap({
            title: 'tag',
            jaIncludes: ['タグテスト'],
            zhFrom: '旧',
            zhTo: '新',
        });
        const listed = train.listRules();
        assert.strictEqual(listed.target, 'sandbox');
        const mine = listed.zhRemaps.filter((r) => r.source === 'sandbox' && r.zhFrom === '旧');
        assert.strictEqual(mine.length, 1);
    });
});
