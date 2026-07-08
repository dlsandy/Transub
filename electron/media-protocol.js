const { protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('url');

const SCHEME = 'transub-media';

const VIDEO_MIME = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.ts': 'video/mp2t',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
    '.3gp': 'video/3gpp',
};

function getVideoMime(filePath) {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    return VIDEO_MIME[ext] || 'application/octet-stream';
}

function registerMediaScheme() {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: SCHEME,
            privileges: {
                standard: true,
                secure: true,
                corsEnabled: true,
                supportFetchAPI: true,
                stream: true,
                bypassCSP: true,
            },
        },
    ]);
}

function buildMediaUrl(filePath) {
    const p = path.resolve(String(filePath || '').trim());
    if (!p) return '';
    return `${SCHEME}://video?path=${encodeURIComponent(p)}`;
}

function parseMediaRequestPath(requestUrl) {
    const url = new URL(requestUrl);
    const raw = decodeURIComponent(url.searchParams.get('path') || '');
    if (!raw) return null;
    return path.resolve(raw);
}

function createRangedFileResponse(filePath, request) {
    const stat = fs.statSync(filePath);
    const size = stat.size;
    const type = getVideoMime(filePath);
    const range = request.headers.get('Range') || request.headers.get('range');

    if (range) {
        const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
        if (match) {
            let start = match[1] ? parseInt(match[1], 10) : 0;
            let end = match[2] ? parseInt(match[2], 10) : size - 1;
            if (Number.isNaN(start)) start = 0;
            if (Number.isNaN(end) || end >= size) end = size - 1;
            if (start >= size || start > end) {
                return new Response(null, {
                    status: 416,
                    headers: { 'Content-Range': `bytes */${size}` },
                });
            }
            const stream = fs.createReadStream(filePath, { start, end });
            return new Response(Readable.toWeb(stream), {
                status: 206,
                headers: {
                    'Content-Type': type,
                    'Content-Length': String(end - start + 1),
                    'Content-Range': `bytes ${start}-${end}/${size}`,
                    'Accept-Ranges': 'bytes',
                },
            });
        }
    }

    const stream = fs.createReadStream(filePath);
    return new Response(Readable.toWeb(stream), {
        status: 200,
        headers: {
            'Content-Type': type,
            'Content-Length': String(size),
            'Accept-Ranges': 'bytes',
        },
    });
}

function registerMediaProtocolHandler() {
    protocol.handle(SCHEME, async (request) => {
        try {
            const filePath = parseMediaRequestPath(request.url);
            if (!filePath || !fs.existsSync(filePath)) {
                return new Response(null, { status: 404, statusText: 'Not Found' });
            }
            return createRangedFileResponse(filePath, request);
        } catch {
            return new Response(null, { status: 500, statusText: 'Error' });
        }
    });
}

function resolveMediaUrl(filePath) {
    const resolved = path.resolve(String(filePath || '').trim());
    if (!resolved) return { ok: false, error: '缺少视频路径' };
    if (!fs.existsSync(resolved)) return { ok: false, error: '视频文件不存在' };
    return {
        ok: true,
        path: resolved,
        url: buildMediaUrl(resolved),
        fileUrl: pathToFileURL(resolved).href,
    };
}

module.exports = {
    SCHEME,
    registerMediaScheme,
    registerMediaProtocolHandler,
    buildMediaUrl,
    resolveMediaUrl,
};
