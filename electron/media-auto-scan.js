/**
 * Scan one or more folders for media files that lack sidecar subtitles.
 * Keeps filter logic out of extensions-bridge.
 */

const fs = require('fs');
const path = require('path');

const { resolveLocalSubtitlePath } = require('./subtitle-utils');

function normalizeFolderList(folders) {
    const list = Array.isArray(folders) ? folders : [];
    const out = [];
    const seen = new Set();
    for (const raw of list) {
        const folder = path.resolve(String(raw || '').trim());
        if (!folder) continue;
        const key = process.platform === 'win32' ? folder.toLowerCase() : folder;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(folder);
    }
    return out;
}

function pathKey(filePath) {
    const full = path.resolve(String(filePath || ''));
    return process.platform === 'win32' ? full.toLowerCase() : full;
}

/**
 * @param {object} opts
 * @param {string[]} opts.folders
 * @param {boolean} [opts.recursive=true]
 * @param {string} [opts.outputDir]
 * @param {(rootDir: string, recursive?: boolean) => string[]} opts.scanVideosInDirectory
 */
function scanFoldersForMissingSubtitles(opts = {}) {
    const scanVideosInDirectory = opts.scanVideosInDirectory;
    if (typeof scanVideosInDirectory !== 'function') {
        throw new Error('scanVideosInDirectory required');
    }
    const folders = normalizeFolderList(opts.folders);
    const recursive = opts.recursive !== false;
    const outputDir = String(opts.outputDir || '').trim();
    const preferredDir = outputDir || undefined;

    const files = [];
    const seenMedia = new Set();
    let scanned = 0;
    let skippedHasSub = 0;
    let skippedMissingFolder = 0;
    const folderErrors = [];

    if (!folders.length) {
        return {
            ok: true,
            files,
            scanned: 0,
            skippedHasSub: 0,
            skippedMissingFolder: 0,
            folderCount: 0,
            folderErrors,
        };
    }

    for (const folder of folders) {
        if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
            skippedMissingFolder += 1;
            folderErrors.push({ folder, error: '目录不存在' });
            continue;
        }
        let mediaPaths;
        try {
            mediaPaths = scanVideosInDirectory(folder, recursive) || [];
        } catch (err) {
            folderErrors.push({ folder, error: err.message || String(err) });
            continue;
        }
        for (const mediaPath of mediaPaths) {
            const key = pathKey(mediaPath);
            if (seenMedia.has(key)) continue;
            seenMedia.add(key);
            scanned += 1;
            const existing = resolveLocalSubtitlePath(mediaPath, preferredDir);
            if (existing) {
                skippedHasSub += 1;
                continue;
            }
            files.push(mediaPath);
        }
    }

    files.sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return {
        ok: true,
        files,
        scanned,
        skippedHasSub,
        skippedMissingFolder,
        folderCount: folders.length,
        folderErrors,
    };
}

module.exports = {
    normalizeFolderList,
    scanFoldersForMissingSubtitles,
};
