/**
 * Engine model download size / speed formatting for the main settings UI.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubEngineDownloadFormat = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function engineDownloadFormatFactory() {
    function formatEngineDownloadBytes(n) {
        const v = Number(n);
        if (!Number.isFinite(v) || v < 0) return '';
        if (v < 1024) return `${Math.round(v)} B`;
        if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
        if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
        return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function formatEngineDownloadSpeed(bps) {
        const v = Number(bps);
        if (!Number.isFinite(v) || v <= 0) return '';
        if (v < 1024) return `${Math.round(v)} B/s`;
        if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB/s`;
        return `${(v / (1024 * 1024)).toFixed(1)} MB/s`;
    }

    function formatEngineDownloadSizeLine(info = {}) {
        const received = Number(info.downloadedBytes ?? info.received ?? info.transferred);
        const total = Number(info.totalBytes ?? info.totalSize);
        const speed = Number(info.bytesPerSecond ?? info.speed);
        const parts = [];
        const hasRecv = Number.isFinite(received) && received >= 0;
        const hasTotal = Number.isFinite(total) && total > 0;
        if (hasRecv && hasTotal) {
            parts.push(`${formatEngineDownloadBytes(received)} / ${formatEngineDownloadBytes(total)}`);
        } else if (hasRecv) {
            parts.push(`已下载 ${formatEngineDownloadBytes(received)}`);
        } else if (hasTotal) {
            parts.push(`总大小约 ${formatEngineDownloadBytes(total)}`);
        }
        const speedText = formatEngineDownloadSpeed(speed);
        if (speedText) parts.push(speedText);
        return parts.join(' · ');
    }

    return {
        formatEngineDownloadBytes,
        formatEngineDownloadSpeed,
        formatEngineDownloadSizeLine,
    };
}));
