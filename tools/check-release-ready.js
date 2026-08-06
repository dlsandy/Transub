/**
 * Local pre-release checklist (does not publish).
 * Usage: node tools/check-release-ready.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const PROPRIETARY_SOURCES = [
    'electron/advanced-context-reconstruct.js',
    'electron/advanced-film-reconstruct.js',
    'electron/advanced-bilingual-semantic.js',
    'electron/advanced-reconstruct-runtime.js',
    'electron/advanced-smart-translate.js',
    'src/js/advanced-film-reconstruct-core.js',
    'src/js/advanced-smart-translate-core.js',
    'tools/advanced-module-entry.js',
];

const MUST_GITIGNORE = [
    '.advanced-license-private.b64',
    'keys.txt',
    'transub-advanced.json',
    'transub-advanced-device.json',
    'transub-settings.json',
];

const issues = [];
const warnings = [];

function ok(msg) {
    console.log(`  OK  ${msg}`);
}

function fail(msg) {
    issues.push(msg);
    console.log(` FAIL ${msg}`);
}

function warn(msg) {
    warnings.push(msg);
    console.log(` WARN ${msg}`);
}

function exists(rel) {
    return fs.existsSync(path.join(root, rel));
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

console.log(`Transub release check · v${pkg.version}\n`);

console.log('Version / license');
if (pkg.version === '3.0.6') ok(`package.json version ${pkg.version}`);
else warn(`package.json version is ${pkg.version} (expected 3.0.6 for this cut)`);
if (exists('LICENSE-PRO')) ok('LICENSE-PRO present');
else fail('LICENSE-PRO missing');
if (exists('NOTICE')) ok('NOTICE present');
else fail('NOTICE missing');
if (String(pkg.license || '').includes('SEE LICENSE')) ok(`package.json license: ${pkg.license}`);
else warn(`package.json license is "${pkg.license}" — prefer SEE LICENSE IN LICENSE for dual licensing`);

console.log('\nSecrets hygiene');
for (const rel of MUST_GITIGNORE) {
    if (!exists(rel)) {
        ok(`${rel} absent (fine)`);
        continue;
    }
    if (isIgnored(rel)) ok(`${rel} gitignored`);
    else fail(`${rel} exists and is NOT gitignored`);
}

console.log('\nPro closed module');
if (exists('_advanced/index.js')) {
    const n = fs.statSync(path.join(root, '_advanced/index.js')).size;
    if (n > 500) ok(`_advanced/index.js present (${n} bytes)`);
    else fail('_advanced/index.js too small — run npm run build:advanced');
} else {
    fail('_advanced/index.js missing — run npm run build:advanced before pack');
}

const files = pkg.build?.files || [];
for (const rel of PROPRIETARY_SOURCES) {
    const neg = `!${rel.replace(/\\/g, '/')}`;
    if (files.includes(neg) || files.some((f) => f === neg)) ok(`asar excludes ${rel}`);
    else if (rel.startsWith('tools/')) ok(`${rel} not in asar files globs`);
    else warn(`package.json build.files may still include ${rel} (add ${neg})`);
}

const extra = pkg.build?.extraFiles || [];
const shipsAdvanced = extra.some((e) => e && (e.from === '_advanced' || e.to === '_advanced'));
if (shipsAdvanced) ok('extraFiles ships _advanced');
else fail('extraFiles missing _advanced');

console.log('\nLanguage data pack (TDP)');
const tdpBundled = 'shared/tdp/tdp-bundled.tpack';
if (exists(tdpBundled)) {
    const n = fs.statSync(path.join(root, tdpBundled)).size;
    if (n > 100) ok(`${tdpBundled} present (${n} bytes)`);
    else fail(`${tdpBundled} too small — run npm run ensure:bundled-tdp`);
} else {
    fail(`${tdpBundled} missing — run npm run ensure:bundled-tdp`);
}
const filesList = pkg.build?.files || [];
if (filesList.includes(tdpBundled) || filesList.some((f) => String(f).includes('tdp-bundled'))) {
    ok('build.files includes tdp-bundled.tpack');
} else {
    fail('package.json build.files missing shared/tdp/tdp-bundled.tpack');
}
const shipsTdp = extra.some((e) => e && (
    e.from === tdpBundled || e.to === tdpBundled
    || String(e.from || '').includes('tdp-bundled')
));
if (shipsTdp) ok('extraFiles ships tdp-bundled.tpack (next to exe)');
else fail('extraFiles missing shared/tdp/tdp-bundled.tpack');

console.log('\nPackaged unlock hardening');
const gates = fs.readFileSync(path.join(root, 'electron/advanced-gates.js'), 'utf8');
if (/isPackaged[\s\S]*TRANSUB_ADVANCED_DEV_UNLOCK|packaged[\s\S]*return false/.test(gates)
    || /if\s*\(\s*app\.isPackaged\s*\)\s*return false/.test(gates)
    || /never honor[\s\S]*packaged|packaged builds ignore/i.test(gates)) {
    ok('advanced-gates.js documents/implements packaged unlock lock');
} else if (gates.includes('isPackaged') && gates.includes('TRANSUB_ADVANCED_DEV_UNLOCK')) {
    // Heuristic: env unlock must not apply when packaged
    if (/isPackaged[\s\S]{0,200}TRANSUB_ADVANCED_DEV_UNLOCK/.test(gates)
        || /TRANSUB_ADVANCED_DEV_UNLOCK[\s\S]{0,200}isPackaged/.test(gates)) {
        ok('advanced-gates.js references packaged + DEV_UNLOCK together');
    } else {
        warn('Verify packaged builds ignore TRANSUB_ADVANCED_DEV_UNLOCK');
    }
} else {
    warn('Could not verify DEV_UNLOCK packaged hardening in advanced-gates.js');
}

console.log('\nGit / publish (must stay local for now)');
try {
    const status = execSync('git status -sb', { cwd: root, encoding: 'utf8' }).trim();
    console.log(`  ${status.split('\n')[0]}`);
    if (/ahead|behind|\[/.test(status.split('\n')[0])) {
        warn('Branch diverged from origin — reconcile before any future GitHub publish');
    }
} catch {
    warn('git status unavailable');
}
warn('Do not git push / gh release until proprietary sources are stripped or kept private');

console.log('\n---');
if (issues.length) {
    console.log(`FAILED with ${issues.length} issue(s), ${warnings.length} warning(s)`);
    process.exit(1);
}
console.log(`PASSED with ${warnings.length} warning(s)`);
process.exit(0);
