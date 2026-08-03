/**
 * Release / first-install / auto-update zip naming (English filenames).
 * Older Chinese names (标准版 / 官网更新包) remain accepted by updaters.
 */
'use strict';

function standardZipName(version) {
    return `Transub-${String(version).trim()}-win.zip`;
}

/**
 * Historical Chinese first-install name (3.0.3 brief); no longer published.
 * Kept so tools can still discover leftover dist artifacts.
 */
function legacyStandardZipName(version) {
    return `Transub-${String(version).trim()}-Win-标准版.zip`;
}

function editionZipName(version, edition) {
    const v = String(version).trim();
    const e = String(edition || '').trim().toLowerCase();
    if (e === 'cpu') return `Transub-${v}-Win-CPU完整版.zip`;
    if (e === 'cuda') return `Transub-${v}-Win-CUDA显卡版.zip`;
    throw new Error(`unknown edition: ${edition}`);
}

function websiteUpdateZipName(version) {
    return `Transub-${String(version).trim()}-update.zip`;
}

function isEditionZipName(name) {
    const n = String(name || '');
    if (/Win-CPU完整版\.zip$/i.test(n) || /Win-CUDA显卡版\.zip$/i.test(n)) return true;
    if (/Win-CPU-Complete\.zip$/i.test(n) || /Win-CUDA-GPU\.zip$/i.test(n)) return true;
    return /-win-(cpu|cuda)\.zip$/i.test(n);
}

/**
 * Full auto-update zip (standard / slim only).
 * Accepts *-win.zip and older 标准版 / Win-Standard; rejects editions / blocks / delta / update bundles.
 */
function isAutoUpdateFullZipName(name) {
    const n = String(name || '');
    if (!/\.zip$/i.test(n) || !/transub/i.test(n)) return false;
    if (isEditionZipName(n)) return false;
    if (/-update\.zip$/i.test(n) || /-官网更新包\.zip$/i.test(n) || /-website-update\.zip$/i.test(n)) {
        return false;
    }
    if (/-win-(shell|app|engine|other|electron|internal|misc|delta)\.zip$/i.test(n)) return false;
    if (/Win-标准版\.zip$/i.test(n) || /Win-Standard\.zip$/i.test(n)) return true;
    return /(?:^|-)win\.zip$/i.test(n);
}

function editionLabel(edition) {
    const e = String(edition || '').trim().toLowerCase();
    if (e === 'cpu') return 'CPU完整版';
    if (e === 'cuda') return 'CUDA显卡版';
    if (e === 'standard' || e === 'slim') return '标准版';
    return e || '标准版';
}

module.exports = {
    standardZipName,
    legacyStandardZipName,
    editionZipName,
    websiteUpdateZipName,
    isEditionZipName,
    isAutoUpdateFullZipName,
    editionLabel,
};
