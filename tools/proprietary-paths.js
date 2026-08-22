/**
 * Single source of truth: paths that must never be git-tracked on public
 * remotes, plus Pro paths that must not ship inside app.asar. Keep in sync
 * with `.gitignore` and `package.json` build.files exclusions.
 *
 * MIT Core (OK to publish): entitlement gates, public-key verify, BYOK UI,
 * managed LLM catalog, advanced-bridge/gates/settings, etc. — see NOTICE.
 * Internal architecture / agent rules live under local-only `docs/` and
 * `.cursor/` (not published).
 */
'use strict';

/** Algorithm / prompt sources + closed module entry (pack via build:advanced). */
const PROPRIETARY_ALGORITHM_SOURCES = [
    'electron/advanced-context-reconstruct.js',
    'electron/advanced-film-reconstruct.js',
    'electron/advanced-bilingual-semantic.js',
    'electron/advanced-reconstruct-runtime.js',
    'electron/advanced-smart-translate.js',
    'src/js/advanced-context-reconstruct-core.js',
    'src/js/advanced-film-reconstruct-core.js',
    'src/js/advanced-smart-translate-core.js',
    'src/js/smart-translate-verify-core.js',
    'src/js/smart-translate-address-core.js',
    'tools/advanced-module-entry.js',
];

/** Tests that require proprietary sources (local-only). */
const PROPRIETARY_TESTS = [
    'tests/advanced-context-reconstruct.test.js',
    'tests/advanced-film-reconstruct.test.js',
    'tests/advanced-smart-translate.test.js',
    'tests/smart-translate-verify-core.test.js',
];

/** Built closed blob + secrets + private fulfillment (never publish). */
const PROPRIETARY_ARTIFACTS_AND_SECRETS = [
    '_advanced/',
    '.advanced-license-private.b64',
    '.tdp-private.b64',
    'keys.txt',
    'services/',
    'tools/sync-license-kv.js',
    'tests/afdian-license-device.test.js',
    'tests/afdian-license-sign.test.js',
    'tools/tone-adapt.src.json',
    'tools/av-makers.src.json',
];

/** Local dev docs, agent rules, scratch scripts — never on public GitHub. */
const LOCAL_DEV_NEVER_PUBLISH = [
    'docs/',
    'transub-engine/docs/',
    '.cursor/',
    'AGENTS.md',
    'tmp/',
    'tools/tmp-opencc-js/',
    'tests/fixtures/mt-train-drafts/',
    'node_modules/.vite/',
];

/** Everything that must stay untracked on public remotes. */
const NEVER_GIT_TRACK = [
    ...PROPRIETARY_ALGORITHM_SOURCES,
    ...PROPRIETARY_TESTS,
    ...PROPRIETARY_ARTIFACTS_AND_SECRETS,
    ...LOCAL_DEV_NEVER_PUBLISH,
];

/** Paths that must be excluded from electron-builder asar (`!path`). */
const ASAR_EXCLUDE = [
    ...PROPRIETARY_ALGORITHM_SOURCES.filter((p) => !p.startsWith('tools/')),
];

/** Renderer-dist copies that build-renderer must strip. */
const RENDERER_DIST_FORBIDDEN = [
    'renderer-dist/js/advanced-context-reconstruct-core.js',
    'renderer-dist/js/advanced-film-reconstruct-core.js',
    'renderer-dist/js/advanced-smart-translate-core.js',
    'renderer-dist/js/smart-translate-verify-core.js',
    'renderer-dist/js/smart-translate-address-core.js',
];

module.exports = {
    PROPRIETARY_ALGORITHM_SOURCES,
    PROPRIETARY_TESTS,
    PROPRIETARY_ARTIFACTS_AND_SECRETS,
    LOCAL_DEV_NEVER_PUBLISH,
    NEVER_GIT_TRACK,
    ASAR_EXCLUDE,
    RENDERER_DIST_FORBIDDEN,
};
