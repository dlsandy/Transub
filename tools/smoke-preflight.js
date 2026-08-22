/**
 * Automated slice of the release smoke checklist.
 * Manual UI steps: docs/smoke-checklist.md
 *
 * Usage: node tools/smoke-preflight.js
 *    or: npm run smoke:preflight
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const checklist = path.join(root, 'docs', 'smoke-checklist.md');
const isWin = process.platform === 'win32';

function run(label, command, args, { shell = false } = {}) {
    console.log(`\n==> ${label}`);
    const r = spawnSync(command, args, {
        cwd: root,
        stdio: 'inherit',
        env: process.env,
        shell,
    });
    if (r.error) {
        console.error(`\nFAILED: ${label}`, r.error.message);
        process.exit(1);
    }
    if (r.status !== 0) {
        console.error(`\nFAILED: ${label} (exit ${r.status == null ? '?' : r.status})`);
        process.exit(r.status || 1);
    }
}

console.log('Transub smoke preflight');
if (fs.existsSync(checklist)) {
    console.log('  Manual checklist: docs/smoke-checklist.md');
} else {
    console.warn('  WARN: docs/smoke-checklist.md missing');
}

const node = process.execPath;
run('check:proprietary', node, [path.join(root, 'tools', 'check-proprietary-boundary.js')]);
run('check:agent-rules', node, [path.join(root, 'tools', 'check-agent-rules-consistency.js')]);
run('build:renderer', node, [path.join(root, 'tools', 'build-renderer.js')]);
run('verify:packaging', node, [path.join(root, 'tools', 'verify-packaging.js')]);
run('check:release', node, [path.join(root, 'tools', 'check-release-ready.js')]);

const vitestEntry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const vitestFallback = path.join(root, 'node_modules', 'vitest', 'dist', 'cli.js');
const vitestCli = fs.existsSync(vitestEntry) ? vitestEntry : vitestFallback;
run('vitest (extracted cores)', node, [
    vitestCli,
    'run',
    'tests/final-round-cores.test.js',
    'tests/sense-finalize-core.test.js',
]);

console.log('\n---');
console.log('Automated preflight PASSED.');
console.log('Next: walk through docs/smoke-checklist.md hand-test rows before shipping.');
process.exit(0);
