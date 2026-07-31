#!/usr/bin/env node
/**
 * 生成 Advanced 许可 Ed25519 密钥对。
 * 公钥写入 src/js/advanced-license-crypto-core.js 的 DEFAULT_PUBLIC_KEY_SPKI_B64；
 * 私钥保存为 .advanced-license-private.b64（勿提交）或环境变量。
 */
const { generateKeyPairSync } = require('crypto');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const priv = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

console.log('PUBLIC_KEY_SPKI_B64=');
console.log(pub);
console.log('');
console.log('PRIVATE_KEY_PKCS8_B64=');
console.log(priv);
console.log('');
console.log('下一步：');
console.log('1. 将 PUBLIC 写入 advanced-license-crypto-core.js → DEFAULT_PUBLIC_KEY_SPKI_B64');
console.log('2. 将 PRIVATE 写入 .advanced-license-private.b64（已 gitignore）');
console.log('3. node tools/sign-advanced-license.js --id=lic_xxx');
