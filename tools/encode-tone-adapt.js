/**
 * Encode / decode opaque tone-adapt payload (lexicon + adult-tone prompts).
 *
 * Format: magic "TZ01" + XOR(zlib.deflate(JSON utf8))
 * Key is fixed in encoder/decoder (obscurity only — not cryptographic secrecy).
 *
 * Usage:
 *   node tools/encode-tone-adapt.js --from=path/to/tone-adapt.src.json
 *   node tools/encode-tone-adapt.js --decode
 *   node tools/encode-tone-adapt.js --decode --out=path/to/tone-adapt.src.json
 *
 * Source JSON shape:
 *   {
 *     "v": 1,
 *     "entries": [{ "ja": ["…"], "zh": "…", "note?": "", "kind?": "moan|sfx|body|act|misc" }],
 *     "prompts": {
 *       "fallbackExamples": "a→b/…",
 *       "sakuraNsfw": "…{{EXAMPLES}}…",
 *       "smartFaithful": ["…", "…{{EXAMPLES}}…", …]
 *     }
 *   }
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const DEFAULT_OUT = path.join(root, 'src', 'js', 'tone-adapt.tz1');
const MAGIC = Buffer.from('TZ01');
const XOR_KEY = Buffer.from('TransubToneAdapt1');

function xorBuffer(buf, key) {
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
    return out;
}

function encodePayload(payload) {
    const json = Buffer.from(JSON.stringify(payload), 'utf8');
    const compressed = zlib.deflateSync(json, { level: 9 });
    return Buffer.concat([MAGIC, xorBuffer(compressed, XOR_KEY)]);
}

function decodeBuffer(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 5) {
        throw new Error('tone-adapt: empty or truncated payload');
    }
    if (buf.subarray(0, 4).toString('utf8') !== 'TZ01') {
        throw new Error('tone-adapt: bad magic');
    }
    const inflated = zlib.inflateSync(xorBuffer(buf.subarray(4), XOR_KEY));
    const payload = JSON.parse(inflated.toString('utf8'));
    if (!payload || typeof payload !== 'object') {
        throw new Error('tone-adapt: invalid JSON payload');
    }
    return payload;
}

function parseArgs(argv) {
    const out = { from: '', decode: false, outPath: '' };
    for (const a of argv) {
        if (a === '--decode') out.decode = true;
        else if (a.startsWith('--from=')) out.from = a.slice(7).trim();
        else if (a.startsWith('--out=')) out.outPath = a.slice(6).trim();
    }
    return out;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.decode) {
        const raw = fs.readFileSync(DEFAULT_OUT);
        const payload = decodeBuffer(raw);
        const text = `${JSON.stringify(payload, null, 2)}\n`;
        if (args.outPath) {
            fs.mkdirSync(path.dirname(path.resolve(args.outPath)), { recursive: true });
            fs.writeFileSync(args.outPath, text, 'utf8');
            console.log('decoded →', args.outPath);
        } else {
            process.stdout.write(text);
        }
        return;
    }
    if (!args.from) {
        console.error('Usage: node tools/encode-tone-adapt.js --from=tone-adapt.src.json');
        console.error('       node tools/encode-tone-adapt.js --decode [--out=tone-adapt.src.json]');
        process.exit(1);
    }
    const srcPath = path.resolve(args.from);
    const payload = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    if (!Array.isArray(payload.entries)) {
        console.error('source JSON must have an entries array');
        process.exit(1);
    }
    payload.v = Number(payload.v) || 1;
    const encoded = encodePayload(payload);
    const dest = args.outPath ? path.resolve(args.outPath) : DEFAULT_OUT;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, encoded);
    console.log('encoded', payload.entries.length, 'entries →', dest, `(${encoded.length} bytes)`);
}

if (require.main === module) {
    main();
}

module.exports = {
    MAGIC,
    XOR_KEY,
    encodePayload,
    decodeBuffer,
    DEFAULT_OUT,
};
