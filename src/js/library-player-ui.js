/**
 * Subtitle library preview player UI (modal video + CSS overlay + version switcher).
 * Depends on TransubLibraryPlayerCore. Thin DOM wiring only.
 */
(function (global) {
    const core = global.TransubLibraryPlayerCore;
    if (!core) {
        throw new Error('library-player-core.js must load before library-player-ui.js');
    }

    function $(id) {
        return document.getElementById(id);
    }

    function escHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatShortTime(iso) {
        const t = Date.parse(iso || 0);
        if (!Number.isFinite(t) || t <= 0) return '';
        try {
            return new Date(t).toLocaleString(undefined, {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return '';
        }
    }

    function createLibraryPlayer({ electron, onVersionChange, onToast, onClose, onPickVersion } = {}) {
        const els = {
            modal: $('libraryPlayerModal'),
            title: $('libraryPlayerTitle'),
            host: $('libraryPlayerHost'),
            frame: $('libraryPlayerFrame'),
            video: $('libraryPlayerVideo'),
            empty: $('libraryPlayerEmpty'),
            emptyText: $('libraryPlayerEmptyText'),
            overlay: $('libraryPlayerSubtitle'),
            overlayText: $('libraryPlayerSubtitleText'),
            meta: $('libraryPlayerMeta'),
            playBtn: $('libraryPlayerPlayBtn'),
            backBtn: $('libraryPlayerBackBtn'),
            fwdBtn: $('libraryPlayerFwdBtn'),
            seek: $('libraryPlayerSeek'),
            time: $('libraryPlayerTime'),
            muteBtn: $('libraryPlayerMuteBtn'),
            closeBtn: $('libraryPlayerCloseBtn'),
            trackTabs: $('libraryPlayerTrackTabs'),
            versionList: $('libraryPlayerVersionList'),
            abWrap: $('libraryPlayerAb'),
        };

        const state = {
            mediaId: '',
            mediaTitle: '',
            mediaPath: '',
            mediaUrl: '',
            versionId: '',
            cues: [],
            format: '',
            recipeSummary: '',
            roleLabel: '',
            cueIndex: -1,
            overlayKey: '',
            loadToken: 0,
            bound: false,
            detail: null,
            trackRole: '',
            showArchived: false,
        };

        function toast(msg, kind) {
            if (typeof onToast === 'function') onToast(msg, kind);
        }

        function isOpen() {
            return !!(els.modal && !els.modal.classList.contains('hidden'));
        }

        function setModalOpen(on) {
            if (!els.modal) return;
            els.modal.classList.toggle('hidden', !on);
            els.modal.setAttribute('aria-hidden', on ? 'false' : 'true');
            if (els.host) {
                els.host.classList.toggle('is-on', !!on);
                els.host.setAttribute('aria-hidden', on ? 'false' : 'true');
            }
        }

        function setEmpty(visible, message) {
            if (els.empty) els.empty.classList.toggle('visible', !!visible);
            if (els.emptyText && message != null) els.emptyText.textContent = message;
        }

        function updateTitle() {
            if (!els.title) return;
            const bits = [state.mediaTitle || '试看', state.roleLabel || ''].filter(Boolean);
            els.title.textContent = bits.join(' · ') || '试看';
        }

        function updateMeta() {
            if (!els.meta) return;
            const bits = [
                state.roleLabel || '',
                state.format ? String(state.format).toUpperCase() : '',
                state.cues.length ? `${state.cues.length} 条` : '',
                state.recipeSummary || '',
            ].filter(Boolean);
            els.meta.textContent = bits.join(' · ') || '未载入字幕';
            els.meta.title = bits.join(' · ');
            updateTitle();
        }

        function updateTransportUi() {
            const v = els.video;
            if (!v) return;
            const dur = Number.isFinite(v.duration) ? v.duration : 0;
            const cur = Number.isFinite(v.currentTime) ? v.currentTime : 0;
            if (els.time) {
                els.time.textContent = `${core.formatClock(cur)} / ${core.formatClock(dur)}`;
            }
            if (els.seek) {
                els.seek.max = String(Math.max(0, dur) || 0);
                if (!els.seek.matches(':active')) {
                    els.seek.value = String(cur);
                }
            }
            if (els.playBtn) {
                const playing = !v.paused && !v.ended;
                els.playBtn.innerHTML = playing
                    ? '<i class="fa fa-pause" aria-hidden="true"></i>'
                    : '<i class="fa fa-play" aria-hidden="true"></i>';
                els.playBtn.title = playing ? '暂停' : '播放';
                els.playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
            }
            if (els.muteBtn) {
                els.muteBtn.innerHTML = v.muted
                    ? '<i class="fa fa-volume-off" aria-hidden="true"></i>'
                    : '<i class="fa fa-volume-up" aria-hidden="true"></i>';
                els.muteBtn.title = v.muted ? '取消静音' : '静音';
            }
        }

        function syncOverlay() {
            const v = els.video;
            if (!els.overlay || !els.overlayText) return;
            if (!v || !state.cues.length) {
                els.overlay.classList.add('hidden');
                els.overlayText.textContent = '';
                state.cueIndex = -1;
                state.overlayKey = '';
                return;
            }
            const tMs = Math.round((Number(v.currentTime) || 0) * 1000);
            const idx = core.findCueIndexAt(state.cues, tMs, state.cueIndex);
            state.cueIndex = idx;
            if (idx < 0) {
                if (state.overlayKey !== '') {
                    state.overlayKey = '';
                    els.overlay.classList.add('hidden');
                    els.overlayText.textContent = '';
                }
                return;
            }
            const text = core.plainOverlayText(state.cues[idx]?.text || '');
            const key = `${idx}:${text}`;
            if (key === state.overlayKey) return;
            state.overlayKey = key;
            els.overlayText.textContent = text;
            els.overlay.classList.toggle('hidden', !text);
        }

        function notifyVersion() {
            if (typeof onVersionChange === 'function') {
                onVersionChange(state.versionId || '');
            }
        }

        function syncAbChrome() {
            const wrap = els.abWrap;
            if (!wrap) return;
            const pair = core.findAbPair?.(state.detail);
            if (!pair?.versionIdA || !pair?.versionIdB) {
                wrap.classList.remove('is-on');
                return;
            }
            wrap.classList.add('is-on');
            const btnA = wrap.querySelector('[data-library-player-ab="A"]');
            const btnB = wrap.querySelector('[data-library-player-ab="B"]');
            if (btnA) {
                btnA.dataset.versionId = pair.versionIdA;
                btnA.classList.toggle('is-active', state.versionId === pair.versionIdA);
            }
            if (btnB) {
                btnB.dataset.versionId = pair.versionIdB;
                btnB.classList.toggle('is-active', state.versionId === pair.versionIdB);
            }
        }

        function resolveTrackRoleForVersion(versionId) {
            const ctx = core.findVersionContext(state.detail, versionId);
            return String(ctx?.track?.role || '').toLowerCase();
        }

        function renderVersionPanel() {
            const tabsHost = els.trackTabs;
            const listHost = els.versionList;
            if (!tabsHost || !listHost) return;

            const groups = core.playableTracks(state.detail, { includeArchived: state.showArchived });
            if (!groups.length) {
                tabsHost.innerHTML = '';
                listHost.innerHTML = '<div class="lib-player-version-empty">暂无可试看版本</div>';
                syncAbChrome();
                return;
            }

            let role = String(state.trackRole || '').toLowerCase();
            if (!groups.some((g) => String(g.track.role || '').toLowerCase() === role)) {
                const fromPlaying = resolveTrackRoleForVersion(state.versionId);
                role = groups.some((g) => String(g.track.role || '').toLowerCase() === fromPlaying)
                    ? fromPlaying
                    : String(groups[0].track.role || '').toLowerCase();
                state.trackRole = role;
            }

            tabsHost.innerHTML = groups.map((g) => {
                const r = String(g.track.role || '').toLowerCase();
                const label = g.track.roleLabel || core.roleLabel(r);
                const on = r === role ? ' is-on' : '';
                return `<button type="button" class="lib-player-track-tab${on}" data-player-track="${escHtml(r)}">${escHtml(label)}<span class="lib-player-track-count">${g.versions.length}</span></button>`;
            }).join('');

            const group = groups.find((g) => String(g.track.role || '').toLowerCase() === role) || groups[0];
            const versions = group?.versions || [];
            listHost.innerHTML = versions.map((v) => {
                const active = !!v.isActive;
                const playing = v.id === state.versionId;
                const missing = !(v.blobExists || v.exportExists);
                const cues = (v.cueCount != null && Number.isFinite(Number(v.cueCount)))
                    ? `${Number(v.cueCount)} 条`
                    : '';
                const when = formatShortTime(v.createdAt);
                const chips = [
                    active ? '<span class="lib-chip lib-chip-ok">当前</span>' : '',
                    playing ? '<span class="lib-chip lib-chip-accent">播放中</span>' : '',
                    cues ? `<span class="lib-chip">${escHtml(cues)}</span>` : '',
                    missing ? '<span class="lib-chip lib-chip-danger">缺失</span>' : '',
                    when ? `<span class="lib-chip lib-chip-time">${escHtml(when)}</span>` : '',
                ].filter(Boolean).join('');
                const recipe = String(v.recipeSummary || '').trim();
                const cls = [
                    'lib-player-version-item',
                    playing ? 'is-playing' : '',
                    active ? 'is-active' : '',
                    missing ? 'is-missing' : '',
                ].filter(Boolean).join(' ');
                return `<button type="button" class="${cls}" data-player-version="${escHtml(v.id)}" ${missing ? 'disabled' : ''} title="${escHtml(recipe || '切换此版本（保留进度）')}">
                    <div class="lib-player-version-meta">${chips || '<span class="lib-chip">版本</span>'}</div>
                    <div class="lib-player-version-recipe">${escHtml(recipe || '—')}</div>
                </button>`;
            }).join('');

            syncAbChrome();
        }

        function setDetail(detail, { showArchived = false } = {}) {
            state.detail = detail && detail.ok !== false ? detail : null;
            state.showArchived = !!showArchived;
            const title = String(detail?.media?.title || '').trim();
            if (title) state.mediaTitle = title;
            if (state.versionId) {
                const role = resolveTrackRoleForVersion(state.versionId);
                if (role) state.trackRole = role;
            }
            renderVersionPanel();
        }

        async function resolveMedia(mediaPath) {
            const p = String(mediaPath || '').trim();
            if (!p) return { ok: false, error: '未关联音视频' };
            const res = await electron?.transubResolveMediaUrl?.({ path: p });
            if (!res?.ok || !res.url) {
                return { ok: false, error: res?.error || '无法解析媒体地址' };
            }
            return { ok: true, url: res.url, path: p };
        }

        async function setMediaSource(mediaPath, { keepTime = false } = {}) {
            const v = els.video;
            if (!v) return { ok: false, error: '播放器未就绪' };
            const prevTime = keepTime ? (Number(v.currentTime) || 0) : 0;
            const wasPlaying = keepTime && !v.paused && !v.ended;
            if (core.sameMediaPath(state.mediaPath, mediaPath) && state.mediaUrl) {
                setEmpty(false);
                return { ok: true, reused: true, prevTime, wasPlaying };
            }
            const resolved = await resolveMedia(mediaPath);
            if (!resolved.ok) {
                state.mediaPath = '';
                state.mediaUrl = '';
                try {
                    v.removeAttribute('src');
                    v.load();
                } catch { /* ignore */ }
                setEmpty(true, resolved.error || '未关联音视频');
                updateTransportUi();
                return resolved;
            }
            state.mediaPath = resolved.path;
            state.mediaUrl = resolved.url;
            return new Promise((resolve) => {
                let settled = false;
                const finish = (ok, error) => {
                    if (settled) return;
                    settled = true;
                    v.removeEventListener('loadedmetadata', onMeta);
                    v.removeEventListener('error', onErr);
                    if (ok && keepTime && prevTime > 0) {
                        try {
                            const max = Number.isFinite(v.duration) ? v.duration : prevTime;
                            v.currentTime = Math.min(prevTime, Math.max(0, max - 0.05));
                        } catch { /* ignore */ }
                    }
                    if (ok && wasPlaying) {
                        try { void v.play(); } catch { /* ignore */ }
                    }
                    updateTransportUi();
                    syncOverlay();
                    resolve(ok ? { ok: true, reused: false } : { ok: false, error });
                };
                const onMeta = () => finish(true);
                const onErr = () => finish(false, '媒体无法播放（可能是编码不受支持）');
                v.addEventListener('loadedmetadata', onMeta);
                v.addEventListener('error', onErr);
                setEmpty(false);
                v.src = resolved.url;
                try { v.load(); } catch { /* ignore */ }
                if (v.readyState >= 1) finish(true);
            });
        }

        function applyCues(payload) {
            state.versionId = String(payload?.versionId || '').trim();
            state.cues = Array.isArray(payload?.cues) ? payload.cues : [];
            state.format = String(payload?.format || '');
            state.recipeSummary = String(payload?.recipeSummary || '');
            state.roleLabel = String(payload?.roleLabel || payload?.role || '');
            state.cueIndex = -1;
            state.overlayKey = '';
            const role = String(payload?.role || '').toLowerCase();
            if (role) state.trackRole = role;
            updateMeta();
            syncOverlay();
            renderVersionPanel();
            notifyVersion();
        }

        async function loadVersion(versionId, {
            mediaId = '',
            mediaTitle = '',
            detail = null,
            showArchived = false,
            preferKeepClock = true,
        } = {}) {
            const id = String(versionId || '').trim();
            if (!id) return { ok: false, error: '缺少版本' };
            if (detail) setDetail(detail, { showArchived });
            if (mediaTitle) state.mediaTitle = String(mediaTitle);
            const token = ++state.loadToken;
            const res = await electron?.transubLibraryLoadVersionCues?.({ versionId: id });
            if (token !== state.loadToken) return { ok: false, error: 'superseded' };
            if (!res?.ok) {
                toast(res?.error || '载入字幕失败', 'err');
                return res || { ok: false, error: '载入失败' };
            }
            state.mediaId = String(mediaId || res.mediaId || state.mediaId || '');
            if (!state.mediaTitle && res.mediaTitle) state.mediaTitle = String(res.mediaTitle);
            const keep = preferKeepClock && core.sameMediaPath(state.mediaPath, res.videoPath);
            applyCues(res);
            setModalOpen(true);

            if (!res.mediaExists) {
                setEmpty(true, res.mediaLinked ? '关联的音视频文件不存在' : '未关联音视频，可先关联后再试看');
                updateTransportUi();
                syncOverlay();
                try { els.frame?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
                return { ok: true, cuesOnly: true, ...res };
            }

            const mediaRes = await setMediaSource(res.videoPath, { keepTime: keep });
            if (token !== state.loadToken) return { ok: false, error: 'superseded' };
            if (!mediaRes.ok) {
                toast(mediaRes.error || '无法播放媒体', 'warn');
            }
            try { els.frame?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
            return { ok: true, ...res, mediaOk: !!mediaRes.ok };
        }

        function clear({ hide = true } = {}) {
            state.loadToken += 1;
            state.mediaId = '';
            state.mediaTitle = '';
            state.mediaPath = '';
            state.mediaUrl = '';
            state.versionId = '';
            state.cues = [];
            state.format = '';
            state.recipeSummary = '';
            state.roleLabel = '';
            state.cueIndex = -1;
            state.overlayKey = '';
            state.trackRole = '';
            if (els.video) {
                try {
                    els.video.pause();
                    els.video.removeAttribute('src');
                    els.video.load();
                } catch { /* ignore */ }
            }
            if (els.overlay) els.overlay.classList.add('hidden');
            if (els.overlayText) els.overlayText.textContent = '';
            updateMeta();
            updateTransportUi();
            notifyVersion();
            if (hide) {
                setModalOpen(false);
                state.detail = null;
                if (els.trackTabs) els.trackTabs.innerHTML = '';
                if (els.versionList) els.versionList.innerHTML = '';
                if (els.abWrap) els.abWrap.classList.remove('is-on');
            } else {
                setModalOpen(true);
                setEmpty(true, '选择版本试看');
                renderVersionPanel();
            }
        }

        function close() {
            clear({ hide: true });
            if (typeof onClose === 'function') onClose();
        }

        function togglePlay() {
            const v = els.video;
            if (!v || !state.mediaUrl) return;
            if (v.paused || v.ended) {
                void v.play()?.catch?.(() => toast('无法播放', 'warn'));
            } else {
                v.pause();
            }
            updateTransportUi();
        }

        function seekBy(deltaSec) {
            const v = els.video;
            if (!v || !state.mediaUrl) return;
            const dur = Number.isFinite(v.duration) ? v.duration : 0;
            const next = Math.max(0, Math.min(dur || 1e9, (Number(v.currentTime) || 0) + deltaSec));
            try { v.currentTime = next; } catch { /* ignore */ }
            updateTransportUi();
            syncOverlay();
        }

        function pickVersion(versionId) {
            const id = String(versionId || '').trim();
            if (!id || id === state.versionId) return;
            if (typeof onPickVersion === 'function') {
                onPickVersion(id);
                return;
            }
            void loadVersion(id, {
                mediaId: state.mediaId,
                mediaTitle: state.mediaTitle,
                detail: state.detail,
                showArchived: state.showArchived,
                preferKeepClock: true,
            });
        }

        function bind() {
            if (state.bound || !els.video) return;
            state.bound = true;
            els.video.addEventListener('timeupdate', () => {
                updateTransportUi();
                syncOverlay();
            });
            els.video.addEventListener('play', updateTransportUi);
            els.video.addEventListener('pause', updateTransportUi);
            els.video.addEventListener('ended', updateTransportUi);
            els.video.addEventListener('loadedmetadata', updateTransportUi);
            els.video.addEventListener('click', (e) => {
                e.preventDefault();
                togglePlay();
            });
            els.playBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                togglePlay();
            });
            els.backBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                seekBy(-5);
            });
            els.fwdBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                seekBy(5);
            });
            els.muteBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                if (!els.video) return;
                els.video.muted = !els.video.muted;
                updateTransportUi();
            });
            els.seek?.addEventListener('input', () => {
                if (!els.video || !state.mediaUrl) return;
                const t = Number(els.seek.value) || 0;
                try { els.video.currentTime = t; } catch { /* ignore */ }
                syncOverlay();
            });
            els.closeBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                close();
            });
            els.modal?.addEventListener('click', (e) => {
                if (e.target === els.modal) close();
            });
            els.trackTabs?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-player-track]');
                if (!btn) return;
                e.preventDefault();
                state.trackRole = String(btn.getAttribute('data-player-track') || '').toLowerCase();
                renderVersionPanel();
            });
            els.versionList?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-player-version]');
                if (!btn || btn.disabled) return;
                e.preventDefault();
                pickVersion(btn.getAttribute('data-player-version'));
            });
            els.abWrap?.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-library-player-ab]');
                if (!btn) return;
                e.preventDefault();
                const vid = String(btn.dataset.versionId || '').trim();
                if (vid) pickVersion(vid);
            });
            els.frame?.addEventListener('keydown', (e) => {
                if (e.key === ' ' || e.code === 'Space') {
                    e.preventDefault();
                    togglePlay();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    seekBy(e.shiftKey ? -15 : -5);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    seekBy(e.shiftKey ? 15 : 5);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                }
            });
        }

        bind();
        clear({ hide: true });

        return {
            loadVersion,
            clear,
            close,
            setDetail,
            getVersionId: () => state.versionId,
            getMediaId: () => state.mediaId,
            isVisible: () => isOpen(),
            isOpen,
            setHostVisible: setModalOpen,
            togglePlay,
            seekBy,
            renderVersionPanel,
        };
    }

    global.TransubLibraryPlayerUi = { createLibraryPlayer };
}(typeof globalThis !== 'undefined' ? globalThis : window));
