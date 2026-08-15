/**
 * libass/JASSUB pixel preview for the subtitle editor.
 * Falls back to CSS approx preview when wasm/init fails.
 */
(function (global) {
    const EMPTY_ASS = [
        '[Script Info]',
        'ScriptType: v4.00+',
        'PlayResX: 1920',
        'PlayResY: 1080',
        '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,48,1',
        '',
        '[Events]',
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        '',
    ].join('\n');

    function installJassubPreview(ctx) {
        if (!ctx?.state || !ctx?.els) {
            throw new Error('installJassubPreview(ctx): ctx.state, ctx.els required');
        }

        const stylesCore = ctx.assStylesCore || global.TransubAssStyles;
        const vendorBase = String(ctx.vendorBase || 'vendor/jassub').replace(/\/+$/, '');
        const debounceMs = Number(ctx.debounceMs) > 0 ? Number(ctx.debounceMs) : 180;

        let instance = null;
        let mode = 'off'; // 'off' | 'jassub' | 'approx'
        let failed = false;
        let lastContent = '';
        let syncTimer = null;
        let startPromise = null;
        let destroyed = false;

        function assetUrl(rel) {
            const path = `${vendorBase}/${String(rel || '').replace(/^\/+/, '')}`;
            try {
                return new URL(path, global.location.href).href;
            } catch {
                return path;
            }
        }

        function isAssContext() {
            if (typeof ctx.isAssContext === 'function') return !!ctx.isAssContext();
            const fmt = String(ctx.state.format || '').toLowerCase();
            return fmt === 'ass' || fmt === 'ssa' || !!ctx.state.showAssStyleColumn;
        }

        function buildAssContent() {
            if (!stylesCore?.serializeAssDocument) return EMPTY_ASS;
            try {
                ctx.syncDetailToCue?.();
            } catch { /* ignore */ }
            const header = Array.isArray(ctx.state.header) && ctx.state.header.length
                ? ctx.state.header
                : (stylesCore.ensureAssHeader
                    ? stylesCore.ensureAssHeader([], ctx.state.subPath ? String(ctx.state.subPath).split(/[/\\]/).pop() : 'Transub')
                    : []);
            const text = stylesCore.serializeAssDocument(ctx.state.cues || [], header);
            return text && String(text).trim() ? text : EMPTY_ASS;
        }

        function setBadge(kind) {
            const badge = ctx.els.assPreviewBadge;
            if (!badge) return;
            if (kind === 'jassub') {
                badge.classList.remove('hidden');
                badge.classList.add('is-jassub');
                badge.textContent = 'JASSUB';
                badge.title = 'libass / JASSUB 像素预览（WASM）。样式、override、描边与对齐按 ASS 渲染。';
                return;
            }
            if (kind === 'approx') {
                badge.classList.remove('hidden');
                badge.classList.remove('is-jassub');
                badge.textContent = '近似预览';
                badge.title = 'CSS 近似预览（非 libass）。颜色/对齐/字号按 Style 与 {\\an} 等常见 override 估算。';
                return;
            }
            badge.classList.add('hidden');
            badge.classList.remove('is-jassub');
        }

        function hideCssOverlay() {
            const wrap = ctx.els.videoSubtitle;
            if (!wrap) return;
            wrap.classList.add('hidden');
            wrap.classList.remove(
                'ass-approx-preview',
                'ass-align-top', 'ass-align-middle', 'ass-align-bottom',
                'ass-align-left', 'ass-align-center', 'ass-align-right',
            );
            wrap.removeAttribute('data-an');
            ctx.els.videoSubtitleText && (ctx.els.videoSubtitleText.textContent = '');
            ctx.els.videoSubtitleSource && (ctx.els.videoSubtitleSource.textContent = '');
        }

        function notifyMode(next) {
            if (mode === next) return;
            mode = next;
            try {
                ctx.onModeChange?.(mode);
            } catch { /* ignore */ }
        }

        async function loadJassubCtor() {
            const mod = await import(/* webpackIgnore: true */ assetUrl('jassub.js'));
            return mod?.default || mod?.JASSUB || mod;
        }

        async function createInstance() {
            const video = ctx.els.video;
            if (!video) throw new Error('video element missing');
            const JASSUB = await loadJassubCtor();
            if (typeof JASSUB !== 'function') throw new Error('JASSUB constructor missing');
            const content = buildAssContent();
            const inst = new JASSUB({
                video,
                subContent: content,
                workerUrl: assetUrl('worker.js'),
                wasmUrl: assetUrl('wasm/jassub-worker.wasm'),
                modernWasmUrl: assetUrl('wasm/jassub-worker-modern.wasm'),
                availableFonts: {
                    'liberation sans': assetUrl('default.woff2'),
                },
                defaultFont: 'liberation sans',
                queryFonts: 'local',
            });
            await inst.ready;
            lastContent = content;
            return inst;
        }

        async function ensureStarted() {
            if (destroyed || failed) return null;
            if (!isAssContext()) return null;
            if (instance) return instance;
            if (startPromise) return startPromise;
            startPromise = (async () => {
                try {
                    instance = await createInstance();
                    notifyMode('jassub');
                    setBadge('jassub');
                    hideCssOverlay();
                    return instance;
                } catch (err) {
                    console.warn('[jassub-preview] init failed, using CSS approx', err);
                    failed = true;
                    instance = null;
                    notifyMode('approx');
                    setBadge('approx');
                    return null;
                } finally {
                    startPromise = null;
                }
            })();
            return startPromise;
        }

        async function applyTrack(force) {
            if (destroyed || !isAssContext()) return;
            const inst = await ensureStarted();
            if (!inst?.renderer) return;
            const content = buildAssContent();
            if (!force && content === lastContent) return;
            lastContent = content;
            try {
                await inst.ready;
                await inst.renderer.setTrack(content);
                // paused video needs a forced redraw
                if (ctx.els.video?.paused) {
                    await inst.resize?.(true);
                }
            } catch (err) {
                console.warn('[jassub-preview] setTrack failed', err);
                failed = true;
                await destroyInstance();
                notifyMode('approx');
                setBadge('approx');
            }
        }

        function scheduleSync(force) {
            if (destroyed) return;
            if (!isAssContext()) {
                void disable();
                return;
            }
            if (failed) {
                notifyMode('approx');
                return;
            }
            if (syncTimer) clearTimeout(syncTimer);
            syncTimer = setTimeout(() => {
                syncTimer = null;
                void applyTrack(!!force);
            }, force ? 0 : debounceMs);
            // Kick off init immediately so first ASS open doesn't wait for debounce alone.
            if (!instance && !startPromise) void ensureStarted();
        }

        async function destroyInstance() {
            if (syncTimer) {
                clearTimeout(syncTimer);
                syncTimer = null;
            }
            const inst = instance;
            instance = null;
            lastContent = '';
            if (!inst) return;
            try {
                await inst.destroy();
            } catch { /* ignore */ }
        }

        async function disable() {
            await destroyInstance();
            if (mode !== 'off') {
                notifyMode('off');
                setBadge('off');
            }
        }

        async function destroy() {
            destroyed = true;
            failed = false;
            await disable();
        }

        function getMode() {
            return mode;
        }

        function isActive() {
            return mode === 'jassub' && !!instance;
        }

        /**
         * Called from overlay refresh. Returns true when CSS approx should be skipped.
         */
        function onOverlayRefresh() {
            if (!isAssContext()) {
                if (mode !== 'off') void disable();
                return false;
            }
            if (failed) {
                notifyMode('approx');
                return false;
            }
            scheduleSync(false);
            if (mode === 'jassub' || instance) {
                hideCssOverlay();
                setBadge('jassub');
                return true;
            }
            void ensureStarted().then((inst) => {
                if (inst) {
                    hideCssOverlay();
                    setBadge('jassub');
                    ctx.refreshOverlay?.(true);
                }
            });
            return false;
        }

        return {
            scheduleSync,
            ensureStarted,
            onOverlayRefresh,
            disable,
            destroy,
            getMode,
            isActive,
            setBadge,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installJassubPreview = installJassubPreview;
}(typeof globalThis !== 'undefined' ? globalThis : window));
