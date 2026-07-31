/**
 * 闭源 Pro 模块加载器（可选）。
 * 约定：安装目录 `_advanced/index.js` 或可写目录 `advanced-modules/index.js`
 * 导出 `{ features?: string[], contextReconstruct?: Function, getInfo?: Function }`
 */
const fs = require('fs');
const path = require('path');
const { getInstallRoot, getWritableRoot } = require('./app-paths');

let cached = null;
let cachedPath = '';

function candidatePaths() {
    return [
        path.join(getInstallRoot(), '_advanced', 'index.js'),
        path.join(getWritableRoot(), 'advanced-modules', 'index.js'),
    ];
}

function clearAdvancedModuleCache() {
    cached = null;
    cachedPath = '';
}

function loadAdvancedModule({ force = false } = {}) {
    if (cached && !force) {
        return { ok: true, module: cached, path: cachedPath, loaded: true };
    }
    for (const filePath of candidatePaths()) {
        if (!fs.existsSync(filePath)) continue;
        try {
            // 允许热更新：清掉 require 缓存
            try {
                delete require.cache[require.resolve(filePath)];
            } catch (_) { /* ignore */ }
            const mod = require(filePath);
            if (!mod || typeof mod !== 'object') {
                return { ok: false, error: 'Pro 模块导出无效', path: filePath };
            }
            cached = mod;
            cachedPath = filePath;
            return { ok: true, module: mod, path: filePath, loaded: true };
        } catch (err) {
            return { ok: false, error: err.message || String(err), path: filePath };
        }
    }
    return {
        ok: true,
        module: null,
        path: '',
        loaded: false,
        message: '未找到闭源 Pro 模块（功能将以占位实现响应）',
    };
}

function getAdvancedModuleInfo() {
    const res = loadAdvancedModule();
    if (!res.loaded || !res.module) {
        return {
            loaded: false,
            path: '',
            features: [],
            message: res.message || res.error || '',
        };
    }
    const info = typeof res.module.getInfo === 'function'
        ? (res.module.getInfo() || {})
        : {};
    return {
        loaded: true,
        path: res.path,
        features: Array.isArray(info.features)
            ? info.features
            : (Array.isArray(res.module.features) ? res.module.features : []),
        name: info.name || res.module.name || 'Pro Module',
        version: info.version || res.module.version || '',
    };
}

module.exports = {
    candidatePaths,
    clearAdvancedModuleCache,
    loadAdvancedModule,
    getAdvancedModuleInfo,
};
