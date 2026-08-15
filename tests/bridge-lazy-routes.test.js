const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRIDGES = [
    'extensions-bridge.js',
    'engine-bridge.js',
    'advanced-bridge.js',
    'transwithai-bridge.js',
];

function parseLazyRoutes(mainSrc) {
    const m = mainSrc.match(/installLazyRoutes\(\{([\s\S]*?)\}\);/);
    if (!m) throw new Error('installLazyRoutes block not found in electron/main.js');
    const routes = new Map();
    for (const line of m[1].split('\n')) {
        const mm = line.match(/'([^']+)':\s*'([^']+)'/);
        if (mm) routes.set(mm[1], mm[2]);
    }
    return routes;
}

function parseRegisteredChannels(bridgeSrc) {
    return [...bridgeSrc.matchAll(/register\('([^']+)'/g)].map((m) => m[1]);
}

describe('deferred bridge lazy routes', () => {
    it('maps every bridge register() channel in installLazyRoutes', () => {
        const mainSrc = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
        const routes = parseLazyRoutes(mainSrc);
        const missing = [];
        for (const file of BRIDGES) {
            const src = fs.readFileSync(path.join(ROOT, 'electron', file), 'utf8');
            for (const channel of parseRegisteredChannels(src)) {
                if (!routes.has(channel)) missing.push(`${file}: ${channel}`);
            }
        }
        assert.deepStrictEqual(
            missing,
            [],
            `orphan IPC channels (would fail with No handler registered):\n${missing.join('\n')}`,
        );
    });

    it('includes post-batch noise/interjection channels', () => {
        const mainSrc = fs.readFileSync(path.join(ROOT, 'electron', 'main.js'), 'utf8');
        const routes = parseLazyRoutes(mainSrc);
        assert.strictEqual(routes.get('transub-remove-noise-pair'), 'extensions');
        assert.strictEqual(routes.get('transub-compact-pure-interjections'), 'extensions');
    });
});
