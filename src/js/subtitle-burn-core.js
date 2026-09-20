/**
 * Subtitle hardsub burn — pure helpers (browser + Node).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleBurnCore = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleBurnCoreFactory() {
    const SUB_EXTS = new Set(['.srt', '.vtt', '.ass', '.ssa', '.lrc']);
    const VIDEO_EXTS = new Set([
        '.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', '.ts', '.m2ts', '.wmv', '.flv',
    ]);
    const CONTAINERS = new Set(['mp4', 'mkv']);

    const RESOLUTION_PRESETS = Object.freeze([
        Object.freeze({ id: 'source', label: '跟随片源', height: 0 }),
        Object.freeze({ id: '1080p', label: '1080p', height: 1080 }),
        Object.freeze({ id: '720p', label: '720p', height: 720 }),
        Object.freeze({ id: '480p', label: '480p', height: 480 }),
    ]);

    const FPS_PRESETS = Object.freeze([
        Object.freeze({ id: 'source', label: '跟随片源', fps: 0 }),
        Object.freeze({ id: '23.976', label: '23.976', fps: 24000 / 1001 }),
        Object.freeze({ id: '24', label: '24', fps: 24 }),
        Object.freeze({ id: '25', label: '25', fps: 25 }),
        Object.freeze({ id: '30', label: '30', fps: 30 }),
        Object.freeze({ id: '60', label: '60', fps: 60 }),
    ]);

    /** Speed trade-off: maps to x264 preset / NVENC p-tier. */
    const ENCODE_SPEED_PRESETS = Object.freeze([
        Object.freeze({
            id: 'slow',
            label: '慢·更小',
            x264: 'slow',
            nvenc: 'p7',
        }),
        Object.freeze({
            id: 'medium',
            label: '均衡',
            x264: 'medium',
            nvenc: 'p4',
        }),
        Object.freeze({
            id: 'fast',
            label: '快·更大',
            x264: 'veryfast',
            nvenc: 'p1',
        }),
    ]);

    const SUBTITLE_TRACK_OPTIONS = Object.freeze([
        Object.freeze({ id: 'auto', label: '自动' }),
        Object.freeze({ id: 'dual', label: '双语' }),
        Object.freeze({ id: 'target', label: '译文' }),
        Object.freeze({ id: 'source', label: '原文' }),
    ]);

    const DEFAULT_OUTPUT_SUFFIX = 'burned';
    const WORKSPACE_STORAGE_KEY = 'transub-burn-workspace-v1';

    const OUTPUT_MODE_PRESETS = Object.freeze([
        Object.freeze({ id: 'hardsub', label: '硬字幕' }),
        Object.freeze({ id: 'softsub', label: '软字幕' }),
    ]);

    const AUDIO_MODE_PRESETS = Object.freeze([
        Object.freeze({ id: 'copy', label: '复制音轨' }),
        Object.freeze({ id: 'aac', label: 'AAC 192k' }),
    ]);

    const DEFAULT_BASIC_STYLE = Object.freeze({
        fontName: '',
        fontSize: 22,
        primaryColor: '#FFFFFF',
        outline: 2,
        marginV: 40,
        shadow: 0,
        shadowColor: '#000000',
        borderStyle: 1,
        outlineColor: '#000000',
        outlineAlpha: 100,
        bold: false,
        italic: false,
        marginL: 40,
        marginR: 40,
        alignment: 2,
        lineGap: 28,
        lineOrder: 'target-first',
        enableSource: false,
        source: null,
        target: null,
    });

    function getPresetsApi() {
        if (typeof globalThis !== 'undefined' && globalThis.TransubSubtitleBurnStylePresets) {
            return globalThis.TransubSubtitleBurnStylePresets;
        }
        try {
            // Node / tests — optional sibling module
            // eslint-disable-next-line global-require, import/no-dynamic-require
            return require('./subtitle-burn-style-presets-core');
        } catch (_) {
            return null;
        }
    }

    function extOf(filePath) {
        const s = String(filePath || '');
        const i = s.lastIndexOf('.');
        if (i < 0) return '';
        return s.slice(i).toLowerCase();
    }

    function baseName(filePath) {
        const s = String(filePath || '').replace(/\\/g, '/');
        const parts = s.split('/');
        return parts[parts.length - 1] || '';
    }

    function stemOf(filePath) {
        const name = baseName(filePath);
        const i = name.lastIndexOf('.');
        return i > 0 ? name.slice(0, i) : name;
    }

    function dirOf(filePath) {
        const s = String(filePath || '').replace(/\\/g, '/');
        const i = s.lastIndexOf('/');
        if (i < 0) return '';
        return String(filePath || '').slice(0, i);
    }

    function joinPath(dir, name) {
        const d = String(dir || '');
        const n = String(name || '');
        if (!d) return n;
        if (/[/\\]$/.test(d)) return d + n;
        const sep = d.includes('\\') && !d.includes('/') ? '\\' : '/';
        return d + sep + n;
    }

    function isSubtitlePath(filePath) {
        return SUB_EXTS.has(extOf(filePath));
    }

    function isVideoPath(filePath) {
        return VIDEO_EXTS.has(extOf(filePath));
    }

    function normalizeContainer(value, outputPath) {
        const fromOut = extOf(outputPath).replace('.', '');
        if (CONTAINERS.has(fromOut)) return fromOut;
        const raw = String(value || '').trim().toLowerCase();
        if (CONTAINERS.has(raw)) return raw;
        return 'mp4';
    }

    function clampInt(n, min, max, fallback) {
        const v = Math.round(Number(n));
        if (!Number.isFinite(v)) return fallback;
        return Math.min(max, Math.max(min, v));
    }

    function normalizeHexColor(raw, fallback = '#FFFFFF') {
        const s = String(raw || '').trim();
        const m = s.match(/^#?([0-9a-fA-F]{6})$/);
        if (!m) return fallback;
        return `#${m[1].toUpperCase()}`;
    }

    /**
     * ASS PrimaryColour &HAABBGGRR (AA=00 opaque by default).
     * @param {string} hex #RRGGBB
     * @param {number} [opacityPct=100] 0–100 fill opacity
     */
    function hexToAssColour(hex, opacityPct = 100) {
        const presets = getPresetsApi();
        if (presets?.hexToAssColour) return presets.hexToAssColour(hex, opacityPct);
        const h = normalizeHexColor(hex).slice(1);
        const rr = h.slice(0, 2);
        const gg = h.slice(2, 4);
        const bb = h.slice(4, 6);
        const op = clampInt(opacityPct, 0, 100, 100);
        const aa = (255 - Math.round((op / 100) * 255)).toString(16).padStart(2, '0').toUpperCase();
        return `&H${aa}${bb}${gg}${rr}`;
    }

    function normalizeBasicStyle(input) {
        const presets = getPresetsApi();
        if (presets?.toBasicStyle) {
            return presets.toBasicStyle(input);
        }
        const src = input && typeof input === 'object' ? input : {};
        return {
            fontName: String(src.fontName || '').trim().slice(0, 64),
            fontSize: clampInt(src.fontSize, 10, 96, DEFAULT_BASIC_STYLE.fontSize),
            primaryColor: normalizeHexColor(src.primaryColor, DEFAULT_BASIC_STYLE.primaryColor),
            outline: clampInt(src.outline, 0, 12, DEFAULT_BASIC_STYLE.outline),
            marginV: clampInt(src.marginV, 0, 400, DEFAULT_BASIC_STYLE.marginV),
            shadow: clampInt(src.shadow, 0, 12, DEFAULT_BASIC_STYLE.shadow),
            shadowColor: normalizeHexColor(src.shadowColor, DEFAULT_BASIC_STYLE.shadowColor),
            borderStyle: Number(src.borderStyle) === 3 ? 3 : 1,
            outlineColor: normalizeHexColor(src.outlineColor, DEFAULT_BASIC_STYLE.outlineColor),
            outlineAlpha: clampInt(src.outlineAlpha, 0, 100, DEFAULT_BASIC_STYLE.outlineAlpha),
            bold: src.bold === true || src.bold === -1 || src.bold === 1,
            italic: src.italic === true || src.italic === -1 || src.italic === 1,
            marginL: clampInt(src.marginL, 0, 400, DEFAULT_BASIC_STYLE.marginL),
            marginR: clampInt(src.marginR, 0, 400, DEFAULT_BASIC_STYLE.marginR),
            alignment: clampInt(src.alignment, 1, 9, DEFAULT_BASIC_STYLE.alignment),
            lineGap: clampInt(src.lineGap, 8, 200, DEFAULT_BASIC_STYLE.lineGap),
            lineOrder: String(src.lineOrder || 'target-first').toLowerCase() === 'source-first'
                ? 'source-first'
                : 'target-first',
            enableSource: src.enableSource === true,
            source: src.source && typeof src.source === 'object' ? src.source : null,
            target: src.target && typeof src.target === 'object' ? src.target : null,
        };
    }

    function buildForceStyle(styleInput) {
        const presets = getPresetsApi();
        if (presets?.buildForceStyle) {
            return presets.buildForceStyle(styleInput);
        }
        const style = normalizeBasicStyle(styleInput);
        const parts = [
            `FontSize=${style.fontSize}`,
            `PrimaryColour=${hexToAssColour(style.primaryColor)}`,
            `OutlineColour=${hexToAssColour(style.outlineColor, style.outlineAlpha)}`,
            `Outline=${style.outline}`,
            `Shadow=${style.shadow}`,
            `BorderStyle=${style.borderStyle}`,
            `Alignment=${style.alignment}`,
            `MarginL=${style.marginL}`,
            `MarginR=${style.marginR}`,
            `MarginV=${style.marginV}`,
        ];
        if (style.fontName) {
            parts.unshift(`FontName=${style.fontName}`);
        }
        return parts.join(',');
    }

    /**
     * Escape a filesystem path for ffmpeg subtitles=/ass= filter values.
     */
    function escapeFilterPath(filePath) {
        return String(filePath || '')
            .replace(/\\/g, '/')
            .replace(/:/g, '\\:')
            .replace(/'/g, "\\'")
            .replace(/\[/g, '\\[')
            .replace(/]/g, '\\]');
    }

    function normalizeResolutionId(raw) {
        const id = String(raw || 'source').trim().toLowerCase() || 'source';
        return RESOLUTION_PRESETS.some((p) => p.id === id) ? id : 'source';
    }

    function normalizeFpsId(raw) {
        const id = String(raw || 'source').trim() || 'source';
        return FPS_PRESETS.some((p) => p.id === id) ? id : 'source';
    }

    function normalizeEncodeSpeedId(raw) {
        const id = String(raw || 'medium').trim().toLowerCase() || 'medium';
        return ENCODE_SPEED_PRESETS.some((p) => p.id === id) ? id : 'medium';
    }

    function getEncodeSpeedPreset(id) {
        const want = normalizeEncodeSpeedId(id);
        return ENCODE_SPEED_PRESETS.find((p) => p.id === want) || ENCODE_SPEED_PRESETS[1];
    }

    function normalizeOutputSuffix(raw) {
        const cleaned = String(raw || DEFAULT_OUTPUT_SUFFIX)
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
            .replace(/\.+/g, '.')
            .replace(/^\.+|\.+$/g, '')
            .slice(0, 40);
        return cleaned || DEFAULT_OUTPUT_SUFFIX;
    }

    function normalizeOutputDir(raw) {
        return String(raw || '').trim();
    }

    function normalizeOutputMode(raw) {
        const id = String(raw || 'hardsub').trim().toLowerCase();
        return id === 'softsub' || id === 'soft' || id === 'mux' ? 'softsub' : 'hardsub';
    }

    function normalizeAudioMode(raw) {
        const id = String(raw || 'copy').trim().toLowerCase();
        return id === 'aac' || id === 'reencode' || id === 'encode' ? 'aac' : 'copy';
    }

    function normalizeSubtitleTrack(raw) {
        const id = String(raw || 'auto').trim().toLowerCase() || 'auto';
        return SUBTITLE_TRACK_OPTIONS.some((p) => p.id === id) ? id : 'auto';
    }

    function getResolutionPreset(id) {
        const want = normalizeResolutionId(id);
        return RESOLUTION_PRESETS.find((p) => p.id === want) || RESOLUTION_PRESETS[0];
    }

    function getFpsPreset(id) {
        const want = normalizeFpsId(id);
        return FPS_PRESETS.find((p) => p.id === want) || FPS_PRESETS[0];
    }

    /**
     * Pre-subtitle geometry filters (scale / fps). Empty when following source.
     */
    function buildGeometryFilterParts(opts = {}) {
        const parts = [];
        const res = getResolutionPreset(opts.resolutionId || opts.resolution);
        if (res.height > 0) {
            // Shrink-only: never upscale above source height.
            parts.push(`scale=-2:min(ih\\,${res.height})`);
        }
        const fps = getFpsPreset(opts.fpsId || opts.fps);
        if (fps.fps > 0) {
            const rate = Number.isInteger(fps.fps) ? String(fps.fps) : fps.fps.toFixed(3);
            parts.push(`fps=${rate}`);
        }
        return parts;
    }

    /**
     * @param {{ subtitlePath: string, styleMode?: string, basicStyle?: object, resolutionId?: string, fpsId?: string }} opts
     * @returns {{ ok: true, filter: string, styleMode: string } | { ok: false, error: string }}
     */
    function buildBurnVideoFilter(opts = {}) {
        const subPath = String(opts.subtitlePath || '').trim();
        if (!subPath) return { ok: false, error: '缺少字幕路径' };
        if (!isSubtitlePath(subPath)) return { ok: false, error: '不支持的字幕格式' };

        const styleMode = String(opts.styleMode || 'basic').trim().toLowerCase() === 'document'
            ? 'document'
            : 'basic';
        const escaped = escapeFilterPath(subPath);
        const isAss = /\.(ass|ssa)$/i.test(subPath);
        const geo = buildGeometryFilterParts(opts);

        let burnFilter;
        if (styleMode === 'document' && isAss) {
            burnFilter = `ass='${escaped}'`;
        } else {
            const force = buildForceStyle(opts.basicStyle);
            // Prefer subtitles= so SRT/VTT work; ASS also accepted with force_style.
            burnFilter = `subtitles='${escaped}':force_style='${force}'`;
        }
        const filter = geo.length ? `${geo.join(',')},${burnFilter}` : burnFilter;
        return {
            ok: true,
            filter,
            styleMode: styleMode === 'document' && isAss ? 'document' : 'basic',
            resolutionId: normalizeResolutionId(opts.resolutionId || opts.resolution),
            fpsId: normalizeFpsId(opts.fpsId || opts.fps),
        };
    }

    function defaultOutputPath(videoPath, container = 'mp4', opts = {}) {
        const stem = stemOf(videoPath) || 'output';
        const cont = normalizeContainer(container);
        const suffix = normalizeOutputSuffix(opts.suffix != null ? opts.suffix : opts.outputSuffix);
        const outDir = normalizeOutputDir(opts.outputDir);
        const dir = outDir || dirOf(videoPath);
        return joinPath(dir, `${stem}.${suffix}.${cont}`);
    }

    /**
     * @returns {{ ok: true, job: object } | { ok: false, error: string }}
     */
    function validateBurnPair(input = {}) {
        const videoPath = String(input.videoPath || '').trim();
        const subtitlePath = String(input.subtitlePath || '').trim();
        if (!videoPath) return { ok: false, error: '请选择视频文件' };
        if (!subtitlePath) return { ok: false, error: '请选择字幕文件' };
        if (!isVideoPath(videoPath)) return { ok: false, error: '不支持的视频格式' };
        if (!isSubtitlePath(subtitlePath)) return { ok: false, error: '不支持的字幕格式（请使用 SRT / VTT / ASS）' };

        const container = normalizeContainer(input.container, input.outputPath);
        const outputSuffix = normalizeOutputSuffix(input.outputSuffix || input.suffix);
        const outputDir = normalizeOutputDir(input.outputDir);
        let outputPath = String(input.outputPath || '').trim();
        if (!outputPath) {
            outputPath = defaultOutputPath(videoPath, container, {
                suffix: outputSuffix,
                outputDir,
            });
        }
        const outExt = extOf(outputPath).replace('.', '');
        if (outExt && !CONTAINERS.has(outExt)) {
            return { ok: false, error: '输出仅支持 MP4 或 MKV' };
        }
        if (!outExt) {
            outputPath = `${outputPath}.${container}`;
        }

        const styleMode = String(input.styleMode || 'basic').trim().toLowerCase() === 'document'
            ? 'document'
            : 'basic';
        const outputMode = normalizeOutputMode(input.outputMode);
        const audioMode = normalizeAudioMode(input.audioMode);
        if (styleMode === 'document' && outputMode === 'hardsub' && !/\.(ass|ssa)$/i.test(subtitlePath)) {
            return { ok: false, error: '文档样式烧录需要 ASS / SSA 字幕' };
        }
        if (outputMode === 'softsub' && container === 'mp4' && /\.(ass|ssa)$/i.test(subtitlePath)) {
            return { ok: false, error: 'MP4 软字幕请使用 SRT / VTT，或改用 MKV 容器' };
        }

        const basicStyle = normalizeBasicStyle(input.basicStyle);
        const crf = clampInt(input.crf, 14, 28, 18);
        const resolutionId = normalizeResolutionId(input.resolutionId || input.resolution);
        const fpsId = normalizeFpsId(input.fpsId || input.fps);
        const encodeSpeedId = normalizeEncodeSpeedId(input.encodeSpeedId || input.encodeSpeed);

        let videoFilter = '';
        let resolvedStyleMode = styleMode;
        if (outputMode === 'hardsub') {
            const filterRes = buildBurnVideoFilter({
                subtitlePath,
                styleMode,
                basicStyle,
                resolutionId,
                fpsId,
            });
            if (!filterRes.ok) return filterRes;
            videoFilter = filterRes.filter;
            resolvedStyleMode = filterRes.styleMode;
        }

        return {
            ok: true,
            job: {
                videoPath,
                subtitlePath,
                outputPath,
                container: normalizeContainer(container, outputPath),
                styleMode: resolvedStyleMode,
                outputMode,
                audioMode,
                basicStyle,
                crf,
                resolutionId,
                fpsId,
                encodeSpeedId,
                outputSuffix,
                outputDir,
                videoFilter,
            },
        };
    }

    /**
     * Parse ffmpeg `-progress` / stderr time= into seconds.
     */
    function parseFfmpegTimeToSec(chunk) {
        const text = String(chunk || '');
        let best = null;
        const re = /(?:out_time_ms=(\d+)|out_time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)|time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?))/g;
        let m;
        while ((m = re.exec(text))) {
            if (m[1] != null) {
                best = Number(m[1]) / 1e6;
                continue;
            }
            const hh = Number(m[2] != null ? m[2] : m[5]);
            const mm = Number(m[3] != null ? m[3] : m[6]);
            const ss = Number(m[4] != null ? m[4] : m[7]);
            if (Number.isFinite(hh) && Number.isFinite(mm) && Number.isFinite(ss)) {
                best = hh * 3600 + mm * 60 + ss;
            }
        }
        return best;
    }

    function progressPercent(currentSec, durationSec) {
        const cur = Number(currentSec);
        const dur = Number(durationSec);
        if (!Number.isFinite(cur) || !Number.isFinite(dur) || dur <= 0) return 0;
        return Math.min(99, Math.max(0, Math.round((cur / dur) * 100)));
    }

    /**
     * Classify a sidecar basename relative to the video stem.
     * @returns {'dual'|'target'|'source'|'unknown'}
     */
    function classifyBurnSidecarRole(filePath, videoStem) {
        const base = stemOf(filePath).toLowerCase();
        const stem = String(videoStem || stemOf(filePath) || '').toLowerCase();
        if (!base) return 'unknown';
        if (/\.dual$/i.test(base) || /\.bilingual$/i.test(base) || base === `${stem}.dual` || base === `${stem}.bilingual`) {
            return 'dual';
        }
        let tag = '';
        if (stem && base.startsWith(`${stem}.`)) {
            tag = base.slice(stem.length + 1);
        } else {
            const parts = base.split('.');
            tag = parts.length >= 2 ? parts[parts.length - 1] : '';
        }
        const t = String(tag || '').toLowerCase();
        if (!t) return 'unknown';
        if (t === 'dual' || t === 'bilingual' || t === 'bi') return 'dual';
        if (/^(zh|zh-cn|zh-hans|zh-tw|zh-hant|chs|cht|cn|chi|zho|target|cmn)$/.test(t)) return 'target';
        if (/^(ja|jp|jpn|en|eng|source|orig|original|ko|kor|ru|fr|de)$/.test(t)) return 'source';
        return 'unknown';
    }

    /**
     * Pick target / dual / source paths from a sidecar list next to a video.
     */
    function pickBurnTracksFromSidecars(videoPath, sidecars) {
        const stem = stemOf(videoPath);
        const list = Array.isArray(sidecars) ? sidecars : [];
        const paths = list
            .map((s) => String(s?.path || s || '').trim())
            .filter((p) => p && isSubtitlePath(p));
        let bilingualSubtitlePath = '';
        let subtitlePath = '';
        let sourceSubtitlePath = '';
        for (const p of paths) {
            const role = classifyBurnSidecarRole(p, stem);
            if (role === 'dual' && !bilingualSubtitlePath) bilingualSubtitlePath = p;
            else if (role === 'target' && !subtitlePath) subtitlePath = p;
            else if (role === 'source' && !sourceSubtitlePath) sourceSubtitlePath = p;
        }
        // Unclassified fallback: first editable as target if none tagged.
        if (!subtitlePath && !bilingualSubtitlePath) {
            const first = paths.find((p) => classifyBurnSidecarRole(p, stem) === 'unknown') || paths[0] || '';
            if (first) subtitlePath = first;
        }
        return {
            subtitlePath,
            bilingualSubtitlePath,
            sourceSubtitlePath,
        };
    }

    /**
     * Prefer dual ASS / bilingual path when available (document burn or explicit track).
     */
    function preferBurnSubtitlePath(input = {}) {
        const dual = String(input.bilingualSubtitlePath || input.dualSubtitlePath || '').trim();
        const target = String(input.subtitlePath || input.targetSubtitlePath || '').trim();
        const source = String(input.sourceSubtitlePath || '').trim();
        const track = normalizeSubtitleTrack(input.subtitleTrack);
        const preferDual = input.preferDual === true
            || String(input.styleMode || '').toLowerCase() === 'document'
            || (input.basicStyle && input.basicStyle.enableSource === true && track === 'auto');

        if (track === 'dual') {
            if (dual && isSubtitlePath(dual)) return dual;
            return dual || target || source || '';
        }
        if (track === 'source') {
            if (source && isSubtitlePath(source)) return source;
            return source || target || dual || '';
        }
        if (track === 'target') {
            if (target && isSubtitlePath(target)) return target;
            return target || dual || source || '';
        }
        // auto
        if (preferDual && dual && isSubtitlePath(dual)) return dual;
        if (target && isSubtitlePath(target)) return target;
        if (dual && isSubtitlePath(dual)) return dual;
        if (source && isSubtitlePath(source)) return source;
        return target || dual || source || '';
    }

    const ENCODER_SOFT = 'libx264';
    const ENCODER_PRESETS = Object.freeze([
        Object.freeze({
            id: 'libx264',
            label: '软件 x264',
            videoCodec: 'libx264',
            pro: false,
        }),
        Object.freeze({
            id: 'h264_nvenc',
            label: 'NVIDIA NVENC',
            videoCodec: 'h264_nvenc',
            pro: true,
        }),
        Object.freeze({
            id: 'h264_qsv',
            label: 'Intel QSV',
            videoCodec: 'h264_qsv',
            pro: true,
        }),
        Object.freeze({
            id: 'h264_amf',
            label: 'AMD AMF',
            videoCodec: 'h264_amf',
            pro: true,
        }),
    ]);

    function normalizeEncoderId(raw, { allowPro = true } = {}) {
        const id = String(raw || '').trim().toLowerCase() || ENCODER_SOFT;
        const preset = ENCODER_PRESETS.find((p) => p.id === id);
        if (!preset) return ENCODER_SOFT;
        if (preset.pro && !allowPro) return ENCODER_SOFT;
        return preset.id;
    }

    function getEncoderPreset(id) {
        return ENCODER_PRESETS.find((p) => p.id === id) || ENCODER_PRESETS[0];
    }

    /**
     * Parse `ffmpeg -encoders` stdout for available H.264 encoders we care about.
     */
    function parseAvailableEncoders(ffmpegEncodersText) {
        const text = String(ffmpegEncodersText || '');
        const available = new Set();
        for (const preset of ENCODER_PRESETS) {
            // Lines look like: " V..... h264_nvenc           NVIDIA NVENC H.264 encoder"
            const re = new RegExp(`\\b${preset.videoCodec}\\b`);
            if (re.test(text)) available.add(preset.id);
        }
        if (!available.has(ENCODER_SOFT)) available.add(ENCODER_SOFT);
        return ENCODER_PRESETS
            .filter((p) => available.has(p.id))
            .map((p) => ({ ...p, available: true }));
    }

    function appendVideoEncodeArgs(args, job) {
        const encoderId = normalizeEncoderId(job.encoderId, { allowPro: true });
        const crf = clampInt(job.crf, 14, 28, 18);
        const speed = getEncodeSpeedPreset(job.encodeSpeedId || job.encodeSpeed);
        if (encoderId === 'h264_nvenc') {
            args.push('-c:v', 'h264_nvenc', '-preset', speed.nvenc, '-rc', 'vbr', '-cq', String(crf), '-b:v', '0');
            return;
        }
        if (encoderId === 'h264_qsv') {
            args.push('-c:v', 'h264_qsv', '-global_quality', String(crf + 5));
            return;
        }
        if (encoderId === 'h264_amf') {
            args.push('-c:v', 'h264_amf', '-rc', 'cqp', '-qp_i', String(crf), '-qp_p', String(crf));
            return;
        }
        args.push('-c:v', 'libx264', '-preset', speed.x264, '-crf', String(crf));
    }

    function appendAudioEncodeArgs(args, job) {
        if (normalizeAudioMode(job.audioMode) === 'aac') {
            args.push('-c:a', 'aac', '-b:a', '192k');
            return;
        }
        args.push('-c:a', 'copy');
    }

    function softsubSubtitleCodec(container, subtitlePath) {
        const cont = normalizeContainer(container);
        if (cont === 'mp4') return 'mov_text';
        // MKV: keep native stream type (srt/ass/ssa/vtt).
        if (/\.(ass|ssa)$/i.test(subtitlePath)) return 'ass';
        if (/\.vtt$/i.test(subtitlePath)) return 'webvtt';
        return 'srt';
    }

    /**
     * Softsub mux — copy video by default; optional AAC; no burn filter.
     */
    function buildFfmpegSoftsubArgs(job) {
        const j = job && typeof job === 'object' ? job : {};
        const videoPath = String(j.videoPath || '');
        const subtitlePath = String(j.subtitlePath || '');
        const outputPath = String(j.outputPath || '');
        const container = normalizeContainer(j.container, outputPath);
        const subCodec = softsubSubtitleCodec(container, subtitlePath);
        const args = [
            '-hide_banner',
            '-y',
            '-i', videoPath,
            '-i', subtitlePath,
            '-map', '0:v:0?',
            '-map', '0:a?',
            '-map', '1:0',
            '-c:v', 'copy',
        ];
        appendAudioEncodeArgs(args, j);
        args.push('-c:s', subCodec, '-map_metadata', '0');
        if (container === 'mp4') {
            args.push('-movflags', '+faststart');
        }
        args.push('-progress', 'pipe:1', '-nostats', outputPath);
        return args;
    }

    /**
     * Build argv for ffmpeg hardsub (no exe). Pure — safe to unit test.
     */
    function buildFfmpegHardsubArgs(job) {
        const j = job && typeof job === 'object' ? job : {};
        const videoPath = String(j.videoPath || '');
        const outputPath = String(j.outputPath || '');
        const vf = String(j.videoFilter || '');
        const container = normalizeContainer(j.container, outputPath);
        const args = [
            '-hide_banner',
            '-y',
            '-i', videoPath,
            '-vf', vf,
        ];
        appendVideoEncodeArgs(args, j);
        // Compatible pixel format for broad player support (esp. MP4/HW encode).
        args.push('-pix_fmt', 'yuv420p');
        appendAudioEncodeArgs(args, j);
        args.push('-map_metadata', '0');
        if (container === 'mp4') {
            args.push('-movflags', '+faststart');
        }
        args.push('-progress', 'pipe:1', '-nostats', outputPath);
        return args;
    }

    /**
     * Build argv for a short Chromium-playable hardsub preview clip.
     * Always libx264 + aac + yuv420p so Electron can paint even when the
     * source is HEVC/HDR-incompatible. Same -vf as real hardsub.
     */
    function buildFfmpegHardsubPreviewArgs(job) {
        const j = job && typeof job === 'object' ? job : {};
        const videoPath = String(j.videoPath || '');
        const outputPath = String(j.outputPath || '');
        const vf = String(j.videoFilter || '');
        const startSec = Math.max(0, Number(j.previewStartSec) || 0);
        const durationSec = Math.min(180, Math.max(8, Number(j.previewDurationSec) || 45));
        const maxHeight = Math.max(360, Math.min(1080, Math.round(Number(j.previewMaxHeight) || 720)));
        let vfOut = vf;
        if (vfOut && !/(^|,)scale=/i.test(vfOut)) {
            vfOut = `scale=-2:'min(ih\\,${maxHeight})',${vfOut}`;
        } else if (!vfOut) {
            vfOut = `scale=-2:'min(ih\\,${maxHeight})'`;
        }
        const args = [
            '-hide_banner',
            '-y',
            '-i', videoPath,
        ];
        if (startSec > 0) {
            args.push('-ss', startSec.toFixed(3));
        }
        args.push(
            '-t', String(durationSec),
            '-vf', vfOut,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ac', '2',
            '-movflags', '+faststart',
            '-progress', 'pipe:1',
            '-nostats',
            outputPath,
        );
        return args;
    }

    function buildFfmpegBurnArgs(job) {
        if (normalizeOutputMode(job?.outputMode) === 'softsub') {
            return buildFfmpegSoftsubArgs(job);
        }
        return buildFfmpegHardsubArgs(job);
    }

    function makeBatchItemId() {
        return `burn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function isItemAssociated(item = {}) {
        const videoPath = String(item?.videoPath || '').trim();
        const effectiveSub = preferBurnSubtitlePath(item)
            || String(item?.subtitlePath || '').trim()
            || String(item?.bilingualSubtitlePath || '').trim()
            || String(item?.sourceSubtitlePath || '').trim();
        return !!(videoPath && effectiveSub && isVideoPath(videoPath) && isSubtitlePath(effectiveSub));
    }

    /**
     * Draft queue row — video and/or subtitle may be missing until associated in the list UI.
     * @returns {{ ok: true, item: object } | { ok: false, error: string }}
     */
    function createDraftBatchItem(input = {}, shared = {}) {
        const videoPath = String(input.videoPath || shared.videoPath || '').trim();
        let subtitlePath = String(input.subtitlePath || input.targetSubtitlePath || shared.subtitlePath || '').trim();
        const bilingualSubtitlePath = String(
            input.bilingualSubtitlePath || input.dualSubtitlePath || shared.bilingualSubtitlePath || '',
        ).trim();
        const sourceSubtitlePath = String(
            input.sourceSubtitlePath || shared.sourceSubtitlePath || '',
        ).trim();
        const subtitleTrack = normalizeSubtitleTrack(input.subtitleTrack || shared.subtitleTrack);
        if (!subtitlePath && !bilingualSubtitlePath && !sourceSubtitlePath) {
            subtitlePath = preferBurnSubtitlePath({ ...shared, ...input });
        }

        if (!videoPath && !subtitlePath && !bilingualSubtitlePath && !sourceSubtitlePath) {
            return { ok: false, error: '请至少选择视频或字幕' };
        }
        if (videoPath && !isVideoPath(videoPath)) {
            return { ok: false, error: '不支持的视频格式' };
        }
        const anySub = subtitlePath || bilingualSubtitlePath || sourceSubtitlePath;
        if (anySub && !isSubtitlePath(anySub)) {
            return { ok: false, error: '不支持的字幕格式（请使用 SRT / VTT / ASS）' };
        }
        if (subtitlePath && !isSubtitlePath(subtitlePath)) {
            return { ok: false, error: '不支持的字幕格式（请使用 SRT / VTT / ASS）' };
        }

        const container = normalizeContainer(input.container || shared.container, input.outputPath);
        const outputSuffix = normalizeOutputSuffix(
            input.outputSuffix != null ? input.outputSuffix : shared.outputSuffix,
        );
        const outputDir = normalizeOutputDir(
            input.outputDir != null ? input.outputDir : shared.outputDir,
        );
        let outputPath = String(input.outputPath || '').trim();
        if (!outputPath && videoPath) {
            outputPath = defaultOutputPath(videoPath, container, {
                suffix: outputSuffix,
                outputDir,
            });
        }
        const styleMode = String(input.styleMode || shared.styleMode || 'basic').trim().toLowerCase() === 'document'
            ? 'document'
            : 'basic';
        const basicStyle = normalizeBasicStyle(input.basicStyle || shared.basicStyle);
        const crf = clampInt(input.crf != null ? input.crf : shared.crf, 14, 28, 18);
        const encoderId = normalizeEncoderId(input.encoderId || shared.encoderId, { allowPro: true });
        const resolutionId = normalizeResolutionId(input.resolutionId || shared.resolutionId);
        const fpsId = normalizeFpsId(input.fpsId || shared.fpsId);
        const encodeSpeedId = normalizeEncodeSpeedId(input.encodeSpeedId || shared.encodeSpeedId);
        const outputMode = normalizeOutputMode(input.outputMode || shared.outputMode);
        const audioMode = normalizeAudioMode(input.audioMode || shared.audioMode);

        return {
            ok: true,
            item: {
                id: String(input.id || makeBatchItemId()),
                status: 'pending',
                error: '',
                percent: 0,
                outputPath,
                videoPath,
                subtitlePath,
                bilingualSubtitlePath,
                sourceSubtitlePath,
                subtitleTrack,
                container,
                styleMode,
                outputMode,
                audioMode,
                basicStyle,
                crf,
                resolutionId,
                fpsId,
                encodeSpeedId,
                outputSuffix,
                outputDir,
                encoderId,
                videoFilter: '',
            },
        };
    }

    /**
     * Fully validated batch item (both paths required). Prefer createDraftBatchItem for UI drafts.
     * @returns {{ ok: true, item: object } | { ok: false, error: string }}
     */
    function createBatchItem(input = {}, shared = {}) {
        const merged = {
            ...shared,
            ...input,
            videoPath: String(input.videoPath || shared.videoPath || '').trim(),
            outputPath: String(input.outputPath || '').trim(),
            bilingualSubtitlePath: String(
                input.bilingualSubtitlePath || input.dualSubtitlePath || shared.bilingualSubtitlePath || '',
            ).trim(),
            sourceSubtitlePath: String(input.sourceSubtitlePath || shared.sourceSubtitlePath || '').trim(),
            subtitleTrack: normalizeSubtitleTrack(input.subtitleTrack || shared.subtitleTrack),
        };
        merged.subtitlePath = preferBurnSubtitlePath(merged)
            || String(input.subtitlePath || shared.subtitlePath || '').trim();
        if (!merged.outputPath && merged.videoPath) {
            merged.outputPath = defaultOutputPath(merged.videoPath, merged.container || shared.container, {
                suffix: merged.outputSuffix || shared.outputSuffix,
                outputDir: merged.outputDir || shared.outputDir,
            });
        }
        const validated = validateBurnPair(merged);
        if (!validated.ok) return validated;
        return {
            ok: true,
            item: {
                id: String(input.id || makeBatchItemId()),
                status: 'pending',
                error: '',
                percent: 0,
                outputPath: validated.job.outputPath,
                videoPath: validated.job.videoPath,
                subtitlePath: String(input.subtitlePath || shared.subtitlePath || validated.job.subtitlePath).trim(),
                bilingualSubtitlePath: String(input.bilingualSubtitlePath || shared.bilingualSubtitlePath || '').trim(),
                sourceSubtitlePath: String(input.sourceSubtitlePath || shared.sourceSubtitlePath || '').trim(),
                subtitleTrack: normalizeSubtitleTrack(input.subtitleTrack || shared.subtitleTrack),
                container: validated.job.container,
                styleMode: validated.job.styleMode,
                outputMode: validated.job.outputMode,
                audioMode: validated.job.audioMode,
                basicStyle: validated.job.basicStyle,
                crf: validated.job.crf,
                resolutionId: validated.job.resolutionId,
                fpsId: validated.job.fpsId,
                encodeSpeedId: validated.job.encodeSpeedId,
                outputSuffix: validated.job.outputSuffix,
                outputDir: validated.job.outputDir,
                encoderId: normalizeEncoderId(merged.encoderId || shared.encoderId, { allowPro: true }),
                videoFilter: validated.job.videoFilter,
            },
        };
    }

    function createBatchFromPairs(pairs, shared = {}) {
        const items = [];
        const errors = [];
        const list = Array.isArray(pairs) ? pairs : [];
        for (const pair of list) {
            const res = createDraftBatchItem(pair, shared);
            if (!res.ok) {
                errors.push(res.error || '无效项');
                continue;
            }
            items.push(res.item);
        }
        return { ok: items.length > 0, items, errors };
    }

    function batchSummary(items) {
        const list = Array.isArray(items) ? items : [];
        const counts = {
            total: list.length,
            pending: 0,
            running: 0,
            done: 0,
            failed: 0,
            cancelled: 0,
        };
        for (const it of list) {
            const s = String(it?.status || 'pending');
            if (counts[s] != null) counts[s] += 1;
            else counts.pending += 1;
        }
        return counts;
    }

    function nextPendingIndex(items) {
        const list = Array.isArray(items) ? items : [];
        return list.findIndex((it) => it && it.status === 'pending');
    }

    function resetFailedToPending(items) {
        const list = Array.isArray(items) ? items : [];
        return list.map((it) => {
            if (!it || (it.status !== 'failed' && it.status !== 'cancelled')) return it;
            return { ...it, status: 'pending', error: '', percent: 0 };
        });
    }

    function msToAssTime(ms) {
        const n = Math.max(0, Math.round(Number(ms) || 0));
        const h = Math.floor(n / 3600000);
        const m = Math.floor((n % 3600000) / 60000);
        const s = Math.floor((n % 60000) / 1000);
        const cs = Math.floor((n % 1000) / 10);
        const pad = (v, w = 2) => String(v).padStart(w, '0');
        return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
    }

    /**
     * Build a minimal ASS document for JASSUB preview from cues or raw ASS text.
     */
    /**
     * Lightweight SRT/VTT cue parse for preview when IPC cues are missing.
     */
    function parsePreviewCuesFromText(raw, formatHint) {
        const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!text.trim()) return [];
        const fmt = String(formatHint || '').toLowerCase();
        const body = fmt === 'vtt' || /^WEBVTT/i.test(text)
            ? text.replace(/^WEBVTT[^\n]*\n+/i, '')
            : text;
        const blocks = body.split(/\n{2,}/);
        const cues = [];
        const timeRe = /^(.+?)\s*-->\s*(.+?)(?:\s+.*)?$/;
        const parseTime = (rawT) => {
            const s = String(rawT || '').trim().replace(',', '.');
            const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
            if (!m) return null;
            const h = Number(m[1] || 0);
            const mi = Number(m[2] || 0);
            const sec = Number(m[3] || 0);
            const frac = String(m[4] || '0').padEnd(3, '0').slice(0, 3);
            return ((h * 3600) + (mi * 60) + sec) * 1000 + Number(frac);
        };
        for (const block of blocks) {
            const lines = block.split('\n').map((l) => l.trimEnd()).filter((l, i, arr) => !(i === arr.length - 1 && !l));
            if (!lines.length) continue;
            let i = 0;
            if (/^\d+$/.test(lines[0].trim())) i = 1;
            const timing = lines[i];
            if (!timing) continue;
            const arrow = timing.match(timeRe);
            if (!arrow) continue;
            const startMs = parseTime(arrow[1]);
            const endMs = parseTime(arrow[2]);
            if (startMs == null || endMs == null) continue;
            const cueText = lines.slice(i + 1).join('\n').trim();
            if (!cueText) continue;
            cues.push({ startMs, endMs, text: cueText });
            if (cues.length >= 400) break;
        }
        return cues;
    }

    function styleFieldsToAssLine(name, fields) {
        const f = fields || {};
        return [
            'Style: ',
            name, ',',
            f.fontname || 'Arial', ',',
            f.fontsize != null ? f.fontsize : 44, ',',
            f.primaryColour || '&H00FFFFFF', ',',
            '&H000000FF', ',',
            f.outlineColour || '&H00000000', ',',
            f.backColour || '&H80000000', ',',
            f.bold || 0, ',',
            f.italic || 0, ',',
            '0,0,100,100,0,0,',
            f.borderStyle != null ? f.borderStyle : 1, ',',
            f.outline != null ? f.outline : 2, ',',
            f.shadow != null ? f.shadow : 0, ',',
            f.alignment != null ? f.alignment : 2, ',',
            f.marginL != null ? f.marginL : 40, ',',
            f.marginR != null ? f.marginR : 40, ',',
            f.marginV != null ? f.marginV : 40, ',',
            '1',
        ].join('');
    }

    function buildPreviewAssContent(opts = {}) {
        const format = String(opts.format || '').toLowerCase();
        const raw = String(opts.text || '');
        const styleMode = String(opts.styleMode || '').toLowerCase();
        const style = normalizeBasicStyle(opts.basicStyle);
        const playResX = Math.max(320, Math.round(Number(opts.playResX) || 1920));
        const playResY = Math.max(240, Math.round(Number(opts.playResY) || 1080));
        const dual = style.enableSource === true;

        // Document mode: keep file ASS as-is (libass / ffmpeg ass= path).
        if ((format === 'ass' || format === 'ssa')
            && /\[Script Info\]/i.test(raw)
            && styleMode === 'document') {
            return raw;
        }

        // Dual hardsub: rewrite Default/ZH/Source like ffmpeg-burn ass= path (*2 PlayRes fonts).
        if (dual && (format === 'ass' || format === 'ssa') && /\[Script Info\]/i.test(raw)) {
            const rewritten = maybeRewriteAssForBurnStyle(raw, style);
            if (rewritten?.ok && rewritten.text) return rewritten.text;
        }

        const presets = getPresetsApi();
        const margins = presets?.dualMargins
            ? presets.dualMargins(style)
            : { targetMarginV: style.marginV, sourceMarginV: style.marginV };

        // Dual ASS burn uses lineToAssStyleFields (*2). Single-track hardsub uses
        // force_style FontSize = UI size against the video frame — keep that here.
        const fieldsFromLine = (line, role, marginV) => {
            const base = {
                role,
                alignment: style.alignment,
                marginL: style.marginL,
                marginR: style.marginR,
                marginV,
            };
            if (dual && presets?.lineToAssStyleFields) {
                return presets.lineToAssStyleFields(line || style, base);
            }
            const l = line && typeof line === 'object' ? line : style;
            return {
                fontname: String(l.fontName || style.fontName || 'Microsoft YaHei').trim() || 'Microsoft YaHei',
                fontsize: Math.round(Number(l.fontSize != null ? l.fontSize : style.fontSize) || 22),
                primaryColour: hexToAssColour(l.primaryColor || style.primaryColor),
                outlineColour: hexToAssColour(
                    l.outlineColor || style.outlineColor || '#000000',
                    l.outlineAlpha != null ? l.outlineAlpha : style.outlineAlpha,
                ),
                backColour: hexToAssColour(l.shadowColor || style.shadowColor || '#000000', 50),
                bold: (l.bold === true || l.bold === -1 || l.bold === 1) ? -1 : 0,
                italic: (l.italic === true || l.italic === -1 || l.italic === 1) ? -1 : 0,
                borderStyle: Number(l.borderStyle) === 3 || style.borderStyle === 3 ? 3 : 1,
                outline: Number(l.outline != null ? l.outline : style.outline) || 0,
                shadow: Number(l.shadow != null ? l.shadow : style.shadow) || 0,
                alignment: style.alignment != null ? style.alignment : 2,
                marginL: style.marginL != null ? style.marginL : 40,
                marginR: style.marginR != null ? style.marginR : 40,
                marginV,
            };
        };

        const targetFields = fieldsFromLine(
            style.target || style,
            'target',
            dual ? margins.targetMarginV : style.marginV,
        );
        const sourceFields = fieldsFromLine(
            style.source || style,
            'source',
            margins.sourceMarginV,
        );

        const styleLines = [styleFieldsToAssLine('Default', targetFields)];
        if (dual) {
            styleLines.push(styleFieldsToAssLine('ZH', targetFields));
            styleLines.push(styleFieldsToAssLine('Source', sourceFields));
        }

        const header = [
            '[Script Info]',
            'ScriptType: v4.00+',
            `PlayResX: ${playResX}`,
            `PlayResY: ${playResY}`,
            'WrapStyle: 0',
            'ScaledBorderAndShadow: yes',
            '',
            '[V4+ Styles]',
            'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
            ...styleLines,
            '',
            '[Events]',
            'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        ];

        let cues = Array.isArray(opts.cues) ? opts.cues : [];
        if (!cues.length && raw.trim()) {
            cues = parsePreviewCuesFromText(raw, format);
        }

        const sanitizeDialogueText = (t) => String(t || '')
            .replace(/\r?\n/g, '\\N')
            .replace(/,/g, '，');

        const lines = [];
        for (const cue of cues.slice(0, 400)) {
            const start = msToAssTime(cue.startMs ?? cue.start);
            const end = msToAssTime(cue.endMs ?? cue.end);
            const rawText = String(cue.text || cue.target || cue.source || '').trim();
            if (!rawText) continue;
            if (dual) {
                const parts = rawText.split(/\n|\\N/i).map((s) => s.trim()).filter(Boolean);
                if (parts.length >= 2) {
                    const sourceFirst = style.lineOrder === 'source-first';
                    const sourceText = sourceFirst ? parts[0] : parts.slice(1).join('\\N');
                    const targetText = sourceFirst ? parts.slice(1).join('\\N') : parts[0];
                    lines.push(`Dialogue: 0,${start},${end},Source,,0,0,0,,${sanitizeDialogueText(sourceText)}`);
                    lines.push(`Dialogue: 1,${start},${end},ZH,,0,0,0,,${sanitizeDialogueText(targetText)}`);
                    continue;
                }
                lines.push(`Dialogue: 0,${start},${end},ZH,,0,0,0,,${sanitizeDialogueText(rawText)}`);
                continue;
            }
            lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${sanitizeDialogueText(rawText)}`);
        }
        return `${header.join('\n')}\n${lines.join('\n')}\n`;
    }

    /**
     * When Pro dual style is active and subtitle is ASS, rewrite ZH/Source/Default
     * then burn via ass= (preserves bilingual styling). Pure — returns text only.
     */
    function maybeRewriteAssForBurnStyle(assText, basicStyle) {
        const style = normalizeBasicStyle(basicStyle);
        // Only dual hardsub rewrites ZH/Source; single-track burns use force_style.
        if (!style.enableSource) {
            return { ok: false, skipped: true };
        }
        const presets = getPresetsApi();
        if (!presets?.rewriteAssDocumentStyles) {
            return { ok: false, skipped: true, error: '样式预设模块未加载' };
        }
        return presets.rewriteAssDocumentStyles(assText, style);
    }

    // Patch validateBurnPair to keep encoderId on job
    const _validateBurnPairInner = validateBurnPair;
    function validateBurnPairWithEncoder(input = {}) {
        const res = _validateBurnPairInner(input);
        if (!res.ok) return res;
        const encoderId = normalizeEncoderId(input.encoderId, { allowPro: true });
        return {
            ok: true,
            job: {
                ...res.job,
                encoderId,
                resolutionId: normalizeResolutionId(input.resolutionId || res.job.resolutionId),
                fpsId: normalizeFpsId(input.fpsId || res.job.fpsId),
                encodeSpeedId: normalizeEncodeSpeedId(input.encodeSpeedId || res.job.encodeSpeedId),
                outputSuffix: normalizeOutputSuffix(input.outputSuffix || res.job.outputSuffix),
                outputDir: normalizeOutputDir(input.outputDir != null ? input.outputDir : res.job.outputDir),
                outputMode: normalizeOutputMode(input.outputMode || res.job.outputMode),
                audioMode: normalizeAudioMode(input.audioMode || res.job.audioMode),
                bilingualSubtitlePath: String(input.bilingualSubtitlePath || '').trim(),
                sourceSubtitlePath: String(input.sourceSubtitlePath || '').trim(),
                subtitleTrack: normalizeSubtitleTrack(input.subtitleTrack),
            },
        };
    }

    function serializeWorkspaceOptions(input = {}) {
        const style = normalizeBasicStyle(input.basicStyle);
        return {
            version: 1,
            // Encode / path options live in settings.json (burnContainer…).
            // Workspace localStorage only keeps style-facing chip state.
            styleMode: String(input.styleMode || 'basic').toLowerCase() === 'document' ? 'document' : 'basic',
            outputMode: normalizeOutputMode(input.outputMode),
            activePresetId: String(input.activePresetId || '').trim().slice(0, 64),
            activePresetName: String(input.activePresetName || '').trim().slice(0, 40),
            basicStyle: style,
        };
    }

    /**
     * Settings.json burn encode keys (not style / hardsub|softsub mode).
     */
    function normalizeBurnSettingsOptions(input = {}) {
        const src = input && typeof input === 'object' ? input : {};
        return {
            burnContainer: normalizeContainer(src.burnContainer || src.container),
            burnEncoderId: normalizeEncoderId(src.burnEncoderId || src.encoderId, { allowPro: true }),
            burnAudioMode: normalizeAudioMode(src.burnAudioMode || src.audioMode),
            burnCrf: clampInt(src.burnCrf != null ? src.burnCrf : src.crf, 14, 28, 18),
            burnResolutionId: normalizeResolutionId(src.burnResolutionId || src.resolutionId),
            burnFpsId: normalizeFpsId(src.burnFpsId || src.fpsId),
            burnEncodeSpeedId: normalizeEncodeSpeedId(src.burnEncodeSpeedId || src.encodeSpeedId),
            burnOutputSuffix: normalizeOutputSuffix(src.burnOutputSuffix || src.outputSuffix),
            burnOutputDir: normalizeOutputDir(src.burnOutputDir != null ? src.burnOutputDir : src.outputDir),
        };
    }

    function loadWorkspaceOptions(storage) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store?.getItem) return null;
        try {
            const raw = store.getItem(WORKSPACE_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return serializeWorkspaceOptions(parsed);
        } catch (_) {
            return null;
        }
    }

    function saveWorkspaceOptions(input, storage) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store?.setItem) return { ok: false, error: '无本地存储' };
        try {
            const payload = serializeWorkspaceOptions(input);
            store.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
            return { ok: true, options: payload };
        } catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    }

    return {
        SUB_EXTS,
        VIDEO_EXTS,
        DEFAULT_BASIC_STYLE,
        DEFAULT_OUTPUT_SUFFIX,
        WORKSPACE_STORAGE_KEY,
        ENCODER_SOFT,
        ENCODER_PRESETS,
        RESOLUTION_PRESETS,
        FPS_PRESETS,
        ENCODE_SPEED_PRESETS,
        OUTPUT_MODE_PRESETS,
        AUDIO_MODE_PRESETS,
        SUBTITLE_TRACK_OPTIONS,
        isSubtitlePath,
        isVideoPath,
        normalizeContainer,
        normalizeBasicStyle,
        normalizeHexColor,
        hexToAssColour,
        buildForceStyle,
        escapeFilterPath,
        buildBurnVideoFilter,
        buildGeometryFilterParts,
        normalizeResolutionId,
        normalizeFpsId,
        normalizeEncodeSpeedId,
        normalizeOutputSuffix,
        normalizeOutputDir,
        normalizeOutputMode,
        normalizeAudioMode,
        normalizeSubtitleTrack,
        getResolutionPreset,
        getFpsPreset,
        getEncodeSpeedPreset,
        defaultOutputPath,
        validateBurnPair: validateBurnPairWithEncoder,
        parseFfmpegTimeToSec,
        progressPercent,
        buildFfmpegBurnArgs,
        buildFfmpegHardsubArgs,
        buildFfmpegHardsubPreviewArgs,
        buildFfmpegSoftsubArgs,
        softsubSubtitleCodec,
        preferBurnSubtitlePath,
        classifyBurnSidecarRole,
        pickBurnTracksFromSidecars,
        normalizeEncoderId,
        getEncoderPreset,
        parseAvailableEncoders,
        isItemAssociated,
        createDraftBatchItem,
        createBatchItem,
        createBatchFromPairs,
        batchSummary,
        nextPendingIndex,
        resetFailedToPending,
        makeBatchItemId,
        buildPreviewAssContent,
        parsePreviewCuesFromText,
        maybeRewriteAssForBurnStyle,
        serializeWorkspaceOptions,
        loadWorkspaceOptions,
        saveWorkspaceOptions,
        normalizeBurnSettingsOptions,
        msToAssTime,
        stemOf,
        baseName,
        dirOf,
    };
}));
