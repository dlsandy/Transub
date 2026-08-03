#!/usr/bin/env node
/**
 * Build / sign TDP language data pack (neutral name .tpack).
 *
 * Usage:
 *   node tools/encode-tdp-pack.js
 *   node tools/encode-tdp-pack.js --version=1.0.0 --sign
 *   node tools/encode-tdp-pack.js --version=1.0.0 --sign --manifest-out=dist/tdp/manifest.json
 *
 * Private key: TRANSUB_TDP_PRIVATE_KEY_PKCS8_B64 or .tdp-private.b64
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tdpPack = require('../src/js/tdp-pack-core');
const tdpCrypto = require('../src/js/tdp-crypto-core');

const DEFAULT_TZ1 = path.join(root, 'src', 'js', 'tone-adapt.tz1');
const DEFAULT_AM1 = path.join(root, 'src', 'js', 'av-makers.am1');
const DEFAULT_DOMAIN = path.join(root, 'shared', 'ja-asr-domain-fixes.json');
const DEFAULT_OUT_DIR = path.join(root, 'shared', 'tdp');
const DEFAULT_PRIVATE = path.join(root, '.tdp-private.b64');

function parseArgs(argv) {
    const out = {
        version: '1.0.0',
        sign: false,
        outDir: DEFAULT_OUT_DIR,
        manifestOut: '',
        tz1: DEFAULT_TZ1,
        am1: DEFAULT_AM1,
        domain: DEFAULT_DOMAIN,
        minAppVersion: '3.0.0',
        notes: '领域识别与用语修正更新',
        cdnBase: 'https://www.transub.cc/tdp',
    };
    for (const a of argv) {
        if (a === '--sign') out.sign = true;
        else if (a.startsWith('--version=')) out.version = a.slice(10).trim();
        else if (a.startsWith('--out-dir=')) out.outDir = path.resolve(a.slice(10).trim());
        else if (a.startsWith('--manifest-out=')) out.manifestOut = path.resolve(a.slice(15).trim());
        else if (a.startsWith('--tz1=')) out.tz1 = path.resolve(a.slice(6).trim());
        else if (a.startsWith('--am1=')) out.am1 = path.resolve(a.slice(6).trim());
        else if (a.startsWith('--domain=')) out.domain = path.resolve(a.slice(9).trim());
        else if (a.startsWith('--min-app=')) out.minAppVersion = a.slice(10).trim();
        else if (a.startsWith('--notes=')) out.notes = a.slice(8).trim();
        else if (a.startsWith('--cdn-base=')) out.cdnBase = a.slice(11).trim().replace(/\/+$/, '');
    }
    return out;
}

function loadPrivateKeyB64() {
    const env = String(process.env.TRANSUB_TDP_PRIVATE_KEY_PKCS8_B64 || '').trim();
    if (env) return env;
    if (fs.existsSync(DEFAULT_PRIVATE)) {
        return fs.readFileSync(DEFAULT_PRIVATE, 'utf8').trim().split(/\r?\n/)[0].trim();
    }
    return '';
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    for (const [label, p] of [['tz1', args.tz1], ['am1', args.am1], ['domain', args.domain]]) {
        if (!fs.existsSync(p)) {
            console.error(`缺少 ${label}: ${p}`);
            process.exit(1);
        }
    }

    const l01 = fs.readFileSync(args.tz1);
    const p01 = fs.readFileSync(args.am1);
    const domainPairs = JSON.parse(fs.readFileSync(args.domain, 'utf8'));
    if (!Array.isArray(domainPairs)) {
        console.error('domain JSON 必须是数组');
        process.exit(1);
    }
    const d01 = tdpPack.encodeD01Payload(domainPairs);

    const packBuf = tdpPack.buildPack({
        schemaVersion: 1,
        sections: {
            L01: l01,
            P01: p01,
            D01: d01,
        },
    });

    fs.mkdirSync(args.outDir, { recursive: true });
    const packName = `tdp-${args.version}.tpack`;
    const packPath = path.join(args.outDir, packName);
    const bundledPath = path.join(args.outDir, 'tdp-bundled.tpack');
    fs.writeFileSync(packPath, packBuf);
    fs.writeFileSync(bundledPath, packBuf);

    const sha256 = tdpCrypto.sha256HexOfBuffer(packBuf);
    let sig = '';
    if (args.sign) {
        const priv = loadPrivateKeyB64();
        if (!priv) {
            console.error('需要私钥：TRANSUB_TDP_PRIVATE_KEY_PKCS8_B64 或 .tdp-private.b64');
            process.exit(1);
        }
        sig = tdpCrypto.signPackHash(args.version, sha256, priv);
        const verified = tdpCrypto.verifyPackBuffer(packBuf, {
            version: args.version,
            sha256,
            sig,
            size: packBuf.length,
        });
        if (!verified.ok) {
            console.error('自检验签失败:', verified.error);
            process.exit(1);
        }
    }

    const manifest = {
        schemaVersion: 1,
        latest: {
            version: args.version,
            releasedAt: new Date().toISOString(),
            url: `${args.cdnBase}/packs/${packName}`,
            size: packBuf.length,
            sha256,
            sig: sig || '',
            minAppVersion: args.minAppVersion,
            notes: args.notes,
        },
    };

    // Versioned copy for CDN upload staging
    const packsDir = path.join(args.outDir, 'packs');
    fs.mkdirSync(packsDir, { recursive: true });
    fs.writeFileSync(path.join(packsDir, packName), packBuf);

    console.log('pack →', packPath);
    console.log('bundled →', bundledPath);
    console.log('cdn staging →', path.join(packsDir, packName));
    console.log('sha256', sha256);
    console.log('size', packBuf.length);

    if (sig) {
        const manifestPath = args.manifestOut || path.join(args.outDir, 'manifest.json');
        fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        console.log('manifest →', manifestPath);
        console.log('sig', sig);
        console.log(`Upload: ${path.join(packsDir, packName)} + manifest.json → ${args.cdnBase}/`);
    } else {
        console.log('(unsigned — set TRANSUB_TDP_PRIVATE_KEY_PKCS8_B64 or .tdp-private.b64, then --sign)');
        console.log('CDN requires a signed manifest; bundled.tpack is for offline fallback only.');
    }
}

main();
