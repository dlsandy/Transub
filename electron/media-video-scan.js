/**
 * Recursive media file scan for folder import / auto-scan.
 * Prefer async on IPC paths so deep trees do not freeze the Electron main process.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { isMediaExt, isInternalTimingCachePath } = require('../src/js/media-extensions-core');

function isVideoFile(filePath) {
    // Name kept for callers; matches prior extensions-bridge (video + audio).
    if (isInternalTimingCachePath(filePath)) return false;
    return isMediaExt(filePath);
}

function pathKey(filePath) {
    const full = path.resolve(String(filePath || ''));
    return process.platform === 'win32' ? full.toLowerCase() : full;
}

/**
 * @param {string} rootDir
 * @param {boolean} [recursive=true]
 * @returns {Promise<string[]>}
 */
async function scanVideosInDirectoryAsync(rootDir, recursive = true) {
    const results = [];
    const queue = [path.resolve(rootDir)];
    const seen = new Set();

    while (queue.length) {
        const dir = queue.shift();
        let entries;
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // Never descend into engine QC PCM cache (timing-16k.wav jobs look "done"
                // but stamp wrong / zero ZH timelines when treated as media).
                if (entry.name === '.transub-cache') continue;
                if (recursive) queue.push(full);
                continue;
            }
            if (!entry.isFile() || !isVideoFile(full)) continue;
            const key = pathKey(full);
            if (seen.has(key)) continue;
            seen.add(key);
            results.push(full);
        }
    }
    return results.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

/**
 * Sync variant for callers that cannot await (e.g. sync auto-scan helpers).
 * @param {string} rootDir
 * @param {boolean} [recursive=true]
 * @returns {string[]}
 */
function scanVideosInDirectory(rootDir, recursive = true) {
    const results = [];
    const queue = [path.resolve(rootDir)];
    const seen = new Set();

    while (queue.length) {
        const dir = queue.shift();
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '.transub-cache') continue;
                if (recursive) queue.push(full);
                continue;
            }
            if (!entry.isFile() || !isVideoFile(full)) continue;
            const key = pathKey(full);
            if (seen.has(key)) continue;
            seen.add(key);
            results.push(full);
        }
    }
    return results.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

module.exports = {
    isVideoFile,
    isInternalTimingCachePath,
    scanVideosInDirectory,
    scanVideosInDirectoryAsync,
};
