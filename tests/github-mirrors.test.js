const assert = require('assert');
const {
    DEFAULT_GITHUB_MIRROR_PREFIXES,
    LEGACY_DEAD_GITHUB_MIRROR_DEFAULTS,
    LEGACY_GITHUB_MIRROR_DEFAULT_SETS,
    GITHUB_MIRROR_PROBE_FILE,
    GITHUB_MIRROR_PROBE_TIMEOUT_MS,
    normalizeGithubMirrorPrefix,
    normalizeGithubMirrorPrefixes,
    parseGithubMirrorsText,
    formatGithubMirrorsText,
    migrateLegacyGithubMirrorDefaults,
    expandWithGithubMirrors,
    buildMirrorProbeUrl,
} = require('../electron/github-mirrors');

describe('github-mirrors', () => {
    it('normalizes host-only and trailing slash', () => {
        assert.strictEqual(normalizeGithubMirrorPrefix('g.blfrp.cn'), 'https://g.blfrp.cn/');
        assert.strictEqual(normalizeGithubMirrorPrefix('https://ghproxy.net'), 'https://ghproxy.net/');
        assert.strictEqual(normalizeGithubMirrorPrefix(''), '');
        assert.strictEqual(normalizeGithubMirrorPrefix('ftp://bad.example/'), '');
    });

    it('dedupes and caps list; null → defaults; empty text → []', () => {
        assert.deepStrictEqual(
            normalizeGithubMirrorPrefixes(null),
            DEFAULT_GITHUB_MIRROR_PREFIXES,
        );
        assert.deepStrictEqual(parseGithubMirrorsText(''), []);
        assert.deepStrictEqual(parseGithubMirrorsText('  \n  '), []);
        assert.deepStrictEqual(
            normalizeGithubMirrorPrefixes([
                'https://g.blfrp.cn/',
                'g.blfrp.cn',
                'https://ghproxy.net/',
            ]),
            ['https://g.blfrp.cn/', 'https://ghproxy.net/'],
        );
        assert.strictEqual(
            formatGithubMirrorsText(['https://g.blfrp.cn/', 'https://ghproxy.net/']),
            'https://g.blfrp.cn/\nhttps://ghproxy.net/',
        );
    });

    it('migrates exact legacy default sets to current defaults', () => {
        assert.deepStrictEqual(
            migrateLegacyGithubMirrorDefaults(LEGACY_DEAD_GITHUB_MIRROR_DEFAULTS.slice()),
            DEFAULT_GITHUB_MIRROR_PREFIXES,
        );
        assert.deepStrictEqual(
            migrateLegacyGithubMirrorDefaults(LEGACY_GITHUB_MIRROR_DEFAULT_SETS[1].slice()),
            DEFAULT_GITHUB_MIRROR_PREFIXES,
        );
        assert.deepStrictEqual(
            migrateLegacyGithubMirrorDefaults(['https://gh.custom.example/']),
            ['https://gh.custom.example/'],
        );
    });

    it('expands github URLs with prefixes; empty prefixes → no mirrors', () => {
        const src = 'https://github.com/org/repo/releases/download/v1/file.zip';
        const out = expandWithGithubMirrors(src, ['https://g.blfrp.cn/']);
        assert.deepStrictEqual(out, [`https://g.blfrp.cn/${src}`]);
        assert.deepStrictEqual(expandWithGithubMirrors(src, []), []);
        assert.deepStrictEqual(expandWithGithubMirrors('https://example.com/a.zip', DEFAULT_GITHUB_MIRROR_PREFIXES), []);
    });

    it('builds probe URL for speed test against a release asset', () => {
        assert.strictEqual(
            buildMirrorProbeUrl('https://g.blfrp.cn/'),
            `https://g.blfrp.cn/${GITHUB_MIRROR_PROBE_FILE}`,
        );
        assert.ok(GITHUB_MIRROR_PROBE_TIMEOUT_MS >= 3000);
        assert.ok(GITHUB_MIRROR_PROBE_TIMEOUT_MS <= 12000);
    });
});
