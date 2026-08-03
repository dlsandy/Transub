/**
 * TDP pack container (TPK1) + D01 domain-fix opaque codec.
 *
 * Layout:
 *   TPK1 | u32 schemaVersion | u32 flags | u32 sectionCount
 *   sections: id[4] | u32 payloadLen | payload
 *
 * Section ids: L01 (tone-adapt.tz1 bytes), P01 (av-makers.am1), D01 (DF01 opaque).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTdpPack = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function tdpPackFactory() {
    const MAGIC = Buffer.from('TPK1');
    const D01_MAGIC = Buffer.from('DF01');
    const D01_XOR_KEY = Buffer.from('TransubTdpDomain1');
    const SECTION_L01 = 'L01\0';
    const SECTION_P01 = 'P01\0';
    const SECTION_D01 = 'D01\0';
    const CURRENT_SCHEMA = 1;

    function xorBuffer(buf, key) {
        const out = Buffer.alloc(buf.length);
        for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
        return out;
    }

    function sectionIdToString(idBuf) {
        return Buffer.from(idBuf).toString('utf8').replace(/\0+$/g, '');
    }

    function encodeSectionId(id) {
        const s = String(id || '').replace(/\0/g, '');
        const out = Buffer.alloc(4, 0);
        Buffer.from(s, 'utf8').copy(out, 0, 0, Math.min(4, s.length));
        return out;
    }

    function encodeD01Payload(pairs) {
        const zlib = require('zlib');
        const list = (Array.isArray(pairs) ? pairs : [])
            .map((p) => ({
                from: String(p?.from || ''),
                to: String(p?.to || ''),
            }))
            .filter((p) => p.from && p.to);
        const json = Buffer.from(JSON.stringify({ v: 1, pairs: list }), 'utf8');
        const compressed = zlib.deflateSync(json, { level: 9 });
        return Buffer.concat([D01_MAGIC, xorBuffer(compressed, D01_XOR_KEY)]);
    }

    function decodeD01Payload(buf) {
        const zlib = require('zlib');
        if (!Buffer.isBuffer(buf) || buf.length < 5) {
            throw new Error('D01: empty payload');
        }
        if (buf.subarray(0, 4).toString('utf8') !== 'DF01') {
            throw new Error('D01: bad magic');
        }
        const inflated = zlib.inflateSync(xorBuffer(buf.subarray(4), D01_XOR_KEY));
        const payload = JSON.parse(inflated.toString('utf8'));
        if (!payload || typeof payload !== 'object') {
            throw new Error('D01: invalid JSON');
        }
        const pairs = Array.isArray(payload.pairs) ? payload.pairs : [];
        return pairs
            .map((p) => ({ from: String(p?.from || ''), to: String(p?.to || '') }))
            .filter((p) => p.from && p.to);
    }

    /**
     * @param {{ schemaVersion?: number, flags?: number, sections: Record<string, Buffer>|Array<{id:string,payload:Buffer}> }} input
     */
    function buildPack(input = {}) {
        const schemaVersion = Number(input.schemaVersion) || CURRENT_SCHEMA;
        const flags = Number(input.flags) || 0;
        /** @type {{ id: string, payload: Buffer }[]} */
        let sections = [];
        if (Array.isArray(input.sections)) {
            sections = input.sections.map((s) => ({
                id: String(s.id || ''),
                payload: Buffer.isBuffer(s.payload) ? s.payload : Buffer.from(s.payload || []),
            }));
        } else if (input.sections && typeof input.sections === 'object') {
            sections = Object.entries(input.sections).map(([id, payload]) => ({
                id,
                payload: Buffer.isBuffer(payload) ? payload : Buffer.from(payload || []),
            }));
        }
        sections = sections.filter((s) => s.id && s.payload && s.payload.length);

        const header = Buffer.alloc(4 + 4 + 4 + 4);
        MAGIC.copy(header, 0);
        header.writeUInt32LE(schemaVersion, 4);
        header.writeUInt32LE(flags, 8);
        header.writeUInt32LE(sections.length, 12);

        const parts = [header];
        for (const sec of sections) {
            const idBuf = encodeSectionId(sec.id);
            const lenBuf = Buffer.alloc(4);
            lenBuf.writeUInt32LE(sec.payload.length, 0);
            parts.push(idBuf, lenBuf, sec.payload);
        }
        return Buffer.concat(parts);
    }

    /**
     * @returns {{ schemaVersion: number, flags: number, sections: Map<string, Buffer> }}
     */
    function parsePack(buf) {
        if (!Buffer.isBuffer(buf) || buf.length < 16) {
            throw new Error('tpack: truncated');
        }
        if (buf.subarray(0, 4).toString('utf8') !== 'TPK1') {
            throw new Error('tpack: bad magic');
        }
        const schemaVersion = buf.readUInt32LE(4);
        const flags = buf.readUInt32LE(8);
        const sectionCount = buf.readUInt32LE(12);
        if (schemaVersion < 1 || schemaVersion > CURRENT_SCHEMA) {
            throw new Error(`tpack: unsupported schema ${schemaVersion}`);
        }
        if (sectionCount > 64) throw new Error('tpack: too many sections');

        const sections = new Map();
        let offset = 16;
        for (let i = 0; i < sectionCount; i++) {
            if (offset + 8 > buf.length) throw new Error('tpack: truncated section header');
            const id = sectionIdToString(buf.subarray(offset, offset + 4));
            offset += 4;
            const len = buf.readUInt32LE(offset);
            offset += 4;
            if (len > 16 * 1024 * 1024) throw new Error('tpack: section too large');
            if (offset + len > buf.length) throw new Error('tpack: truncated section body');
            sections.set(id, buf.subarray(offset, offset + len));
            offset += len;
        }
        return { schemaVersion, flags, sections };
    }

    function getSection(parsed, id) {
        if (!parsed?.sections) return null;
        const key = String(id || '').replace(/\0/g, '');
        return parsed.sections.get(key) || parsed.sections.get(`${key}\0`) || null;
    }

    /**
     * Normalize CDN/local manifest JSON.
     * @returns {{ ok: true, schemaVersion: number, latest: object } | { ok: false, error: string }}
     */
    function normalizeManifest(raw) {
        if (!raw || typeof raw !== 'object') {
            return { ok: false, error: '清单无效' };
        }
        const schemaVersion = Number(raw.schemaVersion) || 0;
        if (schemaVersion < 1) return { ok: false, error: '清单缺少 schemaVersion' };
        const latest = raw.latest && typeof raw.latest === 'object' ? raw.latest : null;
        if (!latest) return { ok: false, error: '清单缺少 latest' };
        const version = String(latest.version || '').trim();
        const url = String(latest.url || '').trim();
        const sha256 = String(latest.sha256 || '').trim().toLowerCase();
        const sig = String(latest.sig || '').trim();
        if (!version) return { ok: false, error: '清单缺少 version' };
        if (!url) return { ok: false, error: '清单缺少 url' };
        if (!/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, error: '清单 sha256 无效' };
        if (!sig) return { ok: false, error: '清单缺少签名' };
        return {
            ok: true,
            schemaVersion,
            latest: {
                version,
                releasedAt: String(latest.releasedAt || '').trim() || null,
                url,
                size: Number(latest.size) || 0,
                sha256,
                sig,
                minAppVersion: String(latest.minAppVersion || '').trim() || null,
                notes: String(latest.notes || '').trim() || '',
            },
        };
    }

    /** Compare semver-ish a vs b: -1 / 0 / 1 */
    function compareVersions(a, b) {
        const pa = String(a || '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
        const pb = String(b || '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
        const n = Math.max(pa.length, pb.length);
        for (let i = 0; i < n; i++) {
            const da = pa[i] || 0;
            const db = pb[i] || 0;
            if (da < db) return -1;
            if (da > db) return 1;
        }
        return 0;
    }

    return {
        MAGIC: 'TPK1',
        CURRENT_SCHEMA,
        SECTION_L01: 'L01',
        SECTION_P01: 'P01',
        SECTION_D01: 'D01',
        encodeD01Payload,
        decodeD01Payload,
        buildPack,
        parsePack,
        getSection,
        normalizeManifest,
        compareVersions,
        // aliases matching encodeSectionId usage
        SECTION_IDS: {
            L01: SECTION_L01.replace(/\0/g, ''),
            P01: SECTION_P01.replace(/\0/g, ''),
            D01: SECTION_D01.replace(/\0/g, ''),
        },
    };
}));
