#!/usr/bin/env node
/**
 * 签发 Transub Pro 许可密钥（Ed25519）
 *
 * 私钥来源（优先级）：
 * 1. 环境变量 TRANSUB_ADVANCED_LICENSE_PRIVATE_KEY_B64
 * 2. 仓库根目录 .advanced-license-private.b64（已 gitignore）
 *
 * 用法：
 *   node tools/sign-advanced-license.js --id=lic_xxx
 *   node tools/sign-advanced-license.js --id=lic_xxx --features=contextReconstruct
 *   node tools/sign-advanced-license.js --count=20 --prefix=pro2026 --out=keys.txt
 *
 * 批量输出每行：licenseId<TAB>TSUB1.…（便于导入爱发电兑换码）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cryptoApi = require('../src/js/advanced-license-crypto-core');

function parseArgs(argv) {
    const out = {
        id: '',
        features: ['*'],
        expiresAt: null,
        count: 0,
        prefix: '',
        out: '',
    };
    for (const a of argv) {
        if (a.startsWith('--id=')) out.id = a.slice(5).trim();
        else if (a.startsWith('--features=')) {
            out.features = a.slice(11).split(',').map((s) => s.trim()).filter(Boolean);
        } else if (a.startsWith('--expires=')) {
            out.expiresAt = a.slice(10).trim() || null;
        } else if (a.startsWith('--count=')) {
            out.count = Math.max(0, parseInt(a.slice(8), 10) || 0);
        } else if (a.startsWith('--prefix=')) {
            out.prefix = a.slice(9).trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
        } else if (a.startsWith('--out=')) {
            out.out = a.slice(6).trim();
        }
    }
    return out;
}

function loadPrivateKeyB64() {
    const fromEnv = String(process.env.TRANSUB_ADVANCED_LICENSE_PRIVATE_KEY_B64 || '').trim();
    if (fromEnv) return fromEnv;
    const filePath = path.join(__dirname, '..', '.advanced-license-private.b64');
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8').trim();
    }
    throw new Error(
        '未找到私钥。请设置 TRANSUB_ADVANCED_LICENSE_PRIVATE_KEY_B64 或创建 .advanced-license-private.b64',
    );
}

function signOne(licenseId, features, expiresAt, priv) {
    return cryptoApi.signLicensePayload({
        licenseId,
        features,
        expiresAt: expiresAt || null,
    }, priv);
}

function padIndex(i, width) {
    return String(i).padStart(width, '0');
}

function batchIds(count, prefix) {
    const tag = prefix || crypto.randomBytes(3).toString('hex');
    const width = Math.max(3, String(count).length);
    const ids = [];
    for (let i = 1; i <= count; i += 1) {
        ids.push(`afd_${tag}_${padIndex(i, width)}`);
    }
    return ids;
}

function usageAndExit() {
    console.error([
        '用法:',
        '  node tools/sign-advanced-license.js --id=lic_xxx [--features=*|a,b] [--expires=ISO]',
        '  node tools/sign-advanced-license.js --count=N [--prefix=tag] [--out=keys.txt] [--features=*|a,b]',
    ].join('\n'));
    process.exit(1);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.count <= 0 && !args.id) usageAndExit();

    const priv = loadPrivateKeyB64();

    if (args.count > 0) {
        if (args.count > 5000) {
            console.error('单次批量上限 5000，请分批生成');
            process.exit(1);
        }
        const ids = batchIds(args.count, args.prefix);
        const lines = ids.map((licenseId) => {
            const key = signOne(licenseId, args.features, args.expiresAt, priv);
            return `${licenseId}\t${key}`;
        });
        const body = `${lines.join('\n')}\n`;
        if (args.out) {
            const outPath = path.resolve(args.out);
            fs.writeFileSync(outPath, body, 'utf8');
            console.error(`已写入 ${ids.length} 条 → ${outPath}`);
        } else {
            process.stdout.write(body);
        }
        return;
    }

    const key = signOne(args.id, args.features, args.expiresAt, priv);
    if (args.out) {
        const outPath = path.resolve(args.out);
        fs.writeFileSync(outPath, `${args.id}\t${key}\n`, 'utf8');
        console.error(`已写入 1 条 → ${outPath}`);
    } else {
        console.log(key);
    }
}

main();
