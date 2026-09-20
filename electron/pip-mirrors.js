/**
 * PyPI download-mirror catalog for env repair / wizard UI.
 * Keep ids in sync with transub_engine.pip_mirror_util.PIP_MIRROR_CATALOG.
 */
'use strict';

const ENV_PREFERRED_PIP_MIRROR = 'TRANSUB_PIP_PREFERRED_MIRROR';

const PIP_MIRROR_CATALOG = Object.freeze([
    Object.freeze({
        id: 'aliyun',
        label: '阿里云',
        indexUrl: 'https://mirrors.aliyun.com/pypi/simple',
        host: 'mirrors.aliyun.com',
    }),
    Object.freeze({
        id: 'tsinghua',
        label: '清华大学',
        indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple',
        host: 'pypi.tuna.tsinghua.edu.cn',
    }),
    Object.freeze({
        id: 'ustc',
        label: '中科大',
        indexUrl: 'https://pypi.mirrors.ustc.edu.cn/simple',
        host: 'pypi.mirrors.ustc.edu.cn',
    }),
    Object.freeze({
        id: 'tencent',
        label: '腾讯云',
        indexUrl: 'https://mirrors.cloud.tencent.com/pypi/simple',
        host: 'mirrors.cloud.tencent.com',
    }),
    Object.freeze({
        id: 'huawei',
        label: '华为云',
        indexUrl: 'https://mirrors.huaweicloud.com/repository/pypi/simple',
        host: 'mirrors.huaweicloud.com',
    }),
    Object.freeze({
        id: 'huawei-repo',
        label: '华为云 (repo)',
        indexUrl: 'https://repo.huaweicloud.com/repository/pypi/simple',
        host: 'repo.huaweicloud.com',
    }),
    Object.freeze({
        id: 'netease',
        label: '网易',
        indexUrl: 'https://mirrors.163.com/pypi/simple',
        host: 'mirrors.163.com',
    }),
    Object.freeze({
        id: 'official',
        label: 'PyPI 官方',
        indexUrl: 'https://pypi.org/simple',
        host: 'pypi.org',
    }),
]);

function normalizePreferredPipMirror(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    const low = raw.toLowerCase();
    if (['auto', 'default', 'probe', '测速', '自动', '自动测速'].includes(low)) {
        return '';
    }
    return raw.replace(/\/+$/, '');
}

function resolvePreferredPipMirror(value) {
    const key = normalizePreferredPipMirror(value);
    if (!key) return null;
    const keyL = key.toLowerCase();
    for (const row of PIP_MIRROR_CATALOG) {
        if (String(row.id).toLowerCase() === keyL) return { ...row };
        if (String(row.host).toLowerCase() === keyL) return { ...row };
        if (String(row.indexUrl).toLowerCase().replace(/\/+$/, '') === keyL) return { ...row };
        if (keyL.includes(String(row.host).toLowerCase())) return { ...row };
    }
    return null;
}

function applyPreferredPipMirrorEnv(env, prefer) {
    const next = { ...(env && typeof env === 'object' ? env : {}) };
    const key = normalizePreferredPipMirror(prefer);
    if (key) {
        next[ENV_PREFERRED_PIP_MIRROR] = key;
    } else {
        delete next[ENV_PREFERRED_PIP_MIRROR];
    }
    return next;
}

function labelForPreferredPipMirror(value) {
    const key = normalizePreferredPipMirror(value);
    if (!key) return '自动测速';
    const hit = resolvePreferredPipMirror(key);
    return hit?.label || key;
}

module.exports = {
    ENV_PREFERRED_PIP_MIRROR,
    PIP_MIRROR_CATALOG,
    normalizePreferredPipMirror,
    resolvePreferredPipMirror,
    applyPreferredPipMirrorEnv,
    labelForPreferredPipMirror,
};
