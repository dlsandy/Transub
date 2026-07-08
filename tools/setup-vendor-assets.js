/**
 * 下载离线 UI 资源（Font Awesome）
 * 运行: node tools/setup-vendor-assets.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'src', 'vendor');

const ASSETS = [
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css',
        dest: 'font-awesome/css/font-awesome.min.css',
    },
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.woff2',
        dest: 'font-awesome/fonts/fontawesome-webfont.woff2',
    },
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.woff',
        dest: 'font-awesome/fonts/fontawesome-webfont.woff',
    },
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/fontawesome-webfont.ttf',
        dest: 'font-awesome/fonts/fontawesome-webfont.ttf',
    },
];

function download(url, redirectBase) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = new URL(res.headers.location, redirectBase || url).href;
                download(nextUrl, redirectBase || url).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

async function main() {
    for (const asset of ASSETS) {
        const destPath = path.join(VENDOR, asset.dest);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
            console.log('skip', asset.dest);
            continue;
        }
        process.stdout.write(`download ${asset.dest} ... `);
        const data = await download(asset.url);
        fs.writeFileSync(destPath, data);
        console.log(`${data.length} bytes`);
    }

    console.log('vendor assets ready');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
