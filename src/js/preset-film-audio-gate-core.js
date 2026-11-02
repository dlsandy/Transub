/**
 * Strip Pro / Demucs film-audio flags when applying scene presets.
 * Pure helpers (browser + Node).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPresetFilmAudioGate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function presetFilmAudioGateFactory() {
    /**
     * @param {object} options preset option patch
     * @param {{ entitled?: boolean, demucsReady?: boolean }} [gate]
     * @returns {{
     *   options: object,
     *   changed: boolean,
     *   reasons: Array<'pro'|'demucs'>,
     *   strippedFilm: boolean,
     *   strippedVad: boolean,
     * }}
     */
    function stripFilmAudioFromPresetOptions(options, gate = {}) {
        const out = options && typeof options === 'object' ? { ...options } : {};
        const entitled = !!gate.entitled;
        const demucsReady = gate.demucsReady !== false;
        const reasons = [];
        let strippedFilm = false;
        let strippedVad = false;

        const hadFilm = !!out.filmAudioEnhance || !!out.enhanceForVadOnly;
        const hadVad = !!out.filmVadPreset;

        if (!entitled) {
            if (hadFilm) {
                out.filmAudioEnhance = false;
                out.enhanceForVadOnly = false;
                strippedFilm = true;
                reasons.push('pro');
            }
            if (hadVad) {
                out.filmVadPreset = false;
                strippedVad = true;
                if (!reasons.includes('pro')) reasons.push('pro');
            }
        } else if (hadFilm && !demucsReady) {
            out.filmAudioEnhance = false;
            out.enhanceForVadOnly = false;
            strippedFilm = true;
            reasons.push('demucs');
        }

        return {
            options: out,
            changed: reasons.length > 0,
            reasons,
            strippedFilm,
            strippedVad,
        };
    }

    /**
     * Chinese source strings for uiTx / catalogs.
     * @param {Array<'pro'|'demucs'>} reasons
     * @param {{ strippedFilm?: boolean, strippedVad?: boolean }} [meta]
     * @returns {string[]}
     */
    function buildStripToastMessages(reasons = [], meta = {}) {
        const list = Array.isArray(reasons) ? reasons : [];
        const msgs = [];
        if (list.includes('pro')) {
            if (meta.strippedFilm && meta.strippedVad) {
                msgs.push('预设含「影视音频增强 / 影视 VAD」，当前未解锁 Pro，已自动关闭');
            } else if (meta.strippedVad && !meta.strippedFilm) {
                msgs.push('预设含「影视 VAD」，当前未解锁 Pro，已自动关闭');
            } else {
                msgs.push('预设含「影视音频增强」，当前未解锁 Pro，已自动关闭');
            }
        }
        if (list.includes('demucs')) {
            msgs.push('未安装 Demucs，已自动关闭「影视音频增强」。可在模型管理中下载');
        }
        return msgs;
    }

    /**
     * @param {object|null|undefined} probe Demucs status / probe payload
     * @param {{ isDemucsRuntimeUsable?: (probe: object) => boolean }} [deps]
     * @returns {boolean}
     */
    function isDemucsReadyFromProbe(probe, deps = {}) {
        if (!probe || probe.ok === false) return false;
        if (typeof deps.isDemucsRuntimeUsable === 'function') {
            return !!deps.isDemucsRuntimeUsable(probe);
        }
        const status = String(probe.status || '').trim();
        return status === 'ready'
            || status === 'partial'
            || status === 'need_torch_cuda'
            || status === 'need_torch_rocm'
            || status === 'need_torch_xpu'
            || probe.installed === true;
    }

    return {
        stripFilmAudioFromPresetOptions,
        buildStripToastMessages,
        isDemucsReadyFromProbe,
    };
}));
