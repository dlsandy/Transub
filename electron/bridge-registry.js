/**
 * 主进程 Bridge 延迟初始化（首次 IPC 调用时再加载对应 bridge）
 */

function createDeferredBridgeSetup(ipcMain) {
    const queue = new Map();
    const ready = new Set();
    const handlers = new Map();

    function register(channel, handler) {
        if (typeof handler !== 'function') {
            throw new Error(`[bridge-registry] invalid handler: ${channel}`);
        }
        handlers.set(channel, handler);
    }

    function defer(name, setupFn) {
        queue.set(name, setupFn);
    }

    function ensure(name) {
        if (ready.has(name)) return;
        const setupFn = queue.get(name);
        if (!setupFn) return;
        ready.add(name);
        try {
            setupFn({ register, ipcMain });
        } catch (err) {
            ready.delete(name);
            console.warn(`[bridge-registry] ${name} 初始化失败:`, err.message || err);
            throw err;
        }
    }

    /** @param {Record<string, string>} routes channel -> bridgeName */
    function installLazyRoutes(routes) {
        for (const [channel, bridgeName] of Object.entries(routes)) {
            ipcMain.handle(channel, async (event, ...args) => {
                ensure(bridgeName);
                const handler = handlers.get(channel);
                if (!handler) {
                    throw new Error(`[bridge-registry] 通道未注册: ${channel}`);
                }
                return handler(event, ...args);
            });
        }
    }

    function flushAll() {
        for (const name of queue.keys()) {
            try {
                ensure(name);
            } catch (_) { /* 单个 bridge 失败不阻断其余 */ }
        }
    }

    function scheduleFlush(delayMs = 0) {
        setTimeout(flushAll, delayMs);
    }

    return { defer, ensure, register, installLazyRoutes, flushAll, scheduleFlush };
}

module.exports = {
    createDeferredBridgeSetup,
};
