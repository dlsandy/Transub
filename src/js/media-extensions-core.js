/**
 * Shared media (video + audio) extension / MIME allowlists.
 * Used by Electron dialogs, folder scan, media protocol, and the main renderer.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubMediaExtensions = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function mediaExtensionsFactory() {
    /** Video containers accepted by open/drag/folder scan. */
    const VIDEO_EXTENSIONS = Object.freeze([
        'mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'webm', 'm4v',
        'ts', 'm2ts', 'mpeg', 'mpg', 'rmvb', 'rm', '3gp',
    ]);

    /** Audio-only containers (aligned with transub-engine DEFAULT_MEDIA_EXTENSIONS). */
    const AUDIO_EXTENSIONS = Object.freeze([
        'mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'opus',
    ]);

    const MEDIA_EXTENSIONS = Object.freeze([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS]);

    const VIDEO_EXT_SET = new Set(VIDEO_EXTENSIONS);
    const AUDIO_EXT_SET = new Set(AUDIO_EXTENSIONS);
    const MEDIA_EXT_SET = new Set(MEDIA_EXTENSIONS);

    /** TWAI / folder-suffix default string (audio + common video). */
    const DEFAULT_AUDIO_SUFFIXES = MEDIA_EXTENSIONS.join(',');

    const VIDEO_MIME = Object.freeze({
        '.mp4': 'video/mp4',
        '.m4v': 'video/mp4',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv',
        '.ts': 'video/mp2t',
        '.m2ts': 'video/mp2t',
        '.mpeg': 'video/mpeg',
        '.mpg': 'video/mpeg',
        '.3gp': 'video/3gpp',
        '.rmvb': 'application/vnd.rn-realmedia-vbr',
        '.rm': 'application/vnd.rn-realmedia',
    });

    const AUDIO_MIME = Object.freeze({
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.flac': 'audio/flac',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.ogg': 'audio/ogg',
        '.wma': 'audio/x-ms-wma',
        '.opus': 'audio/opus',
    });

    const MEDIA_MIME = Object.freeze({ ...VIDEO_MIME, ...AUDIO_MIME });

    function normalizeExt(value) {
        let ext = String(value || '').trim().toLowerCase();
        if (!ext) return '';
        if (ext.includes('/') || ext.includes('\\')) {
            const base = ext.split(/[/\\]/).pop() || '';
            const dot = base.lastIndexOf('.');
            return dot >= 0 ? base.slice(dot + 1) : base;
        }
        if (ext.startsWith('.')) return ext.slice(1);
        const dot = ext.lastIndexOf('.');
        if (dot >= 0) return ext.slice(dot + 1);
        return ext;
    }

    function isVideoExt(value) {
        return VIDEO_EXT_SET.has(normalizeExt(value));
    }

    function isAudioExt(value) {
        return AUDIO_EXT_SET.has(normalizeExt(value));
    }

    function isMediaExt(value) {
        return MEDIA_EXT_SET.has(normalizeExt(value));
    }

    function getMediaMime(filePath) {
        const raw = String(filePath || '').trim().toLowerCase();
        let ext = '';
        if (raw.startsWith('.')) {
            ext = raw;
        } else {
            const base = raw.split(/[/\\]/).pop() || '';
            const dot = base.lastIndexOf('.');
            ext = dot >= 0 ? base.slice(dot) : '';
        }
        return MEDIA_MIME[ext] || 'application/octet-stream';
    }

    function isMediaMimeType(mime) {
        const m = String(mime || '').toLowerCase().trim();
        if (!m) return false;
        return m.startsWith('video/') || m.startsWith('audio/');
    }

    return {
        VIDEO_EXTENSIONS,
        AUDIO_EXTENSIONS,
        MEDIA_EXTENSIONS,
        DEFAULT_AUDIO_SUFFIXES,
        VIDEO_MIME,
        AUDIO_MIME,
        MEDIA_MIME,
        normalizeExt,
        isVideoExt,
        isAudioExt,
        isMediaExt,
        getMediaMime,
        isMediaMimeType,
    };
}));
