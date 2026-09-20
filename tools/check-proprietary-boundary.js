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
const gitDir = path.join(root, '.git');
const hasGit = fs.existsSync(gitDir);

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

function gitignoreCovers(rel, gitignoreText) {
    const lines = gitignoreText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const bare = rel.replace(/\/$/, '');
    const candidates = new Set([rel, bare, `${bare}/`, `/${bare}`, `/${bare}/`]);
    return lines.some((line) => candidates.has(line) || line === bare || line === `${bare}/`);
}

console.log('Public git boundary (Pro secrets + local-only docs/rules/tmp)\n');

const gitignorePath = path.join(root, '.gitignore');
let gitignoreText = '';
try {
    gitignoreText = fs.readFileSync(gitignorePath, 'utf8');
} catch (err) {
    fail(`.gitignore missing or unreadable: ${err.message || err}`);
}

// 1) Every never-publish path must appear in .gitignore text (works without .git)
for (const rel of NEVER_GIT_TRACK) {
    if (!gitignoreText) break;
    if (gitignoreCovers(rel, gitignoreText)) {
        ok(`gitignore lists: ${rel}`);
    } else {
        fail(`${rel} is NOT listed in .gitignore (add to .gitignore)`);
    }
}

if (hasGit) {
    // 1b) git check-ignore confirms patterns actually apply
    for (const rel of NEVER_GIT_TRACK) {
        const probe = rel.endsWith('/') ? `${rel.replace(/\/$/, '')}/.` : rel;
        const checkPath = rel.endsWith('/') ? rel.replace(/\/$/, '') : rel;
        if (!isIgnored(checkPath) && !isIgnored(probe)) {
            if (
                PROPRIETARY_ALGORITHM_SOURCES.includes(rel)
                || rel.endsWith('.js')
                || rel.endsWith('.b64')
                || rel.endsWith('.json')
                || rel.endsWith('.txt')
            ) {
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
} else {
    ok('no .git in workspace — skipped check-ignore / ls-files / staged (gitignore text checked)');
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
    // Renderer-dist mirrors must also be excluded
    const { RENDERER_DIST_FORBIDDEN } = require('./proprietary-paths');
    for (const rel of RENDERER_DIST_FORBIDDEN) {
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
