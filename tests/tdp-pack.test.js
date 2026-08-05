const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateKeyPairSync } = require('crypto');

const tdpPack = require('../src/js/tdp-pack-core');
const tdpCrypto = require('../src/js/tdp-crypto-core');

describe('tdp-pack-core', () => {
    it('round-trips TPK1 with L01/P01/D01', () => {
        const pairs = [
            { from: '免税', to: 'メンエス' },
            { from: 'foo', to: 'bar' },
        ];
        const d01 = tdpPack.encodeD01Payload(pairs);
        const decoded = tdpPack.decodeD01Payload(d01);
        assert.strictEqual(decoded.length, 2);
        assert.strictEqual(decoded[0].from, '免税');

        const l01 = Buffer.from('TZ01fake');
        const p01 = Buffer.from('AM01fake');
        const pack = tdpPack.buildPack({
            sections: { L01: l01, P01: p01, D01: d01 },
        });
        assert.ok(pack.subarray(0, 4).equals(Buffer.from('TPK1')));
        const parsed = tdpPack.parsePack(pack);
        assert.strictEqual(parsed.schemaVersion, 1);
        assert.ok(tdpPack.getSection(parsed, 'L01').equals(l01));
        assert.ok(tdpPack.getSection(parsed, 'P01').equals(p01));
        assert.deepStrictEqual(
            tdpPack.decodeD01Payload(tdpPack.getSection(parsed, 'D01')),
            decoded,
        );
    });

    it('normalizes manifest and compares versions', () => {
        const bad = tdpPack.normalizeManifest({});
        assert.strictEqual(bad.ok, false);
        const good = tdpPack.normalizeManifest({
            schemaVersion: 1,
            latest: {
                version: '1.0.3',
                url: 'https://www.transub.cc/tdp/packs/tdp-1.0.3.tpack',
                sha256: 'a'.repeat(64),
                sig: 'x',
                notes: 'Update 2026-01-01 00:00:00',
            },
        });
        assert.strictEqual(good.ok, true);
        assert.strictEqual(good.latest.version, '1.0.3');
        assert.ok(tdpPack.compareVersions('1.0.0', '1.0.3') < 0);
        assert.strictEqual(tdpPack.compareVersions('1.0.3', '1.0.3'), 0);
    });

    it('bundled tpack D01 includes shared + adult ASR pairs', () => {
        const bundled = path.join(__dirname, '..', 'shared', 'tdp', 'tdp-bundled.tpack');
        assert.ok(fs.existsSync(bundled), 'run npm run ensure:bundled-tdp');
        const parsed = tdpPack.parsePack(fs.readFileSync(bundled));
        const pairs = tdpPack.decodeD01Payload(tdpPack.getSection(parsed, 'D01'));
        const opaque = require('../src/js/mt-opaque-strings');
        const adult = opaque.getAsrAdultDomainPairs();
        const ssot = JSON.parse(fs.readFileSync(
            path.join(__dirname, '..', 'shared', 'ja-asr-domain-fixes.json'),
            'utf8',
        ));
        assert.ok(pairs.length >= ssot.length + Math.min(1, adult.length));
        const fromSet = new Set(pairs.map((p) => p.from));
        for (const p of adult.slice(0, 5)) {
            assert.ok(fromSet.has(p.from), `missing adult ASR in D01: ${p.from}`);
        }
        for (const p of ssot.slice(0, 5)) {
            assert.ok(fromSet.has(p.from), `missing shared ASR in D01: ${p.from}`);
        }
    });
});

describe('tdp-crypto-core', () => {
    it('signs and verifies TDP1|version|sha256', () => {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        const priv = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
        const buf = Buffer.from('hello-tdp');
        const sha = tdpCrypto.sha256HexOfBuffer(buf);
        const sig = tdpCrypto.signPackHash('1.2.3', sha, priv);
        const ok = tdpCrypto.verifyPackBuffer(buf, {
            version: '1.2.3',
            sha256: sha,
            sig,
            size: buf.length,
            publicKeySpkiB64: pub,
        });
        assert.strictEqual(ok.ok, true);
        const bad = tdpCrypto.verifyPackBuffer(buf, {
            version: '1.2.3',
            sha256: sha,
            sig: tdpCrypto.signPackHash('9.9.9', sha, priv),
            publicKeySpkiB64: pub,
        });
        assert.strictEqual(bad.ok, false);
    });
});

describe('bundled tpack', () => {
    it('ships a parseable bundled pack with required sections', () => {
        const packPath = path.join(__dirname, '..', 'shared', 'tdp', 'tdp-bundled.tpack');
        assert.ok(fs.existsSync(packPath), 'run npm run encode:tdp');
        const parsed = tdpPack.parsePack(fs.readFileSync(packPath));
        assert.ok(tdpPack.getSection(parsed, 'L01')?.length);
        assert.ok(tdpPack.getSection(parsed, 'P01')?.length);
        const pairs = tdpPack.decodeD01Payload(tdpPack.getSection(parsed, 'D01'));
        assert.ok(pairs.length >= 10);
    });
});

describe('tdp hot-reload consumers', () => {
    it('reloads tone-adapt / makers / domain fixes from pack sections', () => {
        const packPath = path.join(__dirname, '..', 'shared', 'tdp', 'tdp-bundled.tpack');
        const parsed = tdpPack.parsePack(fs.readFileSync(packPath));
        const tone = require('../src/js/tone-adapt-lexicon-core');
        const profile = require('../src/js/content-profile-core');
        const sanitize = require('../src/js/mt-sanitize-core');

        const beforeTone = tone.NSFW_LEXICON_ENTRIES.length;
        assert.ok(tone.reloadFromTz1Buffer(tdpPack.getSection(parsed, 'L01')));
        assert.ok(tone.NSFW_LEXICON_ENTRIES.length >= beforeTone);

        assert.ok(profile.reloadAvMakersFromAm1Buffer(tdpPack.getSection(parsed, 'P01')));
        assert.ok(profile.KNOWN_AV_MAKERS.has('ssis'));

        const pairs = tdpPack.decodeD01Payload(tdpPack.getSection(parsed, 'D01'));
        assert.ok(sanitize.reloadJaAsrDomainBasePairs(pairs));
        const fixed = sanitize.correctJaAsrDomainMishears('免税しては大丈夫');
        assert.ok(fixed.changed);
        assert.match(fixed.text, /メンエス/);
    });
});

describe('tdp-fs layout', () => {
    it('uses writable tdp root override', () => {
        const tdpFs = require('../electron/tdp-fs');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tdp-fs-'));
        tdpFs.__setTdpRootForTests(tmp);
        try {
            tdpFs.ensureDirs();
            assert.ok(fs.existsSync(path.join(tmp, 'staging')));
            assert.ok(fs.existsSync(path.join(tmp, 'active')));
            tdpFs.writeMeta({ version: '1.0.0', applied: false });
            assert.strictEqual(tdpFs.readMeta().version, '1.0.0');
        } finally {
            tdpFs.__setTdpRootForTests(null);
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});

describe('tdp-runtime applyPackBuffer', () => {
    it('applies bundled pack and rolls back on bad P01 after L01', () => {
        const tdpFs = require('../electron/tdp-fs');
        const tdpRuntime = require('../electron/tdp-runtime');
        const tone = require('../src/js/tone-adapt-lexicon-core');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tdp-rt-'));
        tdpFs.__setTdpRootForTests(tmp);
        try {
            const packPath = path.join(__dirname, '..', 'shared', 'tdp', 'tdp-bundled.tpack');
            const good = fs.readFileSync(packPath);
            const ok = tdpRuntime.applyPackBuffer(good, { requirePro: false });
            assert.strictEqual(ok.ok, true);
            assert.ok(ok.sections.includes('L01'));
            assert.ok(ok.sections.includes('D01'));
            assert.ok(fs.existsSync(tdpFs.getActiveD01Path()));

            const parsed = tdpPack.parsePack(good);
            const l01 = tdpPack.getSection(parsed, 'L01');
            const d01 = tdpPack.getSection(parsed, 'D01');
            const beforeToneLen = tone.NSFW_LEXICON_ENTRIES.length;
            const badPack = tdpPack.buildPack({
                sections: {
                    L01: l01,
                    P01: Buffer.from('AM01not-valid-payload!!!!'),
                    D01: d01,
                },
            });
            const bad = tdpRuntime.applyPackBuffer(badPack, { requirePro: false });
            assert.strictEqual(bad.ok, false);
            // Overlay cleared; consumers restored to bundled (tone still loadable).
            assert.ok(!fs.existsSync(tdpFs.getActiveD01Path()) || !fs.readdirSync(tdpFs.getActiveDir()).length);
            assert.ok(tone.NSFW_LEXICON_ENTRIES.length >= 0);
            // Bundled restore should keep a usable lexicon when tz1 is present.
            if (beforeToneLen > 0) {
                assert.ok(tone.NSFW_LEXICON_ENTRIES.length > 0);
            }
        } finally {
            tdpFs.__setTdpRootForTests(null);
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});
