const assert = require('assert');
const {
    PIP_MIRROR_CATALOG,
    normalizePreferredPipMirror,
    resolvePreferredPipMirror,
    applyPreferredPipMirrorEnv,
    labelForPreferredPipMirror,
    ENV_PREFERRED_PIP_MIRROR,
} = require('../electron/pip-mirrors');

describe('pip-mirrors', () => {
    it('catalog includes domestic mirrors and official', () => {
        const ids = PIP_MIRROR_CATALOG.map((r) => r.id);
        assert.ok(ids.includes('aliyun'));
        assert.ok(ids.includes('tsinghua'));
        assert.ok(ids.includes('official'));
    });

    it('normalizePreferredPipMirror maps auto aliases to empty', () => {
        assert.strictEqual(normalizePreferredPipMirror(''), '');
        assert.strictEqual(normalizePreferredPipMirror('auto'), '');
        assert.strictEqual(normalizePreferredPipMirror('自动测速'), '');
        assert.strictEqual(normalizePreferredPipMirror('aliyun'), 'aliyun');
    });

    it('resolvePreferredPipMirror resolves id and host', () => {
        const byId = resolvePreferredPipMirror('tsinghua');
        assert.ok(byId);
        assert.strictEqual(byId.host, 'pypi.tuna.tsinghua.edu.cn');
        const byHost = resolvePreferredPipMirror('mirrors.aliyun.com');
        assert.ok(byHost);
        assert.strictEqual(byHost.id, 'aliyun');
        assert.strictEqual(resolvePreferredPipMirror('auto'), null);
    });

    it('applyPreferredPipMirrorEnv sets or clears process env key', () => {
        const withPrefer = applyPreferredPipMirrorEnv({ FOO: '1' }, 'ustc');
        assert.strictEqual(withPrefer[ENV_PREFERRED_PIP_MIRROR], 'ustc');
        assert.strictEqual(withPrefer.FOO, '1');
        const cleared = applyPreferredPipMirrorEnv({
            FOO: '1',
            [ENV_PREFERRED_PIP_MIRROR]: 'aliyun',
        }, 'auto');
        assert.strictEqual(cleared[ENV_PREFERRED_PIP_MIRROR], undefined);
        assert.strictEqual(labelForPreferredPipMirror('aliyun'), '阿里云');
        assert.strictEqual(labelForPreferredPipMirror(''), '自动测速');
    });
});
