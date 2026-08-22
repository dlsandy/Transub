/**
 * Fail if proprietary Pro sources / secrets are tracked, staged, or missing
 * from .gitignore. Used by check:release and smoke:preflight.
 *
 * Usage: node tools/check-proprietary-boundary.js
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
    NEVER_GIT_TRACK,
    PROPRIETARY_ALGORITHM_SOURCES,
    ASAR_EXCLUDE,
} = require('./proprietary-paths');

const root = path.join(__dirname, '..');
const issues = [];

function fail(msg) {
    issues.push(msg);
    console.log(` FAIL ${msg}`);
}

function ok(msg) {
    console.log(`  OK  ${msg}`);
}

function git(args) {
    return execSync(`git ${args}`, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

function isIgnored(rel) {
    try {
        execSync(`git check-ignore -q -- "${rel.replace(/"/g, '')}"`, {
            cwd: root,
            stdio: 'ignore',
        });
        return true;
    } catch {
        return false;
    }
}

console.log('Public git boundary (Pro secrets + local-only docs/rules/tmp)\n');

// 1) Every never-publish path must be gitignored (dir entries end with /)
for (const rel of NEVER_GIT_TRACK) {
    const probe = rel.endsWith('/') ? `${rel.replace(/\/$/, '')}/.` : rel;
    // check-ignore needs a concrete path; for dirs use the directory itself
    const checkPath = rel.endsWith('/') ? rel.replace(/\/$/, '') : rel;
    if (!isIgnored(checkPath) && !isIgnored(probe)) {
        // Absent local file may not match some ignore rules — still require the
        // pattern to be present in .gitignore text for algorithm sources.
        if (PROPRIETARY_ALGORITHM_SOURCES.includes(rel) || rel.endsWith('.js') || rel.endsWith('.b64') || rel.endsWith('.json') || rel.endsWith('.txt')) {
            fail(`${rel} is NOT gitignored (add to .gitignore)`);
        } else if (!isIgnored(checkPath)) {
            fail(`${rel} is NOT gitignored (add to .gitignore)`);
        }
    } else {
        ok(`gitignored: ${rel}`);
    }
}

// 2) None may be tracked
try {
    const quoted = NEVER_GIT_TRACK
        .map((p) => p.replace(/\/$/, ''))
        .map((p) => `"${p}"`)
        .join(' ');
    const tracked = git(`ls-files -- ${quoted}`)
        .split(/\r?\n/)
        .filter(Boolean);
    // Also catch anything under _advanced/ or services/
    const trackedTrees = git('ls-files -- _advanced services')
        .split(/\r?\n/)
        .filter(Boolean);
    const all = [...new Set([...tracked, ...trackedTrees])];
    if (all.length) {
        fail(`proprietary / secret paths still tracked:\n    ${all.join('\n    ')}`);
    } else {
        ok('no proprietary / secret paths tracked by git');
    }
} catch (err) {
    fail(`git ls-files failed: ${err.message || err}`);
}

// 3) Staged index must not introduce them
try {
    const staged = git('diff --cached --name-only --diff-filter=ACMR')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((p) => p.replace(/\\/g, '/'));
    const badStaged = staged.filter((p) => {
        if (p === '_advanced' || p.startsWith('_advanced/')) return true;
        if (p === 'services' || p.startsWith('services/')) return true;
        return NEVER_GIT_TRACK.some((n) => {
            const bare = n.replace(/\/$/, '');
            return p === bare || p.startsWith(`${bare}/`);
        });
    });
    if (badStaged.length) {
        fail(`proprietary / secret paths staged for commit:\n    ${badStaged.join('\n    ')}`);
    } else {
        ok('index has no proprietary / secret paths staged');
    }
} catch (err) {
    fail(`git diff --cached failed: ${err.message || err}`);
}

// 4) package.json asar exclusions for algorithm sources
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const files = pkg.build?.files || [];
    for (const rel of ASAR_EXCLUDE) {
        const neg = `!${rel}`;
        if (files.includes(neg)) ok(`asar excludes ${rel}`);
        else fail(`package.json build.files missing ${neg}`);
    }
} catch (err) {
    fail(`package.json check failed: ${err.message || err}`);
}

console.log('\n---');
if (issues.length) {
    console.log(`FAILED with ${issues.length} issue(s)`);
    console.log('See NOTICE, LICENSE-PRO, and tools/proprietary-paths.js (local docs/ not published)');
    process.exit(1);
}
console.log('PASSED proprietary boundary');
process.exit(0);
