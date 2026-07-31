/**
 * Fetch / merge known JAV maker prefixes and encode opaque `src/js/av-makers.am1`.
 *
 * Sources (public, read-only):
 *   - Built-in seed (major labels / series codes)
 *   - GitHub StashDB-Docs issue #28 comments (studio DVD-ID prefixes)
 *   - JavDB Top250 gist CSV + magnet list (peytonyip/475602e4d448c5befc49ce7437c0f4a2)
 *
 * Usage:
 *   node tools/fetch-av-makers.js
 *   node tools/fetch-av-makers.js --offline   # seed + any cached tmp only
 *   node tools/fetch-av-makers.js --src-out=tools/_tmp_av_fetch/av-makers.src.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { encodePayload, DEFAULT_OUT, DEFAULT_EMBED, normalizeMakers, writeOutputs } = require('./encode-av-makers');

const root = path.join(__dirname, '..');
const TMP = path.join(__dirname, '_tmp_av_fetch');

/** Prefixes that collide with codecs / common English / noise. */
const DENY = new Set([
    'h264', 'h265', 'x264', 'x265', 'avc', 'hevc', 'aac', 'mp3', 'mp4', 'mkv', 'webm', 'av1',
    'http', 'https', 'www', 'com', 'net', 'org', 'html', 'json', 'file', 'video', 'audio',
    'true', 'false', 'null', 'test', 'demo', 'sample', 'nmsl', 'cd', 'vol', 'part', 'full',
    'uhd', 'hdr', 'sdr', 'remux', 'bluray', 'webdl', 'webrip',
]);

/**
 * Curated seed of well-known censored/uncensored/amateur series prefixes.
 * Kept in the fetch tool only — runtime uses the opaque .am1 blob.
 */
const SEED_MAKERS = `
ssis ssni snis sone soe oned sivr
stars start fsdss dass dldss sdde sdmm sdmu sdab sdam nhdt nhdtb
mide midv mifd miaa miab mimk mvsd meyd jufe jul juq jur jux
mida miad miae mias mixs migd miid mdld mint mird mdrd midd mdvr
pred prst pppd pppe ppsd ppfd ppmd ppud ppbd ppvr
ipx ipzz ipvr ipz iptd ipbd idbd cawd atid adn shkd rbd same
hmn hnd hnds wanz waaa pppe ntr nkkd ngod vec venx
abp abs abw abf aka akaes
dvaj dva ebod eyan fj fcdss kmhrs luxu
maan siro gana mium mywife oren ara fc2 ppv
gvh gvg bazx bzvr mdb mdbk mdtm
snis sqte sqtevr
roe royd cjod dsod fns snos urkk
miab mikr mxgs lulu pfes pxh ure ebwh
cwp cwpbd laf lafbd smbd smd sky skyhd
snis savr vrkm kmvr kbvr averv hotvr dpvr exvr scvr
bmw bmvr bokd
onez onezd
fthtd ftav
nacr nacx
apns apnh
hbad hbad
rki rkip
snis
waaa
jvbd
omgs
milk
hunb hung
ymdd ymdv
sw sws
gend gendr
mism
nnpj
pred
focs
mvg mmnd
nhdta
kbi kbir
oksn
vecv
juy
jufe
wanz
abp
ssis
`.split(/\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

const SOURCES = {
    stashComments: 'https://api.github.com/repos/stashapp/StashDB-Docs/issues/28/comments?per_page=100',
    javdbCsv: 'https://gist.githubusercontent.com/peytonyip/475602e4d448c5befc49ce7437c0f4a2/raw/1176ccc6d1a8075e0e183d3aafcbc0d25dbca6f4/top250-code.csv',
    javdbMagnet: 'https://gist.githubusercontent.com/peytonyip/475602e4d448c5befc49ce7437c0f4a2/raw/1cfd47cc552882faf095c8e71afd70f91a157011/top250-magnet.txt',
};

function parseArgs(argv) {
    const out = { offline: false, srcOut: '', outPath: '' };
    for (const a of argv) {
        if (a === '--offline') out.offline = true;
        else if (a.startsWith('--src-out=')) out.srcOut = a.slice(10).trim();
        else if (a.startsWith('--out=')) out.outPath = a.slice(6).trim();
    }
    return out;
}

function fetchText(url, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, {
            headers: {
                'User-Agent': 'Transub-av-makers-fetch/1.0',
                Accept: 'application/json,text/plain,*/*',
            },
            timeout: timeoutMs,
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                fetchText(res.headers.location, timeoutMs).then(resolve, reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`timeout ${url}`));
        });
    });
}

function addPrefix(set, raw) {
    const p = String(raw || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9]{1,5}$/.test(p)) return;
    if (DENY.has(p)) return;
    set.add(p);
}

function addFromText(set, text) {
    if (!text) return;
    for (const m of String(text).matchAll(/\b([A-Za-z]{2,5})[-_](\d{2,5})\b/g)) {
        addPrefix(set, m[1]);
    }
    for (const m of String(text).matchAll(/\d{2,4}([A-Za-z]{2,5})[-_](\d{2,5})/gi)) {
        addPrefix(set, m[1]);
    }
    // Bullet / backtick studio codes in markdown (no digits)
    for (const m of String(text).matchAll(/^\s*[-*•]\s*`?([A-Za-z]{2,5})`?\b/gm)) {
        addPrefix(set, m[1]);
    }
    for (const m of String(text).matchAll(/`([A-Za-z]{2,5})`/g)) {
        addPrefix(set, m[1]);
    }
}

function loadCached(name) {
    const p = path.join(TMP, name);
    if (!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf8');
}

function saveCached(name, text) {
    fs.mkdirSync(TMP, { recursive: true });
    fs.writeFileSync(path.join(TMP, name), text, 'utf8');
}

async function fetchSource(name, url, offline) {
    if (offline) {
        const cached = loadCached(name);
        if (cached) console.log(`  cache ${name} (${cached.length} B)`);
        return cached;
    }
    try {
        const text = await fetchText(url);
        saveCached(name, text);
        console.log(`  fetched ${name} (${text.length} B)`);
        return text;
    } catch (err) {
        const cached = loadCached(name);
        if (cached) {
            console.warn(`  fetch failed ${name}: ${err.message}; using cache`);
            return cached;
        }
        console.warn(`  fetch failed ${name}: ${err.message}`);
        return '';
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const makers = new Set();
    const sources = ['seed'];

    for (const p of SEED_MAKERS) addPrefix(makers, p);
    console.log(`seed: ${makers.size} makers`);

    console.log(args.offline ? 'offline mode (cache only)' : 'fetching remote sources…');
    const stash = await fetchSource('stash-comments.json', SOURCES.stashComments, args.offline);
    if (stash) {
        sources.push('stashdb-docs#28');
        try {
            const comments = JSON.parse(stash);
            for (const c of comments) addFromText(makers, c.body || '');
        } catch {
            addFromText(makers, stash);
        }
    }

    const csv = await fetchSource('top250-code.csv', SOURCES.javdbCsv, args.offline);
    if (csv) {
        sources.push('javdb-gist-top250-csv');
        addFromText(makers, csv);
    }

    const magnet = await fetchSource('top250-magnet.txt', SOURCES.javdbMagnet, args.offline);
    if (magnet) {
        sources.push('javdb-gist-top250-magnet');
        addFromText(makers, magnet);
    }

    const list = normalizeMakers([...makers]);
    const payload = {
        v: 1,
        updated: new Date().toISOString().slice(0, 10),
        sources,
        makers: list,
    };

    if (args.srcOut) {
        const srcPath = path.resolve(args.srcOut);
        fs.mkdirSync(path.dirname(srcPath), { recursive: true });
        fs.writeFileSync(srcPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        console.log('wrote source json →', srcPath);
    }

    const { encoded, body } = encodePayload(payload);
    const dest = args.outPath ? path.resolve(args.outPath) : DEFAULT_OUT;
    writeOutputs(body, encoded, dest, DEFAULT_EMBED);
    console.log(`sources: ${sources.join(', ')}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
